import { Router } from 'express'
import { z } from 'zod'
import { computeGlobalStats, computeHeatmap, computeRegionalStats, computeTrends } from '@shared/simulation'
import { HttpError, parseInput } from '../errors'

const trendsQuery = z.object({
  hours: z.coerce.number().int().min(1).max(72).default(24),
})

const regionalQuery = z.object({
  city: z.string().trim().min(1).max(100),
})

export function analyticsRouter(now: () => number): Router {
  const router = Router()

  router.get('/global', (_req, res) => {
    res.json(computeGlobalStats(now()))
  })

  router.get('/trends', (req, res) => {
    const { hours } = parseInput(trendsQuery, req.query, 'query parameters')
    res.json({ interval: 'hour', data: computeTrends(now(), hours) })
  })

  router.get('/regional', (req, res) => {
    const { city } = parseInput(regionalQuery, req.query, 'query parameters')
    const stats = computeRegionalStats(city, now())
    if (!stats) throw new HttpError('not_found', 'City not found in the simulation')
    res.json(stats)
  })

  router.get('/heatmap', (_req, res) => {
    res.json(computeHeatmap(now()))
  })

  return router
}
