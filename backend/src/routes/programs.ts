import { Router } from 'express'
import { PROGRAMS, getProgram } from '@shared/programs'
import { HttpError } from '../errors'

export function programsRouter(): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json({ data: PROGRAMS })
  })

  router.get('/:id', (req, res) => {
    const program = getProgram(req.params.id)
    if (!program) throw new HttpError('not_found', 'Program not found')
    res.json(program)
  })

  return router
}
