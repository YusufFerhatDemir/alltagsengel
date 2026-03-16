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

// ══════════════════════════════════════════════
// PREMIUM GOLD ICONS (Filled with Gold Gradient)
// ══════════════════════════════════════════════

function IGold({ size = 20, gid, className, children }: { size?: number; gid: string; className?: string; children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <defs>
        <linearGradient id={gid} x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F8E064"/>
          <stop offset="45%" stopColor="#DBA84A"/>
          <stop offset="100%" stopColor="#B8882E"/>
        </linearGradient>
        <linearGradient id={`${gid}L`} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FCF0A0"/>
          <stop offset="50%" stopColor="#E8C850"/>
          <stop offset="100%" stopColor="#C9963C"/>
        </linearGradient>
      </defs>
      {children}
    </svg>
  )
}

export function IconStarGold(p: IconProps) {
  return <IGold size={p.size} gid="gSt" className={p.className}>
    <path d="M12 2l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17l-5.8 2.9 1.1-6.47L2.6 8.85l6.5-.95z" fill="url(#gSt)" stroke="#A07428" strokeWidth="0.4" strokeLinejoin="round"/>
  </IGold>
}

export function IconHandshakeGold(p: IconProps) {
  return <IGold size={p.size} gid="gHs" className={p.className}>
    <path d="M2 12a5 5 0 015-5h2l3 3 3-3h2a5 5 0 015 5v0a5 5 0 01-5 5H7a5 5 0 01-5-5z" fill="url(#gHs)" stroke="#A07428" strokeWidth="0.4"/>
    <path d="M7.5 11.5l3 3L16.5 8.5" fill="none" stroke="#1A1612" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </IGold>
}

export function IconMedicalGold(p: IconProps) {
  return <IGold size={p.size} gid="gMd" className={p.className}>
    <rect x="3" y="3" width="18" height="18" rx="4" fill="url(#gMd)" stroke="#A07428" strokeWidth="0.4"/>
    <path d="M12 7.5v9M7.5 12h9" fill="none" stroke="#1A1612" strokeWidth="2.2" strokeLinecap="round"/>
  </IGold>
}

export function IconBagGold(p: IconProps) {
  return <IGold size={p.size} gid="gBg" className={p.className}>
    <path d="M5.5 8h13l1 13H4.5z" fill="url(#gBg)" stroke="#A07428" strokeWidth="0.4" strokeLinejoin="round"/>
    <path d="M9 8V5.5a3 3 0 016 0V8" fill="none" stroke="url(#gBgL)" strokeWidth="1.4" strokeLinecap="round"/>
  </IGold>
}

export function IconHomeGold(p: IconProps) {
  return <IGold size={p.size} gid="gHm" className={p.className}>
    <path d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 20z" fill="url(#gHm)" stroke="#A07428" strokeWidth="0.4" strokeLinejoin="round"/>
    <rect x="9" y="14" width="6" height="7.5" rx="0.5" fill="#1A1612"/>
  </IGold>
}

export function IconCoffeeGold(p: IconProps) {
  return <IGold size={p.size} gid="gCf" className={p.className}>
    <path d="M3.5 10h13v6a4.5 4.5 0 01-4.5 4.5h-4A4.5 4.5 0 013.5 16z" fill="url(#gCf)" stroke="#A07428" strokeWidth="0.4"/>
    <path d="M16.5 11h1a3 3 0 010 6h-1" fill="none" stroke="url(#gCfL)" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M6 7V5.5M10 7V4M14 7V5.5" fill="none" stroke="url(#gCfL)" strokeWidth="1.3" strokeLinecap="round"/>
  </IGold>
}

export function IconPillGold(p: IconProps) {
  return <IGold size={p.size} gid="gPl" className={p.className}>
    <rect x="4" y="4" width="16" height="16" rx="3" fill="url(#gPl)" stroke="#A07428" strokeWidth="0.4"/>
    <path d="M12 7v10" fill="none" stroke="#1A1612" strokeWidth="2.8" strokeLinecap="round"/>
    <path d="M7 12h10" fill="none" stroke="#1A1612" strokeWidth="2.8" strokeLinecap="round"/>
  </IGold>
}

export function IconWalkGold(p: IconProps) {
  return <IGold size={p.size} gid="gWk" className={p.className}>
    <circle cx="13" cy="4" r="2.8" fill="url(#gWk)"/>
    <path d="M9.5 10l-2 7.5 4.5-1.5M9.5 10l4.5 2 2 6M9.5 10l2-4" fill="none" stroke="url(#gWk)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </IGold>
}

export function IconTargetGold(p: IconProps) {
  return <IGold size={p.size} gid="gTg" className={p.className}>
    <circle cx="12" cy="12" r="10" fill="url(#gTg)" stroke="#A07428" strokeWidth="0.3"/>
    <circle cx="12" cy="12" r="6" fill="#1A1612"/>
    <circle cx="12" cy="12" r="3" fill="url(#gTgL)"/>
  </IGold>
}

// ── Pflegebox ──
export function IconBox(p: IconProps) {
  return <I {...p}><path d="M21 8V21H3V8" /><rect x="1" y="3" width="22" height="5" rx="1" /><path d="M10 12h4" /></I>
}

export function IconShieldPlain(p: IconProps) {
  return <I {...p}><path d="M12 2L3 7v5c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7z" /></I>
}

export function IconDroplet(p: IconProps) {
  return <I {...p}><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" /></I>
}

export function IconGloves(p: IconProps) {
  return <I {...p}><path d="M6.5 3C5.67 3 5 3.67 5 4.5V12l-1.5-2a1.5 1.5 0 00-2.6 1.5l3.6 6.2A6.5 6.5 0 0010 21h4a6.5 6.5 0 005.5-3.3l3.6-6.2a1.5 1.5 0 00-2.6-1.5L19 12V4.5c0-.83-.67-1.5-1.5-1.5S16 3.67 16 4.5V9M14 4.5c0-.83-.67-1.5-1.5-1.5S11 3.67 11 4.5V9M11 4.5V9M8.5 4.5c0-.83-.67-1.5-1.5-1.5" /><path d="M8 4.5V10" /></I>
}

export function IconTruck(p: IconProps) {
  return <I {...p}><rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 4v4h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></I>
}

export function IconWingsGold(p: IconProps) {
  return <IGold size={p.size} gid="gWg" className={p.className}>
    <circle cx="12" cy="5.5" r="3.2" fill="url(#gWg)"/>
    <path d="M12 8.5c-4 0-6.5 2-7.5 5.5 1 2.5 4 4 7.5 4s6.5-1.5 7.5-4c-1-3.5-3.5-5.5-7.5-5.5z" fill="url(#gWg)" stroke="#A07428" strokeWidth="0.3"/>
    <path d="M4.5 8.5C2.5 9.5 1.5 12 2.5 15" fill="none" stroke="url(#gWgL)" strokeWidth="2" strokeLinecap="round"/>
    <path d="M19.5 8.5c2 1 3 3.5 2 6.5" fill="none" stroke="url(#gWgL)" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="12" cy="5.5" r="1.2" fill="url(#gWgL)" opacity="0.6"/>
  </IGold>
}

// ── Krankenfahrdienst (Ambulance) ──
export function IconKrankenfahrtGold(p: IconProps) {
  return <IGold size={p.size} gid="gKf" className={p.className}>
    <rect x="1" y="10" width="15" height="8" rx="1.5" fill="url(#gKf)" stroke="#A07428" strokeWidth="0.4"/>
    <path d="M16 13h4.5l2.5 3v2h-7v-5z" fill="url(#gKfL)" stroke="#A07428" strokeWidth="0.4" strokeLinejoin="round"/>
    <circle cx="5.5" cy="19.5" r="2" fill="url(#gKf)" stroke="#A07428" strokeWidth="0.5"/>
    <circle cx="18.5" cy="19.5" r="2" fill="url(#gKf)" stroke="#A07428" strokeWidth="0.5"/>
    <path d="M8.5 13v4M6.5 15h4" fill="none" stroke="#1A1612" strokeWidth="2" strokeLinecap="round"/>
  </IGold>
}

// ── Notification Bell ──
export function IconBell(p: IconProps) {
  return <I {...p}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></I>
}

// ── Hygienebox ──
export function IconHygieneboxGold(p: IconProps) {
  return <IGold size={p.size} gid="gHb" className={p.className}>
    <rect x="2" y="9" width="20" height="12" rx="2" fill="url(#gHb)" stroke="#A07428" strokeWidth="0.4"/>
    <rect x="1" y="5" width="22" height="5" rx="1.5" fill="url(#gHbL)" stroke="#A07428" strokeWidth="0.3"/>
    <path d="M10 5V3.5a2 2 0 014 0V5" fill="none" stroke="#A07428" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M9 14.5l2 2 4-4" fill="none" stroke="#1A1612" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </IGold>
}
