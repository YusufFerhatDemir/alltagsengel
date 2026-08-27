// ═══════════════════════════════════════════════════════════════════════
// Digitale Signaturen — Dokument-Hash, Signatur-Hash, Nachweis
// ═══════════════════════════════════════════════════════════════════════
//
// LAGE VOR DIESEM STAND (live am 28.08.2026 nachgeprueft, siehe
// scripts/verify-signaturen-live.mjs — 11/11 gruen)
//
//  1. signatur_audit_log traegt live GENAU EINE permissive Policy:
//     admin_sig_audit_all mit is_admin(), und is_admin() ist live
//     admin|superadmin. protokolliereSignaturAudit() lief aber mit dem
//     RLS-Client des Aufrufers. Ein Signatar ist per Definition selten
//     Administration — er darf seine eigene Zeile in `signaturen`
//     schreiben (Policy signatar_eigene_update), den Nachweis darueber
//     aber NICHT. Jede Unterschrift eines Nicht-Admins lief damit so ab:
//     Unterschrift wird geschrieben → Audit-Insert scheitert an RLS →
//     die Funktion wirft → die Route antwortet HTTP 500. Der Signatar
//     sah einen Fehler, die Unterschrift stand trotzdem, und beim
//     zweiten Versuch kam „Status signiert — kann nicht signiert werden".
//     Der Nachweis, um den es in diesem Modul geht, entstand NIE.
//     (Alle vier Tabellen sind live leer — der Weg hat nie funktioniert.)
//
//  2. verifiziereSignatur() lud `dokument_inhalt_snapshot` und benutzte
//     ihn NICHT. Geprueft wurde allein, ob der gespeicherte Signatur-Hash
//     zu (Dokument-Hash, Signatar, Zeitstempel) passt. Wer den
//     Dokumentinhalt nachtraeglich aendert und den Hash stehenlaesst,
//     bekam „gueltig: true" — also genau in dem Fall, fuer den die
//     Pruefung da ist.
//
//  3. Die Route schrieb `x-forwarded-for` ROH in signaturen.ip_adresse.
//     Die Spalte ist live vom Typ `inet` und weist eine Proxy-Kette
//     ("a, b") mit 22P02 ab — hinter einer Kette waere die Unterschrift
//     komplett verlorengegangen. Jede andere Stelle im Repo nimmt den
//     ersten Eintrag (lib/audit-log.ts, lib/rate-limit.ts, …).
//
//  4. Status-Wechsel liefen als „erst pruefen, dann schreiben" ohne
//     Compare-and-Swap. Fuer Signatare faengt die DB-Policy das ab
//     (status = 'offen' steht im USING), fuer die Administration greift
//     is_admin() FOR ALL ohne Statusbedingung — dort konnte eine
//     abgelehnte Signatur im Rennen zu einer signierten werden.
//
//  5. listeDokumente/listeSignaturen liefen mit dem RLS-Client, waehrend
//     der Guard pdl/qm/buchhaltung ueber 'einsatz.lesen' hereinliess.
//     Fuer diese Rollen gibt es keine Policy — sie bekamen eine LEERE
//     Liste ohne Fehlermeldung (dieselbe stille Falschauskunft wie in
//     d707cda und 48d6f3b).
//
// REGELN AB HIER
//  · Der Nachweis entsteht mit dem Dienstschluessel und FAIL-CLOSED:
//    laesst er sich nicht schreiben, wird die Handlung zurueckgenommen
//    und die Route antwortet 503. Keine Unterschrift ohne Nachweis.
//  · Statuswechsel sind Compare-and-Swap auf 'offen' — dieselbe Linie
//    wie genehmigenAbwesenheit (faa0972) und freigebenBerechnung
//    (dcfb61e): erst beanspruchen, dann protokollieren, bei Fehlschlag
//    zurueckrollen.
//  · Der Dokumenttyp entscheidet ueber die noetige Berechtigung
//    (lib/signaturen/berechtigung.ts).
//  · Fehler, die der Nutzer beheben kann, sind UserFacingError mit
//    Status — nackte Errors verkuerzt der Sanitizer zu „Interner
//    Serverfehler" und verschluckt genau die Auskunft, die hilft.
// ═══════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  SignaturDokument,
  Signatur,
  SignaturAuditLog,
  DokumentFilter,
  SignaturFilter,
  SignaturAuditFilter,
  SignaturStatus,
  SignaturMethode,
  SignaturDokumentTyp,
  AuditAktionTyp,
} from './types'
import {
  validiereDokumentInput,
  validiereSignaturInput,
  validiereMethode,
} from './types'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { MAX_BILD_BYTES } from './unterschrift-bild'
import { createHash } from 'crypto'

// ── Hash-Hilfsfunktionen ────────────────────────────────────────

export function berechneSHA256(inhalt: string): string {
  return createHash('sha256').update(inhalt, 'utf8').digest('hex')
}

export function verifiziereDokumentHash(
  inhalt: string,
  erwarteterHash: string,
): boolean {
  const berechnet = berechneSHA256(inhalt)
  return berechnet === erwarteterHash
}

export function berechneSignaturHash(
  dokumentHash: string,
  signatarId: string,
  zeitstempel: string,
): string {
  const payload = `${dokumentHash}:${signatarId}:${zeitstempel}`
  return berechneSHA256(payload)
}

// ── Eingangswerte ───────────────────────────────────────────────

/**
 * Erste Adresse aus einer x-forwarded-for-Kette.
 *
 * signaturen.ip_adresse ist `inet` (live geprueft). Der Rohwert des
 * Headers ist hinter mehreren Proxys eine kommagetrennte Liste und wird
 * von Postgres mit 22P02 abgewiesen — das Schreiben der Unterschrift
 * scheiterte dann komplett. Die IP ist Begleitinformation, nicht der
 * Beweis: laesst sie sich nicht deuten, wird `null` gespeichert statt die
 * Unterschrift daran scheitern zu lassen.
 */
export function ersteIpAdresse(roh: string | null | undefined): string | null {
  if (typeof roh !== 'string') return null
  const erste = roh.split(',')[0]?.trim()
  if (!erste) return null
  // IPv4, IPv4-mit-Port (Port abschneiden) und IPv6 in einfacher Form.
  const ohnePort = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/.exec(erste)
  const wert = ohnePort ? ohnePort[1] : erste
  const istIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(wert)
    && wert.split('.').every(o => Number(o) <= 255)
  const istIpv6 = /^[0-9a-fA-F:]+$/.test(wert) && wert.includes(':')
  return istIpv4 || istIpv6 ? wert : null
}

/** user_agent ist `text` ohne Grenze — der Header ist aber Fremdeingabe. */
export function kuerzeUserAgent(roh: string | null | undefined): string | null {
  if (typeof roh !== 'string') return null
  const wert = roh.trim()
  return wert === '' ? null : wert.slice(0, 512)
}

// ── Nachweis (Audit) ────────────────────────────────────────────

export interface AuditEintrag {
  dokument_id?: string
  signatur_id?: string
  aktion: AuditAktionTyp
  akteur_id: string
  akteur_name?: string
  details?: Record<string, unknown>
}

/**
 * Schreibt den Nachweiseintrag — MUSS mit dem Dienstschluessel laufen.
 *
 * signatur_audit_log kennt live nur is_admin(); mit dem RLS-Client eines
 * Signatars scheitert jeder Insert an 42501. Der Aufrufer uebergibt
 * deshalb ausdruecklich einen Client mit Dienstschluessel. Der Mandant
 * wird hier gesetzt, nicht aus dem Aufrufer uebernommen — der
 * Dienstschluessel umgeht den RLS-Fence, also muss der Fence in den Code.
 */
export async function protokolliereSignaturAudit(
  dienst: SupabaseClient,
  orgId: string,
  eintrag: AuditEintrag,
): Promise<void> {
  const { error } = await dienst
    .from('signatur_audit_log')
    .insert({
      organization_id: orgId,
      dokument_id: eintrag.dokument_id || null,
      signatur_id: eintrag.signatur_id || null,
      aktion: eintrag.aktion,
      akteur_id: eintrag.akteur_id,
      akteur_name: eintrag.akteur_name || null,
      details: eintrag.details || null,
    })
  if (error) {
    throw new UserFacingError(
      'Der Nachweis zu diesem Vorgang konnte nicht geschrieben werden. '
      + 'Der Vorgang wurde deshalb nicht ausgeführt. Bitte später erneut versuchen.',
      503,
    )
  }
}

// ── Dokument ────────────────────────────────────────────────────

export async function listeDokumente(
  dienst: SupabaseClient,
  orgId: string,
  sichtbareTypen: readonly SignaturDokumentTyp[],
  filter: DokumentFilter = {},
): Promise<SignaturDokument[]> {
  if (sichtbareTypen.length === 0) return []

  let q = dienst
    .from('signatur_dokumente')
    .select('*')
    .eq('organization_id', orgId)
    .in('dokument_typ', sichtbareTypen as string[])
    .order('created_at', { ascending: false })

  if (filter.dokument_typ) q = q.eq('dokument_typ', filter.dokument_typ)
  if (filter.referenz_tabelle) q = q.eq('referenz_tabelle', filter.referenz_tabelle)
  if (filter.referenz_id) q = q.eq('referenz_id', filter.referenz_id)
  if (filter.erstellt_von) q = q.eq('erstellt_von', filter.erstellt_von)
  if (filter.limit) q = q.limit(filter.limit)
  if (filter.offset) q = q.range(filter.offset, filter.offset + (filter.limit || 50) - 1)

  const { data, error } = await q
  if (error) throw new Error(`Signaturdokumente laden: ${error.message}`)
  return (data ?? []) as SignaturDokument[]
}

export async function holeDokument(
  dienst: SupabaseClient,
  orgId: string,
  id: string,
  sichtbareTypen: readonly SignaturDokumentTyp[],
): Promise<SignaturDokument | null> {
  const { data, error } = await dienst
    .from('signatur_dokumente')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new Error(`Signaturdokument laden: ${error.message}`)
  if (!data) return null
  const dok = data as SignaturDokument
  // „gibt es nicht" und „gehoert zu einem Bereich, den Sie nicht sehen"
  // werden bewusst gleich beantwortet: die Unterscheidung waere selbst
  // schon eine Auskunft ueber fremde Bestaende.
  if (!sichtbareTypen.includes(dok.dokument_typ)) return null
  return dok
}

export async function erstelleDokument(
  dienst: SupabaseClient,
  orgId: string,
  userId: string,
  input: Record<string, unknown>,
  erlaubteTypen: readonly SignaturDokumentTyp[],
): Promise<SignaturDokument> {
  validiereDokumentInput(input)

  const typ = input.dokument_typ as SignaturDokumentTyp
  if (!erlaubteTypen.includes(typ)) {
    throw new UserFacingError(
      `Für Dokumente der Art „${typ}" fehlt Ihnen die Berechtigung.`,
      403,
    )
  }

  const inhaltSnapshot = (input.dokument_inhalt_snapshot as string) || null

  // Liegt der Inhalt vor, ist der Hash eine ABLEITUNG davon und keine
  // Angabe des Aufrufers mehr. Ein mitgeschickter, abweichender Hash ist
  // ein Fehler und keine zweite Meinung.
  let hash = input.dokument_hash_sha256 as string
  if (inhaltSnapshot) {
    const berechnet = berechneSHA256(inhaltSnapshot)
    if (hash && hash !== berechnet) {
      throw new UserFacingError(
        'Dokument-Hash stimmt nicht mit dem übergebenen Inhalt überein.',
        400,
      )
    }
    hash = berechnet
  }

  const row = {
    organization_id: orgId,
    dokument_typ: typ,
    titel: (input.titel as string).trim(),
    beschreibung: (input.beschreibung as string)?.trim() || null,
    referenz_tabelle: (input.referenz_tabelle as string) || null,
    referenz_id: (input.referenz_id as string) || null,
    dokument_hash_sha256: hash,
    dokument_inhalt_snapshot: inhaltSnapshot,
    erstellt_von: userId,
    version: 1,
  }

  const { data, error } = await dienst
    .from('signatur_dokumente')
    .insert(row)
    .select()
    .single()
  if (error) throw new Error(`Signaturdokument erstellen: ${error.message}`)

  const dokument = data as SignaturDokument

  // Fail-closed: ohne Nachweis kein Dokument. Die Zeile ist noch von
  // nichts referenziert, die Ruecknahme also sauber.
  try {
    await protokolliereSignaturAudit(dienst, orgId, {
      dokument_id: dokument.id,
      aktion: 'dokument_erstellt',
      akteur_id: userId,
      details: { dokument_typ: typ, titel: row.titel },
    })
  } catch (err) {
    await dienst.from('signatur_dokumente').delete().eq('id', dokument.id)
    throw err
  }

  return dokument
}

// ── Signatur ────────────────────────────────────────────────────

export async function listeSignaturen(
  dienst: SupabaseClient,
  orgId: string,
  sichtbareTypen: readonly SignaturDokumentTyp[],
  filter: SignaturFilter = {},
): Promise<Signatur[]> {
  if (sichtbareTypen.length === 0) return []

  // !inner + Filter auf der eingebetteten Spalte: eine Signatur ist nur
  // sichtbar, wenn ihr Dokument es ist. Die Signatur selbst traegt keinen
  // Typ, der Fachbereich haengt am Dokument.
  let q = dienst
    .from('signaturen')
    .select('*, signatur_dokumente!inner(dokument_typ)')
    .eq('organization_id', orgId)
    .in('signatur_dokumente.dokument_typ', sichtbareTypen as string[])
    .order('created_at', { ascending: false })

  if (filter.dokument_id) q = q.eq('dokument_id', filter.dokument_id)
  if (filter.signatar_id) q = q.eq('signatar_id', filter.signatar_id)
  if (filter.status) q = q.eq('status', filter.status)
  if (filter.methode) q = q.eq('methode', filter.methode)
  if (filter.limit) q = q.limit(filter.limit)
  if (filter.offset) q = q.range(filter.offset, filter.offset + (filter.limit || 50) - 1)

  const { data, error } = await q
  if (error) throw new Error(`Signaturen laden: ${error.message}`)
  return (data ?? []) as Signatur[]
}

/** Die eigenen Signaturen eines Signatars — unabhaengig von Fachbereichen. */
export async function listeEigeneSignaturen(
  dienst: SupabaseClient,
  orgId: string,
  signatarId: string,
  filter: Pick<SignaturFilter, 'status' | 'limit'> = {},
): Promise<Signatur[]> {
  let q = dienst
    .from('signaturen')
    .select('*')
    .eq('organization_id', orgId)
    .eq('signatar_id', signatarId)
    .order('created_at', { ascending: false })
  if (filter.status) q = q.eq('status', filter.status)
  q = q.limit(filter.limit ?? 100)

  const { data, error } = await q
  if (error) throw new Error(`Signaturen laden: ${error.message}`)
  return (data ?? []) as Signatur[]
}

export async function fordereSignaturAn(
  dienst: SupabaseClient,
  orgId: string,
  adminUserId: string,
  input: Record<string, unknown>,
  erlaubteTypen: readonly SignaturDokumentTyp[],
): Promise<Signatur> {
  validiereSignaturInput(input)

  // Mandantenschutz und Fachbereich: das Dokument muss zur aktiven
  // Organisation gehoeren UND von einer Art sein, die der Anfordernde
  // ueberhaupt anfassen darf.
  const { data: dokument, error: dokFehler } = await dienst
    .from('signatur_dokumente')
    .select('id, dokument_typ')
    .eq('id', input.dokument_id as string)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (dokFehler) throw new Error(`Signaturdokument laden: ${dokFehler.message}`)
  if (!dokument) {
    throw new UserFacingError('Dokument nicht gefunden.', 404)
  }
  if (!erlaubteTypen.includes(dokument.dokument_typ as SignaturDokumentTyp)) {
    throw new UserFacingError(
      `Für Dokumente der Art „${dokument.dokument_typ}" fehlt Ihnen die Berechtigung.`,
      403,
    )
  }

  // signatar_id zeigt per Fremdschluessel auf auth.users. Ein Tippfehler
  // ergab bisher 23503 und damit „Interner Serverfehler"; geprueft wird
  // gegen profiles, das dieselben Konten spiegelt.
  const signatarId = input.signatar_id as string
  const { data: signatarKonto, error: kontoFehler } = await dienst
    .from('profiles')
    .select('id')
    .eq('id', signatarId)
    .maybeSingle()
  if (kontoFehler) throw new Error(`Signatarkonto pruefen: ${kontoFehler.message}`)
  if (!signatarKonto) {
    throw new UserFacingError('Für die angegebene Benutzerkennung gibt es kein Konto.', 404)
  }

  const row = {
    organization_id: orgId,
    dokument_id: input.dokument_id,
    signatar_id: signatarId,
    signatar_name: (input.signatar_name as string).trim(),
    signatar_rolle: (input.signatar_rolle as string)?.trim() || null,
    status: 'offen' as SignaturStatus,
  }

  const { data, error } = await dienst
    .from('signaturen')
    .insert(row)
    .select()
    .single()
  if (error) throw new Error(`Signatur anfordern: ${error.message}`)

  const signatur = data as Signatur

  try {
    await protokolliereSignaturAudit(dienst, orgId, {
      dokument_id: input.dokument_id as string,
      signatur_id: signatur.id,
      aktion: 'signatur_angefordert',
      akteur_id: adminUserId,
      details: { signatar_name: row.signatar_name },
    })
  } catch (err) {
    await dienst.from('signaturen').delete().eq('id', signatur.id)
    throw err
  }

  return signatur
}

export interface SignaturEingabe {
  methode: SignaturMethode
  signatur_daten?: string
  ip_adresse?: string
  user_agent?: string
}

/**
 * Unterschrift leisten.
 *
 * Ablauf: Statuswechsel per Compare-and-Swap auf 'offen' BEANSPRUCHEN,
 * danach den Nachweis schreiben, und wenn der scheitert, den Wechsel
 * zuruecknehmen. Umgekehrt (erst Nachweis, dann Status) stuende bei
 * einem Fehlschlag ein Nachweis ohne Vorgang im Buch; ganz ohne CAS
 * konnten zwei gleichzeitige Entscheidungen beide durchkommen.
 */
export async function leisteSignatur(
  dienst: SupabaseClient,
  orgId: string,
  signaturId: string,
  signatarId: string,
  input: SignaturEingabe,
): Promise<Signatur> {
  validiereMethode(input.methode)

  if (input.signatur_daten && input.signatur_daten.length > MAX_BILD_BYTES) {
    throw new UserFacingError('Die Unterschrift ist zu groß.', 413)
  }

  const { data: vorher, error: ladeFehler } = await dienst
    .from('signaturen')
    .select('*, signatur_dokumente!inner(dokument_hash_sha256)')
    .eq('id', signaturId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (ladeFehler) throw new Error(`Signatur laden: ${ladeFehler.message}`)
  if (!vorher) throw new UserFacingError('Signatur nicht gefunden.', 404)
  if (vorher.signatar_id !== signatarId) {
    throw new UserFacingError('Nur der zugewiesene Signatar kann signieren.', 403)
  }
  if (vorher.status !== 'offen') {
    throw new UserFacingError(
      `Diese Signatur ist bereits entschieden (Status „${vorher.status}").`,
      409,
    )
  }

  const joinedDoc = vorher.signatur_dokumente as unknown as { dokument_hash_sha256: string } | null
  const dokumentHash = joinedDoc?.dokument_hash_sha256 ?? ''
  if (!dokumentHash) {
    throw new UserFacingError(
      'Zu diesem Dokument fehlt der Hash — die Signatur kann nicht berechnet werden.',
      409,
    )
  }

  const zeitstempel = new Date().toISOString()
  const signaturHash = berechneSignaturHash(dokumentHash, signatarId, zeitstempel)

  // Beanspruchen: nur wer 'offen' vorfindet, gewinnt.
  const { data, error } = await dienst
    .from('signaturen')
    .update({
      status: 'signiert' as SignaturStatus,
      methode: input.methode,
      signatur_hash_sha256: signaturHash,
      signatur_daten: input.signatur_daten || null,
      signiert_am: zeitstempel,
      ip_adresse: ersteIpAdresse(input.ip_adresse),
      user_agent: kuerzeUserAgent(input.user_agent),
      updated_at: zeitstempel,
    })
    .eq('id', signaturId)
    .eq('organization_id', orgId)
    .eq('signatar_id', signatarId)
    .eq('status', 'offen')
    .select()
    .maybeSingle()

  if (error) throw new Error(`Signatur leisten: ${error.message}`)
  if (!data) {
    throw new UserFacingError(
      'Diese Signatur wurde soeben anderweitig entschieden. Bitte neu laden.',
      409,
    )
  }

  try {
    await protokolliereSignaturAudit(dienst, orgId, {
      dokument_id: vorher.dokument_id,
      signatur_id: signaturId,
      aktion: 'signatur_geleistet',
      akteur_id: signatarId,
      details: { methode: input.methode, signatur_hash: signaturHash },
    })
  } catch (err) {
    await rolleSignaturZurueck(dienst, orgId, signaturId)
    throw err
  }

  return data as Signatur
}

export async function lehneSignaturAb(
  dienst: SupabaseClient,
  orgId: string,
  signaturId: string,
  signatarId: string,
  grund: string,
): Promise<Signatur> {
  if (!grund?.trim()) {
    throw new UserFacingError('Ablehnungsgrund ist ein Pflichtfeld.', 400)
  }

  const { data: vorher, error: ladeFehler } = await dienst
    .from('signaturen')
    .select('id, status, signatar_id, dokument_id')
    .eq('id', signaturId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (ladeFehler) throw new Error(`Signatur laden: ${ladeFehler.message}`)
  if (!vorher) throw new UserFacingError('Signatur nicht gefunden.', 404)
  if (vorher.signatar_id !== signatarId) {
    throw new UserFacingError('Nur der zugewiesene Signatar kann ablehnen.', 403)
  }
  if (vorher.status !== 'offen') {
    throw new UserFacingError(
      `Diese Signatur ist bereits entschieden (Status „${vorher.status}").`,
      409,
    )
  }

  const jetzt = new Date().toISOString()
  const { data, error } = await dienst
    .from('signaturen')
    .update({
      status: 'abgelehnt' as SignaturStatus,
      abgelehnt_am: jetzt,
      ablehnung_grund: grund.trim(),
      updated_at: jetzt,
    })
    .eq('id', signaturId)
    .eq('organization_id', orgId)
    .eq('signatar_id', signatarId)
    .eq('status', 'offen')
    .select()
    .maybeSingle()

  if (error) throw new Error(`Signatur ablehnen: ${error.message}`)
  if (!data) {
    throw new UserFacingError(
      'Diese Signatur wurde soeben anderweitig entschieden. Bitte neu laden.',
      409,
    )
  }

  try {
    await protokolliereSignaturAudit(dienst, orgId, {
      dokument_id: vorher.dokument_id,
      signatur_id: signaturId,
      aktion: 'signatur_abgelehnt',
      akteur_id: signatarId,
      details: { grund: grund.trim() },
    })
  } catch (err) {
    await rolleSignaturZurueck(dienst, orgId, signaturId)
    throw err
  }

  return data as Signatur
}

/**
 * Nimmt einen beanspruchten Statuswechsel zurueck.
 *
 * Laeuft ueber den Dienstschluessel, weil die Signatar-Policy
 * (signatar_eigene_update) `status = 'offen'` im USING traegt: der
 * Signatar kann seine eigene Zeile aus 'signiert' heraus NICHT mehr
 * anfassen. Ohne diesen Weg bliebe eine Unterschrift ohne Nachweis
 * stehen — genau der Zustand, den fail-closed verhindern soll.
 */
async function rolleSignaturZurueck(
  dienst: SupabaseClient,
  orgId: string,
  signaturId: string,
): Promise<void> {
  await dienst
    .from('signaturen')
    .update({
      status: 'offen' as SignaturStatus,
      methode: null,
      signatur_hash_sha256: null,
      signatur_daten: null,
      signiert_am: null,
      abgelehnt_am: null,
      ablehnung_grund: null,
      ip_adresse: null,
      user_agent: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', signaturId)
    .eq('organization_id', orgId)
}

// ── Verifikation ────────────────────────────────────────────────

export interface VerifikationsErgebnis {
  gueltig: boolean
  /** Passt der gespeicherte Signatur-Hash zu Dokument, Signatar, Zeit? */
  signaturHashStimmt: boolean
  /**
   * Passt der gespeicherte Inhalt noch zum Dokument-Hash?
   * `null` = kein Schnappschuss hinterlegt, also NICHT pruefbar.
   */
  dokumentUnveraendert: boolean | null
  details: Record<string, unknown>
}

/**
 * Prueft eine geleistete Unterschrift.
 *
 * ZWEI Pruefungen, nicht eine. Die zweite fehlte bis 2026-08-28
 * vollstaendig: `dokument_inhalt_snapshot` wurde geladen und nie
 * benutzt. Damit galt ein Dokument, dessen Inhalt nachtraeglich
 * geaendert und dessen Hash unveraendert gelassen wurde, als „gueltig" —
 * also genau der Fall, gegen den ein Hash-Nachweis schuetzen soll.
 *
 * Ohne Schnappschuss ist der Inhalt nicht pruefbar; das Ergebnis sagt
 * das ausdruecklich (`dokumentUnveraendert: null` plus Hinweis) und
 * behauptet keine Unversehrtheit, die es nicht belegen kann.
 */
export async function verifiziereSignatur(
  dienst: SupabaseClient,
  orgId: string,
  signaturId: string,
  akteurId: string,
): Promise<VerifikationsErgebnis> {
  const { data: sig, error } = await dienst
    .from('signaturen')
    .select('*, signatur_dokumente!inner(dokument_hash_sha256, dokument_inhalt_snapshot)')
    .eq('id', signaturId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (error) throw new Error(`Signatur laden: ${error.message}`)
  if (!sig) throw new UserFacingError('Signatur nicht gefunden.', 404)

  if (sig.status !== 'signiert') {
    return {
      gueltig: false,
      signaturHashStimmt: false,
      dokumentUnveraendert: null,
      details: { grund: `Status ist „${sig.status}", nicht „signiert".` },
    }
  }

  const dok = sig.signatur_dokumente as unknown as {
    dokument_hash_sha256: string
    dokument_inhalt_snapshot?: string | null
  } | null

  const dokumentHash = dok?.dokument_hash_sha256 || ''
  const erwarteterHash = berechneSignaturHash(dokumentHash, sig.signatar_id, sig.signiert_am!)
  const signaturHashStimmt = sig.signatur_hash_sha256 === erwarteterHash

  const snapshot = dok?.dokument_inhalt_snapshot
  const dokumentUnveraendert =
    typeof snapshot === 'string' && snapshot.length > 0
      ? verifiziereDokumentHash(snapshot, dokumentHash)
      : null

  const gueltig = signaturHashStimmt && dokumentUnveraendert !== false

  const aktion: AuditAktionTyp = gueltig ? 'hash_verifiziert' : 'hash_ungueltig'
  await protokolliereSignaturAudit(dienst, orgId, {
    dokument_id: sig.dokument_id,
    signatur_id: signaturId,
    aktion,
    akteur_id: akteurId,
    details: {
      signatur_hash_stimmt: signaturHashStimmt,
      dokument_unveraendert: dokumentUnveraendert,
      erwarteter_hash: erwarteterHash,
      vorhandener_hash: sig.signatur_hash_sha256,
    },
  })

  return {
    gueltig,
    signaturHashStimmt,
    dokumentUnveraendert,
    details: {
      signatar: sig.signatar_name,
      signiert_am: sig.signiert_am,
      methode: sig.methode,
      hash_match: signaturHashStimmt,
      hinweis:
        dokumentUnveraendert === null
          ? 'Zu diesem Dokument ist kein Inhalts-Schnappschuss hinterlegt — geprüft wurde nur die Signatur, nicht der Dokumentinhalt.'
          : dokumentUnveraendert
            ? null
            : 'Der hinterlegte Dokumentinhalt passt nicht mehr zu seinem Hash — das Dokument wurde nach der Unterschrift verändert.',
    },
  }
}

// ── Nachweis lesen ──────────────────────────────────────────────

export async function listeSignaturAuditLog(
  dienst: SupabaseClient,
  orgId: string,
  filter: SignaturAuditFilter = {},
): Promise<SignaturAuditLog[]> {
  let q = dienst
    .from('signatur_audit_log')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (filter.dokument_id) q = q.eq('dokument_id', filter.dokument_id)
  if (filter.signatur_id) q = q.eq('signatur_id', filter.signatur_id)
  if (filter.aktion) q = q.eq('aktion', filter.aktion)
  if (filter.akteur_id) q = q.eq('akteur_id', filter.akteur_id)
  if (filter.limit) q = q.limit(filter.limit)
  if (filter.offset) q = q.range(filter.offset, filter.offset + (filter.limit || 50) - 1)

  const { data, error } = await q
  if (error) throw new Error(`Signatur-Audit laden: ${error.message}`)
  return (data ?? []) as SignaturAuditLog[]
}

// ── QES-Hook (externes Interface) ───────────────────────────────

export interface QesSignaturAnfrage {
  dokument_hash: string
  signatar_name: string
  signatar_email?: string
  callback_url: string
}

export interface QesSignaturAntwort {
  provider_signatur_id: string
  status: 'pending' | 'completed' | 'failed'
  signatur_hash?: string
  zeitstempel?: string
}

export async function sendeQesAnfrage(
  _hookConfig: { endpoint_url: string; api_key_ref: string },
  _anfrage: QesSignaturAnfrage,
): Promise<QesSignaturAntwort> {
  throw new UserFacingError(
    'QES ist als externe Integration vorbereitet, aber noch nicht angebunden.',
    501,
  )
}
