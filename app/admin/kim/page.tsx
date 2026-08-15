'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Banner, SearchInput } from '@/components/admin/OpsUI'
import { KIM_MESSAGE_STATUS_LABELS, KIM_MESSAGE_TYPE_LABELS, type KimMessage } from '@/lib/kim/types'

const STATUS_FARBE: Record<string, string> = {
  entwurf: '#A0AEC0',
  wartend: '#D69E2E',
  gesendet: '#4299E1',
  zugestellt: '#38A169',
  gelesen: '#2F855A',
  fehler: '#D04B3B',
  storniert: '#718096',
}

function fmt(dt: string | null): string {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

export default function KimInboxPage() {
  const [messages, setMessages] = useState<KimMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [search, setSearch] = useState('')

  function loadData() {
    setLoading(true)
    fetch('/api/admin/kim/inbox')
      .then(r => r.json())
      .then(body => {
        if (body.error) { setError(body.error); return }
        setMessages(Array.isArray(body) ? body : [])
      })
      .catch(() => setError('Laden fehlgeschlagen.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  async function handleFetchInbound() {
    setFetching(true)
    setError('')
    setInfo('')
    try {
      const res = await fetch('/api/admin/kim/inbox', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Abruf fehlgeschlagen.'); return }
      setInfo(`${body.inserted} neue Nachricht(en) abgerufen${body.duplicates ? `, ${body.duplicates} Duplikat(e) übersprungen` : ''}.`)
      loadData()
    } catch { setError('Abruf fehlgeschlagen.') }
    finally { setFetching(false) }
  }

  const filtered = messages.filter(m => {
    if (!search) return true
    const s = search.toLowerCase()
    return m.subject.toLowerCase().includes(s) || m.kim_address_from.toLowerCase().includes(s)
  })

  if (loading) return <div className="p-8 text-gray-500">Lade Posteingang…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">KIM — Posteingang</h1>
        <button
          onClick={handleFetchInbound}
          disabled={fetching}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {fetching ? 'Rufe ab…' : 'Postfach abrufen'}
        </button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {info && <Banner tone="success">{info}</Banner>}

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Betreff oder Absender…" />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm dark:bg-gray-900 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Von</th>
              <th className="px-4 py-2 text-left font-medium">Betreff</th>
              <th className="px-4 py-2 text-left font-medium">Typ</th>
              <th className="px-4 py-2 text-left font-medium">Empfangen</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Kein Posteingang.</td></tr>
            )}
            {filtered.map(m => (
              <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-2">
                  <Link href={`/admin/kim/nachricht/${m.id}`} className="block">
                    {m.kim_address_from}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <Link href={`/admin/kim/nachricht/${m.id}`} className="font-medium text-blue-700 dark:text-blue-400">
                    {m.subject}
                  </Link>
                </td>
                <td className="px-4 py-2">{KIM_MESSAGE_TYPE_LABELS[m.message_type]}</td>
                <td className="px-4 py-2">{fmt(m.delivered_at ?? m.created_at)}</td>
                <td className="px-4 py-2">
                  <span className="admin-status" style={{ background: STATUS_FARBE[m.status] }}>
                    {KIM_MESSAGE_STATUS_LABELS[m.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
