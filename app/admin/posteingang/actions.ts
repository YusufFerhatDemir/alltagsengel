'use server'

/**
 * Wiedervorlage für KUNDENANFRAGEN.
 *
 * ── WARUM ES DIESE DATEI GIBT ─────────────────────────────────────────
 * Am 13.09.2026 trug keine einzige der 50 Zeilen in `lead_inquiries` ein
 * `follow_up_date`. Das sah nach einem Betriebsproblem aus — niemand setzt
 * Termine — war aber ein Loch im Bau: der einzige Schreibweg der ganzen
 * Anwendung (`setApplicationWiedervorlage`) filtert auf `BEWERBUNG_FILTER`
 * und fasst Kundenanfragen nicht an. `/mis/crm` zeigt das Feld nur an.
 *
 * Für die 14 offenen Kundenanfragen gab es damit keine Möglichkeit, eine
 * Wiedervorlage zu setzen — und ohne Wiedervorlage kann die
 * Eskalationsleiter aus `lib/leads/alterung.ts` bei ihnen niemals
 * auslösen. Die Leiter war nicht kaputt, sie hatte nichts zu messen.
 *
 * ── ABGRENZUNG ───────────────────────────────────────────────────────
 * Bewerbungen laufen weiter über `app/admin/applications/actions.ts`. Die
 * Bedingung hier ist deren genaues Gegenstück (`art='anfrage'` UND NICHT
 * `source='engel-bewerbung'`), damit keine Zeile in beide Wege fällt oder
 * aus beiden herausfällt.
 *
 * `state_waitlist` kommt hier nicht vor: die Tabelle führt gar keine
 * Wiedervorlage-Spalte, ihr Termin wird aus der Stufe abgeleitet
 * (`lib/warteliste/prioritaet.ts`). Das ist kein Loch, sondern ein anderes
 * Modell.
 */

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { berlinerTagPlus } from '@/lib/leads/follow-up'
import { ANFRAGE_FILTER_ART, ANFRAGE_FILTER_NICHT_SOURCE } from '@/lib/admin/ops'

const ANFRAGE_STATUS_OFFEN = ['new', 'contacted', 'qualified']

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
 * Setzt oder löscht die Wiedervorlage einer Kundenanfrage.
 *
 * `datum === null` löscht sie. Das ist erlaubt, aber nicht folgenlos: ohne
 * Wiedervorlage läuft die Uhr einer bearbeiteten Anfrage ab der letzten
 * Bearbeitung weiter (`ausAnfrage` in lib/leads/posteingang.ts) — ein Lead
 * fällt also nicht aus der Leiter heraus, nur weil der Termin weg ist.
 * Genau diese Lücke hat am 12.09.2026 zwei Vorgänge 56 Tage lang
 * unsichtbar gemacht.
 */
export async function setLeadWiedervorlage(
  leadId: string,
  datum: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!leadId || typeof leadId !== 'string') {
      return { ok: false, error: 'Ungueltige Lead-ID.' }
    }
    if (datum !== null) {
      if (typeof datum !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(datum) || Number.isNaN(Date.parse(datum))) {
        return { ok: false, error: 'Bitte ein gueltiges Datum angeben.' }
      }
      // Ein Termin in der Vergangenheit ist im Moment des Setzens schon
      // ueberfaellig. Das ist fast immer ein Vertipper, und die
      // Eskalationsleiter meldete ihn sofort als Versaeumnis.
      if (datum < berlinerTagPlus(new Date(), 0)) {
        return { ok: false, error: 'Die Wiedervorlage liegt in der Vergangenheit.' }
      }
    }

    const { data: geaendert, error: dbError } = await supabase
      .from('lead_inquiries')
      .update({ follow_up_date: datum })
      .eq('id', leadId)
      .eq('organization_id', organizationId)
      .eq('art', ANFRAGE_FILTER_ART)
      .neq('source', ANFRAGE_FILTER_NICHT_SOURCE)
      .in('status', ANFRAGE_STATUS_OFFEN)
      .select('id')
    if (dbError) return { ok: false, error: `Wiedervorlage fehlgeschlagen: ${dbError.message}` }
    if (!geaendert || geaendert.length === 0) {
      // Kein stilles „ok": die Zeile ist entweder weg, gehoert einer anderen
      // Organisation, ist abgeschlossen — oder es ist eine Bewerbung, die
      // ueber den anderen Weg laeuft. In jedem Fall wurde nichts geschrieben.
      return { ok: false, error: 'Anfrage nicht gefunden oder nicht mehr offen — bitte Seite neu laden.' }
    }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'lead',
      entityId: leadId,
      details: { wiedervorlage: datum },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}
