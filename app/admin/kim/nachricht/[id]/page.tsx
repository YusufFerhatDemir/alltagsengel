'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Banner } from '@/components/admin/OpsUI'
import { KIM_MESSAGE_STATUS_LABELS, KIM_MESSAGE_TYPE_LABELS, type KimAttachmentMitUrl, type KimMessage } from '@/lib/kim/types'

type Detail = KimMessage & { attachments: KimAttachmentMitUrl[] }

function fmt(dt: string | null): string {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function KimNachrichtDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [message, setMessage] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  function loadData() {
    setLoading(true)
    fetch(`/api/admin/kim/messages/${params.id}`)
      .then(r => r.json())
      .then(body => {
        if (body.error) { setError(body.error); return }
        setMessage(body)
      })
      .catch(() => setError('Laden fehlgeschlagen.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [params.id])  

  async function handleAction(action: 'queue' | 'cancel' | 'mark_read') {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      const res = await fetch(`/api/admin/kim/messages/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Aktion fehlgeschlagen.'); return }
      if (action === 'queue') setInfo('Zum Versand freigegeben — wird über die Postausgang-Warteschlange gesendet.')
      loadData()
    } catch { setError('Aktion fehlgeschlagen.') }
    finally { setBusy(false) }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const formData = new FormData()
      formData.set('file', file)
      const res = await fetch(`/api/admin/kim/messages/${params.id}/attachments`, { method: 'POST', body: formData })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Upload fehlgeschlagen.'); return }
      loadData()
    } catch { setError('Upload fehlgeschlagen.') }
    finally { setBusy(false) }
  }

  if (loading) return <div className="p-8 text-gray-500">Lade Nachricht…</div>
  if (!message) return <div className="p-8"><Banner tone="danger">{error || 'Nachricht nicht gefunden.'}</Banner></div>

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{message.subject}</h1>
        <button onClick={() => router.back()} className="text-sm text-blue-700 dark:text-blue-400">← Zurück</button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {info && <Banner tone="success">{info}</Banner>}

      <div className="rounded-lg border bg-white p-6 shadow-sm space-y-3 dark:bg-gray-900 dark:border-gray-700 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div><span className="text-gray-500">Richtung:</span> {message.direction === 'inbound' ? 'Eingehend' : 'Ausgehend'}</div>
          <div><span className="text-gray-500">Status:</span> {KIM_MESSAGE_STATUS_LABELS[message.status]}</div>
          <div><span className="text-gray-500">Von:</span> {message.kim_address_from}</div>
          <div><span className="text-gray-500">An:</span> {message.kim_address_to}</div>
          <div><span className="text-gray-500">Typ:</span> {KIM_MESSAGE_TYPE_LABELS[message.message_type]}</div>
          <div><span className="text-gray-500">Priorität:</span> {message.priority}</div>
          <div><span className="text-gray-500">Erstellt:</span> {fmt(message.created_at)}</div>
          <div><span className="text-gray-500">Gesendet:</span> {fmt(message.sent_at)}</div>
          <div><span className="text-gray-500">Zugestellt:</span> {fmt(message.delivered_at)}</div>
          <div><span className="text-gray-500">Gelesen:</span> {fmt(message.read_at)}</div>
        </div>
        {message.error_details && (
          <Banner tone="danger">Fehler ({message.retry_count}/{message.max_retries} Versuche): {message.error_details}</Banner>
        )}
        <div className="whitespace-pre-wrap border-t pt-3 dark:border-gray-700">{message.body_text}</div>
      </div>

      <div className="rounded-lg border bg-white p-6 shadow-sm space-y-3 dark:bg-gray-900 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Anhänge</h2>
          {message.status === 'entwurf' && (
            <label className="text-sm text-blue-700 dark:text-blue-400 cursor-pointer">
              + Anhang hinzufügen
              <input type="file" className="hidden" onChange={handleUpload} disabled={busy} />
            </label>
          )}
        </div>
        {message.attachments.length === 0 && <p className="text-sm text-gray-500">Keine Anhänge.</p>}
        <ul className="text-sm space-y-1">
          {message.attachments.map(a => (
            <li key={a.id}>
              {a.signed_url ? (
                <a href={a.signed_url} target="_blank" rel="noreferrer" className="text-blue-700 dark:text-blue-400">
                  {a.filename}
                </a>
              ) : (
                <span className="text-gray-700 dark:text-gray-300">
                  {a.filename} <span className="text-red-600 dark:text-red-400">(nicht abrufbar)</span>
                </span>
              )}{' '}
              <span className="text-gray-500">({fmtBytes(a.size_bytes)})</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-2">
        {message.status === 'entwurf' && (
          <>
            <button onClick={() => handleAction('queue')} disabled={busy}
              className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50">
              Zum Versand freigeben
            </button>
            <button onClick={() => handleAction('cancel')} disabled={busy}
              className="rounded bg-gray-300 px-4 py-2 text-sm hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600">
              Verwerfen
            </button>
          </>
        )}
        {message.status === 'wartend' && (
          <button onClick={() => handleAction('cancel')} disabled={busy}
            className="rounded bg-gray-300 px-4 py-2 text-sm hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600">
            Versand stornieren
          </button>
        )}
        {message.direction === 'inbound' && message.status !== 'gelesen' && (
          <button onClick={() => handleAction('mark_read')} disabled={busy}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
            Als gelesen markieren
          </button>
        )}
      </div>
    </div>
  )
}
