import countries from 'world-countries'
import worldCountriesPackage from 'world-countries/package.json' with { type: 'json' }

export interface CountryInfo {
  /** ISO 3166-1 alpha-2. */
  cc: string
  cca3: string
  /** ISO 3166-1 numeric, zero-padded; null where ISO assigns none (Kosovo). */
  ccn3: string | null
  name: string
  official: string
  altSpellings: string[]
  lat: number
  lng: number
}

export const WORLD_COUNTRIES_VERSION: string = worldCountriesPackage.version

export const ALL_COUNTRIES: readonly CountryInfo[] = countries.map((c) => ({
  cc: c.cca2,
  cca3: c.cca3,
  ccn3: /^\d{3}$/.test(c.ccn3) ? c.ccn3 : null,
  name: c.name.common,
  official: c.name.official,
  altSpellings: c.altSpellings,
  lat: c.latlng[0],
  lng: c.latlng[1],
}))

const BY_ALPHA2 = new Map(ALL_COUNTRIES.map((c) => [c.cc, c]))
const BY_ALPHA3 = new Map(ALL_COUNTRIES.map((c) => [c.cca3, c]))

export function countryByCc(cc: string): CountryInfo | undefined {
  return BY_ALPHA2.get(cc.toUpperCase())
}

export function alpha3ToAlpha2(alpha3: string): string | undefined {
  return BY_ALPHA3.get(alpha3.toUpperCase())?.cc
}

let displayNames: Intl.DisplayNames | null | undefined

/** English short name for an alpha-2 code: world-countries first, then Intl, then the code itself. */
export function countryName(cc: string): string {
  const known = countryByCc(cc)
  if (known) return known.name
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(['en'], { type: 'region' })
    } catch {
      displayNames = null
    }
  }
  try {
    return displayNames?.of(cc) ?? cc
  } catch {
    return cc
  }
}

export function isAlpha2(value: string): boolean {
  return /^[A-Z]{2}$/.test(value)
}
