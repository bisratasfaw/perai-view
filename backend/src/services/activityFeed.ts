import { randomInt } from 'node:crypto'
import { EVENT_INTERVAL_MS, createRng, generateActivity, type Activity, type Rng } from '@shared/simulation'

export interface ActivityFeedOptions {
  /** How many recent events to keep in memory. */
  capacity?: number
  intervalMs?: number
  rng?: Rng
  now?: () => number
}

export interface ActivityFilter {
  program?: string
  country?: string
}

export type ActivityListener = (activity: Activity) => void

/**
 * The single source of live simulated events. A fixed-size ring buffer holds the
 * latest events for the REST API; subscribers (the WebSocket hub) receive each new
 * event as it is generated. One timer feeds everything, regardless of client count.
 */
export class ActivityFeed {
  readonly capacity: number
  readonly intervalMs: number
  private readonly rng: Rng
  private readonly now: () => number
  private readonly buffer: (Activity | undefined)[]
  /** Index where the next event is written. */
  private head = 0
  private size = 0
  private readonly listeners = new Set<ActivityListener>()
  private timer: NodeJS.Timeout | undefined

  constructor(options: ActivityFeedOptions = {}) {
    this.capacity = options.capacity ?? 200
    this.intervalMs = options.intervalMs ?? EVENT_INTERVAL_MS
    this.rng = options.rng ?? createRng(randomInt(0, 2 ** 32))
    this.now = options.now ?? Date.now
    this.buffer = new Array<Activity | undefined>(this.capacity)
  }

  get count(): number {
    return this.size
  }

  /** Fills the buffer with `count` events spaced one interval apart, ending now. */
  seed(count: number): void {
    const end = this.now()
    for (let i = count - 1; i >= 0; i--) {
      this.push(generateActivity(this.rng, end - i * this.intervalMs))
    }
  }

  /** Generates one event, stores it and notifies subscribers. */
  tick(): Activity {
    const activity = generateActivity(this.rng, this.now())
    this.push(activity)
    for (const listener of this.listeners) listener(activity)
    return activity
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), this.intervalMs)
    this.timer.unref()
  }

  stop(): void {
    clearInterval(this.timer)
    this.timer = undefined
  }

  subscribe(listener: ActivityListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Buffered events, newest first. */
  newestFirst(): Activity[] {
    const out: Activity[] = []
    for (let i = 1; i <= this.size; i++) {
      const activity = this.buffer[(this.head - i + this.capacity) % this.capacity]
      if (activity) out.push(activity)
    }
    return out
  }

  /** The `n` most recent events, oldest first (replay order for new subscribers). */
  latest(n: number): Activity[] {
    return this.newestFirst().slice(0, Math.max(0, n)).reverse()
  }

  list(limit: number, filter: ActivityFilter = {}): { data: Activity[]; total: number } {
    const matches = this.newestFirst().filter(
      (a) =>
        (filter.program === undefined || a.program_id === filter.program) &&
        (filter.country === undefined || a.country === filter.country),
    )
    return { data: matches.slice(0, limit), total: matches.length }
  }

  get(id: string): Activity | undefined {
    return this.newestFirst().find((a) => a.id === id)
  }

  private push(activity: Activity): void {
    this.buffer[this.head] = activity
    this.head = (this.head + 1) % this.capacity
    this.size = Math.min(this.size + 1, this.capacity)
  }
}
