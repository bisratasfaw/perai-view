/** Runs `fn` over `items` with at most `concurrency` in flight; results keep input order. */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index] as T, index)
    }
  })
  await Promise.all(workers)
  return results
}
