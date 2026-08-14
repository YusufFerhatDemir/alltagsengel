// Nur Dokumenttitel (WCAG 2.4.2) — die Seite selbst bleibt Client-Komponente.
// Begründung: app/pflegecoach/_lib/seitentitel.ts
//
// Verkaufsmetadaten statt der allgemeinen Produktmetadaten: Diese Seite
// ist der öffentliche Einstieg und wird indexierbar, sobald der Verkauf
// tatsächlich freigegeben ist (coachVerkaufsMetadata erklärt, warum die
// Indexierung an dieser Bedingung hängt und nicht an einem Deployment).
import { coachVerkaufsMetadata } from '../_lib/seitentitel'

export const metadata = coachVerkaufsMetadata('Willkommen und Zweckbestimmung')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
