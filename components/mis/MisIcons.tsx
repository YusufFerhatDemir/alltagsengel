'use client'
// Lightweight SVG icons for MIS Portal
import React from 'react'

const s = (d: string, size = 20) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d.split('|').map((p,i)=><path key={i} d={p}/>)}</svg>
)

export const MIcon = ({ name, size = 20 }: { name: string; size?: number }) => {
  const icons: Record<string, React.ReactNode> = {
    gauge: s('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20|M12 12l3.5-3.5|M12 8v4', size),
    files: s('M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z|M14 2v4a1 1 0 0 0 1 1h3', size),
    lock: s('M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2Z|M7 11V7a5 5 0 0 1 10 0v4', size),
    banknote: s('M2 8h20v10H2z|M12 13a2 2 0 1 0 0-0.01|M6 8v10|M18 8v10', size),
    truck: s('M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h1|M15 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 13.52 9H14|M7 18a2 2 0 1 0 0-.01|M19 18a2 2 0 1 0 0-.01', size),
    shield: s('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z|M9 12l2 2 4-4', size),
    trending: s('M22 7l-8.5 8.5-5-5L2 17|M16 7h6v6', size),
    users: s('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M22 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75', size),
    sparkles: s('M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5Z|M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75Z', size),
    settings: s('M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6', size),
    search: s('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16|M21 21l-4.35-4.35', size),
    bell: s('M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9|M13.73 21a2 2 0 0 1-3.46 0', size),
    plus: s('M12 5v14|M5 12h14', size),
    upload: s('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M17 8l-5-5-5 5|M12 3v12', size),
    download: s('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M7 10l5 5 5-5|M12 15V3', size),
    check: s('M20 6L9 17l-5-5', size),
    x: s('M18 6L6 18|M6 6l12 12', size),
    chevronRight: s('M9 18l6-6-6-6', size),
    chevronDown: s('M6 9l6 6 6-6', size),
    menu: s('M3 12h18|M3 6h18|M3 18h18', size),
    home: s('M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M9 22V12h6v10', size),
    chart: s('M18 20V10|M12 20V4|M6 20v-6', size),
    arrowUp: s('M12 19V5|M5 12l7-7 7 7', size),
    arrowDown: s('M12 5v14|M19 12l-7 7-7-7', size),
    clock: s('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20|M12 6v6l4 2', size),
    eye: s('M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6', size),
    edit: s('M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z', size),
    trash: s('M3 6h18|M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6|M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2', size),
    folder: s('M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z', size),
    target: s('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20|M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12|M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4', size),
    award: s('M12 15l-3 6 1-4-3-2h4L12 9l1 6h4l-3 2 1 4z|M12 8a5 5 0 1 0 0-10 5 5 0 0 0 0 10', size),
    filter: s('M22 3H2l8 9.46V19l4 2v-8.54Z', size),
    externalLink: s('M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6|M15 3h6v6|M10 14L21 3', size),
    refresh: s('M1 4v6h6|M3.51 15a9 9 0 1 0 2.13-9.36L1 10', size),
    wings: s('M12 4C8 4 4 8 4 12s4 8 8 8 8-4 8-8-4-8-8-8|M12 8c-2 0-3.5 1.5-3.5 4s1.5 4 3.5 4 3.5-1.5 3.5-4-1.5-4-3.5-4', size),
    send: s('M22 2L11 13|M22 2l-7 20-4-9-9-4z', size),
    zap: s('M13 2L3 14h9l-1 8 10-12h-9l1-8Z', size),
    brain: s('M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7Z|M9 21h6|M10 17v4|M14 17v4', size),
    globe: s('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20|M2 12h20|M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10', size),
    pieChart: s('M21.21 15.89A10 10 0 1 1 8 2.83|M22 12A10 10 0 0 0 12 2v10z', size),
    activity: s('M22 12h-4l-3 9L9 3l-3 9H2', size),
    layers: s('M12 2L2 7l10 5 10-5-10-5Z|M2 17l10 5 10-5|M2 12l10 5 10-5', size),
    tag: s('M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z|M7 7h.01', size),
    calendar: s('M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z|M16 2v4|M8 2v4|M3 10h18', size),
    logout: s('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5|M21 12H9', size),
  }
  return <>{icons[name] || icons.files}</>
}
