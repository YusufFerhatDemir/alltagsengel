'use client'
import React, { createContext, useContext, useState, useEffect } from 'react'

const MisContext = createContext({ isMobile: false })

export function MisProvider({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false)
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
