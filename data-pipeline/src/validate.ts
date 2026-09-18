/**
 * `npm run validate`: parses every snapshot in data/real against the shared schemas.
 * Exit code 1 when any file is missing or invalid, so CI and the nightly workflow refuse
 * to publish a broken snapshot set.
 */
import { REAL_DATA_FILES, REAL_DATA_SCHEMAS, type RealDataKey } from '@shared/realData'
import { join } from 'node:path'
import { z } from 'zod'
import { readJsonFile } from './lib/json'
import { DEFAULT_DATA_DIR } from './paths'

export interface ValidationIssue {
  file: string
  message: string
}

export async function validateDataDir(dataDir: string): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  for (const key of Object.keys(REAL_DATA_FILES) as RealDataKey[]) {
    const file = REAL_DATA_FILES[key]
    const path = join(dataDir, file)
    let raw: unknown
    try {
      raw = await readJsonFile(path)
    } catch (error) {
      issues.push({ file, message: `unreadable: ${error instanceof Error ? error.message : String(error)}` })
      continue
    }
    if (raw === undefined) {
      issues.push({ file, message: 'missing' })
      continue
    }
    const result = REAL_DATA_SCHEMAS[key].safeParse(raw)
    if (!result.success) {
      issues.push({ file, message: z.prettifyError(result.error) })
    }
  }
  return issues
}

async function main(): Promise<void> {
  const dataDir = process.argv[2] ?? DEFAULT_DATA_DIR
  const issues = await validateDataDir(dataDir)
  const files = Object.values(REAL_DATA_FILES)
  if (issues.length === 0) {
    process.stdout.write(`OK: ${files.length} files in ${dataDir} match the schemas\n`)
    return
  }
  for (const issue of issues) process.stderr.write(`FAIL ${issue.file}: ${issue.message}\n`)
  process.exitCode = 1
}

if (process.argv[1] && /validate\.[cm]?[jt]s$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
