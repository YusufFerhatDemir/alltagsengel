'use client'
import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react'
import Link from 'next/link'
import { Banner, StatusBadge, SearchInput } from '@/components/admin/OpsUI'
import {
  anforderungFuerStatus,
  QUELLE_MIN_LAENGE,
  type QuellTabelle,
  type TarifStatus,
} from '@/lib/billing/core/tarif-verifizierung'

// ═══════════════════════════════════════════════════════════════════════════
// Typen — Spiegel von GET /api/billing/tariffs/uebersicht
// ═══════════════════════════════════════════════════════════════════════════

interface Zeile {
  id: string
  quellTabelle: QuellTabelle
  leistungsart: string
  rechtsgrundlage: string | null
  bundesland: string | null
  preisCent: number
  einheit: string | null
  tarifStatus: TarifStatus
  gueltigAb: string | null
  gueltigBis: string | null
  istAktiv: boolean
  verifiziertAm: string | null
  verifiziertVon: string | null
  verifizierungsQuelle: string | null
  belegId: string | null
  abrechenbar: boolean
  begruendung: string
}

interface Kennzahlen {
  gesamt: number
  verified: number
  unverified: number
  blocked: number
  abrechenbar: number
  nichtAbrechenbar: number
  verifiziertOhneBeleg: number
}

interface HistorieEintrag {
  id: string
  aktion: string
  alter_status: string | null
  neuer_status: string | null
  alter_betrag_cent: number | null
  neuer_betrag_cent: number | null
  benutzer: string | null
  quelle: string | null
  beleg_id: string | null
  created_at: string
}

interface Beleg {
  id: string
  dateiname: string
  mime_type: string
  groesse_bytes: number
  sha256: string
  quelle: string | null
  hochgeladen_von: string
  hochgeladen_am: string
  url: string | null
}

const STATUS_META: Record<TarifStatus, { label: string; color: string; symbol: string }> = {
  verified: { label: 'VERIFIED', color: '#22c55e', symbol: '✅' },
  unverified: { label: 'UNVERIFIED', color: '#f59e0b', symbol: '⚠️' },
  blocked: { label: 'BLOCKED', color: '#ef4444', symbol: '🔒' },
}

const QUELLE_LABEL: Record<QuellTabelle, string> = {
  billing_tariffs: 'Rechnungstarif',
  leistungspreise: 'Leistungspreis',
}

function euro(cent: number) {
  return (cent / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function datum(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('de-DE') : '—'
}

function zeitpunkt(iso: string) {
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

function bundeslandLabel(wert: string | null) {
  if (!wert) return '— (bundeslandunabhängig)'
  return wert
    .split('_')
    .map(t => t.charAt(0).toUpperCase() + t.slice(1))
    .join('-')
}

/** Abrechnungsart = Rechtsgrundlage. Leistungspreise haben keine eigene. */
function abrechnungsart(z: Zeile) {
  if (z.quellTabelle === 'leistungspreise') return 'Monatsabschluss (Leistungspreis)'
  return z.rechtsgrundlage ?? '—'
}

// ═══════════════════════════════════════════════════════════════════════════
// Seite
// ═══════════════════════════════════════════════════════════════════════════

export default function TarifePage() {
  const [zeilen, setZeilen] = useState<Zeile[]>([])
  const [kennzahlen, setKennzahlen] = useState<Record<string, Kennzahlen> | null>(null)
  const [hinweise, setHinweise] = useState<string[]>([])
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [dialogFuer, setDialogFuer] = useState<Zeile | null>(null)

  // Filter
  const [fStatus, setFStatus] = useState<'alle' | TarifStatus>('alle')
  const [fArt, setFArt] = useState('alle')
  const [fLand, setFLand] = useState('alle')
  const [fQuelle, setFQuelle] = useState<'alle' | QuellTabelle>('alle')
  const [fNurProblem, setFNurProblem] = useState(false)
  const [suche, setSuche] = useState('')

  const neuLaden = useCallback(async () => {
    setLaden(true)
    try {
      const res = await fetch('/api/billing/tariffs/uebersicht')
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      setZeilen(j.zeilen ?? [])
      setKennzahlen(j.kennzahlen ?? null)
      setHinweise(j.hinweise ?? [])
      setFehler(null)
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => {
    neuLaden()
  }, [neuLaden])

  const arten = useMemo(
    () => Array.from(new Set(zeilen.map(abrechnungsart))).sort(),
    [zeilen]
  )
  const laender = useMemo(
    () => Array.from(new Set(zeilen.map(z => z.bundesland ?? ''))).sort(),
    [zeilen]
  )

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase()
    return zeilen.filter(z => {
      if (fStatus !== 'alle' && z.tarifStatus !== fStatus) return false
      if (fArt !== 'alle' && abrechnungsart(z) !== fArt) return false
      if (fLand !== 'alle' && (z.bundesland ?? '') !== fLand) return false
      if (fQuelle !== 'alle' && z.quellTabelle !== fQuelle) return false
      if (fNurProblem && z.abrechenbar && !(z.tarifStatus === 'verified' && !z.belegId && z.rechtsgrundlage !== 'privat')) {
        return false
      }
      if (q && !`${z.leistungsart} ${z.rechtsgrundlage ?? ''} ${z.verifizierungsQuelle ?? ''}`.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [zeilen, fStatus, fArt, fLand, fQuelle, fNurProblem, suche])

  const k = kennzahlen?.gesamt

  return (
    <div className="admin-page">
      <h1>Kassenabrechnung — Tarife &amp; Preise</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 8, maxWidth: 820 }}>
        Abgerechnet werden darf nur, was belegt freigegeben ist. Rechnungserstellung
        (<code>create_invoice_draft_atomic</code>), Preisauflösung (<code>resolvePrice</code>) und
        Monatsabschluss weisen alles ab, was hier nicht <strong>verified</strong> ist — sie setzen
        keinen Ersatzpreis ein, sondern liefern gar keinen Betrag.
      </p>
      <p style={{ marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/admin/kassenabrechnung/stammdaten">→ Kostenträger &amp; Datenannahmestellen</Link>
        <Link href="/admin/leistungspreise">→ Leistungspreise pflegen</Link>
      </p>

      {fehler && <Banner tone="danger">{fehler}</Banner>}
      {meldung && <Banner tone="success">{meldung}</Banner>}
      {hinweise.map((h, i) => (
        <Banner key={i} tone="warn">
          {h}
        </Banner>
      ))}

      {k && k.verifiziertOhneBeleg > 0 && (
        <Banner tone="warn">
          {k.verifiziertOhneBeleg} freigegebene kassenrelevante Position(en) haben keinen
          hinterlegten Primärbeleg. Das ist Altbestand aus der Zeit vor der Belegpflicht — er bleibt
          abrechenbar, sollte aber nachdokumentiert werden: Beleg hochladen und erneut freigeben.
        </Banner>
      )}

      {/* ── Kennzahlen ─────────────────────────────────────────────── */}
      {k && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <h3>Abrechenbarkeit</h3>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 8 }}>
            <Kachel wert={k.abrechenbar} label="abrechenbar" farbe="#22c55e" />
            <Kachel wert={k.nichtAbrechenbar} label="NICHT abrechenbar" farbe="#ef4444" />
            <Kachel wert={k.verified} label="verified ✅" farbe="var(--muted)" />
            <Kachel wert={k.unverified} label="unverified ⚠️" farbe="var(--muted)" />
            <Kachel wert={k.blocked} label="blocked 🔒" farbe="var(--muted)" />
          </div>
          {kennzahlen && (
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 12 }}>
              Davon Rechnungstarife: {kennzahlen.rechnungstarife.abrechenbar}/
              {kennzahlen.rechnungstarife.gesamt} abrechenbar · Leistungspreise (Monatsabschluss):{' '}
              {kennzahlen.leistungspreise.abrechenbar}/{kennzahlen.leistungspreise.gesamt} abrechenbar
            </p>
          )}
        </div>
      )}

      {/* ── Filter ─────────────────────────────────────────────────── */}
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Feld label="Status">
            <select value={fStatus} onChange={e => setFStatus(e.target.value as 'alle' | TarifStatus)}>
              <option value="alle">alle</option>
              <option value="verified">✅ verified</option>
              <option value="unverified">⚠️ unverified</option>
              <option value="blocked">🔒 blocked</option>
            </select>
          </Feld>
          <Feld label="Abrechnungsart">
            <select value={fArt} onChange={e => setFArt(e.target.value)}>
              <option value="alle">alle</option>
              {arten.map(a => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Feld>
          <Feld label="Bundesland">
            <select value={fLand} onChange={e => setFLand(e.target.value)}>
              <option value="alle">alle</option>
              {laender.map(l => (
                <option key={l || 'ohne'} value={l}>
                  {bundeslandLabel(l || null)}
                </option>
              ))}
            </select>
          </Feld>
          <Feld label="Preisquelle">
            <select value={fQuelle} onChange={e => setFQuelle(e.target.value as 'alle' | QuellTabelle)}>
              <option value="alle">alle</option>
              <option value="billing_tariffs">Rechnungstarife</option>
              <option value="leistungspreise">Leistungspreise</option>
            </select>
          </Feld>
          <Feld label="Suche">
            <SearchInput value={suche} onChange={setSuche} placeholder="Leistungsart oder Quelle…" />
          </Feld>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 6 }}>
            <input type="checkbox" checked={fNurProblem} onChange={e => setFNurProblem(e.target.checked)} />
            nur Handlungsbedarf
          </label>
        </div>
      </div>

      {/* ── Tabelle ────────────────────────────────────────────────── */}
      <div className="admin-card">
        <h3>
          {laden ? 'Lade…' : `${gefiltert.length} von ${zeilen.length} Positionen`}
        </h3>
        {!laden && gefiltert.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Keine Position passt zu diesen Filtern.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 13 }}>
                  <th style={{ padding: 6 }}>Abrechenbar</th>
                  <th>Leistungsart</th>
                  <th>Abrechnungsart</th>
                  <th>Bundesland</th>
                  <th>Preis</th>
                  <th>Status</th>
                  <th>Beleg</th>
                  <th>Freigabe</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {gefiltert.map(z => {
                  const meta = STATUS_META[z.tarifStatus] ?? STATUS_META.unverified
                  const belegFehlt =
                    z.tarifStatus === 'verified' && !z.belegId && z.rechtsgrundlage !== 'privat'
                  return (
                    <tr key={`${z.quellTabelle}:${z.id}`} style={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
                      <td style={{ padding: 6, whiteSpace: 'nowrap' }}>
                        <span
                          title={z.begruendung}
                          style={{ color: z.abrechenbar ? '#22c55e' : '#ef4444', fontWeight: 600 }}
                        >
                          {z.abrechenbar ? 'JA' : 'NEIN'}
                        </span>
                      </td>
                      <td>
                        {z.leistungsart}
                        <br />
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {QUELLE_LABEL[z.quellTabelle]}
                          {!z.istAktiv && ' · inaktiv'}
                        </span>
                      </td>
                      <td>{abrechnungsart(z)}</td>
                      <td>{bundeslandLabel(z.bundesland)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {euro(z.preisCent)}
                        {z.einheit ? ` / ${z.einheit}` : ''}
                      </td>
                      <td>
                        <StatusBadge label={`${meta.symbol} ${meta.label}`} color={meta.color} />
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {z.belegId ? (
                          <span style={{ color: '#22c55e' }}>hinterlegt</span>
                        ) : belegFehlt ? (
                          <span style={{ color: '#f59e0b' }}>fehlt</span>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 260 }}>
                        {z.verifiziertAm ? (
                          <>
                            {datum(z.verifiziertAm)} · {z.verifiziertVon}
                            <br />
                            <span title={z.verifizierungsQuelle ?? ''}>
                              {(z.verifizierungsQuelle ?? '').slice(0, 70)}
                              {(z.verifizierungsQuelle ?? '').length > 70 ? '…' : ''}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="admin-btn-ghost" onClick={() => setDialogFuer(z)}>
                          Prüfen
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialogFuer && (
        <VerifizierungsDialog
          zeile={dialogFuer}
          onAbbrechen={() => setDialogFuer(null)}
          onGespeichert={async text => {
            setDialogFuer(null)
            setMeldung(text)
            await neuLaden()
          }}
        />
      )}
    </div>
  )
}

function Kachel({ wert, label, farbe }: { wert: number; label: string; farbe: string }) {
  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 700, color: farbe }}>{wert}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
    </div>
  )
}

function Feld({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
      {children}
    </label>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Verifizierungs-Dialog
// ═══════════════════════════════════════════════════════════════════════════

function VerifizierungsDialog({
  zeile,
  onAbbrechen,
  onGespeichert,
}: {
  zeile: Zeile
  onAbbrechen: () => void
  onGespeichert: (meldung: string) => void
}) {
  const basisPfad =
    zeile.quellTabelle === 'billing_tariffs'
      ? `/api/billing/tariffs/${zeile.id}/verifizierung`
      : `/api/billing/leistungspreise/${zeile.id}/verifizierung`

  const [status, setStatus] = useState<TarifStatus>(zeile.tarifStatus)
  const [quelle, setQuelle] = useState(zeile.verifizierungsQuelle ?? '')
  const [belegId, setBelegId] = useState<string | null>(zeile.belegId)
  const [bestaetigt, setBestaetigt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [speichert, setSpeichert] = useState(false)

  const [historie, setHistorie] = useState<HistorieEintrag[]>([])
  const [belege, setBelege] = useState<Beleg[]>([])
  const [belegHinweis, setBelegHinweis] = useState<string | null>(null)
  const [detailLaedt, setDetailLaedt] = useState(true)
  const [laedtHoch, setLaedtHoch] = useState(false)

  const anforderung = anforderungFuerStatus(status, {
    quellTabelle: zeile.quellTabelle,
    rechtsgrundlage: zeile.rechtsgrundlage,
  })

  const detailLaden = useCallback(async () => {
    setDetailLaedt(true)
    try {
      const res = await fetch(basisPfad)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      setHistorie(j.historie ?? [])
      setBelege(j.belege ?? [])
      setBelegHinweis(j.belegHinweis ?? null)
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setDetailLaedt(false)
    }
  }, [basisPfad])

  useEffect(() => {
    detailLaden()
  }, [detailLaden])

  async function belegHochladen(datei: File) {
    setFehler(null)
    setLaedtHoch(true)
    try {
      const form = new FormData()
      form.append('datei', datei)
      form.append('quellTabelle', zeile.quellTabelle)
      form.append('id', zeile.id)
      if (quelle.trim()) form.append('quelle', quelle.trim())

      const res = await fetch('/api/billing/tarif-belege', { method: 'POST', body: form })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      setBelegId(j.beleg.id)
      await detailLaden()
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setLaedtHoch(false)
    }
  }

  async function speichern() {
    setFehler(null)
    if (anforderung.quelleErforderlich && quelle.trim().length < QUELLE_MIN_LAENGE) {
      setFehler(`Rechtsquelle ist bei „${status}" verpflichtend (min. ${QUELLE_MIN_LAENGE} Zeichen).`)
      return
    }
    if (anforderung.belegErforderlich && !belegId) {
      setFehler('Für die Freigabe muss ein Primärbeleg hochgeladen und ausgewählt sein.')
      return
    }
    if (!bestaetigt) {
      setFehler('Bitte die Statusänderung bestätigen.')
      return
    }

    setSpeichert(true)
    try {
      const res = await fetch(basisPfad, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          quelle: quelle.trim(),
          belegId: status === 'verified' ? belegId : null,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      onGespeichert(`„${zeile.leistungsart}" steht jetzt auf ${status.toUpperCase()}.`)
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setSpeichert(false)
    }
  }

  const aktuell = STATUS_META[zeile.tarifStatus] ?? STATUS_META.unverified

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tarifstatus prüfen"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
        overflowY: 'auto',
      }}
    >
      <div className="admin-card" style={{ maxWidth: 720, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3>{zeile.leistungsart}</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 4 }}>
          {QUELLE_LABEL[zeile.quellTabelle]} · {abrechnungsart(zeile)} · {bundeslandLabel(zeile.bundesland)} ·{' '}
          {euro(zeile.preisCent)}
          {zeile.einheit ? ` / ${zeile.einheit}` : ''}
        </p>
        <p style={{ fontSize: 13, marginBottom: 12 }}>
          Aktuell <StatusBadge label={`${aktuell.symbol} ${aktuell.label}`} color={aktuell.color} />{' '}
          <span style={{ color: zeile.abrechenbar ? '#22c55e' : '#ef4444' }}>{zeile.begruendung}</span>
        </p>

        {fehler && <Banner tone="danger">{fehler}</Banner>}
        {belegHinweis && <Banner tone="warn">{belegHinweis}</Banner>}

        {/* ── Belege ──────────────────────────────────────────────── */}
        <section style={{ marginTop: 12 }}>
          <h4 style={{ marginBottom: 4 }}>Primärbelege</h4>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
            Vergütungsvereinbarung, Anerkennungsbescheid oder Rechtsverordnung als PDF oder Bild
            (max. 20 MB). Die Datei liegt in einem privaten Bucket und ist nur über kurzlebige
            signierte Links erreichbar.
          </p>

          {detailLaedt ? (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Lade Belege…</p>
          ) : belege.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Noch kein Beleg hinterlegt.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
              {belege.map(b => (
                <li
                  key={b.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 0',
                    borderTop: '1px solid var(--border, #e5e7eb)',
                    fontSize: 13,
                  }}
                >
                  <input
                    type="radio"
                    name="beleg"
                    checked={belegId === b.id}
                    onChange={() => setBelegId(b.id)}
                    aria-label={`Beleg ${b.dateiname} für die Freigabe verwenden`}
                  />
                  <span style={{ flex: 1 }}>
                    {b.dateiname}
                    <br />
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {(b.groesse_bytes / 1024).toFixed(0)} KB · {zeitpunkt(b.hochgeladen_am)} ·{' '}
                      {b.hochgeladen_von} · SHA-256 {b.sha256.slice(0, 12)}…
                    </span>
                  </span>
                  {b.url && (
                    <a href={b.url} target="_blank" rel="noopener noreferrer">
                      ansehen
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}

          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            disabled={laedtHoch}
            onChange={e => {
              const datei = e.target.files?.[0]
              if (datei) belegHochladen(datei)
              e.target.value = ''
            }}
          />
          {laedtHoch && <span style={{ fontSize: 13, marginLeft: 8 }}>Lädt hoch…</span>}
        </section>

        {/* ── Statusänderung ──────────────────────────────────────── */}
        <section style={{ marginTop: 20 }}>
          <h4 style={{ marginBottom: 8 }}>Status ändern</h4>

          <label style={{ display: 'block', margin: '0 0 4px', fontSize: 13 }}>Neuer Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as TarifStatus)}
            style={{ width: '100%' }}
          >
            <option value="verified">✅ verified — freigegeben, wird abgerechnet</option>
            <option value="unverified">⚠️ unverified — nicht geprüft, nicht abrechenbar</option>
            <option value="blocked">🔒 blocked — gesperrt</option>
          </select>

          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0' }}>{anforderung.hinweis}</p>

          <label style={{ display: 'block', margin: '12px 0 4px', fontSize: 13 }}>
            Rechtsquelle {anforderung.quelleErforderlich ? '(Pflicht)' : '(optional)'}
          </label>
          <textarea
            value={quelle}
            onChange={e => setQuelle(e.target.value)}
            placeholder='z. B. "Vergütungsvereinbarung AOK Hessen vom 01.03.2026" oder "PfluV Hessen § 1 Abs. 1 Nr. 3"'
            style={{ width: '100%', minHeight: 64 }}
          />

          {anforderung.belegErforderlich && !belegId && (
            <p style={{ fontSize: 13, color: '#f59e0b', marginTop: 8 }}>
              Ohne ausgewählten Primärbeleg ist die Freigabe nicht möglich.
            </p>
          )}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '12px 0', fontSize: 13 }}>
            <input type="checkbox" checked={bestaetigt} onChange={e => setBestaetigt(e.target.checked)} />
            <span>
              Ich habe den Preis gegen die angegebene Quelle geprüft. Die Änderung wird mit meinem
              Namen, Zeitstempel, Quelle und Beleg-Referenz protokolliert.
            </span>
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="admin-btn-ghost" onClick={onAbbrechen} disabled={speichert}>
              Abbrechen
            </button>
            <button className="admin-btn" onClick={speichern} disabled={speichert || laedtHoch}>
              {speichert ? 'Speichert…' : 'Speichern'}
            </button>
          </div>
        </section>

        {/* ── Historie ────────────────────────────────────────────── */}
        <section style={{ marginTop: 20 }}>
          <h4 style={{ marginBottom: 8 }}>Historie</h4>
          {detailLaedt ? (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Lade Historie…</p>
          ) : historie.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Kein Audit-Eintrag vorhanden.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: 4 }}>Wann</th>
                  <th>Aktion</th>
                  <th>Status</th>
                  <th>Preis</th>
                  <th>Wer</th>
                  <th>Quelle</th>
                </tr>
              </thead>
              <tbody>
                {historie.map(h => (
                  <tr key={h.id} style={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
                    <td style={{ padding: 4, whiteSpace: 'nowrap' }}>{zeitpunkt(h.created_at)}</td>
                    <td>{h.aktion}</td>
                    <td>
                      {h.alter_status ? `${h.alter_status} → ` : ''}
                      {h.neuer_status ?? '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {h.alter_betrag_cent !== null && h.alter_betrag_cent !== h.neuer_betrag_cent
                        ? `${euro(h.alter_betrag_cent)} → ${euro(h.neuer_betrag_cent ?? 0)}`
                        : euro(h.neuer_betrag_cent ?? 0)}
                    </td>
                    <td>{h.benutzer ?? '—'}</td>
                    <td style={{ maxWidth: 220 }}>
                      {(h.quelle ?? '—').slice(0, 60)}
                      {h.beleg_id ? ' · Beleg ✓' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  )
}
