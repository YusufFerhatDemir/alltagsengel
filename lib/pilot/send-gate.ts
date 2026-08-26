// ═══════════════════════════════════════════════════════════════════════════
// EINMAL-FREIGABE FÜR DEN ERSTEN ECHTEN RECHNUNGSVERSAND
//
// PROBLEM, DAS DIESE DATEI LÖST
// Bis hierhin hängt der Rechnungsversand an Bedingungen, die alle
// WIEDERHOLBAR sind: ein Statuswert, ein Preflight-Urteil, ein
// Umgebungsschalter. Jede davon gilt für beliebig viele Rechnungen und
// beliebig oft. Für den ERSTEN echten Versand — den einen, der zeigt, ob der
// Weg stimmt — braucht es das Gegenteil: eine Erlaubnis, die für GENAU EINE
// Rechnung gilt und sich nicht wiederholen lässt.
//
// ── DAS TOKEN ──────────────────────────────────────────────────────────────
// Eine Zeile in `pilot_send_gate` IST das Token; ihre `id` ist der Wert, den
// der Versandweg mitbringen muss. Die Zeile trägt Mandant, Rechnung,
// Empfänger und Betrag — der Versandweg gleicht jedes dieser Felder gegen
// das ab, was er tatsächlich zu senden im Begriff ist.
//
// ── WARUM DER AUFRUFER DEN PREFLIGHT-STATUS NICHT MITBRINGT ────────────────
// `erzeugeSendeToken()` nimmt KEIN Preflight-Ergebnis entgegen — es führt den
// Piloten selbst aus. Käme das Urteil von außen, wäre die stärkste Sperre des
// Systems ein Feld in einem Request-Body: eine Oberfläche, die
// `preflight_status: 'READY_FOR_SEND'` mitschickt, hätte sich die Freigabe
// selbst ausgestellt. Der Auftrag verlangt ausdrücklich das Gegenteil („keine
// UI-Manipulation allein kann Versand auslösen"), und das lässt sich nur so
// erreichen: der Server prüft, der Client fragt.
//
// ── DREI RIEGEL, ZWEI DAVON IN DER DATENBANK ───────────────────────────────
//   1. TypeScript hier: jedes Feld wird abgeglichen, ehe etwas rausgeht.
//   2. `pilot_send_gate_offen_je_rechnung` (UNIQUE, partiell): höchstens EIN
//      offenes Token je Rechnung.
//   3. `pilot_send_gate_einmal_verbraucht` (UNIQUE, partiell): höchstens EIN
//      verbrauchtes Token je Rechnung. Das ist die Doppelversand-Sperre, die
//      auch dann hält, wenn zwei Läufe gleichzeitig starten — der zweite
//      bekommt 23505 statt einer zweiten Erlaubnis.
//
// ── REIHENFOLGE: ERST VERBRAUCHEN, DANN SENDEN ─────────────────────────────
// `verbraucheSendeToken()` gehört VOR den Versand, nicht danach. Bricht der
// Lauf zwischen Verbrauch und Mail ab, ist das Token verbrannt und ein Mensch
// muss ein neues ausstellen — nach einer Sichtung, ob die Mail nun raus ist
// oder nicht. Andersherum (senden, dann verbrauchen) wäre ein Abbruch genau
// der Zustand, in dem ein Wiederholungslauf ein zweites Mal senden dürfte.
// Ein verbranntes Token kostet eine Minute; eine zweite Rechnung beim Kunden
// kostet Vertrauen.
//
// ── FAIL-CLOSED ────────────────────────────────────────────────────────────
// Jeder Lesefehler auf einer der beteiligten Tabellen führt zur Ablehnung.
// Eine Sperre, die man nicht lesen kann, gilt als gesetzt.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EnvQuelle } from '@/lib/env/pruefung'
import { pruefeRechnungFuerPilot, type RechnungPilotBericht } from './rechnung-pilot'
import { logger } from '@/lib/logger'

const log = logger.child('pilot-send-gate')

// ---------------------------------------------------------------------------
// Freigabe
// ---------------------------------------------------------------------------

/**
 * Die einkompilierte Grundstellung: der erste echte Rechnungsversand ist
 * NICHT freigegeben.
 *
 * Bewusst eine Konstante und kein Standardwert einer Funktion: sie zu ändern
 * heißt, einen Commit zu schreiben, der im Diff steht und durch die
 * Codeprüfung geht. Für den laufenden Betrieb — wenn die Freigabe ohne
 * Deployment umgelegt werden soll — gibt es die Umgebungsvariable unten.
 */
export const FIRST_REAL_INVOICE_APPROVED = false

/** Der Name der Umgebungsvariable, die dasselbe zur Laufzeit erlaubt. */
export const FREIGABE_ENV = 'PILOT_ERSTVERSAND_FREIGEGEBEN'

/**
 * Der einzige Wert, der freigibt. NICHT getrimmt — dieselbe Strenge wie bei
 * den Versand-Schaltern (`lib/config/versand-flags.ts`): ein Wert, bei dem
 * unklar ist, ob er absichtlich so aussieht, darf keine Post auslösen.
 */
export const FREIGABE_AN_WERT = '1'

export interface FreigabeStand {
  freigegeben: boolean
  herkunft: 'kompiliert' | 'umgebung' | 'keine'
  grund: string
}

/** Ist der Erstversand freigegeben? Rein, ohne Nebenwirkung. */
export function erstversandFreigabe(quelle: EnvQuelle = process.env): FreigabeStand {
  if (FIRST_REAL_INVOICE_APPROVED) {
    return {
      freigegeben: true,
      herkunft: 'kompiliert',
      grund: 'FIRST_REAL_INVOICE_APPROVED steht im Quelltext auf true.',
    }
  }
  const roh = quelle[FREIGABE_ENV]
  if (roh === FREIGABE_AN_WERT) {
    return {
      freigegeben: true,
      herkunft: 'umgebung',
      grund: `${FREIGABE_ENV}=${FREIGABE_AN_WERT} — der Erstversand ist zur Laufzeit freigegeben.`,
    }
  }
  return {
    freigegeben: false,
    herkunft: 'keine',
    grund:
      `Der erste echte Rechnungsversand ist nicht freigegeben (FIRST_REAL_INVOICE_APPROVED=false, `
      + `${FREIGABE_ENV}${typeof roh === 'string' && roh !== '' ? ' trägt einen anderen Wert als ' + FREIGABE_AN_WERT : ' nicht gesetzt'}).`,
  }
}

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export interface SendeToken {
  id: string
  organizationId: string
  invoiceId: string
  empfaenger: string
  betragCents: number
  preflightStatus: string
  erstelltVon: string
  erstelltAm: string
  gueltigBis: string
  verbrauchtAm: string | null
  entwertetAm: string | null
}

export type TokenAblehnung =
  | 'keine_freigabe'
  | 'kein_token'
  | 'token_ungueltiges_format'
  | 'token_unbekannt'
  | 'token_verbraucht'
  | 'token_entwertet'
  | 'token_abgelaufen'
  | 'rechnung_abweichend'
  | 'empfaenger_abweichend'
  | 'betrag_abweichend'
  | 'preflight_nicht_bereit'
  | 'bereits_versendet'
  | 'versandsperre'
  | 'quelle_unlesbar'

export type TokenPruefung =
  | { erlaubt: true; gate: SendeToken }
  | { erlaubt: false; code: TokenAblehnung; grund: string }

export interface TokenErzeugenParams {
  invoiceId: string
  organizationId: string
  actorId: string
  /**
   * Was der Freigebende auf dem Bildschirm gesehen hat.
   *
   * Optional, aber empfohlen: stimmt es nicht mit dem überein, was die
   * Datenbank sagt, hat der Freigebende einen veralteten Stand bestätigt.
   * Genau der Fall, in dem eine Freigabe wertlos ist — sie bezieht sich auf
   * etwas anderes als das, was passieren würde.
   */
  erwarteterEmpfaenger?: string
  erwarteterBetragCent?: number
  /** Standard 60 Minuten. Ein Token, das über Nacht liegt, ist kein Einzelvorgang mehr. */
  gueltigkeitMinuten?: number
  quelle?: EnvQuelle
  jetzt?: Date
}

export type TokenErzeugenErgebnis =
  | { ok: true; token: string; gueltigBis: string; bericht: RechnungPilotBericht }
  | { ok: false; code: TokenAblehnung | 'anlage_fehlgeschlagen'; grund: string; bericht?: RechnungPilotBericht }

export interface TokenPruefenParams {
  token: string | null | undefined
  invoiceId: string
  organizationId: string
  /** Was der Versandweg tatsächlich zu senden im Begriff ist. */
  empfaenger: string
  betragCents: number
  quelle?: EnvQuelle
  jetzt?: Date
}

export const STANDARD_GUELTIGKEIT_MINUTEN = 60

const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

function ausZeile(z: Record<string, unknown>): SendeToken {
  return {
    id: String(z.id),
    organizationId: String(z.organization_id),
    invoiceId: String(z.invoice_id),
    empfaenger: String(z.empfaenger),
    betragCents: Number(z.betrag_cents),
    preflightStatus: String(z.preflight_status),
    erstelltVon: String(z.erstellt_von),
    erstelltAm: String(z.erstellt_am),
    gueltigBis: String(z.gueltig_bis),
    verbrauchtAm: z.verbraucht_am ? String(z.verbraucht_am) : null,
    entwertetAm: z.entwertet_am ? String(z.entwertet_am) : null,
  }
}

/**
 * E-Mail-Vergleich: Groß-/Kleinschreibung und Randleerraum zählen nicht.
 *
 * Der lokale Teil einer Adresse ist nach RFC formal unterscheidungsfähig,
 * praktisch aber bei keinem gängigen Anbieter. Ein Token wegen `Max@…` gegen
 * `max@…` abzulehnen wäre eine Sperre ohne Schutzwirkung.
 */
function gleicheAdresse(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// Ausstellen
// ---------------------------------------------------------------------------

/**
 * Stellt eine Einmal-Freigabe für genau eine Rechnung aus.
 *
 * Führt den Piloten selbst aus; nur `READY_FOR_SEND` bekommt ein Token.
 * Schreibt genau eine Zeile und sonst nichts.
 */
export async function erzeugeSendeToken(
  admin: SupabaseClient,
  params: TokenErzeugenParams,
): Promise<TokenErzeugenErgebnis> {
  const {
    invoiceId, organizationId, actorId,
    erwarteterEmpfaenger, erwarteterBetragCent,
    gueltigkeitMinuten = STANDARD_GUELTIGKEIT_MINUTEN,
    quelle = process.env,
    jetzt,
  } = params

  const freigabe = erstversandFreigabe(quelle)
  if (!freigabe.freigegeben) {
    return { ok: false, code: 'keine_freigabe', grund: freigabe.grund }
  }

  const bericht = await pruefeRechnungFuerPilot(admin, { invoiceId, organizationId, jetzt })

  if (bericht.urteil !== 'READY_FOR_SEND') {
    return {
      ok: false,
      code: bericht.pilotBefunde.some(b => b.art === 'versandsperre') ? 'versandsperre' : 'preflight_nicht_bereit',
      grund:
        `Der Pilot urteilt ${bericht.urteil} statt READY_FOR_SEND. `
        + `${bericht.blocker.length > 0 ? `Blocker: ${bericht.blocker.join(' | ')}` : ''}`
        + `${bericht.zuPruefen.length > 0 ? ` Zur Sichtung: ${bericht.zuPruefen.join(' | ')}` : ''}`,
      bericht,
    }
  }

  if (!bericht.empfaenger) {
    // Kann der Preflight eigentlich nicht durchlassen (Punkt 3). Trotzdem
    // geprüft: das Token bindet an den Empfänger, und `null` bindet an nichts.
    return { ok: false, code: 'empfaenger_abweichend', grund: 'Der Rechnung ist keine Empfängeradresse zugeordnet.', bericht }
  }

  if (erwarteterEmpfaenger !== undefined && !gleicheAdresse(erwarteterEmpfaenger, bericht.empfaenger)) {
    return {
      ok: false,
      code: 'empfaenger_abweichend',
      grund:
        'Der bestätigte Empfänger stimmt nicht mit dem hinterlegten überein. '
        + 'Die Freigabe bezöge sich damit auf einen anderen Vorgang als den, der stattfände.',
      bericht,
    }
  }

  if (erwarteterBetragCent !== undefined && erwarteterBetragCent !== bericht.betragCent) {
    return {
      ok: false,
      code: 'betrag_abweichend',
      grund:
        `Der bestätigte Betrag (${erwarteterBetragCent} Cent) weicht vom Rechnungsbetrag `
        + `(${bericht.betragCent} Cent) ab. Der Bildschirm zeigte einen anderen Stand als die Datenbank.`,
      bericht,
    }
  }

  const basis = jetzt ?? new Date()
  const gueltigBis = new Date(basis.getTime() + gueltigkeitMinuten * 60_000).toISOString()

  const { data, error } = await admin
    .from('pilot_send_gate')
    .insert({
      organization_id: organizationId,
      invoice_id: invoiceId,
      empfaenger: bericht.empfaenger,
      betrag_cents: bericht.betragCent,
      preflight_status: 'READY_FOR_SEND',
      erstellt_von: actorId,
      erstellt_am: basis.toISOString(),
      gueltig_bis: gueltigBis,
    })
    .select('id, gueltig_bis')
    .maybeSingle()

  if (error || !data) {
    // 23505 heißt hier: es gibt bereits ein offenes oder ein verbrauchtes
    // Token für diese Rechnung. Beides ist kein technischer Fehler, sondern
    // die Sperre bei der Arbeit — und die Meldung muss das sagen, sonst
    // sucht jemand eine Stunde nach einem Datenbankproblem.
    const doppelt = (error as { code?: string } | null)?.code === '23505'
    return {
      ok: false,
      code: doppelt ? 'bereits_versendet' : 'anlage_fehlgeschlagen',
      grund: doppelt
        ? 'Für diese Rechnung existiert bereits eine Freigabe — entweder eine offene oder eine verbrauchte. '
          + 'Eine zweite kann es nicht geben (UNIQUE-Teilindizes auf pilot_send_gate).'
        : `Die Freigabe konnte nicht angelegt werden: ${error?.message ?? 'kein Datensatz zurückgegeben'}`,
      bericht,
    }
  }

  log.info('Einmal-Freigabe für Rechnungsversand ausgestellt', {
    invoiceId, organizationId, gueltigBis: String(data.gueltig_bis),
  })

  return { ok: true, token: String(data.id), gueltigBis: String(data.gueltig_bis), bericht }
}

// ---------------------------------------------------------------------------
// Prüfen
// ---------------------------------------------------------------------------

/**
 * Darf mit diesem Token diese Rechnung an diesen Empfänger über diesen Betrag
 * versendet werden?
 *
 * Schreibt nichts — der Verbrauch ist ein eigener Schritt
 * (`verbraucheSendeToken`), damit zwischen Prüfung und Verbrauch nichts
 * anderes passieren kann als der Versand selbst.
 */
export async function pruefeSendeToken(
  admin: SupabaseClient,
  params: TokenPruefenParams,
): Promise<TokenPruefung> {
  const { token, invoiceId, organizationId, empfaenger, betragCents, quelle = process.env, jetzt } = params

  const freigabe = erstversandFreigabe(quelle)
  if (!freigabe.freigegeben) {
    return { erlaubt: false, code: 'keine_freigabe', grund: freigabe.grund }
  }

  if (!token || token.trim() === '') {
    return { erlaubt: false, code: 'kein_token', grund: 'Es wurde keine Einmal-Freigabe mitgegeben.' }
  }
  if (!UUID_MUSTER.test(token.trim())) {
    // Vor der Abfrage: PostgREST beantwortet eine kaputte UUID mit 22P02,
    // und ein Formatfehler soll nicht wie ein Datenbankproblem aussehen.
    return { erlaubt: false, code: 'token_ungueltiges_format', grund: 'Die mitgegebene Freigabe ist keine gültige Kennung.' }
  }

  // Mandant im WHERE, nicht im Vergleich danach: eine fremde Freigabe soll
  // sich nicht einmal als „existiert, gehört aber woanders hin" zu erkennen
  // geben. Ein Token eines anderen Mandanten ist hier schlicht unbekannt.
  const { data, error } = await admin
    .from('pilot_send_gate')
    .select('id, organization_id, invoice_id, empfaenger, betrag_cents, preflight_status, erstellt_von, erstellt_am, gueltig_bis, verbraucht_am, entwertet_am')
    .eq('id', token.trim())
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    return { erlaubt: false, code: 'quelle_unlesbar', grund: `Die Freigabe ist nicht lesbar: ${error.message}` }
  }
  if (!data) {
    return { erlaubt: false, code: 'token_unbekannt', grund: 'Die mitgegebene Freigabe existiert nicht.' }
  }

  const gate = ausZeile(data as Record<string, unknown>)

  if (gate.entwertetAm) {
    return { erlaubt: false, code: 'token_entwertet', grund: `Die Freigabe wurde am ${gate.entwertetAm.slice(0, 10)} entwertet.` }
  }
  if (gate.verbrauchtAm) {
    return { erlaubt: false, code: 'token_verbraucht', grund: `Die Freigabe wurde am ${gate.verbrauchtAm.slice(0, 10)} bereits verbraucht. Sie gilt genau einmal.` }
  }
  if (new Date(gate.gueltigBis).getTime() <= (jetzt ?? new Date()).getTime()) {
    return { erlaubt: false, code: 'token_abgelaufen', grund: `Die Freigabe ist seit ${gate.gueltigBis} abgelaufen.` }
  }
  if (gate.preflightStatus !== 'READY_FOR_SEND') {
    return { erlaubt: false, code: 'preflight_nicht_bereit', grund: `Die Freigabe trägt den Preflight-Stand „${gate.preflightStatus}" statt READY_FOR_SEND.` }
  }

  // ── Die vier Bindungen ──
  if (gate.invoiceId !== invoiceId) {
    return {
      erlaubt: false,
      code: 'rechnung_abweichend',
      grund: 'Die Freigabe wurde für eine andere Rechnung ausgestellt. Sie gilt nur für die, auf die sie lautet.',
    }
  }
  if (!gleicheAdresse(gate.empfaenger, empfaenger)) {
    return {
      erlaubt: false,
      code: 'empfaenger_abweichend',
      grund: 'Der Empfänger hat sich seit der Freigabe geändert. Die Freigabe bezog sich auf eine andere Adresse.',
    }
  }
  if (gate.betragCents !== betragCents) {
    return {
      erlaubt: false,
      code: 'betrag_abweichend',
      grund: `Der Betrag hat sich seit der Freigabe geändert (${gate.betragCents} → ${betragCents} Cent).`,
    }
  }

  // ── Zustand, der sich seit der Ausstellung geändert haben kann ──
  const nachtraeglich = await pruefeNachtraeglicheSperren(admin, invoiceId, organizationId)
  if (nachtraeglich) return nachtraeglich

  return { erlaubt: true, gate }
}

/**
 * Was zwischen Ausstellung und Verwendung passiert sein kann.
 *
 * Ohne diesen Schritt wäre das Token eine Freigabe für einen Zustand von
 * vorhin. Genau die Lücke, die ein Dashboard hat, das seine Zählung als
 * Erlaubnis weiterreicht.
 */
async function pruefeNachtraeglicheSperren(
  admin: SupabaseClient,
  invoiceId: string,
  organizationId: string,
): Promise<TokenPruefung | null> {
  try {
    const { count, error } = await admin
      .from('invoice_email_log')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', invoiceId)
      .eq('organization_id', organizationId)
      .eq('status', 'versendet')

    if (error) {
      return { erlaubt: false, code: 'quelle_unlesbar', grund: `Das Versandprotokoll ist nicht lesbar: ${error.message}` }
    }
    if ((count ?? 0) > 0) {
      return { erlaubt: false, code: 'bereits_versendet', grund: 'Im Versandprotokoll steht bereits ein erfolgreicher Versand dieses Belegs.' }
    }
  } catch (err) {
    return { erlaubt: false, code: 'quelle_unlesbar', grund: `Das Versandprotokoll löste eine Ausnahme aus: ${(err as Error).message}` }
  }

  try {
    const { data, error } = await admin
      .from('pilot_versand_sperre')
      .select('id, grund, invoice_id')
      .eq('organization_id', organizationId)
      .is('aufgehoben_am', null)

    if (error) {
      return { erlaubt: false, code: 'quelle_unlesbar', grund: `Die Versandsperre ist nicht lesbar: ${error.message}` }
    }
    const zeilen = (data ?? []) as { grund: string; invoice_id: string | null }[]
    const einschlaegig = zeilen.filter(z => z.invoice_id === null || z.invoice_id === invoiceId)
    if (einschlaegig.length > 0) {
      return {
        erlaubt: false,
        code: 'versandsperre',
        grund: `Es steht eine offene Versandsperre: ${einschlaegig.map(z => z.grund).join(' | ')}`,
      }
    }
  } catch (err) {
    return { erlaubt: false, code: 'quelle_unlesbar', grund: `Die Versandsperre löste eine Ausnahme aus: ${(err as Error).message}` }
  }

  return null
}

// ---------------------------------------------------------------------------
// Verbrauchen
// ---------------------------------------------------------------------------

export type TokenVerbrauch =
  | { ok: true; gate: SendeToken }
  | { ok: false; code: TokenAblehnung; grund: string }

/**
 * Entwertet das Token durch Verbrauch — und zwar so, dass zwei gleichzeitige
 * Läufe nicht beide durchkommen.
 *
 * Das `is('verbraucht_am', null)` im UPDATE ist der ganze Trick: die
 * Bedingung wird von Postgres beim Schreiben ausgewertet, nicht vorher von
 * uns beim Lesen. Wer verliert, bekommt null Zeilen zurück und weiß daran,
 * dass ein anderer schneller war. Ein „erst lesen, dann schreiben" hätte
 * genau hier ein Zeitfenster, und das Fenster wäre eine zweite Rechnung beim
 * Kunden.
 *
 * AUFRUFEN VOR DEM VERSAND, nicht danach — Begründung im Modulkopf.
 */
export async function verbraucheSendeToken(
  admin: SupabaseClient,
  params: { token: string; invoiceId: string; organizationId: string; actorId: string; jetzt?: Date },
): Promise<TokenVerbrauch> {
  const { token, invoiceId, organizationId, actorId, jetzt } = params

  if (!UUID_MUSTER.test(token.trim())) {
    return { ok: false, code: 'token_ungueltiges_format', grund: 'Die mitgegebene Freigabe ist keine gültige Kennung.' }
  }

  const { data, error } = await admin
    .from('pilot_send_gate')
    .update({ verbraucht_am: (jetzt ?? new Date()).toISOString(), verbraucht_von: actorId })
    .eq('id', token.trim())
    .eq('organization_id', organizationId)
    .eq('invoice_id', invoiceId)
    .is('verbraucht_am', null)
    .is('entwertet_am', null)
    .select('id, organization_id, invoice_id, empfaenger, betrag_cents, preflight_status, erstellt_von, erstellt_am, gueltig_bis, verbraucht_am, entwertet_am')

  if (error) {
    return { ok: false, code: 'quelle_unlesbar', grund: `Die Freigabe konnte nicht verbraucht werden: ${error.message}` }
  }

  const zeilen = (data ?? []) as Record<string, unknown>[]
  if (zeilen.length !== 1) {
    return {
      ok: false,
      code: 'token_verbraucht',
      grund:
        'Die Freigabe war zum Zeitpunkt des Verbrauchs nicht mehr offen — bereits verbraucht, entwertet, '
        + 'oder sie gehört nicht zu dieser Rechnung. Es wird nichts versendet.',
    }
  }

  log.info('Einmal-Freigabe verbraucht', { invoiceId, organizationId })
  return { ok: true, gate: ausZeile(zeilen[0]) }
}

/**
 * Entwertet ein offenes Token ohne Versand.
 *
 * Für den Abbruch („doch nicht heute") und für die Nachprüfung, die nach
 * einer Abweichung alles Offene einkassiert.
 */
export async function entwerteSendeToken(
  admin: SupabaseClient,
  params: { token: string; organizationId: string; grund: string; jetzt?: Date },
): Promise<{ ok: boolean; grund: string }> {
  const { token, organizationId, grund, jetzt } = params

  if (!UUID_MUSTER.test(token.trim())) {
    return { ok: false, grund: 'Die mitgegebene Freigabe ist keine gültige Kennung.' }
  }

  const { data, error } = await admin
    .from('pilot_send_gate')
    .update({ entwertet_am: (jetzt ?? new Date()).toISOString(), entwertungsgrund: grund })
    .eq('id', token.trim())
    .eq('organization_id', organizationId)
    .is('verbraucht_am', null)
    .is('entwertet_am', null)
    .select('id')

  if (error) return { ok: false, grund: `Die Freigabe konnte nicht entwertet werden: ${error.message}` }

  const zeilen = (data ?? []) as unknown[]
  return zeilen.length === 1
    ? { ok: true, grund: 'Freigabe entwertet.' }
    : { ok: false, grund: 'Es gab keine offene Freigabe mit dieser Kennung.' }
}

/**
 * Entwertet ALLE offenen Freigaben eines Mandanten.
 *
 * Wird von der Nachprüfung gerufen, wenn sie eine Abweichung gefunden hat:
 * eine Freigabe, die vor dem Befund ausgestellt wurde, bezieht sich auf einen
 * Zustand, den es nicht mehr gibt.
 */
export async function entwerteAlleOffenenTokens(
  admin: SupabaseClient,
  params: { organizationId: string; grund: string; jetzt?: Date },
): Promise<number | null> {
  const { organizationId, grund, jetzt } = params
  try {
    const { data, error } = await admin
      .from('pilot_send_gate')
      .update({ entwertet_am: (jetzt ?? new Date()).toISOString(), entwertungsgrund: grund })
      .eq('organization_id', organizationId)
      .is('verbraucht_am', null)
      .is('entwertet_am', null)
      .select('id')

    if (error) {
      log.warn('Offene Freigaben konnten nicht entwertet werden', { organizationId, errorMessage: error.message })
      return null
    }
    return ((data ?? []) as unknown[]).length
  } catch (err) {
    log.errorWithException('Entwertung offener Freigaben scheiterte', err, { organizationId })
    return null
  }
}
