import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { REAL_DATA_FILES, REAL_DATA_SCHEMAS, SOURCE_IDS, type RealDataKey } from '@shared/realData'
import { DEFAULT_DATA_DIR } from '../src/paths'
import { validateDataDir } from '../src/validate'

function load(key: RealDataKey): unknown {
  return JSON.parse(readFileSync(new URL(`../../data/real/${REAL_DATA_FILES[key]}`, import.meta.url), 'utf8')) as unknown
}

describe('committed snapshots in data/real', () => {
  it.each(Object.keys(REAL_DATA_SCHEMAS) as RealDataKey[])('%s matches its schema', (key) => {
    const result = REAL_DATA_SCHEMAS[key].safeParse(load(key))
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues.slice(0, 5))).toBe(true)
  })

  it('validateDataDir reports no issues', async () => {
    expect(await validateDataDir(DEFAULT_DATA_DIR)).toEqual([])
  })

  it('manifest lists every source and the activity series reference known sources', () => {
    const manifest = load('manifest') as { sources: Record<string, { status: string }> }
    expect(Object.keys(manifest.sources).sort()).toEqual([...SOURCE_IDS].sort())
    const activity = load('activityTypes') as { series: { source: string }[] }
    for (const s of activity.series) expect(SOURCE_IDS).toContain(s.source)
  })
})
