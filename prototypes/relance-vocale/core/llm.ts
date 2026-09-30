import { z } from 'zod'

/** Optional rewriting through the DeepSeek chat API (OpenAI-compatible). */

function config(): { apiKey: string; baseUrl: string; model: string } | undefined {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (apiKey === undefined || apiKey === '') return undefined
  return {
    apiKey,
    baseUrl: (process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com').replace(/\/$/u, ''),
    model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat',
  }
}

export function llmConfigured(): boolean {
  return config() !== undefined
}

const completion = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
})

const SYSTEM = `Tu réécris des textes de prospection B2B en français pour ${'Échéance'}, un agent vocal qui relance les factures impayées des agences d’intérim.
Règles : garde tous les faits et chiffres du brouillon, n’en invente aucun ; garde la phrase qui dit que Léa est une intelligence artificielle ; garde le lien et la mention « stop » s’ils sont présents ; pas de promesse de résultat ni de prix ; ton chaleureux, direct, phrases courtes ; vouvoiement. Renvoie uniquement le texte réécrit, sans commentaire.`

/**
 * Rewrite `draft` with the model. `instruction` names the target (letter or voice note) and its length.
 * @throws when the API is not configured or answers with an error.
 */
export async function rewriteWithLlm(instruction: string, draft: string): Promise<string> {
  const cfg = config()
  if (cfg === undefined) throw new Error('DEEPSEEK_API_KEY manquante')
  const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${instruction}\n\nBrouillon :\n${draft}` },
      ],
    }),
    cache: 'no-store',
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`DeepSeek ${response.status} : ${text.slice(0, 300)}`)
  const content = completion.parse(JSON.parse(text)).choices[0]?.message.content
  if (content === null || content === undefined || content.trim() === '') throw new Error('Réponse vide du modèle')
  return content.trim()
}
