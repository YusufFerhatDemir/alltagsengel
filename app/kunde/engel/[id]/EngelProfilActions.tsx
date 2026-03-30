'use client'
import { useState } from 'react'
import { IconHeart, IconMore } from '@/components/Icons'

export default function EngelProfilActions({ angelId, angelName }: { angelId: string; angelName: string }) {
  const [liked, setLiked] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [shared, setShared] = useState(false)

  const handleLike = () => {
    setLiked(!liked)
  }

  const handleShare = async () => {
    const url = `https://alltagsengel.care/kunde/engel/${angelId}`
    if (navigator.share) {
      try {
        await navigator.share({ title: `AlltagsEngel - ${angelName}`, url })
      } catch {}
    } else {
      await navigator.clipboard.writeText(url)
      setShared(true)
      setTimeout(() => setShared(false), 2000)
    }
    setMenuOpen(false)
  }

  const handleReport = () => {
    window.location.href = `mailto:info@alltagsengel.care?subject=Meldung: ${angelName}&body=Ich möchte folgendes melden:`
    setMenuOpen(false)
  }

  return (
    <div className="ep-actions">
      <div className="ep-action" onClick={handleLike} style={{ cursor: 'pointer' }}>
        <IconHeart size={18} fill={liked ? 'var(--gold)' : 'none'} color={liked ? 'var(--gold)' : 'currentColor'} />
      </div>
      <div className="ep-action" onClick={() => setMenuOpen(!menuOpen)} style={{ cursor: 'pointer', position: 'relative' }}>
        <IconMore size={18} />
        {menuOpen && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 8,
            background: 'var(--card)', border: '1px solid var(--ink5)',
            borderRadius: 12, padding: 8, minWidth: 180, zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            <button onClick={handleShare} style={{
              display: 'block', width: '100%', padding: '10px 14px', border: 'none',
              background: 'none', color: 'var(--ink2)', fontSize: 14, textAlign: 'left',
              borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {shared ? '✓ Link kopiert!' : 'Profil teilen'}
            </button>
            <button onClick={handleReport} style={{
              display: 'block', width: '100%', padding: '10px 14px', border: 'none',
              background: 'none', color: 'var(--error, #e74c3c)', fontSize: 14, textAlign: 'left',
              borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Problem melden
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
