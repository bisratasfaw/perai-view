/**
 * Registry of the AI assistants that appear in the simulation.
 *
 * Shares and activity mixes are illustrative, not measured market data.
 * Map colours: only three assistants get their own hue. Eight hues cannot stay
 * distinguishable on a map for colour-blind viewers, so everything else
 * shares a neutral "Other" colour. Validated as a set on the dark globe surface (#0a111b), all
 * pairs, OKLab ΔE×100: protan/deutan ≥ 9.4, normal vision ≥ 20.9, contrast ≥ 3:1. Tritanopia is
 * the weak case (ChatGPT vs Claude ≈ 4.0), so assistant names are always shown as text too.
 */

export const ACTIVITY_TYPES = [
  { id: 'conversation', label: 'Conversation' },
  { id: 'writing', label: 'Writing' },
  { id: 'coding', label: 'Coding' },
  { id: 'image_generation', label: 'Image generation' },
  { id: 'summarization', label: 'Summarization' },
  { id: 'translation', label: 'Translation' },
  { id: 'research', label: 'Research' },
] as const

export type ActivityTypeId = (typeof ACTIVITY_TYPES)[number]['id']

export const PROGRAM_IDS = [
  'chatgpt', 'gemini', 'claude', 'copilot', 'midjourney', 'mistral', 'llama', 'perplexity', 'other',
] as const

export type ProgramId = (typeof PROGRAM_IDS)[number]

export interface AiProgram {
  id: ProgramId
  name: string
  provider: string
  /** Short vendor label for sources about SDKs or companies rather than the product itself. */
  vendor: string
  /** Relative share of simulated global activity. */
  share: number
  /** Colour used on the globe, legend and panel. */
  color: string
  /** True for the three assistants with their own map hue. */
  highlighted: boolean
  /** Relative weights of activity types for this assistant. */
  activityMix: Partial<Record<ActivityTypeId, number>>
}

export const MAP_COLORS = {
  chatgpt: '#199e70',
  gemini: '#3987e5',
  claude: '#d95926',
  other: '#b8c0ca',
} as const

export const PROGRAMS: readonly AiProgram[] = [
  {
    id: 'chatgpt', name: 'ChatGPT', provider: 'OpenAI', vendor: 'OpenAI', share: 32, color: MAP_COLORS.chatgpt, highlighted: true,
    activityMix: { conversation: 26, writing: 22, coding: 16, summarization: 12, research: 10, image_generation: 8, translation: 6 },
  },
  {
    id: 'gemini', name: 'Gemini', provider: 'Google', vendor: 'Google', share: 17, color: MAP_COLORS.gemini, highlighted: true,
    activityMix: { conversation: 24, research: 20, writing: 18, summarization: 14, coding: 12, translation: 8, image_generation: 4 },
  },
  {
    id: 'claude', name: 'Claude', provider: 'Anthropic', vendor: 'Anthropic', share: 15, color: MAP_COLORS.claude, highlighted: true,
    activityMix: { coding: 28, writing: 24, conversation: 18, summarization: 16, research: 10, translation: 4 },
  },
  {
    id: 'copilot', name: 'GitHub Copilot', provider: 'GitHub', vendor: 'GitHub', share: 12, color: MAP_COLORS.other, highlighted: false,
    activityMix: { coding: 90, conversation: 10 },
  },
  {
    id: 'midjourney', name: 'Midjourney', provider: 'Midjourney', vendor: 'Midjourney', share: 6, color: MAP_COLORS.other, highlighted: false,
    activityMix: { image_generation: 100 },
  },
  {
    id: 'mistral', name: 'Mistral', provider: 'Mistral AI', vendor: 'Mistral AI', share: 5, color: MAP_COLORS.other, highlighted: false,
    activityMix: { conversation: 30, coding: 25, writing: 20, translation: 15, summarization: 10 },
  },
  {
    id: 'llama', name: 'Llama', provider: 'Meta', vendor: 'Meta', share: 5, color: MAP_COLORS.other, highlighted: false,
    activityMix: { conversation: 35, writing: 20, coding: 20, summarization: 15, translation: 10 },
  },
  {
    id: 'perplexity', name: 'Perplexity', provider: 'Perplexity', vendor: 'Perplexity', share: 4, color: MAP_COLORS.other, highlighted: false,
    activityMix: { research: 80, summarization: 20 },
  },
  {
    id: 'other', name: 'Other / regional', provider: 'Various', vendor: 'Other', share: 4, color: MAP_COLORS.other, highlighted: false,
    activityMix: { conversation: 30, writing: 20, coding: 20, translation: 15, research: 15 },
  },
]

const PROGRAM_BY_ID = new Map(PROGRAMS.map((p) => [p.id, p]))

export function getProgram(id: string): AiProgram | undefined {
  return PROGRAM_BY_ID.get(id as ProgramId)
}

export function activityTypeLabel(id: string): string {
  return ACTIVITY_TYPES.find((t) => t.id === id)?.label ?? id
}

/** Legend entries for the map: the three highlighted assistants, then Other. */
export const MAP_LEGEND = [
  { key: 'chatgpt', label: 'ChatGPT', color: MAP_COLORS.chatgpt },
  { key: 'gemini', label: 'Gemini', color: MAP_COLORS.gemini },
  { key: 'claude', label: 'Claude', color: MAP_COLORS.claude },
  { key: 'other', label: 'Other assistants', color: MAP_COLORS.other },
] as const
