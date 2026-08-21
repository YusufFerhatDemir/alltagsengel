'use client'
// ═══════════════════════════════════════════════════════════════
// EXPANSION DEUTSCHLAND — Dashboard aller 16 Bundesländer
// ═══════════════════════════════════════════════════════════════
// Was hier steht, gilt in der gesamten Plattform: Kundenapp,
// Native-App, Buchungsstrecke, Abrechnung. Es gibt keine zweite
// Stelle, an der ein Bundesland freigeschaltet wird.
//
// Zwei Ansichten auf dieselben Daten:
//   Kacheln  — Überblick, wo wir stehen und was als Nächstes fehlt
//   Tabelle  — Bearbeiten der einzelnen Schalter
//
// Werbung, Registrierung, Warteliste und Privatleistungen sind
// jederzeit schaltbar. Die Kassenabrechnung ist die einzige
// Ausnahme: sie verlangt einen Anerkennungsbescheid UND vorbereitete
// Tarife — und schaltet dann mit einem Klick alles frei.
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'
import { useBundeslandFilter } from '@/components/admin/BundeslandContext'
import {
import DialogOverlay from '@/components/DialogOverlay'
  ALLE_BUNDESLAENDER,
  BUNDESLAND_NAMEN,
  EXPANSION_STATUS,
  KASSEN_MODULE,
  MODUL_LABELS,
  STATUS_META,
  type BundeslandCode,
  type ExpansionStatus,
  type StateDashboardZeile,
} from '@/lib/expansion/types'

const SCHALTBAR = [
  'marketing_enabled',
  'registration_enabled',
  'waitinglist_enabled',
  'private_enabled',
] as const

const FREIE_STATUS = EXPANSION_STATUS.filter(s => s !== 'ANERKANNT')

type Ansicht = 'kacheln' | 'tabelle'

/** Fehlende Voraussetzungen für die Freischaltung — in Klartext. */
function fehlendeVoraussetzungen(z: StateDashboardZeile): string[] {
  const offen: string[] = []
  if (!z.approval_document) offen.push('Anerkennungsbescheid')
  if ((z.kassentarife_gesamt ?? 0) === 0) offen.push('Kassentarife')
  return offen
}

export default function AdminExpansionPage() {
  const [zeilen, setZeilen] = useState<StateDashboardZeile[]>([])
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [erfolg, setErfolg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [ansicht, setAnsicht] = useState<Ansicht>('kacheln')

  const [aktivierung, setAktivierung] = useState<StateDashboardZeile | null>(null)
  const [abschaltung, setAbschaltung] = useState<StateDashboardZeile | null>(null)
  const [details, setDetails] = useState<BundeslandCode | null>(null)

  const { aktiv: filterLand, alle: alleLaender, setAktiv } = useBundeslandFilter()

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
      if (json.dashboard === false) {
        setFehler(
          'Die Dashboard-Kennzahlen fehlen (Migration 20260808130000 noch nicht angewendet). '
          + 'Status und Schalter funktionieren, Tarif- und Wartelistenzahlen bleiben leer.'
        )
      }
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
    const kasse = zeilen.filter(z => z.insurance_enabled).length
    const privat = zeilen.filter(z => z.private_enabled).length
    const verfahren = zeilen.filter(
      z => z.status === 'ANTRAG_EINGEREICHT' || z.status === 'IN_PRUEFUNG'
    ).length
    const startklar = zeilen.filter(z => !z.insurance_enabled && z.freischaltbar).length
    const leads = zeilen.reduce((s, z) => s + (z.warteliste_offen ?? 0), 0)
    const klienten = zeilen.reduce((s, z) => s + (z.klienten ?? 0), 0)
    const ohnePlz = zeilen.reduce((s, z) => s + (z.klienten_ohne_plz ?? 0), 0)
    return { kasse, privat, verfahren, startklar, leads, klienten, ohnePlz }
  }, [zeilen])

  // Der globale Umschalter hebt eine einzelne Kachel hervor, blendet aber
  // nichts aus: das Dashboard soll immer alle 16 Länder zeigen.
  const sichtbar = zeilen
  const detailZeile = details ? zeilen.find(z => z.bundesland === details) ?? null : null

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Expansion Deutschland</h1>
          <p className="admin-subtitle">
            {zeilen.length} Bundesländer · {kennzahlen.kasse} mit Kassenabrechnung ·{' '}
            {kennzahlen.privat} mit Privatleistungen · {kennzahlen.leads} offene Vormerkungen
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={ansichtUmschalter}>
            {(['kacheln', 'tabelle'] as Ansicht[]).map(a => (
              <button
                key={a}
                onClick={() => setAnsicht(a)}
                style={{
                  ...ansichtBtn,
                  background: ansicht === a ? 'var(--gold2)' : 'transparent',
                  color: ansicht === a ? 'var(--coal)' : 'var(--ink4)',
                }}
              >
                {a === 'kacheln' ? 'Kacheln' : 'Tabelle'}
              </button>
            ))}
          </div>
          <button onClick={laden_} style={secondaryBtn} disabled={laden}>
            {laden ? 'Lädt…' : 'Aktualisieren'}
          </button>
        </div>
      </div>

      {fehler && <Banner tone="danger">{fehler}</Banner>}
      {erfolg && <Banner tone="info">{erfolg}</Banner>}

      <Banner tone="info">
        Werbung, Registrierung, Warteliste und Privatleistungen laufen unabhängig von der
        Anerkennung. Die Kassenabrechnung verlangt einen hinterlegten Anerkennungsbescheid
        <strong> und</strong> vorbereitete Kassentarife — und schaltet dann mit einem Klick
        Kassentarife, Budgetprüfung, Kassenrechnungen, digitale Leistungsnachweise,
        Dakota-Export und die Landesregeln frei.
      </Banner>

      <div style={kachelReihe}>
        <Kachel titel="Kassenabrechnung aktiv" wert={kennzahlen.kasse} von={zeilen.length} ton="gruen" />
        <Kachel titel="Startklar (Bescheid + Tarife)" wert={kennzahlen.startklar} ton="gold" />
        <Kachel titel="Verfahren laufend" wert={kennzahlen.verfahren} von={zeilen.length} />
        <Kachel titel="Privatleistungen aktiv" wert={kennzahlen.privat} von={zeilen.length} />
        <Kachel titel="Warteliste offen" wert={kennzahlen.leads} />
        <Kachel
          titel="Klienten ohne zuordenbare PLZ"
          wert={kennzahlen.ohnePlz}
          von={kennzahlen.klienten}
          ton={kennzahlen.ohnePlz > 0 ? 'rot' : undefined}
        />
      </div>

      {kennzahlen.ohnePlz > 0 && (
        <Banner tone="warn">
          {kennzahlen.ohnePlz} Klient(en) haben keine eindeutig zuordenbare Postleitzahl.
          Für sie lässt sich keine Kassenrechnung freigeben, solange das nicht behoben ist —
          Rechnungsentwürfe bleiben davon unberührt.
        </Banner>
      )}

      {laden ? (
        <p style={{ color: 'var(--ink4)', fontSize: 14 }}>Lädt…</p>
      ) : zeilen.length === 0 ? (
        <Banner tone="warn">
          Keine Daten. Ist die Migration 20260808100000_expansion_deutschland.sql angewendet?
        </Banner>
      ) : ansicht === 'kacheln' ? (
        <div style={landkarte}>
          {sichtbar.map(z => (
            <LandKachel
              key={z.bundesland}
              zeile={z}
              hervorgehoben={!alleLaender && z.bundesland === filterLand}
              busy={busy === z.bundesland}
              onAktivieren={() => setAktivierung(z)}
              onAbschalten={() => setAbschaltung(z)}
              onDetails={() => setDetails(z.bundesland)}
              onFokus={() => setAktiv(z.bundesland === filterLand ? ALLE_BUNDESLAENDER : z.bundesland)}
            />
          ))}
        </div>
      ) : (
        <MatrixTabelle
          zeilen={sichtbar}
          busy={busy}
          hervorgehoben={alleLaender ? null : filterLand}
          onPatch={patch}
          onAktivieren={setAktivierung}
          onAbschalten={setAbschaltung}
          onDetails={setDetails}
        />
      )}

      {aktivierung && (
        <AktivierungsDialog
          zeile={aktivierung}
          onAbbrechen={() => setAktivierung(null)}
          onFertig={meldung => { setAktivierung(null); setErfolg(meldung); laden_() }}
          onFehler={setFehler}
        />
      )}

      {abschaltung && (
        <AbschaltungsDialog
          zeile={abschaltung}
          onAbbrechen={() => setAbschaltung(null)}
          onFertig={meldung => { setAbschaltung(null); setErfolg(meldung); laden_() }}
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

// ── Kachelansicht ───────────────────────────────────────────────

function LandKachel({
  zeile, hervorgehoben, busy, onAktivieren, onAbschalten, onDetails, onFokus,
}: {
  zeile: StateDashboardZeile
  hervorgehoben: boolean
  busy: boolean
  onAktivieren: () => void
  onAbschalten: () => void
  onDetails: () => void
  onFokus: () => void
}) {
  const meta = STATUS_META[zeile.status] ?? STATUS_META.VORBEREITUNG
  const offen = fehlendeVoraussetzungen(zeile)
  const startklar = !zeile.insurance_enabled && zeile.freischaltbar

  return (
    <div
      style={{
        ...kachelKarte,
        borderColor: hervorgehoben ? 'var(--gold2)' : 'var(--border)',
        borderWidth: hervorgehoben ? 2 : 1,
        background: zeile.insurance_enabled ? 'rgba(62,142,90,0.07)' : 'var(--coal2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <button
          onClick={onFokus}
          title={hervorgehoben ? 'Fokus aufheben' : 'Als aktives Bundesland setzen'}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
            color: hervorgehoben ? 'var(--gold2)' : 'var(--ink)', textAlign: 'left',
          }}
        >
          {zeile.bundesland_label ?? BUNDESLAND_NAMEN[zeile.bundesland]}
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink5)' }}>
          {zeile.iso_code}
        </span>
      </div>

      <div style={{ margin: '2px 0 8px' }}>
        <StatusBadge label={meta.label} color={meta.color} />
      </div>

      {/* Vier unabhängige Module */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {SCHALTBAR.map(feld => (
          <span
            key={feld}
            title={MODUL_LABELS[feld]}
            style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 999,
              border: '1px solid var(--border)',
              background: zeile[feld] ? 'rgba(201,150,60,0.16)' : 'transparent',
              color: zeile[feld] ? 'var(--gold2)' : 'var(--ink5)',
              fontWeight: 600,
            }}
          >
            {zeile[feld] ? '✓ ' : '· '}{MODUL_LABELS[feld]}
          </span>
        ))}
      </div>

      {/* Kassenabrechnung */}
      <div style={{
        borderTop: '1px solid var(--border)', paddingTop: 8, marginBottom: 8,
        fontSize: 12, color: 'var(--ink4)',
      }}>
        {zeile.insurance_enabled ? (
          <span style={{ color: '#3E8E5A', fontWeight: 700 }}>
            ☑ Kassenabrechnung — alle 5 Module aktiv
          </span>
        ) : startklar ? (
          <span style={{ color: 'var(--gold2)', fontWeight: 700 }}>
            ☐ Kassenabrechnung — startklar
          </span>
        ) : (
          <span>☐ Kassenabrechnung — es fehlt: {offen.join(' und ')}</span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11, color: 'var(--ink4)', marginBottom: 10 }}>
        <span>Kassentarife: <strong>{zeile.kassentarife_aktiv ?? 0}/{zeile.kassentarife_gesamt ?? 0}</strong></span>
        <span>Landesregeln: <strong>{zeile.landesregeln_aktiv ?? 0}</strong></span>
        <span>Warteliste: <strong>{zeile.warteliste_offen ?? 0}</strong></span>
        <span>Klienten: <strong>{zeile.klienten ?? 0}</strong></span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        {zeile.insurance_enabled ? (
          <button onClick={onAbschalten} disabled={busy} style={{ ...miniBtn, color: '#D04B3B' }}>
            Kasse abschalten
          </button>
        ) : (
          <button
            onClick={onAktivieren}
            disabled={busy}
            style={{ ...aktivierenBtn, opacity: startklar ? 1 : 0.55 }}
            title={startklar ? 'Kassenabrechnung freischalten' : `Es fehlt: ${offen.join(', ')}`}
          >
            Freischalten
          </button>
        )}
        <button onClick={onDetails} style={miniBtn}>Details</button>
      </div>
    </div>
  )
}

// ── Tabellenansicht ─────────────────────────────────────────────

function MatrixTabelle({
  zeilen, busy, hervorgehoben, onPatch, onAktivieren, onAbschalten, onDetails,
}: {
  zeilen: StateDashboardZeile[]
  busy: string | null
  hervorgehoben: string | null
  onPatch: (bundesland: BundeslandCode, payload: Record<string, unknown>) => void
  onAktivieren: (z: StateDashboardZeile) => void
  onAbschalten: (z: StateDashboardZeile) => void
  onDetails: (b: BundeslandCode) => void
}) {
  return (
    <>
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
              <th style={zentriert}>Tarife</th>
              <th>GO-Live</th>
              <th style={zentriert}>Warte&shy;liste</th>
              <th>Bemerkungen</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.length === 0 ? (
              <EmptyRow colSpan={12}>Keine Daten</EmptyRow>
            ) : zeilen.map(z => {
              const meta = STATUS_META[z.status] ?? STATUS_META.VORBEREITUNG
              const gesperrt = busy === z.bundesland
              const startklar = !z.insurance_enabled && z.freischaltbar
              return (
                <tr
                  key={z.bundesland}
                  style={
                    z.bundesland === hervorgehoben
                      ? { outline: '2px solid var(--gold2)', outlineOffset: -2 }
                      : z.insurance_enabled ? zeileAktiv : undefined
                  }
                >
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {z.bundesland_label ?? BUNDESLAND_NAMEN[z.bundesland]}
                  </td>
                  <td>
                    <select
                      value={z.status}
                      disabled={gesperrt || z.status === 'ANERKANNT'}
                      onChange={e => onPatch(z.bundesland, { status: e.target.value as ExpansionStatus })}
                      style={{ ...input, minWidth: 160, borderColor: meta.color }}
                      title={z.status === 'ANERKANNT'
                        ? 'Anerkannte Länder werden über „Kasse abschalten" zurückgesetzt.'
                        : undefined}
                    >
                      {(z.status === 'ANERKANNT' ? EXPANSION_STATUS : FREIE_STATUS).map(s => (
                        <option key={s} value={s}>{STATUS_META[s].label}</option>
                      ))}
                    </select>
                  </td>

                  {SCHALTBAR.map(feld => (
                    <td key={feld} style={zentriert}>
                      <label title={MODUL_LABELS[feld]} style={{ cursor: gesperrt ? 'wait' : 'pointer', display: 'inline-flex' }}>
                        <input
                          type="checkbox"
                          checked={z[feld] as boolean}
                          disabled={gesperrt}
                          onChange={e => onPatch(z.bundesland, { [feld]: e.target.checked })}
                          style={{ width: 16, height: 16, accentColor: 'var(--gold2)', cursor: 'inherit' }}
                        />
                      </label>
                    </td>
                  ))}

                  <td style={zentriert}>
                    <span
                      title={z.insurance_enabled
                        ? 'Freigeschaltet — alle Kassenmodule aktiv'
                        : `Nicht freigeschaltet — es fehlt: ${fehlendeVoraussetzungen(z).join(', ') || 'nichts'}`}
                      style={{ fontSize: 18, color: z.insurance_enabled ? '#3E8E5A' : startklar ? 'var(--gold2)' : 'var(--ink5)' }}
                    >
                      {z.insurance_enabled ? '☑' : '☐'}
                    </span>
                  </td>

                  <td style={{ ...zentriert, fontSize: 12 }} title="aktive / vorbereitete Kassentarife">
                    {z.kassentarife_aktiv ?? 0}/{z.kassentarife_gesamt ?? 0}
                  </td>

                  <td>
                    <input
                      type="date"
                      value={z.effective_date ?? ''}
                      disabled={gesperrt}
                      onChange={e => onPatch(z.bundesland, { effective_date: e.target.value || null })}
                      style={{ ...input, width: 148 }}
                    />
                  </td>

                  <td style={zentriert}>
                    <span title={`${z.warteliste_gesamt ?? 0} gesamt, ${z.warteliste_offen ?? 0} offen`}>
                      {z.warteliste_offen ?? 0}/{z.warteliste_gesamt ?? 0}
                    </span>
                  </td>

                  <td style={{ maxWidth: 240 }}>
                    <span style={notizText} title={z.notes ?? ''}>{z.notes || '—'}</span>
                  </td>

                  <td style={{ whiteSpace: 'nowrap' }}>
                    {z.insurance_enabled ? (
                      <button onClick={() => onAbschalten(z)} disabled={gesperrt} style={{ ...miniBtn, color: '#D04B3B' }}>
                        Kasse abschalten
                      </button>
                    ) : (
                      <button
                        onClick={() => onAktivieren(z)}
                        disabled={gesperrt}
                        style={{ ...aktivierenBtn, opacity: startklar ? 1 : 0.55 }}
                        title={startklar ? undefined : `Es fehlt: ${fehlendeVoraussetzungen(z).join(', ')}`}
                      >
                        Kassenabrechnung aktivieren
                      </button>
                    )}
                    <button onClick={() => onDetails(z.bundesland)} style={miniBtn}>Details</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14, fontSize: 12, color: 'var(--ink4)' }}>
        ☑ aktiv · ☐ inaktiv · Tarife-Spalte: „aktiv / vorbereitet" ·
        Warteliste-Spalte: „offen / gesamt"
      </div>
    </>
  )
}

// ── Ein-Klick-Freischaltung ─────────────────────────────────────

function AktivierungsDialog({
  zeile, onAbbrechen, onFertig, onFehler,
}: {
  zeile: StateDashboardZeile
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

  const land = zeile.bundesland_label ?? BUNDESLAND_NAMEN[zeile.bundesland]
  const tarifeFehlen = (zeile.kassentarife_gesamt ?? 0) === 0

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
      const e = json.ergebnis || {}
      onFertig(
        `${land}: Kassenabrechnung freigeschaltet. `
        + `${(json.freigeschaltete_module || []).join(', ')}. `
        + `${e.tarife_aktiviert ?? 0} Tarif(e) und ${e.regeln_aktiviert ?? 0} Landesregel(n) scharf geschaltet.`
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
        Diese Aktion schaltet mit einem Klick alle Kassenmodule, die vorbereiteten
        Kassentarife und die Landesregeln frei. Sie wird revisionssicher protokolliert
        und ist nur zulässig, wenn der Anerkennungsbescheid nach §45a SGB XI vorliegt.
      </Banner>

      {tarifeFehlen && (
        <Banner tone="danger">
          Für {land} ist kein Kassentarif vorbereitet. Die Freischaltung wird von der
          Datenbank abgewiesen — bitte zuerst unter „Leistungspreise" bzw. in
          billing_tariffs mindestens einen gültigen Kassentarif anlegen.
        </Banner>
      )}

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
          <input value={behoerde} onChange={e => setBehoerde(e.target.value)} style={input} />
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
          <li>{zeile.kassentarife_gesamt ?? 0} vorbereitete Kassentarife</li>
          <li>Landesregeln des Bundeslands</li>
        </ul>
      </div>

      {(zeile.warteliste_offen ?? 0) > 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink4)', marginTop: 10 }}>
          {zeile.warteliste_offen} Person(en) stehen auf der Warteliste. Der Versand der
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
  zeile: StateDashboardZeile
  onAbbrechen: () => void
  onFertig: (meldung: string) => void
  onFehler: (fehler: string) => void
}) {
  const [begruendung, setBegruendung] = useState('')
  const [zielStatus, setZielStatus] = useState<ExpansionStatus>('IN_PRUEFUNG')
  const [laeuft, setLaeuft] = useState(false)
  const land = zeile.bundesland_label ?? BUNDESLAND_NAMEN[zeile.bundesland]

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
        Alle Kassenmodule werden zurückgesetzt, die Kassentarife und Landesregeln dieses
        Bundeslands auf inaktiv gestellt. Bestehende Rechnungsentwürfe bleiben erhalten,
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
        <select value={zielStatus} onChange={e => setZielStatus(e.target.value as ExpansionStatus)} style={input}>
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
  zeile: StateDashboardZeile
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
  const land = zeile.bundesland_label ?? BUNDESLAND_NAMEN[zeile.bundesland]

  const set = (feld: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm({ ...form, [feld]: e.target.value })

  return (
    <Dialog titel={`${land} — Stammdaten`} onSchliessen={onSchliessen}>
      <div style={modulListe}>
        <strong style={{ fontSize: 12, color: 'var(--ink4)' }}>
          Kassenmodule ({zeile.insurance_enabled ? 'freigeschaltet' : 'gesperrt'})
        </strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, listStyle: 'none' }}>
          {KASSEN_MODULE.map(m => (
            <li key={m} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: zeile[m] ? '#3E8E5A' : 'var(--ink5)' }}>{zeile[m] ? '☑' : '☐'}</span>
              <span style={{ color: zeile[m] ? 'var(--ink)' : 'var(--ink5)' }}>{MODUL_LABELS[m]}</span>
            </li>
          ))}
        </ul>
        <p style={{ ...hinweisText, margin: '8px 0 0' }}>
          Diese Schalter werden ausschließlich von der Ein-Klick-Freischaltung gesetzt.
          Ein direktes Ändern in der Datenbank weist der Server ab.
        </p>
      </div>

      <div style={{ ...modulListe, marginTop: 10 }}>
        <strong style={{ fontSize: 12, color: 'var(--ink4)' }}>Datenlage</strong>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 13, marginTop: 6 }}>
          <span>Kassentarife: {zeile.kassentarife_aktiv ?? 0} aktiv / {zeile.kassentarife_gesamt ?? 0} vorbereitet</span>
          <span>Privattarife: {zeile.privattarife_aktiv ?? 0} aktiv</span>
          <span>Obergrenzen: {zeile.obergrenzen_bestaetigt ?? 0} bestätigt / {zeile.obergrenzen_gesamt ?? 0}</span>
          <span>Landesregeln aktiv: {zeile.landesregeln_aktiv ?? 0}</span>
          <span>Wegepauschalen aktiv: {zeile.wegepauschalen_aktiv ?? 0}</span>
          <span>Klienten: {zeile.klienten ?? 0} ({zeile.klienten_ohne_plz ?? 0} ohne PLZ)</span>
        </div>
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
        Leere Felder werden beim Speichern zurückgesetzt. Der Ansprechpartner wird
        Kundinnen und Kunden in noch nicht freigeschalteten Bundesländern angezeigt —
        bitte keinen persönlichen Namen eintragen, Alltagsengel tritt als Team auf.
      </p>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button
          onClick={async () => {
            setSpeichert(true)
            await onSpeichern({
              antrag_eingereicht_am: form.antrag_eingereicht_am || '',
              approval_authority: form.approval_authority || '',
              approval_reference: form.approval_reference || '',
              approval_document: form.approval_document || '',
              rechtsgrundlage_land: form.rechtsgrundlage_land || '',
              ansprechpartner_name: form.ansprechpartner_name || '',
              ansprechpartner_email: form.ansprechpartner_email || '',
              ansprechpartner_telefon: form.ansprechpartner_telefon || '',
              notes: form.notes || '',
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

function Kachel({
  titel, wert, von, ton,
}: {
  titel: string
  wert: number
  von?: number
  ton?: 'gruen' | 'gold' | 'rot'
}) {
  const farbe = ton === 'gruen' ? '#3E8E5A'
    : ton === 'gold' ? 'var(--gold2)'
      : ton === 'rot' ? '#D04B3B'
        : 'var(--ink)'
  return (
    <div style={kachel}>
      <div style={{ fontSize: 11, color: 'var(--ink5)', fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase' }}>
        {titel}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: farbe, lineHeight: 1.2 }}>
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
    <DialogOverlay
      className=""
      onClose={onSchliessen}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 60,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '5vh 16px', overflowY: 'auto',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titel}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 14,
          padding: 22, width: '100%', maxWidth: 680,
        }}
      >
        <h3 style={{ margin: '0 0 14px', fontSize: 18 }}>{titel}</h3>
        {children}
      </div>
    </DialogOverlay>
  )
}

// ── Styles ──────────────────────────────────────────────────────

const zentriert: React.CSSProperties = { textAlign: 'center' }
const zeileAktiv: React.CSSProperties = { background: 'rgba(62,142,90,0.07)' }

const landkarte: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 12,
}

const kachelKarte: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 12, padding: 14,
  display: 'flex', flexDirection: 'column', minHeight: 210,
}

const kachelReihe: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  gap: 12, margin: '16px 0 20px',
}

const kachel: React.CSSProperties = {
  background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12,
  padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4,
}

const ansichtUmschalter: React.CSSProperties = {
  display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
}

const ansichtBtn: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, padding: '8px 14px', border: 'none',
  cursor: 'pointer', fontFamily: 'inherit',
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

const hinweisText: React.CSSProperties = { fontSize: 11, fontWeight: 400, color: 'var(--ink5)' }

const notizText: React.CSSProperties = {
  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
  overflow: 'hidden', fontSize: 12, color: 'var(--ink4)',
}

const modulListe: React.CSSProperties = {
  background: 'var(--coal)', border: '1px solid var(--border)', borderRadius: 10,
  padding: '10px 14px', marginTop: 14,
}
