import type { Response } from 'express'
import type { z } from 'zod'

export type ErrorCode = 'bad_request' | 'not_found' | 'rate_limited' | 'internal' | 'payload_too_large'

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown }
}

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  payload_too_large: 413,
  rate_limited: 429,
  internal: 500,
}

/** An error that is safe to show to API clients. */
export class HttpError extends Error {
  override name = 'HttpError'
  readonly status: number

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.status = STATUS_BY_CODE[code]
  }
}

export function sendError(res: Response, code: ErrorCode, message: string, details?: unknown): void {
  const body: ErrorBody = { error: { code, message } }
  if (details !== undefined) body.error.details = details
  res.status(STATUS_BY_CODE[code]).json(body)
}

/** Parses untrusted input, throwing a 400 whose details list the zod issues. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  const issues = result.error.issues.map((issue) => ({
    path: issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p)),
    code: issue.code,
    message: issue.message,
  }))
  throw new HttpError('bad_request', `Invalid ${what}`, issues)
}
