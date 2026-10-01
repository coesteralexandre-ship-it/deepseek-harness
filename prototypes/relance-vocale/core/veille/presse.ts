import { ambiguousBrand, brandWords, fold, getText, mentions, searchName, type Draft, type WatchSource } from './common.ts'

/**
 * Press (free, no key): Google News RSS on the company's name. Only items that name it and speak of a sale,
 * a takeover, an opening, a closure or a procedure become signals; the rest is noise.
 */

const DAY_MS = 86_400_000
const TOPICS: [RegExp, string, Draft['weight']][] = [
  [/liquidation|redressement|sauvegarde|proc[eé]dure collective|cessation/iu, 'Difficultés évoquées dans la presse', 5],
  [/rach[eè]t|acqui|c[eè]de|cession|reprise|fusion|rapproch/iu, 'Rachat, cession ou reprise', 4],
  [/ferme|fermeture|licenci|plan social/iu, 'Fermeture ou réduction évoquée', 4],
  [/ouvre|ouverture|nouvelle agence|nouveau si[eè]ge|s.implante|s.installe|d[eé]barque|inaugur|nouvel acteur/iu, 'Ouverture ou implantation annoncée', 3],
  [/l[eè]ve|lev[eé]e de fonds|investissement|entr[eé]e au capital/iu, 'Levée de fonds ou entrée au capital', 3],
  [/nouveau (directeur|pr[eé]sident|dg|daf)|nomm[eé]|prend la (t[eê]te|direction)|rejoint/iu, 'Nomination annoncée', 3],
]

function unescape(value: string): string {
  return value.replace(/<!\[CDATA\[|\]\]>/gu, '').replace(/&amp;/gu, '&').replace(/&quot;/gu, '"').replace(/&#39;|&apos;/gu, '’').replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').trim()
}

export const presse: WatchSource = {
  key: 'presse',
  label: 'Presse',
  unavailable: () => undefined,
  async detect({ prospect, now }) {
    const drafts: Draft[] = []
    const words = brandWords(prospect.company)
    // A one-word name shared by many companies brings back other people's news: better nothing than wrong.
    if (ambiguousBrand(prospect.company)) return { drafts }
    const query = encodeURIComponent(`"${searchName(prospect.company)}" intérim`)
    const xml = await getText(`https://news.google.com/rss/search?q=${query}&hl=fr&gl=FR&ceid=FR:fr`)
    for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/gu)) {
      const block = item[1] as string
      const title = unescape(/<title>([\s\S]*?)<\/title>/u.exec(block)?.[1] ?? '')
      const link = unescape(/<link>([\s\S]*?)<\/link>/u.exec(block)?.[1] ?? '')
      const date = Date.parse(/<pubDate>([\s\S]*?)<\/pubDate>/u.exec(block)?.[1] ?? '')
      if (title === '' || Number.isNaN(date) || now - date > 180 * DAY_MS) continue
      // The strongest brand word must be in the title itself: a RSS match on a common word is not about this agency.
      if (!mentions(title, words)) continue
      const topic = TOPICS.find(([pattern]) => pattern.test(fold(title)))
      if (topic === undefined) continue
      const [, label, weight] = topic
      drafts.push({ source: 'presse', weight, detectedAt: new Date(date).toISOString(), url: link, title: `${label} : « ${title.replace(/ - [^-]+$/u, '').slice(0, 120)} »`, excerpt: `${title.split(' - ').pop() ?? 'Presse'}, ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date))}, via Google Actualités.` })
      if (drafts.length >= 3) break
    }
    return { drafts }
  },
}
