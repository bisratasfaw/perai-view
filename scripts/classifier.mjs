#!/usr/bin/env node
/**
 * Cross-platform helper for the Python classifier in ai-classifier/.
 *
 *   npm run classifier:setup   create ai-classifier/.venv and install requirements-dev.txt
 *   npm run classifier:dev     uvicorn with --reload on http://127.0.0.1:8000
 *   npm run classifier:test    pytest
 *   npm run classifier:lint    ruff check + ruff format --check
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cwd = join(dirname(fileURLToPath(import.meta.url)), '..', 'ai-classifier')
const isWindows = process.platform === 'win32'
const venvPython = isWindows ? join(cwd, '.venv', 'Scripts', 'python.exe') : join(cwd, '.venv', 'bin', 'python')

function fail(message) {
  console.error(`classifier: ${message}`)
  process.exit(1)
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.error) fail(result.error.message)
  if (result.status !== 0) process.exit(result.status ?? 1)
}

/** Finds a Python 3.11+ interpreter on PATH. */
function findSystemPython() {
  const candidates = isWindows ? [['py', ['-3']], ['python', []]] : [['python3', []], ['python', []]]
  for (const [command, prefix] of candidates) {
    const probe = spawnSync(command, [...prefix, '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], {
      encoding: 'utf8',
    })
    if (probe.status !== 0) continue
    const [major, minor] = probe.stdout.trim().split('.').map(Number)
    if (major === 3 && minor >= 11) return [command, prefix]
  }
  return fail('Python 3.11-3.13 was not found on PATH. Install it from https://www.python.org/downloads/')
}

function venv(args) {
  if (!existsSync(venvPython)) fail('no virtual environment yet. Run `npm run classifier:setup` first.')
  run(venvPython, args)
}

const task = process.argv[2]
switch (task) {
  case 'setup': {
    if (!existsSync(venvPython)) {
      const [command, prefix] = findSystemPython()
      run(command, [...prefix, '-m', 'venv', '.venv'])
    }
    venv(['-m', 'pip', 'install', '--disable-pip-version-check', '-r', 'requirements-dev.txt'])
    break
  }
  case 'dev':
    venv(['-m', 'uvicorn', 'app.main:app', '--reload', '--port', process.env.CLASSIFIER_PORT ?? '8000'])
    break
  case 'test':
    venv(['-m', 'pytest', '-q'])
    break
  case 'lint':
    venv(['-m', 'ruff', 'check', '.'])
    venv(['-m', 'ruff', 'format', '--check', '.'])
    break
  default:
    fail(`unknown task "${task ?? ''}". Use one of: setup, dev, test, lint.`)
}
