import { type ActivityTypeSeries } from '@shared/realData'
import { type Source, type SourceResult } from './types'

/**
 * OpenAI published no dataset with "How People Use ChatGPT" (Chatterji, Cunningham, Deming,
 * Hitzig, Ong, Shan and Wadman, NBER Working Paper 34255, September 2025). The shares below are
 * transcribed from the discussion of Figure 7 in the paper's text and nothing else; the
 * remainder of the July 2025 mix is not stated as a single number, so it is derived as
 * 100% minus the five stated categories and labelled as such.
 */
const PAPER_URL = 'https://www.nber.org/papers/w34255'

const REMAINDER_LABEL = 'Self-expression, relationships and other'

export const OPENAI_SERIES: ActivityTypeSeries = {
  source: 'openai_usage_report',
  title: 'What people use ChatGPT for',
  subject: 'Consumer ChatGPT messages by conversation topic',
  as_of: 'July 2025',
  period: { start: '2024-05-15', end: '2025-06-26' },
  method: "Transcribed from the paper's text (Figure 7 discussion)",
  url: PAPER_URL,
  categories: [
    { label: 'Practical guidance', share: 0.29, note: '"roughly 29% of overall usage", constant over the period' },
    { label: 'Seeking information', share: 0.24, note: 'Grew from 14% (July 2024) to 24% (July 2025)' },
    { label: 'Writing', share: 0.24, note: 'Declined from 36% (July 2024) to 24% (July 2025)' },
    { label: 'Multimedia', share: 0.07, note: '"just over 7%", up from 2%; spike in April 2025 after image generation launched' },
    { label: 'Technical help', share: 0.05, note: '"around 5%", down from 12% (July 2024)' },
    {
      label: REMAINDER_LABEL,
      share: 0.11,
      note: 'Remainder: 100% minus the five stated categories (Self-Expression, Relationships and Personal Reflection, Other/Unknown)',
    },
  ],
  previous: {
    as_of: 'July 2024',
    categories: [
      { label: 'Practical guidance', share: 0.29 },
      { label: 'Writing', share: 0.36 },
      { label: 'Seeking information', share: 0.14 },
      { label: 'Technical help', share: 0.12 },
      { label: 'Multimedia', share: 0.02 },
      { label: REMAINDER_LABEL, share: 0.07 },
    ],
  },
}

export const openaiSource: Source = {
  meta: {
    id: 'openai_usage_report',
    key: 'openai',
    title: 'How People Use ChatGPT',
    publisher: 'OpenAI / NBER (Chatterji et al., Working Paper 34255)',
    url: PAPER_URL,
    license: 'Figures quoted from a published working paper; no dataset was released. Transcription, not redistribution.',
    description:
      'Share of consumer ChatGPT messages by conversation topic, July 2025 versus July 2024, from a sample of about one million de-identified consumer messages (May 2024 - June 2025).',
    staleAfterDays: null,
  },
  fetch(): Promise<SourceResult> {
    return Promise.resolve({
      file: null,
      data: null,
      series: [OPENAI_SERIES],
      as_of: OPENAI_SERIES.as_of,
      freshness_date: null,
      notes: [
        'Static transcription: no dataset exists, so this series changes only when the code is updated.',
        'Non-work messages: 53% (June 2024) -> 73% (June 2025).',
        'Intent overall: Asking 49% / Doing 40% / Expressing 11%.',
        'Sample: approximately 1.1 million sampled conversations, May 15, 2024 through June 26, 2025 (Figure 7 caption).',
      ],
    })
  },
}
