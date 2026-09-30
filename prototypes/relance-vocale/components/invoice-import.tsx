'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { IMPORT_BATCH_MAX, IMPORT_FIELDS, IMPORT_FIELD_META, guessMapping, readRows, type ImportField } from '@/core/import'
import { parseTable } from '@/core/tabular'

const SAMPLE = `Client;N° facture;Montant TTC;Échéance;Contact;Email;Téléphone;Objet
Transports Rhône Alpes;F-2026-1001;8 420,00;15/09/2026;Paul Martin;compta@tra.example;04 72 00 02 01;3 caristes, semaine 36
Boulangerie Industrielle du Beaujolais;F-2026-1002;12 960,50;22/09/2026;Anne Roux;a.roux@bib.example;04 74 00 02 02;6 préparateurs, août
Métallerie Vaudaise;F-2026-1003;3 150,00;05/10/2026;;factures@metallerie.example;;1 soudeur, semaine 38`

const euro = (value: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)

/** Paste or drop an aged balance, check the columns, import. Parsing happens in the browser; the server validates again. */
export function InvoiceImport() {
  const [text, setText] = useState('')
  const [override, setOverride] = useState<Partial<Record<ImportField, number>>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const table = useMemo(() => parseTable(text), [text])
  const header = table[0] ?? []
  const mapping = useMemo(() => ({ ...guessMapping(header), ...override }), [header, override])
  const check = useMemo(() => readRows(table.slice(1), mapping), [table, mapping])
  const missing = IMPORT_FIELDS.filter(field => IMPORT_FIELD_META[field].required && mapping[field] < 0)
  const total = check.rows.reduce((sum, row) => sum + row.amountEur, 0)

  async function readFile(file: File) {
    const buffer = await file.arrayBuffer()
    // Exports from French accounting software are often Windows-1252, not UTF-8.
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
    setText(utf8.includes('�') ? new TextDecoder('windows-1252').decode(buffer) : utf8)
    setOverride({})
    setResult(null)
  }

  async function submit() {
    setBusy(true)
    setResult(null)
    let created = 0
    let duplicates = 0
    const summary = () => `${created} facture${created > 1 ? 's' : ''} importée${created > 1 ? 's' : ''}${duplicates ? `, ${duplicates} déjà présente${duplicates > 1 ? 's' : ''}` : ''}`
    try {
      // The route takes IMPORT_BATCH_MAX rows per request: a bigger balance goes in several requests.
      for (let start = 0; start < check.rows.length; start += IMPORT_BATCH_MAX) {
        const response = await fetch('/api/invoices/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: check.rows.slice(start, start + IMPORT_BATCH_MAX) }) })
        const data = (await response.json().catch(() => ({}))) as { created?: number; duplicates?: number; error?: string }
        if (!response.ok) {
          const error = data.error ?? `Erreur ${response.status}`
          setResult({ tone: 'error', text: start === 0 ? error : `${error} (avant l’erreur : ${summary()})` })
          return
        }
        created += data.created ?? 0
        duplicates += data.duplicates ?? 0
      }
      setResult({ tone: 'ok', text: `${summary()}. Elles entrent dans le pipeline à leur échéance.` })
    } catch {
      setResult({ tone: 'error', text: created + duplicates > 0 ? `Connexion interrompue. Déjà fait : ${summary()}.` : 'Connexion interrompue, aucune facture importée.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="card card-blue p-5">
        <p className="label">1 · Vos factures échues</p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">Exportez la balance âgée de votre logiciel (Sage, Pennylane, Cegid, EBP, logiciel d’intérim) en CSV, ou copiez les lignes depuis Excel et collez-les ici. La première ligne doit porter les titres des colonnes.</p>
        <textarea id="import-text" className="field mt-4 min-h-[260px] resize-y font-mono text-[12.5px] leading-relaxed" placeholder="Collez ici vos lignes, titres compris…" value={text} onChange={event => { setText(event.target.value); setOverride({}); setResult(null) }} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="btn btn-sm cursor-pointer">
            Choisir un fichier CSV
            <input type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file !== undefined) void readFile(file) }} />
          </label>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setText(SAMPLE); setOverride({}); setResult(null) }}>Essayer avec un exemple</button>
        </div>
      </section>

      <section className="card p-5">
        <p className="label">2 · Colonnes reconnues</p>
        {header.length === 0
          ? <p className="mt-2 text-[13.5px] text-muted">Les colonnes apparaîtront ici dès que vous aurez collé vos lignes.</p>
          : (
            <>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {IMPORT_FIELDS.map(field => (
                  <label key={field} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
                    <span className="text-[13px] font-semibold text-ink">{IMPORT_FIELD_META[field].label}{IMPORT_FIELD_META[field].required ? ' *' : ''}</span>
                    <select id={`map-${field}`} className="field !w-auto !py-1.5 text-[12.5px]" value={mapping[field]} onChange={event => setOverride(current => ({ ...current, [field]: Number(event.target.value) }))}>
                      <option value={-1}>—</option>
                      {header.map((title, index) => <option key={index} value={index}>{title || `Colonne ${index + 1}`}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {missing.length > 0 && <p className="mt-3 text-[13px] font-semibold text-fuchsia">À indiquer : {missing.map(field => IMPORT_FIELD_META[field].label).join(', ')}.</p>}

              <p className="label mt-5">3 · Aperçu</p>
              <div className="mt-2 overflow-x-auto rounded-md border border-line">
                <table className="table min-w-[560px] !text-[12.5px]">
                  <thead><tr><th>Client</th><th>Facture</th><th className="r">Montant</th><th>Échéance</th><th>Contact</th></tr></thead>
                  <tbody>
                    {check.rows.slice(0, 8).map(row => (
                      <tr key={`${row.company}-${row.number}`}>
                        <td className="font-semibold text-ink">{row.company}</td>
                        <td className="font-mono text-[11.5px]">{row.number}</td>
                        <td className="r tabular">{euro(row.amountEur)}</td>
                        <td className="tabular">{new Date(`${row.dueDate}T12:00:00`).toLocaleDateString('fr-FR')}</td>
                        <td className="text-muted">{row.email ?? row.phone ?? row.contactName ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[12.5px] text-muted">{check.rows.length} facture{check.rows.length > 1 ? 's' : ''} lisible{check.rows.length > 1 ? 's' : ''} pour {euro(total)}{check.rows.length > 8 ? ', 8 premières affichées' : ''}.</p>
              {check.rejected.length > 0 && (
                <details className="mt-2">
                  <summary className="text-[12.5px] font-semibold text-ochre">{check.rejected.length} ligne{check.rejected.length > 1 ? 's' : ''} écartée{check.rejected.length > 1 ? 's' : ''}</summary>
                  <ul className="mt-2 space-y-1 text-[12.5px] text-muted">
                    {check.rejected.slice(0, 20).map(item => <li key={item.line}>Ligne {item.line} : {item.reason}</li>)}
                  </ul>
                </details>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-primary" disabled={busy || missing.length > 0 || check.rows.length === 0} onClick={submit}>{busy ? 'Import…' : `Importer ${check.rows.length} facture${check.rows.length > 1 ? 's' : ''}`}</button>
                {result?.tone === 'ok' && <Link href="/" className="text-[13px] font-semibold text-blue hover:underline">Voir le pipeline →</Link>}
              </div>
            </>
          )}
        {result !== null && <p className={`mt-3 text-[13.5px] font-semibold ${result.tone === 'ok' ? 'text-emerald' : 'text-fuchsia'}`}>{result.text}</p>}
      </section>
    </div>
  )
}
