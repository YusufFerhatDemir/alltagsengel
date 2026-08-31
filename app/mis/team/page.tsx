'use client'
import { heuteBerlin } from '@/lib/utils/timezone';
import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, KpiCard, DataTable, MisButton, Badge, Tabs, Modal } from '@/components/mis/MisComponents'
import { useMis } from '@/lib/mis/MisContext'
import { SERVICE_TYPES, BUDGET_TYPE, RECORD_STATUS, diffMinutes, formatDuration, statusMeta } from '@/lib/admin/ops'
import { saveServiceRecord } from '@/lib/admin/service-records'
import { createTask, updateProfile } from './actions'
import { logger } from '@/lib/logger';
const log = logger.child('mis:team');

export default function TeamPage() {
  const { isMobile } = useMis()
  const [users, setUsers] = useState<Record<string,unknown>[]>([])
  const [tasks, setTasks] = useState<Record<string,unknown>[]>([])
  const [tab, setTab] = useState('members')
  const [taskOpen, setTaskOpen] = useState(false)
  const [taskForm, setTaskForm] = useState({ title: '', module: 'Team', priority: 'medium', description: '', due_date: '' })
  const [editOpen, setEditOpen] = useState(false)
  const [editUser, setEditUser] = useState<Record<string,unknown> | null>(null)
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', email: '', phone: '', location: '', role: 'kunde' })

  // ── Leistungserfassung ──
  const [records, setRecords] = useState<Record<string,unknown>[]>([])
  const [caregivers, setCaregivers] = useState<{ id: string; label: string; initials: string }[]>([])
  const [clients, setClients] = useState<{ id: string; label: string }[]>([])
  const [recOpen, setRecOpen] = useState(false)
  const [recSaving, setRecSaving] = useState(false)
  const [recError, setRecError] = useState<string | null>(null)
  const [recForm, setRecForm] = useState({
    caregiver_id: '', client_id: '',
    date: heuteBerlin(),
    start_time: '', end_time: '',
    service_type: '', budget_type: 'entlastung',
    caregiver_initials: '', notes: '',
  })

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient()
        const [{ data: u, error: e1 }, { data: t, error: e2 }] = await Promise.all([
          supabase.from('profiles').select('*').order('created_at', { ascending: false }),
          supabase.from('mis_tasks').select('*').order('created_at', { ascending: false }).limit(20),
        ])
        if (e1) log.errorWithException('Profiles error', e1)
        if (e2) log.errorWithException('Tasks error', e2)
        setUsers(u || [])
        setTasks(t || [])
      } catch (err) { log.errorWithException('Team loadData error', err) }
    })()
    loadLeistungen()
  }, [])

  async function loadLeistungen() {
    try {
      const supabase = createClient()
      const [{ data: r, error: e1 }, { data: cg, error: e2 }, { data: cl, error: e3 }] = await Promise.all([
        supabase.from('service_records')
          .select('*, caregivers(first_name, last_name), clients(first_name, last_name)')
          .order('date', { ascending: false }).limit(100),
        supabase.from('caregivers').select('id, first_name, last_name, initials').order('last_name'),
        supabase.from('clients').select('id, first_name, last_name').order('last_name'),
      ])
      if (e1) log.errorWithException('Service records error', e1)
      if (e2) log.errorWithException('Caregivers error', e2)
      if (e3) log.errorWithException('Clients error', e3)
      setRecords(r || [])
      setCaregivers((cg || []).map((c: Record<string,unknown>) => ({
        id: c.id as string,
        label: `${c.first_name || ''} ${c.last_name || ''}`.trim() || '—',
        initials: (c.initials as string) || '',
      })))
      setClients((cl || []).map((c: Record<string,unknown>) => ({
        id: c.id as string,
        label: `${c.first_name || ''} ${c.last_name || ''}`.trim() || '—',
      })))
    } catch (err) { log.errorWithException('Leistungen loadData error', err) }
  }

  // Handzeichen aus der gewählten Betreuungskraft vorbelegen — überschreibt
  // eine bereits getippte Eingabe nicht.
  function pickCaregiver(id: string) {
    const cg = caregivers.find(c => c.id === id)
    setRecForm(f => ({
      ...f,
      caregiver_id: id,
      caregiver_initials: f.caregiver_initials || cg?.initials || '',
    }))
  }

  const recDuration = diffMinutes(recForm.start_time, recForm.end_time)
  const recValid = !!(recForm.caregiver_id && recForm.client_id && recForm.date
    && recForm.start_time && recForm.end_time && recDuration > 0
    && recForm.service_type && recForm.caregiver_initials.trim())

  async function handleSaveRecord() {
    if (!recValid) return
    setRecSaving(true)
    setRecError(null)
    try {
      const supabase = createClient()
      const { error, degraded } = await saveServiceRecord(supabase, {
        client_id: recForm.client_id,
        caregiver_id: recForm.caregiver_id,
        date: recForm.date,
        start_time: recForm.start_time,
        end_time: recForm.end_time,
        service_type: recForm.service_type,
        budget_type: recForm.budget_type,
        caregiver_initials: recForm.caregiver_initials.trim(),
        notes: recForm.notes.trim() || null,
        status: 'complete',
        completeness_check: {
          date: true, time: true, service: true, initials: true,
          signature: false, checked_at: new Date().toISOString(),
        },
      })
      if (error) { setRecError(error); setRecSaving(false); return }
      if (degraded) {
        setRecError('Gespeichert — der Status musste auf „Entwurf" gesetzt werden (Datenbank-Migration steht noch aus). Der Eintrag ist so noch nicht abrechenbar und muss nachbearbeitet werden. Der Budget-Topf wurde NICHT verändert.')
      }
      setRecOpen(false)
      setRecForm({
        caregiver_id: '', client_id: '',
        date: heuteBerlin(),
        start_time: '', end_time: '',
        service_type: '', budget_type: 'entlastung',
        caregiver_initials: '', notes: '',
      })
      await loadLeistungen()
    } catch (err) {
      setRecError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    } finally {
      setRecSaving(false)
    }
  }

  const admins = users.filter(u => u.role === 'admin' || u.role === 'superadmin')
  const angels = users.filter(u => u.role === 'engel')
  const kunden = users.filter(u => u.role === 'kunde')
  const fahrer = users.filter(u => u.role === 'fahrer')

  async function handleAddTask() {
    try {
      const result = await createTask({
        title: taskForm.title,
        module: taskForm.module,
        priority: taskForm.priority,
        description: taskForm.description,
        due_date: taskForm.due_date,
      })
      if (!result.ok) { alert('Fehler: ' + result.error); return }
      setTaskOpen(false)
      setTaskForm({ title: '', module: 'Team', priority: 'medium', description: '', due_date: '' })
      // reload tasks
      const supabase = createClient()
      // Nachladen nach erfolgreichem Anlegen — der verworfene Fehler haette
      // die Aufgabenliste geleert und die gerade angelegte Aufgabe
      // verschwinden lassen. Bestand bleibt stehen.
      const { data, error: reloadErr } = await supabase.from('mis_tasks').select('*').order('created_at', { ascending: false }).limit(20)
      if (reloadErr) { alert('Die Aufgabe wurde gespeichert, die Liste konnte aber nicht neu geladen werden. Bitte laden Sie die Seite neu.'); return }
      setTasks(data || [])
    } catch { alert('Speichern fehlgeschlagen') }
  }

  function openEditUser(user: Record<string,unknown>) {
    setEditUser(user)
    setEditForm({
      first_name: (user.first_name as string) || '',
      last_name: (user.last_name as string) || '',
      email: (user.email as string) || '',
      phone: (user.phone as string) || '',
      location: (user.location as string) || '',
      role: (user.role as string) || 'kunde',
    })
    setEditOpen(true)
  }

  async function handleEditUser() {
    if (!editUser) return
    try {
      const result = await updateProfile(editUser.id as string, {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        email: editForm.email,
        phone: editForm.phone,
        location: editForm.location,
      })
      if (!result.ok) { alert('Fehler: ' + result.error); return }
      setEditOpen(false)
      setEditUser(null)
      // reload users
      const supabase = createClient()
      const { data, error: reloadErr } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
      if (reloadErr) { alert('Die Änderung wurde gespeichert, die Benutzerliste konnte aber nicht neu geladen werden. Bitte laden Sie die Seite neu.'); return }
      setUsers(data || [])
    } catch { alert('Speichern fehlgeschlagen') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader title="Team & Personal" subtitle="Benutzer, Rollen und Aufgabenverwaltung" icon="users" />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: isMobile ? 10 : 16 }}>
        <KpiCard title="Gesamt Benutzer" value={users.length} icon="users" />
        <KpiCard title="Admins" value={admins.length} icon="shield" color={BRAND.gold} />
        <KpiCard title="Engel" value={angels.length} icon="wings" color={BRAND.success} />
        <KpiCard title="Kunden" value={kunden.length} icon="users" color={BRAND.info} />
        <KpiCard title="Fahrer" value={fahrer.length} icon="truck" color="#FF9800" />
      </div>

      <Tabs tabs={[
        { id: 'members', label: 'Mitglieder', icon: 'users', count: users.length },
        { id: 'tasks', label: 'Aufgaben', icon: 'check', count: tasks.filter(t => t.status !== 'done').length },
        { id: 'leistungen', label: 'Leistungserfassung', icon: 'clock', count: records.length },
      ]} active={tab} onChange={setTab} />

      {tab === 'members' && (
        <Card noPad>
          <DataTable
            columns={[
              { key: 'name', label: 'Name', render: (r) => {
                const firstName = (r.first_name as string) || ''
                const lastName = (r.last_name as string) || ''
                const displayName = firstName ? `${firstName} ${lastName ? lastName.charAt(0) + '.' : ''}`.trim() : (r.email as string || '—')
                const initials = `${(firstName || '?').charAt(0)}${(lastName || '').charAt(0)}`
                return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: r.avatar_color as string || `${BRAND.gold}30`, color: BRAND.text, fontWeight: 700, fontSize: 13,
                  }}>
                    {initials}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{displayName}</div>
                  </div>
                </div>
              )}},
              { key: 'email', label: 'E-Mail', render: (r) => (
                <span style={{ fontSize: isMobile ? 11 : 13, wordBreak: 'break-all' }}>{(r.email as string) || '—'}</span>
              )},
              { key: 'phone', label: 'Telefon', render: (r) => (
                <span style={{ fontSize: isMobile ? 11 : 13 }}>{(r.phone as string)?.trim() || '—'}</span>
              )},
              { key: 'role', label: 'Rolle', render: (r) => {
                const roleLabels: Record<string,string> = { admin: 'Admin', superadmin: 'Superadmin', engel: 'Engel', kunde: 'Kunde', fahrer: 'Fahrer' }
                const roleColors: Record<string,string> = { admin: BRAND.gold, superadmin: BRAND.gold, engel: BRAND.success, kunde: BRAND.info, fahrer: '#FF9800' }
                const role = (r.role as string) || 'kunde'
                return <Badge label={roleLabels[role] || role} color={roleColors[role] || BRAND.muted} size="sm" />
              }},
              { key: 'typ', label: 'Typ', render: (r: Record<string,unknown>) => (
                r.is_test
                  ? <Badge label="TEST" color={BRAND.error} size="sm" />
                  : <Badge label="ECHT" color={BRAND.success} size="sm" />
              )},
              ...(!isMobile ? [
                { key: 'postal_code', label: 'PLZ', render: (r: Record<string,unknown>) => (
                  <span style={{ fontWeight: 600 }}>{(r.postal_code as string) || '—'}</span>
                )},
                { key: 'location', label: 'Standort', render: (r: Record<string,unknown>) => (r.location as string)?.trim() || '—' },
                { key: 'created_at', label: 'Registriert', render: (r: Record<string,unknown>) => new Date(r.created_at as string).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) },
              ] : []),
              { key: 'actions', label: '', render: (r: Record<string,unknown>) => (
                <MisButton size="sm" onClick={() => openEditUser(r)}>Bearbeiten</MisButton>
              )},
            ]}
            data={users}
          />
        </Card>
      )}

      {tab === 'tasks' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <MisButton icon="plus" onClick={() => setTaskOpen(true)}>Aufgabe erstellen</MisButton>
          </div>
          <Card noPad>
            <DataTable
              columns={[
                { key: 'title', label: 'Aufgabe', render: (r) => <span style={{ fontWeight: 600 }}>{r.title as string}</span> },
                { key: 'module', label: 'Modul', render: (r) => <Badge label={r.module as string} color={BRAND.info} size="sm" /> },
                { key: 'priority', label: 'Priorität', render: (r) => {
                  const colors: Record<string,string> = { low: BRAND.success, medium: BRAND.warning, high: '#F97316', critical: BRAND.error }
                  return <Badge label={String(r.priority)} color={colors[r.priority as string] || BRAND.muted} size="sm" />
                }},
                { key: 'status', label: 'Status', render: (r) => (
                  <Badge label={r.status === 'done' ? 'Erledigt' : r.status === 'in_progress' ? 'In Arbeit' : String(r.status)}
                    color={r.status === 'done' ? BRAND.success : r.status === 'in_progress' ? BRAND.info : BRAND.muted} size="sm" />
                )},
                { key: 'due_date', label: 'Fällig', render: (r) => r.due_date ? new Date(r.due_date as string).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '—' },
              ]}
              data={tasks}
              emptyMessage="Keine Aufgaben vorhanden"
            />
          </Card>
        </>
      )}

      {tab === 'leistungen' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <MisButton icon="plus" onClick={() => { setRecError(null); setRecOpen(true) }}>Leistung erfassen</MisButton>
          </div>
          {recError && !recOpen && (
            <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13, background: 'rgba(245,158,11,0.12)', color: BRAND.warning }}>
              {recError}
            </div>
          )}
          <Card noPad>
            <DataTable
              columns={[
                { key: 'date', label: 'Datum', render: (r) => (
                  <span style={{ fontWeight: 600 }}>
                    {r.date ? new Date(r.date as string).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'}
                  </span>
                )},
                { key: 'time', label: 'Uhrzeit', render: (r) => (
                  r.start_time && r.end_time
                    ? `${String(r.start_time).slice(0, 5)} – ${String(r.end_time).slice(0, 5)}`
                    : '—'
                )},
                { key: 'duration_minutes', label: 'Dauer', render: (r) => formatDuration(Number(r.duration_minutes) || 0) },
                { key: 'service_type', label: 'Leistung', render: (r) => (r.service_type as string) || '—' },
                ...(!isMobile ? [
                  { key: 'caregiver', label: 'Betreuungskraft', render: (r: Record<string,unknown>) => {
                    const cg = r.caregivers as { first_name?: string; last_name?: string } | null
                    return cg ? `${cg.first_name || ''} ${cg.last_name || ''}`.trim() || '—' : '—'
                  }},
                  { key: 'client', label: 'Klient', render: (r: Record<string,unknown>) => {
                    const cl = r.clients as { first_name?: string; last_name?: string } | null
                    return cl ? `${cl.first_name || ''} ${cl.last_name || ''}`.trim() || '—' : '—'
                  }},
                ] : []),
                { key: 'caregiver_initials', label: 'Handzeichen', render: (r) => (
                  <span style={{ fontWeight: 700, letterSpacing: '0.05em' }}>{(r.caregiver_initials as string) || '—'}</span>
                )},
                { key: 'status', label: 'Status', render: (r) => {
                  const meta = statusMeta(RECORD_STATUS, r.status as string)
                  return <Badge label={meta.label} color={meta.color} size="sm" />
                }},
              ]}
              data={records}
              emptyMessage="Noch keine Leistungen erfasst"
            />
          </Card>
        </>
      )}

      {/* Leistungserfassung Modal */}
      <Modal open={recOpen} onClose={() => setRecOpen(false)} title="Leistung erfassen" width={620}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {recError && (
            <div style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(239,68,68,0.12)', color: BRAND.error }}>
              {recError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <div style={labelStyle}>Betreuungskraft *</div>
              <select aria-label="Betreuungskraft" value={recForm.caregiver_id} onChange={e => pickCaregiver(e.target.value)} style={inputStyle}>
                <option value="">— wählen —</option>
                {caregivers.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <div style={labelStyle}>Klient *</div>
              <select aria-label="Klient" value={recForm.client_id} onChange={e => setRecForm({ ...recForm, client_id: e.target.value })} style={inputStyle}>
                <option value="">— wählen —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {/* 1. Datum + 2. Uhrzeit */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <div style={labelStyle}>Datum *</div>
              <input aria-label="Datum" type="date" value={recForm.date} onChange={e => setRecForm({ ...recForm, date: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Von *</div>
              <input aria-label="Von" type="time" value={recForm.start_time} onChange={e => setRecForm({ ...recForm, start_time: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Bis *</div>
              <input aria-label="Bis" type="time" value={recForm.end_time} onChange={e => setRecForm({ ...recForm, end_time: e.target.value })} style={inputStyle} />
            </div>
          </div>

          {/* 3. Dauer — automatisch aus Von/Bis, in der DB eine generierte Spalte */}
          <div>
            <div style={labelStyle}>Dauer</div>
            <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', color: recDuration > 0 ? BRAND.gold : BRAND.muted, fontWeight: 600 }}>
              {recDuration > 0 ? `${formatDuration(recDuration)} (${recDuration} Minuten)` : 'Wird aus Von/Bis berechnet'}
            </div>
          </div>

          {/* 4. Leistung */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <div style={labelStyle}>Leistung *</div>
              <select aria-label="Leistung" value={recForm.service_type} onChange={e => setRecForm({ ...recForm, service_type: e.target.value })} style={inputStyle}>
                <option value="">— wählen —</option>
                {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div style={labelStyle}>Budget-Topf</div>
              <select aria-label="Budget-Topf" value={recForm.budget_type} onChange={e => setRecForm({ ...recForm, budget_type: e.target.value })} style={inputStyle}>
                {Object.entries(BUDGET_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* 5. Handzeichen */}
          <div>
            <div style={labelStyle}>Handzeichen *</div>
            <input aria-label="Handzeichen"
              type="text" value={recForm.caregiver_initials} maxLength={10}
              onChange={e => setRecForm({ ...recForm, caregiver_initials: e.target.value })}
              placeholder="z. B. M.S." style={inputStyle}
            />
            <div style={{ fontSize: 11, color: BRAND.muted, marginTop: 4 }}>
              Kürzel der Betreuungskraft — bestätigt die erbrachte Leistung.
            </div>
          </div>

          <div>
            <div style={labelStyle}>Notizen</div>
            <textarea aria-label="Notizen"
              value={recForm.notes} rows={2}
              onChange={e => setRecForm({ ...recForm, notes: e.target.value })}
              placeholder="Optionale Anmerkungen zum Einsatz…"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <MisButton variant="secondary" onClick={() => setRecOpen(false)}>Abbrechen</MisButton>
            <MisButton onClick={handleSaveRecord} disabled={!recValid || recSaving}>
              {recSaving ? 'Speichern…' : 'Leistung speichern'}
            </MisButton>
          </div>
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal open={editOpen} onClose={() => { setEditOpen(false); setEditUser(null) }} title="Mitglied bearbeiten">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.muted, marginBottom: 2 }}>Vorname</div>
              <input value={editForm.first_name} onChange={e => setEditForm({...editForm, first_name: e.target.value})} placeholder="Vorname" style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.muted, marginBottom: 2 }}>Nachname</div>
              <input value={editForm.last_name} onChange={e => setEditForm({...editForm, last_name: e.target.value})} placeholder="Nachname" style={inputStyle} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.muted, marginBottom: 2 }}>E-Mail</div>
            <input value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} placeholder="E-Mail" style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.muted, marginBottom: 2 }}>Telefon</div>
              <input value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} placeholder="Telefon" style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.muted, marginBottom: 2 }}>Standort</div>
              <input value={editForm.location} onChange={e => setEditForm({...editForm, location: e.target.value})} placeholder="Standort" style={inputStyle} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.muted, marginBottom: 2 }}>Rolle</div>
            <div style={{ ...inputStyle, background: 'var(--bg2, #f5f5f5)', cursor: 'not-allowed', opacity: 0.7 }}>
              {({ admin: 'Admin', superadmin: 'Superadmin', engel: 'Engel', kunde: 'Kunde', fahrer: 'Fahrer' } as Record<string,string>)[editForm.role] || editForm.role}
            </div>
            <div style={{ fontSize: 10, color: BRAND.muted, marginTop: 2 }}>Rollenaenderung nur ueber Superadmin-Rollenverwaltung</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <MisButton variant="secondary" onClick={() => { setEditOpen(false); setEditUser(null) }}>Abbrechen</MisButton>
            <MisButton onClick={handleEditUser}>Speichern</MisButton>
          </div>
        </div>
      </Modal>

      {/* Task Modal */}
      <Modal open={taskOpen} onClose={() => setTaskOpen(false)} title="Aufgabe erstellen">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input value={taskForm.title} onChange={e => setTaskForm({...taskForm, title: e.target.value})} placeholder="Aufgabentitel *" style={inputStyle} />
          <input value={taskForm.description} onChange={e => setTaskForm({...taskForm, description: e.target.value})} placeholder="Beschreibung" style={inputStyle} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <select value={taskForm.module} onChange={e => setTaskForm({...taskForm, module: e.target.value})} style={inputStyle}>
              <option value="Team">Team</option>
              <option value="Qualität">Qualität</option>
              <option value="Finanzen">Finanzen</option>
              <option value="Lieferkette">Lieferkette</option>
              <option value="Krankenfahrten">Krankenfahrten</option>
              <option value="Marketing">Marketing</option>
            </select>
            <select value={taskForm.priority} onChange={e => setTaskForm({...taskForm, priority: e.target.value})} style={inputStyle}>
              <option value="low">Niedrig</option>
              <option value="medium">Mittel</option>
              <option value="high">Hoch</option>
              <option value="critical">Kritisch</option>
            </select>
          </div>
          <input type="date" value={taskForm.due_date} onChange={e => setTaskForm({...taskForm, due_date: e.target.value})} style={inputStyle} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <MisButton variant="secondary" onClick={() => setTaskOpen(false)}>Abbrechen</MisButton>
            <MisButton onClick={handleAddTask} disabled={!taskForm.title}>Speichern</MisButton>
          </div>
        </div>
      </Modal>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: BRAND.light, color: BRAND.text, boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: BRAND.muted, marginBottom: 2 }
