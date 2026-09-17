import { z } from 'zod'
import { classifyByKeywords, type ClassificationResult } from '@shared/classify'
import { ACTIVITY_TYPES, type ActivityTypeId } from '@shared/programs'
import type { Logger } from '../logger'

export const MAX_RESPONSE_BYTES = 64 * 1024

const activityTypeIds = ACTIVITY_TYPES.map((t) => t.id) as [ActivityTypeId, ...ActivityTypeId[]]
const probability = z.number().min(0).max(1)

const modelResponseSchema = z.object({
  activity_type: z.enum(activityTypeIds),
  confidence: probability,
  scores: z.object(Object.fromEntries(activityTypeIds.map((id) => [id, probability])) as Record<ActivityTypeId, typeof probability>),
  model_version: z.string().min(1).max(100),
  source: z.literal('model'),
})

export interface ClassifierOptions {
  /** Base URL of the classifier service; when undefined the keyword fallback is used. */
  url: string | undefined
  timeoutMs: number
  logger: Logger
  fetch?: typeof fetch
}

export type Classify = (text: string) => Promise<ClassificationResult>

/** Releases a response body we will not read; errors are irrelevant at that point. */
async function discard(res: Response): Promise<void> {
  await res.body?.cancel().catch(() => undefined)
}

/**
 * Reads a response body as UTF-8, refusing to buffer more than `maxBytes`: a declared
 * Content-Length over the cap is rejected before reading, and a streamed body is
 * cancelled (closing the connection) as soon as the cap is exceeded.
 */
export async function readBodyCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > maxBytes) {
    await discard(res)
    throw new Error(`classifier response too large (content-length ${String(declared)})`)
  }
  if (!res.body) return ''
  // fetch bodies are byte streams; the global typings leave the chunk type as `any`.
  const reader = res.body.getReader() as ReadableStreamDefaultReader<Uint8Array>
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new Error(`classifier response exceeded ${String(maxBytes)} bytes`)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Forwards text to the Python model service and validates its answer. Any failure
 * (not configured, unreachable, timeout, non-2xx, oversized or malformed response)
 * degrades to the shared keyword classifier, which labels itself `keyword-fallback`.
 */
export function createClassifier({ url, timeoutMs, logger, fetch: fetchImpl = fetch }: ClassifierOptions): Classify {
  return async (text) => {
    if (!url) return classifyByKeywords(text)
    try {
      const res = await fetchImpl(`${url}/classify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ text }),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) {
        await discard(res)
        throw new Error(`classifier responded with HTTP ${String(res.status)}`)
      }
      const raw = await readBodyCapped(res, MAX_RESPONSE_BYTES)
      const parsed = modelResponseSchema.safeParse(JSON.parse(raw))
      if (!parsed.success) throw new Error('classifier response failed validation')
      const { activity_type, confidence, scores, model_version } = parsed.data
      return { activity_type, confidence, scores, model_version, source: 'model' }
    } catch (err) {
      logger.warn('classifier unavailable, using keyword fallback', {
        reason: err instanceof Error ? err.message : String(err),
      })
      return classifyByKeywords(text)
    }
  }
}
