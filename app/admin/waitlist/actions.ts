'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import {
  istWartelisteStufe, dbWertFuerStufe, wartelisteStufeMeta, WARTELISTE_STUFE_MIGRATION,
} from '@/lib/warteliste/katalog'

// ═══════════════════════════════════════════════════════════════════════
// Warteliste — Statuswechsel
//
// Schreibt unter der Sitzung der Verwaltung (RLS greift), nicht mit dem
// Dienstschluessel: Anders als der oeffentliche Eintragsweg gibt es hier
// eine angemeldete Person, und ihre Rechte sind die richtige Grenze.
// ═══════════════════════════════════════════════════════════════════════

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    throw new Error('Nur fuer Administratoren.')
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) throw new Error('Keine Organisation zugewiesen.')

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Alltagsengel'
  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

/**
 * Stufenwechsel eines Wartelisteneintrags.
 *
 * `stufe` ist der Schlüssel aus WARTELISTE_STUFEN (neu … abgelehnt), nicht
 * der DB-Wert — die Übersetzung steht in lib/warteliste/katalog.ts.
 *
 * `erwartet` ist die Stufe, welche die Verwaltung beim Klick gesehen hat.
 * Das UPDATE greift nur, wenn sie noch stimmt (CAS): zwei offene Tabs
 * sollen sich nicht gegenseitig einen „Kunde" auf „Kontaktiert"
 * zurückstempeln.
 */
export async function updateWaitlistStatus(
  eintragId: string,
  stufe: string,
  erwartet?: string,
): Promise<{ ok: true; aktualisiertAm: string | null } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!eintragId || typeof eintragId !== 'string') {
      return { ok: false, error: 'Ungueltige Eintrags-ID.' }
    }
    // Fail-closed gegen state_waitlist_status_check: ein Wert ausserhalb der
    // erlaubten wuerde die Datenbank mit 23514 abweisen — und die Verwaltung
    // saehe eine rohe Postgres-Meldung statt eines Satzes.
    if (!istWartelisteStufe(stufe)) {
      return { ok: false, error: 'Ungueltige Stufe fuer einen Wartelisteneintrag.' }
    }
    const dbWert = dbWertFuerStufe(stufe)
    if (!dbWert) return { ok: false, error: 'Ungueltige Stufe fuer einen Wartelisteneintrag.' }

    const aenderung: Record<string, unknown> = { status: dbWert }
    // Abgelehnt heisst auch: keine Startmail des Expansion-Moduls mehr.
    // claim_waitlist_batch waehlt nur `benachrichtigen = true` — ohne diese
    // Zeile bekaeme ein abgelehnter Interessent beim Regionalstart trotzdem
    // Post. Beim Verlassen von „abgelehnt" wird es BEWUSST nicht
    // zurueckgesetzt: der Grund der Ablehnung ist hier nicht bekannt, und
    // eine versehentlich wieder erlaubte Werbemail ist der teurere Fehler.
    if (stufe === 'abgelehnt') aenderung.benachrichtigen = false

    let abfrage = supabase
      .from('state_waitlist')
      .update(aenderung)
      .eq('id', eintragId)
      .eq('organization_id', organizationId)
    if (erwartet && istWartelisteStufe(erwartet)) {
      const erwartetDb = dbWertFuerStufe(erwartet)
      if (erwartetDb) abfrage = abfrage.eq('status', erwartetDb)
    }
    const { data: geaendert, error: dbFehler } = await abfrage.select('id, updated_at')

    if (dbFehler) {
      if (dbFehler.code === 'PGRST205') {
        return {
          ok: false,
          error: 'Die Tabelle state_waitlist ist nicht erreichbar — Schema pruefen.',
        }
      }
      // 23514 bei einer Stufe, deren DB-Wert eine noch nicht angewendete
      // Migration braucht: ein Satz mit der Dateinummer statt der rohen
      // Constraint-Meldung.
      if (dbFehler.code === '23514' && WARTELISTE_STUFE_MIGRATION[stufe]) {
        return {
          ok: false,
          error: `Die Stufe „${wartelisteStufeMeta(stufe).label}" ist erst nach Migration `
            + `${WARTELISTE_STUFE_MIGRATION[stufe]} verfügbar (Datenbank-Regel erlaubt den Wert noch nicht). `
            + 'Bis dahin bitte „Kontaktiert" lassen und den Termin in der E-Mail festhalten.',
        }
      }
      return { ok: false, error: `Status-Update fehlgeschlagen: ${dbFehler.message}` }
    }

    // Keine Zeile getroffen: entweder fremde Organisation, geloescht oder
    // inzwischen von jemand anderem umgestellt. Nicht als Erfolg melden.
    if (!geaendert || geaendert.length === 0) {
      return {
        ok: false,
        error: 'Der Eintrag wurde inzwischen geaendert oder ist nicht mehr vorhanden — bitte Seite neu laden.',
      }
    }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'state_waitlist',
      entityId: eintragId,
      details: { neue_stufe: stufe, db_wert: dbWert, vorherige_stufe: erwartet ?? null },
    })

    return { ok: true, aktualisiertAm: geaendert[0]?.updated_at ?? null }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}
