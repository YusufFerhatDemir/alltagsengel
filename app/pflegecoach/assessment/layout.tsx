// Nur Dokumenttitel (WCAG 2.4.2) — die Seite selbst bleibt Client-Komponente.
// Begründung: app/pflegecoach/_lib/seitentitel.ts
import { coachSeitenMetadata } from '../_lib/seitentitel'

export const metadata = coachSeitenMetadata('Pflegeassessment')

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
