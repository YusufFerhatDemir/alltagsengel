'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'
import { logger } from '@/lib/logger'
const log = logger.child('abrechnung')

async function requireAbrechnungAdmin() {
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

  const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || undefined

  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

export async function speichereLauf(input: {
  abrechnungsmonat: string
  kostentraeger_ik: string
  kostentraeger_name: string
  status: string
  anzahl_faelle: number
  gesamtbetrag_cent: number
  rechnungsnummer: string
  datenannahmestelle_ik: string
  datenannahmestelle_name: string
  logischer_dateiname: string
  fehlerprotokoll: string | null
}): Promise<{ ok: true }> {
  const { supabase, userId, organizationId, role, name } = await requireAbrechnungAdmin()

  const { error } = await supabase.from('abrechnungslaeufe').upsert({
    abrechnungsmonat: input.abrechnungsmonat,
    kostentraeger_ik: input.kostentraeger_ik,
    kostentraeger_name: input.kostentraeger_name,
    status: input.status,
    anzahl_faelle: input.anzahl_faelle,
    gesamtbetrag_cent: input.gesamtbetrag_cent,
    rechnungsnummer: input.rechnungsnummer,
    datenannahmestelle_ik: input.datenannahmestelle_ik,
    datenannahmestelle_name: input.datenannahmestelle_name,
    logischer_dateiname: input.logischer_dateiname,
    fehlerprotokoll: input.fehlerprotokoll,
    created_by: userId,
  }, { onConflict: 'abrechnungsmonat,kostentraeger_ik' })

  if (error) throw new Error(`Abrechnungslauf konnte nicht gespeichert werden: ${error.message}`)

  await logAuditEvent({
    action: 'create',
    actorId: userId,
    organizationId,
    actorRole: role,
    actorName: name,
    entityType: 'abrechnungslauf',
    entityId: `${input.abrechnungsmonat}_${input.kostentraeger_ik}`,
    details: { aktion: 'lauf_gespeichert', abrechnungsmonat: input.abrechnungsmonat, kostentraeger_ik: input.kostentraeger_ik, status: input.status },
  }).catch((err) => log.warnWithException('Audit-Log fehlgeschlagen (non-blocking)', err))

  return { ok: true }
}

export async function setzeLaufStatusAction(laufId: string, status: string): Promise<{ ok: true }> {
  const { supabase, userId, organizationId, role, name } = await requireAbrechnungAdmin()

  const patch: Record<string, unknown> = { status }
  if (status === 'uebermittelt') patch.uebermittelt_am = new Date().toISOString()
  if (['akzeptiert', 'teilweise_abgelehnt', 'abgelehnt'].includes(status)) patch.antwort_am = new Date().toISOString()

  const { error } = await supabase.from('abrechnungslaeufe').update(patch).eq('id', laufId)
  if (error) throw new Error(`Status-Update fehlgeschlagen: ${error.message}`)

  await logAuditEvent({
    action: 'update',
    actorId: userId,
    organizationId,
    actorRole: role,
    actorName: name,
    entityType: 'abrechnungslauf',
    entityId: laufId,
    details: { aktion: 'status_geaendert', neuerStatus: status },
  }).catch((err) => log.warnWithException('Audit-Log fehlgeschlagen (non-blocking)', err))

  return { ok: true }
}
