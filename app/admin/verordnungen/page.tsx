'use client'
import { heuteBerlin } from '@/lib/utils/timezone';
// ═══════════════════════════════════════════════════════════════
// Verordnungs-Workflow — kompletter Prozess in 4 Schritten:
//   1. Erfassen      — ärztliche Verordnung mit Scan + Gültigkeit
//   2. Genehmigung   — Antrag an die Pflegekasse, Antwort erfassen
//   3. Verplanung    — genehmigte Verordnungen mit Engeln verplanen
//   4. Abrechnung    — Leistungsnachweis + Abrechnungsstatus je
//                      Genehmigungsnummer
// Überwacht Ablaufdaten (30/14 Tage-Ampel), damit kein Klient ohne
// gültige Genehmigung betreut (= unbezahlt gearbeitet) wird.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  formatDate, formatDuration, formatTime, fullName, statusMeta, daysUntil,
  gueltigkeitsAmpel, euro, centToEuro, euroToCent,
  VERORDNUNG_TYPE, GENEHMIGUNG_STATUS, LEISTUNGSART_LABELS, ABRECHNUNGS_STATUS,
  WEEKDAYS, KOSTENTRAEGER_TYP, ABSAGE_VON, HAEUFIGKEIT_LABELS,
  istVerordnungPflicht, KEINE_VERORDNUNG_HINWEIS, BUDGET_DEFAULT_CENT,
} from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner, AmpelDot } from '@/components/admin/OpsUI'

// ── Typen ───────────────────────────────────────────────────────
interface Verordnung {
  id: string
  client_id: string
  verordnung_type: string
  leistungsart: string | null
  verordnung_nummer: string | null
  ausstellungsdatum: string
  gueltig_von: string | null
  gueltig_bis: string | null
  arzt_name: string | null
  arzt_praxis: string | null
  diagnose: string | null
  leistung_beschreibung: string | null
  verordnung_document_url: string | null
  genehmigung_status: string
  genehmigung_datum: string | null
  genehmigung_bis: string | null
  genehmigung_aktenzeichen: string | null
  kassengenehmigung_beantragt_am: string | null
  kassengenehmigung_antwort_am: string | null
  abrechnungs_status: string
  genehmigte_stunden_gesamt: number | null
  genehmigte_stunden_pro_woche: number | null
  neuantrag_erforderlich: boolean
  neuantrag_gestellt_am: string | null
  notes: string | null
  kostentraeger_typ: string
  kostentraeger_name: string | null
  kostentraeger_ik_nummer: string | null
  genehmigte_leistungsart: string | null
  genehmigung_abgleich_ok: boolean | null
  genehmigung_abweichung: string | null
  abtretungserklaerung_vorhanden: boolean
  abtretungserklaerung_datum: string | null
  abtretungserklaerung_document_url: string | null
  // Eylems Korrektur: Verordnung (§37) vs. Bewilligung/Zusage (§36/§45b/§39/§45a/§40)
  ist_verordnung: boolean
  kombinationsleistung: boolean
  kombi_zusage_vorhanden: boolean
  kombi_zusage_datum: string | null
  kombi_zusage_aktenzeichen: string | null
  monatliches_budget_cent: number | null
  budget_verbraucht_cent: number | null
  // Kassen-Gate (Dokumentenmanagement-Migration 20260809): sperrt die
  // Abrechnung unabhängig vom Genehmigungsstatus, z.B. bei fehlenden Nachweisen
  abrechnung_gesperrt: boolean
  abrechnung_sperrgrund: string | null
  clientName: string
}

interface PersonOption { id: string; name: string }

// Leistungsposition einer Verordnung (verordnung_leistungen) — ein Rezept
// kann mehrere Leistungsarten enthalten (z. B. Körperpflege 2x/Woche +
// Medikamentengabe täglich)
interface LeistungRow {
  id: string
  verordnung_id: string
  leistungsart: string
  haeufigkeit: string | null
  menge: number | null
  dauer_minuten: number | null
  leistungskomplex: string | null
  preis_cent: number | null
  bemerkung: string | null
}

// Formular-Zustand einer Leistungsposition (alles Strings für Inputs)
interface LeistungPos {
  leistungsart: string
  haeufigkeit: string
  menge: string
  dauer_minuten: string
  leistungskomplex: string
  bemerkung: string
}

const EMPTY_POS: LeistungPos = {
  leistungsart: '', haeufigkeit: '', menge: '1', dauer_minuten: '', leistungskomplex: '', bemerkung: '',
}

interface AssignmentRow {
  id: string
  verordnung_id: string
  caregiver_id: string
  weekday: number
  start_time: string | null
  end_time: string | null
  status: string
  caregiverName: string
}

interface RecordRow {
  id: string
  verordnung_id: string
  date: string
  duration_minutes: number | null
  amount: number | null
  status: string
}

interface InvoiceRow {
  id: string
  verordnung_id: string
  invoice_number: string
  total_amount: number | null
  status: string
  soll_betrag_cent: number | null
  ist_betrag_cent: number | null
  kuerzung_cent: number | null
  kuerzung_grund: string | null
  bezahlt: boolean
  bezahlt_am: string | null
  versand_elektronisch: boolean
  versand_post: boolean
}

interface AbsageRow {
  id: string
  assignment_id: string | null
  abgesagt_von: string
  abgesagt_am: string
  grund: string | null
  ersatz_mitarbeiterin_id: string | null
  ersatz_gefunden: boolean
  clientName: string
  caregiverName: string
  weekday: number | null
}

interface AssignmentOption {
  id: string
  label: string
}

const EMPTY_FORM = {
  client_id: '',
  verordnung_type: 'behandlungspflege_37',
  leistungsart: '',
  verordnung_nummer: '',
  ausstellungsdatum: '',
  gueltig_von: '',
  gueltig_bis: '',
  arzt_name: '',
  arzt_praxis: '',
  diagnose: '',
  leistung_beschreibung: '',
  genehmigte_stunden_gesamt: '',
  genehmigte_stunden_pro_woche: '',
  genehmigung_status: 'ausstehend',
  genehmigung_datum: '',
  genehmigung_bis: '',
  genehmigung_aktenzeichen: '',
  notes: '',
  kostentraeger_typ: 'krankenkasse',
  kostentraeger_name: '',
  kostentraeger_ik_nummer: '',
  abtretungserklaerung_vorhanden: false,
  abtretungserklaerung_datum: '',
  kombi_zusage_vorhanden: false,
  kombi_zusage_datum: '',
  kombi_zusage_aktenzeichen: '',
  monatliches_budget_euro: '',
  budget_verbraucht_euro: '',
}
type FormState = typeof EMPTY_FORM

const EMPTY_ANTWORT = { aktenzeichen: '', datum: '', bis: '', ergebnis: 'genehmigt', genehmigte_leistungsart: '' }
const EMPTY_ASSIGN = { caregiver_id: '', weekday: '1', start_time: '13:00', end_time: '15:00' }
const EMPTY_ABSAGE = { assignment_id: '', abgesagt_von: 'klient', grund: '', ersatz_mitarbeiterin_id: '' }
const EMPTY_INVOICE_EDIT = { soll: '', ist: '', kuerzung: '', kuerzung_grund: '' }

type Tab = 'erfassung' | 'genehmigung' | 'verplanung' | 'abrechnung' | 'absagen'

// Ablauf-Ampel: ≤14 Tage rot, ≤30 Tage gelb — nur bei genehmigten
function expiryTone(v: Verordnung): 'red' | 'yellow' | null {
  if (v.genehmigung_status !== 'genehmigt' || !v.genehmigung_bis) return null
  const d = daysUntil(v.genehmigung_bis)
  if (d === null) return null
  if (d <= 14) return 'red'
  if (d <= 30) return 'yellow'
  return null
}

// Genehmigtes Stundenkontingent (gesamt bevorzugt, sonst pro Woche × Wochen)
function approvedHours(v: Verordnung): number | null {
  if (v.genehmigte_stunden_gesamt) return Number(v.genehmigte_stunden_gesamt)
  if (v.genehmigte_stunden_pro_woche && v.gueltig_von && v.gueltig_bis) {
    const ms = new Date(v.gueltig_bis).getTime() - new Date(v.gueltig_von).getTime()
    const weeks = Math.max(1, Math.ceil(ms / (7 * 86400000)))
    return Number(v.genehmigte_stunden_pro_woche) * weeks
  }
  return null
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100)
}

export default function AdminVerordnungenPage() {
  const [tab, setTab] = useState<Tab>('erfassung')
  const [verordnungen, setVerordnungen] = useState<Verordnung[]>([])
  const [clients, setClients] = useState<PersonOption[]>([])
  const [caregivers, setCaregivers] = useState<PersonOption[]>([])
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [records, setRecords] = useState<RecordRow[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [absagen, setAbsagen] = useState<AbsageRow[]>([])
  const [assignmentOptions, setAssignmentOptions] = useState<AssignmentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [scanFile, setScanFile] = useState<File | null>(null)
  const [abtretungFile, setAbtretungFile] = useState<File | null>(null)
  // Leistungspositionen der Verordnung (Mehrfach-Leistungsarten pro Rezept)
  const [leistungen, setLeistungen] = useState<LeistungRow[]>([])
  const [positionen, setPositionen] = useState<LeistungPos[]>([{ ...EMPTY_POS }])
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Genehmigung: Antwort-Erfassung
  const [antwortId, setAntwortId] = useState<string | null>(null)
  const [antwort, setAntwort] = useState(EMPTY_ANTWORT)
  // Verplanung: Quick-Assign
  const [assignId, setAssignId] = useState<string | null>(null)
  const [assign, setAssign] = useState(EMPTY_ASSIGN)
  // Abrechnung: Inline-Edit SOLL/IST/Kürzung
  const [invoiceEditId, setInvoiceEditId] = useState<string | null>(null)
  const [invoiceForm, setInvoiceForm] = useState(EMPTY_INVOICE_EDIT)
  // Absagen: Erfassung + Filter
  const [showAbsageForm, setShowAbsageForm] = useState(false)
  const [absageForm, setAbsageForm] = useState(EMPTY_ABSAGE)
  const [absageFilterDate, setAbsageFilterDate] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Aerzte-Stammdaten (aerzte_praxen) — zum schnellen Uebernehmen in
  // arzt_name/arzt_praxis, ohne die Freitextfelder zu ersetzen.
  const [aerzteStammdaten, setAerzteStammdaten] = useState<{ id: string; name: string; praxis_name: string | null }[]>([])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const [vRes, cRes, gRes, aRes, rRes, iRes, absRes, allAssignRes, lRes] = await Promise.all([
        supabase
          .from('verordnungen')
          .select('id, client_id, verordnung_type, leistungsart, verordnung_nummer, ausstellungsdatum, gueltig_von, gueltig_bis, arzt_name, arzt_praxis, diagnose, leistung_beschreibung, verordnung_document_url, genehmigung_status, genehmigung_datum, genehmigung_bis, genehmigung_aktenzeichen, kassengenehmigung_beantragt_am, kassengenehmigung_antwort_am, abrechnungs_status, genehmigte_stunden_gesamt, genehmigte_stunden_pro_woche, neuantrag_erforderlich, neuantrag_gestellt_am, notes, kostentraeger_typ, kostentraeger_name, kostentraeger_ik_nummer, genehmigte_leistungsart, genehmigung_abgleich_ok, genehmigung_abweichung, abtretungserklaerung_vorhanden, abtretungserklaerung_datum, abtretungserklaerung_document_url, ist_verordnung, kombinationsleistung, kombi_zusage_vorhanden, kombi_zusage_datum, kombi_zusage_aktenzeichen, monatliches_budget_cent, budget_verbraucht_cent, abrechnung_gesperrt, abrechnung_sperrgrund, client:clients(first_name, last_name)')
          .is('deleted_at', null) // Soft-Delete: gelöschte Verordnungen ausblenden (Revisionssicherheit)
          .order('genehmigung_bis', { ascending: true, nullsFirst: false }),
        supabase.from('clients').select('id, first_name, last_name').order('last_name'),
        supabase.from('caregivers').select('id, first_name, last_name').order('last_name'),
        supabase
          .from('assignments')
          .select('id, verordnung_id, caregiver_id, weekday, start_time, end_time, status, caregiver:caregivers(first_name, last_name)')
          .not('verordnung_id', 'is', null),
        supabase
          .from('service_records')
          .select('id, verordnung_id, date, duration_minutes, amount, status')
          .not('verordnung_id', 'is', null),
        supabase
          .from('invoices')
          .select('id, verordnung_id, invoice_number, total_amount, status, soll_betrag_cent, ist_betrag_cent, kuerzung_cent, kuerzung_grund, bezahlt, bezahlt_am, versand_elektronisch, versand_post')
          .not('verordnung_id', 'is', null),
        supabase
          .from('einsatz_absagen')
          .select('id, assignment_id, abgesagt_von, abgesagt_am, grund, ersatz_mitarbeiterin_id, ersatz_gefunden, assignment:assignments(id, weekday, client:clients(first_name,last_name), caregiver:caregivers(first_name,last_name))')
          .order('abgesagt_am', { ascending: false }),
        supabase
          .from('assignments')
          .select('id, weekday, client:clients(first_name,last_name), caregiver:caregivers(first_name,last_name)')
          .order('weekday'),
        supabase
          .from('verordnung_leistungen')
          .select('id, verordnung_id, leistungsart, haeufigkeit, menge, dauer_minuten, leistungskomplex, preis_cent, bemerkung')
          .order('created_at'),
      ])
      if (vRes.error) { setError(vRes.error.message); setLoading(false); return }
      setVerordnungen((vRes.data || []).map((v: any) => ({ ...v, clientName: fullName(v.client) })))
      setClients((cRes.data || []).map((c: any) => ({ id: c.id, name: fullName(c) })))
      setCaregivers((gRes.data || []).map((c: any) => ({ id: c.id, name: fullName(c) })))
      setAssignments((aRes.data || []).map((a: any) => ({ ...a, caregiverName: fullName(a.caregiver) })))
      setRecords((rRes.data || []) as RecordRow[])
      setInvoices((iRes.data || []) as InvoiceRow[])
      setAbsagen((absRes.data || []).map((a: any) => ({
        ...a,
        clientName: fullName(a.assignment?.client),
        caregiverName: fullName(a.assignment?.caregiver),
        weekday: a.assignment?.weekday ?? null,
      })))
      setAssignmentOptions((allAssignRes.data || []).map((a: any) => ({
        id: a.id,
        label: `${fullName(a.client)} — ${fullName(a.caregiver)} (${WEEKDAYS.find(w => w.n === a.weekday)?.short || a.weekday})`,
      })))
      setLeistungen((lRes.data || []) as LeistungRow[])
    } catch (err: any) {
      console.error('Verordnungen Ladefehler:', err)
      setError('Unerwarteter Fehler beim Laden.')
    } finally {
      setLoading(false)
    }

    // Aerzte-Stammdaten separat laden — nicht kritisch fuer die Verordnungsliste,
    // ein Fehler hier darf die Seite nicht blockieren.
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('aerzte_praxen')
        .select('id, anrede, titel, vorname, nachname, praxis_name')
        .eq('aktiv', true)
        .order('nachname')
      setAerzteStammdaten((data || []).map((a: any) => ({
        id: a.id,
        name: [a.anrede, a.titel, a.vorname, a.nachname].filter(Boolean).join(' '),
        praxis_name: a.praxis_name,
      })))
    } catch (err) {
      console.error('Aerzte-Stammdaten Ladefehler:', err)
    }
  }

  useEffect(() => { load() }, [])

  // ── Abgeleitete Daten ─────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return verordnungen.filter(v => {
      if (filter === 'expiring') {
        if (!expiryTone(v)) return false
      } else if (filter === 'neuantrag') {
        if (!v.neuantrag_erforderlich) return false
      } else if (filter !== 'all' && v.genehmigung_status !== filter) {
        return false
      }
      if (!q) return true
      return v.clientName.toLowerCase().includes(q)
        || (v.arzt_name || '').toLowerCase().includes(q)
        || (v.verordnung_nummer || '').toLowerCase().includes(q)
        || (v.genehmigung_aktenzeichen || '').toLowerCase().includes(q)
    })
  }, [verordnungen, filter, search])

  const grouped = useMemo(() => {
    const map = new Map<string, { clientName: string; items: Verordnung[] }>()
    for (const v of filtered) {
      if (!map.has(v.client_id)) map.set(v.client_id, { clientName: v.clientName, items: [] })
      map.get(v.client_id)!.items.push(v)
    }
    return Array.from(map.entries())
      .map(([client_id, g]) => ({ client_id, ...g }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName))
  }, [filtered])

  const expiringCount = useMemo(() => verordnungen.filter(v => expiryTone(v)).length, [verordnungen])
  const neuantragCount = useMemo(() => verordnungen.filter(v => v.neuantrag_erforderlich).length, [verordnungen])

  const ausstehend = useMemo(() => verordnungen.filter(v => v.genehmigung_status === 'ausstehend'), [verordnungen])
  const beantragt = useMemo(() => verordnungen.filter(v => v.genehmigung_status === 'beantragt'), [verordnungen])
  const entschieden = useMemo(
    () => verordnungen.filter(v => ['genehmigt', 'abgelehnt', 'abgelaufen', 'widerspruch'].includes(v.genehmigung_status)),
    [verordnungen]
  )
  const genehmigt = useMemo(() => verordnungen.filter(v => v.genehmigung_status === 'genehmigt'), [verordnungen])

  const assignmentsByVerordnung = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>()
    for (const a of assignments) {
      if (!map.has(a.verordnung_id)) map.set(a.verordnung_id, [])
      map.get(a.verordnung_id)!.push(a)
    }
    return map
  }, [assignments])

  const recordsByVerordnung = useMemo(() => {
    const map = new Map<string, RecordRow[]>()
    for (const r of records) {
      if (!map.has(r.verordnung_id)) map.set(r.verordnung_id, [])
      map.get(r.verordnung_id)!.push(r)
    }
    return map
  }, [records])

  const leistungenByVerordnung = useMemo(() => {
    const map = new Map<string, LeistungRow[]>()
    for (const l of leistungen) {
      if (!map.has(l.verordnung_id)) map.set(l.verordnung_id, [])
      map.get(l.verordnung_id)!.push(l)
    }
    return map
  }, [leistungen])

  const invoicesByVerordnung = useMemo(() => {
    const map = new Map<string, InvoiceRow[]>()
    for (const i of invoices) {
      if (!map.has(i.verordnung_id)) map.set(i.verordnung_id, [])
      map.get(i.verordnung_id)!.push(i)
    }
    return map
  }, [invoices])

  const unverplant = useMemo(
    () => genehmigt.filter(v => !(assignmentsByVerordnung.get(v.id) || []).some(a => a.status === 'active')),
    [genehmigt, assignmentsByVerordnung]
  )
  const offeneAbrechnung = useMemo(
    () => genehmigt.filter(v => v.abrechnungs_status !== 'vollstaendig_abgerechnet'),
    [genehmigt]
  )

  // ── Aktionen ──────────────────────────────────────────────────
  function openCreate() {
    setEditingId(null)
    setScanFile(null)
    setAbtretungFile(null)
    setPositionen([{ ...EMPTY_POS }])
    setForm({ ...EMPTY_FORM, ausstellungsdatum: heuteBerlin() })
    setShowForm(true)
  }

  function openEdit(v: Verordnung) {
    setEditingId(v.id)
    setScanFile(null)
    setAbtretungFile(null)
    const vorhandene = leistungenByVerordnung.get(v.id) || []
    setPositionen(vorhandene.length > 0
      ? vorhandene.map(l => ({
          leistungsart: l.leistungsart,
          haeufigkeit: l.haeufigkeit || '',
          menge: l.menge != null ? String(l.menge) : '1',
          dauer_minuten: l.dauer_minuten != null ? String(l.dauer_minuten) : '',
          leistungskomplex: l.leistungskomplex || '',
          bemerkung: l.bemerkung || '',
        }))
      : [{ ...EMPTY_POS }])
    setForm({
      client_id: v.client_id,
      verordnung_type: v.verordnung_type,
      leistungsart: v.leistungsart || '',
      verordnung_nummer: v.verordnung_nummer || '',
      ausstellungsdatum: v.ausstellungsdatum || '',
      gueltig_von: v.gueltig_von || '',
      gueltig_bis: v.gueltig_bis || '',
      arzt_name: v.arzt_name || '',
      arzt_praxis: v.arzt_praxis || '',
      diagnose: v.diagnose || '',
      leistung_beschreibung: v.leistung_beschreibung || '',
      genehmigte_stunden_gesamt: v.genehmigte_stunden_gesamt != null ? String(v.genehmigte_stunden_gesamt) : '',
      genehmigte_stunden_pro_woche: v.genehmigte_stunden_pro_woche != null ? String(v.genehmigte_stunden_pro_woche) : '',
      genehmigung_status: v.genehmigung_status,
      genehmigung_datum: v.genehmigung_datum || '',
      genehmigung_bis: v.genehmigung_bis || '',
      genehmigung_aktenzeichen: v.genehmigung_aktenzeichen || '',
      notes: v.notes || '',
      kostentraeger_typ: v.kostentraeger_typ || 'krankenkasse',
      kostentraeger_name: v.kostentraeger_name || '',
      kostentraeger_ik_nummer: v.kostentraeger_ik_nummer || '',
      abtretungserklaerung_vorhanden: !!v.abtretungserklaerung_vorhanden,
      abtretungserklaerung_datum: v.abtretungserklaerung_datum || '',
      kombi_zusage_vorhanden: !!v.kombi_zusage_vorhanden,
      kombi_zusage_datum: v.kombi_zusage_datum || '',
      kombi_zusage_aktenzeichen: v.kombi_zusage_aktenzeichen || '',
      monatliches_budget_euro: v.monatliches_budget_cent != null ? String(v.monatliches_budget_cent / 100) : '',
      budget_verbraucht_euro: v.budget_verbraucht_cent != null ? String(v.budget_verbraucht_cent / 100) : '',
    })
    setShowForm(true)
    setTab('erfassung')
  }

  async function save() {
    if (!form.client_id || !form.ausstellungsdatum) {
      setError('Klient und Ausstellungsdatum sind Pflichtfelder.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()

      // Scan hochladen (privater Bucket, Pfad wird gespeichert — Anzeige via Signed URL)
      let documentPath: string | null | undefined = undefined
      if (scanFile) {
        const path = `${form.client_id}/${Date.now()}-${sanitizeFileName(scanFile.name)}`
        const { error: upErr } = await supabase.storage
          .from('verordnungen')
          .upload(path, scanFile, { cacheControl: '3600', upsert: false })
        if (upErr) {
          setError(`Scan-Upload fehlgeschlagen: ${upErr.message}`)
          setSaving(false)
          return
        }
        documentPath = path
      }

      // Abtretungserklärung hochladen (gleicher privater Bucket)
      let abtretungPath: string | null | undefined = undefined
      if (abtretungFile) {
        const path = `${form.client_id}/abtretung/${Date.now()}-${sanitizeFileName(abtretungFile.name)}`
        const { error: upErr } = await supabase.storage
          .from('verordnungen')
          .upload(path, abtretungFile, { cacheControl: '3600', upsert: false })
        if (upErr) {
          setError(`Abtretungserklärung-Upload fehlgeschlagen: ${upErr.message}`)
          setSaving(false)
          return
        }
        abtretungPath = path
      }

      const payload: Record<string, unknown> = {
        client_id: form.client_id,
        verordnung_type: form.verordnung_type,
        leistungsart: form.leistungsart || null,
        verordnung_nummer: form.verordnung_nummer || null,
        ausstellungsdatum: form.ausstellungsdatum,
        gueltig_von: form.gueltig_von || null,
        gueltig_bis: form.gueltig_bis || null,
        arzt_name: form.arzt_name || null,
        arzt_praxis: form.arzt_praxis || null,
        diagnose: form.diagnose || null,
        leistung_beschreibung: form.leistung_beschreibung || null,
        genehmigte_stunden_gesamt: form.genehmigte_stunden_gesamt ? Number(form.genehmigte_stunden_gesamt) : null,
        genehmigte_stunden_pro_woche: form.genehmigte_stunden_pro_woche ? Number(form.genehmigte_stunden_pro_woche) : null,
        genehmigung_status: form.genehmigung_status,
        genehmigung_datum: form.genehmigung_datum || null,
        genehmigung_bis: form.genehmigung_bis || null,
        genehmigung_aktenzeichen: form.genehmigung_aktenzeichen || null,
        notes: form.notes || null,
        kostentraeger_typ: form.kostentraeger_typ || 'krankenkasse',
        kostentraeger_name: form.kostentraeger_name || null,
        kostentraeger_ik_nummer: form.kostentraeger_ik_nummer || null,
        abtretungserklaerung_vorhanden: form.abtretungserklaerung_vorhanden,
        abtretungserklaerung_datum: form.abtretungserklaerung_datum || null,
        // Eylems Korrektur: §37 = ärztliche Verordnung, sonst Bewilligung/Zusage
        ist_verordnung: istVerordnungPflicht(form.verordnung_type),
        kombinationsleistung: form.verordnung_type === 'kombinationsleistung_38',
        kombi_zusage_vorhanden: form.kombi_zusage_vorhanden,
        kombi_zusage_datum: form.kombi_zusage_datum || null,
        kombi_zusage_aktenzeichen: form.kombi_zusage_aktenzeichen || null,
        monatliches_budget_cent: euroToCent(form.monatliches_budget_euro),
        budget_verbraucht_cent: euroToCent(form.budget_verbraucht_euro) ?? 0,
      }
      if (documentPath !== undefined) payload.verordnung_document_url = documentPath
      if (abtretungPath !== undefined) payload.abtretungserklaerung_document_url = abtretungPath

      let verordnungId = editingId
      if (editingId) {
        const { error: e } = await supabase.from('verordnungen').update(payload).eq('id', editingId)
        if (e) { setError(`Speichern fehlgeschlagen: ${e.message}`); setSaving(false); return }
      } else {
        const { data: inserted, error: e } = await supabase
          .from('verordnungen')
          .insert(payload)
          .select('id')
          .single()
        if (e || !inserted) { setError(`Speichern fehlgeschlagen: ${e?.message || 'Kein Datensatz zurückgegeben'}`); setSaving(false); return }
        verordnungId = inserted.id
      }

      // Leistungspositionen synchronisieren (mehrere Leistungsarten pro Rezept):
      // alte Positionen ersetzen, nur ausgefüllte Zeilen speichern
      if (verordnungId) {
        const gueltige = positionen.filter(p => p.leistungsart)
        const { error: delErr } = await supabase
          .from('verordnung_leistungen')
          .delete()
          .eq('verordnung_id', verordnungId)
        if (delErr) { setError(`Leistungspositionen aktualisieren fehlgeschlagen: ${delErr.message}`); setSaving(false); return }
        if (gueltige.length > 0) {
          const { error: posErr } = await supabase.from('verordnung_leistungen').insert(
            gueltige.map(p => ({
              verordnung_id: verordnungId,
              leistungsart: p.leistungsart,
              haeufigkeit: p.haeufigkeit || null,
              menge: p.menge ? Number(p.menge) : 1,
              dauer_minuten: p.dauer_minuten ? Number(p.dauer_minuten) : null,
              leistungskomplex: p.leistungskomplex || null,
              bemerkung: p.bemerkung || null,
            }))
          )
          if (posErr) { setError(`Leistungspositionen speichern fehlgeschlagen: ${posErr.message}`); setSaving(false); return }
        }
      }

      setShowForm(false)
      setScanFile(null)
      setAbtretungFile(null)
      await load()
    } catch (err: any) {
      setError(`Unerwarteter Fehler: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  // Soft-Delete (Revisionssicherheit): Verordnung wird nie hart gelöscht,
  // nur als gelöscht markiert — deleted_at/deleted_by bleiben nachvollziehbar.
  async function remove(id: string) {
    if (!window.confirm('Verordnung wirklich löschen? (Sie wird nur ausgeblendet, nicht endgültig entfernt — Revisionssicherheit)')) return
    setBusyId(id)
    try {
      const supabase = createClient()
      const { data: userData } = await supabase.auth.getUser()
      const { error: e } = await supabase
        .from('verordnungen')
        .update({ deleted_at: new Date().toISOString(), deleted_by: userData?.user?.id || null })
        .eq('id', id)
      if (e) { setError(`Löschen fehlgeschlagen: ${e.message}`); return }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function markNeuantrag(v: Verordnung) {
    setBusyId(v.id)
    try {
      const supabase = createClient()
      const { error: e } = await supabase
        .from('verordnungen')
        .update({ neuantrag_erforderlich: !v.neuantrag_erforderlich })
        .eq('id', v.id)
      if (e) { setError(`Update fehlgeschlagen: ${e.message}`); return }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  // Scan im neuen Tab öffnen (Signed URL, Bucket ist privat)
  async function openScan(v: Verordnung) {
    if (!v.verordnung_document_url) return
    if (v.verordnung_document_url.startsWith('http')) {
      window.open(v.verordnung_document_url, '_blank')
      return
    }
    const supabase = createClient()
    const { data, error: e } = await supabase.storage
      .from('verordnungen')
      .createSignedUrl(v.verordnung_document_url, 3600)
    if (e || !data?.signedUrl) { setError('Scan konnte nicht geladen werden.'); return }
    window.open(data.signedUrl, '_blank')
  }

  // ── Tab 2: Kassengenehmigung ──────────────────────────────────
  async function beantragen(v: Verordnung) {
    setBusyId(v.id)
    try {
      const supabase = createClient()
      const { error: e } = await supabase
        .from('verordnungen')
        .update({
          genehmigung_status: 'beantragt',
          kassengenehmigung_beantragt_am: new Date().toISOString(),
        })
        .eq('id', v.id)
      if (e) { setError(`Antrag fehlgeschlagen: ${e.message}`); return }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  function openAntwort(v: Verordnung) {
    setAntwortId(v.id)
    setAntwort({
      aktenzeichen: v.genehmigung_aktenzeichen || '',
      datum: heuteBerlin(),
      bis: v.gueltig_bis || '',
      ergebnis: 'genehmigt',
      genehmigte_leistungsart: v.leistungsart || '',
    })
  }

  async function saveAntwort() {
    if (!antwortId) return
    if (antwort.ergebnis === 'genehmigt' && !antwort.aktenzeichen) {
      setError('Bei Genehmigung ist die Genehmigungsnummer (Aktenzeichen) Pflicht.')
      return
    }
    setBusyId(antwortId)
    try {
      const supabase = createClient()
      const original = verordnungen.find(x => x.id === antwortId)
      // Abgleich: beantragte vs. genehmigte Leistungsart — bei Abweichung Warnung im UI
      let abgleichOk: boolean | null = null
      let abweichung: string | null = null
      if (antwort.ergebnis === 'genehmigt' && original?.leistungsart && antwort.genehmigte_leistungsart) {
        abgleichOk = original.leistungsart === antwort.genehmigte_leistungsart
        if (!abgleichOk) {
          abweichung = `Beantragt: ${statusMeta(LEISTUNGSART_LABELS, original.leistungsart).label} — Genehmigt: ${statusMeta(LEISTUNGSART_LABELS, antwort.genehmigte_leistungsart).label}`
        }
      }
      const { error: e } = await supabase
        .from('verordnungen')
        .update({
          genehmigung_status: antwort.ergebnis,
          genehmigung_aktenzeichen: antwort.aktenzeichen || null,
          genehmigung_datum: antwort.datum || null,
          genehmigung_bis: antwort.ergebnis === 'genehmigt' ? (antwort.bis || null) : null,
          kassengenehmigung_antwort_am: new Date().toISOString(),
          genehmigte_leistungsart: antwort.genehmigte_leistungsart || null,
          genehmigung_abgleich_ok: abgleichOk,
          genehmigung_abweichung: abweichung,
        })
        .eq('id', antwortId)
      if (e) { setError(`Speichern fehlgeschlagen: ${e.message}`); return }
      setAntwortId(null)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  // ── Tab 3: Verplanung ─────────────────────────────────────────
  function openAssign(v: Verordnung) {
    setAssignId(v.id)
    setAssign(EMPTY_ASSIGN)
  }

  async function saveAssign(v: Verordnung) {
    if (!assign.caregiver_id) { setError('Bitte einen Engel auswählen.'); return }
    setBusyId(v.id)
    try {
      const res = await fetch('/api/einsatzplanung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: v.client_id,
          caregiver_id: assign.caregiver_id,
          weekday: Number(assign.weekday),
          start_time: assign.start_time,
          end_time: assign.end_time,
          service_type: v.leistungsart
            ? (LEISTUNGSART_LABELS[v.leistungsart]?.label || 'Alltagsbegleitung')
            : (v.leistung_beschreibung || 'Alltagsbegleitung'),
          is_recurring: true,
          valid_from: v.gueltig_von,
          valid_until: v.gueltig_bis || v.genehmigung_bis,
          status: 'active',
          verordnung_id: v.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.freigabe_probleme
          ? `${data.error}\n${data.freigabe_probleme.join('\n')}`
          : data.client_probleme
            ? `${data.error}\n${data.client_probleme.join('\n')}`
            : data.error
        setError(msg || 'Einsatz anlegen fehlgeschlagen')
        return
      }
      if (data.warnungen?.length) {
        setError(`Einsatz angelegt mit Warnungen: ${data.warnungen.join('; ')}`)
      }
      setAssignId(null)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function removeAssignment(a: AssignmentRow) {
    if (!window.confirm('Einsatz wirklich entfernen?')) return
    setBusyId(a.id)
    try {
      const supabase = createClient()
      const { error: e } = await supabase.from('assignments').delete().eq('id', a.id)
      if (e) { setError(`Entfernen fehlgeschlagen: ${e.message}`); return }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  // ── Tab 4: Abrechnung ─────────────────────────────────────────
  async function setAbrechnungsStatus(v: Verordnung, status: string) {
    setBusyId(v.id)
    try {
      const supabase = createClient()
      const { error: e } = await supabase
        .from('verordnungen')
        .update({ abrechnungs_status: status })
        .eq('id', v.id)
      if (e) { setError(`Update fehlgeschlagen: ${e.message}`); return }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  function openInvoiceEdit(inv: InvoiceRow) {
    setInvoiceEditId(inv.id)
    setInvoiceForm({
      soll: inv.soll_betrag_cent != null ? String(inv.soll_betrag_cent / 100) : '',
      ist: inv.ist_betrag_cent != null ? String(inv.ist_betrag_cent / 100) : '',
      kuerzung: inv.kuerzung_cent != null ? String(inv.kuerzung_cent / 100) : '',
      kuerzung_grund: inv.kuerzung_grund || '',
    })
  }

  async function saveInvoiceEdit() {
    if (!invoiceEditId) return
    setBusyId(invoiceEditId)
    try {
      const supabase = createClient()
      const { error: e } = await supabase
        .from('invoices')
        .update({
          soll_betrag_cent: euroToCent(invoiceForm.soll),
          ist_betrag_cent: euroToCent(invoiceForm.ist),
          kuerzung_cent: euroToCent(invoiceForm.kuerzung) ?? 0,
          kuerzung_grund: invoiceForm.kuerzung_grund || null,
        })
        .eq('id', invoiceEditId)
      if (e) { setError(`Speichern fehlgeschlagen: ${e.message}`); return }
      setInvoiceEditId(null)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function toggleBezahlt(inv: InvoiceRow) {
    setBusyId(inv.id)
    try {
      const supabase = createClient()
      const { error: e } = await supabase
        .from('invoices')
        .update({
          bezahlt: !inv.bezahlt,
          bezahlt_am: !inv.bezahlt ? heuteBerlin() : null,
        })
        .eq('id', inv.id)
      if (e) { setError(`Update fehlgeschlagen: ${e.message}`); return }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function toggleVersand(inv: InvoiceRow, field: 'versand_elektronisch' | 'versand_post') {
    setBusyId(inv.id)
    try {
      const supabase = createClient()
      const { error: e } = await supabase
        .from('invoices')
        .update({ [field]: !inv[field] })
        .eq('id', inv.id)
      if (e) { setError(`Update fehlgeschlagen: ${e.message}`); return }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  // ── Tab 5: Absagen ────────────────────────────────────────────
  async function saveAbsage() {
    if (!absageForm.assignment_id) { setError('Bitte einen Einsatz auswählen.'); return }
    setSaving(true)
    try {
      const supabase = createClient()
      const { error: e } = await supabase.from('einsatz_absagen').insert({
        assignment_id: absageForm.assignment_id,
        abgesagt_von: absageForm.abgesagt_von,
        grund: absageForm.grund || null,
        ersatz_mitarbeiterin_id: absageForm.ersatz_mitarbeiterin_id || null,
        ersatz_gefunden: !!absageForm.ersatz_mitarbeiterin_id,
      })
      if (e) { setError(`Speichern fehlgeschlagen: ${e.message}`); return }
      setShowAbsageForm(false)
      setAbsageForm(EMPTY_ABSAGE)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function setErsatz(a: AbsageRow, caregiverId: string) {
    setBusyId(a.id)
    try {
      const supabase = createClient()
      const { error: e } = await supabase
        .from('einsatz_absagen')
        .update({ ersatz_mitarbeiterin_id: caregiverId || null, ersatz_gefunden: !!caregiverId })
        .eq('id', a.id)
      if (e) { setError(`Update fehlgeschlagen: ${e.message}`); return }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function removeAbsage(id: string) {
    if (!window.confirm('Absage wirklich löschen?')) return
    setBusyId(id)
    try {
      const supabase = createClient()
      const { error: e } = await supabase.from('einsatz_absagen').delete().eq('id', id)
      if (e) { setError(`Löschen fehlgeschlagen: ${e.message}`); return }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  // ── Render ────────────────────────────────────────────────────
  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'erfassung', label: '1 · Erfassen', count: verordnungen.length },
    { key: 'genehmigung', label: '2 · Kassengenehmigung', count: ausstehend.length + beantragt.length },
    { key: 'verplanung', label: '3 · Verplanung', count: unverplant.length },
    { key: 'abrechnung', label: '4 · Abrechnung', count: offeneAbrechnung.length },
    { key: 'absagen', label: '5 · Absagen', count: absagen.filter(a => !a.ersatz_gefunden).length },
  ]

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Verordnungen</h1>
          <p className="admin-subtitle">
            {verordnungen.length} Verordnungen · {expiringCount} laufen bald ab · {neuantragCount} Neuanträge offen
          </p>
        </div>
        <button onClick={openCreate} style={primaryBtn}>+ Neue Verordnung</button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {expiringCount > 0 && (
        <Banner tone="warn">
          ⏳ {expiringCount} Genehmigung{expiringCount > 1 ? 'en laufen' : ' läuft'} innerhalb der nächsten 30 Tage ab — Neuantrag rechtzeitig stellen!
        </Banner>
      )}

      {/* Workflow-Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              ...tabBtn,
              ...(tab === t.key ? tabBtnActive : {}),
            }}
          >
            {t.label}
            <span style={{
              marginLeft: 8, fontSize: 12, fontWeight: 700,
              background: tab === t.key ? 'rgba(0,0,0,.25)' : 'var(--coal3)',
              borderRadius: 10, padding: '1px 8px',
            }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {loading ? <p>Laden…</p> : (
        <>
          {tab === 'erfassung' && (
            <ErfassungTab
              grouped={grouped}
              verordnungen={verordnungen}
              search={search} setSearch={setSearch}
              filter={filter} setFilter={setFilter}
              expiringCount={expiringCount} neuantragCount={neuantragCount}
              showForm={showForm} setShowForm={setShowForm}
              editingId={editingId} form={form} setForm={setForm}
              clients={clients} saving={saving} busyId={busyId}
              scanFile={scanFile} setScanFile={setScanFile} fileInputRef={fileInputRef}
              abtretungFile={abtretungFile} setAbtretungFile={setAbtretungFile}
              positionen={positionen} setPositionen={setPositionen}
              leistungenByVerordnung={leistungenByVerordnung}
              save={save} openEdit={openEdit} remove={remove}
              markNeuantrag={markNeuantrag} openScan={openScan}
              aerzteStammdaten={aerzteStammdaten}
            />
          )}

          {tab === 'genehmigung' && (
            <GenehmigungTab
              ausstehend={ausstehend} beantragt={beantragt} entschieden={entschieden}
              busyId={busyId} beantragen={beantragen}
              antwortId={antwortId} antwort={antwort} setAntwort={setAntwort}
              openAntwort={openAntwort} saveAntwort={saveAntwort} cancelAntwort={() => setAntwortId(null)}
              openScan={openScan}
            />
          )}

          {tab === 'verplanung' && (
            <VerplanungTab
              genehmigt={genehmigt} unverplant={unverplant}
              assignmentsByVerordnung={assignmentsByVerordnung}
              caregivers={caregivers}
              assignId={assignId} assign={assign} setAssign={setAssign}
              openAssign={openAssign} saveAssign={saveAssign} cancelAssign={() => setAssignId(null)}
              removeAssignment={removeAssignment} busyId={busyId}
            />
          )}

          {tab === 'abrechnung' && (
            <AbrechnungTab
              genehmigt={genehmigt}
              recordsByVerordnung={recordsByVerordnung}
              invoicesByVerordnung={invoicesByVerordnung}
              busyId={busyId} setAbrechnungsStatus={setAbrechnungsStatus}
              invoiceEditId={invoiceEditId} invoiceForm={invoiceForm} setInvoiceForm={setInvoiceForm}
              openInvoiceEdit={openInvoiceEdit} saveInvoiceEdit={saveInvoiceEdit}
              cancelInvoiceEdit={() => setInvoiceEditId(null)}
              toggleBezahlt={toggleBezahlt} toggleVersand={toggleVersand}
            />
          )}

          {tab === 'absagen' && (
            <AbsagenTab
              absagen={absagen}
              caregivers={caregivers}
              assignmentOptions={assignmentOptions}
              busyId={busyId} saving={saving}
              showForm={showAbsageForm} setShowForm={setShowAbsageForm}
              form={absageForm} setForm={setAbsageForm}
              filterDate={absageFilterDate} setFilterDate={setAbsageFilterDate}
              save={saveAbsage} setErsatz={setErsatz} remove={removeAbsage}
            />
          )}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Tab 1: Erfassen — Formular + gefilterte Liste (nach Klient gruppiert)
// ═══════════════════════════════════════════════════════════════
function ErfassungTab(props: {
  grouped: { client_id: string; clientName: string; items: Verordnung[] }[]
  verordnungen: Verordnung[]
  search: string; setSearch: (v: string) => void
  filter: string; setFilter: (v: string) => void
  expiringCount: number; neuantragCount: number
  showForm: boolean; setShowForm: (v: boolean) => void
  editingId: string | null
  form: FormState; setForm: (f: FormState) => void
  clients: PersonOption[]
  saving: boolean; busyId: string | null
  scanFile: File | null; setScanFile: (f: File | null) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  abtretungFile: File | null; setAbtretungFile: (f: File | null) => void
  positionen: LeistungPos[]; setPositionen: (p: LeistungPos[]) => void
  leistungenByVerordnung: Map<string, LeistungRow[]>
  save: () => void
  openEdit: (v: Verordnung) => void
  remove: (id: string) => void
  markNeuantrag: (v: Verordnung) => void
  openScan: (v: Verordnung) => void
  aerzteStammdaten: { id: string; name: string; praxis_name: string | null }[]
}) {
  const {
    grouped, verordnungen, search, setSearch, filter, setFilter, expiringCount, neuantragCount,
    showForm, setShowForm, editingId, form, setForm, clients, saving, busyId,
    scanFile, setScanFile, fileInputRef, abtretungFile, setAbtretungFile,
    positionen, setPositionen, leistungenByVerordnung,
    save, openEdit, remove, markNeuantrag, openScan, aerzteStammdaten,
  } = props

  function updatePos(idx: number, patch: Partial<LeistungPos>) {
    setPositionen(positionen.map((p, i) => i === idx ? { ...p, ...patch } : p))
  }

  // Eylems Korrektur: §37 = echte ärztliche Verordnung, sonst Bewilligung/Zusage
  const brauchtVerordnung = istVerordnungPflicht(form.verordnung_type)
  const bewilligungsHinweis = KEINE_VERORDNUNG_HINWEIS[form.verordnung_type]
  const zeigeKombi = form.verordnung_type === 'kombinationsleistung_38' || form.verordnung_type === 'haeusliche_pflege_36'
  const zeigeBudget = ['entlastung_45b', 'pflegebox_40', 'verhinderung_39'].includes(form.verordnung_type)

  // Typ wechseln + Monatsbudget automatisch setzen (§45b → 131 €, §40 → 40 €)
  function changeType(t: string) {
    const def = BUDGET_DEFAULT_CENT[t]
    setForm({
      ...form,
      verordnung_type: t,
      monatliches_budget_euro: def != null ? String(def / 100) : form.monatliches_budget_euro,
    })
  }

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Klient, Arzt, Verordnungs-Nr., Aktenzeichen…" />
      </div>

      <div className="admin-filters">
        <button className={`admin-filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          Alle
        </button>
        <button className={`admin-filter-btn ${filter === 'expiring' ? 'active' : ''}`} onClick={() => setFilter('expiring')}>
          Läuft ab ({expiringCount})
        </button>
        <button className={`admin-filter-btn ${filter === 'neuantrag' ? 'active' : ''}`} onClick={() => setFilter('neuantrag')}>
          Neuantrag ({neuantragCount})
        </button>
        {Object.keys(GENEHMIGUNG_STATUS).map(s => (
          <button key={s} className={`admin-filter-btn ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
            {GENEHMIGUNG_STATUS[s].label} ({verordnungen.filter(v => v.genehmigung_status === s).length})
          </button>
        ))}
      </div>

      {showForm && (
        <div style={formCard}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>
            {editingId ? 'Verordnung bearbeiten' : 'Neue Verordnung erfassen'}
          </h3>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--ink4)' }}>
            Gilt für Pflegedienst + Betreuung, NICHT Intensivpflege.
          </p>
          {bewilligungsHinweis && (
            <div style={{
              marginBottom: 14, padding: '10px 14px', borderRadius: 8,
              background: 'rgba(92,184,130,.12)', border: '1px solid rgba(92,184,130,.4)',
              fontSize: 13, color: 'var(--ink)',
            }}>
              <strong style={{ color: '#5CB882' }}>
                {brauchtVerordnung ? 'Hinweis: ' : 'Keine ärztliche Verordnung nötig: '}
              </strong>
              {bewilligungsHinweis}
            </div>
          )}
          <div style={formGrid}>
            <label style={fieldLabel}>
              Klient *
              <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} style={input} disabled={!!editingId}>
                <option value="">— wählen —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              Verordnungstyp
              <select value={form.verordnung_type} onChange={e => changeType(e.target.value)} style={input}>
                {Object.entries(VERORDNUNG_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              Haupt-Leistungsart
              <select value={form.leistungsart} onChange={e => setForm({ ...form, leistungsart: e.target.value })} style={input}>
                <option value="">— wählen —</option>
                {Object.entries(LEISTUNGSART_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              Kostenträger-Typ
              <select value={form.kostentraeger_typ} onChange={e => setForm({ ...form, kostentraeger_typ: e.target.value })} style={input}>
                {Object.entries(KOSTENTRAEGER_TYP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              Kostenträger-Name
              <input value={form.kostentraeger_name} onChange={e => setForm({ ...form, kostentraeger_name: e.target.value })} style={input} placeholder="z. B. AOK Hessen" />
            </label>
            <label style={fieldLabel}>
              Kostenträger IK-Nummer
              <input value={form.kostentraeger_ik_nummer} onChange={e => setForm({ ...form, kostentraeger_ik_nummer: e.target.value })} style={input} placeholder="Institutionskennzeichen" />
            </label>
            <label style={fieldLabel}>
              {brauchtVerordnung ? 'Verordnungs-Nr.' : 'Zusage/Bewilligungs-Nr.'}
              <input value={form.verordnung_nummer} onChange={e => setForm({ ...form, verordnung_nummer: e.target.value })} style={input} placeholder={brauchtVerordnung ? 'Nummer vom Arzt' : 'Aktenzeichen des Bescheids'} />
            </label>
            <label style={fieldLabel}>
              {brauchtVerordnung ? 'Ausstellungsdatum *' : 'Datum Bescheid/Antrag *'}
              <input type="date" value={form.ausstellungsdatum} onChange={e => setForm({ ...form, ausstellungsdatum: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              Gültig von
              <input type="date" value={form.gueltig_von} onChange={e => setForm({ ...form, gueltig_von: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              Gültig bis
              <input type="date" value={form.gueltig_bis} onChange={e => setForm({ ...form, gueltig_bis: e.target.value })} style={input} />
            </label>
            {brauchtVerordnung && (
              <>
                {aerzteStammdaten.length > 0 && (
                  <label style={{ ...fieldLabel, gridColumn: '1 / -1' }}>
                    Aus Ärzte-Stammdaten übernehmen
                    <select
                      value=""
                      onChange={e => {
                        const gewaehlt = aerzteStammdaten.find(a => a.id === e.target.value)
                        if (gewaehlt) setForm({ ...form, arzt_name: gewaehlt.name, arzt_praxis: gewaehlt.praxis_name || '' })
                      }}
                      style={input}
                    >
                      <option value="">-- Arzt wählen (füllt Felder unten) --</option>
                      {aerzteStammdaten.map(a => (
                        <option key={a.id} value={a.id}>{a.name}{a.praxis_name ? ` — ${a.praxis_name}` : ''}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label style={fieldLabel}>
                  Arzt
                  <input value={form.arzt_name} onChange={e => setForm({ ...form, arzt_name: e.target.value })} style={input} placeholder="Dr. …" />
                </label>
                <label style={fieldLabel}>
                  Praxis
                  <input value={form.arzt_praxis} onChange={e => setForm({ ...form, arzt_praxis: e.target.value })} style={input} />
                </label>
                <label style={fieldLabel}>
                  Diagnose
                  <input value={form.diagnose} onChange={e => setForm({ ...form, diagnose: e.target.value })} style={input} />
                </label>
              </>
            )}
            <label style={fieldLabel}>
              {brauchtVerordnung ? 'Verordnete Leistung' : 'Bewilligte Leistung'}
              <input value={form.leistung_beschreibung} onChange={e => setForm({ ...form, leistung_beschreibung: e.target.value })} style={input} />
            </label>
            {zeigeBudget && (
              <>
                <label style={fieldLabel}>
                  Monatsbudget (€)
                  <input type="number" min="0" step="0.01" value={form.monatliches_budget_euro} onChange={e => setForm({ ...form, monatliches_budget_euro: e.target.value })} style={input} placeholder={form.verordnung_type === 'entlastung_45b' ? '131' : form.verordnung_type === 'pflegebox_40' ? '40' : 'laut Bescheid'} />
                  <span style={{ fontSize: 11, color: 'var(--ink4)' }}>
                    {form.verordnung_type === 'entlastung_45b'
                      ? '§45b: 131 €/Monat automatisch'
                      : form.verordnung_type === 'pflegebox_40'
                        ? '§40: bis 40 €/Monat Pflegehilfsmittel'
                        : '§39: individuell laut Bescheid'}
                  </span>
                </label>
                <label style={fieldLabel}>
                  Davon verbraucht (€)
                  <input type="number" min="0" step="0.01" value={form.budget_verbraucht_euro} onChange={e => setForm({ ...form, budget_verbraucht_euro: e.target.value })} style={input} placeholder="0" />
                </label>
              </>
            )}
            <label style={fieldLabel}>
              Genehmigte Stunden (gesamt)
              <input type="number" min="0" step="0.5" value={form.genehmigte_stunden_gesamt} onChange={e => setForm({ ...form, genehmigte_stunden_gesamt: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              Stunden pro Woche
              <input type="number" min="0" step="0.5" value={form.genehmigte_stunden_pro_woche} onChange={e => setForm({ ...form, genehmigte_stunden_pro_woche: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              Genehmigungsstatus
              <select value={form.genehmigung_status} onChange={e => setForm({ ...form, genehmigung_status: e.target.value })} style={input}>
                {Object.entries(GENEHMIGUNG_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              Genehmigt am
              <input type="date" value={form.genehmigung_datum} onChange={e => setForm({ ...form, genehmigung_datum: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              Genehmigt bis
              <input type="date" value={form.genehmigung_bis} onChange={e => setForm({ ...form, genehmigung_bis: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              Aktenzeichen (Genehmigungs-Nr.)
              <input value={form.genehmigung_aktenzeichen} onChange={e => setForm({ ...form, genehmigung_aktenzeichen: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              {brauchtVerordnung ? 'Scan der Verordnung (PDF/Foto)' : 'Scan des Bescheids (PDF/Foto)'}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={e => setScanFile(e.target.files?.[0] || null)}
                style={{ ...input, padding: '6px 10px' }}
              />
              {scanFile && <span style={{ fontSize: 11, color: 'var(--ink4)' }}>{scanFile.name}</span>}
            </label>
            <label style={{ ...fieldLabel, gridColumn: '1 / -1' }}>
              Notizen
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...input, minHeight: 60, resize: 'vertical' }} />
            </label>
          </div>

          {/* ── Leistungspositionen: mehrere Leistungsarten pro Rezept ──
              z. B. Große Körperpflege 2x/Woche + Medikamentengabe täglich */}
          <div style={{ marginTop: 18, padding: 14, background: 'var(--coal)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>Leistungspositionen</h4>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--ink4)' }}>
              Eine Verordnung kann mehrere Leistungen enthalten (z. B. Große Körperpflege 2x/Woche + Medikamentengabe täglich).
              LK-Nummer = Leistungskomplex nach §89 SGB XI (LK1–LK35).
            </p>
            {positionen.map((p, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10, paddingBottom: 10, borderBottom: idx < positionen.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <label style={{ ...fieldLabel, minWidth: 200 }}>
                  Leistungsart {idx === 0 ? '' : ''}
                  <select value={p.leistungsart} onChange={e => updatePos(idx, { leistungsart: e.target.value })} style={input}>
                    <option value="">— wählen —</option>
                    {Object.entries(LEISTUNGSART_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </label>
                <label style={{ ...fieldLabel, minWidth: 150 }}>
                  Häufigkeit
                  <select value={p.haeufigkeit} onChange={e => updatePos(idx, { haeufigkeit: e.target.value })} style={input}>
                    <option value="">— wählen —</option>
                    {Object.entries(HAEUFIGKEIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </label>
                <label style={{ ...fieldLabel, width: 80 }}>
                  Menge
                  <input type="number" min="1" value={p.menge} onChange={e => updatePos(idx, { menge: e.target.value })} style={input} />
                </label>
                <label style={{ ...fieldLabel, width: 110 }}>
                  Dauer (Min.)
                  <input type="number" min="0" step="5" value={p.dauer_minuten} onChange={e => updatePos(idx, { dauer_minuten: e.target.value })} style={input} placeholder="pro Einsatz" />
                </label>
                <label style={{ ...fieldLabel, width: 110 }}>
                  LK-Nr. (§89)
                  <input value={p.leistungskomplex} onChange={e => updatePos(idx, { leistungskomplex: e.target.value })} style={input} placeholder="z. B. LK4" />
                </label>
                <label style={{ ...fieldLabel, flex: 1, minWidth: 140 }}>
                  Bemerkung
                  <input value={p.bemerkung} onChange={e => updatePos(idx, { bemerkung: e.target.value })} style={input} />
                </label>
                <button
                  onClick={() => setPositionen(positionen.length > 1 ? positionen.filter((_, i) => i !== idx) : [{ ...EMPTY_POS }])}
                  style={{ ...miniBtn, color: '#D04B3B', marginBottom: 4 }}
                  title="Position entfernen"
                >
                  ✕
                </button>
              </div>
            ))}
            <button onClick={() => setPositionen([...positionen, { ...EMPTY_POS }])} style={secondaryBtnSmall}>
              + Weitere Leistungsposition
            </button>
          </div>

          {/* ── §38/§36: Kombi-Zusage der Pflegekasse (Sachleistung + Pflegegeld) ── */}
          {zeigeKombi && (
            <div style={{ marginTop: 14, padding: 14, background: 'var(--coal)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>Kombinationsleistung (§38)</h4>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--ink4)' }}>
                Bestätigung der Pflegekasse, dass die Kombi-Leistung (Sachleistung + Pflegegeld) abgerechnet werden darf.
              </p>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.kombi_zusage_vorhanden}
                    onChange={e => setForm({ ...form, kombi_zusage_vorhanden: e.target.checked })}
                  />
                  Kombi-Zusage vorhanden
                </label>
                {form.kombi_zusage_vorhanden && (
                  <>
                    <label style={fieldLabel}>
                      Datum der Zusage
                      <input type="date" value={form.kombi_zusage_datum} onChange={e => setForm({ ...form, kombi_zusage_datum: e.target.value })} style={input} />
                    </label>
                    <label style={fieldLabel}>
                      Aktenzeichen der Zusage
                      <input value={form.kombi_zusage_aktenzeichen} onChange={e => setForm({ ...form, kombi_zusage_aktenzeichen: e.target.value })} style={input} placeholder="z. B. KZ-4711/2026" />
                    </label>
                  </>
                )}
              </div>
              {!form.kombi_zusage_vorhanden && (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: '#E8A000' }}>
                  Ohne Kombi-Zusage der Pflegekasse darf die Kombinationsleistung nicht abgerechnet werden.
                </p>
              )}
            </div>
          )}

          {/* ── Abtretungserklärung: Klient tritt Erstattungsanspruch an uns ab ── */}
          <div style={{ marginTop: 14, padding: 14, background: 'var(--coal)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 14 }}>Abtretungserklärung</h4>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.abtretungserklaerung_vorhanden}
                  onChange={e => setForm({ ...form, abtretungserklaerung_vorhanden: e.target.checked })}
                />
                Abtretungserklärung liegt vor
              </label>
              <label style={fieldLabel}>
                Datum der Abtretung
                <input
                  type="date"
                  value={form.abtretungserklaerung_datum}
                  onChange={e => setForm({ ...form, abtretungserklaerung_datum: e.target.value })}
                  style={input}
                />
              </label>
              <label style={fieldLabel}>
                Scan der Abtretungserklärung (PDF/Foto)
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={e => setAbtretungFile(e.target.files?.[0] || null)}
                  style={{ ...input, padding: '6px 10px' }}
                />
                {abtretungFile && <span style={{ fontSize: 11, color: 'var(--ink4)' }}>{abtretungFile.name}</span>}
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={save} disabled={saving} style={primaryBtn}>
              {saving ? 'Speichern…' : (editingId ? 'Änderungen speichern' : 'Verordnung anlegen')}
            </button>
            <button onClick={() => setShowForm(false)} style={secondaryBtn}>Abbrechen</button>
          </div>
        </div>
      )}

      {grouped.length === 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <tbody>
              <EmptyRow colSpan={10}>
                {search || filter !== 'all' ? 'Keine Treffer' : 'Noch keine Verordnungen erfasst'}
              </EmptyRow>
            </tbody>
          </table>
        </div>
      ) : grouped.map(group => (
        <div key={group.client_id} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, margin: '0 0 8px', color: 'var(--ink)' }}>
            {group.clientName}
            <span style={{ fontWeight: 400, color: 'var(--ink4)', fontSize: 13 }}> · {group.items.length} Verordnung{group.items.length > 1 ? 'en' : ''}</span>
          </h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Typ</th><th>Leistungsart</th><th>Kostenträger</th><th>Nr.</th><th>Gültigkeit</th>
                  <th>Status</th><th>Genehmigt bis</th><th>Aktenzeichen</th><th>Scan</th><th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map(v => {
                  const tm = statusMeta(VERORDNUNG_TYPE, v.verordnung_type)
                  const gm = statusMeta(GENEHMIGUNG_STATUS, v.genehmigung_status)
                  const vLeistungen = leistungenByVerordnung.get(v.id) || []
                  const tone = expiryTone(v)
                  const days = daysUntil(v.genehmigung_bis)
                  const ampel = gueltigkeitsAmpel(v.gueltig_bis)
                  const rowBg = tone === 'red'
                    ? 'rgba(208,75,59,.12)'
                    : tone === 'yellow'
                      ? 'rgba(232,160,0,.10)'
                      : undefined
                  return (
                    <tr key={v.id} style={rowBg ? { background: rowBg } : undefined}>
                      <td>
                        <StatusBadge label={tm.label} color={tm.color} />
                        <div style={{ fontSize: 11, marginTop: 2, color: 'var(--ink4)' }}>
                          {v.ist_verordnung === false ? 'Bewilligung/Zusage' : 'Ärztl. Verordnung'}
                        </div>
                        {v.monatliches_budget_cent != null && (
                          <div style={{
                            fontSize: 11, marginTop: 2, fontWeight: 600,
                            color: (v.budget_verbraucht_cent ?? 0) > v.monatliches_budget_cent ? '#D04B3B' : '#5CB882',
                          }}>
                            Budget {centToEuro(v.budget_verbraucht_cent ?? 0)} / {centToEuro(v.monatliches_budget_cent)}
                          </div>
                        )}
                        {v.kombinationsleistung && !v.kombi_zusage_vorhanden && (
                          <div style={{ fontSize: 11, marginTop: 2, color: '#E8A000' }}>Kombi-Zusage fehlt</div>
                        )}
                        {v.abrechnung_gesperrt && (
                          <div style={{ fontSize: 11, marginTop: 2, fontWeight: 700, color: '#D04B3B' }} title={v.abrechnung_sperrgrund || ''}>
                            🔒 Abrechnung gesperrt{v.abrechnung_sperrgrund ? `: ${v.abrechnung_sperrgrund}` : ''}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {vLeistungen.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {vLeistungen.map(l => (
                              <span key={l.id} style={{ whiteSpace: 'nowrap' }}>
                                {statusMeta(LEISTUNGSART_LABELS, l.leistungsart).label}
                                {l.haeufigkeit && <span style={{ color: 'var(--ink4)' }}> · {statusMeta(HAEUFIGKEIT_LABELS, l.haeufigkeit).label}</span>}
                                {l.leistungskomplex && <span style={{ color: 'var(--ink4)' }}> · {l.leistungskomplex}</span>}
                              </span>
                            ))}
                          </div>
                        ) : (v.leistungsart ? statusMeta(LEISTUNGSART_LABELS, v.leistungsart).label : '—')}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        <StatusBadge label={statusMeta(KOSTENTRAEGER_TYP, v.kostentraeger_typ).label} color={statusMeta(KOSTENTRAEGER_TYP, v.kostentraeger_typ).color} />
                        {v.kostentraeger_name && <span style={{ marginLeft: 6, color: 'var(--ink4)' }}>{v.kostentraeger_name}</span>}
                      </td>
                      <td style={{ fontSize: 13 }}>{v.verordnung_nummer || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                        {v.gueltig_von || v.gueltig_bis
                          ? <>
                              {formatDate(v.gueltig_von)} – {formatDate(v.gueltig_bis)}
                              {ampel && <span style={{ marginLeft: 6 }}><AmpelDot ampel={ampel} /></span>}
                            </>
                          : formatDate(v.ausstellungsdatum)}
                      </td>
                      <td><StatusBadge label={gm.label} color={gm.color} /></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {formatDate(v.genehmigung_bis)}
                        {tone && days !== null && (
                          <span style={{
                            marginLeft: 6, fontSize: 12, fontWeight: 700,
                            color: tone === 'red' ? '#D04B3B' : '#E8A000',
                          }}>
                            {days < 0 ? 'abgelaufen!' : `noch ${days} Tg`}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>{v.genehmigung_aktenzeichen || '—'}</td>
                      <td>
                        {v.verordnung_document_url
                          ? <button onClick={() => openScan(v)} style={miniBtn}>📄 Anzeigen</button>
                          : <span style={{ color: 'var(--ink4)', fontSize: 12 }}>fehlt</span>}
                        <div style={{ fontSize: 11, marginTop: 2 }}>
                          {v.abtretungserklaerung_vorhanden
                            ? <span style={{ color: '#5CB882' }}>Abtretung ✓{v.abtretungserklaerung_datum ? ` (${formatDate(v.abtretungserklaerung_datum)})` : ''}</span>
                            : <span style={{ color: '#E8A000' }}>Abtretung fehlt</span>}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button onClick={() => openEdit(v)} style={miniBtn}>Bearbeiten</button>
                        <button
                          onClick={() => markNeuantrag(v)}
                          disabled={busyId === v.id}
                          style={{ ...miniBtn, color: v.neuantrag_erforderlich ? '#5CB882' : '#E8A000' }}
                          title={v.neuantrag_erforderlich ? 'Markierung aufheben' : 'Als "Neuantrag erforderlich" markieren'}
                        >
                          {v.neuantrag_erforderlich ? 'Neuantrag ✓' : 'Neuantrag nötig'}
                        </button>
                        <button onClick={() => remove(v.id)} disabled={busyId === v.id} style={{ ...miniBtn, color: '#D04B3B' }}>
                          Löschen
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// Tab 2: Kassengenehmigung — Antrag stellen + Antwort erfassen
// ═══════════════════════════════════════════════════════════════
function GenehmigungTab(props: {
  ausstehend: Verordnung[]
  beantragt: Verordnung[]
  entschieden: Verordnung[]
  busyId: string | null
  beantragen: (v: Verordnung) => void
  antwortId: string | null
  antwort: typeof EMPTY_ANTWORT
  setAntwort: (a: typeof EMPTY_ANTWORT) => void
  openAntwort: (v: Verordnung) => void
  saveAntwort: () => void
  cancelAntwort: () => void
  openScan: (v: Verordnung) => void
}) {
  const {
    ausstehend, beantragt, entschieden, busyId, beantragen,
    antwortId, antwort, setAntwort, openAntwort, saveAntwort, cancelAntwort, openScan,
  } = props

  return (
    <>
      {ausstehend.length === 0 && beantragt.length === 0 && (
        <Banner tone="info">✅ Keine Verordnungen warten auf Genehmigung.</Banner>
      )}

      {entschieden.some(v => v.genehmigung_abgleich_ok === false) && (
        <Banner tone="danger">
          ⚠ Abweichung bei {entschieden.filter(v => v.genehmigung_abgleich_ok === false).length} Verordnung(en): Genehmigte Leistungsart weicht von der beantragten ab — bitte prüfen!
        </Banner>
      )}

      {/* Schritt A: Noch nicht beantragt */}
      <h2 style={sectionH2}>Noch nicht beantragt ({ausstehend.length})</h2>
      <div className="admin-table-wrap" style={{ marginBottom: 28 }}>
        <table className="admin-table">
          <thead>
            <tr><th>Klient</th><th>Typ</th><th>Leistungsart</th><th>Gültigkeit</th><th>Scan</th><th>Aktion</th></tr>
          </thead>
          <tbody>
            {ausstehend.length === 0
              ? <EmptyRow colSpan={6}>Nichts offen — alle Verordnungen sind beantragt oder entschieden.</EmptyRow>
              : ausstehend.map(v => {
                const tm = statusMeta(VERORDNUNG_TYPE, v.verordnung_type)
                return (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.clientName}</td>
                    <td><StatusBadge label={tm.label} color={tm.color} /></td>
                    <td style={{ fontSize: 13 }}>{v.leistungsart ? statusMeta(LEISTUNGSART_LABELS, v.leistungsart).label : '—'}</td>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(v.gueltig_von)} – {formatDate(v.gueltig_bis)}</td>
                    <td>
                      {v.verordnung_document_url
                        ? <button onClick={() => openScan(v)} style={miniBtn}>📄</button>
                        : <span style={{ color: '#E8A000', fontSize: 12 }}>⚠ fehlt</span>}
                    </td>
                    <td>
                      <button onClick={() => beantragen(v)} disabled={busyId === v.id} style={primaryBtnSmall}>
                        {busyId === v.id ? 'Wird beantragt…' : 'Genehmigung beantragen'}
                      </button>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {/* Schritt B: Beantragt — Antwort der Kasse erfassen */}
      <h2 style={sectionH2}>Bei der Kasse beantragt ({beantragt.length})</h2>
      <div className="admin-table-wrap" style={{ marginBottom: 28 }}>
        <table className="admin-table">
          <thead>
            <tr><th>Klient</th><th>Typ</th><th>Beantragt am</th><th>Wartezeit</th><th>Aktion</th></tr>
          </thead>
          <tbody>
            {beantragt.length === 0
              ? <EmptyRow colSpan={5}>Keine offenen Anträge bei der Kasse.</EmptyRow>
              : beantragt.map(v => {
                const tm = statusMeta(VERORDNUNG_TYPE, v.verordnung_type)
                const waitDays = v.kassengenehmigung_beantragt_am
                  ? Math.max(0, -(daysUntil(v.kassengenehmigung_beantragt_am) ?? 0))
                  : null
                return (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.clientName}</td>
                    <td><StatusBadge label={tm.label} color={tm.color} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(v.kassengenehmigung_beantragt_am)}</td>
                    <td>
                      {waitDays !== null && (
                        <span style={{ color: waitDays > 21 ? '#D04B3B' : waitDays > 14 ? '#E8A000' : 'var(--ink4)', fontWeight: 600, fontSize: 13 }}>
                          {waitDays} Tag{waitDays !== 1 ? 'e' : ''}{waitDays > 21 ? ' — nachhaken!' : ''}
                        </span>
                      )}
                    </td>
                    <td>
                      <button onClick={() => openAntwort(v)} style={primaryBtnSmall}>Antwort erfassen</button>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {/* Inline-Form: Antwort der Kasse */}
      {antwortId && (
        <div style={formCard}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>Antwort der Pflegekasse erfassen</h3>
          <div style={formGrid}>
            <label style={fieldLabel}>
              Ergebnis
              <select value={antwort.ergebnis} onChange={e => setAntwort({ ...antwort, ergebnis: e.target.value })} style={input}>
                <option value="genehmigt">Genehmigt</option>
                <option value="abgelehnt">Abgelehnt</option>
                <option value="widerspruch">Widerspruch eingelegt</option>
              </select>
            </label>
            <label style={fieldLabel}>
              Genehmigungsnummer (Aktenzeichen) {antwort.ergebnis === 'genehmigt' ? '*' : ''}
              <input value={antwort.aktenzeichen} onChange={e => setAntwort({ ...antwort, aktenzeichen: e.target.value })} style={input} />
            </label>
            <label style={fieldLabel}>
              Entschieden am
              <input type="date" value={antwort.datum} onChange={e => setAntwort({ ...antwort, datum: e.target.value })} style={input} />
            </label>
            {antwort.ergebnis === 'genehmigt' && (
              <label style={fieldLabel}>
                Genehmigt bis
                <input type="date" value={antwort.bis} onChange={e => setAntwort({ ...antwort, bis: e.target.value })} style={input} />
              </label>
            )}
            {antwort.ergebnis === 'genehmigt' && (
              <label style={fieldLabel}>
                Genehmigte Leistungsart
                <select value={antwort.genehmigte_leistungsart} onChange={e => setAntwort({ ...antwort, genehmigte_leistungsart: e.target.value })} style={input}>
                  <option value="">— wählen —</option>
                  {Object.entries(LEISTUNGSART_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={saveAntwort} style={primaryBtn}>Antwort speichern</button>
            <button onClick={cancelAntwort} style={secondaryBtn}>Abbrechen</button>
          </div>
        </div>
      )}

      {/* Übersicht: Entschieden */}
      <h2 style={sectionH2}>Entschieden ({entschieden.length})</h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Klient</th><th>Status</th><th>Aktenzeichen</th><th>Entschieden</th><th>Genehmigt bis</th><th>Dauer Antrag→Antwort</th><th>Abgleich</th><th>Abrechnung</th></tr>
          </thead>
          <tbody>
            {entschieden.length === 0
              ? <EmptyRow colSpan={8}>Noch keine Entscheidungen der Kasse.</EmptyRow>
              : entschieden.map(v => {
                const gm = statusMeta(GENEHMIGUNG_STATUS, v.genehmigung_status)
                const dur = v.kassengenehmigung_beantragt_am && v.kassengenehmigung_antwort_am
                  ? Math.max(0, Math.round((new Date(v.kassengenehmigung_antwort_am).getTime() - new Date(v.kassengenehmigung_beantragt_am).getTime()) / 86400000))
                  : null
                return (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.clientName}</td>
                    <td><StatusBadge label={gm.label} color={gm.color} /></td>
                    <td style={{ fontSize: 13 }}>{v.genehmigung_aktenzeichen || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(v.kassengenehmigung_antwort_am || v.genehmigung_datum)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(v.genehmigung_bis)}</td>
                    <td style={{ fontSize: 13 }}>{dur !== null ? `${dur} Tage` : '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {v.genehmigung_abgleich_ok === false
                        ? <span style={{ color: '#D04B3B', fontWeight: 700 }} title={v.genehmigung_abweichung || ''}>⚠ Abweichung</span>
                        : v.genehmigung_abgleich_ok === true
                          ? <span style={{ color: '#5CB882', fontWeight: 700 }}>✓ Passt</span>
                          : <span style={{ color: 'var(--ink4)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {v.abrechnung_gesperrt
                        ? <span style={{ color: '#D04B3B', fontWeight: 700 }} title={v.abrechnung_sperrgrund || ''}>🔒 Gesperrt</span>
                        : <span style={{ color: '#5CB882', fontWeight: 700 }}>✓ Freigegeben</span>}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
        {entschieden.some(v => v.genehmigung_abgleich_ok === false) && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink4)' }}>
            {entschieden.filter(v => v.genehmigung_abgleich_ok === false).map(v => (
              <p key={v.id} style={{ margin: '2px 0' }}>
                <strong style={{ color: 'var(--ink)' }}>{v.clientName}:</strong> {v.genehmigung_abweichung}
              </p>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// Tab 3: Verplanung — genehmigte Verordnungen mit Engeln verplanen
// ═══════════════════════════════════════════════════════════════
function VerplanungTab(props: {
  genehmigt: Verordnung[]
  unverplant: Verordnung[]
  assignmentsByVerordnung: Map<string, AssignmentRow[]>
  caregivers: PersonOption[]
  assignId: string | null
  assign: typeof EMPTY_ASSIGN
  setAssign: (a: typeof EMPTY_ASSIGN) => void
  openAssign: (v: Verordnung) => void
  saveAssign: (v: Verordnung) => void
  cancelAssign: () => void
  removeAssignment: (a: AssignmentRow) => void
  busyId: string | null
}) {
  const {
    genehmigt, unverplant, assignmentsByVerordnung, caregivers,
    assignId, assign, setAssign, openAssign, saveAssign, cancelAssign, removeAssignment, busyId,
  } = props

  const weekdayLabel = (n: number) => WEEKDAYS.find(w => w.n === n)?.long || `Tag ${n}`

  return (
    <>
      {unverplant.length > 0 ? (
        <Banner tone="warn">
          📅 {unverplant.length} genehmigte Verordnung{unverplant.length > 1 ? 'en sind' : ' ist'} noch nicht verplant — Einsätze anlegen, damit die genehmigten Stunden nicht verfallen!
        </Banner>
      ) : genehmigt.length > 0 ? (
        <Banner tone="info">✅ Alle genehmigten Verordnungen sind verplant.</Banner>
      ) : (
        <Banner tone="info">Noch keine genehmigten Verordnungen — zuerst die Kassengenehmigung abschließen (Schritt 2).</Banner>
      )}

      {genehmigt.map(v => {
        const list = assignmentsByVerordnung.get(v.id) || []
        const active = list.filter(a => a.status === 'active')
        const tm = statusMeta(VERORDNUNG_TYPE, v.verordnung_type)
        return (
          <div key={v.id} style={{ ...formCard, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15 }}>
                  {v.clientName}
                  <span style={{ marginLeft: 10 }}><StatusBadge label={tm.label} color={tm.color} /></span>
                  {active.length === 0 && (
                    <span style={{ marginLeft: 10, color: '#E8A000', fontSize: 13, fontWeight: 700 }}>⚠ nicht verplant</span>
                  )}
                </h3>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink4)' }}>
                  {v.leistungsart ? statusMeta(LEISTUNGSART_LABELS, v.leistungsart).label : (v.leistung_beschreibung || 'Leistung n. a.')}
                  {' · '}Aktenzeichen {v.genehmigung_aktenzeichen || '—'}
                  {' · '}genehmigt bis {formatDate(v.genehmigung_bis)}
                  {v.genehmigte_stunden_pro_woche ? ` · ${v.genehmigte_stunden_pro_woche} h/Woche` : ''}
                  {v.genehmigte_stunden_gesamt ? ` · ${v.genehmigte_stunden_gesamt} h gesamt` : ''}
                </p>
              </div>
              <button onClick={() => openAssign(v)} style={primaryBtnSmall}>+ Einsatz anlegen</button>
            </div>

            {list.length > 0 && (
              <table className="admin-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr><th>Engel</th><th>Wochentag</th><th>Zeit</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {list.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.caregiverName}</td>
                      <td>{weekdayLabel(a.weekday)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatTime(a.start_time)} – {formatTime(a.end_time)}</td>
                      <td>
                        <StatusBadge
                          label={a.status === 'active' ? 'Aktiv' : a.status === 'paused' ? 'Pausiert' : 'Storniert'}
                          color={a.status === 'active' ? '#5CB882' : a.status === 'paused' ? '#E8A000' : '#999'}
                        />
                      </td>
                      <td>
                        <button onClick={() => removeAssignment(a)} disabled={busyId === a.id} style={{ ...miniBtn, color: '#D04B3B' }}>
                          Entfernen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {assignId === v.id && (
              <div style={{ marginTop: 12, padding: 12, background: 'var(--coal)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <label style={fieldLabel}>
                    Engel *
                    <select value={assign.caregiver_id} onChange={e => setAssign({ ...assign, caregiver_id: e.target.value })} style={input}>
                      <option value="">— wählen —</option>
                      {caregivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  <label style={fieldLabel}>
                    Wochentag
                    <select value={assign.weekday} onChange={e => setAssign({ ...assign, weekday: e.target.value })} style={input}>
                      {WEEKDAYS.map(w => <option key={w.n} value={w.n}>{w.long}</option>)}
                    </select>
                  </label>
                  <label style={fieldLabel}>
                    Von
                    <input type="time" value={assign.start_time} onChange={e => setAssign({ ...assign, start_time: e.target.value })} style={input} />
                  </label>
                  <label style={fieldLabel}>
                    Bis
                    <input type="time" value={assign.end_time} onChange={e => setAssign({ ...assign, end_time: e.target.value })} style={input} />
                  </label>
                  <button onClick={() => saveAssign(v)} disabled={busyId === v.id} style={primaryBtnSmall}>
                    {busyId === v.id ? 'Anlegen…' : 'Einsatz anlegen'}
                  </button>
                  <button onClick={cancelAssign} style={secondaryBtnSmall}>Abbrechen</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// Tab 4: Leistungsnachweis & Abrechnung — Verbrauch je Verordnung
// ═══════════════════════════════════════════════════════════════
function AbrechnungTab(props: {
  genehmigt: Verordnung[]
  recordsByVerordnung: Map<string, RecordRow[]>
  invoicesByVerordnung: Map<string, InvoiceRow[]>
  busyId: string | null
  setAbrechnungsStatus: (v: Verordnung, status: string) => void
  invoiceEditId: string | null
  invoiceForm: typeof EMPTY_INVOICE_EDIT
  setInvoiceForm: (f: typeof EMPTY_INVOICE_EDIT) => void
  openInvoiceEdit: (inv: InvoiceRow) => void
  saveInvoiceEdit: () => void
  cancelInvoiceEdit: () => void
  toggleBezahlt: (inv: InvoiceRow) => void
  toggleVersand: (inv: InvoiceRow, field: 'versand_elektronisch' | 'versand_post') => void
}) {
  const {
    genehmigt, recordsByVerordnung, invoicesByVerordnung, busyId, setAbrechnungsStatus,
    invoiceEditId, invoiceForm, setInvoiceForm, openInvoiceEdit, saveInvoiceEdit, cancelInvoiceEdit,
    toggleBezahlt, toggleVersand,
  } = props

  if (genehmigt.length === 0) {
    return <Banner tone="info">Noch keine genehmigten Verordnungen — Abrechnung ist erst nach der Kassengenehmigung möglich.</Banner>
  }

  return (
    <>
      {genehmigt.map(v => {
        const recs = recordsByVerordnung.get(v.id) || []
        const invs = invoicesByVerordnung.get(v.id) || []
        const usedMinutes = recs.reduce((s, r) => s + (r.duration_minutes || 0), 0)
        const usedHours = usedMinutes / 60
        const usedAmount = recs.reduce((s, r) => s + (Number(r.amount) || 0), 0)
        const approved = approvedHours(v)
        const pct = approved && approved > 0 ? Math.round((usedHours / approved) * 100) : null
        const barColor = pct === null ? '#999' : pct > 95 ? '#D04B3B' : pct >= 70 ? '#E8A000' : '#5CB882'
        const am = statusMeta(ABRECHNUNGS_STATUS, v.abrechnungs_status)
        return (
          <div key={v.id} style={{ ...formCard, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ minWidth: 260 }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>
                  {v.clientName}
                  <span style={{ marginLeft: 10 }}><StatusBadge label={am.label} color={am.color} /></span>
                </h3>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink4)' }}>
                  Genehmigungs-Nr. <strong style={{ color: 'var(--ink)' }}>{v.genehmigung_aktenzeichen || '—'}</strong>
                  {' · '}genehmigt bis {formatDate(v.genehmigung_bis)}
                  {' · '}{recs.length} Leistungsnachweis{recs.length !== 1 ? 'e' : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={v.abrechnungs_status}
                  onChange={e => setAbrechnungsStatus(v, e.target.value)}
                  disabled={busyId === v.id}
                  style={input}
                >
                  {Object.entries(ABRECHNUNGS_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                </select>
                <a
                  href={`/admin/leistungsnachweis/${v.id}`}
                  style={{ ...primaryBtnSmall, textDecoration: 'none', display: 'inline-block' }}
                >
                  Leistungsnachweis (PDF) →
                </a>
                <a
                  href={`/admin/invoices?client=${v.client_id}&verordnung=${v.id}`}
                  style={{ ...primaryBtnSmall, textDecoration: 'none', display: 'inline-block' }}
                >
                  Rechnung erstellen →
                </a>
              </div>
            </div>

            {/* Stunden-Verbrauch: Ist vs. Genehmigt */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink4)', marginBottom: 4 }}>
                <span>
                  Verbraucht: <strong style={{ color: 'var(--ink)' }}>{formatDuration(usedMinutes)}</strong>
                  {usedAmount > 0 && <> · {euro(usedAmount)}</>}
                </span>
                <span>
                  Genehmigt: <strong style={{ color: 'var(--ink)' }}>{approved !== null ? `${approved} h` : 'kein Kontingent hinterlegt'}</strong>
                  {pct !== null && <span style={{ marginLeft: 6, color: barColor, fontWeight: 700 }}>{pct} %</span>}
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 6, background: 'var(--coal3)', overflow: 'hidden' }}>
                <div style={{
                  width: `${pct !== null ? Math.min(pct, 100) : 0}%`, height: '100%',
                  background: barColor, borderRadius: 6, transition: 'width .3s',
                }} />
              </div>
              {pct !== null && pct > 95 && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#D04B3B', fontWeight: 600 }}>
                  ⚠ Kontingent fast/ganz ausgeschöpft — Folgeverordnung anstoßen!
                </p>
              )}
            </div>

            {/* Verknüpfte Leistungsnachweise */}
            {recs.length > 0 && (
              <table className="admin-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr><th>Datum</th><th>Dauer</th><th>Betrag</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {[...recs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map(r => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                      <td>{formatDuration(r.duration_minutes || 0)}</td>
                      <td>{r.amount != null ? euro(Number(r.amount)) : '—'}</td>
                      <td style={{ fontSize: 13 }}>{r.status}</td>
                    </tr>
                  ))}
                  {recs.length > 8 && (
                    <tr>
                      <td colSpan={4} style={{ fontSize: 12, color: 'var(--ink4)' }}>
                        … und {recs.length - 8} weitere
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            {recs.length === 0 && (
              <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--ink4)' }}>
                Noch keine Leistungsnachweise mit dieser Verordnung verknüpft.
              </p>
            )}

            {/* Verknüpfte Rechnungen — SOLL/IST, Kürzung, Bezahlt, Versand */}
            {invs.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--ink4)' }}>Rechnungen</h4>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Nr.</th><th>SOLL</th><th>IST</th><th>Kürzung</th><th>Bezahlt</th><th>Versand</th><th>Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invs.map(i => (
                      <tr key={i.id}>
                        <td style={{ fontWeight: 600 }}>{i.invoice_number}</td>
                        <td>{centToEuro(i.soll_betrag_cent)}</td>
                        <td>{centToEuro(i.ist_betrag_cent)}</td>
                        <td>
                          {i.kuerzung_cent ? (
                            <span style={{ color: '#D04B3B' }} title={i.kuerzung_grund || ''}>
                              -{centToEuro(i.kuerzung_cent)}
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          <button
                            onClick={() => toggleBezahlt(i)}
                            disabled={busyId === i.id}
                            style={{ ...miniBtn, color: i.bezahlt ? '#5CB882' : '#E8A000' }}
                          >
                            {i.bezahlt ? `✓ Bezahlt${i.bezahlt_am ? ` (${formatDate(i.bezahlt_am)})` : ''}` : 'Offen'}
                          </button>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          <label style={{ marginRight: 8, cursor: 'pointer' }}>
                            <input type="checkbox" checked={i.versand_elektronisch} onChange={() => toggleVersand(i, 'versand_elektronisch')} disabled={busyId === i.id} /> elektr.
                          </label>
                          <label style={{ cursor: 'pointer' }}>
                            <input type="checkbox" checked={i.versand_post} onChange={() => toggleVersand(i, 'versand_post')} disabled={busyId === i.id} /> Post
                          </label>
                        </td>
                        <td>
                          <button onClick={() => openInvoiceEdit(i)} style={miniBtn}>SOLL/IST/Kürzung</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {invoiceEditId && invs.some(i => i.id === invoiceEditId) && (
                  <div style={{ marginTop: 10, padding: 12, background: 'var(--coal)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <label style={fieldLabel}>
                        SOLL-Betrag (€)
                        <input type="number" min="0" step="0.01" value={invoiceForm.soll} onChange={e => setInvoiceForm({ ...invoiceForm, soll: e.target.value })} style={input} />
                      </label>
                      <label style={fieldLabel}>
                        IST-Betrag (€)
                        <input type="number" min="0" step="0.01" value={invoiceForm.ist} onChange={e => setInvoiceForm({ ...invoiceForm, ist: e.target.value })} style={input} />
                      </label>
                      <label style={fieldLabel}>
                        Kürzung (€)
                        <input type="number" min="0" step="0.01" value={invoiceForm.kuerzung} onChange={e => setInvoiceForm({ ...invoiceForm, kuerzung: e.target.value })} style={input} />
                      </label>
                      <label style={fieldLabel}>
                        Kürzungsgrund
                        <input value={invoiceForm.kuerzung_grund} onChange={e => setInvoiceForm({ ...invoiceForm, kuerzung_grund: e.target.value })} style={input} placeholder="z. B. Kasse akzeptiert nur…" />
                      </label>
                      <button onClick={saveInvoiceEdit} disabled={busyId === invoiceEditId} style={primaryBtnSmall}>Speichern</button>
                      <button onClick={cancelInvoiceEdit} style={secondaryBtnSmall}>Abbrechen</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// Tab 5: Absagen — Klient/Mitarbeiterin sagt Einsatz ab, Ersatz suchen
// ═══════════════════════════════════════════════════════════════
function AbsagenTab(props: {
  absagen: AbsageRow[]
  caregivers: PersonOption[]
  assignmentOptions: AssignmentOption[]
  busyId: string | null
  saving: boolean
  showForm: boolean; setShowForm: (v: boolean) => void
  form: typeof EMPTY_ABSAGE; setForm: (f: typeof EMPTY_ABSAGE) => void
  filterDate: string; setFilterDate: (v: string) => void
  save: () => void
  setErsatz: (a: AbsageRow, caregiverId: string) => void
  remove: (id: string) => void
}) {
  const {
    absagen, caregivers, assignmentOptions, busyId, saving,
    showForm, setShowForm, form, setForm, filterDate, setFilterDate,
    save, setErsatz, remove,
  } = props

  const weekdayLabel = (n: number | null) => n === null ? '—' : (WEEKDAYS.find(w => w.n === n)?.long || `Tag ${n}`)

  const filtered = filterDate
    ? absagen.filter(a => (a.abgesagt_am || '').slice(0, 10) === filterDate)
    : absagen

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            Datum filtern
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={input} />
          </label>
          {filterDate && <button onClick={() => setFilterDate('')} style={secondaryBtnSmall}>Zurücksetzen</button>}
        </div>
        <button onClick={() => { setForm(EMPTY_ABSAGE); setShowForm(true) }} style={primaryBtn}>+ Absage erfassen</button>
      </div>

      {absagen.filter(a => !a.ersatz_gefunden).length > 0 && (
        <Banner tone="warn">
          ⚠ {absagen.filter(a => !a.ersatz_gefunden).length} Absage(n) ohne Ersatz — Vertretung organisieren!
        </Banner>
      )}

      {showForm && (
        <div style={formCard}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>Absage erfassen</h3>
          <div style={formGrid}>
            <label style={fieldLabel}>
              Einsatz *
              <select value={form.assignment_id} onChange={e => setForm({ ...form, assignment_id: e.target.value })} style={input}>
                <option value="">— wählen —</option>
                {assignmentOptions.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              Abgesagt von
              <select value={form.abgesagt_von} onChange={e => setForm({ ...form, abgesagt_von: e.target.value })} style={input}>
                {Object.entries(ABSAGE_VON).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              Ersatz-Mitarbeiterin (optional)
              <select value={form.ersatz_mitarbeiterin_id} onChange={e => setForm({ ...form, ersatz_mitarbeiterin_id: e.target.value })} style={input}>
                <option value="">— noch keine —</option>
                {caregivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label style={{ ...fieldLabel, gridColumn: '1 / -1' }}>
              Grund
              <textarea value={form.grund} onChange={e => setForm({ ...form, grund: e.target.value })} style={{ ...input, minHeight: 60, resize: 'vertical' }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={save} disabled={saving} style={primaryBtn}>{saving ? 'Speichern…' : 'Absage speichern'}</button>
            <button onClick={() => setShowForm(false)} style={secondaryBtn}>Abbrechen</button>
          </div>
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Klient</th><th>Mitarbeiterin</th><th>Wochentag</th><th>Abgesagt von</th>
              <th>Abgesagt am</th><th>Grund</th><th>Ersatz</th><th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0
              ? <EmptyRow colSpan={8}>{filterDate ? 'Keine Absagen an diesem Tag.' : 'Noch keine Absagen erfasst.'}</EmptyRow>
              : filtered.map(a => {
                const vm = statusMeta(ABSAGE_VON, a.abgesagt_von)
                return (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.clientName}</td>
                    <td>{a.caregiverName}</td>
                    <td>{weekdayLabel(a.weekday)}</td>
                    <td><StatusBadge label={vm.label} color={vm.color} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(a.abgesagt_am)}</td>
                    <td style={{ fontSize: 13 }}>{a.grund || '—'}</td>
                    <td>
                      <select
                        value={a.ersatz_mitarbeiterin_id || ''}
                        onChange={e => setErsatz(a, e.target.value)}
                        disabled={busyId === a.id}
                        style={{ ...input, padding: '4px 8px', fontSize: 12 }}
                      >
                        <option value="">— kein Ersatz —</option>
                        {caregivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <button onClick={() => remove(a.id)} disabled={busyId === a.id} style={{ ...miniBtn, color: '#D04B3B' }}>Löschen</button>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── Styles ──────────────────────────────────────────────────────
const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const primaryBtnSmall: React.CSSProperties = {
  ...primaryBtn, fontSize: 13, padding: '6px 12px',
}

const secondaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--ink)', fontWeight: 600,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const secondaryBtnSmall: React.CSSProperties = {
  ...secondaryBtn, fontSize: 13, padding: '6px 12px',
}

const miniBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--ink)',
  background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit',
  marginRight: 6,
}

const tabBtn: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: 'var(--ink)',
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 10, padding: '10px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const tabBtnActive: React.CSSProperties = {
  color: 'var(--coal)', border: '1px solid transparent',
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))',
}

const sectionH2: React.CSSProperties = {
  fontSize: 15, margin: '0 0 10px', color: 'var(--ink)',
}

const formCard: React.CSSProperties = {
  background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12,
  padding: 18, marginBottom: 20,
}

const formGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12,
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
