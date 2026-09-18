/** Minimal stderr logger so stdout stays free for machine-readable output. */
export interface Logger {
  info(message: string): void
  warn(message: string): void
  child(prefix: string): Logger
}

type Sink = (line: string) => void

const stderrSink: Sink = (line) => {
  process.stderr.write(`${line}\n`)
}

export function createLogger(prefix = '', sink: Sink = stderrSink): Logger {
  const tag = prefix ? `[${prefix}] ` : ''
  return {
    info(message) {
      sink(`${new Date().toISOString()} ${tag}${message}`)
    },
    warn(message) {
      sink(`${new Date().toISOString()} ${tag}WARN ${message}`)
    },
    child(childPrefix) {
      return createLogger(prefix ? `${prefix}:${childPrefix}` : childPrefix, sink)
    },
  }
}

export const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  child: () => silentLogger,
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : JSON.stringify(error)
}
