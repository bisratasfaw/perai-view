import {
  ArcType,
  BlendOption,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  Credit,
  DistanceDisplayCondition,
  GeometryInstance,
  HorizontalOrigin,
  ImageryLayer,
  LabelCollection,
  LabelStyle,
  Material,
  Math as CesiumMath,
  NearFarScalar,
  PerInstanceColorAppearance,
  PointPrimitiveCollection,
  PolygonGeometry,
  PolygonHierarchy,
  PolylineColorAppearance,
  PolylineGeometry,
  PolylineMaterialAppearance,
  Primitive,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  SingleTileImageryProvider,
  TileMapServiceImageryProvider,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
  buildModuleUrl,
  type PointPrimitive,
  type TileProviderError,
} from 'cesium'
import { CITIES, type City } from '@shared/cities'
import type { Activity } from '@shared/simulation'
import { feature } from 'topojson-client'
import { CHOROPLETH_NO_DATA, choroplethColor } from './choropleth'
import { hexToRgb, lighten, programMapColor, type Rgb } from './colors'
import { renderHeatCanvas } from './heatCanvas'

/** 'activity' and 'heat' draw the simulation; 'points' and 'countries' draw data passed in. */
export type GlobeLayer = 'activity' | 'heat' | 'points' | 'countries'

export interface CityPointDatum {
  key: string
  name: string
  lat: number
  lng: number
  /** 0-1, drives beam height and size. */
  intensity: number
  /** Hex colour. */
  color: string
}

export interface CountryValue {
  cc: string
  /** 0-1 normalised value that drives the colour. */
  value: number
}

export interface CountryRef {
  cc: string
  ccn3: string
  lat: number
  lng: number
}

export interface GlobePick {
  kind: 'city' | 'country'
  /** City key (name), or ISO alpha-2 country code. */
  name: string
}
export type GlobeThemeName = 'natural' | 'cyber'

export interface CityIntensity {
  city: string
  intensity: number
}

export interface GlobeEvents {
  onPick?: (pick: GlobePick | null) => void
  onHover?: (hover: (GlobePick & { x: number; y: number }) | null) => void
  onFirstTilesLoaded?: () => void
  onRenderError?: (message: string) => void
}

type CityPick = GlobePick

const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'
const BLUE_MARBLE_URL = `${GIBS}/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`
const BLACK_MARBLE_URL = `${GIBS}/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`

const EARTH_RADIUS = 6_371_000
const BEAM_BASE_HEIGHT = 8_000
const BEAM_MAX_HEIGHT = 720_000
const ROTATION_DEG_PER_SEC = 1.2
const RESUME_ROTATION_AFTER_MS = 7_000
const LABEL_COUNT = 30
const PULSE_COUNT = 10
const FLASH_MS = 2_200
const MAX_FLASHES = 24
const MIN_ZOOM_HEIGHT = 300_000
const LABEL_FONT = '600 13px "Manrope Variable", "Segoe UI", system-ui, sans-serif'

const CITY_BY_NAME = new Map(CITIES.map((c) => [c.name, c]))

function rgbColor([r, g, b]: Rgb, alpha = 1): Color {
  return new Color(r / 255, g / 255, b / 255, alpha)
}

function cityPick(name: string): CityPick {
  return { kind: 'city', name }
}

function countryPick(cc: string): GlobePick {
  return { kind: 'country', name: cc }
}

// Antarctica has no data and would dominate the choropleth on screen.
const SKIP_COUNTRY_IDS = new Set(['010'])
const CHOROPLETH_HEIGHT = 2_500

interface Flash {
  ring: PointPrimitive
  core: PointPrimitive
  ringColor: Color
  coreColor: Color
  start: number
}

interface Pulse {
  point: PointPrimitive
  color: Color
  baseSize: number
  phase: number
}

/**
 * Owns the Cesium viewer and every globe layer. React talks to it through a
 * small imperative API, so the render loop never depends on React re-renders.
 */
export class GlobeEngine {
  readonly viewer: Viewer
  private events: GlobeEvents
  private layer: GlobeLayer = 'activity'
  private theme: GlobeThemeName = 'natural'
  private intensities = new Map<string, number>()
  private pointData: CityPointDatum[] = []
  private countryValues = new Map<string, number>()
  private countryRefs = new Map<string, CountryRef>()
  private ccn3ToCc = new Map<string, string>()
  private topology: TopoJSON.Topology | null = null
  private choropleth: Primitive | null = null
  private countryOutline: Primitive | null = null
  private selectedCountry: string | null = null
  private reducedMotion = false
  private rotationWanted = true
  private lastInteraction = 0
  private lastTick = performance.now()
  private destroyed = false

  // Imagery
  private dayLayer: ImageryLayer | null = null
  private nightLayer: ImageryLayer | null = null
  private fallbackLayer: ImageryLayer | null = null
  private heatLayer: ImageryLayer | null = null
  private fadingHeatLayer: ImageryLayer | null = null
  private heatFadeStart = 0
  private tileErrors = 0

  // Primitives
  private borders: Primitive | null = null
  private bordersMaterial: Material | null = null
  private beams: Primitive | null = null
  private readonly cityPoints: PointPrimitiveCollection
  private readonly caps: PointPrimitiveCollection
  private readonly pulses: PointPrimitiveCollection
  private readonly flashPoints: PointPrimitiveCollection
  private readonly highlight: PointPrimitiveCollection
  private readonly labels: LabelCollection
  private pulseList: Pulse[] = []
  private flashes: Flash[] = []
  private selectedCity: string | null = null

  private readonly handler: ScreenSpaceEventHandler
  private hoverFrame = 0
  private firstTilesReported = false
  private readonly removeListeners: (() => void)[] = []

  private constructor(container: HTMLElement, events: GlobeEvents) {
    this.events = events
    this.viewer = new Viewer(container, {
      baseLayer: false,
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      vrButton: false,
      requestRenderMode: true,
      maximumRenderTimeChange: 30,
      msaaSamples: 1,
      showRenderLoopErrors: false,
      contextOptions: { webgl: { alpha: false, powerPreference: 'high-performance' } },
    })

    const { scene } = this.viewer
    scene.backgroundColor = Color.fromCssColorString('#03070d')
    scene.globe.baseColor = Color.fromCssColorString('#0b1a2b')
    scene.globe.maximumScreenSpaceError = 2
    scene.globe.tileCacheSize = 100
    scene.globe.preloadAncestors = true
    scene.globe.dynamicAtmosphereLighting = true
    scene.globe.dynamicAtmosphereLightingFromSun = true
    scene.fog.enabled = false
    scene.postProcessStages.fxaa.enabled = true
    if (scene.moon) scene.moon.show = false

    const camera = scene.screenSpaceCameraController
    camera.minimumZoomDistance = MIN_ZOOM_HEIGHT
    camera.maximumZoomDistance = 45_000_000
    camera.inertiaSpin = 0.85

    this.viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

    // Ordered bottom → top.
    this.pulses = scene.primitives.add(new PointPrimitiveCollection({ blendOption: BlendOption.TRANSLUCENT }))
    this.cityPoints = scene.primitives.add(new PointPrimitiveCollection())
    this.caps = scene.primitives.add(new PointPrimitiveCollection())
    this.flashPoints = scene.primitives.add(new PointPrimitiveCollection({ blendOption: BlendOption.TRANSLUCENT }))
    this.highlight = scene.primitives.add(new PointPrimitiveCollection({ blendOption: BlendOption.TRANSLUCENT }))
    this.labels = scene.primitives.add(new LabelCollection({ blendOption: BlendOption.TRANSLUCENT }))

    this.handler = new ScreenSpaceEventHandler(scene.canvas)
    this.installInput()
    this.installRenderLoopHooks()
    this.frameInitialView(false)
  }

  static async create(container: HTMLElement, events: GlobeEvents): Promise<GlobeEngine> {
    const engine = new GlobeEngine(container, events)
    engine.applyTheme()
    void engine.loadBorders()
    return engine
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  setEvents(events: GlobeEvents): void {
    this.events = events
  }

  setTheme(theme: GlobeThemeName): void {
    if (theme === this.theme) return
    this.theme = theme
    this.applyTheme()
  }

  setLayer(layer: GlobeLayer): void {
    if (layer === this.layer) return
    this.layer = layer
    this.applyTheme()
    this.rebuildData()
  }

  setIntensities(values: CityIntensity[]): void {
    this.intensities = new Map(values.map((v) => [v.city, v.intensity]))
    if (this.layer === 'activity' || this.layer === 'heat') this.rebuildData()
  }

  /** City points for the 'points' layer (real city-level data). */
  setCityPoints(points: CityPointDatum[]): void {
    this.pointData = points
    if (this.layer === 'points') this.rebuildData()
  }

  /** Country values for the 'countries' layer; needs setCountries() for the id mapping. */
  setCountryValues(values: CountryValue[]): void {
    this.countryValues = new Map(values.map((v) => [v.cc, v.value]))
    if (this.layer === 'countries') this.rebuildData()
  }

  setCountries(countries: CountryRef[]): void {
    this.countryRefs = new Map(countries.map((c) => [c.cc, c]))
    this.ccn3ToCc = new Map(countries.map((c) => [c.ccn3, c.cc]))
    if (this.layer === 'countries') this.rebuildData()
  }

  selectCountry(cc: string | null, fly = true): void {
    this.selectedCountry = cc
    this.buildCountryOutline()
    const ref = cc ? this.countryRefs.get(cc) : undefined
    if (ref && fly) {
      this.viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(ref.lng, ref.lat - 8, 9_000_000),
        orientation: { heading: 0, pitch: CesiumMath.toRadians(-84), roll: 0 },
        duration: this.reducedMotion ? 0 : 1.6,
      })
    }
    this.requestRender()
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced
    // Pulsing halos are decoration; hide them entirely rather than freezing them mid-pulse.
    this.pulses.show = !reduced
    this.requestRender()
  }

  setRotationWanted(wanted: boolean): void {
    this.rotationWanted = wanted
    if (wanted) this.lastInteraction = 0
    this.requestRender()
  }

  flash(activity: Activity): void {
    if (this.destroyed || document.hidden) return
    const color = hexToRgb(programMapColor(activity.program_id))
    const position = Cartesian3.fromDegrees(activity.longitude, activity.latitude, 12_000)
    const ringColor = rgbColor(lighten(color, 0.15), 0.85)
    const coreColor = rgbColor(lighten(color, 0.35), 1)
    const ring = this.flashPoints.add({
      position,
      pixelSize: 6,
      color: Color.TRANSPARENT,
      outlineColor: ringColor,
      outlineWidth: 2,
    })
    const core = this.flashPoints.add({
      position,
      pixelSize: 5,
      color: coreColor,
      outlineColor: new Color(0.01, 0.03, 0.05, 0.8),
      outlineWidth: 1,
    })
    this.flashes.push({ ring, core, ringColor, coreColor, start: performance.now() })
    while (this.flashes.length > MAX_FLASHES) this.removeFlash(this.flashes.shift()!)
    this.requestRender()
  }

  selectCity(name: string | null, fly = true): void {
    this.selectedCity = name
    this.highlight.removeAll()
    const city = name ? CITY_BY_NAME.get(name) : undefined
    if (city) {
      const position = Cartesian3.fromDegrees(city.lng, city.lat, BEAM_BASE_HEIGHT)
      this.highlight.add({ position, pixelSize: 26, color: new Color(1, 1, 1, 0.08), outlineColor: Color.WHITE, outlineWidth: 2 })
      if (fly) {
        const height = Math.min(Math.max(this.cameraHeight(), 3_500_000), 7_000_000)
        this.viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(city.lng, city.lat - 6, height),
          orientation: { heading: 0, pitch: CesiumMath.toRadians(-82), roll: 0 },
          duration: this.reducedMotion ? 0 : 1.6,
        })
      }
    }
    this.requestRender()
  }

  zoom(direction: 1 | -1): void {
    const height = this.cameraHeight()
    const amount = height * 0.4
    if (direction > 0) {
      const room = height - MIN_ZOOM_HEIGHT
      if (room <= 1_000) return
      this.viewer.camera.zoomIn(Math.min(amount, room))
    } else {
      this.viewer.camera.zoomOut(amount)
    }
    this.markInteraction()
    this.requestRender()
  }

  resetView(): void {
    this.frameInitialView(!this.reducedMotion)
    this.lastInteraction = 0
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.removeListeners.forEach((remove) => remove())
    this.handler.destroy()
    if (!this.viewer.isDestroyed()) this.viewer.destroy()
  }

  // ── Camera & motion ─────────────────────────────────────────────────────────

  private cameraHeight(): number {
    return this.viewer.camera.positionCartographic.height
  }

  /** Centres the sunlit (busiest) side of the planet and fits the globe to the viewport. */
  private frameInitialView(animate: boolean): void {
    const canvas = this.viewer.scene.canvas
    const width = canvas.clientWidth || window.innerWidth
    const height = canvas.clientHeight || window.innerHeight
    const aspect = width / Math.max(1, height)
    const fov = CesiumMath.toRadians(60)
    // Cesium applies `fov` to the wider axis; the narrower axis gets less.
    const smallerHalfFov = aspect >= 1 ? Math.atan(Math.tan(fov / 2) / aspect) : Math.atan(Math.tan(fov / 2) * aspect)
    // Leave room for the UI on wide screens; phones have less chrome around the globe.
    const fill = aspect >= 1 ? 0.78 : 0.9
    const distance = EARTH_RADIUS / Math.sin(smallerHalfFov * fill)
    const now = new Date()
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60
    const sunLng = ((((12 - utcHours) * 15 + 540) % 360) - 180) + 20
    const destination = Cartesian3.fromDegrees(sunLng, 18, distance - EARTH_RADIUS)
    const orientation = { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 }
    if (animate) this.viewer.camera.flyTo({ destination, orientation, duration: 1.4 })
    else this.viewer.camera.setView({ destination, orientation })
    this.requestRender()
  }

  private markInteraction(): void {
    this.lastInteraction = performance.now()
  }

  private shouldRotate(now: number): boolean {
    return (
      this.rotationWanted &&
      !this.reducedMotion &&
      !this.selectedCity &&
      !this.selectedCountry &&
      !document.hidden &&
      now - this.lastInteraction > RESUME_ROTATION_AFTER_MS
    )
  }

  private installRenderLoopHooks(): void {
    const { scene, clock } = this.viewer
    const onTick = () => {
      if (this.destroyed) return
      const now = performance.now()
      const dt = Math.min(0.1, (now - this.lastTick) / 1000)
      this.lastTick = now
      let animating = false

      if (this.shouldRotate(now)) {
        // Spin like the Earth does: the surface moves west → east.
        this.viewer.camera.rotate(Cartesian3.UNIT_Z, -CesiumMath.toRadians(ROTATION_DEG_PER_SEC) * dt)
        animating = true
      }
      if (this.flashes.length) {
        this.updateFlashes(now)
        animating = true
      }
      if (this.pulseList.length && !this.reducedMotion && this.layer === 'activity') {
        this.updatePulses(now)
        animating = true
      }
      if (this.fadingHeatLayer) {
        this.updateHeatFade(now)
        animating = true
      }
      if (animating) scene.requestRender()
    }
    clock.onTick.addEventListener(onTick)
    this.removeListeners.push(() => clock.onTick.removeEventListener(onTick))

    const onTileProgress = (queued: number) => {
      if (!this.firstTilesReported && queued === 0 && (this.dayLayer || this.nightLayer)) {
        this.firstTilesReported = true
        this.events.onFirstTilesLoaded?.()
      }
    }
    scene.globe.tileLoadProgressEvent.addEventListener(onTileProgress)
    this.removeListeners.push(() => scene.globe.tileLoadProgressEvent.removeEventListener(onTileProgress))

    const onRenderError = (_scene: unknown, error: unknown) => {
      this.events.onRenderError?.(error instanceof Error ? error.message : String(error))
    }
    scene.renderError.addEventListener(onRenderError)
    this.removeListeners.push(() => scene.renderError.removeEventListener(onRenderError))

    const canvas = scene.canvas
    const onContextLost = (event: Event) => {
      event.preventDefault()
      this.events.onRenderError?.('context-lost')
    }
    canvas.addEventListener('webglcontextlost', onContextLost)
    this.removeListeners.push(() => canvas.removeEventListener('webglcontextlost', onContextLost))

    const onVisibility = () => this.requestRender()
    document.addEventListener('visibilitychange', onVisibility)
    this.removeListeners.push(() => document.removeEventListener('visibilitychange', onVisibility))
  }

  private installInput(): void {
    const interact = () => this.markInteraction()
    for (const type of [
      ScreenSpaceEventType.LEFT_DOWN,
      ScreenSpaceEventType.RIGHT_DOWN,
      ScreenSpaceEventType.MIDDLE_DOWN,
      ScreenSpaceEventType.WHEEL,
      ScreenSpaceEventType.PINCH_START,
    ]) {
      this.handler.setInputAction(interact, type)
    }

    this.handler.setInputAction((event: { position: Cartesian2 }) => {
      this.events.onPick?.(this.pickAny(event.position))
    }, ScreenSpaceEventType.LEFT_CLICK)

    this.handler.setInputAction((event: { endPosition: Cartesian2 }) => {
      if (this.hoverFrame) return
      const position = Cartesian2.clone(event.endPosition)
      this.hoverFrame = requestAnimationFrame(() => {
        this.hoverFrame = 0
        if (this.destroyed) return
        const pick = this.pickAny(position)
        this.viewer.scene.canvas.style.cursor = pick ? 'pointer' : ''
        this.events.onHover?.(pick ? { ...pick, x: position.x, y: position.y } : null)
      })
    }, ScreenSpaceEventType.MOUSE_MOVE)
  }

  private pickAny(position: Cartesian2): GlobePick | null {
    const picked = this.viewer.scene.pick(position, 14, 14) as { id?: unknown } | undefined
    const id = picked?.id as GlobePick | undefined
    return id && typeof id === 'object' && (id.kind === 'city' || id.kind === 'country') ? { kind: id.kind, name: id.name } : null
  }

  private requestRender(): void {
    if (!this.destroyed) this.viewer.scene.requestRender()
  }

  // ── Imagery & theme ─────────────────────────────────────────────────────────

  private ensureBaseImagery(): void {
    if (this.dayLayer) return
    const layers = this.viewer.imageryLayers
    const credit = new Credit('Imagery: NASA GIBS (Blue Marble, Black Marble)')

    const onTileError = (error: TileProviderError) => {
      error.retry = false
      this.tileErrors += 1
      if (this.tileErrors === 8) void this.addFallbackImagery()
    }

    const day = new UrlTemplateImageryProvider({ url: BLUE_MARBLE_URL, maximumLevel: 8, credit })
    day.errorEvent.addEventListener(onTileError)
    this.dayLayer = layers.addImageryProvider(day)

    const night = new UrlTemplateImageryProvider({ url: BLACK_MARBLE_URL, maximumLevel: 8, credit })
    night.errorEvent.addEventListener(onTileError)
    this.nightLayer = layers.addImageryProvider(night)
  }

  /** Bundled low-resolution Natural Earth imagery, used if NASA tiles are unreachable. */
  private async addFallbackImagery(): Promise<void> {
    if (this.fallbackLayer || this.destroyed) return
    try {
      const provider = await TileMapServiceImageryProvider.fromUrl(buildModuleUrl('Assets/Textures/NaturalEarthII'))
      if (this.destroyed) return
      this.fallbackLayer = this.viewer.imageryLayers.addImageryProvider(provider, 0)
      this.applyTheme()
    } catch {
      // Nothing else to fall back to; the base colour still shows the globe.
    }
  }

  private applyTheme(): void {
    this.ensureBaseImagery()
    const { scene } = this.viewer
    const { globe } = scene
    // Dim the imagery under data surfaces so their colours read.
    const heat = this.layer === 'heat' || this.layer === 'countries'
    const day = this.dayLayer!
    const night = this.nightLayer!

    if (this.theme === 'natural') {
      globe.enableLighting = true
      globe.showGroundAtmosphere = true
      globe.baseColor = Color.fromCssColorString('#0b1a2b')
      if (scene.skyAtmosphere) scene.skyAtmosphere.show = true
      if (scene.skyBox) scene.skyBox.show = true
      if (scene.sun) scene.sun.show = true

      day.show = true
      day.dayAlpha = 1
      day.nightAlpha = 1
      day.brightness = heat ? 0.72 : 1.05
      day.contrast = heat ? 1.0 : 1.08
      day.saturation = heat ? 0.5 : 1.05
      day.gamma = 1

      night.show = true
      night.dayAlpha = 0
      night.nightAlpha = heat ? 0.55 : 1
      night.brightness = 1.25
      night.contrast = 1.1
      night.hue = 0
      night.saturation = 1
      night.gamma = 1
    } else {
      globe.enableLighting = false
      globe.showGroundAtmosphere = false
      globe.baseColor = Color.fromCssColorString('#02060c')
      if (scene.skyAtmosphere) scene.skyAtmosphere.show = false
      if (scene.skyBox) scene.skyBox.show = true
      if (scene.sun) scene.sun.show = false

      day.show = false

      night.show = true
      night.dayAlpha = 1
      night.nightAlpha = 1
      night.hue = 0
      night.saturation = heat ? 0.6 : 0.95
      night.brightness = heat ? 0.9 : 1.45
      night.contrast = 1.35
      night.gamma = 1
    }

    if (this.fallbackLayer) {
      this.fallbackLayer.show = true
      this.fallbackLayer.brightness = this.theme === 'natural' ? (heat ? 0.5 : 0.95) : 0.35
      this.fallbackLayer.saturation = this.theme === 'natural' ? 1 : 0.2
    }

    if (this.bordersMaterial) {
      this.bordersMaterial.uniforms.color = this.borderColor()
    }
    this.requestRender()
  }

  private borderColor(): Color {
    return this.theme === 'natural' ? new Color(1, 1, 1, 0.3) : new Color(0.36, 0.78, 1, 0.5)
  }

  private async loadBorders(): Promise<void> {
    try {
      const [{ mesh }, topology] = await Promise.all([
        import('topojson-client'),
        import('world-atlas/countries-110m.json').then((m) => m.default),
      ])
      if (this.destroyed) return
      const topo = topology as unknown as TopoJSON.Topology
      this.topology = topo
      const lines = mesh(topo, topo.objects.countries as TopoJSON.GeometryCollection) as GeoJSON.MultiLineString
      const instances = lines.coordinates
        .filter((line) => line.length > 1)
        .map(
          (line) =>
            new GeometryInstance({
              geometry: new PolylineGeometry({
                positions: Cartesian3.fromDegreesArrayHeights(line.flatMap(([lng, lat]) => [lng, lat, 1_500])),
                width: 1,
                arcType: ArcType.GEODESIC,
                vertexFormat: PolylineMaterialAppearance.VERTEX_FORMAT,
              }),
            }),
        )
      this.bordersMaterial = Material.fromType('Color', { color: this.borderColor() })
      this.borders = this.viewer.scene.primitives.add(
        new Primitive({
          geometryInstances: instances,
          appearance: new PolylineMaterialAppearance({ material: this.bordersMaterial, translucent: true }),
          asynchronous: true,
        }),
        0,
      )
      this.viewer.scene.primitives.lowerToBottom(this.borders)
      if (this.layer === 'countries') this.rebuildData()
      this.requestRender()
    } catch (error) {
      console.warn('Country borders could not be loaded', error)
    }
  }

  /** GeoJSON features of the countries topology, keyed by ISO alpha-2 via setCountries(). */
  private countryFeatures(): { cc: string; feature: GeoJSON.Feature }[] {
    if (!this.topology) return []
    const collection = feature(this.topology, this.topology.objects.countries as TopoJSON.GeometryCollection) as GeoJSON.FeatureCollection
    const out: { cc: string; feature: GeoJSON.Feature }[] = []
    for (const f of collection.features) {
      const id = String(f.id ?? '').padStart(3, '0')
      if (SKIP_COUNTRY_IDS.has(id)) continue
      const cc = this.ccn3ToCc.get(id)
      if (cc) out.push({ cc, feature: f })
    }
    return out
  }

  private polygonRings(geometry: GeoJSON.Geometry): GeoJSON.Position[][][] {
    if (geometry.type === 'Polygon') return [geometry.coordinates]
    if (geometry.type === 'MultiPolygon') return geometry.coordinates
    return []
  }

  private polygonHierarchies(geometry: GeoJSON.Geometry): PolygonHierarchy[] {
    const toPositions = (ring: GeoJSON.Position[]) => Cartesian3.fromDegreesArray(ring.flatMap(([lng, lat]) => [lng, lat]))
    return this.polygonRings(geometry)
      .filter((rings) => rings.length > 0 && rings[0].length >= 4)
      .map((rings) => new PolygonHierarchy(toPositions(rings[0]), rings.slice(1).filter((r) => r.length >= 4).map((r) => new PolygonHierarchy(toPositions(r)))))
  }

  private buildChoropleth(): void {
    const instances: GeometryInstance[] = []
    for (const { cc, feature: f } of this.countryFeatures()) {
      const value = this.countryValues.get(cc)
      const [r, g, b, a] = value === undefined ? CHOROPLETH_NO_DATA : choroplethColor(value)
      const color = new Color(r / 255, g / 255, b / 255, a)
      for (const hierarchy of this.polygonHierarchies(f.geometry)) {
        instances.push(
          new GeometryInstance({
            id: countryPick(cc),
            geometry: new PolygonGeometry({
              polygonHierarchy: hierarchy,
              height: CHOROPLETH_HEIGHT,
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
          }),
        )
      }
    }
    if (instances.length === 0) return
    this.choropleth = this.viewer.scene.primitives.add(
      new Primitive({
        geometryInstances: instances,
        appearance: new PerInstanceColorAppearance({ flat: true, translucent: true }),
        asynchronous: true,
      }),
    )
    if (this.borders) this.viewer.scene.primitives.raiseToTop(this.borders)
  }

  private buildCountryOutline(): void {
    if (this.countryOutline) {
      this.viewer.scene.primitives.remove(this.countryOutline)
      this.countryOutline = null
    }
    if (!this.selectedCountry) return
    const match = this.countryFeatures().find((c) => c.cc === this.selectedCountry)
    if (!match) return
    const instances = this.polygonRings(match.feature.geometry)
      .filter((rings) => rings[0] && rings[0].length >= 2)
      .map(
        (rings) =>
          new GeometryInstance({
            geometry: new PolylineGeometry({
              positions: Cartesian3.fromDegreesArrayHeights(rings[0].flatMap(([lng, lat]) => [lng, lat, CHOROPLETH_HEIGHT + 2_000])),
              width: 2.5,
              arcType: ArcType.GEODESIC,
              vertexFormat: PolylineMaterialAppearance.VERTEX_FORMAT,
            }),
          }),
      )
    if (instances.length === 0) return
    this.countryOutline = this.viewer.scene.primitives.add(
      new Primitive({
        geometryInstances: instances,
        appearance: new PolylineMaterialAppearance({ material: Material.fromType('Color', { color: Color.WHITE }), translucent: false }),
        asynchronous: false,
      }),
    )
  }

  // ── Data layers ─────────────────────────────────────────────────────────────

  private cityIntensity(city: City): number {
    return this.intensities.get(city.name) ?? 0
  }

  private rebuildData(): void {
    if (this.destroyed) return
    this.clearDataLayers()
    let labelPoints: CityPointDatum[] | null = null
    if (this.layer === 'activity' || this.layer === 'heat') {
      if (this.intensities.size === 0) return
      if (this.layer === 'activity') this.buildPoints(this.simulatedPoints())
      else this.buildHeatLayer()
    } else if (this.layer === 'points') {
      this.buildPoints(this.pointData)
      labelPoints = this.pointData
    } else {
      this.buildChoropleth()
      this.buildCountryOutline()
      this.requestRender()
      return
    }
    // Labels are drawn into a texture, so wait for the web font or they'd use the fallback face.
    void (document.fonts?.load(LABEL_FONT) ?? Promise.resolve()).finally(() => {
      if (this.destroyed) return
      this.buildLabels(labelPoints)
      this.requestRender()
    })
    this.requestRender()
  }

  /** The simulation's cities as generic points, coloured by leading assistant. */
  private simulatedPoints(): CityPointDatum[] {
    return CITIES.map((city) => ({
      key: city.name,
      name: city.name,
      lat: city.lat,
      lng: city.lng,
      intensity: this.cityIntensity(city),
      color: programMapColor(city.program),
    }))
  }

  private clearDataLayers(): void {
    if (this.beams) {
      this.viewer.scene.primitives.remove(this.beams)
      this.beams = null
    }
    if (this.choropleth) {
      this.viewer.scene.primitives.remove(this.choropleth)
      this.choropleth = null
    }
    if (this.countryOutline) {
      this.viewer.scene.primitives.remove(this.countryOutline)
      this.countryOutline = null
    }
    this.cityPoints.removeAll()
    this.caps.removeAll()
    this.pulses.removeAll()
    this.pulseList = []
    this.labels.removeAll()
    if (this.layer !== 'heat' && this.heatLayer) {
      this.viewer.imageryLayers.remove(this.heatLayer, true)
      this.heatLayer = null
    }
  }

  private buildPoints(points: CityPointDatum[]): void {
    const ranked = [...points].sort((a, b) => b.intensity - a.intensity)
    const instances: GeometryInstance[] = []
    const outline = new Color(0.012, 0.027, 0.05, 0.9)

    ranked.forEach((city, index) => {
      const intensity = Math.min(1, Math.max(0, city.intensity))
      const rgb = hexToRgb(city.color)
      const pick = cityPick(city.key)
      const level = Math.sqrt(intensity)
      const top = BEAM_BASE_HEIGHT + 30_000 + BEAM_MAX_HEIGHT * intensity

      if (intensity > 0.02) {
        instances.push(
          new GeometryInstance({
            id: pick,
            geometry: new PolylineGeometry({
              positions: [
                Cartesian3.fromDegrees(city.lng, city.lat, BEAM_BASE_HEIGHT),
                Cartesian3.fromDegrees(city.lng, city.lat, top),
              ],
              width: 1.5 + 2.5 * level,
              colors: [rgbColor(lighten(rgb, 0.1), 0.95), rgbColor(lighten(rgb, 0.35), 0.18)],
              colorsPerVertex: true,
              arcType: ArcType.NONE,
              vertexFormat: PolylineColorAppearance.VERTEX_FORMAT,
            }),
          }),
        )
        this.caps.add({
          id: pick,
          position: Cartesian3.fromDegrees(city.lng, city.lat, top),
          pixelSize: 2 + 3 * level,
          color: rgbColor(lighten(rgb, 0.55), 0.9),
        })
      }

      this.cityPoints.add({
        id: pick,
        position: Cartesian3.fromDegrees(city.lng, city.lat, BEAM_BASE_HEIGHT),
        pixelSize: 3.5 + 5 * level,
        color: rgbColor(rgb, 0.55 + 0.45 * level),
        outlineColor: outline,
        outlineWidth: 1.5,
        scaleByDistance: new NearFarScalar(1.5e6, 1.6, 4e7, 0.8),
      })

      if (index < PULSE_COUNT && intensity > 0.2) {
        const color = rgbColor(rgb, 0.3)
        const baseSize = 12 + 14 * level
        const point = this.pulses.add({
          id: pick,
          position: Cartesian3.fromDegrees(city.lng, city.lat, BEAM_BASE_HEIGHT),
          pixelSize: baseSize,
          color,
        })
        this.pulseList.push({ point, color, baseSize, phase: index * 0.7 })
      }
    })

    this.beams = this.viewer.scene.primitives.add(
      new Primitive({
        geometryInstances: instances,
        appearance: new PolylineColorAppearance({ translucent: true }),
        asynchronous: false,
      }),
    )
  }

  private buildHeatLayer(): void {
    const canvas = renderHeatCanvas(
      CITIES.map((city) => ({ lat: city.lat, lng: city.lng, weight: city.weight, intensity: this.cityIntensity(city) })),
    )
    const provider = new SingleTileImageryProvider({
      url: canvas.toDataURL('image/png'),
      rectangle: Rectangle.fromDegrees(-180, -90, 180, 90),
      tileWidth: canvas.width,
      tileHeight: canvas.height,
      credit: new Credit('Heat surface: PerAI View simulation'),
    })
    const layers = this.viewer.imageryLayers
    const previous = this.heatLayer
    const next = layers.addImageryProvider(provider)
    next.dayAlpha = 1
    next.nightAlpha = 1
    next.brightness = 1.1
    if (previous) {
      // Cross-fade so minute-by-minute updates don't flicker.
      next.alpha = 0
      this.fadingHeatLayer = previous
      this.heatFadeStart = performance.now()
    }
    this.heatLayer = next

    // Small bright markers for the ten busiest cities make the hot spots clickable.
    const hottest = [...CITIES].sort((a, b) => this.cityIntensity(b) - this.cityIntensity(a)).slice(0, 12)
    for (const city of hottest) {
      this.cityPoints.add({
        id: cityPick(city.name),
        position: Cartesian3.fromDegrees(city.lng, city.lat, BEAM_BASE_HEIGHT),
        pixelSize: 5,
        color: new Color(1, 0.96, 0.88, 0.95),
        outlineColor: new Color(0.35, 0.12, 0, 0.9),
        outlineWidth: 1.5,
      })
    }
    // Invisible pick targets for every city so any hot spot can be clicked.
    for (const city of CITIES) {
      this.caps.add({
        id: cityPick(city.name),
        position: Cartesian3.fromDegrees(city.lng, city.lat, BEAM_BASE_HEIGHT),
        pixelSize: 10,
        color: new Color(0, 0, 0, 0.01),
      })
    }
  }

  private updateHeatFade(now: number): void {
    const t = Math.min(1, (now - this.heatFadeStart) / 900)
    if (this.heatLayer) this.heatLayer.alpha = t
    if (this.fadingHeatLayer) this.fadingHeatLayer.alpha = 1 - t
    if (t >= 1 && this.fadingHeatLayer) {
      this.viewer.imageryLayers.remove(this.fadingHeatLayer, true)
      this.fadingHeatLayer = null
    }
  }

  private buildLabels(points: CityPointDatum[] | null): void {
    this.labels.removeAll()
    const top = points
      ? [...points].sort((a, b) => b.intensity - a.intensity).slice(0, LABEL_COUNT).map((p) => ({ key: p.key, name: p.name, lat: p.lat, lng: p.lng }))
      : [...CITIES].sort((a, b) => b.weight - a.weight).slice(0, LABEL_COUNT).map((c) => ({ key: c.name, name: c.name, lat: c.lat, lng: c.lng }))
    for (const city of top) {
      this.labels.add({
        id: cityPick(city.key),
        position: Cartesian3.fromDegrees(city.lng, city.lat, BEAM_BASE_HEIGHT),
        text: city.name,
        font: LABEL_FONT,
        fillColor: new Color(0.95, 0.97, 1, 0.95),
        outlineColor: new Color(0.01, 0.02, 0.04, 0.9),
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: HorizontalOrigin.LEFT,
        verticalOrigin: VerticalOrigin.CENTER,
        pixelOffset: new Cartesian2(15, 0),
        // Pull labels slightly toward the camera so the globe surface doesn't clip them.
        eyeOffset: new Cartesian3(0, 0, -60_000),
        distanceDisplayCondition: new DistanceDisplayCondition(0, 11_000_000),
        translucencyByDistance: new NearFarScalar(7e6, 1, 11e6, 0),
      })
    }
  }

  // ── Animation ───────────────────────────────────────────────────────────────

  private updatePulses(now: number): void {
    const t = now / 1000
    for (const pulse of this.pulseList) {
      const cycle = ((t * 0.45 + pulse.phase) % 1 + 1) % 1
      pulse.point.pixelSize = pulse.baseSize * (0.7 + 1.1 * cycle)
      pulse.color.alpha = 0.34 * (1 - cycle)
      pulse.point.color = pulse.color
    }
  }

  private updateFlashes(now: number): void {
    const done: Flash[] = []
    for (const flash of this.flashes) {
      const t = (now - flash.start) / FLASH_MS
      if (t >= 1) {
        done.push(flash)
        continue
      }
      const ease = 1 - (1 - t) ** 3
      flash.ringColor.alpha = 0.85 * (1 - ease)
      flash.ring.outlineColor = flash.ringColor
      flash.ring.pixelSize = this.reducedMotion ? 14 : 6 + 30 * ease
      flash.coreColor.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
      flash.core.color = flash.coreColor
    }
    for (const flash of done) this.removeFlash(flash)
  }

  private removeFlash(flash: Flash): void {
    this.flashes = this.flashes.filter((f) => f !== flash)
    this.flashPoints.remove(flash.ring)
    this.flashPoints.remove(flash.core)
  }
}
