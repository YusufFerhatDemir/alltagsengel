'use client'

// ═══════════════════════════════════════════════════════════════
// Manuelle Zahlungserfassung (Abrechnungskern)
// ═══════════════════════════════════════════════════════════════
//
// Schliesst Bereich 9 der Lueckenanalyse: „POST /api/billing/payments
// existiert, wird aber von keiner .tsx-Datei aufgerufen." Bargeld und
// Ueberweisungen liessen sich damit nirgends im Kern verbuchen.
//
// NICHT ZU VERWECHSELN mit dem Dialog unter /admin/zahlungskontrolle:
// der schreibt in die Alt-Tabelle `payment_status` und erzeugt weder
// payments-, noch payment_allocations-Zeilen. Dieser Dialog bucht in den
// Kern (payments → payment_allocations → invoices.paid_amount →
// dunning_entries) und hinterlaesst einen Audit-Trail.
//
// TEIL- UND UEBERZAHLUNG: Der Server ordnet hoechstens den offenen Betrag
// der Rechnung zu. Ein Ueberschuss bleibt als nicht zugeordneter
// Zahlungseingang stehen und wird hier ausgewiesen — er wird NICHT
// stillschweigend auf die Rechnung gebucht.
// ═══════════════════════════════════════════════════════════════

import { useState } from 'react'
import DialogOverlay from '@/components/DialogOverlay'
import { Banner } from '@/components/admin/OpsUI'
import { heuteBerlin } from '@/lib/utils/timezone'
import { parseBetragZuCent } from '@/lib/admin/betrag'

/**
 * Zahlungsarten exakt wie der DB-CHECK auf payments.payment_method.
 * Ein „Sonstiges" gibt es dort nicht — eine erfundene Option wuerde beim
 * Speichern an der Datenbank scheitern.
 */
const ZAHLUNGSARTEN: { wert: string; label: string }[] = [
  { wert: 'ueberweisung', label: 'Überweisung' },
  { wert: 'bar', label: 'Bar' },
  { wert: 'lastschrift', label: 'Lastschrift' },
  { wert: 'scheck', label: 'Scheck' },
  { wert: 'kassen_sammelueberweisung', label: 'Sammelüberweisung Kostenträger' },
  { wert: 'rueckzahlung', label: 'Rückzahlung' },
]

const ZAHLERTYPEN: { wert: string; label: string }[] = [
  { wert: 'kunde', label: 'Kunde' },
  { wert: 'kostentraeger', label: 'Kostenträger' },
  { wert: 'sonstiger', label: 'Sonstiger' },
]

export interface ZahlungRechnung {
  invoiceId: string
  invoiceNumber: string
  clientName: string
  /** Offener Betrag in Cent */
  offenCents: number
}

export interface ZahlungErfasstErgebnis {
  paymentId: string
  zugeordnetCents: number
  ueberzahlungCents: number
  rechnungAusgeglichen: boolean
}

function euroText(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

export default function ZahlungErfassenDialog({ rechnung, onClose, onGebucht }: {
  rechnung: ZahlungRechnung
  onClose: () => void
  onGebucht: (ergebnis: ZahlungErfasstErgebnis) => void
}) {
  const [betrag, setBetrag] = useState((rechnung.offenCents / 100).toFixed(2).replace('.', ','))
  const [datum, setDatum] = useState(heuteBerlin())
  const [zahlungsart, setZahlungsart] = useState('ueberweisung')
  const [zahlertyp, setZahlertyp] = useState('kunde')
  const [zahlerName, setZahlerName] = useState(rechnung.clientName === '—' ? '' : rechnung.clientName)
  const [referenz, setReferenz] = useState('')
  const [verwendungszweck, setVerwendungszweck] = useState(rechnung.invoiceNumber)
  const [notiz, setNotiz] = useState('')
  const [speichert, setSpeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const betragCents = parseBetragZuCent(betrag)
  const betragGueltig = Number.isFinite(betragCents) && betragCents > 0
  const differenz = betragGueltig ? betragCents - rechnung.offenCents : 0

  async function speichern() {
    setFehler(null)
    if (!betragGueltig) { setFehler('Bitte einen Betrag größer als 0,00 € eingeben.'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) { setFehler('Bitte ein gültiges Zahlungsdatum wählen.'); return }

    setSpeichert(true)
    try {
      const res = await fetch('/api/billing/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: rechnung.invoiceId,
          paymentDate: datum,
          amountCents: betragCents,
          paymentMethod: zahlungsart,
          payerType: zahlertyp,
          payerName: zahlerName || undefined,
          payerReference: referenz || undefined,
          bankReference: referenz || undefined,
          verwendungszweck: verwendungszweck || undefined,
          notes: notiz || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setFehler(json?.error || 'Zahlung konnte nicht gebucht werden.')
        setSpeichert(false)
        return
      }
      onGebucht({
        paymentId: json.paymentId,
        zugeordnetCents: json.zugeordnetCents ?? betragCents,
        ueberzahlungCents: json.ueberzahlungCents ?? 0,
        rechnungAusgeglichen: json.rechnungAusgeglichen ?? false,
      })
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unerwarteter Fehler.')
      setSpeichert(false)
    }
  }

  return (
    <DialogOverlay onClose={onClose}>
      <div
        role="dialog"
        aria-label="Zahlung buchen"
        aria-modal="true"
        className="admin-modal"
        style={{ maxWidth: 480, width: '94%' }}
        onClick={e => e.stopPropagation()}
      >
        <h3>Zahlung buchen</h3>
        <p style={{ fontSize: 13, color: 'var(--ink4)', margin: '0 0 14px' }}>
          {rechnung.invoiceNumber} · {rechnung.clientName} · offen: <strong>{euroText(rechnung.offenCents)}</strong>
        </p>

        {fehler && <Banner tone="danger">{fehler}</Banner>}

        <Feld label="Betrag (€) *" hinweis="Bar, Überweisung oder Sonstiges — der Betrag wird auf diese Rechnung gebucht.">
          <input
            value={betrag}
            onChange={e => setBetrag(e.target.value)}
            inputMode="decimal"
            style={eingabe}
            aria-describedby="zahlung-differenz"
          />
        </Feld>

        <p id="zahlung-differenz" style={{ fontSize: 12, margin: '-4px 0 12px', minHeight: 16, color: differenz > 0 ? '#E8A000' : differenz < 0 ? 'var(--ink4)' : '#2D8F5E' }}>
          {!betragGueltig ? '' :
            differenz > 0 ? `Überzahlung von ${euroText(differenz)} — bleibt als nicht zugeordneter Zahlungseingang stehen.` :
            differenz < 0 ? `Teilzahlung — danach bleiben ${euroText(-differenz)} offen.` :
            'Vollzahlung — die Rechnung wird ausgeglichen.'}
        </p>

        <Feld label="Zahlungsdatum *">
          <input type="date" value={datum} onChange={e => setDatum(e.target.value)} style={eingabe} />
        </Feld>

        <Feld label="Zahlungsart *">
          <select value={zahlungsart} onChange={e => setZahlungsart(e.target.value)} style={eingabe}>
            {ZAHLUNGSARTEN.map(z => <option key={z.wert} value={z.wert}>{z.label}</option>)}
          </select>
        </Feld>

        <Feld label="Zahler">
          <select value={zahlertyp} onChange={e => setZahlertyp(e.target.value)} style={{ ...eingabe, marginBottom: 6 }}>
            {ZAHLERTYPEN.map(z => <option key={z.wert} value={z.wert}>{z.label}</option>)}
          </select>
          <input value={zahlerName} onChange={e => setZahlerName(e.target.value)} placeholder="Name des Zahlers" style={eingabe} />
        </Feld>

        <Feld label="Referenz" hinweis="Belegnummer, Kontoauszugs-Referenz oder Quittungsnummer.">
          <input value={referenz} onChange={e => setReferenz(e.target.value)} style={eingabe} />
        </Feld>

        <Feld label="Verwendungszweck">
          <input value={verwendungszweck} onChange={e => setVerwendungszweck(e.target.value)} style={eingabe} />
        </Feld>

        <Feld label="Notiz">
          <input value={notiz} onChange={e => setNotiz(e.target.value)} style={eingabe} />
        </Feld>

        <div className="admin-modal-btns" style={{ marginTop: 14 }}>
          <button className="btn-cancel" onClick={onClose} disabled={speichert}>Abbrechen</button>
          <button className="btn-confirm" onClick={speichern} disabled={speichert || !betragGueltig}>
            {speichert ? 'Buche…' : 'Zahlung buchen'}
          </button>
        </div>
      </div>
    </DialogOverlay>
  )
}

function Feld({ label, hinweis, children }: { label: string; hinweis?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>{label}</span>
      {hinweis && <span style={{ display: 'block', fontSize: 11, color: 'var(--ink5)', marginTop: 2 }}>{hinweis}</span>}
      <div style={{ marginTop: 3 }}>{children}</div>
    </label>
  )
}

const eingabe: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box',
}
