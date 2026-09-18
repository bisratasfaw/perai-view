import { type Logger } from './lib/log'
import { type StateStore } from './lib/state'

export interface PipelineContext {
  /** Wall clock for the run; injectable so tests and re-runs are deterministic. */
  now: Date
  /** Absolute path of data/real. */
  dataDir: string
  /** Ignore the cached Hugging Face object id and per-day sums and fetch everything again. */
  force: boolean
  state: StateStore
  log: Logger
  env: Readonly<Record<string, string | undefined>>
}
