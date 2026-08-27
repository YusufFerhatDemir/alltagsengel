// ═══════════════════════════════════════════════════════════════
// Sturzprotokoll — Formatvalidierung
// Reine Validierungslogik ohne DB-Zugriff (server-safe, keine
// lib/audit-log-Importe) — analog lib/vitals/vitals.ts.
// ═══════════════════════════════════════════════════════════════

import { UserFacingError } from '@/lib/api/user-facing-error'
import { berlinParts, heuteBerlin } from '@/lib/utils/timezone'

/** Muss mit app/admin/sturzprotokoll/page.tsx (STURZ_ORTE) übereinstimmen. */
export const STURZ_ORT_WERTE = ['Zimmer', 'Bad', 'Flur', 'Kueche', 'Aussenbereich', 'Treppe', 'Sonstiges'] as const
export type SturzOrt = (typeof STURZ_ORT_WERTE)[number]

/** Muss mit app/admin/sturzprotokoll/page.tsx (VERLETZUNGS_ARTEN) übereinstimmen. */
export const VERLETZUNGSART_WERTE = [
  'keine', 'prellungen', 'schuerfen', 'platzwunde', 'frakturverdacht', 'kopfverletzung', 'sonstiges',
] as const
export type Verletzungsart = (typeof VERLETZUNGSART_WERTE)[number]

/** Muss mit app/admin/sturzprotokoll/page.tsx (RISIKO_FAKTOREN) übereinstimmen. */
export const RISIKOFAKTOR_WERTE = [
  'medikamente', 'schwindel', 'sehstoerung', 'gehunsicherheit', 'verwirrtheit', 'umgebung', 'schuhe', 'sonstiges',
] as const
export type SturzRisikoFaktor = (typeof RISIKOFAKTOR_WERTE)[number]

const DATUM_MUSTER = /^\d{4}-\d{2}-\d{2}$/
const UHRZEIT_MUSTER = /^([01]\d|2[0-3]):[0-5]\d$/

function assertZeichenkettenListe(wert: unknown, erlaubt: readonly string[], feld: string): void {
  if (!Array.isArray(wert)) throw new UserFacingError(`${feld} muss eine Liste sein.`)
  for (const eintrag of wert) {
    if (typeof eintrag !== 'string' || !erlaubt.includes(eintrag)) {
      throw new UserFacingError(`${feld} enthält einen ungültigen Wert: "${String(eintrag)}".`)
    }
  }
}

export interface SturzZeitEingabe {
  sturzDatum: string
  sturzUhrzeit: string
}

/**
 * Prüft Datum/Uhrzeit-Format und Plausibilität und liefert den geprüften
 * Zeitpunkt als ISO-String zurück. Wirft bei kaputtem Format (statt einer
 * rohen "Invalid time value"-Exception aus `.toISOString()`) und bei einem
 * Zeitpunkt in der Zukunft — ein Sturz kann nicht erst noch passieren.
 */
export function validiereSturzZeitpunkt(eingabe: SturzZeitEingabe): string {
  if (!DATUM_MUSTER.test(eingabe.sturzDatum)) {
    throw new UserFacingError('Sturzdatum muss im Format JJJJ-MM-TT angegeben werden.')
  }
  if (!UHRZEIT_MUSTER.test(eingabe.sturzUhrzeit)) {
    throw new UserFacingError('Sturzuhrzeit muss im Format SS:MM angegeben werden.')
  }

  const zeitpunkt = new Date(`${eingabe.sturzDatum}T${eingabe.sturzUhrzeit}`)
  if (Number.isNaN(zeitpunkt.getTime())) {
    throw new UserFacingError('Sturzdatum/-uhrzeit ist ungültig.')
  }

  // Stringvergleich auf Berlin-Ortszeit statt Date-Arithmetik: vermeidet
  // Fehlalarme durch die Server/Browser-Zeitzonen-Differenz zu Europe/Berlin.
  const heute = heuteBerlin()
  if (eingabe.sturzDatum > heute) {
    throw new UserFacingError('Sturzdatum darf nicht in der Zukunft liegen.')
  }
  if (eingabe.sturzDatum === heute) {
    // 5-Minuten-Puffer gegen Rundung im Formular / Client-Uhr-Skew.
    const puffer = berlinParts(new Date(Date.now() + 5 * 60 * 1000))
    const jetztMitPuffer = `${puffer.hour}:${puffer.minute}`
    if (eingabe.sturzUhrzeit > jetztMitPuffer) {
      throw new UserFacingError('Sturzuhrzeit darf nicht in der Zukunft liegen.')
    }
  }

  return zeitpunkt.toISOString()
}

export interface SturzprotokollListenEingabe {
  sturzOrt: string
  verletzungen: unknown
  sturzrisikoFaktoren: unknown
}

/** Prüft die Auswahllisten (Sturzort, Verletzungen, Risikofaktoren) gegen die erlaubten Werte. */
export function validiereSturzprotokollListen(eingabe: SturzprotokollListenEingabe): void {
  if (!STURZ_ORT_WERTE.includes(eingabe.sturzOrt as SturzOrt)) {
    throw new UserFacingError(`Ungültiger Sturzort: "${eingabe.sturzOrt}".`)
  }
  assertZeichenkettenListe(eingabe.verletzungen, VERLETZUNGSART_WERTE, 'Verletzungen')
  assertZeichenkettenListe(eingabe.sturzrisikoFaktoren, RISIKOFAKTOR_WERTE, 'Sturzrisikofaktoren')
}
