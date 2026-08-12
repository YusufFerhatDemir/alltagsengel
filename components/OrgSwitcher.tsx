'use client'
// ═══════════════════════════════════════════════════════════════
// OrgSwitcher — Multi-Mandant (Phase 3)
// Zeigt die aktive Organisation im Admin-Dashboard und erlaubt den
// Wechsel zwischen allen Organisationen, in denen der Admin Mitglied
// ist. Degradiert ohne Migration/bei nur einer Org auf ein statisches
// Label „Alltagsengel".
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import type { Organization, OrgRole } from '@/lib/organizations/types'

type OrgWithRole = Organization & { member_role: OrgRole }

export default function OrgSwitcher() {
  const [orgs, setOrgs] = useState<OrgWithRole[]>([])
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/organizations')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled || !data) return
        setOrgs(data.organizations || [])
        setActiveOrgId(data.active_org_id || null)
      })
      .catch(() => { /* Migration evtl. noch nicht angewendet — statisch bleiben */ })
    return () => { cancelled = true }
  }, [])

  async function handleSwitch(orgId: string) {
    if (orgId === activeOrgId || switching) return
    setSwitching(true)
    try {
      const res = await fetch('/api/organizations/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: orgId }),
      })
      if (res.ok) {
        // Kompletter Reload: alle Daten-Fetches laufen im neuen Org-Kontext
        window.location.reload()
        return
      }
      const data = await res.json().catch(() => null)
      alert(data?.error || 'Wechsel fehlgeschlagen')
    } finally {
      setSwitching(false)
    }
  }

  const active = orgs.find(o => o.id === activeOrgId)

  // Ohne Daten oder mit nur einer Org: statisches Label
  if (orgs.length <= 1) {
    return (
      <div style={{
        padding: '8px 12px', margin: '0 8px 4px', borderRadius: 8,
        background: 'rgba(201,150,60,0.08)', fontSize: 12, fontWeight: 600,
        color: 'var(--gold2, #C9963C)', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {active?.name || 'Alltagsengel'}
        </span>
      </div>
    )
  }

  return (
    <div style={{ padding: '4px 12px 8px', margin: '0 0 4px' }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase',
        color: 'var(--ink5, #999)', padding: '0 0 4px',
      }}>
        Organisation
      </div>
      <select
        value={activeOrgId || ''}
        disabled={switching}
        onChange={e => handleSwitch(e.target.value)}
        style={{
          // Farbtoken der DUNKLEN Admin-Seitenleiste, nicht der hellen Kundenapp.
          // Vorher: background var(--bg) + color var(--ink) — im Admin-Theme
          // loesen beide zu #F7F2EA auf, das Feld war heller Text auf hellem
          // Grund und damit unlesbar. Betraf jeden Admin mit mehr als einer
          // Organisation.
          width: '100%', padding: '7px 8px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          border: '1px solid var(--border, #332E24)', background: 'var(--coal, #1A1612)',
          color: 'var(--ink, #F7F2EA)', cursor: switching ? 'wait' : 'pointer',
          fontFamily: 'inherit', outline: 'none',
        }}
        aria-label="Aktive Organisation wechseln"
      >
        {orgs.map(o => (
          <option key={o.id} value={o.id}>
            {o.name}{o.status === 'onboarding' ? ' (Onboarding)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
