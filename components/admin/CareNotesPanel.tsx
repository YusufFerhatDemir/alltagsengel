'use client'
// ═══════════════════════════════════════════════════════════════
// Care Notes — rollenübergreifendes Notizsystem (Admin-Bausteine)
// NoteCard (Anzeige), NoteComposer (Erstellen), CareNotesPanel
// (Klienten-Tab). Wird von /admin/notizen und /admin/clients/[id]
// gemeinsam genutzt.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { timeAgo, NOTE_CATEGORY, NOTE_AUTHOR_ROLE } from '@/lib/admin/ops'
import { StatusBadge, Banner } from '@/components/admin/OpsUI'
import { createCareNoteAction } from '@/app/admin/notizen/actions'

export interface CareNote {
  id: string
  client_id: string
  service_record_id: string | null
  author_id: string
  author_role: string
  author_name: string
  category: string
  content: string
  is_urgent: boolean
  is_internal: boolean
  created_at: string
}

export function formatDateTime(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return `${d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} Uhr`
}

// ── Notiz-Karte ─────────────────────────────────────────────────
export function NoteCard({ note, clientName, onClientClick }: {
  note: CareNote
  clientName?: string
  onClientClick?: () => void
}) {
  const cat = NOTE_CATEGORY[note.category] || { label: note.category || 'Allgemein', color: '#999', emoji: '📝' }
  const role = NOTE_AUTHOR_ROLE[note.author_role] || { label: note.author_role || '—', color: '#999' }
  return (
    <div
      className="admin-stat-card"
      style={{
        padding: '14px 16px',
        border: note.is_urgent ? '1px solid rgba(208,75,59,.55)' : undefined,
        background: note.is_urgent ? 'rgba(208,75,59,.06)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {note.is_urgent && <StatusBadge label="🚨 Dringend" color="#D04B3B" />}
        {clientName && (
          <span
            onClick={onClientClick}
            style={{
              fontWeight: 700, color: 'var(--ink)', fontSize: 14,
              cursor: onClientClick ? 'pointer' : 'default',
              textDecoration: onClientClick ? 'underline dotted' : 'none',
            }}
          >
            {clientName}
          </span>
        )}
        <StatusBadge label={`${cat.emoji} ${cat.label}`} color={cat.color} />
        <StatusBadge label={role.label} color={role.color} />
        <span style={{ fontSize: 13, color: 'var(--ink4)' }}>{note.author_name || '—'}</span>
        {note.is_internal && (
          <span title="Interne Notiz — nur für Büro/PDL sichtbar" style={{ fontSize: 13, color: 'var(--ink4)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            🔒 Intern
          </span>
        )}
        <span title={formatDateTime(note.created_at)} style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink5)', whiteSpace: 'nowrap' }}>
          {timeAgo(note.created_at)}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--ink2)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {note.content}
      </p>
    </div>
  )
}

// ── Notiz-Formular ──────────────────────────────────────────────
// Ohne clientId: Klienten-Auswahl aus `clients` (für /admin/notizen).
// Mit clientId: Inline-Formular auf der Klienten-Detailseite.
export function NoteComposer({ clientId, clients, onSaved, onCancel }: {
  clientId?: string
  clients?: { id: string; name: string }[]
  onSaved: () => void
  onCancel?: () => void
}) {
  const [selClient, setSelClient] = useState(clientId || '')
  const [category, setCategory] = useState('allgemein')
  const [role, setRole] = useState('buero')
  const [content, setContent] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [internal, setInternal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setErr(null)
    const cid = clientId || selClient
    if (!cid) { setErr('Bitte einen Klienten auswählen.'); return }
    if (!content.trim()) { setErr('Bitte einen Notiz-Text eingeben.'); return }
    setSaving(true)
    try {
      // Security-Audit 2026-08-19 (MITTEL-3): kein Direktschreibpfad aus dem
      // Browser mehr. Die Server Action prueft die Rolle, setzt author_id und
      // author_name aus der Session und schreibt einen Audit-Eintrag.
      const res = await createCareNoteAction({
        clientId: cid,
        content: content.trim(),
        category,
        authorRole: role,
        isUrgent: urgent,
        isInternal: internal,
      })
      if (!res.ok) { setErr(res.error); setSaving(false); return }
      setContent(''); setUrgent(false); setInternal(false); setCategory('allgemein')
      setSaving(false)
      onSaved()
    } catch (e: any) {
      setErr(e?.message || 'Speichern fehlgeschlagen.')
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {err && <Banner tone="danger">{err}</Banner>}

      {!clientId && (
        <Field label="Klient *">
          <select value={selClient} onChange={e => setSelClient(e.target.value)} style={inputStyle}>
            <option value="">— Klient wählen —</option>
            {(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Field label="Kategorie">
          <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
            {Object.entries(NOTE_CATEGORY).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Erstellt als">
          <select value={role} onChange={e => setRole(e.target.value)} style={inputStyle}>
            <option value="buero">Büro</option>
            <option value="pdl">PDL</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
      </div>

      <Field label="Notiz *">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={4}
          placeholder="Was ist passiert? Was muss das Team wissen?"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
        />
      </Field>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 14, color: 'var(--ink2)' }}>
        <label style={checkLabel}>
          <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} />
          🚨 Dringend
        </label>
        <label style={checkLabel}>
          <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />
          🔒 Intern (nur Büro/PDL)
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
        {onCancel && <button className="btn-cancel" onClick={onCancel}>Abbrechen</button>}
        <button className="btn-confirm" onClick={save} disabled={saving}>
          {saving ? 'Speichern…' : 'Notiz speichern'}
        </button>
      </div>
    </div>
  )
}

// ── Klienten-Panel (Notizen-Tab auf der Detailseite) ────────────
export function CareNotesPanel({ clientId }: { clientId: string }) {
  const [notes, setNotes] = useState<CareNote[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('care_notes')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) { setLoadErr(error.message); return }
      setLoadErr(null)
      setNotes((data || []) as CareNote[])
    } catch (e: any) {
      setLoadErr(e?.message || 'Notizen konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const list = catFilter === 'all' ? notes : notes.filter(n => n.category === catFilter)
    // Dringende zuerst, danach neueste zuerst
    return [...list].sort((a, b) =>
      (Number(b.is_urgent) - Number(a.is_urgent)) || b.created_at.localeCompare(a.created_at)
    )
  }, [notes, catFilter])

  const urgentCount = notes.filter(n => n.is_urgent).length

  return (
    <div>
      <h2 style={{ marginTop: 8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        Notizen
        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', fontFamily: 'inherit' }}>
          ({notes.length}{urgentCount > 0 ? ` · ${urgentCount} dringend` : ''})
        </span>
        <button onClick={() => setShowForm(v => !v)} style={addBtn}>
          {showForm ? 'Formular schließen' : '+ Notiz'}
        </button>
      </h2>

      {showForm && (
        <div className="admin-stat-card" style={{ padding: 20, marginBottom: 16 }}>
          <NoteComposer
            clientId={clientId}
            onSaved={() => { setShowForm(false); load() }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div className="admin-filters" style={{ marginBottom: 14 }}>
        <button className={`admin-filter-btn ${catFilter === 'all' ? 'active' : ''}`} onClick={() => setCatFilter('all')}>
          Alle
        </button>
        {Object.entries(NOTE_CATEGORY).map(([k, v]) => {
          const count = notes.filter(n => n.category === k).length
          if (count === 0 && catFilter !== k) return null
          return (
            <button key={k} className={`admin-filter-btn ${catFilter === k ? 'active' : ''}`} onClick={() => setCatFilter(k)}>
              {v.emoji} {v.label} ({count})
            </button>
          )
        })}
      </div>

      {loadErr && <Banner tone="danger">{loadErr}</Banner>}

      {loading ? <p>Laden…</p> : filtered.length === 0 ? (
        <p style={{ color: 'var(--muted)', padding: '24px 0', textAlign: 'center' }}>
          {catFilter !== 'all' ? 'Keine Notizen in dieser Kategorie.' : 'Noch keine Notizen zu diesem Klienten.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(n => <NoteCard key={n.id} note={n} />)}
        </div>
      )}
    </div>
  )
}

// ── Bausteine & Styles ──────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', flex: 1, minWidth: 160}}>
      <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>{label}</span>
      <div style={{ marginTop: 3 }}>{children}</div>
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box', marginBottom: 0,
}

const checkLabel: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none',
}

const addBtn: React.CSSProperties = {
  marginLeft: 'auto', fontSize: 13, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit',
}
