'use client'

// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Produktmodus für Client-Seiten
//
// Client-Komponenten können `process.env` nicht lesen. Der Schalter
// COACH_DIPA_MODUS wird deshalb im Server-Layout ausgewertet und hier
// weitergereicht.
//
// WARUM DAS NÖTIG IST: Der PflegeCoach wird heute als Selbstzahler-
// Produkt verkauft. Die Produktseite sagt das ausdrücklich („keine
// Leistung der gesetzlichen Pflege- oder Krankenversicherung"). Diese
// Aussage wäre falsch, sobald ein DiPA-Verfahren tatsächlich greift —
// sie darf deshalb nicht hartkodiert im Markup stehen, sondern muss an
// denselben Schalter gebunden sein wie alle anderen DiPA-Oberflächen.
// Default ist AUS, also gilt im Normalbetrieb die Selbstzahler-Aussage.
// ═══════════════════════════════════════════════════════════════

import { createContext, useContext } from 'react'

const DipaModusContext = createContext(false)

export function DipaModusProvider({
  aktiv,
  children,
}: {
  aktiv: boolean
  children: React.ReactNode
}) {
  return <DipaModusContext.Provider value={aktiv}>{children}</DipaModusContext.Provider>
}

/** true, wenn COACH_DIPA_MODUS gesetzt ist. Im Normalbetrieb false. */
export function useDipaModus(): boolean {
  return useContext(DipaModusContext)
}
