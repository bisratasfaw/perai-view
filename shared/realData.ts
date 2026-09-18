/**
 * Schemas for the real-data snapshots in /data/real.
 *
 * The data pipeline (data-pipeline/) writes these files and the frontend reads them, and both
 * validate against these schemas, so the two sides cannot drift. Every file names its source,
 * licence and "as of" date so the UI can show provenance next to every number.
 *
 * Assistant ids reuse ProgramId from ./programs so colours and names stay consistent. When a
 * source is about a vendor rather than a product (an SDK, a company article), the UI shows the
 * vendor label from PROGRAMS, never "ChatGPT usage".
 */
import { z } from 'zod'
import { PROGRAM_IDS } from './programs'

export const SOURCE_IDS = [
  'anthropic_economic_index',
  'openai_usage_report',
  'wikipedia_pageviews',
  'pypi_downloads',
  'github_forks',
] as const

export type SourceId = (typeof SOURCE_IDS)[number]

export const REAL_DATA_FILES = {
  manifest: 'manifest.json',
  countries: 'countries.json',
  aiUsageByCountry: 'ai-usage-by-country.json',
  activityTypes: 'activity-types.json',
  wikipediaInterest: 'wikipedia-interest.json',
  sdkDownloadsByCountry: 'sdk-downloads-by-country.json',
  developerCities: 'developer-cities.json',
} as const

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
const isoDateTime = z.string().datetime({ offset: true })
const cc = z.string().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2')
const programId = z.enum(PROGRAM_IDS)
const share = z.number().min(0).max(1)

/** Counts keyed by assistant id; missing keys mean zero (zod 4's `record` would require every key). */
const countsByProgram = z.partialRecord(programId, z.number().nonnegative())

export const sourceStatusSchema = z.enum(['ok', 'stale', 'not_configured', 'failed'])

export const sourceInfoSchema = z.object({
  id: z.enum(SOURCE_IDS),
  title: z.string().min(1),
  publisher: z.string().min(1),
  url: z.string().url(),
  license: z.string().min(1),
  description: z.string().min(1),
  status: sourceStatusSchema,
  /** When the pipeline last fetched successfully; null if never. */
  fetched_at: isoDateTime.nullable(),
  /** Human-readable currency of the data, e.g. "2026-09-16" or "May 2026". */
  as_of: z.string().nullable(),
  error: z.string().nullable(),
  notes: z.array(z.string()),
})

export const manifestSchema = z.object({
  schema_version: z.literal(1),
  generated_at: isoDateTime,
  pipeline_version: z.string(),
  sources: z.record(z.enum(SOURCE_IDS), sourceInfoSchema),
})

export const countrySchema = z.object({
  cc,
  name: z.string().min(1),
  /** ISO 3166-1 numeric, zero-padded to 3 digits (matches world-atlas feature ids). */
  ccn3: z.string().regex(/^\d{3}$/),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export const countriesSchema = z.object({
  generated_at: isoDateTime,
  source: z.string(),
  countries: z.array(countrySchema).min(150),
})

export const aiUsageByCountrySchema = z.object({
  source: z.literal('anthropic_economic_index'),
  release: z.string(),
  product: z.string(),
  period: z.object({ start: isoDate, end: isoDate }),
  as_of: z.string(),
  metrics: z.object({
    usage_pct: z.string(),
    usage_per_capita_index: z.string(),
  }),
  countries: z
    .array(
      z.object({
        cc,
        name: z.string(),
        /** Share of global usage, in percent (0–100). */
        usage_pct: z.number().min(0).max(100),
        /** Usage share divided by working-age population share; 1 = proportional. */
        usage_per_capita_index: z.number().nonnegative().nullable(),
        usage_tier: z.string().nullable(),
        usage_count: z.number().nonnegative().nullable(),
      }),
    )
    .min(20),
  us_states: z
    .array(
      z.object({
        code: z.string(),
        name: z.string(),
        usage_pct: z.number().min(0).max(100),
        usage_per_capita_index: z.number().nonnegative().nullable(),
      }),
    )
    .optional(),
})

export const activityTypeSeriesSchema = z.object({
  source: z.enum(SOURCE_IDS),
  title: z.string(),
  /** What the shares describe, e.g. "Consumer ChatGPT messages". */
  subject: z.string(),
  as_of: z.string(),
  period: z.object({ start: isoDate, end: isoDate }).nullable(),
  method: z.string(),
  url: z.string().url(),
  categories: z.array(z.object({ label: z.string(), share, note: z.string().optional() })).min(3),
  /** An earlier snapshot from the same source, for change-over-time display. */
  previous: z
    .object({
      as_of: z.string(),
      categories: z.array(z.object({ label: z.string(), share })),
    })
    .nullable(),
})

export const activityTypesSchema = z.object({
  generated_at: isoDateTime,
  series: z.array(activityTypeSeriesSchema).min(1),
})

export const wikipediaInterestSchema = z.object({
  source: z.literal('wikipedia_pageviews'),
  as_of: isoDate,
  days: z.number().int().positive(),
  articles: z.array(
    z.object({
      assistant: programId,
      qid: z.string().regex(/^Q\d+$/),
      label: z.string(),
      /** Language editions summed for the daily series. */
      projects: z.number().int().nonnegative(),
    }),
  ),
  /** One entry per day, oldest first; views summed across language editions. */
  daily: z.array(z.object({ date: isoDate, views: countsByProgram })).min(7),
  /** From the pageviews-by-country dataset; sums over the same window. */
  by_country: z.array(
    z.object({
      cc,
      name: z.string(),
      views: countsByProgram,
      total: z.number().nonnegative(),
      leading: programId,
    }),
  ),
  by_country_note: z.string(),
})

export const sdkDownloadsByCountrySchema = z.object({
  source: z.literal('pypi_downloads'),
  status: sourceStatusSchema,
  as_of: isoDate.nullable(),
  period_days: z.number().int().positive(),
  packages: z.array(z.object({ name: z.string(), assistant: programId, vendor: z.string() })),
  countries: z.array(
    z.object({
      cc,
      name: z.string(),
      downloads: z.record(z.string(), z.number().nonnegative()),
      total: z.number().nonnegative(),
      leading: programId,
    }),
  ),
  note: z.string(),
})

export const developerCitiesSchema = z.object({
  source: z.literal('github_forks'),
  as_of: isoDate,
  repos: z.array(
    z.object({
      full_name: z.string(),
      assistant: programId,
      vendor: z.string(),
      forks_total: z.number().int().nonnegative(),
      forks_seen: z.number().int().nonnegative(),
      with_location: z.number().int().nonnegative(),
    }),
  ),
  cities: z
    .array(
      z.object({
        name: z.string(),
        cc,
        lat: z.number(),
        lng: z.number(),
        counts: countsByProgram,
        total: z.number().int().positive(),
      }),
    )
    .min(10),
  countries: z.array(z.object({ cc, name: z.string(), counts: countsByProgram, total: z.number().int().positive() })),
  geocoding: z.object({
    method: z.string(),
    matched_city_pct: z.number().min(0).max(100),
    matched_country_pct: z.number().min(0).max(100),
  }),
})

export type Manifest = z.infer<typeof manifestSchema>
export type SourceInfo = z.infer<typeof sourceInfoSchema>
export type Country = z.infer<typeof countrySchema>
export type Countries = z.infer<typeof countriesSchema>
export type AiUsageByCountry = z.infer<typeof aiUsageByCountrySchema>
export type ActivityTypes = z.infer<typeof activityTypesSchema>
export type ActivityTypeSeries = z.infer<typeof activityTypeSeriesSchema>
export type WikipediaInterest = z.infer<typeof wikipediaInterestSchema>
export type SdkDownloadsByCountry = z.infer<typeof sdkDownloadsByCountrySchema>
export type DeveloperCities = z.infer<typeof developerCitiesSchema>

export const REAL_DATA_SCHEMAS = {
  manifest: manifestSchema,
  countries: countriesSchema,
  aiUsageByCountry: aiUsageByCountrySchema,
  activityTypes: activityTypesSchema,
  wikipediaInterest: wikipediaInterestSchema,
  sdkDownloadsByCountry: sdkDownloadsByCountrySchema,
  developerCities: developerCitiesSchema,
} as const

export type RealDataKey = keyof typeof REAL_DATA_SCHEMAS
