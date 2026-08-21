'use client'
// ═══════════════════════════════════════════════════════════════
// Digitale Mitarbeiterakte — Stammdaten + Dokumente/Qualifikationen/
// Verträge/Einsatzfreigabe/Audit-Log
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  AKTEN_DOKUMENT_TYP, AKTEN_STATUS, CAREGIVER_STATUS, QUALIFICATION_STATUS,
  VERTRAGS_STATUS, VERTRAGS_TYP, formatDate, statusMeta,
} from '@/lib/admin/ops'
import { StatusBadge, Banner, EmptyRow } from '@/components/admin/OpsUI'
import AktenUpload from '@/components/admin/AktenUpload'
import type { AktenDokument, AktenVertrag, AktenZugriffLogEntry } from '@/lib/akten/types'

type Tab = 'stammdaten' | 'dokumente' | 'qualifikationen' | 'vertraege' | 'einsatzfreigabe' | 'audit'

const TABS: { key: Tab; label: string }[] = [
  { key: 'stammdaten', label: 'Stammdaten' },
  { key: 'dokumente', label: 'Dokumente' },
  { key: 'qualifikationen', label: 'Qualifikationen' },
  { key: 'vertraege', label: 'Verträge' },
  { key: 'einsatzfreigabe', label: 'Einsatzfreigabe' },
  { key: 'audit', label: 'Audit-Log' },
]

export default function MitarbeiteraktePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const caregiverId = params.id

  const [tab, setTab] = useState<Tab>('stammdaten')
  const [caregiver, setCaregiver] = useState<any>(null)
  const [dokumente, setDokumente] = useState<AktenDokument[]>([])
  const [qualifikationen, setQualifikationen] = useState<any[]>([])
  const [vertraege, setVertraege] = useState<AktenVertrag[]>([])
  const [zugriffLog, setZugriffLog] = useState<AktenZugriffLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showUpload, setShowUpload] = useState(false)

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const [caregiverRes, qualiRes, dokRes, vertragRes] = await Promise.all([
        supabase.from('caregivers').select('*').eq('id', caregiverId).single(),
        supabase.from('caregiver_qualifications').select('*').eq('caregiver_id', caregiverId).order('valid_until'),
        fetch(`/api/akten/dokumente?caregiverId=${caregiverId}`).then(r => r.json()),
        fetch(`/api/akten/vertraege?caregiverId=${caregiverId}`).then(r => r.json()),
      ])

      if (caregiverRes.error || !caregiverRes.data) { setError('Mitarbeiter nicht gefunden.'); setLoading(false); return }
      setCaregiver(caregiverRes.data)
      setQualifikationen(qualiRes.data || [])
      setDokumente(dokRes.dokumente || [])
      setVertraege(vertragRes.vertraege || [])

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

  useEffect(() => { if (caregiverId) loadAll() }, [caregiverId])

  async function handleDownload(id: string) {
    const res = await fetch(`/api/akten/dokumente/${id}/download`)
    const body = await res.json()
    if (!res.ok) { setError(body.error || 'Download fehlgeschlagen.'); return }
    window.open(body.url, '_blank')
  }

  if (loading) return <div className="admin-page"><p>Lade Mitarbeiterakte…</p></div>
  if (!caregiver) return <div className="admin-page"><Banner tone="danger">{error || 'Mitarbeiter nicht gefunden.'}</Banner></div>

  const fzGueltig = caregiver.fuehrungszeugnis_gueltig_bis && new Date(caregiver.fuehrungszeugnis_gueltig_bis) >= new Date()
  const ehGueltig = caregiver.erste_hilfe_gueltig_bis && new Date(caregiver.erste_hilfe_gueltig_bis) >= new Date()

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>{caregiver.first_name} {caregiver.last_name}</h1>
          <p className="admin-subtitle">
            Mitarbeiterakte · {caregiver.initials} · {caregiver.beschaeftigungsart || '—'}
          </p>
        </div>
        <button onClick={() => router.push('/admin/caregivers')} style={secondaryBtn}>← Zu Betreuungskräften</button>
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
          <Field label="Status"><StatusBadge label={statusMeta(CAREGIVER_STATUS, caregiver.status).label} color={statusMeta(CAREGIVER_STATUS, caregiver.status).color} /></Field>
          <Field label="Geburtsdatum">{formatDate(caregiver.geburtsdatum)}</Field>
          <Field label="Geschlecht">{caregiver.geschlecht || '—'}</Field>
          <Field label="Adresse">{[caregiver.address, caregiver.zip_code, caregiver.city].filter(Boolean).join(', ') || '—'}</Field>
          <Field label="Bundesland">{caregiver.bundesland || '—'}</Field>
          <Field label="Telefon">{caregiver.phone || '—'}</Field>
          <Field label="E-Mail">{caregiver.email || '—'}</Field>
          <Field label="Eintrittsdatum">{formatDate(caregiver.eintrittsdatum)}</Field>
          <Field label="Austrittsdatum">{formatDate(caregiver.austrittsdatum)}</Field>
          <Field label="Führungszeugnis"><span style={{ color: fzGueltig ? '#5CB882' : '#D04B3B' }}>{caregiver.fuehrungszeugnis_gueltig_bis ? `bis ${formatDate(caregiver.fuehrungszeugnis_gueltig_bis)}` : 'fehlt'}</span></Field>
          <Field label="Erste Hilfe"><span style={{ color: ehGueltig ? '#5CB882' : '#D04B3B' }}>{caregiver.erste_hilfe_gueltig_bis ? `bis ${formatDate(caregiver.erste_hilfe_gueltig_bis)}` : 'fehlt'}</span></Field>
          <Field label="Einsatzfreigabe">
            {caregiver.einsatzfreigabe
              ? <span style={{ color: '#5CB882' }}>Erteilt{caregiver.einsatzfreigabe_am && ` (${formatDate(caregiver.einsatzfreigabe_am)})`}</span>
              : <span style={{ color: '#D04B3B' }}>Nicht erteilt</span>}
          </Field>
        </div>
      )}

      {tab === 'dokumente' && (
        <>
          <div style={{ marginBottom: 14 }}>
            <button onClick={() => setShowUpload(v => !v)} style={primaryBtn}>+ Dokument hochladen</button>
          </div>
          {showUpload && (
            <div style={{ marginBottom: 20 }}>
              <AktenUpload caregiverId={caregiverId} onUploaded={() => { setShowUpload(false); loadAll() }} onCancel={() => setShowUpload(false)} />
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

      {tab === 'qualifikationen' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Titel</th><th>Typ</th><th>Ausgestellt</th><th>Gültig bis</th><th>Status</th></tr></thead>
            <tbody>
              {qualifikationen.length === 0
                ? <EmptyRow colSpan={5}>Keine Qualifikationen erfasst</EmptyRow>
                : qualifikationen.map(q => (
                  <tr key={q.id}>
                    <td style={{ fontWeight: 600 }}>{q.title}</td>
                    <td style={{ fontSize: 13 }}>{q.qualification_type}</td>
                    <td style={{ fontSize: 13 }}>{formatDate(q.issued_date)}</td>
                    <td style={{ fontSize: 13 }}>{formatDate(q.valid_until)}</td>
                    <td><StatusBadge label={statusMeta(QUALIFICATION_STATUS, q.status).label} color={statusMeta(QUALIFICATION_STATUS, q.status).color} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
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

      {tab === 'einsatzfreigabe' && (
        <div style={cardGrid}>
          <Field label="Einsatzfreigabe">
            {caregiver.einsatzfreigabe
              ? <span style={{ color: '#5CB882' }}>Erteilt am {formatDate(caregiver.einsatzfreigabe_am)}</span>
              : <span style={{ color: '#D04B3B' }}>Nicht erteilt</span>}
          </Field>
          <Field label="Führungszeugnis">
            {caregiver.fuehrungszeugnis_datum ? `Vorgelegt am ${formatDate(caregiver.fuehrungszeugnis_datum)}, gültig bis ${formatDate(caregiver.fuehrungszeugnis_gueltig_bis)}` : 'Nicht vorgelegt'}
          </Field>
          <Field label="Erste-Hilfe-Nachweis">
            {caregiver.erste_hilfe_datum ? `Vorgelegt am ${formatDate(caregiver.erste_hilfe_datum)}, gültig bis ${formatDate(caregiver.erste_hilfe_gueltig_bis)}` : 'Nicht vorgelegt'}
          </Field>
          <Field label="Voraussetzung erfüllt">
            {fzGueltig && ehGueltig
              ? <span style={{ color: '#5CB882' }}>Alle Nachweise gültig</span>
              : <span style={{ color: '#D04B3B' }}>Nachweise unvollständig oder abgelaufen</span>}
          </Field>
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
    <label style={{ display: 'block', background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px'}}>
      <div style={{ fontSize: 11, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--ink)' }}>{children}</div>
    </label>
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
