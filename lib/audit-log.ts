// ═══════════════════════════════════════════════════════════
// Admin-Audit-Log Helper (AUTH-012)
//
// Einheitlicher Einstieg, damit jede State-Change-API-Route in
// `app/api/admin/*` und sensible User-Routes (Self-Delete) ihr Event
// in `mis_audit_log` schreiben kann — ohne dass jedes Call-Site
// eigenen Boilerplate-Code hat.
//
// Design-Prinzipien:
//   1. Fail-soft: Wenn das Logging scheitert (DB-Glitch), darf die
//      eigentliche Admin-Aktion NICHT blockiert werden. Wir loggen
//      den Fehler in `console.error` (kein rohes err-Objekt, AUTH-002)
//      und liefern silent success zurück. Rationale: lieber ein
//      funktionierender Passwort-Reset mit fehlendem Audit-Row als
//      ein komplett gescheiterter Reset und User ausgesperrt.
//   2. Service-Role-Only: nutzt `createAdminClient()`, weil
//      RLS den INSERT blockiert. Das Audit-Log ist absichtlich kein
//      User-schreibbares Objekt.
//   3. IP + UA werden aus dem Request extrahiert, nicht aus dem Body.
//      Der Client kann sie nicht fälschen (bzw. nur soweit wie das
//      Reverse-Proxy-Setup es erlaubt — x-forwarded-for von Vercel).
//
// Analogie:
//   Denk an die Security-Kamera in einem Geldautomaten-Vorraum. Sie
//   läuft im Hintergrund, jede Bewegung wird aufgezeichnet. Wenn die
//   Festplatte voll ist, fährt der Automat trotzdem weiter — aber
//   der Admin bekommt eine Warnung. Kein Kunde steht wegen einem
//   Kamera-Defekt plötzlich ohne Bargeld da.
// ═══════════════════════════════════════════════════════════

import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Alle erlaubten Audit-Aktionen (synchron mit CHECK in Migration) */
export type AuditAction =
  | 'password_reset'
  | 'role_grant'
  | 'role_revoke'
  | 'user_delete'
  | 'user_self_delete'
  | 'user_self_soft_delete'   // AUTH-003 v2: User hat Soft-Delete angestossen
  | 'user_self_undelete'      // AUTH-003 v2: User hat Soft-Delete per Token-Link widerrufen
  | 'user_hard_delete_cron'   // AUTH-003 v2: Edge-Function hat nach 60d hart geloescht
  | 'data_export'
  | 'admin_login'
  | 'rate_limit_reset'
  // Legacy MIS-Actions (für weiteren Gebrauch freigegeben)
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'download'
  | 'approve'
  | 'reject'
  | 'share'
  | 'archive'

export interface AuditLogInput {
  /** Aktions-Typ (Pflicht, synchron mit DB-CHECK). */
  action: AuditAction
  /** Actor (wer hat's gemacht) — User-UUID aus der Session. */
  actorId: string
  /** Rolle des Actors zum Zeitpunkt der Aktion. */
  actorRole?: string | null
  /** Anzeige-Name des Actors (optional, für UI). */
  actorName?: string | null
  /** Ziel-User (wer war betroffen). NULL bei globalen Aktionen. */
  targetId?: string | null
  /** Ziel-E-Mail als Snapshot (überlebt Profil-Löschung). */
  targetEmail?: string | null
  /** Entity-Typ (z. B. „profile", „user", „pricing") */
  entityType: string
  /** Entity-UUID (das konkret veränderte DB-Objekt) */
  entityId?: string | null
  /** Zusätzliche Details als JSON (Before/After-Snapshot, Grund, …). */
  details?: Record<string, unknown>
  /** Ausgehend vom Next-Request, daraus IP + User-Agent extrahiert. */
  request?: NextRequest | Request
}

/**
 * Loggt ein Admin-Event in `mis_audit_log`.
 *
 * Rückgabe `true`, wenn der Insert durchkam, sonst `false`.
 * ACHTUNG: Der Aufrufer sollte den Rückgabewert nur monitoren, nicht
 * als Guard für die Hauptaktion nutzen — siehe Fail-soft-Prinzip.
 */
export async function logAuditEvent(input: AuditLogInput): Promise<boolean> {
  try {
    const adminClient = createAdminClient()

    const ip = input.request ? extractIp(input.request) : null
    const ua = input.request ? extractUserAgent(input.request) : null

    const { error } = await adminClient.from('mis_audit_log').insert({
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      actor_id: input.actorId,
      actor_name: input.actorName ?? null,
      actor_role: input.actorRole ?? null,
      target_id: input.targetId ?? null,
      target_email: input.targetEmail ?? null,
      details: input.details ?? {},
      ip_address: ip,
      user_agent: ua,
    })

    if (error) {
      // AUTH-002: kein rohes err-Objekt loggen — könnte sensible Info enthalten
      console.error('[audit-log] insert failed:', {
        code: (error as any)?.code,
        message: error?.message,
        action: input.action,
      })
      return false
    }
    return true
  } catch (err: any) {
    console.error('[audit-log] unexpected error:', {
      code: err?.code,
      name: err?.name,
      action: input.action,
    })
    return false
  }
}

/**
 * Extrahiert die erste IP aus x-forwarded-for (Vercel/Proxy-Chain).
 * Fällt zurück auf x-real-ip, sonst null.
 */
function extractIp(req: NextRequest | Request): string | null {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const real = req.headers.get('x-real-ip')
  return real?.trim() || null
}

function extractUserAgent(req: NextRequest | Request): string | null {
  const ua = req.headers.get('user-agent')
  return ua?.trim() || null
}
