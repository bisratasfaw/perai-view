import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'

/**
 * Iterates a byte stream line by line without buffering the whole body, so a 200 MB CSV
 * costs a few kilobytes of memory. Accepts a fetch body (web stream) or a Node readable.
 */
export function linesOf(input: Readable | ReadableStream<Uint8Array>): AsyncIterable<string> {
  const readable = input instanceof Readable ? input : Readable.fromWeb(input)
  readable.setEncoding('utf8')
  return createInterface({ input: readable, crlfDelay: Infinity })
}

/** Lines of an in-memory string; handy for fixtures and tests. */
export function linesOfString(text: string): Iterable<string> {
  return text.split(/\r?\n/)
}
