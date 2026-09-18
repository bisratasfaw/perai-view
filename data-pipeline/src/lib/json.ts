import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Recursively sorts object keys so diffs of generated files stay readable. Arrays keep their order. */
export function sortKeysDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => sortKeysDeep(item)) as T
  if (!isPlainObject(value)) return value
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) sorted[key] = sortKeysDeep(value[key])
  return sorted as T
}

export function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** Writes to a temp file in the same directory and renames it over the target, so readers never see a torn file. */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${String(process.pid)}.tmp`
  await writeFile(tmp, toJson(value), 'utf8')
  await rename(tmp, path)
}

/** Parsed JSON, or undefined when the file does not exist. Malformed JSON throws. */
export async function readJsonFile(path: string): Promise<unknown> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  return JSON.parse(text) as unknown
}
