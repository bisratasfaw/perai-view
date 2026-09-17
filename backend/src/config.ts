import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

const DEFAULT_CORS_ORIGINS = 'http://localhost:5173,http://localhost:4173'
/** Where the local classifier listens. Used outside production when AI_CLASSIFIER_URL is unset. */
export const DEV_CLASSIFIER_URL = 'http://127.0.0.1:8000'

export interface RateLimitConfig {
  windowMs: number
  max: number
}

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test'
  host: string
  port: number
  /** Exact origins allowed for CORS and for WebSocket upgrades. */
  corsOrigins: string[]
  /** Number of reverse-proxy hops to trust for the client IP; 0 disables. */
  trustProxy: number
  /** Stack traces are only sent when this is true AND nodeEnv is development. */
  exposeErrorDetails: boolean
  /** Whether request/diagnostic logs are written. */
  logging: boolean
  classifier: {
    /** Base URL of the Python classifier; undefined means keyword fallback only. */
    url: string | undefined
    timeoutMs: number
  }
  rateLimit: RateLimitConfig
  classifyRateLimit: RateLimitConfig
  ws: {
    maxClients: number
    /** Simultaneous connections allowed from one client IP (IPv6 grouped by /56). */
    maxClientsPerIp: number
    maxPayloadBytes: number
    heartbeatMs: number
  }
}

export class ConfigError extends Error {
  override name = 'ConfigError'
}

const intFromEnv = (min: number, max: number) => z.coerce.number().int().min(min).max(max)

function normaliseOrigin(value: string, ctx: z.RefinementCtx): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    ctx.addIssue({ code: 'custom', message: `"${trimmed}" is not a valid origin` })
    return z.NEVER
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== trimmed) {
    ctx.addIssue({ code: 'custom', message: `"${trimmed}" must be a bare origin such as https://example.com` })
    return z.NEVER
  }
  return url.origin
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Loopback by default so a dev server is not exposed to the LAN; the Docker image sets 0.0.0.0.
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: intFromEnv(0, 65_535).default(4000),
  CORS_ORIGINS: z
    .string()
    .default(DEFAULT_CORS_ORIGINS)
    .transform((raw) => raw.split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().transform(normaliseOrigin))),
  TRUST_PROXY: intFromEnv(0, 10).default(0),
  EXPOSE_ERROR_DETAILS: z.stringbool().default(false),
  AI_CLASSIFIER_URL: z
    .union([
      z.literal('off'),
      z.url({ protocol: /^https?$/ }).transform((u) => u.replace(/\/+$/, '')),
    ])
    .optional(),
  RATE_LIMIT_MAX: intFromEnv(1, 100_000).default(300),
  CLASSIFY_RATE_LIMIT_MAX: intFromEnv(1, 10_000).default(30),
  WS_MAX_CLIENTS: intFromEnv(1, 100_000).default(500),
  WS_MAX_CLIENTS_PER_IP: intFromEnv(1, 100_000).default(10),
})

/**
 * `off` disables the model. Unset means the local classifier outside production (so a
 * fresh clone without a .env file still reaches it) and keyword fallback only in production.
 */
function classifierUrl(value: string | undefined, nodeEnv: AppConfig['nodeEnv']): string | undefined {
  if (value === 'off') return undefined
  return value ?? (nodeEnv === 'production' ? undefined : DEV_CLASSIFIER_URL)
}

/**
 * Validates environment variables and builds the app configuration.
 * Empty strings are treated as unset so `KEY=` in a .env file falls back to the default.
 */
export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ''))
  const result = envSchema.safeParse(cleaned)
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`)
    throw new ConfigError(`Invalid environment configuration:\n${lines.join('\n')}`)
  }
  const e = result.data
  return {
    nodeEnv: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    corsOrigins: [...new Set(e.CORS_ORIGINS)],
    trustProxy: e.TRUST_PROXY,
    exposeErrorDetails: e.EXPOSE_ERROR_DETAILS,
    logging: e.NODE_ENV !== 'test',
    classifier: { url: classifierUrl(e.AI_CLASSIFIER_URL, e.NODE_ENV), timeoutMs: 2500 },
    rateLimit: { windowMs: 15 * 60_000, max: e.RATE_LIMIT_MAX },
    classifyRateLimit: { windowMs: 60_000, max: e.CLASSIFY_RATE_LIMIT_MAX },
    ws: {
      maxClients: e.WS_MAX_CLIENTS,
      maxClientsPerIp: e.WS_MAX_CLIENTS_PER_IP,
      maxPayloadBytes: 1024,
      heartbeatMs: 30_000,
    },
  }
}

/**
 * Loads `.env` from the working directory (if present, without overriding variables
 * that are already set) and then validates the environment. Nothing in the app reads
 * `process.env` at import time, so there is no ordering hazard.
 */
export function loadConfig(envFile = resolve(process.cwd(), '.env')): AppConfig {
  if (existsSync(envFile) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envFile)
  }
  return parseConfig(process.env)
}
