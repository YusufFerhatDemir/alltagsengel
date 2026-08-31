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
// Diese drei kommen ECHT aus dem Modul, nicht gespiegelt: befristung.ts ist
// bewusst nicht `server-only`, weil die Oberflaeche dieselben Angaben
// verlangen muss wie der Riegel. Gespiegelt wird nur, was in
// lib/security/watchlist.ts steht — die Datei ist server-only.
import {
  PFLICHTANGABEN, BEGRUENDUNG_VORLAGE, HOECHSTDAUER_TAGE,
} from '@/lib/security/befristung'
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
  alarm: Alarmzustand
  ueberwacht: boolean
  provenienz: string | null
  provenienzBezeichnung: string
  echteNutzeraktivitaet: boolean
  istTest: boolean
  quelle: string | null
}

/** Ein Zustellversuch aus notification_delivery_log. */
interface Zustellversuch {
  status: string
  empfaenger: string | null
  provider: string | null
  providerNachrichtId: string | null
  versuche: number | null
  letzterVersuch: string | null
  zugestelltAm: string | null
  gescheitertAm: string | null
  fehlergrund: string | null
}

/** Siehe lib/security/alarmspur.ts — dort steht, warum „an den Provider
 *  uebergeben" und „beim Empfaenger zugestellt" hier auseinandergehalten
 *  werden. Diese Ansicht darf die beiden NIE gleich benennen. */
interface Alarmzustand {
  ausgeloest: boolean
  nachweisId: string | null
  nachweisZeit: string | null
  meldeGrund: string | null
  empfaengerAnzahl: number | null
  zustellungen: Zustellversuch[]
  ohneWiederholung: boolean
}

/** Antwort von /api/admin/security/zustellstatus — das Wort des Providers. */
interface ProviderStatus {
  providerId: string
  erreichbar: boolean
  status: string | null
  empfaenger?: string[]
  betreff?: string | null
  erzeugtAm?: string | null
  absender?: string | null
  hinweis?: string
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
  /** Frist des Eintrags — siehe lib/security/befristung.ts. */
  befristung: {
    laeuftAbAm: string
    restTage: number
    abgelaufen: boolean
    laeuftBaldAb: boolean
    hinweis: string
  }
  /** Wirkt der Eintrag JETZT? `aktiv` allein reicht seit der Frist nicht. */
  wirktJetzt: boolean
}

interface Filter {
  suche: string
  userId: string
  von: string
  bis: string
  /** '' | 'echt' | 'nicht_echt' — siehe HerkunftZelle. */
  herkunft: string
  eventType: string
  kategorie: string
  severity: string
  plattform: string
  ip: string
}

const LEERER_FILTER: Filter = {
  suche: '', userId: '', von: '', bis: '',
  eventType: '', kategorie: '', severity: '', plattform: '', ip: '', herkunft: '',
}

/**
 * Die vier Fragen, die im Alltag zuerst gestellt werden.
 *
 * `setzt` ist der Filterstand, den der Knopf herstellt; `leert` raeumt
 * beim Abwaehlen genau die Felder wieder ab, die er gesetzt hat — und
 * NUR die. Ein Schnellfilter, der beim Abwaehlen den ganzen Filter
 * zuruecksetzt, wirft die Sucheingabe und den Zeitraum mit weg.
 *
 * REAL und TEST sind KEIN Gegensatzpaar. „Real" ist belegte
 * Nutzeraktivitaet, „Test" ist ein ausdruecklich gekennzeichnetes
 * Testereignis — dazwischen liegen die Zeilen, ueber deren Herkunft
 * nichts bekannt ist (Bestand vor dem 31.08.2026, siehe
 * lib/security/herkunft.ts). Die gehoeren in keine der beiden Ansichten,
 * und das ist richtig so.
 */
const SCHNELLFILTER: readonly {
  schluessel: string
  bezeichnung: string
  erklaerung: string
  setzt: Partial<Filter>
  leert: Partial<Filter>
}[] = [
  {
    schluessel: 'real',
    bezeichnung: 'Real',
    erklaerung: 'Nur belegte Nutzeraktivität: echte Anmeldung, App-Start, Sitzungserneuerung.',
    setzt: { herkunft: 'echt' },
    leert: { herkunft: '' },
  },
  {
    schluessel: 'test',
    bezeichnung: 'Test',
    erklaerung: 'Nur ausdrücklich gekennzeichnete Testereignisse (Testalarm, Verwaltungstest).',
    setzt: { herkunft: 'test' },
    leert: { herkunft: '' },
  },
  {
    schluessel: 'security',
    bezeichnung: 'Security',
    erklaerung: 'Sicherheitsvorgänge im engeren Sinn — Kategorie „security".',
    setzt: { kategorie: 'security' },
    leert: { kategorie: '' },
  },
  {
    schluessel: 'login',
    bezeichnung: 'Login',
    erklaerung: 'An- und Abmeldungen — Kategorie „auth".',
    setzt: { kategorie: 'auth' },
    leert: { kategorie: '' },
  },
]

/**
 * Gespiegelt aus lib/security/watchlist.ts. Die Datei ist `server-only`
 * und laesst sich hier nicht importieren; der Riegel selbst sitzt dort
 * und gilt unabhaengig von dieser Oberflaeche — das hier ist die
 * freundliche Fassung davon, nicht die Sicherung.
 */
const GRUND_MINDESTLAENGE = 40
const TRANSPARENZ_HINWEIS =
  'Die Überwachung eines einzelnen Kontos zeichnet Anmeldungen, Geräte und '
  + 'IP-Adressen einer namentlich bekannten Person auf. Sie ist nur zulässig, '
  + 'wenn sie offen erfolgt. Bitte im Grund festhalten: (1) der konkrete Anlass, '
  + '(2) die Rechtsgrundlage, (3) der vorgesehene Zeitraum und (4) ob und wann '
  + 'die betroffene Person informiert wurde. Eine verdeckte Dauerüberwachung ist '
  + 'ausgeschlossen.'

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
  /** Providerstatus je Nachrichten-ID — auf Anforderung geholt, nie in
   *  der Liste: 50 Zeilen waeren 50 fremde HTTP-Aufrufe. */
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderStatus | 'laedt'>>({})
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
    // ── Befund vom 31.08.2026 ────────────────────────────────────────
    // Diese Zeile fehlte. Die Auswahl „Nur echte Nutzeraktivität" stand
    // im Zustand, ging aber nie an die API — die Liste blieb unveraendert,
    // ohne Fehlermeldung, und der CSV-Export ebenfalls (er baut auf
    // derselben Abfrage auf). Ein Filter, der nichts tut, ist schlimmer
    // als keiner: er behauptet eine Auswahl, die niemand vorgenommen hat.
    // Der Regressionstest dazu steht in
    // __tests__/security/admin-ansicht-filter.test.ts — er vergleicht die
    // Felder von `Filter` mit den gesetzten Parametern.
    if (filter.herkunft) p.set('herkunft', filter.herkunft)
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

  /**
   * Holt den EXTERNEN Zustellnachweis fuer eine Provider-Nachrichten-ID.
   * Der eigene Stand in der Liste sagt nur „uebergeben"; ob die Mail
   * ankam, weiss allein der Provider.
   */
  async function providerStatusHolen(providerId: string) {
    setProviderStatus(v => ({ ...v, [providerId]: 'laedt' }))
    try {
      const res = await fetch(
        `/api/admin/security/zustellstatus?providerId=${encodeURIComponent(providerId)}`,
      )
      const json = (await res.json()) as ProviderStatus
      setProviderStatus(v => ({ ...v, [providerId]: json }))
    } catch {
      setProviderStatus(v => ({
        ...v,
        [providerId]: { providerId, erreichbar: false, status: null, hinweis: 'Abruf fehlgeschlagen.' },
      }))
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
                  <th style={kopf}>Frist</th>
                  <th style={kopf}>Alarm</th>
                  <th style={kopf}> </th>
                </tr>
              </thead>
              <tbody>
                {wl.length === 0 && <EmptyRow colSpan={7}>Kein Konto ausdrücklich überwacht.</EmptyRow>}
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
                    <td style={{ ...zelle, maxWidth: 260, whiteSpace: 'pre-wrap' }}>{w.grund}</td>
                    <td style={{ ...zelle, maxWidth: 180 }}>
                      <span style={{
                        color: w.befristung.abgelaufen ? '#C0392B'
                          : w.befristung.laeuftBaldAb ? '#C9963C' : '#888',
                        fontSize: 12,
                      }}>
                        {w.befristung.hinweis}
                      </span>
                    </td>
                    <td style={zelle}>
                      {/* „aktiv" allein wäre eine Falschauskunft, sobald die
                          Frist abgelaufen ist: der Eintrag steht dann zwar
                          auf aktiv, meldet aber nichts mehr. */}
                      <span style={{
                        color: w.wirktJetzt ? '#2D8F5E' : w.aktiv ? '#C0392B' : '#888',
                        fontWeight: w.wirktJetzt ? 600 : 400,
                      }}>
                        {w.wirktJetzt ? 'aktiv' : w.aktiv ? 'abgelaufen' : 'aus'}
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
              <div style={{
                flexBasis: '100%', padding: '10px 12px', marginBottom: 4,
                border: '1px solid #C9963C', borderRadius: 8,
                background: 'rgba(201,150,60,.08)', fontSize: 12.5,
                color: 'var(--ink)', lineHeight: 1.5, maxWidth: 760,
              }}>
                <b>Offen, nicht verdeckt.</b> {TRANSPARENZ_HINWEIS}
              </div>
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
              <div style={{ flexBasis: '100%', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <textarea
                  style={{ ...eingabe, minWidth: 420, flex: 1, minHeight: 108, fontFamily: 'inherit', lineHeight: 1.5 }}
                  placeholder={BEGRUENDUNG_VORLAGE}
                  value={wlFormular.grund}
                  onChange={e => setWlFormular(f => ({ ...f, grund: e.target.value }))}
                  aria-label="Grund der Überwachung"
                />
                <div style={{ fontSize: 11.5, color: '#888', maxWidth: 300, lineHeight: 1.5 }}>
                  {/* Die Vorlage ist keine Formalie: ohne diese vier Angaben
                      ist die Maßnahme im Streitfall nicht begründet. Der
                      Riegel dafür sitzt serverseitig in
                      lib/security/watchlist.ts (pruefeAngaben) — das hier
                      ist die freundliche Fassung davon. */}
                  <button
                    type="button"
                    style={{ ...knopf, padding: '4px 10px', fontSize: 12, marginBottom: 8 }}
                    onClick={() => setWlFormular(f => ({
                      ...f,
                      grund: f.grund.trim() ? f.grund : BEGRUENDUNG_VORLAGE,
                    }))}
                  >
                    Vorlage einfügen
                  </button>
                  {PFLICHTANGABEN.map(pa => {
                    const da = wlFormular.grund.toLowerCase().includes(pa.marke.toLowerCase())
                    return (
                      <div key={pa.name} style={{ marginBottom: 4 }}>
                        <span style={{ color: da ? '#2D8F5E' : '#C0392B' }}>{da ? '✓' : '○'}</span>
                        {' '}<b>{pa.name}</b> — {pa.hilfe}
                      </div>
                    )
                  })}
                  <div style={{ marginTop: 8, color: '#C9963C' }}>
                    Die Überwachung endet nach {HOECHSTDAUER_TAGE} Tagen von selbst.
                    Für eine Fortsetzung ist eine neue, begründete Anordnung nötig.
                  </div>
                </div>
              </div>
              <button
                style={knopf}
                disabled={wlLaeuft || !wlFormular.userId
                  || wlFormular.grund.trim().length < GRUND_MINDESTLAENGE
                  || PFLICHTANGABEN.some(pa => !wlFormular.grund.toLowerCase().includes(pa.marke.toLowerCase()))}
                onClick={() => watchlistSetzen(wlFormular.userId.trim(), true, wlFormular.grund.trim(), wlFormular.meldeEmail.trim(), wlFormular.emailKontrolle.trim())}
              >
                {wlLaeuft ? 'Wird gespeichert …' : 'Alarm einschalten'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Schnellfilter ──
          Vier Fragen, die im Alltag zuerst gestellt werden. Sie setzen
          dieselben Filter, die auch einzeln unten stehen — die Knoepfe
          sind eine Abkuerzung, keine zweite Logik. Deshalb zeigt der
          aktive Zustand auch den WIRKLICHEN Filterstand an und nicht
          eine eigene Merkvariable, die auseinanderlaufen koennte. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {SCHNELLFILTER.map(sf => {
          const aktiv = Object.entries(sf.setzt).every(
            ([k, v]) => filter[k as keyof Filter] === v,
          )
          return (
            <button
              key={sf.schluessel}
              type="button"
              onClick={() => setFilter(f => (aktiv
                ? { ...f, ...sf.leert }
                : { ...f, ...sf.leert, ...sf.setzt }))}
              aria-pressed={aktiv}
              title={sf.erklaerung}
              style={{
                ...knopf,
                background: aktiv ? 'var(--ink)' : 'var(--coal2)',
                color: aktiv ? 'var(--coal)' : 'var(--ink3)',
                fontWeight: aktiv ? 700 : 500,
              }}
            >
              {sf.bezeichnung}
            </button>
          )
        })}
        <span style={{ fontSize: 11, color: '#777', alignSelf: 'center', maxWidth: 460 }}>
          „Test" meint ausdrücklich gekennzeichnete Testereignisse — nicht dasselbe wie
          „nicht echt", darin steckt auch Unbelegtes.
        </span>
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
        <select style={eingabe} value={filter.herkunft}
          onChange={e => setzeFilter('herkunft', e.target.value)} aria-label="Herkunft">
          <option value="">Jede Herkunft</option>
          <option value="echt">Nur echte Nutzeraktivität</option>
          <option value="test">Nur Testereignisse</option>
          <option value="nicht_echt">Nur nachgestellt / unbelegt</option>
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
              <th style={kopf}>Herkunft</th>
              <th style={kopf}>Kategorie</th>
              <th style={{ ...kopf, cursor: 'pointer' }} onClick={() => sortiereNach('user_email')}>
                Konto{pfeil('user_email')}
              </th>
              <th style={kopf}>Organisation</th>
              <th style={kopf}>Zugang</th>
              <th style={kopf}>IP</th>
              <th style={kopf}>Gerät</th>
              <th style={kopf}>Alarm &amp; Zustellung</th>
              <th style={kopf}> </th>
            </tr>
          </thead>
          <tbody>
            {(daten?.zeilen ?? []).length === 0 && !laedt && (
              <EmptyRow colSpan={12}>Keine Einträge für diese Auswahl.</EmptyRow>
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
                <td style={zelle}><HerkunftZelle zeile={z} /></td>
                <td style={zelle}>{z.kategorieBezeichnung}</td>
                <td style={zelle}>
                  <div>
                    {z.ueberwacht && (
                      <span
                        title="Dieses Konto steht auf der aktiven Überwachungsliste"
                        style={{
                          display: 'inline-block', marginRight: 6, padding: '1px 6px',
                          borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
                          background: '#C0392B', color: '#fff',
                        }}
                      >
                        ÜBERWACHT
                      </span>
                    )}
                    {z.userEmail ?? '—'}
                  </div>
                  {z.userName && <div style={{ fontSize: 11, color: '#888' }}>{z.userName}</div>}
                </td>
                <td style={zelle}>{z.organisationsName ?? (z.organizationId ? '—' : 'ohne Mandant')}</td>
                <td style={zelle}>{z.plattform ?? '—'}</td>
                <td style={{ ...zelle, fontFamily: 'monospace', fontSize: 12 }}>{z.ip ?? '—'}</td>
                <td style={zelle}>{z.geraet ?? '—'}</td>
                <td style={zelle}><AlarmZelle alarm={z.alarm} /></td>
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
                <td colSpan={12} style={{ ...zelle, background: 'var(--coal2)' }}>
                  <table style={{ borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        ['Herkunft', `${z.provenienz ?? 'UNBELEGT'} — ${z.provenienzBezeichnung}`],
                        ['Testereignis (is_test)', z.istTest ? 'ja' : 'nein'],
                        ['Quelle (source)', z.quelle ?? 'unbekannt'],
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
                  <AlarmDetails
                    alarm={z.alarm}
                    status={providerStatus}
                    holen={providerStatusHolen}
                  />
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

// ═══════════════════════════════════════════════════════════════════════
// Alarm und Zustellung
// ═══════════════════════════════════════════════════════════════════════
//
// DIE EINE UNTERSCHEIDUNG, DIE DIESE BAUTEILE TRAGEN
// „an den Provider übergeben" ist NICHT „beim Empfänger zugestellt".
// Die eigenen Tabellen können nur das Erste belegen. Deshalb heißt hier
// nichts „zugestellt", solange es nicht der Provider selbst gesagt hat —
// und dessen Wort steht getrennt darunter, mit eigener Beschriftung.
// Genau diese Verwechslung war der Grund, warum eine „erfolgreich
// versendete" Sicherheitsmeldung nie im Postfach ankam und trotzdem
// überall grün aussah.
// ═══════════════════════════════════════════════════════════════════════

/** Ampel für die Listenspalte. Kurz, aber nie beschönigend. */
function AlarmZelle({ alarm }: { alarm: Alarmzustand }) {
  if (!alarm.ausgeloest && alarm.zustellungen.length === 0) {
    return <span style={{ fontSize: 12, color: '#777' }}>kein Alarm</span>
  }

  const gescheitert = alarm.zustellungen.filter(z => z.gescheitertAm)
  const uebergeben = alarm.zustellungen.filter(z => z.zugestelltAm)

  let farbe = '#C9963C'
  let text = 'Alarm — Zustellung offen'
  if (gescheitert.length > 0 && uebergeben.length === 0) {
    farbe = '#C0392B'
    text = 'Alarm — Zustellung GESCHEITERT'
  } else if (uebergeben.length > 0) {
    farbe = '#2D8F5E'
    text = 'Alarm — an Provider übergeben'
  } else if (alarm.ohneWiederholung) {
    farbe = '#C9963C'
    text = 'Alarm — ohne Zustellvorgang'
  }

  return (
    <div>
      <span style={{ fontSize: 12, color: farbe, fontWeight: 600 }}>{text}</span>
      {alarm.zustellungen[0]?.empfaenger && (
        <div style={{ fontSize: 11, color: '#888' }}>an {alarm.zustellungen[0].empfaenger}</div>
      )}
    </div>
  )
}

const dZeile: React.CSSProperties = {
  padding: '3px 14px 3px 0', color: '#888', fontSize: 12,
  whiteSpace: 'nowrap', verticalAlign: 'top',
}
const dWert: React.CSSProperties = {
  padding: '3px 0', fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all',
}

function AlarmDetails({
  alarm, status, holen,
}: {
  alarm: Alarmzustand
  status: Record<string, ProviderStatus | 'laedt'>
  holen: (providerId: string) => void
}) {
  if (!alarm.ausgeloest && alarm.zustellungen.length === 0) {
    return (
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #333', fontSize: 12, color: '#888' }}>
        Zu diesem Ereignis wurde keine Sicherheitsmeldung ausgelöst. Gemeldet wird
        nur für privilegierte oder ausdrücklich überwachte Konten.
      </div>
    )
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #333' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#ccc', marginBottom: 6 }}>
        Alarmkette
      </div>

      <table style={{ borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={dZeile}>Alarm ausgelöst</td>
            <td style={dWert}>{alarm.ausgeloest ? 'ja' : 'nein'}</td>
          </tr>
          <tr>
            <td style={dZeile}>Alarm-Nachweis-ID</td>
            <td style={dWert}>{alarm.nachweisId ?? '—'}</td>
          </tr>
          <tr>
            <td style={dZeile}>Zeitpunkt der Meldung</td>
            <td style={dWert}>{alarm.nachweisZeit ? zeitpunkt(alarm.nachweisZeit) : '—'}</td>
          </tr>
          <tr>
            <td style={dZeile}>Meldegrund</td>
            <td style={dWert}>{alarm.meldeGrund ?? '—'}</td>
          </tr>
        </tbody>
      </table>

      {alarm.ohneWiederholung && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#C9963C' }}>
          Kein Zustellvorgang registriert. Es gab nur den Sofortversuch — der
          Wiederholungslauf sieht diese Meldung nicht. Tritt auf, wenn das
          Ereignis keiner Organisation zugeordnet ist.
        </div>
      )}

      {alarm.zustellungen.map((v, i) => {
        const pid = v.providerNachrichtId
        const ext = pid ? status[pid] : undefined
        return (
          <div key={`${pid ?? 'ohne'}-${i}`} style={{ marginTop: 10, paddingLeft: 10, borderLeft: '2px solid #444' }}>
            <table style={{ borderCollapse: 'collapse' }}>
              <tbody>
                <tr><td style={dZeile}>Mail-Empfänger</td><td style={dWert}>{v.empfaenger ?? '—'}</td></tr>
                <tr><td style={dZeile}>Eigener Stand</td><td style={dWert}>{v.status}</td></tr>
                <tr><td style={dZeile}>Provider</td><td style={dWert}>{v.provider ?? '—'}</td></tr>
                <tr><td style={dZeile}>Provider-Nachrichten-ID</td><td style={dWert}>{pid ?? '— (fehlt: nichts nachprüfbar)'}</td></tr>
                <tr><td style={dZeile}>Versuche</td><td style={dWert}>{v.versuche ?? '—'}</td></tr>
                <tr><td style={dZeile}>Letzter Zustellversuch</td><td style={dWert}>{v.letzterVersuch ? zeitpunkt(v.letzterVersuch) : '—'}</td></tr>
                <tr><td style={dZeile}>An Provider übergeben</td><td style={dWert}>{v.zugestelltAm ? zeitpunkt(v.zugestelltAm) : '—'}</td></tr>
                <tr><td style={dZeile}>Gescheitert am</td><td style={dWert}>{v.gescheitertAm ? zeitpunkt(v.gescheitertAm) : '—'}</td></tr>
                <tr><td style={dZeile}>Fehlergrund</td><td style={dWert}>{v.fehlergrund ?? '—'}</td></tr>
              </tbody>
            </table>

            <div style={{ marginTop: 8 }}>
              <button
                style={{ ...knopf, padding: '4px 10px', fontSize: 12 }}
                disabled={!pid || ext === 'laedt'}
                onClick={() => pid && holen(pid)}
              >
                {ext === 'laedt' ? 'Frage den Provider …' : 'Zustellstatus beim Provider abrufen'}
              </button>
              <span style={{ marginLeft: 8, fontSize: 11, color: '#888' }}>
                Der eigene Stand oben belegt nur die Übergabe. Ob die Mail ankam,
                weiß allein der Provider.
              </span>
            </div>

            {ext && ext !== 'laedt' && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: '#1b1b1b', borderRadius: 6 }}>
                {ext.erreichbar ? (
                  <table style={{ borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr>
                        <td style={dZeile}>Provider-Zustellstatus</td>
                        <td style={{ ...dWert, fontWeight: 700, color: ext.status === 'delivered' ? '#2D8F5E' : ext.status === 'bounced' || ext.status === 'complained' ? '#C0392B' : '#C9963C' }}>
                          {ext.status ?? 'unbekannt'}
                        </td>
                      </tr>
                      <tr><td style={dZeile}>Empfänger laut Provider</td><td style={dWert}>{(ext.empfaenger ?? []).join(', ') || '—'}</td></tr>
                      <tr><td style={dZeile}>Betreff</td><td style={dWert}>{ext.betreff ?? '—'}</td></tr>
                      <tr><td style={dZeile}>Beim Provider erzeugt</td><td style={dWert}>{ext.erzeugtAm ? zeitpunkt(ext.erzeugtAm) : '—'}</td></tr>
                    </tbody>
                  </table>
                ) : (
                  <div style={{ fontSize: 12, color: '#C9963C' }}>
                    Kein externer Zustellnachweis: {ext.hinweis ?? 'Provider nicht erreichbar.'}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Herkunft
// ═══════════════════════════════════════════════════════════════════════
//
// Am 31.08.2026 stand ein Funktionstest als „Sicherheitskritische Aktion"
// in der Spur. Dass es ein Test war, stand nur im Fliesstext eines
// Metadatenfeldes — und wurde folgerichtig für echte Kontoaktivität
// gehalten. Diese Zelle ist die Antwort darauf: die Herkunft steht in
// jeder Zeile, farblich getrennt, ohne dass jemand Details aufklappen
// muss. Fail-closed — eine Zeile ohne belegte Herkunft ist NICHT grün.
// ═══════════════════════════════════════════════════════════════════════
function HerkunftZelle({ zeile }: { zeile: SpurZeile }) {
  const p = zeile.provenienz
  const echt = zeile.echteNutzeraktivitaet

  const farbe = zeile.istTest ? '#C0392B' : echt ? '#2D8F5E' : p === null ? '#888' : '#C9963C'
  const kurz = p ?? 'UNBELEGT'

  return (
    <div title={zeile.provenienzBezeichnung}>
      {/* Ein Testereignis bekommt einen EIGENEN, roten Merker vor der
          Provenienz. Am 31.08.2026 wurde ein Testeintrag fuer eine echte
          Anmeldung gehalten — die Kennzeichnung muss ohne Lesen des
          Kleingedruckten ins Auge fallen. */}
      {zeile.istTest && (
        <span style={{
          display: 'inline-block', marginRight: 5, padding: '1px 6px',
          borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
          background: '#C0392B', color: '#fff',
        }}>
          TEST
        </span>
      )}
      <span style={{
        display: 'inline-block', padding: '1px 6px', borderRadius: 4,
        fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        border: `1px solid ${farbe}`, color: farbe,
      }}>
        {kurz}
      </span>
      <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
        {zeile.istTest
          ? 'Testereignis — kein Nutzerverhalten'
          : echt
            ? 'echte Nutzeraktivität'
            : p === null
              ? 'keine Angabe — gilt nicht als belegt'
              : 'keine belegte Nutzeraktivität'}
      </div>
    </div>
  )
}
