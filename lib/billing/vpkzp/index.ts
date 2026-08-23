/**
 * VP/KZP — Verhinderungspflege (§ 39 SGB XI) und Kurzzeitpflege (§ 42 SGB XI)
 * mit gemeinsamem Jahresbetrag nach § 42a SGB XI.
 *
 * Schichten, von unten nach oben:
 *   konstanten.ts     Tagekontingente je Rechtsstand + offene Fachfragen
 *   zeitraum.ts       Tagezaehlung, Zerlegung am Jahreswechsel, Ueberschneidung
 *   berechnung.ts     Tage- und Budgetrechnung (rein, ohne Datenbank)
 *   pruefprotokoll.ts Das fail-closed Tor vor jeder Buchung
 *   laden.ts          Bestandsdaten aus der Datenbank
 *
 * Die Geldbetraege selbst stehen NICHT hier, sondern in
 * lib/config/budget-constants.ts (gemeinsamer Jahresbetrag 3.539 EUR,
 * Entlastungsbetrag 131 EUR/Monat). Dieses Modul liest sie nur.
 */

export * from './konstanten'
export * from './zeitraum'
export * from './berechnung'
export * from './pruefprotokoll'
export * from './laden'
