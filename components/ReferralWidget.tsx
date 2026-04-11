'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// ═══════════════════════════════════════════════════════════
// ReferralWidget — "Freunde einladen, 20 € kassieren"
// ═══════════════════════════════════════════════════════════
// Anzeige auf Kunde- und Engel-Dashboards.
// Zeigt persönlichen Referral-Link + Statistiken.
// ═══════════════════════════════════════════════════════════

export default function ReferralWidget() {
  const [data, setData] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); return }

      try {
        const res = await fetch('/api/referral', {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        })
        if (res.ok) {
          setData(await res.json())
        }
      } catch { /* ignore */ }
      setLoading(false)
    }
    load()
  }, [])

  async function handleCopy() {
    if (!data?.referral_link) return
    try {
      await navigator.clipboard.writeText(data.referral_link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback
      const input = document.createElement('input')
      input.value = data.referral_link
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  async function handleShare() {
    if (!data?.referral_link) return
    const shareText = `Ich nutze AlltagsEngel für Alltagshilfe — 131 €/Monat zahlt die Pflegekasse! Registriere dich über meinen Link und wir bekommen beide 20 € Bonus: ${data.referral_link}`

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'AlltagsEngel — Freunde einladen',
          text: shareText,
          url: data.referral_link,
        })
      } catch { /* cancelled */ }
    } else {
      handleCopy()
    }
  }

  if (loading) return null
  if (!data) return null

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1A1612 0%, #2a2520 100%)',
      borderRadius: 16,
      padding: '20px 24px',
      color: '#F7F2EA',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Gold accent */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 4,
        background: 'linear-gradient(90deg, #C9963C, #e0b860)',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(201,150,60,0.2)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>
          🎁
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Freunde einladen</div>
          <div style={{ fontSize: 12, color: '#C9963C' }}>20 € Bonus für euch beide</div>
        </div>
      </div>

      {/* Stats */}
      {data.stats.total > 0 && (
        <div style={{
          display: 'flex', gap: 16, marginBottom: 14,
          padding: '10px 0', borderTop: '1px solid rgba(201,150,60,0.2)',
          borderBottom: '1px solid rgba(201,150,60,0.2)',
        }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#C9963C' }}>{data.stats.total}</div>
            <div style={{ fontSize: 11, color: '#999' }}>Eingeladen</div>
          </div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#C9963C' }}>{data.stats.completed}</div>
            <div style={{ fontSize: 11, color: '#999' }}>Gebucht</div>
          </div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#C9963C' }}>{data.referral_credit} €</div>
            <div style={{ fontSize: 11, color: '#999' }}>Guthaben</div>
          </div>
        </div>
      )}

      {/* Referral Link */}
      <div style={{
        background: 'rgba(247,242,234,0.08)',
        borderRadius: 10, padding: '10px 14px',
        fontSize: 13, wordBreak: 'break-all',
        color: '#C9963C', marginBottom: 12,
        border: '1px solid rgba(201,150,60,0.15)',
      }}>
        {data.referral_link}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={handleCopy}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 10,
            border: '1px solid #C9963C', background: 'transparent',
            color: '#C9963C', fontWeight: 600, fontSize: 14,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.2s',
          }}
        >
          {copied ? '✓ Kopiert!' : 'Link kopieren'}
        </button>
        <button
          onClick={handleShare}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 10,
            border: 'none', background: '#C9963C',
            color: '#1A1612', fontWeight: 700, fontSize: 14,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.2s',
          }}
        >
          Teilen
        </button>
      </div>

      {/* Explanation */}
      <div style={{
        marginTop: 12, fontSize: 11, color: '#888', lineHeight: 1.5,
      }}>
        Teile deinen Link — wenn sich jemand registriert und die erste Buchung abschließt, bekommt ihr beide 20 € Guthaben.
      </div>
    </div>
  )
}
