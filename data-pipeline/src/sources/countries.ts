import { type Countries } from '@shared/realData'
import { ALL_COUNTRIES, WORLD_COUNTRIES_VERSION } from '../lib/countries'

/**
 * countries.json is derived from the world-countries npm package rather than fetched: it gives
 * the alpha-2 code every other file keys on, the ISO numeric id that world-atlas uses for the
 * choropleth outlines, and a centroid for labels. Kosovo has no ISO numeric code and is omitted.
 */
export function buildCountries(now: Date): Countries {
  return {
    generated_at: now.toISOString(),
    source: `world-countries@${WORLD_COUNTRIES_VERSION} (npm, mledoze/countries, ODbL 1.0); ccn3 matches world-atlas countries-110m feature ids`,
    countries: ALL_COUNTRIES.filter((c): c is typeof c & { ccn3: string } => c.ccn3 !== null)
      .map((c) => ({ cc: c.cc, name: c.name, ccn3: c.ccn3, lat: c.lat, lng: c.lng }))
      .sort((a, b) => a.cc.localeCompare(b.cc)),
  }
}
