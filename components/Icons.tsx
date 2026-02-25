interface IconProps {
  size?: number
  color?: string
  strokeWidth?: number
  className?: string
}

const defaults = { size: 20, color: 'currentColor', strokeWidth: 1.8 }

function I({ size = defaults.size, color = defaults.color, strokeWidth = defaults.strokeWidth, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  )
}

// ── Navigation ──
export function IconHome(p: IconProps) {
  return <I {...p}><path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1z" /><path d="M9 21V14h6v7" /></I>
}

export function IconSearch(p: IconProps) {
  return <I {...p}><circle cx="10.5" cy="10.5" r="6.5" /><path d="M21 21l-4.35-4.35" /></I>
}

export function IconCalendar(p: IconProps) {
  return <I {...p}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 9h18" /></I>
}

export function IconUser(p: IconProps) {
  return <I {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0112 0v1" /><path d="M20 21v-1a4 4 0 00-2-3.45" /></I>
}

export function IconClipboard(p: IconProps) {
  return <I {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3h6v2H9zM9 10h6M9 14h4" /></I>
}

// ── Categories ──
export function IconStar(p: IconProps) {
  return <I {...p}><path d="M12 2l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17l-5.8 2.9 1.1-6.47L2.6 8.85l6.5-.95z" /></I>
}

export function IconHandshake(p: IconProps) {
  return <I {...p}><path d="M7 11l3.5 3.5L17 8" /><path d="M2 12a5 5 0 015-5h2l3 3 3-3h2a5 5 0 015 5v0a5 5 0 01-5 5H7a5 5 0 01-5-5z" /></I>
}

export function IconMedical(p: IconProps) {
  return <I {...p}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M12 8v8M8 12h8" /></I>
}

export function IconBag(p: IconProps) {
  return <I {...p}><path d="M6 6h12l1 14H5z" /><path d="M9 6V4a3 3 0 016 0v2" /></I>
}

export function IconCoffee(p: IconProps) {
  return <I {...p}><path d="M4 11h12v5a4 4 0 01-4 4H8a4 4 0 01-4-4z" /><path d="M16 11h1a3 3 0 010 6h-1" /><path d="M6 7v-1M10 7V5M14 7v-1" /></I>
}

export function IconTarget(p: IconProps) {
  return <I {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></I>
}

export function IconPill(p: IconProps) {
  return <I {...p}><path d="M8.5 2.5l13 13a4.24 4.24 0 01-6 6l-13-13a4.24 4.24 0 016-6z" /><path d="M12 10L6 16" /></I>
}

export function IconWalk(p: IconProps) {
  return <I {...p}><circle cx="13" cy="4.5" r="2" /><path d="M10 10l-2 7 4-1.5M10 10l4 2 2 5M10 10l2-4" /></I>
}

// ── UI ──
export function IconPin(p: IconProps) {
  return <I {...p}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /><circle cx="12" cy="9" r="2.5" /></I>
}

export function IconChat(p: IconProps) {
  return <I {...p}><path d="M4 4h16a1 1 0 011 1v10a1 1 0 01-1 1H7l-3 3z" /></I>
}

export function IconCard(p: IconProps) {
  return <I {...p}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></I>
}

export function IconShield(p: IconProps) {
  return <I {...p}><path d="M12 2l8 4v5c0 5.25-3.5 8.25-8 10-4.5-1.75-8-4.75-8-10V6z" /><path d="M9 12l2 2 4-4" /></I>
}

export function IconClock(p: IconProps) {
  return <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></I>
}

export function IconMoney(p: IconProps) {
  return <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M8.5 9.5h5a2 2 0 010 4h-3a2 2 0 000 4h5" /></I>
}

export function IconPhone(p: IconProps) {
  return <I {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z" /></I>
}

export function IconChart(p: IconProps) {
  return <I {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 17V13M12 17V8M17 17v-7" /></I>
}

export function IconUsers(p: IconProps) {
  return <I {...p}><circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="8" r="2.5" /><path d="M2 21v-1a5 5 0 0110 0v1" /><path d="M16 21v-1a4 4 0 00-1.5-3.1 4.5 4.5 0 016.5 3.1v1" /></I>
}

export function IconLogout(p: IconProps) {
  return <I {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></I>
}

export function IconWings(p: IconProps) {
  return <I {...p}><circle cx="12" cy="6" r="3" /><path d="M12 9c-3.5 0-6 2-7 5 1 2 3.5 3.5 7 3.5s6-1.5 7-3.5c-1-3-3.5-5-7-5z" /><path d="M4 10c-1 1.5-1 3.5 0 5M20 10c1 1.5 1 3.5 0 5" /></I>
}

export function IconDocument(p: IconProps) {
  return <I {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M10 13h4M10 17h2" /></I>
}

export function IconLock(p: IconProps) {
  return <I {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></I>
}

export function IconHeart(p: IconProps) {
  return <I {...p}><path d="M12 21C12 21 4 14.5 4 8.5 4 5.42 6.42 3 9.5 3c1.74 0 3.41.81 4.5 2.09A6.04 6.04 0 0118.5 3C21.58 3 24 5.42 24 8.5 24 14.5 12 21 12 21z" /></I>
}

export function IconCheck(p: IconProps) {
  return <I {...p}><path d="M5 12l5 5L20 7" /></I>
}

export function IconNav(p: IconProps) {
  return <I {...p}><path d="M3 12l9-9 9 9M5 10v10h14V10" /></I>
}

export function IconStarFilled(p: IconProps) {
  return (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill={p.color || 'currentColor'} stroke="none" className={p.className}>
      <path d="M12 2l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17l-5.8 2.9 1.1-6.47L2.6 8.85l6.5-.95z" />
    </svg>
  )
}

export function IconInfo(p: IconProps) {
  return <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v0M12 12v4" /><circle cx="12" cy="8" r="0.5" fill="currentColor" stroke="none" /></I>
}

export function IconMore(p: IconProps) {
  return (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill={p.color || 'currentColor'} stroke="none" className={p.className}>
      <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
    </svg>
  )
}
