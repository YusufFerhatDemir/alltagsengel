'use client'
import { useEffect, useState } from 'react'
import { PLAN_FEATURES, PLAN_LABELS, type BillingPlan } from '@/lib/organizations/types'

type Subscription = {
  plan: BillingPlan
  status: 'trialing' | 'active' | 'past_due' | 'cancelled'
  current_period_end: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
} | null

type PlanCard = {
  id: 'free' | 'starter' | 'pro' | 'scale'
  label: string
  price: string
  capacity: string
}

const PLAN_CARDS: PlanCard[] = [
  { id: 'free', label: 'Free', price: 'Kostenlos', capacity: '10 Klienten, kein EDIFACT' },
  { id: 'starter', label: 'Starter', price: '99 €/Monat', capacity: '50 Klienten, EDIFACT' },
  { id: 'pro', label: 'Pro', price: '199 €/Monat', capacity: '150 Klienten, EDIFACT + KI-Prüfung + eL-NW' },
  { id: 'scale', label: 'Scale', price: '349 €/Monat', capacity: 'Unbegrenzt, alle Features + API' },
]

const FEATURE_LABELS: Record<string, string> = {
  edifact: 'EDIFACT',
  ki_pruefung: 'KI-Prüfung',
  elnw: 'eL-NW',
  api: 'API',
}
const FEATURE_ORDER = ['edifact', 'ki_pruefung', 'elnw', 'api']
const PLAN_ORDER: PlanCard['id'][] = ['free', 'starter', 'pro', 'scale']

/** Günstigster Plan, der ein Feature freischaltet (für den „ab …“-Hinweis). */
function unlockedFrom(feature: string): string {
  const plan = PLAN_ORDER.find(p => PLAN_FEATURES[p][feature] === true)
  return plan ? PLAN_LABELS[plan].split(' —')[0] : ''
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  trialing: { label: 'Testphase', color: '#DBA84A' },
  active: { label: 'Aktiv', color: '#6ddf80' },
  past_due: { label: 'Zahlung ausstehend', color: '#ff8080' },
  cancelled: { label: 'Gekündigt', color: 'var(--dim)' },
}

const cardStyle: React.CSSProperties = {
  background: 'var(--card-bg, rgba(28,24,20,0.6))',
  border: '1px solid var(--border, rgba(201,150,60,0.15))',
  borderRadius: 16,
  padding: 24,
  marginBottom: 24,
}

const btnStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 10,
  border: 'none',
  background: 'linear-gradient(135deg, #C9963C, #DBA84A)',
  color: '#0D0A08',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
  width: '100%',
}

export default function BillingSection() {
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgName, setOrgName] = useState('')
  const [subscription, setSubscription] = useState<Subscription>(null)
  const [billingPlan, setBillingPlan] = useState<BillingPlan>('free')
  const [busyPlan, setBusyPlan] = useState<string | null>(null)
  const [portalBusy, setPortalBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/organizations/subscription')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled || !data) return
        setOrgId(data.orgId || null)
        setOrgName(data.organization?.name || '')
        setBillingPlan((data.organization?.billing_plan || 'free') as BillingPlan)
        setSubscription(data.subscription || null)
      })
      .catch(() => setError('Abo-Daten konnten nicht geladen werden'))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const currentPlan: BillingPlan = subscription?.plan || billingPlan
  const hasStripeSubscription = Boolean(subscription?.stripe_subscription_id)

  async function handleUpgrade(plan: PlanCard['id']) {
    if (!orgId || plan === 'free') return
    setError('')
    setBusyPlan(plan)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, plan }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setBusyPlan(null); return }
      window.location.href = data.url
    } catch {
      setError('Netzwerkfehler beim Erstellen der Checkout-Session')
      setBusyPlan(null)
    }
  }

  async function handlePortal() {
    if (!orgId) return
    setError('')
    setPortalBusy(true)
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setPortalBusy(false); return }
      window.location.href = data.url
    } catch {
      setError('Netzwerkfehler beim Öffnen der Abo-Verwaltung')
      setPortalBusy(false)
    }
  }

  if (loading) {
    return (
      <div style={cardStyle}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8, fontFamily: "'Cormorant Garamond', serif" }}>
          Abo & Tarif
        </h2>
        <p style={{ color: 'var(--dim)', fontSize: 13 }}>Lade Abo-Daten…</p>
      </div>
    )
  }

  const status = subscription?.status
  const statusInfo = status ? STATUS_LABELS[status] : null
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
    : null

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 16, fontFamily: "'Cormorant Garamond', serif" }}>
        Abo & Tarif
      </h2>

      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12,
        padding: '12px 16px', borderRadius: 10, background: 'rgba(13,10,8,0.4)', marginBottom: 20,
      }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--dim)' }}>{orgName || 'Organisation'}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gold2, #DBA84A)' }}>{PLAN_LABELS[currentPlan]}</div>
        </div>
        {statusInfo && (
          <span style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase', padding: '3px 10px',
            borderRadius: 6, background: `${statusInfo.color}22`, color: statusInfo.color,
          }}>
            {statusInfo.label}
          </span>
        )}
        {periodEnd && (
          <span style={{ fontSize: 13, color: 'var(--dim)' }}>
            {status === 'cancelled' ? 'Endet am' : 'Verlängert sich am'} {periodEnd}
          </span>
        )}
        {hasStripeSubscription && (
          <button onClick={handlePortal} disabled={portalBusy} style={{ ...btnStyle, width: 'auto', marginLeft: 'auto' }}>
            {portalBusy ? '...' : 'Abo verwalten'}
          </button>
        )}
      </div>

      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: 'rgba(180,50,50,0.15)', color: '#ff8080',
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {PLAN_CARDS.map(card => {
          const isCurrent = card.id === currentPlan
          const features = PLAN_FEATURES[card.id]
          return (
            <div key={card.id} style={{
              border: `1px solid ${isCurrent ? 'var(--gold2, #DBA84A)' : 'var(--border, rgba(201,150,60,0.15))'}`,
              borderRadius: 12, padding: 16, background: 'rgba(13,10,8,0.35)',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{card.label}</div>
                <div style={{ fontSize: 13, color: 'var(--gold2, #DBA84A)', fontWeight: 600 }}>{card.price}</div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--dim)', margin: 0, lineHeight: 1.5 }}>{card.capacity}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {FEATURE_ORDER.map(f => {
                  const unlocked = features[f] === true
                  return (
                    <div key={f} style={{ fontSize: 12, color: unlocked ? '#6ddf80' : 'var(--dim)', display: 'flex', gap: 6 }}>
                      <span>{unlocked ? '✓' : '🔒'}</span>
                      <span>{FEATURE_LABELS[f]}{!unlocked ? ` — ab ${unlockedFrom(f)}` : ''}</span>
                    </div>
                  )
                })}
              </div>
              {isCurrent ? (
                <span style={{
                  textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--gold2, #DBA84A)',
                  border: '1px solid var(--gold2, #DBA84A)', borderRadius: 8, padding: '8px 0',
                }}>
                  Aktueller Plan
                </span>
              ) : card.id !== 'free' ? (
                <button onClick={() => handleUpgrade(card.id)} disabled={busyPlan === card.id} style={btnStyle}>
                  {busyPlan === card.id ? '...' : 'Upgraden'}
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
