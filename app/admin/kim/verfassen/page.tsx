'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Banner } from '@/components/admin/OpsUI'
import { KIM_MESSAGE_TYPE_LABELS, type KimAddress, type KimMessageType, type KimPriority } from '@/lib/kim/types'

export default function KimVerfassenPage() {
  const router = useRouter()
  const [addresses, setAddresses] = useState<KimAddress[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    kim_address_from: '',
    kim_address_to: '',
    subject: '',
    body_text: '',
    priority: 'normal' as KimPriority,
    message_type: 'sonstig' as KimMessageType,
  })

  useEffect(() => {
    fetch('/api/admin/kim/addresses?is_active=true')
      .then(r => r.json())
      .then(body => setAddresses(Array.isArray(body) ? body : []))
      .catch(() => undefined)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/kim/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Fehler'); return }
      router.push(`/admin/kim/nachricht/${body.id}`)
    } catch { setError('Speichern fehlgeschlagen.') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">KIM — Nachricht verfassen</h1>

      {error && <Banner tone="danger">{error}</Banner>}

      <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-6 shadow-sm space-y-4 dark:bg-gray-900 dark:border-gray-700">
        <label className="block">
          <span className="text-sm font-medium">Von (eigene KIM-Adresse) *</span>
          <input required value={form.kim_address_from} placeholder="praxis@kim.telematik-test"
            onChange={e => setForm(p => ({ ...p, kim_address_from: e.target.value }))}
            className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600" />
        </label>

        <label className="block">
          <span className="text-sm font-medium">An *</span>
          <input required list="kim-adressbuch" value={form.kim_address_to} placeholder="empfaenger@kim.telematik-test"
            onChange={e => setForm(p => ({ ...p, kim_address_to: e.target.value }))}
            className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600" />
          <datalist id="kim-adressbuch">
            {addresses.map(a => <option key={a.id} value={a.kim_address}>{a.display_name}</option>)}
          </datalist>
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Nachrichtentyp</span>
            <select value={form.message_type} onChange={e => setForm(p => ({ ...p, message_type: e.target.value as KimMessageType }))}
              className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600">
              {Object.entries(KIM_MESSAGE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Priorität</span>
            <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value as KimPriority }))}
              className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600">
              <option value="niedrig">Niedrig</option>
              <option value="normal">Normal</option>
              <option value="hoch">Hoch</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium">Betreff *</span>
          <input required value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
            className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600" />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Text *</span>
          <textarea required rows={8} value={form.body_text} onChange={e => setForm(p => ({ ...p, body_text: e.target.value }))}
            className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600" />
        </label>

        <p className="text-xs text-gray-500">Anhänge können nach dem Speichern als Entwurf auf der Detailseite hinzugefügt werden.</p>

        <button type="submit" disabled={saving}
          className="rounded bg-green-600 px-6 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50">
          {saving ? 'Speichere…' : 'Als Entwurf speichern'}
        </button>
      </form>
    </div>
  )
}
