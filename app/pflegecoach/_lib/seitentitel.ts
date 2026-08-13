// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Seitentitel je Bereich (WCAG 2.1 AA, 2.4.2 „Titled")
//
// Ausgangslage: Alle Produktseiten trugen denselben Dokumenttitel
// („Digitaler PflegeCoach"), weil `app/pflegecoach/layout.tsx` ihn absolut
// setzt und die Seiten selbst Client-Komponenten sind — die können kein
// `metadata` exportieren. Für Screenreader- und Tab-Navigation ist der
// Dokumenttitel aber die erste Orientierung; identische Titel machen den
// Verlauf und offene Tabs unbrauchbar.
//
// Lösung ohne Umbau der Seiten: je Bereich ein schlankes Segment-Layout,
// das nur `metadata` beisteuert und die Kinder unverändert durchreicht.
//
// `absolute` ist Absicht: Die Wurzel-Vorlage der Plattform („%s | Alltagsengel")
// darf im Produktbereich nicht greifen — der PflegeCoach ist ein eigenes,
// eigenständig benanntes Produkt (Produktgrenze, siehe
// audit/dipa/technische_dokumentation_pflegecoach.md §1).
// ═══════════════════════════════════════════════════════════════

import type { Metadata } from 'next'
import { COACH_PRODUKT_NAME } from '@/lib/coach/version'

/** Baut den Dokumenttitel eines Produktbereichs: „<Bereich> — Digitaler PflegeCoach". */
export function coachSeitenMetadata(bereich: string): Metadata {
  return {
    title: { absolute: `${bereich} — ${COACH_PRODUKT_NAME}` },
    robots: { index: false, follow: false },
  }
}
