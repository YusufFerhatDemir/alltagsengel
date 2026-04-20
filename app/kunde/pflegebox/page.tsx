// ═══════════════════════════════════════════════════════════════
// Pflegebox-Feature deaktiviert (Phase 5 Architektur-Empfehlung)
// ═══════════════════════════════════════════════════════════════
// Grund:
//   Die Pflegebox-Tabellen (care_eligibility, carebox_*) existieren
//   nicht in der Datenbank — der Kunde sah leere Listen + 404er
//   in den DevTools. Nach User-Entscheidung (Option B) ist das
//   Feature deaktiviert, bis es priorisiert + DB-Migration vorhanden
//   ist. /kunde/hygienebox bleibt aktiv (echte Tabelle hygienebox_orders).
//
// Diese Datei ist nur ein Redirect-Stub. Beim naechsten lokalen
// Cleanup kann der gesamte Ordner per `rm -rf app/kunde/pflegebox`
// entfernt werden (Sandbox-FUSE-Mount blockt unlink, deshalb Stub).
// ═══════════════════════════════════════════════════════════════
import { redirect } from 'next/navigation'

export default function KundePflegeboxRedirectPage() {
  redirect('/kunde/hygienebox')
}
