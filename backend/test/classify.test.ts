import type { IncomingMessage, ServerResponse } from 'node:http'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { classifyByKeywords } from '@shared/classify'
import { startHttpServer, testApp, unusedUrl } from './helpers'

const MODEL_RESPONSE = {
  activity_type: 'coding',
  confidence: 0.91,
  scores: {
    conversation: 0.01, writing: 0.02, coding: 0.91, image_generation: 0.01,
    summarization: 0.02, translation: 0.01, research: 0.02,
  },
  model_version: 'tfidf-logreg-test',
  source: 'model',
}

interface Received {
  method: string | undefined
  url: string | undefined
  contentType: string | undefined
  body: unknown
}

type Reply = (req: IncomingMessage, res: ServerResponse) => void

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((fn) => fn()))
})

/** Mock classifier that records requests and answers with `reply`. */
async function mockClassifier(reply: Reply) {
  const received: Received[] = []
  const server = await startHttpServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      received.push({
        method: req.method,
        url: req.url,
        contentType: req.headers['content-type'],
        body: JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'),
      })
      reply(req, res)
    })
  })
  cleanups.push(server.close)
  return { url: server.url, received }
}

const sendJson = (status: number, body: unknown): Reply => (_req, res) => {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

function classifyVia(url: string | undefined, timeoutMs = 2500) {
  const { app } = testApp({ classifier: { url, timeoutMs } })
  return (text: string) => request(app).post('/api/classify').send({ text })
}

describe('POST /api/classify', () => {
  const text = 'Please fix this Python function, it throws an error'

  it('uses the keyword fallback when no classifier is configured', async () => {
    const res = await classifyVia(undefined)(text).expect(200)
    expect(res.body).toEqual(classifyByKeywords(text))
    expect(res.body.source).toBe('keyword-fallback')
    expect(res.body.activity_type).toBe('coding')
  })

  it('falls back immediately (not after the timeout) when the connection is refused', async () => {
    const url = await unusedUrl()
    const started = Date.now()
    const res = await classifyVia(url, 10_000)(text).expect(200)
    expect(res.body).toEqual(classifyByKeywords(text))
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('passes through a valid model response and forwards the trimmed text', async () => {
    const mock = await mockClassifier(sendJson(200, { ...MODEL_RESPONSE, extra: 'ignored' }))
    const res = await classifyVia(mock.url)(`   ${text}  `).expect(200)
    expect(res.body).toEqual(MODEL_RESPONSE)
    expect(mock.received).toEqual([{ method: 'POST', url: '/classify', contentType: 'application/json', body: { text } }])
  })

  it.each([
    ['a non-2xx status', sendJson(503, { detail: 'model not loaded' })],
    ['an invalid shape', sendJson(200, { ...MODEL_RESPONSE, confidence: 7 })],
    ['a missing score', sendJson(200, { ...MODEL_RESPONSE, scores: { coding: 1 } })],
    ['an unknown activity type', sendJson(200, { ...MODEL_RESPONSE, activity_type: 'hacking' })],
    ['non-JSON', ((_req, res) => { res.writeHead(200).end('<html>oops</html>') }) satisfies Reply],
    ['a redirect', ((_req, res) => { res.writeHead(302, { location: 'http://127.0.0.1:1/classify' }).end() }) satisfies Reply],
  ])('falls back when the classifier returns %s', async (_label, reply) => {
    const mock = await mockClassifier(reply)
    const res = await classifyVia(mock.url)(text).expect(200)
    expect(res.body).toEqual(classifyByKeywords(text))
    expect(mock.received).toHaveLength(1)
  })

  it('stops reading a streamed response once it exceeds 64 KB and falls back', async () => {
    let written = 0
    let resolveClosed: () => void = () => undefined
    const connectionClosed = new Promise<void>((resolve) => { resolveClosed = resolve })
    const mock = await mockClassifier((_req, res) => {
      // No Content-Length: a chunked body that would grow to 32 MB if the client kept reading.
      res.writeHead(200, { 'content-type': 'application/json' })
      res.write('{"model_version":"')
      const chunk = 'x'.repeat(16 * 1024)
      const timer = setInterval(() => {
        if (res.destroyed || written >= 32 * 1024 * 1024) return
        res.write(chunk)
        written += chunk.length
      }, 5)
      res.on('close', () => {
        clearInterval(timer)
        resolveClosed()
      })
    })
    const started = Date.now()
    // A long timeout proves the fallback comes from the size cap, not from the timeout.
    const res = await classifyVia(mock.url, 20_000)(text).expect(200)
    expect(res.body).toEqual(classifyByKeywords(text))
    await connectionClosed
    expect(Date.now() - started).toBeLessThan(5000)
    expect(written).toBeLessThan(2 * 1024 * 1024)
  })

  it('rejects a declared Content-Length over 64 KB without reading the body', async () => {
    let resolveClosed: () => void = () => undefined
    const connectionClosed = new Promise<void>((resolve) => { resolveClosed = resolve })
    const mock = await mockClassifier((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': String(10 * 1024 * 1024) })
      res.write('{"activity_type":') // ...and never finish
      res.on('close', () => { resolveClosed() })
    })
    const started = Date.now()
    const res = await classifyVia(mock.url, 20_000)(text).expect(200)
    expect(res.body).toEqual(classifyByKeywords(text))
    await connectionClosed
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('falls back when the classifier is too slow', async () => {
    const mock = await mockClassifier((_req, res) => {
      setTimeout(() => { sendJson(200, MODEL_RESPONSE)(_req, res) }, 1500).unref()
    })
    const started = Date.now()
    const res = await classifyVia(mock.url, 150)(text).expect(200)
    expect(res.body.source).toBe('keyword-fallback')
    expect(Date.now() - started).toBeLessThan(1400)
  })
})
