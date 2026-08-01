/**
 * Next.js Middleware — Server-seitige Authentifizierung und Autorisierung.
 *
 * Re-exportiert die bestehende, vollständige Middleware aus proxy.ts.
 * proxy.ts war bisher Dead Code, weil Next.js die Datei als middleware.ts
 * im Root erwartet und den Export als `middleware` (nicht `proxy`).
 *
 * Was proxy.ts implementiert:
 *   - CSRF-Schutz (Origin vs. Host)
 *   - JWT-Verifikation via getUser() (nicht getSession!)
 *   - FAIL-CLOSED für /admin, /mis, /kunde/zahlungsdaten, /kunde/dokumente, /engel/dokumente
 *   - FAIL-SOFT für restliche geschützte Routen (WhatsApp-Style Session-Recovery)
 *   - Admin-Rollen-Prüfung: app_metadata.role (vertrauenswürdig) + DB-Fallback
 *   - Fehlerfall: FAIL-CLOSED für Admin/MIS, FAIL-SOFT für Rest
 *
 * P0-1 Fix: Diese Datei aktiviert den gesamten Server-seitigen Schutz.
 *
 * @see proxy.ts für die vollständige Implementierung
 * @see audit/PHASE1_INVENTORY.md für den Audit-Befund
 */
export { proxy as middleware, config } from './proxy'
