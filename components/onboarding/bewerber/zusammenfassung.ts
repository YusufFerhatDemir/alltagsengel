/**
 * Zusammenfassung — Anzeigetexte für die Prüfseite
 *
 * Rein rechnend und ohne React, damit die Abbildung „Rohwert → Klartext"
 * testbar ist. Ohne sie stünde in der Zusammenfassung `teilzeit_klein`
 * statt „Kleine Teilzeit" — und die Person prüft etwas, das sie nie
 * eingegeben hat.
 */

import { SCHRITTFOLGEN } from '@/lib/onboarding/schritte'

/** Rohwert → Klartext. Unbekannte Werte bleiben unverändert stehen. */
const KLARTEXT: Record<string, string> = {
  // Ausbildung
  keine: 'Keine Ausbildung in der Pflege',
  betreuungskraft: 'Betreuungskraft nach § 43b',
  pflegehelfer: 'Pflegehelferin / Pflegehelfer',
  pflegefachkraft: 'Pflegefachkraft',
  sonstige: 'Andere Ausbildung',
  // Erfahrung
  '0': 'Noch keine Erfahrung',
  '1-2': '1 bis 2 Jahre',
  '3-5': '3 bis 5 Jahre',
  '5+': 'Mehr als 5 Jahre',
  // Führerschein und Fahrzeug
  ja: 'Ja',
  nein: 'Nein',
  eigenes: 'Eigenes Auto',
  gelegentlich: 'Gelegentlich ein Auto verfügbar',
  keines: 'Kein Auto',
  // Sprachniveau
  grundkenntnisse: 'Grundkenntnisse',
  gut: 'Gut',
  sehr_gut: 'Sehr gut',
  muttersprache: 'Muttersprache',
  // Sprachen
  tuerkisch: 'Türkisch', russisch: 'Russisch', polnisch: 'Polnisch',
  arabisch: 'Arabisch', englisch: 'Englisch', ukrainisch: 'Ukrainisch',
  // Wochentage
  mo: 'Montag', di: 'Dienstag', mi: 'Mittwoch', do: 'Donnerstag',
  fr: 'Freitag', sa: 'Samstag', so: 'Sonntag',
  // Zeitfenster
  vormittag: 'Vormittags', nachmittag: 'Nachmittags', abend: 'Abends',
  // Stundenumfang
  minijob: 'Minijob (bis etwa 10 Std./Woche)',
  teilzeit_klein: 'Kleine Teilzeit (etwa 10–20 Std./Woche)',
  teilzeit: 'Teilzeit (etwa 20–30 Std./Woche)',
  vollzeit: 'Vollzeit (ab etwa 35 Std./Woche)',
  unklar: 'Noch offen',
  // Führungszeugnis
  vorhanden: 'Liegt vor',
  beantragt: 'Ist beantragt',
  beantrage_noch: 'Wird noch beantragt',
}

/** Feldname → Beschriftung in der Zusammenfassung. */
const FELD_LABEL: Record<string, string> = {
  vorname: 'Vorname', nachname: 'Nachname', geburtsdatum: 'Geburtsdatum',
  telefon: 'Telefon', email: 'E-Mail',
  plz: 'Postleitzahl', stadt: 'Stadt', radius_km: 'Einsatzradius',
  ausbildung: 'Ausbildung', jahre_erfahrung: 'Erfahrung', taetigkeiten: 'Bisherige Tätigkeiten',
  fuehrerschein: 'Führerschein', fahrzeug: 'Fahrzeug',
  deutsch_niveau: 'Deutsch', weitere_sprachen: 'Weitere Sprachen', sprache_sonstige: 'Weitere Sprache',
  wochentage: 'Wochentage', zeitfenster: 'Tageszeiten',
  umfang: 'Gewünschter Umfang',
  fuehrungszeugnis_status: 'Führungszeugnis',
  lebenslauf: 'Lebenslauf', zeugnisse: 'Zeugnisse',
  qualifikationsnachweise: 'Qualifikationsnachweise',
}

export function feldLabel(feld: string): string {
  return FELD_LABEL[feld] ?? feld
}

/**
 * Wert lesbar machen.
 * Zahlenwerte mit Einheit (Radius) und Listen werden gesondert behandelt;
 * alles andere geht durch die Klartext-Abbildung.
 */
export function wertText(feld: string, wert: unknown): string {
  if (wert === undefined || wert === null || wert === '') return '—'
  if (Array.isArray(wert)) {
    if (wert.length === 0) return '—'
    return wert.map(w => KLARTEXT[String(w)] ?? String(w)).join(', ')
  }
  if (feld === 'radius_km') return `bis ${String(wert)} km`
  if (typeof wert === 'boolean') return wert ? 'Ja' : 'Nein'
  return KLARTEXT[String(wert)] ?? String(wert)
}

export interface ZusammenfassungsBlock {
  /** 1-basierte Schrittnummer — Ziel des Korrektur-Knopfes. */
  nummer: number
  schluessel: string
  titel: string
  eintraege: Array<{ feld: string; label: string; text: string }>
}

/**
 * Baut die Blöcke der Prüfseite.
 *
 * Nur Formularschritte erscheinen — Begrüßung, Zusammenfassung und
 * Absenden haben nichts zu prüfen. Leere Felder werden mit „—" gezeigt
 * statt weggelassen: eine fehlende Angabe soll sichtbar sein, nicht
 * unsichtbar.
 */
export function baueBloecke(
  alleDaten: Record<string, Record<string, unknown>>,
): ZusammenfassungsBlock[] {
  const bloecke: ZusammenfassungsBlock[] = []

  SCHRITTFOLGEN.bewerber.forEach((schritt, index) => {
    if (schritt.art !== 'formular') return
    const daten = alleDaten[schritt.schluessel] ?? {}

    // Erwartete Angaben zuerst, danach alles, was zusätzlich erfasst
    // wurde (z. B. Fahrzeug, weitere Sprachen) — sonst fehlt in der
    // Prüfung genau das, was jemand freiwillig ergänzt hat.
    const felder = [
      ...schritt.erwarteteAngaben,
      ...Object.keys(daten).filter(f => !schritt.erwarteteAngaben.includes(f)),
    ]

    bloecke.push({
      nummer: index + 1,
      schluessel: schritt.schluessel,
      titel: schritt.titel,
      eintraege: felder.map(feld => ({
        feld,
        label: feldLabel(feld),
        text: wertText(feld, daten[feld]),
      })),
    })
  })

  return bloecke
}

/** Welche Pflichtangaben in der Zusammenfassung noch fehlen. */
export function offenePflichtangaben(
  alleDaten: Record<string, Record<string, unknown>>,
): string[] {
  const offen: string[] = []
  for (const schritt of SCHRITTFOLGEN.bewerber) {
    if (schritt.art !== 'formular' || schritt.ueberspringbar) continue
    const daten = alleDaten[schritt.schluessel] ?? {}
    for (const feld of schritt.erwarteteAngaben) {
      const wert = daten[feld]
      const leer = wert === undefined || wert === null || wert === ''
        || (Array.isArray(wert) && wert.length === 0)
      if (leer) offen.push(feldLabel(feld))
    }
  }
  return offen
}
