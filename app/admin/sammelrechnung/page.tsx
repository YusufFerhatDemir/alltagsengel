'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { euro } from '@/lib/admin/ops'
import { Banner, EmptyRow } from '@/components/admin/OpsUI'
import { monatBerlin } from '@/lib/utils/timezone'
import { logger } from '@/lib/logger'

const log = logger.child('admin:sammelrechnung')

// ═══════════════════════════════════════════════════════════════
// Sammelrechnungslauf — alle Klienten eines Monats in einem Durchgang
// ═══════════════════════════════════════════════════════════════
// Die Seite zeigt zuerst die Vorschau (schreibt nichts) und erst danach
// den Lauf. Der wichtigere Teil ist die untere Tabelle: was NICHT
// abgerechnet wurde und warum.

interface Gruppe {
  clientId: string
  budgetType: string
  rechtsgrundlage: string | null
  recordIds: string[]
  signiert: number
  abgeschlossen: number
  erfassterBetragEuro: number
}

interface Erstellt {
  clientId: string
  budgetType: string
  invoiceId: string
  invoiceNumber: string
  totalAmountCents: number
  lineCount: number
  alreadyExists: boolean
  recordCount: number
  budgetGedeckelt: boolean
  festgeschrieben: boolean
  versandStatus?: string | null
}

interface Uebersprungen {
  clientId: string
  budgetType: string
  code: string
  grund: string
  recordIds: string[]
}

interface Ergebnis {
  periodMonth: string
  zeitraum: { von: string; bis: string }
  dryRun: boolean
  festschreiben: boolean
  autoVersand: boolean
  gruppen: number
  erstellt: Erstellt[]
  uebersprungen: Uebersprungen[]
  vorschau: Gruppe[]
  summeCent: number
  nichtBetrachtet: number
}

const CODE_LABELS: Record<string, string> = {
  LEISTUNGSART_UNBEKANNT: 'Leistungsart ohne Tarif-Schlüssel',
  BUDGETTYP_UNBEKANNT: 'Budget-Typ unbekannt',
  TARIF_FEHLT: 'Kein gültiger Tarif',
  TARIF_NICHT_VERIFIZIERT: 'Tarif nicht verifiziert / gesperrt',
  TARIF_MEHRDEUTIG: 'Tarif mehrdeutig',
  UNTERSCHRIFT_FEHLT: 'Unterschrift fehlt',
  BUDGETLAGE_UNBEKANNT: 'Budgetlage nicht ermittelbar',
  FEHLER: 'Fehler',
}

export default function SammelrechnungPage() {
  const [month, setMonth] = useState(() => monatBerlin())
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null)
  const [namen, setNamen] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [laufLaeuft, setLaufLaeuft] = useState(false)
  const [festschreiben, setFestschreiben] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)

  const ladeVorschau = useCallback(async () => {
    setLoading(true)
    setFehler(null)
    setHinweis(null)
    try {
      const res = await fetch(`/api/billing/sammelrechnung?month=${encodeURIComponent(month)}`)
      const json = await res.json()
      if (!res.ok) {
        setFehler(json.error || 'Vorschau fehlgeschlagen.')
        setErgebnis(null)
        return
      }
      setErgebnis(json)
    } catch (err) {
      log.errorWithException('Vorschau fehlgeschlagen', err)
      setFehler('Unerwarteter Fehler bei der Vorschau.')
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { void ladeVorschau() }, [ladeVorschau])

  // Klientennamen nachladen: das Ergebnis trägt bewusst nur IDs, damit die
  // Engine keine Personendaten in Ergebnisobjekte schreibt.
  useEffect(() => {
    if (!ergebnis) return
    const ids = [...new Set([
      ...ergebnis.vorschau.map(g => g.clientId),
      ...ergebnis.erstellt.map(g => g.clientId),
      ...ergebnis.uebersprungen.map(g => g.clientId),
    ])].filter(id => !(id in namen))
    if (ids.length === 0) return
    let abgebrochen = false
    void (async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('clients')
          .select('id, first_name, last_name')
          .in('id', ids)
        if (abgebrochen || !data) return
        const neu: Record<string, string> = {}
        for (const c of data) {
          neu[c.id] = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.id.slice(0, 8)
        }
        setNamen(prev => ({ ...prev, ...neu }))
      } catch {
        // Namen sind Komfort — ohne sie bleibt die gekürzte ID stehen.
      }
    })()
    return () => { abgebrochen = true }
  }, [ergebnis, namen])

  async function starteLauf() {
    const anzahl = ergebnis?.vorschau.length ?? 0
    const frage = festschreiben
      ? `${anzahl} Rechnung(en) erzeugen UND festschreiben? Festgeschriebene Rechnungen sind nur noch per Storno korrigierbar.`
      : `${anzahl} Rechnungsentwurf/-entwürfe für ${month} erzeugen?`
    if (!window.confirm(frage)) return

    setLaufLaeuft(true)
    setFehler(null)
    setHinweis(null)
    try {
      const res = await fetch('/api/billing/sammelrechnung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, festschreiben }),
      })
      const json = await res.json()
      if (!res.ok) {
        setFehler(json.error || 'Sammelrechnungslauf fehlgeschlagen.')
        return
      }
      setErgebnis(json)
      setHinweis(
        `${json.erstellt.length} Rechnung(en) erzeugt, ${json.uebersprungen.length} Gruppe(n) übersprungen.`
      )
    } catch (err) {
      log.errorWithException('Sammelrechnungslauf fehlgeschlagen', err)
      setFehler('Unerwarteter Fehler beim Sammelrechnungslauf.')
    } finally {
      setLaufLaeuft(false)
    }
  }

  const name = (id: string) => namen[id] || id.slice(0, 8)

  const vorschauSumme = useMemo(
    () => (ergebnis?.vorschau ?? []).reduce((s, g) => s + g.erfassterBetragEuro, 0),
    [ergebnis]
  )

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Sammelrechnungslauf</h1>
          <p className="admin-subtitle">
            Alle unterschriebenen Leistungsnachweise eines Monats in einem Durchgang abrechnen
          </p>
        </div>
      </div>

      {fehler && <Banner tone="danger">{fehler}</Banner>}
      {hinweis && <Banner tone="success">{hinweis}</Banner>}

      <div className="admin-card" style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label htmlFor="sr-monat" style={{ display: 'block', marginBottom: 4 }}>Abrechnungsmonat</label>
          <input
            id="sr-monat"
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="admin-input"
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={festschreiben}
            onChange={e => setFestschreiben(e.target.checked)}
          />
          Direkt festschreiben
        </label>
        <button className="admin-btn" onClick={() => void ladeVorschau()} disabled={loading || laufLaeuft}>
          {loading ? 'Prüfe…' : 'Vorschau aktualisieren'}
        </button>
        <button
          className="admin-btn admin-btn-primary"
          onClick={() => void starteLauf()}
          disabled={loading || laufLaeuft || (ergebnis?.vorschau.length ?? 0) === 0}
        >
          {laufLaeuft ? 'Lauf läuft…' : 'Sammelrechnungslauf starten'}
        </button>
      </div>

      {ergebnis && ergebnis.nichtBetrachtet > 0 && (
        <Banner tone="warn">
          {ergebnis.nichtBetrachtet} weitere Gruppe(n) wurden wegen der Obergrenze nicht betrachtet —
          Lauf nach Abschluss erneut starten.
        </Banner>
      )}

      {ergebnis && (
        <Banner tone="info">
          {ergebnis.gruppen} Gruppe(n) im Zeitraum {ergebnis.zeitraum.von} bis {ergebnis.zeitraum.bis}.
          {ergebnis.dryRun
            ? ` Vorschau: ${ergebnis.vorschau.length} abrechenbar (erfasst ${euro(vorschauSumme)}), ${ergebnis.uebersprungen.length} übersprungen.`
            : ` Lauf: ${ergebnis.erstellt.length} Rechnung(en) über ${euro(ergebnis.summeCent / 100)}.`}
        </Banner>
      )}

      {ergebnis && !ergebnis.dryRun && (
        <div className="admin-card">
          <h2>Erzeugte Rechnungen</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Klient</th><th>Budget</th><th>Rechnung</th><th>Positionen</th>
                <th>Betrag</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ergebnis.erstellt.length === 0 && <EmptyRow colSpan={6}>Keine Rechnung erzeugt.</EmptyRow>}
              {ergebnis.erstellt.map(e => (
                <tr key={e.invoiceId}>
                  <td>{name(e.clientId)}</td>
                  <td>{e.budgetType}</td>
                  <td><a href={`/admin/rechnungen/${e.invoiceId}`}>{e.invoiceNumber}</a></td>
                  <td>{e.lineCount}</td>
                  <td>{euro(e.totalAmountCents / 100)}</td>
                  <td>
                    {e.alreadyExists ? 'bestand bereits' : e.festgeschrieben ? 'festgeschrieben' : 'Entwurf'}
                    {e.budgetGedeckelt && ' · budgetgedeckelt'}
                    {e.versandStatus && ` · ${e.versandStatus}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ergebnis && ergebnis.dryRun && (
        <div className="admin-card">
          <h2>Abrechenbar</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Klient</th><th>Budget</th><th>Rechtsgrundlage</th>
                <th>Nachweise</th><th>erfasst</th>
              </tr>
            </thead>
            <tbody>
              {ergebnis.vorschau.length === 0 && (
                <EmptyRow colSpan={5}>Keine abrechenbaren Leistungsnachweise in diesem Monat.</EmptyRow>
              )}
              {ergebnis.vorschau.map(g => (
                <tr key={`${g.clientId}-${g.budgetType}`}>
                  <td>{name(g.clientId)}</td>
                  <td>{g.budgetType}</td>
                  <td>{g.rechtsgrundlage || '—'}</td>
                  <td>{g.recordIds.length}</td>
                  <td>{euro(g.erfassterBetragEuro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-card">
        <h2>Nicht abgerechnet</h2>
        <p className="admin-subtitle">
          Jede Zeile ist eine bewusste Sperre — kein Tarif wird umgangen, kein Preis geschätzt.
        </p>
        <table className="admin-table">
          <thead>
            <tr><th>Klient</th><th>Budget</th><th>Grund</th><th>Nachweise</th></tr>
          </thead>
          <tbody>
            {(!ergebnis || ergebnis.uebersprungen.length === 0) && (
              <EmptyRow colSpan={4}>Nichts übersprungen.</EmptyRow>
            )}
            {(ergebnis?.uebersprungen ?? []).map(u => (
              <tr key={`${u.clientId}-${u.budgetType}-${u.code}`}>
                <td>{name(u.clientId)}</td>
                <td>{u.budgetType || '—'}</td>
                <td>
                  <strong>{CODE_LABELS[u.code] || u.code}</strong>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>{u.grund}</div>
                </td>
                <td>{u.recordIds.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
