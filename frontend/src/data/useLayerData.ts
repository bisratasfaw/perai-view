import { useMemo } from 'react'
import type { LayerId } from '@/layers'
import { useRealData } from './realData'
import { developerCitiesLayer, isRealLayer, sdkDownloadsLayer, usageIndexLayer, wikipediaLayer, type LayerData } from './layerData'

export type LayerDataState = { status: 'simulated' } | { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; data: LayerData }

/** Loads and shapes the snapshot behind a real layer; simulated layers need nothing. */
export function useLayerData(layer: LayerId): LayerDataState {
  const real = isRealLayer(layer)
  const usage = useRealData('aiUsageByCountry', real && layer === 'usage-index')
  const wiki = useRealData('wikipediaInterest', real && layer === 'wiki-interest')
  const sdk = useRealData('sdkDownloadsByCountry', real && layer === 'sdk-downloads')
  const dev = useRealData('developerCities', real && layer === 'dev-cities')

  return useMemo<LayerDataState>(() => {
    if (!real) return { status: 'simulated' }
    const state = layer === 'usage-index' ? usage : layer === 'wiki-interest' ? wiki : layer === 'sdk-downloads' ? sdk : dev
    if (state.status === 'loading') return { status: 'loading' }
    if (state.status === 'error') return { status: 'error', error: state.error }
    switch (layer) {
      case 'usage-index':
        return { status: 'ready', data: usageIndexLayer(usage.data!) }
      case 'wiki-interest':
        return { status: 'ready', data: wikipediaLayer(wiki.data!) }
      case 'sdk-downloads': {
        const data = sdk.data!
        if (data.status !== 'ok' && data.status !== 'stale') return { status: 'error', error: 'This source is not configured yet.' }
        return { status: 'ready', data: sdkDownloadsLayer(data) }
      }
      default:
        return { status: 'ready', data: developerCitiesLayer(dev.data!) }
    }
  }, [real, layer, usage, wiki, sdk, dev])
}
