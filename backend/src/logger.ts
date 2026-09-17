export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

type Level = keyof Logger

function write(level: Level, message: string, meta?: Record<string, unknown>): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...meta })
  if (level === 'info') process.stdout.write(`${line}\n`)
  else process.stderr.write(`${line}\n`)
}

/** Structured one-line JSON logs, or a no-op logger when logging is disabled (tests). */
export function createLogger(enabled: boolean): Logger {
  if (!enabled) {
    const noop = (): void => undefined
    return { info: noop, warn: noop, error: noop }
  }
  return {
    info: (message, meta) => { write('info', message, meta) },
    warn: (message, meta) => { write('warn', message, meta) },
    error: (message, meta) => { write('error', message, meta) },
  }
}
