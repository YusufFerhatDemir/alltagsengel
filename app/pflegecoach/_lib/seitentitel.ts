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
import { verkaufMoeglich } from '@/lib/coach/pricing'

/** Baut den Dokumenttitel eines Produktbereichs: „<Bereich> — Digitaler PflegeCoach". */
export function coachSeitenMetadata(bereich: string): Metadata {
  return {
    title: { absolute: `${bereich} — ${COACH_PRODUKT_NAME}` },
    robots: { index: false, follow: false },
  }
}

/**
 * Metadaten für die ÖFFENTLICHEN Verkaufsseiten (Einstieg, AGB,
 * Widerrufsbelehrung).
 *
 * ═══ WARUM DIE INDEXIERUNG AN DER PREISFREIGABE HÄNGT ══════════
 * Alle Produktseiten waren bisher pauschal auf noindex gesetzt. Das war
 * richtig, solange es keinen Kaufweg gab. Der Kaufweg besteht jetzt —
 * aber er ist fail-closed gesperrt, bis die Preise kaufmännisch
 * entschieden sind (lib/coach/pricing.ts).
 *
 * Eine Verkaufsseite, die gefunden wird und dann „derzeit nicht
 * bestellbar" sagt, ist schlechter als gar keine: Sie verbrennt den
 * ersten Eindruck und wird von Suchmaschinen als dünn eingestuft.
 * Deshalb wird `noindex` nicht per Deployment entfernt, sondern genau
 * dann, wenn das Produkt tatsächlich verkäuflich ist — dieselbe
 * Bedingung, dieselbe Umschaltung, kein zweiter Handgriff, der
 * vergessen werden kann.
 *
 * `follow` bleibt in beiden Fällen an: Die Seiten verlinken auf
 * Impressum und Datenschutz, diese Verweise sollen zählen.
 *
 * ALLE ÜBRIGEN Produktseiten (Assessment, Ziele, Verlauf, Konto …)
 * bleiben unabhängig davon dauerhaft auf noindex — sie zeigen
 * Nutzerdaten und gehören in keinen Index.
 */
export function coachVerkaufsMetadata(bereich: string): Metadata {
  const indexierbar = verkaufMoeglich()
  return {
    title: { absolute: `${bereich} — ${COACH_PRODUKT_NAME}` },
    robots: { index: indexierbar, follow: true },
  }
}
