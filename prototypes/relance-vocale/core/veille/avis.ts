import { brandWords, getJson, mentions, type Draft, type WatchSource } from './common.ts'

/**
 * Google reviews through SerpApi (`SERPAPI_KEY`, about 0,01 $ a search): temps who write about late pay or
 * missing advances describe the agency's cash before its accounts do. The rating is kept as a snapshot;
 * a drop of 0,3 point or more since the last run is a signal too.
 */

const SERPAPI = 'https://serpapi.com/search.json'
const PAY = /pai[e]? (en )?retard|salaire[s]? (pas|non|jamais) (vers|pay)|acompte[s]? (refus|pas|jamais)|pay[eé]s? en retard|virement (en )?retard|attend(s|re|ent)? (mon|notre|le) salaire|pas (encore )?(été )?pay/iu

interface MapsSearch {
  local_results?: { title?: string; data_id?: string; rating?: number; reviews?: number }[]
  place_results?: { title?: string; data_id?: string; rating?: number; reviews?: number }
}
interface Reviews {
  reviews?: { rating?: number; snippet?: string; date?: string; iso_date?: string; user?: { name?: string } }[]
}

export const avis: WatchSource = {
  key: 'avis',
  label: 'Avis Google (SerpApi)',
  unavailable: () => (process.env.SERPAPI_KEY?.trim() ? undefined : 'SERPAPI_KEY manquante'),
  async detect({ prospect, now }) {
    const drafts: Draft[] = []
    const key = process.env.SERPAPI_KEY?.trim()
    if (key === undefined || key === '') return { drafts }
    const words = brandWords(prospect.company)
    const search = await getJson<MapsSearch>(`${SERPAPI}?${new URLSearchParams({ engine: 'google_maps', type: 'search', q: `${prospect.company} ${prospect.city}`, hl: 'fr', gl: 'fr', api_key: key })}`)
    const place = search.place_results ?? search.local_results?.find(entry => mentions(entry.title ?? '', words))
    if (place?.data_id === undefined) return { drafts, costUsd: 0.01 }
    const rating = place.rating
    const previous = prospect.veille?.rating
    if (typeof rating === 'number' && previous !== undefined && previous.value - rating >= 0.3) {
      drafts.push({ source: 'avis', weight: 3, detectedAt: new Date(now).toISOString(), title: `Note Google en baisse : ${previous.value.toFixed(1)} → ${rating.toFixed(1)}`, excerpt: `${place.reviews ?? '?'} avis au total. Une note qui décroche chez une agence d’intérim vient souvent des intérimaires, donc de la paie.` })
    }
    const data = await getJson<Reviews>(`${SERPAPI}?${new URLSearchParams({ engine: 'google_maps_reviews', data_id: place.data_id, hl: 'fr', sort_by: 'newestFirst', api_key: key })}`)
    for (const review of data.reviews ?? []) {
      const text = review.snippet ?? ''
      const at = review.iso_date !== undefined ? Date.parse(review.iso_date) : NaN
      if (!PAY.test(text) || (Number.isFinite(at) && now - at > 180 * 86_400_000)) continue
      drafts.push({ source: 'avis', weight: 4, detectedAt: Number.isFinite(at) ? new Date(at).toISOString() : new Date(now).toISOString(), title: 'Un intérimaire parle de paie en retard', excerpt: `« ${text.slice(0, 200)} »${review.rating !== undefined ? ` (${review.rating}/5` : ''}${review.date !== undefined ? `, ${review.date})` : ')'}`.replace(' ()', '') })
      if (drafts.length >= 3) break
    }
    return { drafts, snapshot: typeof rating === 'number' ? { rating: { value: rating, count: place.reviews ?? 0, at: new Date(now).toISOString() } } : undefined, costUsd: 0.02 }
  },
}
