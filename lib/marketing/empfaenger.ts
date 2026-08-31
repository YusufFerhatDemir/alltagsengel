// ═══════════════════════════════════════════════════════════════════════════
// EMPFAENGER LADEN — aus sechs Tabellen wird eine Adressliste
//
// Dieses Modul ist die EINZIGE Stelle, die das Schema kennt. Die
// Segmentregeln (segmente.ts) und die Einwilligungspruefung
// (einwilligung.ts) arbeiten nur auf `MarketingKontakt`. Ein Schemawechsel
// trifft deshalb genau diese Datei.
//
// ── DER MANDANTENZAUN IST HIER EIN SONDERFALL ──────────────────────────────
// `profiles` hat KEINE organization_id. Das ist kein Versehen, sondern der
// Stand des Schemas (siehe die Guards, die daran schon einmal still 403
// gaben). Fuer den Verteiler heisst das: aus profiles abgeleitete Kontakte
// lassen sich nicht nach Mandant trennen.
//
// Die Antwort darauf ist fail-closed, nicht fail-open: profile-basierte
// Kontakte werden AUSSCHLIESSLICH fuer die Stamm-Organisation geladen. Ein
// anderer Mandant bekommt aus profiles NICHTS — lieber ein leeres Segment
// als die Adressliste eines fremden Mandanten. Wuerde man stattdessen alle
// profiles fuer jeden Mandanten ausliefern, waere das genau der
// Cross-Tenant-Leak, der in der Pflege-Schicht schon einmal behoben werden
// musste.
//
// `caregivers`, `newsletter_subscribers` und `mis_applicants` TRAGEN eine
// organization_id und werden ueber sie gefiltert.
//
// ── WAS HIER FEHLT UND WARUM ───────────────────────────────────────────────
// `lead_inquiries` (34 Zeilen am 30.08.2026) hat KEINE E-Mail-Spalte —
// nur name, phone, plz, message. Anfragen ueber das Lead-Formular sind
// damit per E-Mail NICHT erreichbar. Das Segment 'lead' fuellt sich
// deshalb ausschliesslich aus `newsletter_subscribers`. Wer Leads per Mail
// erreichen will, braucht zuerst eine Adressspalte samt Einwilligung am
// Formular — beides ist eine Aenderung am Perimeter und keine des
// Marketings.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
import { normalisiereAdresse } from './einwilligung'
import type { KontaktRolle, MarketingKontakt } from './typen'

/** Ein leerer Kontakt mit allen Pflichtfeldern — Grundlage jeder Zeile. */
function leererKontakt(): MarketingKontakt {
  return {
    userId: null,
    email: '',
    anzeigename: '',
    rolle: 'abonnent',
    plz: null,
    bundesland: null,
    istTestkonto: false,
    istGeloescht: false,
    istDipaNutzer: false,
    registrierungVollstaendig: false,
    registriertAm: null,
    letzteAktivitaet: null,
    letzteBuchung: null,
    anzahlBuchungen: 0,
    verfuegbarkeitsFenster: 0,
    qualifiziert: false,
    einsatzfreigabe: false,
    fuehrungszeugnisGueltigBis: null,
    vertragsstatus: null,
    ausgetretenAm: null,
  }
}

function name(vorname: unknown, nachname: unknown): string {
  return [vorname, nachname].filter(Boolean).join(' ').trim()
}

/** Das juengere von zwei ISO-Daten. null-tolerant. */
function juenger(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return Date.parse(a) >= Date.parse(b) ? a : b
}

interface ProfilZeile {
  id: string
  role: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  postal_code: string | null
  created_at: string | null
  deleted_at: string | null
  is_test: boolean | null
  onboarding_completed: boolean | null
}

/**
 * Laedt alle Marketingkontakte des Mandanten.
 *
 * WIRFT bei jedem Abfragefehler. Eine halb geladene Empfaengerliste ist
 * schlimmer als gar keine: der Trockenlauf zeigte dann eine zu kleine Zahl,
 * und die Kampagne ginge trotzdem an alle, die beim Versand geladen werden.
 * Deshalb gibt es hier keinen stillen Rueckfall auf eine Teilmenge.
 */
export async function ladeMarketingKontakte(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<MarketingKontakt[]> {
  const nachAdresse = new Map<string, MarketingKontakt>()
  const nachUserId = new Map<string, MarketingKontakt>()

  const aufnehmen = (kontakt: MarketingKontakt): void => {
    const adresse = normalisiereAdresse(kontakt.email)
    if (!adresse) return
    const vorhanden = nachAdresse.get(adresse)
    if (vorhanden) {
      // Dieselbe Adresse aus zwei Quellen. Die Rolle mit der spezifischeren
      // Aussage gewinnt: 'abonnent' ist der schwaechste Befund.
      if (vorhanden.rolle === 'abonnent' && kontakt.rolle !== 'abonnent') {
        nachAdresse.set(adresse, { ...kontakt, email: adresse })
        if (kontakt.userId) nachUserId.set(kontakt.userId, nachAdresse.get(adresse)!)
      }
      return
    }
    const eintrag = { ...kontakt, email: adresse }
    nachAdresse.set(adresse, eintrag)
    if (eintrag.userId) nachUserId.set(eintrag.userId, eintrag)
  }

  // ── 1) Konten (profiles) ─────────────────────────────────────────────
  // Nur fuer die Stamm-Organisation; Begruendung im Modulkopf.
  if (organizationId === DEFAULT_ORG_ID) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select(
        'id, role, first_name, last_name, email, postal_code, created_at, deleted_at, is_test, onboarding_completed',
      )
      .in('role', ['kunde', 'engel'])

    if (error) throw new Error(`Konten nicht lesbar: ${error.message}`)

    for (const p of (profile ?? []) as ProfilZeile[]) {
      const rolle: KontaktRolle = p.role === 'engel' ? 'engel' : 'kunde'
      aufnehmen({
        ...leererKontakt(),
        userId: p.id,
        email: p.email ?? '',
        anzeigename: name(p.first_name, p.last_name),
        rolle,
        plz: p.postal_code,
        istTestkonto: p.is_test === true,
        istGeloescht: p.deleted_at != null,
        registrierungVollstaendig: p.onboarding_completed === true,
        registriertAm: p.created_at,
        letzteAktivitaet: p.created_at,
      })
    }

    // ── 2) Engel-Merkmale (angels + angel_availability) ────────────────
    const engelIds = [...nachUserId.values()].filter((k) => k.rolle === 'engel').map((k) => k.userId!)
    if (engelIds.length > 0) {
      const { data: angels, error: angelFehler } = await supabase
        .from('angels')
        .select('id, is_certified, qualification')
        .in('id', engelIds)
      if (angelFehler) throw new Error(`Engel-Profile nicht lesbar: ${angelFehler.message}`)

      for (const a of angels ?? []) {
        const k = nachUserId.get(a.id as string)
        if (!k) continue
        // Qualifiziert heisst: zertifiziert ODER eine Qualifikation
        // hinterlegt. Live steht is_certified durchweg auf false, waehrend
        // qualification belegt ist — nur auf is_certified zu pruefen
        // ergaebe ein leeres Segment.
        k.qualifiziert =
          a.is_certified === true || (typeof a.qualification === 'string' && a.qualification.trim() !== '')
      }

      const { data: fenster, error: fensterFehler } = await supabase
        .from('angel_availability')
        .select('angel_id')
        .in('angel_id', engelIds)
      if (fensterFehler) throw new Error(`Verfügbarkeiten nicht lesbar: ${fensterFehler.message}`)

      for (const f of fenster ?? []) {
        const k = nachUserId.get(f.angel_id as string)
        if (k) k.verfuegbarkeitsFenster += 1
      }
    }

    // ── 3) Buchungen als Aktivitaetsspur ───────────────────────────────
    const { data: buchungen, error: buchungFehler } = await supabase
      .from('bookings')
      .select('customer_id, angel_id, date, created_at')
      .eq('organization_id', organizationId)
    if (buchungFehler) throw new Error(`Buchungen nicht lesbar: ${buchungFehler.message}`)

    for (const b of buchungen ?? []) {
      const zeitpunkt = (b.date as string | null) ?? (b.created_at as string | null)
      for (const id of [b.customer_id as string | null, b.angel_id as string | null]) {
        if (!id) continue
        const k = nachUserId.get(id)
        if (!k) continue
        k.anzahlBuchungen += 1
        k.letzteBuchung = juenger(k.letzteBuchung, zeitpunkt)
        k.letzteAktivitaet = juenger(k.letzteAktivitaet, zeitpunkt)
      }
    }
  }

  // ── 4) Mitarbeiterakten (caregivers) — traegt organization_id ────────
  const { data: caregivers, error: cgFehler } = await supabase
    .from('caregivers')
    .select('user_id, email, first_name, last_name, zip_code, bundesland, einsatzfreigabe, fuehrungszeugnis_gueltig_bis, status, vertragsstatus, austrittsdatum, created_at')
    .eq('organization_id', organizationId)
  if (cgFehler) throw new Error(`Mitarbeiterakten nicht lesbar: ${cgFehler.message}`)

  for (const c of caregivers ?? []) {
    const adresse = normalisiereAdresse(c.email as string | null)
    if (!adresse) continue
    const vorhanden = nachAdresse.get(adresse)
    if (vorhanden) {
      // Die Akte ergaenzt das Konto — sie ersetzt es nicht.
      vorhanden.einsatzfreigabe = c.einsatzfreigabe === true
      vorhanden.fuehrungszeugnisGueltigBis = (c.fuehrungszeugnis_gueltig_bis as string | null) ?? null
      vorhanden.plz = vorhanden.plz ?? ((c.zip_code as string | null) ?? null)
      vorhanden.bundesland = vorhanden.bundesland ?? ((c.bundesland as string | null) ?? null)
      // Der Beschaeftigungsstand kommt AUSSCHLIESSLICH aus der Akte — das
      // Konto (profiles) kennt ihn nicht. Er muss deshalb auch auf dem
      // zusammengefuehrten Kontakt landen, sonst faellt genau der Fall
      // durch, der hier gemeint ist: ausgeschiedene Person MIT Konto.
      vorhanden.vertragsstatus = (c.vertragsstatus as string | null) ?? null
      vorhanden.ausgetretenAm = (c.austrittsdatum as string | null) ?? null
      continue
    }
    aufnehmen({
      ...leererKontakt(),
      userId: (c.user_id as string | null) ?? null,
      email: adresse,
      anzeigename: name(c.first_name, c.last_name),
      rolle: 'engel',
      plz: (c.zip_code as string | null) ?? null,
      bundesland: (c.bundesland as string | null) ?? null,
      registrierungVollstaendig: c.status === 'active',
      registriertAm: (c.created_at as string | null) ?? null,
      letzteAktivitaet: (c.created_at as string | null) ?? null,
      einsatzfreigabe: c.einsatzfreigabe === true,
      fuehrungszeugnisGueltigBis: (c.fuehrungszeugnis_gueltig_bis as string | null) ?? null,
      vertragsstatus: (c.vertragsstatus as string | null) ?? null,
      ausgetretenAm: (c.austrittsdatum as string | null) ?? null,
    })
  }

  // ── 5) Newsletter-Anmeldungen ────────────────────────────────────────
  const { data: abos, error: aboFehler } = await supabase
    .from('newsletter_subscribers')
    .select('email, subscribed_at, active')
    .eq('organization_id', organizationId)
    .eq('active', true)
  if (aboFehler) throw new Error(`Newsletter-Verteiler nicht lesbar: ${aboFehler.message}`)

  for (const a of abos ?? []) {
    aufnehmen({
      ...leererKontakt(),
      email: (a.email as string | null) ?? '',
      anzeigename: '',
      rolle: 'abonnent',
      registrierungVollstaendig: true,
      registriertAm: (a.subscribed_at as string | null) ?? null,
      letzteAktivitaet: (a.subscribed_at as string | null) ?? null,
    })
  }

  // ── 6) Bewerbungen ───────────────────────────────────────────────────
  const { data: bewerber, error: bewerberFehler } = await supabase
    .from('mis_applicants')
    .select('email, first_name, last_name, status, applied_at, created_at')
    .eq('organization_id', organizationId)
  if (bewerberFehler) throw new Error(`Bewerbungen nicht lesbar: ${bewerberFehler.message}`)

  for (const b of bewerber ?? []) {
    aufnehmen({
      ...leererKontakt(),
      email: (b.email as string | null) ?? '',
      anzeigename: name(b.first_name, b.last_name),
      rolle: 'bewerber',
      registrierungVollstaendig: true,
      registriertAm: (b.applied_at as string | null) ?? (b.created_at as string | null) ?? null,
      letzteAktivitaet: (b.applied_at as string | null) ?? (b.created_at as string | null) ?? null,
    })
  }

  // ── DiPA-Riegel, ganz am Schluss ─────────────────────────────────────
  //
  // WARUM ZUM SCHLUSS UND NICHT IN DER profiles-ABFRAGE
  // Ein Coach-Nutzer kann ueber MEHRERE Quellen in die Liste kommen: als
  // Kundenkonto, als Engel, als Newsletter-Abonnent mit derselben
  // Adresse. Ein Filter in nur einer der Abfragen liesse die anderen
  // Wege offen. Hier wird die fertige Liste markiert, und zwar sowohl
  // ueber die Konto-Kennung als auch ueber die Adresse.
  //
  // FAIL-CLOSED: ist coach_users nicht lesbar, WIRFT die Funktion. Eine
  // leere Menge hiesse „niemand nutzt den PflegeCoach" — und genau dann
  // ginge Werbung an die Gruppe, die keine bekommen darf (DiPAV §6
  // Abs. 4). Dieselbe Begruendung wie bei der Einwilligungslage.
  const alle = [...nachAdresse.values()]
  const { data: coachZeilen, error: coachFehler } = await supabase
    .from('coach_users')
    .select('user_id')

  if (coachFehler) {
    throw new Error(
      'PflegeCoach-Nutzende nicht ermittelbar — Versand wird abgebrochen. '
      + 'Ohne diese Liste liesse sich die Werbefreiheit der DiPA (DiPAV §6 Abs. 4) '
      + `nicht einhalten: ${coachFehler.message}`,
    )
  }

  const coachIds = new Set(
    (coachZeilen ?? []).map((z) => String((z as { user_id: unknown }).user_id)).filter(Boolean),
  )

  if (coachIds.size > 0) {
    // Adressen der Coach-Konten mitnehmen: eine Newsletter-Anmeldung
    // traegt keine Konto-Kennung, wohl aber dieselbe Adresse.
    const coachAdressen = new Set(
      alle.filter((k) => k.userId && coachIds.has(k.userId))
        .map((k) => normalisiereAdresse(k.email))
        .filter(Boolean),
    )
    for (const k of alle) {
      if ((k.userId && coachIds.has(k.userId)) || coachAdressen.has(normalisiereAdresse(k.email))) {
        k.istDipaNutzer = true
      }
    }
  }

  return alle
}

/**
 * Adressen, die diese Kampagne bereits erhalten haben.
 *
 * WIRFT bei Abfragefehler — aus demselben Grund wie oben: eine leere Menge
 * bei unlesbarem Protokoll hiesse „hat noch niemand bekommen" und wuerde
 * einen Doppelversand auf den UNIQUE-Index auflaufen lassen, mitten im Lauf.
 */
export async function ladeBereitsErhalten(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('email_campaign_logs')
    .select('empfaenger')
    .eq('campaign_id', campaignId)

  if (error) throw new Error(`Zustellspur nicht lesbar: ${error.message}`)
  return new Set((data ?? []).map((z) => normalisiereAdresse(z.empfaenger as string)))
}
