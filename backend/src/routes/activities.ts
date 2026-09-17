import { Router } from 'express'
import { z } from 'zod'
import { PROGRAM_IDS } from '@shared/programs'
import { HttpError, parseInput } from '../errors'
import type { ActivityFeed } from '../services/activityFeed'

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  program: z.enum(PROGRAM_IDS).optional(),
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/, 'Expected an ISO 3166-1 alpha-2 country code')
    .transform((code) => code.toUpperCase())
    .optional(),
})

export function activitiesRouter(feed: ActivityFeed): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const { limit, program, country } = parseInput(listQuery, req.query, 'query parameters')
    res.set('Cache-Control', 'no-store').json(feed.list(limit, { program, country }))
  })

  router.get('/:id', (req, res) => {
    const activity = feed.get(req.params.id)
    if (!activity) throw new HttpError('not_found', 'Activity not found (only the most recent events are kept)')
    res.json(activity)
  })

  return router
}
