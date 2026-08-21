/**
 * Kette 8 — Unterschrift fehlt → automatische Erinnerung.
 *
 * Der harte Block sitzt bereits in `create_invoice_draft_atomic` v8
 * (Migration 20260911010000, MISSING_SIGNATURE) — der greift aber erst BEIM
 * Rechnungslauf, oft Wochen nach dem Einsatz. Der Ereignistyp
 * `unterschrift_fehlend` war in lib/ops/types.ts bereits als Enum-Wert
 * vorbereitet, wurde aber nirgends emittiert (reines Schema-Gerüst ohne
 * Wiring). Diese Datei liefert die PROAKTIVE Erinnerung: Aufgabe an den
 * Mitarbeiter, der den Einsatz erbracht hat, solange der Nachweis noch
 * frisch genug ist, um die Unterschrift beim nächsten Besuch nachzuholen.
 *
 * DUBLETTENSCHUTZ: höchstens eine offene Aufgabe pro `service_record`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logAuditEvent } from '@/lib/audit-log'
import { emitEreignis } from '@/lib/ops/ereignis-emitter'
import { heuteBerlin } from '@/lib/utils/timezone'
import { logger } from '@/lib/logger'
const log = logger.child('unterschrift-erinnerung')

/** Tage nach Einsatzdatum, ab denen eine fehlende Unterschrift erinnert wird. */
export const UNTERSCHRIFT_ERINNERUNG_TAGE = 2

interface OffenerNachweis {
  id: string
  date: string
  client_id: string | null
  caregiver_id: string
}

export interface UnterschriftErinnerungErgebnis {
  geprueft: number
  aufgabenErstellt: number
  fehler: string[]
}

export async function erinnereFehlendeUnterschriften(
  supabase: SupabaseClient,
  organizationId: string,
  actorId: string,
): Promise<UnterschriftErinnerungErgebnis> {
  const grenzDatum = new Date()
  grenzDatum.setDate(grenzDatum.getDate() - UNTERSCHRIFT_ERINNERUNG_TAGE)
  const grenzDatumStr = grenzDatum.toISOString().slice(0, 10)

  const { data: offene, error } = await supabase
    .from('service_records')
    .select('id, date, client_id, caregiver_id')
    .eq('organization_id', organizationId)
    .or('client_signature.is.null,client_signature.eq.false')
    .not('proof_status', 'in', '("STORNIERT","UNTERSCHRIEBEN","ABGERECHNET")')
    .lt('date', grenzDatumStr)
    .limit(500)

  if (error) {
    return { geprueft: 0, aufgabenErstellt: 0, fehler: [`service_records: ${error.message}`] }
  }

  const offeneNachweise = (offene ?? []) as OffenerNachweis[]
  const fehler: string[] = []
  let aufgabenErstellt = 0

  for (const rec of offeneNachweise) {
    try {
      const { data: vorhanden, error: dupErr } = await supabase
        .from('ops_aufgaben')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('metadata->>service_record_id', rec.id)
        .eq('metadata->>quelle', 'automatisch_unterschrift_fehlt')
        .limit(1)
        .maybeSingle()

      if (dupErr) {
        fehler.push(`${rec.id}: Dublettenprüfung fehlgeschlagen — ${dupErr.message}`)
        continue
      }
      if (vorhanden) continue

      const { data: cg } = await supabase
        .from('caregivers')
        .select('user_id')
        .eq('id', rec.caregiver_id)
        .maybeSingle()
      if (!cg?.user_id) {
        fehler.push(`${rec.id}: kein Nutzerkonto für Mitarbeiter ${rec.caregiver_id}`)
        continue
      }

      const { data: aufgabe, error: insErr } = await supabase
        .from('ops_aufgaben')
        .insert({
          organization_id: organizationId,
          titel: `Unterschrift fehlt: Einsatz vom ${rec.date}`,
          beschreibung:
            `Der Leistungsnachweis vom ${rec.date} hat noch keine Klienten-/Angehörigen-Unterschrift. `
            + `Bitte beim nächsten Besuch nachholen — ohne Unterschrift kann der Einsatz nicht abgerechnet werden.`,
          kategorie: 'abrechnung',
          prioritaet: 'mittel',
          status: 'offen',
          verantwortlich_id: cg.user_id,
          erstellt_von: actorId,
          faellig_am: heuteBerlin(),
          client_id: rec.client_id,
          caregiver_id: rec.caregiver_id,
          tags: ['leistungsnachweis', 'unterschrift_fehlt'],
          metadata: { service_record_id: rec.id, quelle: 'automatisch_unterschrift_fehlt' },
        })
        .select('id')
        .single()

      if (insErr || !aufgabe) {
        fehler.push(`${rec.id}: ${insErr?.message ?? 'Aufgabe konnte nicht angelegt werden'}`)
        continue
      }

      await logAuditEvent({
        action: 'create', actorId, organizationId, entityType: 'ops_aufgabe', entityId: aufgabe.id,
        details: { grund: 'unterschrift_fehlt', service_record_id: rec.id },
      }).catch(err => log.error('Audit fehlgeschlagen', { errorMessage: String(err) }))

      await emitEreignis(supabase, {
        organizationId,
        ereignisTyp: 'unterschrift_fehlend',
        entitaetId: rec.id,
        akteurId: actorId,
        kontext: { service_record_id: rec.id, aufgabe_id: aufgabe.id, caregiver_user_id: cg.user_id },
      }).catch(err => log.error('Ereignis-Emit fehlgeschlagen', { errorMessage: String(err) }))

      aufgabenErstellt++
    } catch (err) {
      fehler.push(`${rec.id}: ${(err as Error).message}`)
    }
  }

  return { geprueft: offeneNachweise.length, aufgabenErstellt, fehler }
}
