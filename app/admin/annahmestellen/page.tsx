'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { updateVerbindungStatus } from './actions'

const VERBINDUNG_META: Record<string, { label: string; color: string }> = {
  nicht_getestet: { label: 'Nicht getestet', color: '#94a3b8' },
  erfolgreich: { label: 'Verbunden', color: '#22c55e' },
  fehlgeschlagen: { label: 'Fehlgeschlagen', color: '#ef4444' },
  zertifikat_abgelaufen: { label: 'Zert. abgelaufen', color: '#f97316' },
}

interface Annahmestelle {
  id: string
  name: string
  ik_nummer: string | null
  sftp_host: string | null
  sftp_port: number
  sftp_user: string | null
  sftp_verzeichnis: string | null
  antwort_verzeichnis: string | null
  kim_adresse: string | null
  zustaendig_fuer: string[] | null
  aktiv: boolean
  verbindung_status: string
  letzte_verbindung_am: string | null
  bundesland: string | null
  kassenart: string | null
}

export default function AnnahmestellenPage() {
  const [stellen, setStellen] = useState<Annahmestelle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [testBusy, setTestBusy] = useState<string | null>(null)

  async function load() {
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('datenannahmestellen')
      .select('*')
      .is('deleted_at', null)
      .order('name')

    if (err) setError(err.message)
    else setStellen(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function testConnection(id: string, sftpHost: string) {
    setTestBusy(id)
    try {
      const res = await fetch('/api/admin/abrechnung/sftp-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datenannahmestelleId: id }),
      })
      const data = await res.json()
      const result = await updateVerbindungStatus(id, !!data.success)
      if (!result.ok) { setError(result.error); return }
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTestBusy(null)
    }
  }

  const filtered = stellen.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.ik_nummer?.includes(q) || s.sftp_host?.includes(q)
  })

  return (
    <div className="admin-page">
      <h1>Datenannahmestellen</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
        Konfiguration der Datenannahmestellen für den elektronischen Datenaustausch.
        SFTP-Zugangsdaten und Zertifikate unter{' '}
        <a href="/admin/abrechnung/einstellungen">Einstellungen</a>.
      </p>

      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Suche nach Name, IK, Host…" />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>IK</th>
              <th>Kassenart</th>
              <th>SFTP-Host</th>
              <th>Verzeichnis</th>
              <th>Zuständig für</th>
              <th>Verbindung</th>
              <th>Aktiv</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9}>Lade…</td></tr>
            ) : filtered.length === 0 ? (
              <EmptyRow colSpan={9}>Keine Datenannahmestellen konfiguriert.</EmptyRow>
            ) : filtered.map(s => {
              const vm = VERBINDUNG_META[s.verbindung_status] || { label: s.verbindung_status, color: '#94a3b8' }
              return (
                <tr key={s.id}>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td style={{ fontFamily: 'monospace' }}>{s.ik_nummer || '—'}</td>
                  <td>{s.kassenart || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.sftp_host || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.sftp_verzeichnis || '—'}</td>
                  <td>{s.zustaendig_fuer?.join(', ') || '—'}</td>
                  <td>
                    <StatusBadge label={vm.label} color={vm.color} />
                    {s.letzte_verbindung_am && (
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {new Date(s.letzte_verbindung_am).toLocaleString('de-DE')}
                      </div>
                    )}
                  </td>
                  <td>{s.aktiv ? '✓' : '—'}</td>
                  <td>
                    {s.sftp_host && (
                      <button className="admin-btn small" disabled={testBusy === s.id}
                        onClick={() => testConnection(s.id, s.sftp_host!)}>
                        {testBusy === s.id ? '…' : 'Test'}
                      </button>
                    )}
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
