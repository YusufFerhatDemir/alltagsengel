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

const log = logger.child('signatur-nachweis')

/** Nur diese Referenz löst eine Übernahme aus. */
export const NACHWEIS_TABELLE = 'service_records'

export interface UebernahmeEingabe {
  /** Aus `signatur_dokumente.referenz_tabelle`. */
  referenzTabelle: string | null | undefined
  /** Aus `signatur_dokumente.referenz_id`. */
  referenzId: string | null | undefined
  /** Zeitpunkt der Unterschrift (`signaturen.signiert_am`). */
  signiertAm: string
  /** Anzeigename des Signatars — landet in `client_signature`. */
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

  if (nachweis.proof_status === 'UNTERSCHRIEBEN' || nachweis.signature_hash != null) {
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
      client_signature: signatarName,
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
