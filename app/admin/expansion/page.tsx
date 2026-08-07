'use client'
// ═══════════════════════════════════════════════════════════════
// EXPANSION DEUTSCHLAND — Freischaltungs-Matrix
// ═══════════════════════════════════════════════════════════════
// Eine Zeile je Bundesland. Was hier steht, gilt in der gesamten
// Plattform: Kundenapp, Native-App, Buchungsstrecke, Abrechnung.
// Es gibt keine zweite Stelle mehr, an der ein Bundesland
// freigeschaltet wird.
//
// Werbung, Registrierung, Warteliste und Privatleistungen sind
// jederzeit schaltbar. Die Kassenabrechnung ist die einzige
// Ausnahme: sie verlangt einen hinterlegten Anerkennungsbescheid
// und schaltet dann mit EINEM Klick alle fünf Kassenmodule frei.
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'
import {
  BUNDESLAND_NAMEN,
  EXPANSION_STATUS,
  KASSEN_MODULE,
  MODUL_LABELS,
  STATUS_META,
  type BundeslandCode,
  type ExpansionStatus,
  type StateSettings,
} from '@/lib/expansion/types'

type WartelisteMap = Record<string, { gesamt: number; offen: number }>

const SCHALTBAR = [
  'marketing_enabled',
  'registration_enabled',
  'waitinglist_enabled',
  'private_enabled',
] as const
type SchaltbaresFeld = (typeof SCHALTBAR)[number]

// Status, die ohne Bescheid gesetzt werden dürfen (ANERKANNT nur per Freischaltung)
const FREIE_STATUS = EXPANSION_STATUS.filter(s => s !== 'ANERKANNT')

export default function AdminExpansionPage() {
  const [zeilen, setZeilen] = useState<StateSettings[]>([])
  const [warteliste, setWarteliste] = useState<WartelisteMap>({})
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [erfolg, setErfolg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [aktivierung, setAktivierung] = useState<StateSettings | null>(null)
  const [abschaltung, setAbschaltung] = useState<StateSettings | null>(null)
  const [details, setDetails] = useState<BundeslandCode | null>(null)

  const laden_ = useCallback(async () => {
    setLaden(true)
    setFehler(null)
    try {
      const res = await fetch('/api/expansion/states', { headers: { Accept: 'application/json' } })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFehler(json?.error || 'Matrix konnte nicht geladen werden.')
        setZeilen([])
        return
      }
      setZeilen(json.bundeslaender || [])
      setWarteliste(json.warteliste || {})
    } catch {
      setFehler('Netzwerkfehler beim Laden der Freischaltungs-Matrix.')
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => { laden_() }, [laden_])

  async function patch(bundesland: BundeslandCode, payload: Record<string, unknown>) {
    setBusy(bundesland)
    setFehler(null)
    setErfolg(null)
    try {
      const res = await fetch('/api/expansion/states', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundesland, ...payload }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFehler(json?.error || 'Änderung fehlgeschlagen.')
        return
      }
      await laden_()
    } catch {
      setFehler('Netzwerkfehler beim Speichern.')
    } finally {
      setBusy(null)
    }
  }

  const kennzahlen = useMemo(() => {
    const aktiv = zeilen.filter(z => z.insurance_enabled).length
    const privat = zeilen.filter(z => z.private_enabled).length
    const imVerfahren = zeilen.filter(
      z => z.status === 'ANTRAG_EINGEREICHT' || z.status === 'IN_PRUEFUNG'
    ).length
    const offeneLeads = Object.values(warteliste).reduce((s, w) => s + w.offen, 0)
    return { aktiv, privat, imVerfahren, offeneLeads }
  }, [zeilen, warteliste])

  const detailZeile = details ? zeilen.find(z => z.bundesland === details) ?? null : null

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Expansion Deutschland</h1>
          <p className="admin-subtitle">
            Freischaltung je Bundesland · {zeilen.length} Länder ·{' '}
            {kennzahlen.aktiv} mit Kassenabrechnung · {kennzahlen.privat} mit Privatleistungen
          </p>
        </div>
        <button onClick={laden_} style={secondaryBtn} disabled={laden}>
          {laden ? 'Lädt…' : 'Aktualisieren'}
        </button>
      </div>

      {fehler && <Banner tone="danger">{fehler}</Banner>}
      {erfolg && <Banner tone="info">{erfolg}</Banner>}

      <Banner tone="info">
        Werbung, Registrierung, Warteliste und Privatleistungen laufen unabhängig von der
        Anerkennung. Nur die Kassenabrechnung setzt einen Anerkennungsbescheid voraus —
        sie schaltet dann mit einem Klick Kassentarife, Budgetprüfung, Kassenrechnungen,
        digitale Leistungsnachweise und den Dakota-Export frei.
      </Banner>

      <div style={kachelReihe}>
        <Kachel titel="Kassenabrechnung aktiv" wert={kennzahlen.aktiv} von={zeilen.length} />
        <Kachel titel="Privatleistungen aktiv" wert={kennzahlen.privat} von={zeilen.length} />
        <Kachel titel="Verfahren laufend" wert={kennzahlen.imVerfahren} von={zeilen.length} />
        <Kachel titel="Warteliste offen" wert={kennzahlen.offeneLeads} />
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Bundesland</th>
              <th>Status</th>
              <th style={zentriert}>Werbung</th>
              <th style={zentriert}>Registrierung</th>
              <th style={zentriert}>Warteliste</th>
              <th style={zentriert}>Privat&shy;leistungen</th>
              <th style={zentriert}>Kassen&shy;abrechnung</th>
              <th>GO-Live</th>
              <th style={zentriert}>Warte&shy;liste</th>
              <th>Bemerkungen</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {laden ? (
              <EmptyRow colSpan={11}>Lädt…</EmptyRow>
            ) : zeilen.length === 0 ? (
              <EmptyRow colSpan={11}>
                Keine Daten. Ist die Migration 20260808100000_expansion_deutschland.sql
                angewendet?
              </EmptyRow>
            ) : (
              zeilen.map(z => {
                const meta = STATUS_META[z.status] ?? STATUS_META.VORBEREITUNG
                const wl = warteliste[z.bundesland]
                const gesperrt = busy === z.bundesland
                return (
                  <tr key={z.bundesland} style={z.insurance_enabled ? zeileAktiv : undefined}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {BUNDESLAND_NAMEN[z.bundesland] ?? z.bundesland}
                    </td>
                    <td>
                      <select
                        value={z.status}
                        disabled={gesperrt || z.status === 'ANERKANNT'}
                        onChange={e => patch(z.bundesland, { status: e.target.value as ExpansionStatus })}
                        style={{ ...input, minWidth: 160, borderColor: meta.color }}
                        title={
                          z.status === 'ANERKANNT'
                            ? 'Anerkannte Länder werden über „Kasse abschalten" zurückgesetzt.'
                            : undefined
                        }
                      >
                        {(z.status === 'ANERKANNT' ? EXPANSION_STATUS : FREIE_STATUS).map(s => (
                          <option key={s} value={s}>{STATUS_META[s].label}</option>
                        ))}
                      </select>
                    </td>

                    {SCHALTBAR.map(feld => (
                      <td key={feld} style={zentriert}>
                        <Schalter
                          an={z[feld] as boolean}
                          disabled={gesperrt}
                          titel={MODUL_LABELS[feld as SchaltbaresFeld]}
                          onChange={wert => patch(z.bundesland, { [feld]: wert })}
                        />
                      </td>
                    ))}

                    <td style={zentriert}>
                      <span
                        title={
                          z.insurance_enabled
                            ? 'Freigeschaltet — alle Kassenmodule aktiv'
                            : 'Nicht freigeschaltet — Anerkennungsbescheid erforderlich'
                        }
                        style={{
                          fontSize: 18,
                          color: z.insurance_enabled ? '#3E8E5A' : 'var(--ink5)',
                        }}
                      >
                        {z.insurance_enabled ? '☑' : '☐'}
                      </span>
                    </td>

                    <td>
                      <input
                        type="date"
                        value={z.effective_date ?? ''}
                        disabled={gesperrt}
                        onChange={e =>
                          patch(z.bundesland, { effective_date: e.target.value || null })
                        }
                        style={{ ...input, width: 148 }}
                      />
                    </td>

                    <td style={zentriert}>
                      {wl ? (
                        <span title={`${wl.gesamt} gesamt, ${wl.offen} noch nicht benachrichtigt`}>
                          {wl.offen}/{wl.gesamt}
                        </span>
                      ) : '—'}
                    </td>

                    <td style={{ maxWidth: 260 }}>
                      <span style={notizText} title={z.notes ?? ''}>
                        {z.notes || '—'}
                      </span>
                    </td>

                    <td style={{ whiteSpace: 'nowrap' }}>
                      {z.insurance_enabled ? (
                        <button
                          onClick={() => setAbschaltung(z)}
                          disabled={gesperrt}
                          style={{ ...miniBtn, color: '#D04B3B' }}
                        >
                          Kasse abschalten
                        </button>
                      ) : (
                        <button
                          onClick={() => setAktivierung(z)}
                          disabled={gesperrt}
                          style={aktivierenBtn}
                        >
                          Kassenabrechnung aktivieren
                        </button>
                      )}
                      <button onClick={() => setDetails(z.bundesland)} style={miniBtn}>
                        Details
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14 }}>
        <StatusBadge label="Legende" color="#8A8177" />{' '}
        <span style={{ fontSize: 12, color: 'var(--ink4)' }}>
          ☑ aktiv · ☐ inaktiv · Warteliste-Spalte: „offen / gesamt" (offen = noch nicht benachrichtigt)
        </span>
      </div>

      {aktivierung && (
        <AktivierungsDialog
          zeile={aktivierung}
          wartelisteOffen={warteliste[aktivierung.bundesland]?.offen ?? 0}
          onAbbrechen={() => setAktivierung(null)}
          onFertig={meldung => {
            setAktivierung(null)
            setErfolg(meldung)
            laden_()
          }}
          onFehler={setFehler}
        />
      )}

      {abschaltung && (
        <AbschaltungsDialog
          zeile={abschaltung}
          onAbbrechen={() => setAbschaltung(null)}
          onFertig={meldung => {
            setAbschaltung(null)
            setErfolg(meldung)
            laden_()
          }}
          onFehler={setFehler}
        />
      )}

      {detailZeile && (
        <DetailDialog
          zeile={detailZeile}
          onSchliessen={() => setDetails(null)}
          onSpeichern={async payload => {
            await patch(detailZeile.bundesland, payload)
            setDetails(null)
          }}
        />
      )}
    </div>
  )
}

// ── Ein-Klick-Freischaltung ─────────────────────────────────────

function AktivierungsDialog({
  zeile, wartelisteOffen, onAbbrechen, onFertig, onFehler,
}: {
  zeile: StateSettings
  wartelisteOffen: number
  onAbbrechen: () => void
  onFertig: (meldung: string) => void
  onFehler: (fehler: string) => void
}) {
  const [bescheid, setBescheid] = useState(zeile.approval_document ?? '')
  const [aktenzeichen, setAktenzeichen] = useState(zeile.approval_reference ?? '')
  const [behoerde, setBehoerde] = useState(zeile.approval_authority ?? '')
  const [anerkanntAm, setAnerkanntAm] = useState(zeile.anerkannt_am ?? '')
  const [goLive, setGoLive] = useState(zeile.effective_date ?? '')
  const [laeuft, setLaeuft] = useState(false)

  const land = BUNDESLAND_NAMEN[zeile.bundesland] ?? zeile.bundesland

  async function aktivieren() {
    if (!bescheid.trim()) {
      onFehler('Ohne Anerkennungsbescheid ist keine Freischaltung möglich.')
      return
    }
    setLaeuft(true)
    try {
      const res = await fetch(`/api/expansion/states/${zeile.bundesland}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approval_document: bescheid.trim(),
          approval_reference: aktenzeichen.trim() || null,
          approval_authority: behoerde.trim() || null,
          anerkannt_am: anerkanntAm || null,
          effective_date: goLive || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        onFehler(json?.error || 'Freischaltung fehlgeschlagen.')
        return
      }
      onFertig(
        `${land}: Kassenabrechnung freigeschaltet. Aktiviert wurden `
        + `${(json.freigeschaltete_module || []).join(', ')}.`
        + (json.warteliste_offen
          ? ` ${json.warteliste_offen} Eintrag/Einträge auf der Warteliste warten auf Benachrichtigung.`
          : '')
      )
    } catch {
      onFehler('Netzwerkfehler bei der Freischaltung.')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Dialog titel={`Kassenabrechnung freischalten — ${land}`} onSchliessen={onAbbrechen}>
      <Banner tone="warn">
        Diese Aktion schaltet mit einem Klick alle Kassenmodule frei und wird revisionssicher
        protokolliert. Sie ist nur zulässig, wenn der Anerkennungsbescheid nach §45a SGB XI
        tatsächlich vorliegt.
      </Banner>

      <div style={formGrid}>
        <label style={{ ...fieldLabel, gridColumn: '1 / -1' }}>
          Anerkennungsbescheid * <span style={hinweisText}>(Storage-Pfad oder Aktenzeichen — Pflichtfeld)</span>
          <input
            value={bescheid}
            onChange={e => setBescheid(e.target.value)}
            style={input}
            placeholder="z. B. bescheide/hessen/2026-anerkennung-45a.pdf"
            autoFocus
          />
        </label>
        <label style={fieldLabel}>
          Aktenzeichen
          <input value={aktenzeichen} onChange={e => setAktenzeichen(e.target.value)} style={input} />
        </label>
        <label style={fieldLabel}>
          Behörde
          <input
            value={behoerde}
            onChange={e => setBehoerde(e.target.value)}
            style={input}
            placeholder="z. B. Hessisches Ministerium für Soziales und Integration"
          />
        </label>
        <label style={fieldLabel}>
          Anerkannt am
          <input type="date" value={anerkanntAm} onChange={e => setAnerkanntAm(e.target.value)} style={input} />
        </label>
        <label style={fieldLabel}>
          GO-Live-Datum
          <input type="date" value={goLive} onChange={e => setGoLive(e.target.value)} style={input} />
        </label>
      </div>

      <div style={modulListe}>
        <strong style={{ fontSize: 12, color: 'var(--ink4)' }}>Wird automatisch aktiviert:</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
          {KASSEN_MODULE.map(m => <li key={m}>{MODUL_LABELS[m]}</li>)}
        </ul>
      </div>

      {wartelisteOffen > 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink4)', marginTop: 10 }}>
          {wartelisteOffen} Person(en) stehen auf der Warteliste. Der Versand der
          Benachrichtigung erfolgt bewusst NICHT automatisch — er wird nach der
          Freischaltung separat bestätigt.
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={aktivieren} disabled={laeuft || !bescheid.trim()} style={primaryBtn}>
          {laeuft ? 'Wird freigeschaltet…' : 'Kassenabrechnung aktivieren'}
        </button>
        <button onClick={onAbbrechen} style={secondaryBtn}>Abbrechen</button>
      </div>
    </Dialog>
  )
}

// ── Abschaltung ─────────────────────────────────────────────────

function AbschaltungsDialog({
  zeile, onAbbrechen, onFertig, onFehler,
}: {
  zeile: StateSettings
  onAbbrechen: () => void
  onFertig: (meldung: string) => void
  onFehler: (fehler: string) => void
}) {
  const [begruendung, setBegruendung] = useState('')
  const [zielStatus, setZielStatus] = useState<ExpansionStatus>('IN_PRUEFUNG')
  const [laeuft, setLaeuft] = useState(false)
  const land = BUNDESLAND_NAMEN[zeile.bundesland] ?? zeile.bundesland

  async function abschalten() {
    if (begruendung.trim().length < 10) {
      onFehler('Bitte eine Begründung mit mindestens 10 Zeichen angeben.')
      return
    }
    setLaeuft(true)
    try {
      const res = await fetch(`/api/expansion/states/${zeile.bundesland}/activate`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ begruendung: begruendung.trim(), neuer_status: zielStatus }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        onFehler(json?.error || 'Abschaltung fehlgeschlagen.')
        return
      }
      onFertig(`${land}: Kassenabrechnung abgeschaltet. ${json.hinweis ?? ''}`)
    } catch {
      onFehler('Netzwerkfehler bei der Abschaltung.')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Dialog titel={`Kassenabrechnung abschalten — ${land}`} onSchliessen={onAbbrechen}>
      <Banner tone="danger">
        Alle Kassenmodule werden zurückgesetzt. Bestehende Rechnungsentwürfe bleiben erhalten,
        können aber nicht mehr freigegeben werden. Werbung, Registrierung, Warteliste und
        Privatleistungen laufen unverändert weiter.
      </Banner>

      <label style={{ ...fieldLabel, marginTop: 12 }}>
        Begründung * <span style={hinweisText}>(wird revisionssicher protokolliert)</span>
        <textarea
          value={begruendung}
          onChange={e => setBegruendung(e.target.value)}
          style={{ ...input, minHeight: 80, resize: 'vertical' }}
          placeholder="z. B. Bescheid wurde widerrufen / versehentliche Freischaltung"
          autoFocus
        />
      </label>

      <label style={{ ...fieldLabel, marginTop: 10 }}>
        Neuer Status
        <select
          value={zielStatus}
          onChange={e => setZielStatus(e.target.value as ExpansionStatus)}
          style={input}
        >
          {FREIE_STATUS.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
      </label>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button
          onClick={abschalten}
          disabled={laeuft || begruendung.trim().length < 10}
          style={{ ...primaryBtn, background: '#D04B3B', color: '#fff' }}
        >
          {laeuft ? 'Wird abgeschaltet…' : 'Jetzt abschalten'}
        </button>
        <button onClick={onAbbrechen} style={secondaryBtn}>Abbrechen</button>
      </div>
    </Dialog>
  )
}

// ── Details / Stammdaten ────────────────────────────────────────

function DetailDialog({
  zeile, onSchliessen, onSpeichern,
}: {
  zeile: StateSettings
  onSchliessen: () => void
  onSpeichern: (payload: Record<string, unknown>) => Promise<void>
}) {
  const [form, setForm] = useState({
    antrag_eingereicht_am: zeile.antrag_eingereicht_am ?? '',
    approval_authority: zeile.approval_authority ?? '',
    approval_reference: zeile.approval_reference ?? '',
    approval_document: zeile.approval_document ?? '',
    rechtsgrundlage_land: zeile.rechtsgrundlage_land ?? '',
    ansprechpartner_name: zeile.ansprechpartner_name ?? '',
    ansprechpartner_email: zeile.ansprechpartner_email ?? '',
    ansprechpartner_telefon: zeile.ansprechpartner_telefon ?? '',
    notes: zeile.notes ?? '',
  })
  const [speichert, setSpeichert] = useState(false)
  const land = BUNDESLAND_NAMEN[zeile.bundesland] ?? zeile.bundesland

  const set = (feld: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm({ ...form, [feld]: e.target.value })

  return (
    <Dialog titel={`${land} — Stammdaten`} onSchliessen={onSchliessen}>
      {/* Zustand der fünf Kassenmodule — sonst sieht der Admin nur den
          Hauptschalter und weiß nicht, was tatsächlich aktiv ist. */}
      <div style={modulListe}>
        <strong style={{ fontSize: 12, color: 'var(--ink4)' }}>
          Kassenmodule ({zeile.insurance_enabled ? 'freigeschaltet' : 'gesperrt'})
        </strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, listStyle: 'none' }}>
          {KASSEN_MODULE.map(m => (
            <li key={m} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: zeile[m] ? '#3E8E5A' : 'var(--ink5)' }}>
                {zeile[m] ? '☑' : '☐'}
              </span>
              <span style={{ color: zeile[m] ? 'var(--ink)' : 'var(--ink5)' }}>
                {MODUL_LABELS[m]}
              </span>
            </li>
          ))}
        </ul>
        <p style={{ ...hinweisText, margin: '8px 0 0' }}>
          Diese Schalter werden ausschließlich von der Ein-Klick-Freischaltung gesetzt.
          Ein direktes Ändern in der Datenbank weist der Server ab.
        </p>
      </div>

      <div style={{ ...formGrid, marginTop: 14 }}>
        <label style={fieldLabel}>
          Antrag eingereicht am
          <input type="date" value={form.antrag_eingereicht_am} onChange={set('antrag_eingereicht_am')} style={input} />
        </label>
        <label style={fieldLabel}>
          Landesrechtliche Grundlage
          <input value={form.rechtsgrundlage_land} onChange={set('rechtsgrundlage_land')} style={input} placeholder="z. B. PfluV Hessen" />
        </label>
        <label style={{ ...fieldLabel, gridColumn: '1 / -1' }}>
          Behörde
          <input value={form.approval_authority} onChange={set('approval_authority')} style={input} />
        </label>
        <label style={fieldLabel}>
          Aktenzeichen
          <input value={form.approval_reference} onChange={set('approval_reference')} style={input} />
        </label>
        <label style={fieldLabel}>
          Bescheid (Pfad)
          <input value={form.approval_document} onChange={set('approval_document')} style={input} />
        </label>

        <label style={fieldLabel}>
          Ansprechpartner (Name)
          <input value={form.ansprechpartner_name} onChange={set('ansprechpartner_name')} style={input} placeholder="Alltagsengel" />
        </label>
        <label style={fieldLabel}>
          Ansprechpartner (E-Mail)
          <input type="email" value={form.ansprechpartner_email} onChange={set('ansprechpartner_email')} style={input} />
        </label>
        <label style={fieldLabel}>
          Ansprechpartner (Telefon)
          <input value={form.ansprechpartner_telefon} onChange={set('ansprechpartner_telefon')} style={input} />
        </label>

        <label style={{ ...fieldLabel, gridColumn: '1 / -1' }}>
          Bemerkungen
          <textarea value={form.notes} onChange={set('notes')} style={{ ...input, minHeight: 90, resize: 'vertical' }} />
        </label>
      </div>

      <p style={{ ...hinweisText, marginTop: 10 }}>
        Der Ansprechpartner wird Kundinnen und Kunden in noch nicht freigeschalteten
        Bundesländern angezeigt. Bitte keinen persönlichen Namen eintragen — Alltagsengel
        tritt gegenüber Kunden immer als Team auf.
      </p>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button
          onClick={async () => {
            setSpeichert(true)
            await onSpeichern({
              antrag_eingereicht_am: form.antrag_eingereicht_am || null,
              approval_authority: form.approval_authority || null,
              approval_reference: form.approval_reference || null,
              approval_document: form.approval_document || null,
              rechtsgrundlage_land: form.rechtsgrundlage_land || null,
              ansprechpartner_name: form.ansprechpartner_name || null,
              ansprechpartner_email: form.ansprechpartner_email || null,
              ansprechpartner_telefon: form.ansprechpartner_telefon || null,
              notes: form.notes || null,
            })
            setSpeichert(false)
          }}
          disabled={speichert}
          style={primaryBtn}
        >
          {speichert ? 'Speichern…' : 'Speichern'}
        </button>
        <button onClick={onSchliessen} style={secondaryBtn}>Schließen</button>
      </div>
    </Dialog>
  )
}

// ── Bausteine ───────────────────────────────────────────────────

function Schalter({
  an, disabled, titel, onChange,
}: {
  an: boolean
  disabled: boolean
  titel: string
  onChange: (wert: boolean) => void
}) {
  return (
    <label title={titel} style={{ cursor: disabled ? 'wait' : 'pointer', display: 'inline-flex' }}>
      <input
        type="checkbox"
        checked={an}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: 'var(--gold2)', cursor: 'inherit' }}
      />
    </label>
  )
}

function Kachel({ titel, wert, von }: { titel: string; wert: number; von?: number }) {
  return (
    <div style={kachel}>
      <div style={{ fontSize: 11, color: 'var(--ink5)', fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase' }}>
        {titel}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>
        {wert}{von !== undefined && <span style={{ fontSize: 14, color: 'var(--ink5)' }}> / {von}</span>}
      </div>
    </div>
  )
}

function Dialog({
  titel, children, onSchliessen,
}: {
  titel: string
  children: React.ReactNode
  onSchliessen: () => void
}) {
  return (
    <div
      onClick={onSchliessen}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 60,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '5vh 16px', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 14,
          padding: 22, width: '100%', maxWidth: 680,
        }}
      >
        <h3 style={{ margin: '0 0 14px', fontSize: 18 }}>{titel}</h3>
        {children}
      </div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────

const zentriert: React.CSSProperties = { textAlign: 'center' }

const zeileAktiv: React.CSSProperties = {
  background: 'rgba(62,142,90,0.07)',
}

const kachelReihe: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 12, margin: '16px 0 20px',
}

const kachel: React.CSSProperties = {
  background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12,
  padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4,
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontFamily: 'inherit',
}

const secondaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--ink)', fontWeight: 600,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontFamily: 'inherit',
}

const aktivierenBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: 'var(--coal)',
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit',
  marginRight: 6, whiteSpace: 'nowrap',
}

const miniBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--ink)',
  background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit',
  marginRight: 6,
}

const formGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12,
}

const fieldLabel: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12,
  color: 'var(--ink4)', fontWeight: 600,
}

const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 14, background: 'var(--coal)', color: 'var(--ink)',
  fontFamily: 'inherit', outline: 'none',
}

const hinweisText: React.CSSProperties = {
  fontSize: 11, fontWeight: 400, color: 'var(--ink5)',
}

const notizText: React.CSSProperties = {
  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
  overflow: 'hidden', fontSize: 12, color: 'var(--ink4)',
}

const modulListe: React.CSSProperties = {
  background: 'var(--coal)', border: '1px solid var(--border)', borderRadius: 10,
  padding: '10px 14px', marginTop: 14,
}
