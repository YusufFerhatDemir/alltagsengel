'use client'
/**
 * Onboarding-Übersicht — wer steht wo, und wer bleibt liegen.
 *
 * Auswertung, Filter und Kennzahlen kommen aus lib/onboarding/uebersicht.ts
 * (rein und getestet). Diese Seite lädt, filtert und zeigt an.
 *
 * ── DER HINWEIS OBEN IST KEIN SCHMUCK ──────────────────────────────────
 * „Keine Unterlage vermerkt" heißt: in DIESEM Ablauf ist keine
 * hochgeladen. Was per Post oder E-Mail kam, steht hier nicht. Ohne
 * diesen Satz ruft irgendwann jemand an und mahnt ein Dokument an, das
 * längst auf dem Schreibtisch liegt.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import {
  FILTER, FILTER_LABEL, kennzahlen, sucheNachName, wendeFilterAn,
  type AusgewerteteZeile, type Filter,
} from '@/lib/onboarding/uebersicht'
import { ONBOARDING_TYPEN, type OnboardingTyp } from '@/lib/onboarding/schritte'
import { logger } from '@/lib/logger'

const log = logger.child('admin:onboarding')

const TYP_LABEL: Record<OnboardingTyp, string> = {
  bewerber: 'Bewerbung',
  kunde: 'Anfrage',
  angehoerige: 'Angehörige',
}

function datum(wert: string | null): string {
  if (!wert) return '—'
  const d = new Date(wert)
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('de-DE') : '—'
}

export default function AdminOnboardingSeite() {
  const [zeilen, setZeilen] = useState<AusgewerteteZeile[]>([])
  const [laedt, setLaedt] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('alle')
  const [typ, setTyp] = useState<OnboardingTyp | 'alle'>('alle')
  const [suche, setSuche] = useState('')
  const [inaktivTage, setInaktivTage] = useState(7)

  const laden = useCallback(async () => {
    setLaedt(true)
    setFehler(null)
    try {
      const antwort = await fetch('/api/admin/onboarding')
      const daten = await antwort.json()
      if (!antwort.ok) {
        setFehler(daten?.error ?? 'Die Übersicht konnte nicht geladen werden.')
        setZeilen([])
        return
      }
      setZeilen(daten.zeilen ?? [])
    } catch (err) {
      log.errorWithException('Übersicht laden', err)
      setFehler('Die Übersicht konnte nicht geladen werden.')
      setZeilen([])
    } finally {
      setLaedt(false)
    }
  }, [])

  useEffect(() => { void laden() }, [laden])

  const nachTyp = useMemo(
    () => (typ === 'alle' ? zeilen : zeilen.filter(z => z.typ === typ)),
    [zeilen, typ],
  )
  const gefiltert = useMemo(
    () => sucheNachName(wendeFilterAn(nachTyp, filter, inaktivTage), suche),
    [nachTyp, filter, inaktivTage, suche],
  )
  const zahlen = useMemo(() => kennzahlen(nachTyp, inaktivTage), [nachTyp, inaktivTage])

  return (
    <main className="p-6 max-w-7xl mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">Onboarding-Übersicht</h1>
        <p className="mt-1 text-sm text-gray-600">
          Wer steht wo im Ablauf — und wer bleibt liegen.
        </p>
      </header>

      <Banner tone="info">
        Diese Übersicht zeigt, was <strong>im Ablauf</strong> steht. Unterlagen, die
        per Post oder E-Mail kamen, erscheinen hier nicht — bevor Sie etwas
        anmahnen, bitte im Posteingang nachsehen.
      </Banner>

      <div className="my-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {([
          ['Gesamt', zahlen.gesamt], ['Offen', zahlen.offen],
          ['Abgeschlossen', zahlen.abgeschlossen], ['Bereit zur Prüfung', zahlen.bereit],
          [`Inaktiv ≥ ${inaktivTage} Tage`, zahlen.inaktiv],
        ] as const).map(([label, wert]) => (
          <div key={label} className="rounded border border-gray-200 bg-white p-4">
            <div className="text-2xl font-semibold text-gray-900">{wert}</div>
            <div className="text-sm text-gray-600">{label}</div>
          </div>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="ob-filter" className="block text-sm font-medium text-gray-700">Filter</label>
          <select id="ob-filter" value={filter} onChange={e => setFilter(e.target.value as Filter)}
            className="mt-1 rounded border border-gray-300 px-3 py-2 text-sm">
            {FILTER.map(f => <option key={f} value={f}>{FILTER_LABEL[f]}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="ob-typ" className="block text-sm font-medium text-gray-700">Ablaufart</label>
          <select id="ob-typ" value={typ} onChange={e => setTyp(e.target.value as OnboardingTyp | 'alle')}
            className="mt-1 rounded border border-gray-300 px-3 py-2 text-sm">
            <option value="alle">Alle</option>
            {ONBOARDING_TYPEN.map(t => <option key={t} value={t}>{TYP_LABEL[t]}</option>)}
          </select>
        </div>

        {filter === 'inaktiv' && (
          <div>
            <label htmlFor="ob-tage" className="block text-sm font-medium text-gray-700">
              Inaktiv ab (Tage)
            </label>
            <input id="ob-tage" type="number" min={1} max={365} value={inaktivTage}
              onChange={e => setInaktivTage(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1 w-24 rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        )}

        <div className="flex-1 min-w-[200px]">
          <label htmlFor="ob-suche" className="block text-sm font-medium text-gray-700">
            Suche
          </label>
          <SearchInput id="ob-suche" value={suche} onChange={setSuche} placeholder="Name" />
        </div>
      </div>

      {fehler && (
        <div role="alert" className="mb-6 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {fehler}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <caption className="sr-only">Onboarding-Abläufe der Organisation</caption>
          <thead className="bg-gray-50">
            <tr>
              {['Person', 'Art', 'Fortschritt', 'Letzter Schritt', 'Fehlende Angaben',
                'Unterlagen', 'Letzte Nachricht', 'Abbruchstelle', 'Inaktiv'].map(h => (
                <th key={h} scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {laedt && <EmptyRow colSpan={9}>Wird geladen …</EmptyRow>}
            {!laedt && gefiltert.length === 0 && (
              <EmptyRow colSpan={9}>Keine Abläufe für diese Auswahl.</EmptyRow>
            )}
            {!laedt && gefiltert.map(z => (
              <tr key={z.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{z.name}</td>
                <td className="px-4 py-3 text-gray-700">{TYP_LABEL[z.typ] ?? z.typ}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="tabular-nums">
                    {z.erledigteSchritte}/{z.gesamtSchritte} · {z.prozent}&nbsp;%
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700">{z.letzterSchrittTitel}</td>
                <td className="px-4 py-3 text-gray-700">
                  {z.fehlendeAngaben.length === 0 ? '—' : z.fehlendeAngaben.join(', ')}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {z.dokumenteVermerkt === 0 ? 'keine vermerkt' : `${z.dokumenteVermerkt} vermerkt`}
                </td>
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                  {datum(z.letzteAutoNachricht)}
                </td>
                <td className="px-4 py-3 text-gray-700">{z.abbruchstelle ?? '—'}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {z.abgeschlossenAm ? (
                    <StatusBadge label="Abgeschlossen" color="rgba(92,184,130,.25)" />
                  ) : z.bereitZurPruefung ? (
                    <StatusBadge label="Bereit zur Prüfung" color="rgba(33,150,243,.25)" />
                  ) : (
                    <span className="tabular-nums text-gray-700">
                      {Number.isFinite(z.tageInaktiv) ? `${z.tageInaktiv} Tage` : '—'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
