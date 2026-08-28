// ═══════════════════════════════════════════════════════════════════════
// Wer hat ein internes Postfach (ops_nachrichten)?
//
// BEFUND (Track 10): `requireOpsUser()` laesst jedes Konto durch, das
// einen profiles-Datensatz UND eine aufloesbare Organisation hat — und
// `resolveUserOrgId()` loest die Organisation ausdruecklich auch ueber
// `clients.user_id` auf. Damit kamen `kunde` und `angehoerige` in die
// internen Nachrichten-Wege, obwohl es dort fuer sie keine Oberflaeche
// gibt: das Kundenpostfach (`app/kunde/nachrichten`) laeuft ueber
// `care_notes`, nicht ueber `ops_nachrichten`.
//
// Eigenes Modul, damit die Regel ohne `next/headers` und ohne
// Supabase-Sitzung pruefbar ist — der Guard selbst ist es nicht.
// ═══════════════════════════════════════════════════════════════════════

/**
 * ERLAUBNISLISTE. Eine neue Rolle bekommt kein Postfach, bis sie hier
 * ausdruecklich eingetragen wird — Verweigern ist der Normalfall
 * (Grundsatz 1 aus lib/auth/rollen.ts).
 */
export const OPS_POSTFACH_ROLLEN: readonly string[] = [
  'superadmin', 'admin', 'pdl', 'qm', 'buchhaltung', 'engel', 'fahrer',
]

/**
 * Darf dieses Konto das interne Postfach benutzen?
 *
 * Geprueft werden BEIDE Rollenquellen: sagt eine von beiden eine Rolle
 * ohne Postfach, ist Schluss. Eine LEERE `appRolle` schraenkt nicht ein —
 * bei den meisten Konten ist `app_metadata.role` nie geschrieben worden,
 * und die zweite Quelle darf nach dem Grundsatz aus lib/auth/rollen.ts
 * nur einschraenken, nie aussperren (dieselbe Regel wie in
 * `quellenSindRolle`). Eine leere `profilRolle` dagegen ist ein Nein:
 * ohne Profilrolle gibt es keine Zuordnung, die ein Postfach traegt.
 */
export function hatOpsPostfach(appRolle: string, profilRolle: string): boolean {
  if (!OPS_POSTFACH_ROLLEN.includes(profilRolle)) return false
  return appRolle === '' || OPS_POSTFACH_ROLLEN.includes(appRolle)
}
