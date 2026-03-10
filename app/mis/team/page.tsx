'use client'
import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, KpiCard, DataTable, MisButton, Badge, Tabs } from '@/components/mis/MisComponents'

export default function TeamPage() {
  const [users, setUsers] = useState<Record<string,unknown>[]>([])
  const [tasks, setTasks] = useState<Record<string,unknown>[]>([])
  const [tab, setTab] = useState('members')

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader title="Team & Personal" subtitle="Benutzer, Rollen und Aufgabenverwaltung" icon="users" />

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
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
              { key: 'name', label: 'Name', render: (r) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: r.avatar_color as string || `${BRAND.gold}30`, color: BRAND.text, fontWeight: 700, fontSize: 13,
                  }}>
                    {(r.first_name as string || '?').charAt(0)}{(r.last_name as string || '').charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{r.first_name as string} {r.last_name as string}</div>
                    <div style={{ fontSize: 11, color: BRAND.muted }}>{r.email as string || '—'}</div>
                  </div>
                </div>
              )},
              { key: 'role', label: 'Rolle', render: (r) => (
                <Badge label={r.role === 'admin' ? 'Admin' : r.role === 'engel' ? 'Engel' : 'Kunde'}
                  color={r.role === 'admin' ? BRAND.gold : r.role === 'engel' ? BRAND.success : BRAND.info} size="sm" />
              )},
              { key: 'location', label: 'Standort', render: (r) => r.location as string || '—' },
              { key: 'created_at', label: 'Registriert', render: (r) => new Date(r.created_at as string).toLocaleDateString('de-DE') },
            ]}
            data={users}
          />
        </Card>
      )}

      {tab === 'tasks' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <MisButton icon="plus">Aufgabe erstellen</MisButton>
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
    </div>
  )
}
