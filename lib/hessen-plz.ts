// ═══════════════════════════════════════════════════════════
// HESSEN-PLZ — Übergangsmodul (deprecated)
// ═══════════════════════════════════════════════════════════
// Die Kassen-Freischaltung ist seit der Deutschland-Architektur
// (Migration 20260808100000) KEINE Eigenschaft der Postleitzahl
// mehr, sondern eine Eigenschaft des Bundeslands in `state_settings`.
//
// Dieses Modul bleibt nur bestehen, damit vorhandene Importe und die
// bestehende Testsuite weiter funktionieren. Es enthält keine eigene
// Logik mehr — alles kommt aus lib/expansion/plz-bundesland.ts.
//
// ── Migrationspfad ──
//   alt:  if (isHessenPlz(plz)) { kasse anbieten }
//   neu:  const lage = await bundeslandLage(plz)      // Server
//         const { lage } = useBundeslandLage(plz)     // Client
//         if (lage.kassenabrechnung) { … }
//
// Der neue Pfad berücksichtigt zusätzlich, ob die Anerkennung für das
// Bundesland überhaupt vorliegt — genau das konnte die alte reine
// PLZ-Prüfung nicht leisten.
// ═══════════════════════════════════════════════════════════

export {
  normalizePlz,
  resolvePlz,
  isHessenPlz,
  bundeslandFuerPlz,
  bundeslandCodeFuerPlz,
  eindeutigesBundeslandFuerPlz,
} from './expansion/plz-bundesland'

import { isHessenPlz } from './expansion/plz-bundesland'

/**
 * Darf diesem Kunden Kassenleistung (kasse/kombi) angeboten werden?
 *
 * @deprecated Beantwortet nur die halbe Frage — die Anerkennung des
 * Bundeslands bleibt unberücksichtigt. Stattdessen
 * `bundeslandLage(plz).kassenabrechnung` (Server) bzw.
 * `useBundeslandLage(plz).lage.kassenabrechnung` (Client) verwenden.
 */
export function kasseErlaubt(plz: string | null | undefined): boolean {
  return isHessenPlz(plz)
}
