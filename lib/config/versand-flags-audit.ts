// ═══════════════════════════════════════════════════════════════════════════
// AUDIT DER VERSAND-SCHALTER — festhalten, WANN automatisch versendet wurde
//
// Der Wechsel zwischen „verschickt automatisch" und „verschickt nicht" ist
// eine geldrelevante Betriebsänderung. Bisher stand sie nirgends: nachträglich
// ließ sich nicht belegen, ob ein Sammelrechnungslauf vom 3. des Monats die
// Belege auch versendet hat oder nur erzeugt.
//
// ── WARUM NUR BEI ÄNDERUNG ─────────────────────────────────────────────────
// Ein Eintrag je Aufruf hieße: eine Zeile pro festgeschriebener Rechnung und
// eine pro Mandant und Tag aus dem Mahn-Cron. Der Trail wäre nach einem Monat
// voller Zeilen, die alle dasselbe sagen. Festgehalten wird deshalb nur der
// WECHSEL — verglichen wird gegen den zuletzt für diesen Mandanten
// festgehaltenen Zustand.
//
// ── WARUM billing_audit_trail UND NICHT mis_audit_log ──────────────────────
// Der Betriebsmodus der Abrechnung ist bereits ein verzeichneter Entitätstyp
// ('abrechnung_betriebsmodus', Migration 20260903010000). `mis_audit_log`
// verlangt dagegen eine Actor-UUID aus auth.users; ein Cron-Lauf hat keine.
// `logBillingAction` nimmt einen nicht-UUID-Handelnden als Rolle auf
// (zerlegeHandelnden) — genau der Fall hier.
//
// ── FAIL-SOFT ──────────────────────────────────────────────────────────────
// Diese Funktion darf keinen Versand kippen. Sie steht VOR dem Versand, aber
// ein Audit-Fehler ist kein Grund, eine korrekt festgeschriebene Rechnung
// nicht zu verschicken. Fehler werden protokolliert, nicht geworfen.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '@/lib/billing/core/audit'
import { logger } from '@/lib/logger'
import {
  auditZustand,
  standGeaendert,
  versandFlagsStand,
  type VersandFlagAuditZustand,
  type VersandFlagsStand,
} from './versand-flags'
import type { EnvQuelle } from '@/lib/env/pruefung'

const log = logger.child('versand-flags')

/** entity_type aus AUDIT_ENTITY_TYPES. */
const ENTITY_TYPE = 'abrechnung_betriebsmodus' as const

/** action-Wert, unter dem die Schalterlage im Trail steht. */
export const VERSAND_FLAG_ACTION = 'versand_flag_stand'

export interface FlagAuditErgebnis {
  /** Wurde eine Zeile geschrieben? */
  geschrieben: boolean
  /** Hat sich die Lage gegenüber dem letzten Eintrag geändert? */
  geaendert: boolean
  /** Der jetzt geltende Zustand. */
  jetzt: VersandFlagAuditZustand
  /** Der zuletzt festgehaltene Zustand, oder null, wenn es keinen gab. */
  vorher: VersandFlagAuditZustand | null
}

/**
 * Liest den zuletzt festgehaltenen Schalterzustand eines Mandanten.
 *
 * `null` bedeutet „nie festgehalten ODER nicht lesbar". Beides führt zu einem
 * Eintrag — ein doppelter Eintrag ist harmlos, ein fehlender wäre eine Lücke
 * in der Spur.
 */
export async function letzterFlagZustand(
  admin: SupabaseClient,
  organizationId: string,
): Promise<VersandFlagAuditZustand | null> {
  // Der try/catch ist keine Zierde: der PostgREST-Client meldet einen
  // Verbindungsabbruch nicht als `error`-Feld, sondern als geworfene
  // Ausnahme. Ohne ihn riss ein Netzwerkfehler beim LESEN des Trails die
  // gesamte Festschreibung mit — eine korrekt erzeugte Rechnung wäre wegen
  // eines Protokolleintrags nicht zustande gekommen. Genau das darf diese
  // Datei nicht tun.
  let data: unknown[] | null = null
  try {
    const antwort = await admin
      .from('billing_audit_trail')
      .select('new_state')
      .eq('organization_id', organizationId)
      .eq('entity_type', ENTITY_TYPE)
      .eq('action', VERSAND_FLAG_ACTION)
      .order('created_at', { ascending: false })
      .limit(1)

    if (antwort.error) {
      log.warn('Letzter Schalterzustand nicht lesbar — es wird ein Eintrag geschrieben', {
        organizationId, errorMessage: antwort.error.message,
      })
      return null
    }
    data = antwort.data as unknown[] | null
  } catch (err) {
    log.errorWithException('Letzter Schalterzustand nicht abfragbar', err, { organizationId })
    return null
  }

  const zeile = (data ?? [])[0] as { new_state?: unknown } | undefined
  const zustand = zeile?.new_state as Partial<VersandFlagAuditZustand> | undefined
  if (!zustand || typeof zustand.rechnungsversand !== 'string' || typeof zustand.mahnversand !== 'string') {
    return null
  }
  return {
    rechnungsversand: zustand.rechnungsversand as VersandFlagAuditZustand['rechnungsversand'],
    mahnversand: zustand.mahnversand as VersandFlagAuditZustand['mahnversand'],
    produktion: zustand.produktion === true,
  }
}

/**
 * Hält die Lage beider Schalter für einen Mandanten fest — aber nur, wenn sie
 * sich seit dem letzten Eintrag geändert hat.
 *
 * Aufzurufen an jeder Stelle, die den automatischen Versand tatsächlich
 * konsultiert: Festschreiben, Sammelrechnungslauf, Mahn-Cron. Dort ist der
 * Zustand belegbar wirksam gewesen — eine Startprüfung könnte das nicht sagen,
 * weil zwischen Prozessstart und Versand ein Redeploy liegen kann.
 */
export async function protokolliereVersandFlags(
  admin: SupabaseClient,
  params: {
    organizationId: string
    actorId: string
    /** Für Tests: Umgebungsquelle überschreiben. */
    quelle?: EnvQuelle
    /** Für Tests: bereits gelesener Stand. */
    stand?: VersandFlagsStand
  },
): Promise<FlagAuditErgebnis> {
  const stand = params.stand ?? versandFlagsStand(params.quelle)
  const jetzt = auditZustand(stand)

  const vorher = await letzterFlagZustand(admin, params.organizationId)
  const geaendert = standGeaendert(vorher, jetzt)

  if (!geaendert) return { geschrieben: false, geaendert: false, jetzt, vorher }

  try {
    await logBillingAction(admin, {
      entityType: ENTITY_TYPE,
      entityId: params.organizationId,
      organizationId: params.organizationId,
      action: VERSAND_FLAG_ACTION,
      previousState: vorher as unknown as Record<string, unknown> | null,
      newState: jetzt as unknown as Record<string, unknown>,
      reason: [stand.rechnung.grund, stand.mahnung.grund].join(' '),
      actorId: params.actorId,
    })
    log.info('Versand-Schalterlage geändert und festgehalten', {
      organizationId: params.organizationId,
      rechnungsversand: jetzt.rechnungsversand,
      mahnversand: jetzt.mahnversand,
    })
    return { geschrieben: true, geaendert: true, jetzt, vorher }
  } catch (err) {
    // Fail-soft: ein Audit-Fehler darf keinen Versand kippen.
    log.errorWithException('Versand-Schalterlage konnte nicht festgehalten werden', err, {
      organizationId: params.organizationId,
    })
    return { geschrieben: false, geaendert: true, jetzt, vorher }
  }
}
