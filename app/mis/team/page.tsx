'use client'
import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, KpiCard, DataTable, MisButton, Badge, Tabs, Modal, EmptyState } from '@/components/mis/MisComponents'
import { useMis } from '@/lib/mis/MisContext'

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

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('mis_tasks').select('*').order('created_at', { ascending: false }).limit(20),
    ]).then(([{ data: u }, { data: t }]) => {
      setUsers(u || [])
      setTasks(t || [])
    })
  }, [])

  const admins = users.filter(u => u.role === 'admin')
  const angels = users.filter(u => u.role === 'engel')
  const kunden = users.filter(u => u.role === 'kunde')

  async function handleAddTask() {
    try {
      const supabase = createClient()
      const insertData = {
        ...taskForm,
        due_date: taskForm.due_date || null,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      }
      const { error } = await supabase.from('mis_tasks').insert(insertData)
      if (error) { alert('Fehler: ' + error.message); return }
      setTaskOpen(false)
      setTaskForm({ title: '', module: 'Team', priority: 'medium', description: '', due_date: '' })
      // reload tasks
      const { data } = await supabase.from('mis_tasks').select('*').order('created_at', { ascending: false }).limit(20)
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
      const supabase = createClient()
      const { error } = await supabase.from('profiles').update(editForm).eq('id', editUser.id)
      if (error) { alert('Fehler: ' + error.message); return }
      setEditOpen(false)
      setEditUser(null)
      // reload users
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
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
      </div>

      <Tabs tabs={[
        { id: 'members', label: 'Mitglieder', icon: 'users', count: users.length },
        { id: 'tasks', label: 'Aufgaben', icon: 'check', count: tasks.filter(t => t.status !== 'done').length },
      ]} active={tab} onChange={setTab} />

      {tab === 'members' && (
        <Card noPad>
          <DataTable
            columns={[
              { key: 'name', label: 'Name', render: (r) => {
                const firstName = r.first_name as string || '?'
                const lastName = r.last_name as string || ''
                const displayName = `${firstName} ${lastName.charAt(0)}.`
                return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: r.avatar_color as string || `${BRAND.gold}30`, color: BRAND.text, fontWeight: 700, fontSize: 13,
                  }}>
                    {firstName.charAt(0)}{lastName.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{displayName}</div>
                  </div>
                </div>
              )}},
              { key: 'email', label: 'E-Mail', render: (r) => (
                <span style={{ fontSize: isMobile ? 11 : 13, wordBreak: 'break-all' }}>{r.email as string || '—'}</span>
              )},
              { key: 'role', label: 'Rolle', render: (r) => (
                <Badge label={r.role === 'admin' ? 'Admin' : r.role === 'engel' ? 'Engel' : 'Kunde'}
                  color={r.role === 'admin' ? BRAND.gold : r.role === 'engel' ? BRAND.success : BRAND.info} size="sm" />
              )},
              ...(!isMobile ? [
                { key: 'location', label: 'Standort', render: (r: Record<string,unknown>) => r.location as string || '—' },
                { key: 'created_at', label: 'Registriert', render: (r: Record<string,unknown>) => new Date(r.created_at as string).toLocaleDateString('de-DE') },
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
                { key: 'due_date', label: 'Fällig', render: (r) => r.due_date ? new Date(r.due_date as string).toLocaleDateString('de-DE') : '—' },
              ]}
              data={tasks}
              emptyMessage="Keine Aufgaben vorhanden"
            />
          </Card>
        </>
      )}

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
            <select value={editForm.role} onChange={e => setEditForm({...editForm, role: e.target.value})} style={inputStyle}>
              <option value="admin">Admin</option>
              <option value="engel">Engel</option>
              <option value="kunde">Kunde</option>
            </select>
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
