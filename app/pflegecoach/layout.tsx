import type { Metadata } from 'next'
import { dipaModus, freischaltungPflicht } from '@/lib/coach/config'
import CoachShell from './CoachShell'
import './pflegecoach.css'

// PflegeCoach-Produktbereich: eigenes Layout, werbefrei,
// getrennt vom Alltagsengel-Marketing (LayoutWrapper/Tracker sind für
// /pflegecoach deaktiviert — siehe components/ClientSideProviders.tsx).
// DiPA-spezifische Funktionen (Anspruch, Freischaltpflicht, Abrechnung)
// sind per dipaModus() gated (page.tsx + API-Route) und im Default AUS.
//
// ═══ noindex BLEIBT HIER DER VORGABEWERT ═══════════════════════
// Der Produktbereich zeigt Nutzerdaten — Übersicht, Assessment, Ziele,
// Verlauf, Konto. Nichts davon gehört in einen Suchindex, und diese
// Vorgabe soll auch für Seiten gelten, die erst später dazukommen.
//
// Genau EINE Seite weicht bewusst ab: /pflegecoach/start, der
// öffentliche Einstieg. Sie setzt ihre Metadaten über
// coachVerkaufsMetadata() und wird indexierbar, sobald das Produkt
// tatsächlich verkäuflich ist (freigegebene Preise + konfigurierter
// Zahlungsweg). Die Begründung steht in _lib/seitentitel.ts.
export const metadata: Metadata = {
  title: { absolute: 'Digitaler PflegeCoach' },
  description:
    'Digitaler PflegeCoach: strukturierte Unterstützung für Pflegebedürftige und pflegende Angehörige in häuslicher Versorgung — Assessment, Ziele, Wochenplan, Verlauf.',
  robots: { index: false, follow: false },
}

export default function PflegeCoachLayout({ children }: { children: React.ReactNode }) {
  // Die Schalter werden hier (Server) ausgewertet und als Prop übergeben:
  // CoachShell ist eine Client-Komponente und kann process.env nicht lesen.
  // So bleibt der Freischalt-Punkt im Normalbetrieb nicht nur unerreichbar,
  // sondern taucht in der Navigation gar nicht erst auf.
  return (
    <CoachShell
      zeigeFreischaltung={dipaModus() || freischaltungPflicht()}
      dipaAktiv={dipaModus()}
    >
      {children}
    </CoachShell>
  )
}
