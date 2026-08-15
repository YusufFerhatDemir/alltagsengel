'use client'

import { useEffect, useState } from 'react'
import { Banner, SearchInput } from '@/components/admin/OpsUI'
import { KIM_ADDRESS_TYPE_LABELS, type KimAddress, type KimAddressType } from '@/lib/kim/types'

export default function KimAdressbuchPage() {
  const [addresses, setAddresses] = useState<KimAddress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [form, setForm] = useState({ kim_address: '', display_name: '', address_type: 'arzt' as KimAddressType, lanr: '', bsnr: '', ik_nummer: '' })

  function loadData() {
    setLoading(true)
    fetch('/api/admin/kim/addresses')
      .then(r => r.json())
      .then(body => {
        if (body.error) { setError(body.error); return }
        setAddresses(Array.isArray(body) ? body : [])
      })
      .catch(() => setError('Laden fehlgeschlagen.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/kim/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Fehler'); return }
      setShowForm(false)
      setForm({ kim_address: '', display_name: '', address_type: 'arzt', lanr: '', bsnr: '', ik_nummer: '' })
      loadData()
    } catch { setError('Speichern fehlgeschlagen.') }
    finally { setSaving(false) }
  }

  async function handleVerify(id: string) {
    setVerifyingId(id)
    setError('')
    setInfo('')
    try {
      const res = await fetch(`/api/admin/kim/addresses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify' }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Verifikation fehlgeschlagen.'); return }
      setInfo(body.isValid ? 'Adresse verifiziert.' : `Adresse ungültig: ${body.reason ?? 'unbekannter Grund'}`)
      loadData()
    } catch { setError('Verifikation fehlgeschlagen.') }
    finally { setVerifyingId(null) }
  }

  const filtered = addresses.filter(a => {
    if (!search) return true
    const s = search.toLowerCase()
    return a.display_name.toLowerCase().includes(s) || a.kim_address.toLowerCase().includes(s)
  })

  if (loading) return <div className="p-8 text-gray-500">Lade Adressbuch…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">KIM — Adressbuch</h1>
        <button onClick={() => setShowForm(!showForm)} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
          {showForm ? 'Abbrechen' : '+ Adresse anlegen'}
        </button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {info && <Banner tone="success">{info}</Banner>}

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-lg border bg-white p-6 shadow-sm space-y-4 dark:bg-gray-900 dark:border-gray-700">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">KIM-Adresse *</span>
              <input required value={form.kim_address} placeholder="praxis@kim.telematik-test"
                onChange={e => setForm(p => ({ ...p, kim_address: e.target.value }))}
                className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Anzeigename *</span>
              <input required value={form.display_name} onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
                className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Typ</span>
              <select value={form.address_type} onChange={e => setForm(p => ({ ...p, address_type: e.target.value as KimAddressType }))}
                className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600">
                {Object.entries(KIM_ADDRESS_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">LANR</span>
              <input value={form.lanr} onChange={e => setForm(p => ({ ...p, lanr: e.target.value }))}
                className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">BSNR</span>
              <input value={form.bsnr} onChange={e => setForm(p => ({ ...p, bsnr: e.target.value }))}
                className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">IK-Nummer</span>
              <input value={form.ik_nummer} onChange={e => setForm(p => ({ ...p, ik_nummer: e.target.value }))}
                className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600" />
            </label>
          </div>
          <button type="submit" disabled={saving}
            className="rounded bg-green-600 px-6 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50">
            {saving ? 'Speichere…' : 'Adresse speichern'}
          </button>
        </form>
      )}

      <SearchInput value={search} onChange={setSearch} placeholder="Name oder Adresse…" />

      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm dark:bg-gray-900 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">KIM-Adresse</th>
              <th className="px-4 py-2 text-left font-medium">Typ</th>
              <th className="px-4 py-2 text-left font-medium">Verifiziert</th>
              <th className="px-4 py-2 text-left font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Kein Eintrag.</td></tr>
            )}
            {filtered.map(a => (
              <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-2">{a.display_name}</td>
                <td className="px-4 py-2">{a.kim_address}</td>
                <td className="px-4 py-2">{KIM_ADDRESS_TYPE_LABELS[a.address_type]}</td>
                <td className="px-4 py-2">{a.verified_at ? new Date(a.verified_at).toLocaleDateString('de-DE') : '—'}</td>
                <td className="px-4 py-2">
                  <button onClick={() => handleVerify(a.id)} disabled={verifyingId === a.id}
                    className="text-blue-700 dark:text-blue-400 disabled:opacity-50">
                    {verifyingId === a.id ? 'Prüfe…' : 'Verifizieren'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
