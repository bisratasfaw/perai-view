/** Imperative handle to the globe for UI controls outside the globe component. */
export interface GlobeController {
  zoomIn: () => void
  zoomOut: () => void
  resetView: () => void
}

const noop = () => {}

export const globeController: GlobeController = { zoomIn: noop, zoomOut: noop, resetView: noop }

export function bindGlobeController(next: GlobeController | null): void {
  globeController.zoomIn = next?.zoomIn ?? noop
  globeController.zoomOut = next?.zoomOut ?? noop
  globeController.resetView = next?.resetView ?? noop
}
