'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  statusMeta, formatDate, timeAgo,
  AUFGABEN_STATUS, AUFGABEN_KATEGORIE, AUFGABEN_PRIORITAET,
  WIEDERHOLUNG_INTERVALL, FAELLIGKEITS_STATUS,
  ESKALATION_AN_ROLLE,
} from '@/lib/admin/ops'
import { StatusBadge, Banner } from '@/components/admin/OpsUI'

// ── Types ──────────────────────────────────────────────────────

interface Aufgabe {
  id: string
  titel: string
  beschreibung: string | null
  kategorie: string
  prioritaet: string
  status: string
  verantwortlich_id: string | null
  verantwortlich_name: string | null
  stellvertreter_id: string | null
  stellvertreter_name: string | null
  faellig_am: string | null
  faelligkeits_status: string | null
  client_id: string | null
  caregiver_id: string | null
  ist_wiederkehrend: boolean
  wiederholung_intervall: string | null
  wiederholung_ende: string | null
  tags: string[] | null
  created_at: string | null
  updated_at: string | null
}

interface ChecklistItem {
  id: string
  titel: string
  erledigt: boolean
  position: number
}

interface Kommentar {
  id: string
  inhalt: string
  ist_intern: boolean
  autor_name: string | null
  created_at: string | null
}

interface Anhang {
  id: string
  dokument_id: string
  hinzugefuegt_von: string | null
  created_at: string | null
}

interface EskalationsEintrag {
  id: string
  eskalationsstufe: number
  eskalation_an_rolle: string | null
  grund: string | null
  created_at: string | null
}

type Tab = 'details' | 'checkliste' | 'kommentare' | 'anhaenge' | 'eskalation'

const TABS: { key: Tab; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'checkliste', label: 'Checkliste' },
  { key: 'kommentare', label: 'Kommentare' },
  { key: 'anhaenge', label: 'Anhänge' },
  { key: 'eskalation', label: 'Eskalation' },
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
  textDecoration: 'none', display: 'inline-block',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal3)', color: 'var(--ink)', fontSize: 14,
  fontFamily: "'Jost',sans-serif", boxSizing: 'border-box',
}

const fieldRow: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, alignItems: 'center',
  padding: '8px 0', borderBottom: '1px solid var(--border)',
}

const fieldLabel: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: 'var(--ink4)',
}

// ── Page Component ─────────────────────────────────────────────

export default function AufgabeDetailPage() {
  const params = useParams()
  const aufgabeId = params.id as string

  const [tab, setTab] = useState<Tab>('details')
  const [aufgabe, setAufgabe] = useState<Aufgabe | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  // Edit state
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState<Partial<Aufgabe>>({})

  // Tab data
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [kommentare, setKommentare] = useState<Kommentar[]>([])
  const [anhaenge, setAnhaenge] = useState<Anhang[]>([])
  const [eskalationen, setEskalationen] = useState<EskalationsEintrag[]>([])
  const [tabLoading, setTabLoading] = useState(false)

  // Checklist form
  const [newCheckText, setNewCheckText] = useState('')

  // Kommentar form
  const [newKommentar, setNewKommentar] = useState('')
  const [kommentarIntern, setKommentarIntern] = useState(false)

  // Anhang form
  const [newAnhangDokId, setNewAnhangDokId] = useState('')

  // Load Aufgabe
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/ops/aufgaben/${aufgabeId}`)
        if (!res.ok) { setLoading(false); return }
        const data = await res.json()
        setAufgabe(data)
        setEditData(data)
      } catch { /* ignore */ } finally { setLoading(false) }
    }
    load()
  }, [aufgabeId])

  // Load tab data
  useEffect(() => {
    async function loadTab() {
      setTabLoading(true)
      try {
        if (tab === 'checkliste') {
          const res = await fetch(`/api/ops/aufgaben/${aufgabeId}/checklisten`)
          if (res.ok) setChecklist(await res.json())
        } else if (tab === 'kommentare') {
          const res = await fetch(`/api/ops/aufgaben/${aufgabeId}/kommentare`)
          if (res.ok) setKommentare(await res.json())
        } else if (tab === 'anhaenge') {
          const res = await fetch(`/api/ops/aufgaben/${aufgabeId}/anhaenge`)
          if (res.ok) setAnhaenge(await res.json())
        } else if (tab === 'eskalation') {
          const res = await fetch(`/api/ops/eskalationshistorie?aufgabe_id=${aufgabeId}`)
          if (res.ok) setEskalationen(await res.json())
        }
      } catch { /* ignore */ } finally { setTabLoading(false) }
    }
    if (tab !== 'details') loadTab()
  }, [tab, aufgabeId])

  // Save details
  async function saveDetails() {
    if (!aufgabe) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const body: Record<string, unknown> = {}
      const fields: (keyof Aufgabe)[] = [
        'titel', 'beschreibung', 'kategorie', 'prioritaet', 'status',
        'verantwortlich_id', 'stellvertreter_id', 'faellig_am',
        'client_id', 'caregiver_id',
        'ist_wiederkehrend', 'wiederholung_intervall', 'wiederholung_ende',
      ]
      for (const f of fields) {
        if (editData[f] !== aufgabe[f]) {
          body[f] = editData[f] ?? null
        }
      }
      if (Object.keys(body).length === 0) {
        setSaveMsg('Keine Änderungen')
        setSaving(false)
        setEditMode(false)
        return
      }
      const res = await fetch(`/api/ops/aufgaben/${aufgabeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setSaveMsg(err.error || 'Fehler beim Speichern')
        setSaving(false)
        return
      }
      const updated = await res.json()
      setAufgabe(updated)
      setEditData(updated)
      setEditMode(false)
      setSaveMsg('Gespeichert')
    } catch {
      setSaveMsg('Netzwerkfehler')
    } finally { setSaving(false) }
  }

  // Checklist operations
  async function toggleCheck(item: ChecklistItem) {
    const res = await fetch(`/api/ops/aufgaben/${aufgabeId}/checklisten/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ erledigt: !item.erledigt }),
    })
    if (res.ok) {
      setChecklist(prev => prev.map(c => c.id === item.id ? { ...c, erledigt: !c.erledigt } : c))
    }
  }

  async function addCheckItem() {
    if (!newCheckText.trim()) return
    const res = await fetch(`/api/ops/aufgaben/${aufgabeId}/checklisten`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titel: newCheckText.trim() }),
    })
    if (res.ok) {
      const item = await res.json()
      setChecklist(prev => [...prev, item])
      setNewCheckText('')
    }
  }

  async function deleteCheckItem(itemId: string) {
    const res = await fetch(`/api/ops/aufgaben/${aufgabeId}/checklisten/${itemId}`, { method: 'DELETE' })
    if (res.ok) {
      setChecklist(prev => prev.filter(c => c.id !== itemId))
    }
  }

  // Kommentar operations
  async function addKommentar() {
    if (!newKommentar.trim()) return
    const res = await fetch(`/api/ops/aufgaben/${aufgabeId}/kommentare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inhalt: newKommentar.trim(), ist_intern: kommentarIntern }),
    })
    if (res.ok) {
      const k = await res.json()
      setKommentare(prev => [...prev, k])
      setNewKommentar('')
      setKommentarIntern(false)
    }
  }

  // Anhang operations
  async function addAnhang() {
    if (!newAnhangDokId.trim()) return
    const res = await fetch(`/api/ops/aufgaben/${aufgabeId}/anhaenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dokument_id: newAnhangDokId.trim(),
      }),
    })
    if (res.ok) {
      const a = await res.json()
      setAnhaenge(prev => [...prev, a])
      setNewAnhangDokId('')
    }
  }

  async function deleteAnhang(anhangId: string) {
    const res = await fetch(`/api/ops/aufgaben/${aufgabeId}/anhaenge?id=${anhangId}`, { method: 'DELETE' })
    if (res.ok) {
      setAnhaenge(prev => prev.filter(a => a.id !== anhangId))
    }
  }

  if (loading) return <div className="admin-page"><p>Laden...</p></div>
  if (!aufgabe) return <div className="admin-page"><p>Aufgabe nicht gefunden</p></div>

  const st = statusMeta(AUFGABEN_STATUS, aufgabe.status)
  const prio = statusMeta(AUFGABEN_PRIORITAET, aufgabe.prioritaet)
  const kat = statusMeta(AUFGABEN_KATEGORIE, aufgabe.kategorie)

  const checkDone = checklist.filter(c => c.erledigt).length
  const checkTotal = checklist.length
  const checkPct = checkTotal > 0 ? Math.round((checkDone / checkTotal) * 100) : 0

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <h1>{aufgabe.titel}</h1>
          <p className="admin-subtitle">
            <StatusBadge label={st.label} color={st.color} />{' '}
            <StatusBadge label={prio.label} color={prio.color} />{' '}
            <StatusBadge label={kat.label} color={kat.color} />{' '}
            {aufgabe.faelligkeits_status && (
              <StatusBadge
                label={statusMeta(FAELLIGKEITS_STATUS, aufgabe.faelligkeits_status).label}
                color={statusMeta(FAELLIGKEITS_STATUS, aufgabe.faelligkeits_status).color}
              />
            )}
          </p>
        </div>
        <Link href="/admin/aufgaben" style={secondaryBtn}>Zurück</Link>
      </div>

      {saveMsg && <Banner tone={saveMsg === 'Gespeichert' || saveMsg === 'Keine Änderungen' ? 'success' : 'danger'}>{saveMsg}</Banner>}

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

      {/* ── Tab: Details ──────────────────────────────────── */}
      {tab === 'details' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            {editMode ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={secondaryBtn} onClick={() => { setEditMode(false); setEditData(aufgabe) }}>
                  Abbrechen
                </button>
                <button style={primaryBtn} onClick={saveDetails} disabled={saving}>
                  {saving ? 'Speichere...' : 'Speichern'}
                </button>
              </div>
            ) : (
              <button style={primaryBtn} onClick={() => setEditMode(true)}>Bearbeiten</button>
            )}
          </div>

          <div style={{ maxWidth: 700 }}>
            <div style={fieldRow}>
              <span style={fieldLabel}>Titel</span>
              {editMode
                ? <input style={inputStyle} value={editData.titel || ''} onChange={e => setEditData(p => ({ ...p, titel: e.target.value }))} />
                : <span>{aufgabe.titel}</span>}
            </div>

            <div style={fieldRow}>
              <span style={fieldLabel}>Beschreibung</span>
              {editMode
                ? <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={editData.beschreibung || ''} onChange={e => setEditData(p => ({ ...p, beschreibung: e.target.value }))} />
                : <span style={{ whiteSpace: 'pre-wrap' }}>{aufgabe.beschreibung || '—'}</span>}
            </div>

            <div style={fieldRow}>
              <span style={fieldLabel}>Kategorie</span>
              {editMode
                ? <select style={inputStyle} value={editData.kategorie || ''} onChange={e => setEditData(p => ({ ...p, kategorie: e.target.value }))}>
                    {Object.entries(AUFGABEN_KATEGORIE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                : <StatusBadge label={kat.label} color={kat.color} />}
            </div>

            <div style={fieldRow}>
              <span style={fieldLabel}>Priorität</span>
              {editMode
                ? <select style={inputStyle} value={editData.prioritaet || ''} onChange={e => setEditData(p => ({ ...p, prioritaet: e.target.value }))}>
                    {Object.entries(AUFGABEN_PRIORITAET).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                : <StatusBadge label={prio.label} color={prio.color} />}
            </div>

            <div style={fieldRow}>
              <span style={fieldLabel}>Status</span>
              {editMode
                ? <select style={inputStyle} value={editData.status || ''} onChange={e => setEditData(p => ({ ...p, status: e.target.value }))}>
                    {Object.entries(AUFGABEN_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                : <StatusBadge label={st.label} color={st.color} />}
            </div>

            <div style={fieldRow}>
              <span style={fieldLabel}>Verantwortlich</span>
              {editMode
                ? <input style={inputStyle} value={editData.verantwortlich_id || ''} onChange={e => setEditData(p => ({ ...p, verantwortlich_id: e.target.value }))} placeholder="UUID" />
                : <span>{aufgabe.verantwortlich_name || '—'}</span>}
            </div>

            <div style={fieldRow}>
              <span style={fieldLabel}>Stellvertreter</span>
              {editMode
                ? <input style={inputStyle} value={editData.stellvertreter_id || ''} onChange={e => setEditData(p => ({ ...p, stellvertreter_id: e.target.value }))} placeholder="UUID" />
                : <span>{aufgabe.stellvertreter_name || '—'}</span>}
            </div>

            <div style={fieldRow}>
              <span style={fieldLabel}>Fällig am</span>
              {editMode
                ? <input type="date" style={inputStyle} value={editData.faellig_am || ''} onChange={e => setEditData(p => ({ ...p, faellig_am: e.target.value }))} />
                : <span>{formatDate(aufgabe.faellig_am)}</span>}
            </div>

            <div style={fieldRow}>
              <span style={fieldLabel}>Klient</span>
              {editMode
                ? <input style={inputStyle} value={editData.client_id || ''} onChange={e => setEditData(p => ({ ...p, client_id: e.target.value }))} placeholder="UUID" />
                : <span style={{ fontSize: 13 }}>{aufgabe.client_id || '—'}</span>}
            </div>

            <div style={fieldRow}>
              <span style={fieldLabel}>Betreuungskraft</span>
              {editMode
                ? <input style={inputStyle} value={editData.caregiver_id || ''} onChange={e => setEditData(p => ({ ...p, caregiver_id: e.target.value }))} placeholder="UUID" />
                : <span style={{ fontSize: 13 }}>{aufgabe.caregiver_id || '—'}</span>}
            </div>

            <div style={fieldRow}>
              <span style={fieldLabel}>Tags</span>
              <span>{aufgabe.tags?.length ? aufgabe.tags.join(', ') : '—'}</span>
            </div>

            <div style={fieldRow}>
              <span style={fieldLabel}>Wiederkehrend</span>
              {editMode ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="checkbox" checked={!!editData.ist_wiederkehrend} onChange={e => setEditData(p => ({ ...p, ist_wiederkehrend: e.target.checked }))} />
                  <span style={{ fontSize: 13, color: 'var(--ink4)' }}>Ja</span>
                </div>
              ) : (
                <span>{aufgabe.ist_wiederkehrend ? 'Ja' : 'Nein'}</span>
              )}
            </div>

            {(aufgabe.ist_wiederkehrend || editData.ist_wiederkehrend) && (
              <>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Intervall</span>
                  {editMode
                    ? <select style={inputStyle} value={editData.wiederholung_intervall || ''} onChange={e => setEditData(p => ({ ...p, wiederholung_intervall: e.target.value }))}>
                        <option value="">Bitte wählen</option>
                        {Object.entries(WIEDERHOLUNG_INTERVALL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    : <span>{aufgabe.wiederholung_intervall ? statusMeta(WIEDERHOLUNG_INTERVALL, aufgabe.wiederholung_intervall).label : '—'}</span>}
                </div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Wiederholung bis</span>
                  {editMode
                    ? <input type="date" style={inputStyle} value={editData.wiederholung_ende || ''} onChange={e => setEditData(p => ({ ...p, wiederholung_ende: e.target.value }))} />
                    : <span>{formatDate(aufgabe.wiederholung_ende)}</span>}
                </div>
              </>
            )}

            <div style={{ ...fieldRow, borderBottom: 'none' }}>
              <span style={fieldLabel}>Erstellt</span>
              <span style={{ fontSize: 13, color: 'var(--ink4)' }}>
                {formatDate(aufgabe.created_at)} ({timeAgo(aufgabe.created_at)})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Checkliste ──────────────────────────────── */}
      {tab === 'checkliste' && (
        <div>
          {tabLoading ? <p>Laden...</p> : (
            <>
              {checkTotal > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{checkDone}/{checkTotal} erledigt</span>
                    <span style={{ fontSize: 13, color: 'var(--ink4)' }}>{checkPct}%</span>
                  </div>
                  <div style={{
                    height: 8, borderRadius: 6, background: 'var(--coal3)',
                    overflow: 'hidden', maxWidth: 400,
                  }}>
                    <div style={{
                      width: `${checkPct}%`, height: '100%', background: '#5CB882',
                      borderRadius: 6, transition: 'width .3s',
                    }} />
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                {checklist.map(item => (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 0', borderBottom: '1px solid var(--border)',
                  }}>
                    <input
                      type="checkbox"
                      checked={item.erledigt}
                      onChange={() => toggleCheck(item)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{
                      flex: 1, fontSize: 14,
                      textDecoration: item.erledigt ? 'line-through' : 'none',
                      color: item.erledigt ? 'var(--ink4)' : 'var(--ink)',
                    }}>
                      {item.titel}
                    </span>
                    <button
                      onClick={() => deleteCheckItem(item.id)}
                      style={{ fontSize: 12, color: '#D04B3B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Entfernen
                    </button>
                  </div>
                ))}
                {checklist.length === 0 && <p style={{ color: 'var(--ink4)', fontSize: 13 }}>Noch keine Punkte</p>}
              </div>

              <div style={{ display: 'flex', gap: 8, maxWidth: 500 }}>
                <input
                  style={inputStyle}
                  value={newCheckText}
                  onChange={e => setNewCheckText(e.target.value)}
                  placeholder="Neuer Punkt..."
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCheckItem())}
                />
                <button onClick={addCheckItem} style={primaryBtn}>Hinzufügen</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Kommentare ──────────────────────────────── */}
      {tab === 'kommentare' && (
        <div>
          {tabLoading ? <p>Laden...</p> : (
            <>
              <div style={{ marginBottom: 16 }}>
                {kommentare.map(k => (
                  <div key={k.id} style={{
                    background: 'var(--coal2)', borderRadius: 10, padding: 14,
                    border: '1px solid var(--border)', marginBottom: 8,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{k.autor_name || '—'}</span>
                        {k.ist_intern && (
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 4,
                            background: 'rgba(153,153,153,.15)', color: '#999', fontWeight: 600,
                          }}>
                            Intern
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--ink4)' }}>{timeAgo(k.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {k.inhalt}
                    </div>
                  </div>
                ))}
                {kommentare.length === 0 && <p style={{ color: 'var(--ink4)', fontSize: 13 }}>Noch keine Kommentare</p>}
              </div>

              <div style={{
                background: 'var(--coal2)', borderRadius: 12, padding: 16,
                border: '1px solid var(--border)', maxWidth: 600,
              }}>
                <h3 style={{ fontSize: 14, marginBottom: 10 }}>Kommentar hinzufügen</h3>
                <textarea
                  style={{ ...inputStyle, minHeight: 80, resize: 'vertical', marginBottom: 10 }}
                  value={newKommentar}
                  onChange={e => setNewKommentar(e.target.value)}
                  placeholder="Kommentar schreiben..."
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink4)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={kommentarIntern} onChange={e => setKommentarIntern(e.target.checked)} />
                    Interner Kommentar
                  </label>
                  <button onClick={addKommentar} style={primaryBtn} disabled={!newKommentar.trim()}>
                    Kommentieren
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Anhänge ──────────────────────────────── */}
      {tab === 'anhaenge' && (
        <div>
          {tabLoading ? <p>Laden...</p> : (
            <>
              <div style={{ marginBottom: 16 }}>
                {anhaenge.map(a => (
                  <div key={a.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0', borderBottom: '1px solid var(--border)',
                  }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>Dok: {a.dokument_id.slice(0, 8)}...</span>
                      <span style={{ fontSize: 12, color: 'var(--ink4)', marginLeft: 8 }}>{timeAgo(a.created_at)}</span>
                    </div>
                    <button
                      onClick={() => deleteAnhang(a.id)}
                      style={{ fontSize: 12, color: '#D04B3B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Entfernen
                    </button>
                  </div>
                ))}
                {anhaenge.length === 0 && <p style={{ color: 'var(--ink4)', fontSize: 13 }}>Noch keine Anhänge</p>}
              </div>

              <div style={{
                background: 'var(--coal2)', borderRadius: 12, padding: 16,
                border: '1px solid var(--border)', maxWidth: 500,
              }}>
                <h3 style={{ fontSize: 14, marginBottom: 10 }}>Anhang hinzufügen</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  <input
                    style={inputStyle}
                    value={newAnhangDokId}
                    onChange={e => setNewAnhangDokId(e.target.value)}
                    placeholder="Dokument-ID (UUID)"
                  />
                </div>
                <button onClick={addAnhang} style={primaryBtn} disabled={!newAnhangDokId.trim()}>
                  Hinzufügen
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Eskalation ──────────────────────────────── */}
      {tab === 'eskalation' && (
        <div>
          {tabLoading ? <p>Laden...</p> : (
            <>
              {eskalationen.length === 0 ? (
                <p style={{ color: 'var(--ink4)', fontSize: 13 }}>Keine Eskalationen für diese Aufgabe</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Zeitpunkt</th>
                        <th>Stufe</th>
                        <th>Rolle</th>
                        <th>Grund</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eskalationen.map(e => {
                        const rolle = statusMeta(ESKALATION_AN_ROLLE, e.eskalation_an_rolle)
                        return (
                          <tr key={e.id}>
                            <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(e.created_at)} ({timeAgo(e.created_at)})</td>
                            <td style={{ fontSize: 13, textAlign: 'center' }}>{e.eskalationsstufe}</td>
                            <td><StatusBadge label={rolle.label} color={rolle.color} /></td>
                            <td style={{ fontSize: 13 }}>{e.grund || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
