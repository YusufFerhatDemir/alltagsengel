'use client'
// ═══════════════════════════════════════════════════════════════
// Digitale Kundenakte — Stammdaten + Dokumente/Verträge/Verordnungen/
// Kontaktpersonen/Korrespondenz/Audit-Log in einer Seite
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  AKTEN_DOKUMENT_TYP, AKTEN_STATUS, CLIENT_STATUS, GENEHMIGUNG_STATUS,
  KONTAKT_ROLLE, VERTRAGS_STATUS, VERTRAGS_TYP, formatDate, statusMeta,
} from '@/lib/admin/ops'
import { StatusBadge, Banner, EmptyRow } from '@/components/admin/OpsUI'
import AktenUpload from '@/components/admin/AktenUpload'
import type { AktenDokument, AktenKontaktperson, AktenVertrag, AktenZugriffLogEntry } from '@/lib/akten/types'

type Tab = 'stammdaten' | 'dokumente' | 'vertraege' | 'verordnungen' | 'kontaktpersonen' | 'korrespondenz' | 'audit'

const TABS: { key: Tab; label: string }[] = [
  { key: 'stammdaten', label: 'Stammdaten' },
  { key: 'dokumente', label: 'Dokumente' },
  { key: 'vertraege', label: 'Verträge' },
  { key: 'verordnungen', label: 'Verordnungen' },
  { key: 'kontaktpersonen', label: 'Kontaktpersonen' },
  { key: 'korrespondenz', label: 'Korrespondenz' },
  { key: 'audit', label: 'Audit-Log' },
]

export default function KundenaktePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const clientId = params.id

  const [tab, setTab] = useState<Tab>('stammdaten')
  const [client, setClient] = useState<any>(null)
  const [dokumente, setDokumente] = useState<AktenDokument[]>([])
  const [vertraege, setVertraege] = useState<AktenVertrag[]>([])
  const [verordnungen, setVerordnungen] = useState<any[]>([])
  const [kontaktpersonen, setKontaktpersonen] = useState<AktenKontaktperson[]>([])
  const [zugriffLog, setZugriffLog] = useState<AktenZugriffLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showUpload, setShowUpload] = useState(false)

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const [clientRes, verordnungenRes, dokRes, vertragRes, kontaktRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', clientId).single(),
        supabase.from('verordnungen').select('*').eq('client_id', clientId).order('ausstellungsdatum', { ascending: false }),
        fetch(`/api/akten/dokumente?clientId=${clientId}`).then(r => r.json()),
        fetch(`/api/akten/vertraege?clientId=${clientId}`).then(r => r.json()),
        fetch(`/api/akten/kontaktpersonen?clientId=${clientId}`).then(r => r.json()),
      ])

      if (clientRes.error || !clientRes.data) { setError('Kunde nicht gefunden.'); setLoading(false); return }
      setClient(clientRes.data)
      setVerordnungen(verordnungenRes.data || [])
      setDokumente(dokRes.dokumente || [])
      setVertraege(vertragRes.vertraege || [])
      setKontaktpersonen(kontaktRes.kontaktpersonen || [])

      const zugriffRes = await fetch('/api/akten/zugriff?limit=200').then(r => r.json())
      const dokIds = new Set((dokRes.dokumente || []).map((d: AktenDokument) => d.id))
      const vertragIds = new Set((vertragRes.vertraege || []).map((v: AktenVertrag) => v.id))
      setZugriffLog((zugriffRes.eintraege || []).filter((e: AktenZugriffLogEntry) =>
        (e.dokument_id && dokIds.has(e.dokument_id)) || (e.vertrag_id && vertragIds.has(e.vertrag_id))
      ))
    } catch {
      setError('Unerwarteter Fehler beim Laden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (clientId) loadAll() }, [clientId])

  async function handleDownload(id: string) {
    const res = await fetch(`/api/akten/dokumente/${id}/download`)
    const body = await res.json()
    if (!res.ok) { setError(body.error || 'Download fehlgeschlagen.'); return }
    window.open(body.url, '_blank')
  }

  if (loading) return <div className="admin-page"><p>Lade Kundenakte…</p></div>
  if (!client) return <div className="admin-page"><Banner tone="danger">{error || 'Kunde nicht gefunden.'}</Banner></div>

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>{client.first_name} {client.last_name}</h1>
          <p className="admin-subtitle">
            Kundenakte · {client.customer_number || '—'} · Pflegegrad {client.pflegegrad ?? client.care_level ?? '—'}
            {client.aktenzeichen && <> · Az. {client.aktenzeichen}</>}
          </p>
        </div>
        <button onClick={() => router.push('/admin/clients')} style={secondaryBtn}>← Zu Klienten</button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div className="admin-filters">
        {TABS.map(t => (
          <button key={t.key} className={`admin-filter-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'stammdaten' && (
        <div style={cardGrid}>
          <Field label="Status"><StatusBadge label={statusMeta(CLIENT_STATUS, client.status).label} color={statusMeta(CLIENT_STATUS, client.status).color} /></Field>
          <Field label="Geburtsdatum">{formatDate(client.date_of_birth || client.geburtsdatum)}</Field>
          <Field label="Geschlecht">{client.geschlecht || '—'}</Field>
          <Field label="Adresse">{[client.address, client.zip_code, client.city].filter(Boolean).join(', ') || '—'}</Field>
          <Field label="Bundesland">{client.bundesland || '—'}</Field>
          <Field label="Telefon">{client.phone || '—'}</Field>
          <Field label="E-Mail">{client.email || '—'}</Field>
          <Field label="Pflegekasse">{client.pflegekasse_name || client.insurance_name || '—'}</Field>
          <Field label="Pflegegrad seit">{formatDate(client.pflegegrad_seit)}</Field>
          <Field label="Bevollmächtigte/r">{client.bevollmaechtigter_name || '—'} {client.bevollmaechtigter_telefon && `· ${client.bevollmaechtigter_telefon}`}</Field>
          <Field label="Abtretungserklärung">{client.abtretungserklaerung_vorhanden ? 'Vorhanden' : 'Fehlt'}</Field>
          <Field label="Notfallkontakt">{client.emergency_contact_name || '—'} {client.emergency_contact_phone && `· ${client.emergency_contact_phone}`}</Field>
        </div>
      )}

      {tab === 'dokumente' && (
        <>
          <div style={{ marginBottom: 14 }}>
            <button onClick={() => setShowUpload(v => !v)} style={primaryBtn}>+ Dokument hochladen</button>
          </div>
          {showUpload && (
            <div style={{ marginBottom: 20 }}>
              <AktenUpload clientId={clientId} onUploaded={() => { setShowUpload(false); loadAll() }} onCancel={() => setShowUpload(false)} />
            </div>
          )}
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Titel</th><th>Typ</th><th>Status</th><th>Ablauf</th><th>Version</th><th>Aktionen</th></tr></thead>
              <tbody>
                {dokumente.length === 0
                  ? <EmptyRow colSpan={6}>Keine Dokumente</EmptyRow>
                  : dokumente.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 600 }}>{d.titel}{d.gesperrt && ' 🔒'}</td>
                      <td><StatusBadge label={statusMeta(AKTEN_DOKUMENT_TYP, d.dokument_typ).label} color={statusMeta(AKTEN_DOKUMENT_TYP, d.dokument_typ).color} /></td>
                      <td><StatusBadge label={statusMeta(AKTEN_STATUS, d.status).label} color={statusMeta(AKTEN_STATUS, d.status).color} /></td>
                      <td style={{ fontSize: 13 }}>{d.ablaufdatum ? formatDate(d.ablaufdatum) : '—'}</td>
                      <td style={{ fontSize: 13 }}>v{d.aktuelle_version}</td>
                      <td><button onClick={() => handleDownload(d.id)} style={miniBtn}>Download</button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'vertraege' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Titel</th><th>Typ</th><th>Status</th><th>Beginn</th><th>Ende</th></tr></thead>
            <tbody>
              {vertraege.length === 0
                ? <EmptyRow colSpan={5}>Keine Verträge</EmptyRow>
                : vertraege.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.titel}{v.gesperrt && ' 🔒'}</td>
                    <td><StatusBadge label={statusMeta(VERTRAGS_TYP, v.vertragstyp).label} color={statusMeta(VERTRAGS_TYP, v.vertragstyp).color} /></td>
                    <td><StatusBadge label={statusMeta(VERTRAGS_STATUS, v.status).label} color={statusMeta(VERTRAGS_STATUS, v.status).color} /></td>
                    <td style={{ fontSize: 13 }}>{formatDate(v.vertragsbeginn)}</td>
                    <td style={{ fontSize: 13 }}>{formatDate(v.vertragsende)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'verordnungen' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Typ</th><th>Ausstellung</th><th>Genehmigung</th><th>Gültig bis</th><th>Abrechnung</th></tr></thead>
            <tbody>
              {verordnungen.length === 0
                ? <EmptyRow colSpan={5}>Keine Verordnungen</EmptyRow>
                : verordnungen.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.verordnung_type}</td>
                    <td style={{ fontSize: 13 }}>{formatDate(v.ausstellungsdatum)}</td>
                    <td><StatusBadge label={statusMeta(GENEHMIGUNG_STATUS, v.genehmigung_status).label} color={statusMeta(GENEHMIGUNG_STATUS, v.genehmigung_status).color} /></td>
                    <td style={{ fontSize: 13 }}>{formatDate(v.genehmigung_bis)}</td>
                    <td style={{ fontSize: 13 }}>
                      {v.abrechnung_gesperrt
                        ? <span style={{ color: '#D04B3B' }}>Gesperrt{v.abrechnung_sperrgrund && `: ${v.abrechnung_sperrgrund}`}</span>
                        : <span style={{ color: '#5CB882' }}>Freigegeben</span>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'kontaktpersonen' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Rolle</th><th>Telefon</th><th>E-Mail</th><th>Vollmacht</th><th>Hauptkontakt</th></tr></thead>
            <tbody>
              {kontaktpersonen.length === 0
                ? <EmptyRow colSpan={6}>Keine Kontaktpersonen erfasst</EmptyRow>
                : kontaktpersonen.map(k => (
                  <tr key={k.id}>
                    <td style={{ fontWeight: 600 }}>{k.vorname} {k.nachname}</td>
                    <td><StatusBadge label={statusMeta(KONTAKT_ROLLE, k.rolle).label} color={statusMeta(KONTAKT_ROLLE, k.rolle).color} /></td>
                    <td style={{ fontSize: 13 }}>{k.telefon || k.mobil || '—'}</td>
                    <td style={{ fontSize: 13 }}>{k.email || '—'}</td>
                    <td style={{ fontSize: 13 }}>{k.vollmacht_typ || '—'}</td>
                    <td>{k.ist_hauptkontakt ? '✓' : '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'korrespondenz' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Titel</th><th>Datum</th></tr></thead>
            <tbody>
              {dokumente.filter(d => d.kategorie === 'korrespondenz' || d.dokument_typ === 'schriftverkehr').length === 0
                ? <EmptyRow colSpan={2}>Keine Korrespondenz erfasst</EmptyRow>
                : dokumente.filter(d => d.kategorie === 'korrespondenz' || d.dokument_typ === 'schriftverkehr').map(d => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.titel}</td>
                    <td style={{ fontSize: 13 }}>{formatDate(d.dokument_datum || d.created_at)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'audit' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Zeitpunkt</th><th>Aktion</th><th>Entität</th><th>Rolle</th></tr></thead>
            <tbody>
              {zugriffLog.length === 0
                ? <EmptyRow colSpan={4}>Keine Zugriffe protokolliert</EmptyRow>
                : zugriffLog.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontSize: 13 }}>{new Date(e.created_at).toLocaleString('de-DE')}</td>
                    <td style={{ fontWeight: 600 }}>{e.aktion}</td>
                    <td style={{ fontSize: 13 }}>{e.entitaet_typ}</td>
                    <td style={{ fontSize: 13 }}>{e.benutzer_rolle || '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--ink)' }}>{children}</div>
    </div>
  )
}

const cardGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }
const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
const secondaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--ink)', fontWeight: 600,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
const miniBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--ink)',
  background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit',
  marginRight: 6,
}
