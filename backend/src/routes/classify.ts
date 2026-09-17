import { Router } from 'express'
import { z } from 'zod'
import { parseInput } from '../errors'
import type { Classify } from '../services/classifier'

export const MAX_CLASSIFY_CHARS = 2000

const classifyBody = z.object({
  text: z.string().trim().min(1).max(MAX_CLASSIFY_CHARS),
})

export function classifyRouter(classify: Classify): Router {
  const router = Router()
  router.post('/', async (req, res) => {
    const { text } = parseInput(classifyBody, req.body, 'request body')
    res.json(await classify(text))
  })
  return router
}
