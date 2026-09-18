/**
 * `npm run refresh [-- --only a,b] [--skip a,b] [--force] [--data-dir path]`
 *
 * Runs every source independently and writes validated snapshots to data/real. A failing
 * source keeps its previous file and is reported as `failed` in manifest.json; a source
 * excluded with --only/--skip keeps its previous file and manifest entry. Exit code 1 only
 * when a produced file fails schema validation or when no source succeeded at all.
 */
import { parseArgs } from 'node:util'
import { join } from 'node:path'
import {
  activityTypesSchema,
  manifestSchema,
  REAL_DATA_FILES,
  REAL_DATA_SCHEMAS,
  SOURCE_IDS,
  type ActivityTypeSeries,
  type Manifest,
  type RealDataKey,
  type SourceId,
  type SourceInfo,
} from '@shared/realData'
import { z } from 'zod'
import { type PipelineContext } from './context'
import { readJsonFile, writeJsonAtomic } from './lib/json'
import { createLogger, errorMessage } from './lib/log'
import { STATE_FILE, StateStore } from './lib/state'
import { buildSourceInfo, type Outcome } from './manifest'
import { DEFAULT_DATA_DIR } from './paths'
import { anthropicSource } from './sources/anthropic'
import { buildCountries } from './sources/countries'
import { githubSource } from './sources/github'
import { openaiSource } from './sources/openai'
import { pypiSource } from './sources/pypi'
import { type Source } from './sources/types'
import { wikipediaSource } from './sources/wikipedia'
import pkg from '../package.json' with { type: 'json' }

export const SOURCES: readonly Source[] = [anthropicSource, openaiSource, wikipediaSource, pypiSource, githubSource]

const freshnessSchema = z.record(z.string(), z.string().nullable())

interface RunOptions {
  dataDir: string
  only?: string[]
  skip?: string[]
  force: boolean
  now?: Date
}

interface RunSummary {
  manifest: Manifest
  validationFailures: string[]
  succeeded: number
}

function fileKey(file: string): RealDataKey {
  const key = (Object.keys(REAL_DATA_FILES) as RealDataKey[]).find((k) => REAL_DATA_FILES[k] === file)
  if (!key) throw new Error(`${file} is not a known snapshot file`)
  return key
}

function selectSources(options: RunOptions): Set<SourceId> {
  const keys = new Map(SOURCES.map((s) => [s.meta.key, s.meta.id]))
  const resolve = (names: string[]) =>
    names.map((name) => {
      const id = keys.get(name) ?? (SOURCE_IDS.includes(name as SourceId) ? (name as SourceId) : undefined)
      if (!id) throw new Error(`unknown source "${name}"; expected one of ${[...keys.keys()].join(', ')}`)
      return id
    })
  const selected = new Set<SourceId>(options.only ? resolve(options.only) : SOURCE_IDS)
  for (const id of resolve(options.skip ?? [])) selected.delete(id)
  return selected
}

export async function runRefresh(options: RunOptions): Promise<RunSummary> {
  const now = options.now ?? new Date()
  const log = createLogger('refresh')
  const { dataDir } = options
  const state = await StateStore.load(join(dataDir, STATE_FILE))
  const ctx: PipelineContext = { now, dataDir, force: options.force, state, log, env: process.env }

  const previousManifest = manifestSchema.safeParse(await readJsonFile(join(dataDir, REAL_DATA_FILES.manifest)))
  const previousSources = previousManifest.success ? previousManifest.data.sources : undefined
  const previousActivity = activityTypesSchema.safeParse(await readJsonFile(join(dataDir, REAL_DATA_FILES.activityTypes)))
  const series = new Map<SourceId, ActivityTypeSeries>()
  if (previousActivity.success) for (const s of previousActivity.data.series) series.set(s.source, s)
  const freshness = state.get('freshness', freshnessSchema) ?? {}

  const selected = selectSources(options)
  const validationFailures: string[] = []
  const sources: Partial<Record<SourceId, SourceInfo>> = {}
  let succeeded = 0

  await writeJsonAtomic(join(dataDir, REAL_DATA_FILES.countries), buildCountries(now))
  log.info(`wrote ${REAL_DATA_FILES.countries}`)

  for (const source of SOURCES) {
    const { id, key } = source.meta
    const previous = previousSources?.[id]
    let outcome: Outcome
    if (!selected.has(id) && previous) {
      outcome = { kind: 'kept' }
      log.info(`${key}: not selected, keeping previous snapshot`)
    } else {
      if (!selected.has(id)) log.info(`${key}: not selected but never fetched, running it anyway`)
      const started = Date.now()
      try {
        const result = await source.fetch(ctx)
        if (result.file !== null) {
          const parsed = REAL_DATA_SCHEMAS[fileKey(result.file)].safeParse(result.data)
          if (!parsed.success) throw new ValidationError(`${result.file} failed validation: ${z.prettifyError(parsed.error)}`)
          await writeJsonAtomic(join(dataDir, result.file), result.data)
        }
        for (const s of result.series ?? []) series.set(s.source, s)
        if (result.series?.length === 0) series.delete(id)
        outcome = { kind: 'fetched', result }
        log.info(`${key}: ${result.status ?? 'ok'} in ${((Date.now() - started) / 1000).toFixed(1)} s`)
      } catch (error) {
        const message = errorMessage(error)
        if (error instanceof ValidationError) validationFailures.push(message)
        outcome = { kind: 'failed', error: message }
        log.warn(`${key}: FAILED after ${((Date.now() - started) / 1000).toFixed(1)} s: ${message}`)
      }
    }
    const built = buildSourceInfo(source.meta, outcome, previous, freshness[id] ?? null, now)
    sources[id] = built.info
    freshness[id] = built.freshness_date
    if (built.info.status === 'ok' || built.info.status === 'stale') succeeded++
  }

  const orderedSeries = SOURCE_IDS.flatMap((id) => {
    const s = series.get(id)
    return s ? [s] : []
  })
  if (orderedSeries.length > 0) {
    const activity = { generated_at: now.toISOString(), series: orderedSeries }
    const parsed = activityTypesSchema.safeParse(activity)
    if (parsed.success) {
      await writeJsonAtomic(join(dataDir, REAL_DATA_FILES.activityTypes), activity)
      log.info(`wrote ${REAL_DATA_FILES.activityTypes} (${orderedSeries.length} series)`)
    } else {
      validationFailures.push(`${REAL_DATA_FILES.activityTypes} failed validation: ${z.prettifyError(parsed.error)}`)
    }
  }

  const manifest: Manifest = {
    schema_version: 1,
    generated_at: now.toISOString(),
    pipeline_version: pkg.version,
    sources: sources as Manifest['sources'],
  }
  const manifestCheck = manifestSchema.safeParse(manifest)
  if (!manifestCheck.success) validationFailures.push(`manifest failed validation: ${z.prettifyError(manifestCheck.error)}`)
  await writeJsonAtomic(join(dataDir, REAL_DATA_FILES.manifest), manifest)
  state.set('freshness', freshness)
  await state.save(now)
  return { manifest, validationFailures, succeeded }
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

function parseCli(argv: string[]): RunOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      only: { type: 'string' },
      skip: { type: 'string' },
      force: { type: 'boolean', default: false },
      'data-dir': { type: 'string' },
    },
    strict: true,
  })
  const list = (value: string | undefined) => value?.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  return { dataDir: values['data-dir'] ?? DEFAULT_DATA_DIR, only: list(values.only), skip: list(values.skip), force: values.force }
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2))
  const summary = await runRefresh(options)
  const lines = Object.values(summary.manifest.sources).map(
    (s) => `${s.id.padEnd(26)} ${s.status.padEnd(15)} as_of=${(s.as_of ?? '-').padEnd(12)} ${s.error ?? ''}`,
  )
  process.stdout.write(`${lines.join('\n')}\n`)
  for (const failure of summary.validationFailures) process.stderr.write(`VALIDATION: ${failure}\n`)
  if (summary.validationFailures.length > 0 || summary.succeeded === 0) process.exitCode = 1
}

if (process.argv[1] && /refresh\.[cm]?[jt]s$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
