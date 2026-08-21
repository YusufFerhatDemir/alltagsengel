'use client'

import { useCallback, useEffect, useState } from 'react'
import { StatusBadge, Banner, EmptyRow } from '@/components/admin/OpsUI'
import { ROLLEN_LABEL, BEREICH_LABEL, FREIGABE_BEREICHE, ANGEHOERIGEN_ROLLEN } from '@/lib/angehoerige/types'
import type { AngehoerigenRolle, FreigabeBereich, FreigabeStatus } from '@/lib/angehoerige/types'
import DialogOverlay from '@/components/DialogOverlay'

// ═══════════════════════════════════════════════════════════════
// Admin — Angehörigenzugänge verwalten
// Einladung (Zugang erteilen), Widerruf, Freigabe-Bereiche ändern
// ═══════════════════════════════════════════════════════════════

interface ZugangRow {
  id: string
  user_id: string
  client_id: string
  rolle: AngehoerigenRolle
  status: FreigabeStatus
  freigegebene_bereiche: FreigabeBereich[]
  pflegeberichte_freigegeben: boolean
  erteilt_von: string | null
  erteilt_am: string
  widerrufen_am: string | null
  widerruf_grund: string | null
  gueltig_bis: string | null
  created_at: string
  // Enriched
  user_name?: string
  user_email?: string
  client_name?: string
}

const STATUS_META: Record<FreigabeStatus, { label: string; color: string }> = {
  aktiv: { label: 'Aktiv', color: '#2a7' },
  widerrufen: { label: 'Widerrufen', color: '#D04B3B' },
  abgelaufen: { label: 'Abgelaufen', color: '#999' },
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
const actionBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', background: 'rgba(201,150,60,0.1)',
  border: '1px solid rgba(201,150,60,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const dangerBtn: React.CSSProperties = {
  fontSize: 12, color: '#D04B3B', background: 'rgba(208,75,59,0.08)',
  border: '1px solid rgba(208,75,59,0.25)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const modalInput: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box',
}
const modalSelect: React.CSSProperties = { ...modalInput }

export default function AngehoerigeAdminPage() {
  const [zugaenge, setZugaenge] = useState<ZugangRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'alle' | FreigabeStatus>('alle')
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [revokeId, setRevokeId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const params = statusFilter !== 'alle' ? `?status=${statusFilter}` : ''
      const res = await fetch(`/api/admin/angehoerige${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Zugänge konnten nicht geladen werden.')
      }
      const data = await res.json()

      setZugaenge(data as ZugangRow[])
    } catch (err: any) {
      setError(err?.message || 'Fehler beim Laden.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  const filtered = zugaenge.filter(z => statusFilter === 'alle' || z.status === statusFilter)
  const aktiveCount = zugaenge.filter(z => z.status === 'aktiv').length

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Angehörigenzugänge</h1>
          <p className="admin-subtitle">
            Portal-Zugänge für Angehörige verwalten — {aktiveCount} aktiv
          </p>
        </div>
        <button style={primaryBtn} onClick={() => setShowCreate(true)}>
          + Zugang erteilen
        </button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {/* Filter */}
      <div className="admin-filters" style={{ marginBottom: 16 }}>
        {(['alle', 'aktiv', 'widerrufen', 'abgelaufen'] as const).map(f => (
          <button
            key={f}
            className={`admin-filter-btn ${statusFilter === f ? 'active' : ''}`}
            onClick={() => setStatusFilter(f)}
          >
            {f === 'alle' ? 'Alle' : STATUS_META[f]?.label || f}
          </button>
        ))}
      </div>

      {loading ? <p>Laden...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Benutzer</th>
                <th>Klient</th>
                <th>Rolle</th>
                <th>Bereiche</th>
                <th>Status</th>
                <th>Erteilt am</th>
                <th>Gültig bis</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={8}>Keine Zugänge vorhanden.</EmptyRow>
              ) : (
                filtered.map(z => {
                  const sm = STATUS_META[z.status] || { label: z.status, color: '#999' }
                  const istAbgelaufen = z.gueltig_bis && new Date(z.gueltig_bis) < new Date()
                  return (
                    <tr key={z.id}>
                      <td style={{ fontSize: 13 }}>
                        <div style={{ fontWeight: 600 }}>{z.user_name || z.user_id.slice(0, 8) + '...'}</div>
                        {z.user_email && <div style={{ fontSize: 11, color: 'var(--ink4)' }}>{z.user_email}</div>}
                      </td>
                      <td style={{ fontSize: 13, fontWeight: 600 }}>
                        {z.client_name || z.client_id.slice(0, 8) + '...'}
                      </td>
                      <td>
                        <StatusBadge label={ROLLEN_LABEL[z.rolle] || z.rolle} color="var(--gold2)" />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {z.freigegebene_bereiche.map(b => (
                            <span key={b} style={{
                              fontSize: 10, padding: '2px 6px', borderRadius: 4,
                              background: 'rgba(201,150,60,0.1)', color: 'var(--gold2)',
                            }}>
                              {BEREICH_LABEL[b] || b}
                            </span>
                          ))}
                          {z.pflegeberichte_freigegeben && (
                            <span style={{
                              fontSize: 10, padding: '2px 6px', borderRadius: 4,
                              background: 'rgba(92,184,130,0.1)', color: '#2a7',
                            }}>
                              Pflegeberichte
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <StatusBadge
                          label={istAbgelaufen ? 'Abgelaufen' : sm.label}
                          color={istAbgelaufen ? '#999' : sm.color}
                        />
                      </td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {z.erteilt_am ? new Date(z.erteilt_am).toLocaleDateString('de-DE') : '—'}
                      </td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {z.gueltig_bis ? new Date(z.gueltig_bis).toLocaleDateString('de-DE') : 'Unbefristet'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {z.status === 'aktiv' && (
                            <>
                              <button style={actionBtn} onClick={() => setEditId(z.id)}>
                                Bereiche
                              </button>
                              <button style={dangerBtn} onClick={() => setRevokeId(z.id)}>
                                Widerrufen
                              </button>
                            </>
                          )}
                          {z.status === 'widerrufen' && z.widerruf_grund && (
                            <span style={{ fontSize: 11, color: 'var(--ink4)', fontStyle: 'italic' }}>
                              {z.widerruf_grund}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateZugangModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load() }}
        />
      )}

      {editId && (
        <EditFreigabenModal
          zugangId={editId}
          zugang={zugaenge.find(z => z.id === editId)!}
          onClose={() => setEditId(null)}
          onSaved={() => { setEditId(null); load() }}
        />
      )}

      {revokeId && (
        <RevokeModal
          zugangId={revokeId}
          onClose={() => setRevokeId(null)}
          onRevoked={() => { setRevokeId(null); load() }}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Zugang erteilen (Einladung)
// ═══════════════════════════════════════════════════════════════
function CreateZugangModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [userId, setUserId] = useState('')
  const [clientId, setClientId] = useState('')
  const [rolle, setRolle] = useState<AngehoerigenRolle>('angehoeriger')
  const [bereiche, setBereiche] = useState<FreigabeBereich[]>(['termine', 'leistungen', 'nachrichten'])
  const [pflegeberichte, setPflegeberichte] = useState(false)
  const [gueltigBis, setGueltigBis] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function toggleBereich(b: FreigabeBereich) {
    setBereiche(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])
  }

  async function save() {
    setErr(null)
    if (!userId.trim()) { setErr('Bitte eine Benutzer-ID angeben.'); return }
    if (!clientId.trim()) { setErr('Bitte eine Klient-ID angeben.'); return }
    if (bereiche.length === 0) { setErr('Mindestens ein Freigabebereich muss gewählt werden.'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/angehoerige', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId.trim(),
          client_id: clientId.trim(),
          rolle,
          freigegebene_bereiche: bereiche,
          pflegeberichte_freigegeben: pflegeberichte,
          gueltig_bis: gueltigBis || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Zugang konnte nicht erteilt werden.')
      }
      onSaved()
    } catch (error: any) {
      setErr(error?.message || 'Fehler beim Speichern.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogOverlay onClose={onClose}>
      <div role="dialog" aria-label="Zugang erteilen" aria-modal="true" className="admin-modal" style={{ maxWidth: 520, width: '92%' }} onClick={e => e.stopPropagation()}>
        <h3>Zugang erteilen</h3>
        <p style={{ fontSize: 12, color: 'var(--ink4)', margin: '0 0 16px' }}>
          Einem Angehörigen Zugang zum Portal gewähren. Der Benutzer muss bereits registriert sein.
        </p>

        {err && <Banner tone="danger">{err}</Banner>}

        <Field label="Benutzer-ID (UUID) *">
          <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="UUID des Angehörigen-Benutzers" style={modalInput} />
        </Field>

        <Field label="Klient-ID (UUID) *">
          <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="UUID des Klienten" style={modalInput} />
        </Field>

        <Field label="Rolle *">
          <select value={rolle} onChange={e => setRolle(e.target.value as AngehoerigenRolle)} style={modalSelect}>
            {ANGEHOERIGEN_ROLLEN.map(r => (
              <option key={r} value={r}>{ROLLEN_LABEL[r]}</option>
            ))}
          </select>
        </Field>

        <Field label="Freigegebene Bereiche *">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {FREIGABE_BEREICHE.map(b => (
              <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--ink2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={bereiche.includes(b)} onChange={() => toggleBereich(b)} />
                {BEREICH_LABEL[b]}
              </label>
            ))}
          </div>
        </Field>

        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Pflegeberichte freigeben">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={pflegeberichte} onChange={e => setPflegeberichte(e.target.checked)} />
              Ja, Pflegeberichte einsehbar
            </label>
          </Field>
          <Field label="Gültig bis (optional)">
            <input type="date" value={gueltigBis} onChange={e => setGueltigBis(e.target.value)} style={modalInput} />
          </Field>
        </div>

        <div className="admin-modal-btns" style={{ marginTop: 14 }}>
          <button className="btn-cancel" onClick={onClose}>Abbrechen</button>
          <button className="btn-confirm" onClick={save} disabled={saving}>
            {saving ? 'Speichern...' : 'Zugang erteilen'}
          </button>
        </div>
      </div>
    </DialogOverlay>
  )
}

// ═══════════════════════════════════════════════════════════════
// Freigabe-Bereiche bearbeiten
// ═══════════════════════════════════════════════════════════════
function EditFreigabenModal({ zugangId, zugang, onClose, onSaved }: {
  zugangId: string; zugang: ZugangRow; onClose: () => void; onSaved: () => void
}) {
  const [bereiche, setBereiche] = useState<FreigabeBereich[]>(zugang.freigegebene_bereiche)
  const [pflegeberichte, setPflegeberichte] = useState(zugang.pflegeberichte_freigegeben)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function toggleBereich(b: FreigabeBereich) {
    setBereiche(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])
  }

  async function save() {
    setErr(null)
    if (bereiche.length === 0) { setErr('Mindestens ein Bereich muss freigegeben sein.'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/angehoerige/${zugangId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          freigegebene_bereiche: bereiche,
          pflegeberichte_freigegeben: pflegeberichte,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Freigaben konnten nicht aktualisiert werden.')
      }
      onSaved()
    } catch (error: any) {
      setErr(error?.message || 'Fehler beim Speichern.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogOverlay onClose={onClose}>
      <div role="dialog" aria-label="Freigabe-Bereiche bearbeiten" aria-modal="true" className="admin-modal" style={{ maxWidth: 460, width: '92%' }} onClick={e => e.stopPropagation()}>
        <h3>Freigabe-Bereiche bearbeiten</h3>

        {err && <Banner tone="danger">{err}</Banner>}

        <Field label="Freigegebene Bereiche">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {FREIGABE_BEREICHE.map(b => (
              <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--ink2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={bereiche.includes(b)} onChange={() => toggleBereich(b)} />
                {BEREICH_LABEL[b]}
              </label>
            ))}
          </div>
        </Field>

        <Field label="Pflegeberichte">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={pflegeberichte} onChange={e => setPflegeberichte(e.target.checked)} />
            Pflegeberichte einsehbar
          </label>
        </Field>

        <div className="admin-modal-btns" style={{ marginTop: 14 }}>
          <button className="btn-cancel" onClick={onClose}>Abbrechen</button>
          <button className="btn-confirm" onClick={save} disabled={saving}>
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </DialogOverlay>
  )
}

// ═══════════════════════════════════════════════════════════════
// Zugang widerrufen
// ═══════════════════════════════════════════════════════════════
function RevokeModal({ zugangId, onClose, onRevoked }: {
  zugangId: string; onClose: () => void; onRevoked: () => void
}) {
  const [grund, setGrund] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function revoke() {
    setErr(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/angehoerige/${zugangId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'widerrufen', grund: grund.trim() || undefined }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Zugang konnte nicht widerrufen werden.')
      }
      onRevoked()
    } catch (error: any) {
      setErr(error?.message || 'Fehler beim Widerrufen.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogOverlay onClose={onClose}>
      <div role="dialog" aria-label="Zugang widerrufen" aria-modal="true" className="admin-modal" style={{ maxWidth: 420, width: '92%' }} onClick={e => e.stopPropagation()}>
        <h3>Zugang widerrufen</h3>
        <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '0 0 16px' }}>
          Der Angehörige verliert sofort den Zugang zum Portal. Diese Aktion wird im Audit-Log protokolliert.
        </p>

        {err && <Banner tone="danger">{err}</Banner>}

        <Field label="Grund (optional)">
          <input value={grund} onChange={e => setGrund(e.target.value)} placeholder="z. B. Betreuung beendet" style={modalInput} />
        </Field>

        <div className="admin-modal-btns" style={{ marginTop: 14 }}>
          <button className="btn-cancel" onClick={onClose}>Abbrechen</button>
          <button
            className="btn-confirm"
            onClick={revoke}
            disabled={saving}
            style={{ background: '#D04B3B' }}
          >
            {saving ? 'Widerrufen...' : 'Zugang widerrufen'}
          </button>
        </div>
      </div>
    </DialogOverlay>
  )
}

// ═══════════════════════════════════════════════════════════════
// Hilfsfunktionen
// ═══════════════════════════════════════════════════════════════
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', flex: 1, minWidth: 0, marginBottom: 10}}>
      <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>{label}</span>
      <div style={{ marginTop: 3 }}>{children}</div>
    </label>
  )
}
