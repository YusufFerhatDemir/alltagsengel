'use client'

import { useEffect, useState } from 'react'
import { Banner } from '@/components/admin/OpsUI'
import type { KimProviderConfig, KimProviderType } from '@/lib/kim/types'

const PROVIDER_LABELS: Record<KimProviderType, string> = {
  mock: 'Mock-Provider (Simulation, konfigurierbare Fehlerrate)',
  test: 'Test-Provider (deterministisch, nur für automatisierte Tests)',
  kim_plus: 'KIM+ (echter TI-Konnektor — noch nicht verfügbar)',
  kim_basis: 'KIM Basis (echter TI-Konnektor — noch nicht verfügbar)',
}

export default function KimEinstellungenPage() {
  const [active, setActive] = useState<KimProviderConfig | null>(null)
  const [all, setAll] = useState<KimProviderConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [providerType, setProviderType] = useState<KimProviderType>('mock')
  const [errorRate, setErrorRate] = useState(0)

  function loadData() {
    setLoading(true)
    fetch('/api/admin/kim/config')
      .then(r => r.json())
      .then(body => {
        if (body.error) { setError(body.error); return }
        setActive(body.active)
        setAll(body.all ?? [])
        if (body.active) {
          setProviderType(body.active.provider_type)
          setErrorRate(typeof body.active.config?.errorRate === 'number' ? body.active.config.errorRate : 0)
        }
      })
      .catch(() => setError('Laden fehlgeschlagen.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setInfo('')
    try {
      const config = providerType === 'mock' ? { errorRate } : {}
      const res = await fetch('/api/admin/kim/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_type: providerType, config }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Fehler'); return }
      setInfo('Provider-Konfiguration gespeichert.')
      loadData()
    } catch { setError('Speichern fehlgeschlagen.') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="p-8 text-gray-500">Lade Einstellungen…</div>

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">KIM — Provider-Einstellungen</h1>

      {error && <Banner tone="danger">{error}</Banner>}
      {info && <Banner tone="success">{info}</Banner>}

      <Banner tone="info">
        Der echte TI-Konnektor (KIM+/KIM Basis) ist extern und noch nicht angebunden — die
        KIM-Client-Spezifikation (Technische Anlage 5) liegt diesem Projekt nicht vor. Bis dahin
        stehen ausschließlich Mock- und Test-Provider zur Verfügung, um die Fachlogik ohne echten
        TI-Zugang zu betreiben.
      </Banner>

      {active && (
        <p className="text-sm text-gray-500">Aktiv: <strong>{PROVIDER_LABELS[active.provider_type]}</strong></p>
      )}

      <form onSubmit={handleSave} className="rounded-lg border bg-white p-6 shadow-sm space-y-4 dark:bg-gray-900 dark:border-gray-700">
        <label className="block">
          <span className="text-sm font-medium">Provider</span>
          <select value={providerType} onChange={e => setProviderType(e.target.value as KimProviderType)}
            className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600">
            {Object.entries(PROVIDER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>

        {providerType === 'mock' && (
          <label className="block">
            <span className="text-sm font-medium">Simulierte Fehlerrate ({Math.round(errorRate * 100)}%)</span>
            <input type="range" min={0} max={1} step={0.05} value={errorRate}
              onChange={e => setErrorRate(Number(e.target.value))} className="mt-1 block w-full" />
          </label>
        )}

        {(providerType === 'kim_plus' || providerType === 'kim_basis') && (
          <Banner tone="warn">
            Dieser Providertyp lässt sich zwar auswählen, der Versand bleibt aber gesperrt: die
            Factory (lib/kim/provider-factory.ts) wirft beim ersten Sendeversuch, bis eine echte
            Implementierung vorliegt.
          </Banner>
        )}

        <button type="submit" disabled={saving}
          className="rounded bg-green-600 px-6 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50">
          {saving ? 'Speichere…' : 'Provider aktivieren'}
        </button>
      </form>

      {all.length > 0 && (
        <div className="text-sm text-gray-500">
          <p className="font-medium mb-1">Bisher konfiguriert:</p>
          <ul className="list-disc list-inside">
            {all.map(c => <li key={c.id}>{PROVIDER_LABELS[c.provider_type]} {c.is_active ? '(aktiv)' : ''}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
