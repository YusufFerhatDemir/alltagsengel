// ═══════════════════════════════════════════════════════════════
// Pflegebox-Feature deaktiviert (Phase 5 Architektur-Empfehlung)
// ═══════════════════════════════════════════════════════════════
// Grund:
//   Die Pflegebox-Tabellen (care_eligibility, carebox_*) existieren
//   nicht in der Datenbank. Live-User stolperten in 404er. Nach
//   User-Entscheidung (Option B) ist das Feature deaktiviert,
//   bis es priorisiert + DB-Migration vorhanden ist.
//
// Diese Datei ist nur ein Redirect-Stub. Beim naechsten lokalen
// Cleanup kann der gesamte Ordner per `rm -rf app/admin/pflegebox`
// entfernt werden (Sandbox-FUSE-Mount blockt unlink, deshalb Stub).
// ═══════════════════════════════════════════════════════════════
import { redirect } from 'next/navigation'

export default function AdminPflegeboxRedirectPage() {
  redirect('/admin/home')
}
