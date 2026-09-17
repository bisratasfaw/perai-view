import type { ErrorRequestHandler, RequestHandler } from 'express'
import type { AppConfig } from '../config'
import { HttpError, sendError } from '../errors'
import type { Logger } from '../logger'

/** Shape of errors raised by Express' body parser (http-errors). */
interface BodyParserError {
  type: string
  status: number
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return (
    typeof err === 'object' && err !== null &&
    typeof (err as Partial<BodyParserError>).type === 'string' &&
    typeof (err as Partial<BodyParserError>).status === 'number'
  )
}

export const notFound: RequestHandler = (_req, res) => {
  sendError(res, 'not_found', 'Route not found')
}

/**
 * Converts every error into the JSON error envelope. Internal details (stack traces)
 * are only included when running in development with EXPOSE_ERROR_DETAILS=true.
 */
export function errorHandler(config: AppConfig, logger: Logger): ErrorRequestHandler {
  const exposeDetails = config.nodeEnv === 'development' && config.exposeErrorDetails

  return (err: unknown, req, res, next) => {
    if (res.headersSent) {
      next(err)
      return
    }
    if (err instanceof HttpError) {
      sendError(res, err.code, err.message, err.details)
      return
    }
    if (isBodyParserError(err)) {
      if (err.type === 'entity.parse.failed') {
        sendError(res, 'bad_request', 'Malformed JSON body')
        return
      }
      if (err.type === 'entity.too.large') {
        sendError(res, 'payload_too_large', 'Request body exceeds the 16 KB limit')
        return
      }
      if (err.status >= 400 && err.status < 500) {
        sendError(res, 'bad_request', 'Unreadable request body')
        return
      }
    }

    logger.error('unhandled error', {
      method: req.method,
      path: req.path,
      error: err instanceof Error ? err.message : String(err),
    })
    const details = exposeDetails && err instanceof Error ? { stack: err.stack } : undefined
    sendError(res, 'internal', 'Internal server error', details)
  }
}
