// ═══════════════════════════════════════════════════════════════════════════
// AUTOMATIONEN — VORBEREITET, NICHT SCHARF
//
// ── DER STAND, DEN DIESE DATEI FESTHAELT ───────────────────────────────────
// Alle sechs Automationen sind definiert, in die Datenbank eintragbar und
// ueber die Oberflaeche sichtbar. KEINE von ihnen laeuft. Es gibt
// ausdruecklich KEINEN Cron-Eintrag, der sie ausloest, und
// `marketing_automations.aktiv` steht per DEFAULT auf false.
//
// Das ist kein unfertiger Zustand, sondern der bestellte: eine Automation
// verschickt Post OHNE dass ein Mensch im Moment des Versands beteiligt
// ist. Bevor das erlaubt wird, muss dreierlei belegt sein — und nichts
// davon ist es heute:
//
//   1. Es gibt Einwilligungen. `marketing_consents` steht live auf NULL
//      Zeilen. Eine Automation ohne Einwilligungen sendet an niemanden;
//      eine Automation, die spaeter mit Einwilligungen startet, sendet
//      dann an alle auf einmal — auch an die, deren Ereignis Monate
//      zurueckliegt.
//   2. Der Nachlauf ist begrenzt. Eine Automation „7 Tage nach
//      Registrierung" trifft beim ersten Lauf JEDE Registrierung, die je
//      stattgefunden hat. Ohne eine Grenze („nur Ereignisse ab dem Tag der
//      Scharfschaltung") waere der erste Lauf der groesste Versand der
//      Firmengeschichte.
//   3. Es gibt eine Zustellspur je Person und Automation, damit dieselbe
//      Mail nicht taeglich erneut rausgeht.
//
// Punkt 2 und 3 sind hier als Feld vorgesehen (`ereignisse_ab`,
// Protokollierung ueber email_campaign_logs), aber NICHT umgesetzt — es
// gibt keinen Ausloeser, der sie bräuchte. Wer die Automationen scharf
// schaltet, baut sie zuerst.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConsentTyp, TriggerTyp } from './typen'

export interface AutomationsVorlage {
  automationKey: string
  name: string
  beschreibung: string
  triggerTyp: TriggerTyp
  /** Nach wie vielen Tagen nach dem Ereignis die Mail ausgehen würde. */
  verzoegerungTage: number
  templateKey: string
  consentTyp: ConsentTyp
}

/**
 * Der Katalog. Reihenfolge = Anzeigereihenfolge.
 *
 * Jede Zeile ist eine Absicht, kein laufender Vorgang.
 */
export const AUTOMATIONEN: readonly AutomationsVorlage[] = [
  {
    automationKey: 'registrierung_unvollstaendig_3t',
    name: 'Registrierung begonnen, nicht beendet — nach 3 Tagen',
    beschreibung:
      'Erinnert Konten, deren Registrierung nach drei Tagen noch nicht abgeschlossen ist.',
    triggerTyp: 'registrierung_unvollstaendig',
    verzoegerungTage: 3,
    templateKey: 'kunde_buchungserinnerung',
    consentTyp: 'produktinfo',
  },
  {
    automationKey: 'registrierung_unvollstaendig_7t',
    name: 'Registrierung begonnen, nicht beendet — nach 7 Tagen',
    beschreibung: 'Zweite Erinnerung nach einer Woche.',
    triggerTyp: 'registrierung_unvollstaendig',
    verzoegerungTage: 7,
    templateKey: 'kunde_buchungserinnerung',
    consentTyp: 'produktinfo',
  },
  {
    automationKey: 'registrierung_unvollstaendig_14t',
    name: 'Registrierung begonnen, nicht beendet — nach 14 Tagen',
    beschreibung: 'Letzte Erinnerung. Danach ruht der Kontakt.',
    triggerTyp: 'registrierung_unvollstaendig',
    verzoegerungTage: 14,
    templateKey: 'kunde_buchungserinnerung',
    consentTyp: 'produktinfo',
  },
  {
    automationKey: 'engel_ohne_einsatz_14t',
    name: 'Engel registriert, aber kein Einsatz — nach 14 Tagen',
    beschreibung:
      'Engel-Konten, die zwei Wochen nach der Registrierung noch keinen Einsatz hatten.',
    triggerTyp: 'engel_ohne_einsatz',
    verzoegerungTage: 14,
    templateKey: 'engel_profil_vervollstaendigen',
    consentTyp: 'engel_einsaetze',
  },
  {
    automationKey: 'kunde_ohne_buchung_14t',
    name: 'Kunde registriert, aber keine Buchung — nach 14 Tagen',
    beschreibung: 'Kundenkonten ohne erste Buchung zwei Wochen nach der Registrierung.',
    triggerTyp: 'kunde_ohne_buchung',
    verzoegerungTage: 14,
    templateKey: 'kunde_entlastungsbetrag',
    consentTyp: 'produktinfo',
  },
  {
    automationKey: 'lange_keine_buchung_60t',
    name: 'Lange keine Buchung — nach 60 Tagen',
    beschreibung: 'Reaktivierung von Kundschaft, die seit zwei Monaten nicht gebucht hat.',
    triggerTyp: 'lange_keine_buchung',
    verzoegerungTage: 60,
    templateKey: 'kunde_reaktivierung_60',
    consentTyp: 'produktinfo',
  },
  {
    automationKey: 'lange_kein_einsatz_60t',
    name: 'Lange kein Einsatz — nach 60 Tagen',
    beschreibung: 'Reaktivierung von Engeln, die seit zwei Monaten keinen Einsatz hatten.',
    triggerTyp: 'lange_kein_einsatz',
    verzoegerungTage: 60,
    templateKey: 'engel_reaktivierung',
    consentTyp: 'engel_einsaetze',
  },
]

/**
 * Schreibt den Katalog in die Tabelle — IMMER mit `aktiv: false`.
 *
 * `ignoreDuplicates` ist hier die wichtigere Haelfte: ein erneuter Lauf
 * darf eine bereits vorhandene Zeile NICHT ueberschreiben. Sonst setzte
 * jedes Deployment eine von Hand eingeschaltete Automation stillschweigend
 * wieder auf aus — oder, schlimmer, eine ausgeschaltete wieder an. Genau
 * diese Klasse Fehler gab es schon bei den Monatsabschluessen und den
 * Bonusberechnungen (Upsert stempelt Endzustaende zurueck).
 */
export async function synchronisiereAutomationen(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<{ angelegt: number; vorhanden: number }> {
  const { data: bestand, error: lesefehler } = await supabase
    .from('marketing_automations')
    .select('automation_key')
    .eq('organization_id', organizationId)

  if (lesefehler) throw new Error(`Automationen nicht lesbar: ${lesefehler.message}`)

  const vorhandeneKeys = new Set((bestand ?? []).map((z) => z.automation_key as string))
  const fehlende = AUTOMATIONEN.filter((a) => !vorhandeneKeys.has(a.automationKey))

  if (fehlende.length === 0) return { angelegt: 0, vorhanden: vorhandeneKeys.size }

  const { error } = await supabase.from('marketing_automations').insert(
    fehlende.map((a) => ({
      organization_id: organizationId,
      automation_key: a.automationKey,
      name: a.name,
      beschreibung: a.beschreibung,
      trigger_typ: a.triggerTyp,
      verzoegerung_tage: a.verzoegerungTage,
      template_key: a.templateKey,
      consent_type: a.consentTyp,
      // Ausdrücklich aus. Der CHECK in der Migration lässt true ohne
      // Freigabevermerk ohnehin nicht zu.
      aktiv: false,
    })),
  )

  if (error) throw new Error(`Automationen nicht anlegbar: ${error.message}`)
  return { angelegt: fehlende.length, vorhanden: vorhandeneKeys.size }
}

/**
 * Ob eine Automation tatsaechlich laufen wuerde.
 *
 * Gibt HEUTE fuer jede Automation `false` zurueck, weil es keinen Ausloeser
 * gibt. Die Funktion existiert, damit die Oberflaeche eine ehrliche Antwort
 * anzeigen kann statt einer, die aus dem `aktiv`-Feld allein abgeleitet
 * waere: eine Automation kann in der Datenbank auf `aktiv` stehen und
 * trotzdem nie laufen, solange niemand sie aufruft.
 */
export const AUTOMATIONEN_AUSLOESER_VERDRAHTET = false

export function automationLaeuft(aktiv: boolean): { laeuft: boolean; grund: string } {
  if (!AUTOMATIONEN_AUSLOESER_VERDRAHTET) {
    return {
      laeuft: false,
      grund:
        'Kein Auslöser verdrahtet: es gibt keinen Cron-Eintrag und keinen Aufrufer für die ' +
        'Automationen. Auch eine auf „aktiv" gestellte Zeile verschickt derzeit nichts.',
    }
  }
  return aktiv
    ? { laeuft: true, grund: 'Aktiv.' }
    : { laeuft: false, grund: 'Automation steht auf aus.' }
}
