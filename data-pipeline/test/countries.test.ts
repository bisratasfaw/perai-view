import { describe, expect, it } from 'vitest'
import { countriesSchema } from '@shared/realData'
import { alpha3ToAlpha2, countryName } from '../src/lib/countries'
import { buildCountries } from '../src/sources/countries'

describe('alpha-3 to alpha-2 mapping', () => {
  it('maps ISO alpha-3 codes from the Economic Index to alpha-2', () => {
    expect(alpha3ToAlpha2('USA')).toBe('US')
    expect(alpha3ToAlpha2('DEU')).toBe('DE')
    expect(alpha3ToAlpha2('gbr')).toBe('GB')
    expect(alpha3ToAlpha2('KOR')).toBe('KR')
    expect(alpha3ToAlpha2('XKX')).toBeUndefined()
    expect(alpha3ToAlpha2('')).toBeUndefined()
  })

  it('names countries, falling back to the code', () => {
    expect(countryName('US')).toBe('United States')
    expect(countryName('XK')).toBe('Kosovo')
    expect(countryName('Z9')).toBe('Z9')
  })
})

describe('buildCountries', () => {
  const countries = buildCountries(new Date('2026-09-17T04:15:00Z'))

  it('matches the schema with at least 150 countries and zero-padded numeric ids', () => {
    expect(countriesSchema.safeParse(countries).success).toBe(true)
    expect(countries.countries.length).toBeGreaterThanOrEqual(150)
    expect(countries.countries.find((c) => c.cc === 'US')).toMatchObject({ ccn3: '840', name: 'United States' })
    expect(countries.countries.find((c) => c.cc === 'AF')?.ccn3).toBe('004')
    expect(countries.countries.some((c) => c.cc === 'XK')).toBe(false)
  })

  it('has unique codes sorted by cc', () => {
    const ccs = countries.countries.map((c) => c.cc)
    expect(new Set(ccs).size).toBe(ccs.length)
    expect([...ccs].sort((a, b) => a.localeCompare(b))).toEqual(ccs)
  })
})
