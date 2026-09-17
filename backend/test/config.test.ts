import { describe, expect, it } from 'vitest'
import { ConfigError, DEV_CLASSIFIER_URL, parseConfig } from '../src/config'

describe('parseConfig', () => {
  it('applies safe defaults', () => {
    const config = parseConfig({})
    expect(config).toMatchObject({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: 4000,
      corsOrigins: ['http://localhost:5173', 'http://localhost:4173'],
      trustProxy: 0,
      exposeErrorDetails: false,
      classifier: { url: DEV_CLASSIFIER_URL, timeoutMs: 2500 },
      rateLimit: { max: 300, windowMs: 900_000 },
      classifyRateLimit: { max: 30, windowMs: 60_000 },
      ws: { maxClients: 500, maxClientsPerIp: 10, maxPayloadBytes: 1024, heartbeatMs: 30_000 },
    })
  })

  it('normalises and de-duplicates CORS origins', () => {
    const config = parseConfig({ CORS_ORIGINS: ' https://perai.example/ , http://localhost:5173,https://perai.example' })
    expect(config.corsOrigins).toEqual(['https://perai.example', 'http://localhost:5173'])
  })

  it.each([
    ['CORS_ORIGINS', 'not a url'],
    ['CORS_ORIGINS', 'https://perai.example/app'],
    ['CORS_ORIGINS', 'ftp://perai.example'],
    ['PORT', 'abc'],
    ['PORT', '70000'],
    ['TRUST_PROXY', '-1'],
    ['NODE_ENV', 'staging'],
    ['AI_CLASSIFIER_URL', 'file:///etc/passwd'],
    ['AI_CLASSIFIER_URL', 'OFF!'],
    ['WS_MAX_CLIENTS_PER_IP', '0'],
    ['EXPOSE_ERROR_DETAILS', 'maybe'],
  ])('rejects invalid %s=%s', (key, value) => {
    expect(() => parseConfig({ [key]: value })).toThrow(ConfigError)
  })

  describe('AI_CLASSIFIER_URL', () => {
    it('defaults to the local classifier outside production, so a fresh clone reaches the model', () => {
      expect(DEV_CLASSIFIER_URL).toBe('http://127.0.0.1:8000')
      for (const NODE_ENV of ['development', 'test', undefined]) {
        expect(parseConfig({ NODE_ENV }).classifier.url).toBe(DEV_CLASSIFIER_URL)
        expect(parseConfig({ NODE_ENV, AI_CLASSIFIER_URL: '' }).classifier.url).toBe(DEV_CLASSIFIER_URL)
      }
    })

    it('stays unset in production, meaning keyword fallback only', () => {
      expect(parseConfig({ NODE_ENV: 'production' }).classifier.url).toBeUndefined()
    })

    it('can be disabled explicitly with "off" in any environment', () => {
      expect(parseConfig({ AI_CLASSIFIER_URL: 'off' }).classifier.url).toBeUndefined()
      expect(parseConfig({ NODE_ENV: 'production', AI_CLASSIFIER_URL: 'off' }).classifier.url).toBeUndefined()
    })

    it('uses an explicit URL without its trailing slash', () => {
      expect(parseConfig({ AI_CLASSIFIER_URL: 'http://classifier:8000/' }).classifier.url).toBe('http://classifier:8000')
      expect(parseConfig({ NODE_ENV: 'production', AI_CLASSIFIER_URL: 'https://ml.example' }).classifier.url).toBe('https://ml.example')
    })
  })

  it('treats empty values as unset', () => {
    expect(parseConfig({ PORT: '', HOST: ' ' })).toMatchObject({ port: 4000, host: '127.0.0.1' })
  })

  it('parses numeric and boolean settings', () => {
    const config = parseConfig({
      HOST: '0.0.0.0',
      PORT: '0',
      TRUST_PROXY: '1',
      EXPOSE_ERROR_DETAILS: 'true',
      RATE_LIMIT_MAX: '5',
      WS_MAX_CLIENTS: '2',
      WS_MAX_CLIENTS_PER_IP: '1',
    })
    expect(config).toMatchObject({
      host: '0.0.0.0',
      port: 0,
      trustProxy: 1,
      exposeErrorDetails: true,
      rateLimit: { max: 5 },
      ws: { maxClients: 2, maxClientsPerIp: 1 },
    })
  })
})
