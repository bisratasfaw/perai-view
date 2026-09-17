import { Router } from 'express'
import { SIMULATION_VERSION } from '@shared/simulation'
import { APP_VERSION } from '../version'

export function healthRouter(): Router {
  const router = Router()
  router.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({
      status: 'ok',
      version: APP_VERSION,
      simulation_version: SIMULATION_VERSION,
      uptime_seconds: Math.floor(process.uptime()),
      simulated: true,
    })
  })
  return router
}
