/**
 * One origin allow-list shared by CORS and the WebSocket upgrade check.
 * Requests without an Origin header (curl, server-side clients) are not browser
 * cross-origin requests; CORS simply adds no headers for them and the WebSocket
 * accepts them.
 */
export function createOriginPolicy(origins: readonly string[]) {
  const allowed = new Set(origins)
  return {
    /** True for an Origin header that is on the allow-list. */
    isAllowed: (origin: string | undefined): boolean => origin !== undefined && allowed.has(origin),
    /** True when a WebSocket upgrade may proceed (no Origin, or an allowed one). */
    allowsUpgrade: (origin: string | undefined): boolean => origin === undefined || allowed.has(origin),
  }
}

export type OriginPolicy = ReturnType<typeof createOriginPolicy>
