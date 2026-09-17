/**
 * Keyword fallback for activity classification.
 *
 * The real classifier is the Python service in /ai-classifier (TF-IDF + logistic
 * regression). The backend uses this fallback only when that service is
 * unreachable, and always labels the result with its source.
 */
import { ACTIVITY_TYPES, type ActivityTypeId } from './programs'

export interface ClassificationResult {
  activity_type: ActivityTypeId
  confidence: number
  scores: Record<ActivityTypeId, number>
  model_version: string
  source: 'model' | 'keyword-fallback'
}

const KEYWORDS: Record<ActivityTypeId, string[]> = {
  conversation: ['hi', 'hello', 'how are you', 'chat', 'advice', 'what do you think', 'help me decide', 'talk'],
  writing: ['write', 'draft', 'essay', 'email', 'blog', 'story', 'poem', 'cover letter', 'rewrite', 'paragraph'],
  coding: ['code', 'function', 'bug', 'error', 'python', 'javascript', 'typescript', 'sql', 'api', 'refactor', 'compile', 'regex', 'stack trace'],
  image_generation: ['image', 'picture', 'photo', 'draw', 'illustration', 'logo', 'render', 'art', 'wallpaper'],
  summarization: ['summarize', 'summary', 'tl;dr', 'tldr', 'key points', 'shorten', 'condense', 'recap'],
  translation: ['translate', 'translation', 'in spanish', 'in french', 'in german', 'into english', 'in japanese', 'language'],
  research: ['research', 'sources', 'compare', 'what is', 'who is', 'why does', 'explain', 'find', 'latest', 'study'],
}

export function classifyByKeywords(text: string): ClassificationResult {
  const lower = ` ${text.toLowerCase()} `
  const raw = {} as Record<ActivityTypeId, number>
  let total = 0
  for (const { id } of ACTIVITY_TYPES) {
    const hits = KEYWORDS[id].filter((k) => lower.includes(k.length <= 3 ? ` ${k} ` : k)).length
    raw[id] = hits + 0.2
    total += raw[id]
  }
  const scores = {} as Record<ActivityTypeId, number>
  let best: ActivityTypeId = 'conversation'
  for (const { id } of ACTIVITY_TYPES) {
    scores[id] = Math.round((raw[id] / total) * 1000) / 1000
    if (scores[id] > scores[best]) best = id
  }
  return { activity_type: best, confidence: scores[best], scores, model_version: 'keywords-1', source: 'keyword-fallback' }
}
