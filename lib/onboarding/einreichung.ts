/**
 * Onboarding — die Bewerbung aus dem Fortschritt bauen
 *
 * Rein rechnend. Trennt die Frage „was steht in der Bewerbung?" von der
 * Frage „wie kommt sie in die Datenbank?" — nur so ist die Abbildung
 * ohne Datenbank testbar.
 *
 * ── DER STAND WIRD EINGEFROREN ─────────────────────────────────────────
 * Was hier entsteht, ist eine Momentaufnahme. Aendert sich spaeter die
 * Schrittfolge, aendert sich die eingegangene Bewerbung NICHT mit — sie
 * ist ein Beleg, kein Blick in eine laufende Tabelle.
 */

import type { SchrittEintrag } from './service'

export interface EinreichungsEingabe {
  schritteDaten: Record<string, SchrittEintrag>
  fehlendeAngaben: readonly string[]
  fortschrittId: string
  organizationId: string
}

export interface Einreichung {
  organization_id: string
  onboarding_progress_id: string
  art: 'bewerbung'
  name: string
  phone: string
  email: string | null
  plz: string
  message: string | null
  source: string
  status: string
  bewerbung_daten: Record<string, unknown>
  eingereicht_am: string
}

function feld(daten: Record<string, SchrittEintrag>, schritt: string, name: string): string {
  const wert = daten[schritt]?.daten?.[name]
  if (wert === undefined || wert === null) return ''
  return String(wert).trim()
}

/**
 * Baut die Zeile fuer lead_inquiries.
 *
 * `name` und `phone` sind dort NOT NULL. Fehlen sie — was nach einem
 * „Später fortsetzen" quer durch den Ablauf moeglich ist —, wird ein
 * lesbarer Platzhalter gesetzt statt der Einreichung zu widersprechen:
 * eine Bewerbung, die am fehlenden Nachnamen scheitert, ist fuer die
 * Verwaltung unsichtbar, und genau darum geht es hier nicht.
 */
export function baueEinreichung(eingabe: EinreichungsEingabe): Einreichung {
  const d = eingabe.schritteDaten

  const vorname = feld(d, 'kontakt', 'vorname')
  const nachname = feld(d, 'kontakt', 'nachname')
  const name = [vorname, nachname].filter(Boolean).join(' ') || 'Ohne Namensangabe'

  const telefon = feld(d, 'kontakt', 'telefon') || 'Keine Angabe'
  const email = feld(d, 'kontakt', 'email') || null
  const plz = feld(d, 'einsatzgebiet', 'plz')

  const nachricht = feld(d, 'absenden', 'nachricht')
  const gespraech = feld(d, 'absenden', 'gespraech_art')

  // Was der Verwaltung im Posteingang sofort ins Auge fallen muss, steht
  // im Klartext-Feld — nicht nur im jsonb, das niemand aufklappt.
  const zeilen = [
    nachricht || null,
    gespraech ? `Gesprächswunsch: ${gespraech}` : null,
    eingabe.fehlendeAngaben.length > 0
      ? `Noch offen: ${eingabe.fehlendeAngaben.join(', ')}`
      : null,
  ].filter((z): z is string => Boolean(z))

  return {
    organization_id: eingabe.organizationId,
    onboarding_progress_id: eingabe.fortschrittId,
    art: 'bewerbung',
    name,
    phone: telefon,
    email,
    plz,
    message: zeilen.length > 0 ? zeilen.join('\n') : null,
    source: 'onboarding_wizard',
    status: 'new',
    bewerbung_daten: {
      schritte: d,
      fehlende_angaben: [...eingabe.fehlendeAngaben],
      eingefroren_am: new Date().toISOString(),
    },
    eingereicht_am: new Date().toISOString(),
  }
}
