/**
 * Eine geleistete Unterschrift erreicht den Leistungsnachweis.
 *
 * ── DAS FEHLENDE GLIED ────────────────────────────────────────────────
 * `signatur_dokumente` trägt seit jeher `referenz_tabelle` und
 * `referenz_id`. Beide werden gespeichert und lassen sich filtern — aber
 * **niemand wertet sie aus**. Eine Kundin konnte einen
 * Leistungsnachweis unterschreiben, und der Nachweis selbst blieb
 * unberührt: `proof_status='ENTWURF'`, kein Hash.
 *
 * Die Folge steht in `npm run verify:sammelrechnung`, Prüfpunkt S13c: am
 * 14.09.2026 lagen dreizehn Nachweise aus vier Monaten auf
 * `status='signed'` ohne jeden Beleg. Der Sammelrechnungslauf überspringt
 * genau die mit `UNTERSCHRIFT_FEHLT` — die Leistung ist erbracht, eine
 * Rechnung entsteht nicht.
 *
 * ── WARUM BEIDE FELDER ZUSAMMEN ───────────────────────────────────────
 * `compute_signature_hash` (Trigger, Migration 20260814010000) rechnet den
 * Hash nur, wenn `proof_status='UNTERSCHRIEBEN'` UND `client_signed_at`
 * gesetzt sind. Fehlt der Zeitstempel, entsteht ein halber Zustand: der
 * Nachweis gilt als unterschrieben, trägt aber keinen Hash und wird nicht
 * gesperrt.
 *
 * Deshalb geht beides in EINEM Update hinaus. Danach erledigen die
 * Trigger den Rest: der Hash entsteht, `is_locked` wird gesetzt, und
 * `sync_service_record_status` zieht `status` auf `signed`.
 *
 * ── WAS DIESE DATEI NICHT TUT ─────────────────────────────────────────
 * Sie rührt **keine Altbestände** an. Sie läuft ausschließlich, wenn
 * gerade jemand unterschrieben hat. Die dreizehn Nachweise von oben
 * bleiben, wie sie sind — ob sie angeglichen werden, ist eine fachliche
 * Entscheidung und steht hier nicht zur Debatte.
 *
 * Und sie wirft nicht: die Unterschrift IST zu diesem Zeitpunkt geleistet
 * und protokolliert. Scheitert die Übernahme, wäre es falsch, sie
 * rückgängig zu machen — der Fehlschlag gehört gemeldet, damit jemand
 * nachträgt.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { zaehltAlsUnterschrieben } from '@/lib/leistungsnachweis/status-sync'

const log = logger.child('signatur-nachweis')

/** Nur diese Referenz löst eine Übernahme aus. */
export const NACHWEIS_TABELLE = 'service_records'

/**
 * Erlaubte Werte von `service_records.client_signer_role`.
 *
 * Live per CHECK erzwungen (service_records_client_signer_role_check).
 * Als Konstante, damit niemand das Vokabular der Native-Route
 * ('client' | 'caregiver') versehentlich durchreicht — die Datenbank
 * weist es ab, und der Schreibvorgang scheitert dann VOLLSTAENDIG.
 */
export const SIGNER_ROLLEN = ['KUNDE', 'ANGEHOERIGER', 'VERTRETER'] as const
export type SignerRolle = (typeof SIGNER_ROLLEN)[number]
export const SIGNER_ROLE_KUNDE: SignerRolle = 'KUNDE'

export interface UebernahmeEingabe {
  /** Aus `signatur_dokumente.referenz_tabelle`. */
  referenzTabelle: string | null | undefined
  /** Aus `signatur_dokumente.referenz_id`. */
  referenzId: string | null | undefined
  /** Zeitpunkt der Unterschrift (`signaturen.signiert_am`). */
  signiertAm: string
  /**
   * Anzeigename des Signatars — landet in `client_signer_name`.
   *
   * BEFUND (14.09.2026, Block 36): der Name wurde in `client_signature`
   * geschrieben. Das ist das Feld fuer das UNTERSCHRIFTSBILD; die
   * Admin-Detailansicht rendert es als `<img src={client_signature}>`.
   * Ein Klarname darin ergibt ein kaputtes Bild — und die daneben
   * vorhandenen Spalten `client_signer_name`/`client_signer_role`, die
   * dieselbe Ansicht bereits ausgibt, blieben leer.
   *
   * Das Bild selbst liegt bei diesem Weg in
   * `service_signatures.signature_image`; der Nachweis braucht es nicht,
   * um abrechenbar zu sein — dafuer sorgen `signature_hash` und
   * `client_signed_at`, die der Trigger aus dem Update unten bildet.
   */
  signatarName: string
  organizationId: string
}

export type UebernahmeErgebnis =
  /** Kein Bezug auf einen Leistungsnachweis — nichts zu tun. */
  | { art: 'kein_nachweis' }
  /** Der Nachweis trug den Beleg schon. */
  | { art: 'bereits_belegt' }
  /** Der Nachweis ist gesperrt; die Sperre lässt keine Änderung zu. */
  | { art: 'gesperrt' }
  /** Übernommen. */
  | { art: 'uebernommen'; nachweisId: string }
  /** Nicht übernommen — mit Grund. */
  | { art: 'fehlgeschlagen'; grund: string }

/**
 * Schreibt den Unterschriftsbeleg in den Leistungsnachweis.
 *
 * Idempotent: ein Nachweis, der schon auf `UNTERSCHRIEBEN` steht, wird
 * nicht erneut angefasst — sonst liefe der Hash-Trigger ein zweites Mal
 * mit einem neuen Zeitstempel und änderte den Beleg.
 */
export async function uebernimmSignaturInNachweis(
  dienst: SupabaseClient,
  eingabe: UebernahmeEingabe,
): Promise<UebernahmeErgebnis> {
  const { referenzTabelle, referenzId, signiertAm, signatarName, organizationId } = eingabe

  if (referenzTabelle !== NACHWEIS_TABELLE || !referenzId) {
    return { art: 'kein_nachweis' }
  }

  const { data: nachweis, error: leseFehler } = await dienst
    .from('service_records')
    .select('id, proof_status, signature_hash, is_locked')
    .eq('id', referenzId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (leseFehler) {
    return { art: 'fehlgeschlagen', grund: `Nachweis nicht lesbar: ${leseFehler.message}` }
  }
  if (!nachweis) {
    // Mandantenfremd oder gelöscht. Kein Grund zu werfen, aber auch keiner,
    // stillzuschweigen: die Unterschrift zeigt dann ins Leere.
    return { art: 'fehlgeschlagen', grund: `Leistungsnachweis ${referenzId} nicht gefunden.` }
  }

  if (zaehltAlsUnterschrieben(nachweis)) {
    return { art: 'bereits_belegt' }
  }

  // Auf einer gesperrten Zeile lässt `prevent_locked_record_change` nur
  // `proof_status='STORNIERT'` durch. Der Versuch würde mit P0001
  // scheitern — das vorher zu wissen ist ehrlicher als ein Fehlschlag.
  if (nachweis.is_locked) {
    return { art: 'gesperrt' }
  }

  // Beide Felder in EINEM Update: nur zusammen rechnet der Trigger den
  // Hash. `.eq('proof_status', …)` ist die Vergleichsbedingung gegen den
  // gelesenen Stand — zwischen Lesen und Schreiben kann jemand anders
  // unterschrieben haben.
  const abfrage = dienst
    .from('service_records')
    .update({
      proof_status: 'UNTERSCHRIEBEN',
      client_signed_at: signiertAm,
      // `client_signature` traegt hier den KLARNAMEN, nicht ein Bild — und
      // das ist Absicht, keine Nachlaessigkeit:
      //
      // Der Trigger `enforce_unterschrift_beleg` laesst
      // `proof_status='UNTERSCHRIEBEN'` nur durch, wenn ein Beleg
      // vorliegt — ENTWEDER `client_signature` zusammen mit
      // `client_signed_at`, ODER eine Zeile in `service_signatures` mit
      // `signer_role='client'`. Der Signaturdienst
      // (lib/signaturen/signaturen.ts) legt seine Unterschrift in
      // `signaturen`/`signatur_dokumente` ab, NICHT in
      // `service_signatures`. Fuer ihn ist dieses Feld der einzige Beleg,
      // den der Trigger akzeptiert.
      //
      // Beim Bau von Block 36 habe ich es versuchsweise entfernt: die
      // gesamte Kette riss, der Trigger wies jedes Update ab. Das Feld
      // bleibt.
      //
      // Der eigentliche Befund lag deshalb nicht hier, sondern in der
      // ANZEIGE: `app/admin/leistungsnachweis-digital` rendert das Feld
      // als `<img src={…}>`, und ein Klarname darin ergibt ein kaputtes
      // Bild. Behoben ist das dort (siehe `istBilddaten`).
      client_signature: signatarName,
      // Zusaetzlich in die dafuer vorgesehenen Spalten — die Admin-Ansicht
      // gibt beide bereits aus, sie blieben bisher nur leer.
      client_signer_name: signatarName,
      // 'KUNDE', nicht 'client'. Die Spalte traegt einen CHECK mit
      // DEUTSCHEM Vokabular:
      //
      //   service_records_client_signer_role_check
      //     client_signer_role IS NULL
      //     OR client_signer_role = ANY (ARRAY['KUNDE','ANGEHOERIGER','VERTRETER'])
      //
      // Die Native-Route fuehrt daneben ihr eigenes Vokabular
      // ('client' | 'caregiver'). Wer es ungeprueft durchreicht, laesst
      // das GANZE Update am CHECK scheitern — und dann erreicht die
      // Unterschrift den Nachweis ueberhaupt nicht mehr. Genau das ist
      // beim Bau dieses Blocks passiert und von den Tests gefangen worden.
      //
      // Dieser Weg fuehrt ausschliesslich Kundenunterschriften: die
      // Native-Route ruft ihn nur bei `signer_role === 'client'`, und der
      // Signaturdienst nur fuer Dokumente am Leistungsnachweis. Die
      // Unterschrift der Pflegekraft belegt, dass der Einsatz
      // stattgefunden hat — nicht, dass der Kunde ihn bestaetigt.
      client_signer_role: SIGNER_ROLE_KUNDE,
    })
    .eq('id', referenzId)
    .eq('organization_id', organizationId)

  const { data: gestempelt, error: schreibFehler } = await (
    nachweis.proof_status == null
      ? abfrage.is('proof_status', null)
      : abfrage.eq('proof_status', nachweis.proof_status)
  ).select('id')

  if (schreibFehler) {
    return { art: 'fehlgeschlagen', grund: `Beleg nicht schreibbar: ${schreibFehler.message}` }
  }
  if (!gestempelt || gestempelt.length === 0) {
    return {
      art: 'fehlgeschlagen',
      grund: 'Der Nachweis hat sich zwischenzeitlich verändert — der Beleg wurde NICHT geschrieben.',
    }
  }

  return { art: 'uebernommen', nachweisId: referenzId }
}

/**
 * Wie oben, aber ohne Ausgang für den Aufrufer: protokolliert und gut.
 *
 * Die Unterschrift ist zu diesem Zeitpunkt geleistet und im Prüfpfad. Ein
 * Fehlschlag hier darf sie nicht zurücknehmen — er muss nur sichtbar sein,
 * damit jemand den Beleg nachträgt, bevor der Monatslauf den Nachweis mit
 * `UNTERSCHRIFT_FEHLT` übergeht.
 */
export async function uebernimmOderMelde(
  dienst: SupabaseClient,
  eingabe: UebernahmeEingabe,
): Promise<UebernahmeErgebnis> {
  let ergebnis: UebernahmeErgebnis
  try {
    ergebnis = await uebernimmSignaturInNachweis(dienst, eingabe)
  } catch (err) {
    ergebnis = {
      art: 'fehlgeschlagen',
      grund: err instanceof Error ? err.message : String(err),
    }
  }

  if (ergebnis.art === 'fehlgeschlagen') {
    log.error('Unterschrift erreicht den Leistungsnachweis NICHT — er bleibt unabrechenbar', {
      nachweisId: eingabe.referenzId,
      organizationId: eingabe.organizationId,
      grund: ergebnis.grund,
    })
  } else if (ergebnis.art === 'gesperrt') {
    log.warn('Leistungsnachweis ist gesperrt — Beleg nicht nachgetragen', {
      nachweisId: eingabe.referenzId,
      organizationId: eingabe.organizationId,
    })
  }

  return ergebnis
}
