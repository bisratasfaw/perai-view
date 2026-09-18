import { type ZodType } from 'zod'
import { readJsonFile, sortKeysDeep, writeJsonAtomic } from './json'

export const STATE_FILE = '.pipeline-state.json'

interface StateFile {
  schema_version: 1
  updated_at: string | null
  sources: Record<string, unknown>
}

/**
 * Non-schema cache written next to the snapshots: Hugging Face object ids, per-day sums, last processed dates.
 * Each source reads its own slice through a zod schema, so a corrupt or outdated entry is
 * simply ignored and rebuilt rather than crashing the run.
 */
export class StateStore {
  private constructor(
    private readonly path: string,
    private readonly file: StateFile,
  ) {}

  static async load(path: string): Promise<StateStore> {
    let file: StateFile = { schema_version: 1, updated_at: null, sources: {} }
    try {
      const raw = await readJsonFile(path)
      if (typeof raw === 'object' && raw !== null && 'sources' in raw) {
        const { sources } = raw
        if (typeof sources === 'object' && sources !== null) {
          file = { ...file, sources: sources as Record<string, unknown> }
        }
      }
    } catch {
      // Unreadable state is treated as empty; every cache here can be rebuilt.
    }
    return new StateStore(path, file)
  }

  get<T>(key: string, schema: ZodType<T>): T | undefined {
    const parsed = schema.safeParse(this.file.sources[key])
    return parsed.success ? parsed.data : undefined
  }

  set(key: string, value: unknown): void {
    this.file.sources[key] = value
  }

  delete(key: string): void {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.file.sources[key]
  }

  async save(now: Date): Promise<void> {
    this.file.updated_at = now.toISOString()
    await writeJsonAtomic(this.path, sortKeysDeep(this.file))
  }
}
