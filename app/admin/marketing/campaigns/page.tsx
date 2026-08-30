'use client'
// ═══════════════════════════════════════════════════════════════════════════
// KAMPAGNEN-COCKPIT  /admin/marketing/campaigns
//
// Die Seite ist bewusst so gebaut, dass der Weg zum Versand LANG ist:
// Entwurf → Trockenlauf → Freigabe → Versand. Jeder Schritt zeigt an, was
// der nächste bewirken würde, bevor man ihn geht.
//
// Die wichtigste Anzeige ist NICHT die Empfängerzahl, sondern die
// Aufschlüsselung darunter. „312 im Segment, 0 versandfähig, davon 312
// ohne Einwilligung" ist eine vollständige Aussage; „0 Empfänger" allein
// wäre von einem Fehler nicht zu unterscheiden.
//
// Der Freigabe-Knopf erscheint erst nach einem Trockenlauf, und ein neuer
// Trockenlauf entwertet eine bestehende Freigabe — beides erzwingt die
// API, hier wird es nur sichtbar gemacht.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'
import { logger } from '@/lib/logger'
import { AUSSCHLUSS_BEZEICHNUNG, KAMPAGNEN_STATUS_BEZEICHNUNG, type AusschlussGrund } from '@/lib/marketing/typen'

const log = logger.child('admin:marketing')

interface Kennzahlen {
  gesendet: number; zugestellt: number; geoeffnet: number
  geklickt: number; unzustellbar: number; abgemeldet: number; fehler: number
}
interface KampagnenZeile {
  id: string; name: string; template_key: string; segment_key: string; status: string
  geplant_fuer: string | null; dry_run_am: string | null; empfaenger_anzahl: number | null
  freigegeben_am: string | null; freigegeben_fuer_anzahl: number | null
  versendet_am: string | null; created_at: string
  segmentName: string | null; vorlageName: string | null; kennzahlen: Kennzahlen
}
interface SegmentZeile {
  key: string; name: string; beschreibung: string; zielgruppe: string; consentTyp: string
  imSegment: number; versandfaehig: number
  ausschluesse: Record<AusschlussGrund, number>
  passendeVorlagen: Array<{ templateKey: string; name: string }>
}
interface Freigabe { aktiv: boolean; befund: string; grund: string; produktion: boolean }

const STATUS_FARBE: Record<string, string> = {
  entwurf: '#6B7280', geplant: '#2563EB', pausiert: '#D97706',
  versendet: '#059669', abgebrochen: '#DC2626',
}

function datum(wert: string | null): string {
  if (!wert) return '—'
  return new Date(wert).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

export default function MarketingKampagnen() {
  const [kampagnen, setKampagnen] = useState<KampagnenZeile[]>([])
  const [segmente, setSegmente] = useState<SegmentZeile[]>([])
  const [freigabe, setFreigabe] = useState<Freigabe | null>(null)
  const [bestand, setBestand] = useState<Record<string, unknown> | null>(null)
  const [laedt, setLaedt] = useState(true)
  const [meldung, setMeldung] = useState<{ tone: 'info' | 'warn' | 'danger' | 'success'; text: string } | null>(null)
  const [offen, setOffen] = useState<string | null>(null)
  const [trockenlauf, setTrockenlauf] = useState<Record<string, unknown> | null>(null)
  const [vorschauHtml, setVorschauHtml] = useState<string | null>(null)
  const [beschaeftigt, setBeschaeftigt] = useState(false)

  // Anlage
  const [neuName, setNeuName] = useState('')
  const [neuSegment, setNeuSegment] = useState('')
  const [neuVorlage, setNeuVorlage] = useState('')

  const laden = useCallback(async () => {
    setLaedt(true)
    try {
      const [k, s] = await Promise.all([
        fetch('/api/admin/marketing/campaigns').then((r) => r.json()),
        fetch('/api/admin/marketing/segmente').then((r) => r.json()),
      ])
      if (k.error) throw new Error(k.error)
      if (s.error) throw new Error(s.error)
      setKampagnen(k.kampagnen ?? [])
      setSegmente(s.segmente ?? [])
      setBestand(s.bestand ?? null)
      setFreigabe(k.freigabe ?? s.freigabe ?? null)
    } catch (err) {
      log.errorWithException('Laden fehlgeschlagen', err)
      setMeldung({ tone: 'danger', text: 'Daten konnten nicht geladen werden.' })
    } finally {
      setLaedt(false)
    }
  }, [])

  useEffect(() => { void laden() }, [laden])

  const gewaehltesSegment = useMemo(
    () => segmente.find((s) => s.key === neuSegment) ?? null,
    [segmente, neuSegment],
  )

  // Vorlagenauswahl an das Segment binden: die API weist eine unpassende
  // Kombination ohnehin ab, hier soll sie gar nicht erst wählbar sein.
  useEffect(() => {
    if (gewaehltesSegment && !gewaehltesSegment.passendeVorlagen.some((v) => v.templateKey === neuVorlage)) {
      setNeuVorlage(gewaehltesSegment.passendeVorlagen[0]?.templateKey ?? '')
    }
  }, [gewaehltesSegment, neuVorlage])

  async function ruf(pfad: string, optionen?: RequestInit): Promise<Record<string, unknown>> {
    const antwort = await fetch(pfad, {
      ...optionen,
      headers: { 'Content-Type': 'application/json', ...(optionen?.headers ?? {}) },
    })
    const rumpf = await antwort.json().catch(() => ({}))
    if (!antwort.ok) throw new Error(String(rumpf.error ?? `Fehler ${antwort.status}`))
    return rumpf
  }

  async function anlegen() {
    if (!neuName.trim() || !neuSegment || !neuVorlage) {
      setMeldung({ tone: 'warn', text: 'Name, Segment und Vorlage sind Pflicht.' })
      return
    }
    setBeschaeftigt(true)
    try {
      await ruf('/api/admin/marketing/campaigns', {
        method: 'POST',
        body: JSON.stringify({ name: neuName.trim(), segment_key: neuSegment, template_key: neuVorlage }),
      })
      setNeuName(''); setNeuSegment(''); setNeuVorlage('')
      setMeldung({ tone: 'success', text: 'Kampagne als Entwurf angelegt. Es wurde nichts versendet.' })
      await laden()
    } catch (err) {
      setMeldung({ tone: 'danger', text: err instanceof Error ? err.message : 'Fehler' })
    } finally { setBeschaeftigt(false) }
  }

  async function starteTrockenlauf(id: string) {
    setBeschaeftigt(true); setTrockenlauf(null)
    try {
      const e = await ruf(`/api/admin/marketing/campaigns/${id}/dry-run`, { method: 'POST' })
      setTrockenlauf(e); setOffen(id)
      setMeldung({
        tone: e.freigabeEntwertet ? 'warn' : 'info',
        text: e.freigabeEntwertet
          ? 'Trockenlauf abgeschlossen — es wurde NICHTS versendet. Die bestehende Freigabe wurde dabei entwertet, weil sie sich auf eine ältere Zahl bezog.'
          : 'Trockenlauf abgeschlossen — es wurde NICHTS versendet.',
      })
      await laden()
    } catch (err) {
      setMeldung({ tone: 'danger', text: err instanceof Error ? err.message : 'Fehler' })
    } finally { setBeschaeftigt(false) }
  }

  async function zeigeVorschau(id: string) {
    setBeschaeftigt(true)
    try {
      const e = await ruf(`/api/admin/marketing/campaigns/${id}/preview`)
      setVorschauHtml(String(e.html ?? ''))
    } catch (err) {
      setMeldung({ tone: 'danger', text: err instanceof Error ? err.message : 'Fehler' })
    } finally { setBeschaeftigt(false) }
  }

  async function testen(id: string) {
    const an = window.prompt('Testversand an welche eigene Adresse? (@alltagsengel.care)')
    if (!an) return
    setBeschaeftigt(true)
    try {
      const e = await ruf(`/api/admin/marketing/campaigns/${id}/testversand`, {
        method: 'POST', body: JSON.stringify({ an }),
      })
      setMeldung({ tone: 'success', text: `Testversand an ${e.an} — kein Eintrag in der Zustellspur.` })
    } catch (err) {
      setMeldung({ tone: 'danger', text: err instanceof Error ? err.message : 'Fehler' })
    } finally { setBeschaeftigt(false) }
  }

  async function freigeben(k: KampagnenZeile) {
    const bestaetigt = window.confirm(
      `Kampagne „${k.name}" für ${k.empfaenger_anzahl ?? 0} Empfänger freigeben?\n\n` +
        'Die Freigabe gilt genau für diese Zahl. Wächst das Segment danach, ' +
        'muss der Trockenlauf wiederholt werden.\n\n' +
        'Die Freigabe versendet NICHTS — der Versand ist ein eigener Schritt.',
    )
    if (!bestaetigt) return
    setBeschaeftigt(true)
    try {
      await ruf(`/api/admin/marketing/campaigns/${k.id}`, {
        method: 'PATCH', body: JSON.stringify({ freigeben: true }),
      })
      setMeldung({ tone: 'success', text: 'Freigegeben. Der Versand ist ein eigener, letzter Schritt.' })
      await laden()
    } catch (err) {
      setMeldung({ tone: 'danger', text: err instanceof Error ? err.message : 'Fehler' })
    } finally { setBeschaeftigt(false) }
  }

  async function versenden(k: KampagnenZeile) {
    const wort = window.prompt(
      `ECHTER VERSAND an ${k.freigegeben_fuer_anzahl ?? 0} Empfänger.\n\n` +
        'Diese Mails lassen sich nicht zurückholen.\n\n' +
        'Zum Bestätigen VERSENDEN eintippen:',
    )
    if (wort !== 'VERSENDEN') {
      setMeldung({ tone: 'info', text: 'Abgebrochen. Es wurde nichts versendet.' })
      return
    }
    setBeschaeftigt(true)
    try {
      const e = await ruf(`/api/admin/marketing/campaigns/${k.id}/versenden`, { method: 'POST' })
      setMeldung({
        tone: 'success',
        text: `Versendet: ${e.gesendet} zugestellt beauftragt, ${e.fehlgeschlagen} fehlgeschlagen, ${e.uebersprungen} übersprungen.`,
      })
      await laden()
    } catch (err) {
      setMeldung({ tone: 'danger', text: err instanceof Error ? err.message : 'Fehler' })
    } finally { setBeschaeftigt(false) }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Marketing — Kampagnen</h1>
      <p style={{ color: 'var(--muted, #8A8279)', fontSize: 14, marginBottom: 20 }}>
        Werbepost. Getrennt von Rechnungen, Mahnungen und Terminbestätigungen — die brauchen
        keine Einwilligung und laufen einen anderen Weg.
      </p>

      {/* ── Freigabestand: die erste Frage, die jemand hat ─────────────── */}
      {freigabe && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone={freigabe.aktiv ? 'warn' : 'info'}>
            <strong>{freigabe.aktiv ? '⚠ Werbeversand ist SCHARF' : '🔒 Werbeversand ist gesperrt'}</strong>
            <br />
            {freigabe.grund}
          </Banner>
        </div>
      )}

      {meldung && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone={meldung.tone}>{meldung.text}</Banner>
        </div>
      )}

      {/* ── Bestand ────────────────────────────────────────────────────── */}
      {bestand && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12, marginBottom: 24,
        }}>
          {[
            ['Kontakte gesamt', bestand.kontakteGesamt],
            ['davon echt', bestand.echteKontakte],
            ['Testkonten', bestand.testkonten],
          ].map(([label, wert]) => (
            <div key={String(label)} style={{
              background: 'var(--coal2, #241F1A)', borderRadius: 12, padding: 16,
            }}>
              <div style={{ fontSize: 12, color: 'var(--muted, #8A8279)' }}>{String(label)}</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{String(wert ?? 0)}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Neue Kampagne ──────────────────────────────────────────────── */}
      <section style={{ background: 'var(--coal2, #241F1A)', borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Neue Kampagne</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Name</div>
            <input value={neuName} onChange={(e) => setNeuName(e.target.value)}
              placeholder="z. B. Entlastungsbetrag August"
              style={{ width: '100%', padding: 8, borderRadius: 8 }} />
          </label>
          <label style={{ flex: '1 1 240px' }}>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Segment</div>
            <select value={neuSegment} onChange={(e) => setNeuSegment(e.target.value)}
              style={{ width: '100%', padding: 8, borderRadius: 8 }}>
              <option value="">— wählen —</option>
              {segmente.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name} ({s.versandfaehig} von {s.imSegment} versandfähig)
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: '1 1 240px' }}>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Vorlage</div>
            <select value={neuVorlage} onChange={(e) => setNeuVorlage(e.target.value)}
              disabled={!gewaehltesSegment}
              style={{ width: '100%', padding: 8, borderRadius: 8 }}>
              <option value="">— wählen —</option>
              {(gewaehltesSegment?.passendeVorlagen ?? []).map((v) => (
                <option key={v.templateKey} value={v.templateKey}>{v.name}</option>
              ))}
            </select>
          </label>
          <button onClick={() => void anlegen()} disabled={beschaeftigt}
            style={{ padding: '9px 20px', borderRadius: 8, background: '#C9963C', color: '#1A1612',
              fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            Als Entwurf anlegen
          </button>
        </div>
        {gewaehltesSegment && (
          <p style={{ fontSize: 12, color: 'var(--muted, #8A8279)', marginTop: 10 }}>
            {gewaehltesSegment.beschreibung} — verlangt die Einwilligung „{gewaehltesSegment.consentTyp}".
            {gewaehltesSegment.versandfaehig === 0 && gewaehltesSegment.imSegment > 0 && (
              <strong style={{ color: '#D97706' }}>
                {' '}Derzeit ist niemand aus diesem Segment versandfähig — siehe Aufschlüsselung im Trockenlauf.
              </strong>
            )}
          </p>
        )}
      </section>

      {/* ── Kampagnen ──────────────────────────────────────────────────── */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Kampagnen</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted, #8A8279)', fontSize: 12 }}>
                <th style={{ padding: 8 }}>Kampagne</th>
                <th style={{ padding: 8 }}>Segment</th>
                <th style={{ padding: 8 }}>Status</th>
                <th style={{ padding: 8 }}>Empfänger</th>
                <th style={{ padding: 8 }}>Zugestellt / Geöffnet / Geklickt</th>
                <th style={{ padding: 8 }}>Bounce / Abmeldung</th>
                <th style={{ padding: 8 }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {laedt && <EmptyRow colSpan={7}>Lädt …</EmptyRow>}
              {!laedt && kampagnen.length === 0 && (
                <EmptyRow colSpan={7}>Noch keine Kampagne angelegt.</EmptyRow>
              )}
              {kampagnen.map((k) => (
                <tr key={k.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: 8 }}>
                    <div style={{ fontWeight: 600 }}>{k.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted, #8A8279)' }}>{k.vorlageName ?? k.template_key}</div>
                  </td>
                  <td style={{ padding: 8, fontSize: 13 }}>{k.segmentName ?? k.segment_key}</td>
                  <td style={{ padding: 8 }}>
                    <StatusBadge
                      label={KAMPAGNEN_STATUS_BEZEICHNUNG[k.status as keyof typeof KAMPAGNEN_STATUS_BEZEICHNUNG] ?? k.status}
                      color={STATUS_FARBE[k.status] ?? '#6B7280'} />
                    {k.freigegeben_am && !k.versendet_am && (
                      <div style={{ fontSize: 11, color: '#059669', marginTop: 4 }}>
                        freigegeben für {k.freigegeben_fuer_anzahl}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: 8 }}>
                    {k.dry_run_am ? (
                      <>
                        <strong>{k.empfaenger_anzahl ?? 0}</strong>
                        <div style={{ fontSize: 11, color: 'var(--muted, #8A8279)' }}>
                          Trockenlauf {datum(k.dry_run_am)}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--muted, #8A8279)' }}>kein Trockenlauf</span>
                    )}
                  </td>
                  <td style={{ padding: 8, fontSize: 13 }}>
                    {k.kennzahlen.zugestellt} / {k.kennzahlen.geoeffnet} / {k.kennzahlen.geklickt}
                  </td>
                  <td style={{ padding: 8, fontSize: 13 }}>
                    {k.kennzahlen.unzustellbar} / {k.kennzahlen.abgemeldet}
                    {k.kennzahlen.fehler > 0 && (
                      <span style={{ color: '#DC2626' }}> · {k.kennzahlen.fehler} Fehler</span>
                    )}
                  </td>
                  <td style={{ padding: 8 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => void zeigeVorschau(k.id)} disabled={beschaeftigt} style={knopf}>
                        Vorschau
                      </button>
                      <button onClick={() => void testen(k.id)} disabled={beschaeftigt} style={knopf}>
                        Testversand
                      </button>
                      {!k.versendet_am && (
                        <button onClick={() => void starteTrockenlauf(k.id)} disabled={beschaeftigt} style={knopf}>
                          Trockenlauf
                        </button>
                      )}
                      {!k.versendet_am && k.dry_run_am && !k.freigegeben_am && (
                        <button onClick={() => void freigeben(k)} disabled={beschaeftigt}
                          style={{ ...knopf, background: '#2563EB', color: '#fff' }}>
                          Freigeben
                        </button>
                      )}
                      {!k.versendet_am && k.freigegeben_am && (
                        <button onClick={() => void versenden(k)} disabled={beschaeftigt || !freigabe?.aktiv}
                          title={freigabe?.aktiv ? '' : freigabe?.grund}
                          style={{ ...knopf, background: freigabe?.aktiv ? '#DC2626' : '#4B5563', color: '#fff' }}>
                          Versenden
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Trockenlauf-Ergebnis ───────────────────────────────────────── */}
      {trockenlauf && offen && (
        <section style={{ marginTop: 24, background: 'var(--coal2, #241F1A)', borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            Trockenlauf — {String(trockenlauf.kampagneName ?? '')}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted, #8A8279)', marginBottom: 12 }}>
            {String(trockenlauf.hinweis ?? '')}
          </p>
          <div style={{ display: 'flex', gap: 24, marginBottom: 12, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 12, color: 'var(--muted, #8A8279)' }}>im Segment</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{String(trockenlauf.imSegment ?? 0)}</div></div>
            <div><div style={{ fontSize: 12, color: 'var(--muted, #8A8279)' }}>versandfähig</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#059669' }}>{String(trockenlauf.versandfaehig ?? 0)}</div></div>
          </div>

          {/* Die Aufschlüsselung ist der eigentliche Wert dieser Anzeige. */}
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Warum die anderen nicht angeschrieben werden</h3>
          <ul style={{ fontSize: 13, lineHeight: 1.8, paddingLeft: 18 }}>
            {Object.entries((trockenlauf.ausschluesse ?? {}) as Record<string, number>)
              .filter(([, n]) => n > 0)
              .map(([grund, n]) => (
                <li key={grund}>
                  <strong>{n}</strong> — {AUSSCHLUSS_BEZEICHNUNG[grund as AusschlussGrund] ?? grund}
                </li>
              ))}
            {Object.values((trockenlauf.ausschluesse ?? {}) as Record<string, number>).every((n) => n === 0) && (
              <li style={{ color: 'var(--muted, #8A8279)' }}>Keine Ausschlüsse.</li>
            )}
          </ul>

          {Array.isArray(trockenlauf.vorlagenFehler) && trockenlauf.vorlagenFehler.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Banner tone="danger">
                <strong>Vorlage nicht versandfähig:</strong>
                <ul style={{ paddingLeft: 18, marginTop: 6 }}>
                  {(trockenlauf.vorlagenFehler as string[]).map((f) => <li key={f}>{f}</li>)}
                </ul>
              </Banner>
            </div>
          )}
        </section>
      )}

      {/* ── Vorschau ───────────────────────────────────────────────────── */}
      {vorschauHtml && (
        <section style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Vorschau</h2>
            <button onClick={() => setVorschauHtml(null)} style={knopf}>Schließen</button>
          </div>
          {/* sandbox ohne allow-scripts und allow-same-origin: die Vorschau
              ist Anzeige, kein Ausführungsort. */}
          <iframe title="Vorschau" sandbox="" srcDoc={vorschauHtml}
            style={{ width: '100%', height: 600, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, background: '#fff' }} />
        </section>
      )}

      {/* ── Segmente ───────────────────────────────────────────────────── */}
      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Segmente</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted, #8A8279)', fontSize: 12 }}>
                <th style={{ padding: 8 }}>Segment</th>
                <th style={{ padding: 8 }}>Zielgruppe</th>
                <th style={{ padding: 8 }}>Einwilligung</th>
                <th style={{ padding: 8 }}>im Segment</th>
                <th style={{ padding: 8 }}>versandfähig</th>
                <th style={{ padding: 8 }}>Hauptgrund für den Rest</th>
              </tr>
            </thead>
            <tbody>
              {segmente.map((s) => {
                const top = Object.entries(s.ausschluesse ?? {})
                  .filter(([, n]) => n > 0)
                  .sort((a, b) => b[1] - a[1])[0]
                return (
                  <tr key={s.key} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: 8 }}>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted, #8A8279)' }}>{s.beschreibung}</div>
                    </td>
                    <td style={{ padding: 8 }}>{s.zielgruppe}</td>
                    <td style={{ padding: 8 }}>{s.consentTyp}</td>
                    <td style={{ padding: 8 }}>{s.imSegment}</td>
                    <td style={{ padding: 8, fontWeight: 700, color: s.versandfaehig > 0 ? '#059669' : 'inherit' }}>
                      {s.versandfaehig}
                    </td>
                    <td style={{ padding: 8, fontSize: 12 }}>
                      {top ? `${top[1]} — ${AUSSCHLUSS_BEZEICHNUNG[top[0] as AusschlussGrund] ?? top[0]}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

const knopf: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
  background: 'rgba(255,255,255,0.08)', color: 'inherit',
  border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
}
