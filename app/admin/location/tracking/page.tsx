'use client'
// ═══════════════════════════════════════════════════════════════════════
// Standortansicht — /admin/location/tracking
// ═══════════════════════════════════════════════════════════════════════
//
// Die Aufsicht auf location_updates. Sichtbar nur fuer Konten mit
// 'sicherheit.lesen' (admin/superadmin) — die Navigation blendet sie
// ueber darfPfad() aus, der Riegel selbst sitzt in der Route
// (app/api/admin/location/tracking/route.ts) und in der RLS-Policy.
//
// WAS HIER BEWUSST FEHLT
//   * Ein Schalter, mit dem sich die Freigabe fuer ein Konto
//     EINSCHALTEN liesse. Es gibt keinen — auch nicht fuer die
//     Administration. Die Freigabe ist eine Erklaerung der betroffenen
//     Person; die Route hat nur einen GET-Handler.
//   * Ein Mandanten-Auswahlfeld. Die Organisation kommt aus dem
//     Auth-Kontext, nicht aus der Anfrage — ein Feld dafuer waere ein
//     Eingabefeld fuer fremde Mandanten. Der aktive Mandant steht oben
//     als Text, damit die Einschraenkung sichtbar ist statt
//     stillschweigend.
//
// Jeder Aufruf dieser Seite schreibt `location_tracking_view` in die
// Sicherheitsspur. Das steht auch fuer die lesende Person hier — wer
// hier hineinsieht, soll wissen, dass es festgehalten wird.
// ═══════════════════════════════════════════════════════════════════════

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Banner, EmptyRow } from '@/components/admin/OpsUI'
import StandortKarte, { farbeFuer } from '@/components/admin/StandortKarte'
import { logger } from '@/lib/logger'

const log = logger.child('admin:standort')

interface Punkt {
  id: string
  userId: string
  latitude: number
  longitude: number
  accuracyMeters: number | null
  altitude: number | null
  speed: number | null
  heading: number | null
  timestampUtc: string
  createdAt: string
  sessionId: string | null
  serviceId: string | null
  plattform: string | null
  appVersion: string | null
  modus: string
  ip: string | null
  geraet: string | null
}

interface Konto {
  userId: string
  name: string | null
  email: string | null
  rolle: string | null
  modus: string
  enabledAt: string | null
  disabledAt: string | null
  osPermissionGranted: boolean
  letzterPunkt: Punkt | null
  punkteImZeitraum: number
}

interface Antwort {
  punkte: Punkt[]
  konten: Konto[]
  von: string
  bis: string
  gekuerzt: boolean
  grenze: number
  katalog: {
    modi: Array<{ wert: string; bezeichnung: string }>
    plattformen: string[]
    punkteMax: number
    zeitraumMaxTage: number
    zeitraumVorgabeStunden: number
  }
}

interface Filter {
  userId: string
  von: string
  bis: string
  plattform: string
  grenze: string
}

const LEERER_FILTER: Filter = { userId: '', von: '', bis: '', plattform: '', grenze: '500' }

const MODUS_FARBE: Record<string, string> = {
  off: '#888',
  during_service: '#2D8F5E',
  always: '#C9963C',
}

const zelle: React.CSSProperties = {
  padding: '9px 10px', borderBottom: '1px solid var(--border)',
  fontSize: 13, verticalAlign: 'top',
}
const kopf: React.CSSProperties = {
  ...zelle, color: '#888', fontWeight: 600, fontSize: 11,
  textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap',
}
const eingabe: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal2)', color: 'var(--ink)', fontSize: 13,
  fontFamily: 'inherit', minWidth: 140,
}
const knopf: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', fontWeight: 500,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit',
}

function zeitpunkt(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short',
    })
  } catch { return iso }
}

/** Genauigkeit ist eine Angabe, keine Zierde — „unbekannt" ist eine Aussage. */
function genauigkeit(meter: number | null): string {
  if (meter == null) return 'unbekannt'
  if (meter >= 1000) return `${(meter / 1000).toFixed(1)} km`
  return `${Math.round(meter)} m`
}

export default function StandortAnsichtSeite() {
  const [filter, setFilter] = useState<Filter>(LEERER_FILTER)
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [laedt, setLaedt] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [offen, setOffen] = useState<string | null>(null)

  const abfrage = useMemo(() => {
    const p = new URLSearchParams()
    if (filter.userId.trim()) p.set('userId', filter.userId.trim())
    if (filter.von) p.set('von', filter.von)
    if (filter.bis) p.set('bis', filter.bis)
    if (filter.plattform) p.set('plattform', filter.plattform)
    if (filter.grenze) p.set('grenze', filter.grenze)
    return p.toString()
  }, [filter])

  const laden = useCallback(async () => {
    setLaedt(true)
    setFehler(null)
    try {
      const res = await fetch(`/api/admin/location/tracking?${abfrage}`)
      const inhalt = await res.json().catch(() => null)
      if (!res.ok) throw new Error(inhalt?.error || 'Die Standortansicht konnte nicht geladen werden.')
      setDaten(inhalt as Antwort)
    } catch (e) {
      log.errorWithException('Standortansicht laden', e)
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler.')
      setDaten(null)
    } finally {
      setLaedt(false)
    }
  }, [abfrage])

  useEffect(() => { laden() }, [laden])

  const punkteJeKonto = useMemo(() => {
    const karte = new Map<string, Punkt[]>()
    for (const p of daten?.punkte ?? []) {
      const liste = karte.get(p.userId)
      if (liste) liste.push(p)
      else karte.set(p.userId, [p])
    }
    return karte
  }, [daten])

  return (
    <div style={{ padding: '24px 20px 60px', maxWidth: 1360, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Standortansicht</h1>
      <p style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.7, maxWidth: 860, marginBottom: 16 }}>
        Zeigt ausschließlich Konten, die die Standortfreigabe <strong>selbst</strong> eingeschaltet
        haben. Es gibt hier keinen Schalter, um sie für jemanden einzuschalten — das kann nur die
        betroffene Person in ihren eigenen Einstellungen. Jeder Aufruf dieser Seite wird in der
        Sicherheitsspur festgehalten.
      </p>

      <div style={{ marginBottom: 16 }}>
        <Banner tone="info">
          Sichtbar ist nur der aktive Mandant. Ein Auswahlfeld für andere Organisationen gibt es
          bewusst nicht — die Organisation wird serverseitig aus der Anmeldung bestimmt.
          Der Zeitraum reicht höchstens {daten?.katalog.zeitraumMaxTage ?? 31} Tage zurück; ohne
          Angabe werden die letzten {daten?.katalog.zeitraumVorgabeStunden ?? 24} Stunden gezeigt.
        </Banner>
      </div>

      {/* ── Filter ──────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end',
        padding: 14, borderRadius: 12, border: '1px solid var(--border)',
        background: 'var(--coal2)', marginBottom: 16,
      }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 11, color: '#888' }}>
          BENUTZER
          <select
            value={filter.userId}
            onChange={e => setFilter(f => ({ ...f, userId: e.target.value }))}
            style={eingabe}
          >
            <option value="">Alle freigegebenen Konten</option>
            {(daten?.konten ?? []).map(k => (
              <option key={k.userId} value={k.userId}>
                {k.name || k.email || k.userId}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 4, fontSize: 11, color: '#888' }}>
          VON
          <input
            type="date" value={filter.von} style={eingabe}
            onChange={e => setFilter(f => ({ ...f, von: e.target.value }))}
          />
        </label>

        <label style={{ display: 'grid', gap: 4, fontSize: 11, color: '#888' }}>
          BIS
          <input
            type="date" value={filter.bis} style={eingabe}
            onChange={e => setFilter(f => ({ ...f, bis: e.target.value }))}
          />
        </label>

        <label style={{ display: 'grid', gap: 4, fontSize: 11, color: '#888' }}>
          PLATTFORM
          <select
            value={filter.plattform}
            onChange={e => setFilter(f => ({ ...f, plattform: e.target.value }))}
            style={eingabe}
          >
            <option value="">Alle</option>
            {(daten?.katalog.plattformen ?? ['ios', 'android', 'web']).map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 4, fontSize: 11, color: '#888' }}>
          MAX. PUNKTE
          <input
            type="number" min={1} max={daten?.katalog.punkteMax ?? 5000}
            value={filter.grenze} style={{ ...eingabe, minWidth: 100 }}
            onChange={e => setFilter(f => ({ ...f, grenze: e.target.value }))}
          />
        </label>

        <button type="button" style={knopf} onClick={() => setFilter(LEERER_FILTER)}>
          Zurücksetzen
        </button>
        <button type="button" style={knopf} onClick={laden} disabled={laedt}>
          {laedt ? 'Lädt …' : 'Aktualisieren'}
        </button>
      </div>

      {fehler && <div style={{ marginBottom: 16 }}><Banner tone="danger">{fehler}</Banner></div>}

      {daten?.gekuerzt && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="warn">
            Die Anzeige wurde bei {daten.grenze} Punkten abgeschnitten. Ältere Punkte des Zeitraums
            fehlen — bitte den Zeitraum eingrenzen oder ein einzelnes Konto wählen.
          </Banner>
        </div>
      )}

      {/* ── Karte ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <StandortKarte
          punkte={daten?.punkte ?? []}
          konten={(daten?.konten ?? []).map(k => ({
            userId: k.userId, name: k.name, email: k.email, modus: k.modus,
          }))}
        />
      </div>

      {/* ── Konten ──────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden',
        background: 'var(--coal2)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...kopf, width: 8 }} />
              <th style={kopf}>Konto</th>
              <th style={kopf}>Rolle</th>
              <th style={kopf}>Modus</th>
              <th style={kopf}>OS-Berechtigung</th>
              <th style={kopf}>Letzter Standort</th>
              <th style={kopf}>Genauigkeit</th>
              <th style={kopf}>App</th>
              <th style={kopf}>Punkte</th>
            </tr>
          </thead>
          <tbody>
            {laedt && <EmptyRow colSpan={9}>Lädt …</EmptyRow>}

            {!laedt && !(daten?.konten.length) && (
              <EmptyRow colSpan={9}>
                Kein Konto in diesem Mandanten hat die Standortfreigabe eingeschaltet.
              </EmptyRow>
            )}

            {!laedt && (daten?.konten ?? []).map(k => {
              const punkte = punkteJeKonto.get(k.userId) ?? []
              const auf = offen === k.userId
              return (
                <Fragment key={k.userId}>
                  <tr
                    onClick={() => setOffen(auf ? null : k.userId)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ ...zelle, background: farbeFuer(k.userId), padding: 0 }} />
                    <td style={zelle}>
                      <div style={{ fontWeight: 600 }}>{k.name || '—'}</div>
                      <div style={{ color: '#888', fontSize: 11 }}>{k.email || k.userId}</div>
                    </td>
                    <td style={{ ...zelle, color: 'var(--ink3)' }}>{k.rolle || '—'}</td>
                    <td style={zelle}>
                      <span style={{
                        color: MODUS_FARBE[k.modus] ?? '#888', fontWeight: 600, fontSize: 12,
                      }}>
                        {daten?.katalog.modi.find(m => m.wert === k.modus)?.bezeichnung ?? k.modus}
                      </span>
                      {k.enabledAt && (
                        <div style={{ color: '#888', fontSize: 11 }}>
                          seit {zeitpunkt(k.enabledAt)}
                        </div>
                      )}
                    </td>
                    <td style={{ ...zelle, color: k.osPermissionGranted ? '#2D8F5E' : '#888' }}>
                      {k.osPermissionGranted ? 'erteilt' : 'nicht erteilt'}
                    </td>
                    <td style={zelle}>{zeitpunkt(k.letzterPunkt?.timestampUtc ?? null)}</td>
                    <td style={{ ...zelle, color: 'var(--ink3)' }}>
                      {genauigkeit(k.letzterPunkt?.accuracyMeters ?? null)}
                    </td>
                    <td style={{ ...zelle, color: 'var(--ink3)' }}>
                      {k.letzterPunkt?.plattform ?? '—'}
                      {k.letzterPunkt?.appVersion ? ` ${k.letzterPunkt.appVersion}` : ''}
                    </td>
                    <td style={zelle}>{k.punkteImZeitraum}</td>
                  </tr>

                  {auf && (
                    <tr>
                      <td colSpan={9} style={{ ...zelle, background: 'var(--coal)' }}>
                        {punkte.length === 0 ? (
                          <div style={{ color: '#888', fontSize: 12 }}>
                            Im gewählten Zeitraum wurde kein Standort gemeldet.
                          </div>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                <th style={kopf}>Zeitpunkt (Gerät)</th>
                                <th style={kopf}>Eingang</th>
                                <th style={kopf}>Position</th>
                                <th style={kopf}>Genauigkeit</th>
                                <th style={kopf}>Modus</th>
                                <th style={kopf}>Einsatz</th>
                                <th style={kopf}>Gerät</th>
                                <th style={kopf}>IP</th>
                              </tr>
                            </thead>
                            <tbody>
                              {punkte.map(p => (
                                <tr key={p.id}>
                                  <td style={zelle}>{zeitpunkt(p.timestampUtc)}</td>
                                  <td style={{ ...zelle, color: '#888' }}>{zeitpunkt(p.createdAt)}</td>
                                  <td style={{ ...zelle, fontFamily: 'monospace', fontSize: 12 }}>
                                    {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                                  </td>
                                  <td style={zelle}>{genauigkeit(p.accuracyMeters)}</td>
                                  <td style={zelle}>{p.modus}</td>
                                  <td style={{ ...zelle, color: 'var(--ink3)' }}>
                                    {p.serviceId ? 'zugeordnet' : '—'}
                                  </td>
                                  <td style={{ ...zelle, color: 'var(--ink3)' }}>
                                    {p.geraet ?? '—'}
                                  </td>
                                  <td style={{ ...zelle, color: '#888', fontFamily: 'monospace', fontSize: 11 }}>
                                    {p.ip ?? '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {daten && (
        <p style={{ fontSize: 11, color: '#888', marginTop: 12 }}>
          Zeitraum: {zeitpunkt(daten.von)} – {zeitpunkt(daten.bis)} ·
          {' '}{daten.punkte.length} Punkte · Kartendaten © OpenStreetMap-Mitwirkende
        </p>
      )}
    </div>
  )
}
