import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { ALLOWED_ORIGIN, DISALLOWED_ORIGIN, testApp } from './helpers'

describe('request body handling', () => {
  const { app } = testApp()

  it('answers malformed JSON with a 400 envelope and no stack trace', async () => {
    const res = await request(app).post('/api/classify').set('Content-Type', 'application/json').send('{"text": "hi"')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: { code: 'bad_request', message: 'Malformed JSON body' } })
    expect(res.text).not.toMatch(/SyntaxError|at .*\(|node_modules/)
  })

  it('rejects bodies over 16 KB with 413', async () => {
    const res = await request(app).post('/api/classify').send({ text: 'a'.repeat(17 * 1024) })
    expect(res.status).toBe(413)
    expect(res.body.error.code).toBe('payload_too_large')
  })

  it.each([
    ['a number', { text: 42 }],
    ['an array', { text: ['a'] }],
    ['an object', { text: { $gt: '' } }],
    ['whitespace only', { text: '   ' }],
    ['too long', { text: 'a'.repeat(2001) }],
    ['missing', {}],
  ])('rejects text that is %s with 400', async (_label, body) => {
    const res = await request(app).post('/api/classify').send(body)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('bad_request')
    expect(res.body.error.details).toEqual(expect.any(Array))
  })

  it('accepts exactly 2000 characters after trimming', async () => {
    await request(app).post('/api/classify').send({ text: `  ${'a'.repeat(2000)}  ` }).expect(200)
  })

  it('treats a non-JSON content type as a missing body', async () => {
    const res = await request(app).post('/api/classify').set('Content-Type', 'text/plain').send('text=hello')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('bad_request')
  })
})

describe('internal errors', () => {
  const boom = () => Promise.reject(new Error('secret internals'))

  it('never include details by default, or in production even with EXPOSE_ERROR_DETAILS', async () => {
    for (const overrides of [{}, { nodeEnv: 'production' as const, exposeErrorDetails: true }]) {
      const { app } = testApp(overrides, { classify: boom })
      const res = await request(app).post('/api/classify').send({ text: 'hello' })
      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: { code: 'internal', message: 'Internal server error' } })
      expect(res.text).not.toContain('secret internals')
    }
  })

  it('include the stack only in development with EXPOSE_ERROR_DETAILS=true', async () => {
    const { app } = testApp({ nodeEnv: 'development', exposeErrorDetails: true }, { classify: boom })
    const res = await request(app).post('/api/classify').send({ text: 'hello' })
    expect(res.status).toBe(500)
    expect(res.body.error.details.stack).toContain('secret internals')
  })
})

describe('security headers', () => {
  it('sets helmet headers and hides x-powered-by', async () => {
    const { app } = testApp()
    for (const path of ['/api/health', '/api/nope']) {
      const res = await request(app).get(path)
      expect(res.headers['x-powered-by']).toBeUndefined()
      expect(res.headers['content-security-policy']).toContain("default-src 'none'")
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'")
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/)
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
      expect(res.headers['referrer-policy']).toBe('no-referrer')
      expect(res.headers['cross-origin-opener-policy']).toBe('same-origin')
    }
  })
})

describe('CORS', () => {
  const { app } = testApp({ corsOrigins: [ALLOWED_ORIGIN] })

  it('allows listed origins', async () => {
    const res = await request(app).get('/api/programs').set('Origin', ALLOWED_ORIGIN).expect(200)
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN)
    expect(res.headers.vary).toMatch(/Origin/)
  })

  it('answers preflight requests for listed origins', async () => {
    const res = await request(app)
      .options('/api/classify')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
    expect(res.status).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN)
    expect(res.headers['access-control-allow-methods']).toContain('POST')
    expect(res.headers['access-control-allow-headers']).toMatch(/content-type/i)
  })

  it('does not grant other origins', async () => {
    const res = await request(app).get('/api/programs').set('Origin', DISALLOWED_ORIGIN)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
    const preflight = await request(app)
      .options('/api/classify')
      .set('Origin', DISALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('rate limiting', () => {
  it('limits requests per IP with standard headers and a JSON 429', async () => {
    const { app } = testApp({ rateLimit: { windowMs: 60_000, max: 3 }, corsOrigins: [ALLOWED_ORIGIN] })
    for (let i = 0; i < 3; i++) {
      const ok = await request(app).get('/api/programs').expect(200)
      expect(ok.headers['ratelimit-policy']).toBeDefined()
      expect(ok.headers.ratelimit).toBeDefined()
    }
    const limited = await request(app).get('/api/programs').set('Origin', ALLOWED_ORIGIN)
    expect(limited.status).toBe(429)
    expect(limited.body.error.code).toBe('rate_limited')
    expect(limited.headers['retry-after']).toBeDefined()
    // Browsers must be able to read the 429, so CORS headers are still present.
    expect(limited.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN)
    // Health checks are exempt.
    await request(app).get('/api/health').expect(200)
  })

  it('applies a stricter limit to /api/classify only', async () => {
    const { app } = testApp({ classifyRateLimit: { windowMs: 60_000, max: 2 } })
    await request(app).post('/api/classify').send({ text: 'write an email' }).expect(200)
    await request(app).post('/api/classify').send({ text: 'write an email' }).expect(200)
    const limited = await request(app).post('/api/classify').send({ text: 'write an email' })
    expect(limited.status).toBe(429)
    expect(limited.body.error.code).toBe('rate_limited')
    await request(app).get('/api/programs').expect(200)
  })
})
