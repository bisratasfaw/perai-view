import { describe, expect, it } from 'vitest'
import { sdkDownloadsByCountrySchema } from '@shared/realData'
import { buildDownloads, buildQuery, buildStub, PACKAGES } from '../src/sources/pypi'

describe('PyPI downloads', () => {
  it('writes a schema-valid stub when BigQuery is not configured', () => {
    const stub = buildStub('BIGQUERY_PROJECT')
    expect(sdkDownloadsByCountrySchema.safeParse(stub).success).toBe(true)
    expect(stub).toMatchObject({ status: 'not_configured', as_of: null, countries: [] })
    expect(stub.note).toContain('GCP_SERVICE_ACCOUNT_KEY')
  })

  it('maps packages to assistants and vendors', () => {
    expect(PACKAGES).toEqual([
      { name: 'openai', assistant: 'chatgpt', vendor: 'OpenAI' },
      { name: 'anthropic', assistant: 'claude', vendor: 'Anthropic' },
      { name: 'google-genai', assistant: 'gemini', vendor: 'Google' },
      { name: 'mistralai', assistant: 'mistral', vendor: 'Mistral AI' },
    ])
  })

  it('aggregates query rows by country with a leading assistant', () => {
    const data = buildDownloads(
      [
        { country_code: 'US', project: 'openai', downloads: 500 },
        { country_code: 'US', project: 'anthropic', downloads: 700 },
        { country_code: 'us', project: 'anthropic', downloads: 1 },
        { country_code: 'DE', project: 'mistralai', downloads: 20 },
        { country_code: 'DE', project: 'requests', downloads: 9999 },
        { country_code: '', project: 'openai', downloads: 9999 },
      ],
      '2026-09-16',
    )
    expect(sdkDownloadsByCountrySchema.safeParse(data).success).toBe(true)
    expect(data.countries).toEqual([
      { cc: 'US', name: 'United States', downloads: { openai: 500, anthropic: 701 }, total: 1201, leading: 'claude' },
      { cc: 'DE', name: 'Germany', downloads: { mistralai: 20 }, total: 20, leading: 'mistral' },
    ])
  })

  it('queries only the needed columns over a half-open date range', () => {
    const sql = buildQuery('2026-09-10', '2026-09-17')
    expect(sql).toContain("timestamp >= TIMESTAMP('2026-09-10') AND timestamp < TIMESTAMP('2026-09-17')")
    expect(sql).toContain("file.project IN ('openai', 'anthropic', 'google-genai', 'mistralai')")
    expect(sql).toContain('GROUP BY country_code, project')
  })
})
