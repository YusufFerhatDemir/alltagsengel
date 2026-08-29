'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  statusMeta, formatDate, formatTime, fullName,
  VERTRAGSSTATUS, QUALIFICATION_LEVEL, SCHULUNGSART,
  ARBEITSZEIT_STATUS, ARBEITSZEIT_QUELLE, ABSENCE_TYPE, ABSENCE_STATUS,
  MONATSNAMEN,
} from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { logger } from '@/lib/logger'
import DialogOverlay from '@/components/DialogOverlay'
const log = logger.child('admin:personal')

// ── Types ──────────────────────────────────────────────────────

interface Stammdaten {
  id: string
  name: string
  email: string | null
  phone: string | null
  vertragsstatus: string
  qualifikationsstufe: string
  notfallkontakt_name: string | null
  notfallkontakt_telefon: string | null
  einsatzgebiet_plz: string | null
  einsatzgebiet_radius_km: number | null
  wochenstunden_soll: number | null
  urlaubstage_jahr: number | null
  probezeitende: string | null
  fahrzeug: boolean
  fuehrerschein: boolean
  einsatzfreigabe: boolean
}

interface Qualifikation {
  id: string
  bezeichnung: string
  /** `qualification_type` — zum Korrigieren noetig, nicht nur zum Anzeigen. */
  art: string
  gueltig_bis: string | null
  pflicht: boolean
  einsatzrelevant: boolean
  status: string
  nachweis_url: string | null
}

interface Schulung {
  id: string
  titel: string
  art: string
  datum: string | null
  stunden: number | null
  bestanden: boolean | null
  anbieter: string | null
  nachweis_url: string | null
}

/**
 * Was gerade korrigiert wird. `null` heisst: nichts offen.
 *
 * BEFUND (29.08.2026): PATCH und DELETE auf
 * /api/personal/qualifikationen/[id] und /api/personal/schulungen/[id]
 * sind seit langem vollstaendig und wurden von KEINER Stelle aufgerufen.
 * In der Personalakte liess sich alles anlegen und nichts korrigieren.
 * Bei einer Schulung waere das laestig; bei einer Qualifikation ist es
 * betrieblich: `valid_until`, `pflicht` und `einsatzrelevant` steuern die
 * Einsatzfreigabe (lib/personal/einsatzfreigabe.ts) — ein falsch
 * eingetragenes Ablaufdatum sperrt eine Pflegekraft fuer die Planung, und
 * es gab keinen Weg, es zu berichtigen.
 */
type Korrektur =
  | { art: 'qualifikation'; id: string; titel: string; gueltigBis: string; pflicht: boolean; einsatzrelevant: boolean }
  | { art: 'schulung'; id: string; titel: string; beginn: string; anbieter: string; bestanden: boolean | null }

interface Arbeitszeit {
  id: string
  datum: string
  beginn: string
  ende: string
  pause_min: number
  ist_stunden: number
  status: string
  quelle: string
  bemerkung: string | null
}

interface Abwesenheit {
  id: string
  typ: string
  von: string
  bis: string
  tage: number
  status: string
  bemerkung: string | null
}

interface Urlaubskonto {
  anspruch: number
  genommen: number
  geplant: number
  resturlaub: number
}

interface AuditEntry {
  id: string
  aktion: string
  tabelle: string
  zeitpunkt: string
  benutzer: string | null
  details: string | null
}

// qualiForm/schulungForm-Feldnamen entsprechen 1:1 den Parametern von
// createQualifikation/createSchulung (lib/personal/qualifikationen.ts,
// lib/personal/schulungen.ts), da sie direkt als POST-Body versendet werden.

/**
 * Beschriftungen zu QUALIFIKATIONSTYP_WERTE
 * (lib/personal/qualifikationen.ts) — dieselbe Erlaubnisliste, die der
 * Live-CHECK der Datenbank führt.
 */
const QUALIFIKATIONSART_LABELS: Record<string, string> = {
  fuehrungszeugnis: 'Erweitertes Führungszeugnis',
  erste_hilfe: 'Erste-Hilfe-Nachweis',
  hygiene: 'Hygiene',
  datenschutz: 'Datenschutz',
  brandschutz: 'Brandschutz',
  pflichtunterweisung: 'Pflichtunterweisung',
  fortbildung: 'Fortbildung',
  sonstige: 'Sonstige',
}

type Tab = 'stammdaten' | 'qualifikationen' | 'schulungen' | 'arbeitszeiten' | 'urlaub' | 'audit'

const TABS: { key: Tab; label: string }[] = [
  { key: 'stammdaten', label: 'Stammdaten' },
  { key: 'qualifikationen', label: 'Qualifikationen' },
  { key: 'schulungen', label: 'Schulungen' },
  { key: 'arbeitszeiten', label: 'Arbeitszeiten' },
  { key: 'urlaub', label: 'Urlaub' },
  { key: 'audit', label: 'Audit' },
]

// ── Styles ─────────────────────────────────────────────────────

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const secondaryBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', fontWeight: 500,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal3)', color: 'var(--ink)', fontSize: 14,
  fontFamily: "'Jost',sans-serif", boxSizing: 'border-box',
}

/** Knopf in einer Tabellenzeile — flach, damit die Zeile lesbar bleibt. */
const zeilenBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  padding: '4px 8px', marginLeft: 6, borderRadius: 6, border: 'none',
  background: 'transparent', color: 'var(--gold2)',
}

const fieldRow: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, alignItems: 'center',
  padding: '8px 0', borderBottom: '1px solid var(--border)',
}

const fieldLabel: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: 'var(--ink4)',
}

// ── Page Component ─────────────────────────────────────────────

export default function PersonalDetailPage() {
  const params = useParams()
  const router = useRouter()
  const caregiverId = params.id as string

  const [tab, setTab] = useState<Tab>('stammdaten')
  const [stamm, setStamm] = useState<Stammdaten | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  // Tab-specific state
  const [qualifikationen, setQualifikationen] = useState<Qualifikation[]>([])
  const [schulungen, setSchulungen] = useState<Schulung[]>([])
  const [arbeitszeiten, setArbeitszeiten] = useState<Arbeitszeit[]>([])
  const [abwesenheiten, setAbwesenheiten] = useState<Abwesenheit[]>([])
  const [urlaubskonto, setUrlaubskonto] = useState<Urlaubskonto | null>(null)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [tabLoading, setTabLoading] = useState(false)

  // Edit state for Stammdaten
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState<Partial<Stammdaten>>({})

  // Arbeitszeiten month
  const now = new Date()
  const [azMonat, setAzMonat] = useState(now.getMonth() + 1)
  const [azJahr, setAzJahr] = useState(now.getFullYear())

  // Modal state
  const [showQualiModal, setShowQualiModal] = useState(false)
  const [showSchulungModal, setShowSchulungModal] = useState(false)
  const [modalFehler, setModalFehler] = useState<string | null>(null)
  const [qualiForm, setQualiForm] = useState({ title: '', qualificationType: '', validUntil: '', pflicht: false, einsatzrelevant: false })
  const [schulungForm, setSchulungForm] = useState({ titel: '', schulungsart: 'pflichtschulung', beginn: '', dauerStunden: '', anbieter: '' })
  const [korrektur, setKorrektur] = useState<Korrektur | null>(null)
  const [korrekturFehler, setKorrekturFehler] = useState<string | null>(null)
  const [korrekturBusy, setKorrekturBusy] = useState(false)

  // Load Stammdaten
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/personal/stammdaten?caregiverId=${caregiverId}`)
        if (!res.ok) { setLoading(false); return }
        const data = await res.json()
        const r = data.stammdaten || data
        const s: Stammdaten = {
          id: r.id || r.caregiver_id || caregiverId,
          name: r.name || fullName(r),
          email: r.email || null,
          phone: r.phone || r.telefon || null,
          vertragsstatus: r.vertragsstatus || 'aktiv',
          qualifikationsstufe: r.qualifikationsstufe || r.qualification_level || '',
          notfallkontakt_name: r.notfallkontakt_name || r.emergency_contact_name || null,
          notfallkontakt_telefon: r.notfallkontakt_telefon || r.emergency_contact_phone || null,
          // einsatzgebiet_plz ist serverseitig eine text[]-Spalte und wird
          // hier als Komma-Liste bearbeitet (Rueckweg in saveStammdaten).
          einsatzgebiet_plz: Array.isArray(r.einsatzgebiet_plz)
            ? r.einsatzgebiet_plz.join(', ')
            : (r.einsatzgebiet_plz || null),
          einsatzgebiet_radius_km: r.einsatzgebiet_radius_km ?? r.service_radius_km ?? null,
          wochenstunden_soll: r.wochenstunden_soll ?? r.weekly_hours_target ?? null,
          urlaubstage_jahr: r.urlaubstage_jahresanspruch ?? r.urlaubstage_jahr ?? null,
          probezeitende: r.probezeitende || r.probation_end || null,
          fahrzeug: r.has_vehicle ?? false,
          fuehrerschein: r.has_drivers_license ?? false,
          einsatzfreigabe: r.einsatzfreigabe ?? r.deployment_cleared ?? false,
        }
        setStamm(s)
        setEditData(s)
      } catch (err) {
        log.errorWithException('Stammdaten laden fehlgeschlagen', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [caregiverId])

  // Load tab data on tab change
  //
  // Als `useCallback` statt als Funktion IM Effekt: nach dem Anlegen oder
  // Korrigieren eines Eintrags muss die Liste neu geladen werden, und dafuer
  // stand hier bis 29.08.2026 der Umweg
  //     setTab('stammdaten'); setTimeout(() => setTab('qualifikationen'), 50)
  // — die Ansicht sprang sichtbar auf einen anderen Reiter und zurueck, und
  // ob das Neuladen ueberhaupt passierte, haing an einer Frist von 50 ms.
  const ladeReiter = useCallback(async () => {
      setTabLoading(true)
      try {
        if (tab === 'qualifikationen') {
          const res = await fetch(`/api/personal/qualifikationen?caregiverId=${caregiverId}`)
          if (res.ok) {
            const data = await res.json()
            setQualifikationen((data.qualifikationen || data || []).map((r: any) => ({
              id: r.id,
              bezeichnung: r.title || '—',
              art: r.qualification_type || '',
              gueltig_bis: r.valid_until || null,
              pflicht: r.pflicht ?? false,
              einsatzrelevant: r.einsatzrelevant ?? false,
              status: r.status || 'valid',
              nachweis_url: null,
            })))
          }
        } else if (tab === 'schulungen') {
          const res = await fetch(`/api/personal/schulungen?caregiverId=${caregiverId}`)
          if (res.ok) {
            const data = await res.json()
            setSchulungen((data.schulungen || data || []).map((r: any) => ({
              id: r.id,
              titel: r.titel || '—',
              art: r.schulungsart || 'sonstiges',
              datum: r.beginn || null,
              stunden: r.dauer_stunden ?? null,
              bestanden: r.bestanden ?? null,
              anbieter: r.anbieter || null,
              nachweis_url: null,
            })))
          }
        } else if (tab === 'arbeitszeiten') {
          const res = await fetch(`/api/personal/arbeitszeiten?caregiverId=${caregiverId}&monat=${azMonat}&jahr=${azJahr}`)
          if (res.ok) {
            const data = await res.json()
            setArbeitszeiten((data.arbeitszeiten || data || []).map((r: any) => ({
              id: r.id,
              datum: r.datum || '',
              beginn: r.start_zeit || '',
              ende: r.end_zeit || '',
              pause_min: r.pause_minuten ?? 0,
              // ist_minuten kommt in Minuten aus der DB — fuer die Anzeige in Stunden umrechnen.
              ist_stunden: (r.ist_minuten ?? 0) / 60,
              status: r.status || 'erfasst',
              quelle: r.quelle || 'manuell',
              bemerkung: r.bemerkung || null,
            })))
          }
        } else if (tab === 'urlaub') {
          const [resK, resA] = await Promise.all([
            fetch(`/api/personal/urlaubskonto?caregiverId=${caregiverId}`),
            fetch(`/api/personal/abwesenheiten?caregiverId=${caregiverId}`),
          ])
          if (resK.ok) {
            const dataK = await resK.json()
            // GET /api/personal/urlaubskonto liefert ein Array (pro Jahr ein Konto) — nicht ein einzelnes Objekt.
            const konten = Array.isArray(dataK) ? dataK : (dataK.konten || [])
            const k = konten[0] || {}
            setUrlaubskonto({
              anspruch: k.anspruch_tage ?? 0,
              genommen: k.genommen_tage ?? 0,
              geplant: k.geplant_tage ?? 0,
              resturlaub: k.resturlaub ?? 0,
            })
          }
          if (resA.ok) {
            const dataA = await resA.json()
            setAbwesenheiten((dataA.abwesenheiten || dataA || []).map((r: any) => ({
              id: r.id,
              typ: r.absence_type || 'vacation',
              von: r.start_date || '',
              bis: r.end_date || '',
              tage: r.tage_berechnet ?? 0,
              status: r.status || 'beantragt',
              bemerkung: r.reason || null,
            })))
          }
        } else if (tab === 'audit') {
          const res = await fetch(`/api/personal/audit?caregiverId=${caregiverId}`)
          if (res.ok) {
            const data = await res.json()
            setAudit((data.audit || data || []).map((r: any) => ({
              id: r.id,
              aktion: r.aktion || '—',
              tabelle: r.entitaet_typ || '—',
              zeitpunkt: r.created_at || '',
              benutzer: r.benutzer_id || null,
              details: r.grund
                || (r.nachher ? JSON.stringify(r.nachher) : (r.vorher ? JSON.stringify(r.vorher) : null)),
            })))
          }
        }
      } catch (err) {
        log.errorWithException(`Tab ${tab} laden fehlgeschlagen`, err)
      } finally {
        setTabLoading(false)
      }
  }, [tab, caregiverId, azMonat, azJahr])

  useEffect(() => {
    if (tab !== 'stammdaten') ladeReiter()
  }, [tab, ladeReiter])

  // Save Stammdaten
  async function saveStammdaten() {
    setSaving(true)
    setSaveMsg(null)
    try {
      // Die Feldnamen dieser Seite sind NICHT die der Schnittstelle. Bis
      // hierher ging `editData` unveraendert hinaus — von elf Feldern kamen
      // nur `vertragsstatus` und `probezeitende` an, alles andere verwarf
      // der Server stillschweigend und die Seite meldete trotzdem
      // „Gespeichert". Die Zuordnung steht jetzt ausdruecklich hier; der
      // Server weist unbekannte Felder inzwischen ausserdem ab
      // (lib/personal/stammdaten.ts, STAMMDATEN_SPALTEN).
      const nutzlast = {
        vertragsstatus: editData.vertragsstatus || null,
        qualifikationsstufe: editData.qualifikationsstufe || null,
        notfallkontaktName: editData.notfallkontakt_name || null,
        notfallkontaktTelefon: editData.notfallkontakt_telefon || null,
        einsatzgebietPlz: (editData.einsatzgebiet_plz || '')
          .split(/[,;\s]+/).map(s => s.trim()).filter(Boolean),
        einsatzgebietRadiusKm: editData.einsatzgebiet_radius_km ?? null,
        wochenstundenSoll: editData.wochenstunden_soll ?? null,
        urlaubstageJahresanspruch: editData.urlaubstage_jahr ?? null,
        probezeitende: editData.probezeitende || null,
        hatFahrzeug: editData.fahrzeug ?? false,
        hatFuehrerschein: editData.fuehrerschein ?? false,
      }
      const res = await fetch(`/api/personal/stammdaten?caregiverId=${caregiverId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nutzlast),
      })
      if (res.ok) {
        setStamm({ ...stamm!, ...editData } as Stammdaten)
        setEditMode(false)
        setSaveMsg('Gespeichert')
        setTimeout(() => setSaveMsg(null), 3000)
      } else {
        // Die Meldung des Servers ist redaktionell formuliert (etwa
        // „60311 ist keine gültige Postleitzahl") — sie gehoert angezeigt,
        // nicht durch ein pauschales „Fehler beim Speichern" ersetzt.
        const fehler = await res.json().catch(() => null)
        setSaveMsg(fehler?.error || 'Fehler beim Speichern')
      }
    } catch {
      setSaveMsg('Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  // ── Korrigieren und entfernen ─────────────────────────────────────
  async function korrekturSpeichern() {
    if (!korrektur) return
    setKorrekturBusy(true); setKorrekturFehler(null)
    try {
      const [pfad, koerper] = korrektur.art === 'qualifikation'
        ? [
            `/api/personal/qualifikationen/${korrektur.id}`,
            {
              title: korrektur.titel,
              // Leeres Datum heisst „unbefristet", nicht „leerer String":
              // `valid_until` ist nullable, und ein leerer String scheitert
              // an der Datumspruefung der Route.
              validUntil: korrektur.gueltigBis || null,
              pflicht: korrektur.pflicht,
              einsatzrelevant: korrektur.einsatzrelevant,
            },
          ]
        : [
            `/api/personal/schulungen/${korrektur.id}`,
            {
              titel: korrektur.titel,
              beginn: korrektur.beginn || null,
              anbieter: korrektur.anbieter || null,
              bestanden: korrektur.bestanden,
            },
          ]
      const res = await fetch(pfad, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(koerper),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setKorrekturFehler(body?.error || 'Änderung konnte nicht gespeichert werden.'); return }
      setKorrektur(null)
      await ladeReiter()
    } catch (err) {
      log.errorWithException('Korrektur fehlgeschlagen', err)
      setKorrekturFehler('Änderung konnte nicht gespeichert werden.')
    } finally { setKorrekturBusy(false) }
  }

  async function eintragEntfernen(art: 'qualifikationen' | 'schulungen', id: string, titel: string) {
    // Beides sind harte Loeschungen (kein Soft-Delete in der Route), und
    // eine geloeschte Qualifikation aendert die Einsatzfreigabe sofort.
    // Deshalb die Rueckfrage mit Namen — „wirklich loeschen?" allein sagt
    // nicht, WAS gleich verschwindet.
    if (!window.confirm(`„${titel}" endgültig aus der Personalakte entfernen?`)) return
    setKorrekturBusy(true); setKorrekturFehler(null)
    try {
      const res = await fetch(`/api/personal/${art}/${id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setKorrekturFehler(body?.error || 'Entfernen fehlgeschlagen.'); return }
      setKorrektur(null)
      await ladeReiter()
    } catch (err) {
      log.errorWithException('Entfernen fehlgeschlagen', err)
      setKorrekturFehler('Entfernen fehlgeschlagen.')
    } finally { setKorrekturBusy(false) }
  }

  // Add Qualifikation
  async function addQualifikation() {
    try {
      const res = await fetch(`/api/personal/qualifikationen?caregiverId=${caregiverId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...qualiForm, caregiverId }),
      })
      if (res.ok) {
        setModalFehler(null)
        setShowQualiModal(false)
        setQualiForm({ title: '', qualificationType: '', validUntil: '', pflicht: false, einsatzrelevant: false })
        await ladeReiter()
      } else {
        // Ohne diesen Zweig blieb das Fenster bei jedem Fehler unveraendert
        // stehen — ohne Meldung, ohne Hinweis, was fehlt.
        const fehler = await res.json().catch(() => null)
        setModalFehler(fehler?.error || 'Qualifikation konnte nicht angelegt werden.')
      }
    } catch (err) {
      log.errorWithException('Qualifikation hinzufuegen fehlgeschlagen', err)
      setModalFehler('Qualifikation konnte nicht angelegt werden.')
    }
  }

  // Add Schulung
  async function addSchulung() {
    try {
      const res = await fetch(`/api/personal/schulungen?caregiverId=${caregiverId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...schulungForm,
          caregiverId,
          dauerStunden: schulungForm.dauerStunden ? Number(schulungForm.dauerStunden) : null,
        }),
      })
      if (res.ok) {
        setModalFehler(null)
        setShowSchulungModal(false)
        setSchulungForm({ titel: '', schulungsart: 'pflichtschulung', beginn: '', dauerStunden: '', anbieter: '' })
        await ladeReiter()
      } else {
        const fehler = await res.json().catch(() => null)
        setModalFehler(fehler?.error || 'Schulung konnte nicht angelegt werden.')
      }
    } catch (err) {
      log.errorWithException('Schulung hinzufuegen fehlgeschlagen', err)
      setModalFehler('Schulung konnte nicht angelegt werden.')
    }
  }

  // Arbeitszeiten summary
  const azSummary = useMemo(() => {
    const ist = arbeitszeiten.reduce((s, a) => s + a.ist_stunden, 0)
    const soll = stamm?.wochenstunden_soll ? stamm.wochenstunden_soll * 4.33 : 0
    return { ist, soll, ueberstunden: ist - soll }
  }, [arbeitszeiten, stamm])

  if (loading) return <div className="admin-page"><p>Laden...</p></div>
  if (!stamm) return <div className="admin-page"><p>Mitarbeiter nicht gefunden.</p></div>

  const vs = statusMeta(VERTRAGSSTATUS, stamm.vertragsstatus)

  return (
    <div className="admin-page">
      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <Link href="/admin/personal" style={{ color: 'var(--ink4)', fontSize: 13, textDecoration: 'none' }}>
          &larr; Zur&uuml;ck zur Personal&uuml;bersicht
        </Link>
      </div>
      <div className="admin-page-header">
        <div>
          <h1>{stamm.name}</h1>
          <p className="admin-subtitle">
            <StatusBadge label={vs.label} color={vs.color} />
            {stamm.email && <span style={{ marginLeft: 12 }}>{stamm.email}</span>}
          </p>
        </div>
      </div>

      {saveMsg && <Banner tone={saveMsg === 'Gespeichert' ? 'success' : 'danger'}>{saveMsg}</Banner>}

      {/* Tabs */}
      <div className="admin-filters" style={{ marginBottom: 20 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            className={`admin-filter-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Stammdaten ──────────────────────────────────── */}
      {tab === 'stammdaten' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            {editMode ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={secondaryBtn} onClick={() => { setEditMode(false); setEditData(stamm) }}>
                  Abbrechen
                </button>
                <button style={primaryBtn} onClick={saveStammdaten} disabled={saving}>
                  {saving ? 'Speichern...' : 'Speichern'}
                </button>
              </div>
            ) : (
              <button style={primaryBtn} onClick={() => setEditMode(true)}>Bearbeiten</button>
            )}
          </div>

          <div style={{
            background: 'var(--coal2)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 16,
          }}>
            <FieldRow label="Vertragsstatus">
              {editMode ? (
                <select value={editData.vertragsstatus || ''} onChange={e => setEditData({ ...editData, vertragsstatus: e.target.value })} style={inputStyle}>
                  {Object.entries(VERTRAGSSTATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              ) : <StatusBadge label={vs.label} color={vs.color} />}
            </FieldRow>
            <FieldRow label="Qualifikationsstufe">
              {editMode ? (
                <select value={editData.qualifikationsstufe || ''} onChange={e => setEditData({ ...editData, qualifikationsstufe: e.target.value })} style={inputStyle}>
                  <option value="">—</option>
                  {Object.entries(QUALIFICATION_LEVEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              ) : <span>{statusMeta(QUALIFICATION_LEVEL, stamm.qualifikationsstufe).label}</span>}
            </FieldRow>
            <FieldRow label="Notfallkontakt Name">
              {editMode ? (
                <input type="text" value={editData.notfallkontakt_name || ''} onChange={e => setEditData({ ...editData, notfallkontakt_name: e.target.value })} style={inputStyle} />
              ) : <span>{stamm.notfallkontakt_name || '—'}</span>}
            </FieldRow>
            <FieldRow label="Notfallkontakt Telefon">
              {editMode ? (
                <input type="text" value={editData.notfallkontakt_telefon || ''} onChange={e => setEditData({ ...editData, notfallkontakt_telefon: e.target.value })} style={inputStyle} />
              ) : <span>{stamm.notfallkontakt_telefon || '—'}</span>}
            </FieldRow>
            <FieldRow label="Einsatzgebiet PLZ">
              {editMode ? (
                <input type="text" value={editData.einsatzgebiet_plz || ''} onChange={e => setEditData({ ...editData, einsatzgebiet_plz: e.target.value })} style={inputStyle} />
              ) : <span>{stamm.einsatzgebiet_plz || '—'}</span>}
            </FieldRow>
            <FieldRow label="Radius (km)">
              {editMode ? (
                <input type="number" value={editData.einsatzgebiet_radius_km ?? ''} onChange={e => setEditData({ ...editData, einsatzgebiet_radius_km: e.target.value ? Number(e.target.value) : null })} style={inputStyle} />
              ) : <span>{stamm.einsatzgebiet_radius_km != null ? `${stamm.einsatzgebiet_radius_km} km` : '—'}</span>}
            </FieldRow>
            <FieldRow label="Wochenstunden-Soll">
              {editMode ? (
                <input type="number" value={editData.wochenstunden_soll ?? ''} onChange={e => setEditData({ ...editData, wochenstunden_soll: e.target.value ? Number(e.target.value) : null })} style={inputStyle} />
              ) : <span>{stamm.wochenstunden_soll != null ? `${stamm.wochenstunden_soll} h` : '—'}</span>}
            </FieldRow>
            <FieldRow label="Urlaubstage / Jahr">
              {editMode ? (
                <input type="number" value={editData.urlaubstage_jahr ?? ''} onChange={e => setEditData({ ...editData, urlaubstage_jahr: e.target.value ? Number(e.target.value) : null })} style={inputStyle} />
              ) : <span>{stamm.urlaubstage_jahr ?? '—'}</span>}
            </FieldRow>
            <FieldRow label="Probezeitende">
              {editMode ? (
                <input type="date" value={editData.probezeitende || ''} onChange={e => setEditData({ ...editData, probezeitende: e.target.value })} style={inputStyle} />
              ) : <span>{formatDate(stamm.probezeitende)}</span>}
            </FieldRow>
            <FieldRow label="Fahrzeug">
              {editMode ? (
                <input type="checkbox" checked={editData.fahrzeug ?? false} onChange={e => setEditData({ ...editData, fahrzeug: e.target.checked })} style={{ accentColor: '#C9963C' }} />
              ) : <span>{stamm.fahrzeug ? 'Ja' : 'Nein'}</span>}
            </FieldRow>
            <FieldRow label="Fuehrerschein">
              {editMode ? (
                <input type="checkbox" checked={editData.fuehrerschein ?? false} onChange={e => setEditData({ ...editData, fuehrerschein: e.target.checked })} style={{ accentColor: '#C9963C' }} />
              ) : <span>{stamm.fuehrerschein ? 'Ja' : 'Nein'}</span>}
            </FieldRow>
            <FieldRow label="Einsatzfreigabe">
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                  background: stamm.einsatzfreigabe ? '#5CB882' : '#D04B3B',
                }} />
                {stamm.einsatzfreigabe ? 'Freigegeben' : 'Gesperrt'}
              </span>
            </FieldRow>
          </div>
        </div>
      )}

      {/* ── Tab: Qualifikationen ─────────────────────────────── */}
      {tab === 'qualifikationen' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button style={primaryBtn} onClick={() => setShowQualiModal(true)}>
              + Qualifikation hinzuf&uuml;gen
            </button>
          </div>

          {tabLoading ? <p>Laden...</p> : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Bezeichnung</th>
                    <th>G&uuml;ltig bis</th>
                    <th>Pflicht</th>
                    <th>Einsatzrelevant</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {qualifikationen.length === 0 ? (
                    <EmptyRow colSpan={6}>Keine Qualifikationen vorhanden</EmptyRow>
                  ) : qualifikationen.map(q => {
                    const qs = statusMeta(
                      { valid: { label: 'Gültig', color: '#5CB882' }, expiring: { label: 'Läuft ab', color: '#E8A000' }, expired: { label: 'Abgelaufen', color: '#D04B3B' } },
                      q.status
                    )
                    return (
                      <tr key={q.id}>
                        <td style={{ fontWeight: 600 }}>{q.bezeichnung}</td>
                        <td>{formatDate(q.gueltig_bis)}</td>
                        <td>{q.pflicht ? <StatusBadge label="Pflicht" color="#D04B3B" /> : '—'}</td>
                        <td>{q.einsatzrelevant ? <StatusBadge label="Einsatzrelevant" color="#2196F3" /> : '—'}</td>
                        <td><StatusBadge label={qs.label} color={qs.color} /></td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button style={zeilenBtn} disabled={korrekturBusy} onClick={() => {
                            setKorrekturFehler(null)
                            setKorrektur({
                              art: 'qualifikation', id: q.id, titel: q.bezeichnung,
                              gueltigBis: q.gueltig_bis ?? '', pflicht: q.pflicht,
                              einsatzrelevant: q.einsatzrelevant,
                            })
                          }}>Bearbeiten</button>
                          <button style={{ ...zeilenBtn, color: '#D04B3B' }} disabled={korrekturBusy}
                            onClick={() => eintragEntfernen('qualifikationen', q.id, q.bezeichnung)}>Entfernen</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Add modal */}
          {showQualiModal && (
            <Modal title="Qualifikation hinzuf&uuml;gen" onClose={() => { setModalFehler(null); setShowQualiModal(false) }}>
              <label style={{ fontSize: 13 }}>
                Bezeichnung
                <input type="text" value={qualiForm.title} onChange={e => setQualiForm({ ...qualiForm, title: e.target.value })} style={{ ...inputStyle, marginTop: 4, marginBottom: 12 }} />
              </label>
              {/*
                Auswahlfeld statt Freitext: `qualification_type` ist in der
                Datenbank auf acht Werte festgelegt
                (caregiver_qualifications_qualification_type_check). Als
                Freitextfeld — Platzhalter „z. B. Pflegefachkraft" — konnte
                dieses Formular per Definition keine einzige Qualifikation
                anlegen: jeder eingetippte Wert verletzte den CHECK, die
                Antwort war ein 500er, und `if (res.ok)` liess das Fenster
                ohne Meldung stehen.
              */}
              <label style={{ fontSize: 13 }}>
                Art
                <select value={qualiForm.qualificationType} onChange={e => setQualiForm({ ...qualiForm, qualificationType: e.target.value })} style={{ ...inputStyle, marginTop: 4, marginBottom: 12 }}>
                  <option value="">— bitte wählen —</option>
                  {Object.entries(QUALIFIKATIONSART_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>
                G&uuml;ltig bis
                <input type="date" value={qualiForm.validUntil} onChange={e => setQualiForm({ ...qualiForm, validUntil: e.target.value })} style={{ ...inputStyle, marginTop: 4, marginBottom: 12 }} />
              </label>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={qualiForm.pflicht} onChange={e => setQualiForm({ ...qualiForm, pflicht: e.target.checked })} style={{ accentColor: '#C9963C' }} />
                  Pflicht
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={qualiForm.einsatzrelevant} onChange={e => setQualiForm({ ...qualiForm, einsatzrelevant: e.target.checked })} style={{ accentColor: '#C9963C' }} />
                  Einsatzrelevant
                </label>
              </div>
              {modalFehler && (
                <p style={{ color: '#D04B3B', fontSize: 13, marginBottom: 12 }}>{modalFehler}</p>
              )}
              <button style={primaryBtn} onClick={addQualifikation}>Hinzuf&uuml;gen</button>
            </Modal>
          )}
        </div>
      )}

      {/* ── Tab: Schulungen ──────────────────────────────────── */}
      {tab === 'schulungen' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button style={primaryBtn} onClick={() => setShowSchulungModal(true)}>
              + Schulung hinzuf&uuml;gen
            </button>
          </div>

          {tabLoading ? <p>Laden...</p> : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Titel</th>
                    <th>Art</th>
                    <th>Datum</th>
                    <th style={{ textAlign: 'right' }}>Stunden</th>
                    <th>Bestanden</th>
                    <th>Anbieter</th>
                    <th style={{ textAlign: 'right' }}>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {schulungen.length === 0 ? (
                    <EmptyRow colSpan={7}>Keine Schulungen vorhanden</EmptyRow>
                  ) : schulungen.map(s => {
                    const sm = statusMeta(SCHULUNGSART, s.art)
                    return (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>{s.titel}</td>
                        <td><StatusBadge label={sm.label} color={sm.color} /></td>
                        <td>{formatDate(s.datum)}</td>
                        <td style={{ textAlign: 'right' }}>{s.stunden != null ? `${s.stunden} h` : '—'}</td>
                        <td>
                          {s.bestanden === true && <StatusBadge label="Bestanden" color="#5CB882" />}
                          {s.bestanden === false && <StatusBadge label="Nicht bestanden" color="#D04B3B" />}
                          {s.bestanden === null && '—'}
                        </td>
                        <td style={{ fontSize: 13 }}>{s.anbieter || '—'}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {/* Eine BESTANDENE Schulung ist ein Nachweis:
                              `updateSchulung` weist jede Aenderung daran
                              mit 409 ab, und seit dem 29.08.2026 auch das
                              Loeschen. Knoepfe anzubieten, die sicher
                              scheitern, ist schlechter als der Satz, der
                              sagt warum. */}
                          {s.bestanden === true ? (
                            <span style={{ fontSize: 12, color: 'var(--ink4)' }}>Nachweis — unveränderlich</span>
                          ) : (
                            <>
                              <button style={zeilenBtn} disabled={korrekturBusy} onClick={() => {
                                setKorrekturFehler(null)
                                setKorrektur({
                                  art: 'schulung', id: s.id, titel: s.titel,
                                  beginn: s.datum ?? '', anbieter: s.anbieter ?? '',
                                  bestanden: s.bestanden,
                                })
                              }}>Bearbeiten</button>
                              <button style={{ ...zeilenBtn, color: '#D04B3B' }} disabled={korrekturBusy}
                                onClick={() => eintragEntfernen('schulungen', s.id, s.titel)}>Entfernen</button>
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Add modal */}
          {showSchulungModal && (
            <Modal title="Schulung hinzuf&uuml;gen" onClose={() => { setModalFehler(null); setShowSchulungModal(false) }}>
              <label style={{ fontSize: 13 }}>
                Titel
                <input type="text" value={schulungForm.titel} onChange={e => setSchulungForm({ ...schulungForm, titel: e.target.value })} style={{ ...inputStyle, marginTop: 4, marginBottom: 12 }} />
              </label>
              <label style={{ fontSize: 13 }}>
                Art
                <select value={schulungForm.schulungsart} onChange={e => setSchulungForm({ ...schulungForm, schulungsart: e.target.value })} style={{ ...inputStyle, marginTop: 4, marginBottom: 12 }}>
                  {Object.entries(SCHULUNGSART).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>
                Datum
                <input type="date" value={schulungForm.beginn} onChange={e => setSchulungForm({ ...schulungForm, beginn: e.target.value })} style={{ ...inputStyle, marginTop: 4, marginBottom: 12 }} />
              </label>
              <label style={{ fontSize: 13 }}>
                Stunden
                <input type="number" value={schulungForm.dauerStunden} onChange={e => setSchulungForm({ ...schulungForm, dauerStunden: e.target.value })} style={{ ...inputStyle, marginTop: 4, marginBottom: 12 }} />
              </label>
              <label style={{ fontSize: 13 }}>
                Anbieter
                <input type="text" value={schulungForm.anbieter} onChange={e => setSchulungForm({ ...schulungForm, anbieter: e.target.value })} style={{ ...inputStyle, marginTop: 4, marginBottom: 12 }} />
              </label>
              {modalFehler && (
                <p style={{ color: '#D04B3B', fontSize: 13, marginBottom: 12 }}>{modalFehler}</p>
              )}
              <button style={primaryBtn} onClick={addSchulung}>Hinzuf&uuml;gen</button>
            </Modal>
          )}
        </div>
      )}

      {/* ── Korrektur eines vorhandenen Eintrags ───────────────
          Ein eigener Dialog und nicht das Anlageformular: was hier
          geaendert wird, EXISTIERT schon, und ein Formular, das je nach
          Zustand anlegt oder aendert, verwechselt die beiden Faelle
          frueher oder spaeter. */}
      {korrektur && (
        <Modal
          title={korrektur.art === 'qualifikation' ? 'Qualifikation korrigieren' : 'Schulung korrigieren'}
          onClose={() => { setKorrekturFehler(null); setKorrektur(null) }}
        >
          <label style={{ fontSize: 13 }}>
            {korrektur.art === 'qualifikation' ? 'Bezeichnung' : 'Titel'}
            <input type="text" value={korrektur.titel}
              onChange={e => setKorrektur({ ...korrektur, titel: e.target.value })}
              style={{ ...inputStyle, marginTop: 4, marginBottom: 12 }} />
          </label>

          {korrektur.art === 'qualifikation' ? (
            <>
              <label style={{ fontSize: 13 }}>
                G&uuml;ltig bis
                <input type="date" value={korrektur.gueltigBis}
                  onChange={e => setKorrektur({ ...korrektur, gueltigBis: e.target.value })}
                  style={{ ...inputStyle, marginTop: 4, marginBottom: 4 }} />
              </label>
              {/* Ausgeschrieben, weil es die Folge ist, die man beim
                  Eintippen eines Datums nicht vor Augen hat. */}
              <p style={{ fontSize: 12, color: 'var(--ink4)', margin: '0 0 12px' }}>
                Leer lassen heißt „unbefristet". Ein Ablaufdatum in der Vergangenheit
                sperrt die Mitarbeiterin oder den Mitarbeiter für die Einsatzplanung,
                sofern die Qualifikation einsatzrelevant oder Pflicht ist.
              </p>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={korrektur.pflicht}
                    onChange={e => setKorrektur({ ...korrektur, pflicht: e.target.checked })}
                    style={{ accentColor: '#C9963C' }} />
                  Pflicht
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={korrektur.einsatzrelevant}
                    onChange={e => setKorrektur({ ...korrektur, einsatzrelevant: e.target.checked })}
                    style={{ accentColor: '#C9963C' }} />
                  Einsatzrelevant
                </label>
              </div>
            </>
          ) : (
            <>
              <label style={{ fontSize: 13 }}>
                Datum
                <input type="date" value={korrektur.beginn}
                  onChange={e => setKorrektur({ ...korrektur, beginn: e.target.value })}
                  style={{ ...inputStyle, marginTop: 4, marginBottom: 12 }} />
              </label>
              <label style={{ fontSize: 13 }}>
                Anbieter
                <input type="text" value={korrektur.anbieter}
                  onChange={e => setKorrektur({ ...korrektur, anbieter: e.target.value })}
                  style={{ ...inputStyle, marginTop: 4, marginBottom: 12 }} />
              </label>
              <label style={{ fontSize: 13 }}>
                Ergebnis
                {/* Drei Zustaende, nicht zwei: „noch offen" ist etwas
                    anderes als „nicht bestanden", und eine Schulung, die
                    gerade erst stattgefunden hat, ist weder das eine noch
                    das andere. */}
                <select
                  value={korrektur.bestanden === null ? '' : String(korrektur.bestanden)}
                  onChange={e => setKorrektur({
                    ...korrektur,
                    bestanden: e.target.value === '' ? null : e.target.value === 'true',
                  })}
                  style={{ ...inputStyle, marginTop: 4, marginBottom: 12 }}
                >
                  <option value="">— noch offen —</option>
                  <option value="true">Bestanden</option>
                  <option value="false">Nicht bestanden</option>
                </select>
              </label>
              <p style={{ fontSize: 12, color: 'var(--ink4)', margin: '-4px 0 12px' }}>
                „Bestanden" schreibt den Eintrag fest: er lässt sich danach weder
                ändern noch entfernen — nur die Bemerkung bleibt pflegbar.
              </p>
            </>
          )}

          {korrekturFehler && (
            <p style={{ color: '#D04B3B', fontSize: 13, marginBottom: 12 }}>{korrekturFehler}</p>
          )}
          <button style={primaryBtn} onClick={korrekturSpeichern} disabled={korrekturBusy}>
            {korrekturBusy ? 'Speichern…' : 'Speichern'}
          </button>
        </Modal>
      )}

      {/* ── Tab: Arbeitszeiten ───────────────────────────────── */}
      {tab === 'arbeitszeiten' && (
        <div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
            <select value={azMonat} onChange={e => setAzMonat(Number(e.target.value))} style={inputStyle}>
              {MONATSNAMEN.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={azJahr} onChange={e => setAzJahr(Number(e.target.value))} style={inputStyle}>
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            <SummaryCard label="Ist-Stunden" value={`${azSummary.ist.toFixed(1)} h`} />
            <SummaryCard label="Soll-Stunden" value={`${azSummary.soll.toFixed(1)} h`} />
            <SummaryCard
              label="Ueberstunden"
              value={`${azSummary.ueberstunden > 0 ? '+' : ''}${azSummary.ueberstunden.toFixed(1)} h`}
              color={azSummary.ueberstunden > 0 ? '#E8A000' : azSummary.ueberstunden < 0 ? '#D04B3B' : '#5CB882'}
            />
          </div>

          {tabLoading ? <p>Laden...</p> : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Beginn</th>
                    <th>Ende</th>
                    <th style={{ textAlign: 'right' }}>Pause</th>
                    <th style={{ textAlign: 'right' }}>Ist</th>
                    <th>Status</th>
                    <th>Quelle</th>
                    <th>Bemerkung</th>
                  </tr>
                </thead>
                <tbody>
                  {arbeitszeiten.length === 0 ? (
                    <EmptyRow colSpan={8}>Keine Arbeitszeiten f&uuml;r diesen Monat</EmptyRow>
                  ) : arbeitszeiten.map(a => {
                    const as = statusMeta(ARBEITSZEIT_STATUS, a.status)
                    const aq = statusMeta(ARBEITSZEIT_QUELLE, a.quelle)
                    return (
                      <tr key={a.id}>
                        <td>{formatDate(a.datum)}</td>
                        <td>{formatTime(a.beginn)}</td>
                        <td>{formatTime(a.ende)}</td>
                        <td style={{ textAlign: 'right' }}>{a.pause_min} min</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{a.ist_stunden.toFixed(1)} h</td>
                        <td><StatusBadge label={as.label} color={as.color} /></td>
                        <td><StatusBadge label={aq.label} color={aq.color} /></td>
                        <td style={{ fontSize: 13, color: 'var(--ink4)' }}>{a.bemerkung || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Urlaub ──────────────────────────────────────── */}
      {tab === 'urlaub' && (
        <div>
          {/* Urlaubskonto */}
          {urlaubskonto && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
              <SummaryCard label="Anspruch" value={`${urlaubskonto.anspruch} Tage`} />
              <SummaryCard label="Genommen" value={`${urlaubskonto.genommen} Tage`} />
              <SummaryCard label="Geplant" value={`${urlaubskonto.geplant} Tage`} color="#2196F3" />
              <SummaryCard
                label="Resturlaub"
                value={`${urlaubskonto.resturlaub} Tage`}
                color={urlaubskonto.resturlaub <= 0 ? '#D04B3B' : urlaubskonto.resturlaub <= 5 ? '#E8A000' : '#5CB882'}
              />
            </div>
          )}

          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '16px 0 8px' }}>Abwesenheiten</h3>

          {tabLoading ? <p>Laden...</p> : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Typ</th>
                    <th>Von</th>
                    <th>Bis</th>
                    <th style={{ textAlign: 'right' }}>Tage</th>
                    <th>Status</th>
                    <th>Bemerkung</th>
                  </tr>
                </thead>
                <tbody>
                  {abwesenheiten.length === 0 ? (
                    <EmptyRow colSpan={6}>Keine Abwesenheiten vorhanden</EmptyRow>
                  ) : abwesenheiten.map(a => {
                    const tm = statusMeta(ABSENCE_TYPE, a.typ)
                    const sm = statusMeta(ABSENCE_STATUS, a.status)
                    return (
                      <tr key={a.id}>
                        <td><StatusBadge label={tm.label} color={tm.color} /></td>
                        <td>{formatDate(a.von)}</td>
                        <td>{formatDate(a.bis)}</td>
                        <td style={{ textAlign: 'right' }}>{a.tage}</td>
                        <td><StatusBadge label={sm.label} color={sm.color} /></td>
                        <td style={{ fontSize: 13, color: 'var(--ink4)' }}>{a.bemerkung || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Audit ───────────────────────────────────────── */}
      {tab === 'audit' && (
        <div>
          {tabLoading ? <p>Laden...</p> : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Zeitpunkt</th>
                    <th>Aktion</th>
                    <th>Tabelle</th>
                    <th>Benutzer</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.length === 0 ? (
                    <EmptyRow colSpan={5}>Keine Audit-Eintr&auml;ge vorhanden</EmptyRow>
                  ) : audit.map(a => (
                    <tr key={a.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(a.zeitpunkt)} {formatTime(a.zeitpunkt?.split('T')[1] || '')}</td>
                      <td style={{ fontWeight: 600 }}>{a.aktion}</td>
                      <td>{a.tabelle}</td>
                      <td style={{ fontSize: 13 }}>{a.benutzer || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--ink4)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.details || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Helper Components ──────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={fieldRow}>
      <span style={fieldLabel}>{label}</span>
      <div>{children}</div>
    </label>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--coal2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '12px 16px',
    }}>
      <div style={{ fontSize: 12, color: 'var(--ink4)', fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || 'var(--ink)' }}>{value}</div>
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <DialogOverlay className="" onClose={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          background: 'var(--coal)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 24, minWidth: 360, maxWidth: 480,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h3>
          <button onClick={onClose} aria-label="Dialog schließen" style={{
            background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
            color: 'var(--ink4)', fontFamily: 'inherit',
          }}>x</button>
        </div>
        {children}
      </div>
    </DialogOverlay>
  )
}
