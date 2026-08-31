'use client'
// ═══════════════════════════════════════════════════════════════════════════
// EINWILLIGUNGEN UND SPERRLISTE  /admin/marketing/kontakte
//
// Die beiden Listen stehen bewusst auf EINER Seite, weil sie zusammen erst
// die Frage beantworten, die im Betrieb wirklich gestellt wird: „Warum
// bekommt diese Person keine Post?" Getrennt müsste man an zwei Stellen
// nachsehen und käme bei einer widerrufenen Einwilligung neben einem
// Sperreintrag zu zwei halben Antworten.
//
// ── DIE REIHENFOLGE IST DIE DES CODES ─────────────────────────────────────
// Die Sperrliste steht OBEN, weil sie schwerer wiegt: sie schlägt jede
// Einwilligung (Art. 21 Abs. 3 DSGVO). Wer unten eine offene Einwilligung
// sieht und oben einen Sperreintrag, hat die richtige Rangfolge vor Augen.
//
// ── WAS DIESE SEITE NICHT KANN ────────────────────────────────────────────
// Eine Einwilligung von Hand eintragen geht hier NUR mit Quellenangabe und
// Notiz — und die API weist sie ab, solange die Adresse gesperrt ist. Der
// bequeme Weg „Adresse eintippen, fertig" existiert nicht: eine
// Einwilligung, deren Zustandekommen niemand mehr erklären kann, ist im
// Streitfall wertlos (§ 7 Abs. 2 Nr. 2 UWG, Beweislast beim Werbenden).
// Der reguläre Weg ist das Doppel-Opt-in über /api/marketing/anmeldung.
//
// Sperrgründe aus dem Zustellweg (hard_bounce, spam_beschwerde) sind hier
// NICHT löschbar — das entscheidet die API über `loesbar`. Eine Adresse,
// die als nicht existent zurückkam, wieder freizugeben, hieße denselben
// Zustellfehler erneut zu erzeugen.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react'
import { Banner, EmptyRow, SearchInput, StatusBadge } from '@/components/admin/OpsUI'
import { logger } from '@/lib/logger'
import {
  CONSENT_BEZEICHNUNG, CONSENT_TYPEN, SPERRGRUND_BEZEICHNUNG, SPERRGRUENDE,
  type ConsentTyp, type Sperrgrund,
} from '@/lib/marketing/typen'

const log = logger.child('admin:marketing:kontakte')

interface Einwilligung {
  id: string; email: string; user_id: string | null; consent_type: string
  granted_at: string; revoked_at: string | null; source: string
  text_version: string; notiz: string | null
}
interface Sperreintrag {
  id: string; email: string; reason: string; added_at: string
  notiz: string | null; loesbar: boolean
}

/** Gründe, die aus dem Zustellweg stammen — sie tragen eine andere Farbe,
 *  weil sie nicht von einem Menschen gesetzt wurden. */
const AUS_ZUSTELLWEG = new Set(['hard_bounce', 'soft_bounce_dauerhaft', 'spam_beschwerde'])

const GRUND_FARBE: Record<string, string> = {
  abmeldung: '#6B7280',
  hard_bounce: '#DC2626',
  soft_bounce_dauerhaft: '#D97706',
  spam_beschwerde: '#DC2626',
  manuell: '#2563EB',
  ungueltig: '#D97706',
}

const QUELLE_BEZEICHNUNG: Record<string, string> = {
  website_formular: 'Formular auf der Website',
  doppel_opt_in: 'Doppel-Opt-in (bestätigt)',
  registrierung: 'Bei der Registrierung',
  vertrag: 'Im Vertrag',
  telefonisch: 'Telefonisch',
  schriftlich: 'Schriftlich',
  import: 'Übernahme aus Altbestand',
}

function datum(wert: string | null): string {
  if (!wert) return '—'
  return new Date(wert).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

const knopf: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line, #3A342C)',
  background: 'transparent', color: 'inherit', fontSize: 13, cursor: 'pointer',
}
const feld: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line, #3A342C)',
  background: 'var(--coal, #1A1612)', color: 'inherit', fontSize: 13,
}
const karte: React.CSSProperties = {
  background: 'var(--coal2, #241F1A)', borderRadius: 12, padding: 16, marginTop: 24,
}
const zelle: React.CSSProperties = {
  padding: '8px 10px', borderBottom: '1px solid var(--line, #3A342C)', fontSize: 13,
}

export default function MarketingKontakte() {
  const [einwilligungen, setEinwilligungen] = useState<Einwilligung[]>([])
  const [sperren, setSperren] = useState<Sperreintrag[]>([])
  const [nachArt, setNachArt] = useState<Record<string, number>>({})
  const [nachGrund, setNachGrund] = useState<Record<string, number>>({})
  const [laedt, setLaedt] = useState(true)
  const [beschaeftigt, setBeschaeftigt] = useState(false)
  const [meldung, setMeldung] = useState<{ tone: 'info' | 'warn' | 'danger' | 'success'; text: string } | null>(null)
  const [suche, setSuche] = useState('')

  // Eintragen von Hand
  const [neuEmail, setNeuEmail] = useState('')
  const [neuTyp, setNeuTyp] = useState<ConsentTyp>('newsletter')
  const [neuQuelle, setNeuQuelle] = useState('schriftlich')
  const [neuNotiz, setNeuNotiz] = useState('')

  // Sperren von Hand
  const [sperrEmail, setSperrEmail] = useState('')
  const [sperrGrund, setSperrGrund] = useState<Sperrgrund>('manuell')
  const [sperrNotiz, setSperrNotiz] = useState('')

  const laden = useCallback(async () => {
    setLaedt(true)
    try {
      const [rc, rs] = await Promise.all([
        fetch('/api/admin/marketing/consents', { cache: 'no-store' }),
        fetch('/api/admin/marketing/suppression', { cache: 'no-store' }),
      ])
      if (!rc.ok || !rs.ok) {
        const fehler = !rc.ok ? await rc.json().catch(() => ({})) : await rs.json().catch(() => ({}))
        setMeldung({ tone: 'danger', text: String(fehler.error ?? 'Laden fehlgeschlagen.') })
        return
      }
      const c = await rc.json()
      const s = await rs.json()
      setEinwilligungen(c.einwilligungen ?? [])
      setNachArt(c.nachArt ?? {})
      setSperren(s.eintraege ?? [])
      setNachGrund(s.nachGrund ?? {})
    } catch (err) {
      log.errorWithException('Laden fehlgeschlagen', err)
      setMeldung({ tone: 'danger', text: 'Laden fehlgeschlagen.' })
    } finally {
      setLaedt(false)
    }
  }, [])

  useEffect(() => { void laden() }, [laden])

  /** Ein Aufruf, eine Meldung, danach neu laden. Bewusst zentral: sonst
   *  bleibt irgendwo ein Pfad ohne Rückmeldung und die Seite sieht aus,
   *  als hätte sie nichts getan. */
  const rufe = useCallback(async (
    pfad: string, init: RequestInit, erfolg: string,
  ): Promise<boolean> => {
    setBeschaeftigt(true)
    setMeldung(null)
    try {
      const res = await fetch(pfad, init)
      const rumpf = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMeldung({ tone: 'danger', text: String(rumpf.error ?? `Fehlgeschlagen (${res.status}).`) })
        return false
      }
      setMeldung({ tone: 'success', text: erfolg })
      await laden()
      return true
    } catch (err) {
      log.errorWithException(pfad, err)
      setMeldung({ tone: 'danger', text: 'Aufruf fehlgeschlagen.' })
      return false
    } finally {
      setBeschaeftigt(false)
    }
  }, [laden])

  const eintragen = async () => {
    if (!neuEmail.trim() || neuNotiz.trim().length < 5) {
      setMeldung({
        tone: 'warn',
        text: 'Adresse und eine Notiz (mindestens 5 Zeichen) sind Pflicht — sonst ist die '
          + 'Einwilligung später nicht mehr erklärbar.',
      })
      return
    }
    const ok = await rufe(
      '/api/admin/marketing/consents',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: neuEmail.trim(), consent_type: neuTyp, source: neuQuelle, notiz: neuNotiz.trim(),
        }),
      },
      'Einwilligung eingetragen.',
    )
    if (ok) { setNeuEmail(''); setNeuNotiz('') }
  }

  const widerrufen = async (e: Einwilligung) => {
    if (!confirm(
      `Einwilligung von ${e.email} widerrufen?\n\n`
      + 'Die Adresse kommt dabei auch auf die Sperrliste — ohne das könnte die nächste '
      + 'Anmeldung über ein beliebiges Formular den Widerruf wieder aufheben.',
    )) return
    await rufe(
      `/api/admin/marketing/consents?email=${encodeURIComponent(e.email)}&consent_type=${e.consent_type}`,
      { method: 'DELETE' },
      'Widerrufen und gesperrt.',
    )
  }

  const sperren_ = async () => {
    if (!sperrEmail.trim()) {
      setMeldung({ tone: 'warn', text: 'Adresse fehlt.' })
      return
    }
    const ok = await rufe(
      '/api/admin/marketing/suppression',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sperrEmail.trim(), reason: sperrGrund, notiz: sperrNotiz.trim() || null }),
      },
      'Adresse gesperrt.',
    )
    if (ok) { setSperrEmail(''); setSperrNotiz('') }
  }

  const entsperren = async (s: Sperreintrag) => {
    if (!confirm(
      `${s.email} von der Sperrliste nehmen?\n\n`
      + 'Danach kann die Adresse wieder einwilligen. Eine bestehende Einwilligung entsteht '
      + 'dadurch NICHT von selbst — sie muss neu erteilt werden.',
    )) return
    await rufe(
      `/api/admin/marketing/suppression?email=${encodeURIComponent(s.email)}`,
      { method: 'DELETE' },
      'Von der Sperrliste genommen.',
    )
  }

  const treffer = (wert: string) =>
    !suche.trim() || wert.toLowerCase().includes(suche.trim().toLowerCase())

  const gefilterteSperren = sperren.filter((s) => treffer(s.email))
  const gefilterteEinwilligungen = einwilligungen.filter((e) => treffer(e.email))
  const offeneAnzahl = Object.values(nachArt).reduce((a, b) => a + b, 0)

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Einwilligungen &amp; Sperrliste</h1>
      <p style={{ fontSize: 13, color: 'var(--muted, #8A8279)', marginBottom: 16 }}>
        Wer Werbepost bekommen darf — und wer ausdrücklich nicht. Die Sperrliste schlägt jede
        Einwilligung. Nachrichten zu bestehenden Verträgen (Rechnungen, Termine) laufen an
        beiden Listen vorbei und sind davon nicht betroffen.
      </p>

      {meldung && <Banner tone={meldung.tone}>{meldung.text}</Banner>}

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '16px 0' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted, #8A8279)' }}>offene Einwilligungen</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#059669' }}>{offeneAnzahl}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted, #8A8279)' }}>auf der Sperrliste</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#DC2626' }}>{sperren.length}</div>
        </div>
        {Object.entries(nachArt).map(([typ, n]) => (
          <div key={typ}>
            <div style={{ fontSize: 12, color: 'var(--muted, #8A8279)' }}>
              {CONSENT_BEZEICHNUNG[typ as ConsentTyp] ?? typ}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{n}</div>
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 360 }}>
        <SearchInput value={suche} onChange={setSuche} placeholder="Adresse suchen …" />
      </div>

      {/* ── Sperrliste ─────────────────────────────────────────────────── */}
      <section style={karte}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Sperrliste</h2>
        <p style={{ fontSize: 12, color: 'var(--muted, #8A8279)', marginBottom: 12 }}>
          Adressen hier bekommen keine Werbepost — unabhängig von jeder Einwilligung. Einträge
          aus dem Zustellweg (unzustellbar, Spam-Beschwerde) sind nicht löschbar.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input style={{ ...feld, minWidth: 220 }} placeholder="E-Mail-Adresse"
            value={sperrEmail} onChange={(e) => setSperrEmail(e.target.value)} />
          <select style={feld} value={sperrGrund}
            onChange={(e) => setSperrGrund(e.target.value as Sperrgrund)}>
            {SPERRGRUENDE.map((g) => (
              <option key={g} value={g}>{SPERRGRUND_BEZEICHNUNG[g]}</option>
            ))}
          </select>
          <input style={{ ...feld, minWidth: 200, flex: 1 }} placeholder="Notiz (optional)"
            value={sperrNotiz} onChange={(e) => setSperrNotiz(e.target.value)} />
          <button onClick={() => void sperren_()} disabled={beschaeftigt}
            style={{ ...knopf, background: '#DC2626', color: '#fff', borderColor: '#DC2626' }}>
            Sperren
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: 12, color: 'var(--muted, #8A8279)' }}>
                <th style={zelle}>Adresse</th>
                <th style={zelle}>Grund</th>
                <th style={zelle}>Seit</th>
                <th style={zelle}>Notiz</th>
                <th style={zelle}></th>
              </tr>
            </thead>
            <tbody>
              {laedt && <EmptyRow colSpan={5}>Wird geladen …</EmptyRow>}
              {!laedt && gefilterteSperren.length === 0 && (
                <EmptyRow colSpan={5}>
                  {suche ? 'Kein Treffer.' : 'Keine gesperrte Adresse.'}
                </EmptyRow>
              )}
              {gefilterteSperren.map((s) => (
                <tr key={s.id}>
                  <td style={zelle}>{s.email}</td>
                  <td style={zelle}>
                    <StatusBadge
                      label={SPERRGRUND_BEZEICHNUNG[s.reason as Sperrgrund] ?? s.reason}
                      color={GRUND_FARBE[s.reason] ?? '#6B7280'} />
                  </td>
                  <td style={zelle}>{datum(s.added_at)}</td>
                  <td style={{ ...zelle, color: 'var(--muted, #8A8279)' }}>{s.notiz ?? '—'}</td>
                  <td style={zelle}>
                    {s.loesbar ? (
                      <button onClick={() => void entsperren(s)} disabled={beschaeftigt} style={knopf}>
                        Entsperren
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--muted, #8A8279)' }}
                        title={AUS_ZUSTELLWEG.has(s.reason)
                          ? 'Aus dem Zustellweg gesetzt — die Adresse hat nicht angenommen. Freigeben würde denselben Fehler erneut erzeugen.'
                          : 'Nicht löschbar.'}>
                        nicht löschbar
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Einwilligungen ─────────────────────────────────────────────── */}
      <section style={karte}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Einwilligungen</h2>
        <p style={{ fontSize: 12, color: 'var(--muted, #8A8279)', marginBottom: 12 }}>
          Der reguläre Weg ist das Doppel-Opt-in: die Person bestätigt selbst per Link aus einer
          E-Mail. Ein Eintrag von Hand ist nur für schriftlich oder telefonisch erteilte
          Einwilligungen gedacht und verlangt deshalb eine Notiz, aus der hervorgeht, wie sie
          zustande kam.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input style={{ ...feld, minWidth: 220 }} placeholder="E-Mail-Adresse"
            value={neuEmail} onChange={(e) => setNeuEmail(e.target.value)} />
          <select style={feld} value={neuTyp} onChange={(e) => setNeuTyp(e.target.value as ConsentTyp)}>
            {CONSENT_TYPEN.map((t) => (
              <option key={t} value={t}>{CONSENT_BEZEICHNUNG[t]}</option>
            ))}
          </select>
          <select style={feld} value={neuQuelle} onChange={(e) => setNeuQuelle(e.target.value)}>
            {['schriftlich', 'telefonisch', 'vertrag', 'registrierung', 'import'].map((q) => (
              <option key={q} value={q}>{QUELLE_BEZEICHNUNG[q] ?? q}</option>
            ))}
          </select>
          <input style={{ ...feld, minWidth: 200, flex: 1 }}
            placeholder="Wie kam sie zustande? (Pflicht)"
            value={neuNotiz} onChange={(e) => setNeuNotiz(e.target.value)} />
          <button onClick={() => void eintragen()} disabled={beschaeftigt} style={knopf}>
            Eintragen
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: 12, color: 'var(--muted, #8A8279)' }}>
                <th style={zelle}>Adresse</th>
                <th style={zelle}>Art</th>
                <th style={zelle}>Quelle</th>
                <th style={zelle}>Erteilt</th>
                <th style={zelle}>Stand</th>
                <th style={zelle}>Notiz</th>
                <th style={zelle}></th>
              </tr>
            </thead>
            <tbody>
              {laedt && <EmptyRow colSpan={7}>Wird geladen …</EmptyRow>}
              {!laedt && gefilterteEinwilligungen.length === 0 && (
                <EmptyRow colSpan={7}>
                  {suche
                    ? 'Kein Treffer.'
                    : 'Keine Einwilligung erfasst. Ohne offene Einwilligung ist jeder Kampagnen-Trockenlauf korrekt 0 versandfähig.'}
                </EmptyRow>
              )}
              {gefilterteEinwilligungen.map((e) => (
                <tr key={e.id}>
                  <td style={zelle}>{e.email}</td>
                  <td style={zelle}>{CONSENT_BEZEICHNUNG[e.consent_type as ConsentTyp] ?? e.consent_type}</td>
                  <td style={zelle}>{QUELLE_BEZEICHNUNG[e.source] ?? e.source}</td>
                  <td style={zelle}>{datum(e.granted_at)}</td>
                  <td style={zelle}>
                    {e.revoked_at
                      ? <StatusBadge label={`widerrufen ${datum(e.revoked_at)}`} color="#DC2626" />
                      : <StatusBadge label="offen" color="#059669" />}
                  </td>
                  <td style={{ ...zelle, color: 'var(--muted, #8A8279)' }}>{e.notiz ?? '—'}</td>
                  <td style={zelle}>
                    {!e.revoked_at && (
                      <button onClick={() => void widerrufen(e)} disabled={beschaeftigt} style={knopf}>
                        Widerrufen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p style={{ fontSize: 12, color: 'var(--muted, #8A8279)', marginTop: 16 }}>
        Beide Listen zeigen höchstens 500 Einträge, die jüngsten zuerst.
      </p>
    </div>
  )
}
