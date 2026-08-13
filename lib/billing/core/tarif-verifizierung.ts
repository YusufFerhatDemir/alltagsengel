/**
 * Tarif-Verifizierung — gemeinsame Regeln fuer API, UI und Tests.
 *
 * Diese Datei enthaelt KEINE Datenbankzugriffe. Sie ist die eine Stelle, an
 * der steht, wann ein Tarif abrechenbar ist und was eine Freigabe verlangt —
 * damit die Admin-Oberflaeche nicht etwas anderes behauptet als die API
 * durchsetzt und die Datenbank am Ende erzwingt.
 *
 * Durchgesetzt wird die Regel an drei Stellen, absichtlich mehrfach:
 *  1. UI          — Formular gibt ohne Quelle/Beleg nicht frei (Bequemlichkeit)
 *  2. API-Route   — /api/billing/tariffs/[id]/verifizierung (Zugriffsschutz)
 *  3. Datenbank   — Trigger trg_verifizierung_belegpflicht (20260904000000)
 *                   greift auf JEDEM Schreibweg, auch bei direktem
 *                   PostgREST-UPDATE unter Umgehung der Route.
 *
 * Nur (3) ist nicht umgehbar. (1) und (2) existieren fuer verstaendliche
 * Fehlermeldungen, nicht als Sicherheitsgrenze.
 */

export const TARIF_STATUS = ['verified', 'unverified', 'blocked'] as const
export type TarifStatus = (typeof TARIF_STATUS)[number]

/** Mindestlaenge der Rechtsquelle. Identisch in DB-Trigger und API. */
export const QUELLE_MIN_LAENGE = 5

/** Erlaubte Belegformate. Identisch zu allowed_mime_types des Buckets. */
export const BELEG_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

/** 20 MB — identisch zu file_size_limit des Buckets tarif-belege. */
export const BELEG_MAX_BYTES = 20 * 1024 * 1024

export type QuellTabelle = 'billing_tariffs' | 'leistungspreise'

export function istTarifStatus(wert: unknown): wert is TarifStatus {
  return typeof wert === 'string' && (TARIF_STATUS as readonly string[]).includes(wert)
}

/**
 * Fehlender oder unbekannter Status gilt als 'unverified' — fail-closed.
 * Ein `null` in der Datenbank darf nie als Freigabe durchgehen.
 */
export function normalisiereStatus(wert: unknown): TarifStatus {
  return istTarifStatus(wert) ? wert : 'unverified'
}

/**
 * Ist die Zeile ein Privattarif? Nur billing_tariffs hat eine
 * rechtsgrundlage — leistungspreise speist ausschliesslich den Kassen- und
 * Monatsabschlussweg und gilt deshalb immer als Kassenpreis.
 */
export function istPrivattarif(zeile: {
  quellTabelle: QuellTabelle
  rechtsgrundlage?: string | null
}): boolean {
  if (zeile.quellTabelle !== 'billing_tariffs') return false
  return (zeile.rechtsgrundlage ?? '') === 'privat'
}

// ---------------------------------------------------------------------------
// Abrechenbarkeit
// ---------------------------------------------------------------------------

export interface AbrechenbarkeitEingabe {
  quellTabelle: QuellTabelle
  tarifStatus: unknown
  rechtsgrundlage?: string | null
}

export interface Abrechenbarkeit {
  abrechenbar: boolean
  /** Ein Satz, der in der Oberflaeche genau so stehen kann. */
  begruendung: string
}

/**
 * Beantwortet die Frage, die in der Tarifuebersicht ganz vorne stehen muss:
 * Kann mit dieser Zeile abgerechnet werden — ja oder nein?
 *
 * Die Regel ist dieselbe wie in resolvePrice(), create_invoice_draft_atomic()
 * (RPC v6) und isTarifFuerKorrekturVerwendbar():
 *   - 'blocked'                  → nie, auch privat nicht
 *   - Kassentarif/Leistungspreis → nur 'verified'
 *   - Privattarif                → alles ausser 'blocked'
 */
export function bewerteAbrechenbarkeit(eingabe: AbrechenbarkeitEingabe): Abrechenbarkeit {
  const status = normalisiereStatus(eingabe.tarifStatus)
  const privat = istPrivattarif(eingabe)

  if (status === 'blocked') {
    return {
      abrechenbar: false,
      begruendung: 'Gesperrt — wird von Rechnungserstellung und Monatsabschluss abgewiesen.',
    }
  }

  if (privat) {
    return {
      abrechenbar: true,
      begruendung:
        status === 'verified'
          ? 'Freigegeben. Privatpreise sind frei wählbar.'
          : 'Abrechenbar. Privatpreise sind frei wählbar und brauchen keine Kassenfreigabe.',
    }
  }

  if (status === 'verified') {
    return { abrechenbar: true, begruendung: 'Freigegeben für die Kassenabrechnung.' }
  }

  return {
    abrechenbar: false,
    begruendung:
      'Nicht verifiziert — Kassenabrechnung und Monatsabschluss liefern für diese Leistungsart keinen Betrag.',
  }
}

// ---------------------------------------------------------------------------
// Anforderungen an eine Statusaenderung
// ---------------------------------------------------------------------------

export interface FreigabeAnforderung {
  /** Rechtsquelle ist Pflicht (min. QUELLE_MIN_LAENGE Zeichen). */
  quelleErforderlich: boolean
  /** Primaerbeleg im privaten Bucket ist Pflicht. */
  belegErforderlich: boolean
  /** Erklaerung fuer die Oberflaeche. */
  hinweis: string
}

/**
 * Was verlangt der Ziel-Status?
 *
 * 'verified'   → Rechtsquelle immer, Beleg bei allem ausser Privattarifen.
 *                Fuer Privattarife existiert keine Primaerquelle, gegen die
 *                ein Beleg gehalten werden koennte — der Preis ist frei
 *                waehlbar. Die Rechtsquelle bleibt trotzdem Pflicht, damit
 *                dokumentiert ist, worauf sich der Preis stuetzt.
 * 'blocked'    → Rechtsquelle als Sperrbegruendung, kein Beleg. Sperren ist
 *                die sichere Richtung und darf nie an einem fehlenden
 *                Dokument scheitern.
 * 'unverified' → nichts. Die Freigabe zurueckzunehmen muss immer gehen.
 */
export function anforderungFuerStatus(
  zielStatus: TarifStatus,
  zeile: { quellTabelle: QuellTabelle; rechtsgrundlage?: string | null }
): FreigabeAnforderung {
  if (zielStatus === 'verified') {
    if (istPrivattarif(zeile)) {
      return {
        quelleErforderlich: true,
        belegErforderlich: false,
        hinweis:
          'Privattarif: Rechtsquelle ist Pflicht (z. B. die eigene Preisliste mit Datum). ' +
          'Ein Primärbeleg ist nicht erforderlich, weil Privatpreise frei wählbar sind.',
      }
    }
    return {
      quelleErforderlich: true,
      belegErforderlich: true,
      hinweis:
        'Kassenrelevante Freigabe: Rechtsquelle UND hochgeladener Primärbeleg sind Pflicht ' +
        '(Vergütungsvereinbarung, Anerkennungsbescheid oder Rechtsverordnung).',
    }
  }

  if (zielStatus === 'blocked') {
    return {
      quelleErforderlich: true,
      belegErforderlich: false,
      hinweis: 'Sperrung: Begründung ist Pflicht. Ein Beleg ist nicht erforderlich.',
    }
  }

  return {
    quelleErforderlich: false,
    belegErforderlich: false,
    hinweis: 'Freigabe wird zurückgenommen. Die Leistungsart ist danach nicht mehr abrechenbar.',
  }
}

export interface StatusaenderungEingabe {
  zielStatus: unknown
  quelle?: string | null
  belegId?: string | null
  quellTabelle: QuellTabelle
  rechtsgrundlage?: string | null
}

export type Pruefergebnis =
  | { ok: true; zielStatus: TarifStatus; quelle: string; belegId: string | null }
  | { ok: false; fehler: string }

/**
 * Validiert eine gewuenschte Statusaenderung, bevor sie die Datenbank
 * erreicht. Gibt dieselben Fehler aus, die der DB-Trigger werfen wuerde —
 * nur frueher und in ganzen Saetzen.
 */
export function pruefeStatusaenderung(eingabe: StatusaenderungEingabe): Pruefergebnis {
  if (!istTarifStatus(eingabe.zielStatus)) {
    return {
      ok: false,
      fehler: `Ungültiger Status "${String(eingabe.zielStatus)}". Erlaubt: ${TARIF_STATUS.join(', ')}.`,
    }
  }

  const zielStatus = eingabe.zielStatus
  const anforderung = anforderungFuerStatus(zielStatus, eingabe)
  const quelle = (eingabe.quelle ?? '').trim()
  const belegId = eingabe.belegId?.trim() || null

  if (anforderung.quelleErforderlich && quelle.length < QUELLE_MIN_LAENGE) {
    return {
      ok: false,
      fehler:
        `Für "${zielStatus}" ist eine Rechtsquelle mit mindestens ${QUELLE_MIN_LAENGE} Zeichen ` +
        'verpflichtend (z. B. "Vergütungsvereinbarung AOK Hessen vom 01.03.2026").',
    }
  }

  if (anforderung.belegErforderlich && !belegId) {
    return {
      ok: false,
      fehler:
        'Für die Freigabe zur Kassenabrechnung muss ein Primärbeleg hochgeladen und ausgewählt sein. ' +
        'Eine Freigabe allein auf Zuruf ist nicht möglich.',
    }
  }

  // Ein Beleg an einer Nicht-Freigabe waere irrefuehrend: er suggeriert eine
  // Belegkette, die den Status gar nicht traegt.
  if (zielStatus !== 'verified' && belegId) {
    return {
      ok: false,
      fehler: `Ein Beleg kann nur mit dem Status "verified" verknüpft werden, nicht mit "${zielStatus}".`,
    }
  }

  return { ok: true, zielStatus, quelle, belegId }
}

// ---------------------------------------------------------------------------
// Beleg-Upload
// ---------------------------------------------------------------------------

export type BelegPruefung = { ok: true } | { ok: false; fehler: string }

/** Prueft Dateityp und Groesse vor dem Upload — identisch zu den Bucket-Limits. */
export function pruefeBelegDatei(datei: { type?: string | null; size?: number | null; name?: string | null }): BelegPruefung {
  const typ = (datei.type ?? '').toLowerCase()
  if (!(BELEG_MIME_TYPES as readonly string[]).includes(typ)) {
    return {
      ok: false,
      fehler: `Dateityp "${datei.type || 'unbekannt'}" ist nicht zulässig. Erlaubt: PDF, JPEG, PNG, WebP.`,
    }
  }
  const groesse = datei.size ?? 0
  if (groesse <= 0) {
    return { ok: false, fehler: 'Die Datei ist leer.' }
  }
  if (groesse > BELEG_MAX_BYTES) {
    return {
      ok: false,
      fehler: `Die Datei ist ${(groesse / 1024 / 1024).toFixed(1)} MB groß. Maximal zulässig sind 20 MB.`,
    }
  }
  return { ok: true }
}

/** Entschaerft einen Dateinamen fuer die Verwendung als Storage-Pfad. */
export function sanitizeBelegDateiname(name: string): string {
  return (
    name
      .replace(/[äÄ]/g, 'ae')
      .replace(/[öÖ]/g, 'oe')
      .replace(/[üÜ]/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 100) || 'beleg'
  )
}

// ---------------------------------------------------------------------------
// Kennzahlen fuer die Uebersicht
// ---------------------------------------------------------------------------

export interface TarifZeileMinimal {
  quellTabelle: QuellTabelle
  tarifStatus: unknown
  rechtsgrundlage?: string | null
  belegId?: string | null
}

export interface TarifKennzahlen {
  gesamt: number
  verified: number
  unverified: number
  blocked: number
  abrechenbar: number
  nichtAbrechenbar: number
  /** Freigegeben, kassenrelevant, aber ohne hinterlegten Beleg (Altbestand). */
  verifiziertOhneBeleg: number
}

export function berechneKennzahlen(zeilen: TarifZeileMinimal[]): TarifKennzahlen {
  const k: TarifKennzahlen = {
    gesamt: zeilen.length,
    verified: 0,
    unverified: 0,
    blocked: 0,
    abrechenbar: 0,
    nichtAbrechenbar: 0,
    verifiziertOhneBeleg: 0,
  }

  for (const z of zeilen) {
    const status = normalisiereStatus(z.tarifStatus)
    k[status] += 1

    if (bewerteAbrechenbarkeit(z).abrechenbar) k.abrechenbar += 1
    else k.nichtAbrechenbar += 1

    if (status === 'verified' && !istPrivattarif(z) && !z.belegId) {
      k.verifiziertOhneBeleg += 1
    }
  }

  return k
}
