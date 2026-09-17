import { readFileSync } from 'node:fs'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { CITIES } from '@shared/cities'
import { PROGRAMS } from '@shared/programs'
import { SIMULATION_VERSION, computeGlobalStats, computeHeatmap, computeRegionalStats, computeTrends } from '@shared/simulation'
import { FIXED_NOW, testApp } from './helpers'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
/** Round-trips through JSON, as the HTTP response does. */
const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value))

function expectError(res: request.Response, status: number, code: string) {
  expect(res.status).toBe(status)
  expect(res.headers['content-type']).toMatch(/application\/json/)
  expect(res.body.error.code).toBe(code)
  expect(typeof res.body.error.message).toBe('string')
}

describe('GET /api/health', () => {
  it('reports status, versions and that data is simulated', async () => {
    const res = await request(testApp().app).get('/api/health').expect(200)
    expect(res.body).toEqual({
      status: 'ok',
      version: pkg.version,
      simulation_version: SIMULATION_VERSION,
      uptime_seconds: expect.any(Number),
      simulated: true,
    })
    expect(Number.isInteger(res.body.uptime_seconds)).toBe(true)
  })
})

describe('programs', () => {
  const { app } = testApp()

  it('lists every program', async () => {
    const res = await request(app).get('/api/programs').expect(200)
    expect(res.body).toEqual({ data: json(PROGRAMS) })
  })

  it('returns one program by id', async () => {
    const res = await request(app).get('/api/programs/claude').expect(200)
    expect(res.body).toEqual(json(PROGRAMS.find((p) => p.id === 'claude')))
  })

  it.each(['unknown', '__proto__', 'constructor'])('404s for %s', async (id) => {
    expectError(await request(app).get(`/api/programs/${id}`), 404, 'not_found')
  })
})

describe('GET /api/activities', () => {
  const { app, feed } = testApp()

  it('returns the 20 newest events by default, newest first', async () => {
    const res = await request(app).get('/api/activities').expect(200)
    expect(res.body.total).toBe(60)
    expect(res.body.data).toHaveLength(20)
    expect(res.body.data).toEqual(json(feed.newestFirst().slice(0, 20)))
    const times = (res.body.data as { created_at: string }[]).map((a) => Date.parse(a.created_at))
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('honours limit', async () => {
    expect((await request(app).get('/api/activities?limit=5').expect(200)).body.data).toHaveLength(5)
    expect((await request(app).get('/api/activities?limit=100').expect(200)).body.data).toHaveLength(60)
  })

  it('filters by program and by country (case-insensitive ISO code)', async () => {
    const program = feed.newestFirst()[0].program_id
    const byProgram = await request(app).get(`/api/activities?program=${program}&limit=100`).expect(200)
    const expected = feed.newestFirst().filter((a) => a.program_id === program)
    expect(byProgram.body).toEqual({ data: json(expected), total: expected.length })

    const byCountry = await request(app).get('/api/activities?country=us&limit=100').expect(200)
    const us = feed.newestFirst().filter((a) => a.country === 'US')
    expect(us.length).toBeGreaterThan(0)
    expect(byCountry.body.total).toBe(us.length)
    expect((byCountry.body.data as { country: string }[]).every((a) => a.country === 'US')).toBe(true)
  })

  it.each([
    ['limit=abc', 'limit'],
    ['limit=0', 'limit'],
    ['limit=101', 'limit'],
    ['limit=2.5', 'limit'],
    ['limit=', 'limit'],
    ['limit=1&limit=2', 'limit'],
    ['program=skynet', 'program'],
    ['country=USA', 'country'],
    ['country=1', 'country'],
  ])('rejects %s with zod issue details', async (query, field) => {
    const res = await request(app).get(`/api/activities?${query}`)
    expectError(res, 400, 'bad_request')
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: [field], code: expect.any(String), message: expect.any(String) })]),
    )
  })

  it('returns one activity by id, or 404', async () => {
    const target = feed.newestFirst()[7]
    expect((await request(app).get(`/api/activities/${target.id}`).expect(200)).body).toEqual(json(target))
    expectError(await request(app).get('/api/activities/does-not-exist'), 404, 'not_found')
  })
})

describe('analytics', () => {
  const { app } = testApp()

  it('GET /global matches the shared simulation', async () => {
    const res = await request(app).get('/api/analytics/global').expect(200)
    expect(res.body).toEqual(json(computeGlobalStats(FIXED_NOW)))
    expect(res.body.simulated).toBe(true)
    expect(res.body.top_programs).toHaveLength(PROGRAMS.length)
  })

  it('GET /trends defaults to 24 hourly points', async () => {
    const res = await request(app).get('/api/analytics/trends').expect(200)
    expect(res.body).toEqual({ interval: 'hour', data: json(computeTrends(FIXED_NOW, 24)) })
    expect((await request(app).get('/api/analytics/trends?hours=72').expect(200)).body.data).toHaveLength(72)
    expect((await request(app).get('/api/analytics/trends?hours=1').expect(200)).body.data).toHaveLength(1)
  })

  it.each(['0', '73', 'abc', '-5', '1.5'])('GET /trends rejects hours=%s', async (hours) => {
    expectError(await request(app).get(`/api/analytics/trends?hours=${hours}`), 400, 'bad_request')
  })

  it('GET /regional returns stats for a known city (case-insensitive)', async () => {
    const res = await request(app).get('/api/analytics/regional?city=tokyo').expect(200)
    expect(res.body).toEqual(json(computeRegionalStats('Tokyo', FIXED_NOW)))
    expect(res.body.region.city).toBe('Tokyo')
    const accented = await request(app).get(`/api/analytics/regional?city=${encodeURIComponent('São Paulo')}`).expect(200)
    expect(accented.body.region.country).toBe('BR')
  })

  it('GET /regional validates and 404s', async () => {
    expectError(await request(app).get('/api/analytics/regional'), 400, 'bad_request')
    expectError(await request(app).get('/api/analytics/regional?city=%20'), 400, 'bad_request')
    expectError(await request(app).get('/api/analytics/regional?city=Atlantis'), 404, 'not_found')
  })

  it('GET /heatmap returns a GeoJSON feature per city', async () => {
    const res = await request(app).get('/api/analytics/heatmap').expect(200)
    expect(res.body).toEqual(json(computeHeatmap(FIXED_NOW)))
    expect(res.body.type).toBe('FeatureCollection')
    expect(res.body.features).toHaveLength(CITIES.length)
  })
})

describe('unknown routes and removed features', () => {
  const { app } = testApp()

  it.each([
    ['get', '/'],
    ['get', '/api'],
    ['get', '/api/nope'],
    ['get', '/api/users/1'],
    ['post', '/api/auth/login'],
    ['post', '/api/auth/register'],
    ['post', '/api/activities'],
    ['put', '/api/activities/1'],
    ['delete', '/api/activities/1'],
    ['get', '/api/classify'],
  ] as const)('%s %s returns 404 JSON', async (method, path) => {
    expectError(await request(app)[method](path), 404, 'not_found')
  })
})
