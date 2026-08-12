import type { Metadata } from 'next'
import CoachShell from './CoachShell'
import './pflegecoach.css'

// PflegeCoach-Produktbereich: eigenes Layout, werbefrei,
// getrennt vom Alltagsengel-Marketing (LayoutWrapper/Tracker sind für
// /pflegecoach deaktiviert — siehe components/ClientSideProviders.tsx).
// DiPA-spezifische Funktionen (Anspruch, Freischaltpflicht, Abrechnung)
// sind per COACH_DIPA_MODUS gated und im Default AUS.
export const metadata: Metadata = {
  title: { absolute: 'Digitaler PflegeCoach' },
  description:
    'Digitaler PflegeCoach: strukturierte Unterstützung für Pflegebedürftige und pflegende Angehörige in häuslicher Versorgung — Assessment, Ziele, Wochenplan, Verlauf.',
  robots: { index: false, follow: false },
}

export default function PflegeCoachLayout({ children }: { children: React.ReactNode }) {
  return <CoachShell>{children}</CoachShell>
}
