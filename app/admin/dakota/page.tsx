'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge, EmptyRow, Banner } from '@/components/admin/OpsUI'
import Link from 'next/link'

function euro(cents: number) {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  erstellt: { label: 'Erstellt', color: '#94a3b8' },
  verschluesselung_laeuft: { label: 'Verschlüsselung…', color: '#f59e0b' },
  verschluesselt: { label: 'Verschlüsselt', color: '#06b6d4' },
  bereit_zur_uebermittlung: { label: 'Bereit', color: '#6366f1' },
  uebermittlung_laeuft: { label: 'Übermittlung…', color: '#f59e0b' },
  uebermittelt: { label: 'Übermittelt', color: '#8b5cf6' },
  quittiert: { label: 'Quittiert', color: '#22c55e' },
  technischer_fehler: { label: 'Techn. Fehler', color: '#ef4444' },
  abgebrochen: { label: 'Abgebrochen', color: '#9ca3af' },
  externer_zugang_fehlt: { label: 'Zugang fehlt', color: '#f97316' },
}

interface DakotaAuftrag {
  id: string
  lauf_id: string
  empfaenger_ik: string
  absender_ik: string
  logischer_dateiname: string
  status: string
  versand_versuche: number
  nutzdaten_groesse_bytes: number | null
  uebermittelt_am: string | null
  created_at: string
}

export default function DakotaPage() {
  const [auftraege, setAuftraege] = useState<DakotaAuftrag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('dta_dakota_auftraege')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else setAuftraege(data ?? [])
        setLoading(false)
      })
  }, [])

  const bereit = auftraege.filter(a => a.status === 'bereit_zur_uebermittlung').length
  const zugang = auftraege.filter(a => a.status === 'externer_zugang_fehlt').length
  const fehler = auftraege.filter(a => a.status === 'technischer_fehler').length

  return (
    <div className="admin-page">
      <h1>DAKOTA-Connector</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
        Übermittlung verschlüsselter DTA-Dateien an Datenannahmestellen.
      </p>

      {zugang > 0 && (
        <Banner tone="warn">
          {zugang} Auftrag/Aufträge warten auf DAKOTA-Zugangsdaten (Zertifikate, SFTP-Konfiguration).
          Konfiguration unter{' '}
          <Link href="/admin/abrechnung/einstellungen">Einstellungen</Link>.
        </Banner>
      )}

      {fehler > 0 && (
        <Banner tone="danger">
          {fehler} Auftrag/Aufträge mit technischem Fehler — Details in{' '}
          <Link href="/admin/abrechnungsfehler">Fehlerprotokoll</Link>.
        </Banner>
      )}

      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, margin: '16px 0 24px' }}>
        <KPI label="Gesamt" value={auftraege.length} />
        <KPI label="Bereit" value={bereit} color="#6366f1" />
        <KPI label="Zugang fehlt" value={zugang} color="#f97316" />
        <KPI label="Übermittelt" value={auftraege.filter(a => ['uebermittelt', 'quittiert'].includes(a.status)).length} color="#22c55e" />
        <KPI label="Fehler" value={fehler} color="#ef4444" />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Dateiname</th>
              <th>Empfänger-IK</th>
              <th>Status</th>
              <th>Größe</th>
              <th>Versuche</th>
              <th>Erstellt</th>
              <th>Übermittelt</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8}>Lade…</td></tr>
            ) : auftraege.length === 0 ? (
              <EmptyRow colSpan={8}>Keine DAKOTA-Aufträge vorhanden.</EmptyRow>
            ) : auftraege.map(a => {
              const sm = STATUS_META[a.status] || { label: a.status, color: '#94a3b8' }
              return (
                <tr key={a.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{a.logischer_dateiname}</td>
                  <td>{a.empfaenger_ik}</td>
                  <td><StatusBadge label={sm.label} color={sm.color} /></td>
                  <td>{a.nutzdaten_groesse_bytes ? `${(a.nutzdaten_groesse_bytes / 1024).toFixed(1)} KB` : '—'}</td>
                  <td>{a.versand_versuche}</td>
                  <td>{new Date(a.created_at).toLocaleDateString('de-DE')}</td>
                  <td>{a.uebermittelt_am ? new Date(a.uebermittelt_am).toLocaleString('de-DE') : '—'}</td>
                  <td>
                    <Link href={`/admin/dta/laeufe/${a.lauf_id}`} className="admin-btn small">
                      Lauf
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function KPI({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="admin-card" style={{ textAlign: 'center', padding: '10px 8px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
    </div>
  )
}
