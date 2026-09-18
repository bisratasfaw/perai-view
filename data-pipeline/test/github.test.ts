import { describe, expect, it } from 'vitest'
import { developerCitiesSchema } from '@shared/realData'
import { buildDeveloperCities, type RepoForks } from '../src/sources/github'

const repos: RepoForks[] = [
  {
    full_name: 'openai/openai-python',
    assistant: 'chatgpt',
    forks_total: 5000,
    forks_seen: 10,
    locations: ['San Francisco, CA', 'NYC', 'Bengaluru', 'Remote', 'Mountain View, CA', 'Berlin', 'Earth', 'Tokyo'],
  },
  {
    full_name: 'anthropics/anthropic-sdk-python',
    assistant: 'claude',
    forks_total: 800,
    forks_seen: 4,
    locations: ['San Francisco', 'Berlin, Germany', 'Paris, TX', 'London'],
  },
]

describe('buildDeveloperCities', () => {
  const data = buildDeveloperCities(repos, '2026-09-17')

  it('aggregates fork owners by city and country with per-assistant counts', () => {
    expect(data.cities.map((c) => [c.name, c.cc, c.total])).toEqual([
      ['Berlin', 'DE', 2],
      ['San Francisco', 'US', 2],
      ['Bangalore', 'IN', 1],
      ['London', 'GB', 1],
      ['New York', 'US', 1],
      ['Tokyo', 'JP', 1],
    ])
    expect(data.cities.find((c) => c.name === 'San Francisco')?.counts).toEqual({ chatgpt: 1, claude: 1 })
    expect(data.countries.find((c) => c.cc === 'US')).toMatchObject({ total: 5, counts: { chatgpt: 3, claude: 2 } })
    expect(data.countries.map((c) => c.cc)).toEqual(['US', 'DE', 'GB', 'IN', 'JP'])
  })

  it('reports match rates over owners with a location', () => {
    // 12 locations: 8 city matches, 10 country matches (Remote and Earth unmatched).
    expect(data.geocoding.matched_city_pct).toBe(66.7)
    expect(data.geocoding.matched_country_pct).toBe(83.3)
  })

  it('describes repositories with vendor labels from the program registry', () => {
    expect(data.repos[0]).toEqual({ full_name: 'openai/openai-python', assistant: 'chatgpt', vendor: 'OpenAI', forks_total: 5000, forks_seen: 10, with_location: 8 })
    expect(data.repos[1]?.vendor).toBe('Anthropic')
  })

  it('validates once there are enough cities', () => {
    const many: RepoForks[] = [
      {
        full_name: 'openai/openai-node',
        assistant: 'chatgpt',
        forks_total: 11,
        forks_seen: 11,
        locations: ['Seattle', 'Austin', 'Boston', 'Chicago', 'Sydney', 'Lagos', 'Nairobi', 'Madrid', 'Rome', 'Oslo', 'Lima'],
      },
    ]
    expect(developerCitiesSchema.safeParse(buildDeveloperCities(many, '2026-09-17')).success).toBe(true)
  })
})
