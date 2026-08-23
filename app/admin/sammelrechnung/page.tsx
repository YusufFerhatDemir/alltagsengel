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
  uebernommen?: number
  batchId?: string
  wiederaufnahme?: boolean
  kopf?: LaufKopf
}

// Kopfsatz eines Laufs (sammelrechnungslaeufe). Die id ist die Batch-ID:
// unter ihr steht der Lauf im Audit-Trail (billing_audit_trail.batch_id).
interface LaufKopf {
  id: string
  periodMonth: string
  status: 'laeuft' | 'abgeschlossen' | 'abgebrochen' | 'fehlgeschlagen'
  versuch: number
  gestartetAm: string
  beendetAm: string | null
  laufzeitMs: number | null
  gruppenGesamt: number
  gruppenErstellt: number
  gruppenUebersprungen: number
  gruppenFehlgeschlagen: number
  gruppenOffen: number
  summeCent: number
  abbruchgrund: string | null
  festschreiben: boolean
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

const STATUS_LABELS: Record<LaufKopf['status'], string> = {
  laeuft: 'läuft',
  abgeschlossen: 'abgeschlossen',
  abgebrochen: 'abgebrochen (fortsetzbar)',
  fehlgeschlagen: 'fehlgeschlagen',
}

/** Laufzeit lesbar: Millisekunden sagen niemandem etwas. */
function laufzeit(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  const sekunden = Math.round(ms / 1000)
  if (sekunden < 60) return `${sekunden} s`
  const minuten = Math.floor(sekunden / 60)
  return `${minuten} min ${sekunden % 60} s`
}

function zeitpunkt(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
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
  const [laeufe, setLaeufe] = useState<LaufKopf[]>([])

  // Läufe des Monats. Sie stehen bewusst neben der Vorschau und nicht in
  // ihr: die Vorschau sagt, was abrechenbar WÄRE, die Laufliste sagt, was
  // tatsächlich passiert ist — inklusive der Läufe, die jemand anderes
  // gestartet hat.
  const ladeLaeufe = useCallback(async () => {
    try {
      const res = await fetch(`/api/billing/sammelrechnung/laeufe?month=${encodeURIComponent(month)}&limit=20`)
      if (!res.ok) return
      const json = await res.json()
      setLaeufe(Array.isArray(json.laeufe) ? json.laeufe : [])
    } catch {
      // Die Laufliste ist Betriebsinformation, kein Arbeitsschritt.
      // Fällt sie aus, bleibt der Rest der Seite benutzbar.
    }
  }, [month])

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
  useEffect(() => { void ladeLaeufe() }, [ladeLaeufe])

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
        // 409 ist kein Fehlschlag, sondern die Parallelitätssperre: für
        // diesen Monat läuft bereits ein Lauf. Es wurde NICHTS erzeugt.
        setFehler(
          res.status === 409
            ? `${json.error} Der laufende Vorgang steht unten in der Laufübersicht.`
            : json.error || 'Sammelrechnungslauf fehlgeschlagen.'
        )
        void ladeLaeufe()
        return
      }
      setErgebnis(json)
      const uebernommen = Number(json.uebernommen ?? 0)
      setHinweis(
        `${json.erstellt.length} Rechnung(en) erzeugt, ${json.uebersprungen.length} Gruppe(n) übersprungen`
        + (uebernommen > 0 ? `, ${uebernommen} aus dem vorherigen Versuch übernommen` : '')
        + (json.batchId ? ` · Lauf ${String(json.batchId).slice(0, 8)}` : '')
        + '.'
      )
      void ladeLaeufe()
    } catch (err) {
      log.errorWithException('Sammelrechnungslauf fehlgeschlagen', err)
      setFehler('Unerwarteter Fehler beim Sammelrechnungslauf.')
    } finally {
      setLaufLaeuft(false)
    }
  }

  /**
   * Gibt die Sperre eines hängenden Laufs frei.
   *
   * Hält NICHT die Rechnungserstellung an — die läuft in einer anderen
   * Instanz und ist von hier aus nicht erreichbar. Der Lauf wird nur als
   * abgebrochen markiert, damit der nächste ihn fortsetzen kann. Bereits
   * erzeugte Rechnungen bleiben unberührt.
   */
  async function gibLaufFrei(batchId: string) {
    if (!window.confirm(
      'Diesen Lauf freigeben? Bereits erzeugte Rechnungen bleiben bestehen. '
      + 'Der nächste Lauf setzt bei den offenen Gruppen fort.'
    )) return
    setFehler(null)
    try {
      const res = await fetch('/api/billing/sammelrechnung/laeufe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, grund: 'Manuell über die Laufübersicht freigegeben.' }),
      })
      const json = await res.json()
      if (!res.ok) {
        setFehler(json.error || 'Lauf konnte nicht freigegeben werden.')
        return
      }
      setHinweis(`Lauf ${batchId.slice(0, 8)} freigegeben.`)
      void ladeLaeufe()
    } catch (err) {
      log.errorWithException('Lauf-Freigabe fehlgeschlagen', err)
      setFehler('Unerwarteter Fehler bei der Freigabe.')
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
        <h2>Läufe dieses Monats</h2>
        <p className="admin-subtitle">
          Jeder Lauf trägt eine eigene Kennung. Unter ihr steht er im Revisionsprotokoll —
          und an ihr hängt auch die Sperre: pro Monat läuft höchstens einer.
        </p>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Lauf</th><th>Status</th><th>Gestartet</th><th>Laufzeit</th>
              <th>Gruppen</th><th>Summe</th><th></th>
            </tr>
          </thead>
          <tbody>
            {laeufe.length === 0 && (
              <EmptyRow colSpan={7}>Für {month} wurde noch kein Lauf gestartet.</EmptyRow>
            )}
            {laeufe.map(l => (
              <tr key={l.id}>
                <td>
                  <code>{l.id.slice(0, 8)}</code>
                  {l.versuch > 1 && (
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                      {l.versuch}. Versuch
                    </div>
                  )}
                </td>
                <td>
                  {STATUS_LABELS[l.status]}
                  {l.festschreiben && (
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>festschreibend</div>
                  )}
                  {l.abbruchgrund && (
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>{l.abbruchgrund}</div>
                  )}
                </td>
                <td>{zeitpunkt(l.gestartetAm)}</td>
                <td>{laufzeit(l.laufzeitMs)}</td>
                <td>
                  {l.gruppenErstellt} erstellt · {l.gruppenUebersprungen} übersprungen
                  {l.gruppenFehlgeschlagen > 0 && ` · ${l.gruppenFehlgeschlagen} fehlgeschlagen`}
                  {l.gruppenOffen > 0 && ` · ${l.gruppenOffen} offen`}
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                    von {l.gruppenGesamt} Gruppe(n)
                  </div>
                </td>
                <td>{euro(l.summeCent / 100)}</td>
                <td>
                  {l.status === 'laeuft' && (
                    <button className="admin-btn" onClick={() => void gibLaufFrei(l.id)}>
                      Freigeben
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
