/** RFC 4180 field splitting for one physical line (quotes, doubled quotes, embedded commas). */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i)
    if (quoted) {
      if (ch === '"') {
        if (line.charAt(i + 1) === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      fields.push(field)
      field = ''
    } else {
      field += ch
    }
  }
  fields.push(field)
  return fields
}

function hasOpenQuote(line: string): boolean {
  let quotes = 0
  for (const ch of line) if (ch === '"') quotes++
  return quotes % 2 === 1
}

export type CsvRecord = Record<string, string>

/**
 * Streams CSV records keyed by the header row. Quoted fields may span lines; empty lines are
 * skipped; a UTF-8 BOM on the header is ignored.
 */
export async function* csvRecords(lines: AsyncIterable<string> | Iterable<string>): AsyncGenerator<CsvRecord> {
  let header: string[] | undefined
  let pending = ''
  for await (const raw of lines) {
    const line = pending ? `${pending}\n${raw}` : raw
    if (hasOpenQuote(line)) {
      pending = line
      continue
    }
    pending = ''
    if (header === undefined) {
      const bom = line.charCodeAt(0) === 0xfeff
      header = parseCsvLine(bom ? line.slice(1) : line)
      continue
    }
    if (line === '') continue
    const values = parseCsvLine(line)
    const record: CsvRecord = {}
    header.forEach((name, i) => {
      record[name] = values[i] ?? ''
    })
    yield record
  }
}
