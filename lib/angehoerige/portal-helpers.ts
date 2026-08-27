// ═══════════════════════════════════════════════════════════════
// Angehörigenportal — Server-seitige Hilfsfunktionen
// Prüft Zugang + Bereich-Freigabe, liefert Klient-Daten
// ═══════════════════════════════════════════════════════════════
//
// ZWEI BEFUNDE (27.08.2026), die hier zusammenlaufen:
//
// 1. LESEN — die Tabellen, aus denen das Portal liest (clients,
//    service_records, assignments, akten_dokumente), haben KEINE
//    RLS-Policy für die Rolle `angehoerige`. Live gegengeprüft
//    (`node scripts/verify-angehoerigenportal-live.mjs`): keine einzige
//    Policy auf diesen Tabellen wertet `angehoerigen_zugaenge` aus. Mit
//    dem RLS-Client kam deshalb überall still `[]` zurück — das Portal
//    zeigte „keine Termine / keine Berichte / keine Dokumente", ohne
//    dass irgendwo ein Fehler aufschlug. Derselbe Befund wie bei den
//    QM/PDL-Dashboards (Commit d707cda), und dieselbe Abhilfe: die
//    Daten holt der Server mit dem Dienstschlüssel, und die Freigabe
//    entscheidet ausschliesslich der Code hier — Mandant, Klienten-
//    Erlaubnisliste und Bereich in JEDER Abfrage.
//
//    Bewusst NICHT der andere Weg (Policies für Angehörige auf clients
//    und service_records): RLS wirkt zeilenweise, nicht spaltenweise.
//    Eine Lese-Policy auf `clients` gäbe dem Angehörigen die GANZE
//    Zeile — Anschrift, Telefon, interne Bemerkungen — sobald er die
//    Tabelle direkt über PostgREST anspricht. Das Portal darf aber nur
//    Name und Pflegegrad zeigen. Deshalb bleibt die Datenbank für die
//    Rolle zu, und der Server gibt genau die Spalten heraus, die der
//    freigegebene Bereich deckt.
//
// 2. PROTOKOLLIEREN — `angehoerigen_audit_log` hat nur eine Policy für
//    `is_admin()`. Jeder Protokolleintrag des Portals lief also gegen
//    RLS ins Leere; geschrieben wurde er mit dem RLS-Client und der
//    Fehler von den Aufrufern als „non-blocking" verschluckt. Live:
//    0 Zeilen im Log. Für ein Portal, über das Dritte Gesundheitsdaten
//    einsehen, ist das die Nachweispflicht selbst (Art. 30/32 DSGVO,
//    § 630f BGB). Jetzt schreibt der Server das Protokoll mit dem
//    Dienstschlüssel — und zwar fail-closed: gelingt der Eintrag nicht,
//    werden die Daten NICHT herausgegeben.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveUserOrgId } from '@/lib/organizations/server'
import { logger } from '@/lib/logger'
import { protokolliereZugriff } from './angehoerige'
import type { AngehoerigenZugang, FreigabeBereich, AuditAktion } from './types'
import { FREIGABE_BEREICHE } from './types'

const log = logger.child('angehoerige-portal')

export interface PortalAuthContext {
  userId: string
  organizationId: string
  zugaenge: AngehoerigenZugang[]
}

export type PortalAuthResult =
  | { ok: true; ctx: PortalAuthContext }
  | { ok: false; response: NextResponse }

/**
 * Server-seitige Auth-Prüfung für das Angehörigenportal.
 * Prüft ob der User eingeloggt ist, die richtige Rolle hat
 * und mindestens einen aktiven Zugang besitzt.
 */
export async function requirePortalAccess(): Promise<PortalAuthResult> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  // Rollenprüfung: Nur Angehoerige (+ Admins fuer Verwaltung) duerfen zugreifen
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const erlaubteRollen = ['angehoerige', 'admin', 'superadmin']
  if (!profile || !erlaubteRollen.includes(profile.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Zugriff nur fuer Angehoerige.' }, { status: 403 }) }
  }

  const organizationId = await resolveUserOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  const { data: zugaenge, error: zugangError } = await supabase
    .from('angehoerigen_zugaenge')
    .select('*')
    .eq('user_id', user.id)
    .eq('organization_id', organizationId)
    .eq('status', 'aktiv')

  if (zugangError) {
    return { ok: false, response: NextResponse.json({ error: 'Zugang konnte nicht geprüft werden.' }, { status: 500 }) }
  }

  const aktiveZugaenge = (zugaenge ?? []).filter(istVerwendbar) as AngehoerigenZugang[]

  if (aktiveZugaenge.length === 0) {
    return { ok: false, response: NextResponse.json({ error: 'Kein aktiver Zugang vorhanden.' }, { status: 403 }) }
  }

  return {
    ok: true,
    ctx: { userId: user.id, organizationId, zugaenge: aktiveZugaenge },
  }
}

/**
 * Ist dieser Zugang jetzt gerade verwendbar?
 *
 * Fail-closed: ein Zugang ohne lesbare Bereichsliste gibt NICHTS frei.
 * `freigegebene_bereiche` ist ein text[] ohne Werteprüfung in der
 * Datenbank — steht dort ein unbekannter Wert, ein leeres Array oder
 * (nach einem Schema-Ausrutscher) gar kein Array, darf daraus kein
 * Zugriff entstehen. Vorher wäre `.includes()` auf einem Nicht-Array
 * mit einer Ausnahme mitten in der Route gelandet.
 */
function istVerwendbar(z: Partial<AngehoerigenZugang> | null | undefined): boolean {
  if (!z) return false
  if (z.status !== 'aktiv') return false
  if (z.gueltig_bis && new Date(z.gueltig_bis) < new Date()) return false
  if (!Array.isArray(z.freigegebene_bereiche)) return false
  return z.freigegebene_bereiche.some(b => (FREIGABE_BEREICHE as string[]).includes(b))
}

/** Nur die Bereiche, die es wirklich gibt — unbekannte Werte zählen nicht. */
function bereicheVon(z: AngehoerigenZugang): string[] {
  if (!Array.isArray(z.freigegebene_bereiche)) return []
  return z.freigegebene_bereiche.filter(b => (FREIGABE_BEREICHE as string[]).includes(b))
}

/**
 * Prüft ob ein bestimmter Bereich in mindestens einem Zugang freigegeben ist.
 */
export function hatPortalBereichZugriff(
  zugaenge: AngehoerigenZugang[],
  bereich: FreigabeBereich,
  clientId?: string,
): boolean {
  return zugaenge.some(z => {
    if (clientId && z.client_id !== clientId) return false
    if (bereich === 'pflegeberichte' && !z.pflegeberichte_freigegeben) return false
    return bereicheVon(z).includes(bereich)
  })
}

/**
 * Alle Zugänge, die diesen Bereich tragen.
 *
 * Eine Stelle für die Freigabefrage: Erlaubnislisten (Klienten-IDs,
 * Zugangs-IDs) und der Protokolleintrag müssen denselben Satz Zugänge
 * meinen — sonst liefert eine Route Daten, deren Freigabe eine andere
 * Prüfung verneint hätte.
 */
export function zugaengeMitBereich(
  zugaenge: AngehoerigenZugang[],
  bereich: FreigabeBereich,
): AngehoerigenZugang[] {
  return zugaenge.filter(z => {
    if (bereich === 'pflegeberichte' && !z.pflegeberichte_freigegeben) return false
    return bereicheVon(z).includes(bereich)
  })
}

/**
 * Gibt alle Client-IDs zurück, für die der User Zugang zu einem bestimmten Bereich hat.
 */
export function erlaubteClientIds(
  zugaenge: AngehoerigenZugang[],
  bereich: FreigabeBereich,
): string[] {
  return zugaengeMitBereich(zugaenge, bereich).map(z => z.client_id)
}

/**
 * Der Zugang, über den ein Klient in diesem Bereich freigegeben ist.
 * Für den Protokolleintrag: er gehört an den Zugang, der den Zugriff
 * TRÄGT — nicht an irgendeinen beliebigen Zugang des Nutzers.
 */
export function zugangFuer(
  zugaenge: AngehoerigenZugang[],
  bereich: FreigabeBereich,
  clientId: string,
): AngehoerigenZugang | undefined {
  return zugaengeMitBereich(zugaenge, bereich).find(z => z.client_id === clientId)
}

/**
 * Protokolleinträge für eine Bereichsabfrage — einer je freigegebenem
 * Klienten, jeweils am tragenden Zugang.
 */
export function protokollEintraege(
  zugaenge: AngehoerigenZugang[],
  bereich: FreigabeBereich,
  aktion: AuditAktion,
  details?: Record<string, unknown>,
): Array<{ zugang_id: string; client_id: string; aktion: AuditAktion; details?: Record<string, unknown> }> {
  return zugaengeMitBereich(zugaenge, bereich).map(z => ({
    zugang_id: z.id,
    client_id: z.client_id,
    aktion,
    details,
  }))
}

/**
 * Datenclient des Portals.
 *
 * Dienstschlüssel, weil für die Rolle `angehoerige` keine Lese-Policy
 * existiert (Kopfkommentar, Punkt 1). Jede Abfrage, die damit läuft,
 * MUSS selbst filtern: `organization_id` des Zugangs UND eine
 * Klienten-Erlaubnisliste aus {@link erlaubteClientIds}. Ohne beides
 * ist die Abfrage mandanten- und freigabeblind.
 */
export function portalDatenClient() {
  return createAdminClient()
}

/**
 * Schreibt den Zugriffs-Protokolleintrag — fail-closed.
 *
 * @returns `null`, wenn protokolliert wurde; sonst die Fehlerantwort,
 *          mit der die Route abbrechen MUSS. Ohne Protokoll keine Daten:
 *          die Einsichtnahme Dritter in Gesundheitsdaten ist genau das,
 *          was nachweisbar bleiben muss.
 */
export async function protokolliereOderVerweigere(
  ctx: PortalAuthContext,
  eintraege: Array<{
    zugang_id: string
    client_id: string
    aktion: AuditAktion
    details?: Record<string, unknown>
  }>,
): Promise<NextResponse | null> {
  if (eintraege.length === 0) return null

  const sb = portalDatenClient()
  try {
    for (const e of eintraege) {
      await protokolliereZugriff(sb, ctx.organizationId, {
        zugang_id: e.zugang_id,
        user_id: ctx.userId,
        client_id: e.client_id,
        aktion: e.aktion,
        details: e.details,
      })
    }
    return null
  } catch (err) {
    log.errorWithException('Zugriffsprotokoll konnte nicht geschrieben werden — Ausgabe verweigert', err)
    return NextResponse.json(
      { error: 'Der Zugriff kann derzeit nicht protokolliert werden. Aus Datenschutzgründen werden die Daten deshalb nicht angezeigt. Bitte später erneut versuchen.' },
      { status: 503 },
    )
  }
}
