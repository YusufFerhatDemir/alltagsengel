'use client'
import React, { createContext, useContext, useState, useEffect } from 'react'

const MisContext = createContext({ isMobile: false })

// SSR-safe: check user agent for initial mobile detection to avoid flash
function getInitialMobile(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 900
}

export function MisProvider({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(getInitialMobile)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return <MisContext.Provider value={{ isMobile }}>{children}</MisContext.Provider>
}

export function useMis() {
  return useContext(MisContext)
}
