'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  formatDate, timeAgo, statusMeta,
  APPLICATION_STATUS, APPLICATION_FORTSCHRITT, APPLICATION_SOURCE,
  istBewerbung,
} from '@/lib/admin/ops'
import { StatusBadge, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { berechneFortschritt, stufeFuer, FORTSCHRITT_STUFEN } from '@/lib/bewerbung/fortschritt'
import { regionLabel, WARTELISTE_STATUS } from '@/lib/warteliste/katalog'
import type { BewerbungDaten } from '@/lib/bewerbung/katalog'
import { logger } from '@/lib/logger'

const log = logger.child('admin:marketing-dashboard')

// ═══════════════════════════════════════════════════════════════════════
// Marketing-Dashboard — eine Tabelle, zwei Geschäftsvorgänge
//
// Quelle ist ausschliesslich `lead_inquiries`. Diese eine Tabelle traegt
// BEIDE Vorgaenge: Kundenanfragen (jemand sucht Hilfe) und Bewerbungen
// (jemand moechte arbeiten). Wer sie nicht trennt, zaehlt Aepfel und Birnen
// in einer Summe — deshalb steht die Trennung hier ganz vorne und wird
// ueberall durchgehalten.
//
// Gelesen wird mit dem BROWSER-Client, also unter RLS. Auf lead_inquiries
// steht live genau eine verwaltende Policy: „Admin full access" mit
// is_admin(). Die Seite ist deshalb in BEREICHE auf `marketing.verwalten`
// registriert (NUR_ADMINISTRATION) — stuende dort ein Recht, das auch pdl
// oder qm tragen, saehen die eine leere Seite ohne Fehlermeldung.
//
// Keine neue Tabelle, keine Migration, kein Schreibweg: reine Auswertung.
// ═══════════════════════════════════════════════════════════════════════

/** Obergrenze der Abfrage. Bei Erreichen wird das sichtbar gemacht (§ Hinweis unten). */
const MAX_ZEILEN = 2000

/** Laenge des Verlaufsfensters in Tagen. */
const FENSTER_TAGE = 30

interface Lead {
  id: string
  name: string | null
  art: string | null
  source: string | null
  status: string
  plz: string | null
  service: string | null
  phone: string | null
  email: string | null
  created_at: string | null
  eingereicht_am: string | null
  follow_up_date: string | null
  istBewerbung: boolean
  plzRoh: string | null
  daten: BewerbungDaten | null
}

/** Vormerkung aus `state_waitlist` — die dritte Leadquelle. */
interface Vormerkung {
  id: string
  name: string | null
  email: string | null
  telefon: string | null
  ort: string | null
  bundesland: string | null
  plz: string | null
  status: string
  quelle: string | null
  utm_medium: string | null
  utm_campaign: string | null
  created_at: string | null
}

function tagesSchluessel(iso: string): string {
  return iso.slice(0, 10)
}

/**
 * Herkunftsseite aus dem source-Wert.
 *
 * Die Stadt-Landingpages senden `alltagsbegleitung-darmstadt`,
 * `alltagsbegleitung-hanau` usw. (LeadForm, source={`alltagsbegleitung-${slug}`}).
 * Daraus laesst sich der Ort ablesen — aus der PLZ dagegen NICHT, denn eine
 * Zuordnungstabelle PLZ→Ort fuehrt dieses Schema nicht. Wo kein Ort im
 * source steckt, bleibt die Spalte leer statt geraten.
 */
function ortAusQuelle(source: string | null): string | null {
  if (!source) return null
  const treffer = source.match(/^(?:alltagsbegleitung|krankenfahrten|hygienebox|engel-werden)-(.+)$/)
  if (!treffer) return null
  return treffer[1]
    .split('-')
    .map(t => t.charAt(0).toUpperCase() + t.slice(1))
    .join(' ')
}

function quelleLabel(source: string | null): string {
  if (!source) return '— ohne Quelle'
  const bekannt = APPLICATION_SOURCE[source]
  if (bekannt) return `${bekannt.emoji} ${bekannt.label}`
  const ort = ortAusQuelle(source)
  if (ort) return `📍 Landingpage ${ort}`
  if (source === 'rueckruf') return '📞 Rückruf-Widget'
  if (source === 'terminbuchung') return '📅 Terminbuchung'
  return source
}

export default function MarketingDashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [vormerkungen, setVormerkungen] = useState<Vormerkung[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ansicht, setAnsicht] = useState<'alle' | 'anfrage' | 'bewerbung'>('alle')

  useEffect(() => {
    async function laden() {
      try {
        const supabase = createClient()
        // Fehler wird destrukturiert und angezeigt. Eine leere Liste aus
        // einer gescheiterten Abfrage waere hier besonders teuer: das
        // Dashboard soll ja gerade sagen, wie viel hereinkommt.
        // Zwei Quellen, ein Bild: `lead_inquiries` traegt Kundenanfragen und
        // Bewerbungen, `state_waitlist` die Vormerkungen. Beide parallel —
        // sequenziell waere der Aufbau der Seite doppelt so langsam.
        const [leadRes, vormerkRes] = await Promise.all([
          supabase
            .from('lead_inquiries')
            .select('id, name, art, source, status, plz, service, phone, email, created_at, eingereicht_am, follow_up_date, bewerbung_daten')
            .order('created_at', { ascending: false })
            .limit(MAX_ZEILEN),
          supabase
            .from('state_waitlist')
            .select('id, name, email, telefon, ort, bundesland, plz, status, quelle, utm_medium, utm_campaign, created_at')
            .order('created_at', { ascending: false })
            .limit(MAX_ZEILEN),
        ])

        const { data, error: fehler } = leadRes

        if (fehler) {
          log.error(`lead_inquiries laden fehlgeschlagen: ${fehler.message}`)
          setError(`Die Leads konnten nicht geladen werden: ${fehler.message}`)
          return
        }

        // Die Warteliste darf einzeln scheitern, ohne die ganze Seite
        // mitzunehmen — der Fehler wird sichtbar gemacht, der Rest zeigt
        // weiter an, was da ist.
        if (vormerkRes.error) {
          log.error(`state_waitlist laden fehlgeschlagen: ${vormerkRes.error.message}`)
          setError(`Die Warteliste konnte nicht geladen werden: ${vormerkRes.error.message}`)
        } else {
          setVormerkungen((vormerkRes.data || []).map((z: any) => ({
            id: z.id,
            name: z.name,
            email: z.email,
            telefon: z.telefon,
            ort: z.ort,
            bundesland: z.bundesland,
            plz: z.plz,
            status: z.status || 'neu',
            quelle: z.quelle,
            utm_medium: z.utm_medium,
            utm_campaign: z.utm_campaign,
            created_at: z.created_at,
          })))
        }

        setLeads((data || []).map((z: any) => ({
          id: z.id,
          name: z.name,
          art: z.art,
          source: z.source,
          status: z.status || 'new',
          plz: z.plz || null,
          service: z.service,
          phone: z.phone,
          email: z.email,
          created_at: z.created_at,
          eingereicht_am: z.eingereicht_am,
          follow_up_date: z.follow_up_date,
          istBewerbung: istBewerbung(z),
          plzRoh: (z.plz || '').trim() || null,
          daten: (z.bewerbung_daten && typeof z.bewerbung_daten === 'object')
            ? z.bewerbung_daten as BewerbungDaten
            : null,
        })))
      } catch (err) {
        log.errorWithException('Marketing-Dashboard laden fehlgeschlagen', err)
        setError('Die Leads konnten nicht geladen werden. Bitte laden Sie die Seite neu.')
      } finally {
        setLoading(false)
      }
    }
    laden()
  }, [])

  // ── Grundmengen ──────────────────────────────────────────────────────
  const bewerbungen = useMemo(() => leads.filter(l => l.istBewerbung), [leads])
  const anfragen = useMemo(() => leads.filter(l => !l.istBewerbung), [leads])

  const gefiltert = useMemo(() => {
    if (ansicht === 'bewerbung') return bewerbungen
    if (ansicht === 'anfrage') return anfragen
    return leads
  }, [ansicht, leads, anfragen, bewerbungen])

  const offeneFollowUps = useMemo(
    () => gefiltert.filter(l => l.status === 'new'),
    [gefiltert],
  )

  // ── Zeitlicher Verlauf, letzte 30 Tage ───────────────────────────────
  const verlauf = useMemo(() => {
    const heute = new Date()
    heute.setHours(0, 0, 0, 0)
    const tage: { tag: string; datum: Date; anfrage: number; bewerbung: number }[] = []
    for (let i = FENSTER_TAGE - 1; i >= 0; i--) {
      const d = new Date(heute)
      d.setDate(d.getDate() - i)
      tage.push({ tag: d.toISOString().slice(0, 10), datum: d, anfrage: 0, bewerbung: 0 })
    }
    const index = new Map(tage.map(t => [t.tag, t]))
    leads.forEach(l => {
      if (!l.created_at) return
      const eintrag = index.get(tagesSchluessel(l.created_at))
      if (!eintrag) return
      if (l.istBewerbung) eintrag.bewerbung++
      else eintrag.anfrage++
    })
    return tage
  }, [leads])

  const verlaufMax = useMemo(
    () => Math.max(1, ...verlauf.map(t => t.anfrage + t.bewerbung)),
    [verlauf],
  )
  const verlaufSumme = useMemo(
    () => verlauf.reduce((s, t) => s + t.anfrage + t.bewerbung, 0),
    [verlauf],
  )

  // ── Quellen ──────────────────────────────────────────────────────────
  const quellen = useMemo(() => {
    const m = new Map<string, { source: string | null; anfrage: number; bewerbung: number }>()
    leads.forEach(l => {
      const key = l.source || ''
      const e = m.get(key) || { source: l.source, anfrage: 0, bewerbung: 0 }
      if (l.istBewerbung) e.bewerbung++
      else e.anfrage++
      m.set(key, e)
    })
    return [...m.values()].sort((a, b) => (b.anfrage + b.bewerbung) - (a.anfrage + a.bewerbung))
  }, [leads])

  // ── Orte / PLZ ───────────────────────────────────────────────────────
  const orte = useMemo(() => {
    const m = new Map<string, { plz: string; ort: string | null; anfrage: number; bewerbung: number }>()
    leads.forEach(l => {
      const plz = (l.plz || '').trim()
      if (!plz) return
      const e = m.get(plz) || { plz, ort: ortAusQuelle(l.source), anfrage: 0, bewerbung: 0 }
      if (!e.ort) e.ort = ortAusQuelle(l.source)
      if (l.istBewerbung) e.bewerbung++
      else e.anfrage++
      m.set(plz, e)
    })
    return [...m.values()].sort((a, b) => (b.anfrage + b.bewerbung) - (a.anfrage + a.bewerbung))
  }, [leads])

  const ohnePlz = useMemo(() => leads.filter(l => !(l.plz || '').trim()).length, [leads])

  // ── Wochenwerte ──────────────────────────────────────────────────────
  // Tageszahlen sind bei zwei bis drei Eingaengen taeglich zu verrauscht,
  // um einen Trend zu zeigen. Die Woche glaettet das, ohne den Zeitraum zu
  // strecken.
  const wochen = useMemo(() => {
    const m = new Map<string, { start: Date; anfrage: number; bewerbung: number; vormerkung: number }>()
    const schluessel = (d: Date) => {
      const montag = new Date(d)
      montag.setHours(0, 0, 0, 0)
      // getDay(): 0 = Sonntag. Der Wochenstart ist hier der Montag.
      montag.setDate(montag.getDate() - ((montag.getDay() + 6) % 7))
      return { key: montag.toISOString().slice(0, 10), start: montag }
    }
    const zaehle = (iso: string | null, feld: 'anfrage' | 'bewerbung' | 'vormerkung') => {
      if (!iso) return
      const { key, start } = schluessel(new Date(iso))
      const e = m.get(key) || { start, anfrage: 0, bewerbung: 0, vormerkung: 0 }
      e[feld]++
      m.set(key, e)
    }
    leads.forEach(l => zaehle(l.created_at, l.istBewerbung ? 'bewerbung' : 'anfrage'))
    vormerkungen.forEach(v => zaehle(v.created_at, 'vormerkung'))
    return [...m.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 8)
      .map(([key, e]) => ({ key, ...e, summe: e.anfrage + e.bewerbung + e.vormerkung }))
  }, [leads, vormerkungen])

  // ── Conversion ───────────────────────────────────────────────────────
  // Bewusst zwei getrennte Quoten statt einer gemeinsamen: ein
  // eingestellter Bewerber und eine aktivierte Vormerkung sind
  // verschiedene Ereignisse und duerfen nicht in einen Nenner.
  const conversion = useMemo(() => {
    const bewerbungGesamt = bewerbungen.length
    const bewerbungKontaktiert = bewerbungen.filter(b => b.status !== 'new').length
    const bewerbungEingestellt = bewerbungen.filter(b => b.status === 'converted').length
    const vormerkGesamt = vormerkungen.length
    const vormerkAktiviert = vormerkungen.filter(v => v.status === 'aktiviert').length
    const quote = (teil: number, ganz: number) => ganz > 0 ? Math.round((teil / ganz) * 100) : 0
    return {
      bewerbungGesamt, bewerbungKontaktiert, bewerbungEingestellt,
      bewerbungKontaktQuote: quote(bewerbungKontaktiert, bewerbungGesamt),
      bewerbungEinstellQuote: quote(bewerbungEingestellt, bewerbungGesamt),
      vormerkGesamt, vormerkAktiviert,
      vormerkQuote: quote(vormerkAktiviert, vormerkGesamt),
    }
  }, [bewerbungen, vormerkungen])

  // ── Onboarding-Stand der Bewerbungen ─────────────────────────────────
  const onboarding = useMemo(() => {
    const eintraege = bewerbungen.map(b => ({
      lead: b,
      fortschritt: berechneFortschritt({
        name: b.name, email: b.email, phone: b.phone, plz: b.plzRoh, daten: b.daten,
      }),
    }))
    const nachStufe: Record<string, number> = {}
    eintraege.forEach(e => {
      const stufe = stufeFuer(e.fortschritt.prozent)
      nachStufe[stufe] = (nachStufe[stufe] || 0) + 1
    })
    const schnitt = eintraege.length
      ? Math.round(eintraege.reduce((sum, e) => sum + e.fortschritt.prozent, 0) / eintraege.length)
      : 0
    // Was fehlt am haeufigsten? Das ist die Frage, aus der eine Massnahme folgt.
    const luecken: Record<string, number> = {}
    eintraege.forEach(e => e.fortschritt.offen.forEach(o => {
      luecken[o.label] = (luecken[o.label] || 0) + 1
    }))
    return {
      eintraege: eintraege.sort((a, b) => a.fortschritt.prozent - b.fortschritt.prozent),
      nachStufe,
      schnitt,
      luecken: Object.entries(luecken).sort((a, b) => b[1] - a[1]),
      nichtKontaktierbar: eintraege.filter(e => !e.fortschritt.kontaktierbar).length,
    }
  }, [bewerbungen])

  // ── Kampagnen ────────────────────────────────────────────────────────
  // utm_medium/utm_campaign gibt es nur an der Warteliste; lead_inquiries
  // fuehrt allein `utm_source`. Deshalb eine eigene Auswertung statt einer
  // gemeinsamen, die fuer zwei Drittel der Zeilen leer waere.
  const kampagnen = useMemo(() => {
    const m = new Map<string, number>()
    vormerkungen.forEach(v => {
      if (!v.utm_campaign && !v.utm_medium) return
      const key = [v.quelle, v.utm_medium, v.utm_campaign].filter(Boolean).join(' · ')
      m.set(key, (m.get(key) || 0) + 1)
    })
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [vormerkungen])

  // ── Bewerberpipeline ─────────────────────────────────────────────────
  // Nur der Vorwaertsweg: neu → kontaktiert → qualifiziert → eingestellt.
  // `lost` ist kein Trichterschritt, sondern ein Ausstieg und steht deshalb
  // daneben, nicht darin.
  const pipeline = useMemo(() => {
    const zaehler: Record<string, number> = {}
    bewerbungen.forEach(b => { zaehler[b.status] = (zaehler[b.status] || 0) + 1 })
    const stufen = APPLICATION_FORTSCHRITT.map(key => ({
      key,
      label: statusMeta(APPLICATION_STATUS, key).label,
      farbe: statusMeta(APPLICATION_STATUS, key).color,
      anzahl: zaehler[key] || 0,
    }))
    const groesste = Math.max(1, ...stufen.map(s => s.anzahl))
    return { stufen, groesste, abgelehnt: zaehler['lost'] || 0 }
  }, [bewerbungen])

  if (loading) {
    return <div className="admin-page"><h1>Marketing-Dashboard</h1><p>Laden…</p></div>
  }

  // Fehlerfall: KEINE Zahlen zeigen. Eine 0 aus einer gescheiterten Abfrage
  // liest sich wie „es kommt nichts herein" — die teuerste Falschaussage,
  // die dieses Dashboard treffen kann.
  if (error) {
    return (
      <div className="admin-page">
        <h1>Marketing-Dashboard</h1>
        <Banner tone="danger">{error}</Banner>
        <p style={{ color: 'var(--ink3)', fontSize: 14, marginTop: 12 }}>
          Es werden bewusst keine Zahlen angezeigt, solange die Abfrage fehlschlägt —
          eine 0 wäre hier eine Aussage, die die Seite nicht treffen kann.
        </p>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Marketing-Dashboard</h1>
          <p className="admin-subtitle">
            {leads.length} Einträge aus lead_inquiries · {anfragen.length} Kundenanfragen ·{' '}
            {bewerbungen.length} Bewerbungen
          </p>
        </div>
        <Link href="/admin/applications" className="btn-ghost" style={{ whiteSpace: 'nowrap' }}>
          Zum Bewerbungs-Posteingang
        </Link>
      </div>

      {leads.length >= MAX_ZEILEN && (
        <Banner tone="warn">
          Es werden nur die neuesten {MAX_ZEILEN} Einträge ausgewertet — ältere fehlen in allen
          Zahlen dieser Seite.
        </Banner>
      )}

      {/* ── Kennzahlen ─────────────────────────────────────────────── */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-value">{leads.length}</div>
          <div className="admin-stat-label">Einträge gesamt</div>
        </div>
        <div className="admin-stat-card" style={{ borderLeft: '3px solid #2196F3' }}>
          <div className="admin-stat-value">{anfragen.length}</div>
          <div className="admin-stat-label">Kundenanfragen</div>
        </div>
        <div className="admin-stat-card" style={{ borderLeft: '3px solid #9C27B0' }}>
          <div className="admin-stat-value">{bewerbungen.length}</div>
          <div className="admin-stat-label">Bewerbungen</div>
        </div>
        <div className="admin-stat-card" style={{ borderLeft: '3px solid #5CB882' }}>
          <div className="admin-stat-value">{vormerkungen.length}</div>
          <div className="admin-stat-label">Vormerkungen (Warteliste)</div>
        </div>
        <div className="admin-stat-card" style={{ borderLeft: '3px solid #E8A000' }}>
          <div className="admin-stat-value">
            {leads.filter(l => l.status === 'new').length + vormerkungen.filter(v => v.status === 'neu').length}
          </div>
          <div className="admin-stat-label">Offene Follow-ups</div>
        </div>
      </div>

      <div className="admin-filters" style={{ marginTop: 18 }}>
        {([
          ['alle', `Alle (${leads.length})`],
          ['anfrage', `Kundenanfragen (${anfragen.length})`],
          ['bewerbung', `Bewerbungen (${bewerbungen.length})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            className={`admin-filter-btn ${ansicht === key ? 'active' : ''}`}
            onClick={() => setAnsicht(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Verlauf ────────────────────────────────────────────────── */}
      <section style={abschnitt}>
        <h2 style={ueberschrift}>Zeitlicher Verlauf — letzte {FENSTER_TAGE} Tage</h2>
        <p style={hinweis}>
          {verlaufSumme} Einträge in diesem Zeitraum. Höchster Tageswert: {verlaufMax}.{' '}
          <span style={{ color: '#2196F3' }}>■</span> Kundenanfragen{' '}
          <span style={{ color: '#9C27B0' }}>■</span> Bewerbungen
        </p>
        <div style={diagramm} role="img"
          aria-label={`Balkendiagramm: ${verlaufSumme} Einträge in den letzten ${FENSTER_TAGE} Tagen`}>
          {verlauf.map(t => {
            const summe = t.anfrage + t.bewerbung
            const hoehe = Math.round((summe / verlaufMax) * 100)
            return (
              <div key={t.tag} style={saeuleAussen}
                title={`${formatDate(t.tag)}: ${t.anfrage} Anfragen, ${t.bewerbung} Bewerbungen`}>
                <div style={{ ...saeule, height: `${hoehe}%` }}>
                  {t.bewerbung > 0 && (
                    <div style={{
                      height: `${Math.round((t.bewerbung / Math.max(1, summe)) * 100)}%`,
                      background: '#9C27B0', borderRadius: '3px 3px 0 0',
                    }} />
                  )}
                  {t.anfrage > 0 && (
                    <div style={{
                      height: `${Math.round((t.anfrage / Math.max(1, summe)) * 100)}%`,
                      background: '#2196F3',
                    }} />
                  )}
                </div>
                <span style={saeuleWert}>{summe || ''}</span>
              </div>
            )
          })}
        </div>
        <div style={achse}>
          <span>{formatDate(verlauf[0]?.tag)}</span>
          <span>{formatDate(verlauf[verlauf.length - 1]?.tag)}</span>
        </div>
      </section>

      {/* ── Wochenwerte ────────────────────────────────────────────── */}
      <section style={abschnitt}>
        <h2 style={ueberschrift}>Eingänge pro Woche</h2>
        <p style={hinweis}>
          Letzte acht Kalenderwochen, Montag als Wochenstart. Tageszahlen sind bei wenigen
          Eingängen zu verrauscht, um einen Trend zu zeigen.
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Woche ab</th><th>Kundenanfragen</th><th>Bewerbungen</th><th>Vormerkungen</th><th>Gesamt</th></tr>
            </thead>
            <tbody>
              {wochen.length === 0 ? (
                <EmptyRow colSpan={5}>Keine Einträge im Zeitraum</EmptyRow>
              ) : wochen.map(w => (
                <tr key={w.key}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(w.key)}</td>
                  <td>{w.anfrage || '—'}</td>
                  <td>{w.bewerbung || '—'}</td>
                  <td>{w.vormerkung || '—'}</td>
                  <td style={{ fontWeight: 700 }}>{w.summe}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Conversion ─────────────────────────────────────────────── */}
      <section style={abschnitt}>
        <h2 style={ueberschrift}>Conversion</h2>
        <p style={hinweis}>
          Zwei getrennte Quoten, bewusst nicht eine gemeinsame: ein eingestellter Bewerber und
          eine aktivierte Vormerkung sind verschiedene Ereignisse und gehören nicht in denselben
          Nenner.
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Strecke</th><th>Gesamt</th><th>Erreicht</th><th>Quote</th></tr></thead>
            <tbody>
              <tr>
                <td>Bewerbung → kontaktiert</td>
                <td>{conversion.bewerbungGesamt}</td>
                <td>{conversion.bewerbungKontaktiert}</td>
                <td style={{ fontWeight: 700 }}>{conversion.bewerbungKontaktQuote} %</td>
              </tr>
              <tr>
                <td>Bewerbung → eingestellt</td>
                <td>{conversion.bewerbungGesamt}</td>
                <td>{conversion.bewerbungEingestellt}</td>
                <td style={{ fontWeight: 700 }}>{conversion.bewerbungEinstellQuote} %</td>
              </tr>
              <tr>
                <td>Vormerkung → aktiviert</td>
                <td>{conversion.vormerkGesamt}</td>
                <td>{conversion.vormerkAktiviert}</td>
                <td style={{ fontWeight: 700 }}>{conversion.vormerkQuote} %</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Onboarding-Stand ───────────────────────────────────────── */}
      <section style={abschnitt}>
        <h2 style={ueberschrift}>Onboarding-Stand der Bewerbungen</h2>
        <p style={hinweis}>
          Durchschnittliche Vollständigkeit: <strong>{onboarding.schnitt} %</strong>.
          {onboarding.nichtKontaktierbar > 0 && (
            <> {onboarding.nichtKontaktierbar} Bewerbung(en) haben <strong>weder Telefon noch
            E-Mail</strong> — dort ist keine Bearbeitung möglich.</>
          )}
          {' '}Das Führungszeugnis zählt hier bewusst nicht mit: es kommt als Papier in die
          Personalakte, nicht über das Formular.
        </p>

        <div className="admin-stats-grid" style={{ marginBottom: 14 }}>
          {(['vollstaendig', 'gut', 'luecken', 'duenn'] as const).map(stufe => (
            <div key={stufe} className="admin-stat-card"
              style={{ borderLeft: `3px solid ${FORTSCHRITT_STUFEN[stufe].color}` }}>
              <div className="admin-stat-value">{onboarding.nachStufe[stufe] || 0}</div>
              <div className="admin-stat-label">{FORTSCHRITT_STUFEN[stufe].label}</div>
            </div>
          ))}
        </div>

        {onboarding.luecken.length > 0 && (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>
              Was am häufigsten fehlt
            </h3>
            <div className="admin-table-wrap" style={{ marginBottom: 14 }}>
              <table className="admin-table">
                <thead><tr><th>Angabe</th><th>Fehlt bei</th></tr></thead>
                <tbody>
                  {onboarding.luecken.slice(0, 6).map(([label, anzahl]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td style={{ fontWeight: 700 }}>{anzahl} Bewerbung(en)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>
          Unvollständigste Bewerbungen zuerst
        </h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Fortschritt</th><th>Es fehlt</th><th>Status</th></tr></thead>
            <tbody>
              {onboarding.eintraege.length === 0 ? (
                <EmptyRow colSpan={4}>Keine Bewerbungen vorhanden</EmptyRow>
              ) : onboarding.eintraege.slice(0, 12).map(({ lead, fortschritt }) => {
                const stufe = FORTSCHRITT_STUFEN[stufeFuer(fortschritt.prozent)]
                return (
                  <tr key={lead.id}>
                    <td style={{ fontWeight: 600 }}>{lead.name || '—'}</td>
                    <td style={{ minWidth: 150 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={balkenSpur}>
                          <div style={{
                            width: `${fortschritt.prozent}%`, height: '100%',
                            background: stufe.color, borderRadius: 5,
                          }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{fortschritt.prozent} %</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink3)' }}>
                      {fortschritt.offen.slice(0, 3).map(o => o.label).join(', ') || '—'}
                    </td>
                    <td>
                      <StatusBadge
                        label={statusMeta(APPLICATION_STATUS, lead.status).label}
                        color={statusMeta(APPLICATION_STATUS, lead.status).color}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Warteliste ─────────────────────────────────────────────── */}
      <section style={abschnitt}>
        <h2 style={ueberschrift}>Warteliste nach Region</h2>
        <p style={hinweis}>
          {vormerkungen.length} Vormerkungen in <code>state_waitlist</code> — dieselbe Tabelle,
          aus der das Expansion-Modul beim Regionalstart benachrichtigt.
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Ort</th><th>Bundesland</th><th>Neu</th><th>In Arbeit</th><th>Gesamt</th></tr></thead>
            <tbody>
              {vormerkungen.length === 0 ? (
                <EmptyRow colSpan={5}>Noch keine Vormerkungen eingegangen</EmptyRow>
              ) : Object.entries(
                vormerkungen.reduce((acc, v) => {
                  const key = `${v.ort || '— ohne Ort'}|${v.bundesland || '—'}`
                  acc[key] = acc[key] || { neu: 0, arbeit: 0 }
                  if (v.status === 'neu') acc[key].neu++
                  else acc[key].arbeit++
                  return acc
                }, {} as Record<string, { neu: number; arbeit: number }>),
              )
                .sort((a, b) => (b[1].neu + b[1].arbeit) - (a[1].neu + a[1].arbeit))
                .map(([key, z]) => {
                  const [ort, land] = key.split('|')
                  return (
                    <tr key={key}>
                      <td style={{ fontWeight: 600 }}>{ort}</td>
                      <td style={{ fontSize: 13, color: 'var(--ink3)' }}>{land}</td>
                      <td>{z.neu || '—'}</td>
                      <td>{z.arbeit || '—'}</td>
                      <td style={{ fontWeight: 700 }}>{z.neu + z.arbeit}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Kampagnen ──────────────────────────────────────────────── */}
      {kampagnen.length > 0 && (
        <section style={abschnitt}>
          <h2 style={ueberschrift}>Kampagnen</h2>
          <p style={hinweis}>
            Quelle · Medium · Kampagne aus der Warteliste. <code>lead_inquiries</code> führt nur
            <code> utm_source</code> — deshalb steht hier nur, was die Warteliste kennt, statt
            einer Tabelle, die für zwei Drittel der Zeilen leer wäre.
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Kampagne</th><th>Vormerkungen</th></tr></thead>
              <tbody>
                {kampagnen.map(([key, anzahl]) => (
                  <tr key={key}><td>{key}</td><td style={{ fontWeight: 700 }}>{anzahl}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Bewerberpipeline ───────────────────────────────────────── */}
      <section style={abschnitt}>
        <h2 style={ueberschrift}>Bewerberpipeline</h2>
        <p style={hinweis}>
          {bewerbungen.length} Bewerbungen im Trichter. Abgesagt: {pipeline.abgelehnt} —
          steht bewusst neben dem Trichter, nicht darin: eine Absage ist ein Ausstieg,
          kein Schritt nach vorn.
        </p>
        {bewerbungen.length === 0 ? (
          <p style={hinweis}>Derzeit keine Bewerbungen in lead_inquiries.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pipeline.stufen.map((s, i) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 108, fontSize: 13, color: 'var(--ink3)', flexShrink: 0 }}>
                  {i + 1}. {s.label}
                </span>
                <div style={trichterSpur}>
                  <div style={{
                    width: `${Math.round((s.anzahl / pipeline.groesste) * 100)}%`,
                    background: s.farbe, height: '100%', borderRadius: 6,
                    minWidth: s.anzahl > 0 ? 26 : 0, transition: 'width .3s',
                  }} />
                </div>
                <span style={{ width: 40, textAlign: 'right', fontWeight: 700, fontSize: 15 }}>
                  {s.anzahl}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Quellen ────────────────────────────────────────────────── */}
      <section style={abschnitt}>
        <h2 style={ueberschrift}>Quellen</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Quelle</th><th>Kundenanfragen</th><th>Bewerbungen</th><th>Gesamt</th></tr>
            </thead>
            <tbody>
              {quellen.length === 0 ? (
                <EmptyRow colSpan={4}>Keine Einträge vorhanden</EmptyRow>
              ) : quellen.map(q => (
                <tr key={q.source || 'ohne'}>
                  <td>{quelleLabel(q.source)}</td>
                  <td>{q.anfrage || '—'}</td>
                  <td>{q.bewerbung || '—'}</td>
                  <td style={{ fontWeight: 700 }}>{q.anfrage + q.bewerbung}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Orte ───────────────────────────────────────────────────── */}
      <section style={abschnitt}>
        <h2 style={ueberschrift}>Postleitzahlen</h2>
        <p style={hinweis}>
          {orte.length} verschiedene Postleitzahlen{ohnePlz > 0 && `, ${ohnePlz} Einträge ohne PLZ`}.
          Ein Ortsname wird nur dort angezeigt, wo die Quelle ihn nennt — eine
          Zuordnung PLZ→Ort führt dieses Schema nicht, und geraten wird sie nicht.
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>PLZ</th><th>Ort (aus Quelle)</th><th>Kundenanfragen</th><th>Bewerbungen</th><th>Gesamt</th></tr>
            </thead>
            <tbody>
              {orte.length === 0 ? (
                <EmptyRow colSpan={5}>Keine Einträge mit Postleitzahl</EmptyRow>
              ) : orte.map(o => (
                <tr key={o.plz}>
                  <td style={{ fontWeight: 600 }}>{o.plz}</td>
                  <td style={{ color: 'var(--ink3)', fontSize: 13 }}>{o.ort || '—'}</td>
                  <td>{o.anfrage || '—'}</td>
                  <td>{o.bewerbung || '—'}</td>
                  <td style={{ fontWeight: 700 }}>{o.anfrage + o.bewerbung}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Offene Follow-ups ──────────────────────────────────────── */}
      <section style={abschnitt}>
        <h2 style={ueberschrift}>
          Offene Follow-ups ({offeneFollowUps.length})
        </h2>
        <p style={hinweis}>
          Status „Neu" — noch nicht kontaktiert. Älteste zuerst, denn dort wird das
          Warten am teuersten.
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Eingegangen</th><th>Name</th><th>Art</th><th>Kontakt</th><th>PLZ</th><th>Quelle</th><th>Status</th></tr>
            </thead>
            <tbody>
              {offeneFollowUps.length === 0 ? (
                <EmptyRow colSpan={7}>Keine offenen Follow-ups — alles bearbeitet</EmptyRow>
              ) : [...offeneFollowUps]
                .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
                .slice(0, 50)
                .map(l => {
                  const sm = statusMeta(APPLICATION_STATUS, l.status)
                  return (
                    <tr key={l.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                        {timeAgo(l.created_at)}
                        <div style={{ color: 'var(--ink5)', fontSize: 11 }}>
                          {formatDate(l.eingereicht_am || l.created_at)}
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{l.name || '—'}</td>
                      <td style={{ fontSize: 13 }}>
                        {l.istBewerbung
                          ? <span style={{ color: '#9C27B0' }}>Bewerbung</span>
                          : <span style={{ color: '#2196F3' }}>Kundenanfrage</span>}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {l.phone || l.email || <span style={{ color: 'var(--ink5)' }}>kein Rückweg</span>}
                      </td>
                      <td style={{ fontSize: 13 }}>{l.plz || '—'}</td>
                      <td style={{ fontSize: 13 }}>{quelleLabel(l.source)}</td>
                      <td><StatusBadge label={sm.label} color={sm.color} /></td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        {offeneFollowUps.length > 50 && (
          <p style={hinweis}>
            Es werden die 50 ältesten von {offeneFollowUps.length} offenen Vorgängen gezeigt.
          </p>
        )}
      </section>
    </div>
  )
}

// ── Stile ──────────────────────────────────────────────────────────────
const abschnitt: React.CSSProperties = {
  marginTop: 26, background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 14, padding: '18px 20px',
}
const ueberschrift: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: 'var(--ink)',
}
const hinweis: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', margin: '0 0 14px', lineHeight: 1.5,
}
const diagramm: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-end', gap: 3, height: 150,
  padding: '10px 0 0', borderBottom: '1px solid var(--border)',
}
const saeuleAussen: React.CSSProperties = {
  flex: 1, minWidth: 0, height: '100%', display: 'flex',
  flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'stretch',
}
const saeule: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
  minHeight: 2, borderRadius: '3px 3px 0 0', overflow: 'hidden',
}
const saeuleWert: React.CSSProperties = {
  fontSize: 9, color: 'var(--ink5)', textAlign: 'center', height: 12, lineHeight: '12px',
}
const achse: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between',
  fontSize: 11, color: 'var(--ink5)', marginTop: 6,
}
const balkenSpur: React.CSSProperties = {
  flex: 1, minWidth: 60, height: 10, background: 'var(--coal3)',
  borderRadius: 5, overflow: 'hidden',
}
const trichterSpur: React.CSSProperties = {
  flex: 1, minWidth: 0, height: 22, background: 'var(--coal3)',
  borderRadius: 6, overflow: 'hidden',
}
