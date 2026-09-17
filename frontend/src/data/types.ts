import type { ClassificationResult } from '@shared/classify'
import type { Activity, GlobalStats, RegionalStats, TrendPoint } from '@shared/simulation'

export type { Activity, ClassificationResult, GlobalStats, RegionalStats, TrendPoint }

export type SourceKind = 'local' | 'api'
export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline'

export interface CityIntensityValue {
  city: string
  intensity: number
}

export interface DataSource {
  readonly kind: SourceKind
  getGlobalStats(): Promise<GlobalStats>
  getTrends(hours: number): Promise<TrendPoint[]>
  getRegional(city: string): Promise<RegionalStats | null>
  /** Current activity level per city (0–1), used by the globe layers. */
  getCityIntensities(): Promise<CityIntensityValue[]>
  /** Classifies a prompt into an activity type (ML model via the API, keyword fallback locally). */
  classify(text: string): Promise<ClassificationResult>
  /** Streams live events. Returns an unsubscribe function. */
  subscribe(handlers: {
    onActivity: (activity: Activity) => void
    onState: (state: ConnectionState) => void
  }): () => void
}
