// ═══════════════════════════════════════════════════════════════════
// Pilot — Definition der Kundenkette
// ═══════════════════════════════════════════════════════════════════
//
// Die Kette bildet den Weg eines echten Kunden vom ersten Stammdatensatz
// bis in die Buchhaltung ab:
//
//   Kunde → Pflegegrad → Budget → Engel → Termin → Leistungsnachweis →
//   Signaturen → Freigabe → Rechnung → PDF → Zahlungseingang → OPOS → DATEV
//
// „Pflegegrad/Budget" ist bewusst in ZWEI Schritte getrennt: der Pflegegrad
// ist ein externer Bescheid der Pflegekasse, das Budget eine interne Folge
// daraus. Sie scheitern an verschiedenen Stellen und brauchen verschiedene
// nächste Schritte.
//
// Die Reihenfolge ist verbindlich: `nr` bestimmt, welcher Schritt als
// „aktueller Schritt" gilt (der erste nicht erledigte).
// ═══════════════════════════════════════════════════════════════════

import type { SchrittDefinition } from './types'

export const KETTEN_SCHRITTE: SchrittDefinition[] = [
  {
    id: 'kunde',
    nr: 1,
    label: 'Kunde angelegt',
    kriterium: 'Name, Geburtsdatum, Anschrift und eine Kontaktmöglichkeit sind erfasst.',
    href: '/admin/clients/{clientId}',
  },
  {
    id: 'pflegegrad',
    nr: 2,
    label: 'Pflegegrad erfasst',
    kriterium: 'Pflegegrad 1–5 hinterlegt. Ohne ihn besteht kein Anspruch auf Entlastungsbetrag oder Verhinderungspflege.',
    href: '/admin/clients/{clientId}',
  },
  {
    id: 'budget',
    nr: 3,
    label: 'Budget angelegt',
    kriterium: 'Für das laufende Jahr existiert mindestens ein Budget (Entlastungsbetrag ab PG 1, VP/KZP ab PG 2).',
    href: '/admin/budgets',
  },
  {
    id: 'engel',
    nr: 4,
    label: 'Betreuungskraft zugeordnet',
    kriterium: 'Mindestens eine Betreuungskraft mit Einsatzfreigabe ist dem Kunden über einen Einsatz zugeordnet.',
    href: '/admin/schedule',
  },
  {
    id: 'termin',
    nr: 5,
    label: 'Termin geplant',
    kriterium: 'Mindestens ein Einsatz ist geplant (assignments).',
    href: '/admin/schedule',
  },
  {
    id: 'leistungsnachweis',
    nr: 6,
    label: 'Leistungsnachweis erfasst',
    kriterium: 'Mindestens ein Leistungsnachweis mit Datum, Zeit und Betrag ist erfasst.',
    href: '/admin/records',
  },
  {
    id: 'signatur',
    nr: 7,
    label: 'Signaturen geleistet',
    kriterium: 'Zu den Nachweisen liegen Unterschriften vor (service_signatures) — Kunde und/oder Betreuungskraft.',
    href: '/admin/leistungsnachweis-digital',
  },
  {
    id: 'freigabe',
    nr: 8,
    label: 'Nachweis freigegeben',
    kriterium: 'Der Nachweis steht auf „signed" oder „complete" und ist damit abrechenbar.',
    href: '/admin/records',
  },
  {
    id: 'rechnung',
    nr: 9,
    label: 'Rechnung erstellt',
    kriterium: 'Mindestens eine Rechnung mit fortlaufender Nummer existiert.',
    href: '/admin/rechnungserstellung',
  },
  {
    id: 'pdf',
    nr: 10,
    label: 'Rechnungs-PDF erzeugt',
    kriterium: 'Zur Rechnung liegt ein Belegpaket (PDF mit Nachweisen und Unterschriften) im Storage.',
    href: '/admin/rechnungen',
  },
  {
    id: 'zahlung',
    nr: 11,
    label: 'Zahlungseingang verbucht',
    kriterium: 'Ein Zahlungseingang ist der Rechnung zugeordnet (payment_allocations) oder die Rechnung ist als bezahlt gebucht.',
    href: '/admin/zahlungseingaenge',
  },
  {
    id: 'opos',
    nr: 12,
    label: 'OPOS ausgeglichen',
    kriterium: 'Keine offene Forderung mehr — alle Rechnungen des Kunden sind vollständig bezahlt.',
    href: '/admin/forderungen',
  },
  {
    id: 'datev',
    nr: 13,
    label: 'In DATEV übergeben',
    kriterium: 'Ein DATEV-Export deckt den Zeitraum der Rechnung ab und ist erfolgreich abgeschlossen.',
    href: '/admin/datev',
  },
]

/** Löst `{clientId}` im Link auf. */
export function schrittHref(href: string, clientId: string): string {
  return href.replace('{clientId}', clientId)
}
