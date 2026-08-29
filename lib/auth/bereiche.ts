// ═══════════════════════════════════════════════════════════════════════
// Pfad → Berechtigung
// ═══════════════════════════════════════════════════════════════════════
//
// Welcher Bereich der Anwendung welche Berechtigung verlangt. Genutzt von
// proxy.ts (serverseitige Sperre VOR dem Rendern) und von den
// API-Guards.
//
// FAIL-CLOSED IST DER DEFAULT
// Ein Pfad unter /admin oder /mis, der hier NICHT steht, bleibt
// ausschliesslich admin/superadmin vorbehalten. Neue Bereiche sind damit
// von sich aus zu, bis jemand sie hier bewusst oeffnet — die umgekehrte
// Reihenfolge (erst offen, spaeter zumachen) hat noch nie funktioniert.
//
// LESEN UND SCHREIBEN SIND GETRENNT
// Ein Eintrag kann eine eigene Schreib-Berechtigung tragen. GET/HEAD/
// OPTIONS gelten als Lesen, alles andere als Schreiben. Fehlt die
// Schreib-Berechtigung im Eintrag, gilt die Lese-Berechtigung fuer beides.
// ═══════════════════════════════════════════════════════════════════════

import type { Berechtigung } from './rollen'
import { istAdministration, hatBerechtigung } from './rollen'

export interface BereichsRegel {
  lesen: Berechtigung
  schreiben?: Berechtigung
}

/** Pfade, die JEDE angemeldete Verwaltungsrolle betreten koennen muss. */
const IMMER_ERLAUBT: readonly string[] = [
  '/admin/mfa-einrichtung',
  '/admin/mfa-pruefen',
  '/api/ops/praeferenzen',
]

/**
 * Bereichskatalog. Schluessel ist der Pfad-Praefix; der laengste passende
 * Eintrag gewinnt (so kann /admin/leistungspreise strenger sein als
 * /admin und /api/ops/rechnungen strenger als /api/ops).
 */
export const BEREICHE: Readonly<Record<string, BereichsRegel>> = {
  // ── Verwaltungsoberflaeche ────────────────────────────────────────
  '/admin/home':                      { lesen: 'berichte.lesen' },
  '/admin/dashboard':                 { lesen: 'berichte.lesen' },
  '/admin/analytics':                 { lesen: 'berichte.lesen' },

  // Klienten und Stammdaten
  '/admin/clients':                   { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/admin/kundenakte':                { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/admin/budgets':                   { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/admin/vertraege':                 { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/admin/dokumente':                 { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/admin/notizen':                   { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/admin/nachrichten':               { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/admin/aerzte':                    { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/admin/partners':                  { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/admin/kostentraeger':             { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/admin/angehoerige':               { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },

  // Personal
  '/admin/personal':                  { lesen: 'personal.lesen', schreiben: 'personal.schreiben' },
  '/admin/caregivers':                { lesen: 'personal.lesen', schreiben: 'personal.schreiben' },
  '/admin/mitarbeiterakte':           { lesen: 'personal.lesen', schreiben: 'personal.schreiben' },
  '/admin/qualifikationen':           { lesen: 'personal.lesen', schreiben: 'personal.schreiben' },
  // BEFUND 29.08.2026 — eine Namenskollision hat hier die falsche
  // Berechtigung erzeugt: '/admin/nachweise' stand im Block der
  // LEISTUNGSnachweise (records, leistungsnachweis*, alle `einsatz.lesen`).
  // Die Seite zeigt aber QUALIFIKATIONSnachweise der Mitarbeitenden —
  // Fuehrungszeugnis, Erste-Hilfe-Nachweis, Zertifikate je Pflegekraft —
  // und steht in der Navigation unter „Personal & Qualifikation".
  //
  // `buchhaltung` hat `einsatz.lesen` und ausdruecklich NICHT
  // `personal.lesen`; lib/auth/rollen.ts haelt woertlich fest, dass sie
  // „KEINE Gesundheitsdaten und keine Personalakten" bekommt. Ueber diese
  // Seite waeren sie ihr offen gestanden.
  //
  // DASS ES BISHER NICHT AUFFIEL, hat einen zweiten Grund, der die Sache
  // nicht besser macht: die Seite las `caregiver_qualifications` mit dem
  // BROWSER-Client, und dort steht live nur `is_admin()` — buchhaltung sah
  // deshalb eine leere Liste. Ein falscher Riegel, verdeckt von einem
  // unbeteiligten Mechanismus: wer die Blindheit repariert (rk_-Policy),
  // oeffnet damit die Luecke. Deshalb steht die Berechtigung ZUERST richtig.
  '/admin/nachweise':                 { lesen: 'personal.lesen', schreiben: 'personal.schreiben' },
  '/admin/dienstplan':                { lesen: 'personal.lesen', schreiben: 'personal.schreiben' },
  // Bewusst `einsatz.*` und NICHT `personal.*` wie der Dienstplan daneben:
  // die Seite ruft ausschliesslich /api/personal/dienstplan/freigabe auf, und
  // die Route verlangt einsatz.lesen bzw. einsatz.schreiben. Stuende hier
  // personal.*, oeffnete sich die Seite fuer jemanden, dem die Schnittstelle
  // dahinter alles verweigert — dieselbe Falle wie bei /admin/bonuses, wo
  // Seite, Schnittstelle und Datenbank drei verschiedene Antworten gaben.
  '/admin/dienstplanfreigabe':        { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/admin/arbeitszeiten':             { lesen: 'personal.lesen', schreiben: 'personal.schreiben' },
  '/admin/applications':              { lesen: 'personal.lesen', schreiben: 'personal.schreiben' },
  // Boni sind Verguetung, nicht Personalstammdaten: die Seite oeffnete sich
  // fuer die PDL (personal.lesen), die Schnittstelle liess zusaetzlich QM und
  // Buchhaltung herein (berichte.lesen) — und die Datenbank wies alle drei ab
  // (bonus_*-Policies stehen live auf is_admin()). Drei Antworten auf
  // dieselbe Frage; die der Datenbank gilt.
  '/admin/bonuses':                   { lesen: 'bonus.verwalten', schreiben: 'bonus.verwalten' },
  '/admin/urlaub':                    { lesen: 'personal.lesen', schreiben: 'personal.schreiben' },
  '/admin/mitarbeitergespraeche':     { lesen: 'personal.lesen', schreiben: 'personal.schreiben' },
  '/admin/einsatzfreigabe':           { lesen: 'personal.lesen', schreiben: 'personal.schreiben' },

  // Einsatzgeschehen
  '/admin/bookings':                  { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/admin/kalender':                  { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/admin/aufgaben':                  { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/admin/schedule':                  { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/admin/tourenplanung':             { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/admin/ausfallmanagement':         { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/admin/pdl-cockpit':               { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/admin/records':                   { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/admin/leistungsnachweis':         { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/admin/leistungsnachweis-digital': { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/admin/leistungsnachweis-upload':  { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },

  // Gesundheitsdaten
  '/admin/pflegedoku':                { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/admin/sis':                       { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/admin/biografiebogen':            { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/admin/wunddokumentation':         { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/admin/vitalwerte':                { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/admin/medikamente':               { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/admin/verordnungen':              { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/admin/sturzprotokoll':            { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/admin/lagerungsprotokoll':        { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/admin/fixierungsprotokoll':       { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/admin/uebergaben':                { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/admin/ueberleitung':              { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },

  // Qualitaetssicherung
  '/admin/quality':                   { lesen: 'qm.lesen', schreiben: 'qm.schreiben' },
  '/admin/pflegevisiten':             { lesen: 'qm.lesen', schreiben: 'qm.schreiben' },
  '/admin/pruefprotokoll':            { lesen: 'qm.lesen', schreiben: 'qm.schreiben' },
  '/admin/fristen':                   { lesen: 'qm.lesen', schreiben: 'qm.schreiben' },
  '/admin/wiedervorlagen':            { lesen: 'qm.lesen', schreiben: 'qm.schreiben' },
  '/admin/eskalationen':              { lesen: 'qm.lesen', schreiben: 'qm.schreiben' },

  // Abrechnung
  '/admin/rechnungen':                { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/invoices':                  { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/rechnungserstellung':       { lesen: 'abrechnung.schreiben' },
  '/admin/sammelrechnung':            { lesen: 'abrechnung.schreiben' },
  '/admin/gutschriften':              { lesen: 'abrechnung.schreiben' },
  '/admin/korrekturlaeufe':           { lesen: 'abrechnung.schreiben' },
  '/admin/mahnwesen':                 { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/forderungen':               { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/zahlungseingaenge':         { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/zahlungskontrolle':         { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/abrechnung':                { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/abrechnungsfehler':         { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/kassenabrechnung':          { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/vpkzp':                     { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/monatsabschluss':           { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/monatsabschluss-vorbereitung': { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/ruecklaeufer':              { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/zuzahlungen':               { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/datev':                     { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/dta':                       { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/dakota':                    { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/sgb-v':                     { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/admin/eul':                       { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },

  // Bankdaten
  '/admin/sepa':                      { lesen: 'bankdaten.lesen', schreiben: 'bankdaten.schreiben' },

  // Tarife — Ansehen ist breiter erlaubt als Aendern.
  '/admin/leistungspreise':           { lesen: 'tarife.lesen', schreiben: 'tarife.schreiben' },

  // Revision
  '/admin/ops-audit':                 { lesen: 'audit.lesen' },

  // Benutzerverwaltung
  '/admin/users':                     { lesen: 'benutzer.verwalten' },

  // Auswertungen und Managementinformationssystem
  //
  // '/mis' allein waere zu grob: darunter liegen Finanzen, Personalakten
  // und Vertraege nebeneinander. Der laengste passende Praefix gewinnt,
  // deshalb schneiden die Eintraege darunter den Sammelfall zu.
  '/mis':                             { lesen: 'berichte.lesen' },
  '/mis/finance':                     { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/mis/krankenfahrt-pricing':        { lesen: 'tarife.lesen', schreiben: 'tarife.schreiben' },
  '/mis/krankenfahrten':              { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/mis/scheduling':                  { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/mis/recruiting':                  { lesen: 'personal.lesen', schreiben: 'personal.schreiben' },
  '/mis/team':                        { lesen: 'personal.lesen', schreiben: 'personal.schreiben' },
  '/mis/training':                    { lesen: 'personal.lesen', schreiben: 'personal.schreiben' },
  '/mis/quality':                     { lesen: 'qm.lesen', schreiben: 'qm.schreiben' },
  '/mis/complaints':                  { lesen: 'qm.lesen', schreiben: 'qm.schreiben' },
  '/mis/privacy':                     { lesen: 'qm.lesen', schreiben: 'qm.schreiben' },
  '/mis/contracts':                   { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/mis/crm':                         { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/mis/documents':                   { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  // Fachliches Abrechnungs-Monitoring. `system.verwalten`, weil die Route
  // dahinter (requireOpsAdmin('system.verwalten')) genau das verlangt —
  // NICHT `berichte.lesen`, obwohl die Seite nur liest: sie zeigt die
  // Geldwege der ganzen Organisation, und die Schnittstelle entscheidet.
  '/admin/monitoring':                { lesen: 'system.verwalten' },

  '/mis/dataroom':                    { lesen: 'system.verwalten' },
  '/mis/settings':                    { lesen: 'system.verwalten' },
  '/mis/ai-assistant':                { lesen: 'system.verwalten' },
  '/mis/signatures':                  { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/mis/supply-chain':                { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/mis/vehicles':                    { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/mis/market':                      { lesen: 'berichte.lesen' },
  '/mis/analytics':                   { lesen: 'berichte.lesen' },

  // ── API ───────────────────────────────────────────────────────────
  '/api/ops/aktivitaetslog':          { lesen: 'audit.lesen' },
  '/api/ops/rechnungen':              { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/api/ops/aufgaben':                { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/api/ops/benachrichtigungen':      { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/api/ops/nachrichten':             { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/api/ops/ereignisse':              { lesen: 'qm.lesen', schreiben: 'qm.schreiben' },
  '/api/ops/eskalationshistorie':     { lesen: 'qm.lesen' },
  '/api/ops/wiedervorlagen':          { lesen: 'qm.lesen', schreiben: 'qm.schreiben' },
  '/api/ops/ereignis-regeln':         { lesen: 'system.verwalten' },
  '/api/ops/eskalationsregeln':       { lesen: 'system.verwalten' },
  '/api/ops/workflow':                { lesen: 'system.verwalten' },

  // Verwaltungs-API
  '/api/admin/analytics':             { lesen: 'berichte.lesen' },
  // Laengerer Praefix schlaegt den kuerzeren: das Bonusmodul liegt zwar
  // unter /analytics, ist aber keine Auswertung — es legt Praemienregeln
  // an und gibt Zahlungen frei. Muss dieselbe Antwort geben wie
  // /admin/bonuses und wie die bonus_*-Policies.
  '/api/admin/analytics/bonuses':     { lesen: 'bonus.verwalten', schreiben: 'bonus.verwalten' },
  '/api/admin/aerzte':                { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/api/admin/angehoerige':           { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/api/admin/clients':               { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/api/admin/budgets':               { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/api/admin/biografiebogen':        { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/api/admin/fixierungen':           { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/api/admin/lagerungsprotokoll':    { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/api/admin/ueberleitung':          { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/api/admin/fristen':               { lesen: 'qm.lesen', schreiben: 'qm.schreiben' },
  '/api/admin/mitarbeitergespraeche': { lesen: 'personal.lesen', schreiben: 'personal.schreiben' },
  '/api/admin/krankenfahrten':        { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/api/admin/ocr':                   { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/api/admin/signaturen':            { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/api/admin/invoices':              { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/api/admin/zuzahlungen':           { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/api/admin/abrechnung':            { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/api/admin/vpkzp':                 { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },

  // Zugangsdaten, Zertifikate und Betriebsschalter der Kassenabrechnung
  // sind KEINE Abrechnungsarbeit — wer sie aendert, kann den Versandweg
  // umleiten. Deshalb Systemverwaltung, nicht Buchhaltung.
  '/api/admin/abrechnung/credentials':   { lesen: 'system.verwalten' },
  '/api/admin/abrechnung/sftp-key':      { lesen: 'system.verwalten' },
  '/api/admin/abrechnung/sftp-test':     { lesen: 'system.verwalten' },
  '/api/admin/abrechnung/zertifikat':    { lesen: 'system.verwalten' },
  '/api/admin/abrechnung/betriebsmodus': { lesen: 'system.verwalten' },
  '/api/admin/abrechnung/itsg':          { lesen: 'system.verwalten' },

  '/api/admin/automatisierung':       { lesen: 'system.verwalten' },
  '/api/admin/monitoring':            { lesen: 'system.verwalten' },
  '/api/admin/pilot':                 { lesen: 'system.verwalten' },
  '/api/admin/kim':                   { lesen: 'system.verwalten' },
  '/api/admin/sync-konflikte':        { lesen: 'system.verwalten' },
  '/api/admin/sync-status':           { lesen: 'system.verwalten' },

  // Vorbehaltsbereiche
  '/api/admin/manage-role':           { lesen: 'benutzer.verwalten' },
  '/api/admin/reset-password':        { lesen: 'benutzer.verwalten' },
  '/api/admin/pricing':               { lesen: 'tarife.lesen', schreiben: 'tarife.schreiben' },
  // BEWUSST NICHT hier: '/api/pricing'. Das ist die Preisauskunft fuer
  // jeden angemeldeten Nutzer (Native App, Kundendashboard) und
  // '/api/pricing/calculate' ist der oeffentliche Preisrechner. Eine
  // Regel darauf wuerde eine Sperre behaupten, die es nicht gibt — und
  // waere die erste, die bei einer spaeteren Proxy-Durchsetzung fuer
  // /api die App und den Rechner abschaltet. Die Tarif-PFLEGE liegt
  // unter '/api/admin/pricing' und '/api/billing/tariffs'.

  // Fach-API
  '/api/akten':                       { lesen: 'stammdaten.lesen', schreiben: 'stammdaten.schreiben' },
  '/api/personal':                    { lesen: 'personal.lesen', schreiben: 'personal.schreiben' },
  '/api/pflege':                      { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/api/wounds':                      { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/api/vitals':                      { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/api/medikamente':                 { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/api/sis':                         { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  // Pflegevisite: das Qualitaetsmanagement prueft und dokumentiert im
  // eigenen Bestand. Die eine Route, die den Regelkreis schliesst
  // (PATCH /api/qm/befunde mit aktion='massnahme'), verlangt im Handler
  // ausdruecklich `pflege.schreiben` — die Rolle `qm` hat sie bewusst
  // nicht, sonst stellte dieselbe Stelle fest und erklaerte fuer erledigt.
  '/api/qm':                          { lesen: 'qm.lesen', schreiben: 'qm.schreiben' },
  '/api/uebergaben':                  { lesen: 'pflege.lesen', schreiben: 'pflege.schreiben' },
  '/api/tours':                       { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/api/einsatzplanung':              { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/api/leistungsnachweis':           { lesen: 'einsatz.lesen', schreiben: 'einsatz.schreiben' },
  '/api/billing':                     { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/api/billing/kim':                 { lesen: 'system.verwalten' },
  // SEPA-Mandate tragen die IBAN der Kundschaft.
  '/api/billing/sepa':                { lesen: 'bankdaten.lesen', schreiben: 'bankdaten.schreiben' },
  // Preiskataloge sind kein Abrechnungsvorgang: lesen darf, wer kalkuliert
  // (pdl, buchhaltung), aendern nur die Administration.
  '/api/billing/tariffs':             { lesen: 'tarife.lesen', schreiben: 'tarife.schreiben' },
  '/api/billing/leistungspreise':     { lesen: 'tarife.lesen', schreiben: 'tarife.schreiben' },
  '/api/rechnungen':                  { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/api/eul':                         { lesen: 'abrechnung.lesen', schreiben: 'abrechnung.schreiben' },
  '/api/expansion':                   { lesen: 'system.verwalten' },
  '/api/fhir':                        { lesen: 'system.verwalten' },
  '/api/sync':                        { lesen: 'system.verwalten' },
  '/api/dipa':                        { lesen: 'system.verwalten' },
}

const LESE_METHODEN: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS'])

function passt(pfad: string, praefix: string): boolean {
  return pfad === praefix || pfad.startsWith(praefix + '/')
}

/** Laengster passender Bereichs-Praefix, oder null. */
export function bereichFuerPfad(pfad: string): string | null {
  let treffer: string | null = null
  for (const praefix of Object.keys(BEREICHE)) {
    if (passt(pfad, praefix) && (treffer === null || praefix.length > treffer.length)) {
      treffer = praefix
    }
  }
  return treffer
}

/**
 * Welche Berechtigung verlangt dieser Aufruf?
 *
 * `null` heisst NICHT „frei" — es heisst „hier gibt es keine Regel".
 * Der Aufrufer entscheidet dann nach seinem eigenen Default; darfPfad()
 * unten laesst in diesem Fall nur die Administration durch.
 */
export function berechtigungFuerPfad(pfad: string, methode = 'GET'): Berechtigung | null {
  const praefix = bereichFuerPfad(pfad)
  if (!praefix) return null
  const regel = BEREICHE[praefix]
  if (LESE_METHODEN.has(methode.toUpperCase())) return regel.lesen
  return regel.schreiben ?? regel.lesen
}

/**
 * Zentrale Zugriffsentscheidung fuer einen Pfad.
 *
 *  - Pfade aus IMMER_ERLAUBT: jede Rolle mit irgendeiner Berechtigung
 *    (sonst koennte eine neue Rolle ihre MFA nicht einrichten).
 *  - Pfad mit Regel: die Regel entscheidet.
 *  - Pfad ohne Regel: nur admin/superadmin.
 */
export function darfPfad(
  rolle: string | null | undefined,
  pfad: string,
  methode = 'GET'
): boolean {
  if (istAdministration(rolle)) return true
  if (IMMER_ERLAUBT.some(p => passt(pfad, p))) {
    // „Irgendeine Berechtigung" = Verwaltungsrolle. Kundschaft und Engel
    // kommen ueber die Bereichszuordnung in proxy.ts ohnehin nicht her.
    return hatBerechtigung(rolle, 'berichte.lesen') || hatBerechtigung(rolle, 'qm.lesen')
  }
  const noetig = berechtigungFuerPfad(pfad, methode)
  if (!noetig) return false
  return hatBerechtigung(rolle, noetig)
}
