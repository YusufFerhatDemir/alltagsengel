// ═══════════════════════════════════════════════════════════════
// Workflow-Engine — geteilte Typen
// Spiegelt 1:1 die Spalten aus
// supabase/migrations/20260813010000_workflow_engine.sql
// ═══════════════════════════════════════════════════════════════

// ── Modul-Enum (wf_events, wf_regeln) ───────────────────────────

export type WfModul =
  | 'dakota' | 'abrechnung' | 'personal' | 'pflege' | 'dokumente'
  | 'einsatz' | 'aufgaben' | 'forderungen' | 'system'

export const WF_MODUL_WERTE: WfModul[] = [
  'dakota', 'abrechnung', 'personal', 'pflege', 'dokumente',
  'einsatz', 'aufgaben', 'forderungen', 'system',
]

// ── Event-Enums ──────────────────────────────────────────────────

export type WfEventStatus = 'neu' | 'in_bearbeitung' | 'verarbeitet' | 'fehlgeschlagen' | 'uebersprungen'
export const WF_EVENT_STATUS_WERTE: WfEventStatus[] = ['neu', 'in_bearbeitung', 'verarbeitet', 'fehlgeschlagen', 'uebersprungen']

export type WfEventPrioritaet = 'niedrig' | 'normal' | 'hoch' | 'kritisch'
export const WF_EVENT_PRIORITAET_WERTE: WfEventPrioritaet[] = ['niedrig', 'normal', 'hoch', 'kritisch']

// ── Aktion-Enum (wf_aktionen) ────────────────────────────────────

export type WfAktionTyp =
  | 'aufgabe_erstellen' | 'benachrichtigung_senden' | 'wiedervorlage_erstellen'
  | 'eskalation_ausloesen' | 'status_aendern' | 'feld_aktualisieren' | 'webhook'

export const WF_AKTION_TYP_WERTE: WfAktionTyp[] = [
  'aufgabe_erstellen', 'benachrichtigung_senden', 'wiedervorlage_erstellen',
  'eskalation_ausloesen', 'status_aendern', 'feld_aktualisieren', 'webhook',
]

// ── Ausführung-Enum (wf_ausfuehrungen) ───────────────────────────

export type WfAusfuehrungStatus = 'ausstehend' | 'erfolgreich' | 'fehlgeschlagen' | 'uebersprungen'
export const WF_AUSFUEHRUNG_STATUS_WERTE: WfAusfuehrungStatus[] = ['ausstehend', 'erfolgreich', 'fehlgeschlagen', 'uebersprungen']

// ── Warteschlange-Enum (wf_warteschlange) ────────────────────────

export type WfQueueStatus = 'wartend' | 'in_bearbeitung' | 'erledigt' | 'fehlgeschlagen' | 'dead_letter'
export const WF_QUEUE_STATUS_WERTE: WfQueueStatus[] = ['wartend', 'in_bearbeitung', 'erledigt', 'fehlgeschlagen', 'dead_letter']

// ── Audit-Enum (wf_audit_log) ─────────────────────────────────────

export type WfAuditTyp =
  | 'event_emittiert' | 'regel_ausgewertet' | 'aktion_ausgefuehrt'
  | 'retry' | 'dead_letter' | 'manuell_wiederholt'
  | 'regel_erstellt' | 'regel_geaendert' | 'regel_deaktiviert'
  | 'fristen_check' | 'system_fehler'

export const WF_AUDIT_TYP_WERTE: WfAuditTyp[] = [
  'event_emittiert', 'regel_ausgewertet', 'aktion_ausgefuehrt',
  'retry', 'dead_letter', 'manuell_wiederholt',
  'regel_erstellt', 'regel_geaendert', 'regel_deaktiviert',
  'fristen_check', 'system_fehler',
]

// ── Bedingungs-Operatoren (wf_regeln.bedingungen, siehe wf_evaluate_conditions) ─

export type WfBedingungOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'enthält' | 'ist_leer' | 'ist_nicht_leer'
export const WF_BEDINGUNG_OPERATOR_WERTE: WfBedingungOperator[] = ['=', '!=', '>', '<', '>=', '<=', 'enthält', 'ist_leer', 'ist_nicht_leer']

export interface WfBedingung {
  feld: string
  operator: WfBedingungOperator
  wert?: string
}

// ── DB-Interfaces ──────────────────────────────────────────────

export interface WfEvent {
  id: string
  organization_id: string
  event_typ: string
  modul: WfModul
  quell_tabelle: string
  quell_id: string | null
  payload: Record<string, unknown>
  idempotency_key: string
  status: WfEventStatus
  prioritaet: WfEventPrioritaet
  ausgeloest_von: string | null
  ausgeloest_am: string | null
  verarbeitet_am: string | null
  fehler_nachricht: string | null
  retry_count: number
  max_retries: number
  naechster_retry: string | null
  created_at: string
}

export interface WfRegel {
  id: string
  organization_id: string
  bezeichnung: string
  beschreibung: string | null
  event_typ: string
  modul: WfModul
  bedingungen: WfBedingung[]
  aktiv: boolean
  prioritaet: number
  max_ausfuehrungen_pro_entity: number | null
  cooldown_minuten: number | null
  erstellt_von: string | null
  ist_system: boolean
  created_at: string
  updated_at: string
}

export interface WfAktion {
  id: string
  organization_id: string
  regel_id: string
  reihenfolge: number
  typ: WfAktionTyp
  konfiguration: Record<string, unknown>
  aktiv: boolean
  created_at: string
}

export interface WfAusfuehrung {
  id: string
  organization_id: string
  event_id: string
  regel_id: string
  aktion_id: string | null
  status: WfAusfuehrungStatus
  ergebnis: Record<string, unknown> | null
  fehler_nachricht: string | null
  erstellt_entity_typ: string | null
  erstellt_entity_id: string | null
  gestartet_am: string | null
  beendet_am: string | null
  created_at: string
}

export interface WfWarteschlangeEintrag {
  id: string
  organization_id: string
  event_id: string
  regel_id: string
  aktion_id: string
  prioritaet: number
  status: WfQueueStatus
  versuch: number
  max_versuche: number
  naechster_versuch: string | null
  fehler_nachricht: string | null
  created_at: string
  updated_at: string
}

export interface WfDeadLetter {
  id: string
  organization_id: string
  warteschlange_id: string | null
  event_id: string
  regel_id: string
  aktion_id: string
  fehler_nachricht: string | null
  payload: Record<string, unknown> | null
  versuche: number | null
  manuell_wiederholt: boolean
  wiederholt_am: string | null
  wiederholt_von: string | null
  created_at: string
}

export interface WfAuditLogEintrag {
  id: string
  organization_id: string
  typ: WfAuditTyp
  entitaet_typ: string
  entitaet_id: string | null
  aktion: string
  details: Record<string, unknown>
  akteur_id: string | null
  created_at: string
}

// ── View-Interfaces ────────────────────────────────────────────

export interface WfEventDashboard {
  id: string
  event_typ: string
  modul: WfModul
  quell_tabelle: string
  quell_id: string | null
  status: WfEventStatus
  prioritaet: WfEventPrioritaet
  retry_count: number
  ausgeloest_am: string | null
  verarbeitet_am: string | null
  fehler_nachricht: string | null
  organization_id: string
  erfolgreiche_aktionen: number
  fehlgeschlagene_aktionen: number
}

export interface WfQueueStatusRow {
  id: string
  status: WfQueueStatus
  versuch: number
  max_versuche: number
  naechster_versuch: string | null
  fehler_nachricht: string | null
  prioritaet: number
  organization_id: string
  event_typ: string
  modul: WfModul
  regel_name: string
  aktion_typ: WfAktionTyp
  created_at: string
}

export interface WfDeadLetterUebersicht {
  id: string
  fehler_nachricht: string | null
  versuche: number | null
  manuell_wiederholt: boolean
  wiederholt_am: string | null
  organization_id: string
  event_typ: string
  modul: WfModul
  regel_name: string
  aktion_typ: WfAktionTyp
  created_at: string
}

export interface WfStatistik {
  organization_id: string
  total_events: number
  offene_events: number
  verarbeitete_events: number
  fehlerhafte_events: number
  queue_wartend: number
  dead_letter_offen: number
  aktive_regeln: number
  erfolgreiche_ausfuehrungen: number
}

// ── Filter-Interfaces ────────────────────────────────────────────

export interface ListWfEventsFilter {
  organizationId: string
  status?: WfEventStatus
  modul?: WfModul
  eventTyp?: string
  limit?: number
  offset?: number
}

export interface ListWfRegelnFilter {
  organizationId: string
  aktiv?: boolean
  modul?: WfModul
}

export interface ListWfAktionenFilter {
  organizationId: string
  regelId: string
}

export interface ListWfAusfuehrungenFilter {
  organizationId: string
  eventId?: string
  regelId?: string
  status?: WfAusfuehrungStatus
  limit?: number
  offset?: number
}

export interface ListWfWarteschlangeFilter {
  organizationId: string
  status?: WfQueueStatus
  limit?: number
  offset?: number
}

export interface ListWfDeadLetterFilter {
  organizationId: string
  manuellWiederholt?: boolean
  limit?: number
  offset?: number
}

export interface ListWfAuditFilter {
  organizationId: string
  typ?: WfAuditTyp
  entitaetTyp?: string
  entitaetId?: string
  limit?: number
  offset?: number
}

// ── Validierung ────────────────────────────────────────────────

export function assertErlaubt<T extends string>(
  wert: T | null | undefined,
  erlaubt: readonly T[],
  feldname: string,
): void {
  if (wert != null && !erlaubt.includes(wert)) {
    throw new Error(`Ungueltiger Wert "${wert}" fuer ${feldname}. Erlaubt: ${erlaubt.join(', ')}`)
  }
}
