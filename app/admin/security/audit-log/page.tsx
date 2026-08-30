'use client'
// ═══════════════════════════════════════════════════════════════════════
// Sicherheitsspur — /admin/security/audit-log
// ═══════════════════════════════════════════════════════════════════════
//
// Die Ansicht auf security_audit_log. Sichtbar nur fuer Konten mit
// 'sicherheit.lesen' (admin/superadmin) — die Navigation blendet sie
// ueber darfPfad() aus, der Riegel selbst sitzt in der Route
// (app/api/admin/security/audit-log/route.ts) und in der RLS-Policy.
//
// Aufbau: Filter oben, darunter die Liste. Die wichtigste Spalte ist der
// Schweregrad — sie steht deshalb links und nicht am Ende, wo sie
// niemand liest.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banner, EmptyRow } from '@/components/admin/OpsUI'
import { logger } from '@/lib/logger'

const log = logger.child('admin:security-audit')

interface SpurZeile {
  id: string
  createdAt: string
  eventType: string
  eventBezeichnung: string
  eventCategory: string | null
  kategorieBezeichnung: string
  severity: string
  severityBezeichnung: string
  userId: string | null
  userEmail: string | null
  userName: string | null
  organizationId: string | null
  organisationsName: string | null
  ip: string | null
  userAgent: string | null
  plattform: string | null
  geraet: string | null
  appVersion: string | null
  sessionReference: string | null
  metadata: Record<string, unknown> | null
}

interface Katalog {
  ereignisse: Array<{ typ: string; bezeichnung: string; kategorie: string; schweregrad: string; meldepflichtig: boolean }>
  kategorien: Array<{ wert: string; bezeichnung: string }>
  schweregrade: Array<{ wert: string; bezeichnung: string }>
  plattformen: string[]
  sortierfelder: string[]
  exportMax: number
}

interface Antwort {
  zeilen: SpurZeile[]
  gesamt: number
  seite: number
  seitengroesse: number
  seiten: number
  katalog: Katalog
}

interface WatchlistZeile {
  id: string
  userId: string
  aktiv: boolean
  alleEreignisse: boolean
  ohneSperrfrist: boolean
  meldeEmail: string | null
  emailKontrolle: string | null
  kontoEmail: string | null
  name: string | null
  rolle: string | null
  grund: string
  createdAt: string
  adressenAbweichung: boolean
}

interface Filter {
  suche: string
  userId: string
  von: string
  bis: string
  eventType: string
  kategorie: string
  severity: string
  plattform: string
  ip: string
}

const LEERER_FILTER: Filter = {
  suche: '', userId: '', von: '', bis: '',
  eventType: '', kategorie: '', severity: '', plattform: '', ip: '',
}

const FARBE: Record<string, string> = {
  info: '#2D8F5E', warning: '#C9963C', critical: '#C0392B',
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

function zeitpunkt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'medium',
    })
  } catch { return iso }
}

export default function SicherheitsspurSeite() {
  const [filter, setFilter] = useState<Filter>(LEERER_FILTER)
  const [seite, setSeite] = useState(1)
  const [sortierFeld, setSortierFeld] = useState('created_at')
  const [sortierRichtung, setSortierRichtung] = useState<'asc' | 'desc'>('desc')
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [laedt, setLaedt] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [offen, setOffen] = useState<string | null>(null)
  const [exportLaeuft, setExportLaeuft] = useState(false)

  // ── Überwachungsliste (ACCOUNT_SECURITY_ALERTS) ──
  const [wlOffen, setWlOffen] = useState(false)
  const [wl, setWl] = useState<WatchlistZeile[]>([])
  const [wlFormular, setWlFormular] = useState({ userId: '', grund: '', meldeEmail: '', emailKontrolle: '' })
  const [wlMeldung, setWlMeldung] = useState<{ ton: 'info' | 'warn' | 'danger'; text: string } | null>(null)
  const [wlLaeuft, setWlLaeuft] = useState(false)

  const abfrage = useMemo(() => {
    const p = new URLSearchParams()
    if (filter.suche) p.set('suche', filter.suche)
    if (filter.userId) p.set('userId', filter.userId)
    if (filter.von) p.set('von', filter.von)
    if (filter.bis) p.set('bis', filter.bis)
    if (filter.eventType) p.set('eventType', filter.eventType)
    if (filter.kategorie) p.set('kategorie', filter.kategorie)
    if (filter.severity) p.set('severity', filter.severity)
    if (filter.plattform) p.set('plattform', filter.plattform)
    if (filter.ip) p.set('ip', filter.ip)
    p.set('sortierFeld', sortierFeld)
    p.set('sortierRichtung', sortierRichtung)
    return p
  }, [filter, sortierFeld, sortierRichtung])

  const laden = useCallback(async () => {
    setLaedt(true)
    setFehler(null)
    try {
      const p = new URLSearchParams(abfrage)
      p.set('seite', String(seite))
      const res = await fetch(`/api/admin/security/audit-log?${p.toString()}`)
      if (res.status === 403) {
        setFehler('Für die Sicherheitsspur fehlt Ihnen die Berechtigung.')
        return
      }
      if (!res.ok) {
        setFehler('Die Sicherheitsspur konnte nicht geladen werden.')
        return
      }
      setDaten((await res.json()) as Antwort)
    } catch (err) {
      log.errorWithException('Sicherheitsspur konnte nicht geladen werden', err)
      setFehler('Die Sicherheitsspur konnte nicht geladen werden.')
    } finally {
      setLaedt(false)
    }
  }, [abfrage, seite])

  useEffect(() => { void laden() }, [laden])

  const ladeWatchlist = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/security/watchlist')
      if (!res.ok) return
      const json = (await res.json()) as { eintraege: WatchlistZeile[] }
      setWl(json.eintraege ?? [])
    } catch (err) {
      log.errorWithException('Überwachungsliste konnte nicht geladen werden', err)
    }
  }, [])

  useEffect(() => { if (wlOffen) void ladeWatchlist() }, [wlOffen, ladeWatchlist])

  async function watchlistSetzen(userId: string, aktiv: boolean, grund: string, meldeEmail: string, emailKontrolle: string) {
    setWlLaeuft(true)
    setWlMeldung(null)
    try {
      const res = await fetch('/api/admin/security/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, aktiv, grund, meldeEmail: meldeEmail || null, emailKontrolle: emailKontrolle || null }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setWlMeldung({ ton: 'danger', text: json?.error ?? 'Die Änderung ist fehlgeschlagen.' })
        return
      }
      setWlMeldung(
        json?.adressenAbweichung
          ? { ton: 'warn', text: json.hinweis }
          : { ton: 'info', text: aktiv ? 'Alarm für dieses Konto ist aktiv.' : 'Alarm für dieses Konto ist abgeschaltet.' },
      )
      setWlFormular({ userId: '', grund: '', meldeEmail: '', emailKontrolle: '' })
      await ladeWatchlist()
      await laden()
    } catch (err) {
      log.errorWithException('Überwachung konnte nicht gesetzt werden', err)
      setWlMeldung({ ton: 'danger', text: 'Die Änderung ist fehlgeschlagen.' })
    } finally {
      setWlLaeuft(false)
    }
  }

  async function exportieren() {
    setExportLaeuft(true)
    try {
      const p = new URLSearchParams(abfrage)
      p.set('format', 'csv')
      const res = await fetch(`/api/admin/security/audit-log?${p.toString()}`)
      if (!res.ok) { setFehler('Der Export ist fehlgeschlagen.'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sicherheitsspur-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      log.errorWithException('Export fehlgeschlagen', err)
      setFehler('Der Export ist fehlgeschlagen.')
    } finally {
      setExportLaeuft(false)
    }
  }

  function setzeFilter<K extends keyof Filter>(schluessel: K, wert: Filter[K]) {
    setSeite(1)
    setFilter(f => ({ ...f, [schluessel]: wert }))
  }

  function sortiereNach(feld: string) {
    if (feld === sortierFeld) setSortierRichtung(r => (r === 'asc' ? 'desc' : 'asc'))
    else { setSortierFeld(feld); setSortierRichtung('desc') }
    setSeite(1)
  }

  const katalog = daten?.katalog
  const pfeil = (feld: string) => (sortierFeld === feld ? (sortierRichtung === 'asc' ? ' ▲' : ' ▼') : '')

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Sicherheitsspur</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16, maxWidth: 780, lineHeight: 1.5 }}>
        Anmeldungen, Sitzungen, Geräte, Rechteänderungen und sicherheitskritische
        Aktionen. Die Einträge sind unveränderlich — sie lassen sich weder
        bearbeiten noch einzeln löschen. Passwörter, Tokens und Sitzungsdaten
        werden bewusst nicht gespeichert; MAC-Adressen stehen technisch nicht
        zur Verfügung und werden als <code>not_available</code> geführt.
      </p>

      {fehler && <Banner tone="danger">{fehler}</Banner>}

      {/* ── Überwachungsliste ── */}
      <div style={{ marginBottom: 14, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--coal2)' }}>
        <button
          onClick={() => setWlOffen(o => !o)}
          aria-expanded={wlOffen}
          style={{ ...knopf, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '12px 14px', fontWeight: 600 }}
        >
          {wlOffen ? '▾' : '▸'} Überwachte Konten (ACCOUNT_SECURITY_ALERTS)
          {wl.length > 0 && <span style={{ color: '#888', fontWeight: 400 }}> · {wl.filter(w => w.aktiv).length} aktiv</span>}
        </button>

        {wlOffen && (
          <div style={{ padding: '0 14px 14px' }}>
            <p style={{ color: '#888', fontSize: 12, lineHeight: 1.5, marginTop: 0, maxWidth: 760 }}>
              Konten mit aktivem Alarm bekommen eine E-Mail bei jedem Ereignis des
              Überwachungssatzes — auch bei Abmeldung, Fehlversuch und App-Start —
              und ohne die 12-Stunden-Bremse. Konten mit Verwaltungsrolle sind
              ohnehin gemeldet und brauchen hier keinen Eintrag. Die Zuordnung
              hängt an der Konto-Kennung, nicht an der E-Mail-Adresse: die ist
              veränderlich. Jede Änderung hier wird selbst protokolliert.
            </p>

            {wlMeldung && <Banner tone={wlMeldung.ton}>{wlMeldung.text}</Banner>}

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
              <thead>
                <tr>
                  <th style={kopf}>Konto</th>
                  <th style={kopf}>Rolle</th>
                  <th style={kopf}>Meldung an</th>
                  <th style={kopf}>Grund</th>
                  <th style={kopf}>Alarm</th>
                  <th style={kopf}> </th>
                </tr>
              </thead>
              <tbody>
                {wl.length === 0 && <EmptyRow colSpan={6}>Kein Konto ausdrücklich überwacht.</EmptyRow>}
                {wl.map(w => (
                  <tr key={w.id}>
                    <td style={zelle}>
                      <div>{w.name ?? '—'}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{w.kontoEmail ?? '—'}</div>
                      <div style={{ fontSize: 10, color: '#666', fontFamily: 'monospace' }}>{w.userId}</div>
                      {w.adressenAbweichung && (
                        <div style={{ fontSize: 11, color: '#C9963C' }}>
                          angegeben war: {w.emailKontrolle}
                        </div>
                      )}
                    </td>
                    <td style={zelle}>{w.rolle ?? '—'}</td>
                    <td style={zelle}>{w.meldeEmail ?? w.kontoEmail ?? '—'}</td>
                    <td style={{ ...zelle, maxWidth: 260 }}>{w.grund}</td>
                    <td style={zelle}>
                      <span style={{ color: w.aktiv ? '#2D8F5E' : '#888' }}>
                        {w.aktiv ? 'aktiv' : 'aus'}
                      </span>
                    </td>
                    <td style={zelle}>
                      <button
                        style={{ ...knopf, padding: '4px 10px', fontSize: 12 }}
                        disabled={wlLaeuft}
                        onClick={() => watchlistSetzen(w.userId, !w.aktiv, w.grund, w.meldeEmail ?? '', w.emailKontrolle ?? '')}
                      >
                        {w.aktiv ? 'Abschalten' : 'Einschalten'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
              <input
                style={{ ...eingabe, minWidth: 300, fontFamily: 'monospace' }}
                placeholder="Konto-Kennung (UUID)"
                value={wlFormular.userId}
                onChange={e => setWlFormular(f => ({ ...f, userId: e.target.value }))}
                aria-label="Konto-Kennung"
              />
              <input
                style={{ ...eingabe, minWidth: 220 }}
                placeholder="E-Mail (nur Gegenprobe)"
                value={wlFormular.emailKontrolle}
                onChange={e => setWlFormular(f => ({ ...f, emailKontrolle: e.target.value }))}
                aria-label="E-Mail zur Gegenprobe"
              />
              <input
                style={{ ...eingabe, minWidth: 220 }}
                placeholder="Meldung an (leer = Konto selbst)"
                value={wlFormular.meldeEmail}
                onChange={e => setWlFormular(f => ({ ...f, meldeEmail: e.target.value }))}
                aria-label="Abweichende Meldeadresse"
              />
              <input
                style={{ ...eingabe, minWidth: 280 }}
                placeholder="Grund (Pflicht)"
                value={wlFormular.grund}
                onChange={e => setWlFormular(f => ({ ...f, grund: e.target.value }))}
                aria-label="Grund der Überwachung"
              />
              <button
                style={knopf}
                disabled={wlLaeuft || !wlFormular.userId || wlFormular.grund.trim().length < 5}
                onClick={() => watchlistSetzen(wlFormular.userId.trim(), true, wlFormular.grund.trim(), wlFormular.meldeEmail.trim(), wlFormular.emailKontrolle.trim())}
              >
                {wlLaeuft ? 'Wird gespeichert …' : 'Alarm einschalten'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Filter ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14,
        padding: 14, borderRadius: 10, border: '1px solid var(--border)',
        background: 'var(--coal2)',
      }}>
        <input
          style={eingabe} type="search" placeholder="E-Mail des Kontos"
          value={filter.suche} onChange={e => setzeFilter('suche', e.target.value)}
          aria-label="Nach E-Mail-Adresse filtern"
        />
        <input
          style={eingabe} type="text" placeholder="Konto-ID (UUID)"
          value={filter.userId} onChange={e => setzeFilter('userId', e.target.value)}
          aria-label="Nach Konto-Kennung filtern"
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888' }}>
          von
          <input style={eingabe} type="date" value={filter.von}
            onChange={e => setzeFilter('von', e.target.value)} aria-label="Zeitraum von" />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888' }}>
          bis
          <input style={eingabe} type="date" value={filter.bis}
            onChange={e => setzeFilter('bis', e.target.value)} aria-label="Zeitraum bis" />
        </label>
        <select style={eingabe} value={filter.eventType}
          onChange={e => setzeFilter('eventType', e.target.value)} aria-label="Ereignistyp">
          <option value="">Alle Ereignisse</option>
          {(katalog?.ereignisse ?? []).map(e => (
            <option key={e.typ} value={e.typ}>{e.bezeichnung}</option>
          ))}
        </select>
        <select style={eingabe} value={filter.kategorie}
          onChange={e => setzeFilter('kategorie', e.target.value)} aria-label="Kategorie">
          <option value="">Alle Kategorien</option>
          {(katalog?.kategorien ?? []).map(k => (
            <option key={k.wert} value={k.wert}>{k.bezeichnung}</option>
          ))}
        </select>
        <select style={eingabe} value={filter.severity}
          onChange={e => setzeFilter('severity', e.target.value)} aria-label="Schweregrad">
          <option value="">Alle Schweregrade</option>
          {(katalog?.schweregrade ?? []).map(s => (
            <option key={s.wert} value={s.wert}>{s.bezeichnung}</option>
          ))}
        </select>
        <select style={eingabe} value={filter.plattform}
          onChange={e => setzeFilter('plattform', e.target.value)} aria-label="Plattform">
          <option value="">Alle Plattformen</option>
          {(katalog?.plattformen ?? []).map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input
          style={eingabe} type="text" placeholder="IP-Adresse"
          value={filter.ip} onChange={e => setzeFilter('ip', e.target.value)}
          aria-label="Nach IP-Adresse filtern"
        />
        <button style={knopf} onClick={() => { setFilter(LEERER_FILTER); setSeite(1) }}>
          Filter zurücksetzen
        </button>
        <button style={{ ...knopf, marginLeft: 'auto' }} onClick={exportieren} disabled={exportLaeuft}>
          {exportLaeuft ? 'Export läuft …' : 'Als CSV exportieren'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: '#888' }}>
          {laedt ? 'Wird geladen …' : `${daten?.gesamt ?? 0} Einträge`}
        </span>
        {katalog && (daten?.gesamt ?? 0) > katalog.exportMax && (
          <span style={{ fontSize: 12, color: '#C9963C' }}>
            Der Export umfasst höchstens {katalog.exportMax.toLocaleString('de-DE')} Zeilen —
            grenzen Sie den Zeitraum ein.
          </span>
        )}
      </div>

      {/* ── Liste ── */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
          <thead>
            <tr>
              <th style={{ ...kopf, cursor: 'pointer' }} onClick={() => sortiereNach('severity')}>
                Grad{pfeil('severity')}
              </th>
              <th style={{ ...kopf, cursor: 'pointer' }} onClick={() => sortiereNach('created_at')}>
                Zeitpunkt{pfeil('created_at')}
              </th>
              <th style={{ ...kopf, cursor: 'pointer' }} onClick={() => sortiereNach('event_type')}>
                Ereignis{pfeil('event_type')}
              </th>
              <th style={kopf}>Kategorie</th>
              <th style={{ ...kopf, cursor: 'pointer' }} onClick={() => sortiereNach('user_email')}>
                Konto{pfeil('user_email')}
              </th>
              <th style={kopf}>Organisation</th>
              <th style={kopf}>Zugang</th>
              <th style={kopf}>IP</th>
              <th style={kopf}>Gerät</th>
              <th style={kopf}> </th>
            </tr>
          </thead>
          <tbody>
            {(daten?.zeilen ?? []).length === 0 && !laedt && (
              <EmptyRow colSpan={10}>Keine Einträge für diese Auswahl.</EmptyRow>
            )}
            {(daten?.zeilen ?? []).map(z => (
              <tr key={z.id}>
                <td style={zelle}>
                  <span style={{
                    display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
                    background: FARBE[z.severity] ?? '#888', marginRight: 6,
                  }} />
                  <span style={{ fontSize: 12, color: FARBE[z.severity] ?? '#888' }}>
                    {z.severityBezeichnung}
                  </span>
                </td>
                <td style={{ ...zelle, whiteSpace: 'nowrap' }}>{zeitpunkt(z.createdAt)}</td>
                <td style={zelle}>
                  <div>{z.eventBezeichnung}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{z.eventType}</div>
                </td>
                <td style={zelle}>{z.kategorieBezeichnung}</td>
                <td style={zelle}>
                  <div>{z.userEmail ?? '—'}</div>
                  {z.userName && <div style={{ fontSize: 11, color: '#888' }}>{z.userName}</div>}
                </td>
                <td style={zelle}>{z.organisationsName ?? (z.organizationId ? '—' : 'ohne Mandant')}</td>
                <td style={zelle}>{z.plattform ?? '—'}</td>
                <td style={{ ...zelle, fontFamily: 'monospace', fontSize: 12 }}>{z.ip ?? '—'}</td>
                <td style={zelle}>{z.geraet ?? '—'}</td>
                <td style={zelle}>
                  <button
                    style={{ ...knopf, padding: '4px 10px', fontSize: 12 }}
                    onClick={() => setOffen(offen === z.id ? null : z.id)}
                    aria-expanded={offen === z.id}
                  >
                    {offen === z.id ? 'Zu' : 'Details'}
                  </button>
                </td>
              </tr>
            ))}
            {(daten?.zeilen ?? []).map(z => offen === z.id ? (
              <tr key={`${z.id}-details`}>
                <td colSpan={10} style={{ ...zelle, background: 'var(--coal2)' }}>
                  <table style={{ borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        ['Ereignis-ID', z.id],
                        ['Konto-ID', z.userId],
                        ['Organisation-ID', z.organizationId],
                        ['User-Agent', z.userAgent],
                        ['App-Version', z.appVersion],
                        ['Sitzungsbezug', z.sessionReference],
                        ['Zusatzdaten', z.metadata ? JSON.stringify(z.metadata) : null],
                      ].map(([k, v]) => (
                        <tr key={k as string}>
                          <td style={{ padding: '3px 14px 3px 0', color: '#888', fontSize: 12, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{k}</td>
                          <td style={{ padding: '3px 0', fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>{v ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
              </tr>
            ) : null)}
          </tbody>
        </table>
      </div>

      {/* ── Seiten ── */}
      {daten && daten.seiten > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <button style={knopf} disabled={seite <= 1} onClick={() => setSeite(s => Math.max(1, s - 1))}>
            Zurück
          </button>
          <span style={{ fontSize: 13, color: '#888' }}>
            Seite {daten.seite} von {daten.seiten}
          </span>
          <button style={knopf} disabled={seite >= daten.seiten} onClick={() => setSeite(s => s + 1)}>
            Weiter
          </button>
        </div>
      )}
    </div>
  )
}
