import { once } from 'node:events'
import { createServer, type ClientRequest, type IncomingMessage, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket, type ClientOptions } from 'ws'
import { EVENT_INTERVAL_MS } from '@shared/simulation'
import { createApp } from '../src/app'
import { createOriginPolicy } from '../src/origins'
import { WS_PATH, attachActivitySocket, type ActivitySocket } from '../src/realtime/activitySocket'
import { APP_VERSION } from '../src/version'
import { ALLOWED_ORIGIN, DISALLOWED_ORIGIN, closeServer, listen, testConfig, testFeed } from './helpers'

interface Message {
  type: string
  data?: Record<string, unknown>
}

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn()
})

interface ServerOptions {
  maxClients?: number
  maxClientsPerIp?: number
  trustProxy?: number
  heartbeatMs?: number
}

async function startServer(options: ServerOptions = {}) {
  const config = testConfig({ corsOrigins: [ALLOWED_ORIGIN] })
  const feed = testFeed(20)
  const server: Server = createServer(createApp(config, { feed }))
  const socket: ActivitySocket = attachActivitySocket(server, {
    feed,
    origins: createOriginPolicy(config.corsOrigins),
    maxClients: options.maxClients ?? 10,
    maxClientsPerIp: options.maxClientsPerIp ?? 10,
    trustProxy: options.trustProxy ?? 0,
    maxPayloadBytes: 1024,
    heartbeatMs: options.heartbeatMs ?? 30_000,
    version: APP_VERSION,
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  })
  const host = await listen(server)
  cleanups.push(() => closeServer(server), () => socket.close())
  return { feed, socket, url: `ws://${host}${WS_PATH}`, host }
}

/** Opens a client and exposes its messages as an awaitable queue. */
function connect(url: string, options?: ClientOptions) {
  const ws = new WebSocket(url, options)
  const queue: Message[] = []
  const waiting: ((m: Message) => void)[] = []
  ws.on('message', (data) => {
    const message = JSON.parse((data as Buffer).toString('utf8')) as Message
    const resolve = waiting.shift()
    if (resolve) resolve(message)
    else queue.push(message)
  })
  ws.on('error', () => undefined)
  cleanups.push(() => { ws.terminate() })
  const next = (timeoutMs = 2000) =>
    new Promise<Message>((resolve, reject) => {
      const queued = queue.shift()
      if (queued) {
        resolve(queued)
        return
      }
      const timer = setTimeout(() => { reject(new Error('timed out waiting for a message')) }, timeoutMs)
      waiting.push((m) => {
        clearTimeout(timer)
        resolve(m)
      })
    })
  return { ws, next, opened: once(ws, 'open') }
}

/** Performs a handshake that the server is expected to refuse and returns its HTTP response. */
async function rejection(url: string, options?: ClientOptions) {
  const ws = new WebSocket(url, options)
  ws.on('error', () => undefined)
  const [req, res] = (await once(ws, 'unexpected-response')) as [ClientRequest, IncomingMessage]
  const chunks: Buffer[] = []
  for await (const chunk of res) chunks.push(chunk as Buffer)
  req.destroy()
  return {
    status: res.statusCode,
    contentType: res.headers['content-type'],
    body: Buffer.concat(chunks).toString('utf8'),
  }
}

async function rejectedStatus(url: string, options?: ClientOptions): Promise<number | undefined> {
  return (await rejection(url, options)).status
}

/** Opens a client and waits for the handshake to complete. */
async function open(url: string, options?: ClientOptions) {
  const client = connect(url, options)
  await client.opened
  return client
}

const LOOPBACK = '127.0.0.1'

describe('WebSocket /api/ws/activities', () => {
  it('sends hello, replays the 5 latest events oldest first, then streams new events', async () => {
    const { feed, url } = await startServer()
    const client = connect(url, { origin: ALLOWED_ORIGIN })
    await client.opened

    expect(await client.next()).toEqual({
      type: 'hello',
      data: { simulated: true, interval_ms: EVENT_INTERVAL_MS, version: APP_VERSION },
    })
    const replay = await Promise.all(Array.from({ length: 5 }, () => client.next()))
    expect(replay.map((m) => m.type)).toEqual(Array(5).fill('activity'))
    expect(replay.map((m) => m.data?.id)).toEqual(feed.latest(5).map((a) => a.id))

    const fresh = feed.tick()
    expect(await client.next()).toEqual({ type: 'activity', data: JSON.parse(JSON.stringify(fresh)) })
  })

  it('answers ping with pong and ignores anything else', async () => {
    const { url } = await startServer()
    const client = connect(url)
    await client.opened
    for (let i = 0; i < 6; i++) await client.next() // hello + replay

    client.ws.send('not json')
    client.ws.send(JSON.stringify({ type: 'subscribe', channel: 'admin' }))
    client.ws.send(Buffer.from([1, 2, 3]), { binary: true })
    client.ws.send(JSON.stringify({ type: 'ping' }))
    expect(await client.next()).toEqual({ type: 'pong' })
    expect(client.ws.readyState).toBe(WebSocket.OPEN)
  })

  it('accepts clients without an Origin header', async () => {
    const { url } = await startServer()
    const client = connect(url)
    await client.opened
    expect((await client.next()).type).toBe('hello')
  })

  it('rejects a disallowed Origin with 403', async () => {
    const { url, socket } = await startServer()
    expect(await rejectedStatus(url, { origin: DISALLOWED_ORIGIN })).toBe(403)
    expect(socket.clientCount).toBe(0)
  })

  it('rejects other upgrade paths with 404', async () => {
    const { host } = await startServer()
    expect(await rejectedStatus(`ws://${host}/api/ws/other`)).toBe(404)
  })

  it('caps the number of connected clients', async () => {
    const { url } = await startServer({ maxClients: 1 })
    const first = connect(url)
    await first.opened
    expect(await rejectedStatus(url)).toBe(503)
  })

  it('closes connections that send more than 1 KB (1009)', async () => {
    const { url } = await startServer()
    const client = connect(url)
    await client.opened
    client.ws.send(JSON.stringify({ type: 'ping', padding: 'x'.repeat(2048) }))
    const [code] = (await once(client.ws, 'close')) as [number]
    expect(code).toBe(1009)
  })

  it('terminates clients that stop answering heartbeat pings', async () => {
    const { url, socket } = await startServer({ heartbeatMs: 100 })
    const responsive = connect(url)
    const dead = connect(url, { autoPong: false })
    await Promise.all([responsive.opened, dead.opened])
    const [code] = (await once(dead.ws, 'close')) as [number]
    expect(code).toBe(1006)
    expect(responsive.ws.readyState).toBe(WebSocket.OPEN)
    await expect.poll(() => socket.clientCount).toBe(1)
  })

  it('closes clients with 1001 on shutdown', async () => {
    const { url, socket } = await startServer()
    const client = connect(url)
    await client.opened
    const closed = once(client.ws, 'close')
    await socket.close()
    const [code] = (await closed) as [number]
    expect(code).toBe(1001)
    expect(socket.clientCount).toBe(0)
  })
})

describe('WebSocket per-IP connection limit', () => {
  it('rejects connections over the per-IP cap with 429 and a plain-text body', async () => {
    const { url, socket } = await startServer({ maxClientsPerIp: 2 })
    await open(url)
    await open(url)
    expect(socket.connectionsFrom(LOOPBACK)).toBe(2)

    const refused = await rejection(url)
    expect(refused.status).toBe(429)
    expect(refused.contentType).toMatch(/^text\/plain/)
    expect(refused.body).toMatch(/too many websocket connections/i)
    expect(socket.clientCount).toBe(2)
    expect(socket.connectionsFrom(LOOPBACK)).toBe(2)
  })

  it('frees a slot when a client closes cleanly', async () => {
    const { url, socket } = await startServer({ maxClientsPerIp: 1 })
    const first = await open(url)
    expect(await rejectedStatus(url)).toBe(429)

    first.ws.close(1000)
    await expect.poll(() => socket.connectionsFrom(LOOPBACK)).toBe(0)
    await open(url)
    expect(socket.connectionsFrom(LOOPBACK)).toBe(1)
  })

  it('frees a slot when a client drops the connection abruptly', async () => {
    const { url, socket } = await startServer({ maxClientsPerIp: 1 })
    const first = await open(url)
    first.ws.terminate()
    await expect.poll(() => socket.connectionsFrom(LOOPBACK)).toBe(0)
    await open(url)
  })

  it('frees a slot when the server closes a client after a protocol error (1009)', async () => {
    const { url, socket } = await startServer({ maxClientsPerIp: 1 })
    const first = await open(url)
    first.ws.send('x'.repeat(4096))
    await once(first.ws, 'close')
    await expect.poll(() => socket.connectionsFrom(LOOPBACK)).toBe(0)
    await open(url)
  })

  it('frees a slot when the heartbeat terminates a dead client', async () => {
    const { url, socket } = await startServer({ maxClientsPerIp: 1, heartbeatMs: 100 })
    const dead = await open(url, { autoPong: false })
    await once(dead.ws, 'close')
    await expect.poll(() => socket.connectionsFrom(LOOPBACK)).toBe(0)
    await open(url)
  })

  it('ignores X-Forwarded-For when TRUST_PROXY is 0', async () => {
    const { url, socket } = await startServer({ maxClientsPerIp: 1, trustProxy: 0 })
    await open(url, { headers: { 'X-Forwarded-For': '203.0.113.1' } })
    expect(await rejectedStatus(url, { headers: { 'X-Forwarded-For': '203.0.113.2' } })).toBe(429)
    expect(socket.connectionsFrom(LOOPBACK)).toBe(1)
    expect(socket.connectionsFrom('203.0.113.1')).toBe(0)
  })

  it('uses the forwarded client IP when TRUST_PROXY hops are trusted, like Express req.ip', async () => {
    const { url, socket } = await startServer({ maxClientsPerIp: 1, trustProxy: 1 })
    await open(url, { headers: { 'X-Forwarded-For': '203.0.113.1' } })
    await open(url, { headers: { 'X-Forwarded-For': '203.0.113.2' } })
    expect(await rejectedStatus(url, { headers: { 'X-Forwarded-For': '203.0.113.1' } })).toBe(429)

    // Only one hop is trusted, so a spoofed left-most entry is ignored: the client is the
    // address the trusted proxy appended (203.0.113.9), not 198.51.100.7.
    await open(url, { headers: { 'X-Forwarded-For': '198.51.100.7, 203.0.113.9' } })
    expect(socket.connectionsFrom('203.0.113.9')).toBe(1)
    expect(socket.connectionsFrom('198.51.100.7')).toBe(0)
    expect(socket.connectionsFrom(LOOPBACK)).toBe(0)
  })
})
