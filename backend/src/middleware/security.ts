import cors from 'cors'
import type { RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import type { RateLimitConfig } from '../config'
import { sendError } from '../errors'
import type { OriginPolicy } from '../origins'

/** Helmet tuned for a JSON-only API: nothing may be framed, embedded or executed. */
export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  })
}

export function corsPolicy(origins: OriginPolicy): RequestHandler {
  return cors({
    origin: (origin, callback) => {
      callback(null, origins.isAllowed(origin))
    },
    methods: ['GET', 'HEAD', 'POST'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: ['RateLimit', 'RateLimit-Policy', 'Retry-After'],
    maxAge: 600,
  })
}

export function limiter(name: string, { windowMs, max }: RateLimitConfig, skip?: (path: string) => boolean): RequestHandler {
  return rateLimit({
    windowMs,
    limit: max,
    identifier: name,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: skip ? (req) => skip(req.path) : undefined,
    handler: (_req, res) => {
      sendError(res, 'rate_limited', 'Too many requests, please slow down and try again later')
    },
  })
}
