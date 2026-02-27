'use client'

/**
 * 3D Glowing Avatar Icons
 * - Kunde: Gold crown/user with radial glow
 * - Engel: Glowing heart with pulse animation
 */

export function AvatarKunde({ size = 72 }: { size?: number }) {
  const id = 'avk'
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.3,
      background: 'linear-gradient(145deg, #1a1612 0%, #0e0b04 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      boxShadow: '0 0 0 1.5px rgba(201,150,60,.35), 0 4px 16px rgba(0,0,0,.5), 0 0 32px rgba(201,150,60,.12)',
    }}>
      {/* Inner glow */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 50% 40%, rgba(201,150,60,.18) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" style={{ position: 'relative', zIndex: 2, filter: 'drop-shadow(0 0 6px rgba(201,150,60,.4))' }}>
        <defs>
          <linearGradient id={id} x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F8E064"/>
            <stop offset="50%" stopColor="#DBA84A"/>
            <stop offset="100%" stopColor="#B8882E"/>
          </linearGradient>
        </defs>
        <circle cx="12" cy="8" r="4" fill={`url(#${id})`} />
        <path d="M4 21v-1a6 6 0 0116 0v1" fill={`url(#${id})`} opacity="0.85" />
        {/* Crown accent */}
        <path d="M8 4.5L9.5 2 12 4 14.5 2 16 4.5" fill="none" stroke="#F8E064" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
      </svg>
      {/* Shimmer */}
      <div className="avatar-shimmer" style={{
        position: 'absolute', top: '-50%', left: '-50%',
        width: '200%', height: '200%',
        background: 'conic-gradient(from 0deg, transparent 0%, rgba(201,150,60,.08) 10%, transparent 20%)',
        animation: 'avatarSpin 6s linear infinite',
        pointerEvents: 'none', zIndex: 1,
      }} />
    </div>
  )
}

export function AvatarEngel({ size = 72 }: { size?: number }) {
  const id = 'ave'
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.3,
      background: 'linear-gradient(145deg, #1a1612 0%, #0e0b04 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      boxShadow: '0 0 0 1.5px rgba(201,150,60,.35), 0 4px 16px rgba(0,0,0,.5), 0 0 32px rgba(201,150,60,.15)',
    }}>
      {/* Heart glow */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 50% 45%, rgba(248,100,100,.12) 0%, rgba(201,150,60,.1) 40%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" style={{
        position: 'relative', zIndex: 2,
        filter: 'drop-shadow(0 0 8px rgba(248,100,100,.35)) drop-shadow(0 0 16px rgba(201,150,60,.25))',
        animation: 'heartPulse 2s ease-in-out infinite',
      }}>
        <defs>
          <linearGradient id={id} x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF6B6B"/>
            <stop offset="40%" stopColor="#F8556C"/>
            <stop offset="100%" stopColor="#C9963C"/>
          </linearGradient>
          <linearGradient id={`${id}h`} x1="8" y1="5" x2="16" y2="15" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(255,255,255,.5)"/>
            <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
          </linearGradient>
        </defs>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill={`url(#${id})`} />
        {/* Highlight */}
        <ellipse cx="8.5" cy="7.5" rx="3" ry="2.5" fill={`url(#${id}h)`} opacity="0.4" />
      </svg>
      {/* Shimmer */}
      <div style={{
        position: 'absolute', top: '-50%', left: '-50%',
        width: '200%', height: '200%',
        background: 'conic-gradient(from 0deg, transparent 0%, rgba(248,100,100,.06) 10%, transparent 20%)',
        animation: 'avatarSpin 5s linear infinite',
        pointerEvents: 'none', zIndex: 1,
      }} />
    </div>
  )
}
