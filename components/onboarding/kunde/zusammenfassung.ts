/**
 * Kundenablauf — Anzeigetexte der Prüfseite.
 *
 * Rein rechnend, gleiches Muster wie im Bewerberablauf: ohne diese
 * Abbildung liest die Person `betreuung_45a` statt „Gesellschaft und
 * Gespräche" — und prüft damit etwas, das sie nie eingegeben hat.
 */

import { SCHRITTFOLGEN, erwarteteAngabenFuer } from '@/lib/onboarding/schritte'
import { finanzierungsLabel } from '@/lib/onboarding/finanzierung'
import { leistungLabel } from './leistungen'

const KLARTEXT: Record<string, string> = {
  // Für wen
  selbst: 'Für mich selbst',
  angehoeriger: 'Für eine angehörige Person',
  andere: 'Für jemand anderen',
  // Verhältnis zur pflegebedürftigen Person
  kind: 'Tochter oder Sohn',
  partner: 'Partnerin oder Partner',
  elternteil: 'Mutter oder Vater',
  geschwister: 'Schwester oder Bruder',
  betreuer: 'Rechtliche Betreuung',
  bevollmaechtigter: 'Bevollmächtigt',
  sonstige: 'Etwas anderes',
  // Pflegegrad
  keiner: 'Kein Pflegegrad',
  unbekannt: 'Weiß ich nicht',
  beantragt: 'Ist beantragt',
  '1': 'Pflegegrad 1', '2': 'Pflegegrad 2', '3': 'Pflegegrad 3',
  '4': 'Pflegegrad 4', '5': 'Pflegegrad 5',
  // Wochentage
  mo: 'Montag', di: 'Dienstag', mi: 'Mittwoch', do: 'Donnerstag',
  fr: 'Freitag', sa: 'Samstag', so: 'Sonntag',
  // Tageszeit
  vormittag: 'Vormittags', nachmittag: 'Nachmittags', abend: 'Abends',
  flexibel: 'Egal',
  // Häufigkeit
  einmalig: 'Einmalig', '1x_woche': 'Einmal pro Woche',
  '2-3x_woche': 'Zwei- bis dreimal pro Woche', taeglich: 'Täglich',
  unklar: 'Weiß ich noch nicht',
  // Sprachen
  tuerkisch: 'Türkisch', russisch: 'Russisch', polnisch: 'Polnisch',
  arabisch: 'Arabisch', englisch: 'Englisch', ukrainisch: 'Ukrainisch',
}

const FELD_LABEL: Record<string, string> = {
  fuer_wen: 'Unterstützung für',
  person_vorname: 'Name der Person (Vorname)',
  person_nachname: 'Name der Person (Nachname)',
  person_geburtsdatum: 'Geburtsdatum der Person',
  person_telefon: 'Telefon der Person',
  beziehung: 'Ihr Verhältnis zur Person',
  strasse: 'Straße', plz: 'Postleitzahl', ort: 'Ort',
  leistungsarten: 'Gewünschte Unterstützung', sonstiges: 'Weiterer Bedarf',
  pflegegrad: 'Pflegegrad',
  finanzierungsweg: 'Finanzierung',
  wochentage: 'Wochentage', tageszeit: 'Tageszeit', haeufigkeit: 'Häufigkeit',
  mobilitaet: 'Mobilität', haustiere: 'Haustiere', allergien: 'Allergien',
  wunschsprachen: 'Wunschsprache', besonderheiten: 'Sonstiges',
  pflegegradbescheid: 'Pflegegradbescheid', kostenuebernahme: 'Kostenübernahme',
  vollmacht: 'Vollmacht',
}

export function feldLabel(feld: string): string {
  return FELD_LABEL[feld] ?? feld
}

export function wertText(feld: string, wert: unknown): string {
  if (wert === undefined || wert === null || wert === '') return '—'

  // Leistungen und Finanzierung haben ihre eigene Quelle — sie hier noch
  // einmal abzuschreiben, hiesse zwei Listen zu pflegen.
  if (feld === 'leistungsarten' && Array.isArray(wert)) {
    return wert.length === 0 ? '—' : wert.map(w => leistungLabel(String(w))).join(', ')
  }
  if (feld === 'finanzierungsweg') return finanzierungsLabel(String(wert))

  if (Array.isArray(wert)) {
    return wert.length === 0 ? '—' : wert.map(w => KLARTEXT[String(w)] ?? String(w)).join(', ')
  }
  if (typeof wert === 'boolean') return wert ? 'Ja' : 'Nein'
  return KLARTEXT[String(wert)] ?? String(wert)
}

export interface ZusammenfassungsBlock {
  nummer: number
  schluessel: string
  titel: string
  eintraege: Array<{ feld: string; label: string; text: string }>
}

export function baueBloecke(
  alleDaten: Record<string, Record<string, unknown>>,
): ZusammenfassungsBlock[] {
  const bloecke: ZusammenfassungsBlock[] = []

  SCHRITTFOLGEN.kunde.forEach((schritt, index) => {
    if (schritt.art !== 'formular') return
    const daten = alleDaten[schritt.schluessel] ?? {}
    // Bedingte Angaben mit aufloesen — sonst fehlt in der Pruefung genau
    // der Block, den jemand zur pflegebeduerftigen Person ausgefuellt hat.
    const erwartet = erwarteteAngabenFuer(schritt, daten)
    const felder = [
      ...erwartet,
      ...Object.keys(daten).filter(f => !erwartet.includes(f)),
    ]
    bloecke.push({
      nummer: index + 1,
      schluessel: schritt.schluessel,
      titel: schritt.titel,
      eintraege: felder.map(feld => ({
        feld, label: feldLabel(feld), text: wertText(feld, daten[feld]),
      })),
    })
  })

  return bloecke
}

export function offenePflichtangaben(
  alleDaten: Record<string, Record<string, unknown>>,
): string[] {
  const offen: string[] = []
  for (const schritt of SCHRITTFOLGEN.kunde) {
    if (schritt.art !== 'formular' || schritt.ueberspringbar) continue
    const daten = alleDaten[schritt.schluessel] ?? {}
    for (const feld of erwarteteAngabenFuer(schritt, daten)) {
      const wert = daten[feld]
      const leer = wert === undefined || wert === null || wert === ''
        || (Array.isArray(wert) && wert.length === 0)
      if (leer) offen.push(feldLabel(feld))
    }
  }
  return offen
}
