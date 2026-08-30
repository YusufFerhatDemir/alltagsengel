// ═══════════════════════════════════════════════════════════════════════════
// EINWILLIGUNG UND SPERRLISTE — der Riegel vor jedem Werbeversand
//
// Dieses Modul beantwortet genau eine Frage: DARF diese Adresse diese
// Werbemail bekommen? Es beantwortet sie fuer eine Liste auf einmal, weil
// eine Kampagne nie eine einzelne Adresse betrifft und eine Pruefung je
// Empfaenger sonst hunderte Einzelabfragen waere.
//
// ── FAIL-CLOSED, UND ZWAR WOERTLICH ────────────────────────────────────────
// Faellt die Pruefung aus — Abfragefehler, fehlende Tabelle, Zeitueberlauf —
// ist das Ergebnis „darf nicht", nicht „darf". Der Unterschied ist der
// gesamte Zweck des Moduls. Eine leere Einwilligungstabelle sieht in einer
// fehlertoleranten Umsetzung genauso aus wie eine unerreichbare, und im
// zweiten Fall gingen Mails an Menschen, die widersprochen haben.
//
// Deshalb WIRFT `pruefeEmpfaenger` bei einem Abfragefehler. Es gibt keinen
// Rueckfallwert. Wer diese Funktion aufruft, muss den Fehler nach oben
// geben — nicht abfangen und mit einer Teilmenge weitermachen.
//
// ── WARUM DIE SPERRLISTE VOR DER EINWILLIGUNG GEPRUEFT WIRD ────────────────
// Beides zusammen kann vorkommen: jemand willigt ein, meldet sich ab,
// willigt spaeter ueber ein anderes Formular erneut ein. Die Abmeldung ist
// ein Widerspruch nach Art. 21 DSGVO und wiegt schwerer als eine spaetere
// Einwilligung, deren Zustandekommen niemand mehr nachvollziehen kann. Wer
// wieder Post bekommen will, wird von der Sperrliste genommen — das ist
// eine bewusste Handlung und keine Nebenwirkung eines Formulars.
//
// ── ABGRENZUNG ─────────────────────────────────────────────────────────────
// Transaktionspost laeuft hier NICHT durch. Eine Rechnung, die wegen einer
// Newsletter-Abmeldung nicht zugestellt wird, waere ein Fehler. Siehe
// lib/marketing/typen.ts, Kopf.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AusschlussGrund,
  ConsentQuelle,
  ConsentTyp,
  EmpfaengerPruefung,
  MarketingKontakt,
  Sperrgrund,
} from './typen'

/**
 * Adressnormalisierung.
 *
 * Dieselbe Regel wie in lib/newsletter/abmelde-token.ts — und aus demselben
 * Grund: `Max@Example.COM` und `max@example.com` sind dieselbe Person, aber
 * zwei verschiedene Schluessel. Die UNIQUE-Indizes auf marketing_consents
 * und email_suppression_list stehen auf der kleingeschriebenen Form, und
 * die CHECKs dort weisen alles andere ab.
 */
export function normalisiereAdresse(email: string | null | undefined): string {
  return String(email ?? '').trim().toLowerCase()
}

/** Grobe Formpruefung. Ersetzt keine Zustellpruefung, faengt nur Unsinn ab. */
export function istPlausibleAdresse(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

// ───────────────────────────────────────────────────────────────────────────
// Lesen
// ───────────────────────────────────────────────────────────────────────────

export interface EinwilligungsLage {
  /** Adressen mit gueltiger, nicht widerrufener Einwilligung dieser Art. */
  eingewilligt: Set<string>
  /** Adressen, deren Einwilligung dieser Art widerrufen wurde. */
  widerrufen: Set<string>
  /** Adressen auf der Sperrliste, unabhaengig vom Grund. */
  gesperrt: Set<string>
}

/**
 * Holt Einwilligungs- und Sperrlage fuer eine Adressliste.
 *
 * WIRFT bei jedem Abfragefehler. Siehe Modulkopf.
 *
 * Die Abfrage geht in Blöcken über `.in()`, weil eine URL-Länge begrenzt
 * ist und PostgREST einen zu langen Filter mit 414 abweist — was im Code
 * wie „keine Treffer" ausgesehen hätte.
 */
export async function ladeEinwilligungsLage(
  supabase: SupabaseClient,
  organizationId: string,
  adressen: readonly string[],
  consentTyp: ConsentTyp,
): Promise<EinwilligungsLage> {
  const eingewilligt = new Set<string>()
  const widerrufen = new Set<string>()
  const gesperrt = new Set<string>()

  const eindeutig = [...new Set(adressen.map(normalisiereAdresse).filter(Boolean))]
  if (eindeutig.length === 0) return { eingewilligt, widerrufen, gesperrt }

  const BLOCK = 200
  for (let i = 0; i < eindeutig.length; i += BLOCK) {
    const block = eindeutig.slice(i, i + BLOCK)

    const { data: consents, error: consentFehler } = await supabase
      .from('marketing_consents')
      .select('email, revoked_at')
      .eq('organization_id', organizationId)
      .eq('consent_type', consentTyp)
      .in('email', block)

    if (consentFehler) {
      throw new Error(
        `Einwilligungen nicht lesbar — Versand wird abgebrochen: ${consentFehler.message}`,
      )
    }

    for (const zeile of consents ?? []) {
      const adresse = normalisiereAdresse(zeile.email as string)
      if (zeile.revoked_at) widerrufen.add(adresse)
      else eingewilligt.add(adresse)
    }

    const { data: sperren, error: sperrFehler } = await supabase
      .from('email_suppression_list')
      .select('email')
      .eq('organization_id', organizationId)
      .in('email', block)

    if (sperrFehler) {
      throw new Error(
        `Sperrliste nicht lesbar — Versand wird abgebrochen: ${sperrFehler.message}`,
      )
    }

    for (const zeile of sperren ?? []) gesperrt.add(normalisiereAdresse(zeile.email as string))
  }

  // Eine widerrufene Einwilligung schlaegt eine erteilte. Der UNIQUE-Index
  // marketing_consents_offen_je_adresse laesst zwar keine zwei OFFENEN
  // Zeilen zu, wohl aber eine offene neben einer widerrufenen — genau der
  // Fall „erneut eingewilligt". Hier gilt trotzdem der Widerruf; wer wieder
  // Post will, wird bewusst freigegeben.
  for (const adresse of widerrufen) eingewilligt.delete(adresse)

  return { eingewilligt, widerrufen, gesperrt }
}

// ───────────────────────────────────────────────────────────────────────────
// Prüfen
// ───────────────────────────────────────────────────────────────────────────

/**
 * Entscheidet je Kontakt, ob er die Kampagne bekommen darf.
 *
 * Reihenfolge der Gruende ist nicht beliebig: sie geht vom Harten zum
 * Weichen, damit die Aufschluesselung im Trockenlauf den TATSAECHLICHEN
 * Hinderungsgrund nennt. Ein gesperrter Testkontakt ohne Einwilligung
 * erscheint als „Testkonto", weil das der Grund ist, der sich nicht
 * aendern laesst.
 *
 * `bereitsErhalten` sind die Adressen, die zu dieser Kampagne schon einen
 * Eintrag in email_campaign_logs haben. Ohne diese Pruefung waere ein
 * abgebrochener und wieder aufgenommener Versand ein Doppelversand — der
 * UNIQUE-Index auf (campaign_id, empfaenger) faengt ihn zwar ab, aber erst
 * als Fehler mitten im Lauf.
 */
export function pruefeEmpfaenger(
  kontakte: readonly MarketingKontakt[],
  lage: EinwilligungsLage,
  bereitsErhalten: ReadonlySet<string> = new Set(),
): EmpfaengerPruefung[] {
  return kontakte.map((kontakt): EmpfaengerPruefung => {
    const adresse = normalisiereAdresse(kontakt.email)
    const nein = (grund: AusschlussGrund): EmpfaengerPruefung => ({
      versandfaehig: false,
      kontakt,
      grund,
    })

    if (kontakt.istTestkonto) return nein('testkonto')
    if (kontakt.istGeloescht) return nein('konto_geloescht')
    if (!adresse || !istPlausibleAdresse(adresse)) return nein('keine_adresse')
    if (lage.gesperrt.has(adresse)) return nein('gesperrt')
    if (lage.widerrufen.has(adresse)) return nein('einwilligung_widerrufen')
    if (!lage.eingewilligt.has(adresse)) return nein('keine_einwilligung')
    if (bereitsErhalten.has(adresse)) return nein('bereits_erhalten')

    return { versandfaehig: true, kontakt: { ...kontakt, email: adresse } }
  })
}

// ───────────────────────────────────────────────────────────────────────────
// Schreiben
// ───────────────────────────────────────────────────────────────────────────

export interface EinwilligungAnlegen {
  organizationId: string
  email: string
  consentTyp: ConsentTyp
  quelle: ConsentQuelle
  userId?: string | null
  ipAdresse?: string | null
  textVersion?: string
  notiz?: string | null
}

/**
 * Traegt eine Einwilligung ein.
 *
 * Prueft VORHER die Sperrliste: eine Adresse, die widersprochen hat, kann
 * nicht durch ein Formular wieder in den Verteiler geraten. Wer wieder Post
 * bekommen will, wird zuerst von der Sperrliste genommen — bewusst, durch
 * einen Menschen.
 */
export async function erteileEinwilligung(
  supabase: SupabaseClient,
  eingabe: EinwilligungAnlegen,
): Promise<{ ok: true; id: string } | { ok: false; grund: string }> {
  const email = normalisiereAdresse(eingabe.email)
  if (!istPlausibleAdresse(email)) return { ok: false, grund: 'Unbrauchbare E-Mail-Adresse.' }

  const { data: sperre, error: sperrFehler } = await supabase
    .from('email_suppression_list')
    .select('id, reason')
    .eq('organization_id', eingabe.organizationId)
    .eq('email', email)
    .maybeSingle()

  // Fail-closed: eine unlesbare Sperrliste ist kein Freibrief.
  if (sperrFehler) {
    return { ok: false, grund: 'Sperrliste nicht prüfbar — Einwilligung nicht eingetragen.' }
  }
  if (sperre) {
    return {
      ok: false,
      grund:
        'Diese Adresse steht auf der Sperrliste. Sie muss dort zuerst bewusst entfernt werden, ' +
        'bevor wieder eine Einwilligung eingetragen werden kann.',
    }
  }

  const { data, error } = await supabase
    .from('marketing_consents')
    .upsert(
      {
        organization_id: eingabe.organizationId,
        user_id: eingabe.userId ?? null,
        email,
        consent_type: eingabe.consentTyp,
        source: eingabe.quelle,
        ip_address: eingabe.ipAdresse ?? null,
        text_version: eingabe.textVersion ?? 'v1',
        notiz: eingabe.notiz ?? null,
        granted_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: 'organization_id,email,consent_type', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, grund: error.message }
  // Kein Treffer heisst: die Einwilligung stand schon offen (ignoreDuplicates).
  // Das ist Erfolg, kein Fehler — aber ohne neue id.
  return { ok: true, id: (data?.id as string) ?? '' }
}

/**
 * Widerruft eine Einwilligung UND setzt die Adresse auf die Sperrliste.
 *
 * Beides zusammen, weil ein Widerruf ohne Sperreintrag genau die Luecke
 * liesse, die Art. 21 Abs. 3 DSGVO schliesst: die naechste Anmeldung ueber
 * ein beliebiges Formular haette den Widerruf ueberschrieben.
 *
 * `.select()` an beiden Stellen ist der Wirkungsnachweis — ohne ihn meldet
 * PostgREST keinen Fehler, wenn NULL Zeilen getroffen wurden (dieselbe
 * Klasse wie beim Newsletter-Abmeldeweg, Track 13 B3).
 */
export async function widerrufeEinwilligung(
  supabase: SupabaseClient,
  organizationId: string,
  email: string,
  consentTyp: ConsentTyp | 'alle',
  grund: Sperrgrund = 'abmeldung',
): Promise<{ ok: true; widerrufen: number; gesperrt: boolean } | { ok: false; grund: string }> {
  const adresse = normalisiereAdresse(email)
  if (!adresse) return { ok: false, grund: 'Keine Adresse angegeben.' }

  let abfrage = supabase
    .from('marketing_consents')
    .update({ revoked_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('email', adresse)
    .is('revoked_at', null)

  if (consentTyp !== 'alle') abfrage = abfrage.eq('consent_type', consentTyp)

  const { data: widerrufen, error: widerrufFehler } = await abfrage.select('id')
  if (widerrufFehler) return { ok: false, grund: widerrufFehler.message }

  const { data: gesperrt, error: sperrFehler } = await supabase
    .from('email_suppression_list')
    .upsert(
      {
        organization_id: organizationId,
        email: adresse,
        reason: grund,
        added_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,email', ignoreDuplicates: true },
    )
    .select('id')

  if (sperrFehler) {
    // Der Widerruf steht, die Sperre nicht. Das ist der gefaehrlichere
    // Halbzustand: eine spaetere Anmeldung koennte den Widerruf aufheben.
    return {
      ok: false,
      grund:
        `Widerruf eingetragen (${widerrufen?.length ?? 0} Einwilligungen), aber die Sperrliste ` +
        `konnte nicht gesetzt werden: ${sperrFehler.message}`,
    }
  }

  return { ok: true, widerrufen: widerrufen?.length ?? 0, gesperrt: (gesperrt?.length ?? 0) > 0 }
}

/** Setzt eine Adresse auf die Sperrliste, ohne eine Einwilligung zu berühren. */
export async function sperreAdresse(
  supabase: SupabaseClient,
  organizationId: string,
  email: string,
  grund: Sperrgrund,
  gesetztVon?: string | null,
  notiz?: string | null,
): Promise<{ ok: true } | { ok: false; grund: string }> {
  const adresse = normalisiereAdresse(email)
  if (!adresse) return { ok: false, grund: 'Keine Adresse angegeben.' }

  const { error } = await supabase.from('email_suppression_list').upsert(
    {
      organization_id: organizationId,
      email: adresse,
      reason: grund,
      notiz: notiz ?? null,
      gesetzt_von: gesetztVon ?? null,
      added_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,email', ignoreDuplicates: true },
  )

  if (error) return { ok: false, grund: error.message }
  return { ok: true }
}
