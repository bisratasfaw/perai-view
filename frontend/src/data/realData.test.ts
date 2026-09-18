import { afterEach, describe, expect, it, vi } from 'vitest'
import { REAL_DATA_SCHEMAS } from '@shared/realData'
import { countriesFixture, devsFixture, manifestFixture, sdkFixture, sdkNotConfiguredFixture, usageFixture, wikiFixture } from './fixtures'
import { developerCitiesLayer, isRealLayer, sdkDownloadsLayer, usageIndexLayer, wikipediaLayer } from './layerData'
import { loadRealData, realDataUrl, resetRealDataCache } from './realData'

afterEach(() => {
  resetRealDataCache()
  vi.unstubAllGlobals()
})

describe('fixtures match the shared schemas', () => {
  it.each([
    ['manifest', manifestFixture],
    ['countries', countriesFixture],
    ['aiUsageByCountry', usageFixture],
    ['wikipediaInterest', wikiFixture],
    ['developerCities', devsFixture],
    ['sdkDownloadsByCountry', sdkNotConfiguredFixture],
    ['sdkDownloadsByCountry', sdkFixture],
  ] as const)('%s', (key, fixture) => {
    const result = REAL_DATA_SCHEMAS[key].safeParse(fixture)
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues[0])).toBe(true)
  })
})

describe('loadRealData', () => {
  const stubFetch = (body: unknown, status = 200) => {
    const mock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', mock)
    return mock
  }

  it('fetches from the site-relative snapshot folder and validates', async () => {
    const fetchMock = stubFetch(manifestFixture)
    const data = await loadRealData('manifest')
    expect(data.sources.wikipedia_pageviews.status).toBe('ok')
    expect(fetchMock).toHaveBeenCalledWith(realDataUrl('manifest'), expect.anything())
    expect(realDataUrl('manifest')).toMatch(/data\/real\/manifest\.json$/)
  })

  it('caches successful loads', async () => {
    const fetchMock = stubFetch(manifestFixture)
    await loadRealData('manifest')
    await loadRealData('manifest')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports validation failures with the offending path and retries afterwards', async () => {
    const fetchMock = stubFetch({ ...manifestFixture, schema_version: 2 })
    await expect(loadRealData('manifest')).rejects.toThrow(/manifest\.json failed validation at schema_version/)
    await expect(loadRealData('manifest')).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports HTTP errors', async () => {
    stubFetch({}, 404)
    await expect(loadRealData('countries')).rejects.toThrow(/HTTP 404/)
  })
})

describe('layer transforms', () => {
  it('normalises the usage index linearly and formats it as a multiplier', () => {
    const layer = usageIndexLayer(usageFixture)
    expect(layer.geometry).toBe('countries')
    const byCc = new Map(layer.values.map((v) => [v.cc, v.value]))
    expect(byCc.get('US')).toBeCloseTo(1, 5)
    expect(byCc.get('IN')!).toBeLessThan(byCc.get('DE')!)
    expect(byCc.has('BR')).toBe(false)
    expect(layer.format(3.62)).toBe('3.62×')
    expect(layer.range.max).toBe('3.62×')
  })

  it('uses a square-root scale for skewed counts', () => {
    const layer = wikipediaLayer(wikiFixture)
    const byCc = new Map(layer.values.map((v) => [v.cc, v.value]))
    expect(byCc.get('IN')).toBeCloseTo(1, 5)
    expect(byCc.get('DE')).toBeCloseTo(Math.sqrt(210000 / 300000), 5)
    expect(layer.raw.get('US')).toBe(230000)
  })

  it('turns developer cities into coloured points scaled by the busiest city', () => {
    const layer = developerCitiesLayer(devsFixture)
    expect(layer.geometry).toBe('points')
    const sf = layer.points.find((p) => p.key === 'San Francisco')!
    const berlin = layer.points.find((p) => p.key === 'Berlin')!
    expect(sf.intensity).toBe(1)
    expect(berlin.intensity).toBeCloseTo(Math.sqrt(55 / 180), 5)
    expect(sf.color).toBe('#199e70')
    expect(berlin.color).toBe('#d95926')
  })

  it('maps SDK downloads per country', () => {
    const layer = sdkDownloadsLayer(sdkFixture)
    expect(layer.values.map((v) => v.cc).sort()).toEqual(['DE', 'US'])
    expect(layer.metric).toContain('7 days')
  })

  it('knows which layers are real', () => {
    expect(isRealLayer('activity')).toBe(false)
    expect(isRealLayer('usage-index')).toBe(true)
  })
})
