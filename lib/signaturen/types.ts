// ═══════════════════════════════════════════════════════════════
// Digitale Signaturen — geteilte Typen
// Spiegelt die Tabellen aus
// supabase/migrations/20260821020000_digitale_signaturen.sql
// ═══════════════════════════════════════════════════════════════

import { UserFacingError } from '@/lib/api/user-facing-error'

export type SignaturDokumentTyp =
  | 'leistungsnachweis' | 'vertrag' | 'pflegebericht'
  | 'protokoll' | 'einwilligung' | 'sonstiges'

export const SIGNATUR_DOKUMENT_TYPEN: SignaturDokumentTyp[] = [
  'leistungsnachweis', 'vertrag', 'pflegebericht',
  'protokoll', 'einwilligung', 'sonstiges',
]

export type SignaturStatus = 'offen' | 'signiert' | 'abgelehnt'

export const SIGNATUR_STATUS_WERTE: SignaturStatus[] = ['offen', 'signiert', 'abgelehnt']

export type SignaturMethode = 'signaturepad' | 'pin' | 'checkbox' | 'qes_extern'

export const SIGNATUR_METHODEN: SignaturMethode[] = [
  'signaturepad', 'pin', 'checkbox', 'qes_extern',
]

export type AuditAktionTyp =
  | 'signatur_angefordert' | 'signatur_geleistet' | 'signatur_abgelehnt'
  | 'dokument_erstellt' | 'hash_verifiziert' | 'hash_ungueltig'
  | 'signatur_widerrufen'

export const AUDIT_AKTION_TYPEN: AuditAktionTyp[] = [
  'signatur_angefordert', 'signatur_geleistet', 'signatur_abgelehnt',
  'dokument_erstellt', 'hash_verifiziert', 'hash_ungueltig',
  'signatur_widerrufen',
]

export interface SignaturDokument {
  id: string
  organization_id: string
  dokument_typ: SignaturDokumentTyp
  titel: string
  beschreibung: string | null
  referenz_tabelle: string | null
  referenz_id: string | null
  dokument_hash_sha256: string
  dokument_inhalt_snapshot: string | null
  erstellt_von: string
  version: number
  created_at: string
  updated_at: string
}

export interface Signatur {
  id: string
  organization_id: string
  dokument_id: string
  signatar_id: string
  signatar_name: string
  signatar_rolle: string | null
  status: SignaturStatus
  methode: SignaturMethode | null
  signatur_hash_sha256: string | null
  signatur_daten: string | null
  signiert_am: string | null
  abgelehnt_am: string | null
  ablehnung_grund: string | null
  ip_adresse: string | null
  user_agent: string | null
  created_at: string
  updated_at: string
}

export interface SignaturAuditLog {
  id: string
  organization_id: string
  dokument_id: string | null
  signatur_id: string | null
  aktion: AuditAktionTyp
  akteur_id: string
  akteur_name: string | null
  details: Record<string, unknown> | null
  created_at: string
}

export interface QesHook {
  id: string
  organization_id: string
  provider: string
  endpoint_url: string
  api_key_ref: string | null
  aktiv: boolean
  created_at: string
  updated_at: string
}

// ── Filter ──────────────────────────────────────────────────────

export interface DokumentFilter {
  dokument_typ?: SignaturDokumentTyp
  referenz_tabelle?: string
  referenz_id?: string
  erstellt_von?: string
  limit?: number
  offset?: number
}

export interface SignaturFilter {
  dokument_id?: string
  signatar_id?: string
  status?: SignaturStatus
  methode?: SignaturMethode
  limit?: number
  offset?: number
}

export interface SignaturAuditFilter {
  dokument_id?: string
  signatur_id?: string
  aktion?: AuditAktionTyp
  akteur_id?: string
  limit?: number
  offset?: number
}

// ── Validierung ──────────────────────────────────────────────────
//
// UserFacingError statt nacktem Error: die Meldungen nennen Feld und
// erlaubte Werte — also genau die Auskunft, die den Tippfehler behebt.
// Ein nackter Error wird vom Sanitizer fail-closed zu „Interner
// Serverfehler" verkuerzt und kaeme beim Nutzer nie an (gleiche Stelle
// wie in lib/personal, faa0972).

export function validiereDokumentTyp(t: string): asserts t is SignaturDokumentTyp {
  if (!SIGNATUR_DOKUMENT_TYPEN.includes(t as SignaturDokumentTyp)) {
    throw new UserFacingError(`Ungültiger Dokumenttyp: ${t}. Zulässig: ${SIGNATUR_DOKUMENT_TYPEN.join(', ')}`)
  }
}

export function validiereSignaturStatus(s: string): asserts s is SignaturStatus {
  if (!SIGNATUR_STATUS_WERTE.includes(s as SignaturStatus)) {
    throw new UserFacingError(`Ungültiger Status: ${s}. Zulässig: ${SIGNATUR_STATUS_WERTE.join(', ')}`)
  }
}

export function validiereMethode(m: string): asserts m is SignaturMethode {
  if (!SIGNATUR_METHODEN.includes(m as SignaturMethode)) {
    throw new UserFacingError(`Ungültige Signaturmethode: ${m}. Zulässig: ${SIGNATUR_METHODEN.join(', ')}`)
  }
}

export function validiereSHA256(hash: string): void {
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new UserFacingError('Ungültiger SHA-256-Hash (erwartet: 64 Hex-Zeichen in Kleinschreibung).')
  }
}

export function validiereISO8601(ts: string): void {
  const d = new Date(ts)
  if (isNaN(d.getTime())) {
    throw new UserFacingError(`Ungültiger Zeitstempel: ${ts} (ISO 8601 erwartet).`)
  }
}

/**
 * Liegt ein Inhalts-Schnappschuss vor, ist der Hash eine ABLEITUNG davon
 * und darf fehlen — erstelleDokument() berechnet ihn dann selbst und
 * weist einen mitgeschickten, abweichenden Wert zurueck. Ohne
 * Schnappschuss bleibt der Hash Pflicht: sonst stuende in der Spalte ein
 * Nachweis, den nichts belegt.
 */
export function validiereDokumentInput(data: Record<string, unknown>): void {
  if (!data.titel || typeof data.titel !== 'string' || data.titel.trim().length === 0) {
    throw new UserFacingError('Dokumenttitel ist ein Pflichtfeld.')
  }
  validiereDokumentTyp(data.dokument_typ as string)

  const hatSnapshot =
    typeof data.dokument_inhalt_snapshot === 'string'
    && data.dokument_inhalt_snapshot.length > 0

  const hash = data.dokument_hash_sha256
  if (typeof hash === 'string' && hash.length > 0) {
    validiereSHA256(hash)
    return
  }

  if (!hatSnapshot) {
    throw new UserFacingError(
      'Dokument-Hash (SHA-256) ist ein Pflichtfeld — oder übergeben Sie dokument_inhalt_snapshot, dann wird er berechnet.',
    )
  }
}

export function validiereSignaturInput(data: Record<string, unknown>): void {
  if (!data.dokument_id || typeof data.dokument_id !== 'string') {
    throw new UserFacingError('Dokument muss zugeordnet sein.')
  }
  if (!data.signatar_id || typeof data.signatar_id !== 'string') {
    throw new UserFacingError('Signatar muss zugeordnet sein.')
  }
  if (!data.signatar_name || typeof data.signatar_name !== 'string') {
    throw new UserFacingError('Signatarname ist ein Pflichtfeld.')
  }
}
