import { describe, expect, it } from 'vitest'
import { geocodeLocation, normalizePlace } from '../src/lib/geocode'

function city(raw: string): string | undefined {
  const m = geocodeLocation(raw)
  return m.kind === 'city' ? `${m.city.name}|${m.cc}` : undefined
}

function country(raw: string): string | undefined {
  const m = geocodeLocation(raw)
  return m.kind === 'none' ? undefined : m.cc
}

describe('normalizePlace', () => {
  it('lowercases, strips diacritics and punctuation', () => {
    expect(normalizePlace('São Paulo, Brasil!')).toBe('sao paulo brasil')
    expect(normalizePlace('Zürich / Genève')).toBe('zurich geneve')
    expect(normalizePlace('U.S.A.')).toBe('u s a')
    expect(normalizePlace('Wrocław')).toBe('wroclaw')
  })
})

describe('geocodeLocation: cities on the globe', () => {
  it.each([
    ['Bengaluru, India', 'Bangalore|IN'],
    ['SF Bay Area', 'San Francisco|US'],
    ['Berlin/London', 'Berlin|DE'],
    ['NYC', 'New York|US'],
    ['New York, NY', 'New York|US'],
    ['Paris, France', 'Paris|FR'],
    ['São Paulo, Brasil', 'São Paulo|BR'],
    ['Sao Paulo', 'São Paulo|BR'],
    ['Bombay', 'Mumbai|IN'],
    ['Saigon', 'Ho Chi Minh City|VN'],
    ['Ho Chi Minh City, Vietnam', 'Ho Chi Minh City|VN'],
    ['Peking', 'Beijing|CN'],
    ['London, UK', 'London|GB'],
    ['Tokyo, Japan 🇯🇵', 'Tokyo|JP'],
    ['Shenzhen, Guangdong, China', 'Shenzhen|CN'],
    ['Toronto, ON', 'Toronto|CA'],
    ['Vancouver, BC', 'Vancouver|CA'],
    ['Montreal', 'Montréal|CA'],
    ['Zürich', 'Zurich|CH'],
    ['Milano, Italia', 'Milan|IT'],
    ['Kiev', 'Kyiv|UA'],
    ['Seoul, South Korea', 'Seoul|KR'],
    ['Hong Kong', 'Hong Kong|HK'],
    ['Dubai, UAE', 'Dubai|AE'],
    ['Ciudad de México', 'Mexico City|MX'],
    ['San José, Costa Rica', 'San José|CR'],
    ['San Jose', 'San Jose|US'],
    ['Atlanta, Georgia', 'Atlanta|US'],
    ['Singapore', 'Singapore|SG'],
    ['Gurgaon', 'New Delhi|IN'],
    ['Greater London', 'London|GB'],
    ['Istanbul, Türkiye', 'Istanbul|TR'],
    ['北京', 'Beijing|CN'],
    ['Москва', 'Moscow|RU'],
    ['Melbourne, VIC', 'Melbourne|AU'],
    ['living in Berlin', 'Berlin|DE'],
  ])('%s -> %s', (input, expected) => {
    expect(city(input)).toBe(expected)
  })
})

describe('geocodeLocation: country-only fallbacks', () => {
  it.each([
    ['Mountain View, CA', 'US'],
    ['Paris, TX', 'US'],
    ['Vancouver, WA', 'US'],
    ['London, Ontario', 'CA'],
    ['Washington, DC', 'US'],
    ['Cambridge, MA', 'US'],
    ['Cambridge, UK', 'GB'],
    ['United States', 'US'],
    ['USA', 'US'],
    ['U.S.A.', 'US'],
    ['UK', 'GB'],
    ['England', 'GB'],
    ['Deutschland', 'DE'],
    ['St. Petersburg, Russia', 'RU'],
    ['Kraków', 'PL'],
    ['Pune, Maharashtra', 'IN'],
    ['Tbilisi, Georgia', 'GE'],
    ['Georgia', 'US'],
    ['🇩🇪', 'DE'],
    ['Remote - Brazil', 'BR'],
    ['台灣', 'TW'],
    ['Genève', 'CH'],
    ['Kerala', 'IN'],
    ['JP', 'JP'],
  ])('%s -> %s', (input, expected) => {
    expect(country(input)).toBe(expected)
    expect(city(input)).toBeUndefined()
  })
})

describe('geocodeLocation: nothing to map', () => {
  it.each(['Remote', 'Earth', '127.0.0.1', 'The Internet', 'Somewhere in Europe', 'Worldwide', '', '   ', '🚀', 'Cambridge'])(
    '%s -> none',
    (input) => {
      expect(geocodeLocation(input)).toEqual({ kind: 'none' })
    },
  )
})
