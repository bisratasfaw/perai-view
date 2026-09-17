import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { ipKeyGenerator } from 'express-rate-limit'
import proxyAddr from 'proxy-addr'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import type { Activity } from '@shared/simulation'
import type { Logger } from '../logger'
import type { OriginPolicy } from '../origins'
import type { ActivityFeed } from '../services/activityFeed'

export const WS_PATH = '/api/ws/activities'
/** Recent events replayed to each new client. */
export const REPLAY_COUNT = 5
/** Clients that fall this far behind (unsent bytes) are dropped instead of buffering forever. */
const MAX_BUFFERED_BYTES = 256 * 1024

export interface ActivitySocketOptions {
  feed: ActivityFeed
  origins: OriginPolicy
  maxClients: number
  maxClientsPerIp: number
  /** Reverse-proxy hops to trust when determining the client IP (same meaning as TRUST_PROXY). */
  trustProxy: number
  maxPayloadBytes: number
  heartbeatMs: number
  version: string
  logger: Logger
}

export interface ActivitySocket {
  readonly clientCount: number
  /** Open connections counted against one client IP key (see `clientIpKey`). */
  connectionsFrom(ipKey: string): number
  /** Stops broadcasting, closes every client (1001) and stops accepting upgrades. */
  close(): Promise<void>
}

const HTTP_REASONS: Record<number, string> = {
  400: 'Bad Request',
  403: 'Forbidden',
  404: 'Not Found',
  429: 'Too Many Requests',
  503: 'Service Unavailable',
}

function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  const body = `${message}\n`
  socket.once('finish', () => socket.destroy())
  socket.end(
    `HTTP/1.1 ${String(status)} ${HTTP_REASONS[status] ?? 'Error'}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      `Content-Length: ${String(Buffer.byteLength(body))}\r\n\r\n` +
      body,
  )
}

/**
 * The client IP exactly as Express derives `req.ip` for a numeric `trust proxy` setting
 * (proxy-addr, trusting `trustProxy` hops), keyed like the HTTP rate limiter so IPv4-mapped
 * addresses collapse to IPv4 and IPv6 clients are grouped by /56.
 */
export function clientIpKey(req: IncomingMessage, trustProxy: number): string {
  const ip = proxyAddr(req, (_addr, hop) => hop < trustProxy) as string | undefined
  return ip ? ipKeyGenerator(ip, 56) : 'unknown'
}

function rawToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  return data.toString('utf8')
}

function isPing(message: unknown): boolean {
  return typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'ping'
}

const activityMessage = (activity: Activity): string => JSON.stringify({ type: 'activity', data: activity })
const PONG = JSON.stringify({ type: 'pong' })

/**
 * Live activity stream on `WS_PATH`. Upgrades are checked against the origin
 * allow-list, a global client cap and a per-IP cap before the handshake completes. Clients get a hello
 * message, a short replay of recent events and then every new event.
 */
export function attachActivitySocket(server: Server, options: ActivitySocketOptions): ActivitySocket {
  const { feed, origins, logger } = options
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: options.maxPayloadBytes,
    perMessageDeflate: false,
    clientTracking: true,
  })
  const alive = new WeakMap<WebSocket, boolean>()
  /** Open connections per client IP key; entries are removed when they reach zero. */
  const perIp = new Map<string, number>()
  let closing: Promise<void> | undefined

  const hello = JSON.stringify({
    type: 'hello',
    data: { simulated: true, interval_ms: feed.intervalMs, version: options.version },
  })

  function onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    socket.on('error', () => socket.destroy())
    let pathname: string
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    } catch {
      rejectUpgrade(socket, 400, 'Invalid request URL')
      return
    }
    if (pathname !== WS_PATH) {
      rejectUpgrade(socket, 404, 'Not found')
      return
    }
    if (!origins.allowsUpgrade(req.headers.origin)) {
      logger.warn('websocket origin rejected', { origin: req.headers.origin })
      rejectUpgrade(socket, 403, 'Origin not allowed')
      return
    }
    if (closing || wss.clients.size >= options.maxClients) {
      rejectUpgrade(socket, 503, 'Server is at capacity or shutting down')
      return
    }
    const ipKey = clientIpKey(req, options.trustProxy)
    if ((perIp.get(ipKey) ?? 0) >= options.maxClientsPerIp) {
      logger.warn('websocket per-IP limit reached', { ip: ipKey })
      rejectUpgrade(socket, 429, 'Too many WebSocket connections from this IP')
      return
    }
    // The callback runs synchronously once the handshake completes, so the check above
    // and the increment below cannot interleave with another upgrade.
    wss.handleUpgrade(req, socket, head, (ws) => {
      perIp.set(ipKey, (perIp.get(ipKey) ?? 0) + 1)
      // 'close' fires exactly once per socket, whether it closed cleanly, errored or was terminated.
      ws.once('close', () => {
        const remaining = (perIp.get(ipKey) ?? 1) - 1
        if (remaining > 0) perIp.set(ipKey, remaining)
        else perIp.delete(ipKey)
      })
      wss.emit('connection', ws, req)
    })
  }

  wss.on('connection', (ws: WebSocket) => {
    alive.set(ws, true)
    ws.on('pong', () => alive.set(ws, true))
    ws.on('error', (err) => {
      logger.warn('websocket client error', { error: err.message })
    })
    ws.on('message', (data, isBinary) => {
      if (isBinary) return
      let message: unknown
      try {
        message = JSON.parse(rawToString(data))
      } catch {
        return
      }
      if (isPing(message)) ws.send(PONG)
    })

    ws.send(hello)
    for (const activity of feed.latest(REPLAY_COUNT)) ws.send(activityMessage(activity))
  })

  const unsubscribe = feed.subscribe((activity) => {
    const payload = activityMessage(activity)
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue
      if (client.bufferedAmount > MAX_BUFFERED_BYTES) {
        client.terminate()
        continue
      }
      client.send(payload)
    }
  })

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (alive.get(client) === false) {
        client.terminate()
        continue
      }
      alive.set(client, false)
      if (client.readyState === WebSocket.OPEN) client.ping()
    }
  }, options.heartbeatMs)
  heartbeat.unref()

  server.on('upgrade', onUpgrade)

  return {
    get clientCount() {
      return wss.clients.size
    },
    connectionsFrom(ipKey) {
      return perIp.get(ipKey) ?? 0
    },
    close() {
      closing ??= new Promise<void>((resolve) => {
        clearInterval(heartbeat)
        unsubscribe()
        for (const client of wss.clients) client.close(1001, 'Server shutting down')
        const force = setTimeout(() => {
          for (const client of wss.clients) client.terminate()
        }, 2000)
        force.unref()
        wss.close(() => {
          clearTimeout(force)
          server.off('upgrade', onUpgrade)
          resolve()
        })
      })
      return closing
    },
  }
}
