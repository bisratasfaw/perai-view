import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const here = fileURLToPath(new URL('.', import.meta.url))

/** data/real at the repository root, independent of the current working directory. */
export const DEFAULT_DATA_DIR = resolve(here, '..', '..', 'data', 'real')
