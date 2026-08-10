// ═══════════════════════════════════════════════════════════════
// Angehörigenzugang — geteilte Typen
// Spiegelt die Tabellen aus
// supabase/migrations/20260821010000_angehoerigenzugang.sql
// ═══════════════════════════════════════════════════════════════

export type AngehoerigenRolle = 'angehoeriger' | 'betreuer' | 'bevollmaechtigter'

export const ANGEHOERIGEN_ROLLEN: AngehoerigenRolle[] = [
  'angehoeriger', 'betreuer', 'bevollmaechtigter',
]

export const ROLLEN_LABEL: Record<AngehoerigenRolle, string> = {
  angehoeriger: 'Angehöriger',
  betreuer: 'Betreuer',
  bevollmaechtigter: 'Bevollmächtigter',
}

export type FreigabeStatus = 'aktiv' | 'widerrufen' | 'abgelaufen'

export type FreigabeBereich =
  | 'termine' | 'leistungen' | 'pflegeberichte'
  | 'dokumente' | 'nachrichten'

export const FREIGABE_BEREICHE: FreigabeBereich[] = [
  'termine', 'leistungen', 'pflegeberichte', 'dokumente', 'nachrichten',
]

export const BEREICH_LABEL: Record<FreigabeBereich, string> = {
  termine: 'Termine',
  leistungen: 'Leistungen',
  pflegeberichte: 'Pflegeberichte',
  dokumente: 'Dokumente',
  nachrichten: 'Nachrichten',
}

export type NachrichtStatus = 'gesendet' | 'gelesen'

export type AuditAktion =
  | 'login' | 'logout'
  | 'termine_eingesehen' | 'leistungen_eingesehen'
  | 'pflegebericht_eingesehen' | 'dokument_eingesehen'
  | 'dokument_heruntergeladen'
  | 'nachricht_gesendet' | 'nachricht_gelesen'
  | 'profil_aktualisiert'
  | 'zugang_erteilt' | 'zugang_widerrufen'
  | 'freigabe_geaendert'

export const AUDIT_AKTIONEN: AuditAktion[] = [
  'login', 'logout',
  'termine_eingesehen', 'leistungen_eingesehen',
  'pflegebericht_eingesehen', 'dokument_eingesehen',
  'dokument_heruntergeladen',
  'nachricht_gesendet', 'nachricht_gelesen',
  'profil_aktualisiert',
  'zugang_erteilt', 'zugang_widerrufen',
  'freigabe_geaendert',
]

export interface AngehoerigenZugang {
  id: string
  organization_id: string
  user_id: string
  client_id: string
  rolle: AngehoerigenRolle
  status: FreigabeStatus
  freigegebene_bereiche: FreigabeBereich[]
  pflegeberichte_freigegeben: boolean
  erteilt_von: string | null
  erteilt_am: string
  widerrufen_von: string | null
  widerrufen_am: string | null
  widerruf_grund: string | null
  gueltig_bis: string | null
  created_at: string
  updated_at: string
}

export interface AngehoerigenNachricht {
  id: string
  organization_id: string
  zugang_id: string
  client_id: string
  absender_id: string
  absender_typ: 'angehoeriger' | 'pflegedienst'
  betreff: string
  inhalt: string
  status: NachrichtStatus
  gelesen_am: string | null
  created_at: string
}

export interface AngehoerigenAuditLog {
  id: string
  organization_id: string
  zugang_id: string
  user_id: string
  client_id: string
  aktion: AuditAktion
  details: Record<string, unknown> | null
  ip_adresse: string | null
  user_agent: string | null
  created_at: string
}

export interface AngehoerigenBenachrichtigung {
  id: string
  organization_id: string
  zugang_id: string
  typ: 'push' | 'email'
  betreff: string
  inhalt: string
  gesendet_am: string | null
  gelesen_am: string | null
  created_at: string
}

// ── Filter ──────────────────────────────────────────────────────

export interface ZugangFilter {
  client_id?: string
  user_id?: string
  status?: FreigabeStatus
  rolle?: AngehoerigenRolle
}

export interface NachrichtFilter {
  zugang_id?: string
  client_id?: string
  absender_typ?: 'angehoeriger' | 'pflegedienst'
  status?: NachrichtStatus
  limit?: number
  offset?: number
}

export interface AuditFilter {
  zugang_id?: string
  client_id?: string
  user_id?: string
  aktion?: AuditAktion
  von?: string
  bis?: string
  limit?: number
  offset?: number
}

// ── Validierung ──────────────────────────────────────────────────

export function validiereRolle(r: string): asserts r is AngehoerigenRolle {
  if (!ANGEHOERIGEN_ROLLEN.includes(r as AngehoerigenRolle)) {
    throw new Error(`Ungültige Rolle: ${r}. Erlaubt: ${ANGEHOERIGEN_ROLLEN.join(', ')}`)
  }
}

export function validiereBereich(b: string): asserts b is FreigabeBereich {
  if (!FREIGABE_BEREICHE.includes(b as FreigabeBereich)) {
    throw new Error(`Ungültiger Bereich: ${b}. Erlaubt: ${FREIGABE_BEREICHE.join(', ')}`)
  }
}

export function validiereBereiche(bereiche: string[]): asserts bereiche is FreigabeBereich[] {
  if (!Array.isArray(bereiche) || bereiche.length === 0) {
    throw new Error('Mindestens ein Freigabebereich muss gewählt werden.')
  }
  for (const b of bereiche) validiereBereich(b)
}

export function validiereZugangInput(data: Record<string, unknown>): void {
  if (!data.client_id || typeof data.client_id !== 'string') {
    throw new Error('Klient muss zugeordnet sein.')
  }
  if (!data.user_id || typeof data.user_id !== 'string') {
    throw new Error('Benutzer muss zugeordnet sein.')
  }
  validiereRolle(data.rolle as string)
  validiereBereiche(data.freigegebene_bereiche as string[])
}
