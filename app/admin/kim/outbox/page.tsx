'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Banner } from '@/components/admin/OpsUI'
import { KIM_MESSAGE_STATUS_LABELS, type KimMessage } from '@/lib/kim/types'

const STATUS_FARBE: Record<string, string> = {
  wartend: '#D69E2E',
  gesendet: '#4299E1',
  zugestellt: '#38A169',
  gelesen: '#2F855A',
  fehler: '#D04B3B',
}

function fmt(dt: string | null): string {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

function Table({ title, rows }: { title: string; rows: KimMessage[] }) {
  return (
    <div className="space-y-2">
      <h2 className="font-semibold text-lg">{title} ({rows.length})</h2>
      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm dark:bg-gray-900 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-2 text-left font-medium">An</th>
              <th className="px-4 py-2 text-left font-medium">Betreff</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Versucht</th>
              <th className="px-4 py-2 text-left font-medium">Fehler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Keine Einträge.</td></tr>
            )}
            {rows.map(m => (
              <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-2">{m.kim_address_to}</td>
                <td className="px-4 py-2">
                  <Link href={`/admin/kim/nachricht/${m.id}`} className="font-medium text-blue-700 dark:text-blue-400">
                    {m.subject}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <span className="admin-status" style={{ background: STATUS_FARBE[m.status] }}>
                    {KIM_MESSAGE_STATUS_LABELS[m.status]}
                  </span>
                </td>
                <td className="px-4 py-2">{fmt(m.sent_at)} {m.retry_count > 0 ? `(${m.retry_count}/${m.max_retries})` : ''}</td>
                <td className="px-4 py-2 text-red-600 dark:text-red-400">{m.error_details ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function KimOutboxPage() {
  const [gesendet, setGesendet] = useState<KimMessage[]>([])
  const [wartend, setWartend] = useState<KimMessage[]>([])
  const [fehler, setFehler] = useState<KimMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  function loadData() {
    setLoading(true)
    fetch('/api/admin/kim/outbox')
      .then(r => r.json())
      .then(body => {
        if (body.error) { setError(body.error); return }
        setGesendet(body.gesendet ?? [])
        setWartend(body.wartend ?? [])
        setFehler(body.fehler ?? [])
      })
      .catch(() => setError('Laden fehlgeschlagen.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  async function handleProcess() {
    setProcessing(true)
    setError('')
    setInfo('')
    try {
      const res = await fetch('/api/admin/kim/outbox', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Verarbeitung fehlgeschlagen.'); return }
      setInfo(`${body.gesendet} gesendet, ${body.wirdWiederholt} werden wiederholt, ${body.endgueltigFehlgeschlagen} endgültig fehlgeschlagen. ${body.statusAktualisiert} Zustellstatus aktualisiert.`)
      loadData()
    } catch { setError('Verarbeitung fehlgeschlagen.') }
    finally { setProcessing(false) }
  }

  if (loading) return <div className="p-8 text-gray-500">Lade Postausgang…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">KIM — Postausgang</h1>
        <div className="flex gap-2">
          <Link href="/admin/kim/verfassen" className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700">
            + Nachricht verfassen
          </Link>
          <button
            onClick={handleProcess}
            disabled={processing}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {processing ? 'Verarbeite…' : 'Warteschlange verarbeiten'}
          </button>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {info && <Banner tone="success">{info}</Banner>}

      <Table title="Wartend" rows={wartend} />
      <Table title="Fehlgeschlagen" rows={fehler} />
      <Table title="Gesendet / zugestellt / gelesen" rows={gesendet} />
    </div>
  )
}
