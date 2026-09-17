import { classifyByKeywords } from '@shared/classify'
import {
  EVENT_INTERVAL_MS,
  cityIntensities,
  computeGlobalStats,
  computeRegionalStats,
  computeTrends,
  createRng,
  generateActivity,
} from '@shared/simulation'
import type { DataSource } from './types'

/**
 * Runs the shared simulation in the browser. This is what the static demo uses,
 * so the site needs no server at all.
 */
export function createLocalSource(now: () => number = Date.now): DataSource {
  const rng = createRng(now() % 2_147_483_647)

  return {
    kind: 'local',
    getGlobalStats: async () => computeGlobalStats(now()),
    getTrends: async (hours) => computeTrends(now(), hours),
    getRegional: async (city) => computeRegionalStats(city, now()),
    getCityIntensities: async () => cityIntensities(now()).map(({ city, intensity }) => ({ city: city.name, intensity })),
    classify: async (text) => classifyByKeywords(text),

    subscribe({ onActivity, onState }) {
      let timer: ReturnType<typeof setTimeout> | undefined
      let stopped = false

      // A short backlog so the feed isn't empty on first paint.
      for (let i = 4; i >= 0; i--) onActivity(generateActivity(rng, now() - i * 900))
      onState('live')

      const schedule = () => {
        // Jitter the interval so events don't arrive like a metronome.
        const delay = EVENT_INTERVAL_MS * (0.55 + rng() * 0.9)
        timer = setTimeout(() => {
          if (stopped) return
          onActivity(generateActivity(rng, now()))
          schedule()
        }, delay)
      }
      schedule()

      return () => {
        stopped = true
        if (timer) clearTimeout(timer)
      }
    },
  }
}
