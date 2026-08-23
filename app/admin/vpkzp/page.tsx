'use client'
/**
 * VP/KZP-Uebersicht — Tage und gemeinsamer Jahresbetrag je Klient.
 *
 * Zeigt beide Grenzen NEBENEINANDER, weil sie unabhaengig voneinander
 * greifen: ein Klient kann sein Tagekontingent voll haben, obwohl Geld
 * uebrig ist — und umgekehrt. Eine Ansicht, die nur den Restbetrag zeigt,
 * laesst genau den Fall durchgehen, in dem die Tage schon aus sind.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { logger } from '@/lib/logger'
import { zeitVersionFuerJahrOderNull } from '@/lib/billing/vpkzp/konstanten'

const log = logger.child('admin:vpkzp')

interface Zeile {
  clientId: string
  name: string
  jahr: number
  vpTageVerbraucht: number
  kzpTageVerbraucht: number
  vpBetragVerbrauchtEuro: number
  kzpBetragVerbrauchtEuro: number
  kombiniertesBudgetEuro: number
  kombiniertRestEuro: number
}

interface Fachfrage {
  code: string
  text: string
}

// Kontingente kommen aus lib/billing/vpkzp/konstanten.ts statt aus einer
// eigenen Konstante: die Anzeige darf nichts anderes behaupten als die
// Pruefung durchsetzt, und sie haengen am Kalenderjahr der Zeile (bis 2024
// gilt fuer die Verhinderungspflege ein anderes Kontingent als ab 2025).
// Ein Jahr ohne hinterlegten Rechtsstand liefert 0 — dann steht in der
// Zeile "x von 0 Tagen", statt einen Wert zu erfinden.
function vpMaxTage(jahr: number): number {
  return zeitVersionFuerJahrOderNull(jahr)?.vpMaxTage ?? 0
}

function kzpMaxTage(jahr: number): number {
  return zeitVersionFuerJahrOderNull(jahr)?.kzpMaxTage ?? 0
}

function euro(betrag: number): string {
  return betrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function anteil(verbraucht: number, gesamt: number): number {
  if (gesamt <= 0) return 0
  return Math.min(100, Math.round((verbraucht / gesamt) * 100))
}

function ampel(prozent: number): string {
  if (prozent >= 90) return 'bg-red-500'
  if (prozent >= 70) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function Balken({ verbraucht, gesamt, beschriftung }: {
  verbraucht: number; gesamt: number; beschriftung: string
}) {
  const prozent = anteil(verbraucht, gesamt)
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>{beschriftung}</span>
        <span>{prozent}&nbsp;%</span>
      </div>
      <div
        className="h-2 w-full rounded bg-gray-200"
        role="progressbar"
        aria-label={beschriftung}
        aria-valuenow={prozent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-2 rounded ${ampel(prozent)}`} style={{ width: `${prozent}%` }} />
      </div>
    </div>
  )
}

export default function VpKzpUebersichtSeite() {
  const aktuellesJahr = new Date().getFullYear()
  const [jahr, setJahr] = useState(aktuellesJahr)
  const [zeilen, setZeilen] = useState<Zeile[]>([])
  const [fachfragen, setFachfragen] = useState<Fachfrage[]>([])
  const [laedt, setLaedt] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [suche, setSuche] = useState('')

  const laden = useCallback(async (fuerJahr: number) => {
    setLaedt(true)
    setFehler(null)
    try {
      const antwort = await fetch(`/api/admin/vpkzp?jahr=${fuerJahr}`)
      const daten = await antwort.json()
      if (!antwort.ok) {
        setFehler(daten?.error ?? 'Die Uebersicht konnte nicht geladen werden.')
        setZeilen([])
        return
      }
      setZeilen(daten.zeilen ?? [])
      setFachfragen(daten.offeneFachfragen ?? [])
    } catch (err) {
      log.errorWithException('VP/KZP-Uebersicht laden', err)
      setFehler('Die Uebersicht konnte nicht geladen werden.')
      setZeilen([])
    } finally {
      setLaedt(false)
    }
  }, [])

  useEffect(() => { void laden(jahr) }, [jahr, laden])

  const gefiltert = useMemo(() => {
    const begriff = suche.trim().toLowerCase()
    if (!begriff) return zeilen
    return zeilen.filter(z => z.name.toLowerCase().includes(begriff))
  }, [zeilen, suche])

  const summe = useMemo(() => ({
    klienten: zeilen.length,
    ausgeschoepft: zeilen.filter(z => z.kombiniertRestEuro <= 0).length,
    tageVoll: zeilen.filter(
      z => z.vpTageVerbraucht >= vpMaxTage(z.jahr) || z.kzpTageVerbraucht >= kzpMaxTage(z.jahr),
    ).length,
  }), [zeilen])

  return (
    <main className="p-6 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          Verhinderungs- und Kurzzeitpflege
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Gemeinsamer Jahresbetrag nach § 42a SGB XI und Tagekontingente nach
          § 39 / § 42 SGB XI. Das Geld ist ein gemeinsamer Topf, die Tage sind
          zwei getrennte Kontingente — beide Grenzen gelten gleichzeitig.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="vpkzp-jahr" className="block text-sm font-medium text-gray-700">
            Kalenderjahr
          </label>
          <select
            id="vpkzp-jahr"
            value={jahr}
            onChange={e => setJahr(Number(e.target.value))}
            className="mt-1 rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {[aktuellesJahr + 1, aktuellesJahr, aktuellesJahr - 1, aktuellesJahr - 2]
              .filter(j => j >= 2024)
              .map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label htmlFor="vpkzp-suche" className="block text-sm font-medium text-gray-700">
            Klient suchen
          </label>
          <input
            id="vpkzp-suche"
            type="search"
            value={suche}
            onChange={e => setSuche(e.target.value)}
            placeholder="Name"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Jahreswechsel: § 42a kennt keinen Uebertrag. Das gehoert sichtbar
          in die Ansicht — sonst rechnen Mitarbeitende mit einem Restbetrag,
          den es am 01.01. nicht mehr gibt. */}
      <div className="mb-6 rounded border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <strong>Jahreswechsel:</strong> Der gemeinsame Jahresbetrag verfaellt
        zum 31.12. — es gibt <em>keinen</em> Uebertrag ins Folgejahr (anders als
        beim Entlastungsbetrag nach § 45b). Auch die Tagekontingente beginnen am
        01.01. neu. Ein Leistungszeitraum ueber den Jahreswechsel wird beim
        Anlegen in zwei Buchungen zerlegt, je eine pro Kalenderjahr.
      </div>

      {fehler && (
        <div role="alert" className="mb-6 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {fehler}
        </div>
      )}

      {!laedt && !fehler && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded border border-gray-200 bg-white p-4">
            <div className="text-2xl font-semibold text-gray-900">{summe.klienten}</div>
            <div className="text-sm text-gray-600">Klienten mit Verbrauch {jahr}</div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-4">
            <div className="text-2xl font-semibold text-gray-900">{summe.ausgeschoepft}</div>
            <div className="text-sm text-gray-600">Jahresbetrag ausgeschoepft</div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-4">
            <div className="text-2xl font-semibold text-gray-900">{summe.tageVoll}</div>
            <div className="text-sm text-gray-600">Tagekontingent ausgeschoepft</div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <caption className="sr-only">
            Verbrauch der Verhinderungs- und Kurzzeitpflege je Klient im Jahr {jahr}
          </caption>
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">Klient</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                Verhinderungspflege (§ 39)
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                Kurzzeitpflege (§ 42)
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                Gemeinsamer Jahresbetrag (§ 42a)
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-gray-700">Rest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {laedt && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Wird geladen …</td></tr>
            )}
            {!laedt && gefiltert.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  Keine Buchungen fuer {jahr} erfasst.
                </td>
              </tr>
            )}
            {!laedt && gefiltert.map(z => {
              const verbraucht = z.vpBetragVerbrauchtEuro + z.kzpBetragVerbrauchtEuro
              const vpMax = vpMaxTage(z.jahr)
              const kzpMax = kzpMaxTage(z.jahr)
              return (
                <tr key={`${z.clientId}-${z.jahr}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{z.name}</td>
                  <td className="px-4 py-3 w-56">
                    <Balken
                      verbraucht={z.vpTageVerbraucht}
                      gesamt={vpMax}
                      beschriftung={`${z.vpTageVerbraucht} von ${vpMax} Tagen`}
                    />
                    <div className="mt-1 text-xs text-gray-600">
                      {euro(z.vpBetragVerbrauchtEuro)}
                    </div>
                  </td>
                  <td className="px-4 py-3 w-56">
                    <Balken
                      verbraucht={z.kzpTageVerbraucht}
                      gesamt={kzpMax}
                      beschriftung={`${z.kzpTageVerbraucht} von ${kzpMax} Tagen`}
                    />
                    <div className="mt-1 text-xs text-gray-600">
                      {euro(z.kzpBetragVerbrauchtEuro)}
                    </div>
                  </td>
                  <td className="px-4 py-3 w-64">
                    <Balken
                      verbraucht={verbraucht}
                      gesamt={z.kombiniertesBudgetEuro}
                      beschriftung={`${euro(verbraucht)} von ${euro(z.kombiniertesBudgetEuro)}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    <span className={z.kombiniertRestEuro <= 0 ? 'text-red-700' : 'text-gray-900'}>
                      {euro(z.kombiniertRestEuro)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {fachfragen.length > 0 && (
        <section className="mt-8 rounded border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            Offene Fachfragen — von diesem Modul bewusst nicht selbst entschieden
          </h2>
          <ul className="mt-2 space-y-2 text-sm text-amber-900">
            {fachfragen.map((f, i) => <li key={i}>• {f.text}</li>)}
          </ul>
        </section>
      )}
    </main>
  )
}
