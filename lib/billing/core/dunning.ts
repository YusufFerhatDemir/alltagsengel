import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from './audit'
import { datumBerlin, heuteBerlin } from '@/lib/utils/timezone';
import { logger } from '@/lib/logger';
import { euroZuCent } from '@/lib/geld'
const log = logger.child('mahnlauf');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Typ fuer client-Join-Ergebnis aus Supabase-Abfragen. */
type ClientJoin = { first_name?: string; last_name?: string; email?: string } | null

export type DunningLevel =
  | 'offen' | 'erinnerung' | 'mahnung_1' | 'mahnung_2'
  | 'letzte_mahnung' | 'inkasso_vorbereitung' | 'bezahlt'

export const DUNNING_LEVEL_ORDER: DunningLevel[] = [
  'offen', 'erinnerung', 'mahnung_1', 'mahnung_2',
  'letzte_mahnung', 'inkasso_vorbereitung', 'bezahlt',
]

export const DUNNING_LABELS: Record<DunningLevel, string> = {
  offen: 'Offen',
  erinnerung: 'Zahlungserinnerung',
  mahnung_1: '1. Mahnung',
  mahnung_2: '2. Mahnung',
  letzte_mahnung: 'Letzte Mahnung',
  inkasso_vorbereitung: 'Inkasso-Vorbereitung',
  bezahlt: 'Bezahlt',
}

export const DUNNING_DAYS: Record<DunningLevel, number> = {
  offen: 0,
  erinnerung: 14,
  mahnung_1: 28,
  mahnung_2: 42,
  letzte_mahnung: 56,
  inkasso_vorbereitung: 70,
  bezahlt: 0,
}

export const DUNNING_FEES_CENTS: Record<DunningLevel, number> = {
  offen: 0,
  erinnerung: 0,
  mahnung_1: 250,
  mahnung_2: 500,
  letzte_mahnung: 750,
  inkasso_vorbereitung: 1000,
  bezahlt: 0,
}

export interface DunningBlockReason {
  invoiceId: string
  reason: string
}

// ---------------------------------------------------------------------------
// ensureDunningEntry — erstellt/aktualisiert Mahneintrag für eine Rechnung
// ---------------------------------------------------------------------------

export async function ensureDunningEntry(
  supabase: SupabaseClient,
  invoiceId: string,
  organizationId: string,
  actorId: string
): Promise<string> {
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, total_amount, paid_amount, due_date, status')
    .eq('id', invoiceId)
    .single()

  if (!inv) throw new Error(`Rechnung ${invoiceId} nicht gefunden.`)

  const totalCents = euroZuCent(inv.total_amount || 0)
  const paidCents = euroZuCent(inv.paid_amount || 0)

  const { data: existing } = await supabase
    .from('dunning_entries')
    .select('id')
    .eq('invoice_id', invoiceId)
    .maybeSingle()

  if (existing) return existing.id

  const dueDate = inv.due_date || heuteBerlin()

  const { data, error } = await supabase
    .from('dunning_entries')
    .insert({
      organization_id: organizationId,
      invoice_id: invoiceId,
      dunning_level: 'offen',
      due_date: dueDate,
      amount_due_cents: totalCents,
      amount_paid_cents: paidCents,
      created_by: actorId,
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(`Mahneintrag konnte nicht erstellt werden: ${error?.message}`)
  return data.id
}

// ---------------------------------------------------------------------------
// checkDunningBlocks — prüft ob Mahnung blockiert ist
// ---------------------------------------------------------------------------

export async function checkDunningBlocks(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<DunningBlockReason[]> {
  const blocks: DunningBlockReason[] = []

  const { data: inv } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('id', invoiceId)
    .single()

  if (!inv) return [{ invoiceId, reason: 'Rechnung nicht gefunden' }]

  if (inv.status === 'storniert') {
    blocks.push({ invoiceId, reason: 'Rechnung ist storniert' })
  }
  if (inv.status === 'strittig') {
    blocks.push({ invoiceId, reason: 'Rechnung ist strittig — keine Mahnung' })
  }

  const { data: disputes } = await supabase
    .from('invoice_disputes')
    .select('id, status')
    .eq('invoice_id', invoiceId)
    .eq('status', 'open')

  if (disputes && disputes.length > 0) {
    blocks.push({ invoiceId, reason: `${disputes.length} offene Beanstandung(en)` })
  }

  const { data: differences } = await supabase
    .from('payment_differences')
    .select('id, widerspruch_status')
    .eq('invoice_id', invoiceId)
    .in('widerspruch_status', ['widerspruch_eingereicht', 'nachforderung'])

  if (differences && differences.length > 0) {
    blocks.push({ invoiceId, reason: 'Offener Widerspruch gegen Kürzung' })
  }

  const { data: corrections } = await supabase
    .from('invoice_corrections')
    .select('id, status')
    .eq('original_invoice_id', invoiceId)
    .in('status', ['entwurf', 'freigegeben'])

  if (corrections && corrections.length > 0) {
    blocks.push({ invoiceId, reason: 'Offene Gutschrift/Korrektur' })
  }

  return blocks
}

// ---------------------------------------------------------------------------
// advanceDunning — eskaliert Mahnstufe
// ---------------------------------------------------------------------------

export async function advanceDunning(
  supabase: SupabaseClient,
  invoiceId: string,
  actorId: string
): Promise<{ newLevel: DunningLevel; feeCents: number }> {
  const blocks = await checkDunningBlocks(supabase, invoiceId)
  if (blocks.length > 0) {
    throw new Error(
      `Mahnung blockiert: ${blocks.map(b => b.reason).join('; ')}`
    )
  }

  const { data: entry } = await supabase
    .from('dunning_entries')
    .select('*')
    .eq('invoice_id', invoiceId)
    .single()

  if (!entry) throw new Error(`Kein Mahneintrag für Rechnung ${invoiceId}`)
  if (entry.block_dunning) throw new Error(`Mahnung manuell blockiert: ${entry.block_reason || 'kein Grund'}`)

  const currentIdx = DUNNING_LEVEL_ORDER.indexOf(entry.dunning_level as DunningLevel)
  if (currentIdx < 0 || currentIdx >= DUNNING_LEVEL_ORDER.length - 2) {
    throw new Error(`Mahnstufe "${entry.dunning_level}" kann nicht weiter eskaliert werden.`)
  }

  const newLevel = DUNNING_LEVEL_ORDER[currentIdx + 1]
  const feeCents = DUNNING_FEES_CENTS[newLevel]

  const now = new Date()
  const heuteStr = heuteBerlin()

  // Wiedervorlage = Abstand zur NÄCHSTEN Stufe.
  //
  // 'bezahlt' steht am Ende von DUNNING_LEVEL_ORDER, hat aber DUNNING_DAYS = 0
  // und ist keine Eskalationsstufe. Ohne die Abgrenzung lieferte der Blick
  // zwei Stufen weiter bei 'letzte_mahnung' → 'inkasso_vorbereitung' den Wert
  // 0 − 70 = −70 Tage und setzte next_dunning_at 70 Tage in die
  // VERGANGENHEIT. Fachlich harmlos (inkasso_vorbereitung ist die höchste
  // automatische Stufe), in der Mahnliste aber eine falsche Fälligkeit.
  const folgeIdx = currentIdx + 2
  const naechsteStufe = folgeIdx <= DUNNING_LEVEL_ORDER.length - 2
    ? DUNNING_LEVEL_ORDER[folgeIdx]
    : null
  const abstandTage = naechsteStufe
    ? Math.max(0, DUNNING_DAYS[naechsteStufe] - DUNNING_DAYS[newLevel])
    : 0
  const nextDate = new Date(now)
  nextDate.setDate(nextDate.getDate() + abstandTage)

  const dueDateStr = entry.due_date || heuteStr
  const dueMs = new Date(dueDateStr + 'T00:00:00+01:00').getTime()
  const todayMs = new Date(heuteStr + 'T00:00:00+01:00').getTime()
  const daysOverdue = Math.max(0, Math.floor((todayMs - dueMs) / 86400000))

  await supabase
    .from('dunning_entries')
    .update({
      dunning_level: newLevel,
      dunning_fee_cents: (entry.dunning_fee_cents || 0) + feeCents,
      last_dunning_at: now.toISOString(),
      next_dunning_at: datumBerlin(nextDate),
      days_overdue: daysOverdue,
    })
    .eq('invoice_id', invoiceId)

  await supabase
    .from('invoices')
    .update({ dunning_level: newLevel })
    .eq('id', invoiceId)

  await logBillingAction(supabase, {
    entityType: 'dunning',
    organizationId: entry.organization_id,
    entityId: entry.id,
    action: 'escalated',
    previousState: { level: entry.dunning_level },
    newState: { level: newLevel, fee_cents: feeCents },
    actorId,
  })

  return { newLevel, feeCents }
}

// ---------------------------------------------------------------------------
// getDunningOverview — Dashboard-Daten
// ---------------------------------------------------------------------------

export interface DunningOverview {
  total: number
  byLevel: Record<DunningLevel, number>
  totalOpenCents: number
  totalOverdueCents: number
  blockedCount: number
}

export async function getDunningOverview(
  supabase: SupabaseClient,
  organizationId: string
): Promise<DunningOverview> {
  const { data: entries } = await supabase
    .from('dunning_entries')
    .select('dunning_level, amount_due_cents, amount_paid_cents, block_dunning, due_date')
    .eq('organization_id', organizationId)
    .neq('dunning_level', 'bezahlt')

  const overview: DunningOverview = {
    total: 0,
    byLevel: {
      offen: 0, erinnerung: 0, mahnung_1: 0, mahnung_2: 0,
      letzte_mahnung: 0, inkasso_vorbereitung: 0, bezahlt: 0,
    },
    totalOpenCents: 0,
    totalOverdueCents: 0,
    blockedCount: 0,
  }

  const today = heuteBerlin()

  for (const e of entries || []) {
    overview.total++
    const level = e.dunning_level as DunningLevel
    overview.byLevel[level] = (overview.byLevel[level] || 0) + 1
    const openCents = (e.amount_due_cents || 0) - (e.amount_paid_cents || 0)
    overview.totalOpenCents += openCents
    if (e.due_date < today) overview.totalOverdueCents += openCents
    if (e.block_dunning) overview.blockedCount++
  }

  return overview
}

// ---------------------------------------------------------------------------
// Mahnlauf — automatische Eskalation aller faelligen Rechnungen
// ---------------------------------------------------------------------------

/**
 * Status, in denen eine Rechnung NICHT gemahnt werden darf.
 *
 * - entwurf/geprueft/korrektur_erforderlich: nie beim Kunden gewesen
 * - storniert/bezahlt/akzeptiert/abgeschrieben: Endstatus
 * - strittig/abgelehnt: fachlich ungeklaert, gehoert in die manuelle Klaerung
 *
 * Alles andere (inkl. Alt-Status wie 'sent') ist mahnfaehig.
 */
const NICHT_MAHNFAEHIG: ReadonlySet<string> = new Set([
  'entwurf',
  'geprueft',
  'korrektur_erforderlich',
  'storniert',
  'bezahlt',
  'akzeptiert',
  'abgeschrieben',
  'strittig',
  'abgelehnt',
])

export interface DunningRunEscalation {
  invoiceId: string
  invoiceNumber: string | null
  fromLevel: DunningLevel
  toLevel: DunningLevel
  daysOverdue: number
  feeCents: number
}

export interface DunningRunSkip {
  invoiceId: string
  invoiceNumber: string | null
  reason: string
}

export interface DunningRunResult {
  organizationId: string
  /** Rechnungen, die ueberhaupt geprueft wurden (faellig + mahnfaehig) */
  geprueft: number
  eskaliert: DunningRunEscalation[]
  blockiert: DunningRunSkip[]
  /** faellig, aber Frist zur naechsten Stufe noch nicht erreicht */
  unveraendert: number
  dryRun: boolean
  /** Anzahl versendeter Mahn-E-Mails (nur bei sendEmails: true) */
  emailsVersendet?: number
}

/**
 * Fuehrt einen Mahnlauf fuer eine Organisation aus.
 *
 * Pro Lauf wird je Rechnung hoechstens EINE Stufe eskaliert — eine Mahnung
 * muss beim Kunden gewesen sein, bevor die naechste faellig wird. Ein seit
 * 90 Tagen offener Posten springt also nicht in einem Rutsch auf
 * "Inkasso-Vorbereitung", sondern laeuft die Leiter im Rhythmus von
 * DUNNING_DAYS ab.
 *
 * Fristen (Tage nach Faelligkeit, aus DUNNING_DAYS):
 *   14 → Zahlungserinnerung, 28 → 1. Mahnung, 42 → 2. Mahnung,
 *   56 → Letzte Mahnung, 70 → Inkasso-Vorbereitung
 */
export async function runDunningRun(
  supabase: SupabaseClient,
  organizationId: string,
  actorId: string,
  options: { dryRun?: boolean; sendEmails?: boolean } = {}
): Promise<DunningRunResult> {
  const dryRun = options.dryRun ?? false
  const sendEmails = options.sendEmails ?? false
  const heute = heuteBerlin()

  const result: DunningRunResult = {
    organizationId,
    geprueft: 0,
    eskaliert: [],
    blockiert: [],
    unveraendert: 0,
    dryRun,
  }

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_number_formatted, status, total_amount, paid_amount, due_date')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .not('due_date', 'is', null)
    .lt('due_date', heute)
    .order('due_date', { ascending: true })
    .limit(1000)

  if (error) throw new Error(`Mahnlauf: Rechnungen laden fehlgeschlagen — ${error.message}`)

  const heuteMs = new Date(heute + 'T00:00:00+01:00').getTime()

  for (const inv of invoices || []) {
    if (NICHT_MAHNFAEHIG.has(inv.status)) continue

    const totalCents = euroZuCent(inv.total_amount || 0)
    const paidCents = euroZuCent(inv.paid_amount || 0)
    if (totalCents - paidCents <= 0) continue

    result.geprueft++

    const nummer = inv.invoice_number_formatted || inv.invoice_number || null
    const daysOverdue = Math.max(
      0,
      Math.floor((heuteMs - new Date(inv.due_date + 'T00:00:00+01:00').getTime()) / 86400000)
    )

    try {
      if (!dryRun) {
        await ensureDunningEntry(supabase, inv.id, organizationId, actorId)
      }

      const { data: entry } = await supabase
        .from('dunning_entries')
        .select('dunning_level, block_dunning, block_reason, next_dunning_at')
        .eq('invoice_id', inv.id)
        .maybeSingle()

      // Im Dry-Run existiert der Eintrag u. U. noch nicht — dann ist 'offen' der Startpunkt.
      const currentLevel = (entry?.dunning_level as DunningLevel) || 'offen'

      if (entry?.block_dunning) {
        result.blockiert.push({
          invoiceId: inv.id,
          invoiceNumber: nummer,
          reason: `Manuell blockiert: ${entry.block_reason || 'kein Grund hinterlegt'}`,
        })
        continue
      }

      const currentIdx = DUNNING_LEVEL_ORDER.indexOf(currentLevel)
      // length - 2 = 'inkasso_vorbereitung': hoechste automatisch erreichbare Stufe.
      if (currentIdx < 0 || currentIdx >= DUNNING_LEVEL_ORDER.length - 2) {
        result.unveraendert++
        continue
      }

      const nextLevel = DUNNING_LEVEL_ORDER[currentIdx + 1]

      // Karenz: erst wenn die Frist der naechsten Stufe erreicht ist UND die
      // in advanceDunning gesetzte Wiedervorlage faellig ist.
      if (daysOverdue < DUNNING_DAYS[nextLevel]) {
        result.unveraendert++
        continue
      }
      if (entry?.next_dunning_at && entry.next_dunning_at > heute) {
        result.unveraendert++
        continue
      }

      const blocks = await checkDunningBlocks(supabase, inv.id)
      if (blocks.length > 0) {
        result.blockiert.push({
          invoiceId: inv.id,
          invoiceNumber: nummer,
          reason: blocks.map(b => b.reason).join('; '),
        })
        continue
      }

      if (dryRun) {
        result.eskaliert.push({
          invoiceId: inv.id,
          invoiceNumber: nummer,
          fromLevel: currentLevel,
          toLevel: nextLevel,
          daysOverdue,
          feeCents: DUNNING_FEES_CENTS[nextLevel],
        })
        continue
      }

      const advanced = await advanceDunning(supabase, inv.id, actorId)
      result.eskaliert.push({
        invoiceId: inv.id,
        invoiceNumber: nummer,
        fromLevel: currentLevel,
        toLevel: advanced.newLevel,
        daysOverdue,
        feeCents: advanced.feeCents,
      })
    } catch (err) {
      result.blockiert.push({
        invoiceId: inv.id,
        invoiceNumber: nummer,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // E-Mail-Versand: nach erfolgreicher Eskalation Mahnschreiben als E-Mail senden
  if (sendEmails && !dryRun && result.eskaliert.length > 0) {
    let emailCount = 0
    for (const esc of result.eskaliert) {
      try {
        await sendDunningEmail(supabase, esc.invoiceId, organizationId, actorId)
        emailCount++
      } catch (err) {
        log.errorWithException('E-Mail-Versand fehlgeschlagen', err, { invoiceId: esc.invoiceId })
      }
    }
    result.emailsVersendet = emailCount
  }

  return result
}

async function sendDunningEmail(
  supabase: SupabaseClient,
  invoiceId: string,
  organizationId: string,
  actorId: string,
): Promise<void> {
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, dunning_level, client:clients(email, first_name, last_name)')
    .eq('id', invoiceId)
    .single()

  if (!inv) return
  const client = inv.client as unknown as ClientJoin
  if (!client?.email) return

  const { data: entry } = await supabase
    .from('dunning_entries')
    .select('id, dunning_level')
    .eq('invoice_id', invoiceId)
    .single()

  if (!entry) return

  // Lazy-Import um zirkuläre Abhängigkeit zu vermeiden
  const { createMahnungDocument, generateMahnungEmail } = await import('../dunning/mahnung-pdf')

  const doc = await createMahnungDocument(supabase, {
    organizationId,
    invoiceId,
    dunningEntryId: entry.id,
    dunningLevel: entry.dunning_level as DunningLevel,
    actorId,
  })

  const email = generateMahnungEmail(doc.mahnungData)

  // E-Mail über die Notifications-Tabelle zur Verarbeitung eintragen
  const { error: queueError } = await supabase.from('dunning_email_queue').insert({
    organization_id: organizationId,
    invoice_id: invoiceId,
    dunning_entry_id: entry.id,
    dunning_document_id: doc.documentId,
    empfaenger_email: client.email,
    empfaenger_name: `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim(),
    betreff: email.subject,
    inhalt: email.body,
    status: 'wartend',
    created_by: actorId,
  })

  if (queueError) {
    log.error('E-Mail-Queue-Insert fehlgeschlagen', { errorMessage: queueError.message })
  }

  await logBillingAction(supabase, {
    entityType: 'dunning',
    organizationId,
    entityId: entry.id,
    action: 'email_queued',
    newState: { empfaenger: client.email, betreff: email.subject },
    actorId,
  })
}
