'use client'
// ═══════════════════════════════════════════════════════════════
// Notizen-Zentrale — alle Care Notes über alle Klienten hinweg
// Filter: Klient · Kategorie · Autor-Rolle · Dringlichkeit
// Dringende Notizen werden hervorgehoben ganz oben angezeigt.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fullName, NOTE_CATEGORY, NOTE_AUTHOR_ROLE } from '@/lib/admin/ops'
import { Banner } from '@/components/admin/OpsUI'
import { NoteCard, NoteComposer, type CareNote } from '@/components/admin/CareNotesPanel'
import { logger } from '@/lib/logger'
import DialogOverlay from '@/components/DialogOverlay'
const log = logger.child('admin:notizen')

interface ClientOption { id: string; name: string }

export default function AdminNotizenPage() {
  const router = useRouter()
  const [notes, setNotes] = useState<CareNote[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  // Filter
  const [clientFilter, setClientFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [urgentOnly, setUrgentOnly] = useState(false)

  const load = useCallback(async () => {
    try {
      const supabase = createClient()
      const [notesRes, clientsRes] = await Promise.all([
        supabase.from('care_notes').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('clients').select('id, first_name, last_name').order('last_name', { ascending: true }),
      ])
      if (notesRes.error) { setLoadErr(notesRes.error.message); return }
      setLoadErr(null)
      setNotes((notesRes.data || []) as CareNote[])
      setClients((clientsRes.data || []).map((c: any) => ({ id: c.id, name: fullName(c) })))
    } catch (err: any) {
      log.errorWithException('Notizen load error', err)
      setLoadErr(err?.message || 'Notizen konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach(c => m.set(c.id, c.name))
    return m
  }, [clients])

  const filtered = useMemo(() => {
    return notes.filter(n => {
      if (clientFilter !== 'all' && n.client_id !== clientFilter) return false
      if (catFilter !== 'all' && n.category !== catFilter) return false
      if (roleFilter !== 'all' && n.author_role !== roleFilter) return false
      if (urgentOnly && !n.is_urgent) return false
      return true
    })
  }, [notes, clientFilter, catFilter, roleFilter, urgentOnly])

  // Dringende oben (hervorgehoben), danach der Rest — jeweils neueste zuerst
  const urgentNotes = filtered.filter(n => n.is_urgent)
  const normalNotes = filtered.filter(n => !n.is_urgent)
  const urgentTotal = notes.filter(n => n.is_urgent).length

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Notizen</h1>
          <p className="admin-subtitle">
            {notes.length} Notizen über alle Klienten
            {urgentTotal > 0 ? ` · ${urgentTotal} dringend` : ''}
          </p>
        </div>
        <button onClick={() => setShowModal(true)} style={primaryBtn}>+ Neue Notiz</button>
      </div>

      {/* ═══ Filter ═══ */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <FilterField label="Klient">
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} style={selectStyle}>
            <option value="all">Alle Klienten</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FilterField>
        <FilterField label="Autor-Rolle">
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={selectStyle}>
            <option value="all">Alle Rollen</option>
            {Object.entries(NOTE_AUTHOR_ROLE).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </FilterField>
        <button
          className={`admin-filter-btn ${urgentOnly ? 'active' : ''}`}
          onClick={() => setUrgentOnly(v => !v)}
          style={{ marginBottom: 1 }}
        >
          🚨 Nur Dringende ({urgentTotal})
        </button>
      </div>

      <div className="admin-filters">
        <button className={`admin-filter-btn ${catFilter === 'all' ? 'active' : ''}`} onClick={() => setCatFilter('all')}>
          Alle Kategorien
        </button>
        {Object.entries(NOTE_CATEGORY).map(([k, v]) => (
          <button key={k} className={`admin-filter-btn ${catFilter === k ? 'active' : ''}`} onClick={() => setCatFilter(k)}>
            {v.emoji} {v.label} ({notes.filter(n => n.category === k).length})
          </button>
        ))}
      </div>

      {loadErr && <Banner tone="danger">{loadErr}</Banner>}

      {loading ? <p>Laden…</p> : filtered.length === 0 ? (
        <p style={{ color: 'var(--muted)', padding: '32px 0', textAlign: 'center' }}>
          {notes.length === 0 ? 'Noch keine Notizen vorhanden.' : 'Keine Treffer für die gewählten Filter.'}
        </p>
      ) : (
        <>
          {urgentNotes.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ marginBottom: 10, color: '#D04B3B', display: 'flex', alignItems: 'center', gap: 8 }}>
                🚨 Dringend
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit' }}>
                  ({urgentNotes.length})
                </span>
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {urgentNotes.map(n => (
                  <NoteCard
                    key={n.id}
                    note={n}
                    clientName={clientNameById.get(n.client_id) || 'Unbekannter Klient'}
                    onClientClick={() => router.push(`/admin/clients/${n.client_id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {normalNotes.length > 0 && (
            <div>
              {urgentNotes.length > 0 && (
                <h2 style={{ marginBottom: 10 }}>
                  Weitere Notizen
                  <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit', marginLeft: 8 }}>
                    ({normalNotes.length})
                  </span>
                </h2>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {normalNotes.map(n => (
                  <NoteCard
                    key={n.id}
                    note={n}
                    clientName={clientNameById.get(n.client_id) || 'Unbekannter Klient'}
                    onClientClick={() => router.push(`/admin/clients/${n.client_id}`)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ Neue Notiz (Modal) ═══ */}
      {showModal && (
        <DialogOverlay onClose={() => setShowModal(false)}>
          <div role="dialog" aria-label="Neue Notiz" aria-modal="true" className="admin-modal" style={{ maxWidth: 520, width: '92%' }} onClick={e => e.stopPropagation()}>
            <h3>Neue Notiz</h3>
            <NoteComposer
              clients={clients}
              onSaved={() => { setShowModal(false); load() }}
              onCancel={() => setShowModal(false)}
            />
          </div>
        </DialogOverlay>
      )}
    </div>
  )
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 180 }}>
      <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600, display: 'block', marginBottom: 3 }}>{label}</span>
      {children}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal2)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box',
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontFamily: 'inherit',
}
