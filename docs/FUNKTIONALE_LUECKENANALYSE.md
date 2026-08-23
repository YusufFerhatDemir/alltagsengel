# Funktionale Lückenanalyse — Alltagsengel-Plattform

**Stand:** 2026-08-21
**Scope:** Funktionale Vollständigkeit für den Produktionsbetrieb als Angebot zur
Unterstützung im Alltag nach § 45a/§ 45b SGB XI.
**Ausdrücklich NICHT Gegenstand:** Security, RLS, DSGVO — dafür gelten
`docs/MASTER_FINAL_RELEASE_AUDIT_2026-08-19.md` und `DSGVO-Audit-Report_2026-08-20.md`.

## Methodik

- Quelle ist der Code (`app/`, `lib/`, `components/`, `supabase/migrations/`),
  nicht die vorhandenen Statusberichte. Ältere Abschlussberichte wurden nicht
  übernommen, sondern gegengeprüft.
- Alle Aussagen über den Live-Zustand stammen aus Lesezugriffen auf die
  Produktionsdatenbank über PostgREST (`service_role`, nur `GET`/`HEAD`) und aus
  `npx tsx scripts/go-live-check.ts` (nur lesend), ausgeführt am 21.08.2026.
- Als „vorhanden" zählt nur Code, der von einer Oberfläche oder einem Cron
  tatsächlich aufgerufen wird. Bibliotheken ohne Aufrufer, Demo-Daten und
  Platzhalter zählen als fehlend — das trifft in dieser Analyse drei Module
  (siehe B-04, B-12).
- Nicht verifizierbare Punkte sind als solche benannt und **nicht** als erfüllt
  gewertet.

---

## Zusammenfassung

Die Plattform ist in der Breite ungewöhnlich weit: 14 Portalbereiche, ~330
API-Routen, vollständige Abrechnungs-, Dokumentations- und Workflow-Module. Die
Lücken liegen **nicht** in fehlenden Modulen, sondern an drei Stellen:

1. **Kettenbrüche zwischen fertigen Modulen.** Buchung → Einsatz → Nachweis →
   Rechnung → Zahlung ist an drei Stellen nicht verbunden (B-03, B-09).
2. **Client-Funktionen, die nur im nicht ausgelieferten Expo-Projekt existieren.**
   GPS-Erfassung und Offline-Queue sind in `native/` gebaut — ausgeliefert wird
   aber die Capacitor-Shell auf die Web-UI, und die kennt beides nicht (B-04, B-12).
3. **Stammdaten, die den fail-closed-Sperren zum Opfer fallen.** 8 von 9
   § 45b-Tarifen stehen live auf `blocked`, alle VP/KZP-Tarife auf 0 verifiziert.
   Die Logik ist fertig; die belegten Preise fehlen.

**Betriebsfähig heute:** Privatabrechnung gegen Rechnung (Tarife verifiziert,
Rechnung + PDF + OPOS laufen).
**Nicht betriebsfähig heute:** § 45b-Abrechnung gegen die Pflegekasse — nicht
wegen Technik, sondern wegen fehlender Tarif-Primärquelle und fehlender
Kassenzulassungs-Voraussetzungen.

### Priorisierte Top-10

| # | Befund | Bereich | PRIO | Aufwand |
|---|--------|---------|------|---------|
| 1 | § 45b-Tarife live `blocked` (8/9), VP/KZP 0/4 verifiziert → keine Kassenabrechnung möglich | 7 | P1 | klein (Code) / extern (Beleg) |
| 2 | ~~Angenommene Kundenbuchung erzeugt keinen Einsatz und keinen Leistungsnachweis~~ — **Code geschlossen 21.08.2026 (Track A1)**, offen bleiben die Stammdaten-Verknüpfungen (siehe Bereich 3) | 3 | P1 | mittel |
| 3 | Mahnungen werden erzeugt, aber nie versendet (`dunning_email_queue` hat keinen Konsumenten) | 9 | P1 | klein |
| 4 | Keine manuelle Zahlungserfassung in der Oberfläche (nur CAMT-Datei-Import) | 9 | P1 | klein |
| 5 | Rechnung wird nie zugestellt — kein E-Mail-/Postversand, nur Portal-Download | 5 | P1 | mittel |
| 6 | Offline-Erfassung existiert nur im nicht ausgelieferten Expo-Projekt | 12 | P1 | groß |
| 7 | Kundenstammdaten nach Anlage nur teilweise editierbar, keine Deaktivierung | 1 | P1 | klein |
| 8 | GPS-Nachweis in der ausgelieferten App nicht erfassbar | 4 | P2 | mittel |
| 9 | Einsatzplanung prüft weder Abwesenheit noch Verfügbarkeitsfenster (nur Tourenplanung tut das) | 3 | P2 | klein |
| 10 | Rollenmodell kennt nur admin/kunde/engel/fahrer — PDL, QM, Buchhaltung fehlen | 13 | P2 | mittel |

---

## 1. Kundenverwaltung

**IST**
- Anlage über `app/admin/clients/page.tsx` → `POST /api/admin/clients/route.ts`:
  Kundennummer-Generierung, Pflichtfeldprüfung, Pflegegrad 1–5, Pflegekasse + IK,
  Versichertennummer, Notfallkontakte, Hausarzt. Audit-Eintrag wird geschrieben.
- Automatische Budget-Anlage bei `care_level >= 1` über
  `lib/budget/auto-budget.ts::erstelleInitialBudgets()` — inkl. anteiliger
  Jahresberechnung ab `pflegegrad_seit_monat`. Fehler wandern als `hinweise` in
  die Antwort statt still zu verschwinden.
- Pflegegradänderung als eigener, fachlich sauberer Weg:
  `PATCH /api/admin/clients/[id]/pflegegrad` — Höherstufung legt VP/KZP-Budget
  nach (ab PG 2), Herabstufung löscht kein bestehendes Budget, sondern meldet den
  Fall zur fachlichen Entscheidung.
- Angehörige: `POST /api/admin/angehoerige` + `lib/angehoerige/angehoerige.ts`
  (Zugang erstellen, widerrufen, Freigaben je Bereich, Zugriffsprotokoll).
- Kundenakte `app/admin/kundenakte/[id]/page.tsx`, Biografiebogen, Verträge.

**FEHLT**
- **Stammdaten sind nach der Anlage nur zum Teil änderbar.** Die Whitelist in
  `app/api/admin/clients/[id]/route.ts` (`ALLOWED_FIELDS`) deckt Gesundheits- und
  Notfalldaten ab, aber **nicht** Name, Adresse, PLZ, Ort, Telefon, E-Mail,
  Geburtsdatum. Ein Umzug oder eine Namensänderung ist über die Oberfläche nicht
  abbildbar. — **P1, klein**
- **Keine Deaktivierung / Beendigung der Betreuung.** Weder API noch UI setzen
  `status` oder `pipeline_status`. Ein Kunde, der verstirbt oder kündigt, bleibt
  aktiv; die einzige Alternative ist der DSGVO-Löschweg
  (`app/api/user/delete/route.ts`), der fachlich etwas anderes ist. — **P1, klein**
- **Kein Wiedervorlage-/Statuswechsel-Workflow** für die `pipeline_status`-Kette
  (`erstgespraech` → aktiv → beendet). Das Feld wird beim Anlegen gesetzt und
  danach nie wieder.  — **P2, klein**
- **Kein Kassenwechsel-Vorgang.** `pflegekasse_ik` ist ein einfaches Feld ohne
  Historie — nach einem Kassenwechsel lassen sich Altrechnungen nicht mehr der
  damals zuständigen Kasse zuordnen. — **P2, mittel**
- **Statusfalle bei der Neuanlage:** Solange `20260907010000_clients_status_check.sql`
  nicht angewendet ist, degradiert die Anlage bewusst auf `status='inactive'`
  (Kommentar in `route.ts`). `lib/personal/einsatzfreigabe.ts::pruefeClientFreigabe()`
  akzeptiert aber nur `aktiv`/`active`/`neu` — ein so angelegter Kunde ist damit
  sofort für jede Einsatzplanung gesperrt, ohne dass die Meldung das erklärt.
  (Die vier Live-Kunden stehen auf `active`, der Fall trifft also nur Neuanlagen.)
  — **P1, klein** (Migration anwenden oder Fallback auf `neu` ändern)

---

## 2. Mitarbeiter / Engel

**IST**
- Anlage über `app/admin/personal/page.tsx` → `POST /api/personal/stammdaten`
  (bewusst immer ohne Einsatzfreigabe), Mitarbeiterakte
  `app/admin/mitarbeiterakte/[id]/page.tsx`.
- Qualifikationen inkl. Ablaufdatum: `app/api/personal/qualifikationen/*`,
  Ablaufübersicht `GET /api/personal/qualifikationen/ablauf`, Anzeige in
  `app/admin/qualifikationen` und `app/admin/einsatzfreigabe`.
- Einsatzfreigabe als harte Sperre: `lib/personal/einsatzfreigabe.ts` prüft
  Mitarbeiterstatus, Vertragsstatus, Freigabe-Flag und die Pflichtqualifikationen
  Führungszeugnis + Erste Hilfe. Wird in `/api/einsatzplanung` und `/api/tours`
  vor jedem Schreibvorgang aufgerufen.
- Arbeitszeiten inkl. Konto und Korrekturen, Urlaubskonto, Abwesenheiten mit
  Genehmigen/Ablehnen (`app/api/personal/abwesenheiten/[id]/genehmigen`),
  Dienstplan (Schichten, Einträge, Tagesansicht), Schulungen,
  Mitarbeitergespräche, Personal-Audit.
- Engel-Portal: Profil, Qualifikationen, Dokumente (Upload über
  `lib/upload-document.ts`), Verfügbarkeit, Dienstplan, Urlaub, Arbeitszeiten,
  Einsätze, Aufgaben, Chat.

**FEHLT**
- **Zwei parallele Dokumentenwelten.** `app/engel/dokumente/page.tsx` liest aus
  `akten_dokumente` **und** `documents`, lädt aber ausschließlich nach `documents`
  hoch; die Admin-Aktenverwaltung (`app/admin/dokumente`) arbeitet nur mit
  `akten_dokumente`. Ein Engel-Upload landet dadurch nicht in der Akte, die der
  Prüfer sieht. — **P2, mittel**
- **Keine automatische Erinnerung vor Ablauf einer Qualifikation.** Die
  Ablauf-Auswertung existiert, wird aber nur beim Öffnen der Seite gezogen — die
  tägliche Automatisierungskette (`lib/automation/index.ts`) enthält sie
  ausdrücklich nicht („Kette 4 absichtlich nicht hier"). Ein abgelaufenes
  Führungszeugnis fällt erst auf, wenn die Einsatzplanung blockt. — **P2, klein**
- **Verfügbarkeitsfenster ohne Wirkung in der Planung** — siehe Bereich 3.
- **Kein Bewerbungs-/Onboarding-Workflow bis zur Freigabe.** `app/admin/applications`
  existiert, ist aber nicht mit `POST /api/personal/stammdaten` verbunden; aus
  einer Bewerbung wird kein Mitarbeiterdatensatz. — **P3, mittel**

---

## 3. Einsatzplanung

**IST**
- `POST/PATCH /api/einsatzplanung` schreibt `assignments` und prüft davor
  Einsatzfreigabe, Klient-Freigabe (inkl. aktivem Vertrag) und Budget
  (§ 45b warnt, VP/KZP blockiert hart).
- Doppelbelegung wird auf DB-Ebene durch den Trigger `check_assignment_overlap`
  verhindert (`supabase/migrations/20260808200000_einsatzplanung_leistungsnachweise.sql`,
  erweitert in `20260809120000_tourenplanung.sql`).
- Tourenplanung als eigene Schicht: `app/api/tours/*`, `lib/touren/server.ts`,
  Vertretungsregelung, Vorlagen, Wochenansicht `app/admin/tourenplanung`.
- Kalender/Dienstplan-Oberflächen: `app/admin/kalender` (847 Z.),
  `app/admin/schedule` (754 Z.), `app/admin/dienstplan`.

**GESCHLOSSEN am 21.08.2026 (Track A1)**
- **Die Kundenbuchung endete im Nichts.** `bookings` und `assignments` waren
  zwei getrennte Welten: `app/api/bookings/respond/route.ts` setzte nur
  `bookings.status` — es entstand weder ein `assignment` noch ein
  `service_record`.
- Neu: `lib/bookings/einsatz-kette.ts`. Bei `action='accept'` entsteht jetzt
  ein `assignment` (Status `GEPLANT`) **und** ein `service_record`-Entwurf
  (`status='draft'`, `proof_status='ENTWURF'`, `billing_status='OFFEN'`,
  ohne Betrag). Beides läuft durch dieselben Prüfungen wie
  `POST /api/einsatzplanung` (Klient-Freigabe inkl. aktivem Vertrag,
  Einsatzfreigabe inkl. Pflichtqualifikationen, Budget) und wird im
  Audit-Trail festgehalten.
- Fail-closed und mit Rollback: reisst die Kette, geht die Buchung auf
  `pending` zurück; scheitert der Nachweis, wird der eben angelegte Einsatz
  wieder entfernt. `force_override` (nur admin/superadmin, protokolliert)
  nimmt eine Buchung ohne Einsatz an. Abdeckung:
  `__tests__/e2e/buchung-einsatz-kette.test.ts` (20 Tests).
- Drei Brücken werden dabei geschlagen:
  `bookings.customer_id → clients.user_id`,
  `bookings.angel_id → caregivers.user_id`,
  `bookings.service → Tarif-Schlüssel` (über `tarifLeistungsart()`).

**FEHLT — Voraussetzungen, damit die Kette live etwas erzeugt**
- **`clients.user_id` ist live bei allen 4 Klienten NULL**, `caregivers.user_id`
  bei 1 von 2 Mitarbeitern. Die Profile der bestehenden Buchungskunden
  (`maria@example.com`, `admin@alltagsengel.de`, `info@dripfy.de`) haben
  ausserdem keine E-Mail-Entsprechung im Klientenstamm. Solange die
  Verknüpfung fehlt, läuft jede Annahme in `KEIN_KLIENT` bzw.
  `KEINE_BETREUUNGSKRAFT` — laut statt still, aber ohne Einsatz.
  Es fehlt eine Oberfläche, die Kundenprofil und Klientendatensatz
  verbindet (bzw. aus einer Buchung einen Klienten anlegt). — **P1, mittel**
- **`einsatzfreigabe` steht live bei beiden Mitarbeitern auf `false`.** Auch
  bei gesetzter Verknüpfung blockiert `EINSATZFREIGABE_FEHLT`, bis
  Führungszeugnis und Erste-Hilfe-Nachweis hinterlegt sind. Das ist gewollt,
  aber es ist ein Stammdaten-Blocker, kein Code-Blocker. — **P1, klein**
- **Die Buchungsmasken benutzen ein drittes Leistungsart-Vokabular.**
  `app/kunde/buchen-service` bietet 'Freizeit', 'Apotheke', 'Aktivitäten' an,
  `app/kunde/buchen/[id]` zusätzlich 'Freizeitbegleitung', 'Krankenfahrdienst',
  'Hygienebox' — für keine davon gibt es einen Tarif. Track A1 bildet nur
  reine Schreibvarianten ab ('Haushalt'→'Haushaltshilfe', 'Einkauf',
  'Arztbesuch', 'Spazieren'); die übrigen laufen fail-closed in
  `KEINE_TARIFZUORDNUNG`. Welcher Tarif für sie gilt, ist eine Preis-
  entscheidung und wurde bewusst nicht geraten. — **P1, klein (nach Tarifentscheid)**
- **Abwesenheit wird in der Einsatzplanung nicht geprüft.** Die Prüfung existiert
  nur in `lib/touren/server.ts` und greift nur über `POST /api/tours`. Über
  `/api/einsatzplanung` lässt sich einem Engel im genehmigten Urlaub ein Einsatz
  zuweisen. — **P2, klein** (vorhandene Prüffunktion mitbenutzen)
- **Verfügbarkeitsfenster werden nicht gegen die Planung geprüft.**
  `lib/availability.ts::istVerfuegbar()` wird nur vom Kunden-Matching
  (`/api/engel/match`) und den Buchungsseiten genutzt, nicht von der
  Einsatzplanung. — **P2, klein**
- **Keine Konfliktanzeige in der Oberfläche.** Kalender und Schedule enthalten
  keinerlei Konflikt-/Überschneidungslogik; ein Konflikt äußert sich erst als
  Datenbankfehler beim Speichern. — **P2, mittel**
- **Keine Serientermin-Pflege.** `recurrence_rule` wird gespeichert, aber es gibt
  keinen Weg, eine Serie als Ganzes zu ändern oder zu beenden. — **P2, mittel**
- **Keine Routen-/Fahrzeitberechnung.** Die Tourenplanung schätzt über PLZ-Nähe,
  echtes Routing fehlt (bekannt, dokumentiert). — **P3, groß**

---

## 4. Leistungsnachweise

**IST**
- Erfassung: `POST /api/leistungsnachweis/crud` mit Vorabprüfung der
  Abrechenbarkeit (`pruefeLeistungsart()`), Org-Zugehörigkeit von Klient und
  Mitarbeiter, Budgetprüfung (VP/KZP blockiert, § 45b warnt),
  `duration_minutes` bewusst als GENERATED-Spalte ausgelassen.
- Statuskette sauber gehalten: `lib/leistungsnachweis/status-sync.ts` hält
  `status` (`draft`→`signed`→`invoiced`) und `proof_status`
  (`ENTWURF`→`UNTERSCHRIEBEN`→`ABGERECHNET`) synchron und verhindert Rückfälle.
- Digitale Unterschrift: `components/admin/SignaturePad.tsx`, eingebunden in
  `app/engel/einsaetze`, `app/admin/leistungsnachweis-digital`,
  `app/admin/records/new`.
- Kundensicht `app/kunde/leistungsnachweis/page.tsx` (Ansicht, kein Entwurf).
- Nachweis-PDF: `lib/abrechnung/leistungsnachweis-pdf.ts` (mit `registerFontkit`,
  siehe Memory-Eintrag zum früheren 500er).
- Upload-Weg für Papierbelege: `app/admin/leistungsnachweis-upload`,
  `POST /api/native/leistungsnachweis-upload`.

**FEHLT**
- **GPS wird in der ausgelieferten App nicht erfasst.** `service_records`
  hat `gps_start_lat/lng`, die CRUD-Route nimmt sie entgegen, und
  `POST /api/native/geo-events` prüft sogar den Radius um den Einsatzort. Die
  einzigen Aufrufer liegen in `native/src/app/einsatz/*` — also im Expo-Projekt,
  das laut `native/WARNUNG-NICHT-SUBMITTEN.md` **nicht** ausgeliefert wird. In der
  produktiven Capacitor-Shell auf die Web-UI gibt es keinen einzigen
  `getCurrentPosition()`-Aufruf. GPS-Nachweis ist damit faktisch nicht vorhanden.
  — **P2, mittel** (P1, sobald eine Kasse GPS-Nachweise verlangt)
- **Keine Unterschrift durch den Kunden im Kundenportal.** Unterschrieben wird
  ausschließlich auf dem Gerät der Betreuungskraft. Für Nachträge oder
  Korrekturen gibt es keinen Kundenweg. — **P3, mittel**
- **Kein Sammel-/Monatsnachweis als PDF zum Gegenzeichnen.** Die
  Prüfmappe (`GET /api/admin/analytics/pruefmappe`) liefert JSON, kein
  druckbares Dokument — siehe Bereich 8. — **P2, mittel**

---

## 5. Abrechnung § 45b

**IST**
- Gesetzliche Werte versioniert und fail-closed: `lib/config/budget-constants.ts`
  — 131 €/Monat, 1 572 €/Jahr ab 2025, 125 €/1 500 € für 2024. Für ein Jahr ohne
  Eintrag wird bewusst geworfen statt geraten. Live bestätigt für 2026.
- Budgetprüfung: `lib/billing/core/budget-cap.ts` + `pruefeBudget()` — Monats-
  und Jahresdeckel für § 45b/§ 42a, § 36 bewusst ungedeckelt.
- Rechnungserstellung: `lib/billing/core/invoice-engine.ts`
  (`create_invoice_draft_atomic`), Korrekturrechnungen/Gutschriften
  (`credit-notes.ts`), Zahlungsziel (`zahlungsziel.ts`, Standard 14 Tage),
  Nummernkreis, Statusmaschine, Idempotenz.
- Automatischer Rechnungsabschluss: `POST /api/billing/auto-invoice` erzeugt die
  Rechnung, sobald **alle** Einsätze eines Klienten im Monat unterschrieben sind —
  auslösbar auch aus der App.
- Monatsabschluss `lib/abrechnung/monatsabschluss.ts` mit benannten Preislücken
  statt stiller Nullwerte.
- Rechnungs-PDF (`app/api/admin/invoices/[id]/generate-pdf`), XRechnung/ZUGFeRD
  (`lib/billing/xrechnung/`), DATEV-Export, SEPA-Lastschrift (pain.008).

**FEHLT**
- ~~**Die Rechnung erreicht den Kunden nicht.**~~ **GESCHLOSSEN (Track A2,
  21.08.2026).** `lib/billing/versand/rechnung-versand.ts` erzeugt das
  Belegpaket-PDF (`lib/pdf/rechnung-paket.ts`, aus der Route herausgelöst) und
  schickt es mit `sendRawEmail()` als Anhang an die Klienten-Adresse.
  Zustellstatus führt `invoices.sent_at` + `versand_elektronisch`, die
  Versuchshistorie `invoice_email_log` (Migration 20260823000000).
  Auslöser: `POST /api/billing/invoices/[id]/versenden` (Button im
  Rechnungsdetail) und optional automatisch nach der Festschreibung, wenn
  `RECHNUNGSVERSAND_AUTOMATISCH=1` gesetzt ist. Ohne `RESEND_API_KEY` meldet
  der Pfad 'uebersprungen' und lässt `sent_at` leer, damit später
  nachversendet wird. Tests: `__tests__/billing/rechnung-versand.test.ts`.
  OFFEN bleibt der Post-/PDF-Sammelversand. — **P3, klein**
- **Kein Rechnungslauf über alle Kunden.** `auto-invoice` arbeitet je Klient und
  Monat; einen Sammellauf „alle Kunden, Monat X" gibt es weder als Cron noch als
  Button. Bei 4 Kunden irrelevant, ab ~30 Kunden nicht mehr. — **P2, mittel**
- **Jahresübertrag nur manuell.** `uebertrageJahresbudgets()` hängt an
  `POST /api/admin/budgets/jahresuebertrag` — dazu existiert **keine
  Oberfläche** (kein Treffer für `jahresuebertrag` in `app/**/*.tsx`) und kein
  Cron. Der § 45b-Übertrag ins Folgejahr (verfällt zum 30.06.) passiert also nur,
  wenn jemand die Route von Hand aufruft. — **P1, klein**
- **Eigenanteil/Zuzahlung ist nicht durchgängig.** `app/admin/zuzahlungen`
  existiert, aber die Rechnung trennt Budget- und Privatanteil nur über
  `budget_amount`/`private_amount`; einen Kundenweg für den Eigenanteil
  (Zahlungsaufforderung, Lastschrift auf den Differenzbetrag) gibt es nicht.
  — **P2, mittel**

---

## 6. Verhinderungspflege / Kurzzeitpflege

**IST**
- Gesetzliche Werte 2026 hinterlegt und live bestätigt: VP 1 685 €, KZP 1 854 €,
  kombiniert 3 539 €, ab PG 2 (`budget-constants.ts`).
- Kombinationsbudget wird geprüft: `pruefeVPBudget()` rechnet gegen
  `combined_used_amount`, `VERHINDERUNG_BUDGET_TYPEN` in
  `lib/billing/core/budget-cap.ts` fasst `verhinderung`/`verhinderungspflege`/
  `kurzzeitpflege` zusammen.
- Überschreitung blockiert die Nachweiserfassung hart (nur mit
  `force_override` übersteuerbar, mit Audit-Eintrag).
- Budget-Anlage ab PG 2 automatisch bei Kundenanlage und Höherstufung.

**FEHLT**
- **Keine verifizierten VP/KZP-Tarife.** `go-live-check` meldet
  „Verifizierte VP/KZP-Tarife: 0 von 4". Ohne verifizierten Tarif liefert der
  Price-Resolver keinen Preis — VP/KZP ist damit rechnerisch nicht abrechenbar.
  — **P1, klein (Code) / extern (Vergütungsvereinbarung)**
- **Kein Antragsweg.** VP nach § 39 setzt einen Antrag der pflegebedürftigen
  Person bei der Kasse voraus; im System gibt es weder ein Antragsformular noch
  eine Statusverfolgung „beantragt / bewilligt / abgelehnt". Die öffentliche Seite
  `app/verhinderungspflege/page.tsx` ist reines Marketing. — **P2, mittel**
- **Keine 6-Wochen-/8-Wochen-Grenze und keine Vorpflegezeit-Prüfung.** Nur der
  Geldbetrag wird gedeckelt, nicht die gesetzliche Höchstdauer. — **P2, mittel**
- **Keine getrennte Rechnungsdarstellung.** VP-Leistungen laufen über dieselbe
  Rechnung wie § 45b; eine je Anspruchsgrundlage getrennte Abrechnung, wie sie
  Kassen erwarten, entsteht nur indirekt über `budget_type`. — **P2, mittel**

---

## 7. Tariflogik

**IST**
- Drei Preisquellen, alle mit `tarif_status`-Sperrklinke:
  `billing_tariffs` (24 Zeilen live), `leistungspreise` (24 Zeilen, Leistungs-
  komplexe Hessen), `service_pricing`.
- Fail-closed durchgezogen: `lib/billing/core/price-resolver.ts` und
  `lib/abrechnung/monatsabschluss.ts` liefern nur für `tarif_status='verified'`
  **und** am Leistungsdatum gültige Einträge einen Preis; sonst eine benannte
  Lücke statt eines geratenen Werts.
- Belegpflicht auf DB-Ebene (Migration `20260904000000`), Tarif-Audit
  unveränderlich, Verifizierungs-UI unter `/admin/kassenabrechnung/tarife`.
- Zuschlagsrechnung vorhanden: `calculateLineTotal()` rechnet Feiertag ODER
  Wochenende, plus Nacht kumulativ; Feiertagslogik inkl. Landesfeiertagen in
  `lib/billing/core/feiertage.ts` (bewegliche Feiertage über Osterformel).

**Live-Befund (21.08.2026)**

| Rechtsgrundlage | Einträge | Status |
|---|---|---|
| privat | 10 | alle `verified`, 38–45 €/Std |
| § 45b SGB XI | 9 | **8 `blocked`** (je 35 €/Std), nur Wegepauschale (5 €) verified |
| § 39 SGB XI | 4 | alle `blocked` (je 35 €/Std) |
| `leistungspreise` (Hessen) | 24 | alle `unverified` |

**FEHLT**
- **Die belegten Sätze der Vergütungsvereinbarung fehlen.** Die 35 €/Std in den
  § 45b-/§ 39-Tarifen sind Ersteinrichtungswerte ohne Primärquelle und deshalb
  zu Recht `blocked`. Die real anzusetzenden Sätze (z. B. 30 €/25 € je nach
  Qualifikation) sind **nirgends** im Repository hinterlegt — weder in
  `billing_tariffs`, noch in `leistungspreise`, noch als Beleg unter
  `docs/`. Ohne sie bleibt § 45b gesperrt. — **P1, klein (Eintrag) / extern (Bescheid)**
- **Keine Qualifikationsstaffelung.** `billing_tariffs.qualifikation` ist in
  allen 24 Live-Zeilen `null`. Eine Preisdifferenzierung Fachkraft/Hilfskraft —
  genau der Fall „30 € vs. 25 €" — ist im Schema vorgesehen, aber nicht bedatet,
  und der Price-Resolver bekommt die Qualifikation der eingesetzten Kraft auch gar
  nicht übergeben. — **P1, mittel**
- **Feiertagszuschläge sind wirkungslos.** `billing_feiertage` ist live **leer**
  (0 Zeilen), und alle 24 Tarife haben `zuschlag_feiertag_prozent = 0`,
  `zuschlag_wochenende_prozent = 0`, `zuschlag_nacht_prozent = 0`. Der
  Wochenendtarif wird stattdessen über eine eigene Leistungsart
  (`wochenendbetreuung`) abgebildet — dann muss die Erfassung die richtige
  Leistungsart wählen, was niemand prüft. Es gibt außerdem keinen Befüllungs-Job
  für `billing_feiertage`, obwohl `bundesweiteFeiertage()`/`landesFeiertage()`
  die Daten berechnen könnten. — **P2, klein**
- **Kein Kombinationsabschlag im Einsatz.** `kombinations_abschlag_prozent`
  existiert als Spalte, ist überall 0 und wird von `calculateLineTotal()` nicht
  gelesen. — **P3, klein**

---

## 8. Dokumentation (Pflege, Wunde, SIS, Vitalwerte)

**IST**
- Pflegedoku vollständig als API: Anamnesen, Aufnahmen, Diagnosen, Risiken,
  Maßnahmen + Maßnahmenpläne, Berichteblatt, Verlauf, Doku-Perioden,
  Sturzprotokoll (`app/api/pflege/*`).
- Wunddokumentation: `app/api/wounds/*` inkl. Assessments, Behandlungen, Fotos,
  Verlauf; Admin-UI `app/admin/wunddokumentation`.
- SIS: `app/api/sis/assessments`, Themenfelder + Risikomatrix, Admin-UI.
- Vitalwerte: 10 Parameter, Grenzwertalarme fail-closed hinter
  `VITALS_GRENZWERT_ALARME_AKTIV`, PDL-Meldekette in der täglichen
  Automatisierung (`lib/automation/vitalwerte-pdl.ts`).
- Medikamentenmanagement mit Eingaben-Erfassung durch den Engel.
- Engel-Portal kann erfassen: Vitalwerte (`POST /api/vitals`), Medikamentengaben,
  Pflegeverlauf (`POST /api/pflege/verlauf`).

**FEHLT**
- **Kein PDF-/Druckexport der Dokumentation.** Weder Pflegedoku, Wunddoku, SIS
  noch Vitalwerte lassen sich als Dokument ausgeben (`grep pdf` über
  `app/api/pflege|wounds|sis|vitals` → 0 Treffer). Die Prüfmappe liefert JSON.
  Bei einer MDK-/Kassenprüfung ist nichts vorlegbar außer Bildschirmansichten.
  — **P2, mittel** (P1, sobald eine Prüfung angekündigt ist)
- **Wunddoku und SIS sind im Engel-Portal nicht vorhanden.** Beide existieren nur
  unter `/admin`. Die Kraft vor Ort kann sie nicht führen; Nacherfassung durch
  die Verwaltung widerspricht dem Dokumentationsgrundsatz der zeitnahen
  Erfassung. Für reine § 45b-Alltagsbegleitung ist beides fachlich nicht
  zwingend — relevant wird es mit dem Pflegedienst. — **P2, mittel**
- **Pflegedoku im Engel-Portal ist überwiegend lesend.**
  `app/engel/pflegedoku/[clientId]` zeigt Diagnosen, Risiken, Maßnahmenplan und
  Verlauf an; schreiben kann der Engel nur den Verlaufseintrag. — **P3, mittel**
- **Live sind alle Dokumentationstabellen leer** (`wounds` 0, `sis_assessments` 0,
  `medikamente` 0). Die Module sind gebaut, aber noch nie im Betrieb erprobt —
  aus dieser Analyse heraus nicht als „funktionierend" bestätigbar.

---

## 9. Mahnwesen / OPOS

**IST**
- OPOS-Liste und Klientensalden: `lib/billing/opos/opos-manager.ts`,
  UI `app/admin/forderungen`, `app/admin/zahlungskontrolle`.
- Mahnstufen mit klarer Fristenkette (14/28/42/56/70 Tage nach Fälligkeit),
  `advanceDunning()`, Sperrgründe (`checkDunningBlocks`), Mahnlauf
  `runDunningRun()`.
- Täglicher Cron `POST /api/cron/mahnlauf` (07:00, `vercel.json`), eskaliert
  höchstens eine Stufe je Rechnung und Lauf, mit `CRON_SECRET`-Schutz.
- Mahnungs-PDF + E-Mail-Text: `lib/billing/dunning/mahnung-pdf.ts`.
- Zahlungseingang über CAMT-Import mit Auto-Matching:
  `POST /api/billing/camt/import`, Klärfälle, manuelle Zuordnung
  (`app/admin/zahlungseingaenge/zuordnung` → `/api/billing/payments/allocate`).

**FEHLT**
- ~~**Mahnungen werden nie versendet.**~~ **GESCHLOSSEN (Track A3,
  21.08.2026).** `lib/billing/dunning/mahn-versand.ts` ist der Konsument von
  `dunning_email_queue`: er liest die wartenden Einträge, erzeugt das
  Mahnschreiben als echtes PDF (`mahnung-pdf-datei.ts` — bis dahin gab es nur
  HTML und keinen HTML→PDF-Renderer im Projekt) und verschickt es mit Anhang.
  Idempotenz: der Eintrag wird VOR dem Senden per `status='wartend'`-gefiltertem
  UPDATE beansprucht; ein paralleler Lauf trifft keine Zeile mehr. Vor jedem
  Versand wird die Rechnung erneut gelesen — ist sie inzwischen bezahlt oder
  blockiert, wird der Eintrag storniert statt gemahnt. Auslöser:
  `POST /api/billing/dunning/versand` (Button in `/admin/mahnwesen`) und der
  Cron `/api/cron/mahnlauf`, dort nur mit `MAHNVERSAND_AUTOMATISCH=1`.
  Tests: `__tests__/billing/mahn-versand.test.ts`.
- ~~**Keine manuelle Zahlungserfassung in der Oberfläche.**~~ **GESCHLOSSEN
  (Track A4, 21.08.2026).** `components/admin/ZahlungErfassenDialog.tsx`,
  eingebunden in `/admin/forderungen` je offener Forderung. Bucht über
  `POST /api/billing/payments` mit neuer `invoiceId` in den Kern (payments →
  payment_allocations → `invoices.paid_amount` → `dunning_entries`) inklusive
  Audit-Trail. Teilzahlung, Vollzahlung und Überzahlung werden ausgewiesen; der
  Server ordnet höchstens den offenen Betrag zu, ein Überschuss bleibt als nicht
  zugeordneter Zahlungseingang stehen. Zahlungsarten sind exakt die vom DB-CHECK
  erlaubten — ein „Sonstiges" gibt es dort nicht.
  Tests: `__tests__/billing/zahlung-manuell-erfassen.test.ts`.
  ANMERKUNG: der ältere Dialog unter `/admin/zahlungskontrolle` schreibt
  weiterhin nur in die Alt-Tabelle `payment_status` und erzeugt keine
  Kern-Buchung — er bleibt unangetastet. — **P2, klein**
- **Live noch nie gelaufen:** `payments` 0 Zeilen, `dunning_entries` 0 Zeilen bei
  3 Rechnungen. Der Mahnlauf hat also noch nie einen realen Fall bearbeitet.
- **Kein Inkasso-Übergabeweg.** Stufe „Inkasso-Vorbereitung" existiert als
  Status, danach passiert nichts (kein Export, kein Dokument). — **P3, mittel**
- **Keine Ratenzahlung / Stundung.** — **P3, mittel**

---

## 10. Admin / Dashboard

**IST**
- KPI-Dashboard `lib/analytics/kpi.ts` → `/api/admin/analytics/kpi`,
  PDL-Cockpit, Qualitätskennzahlen, Ops-Audit, Bonus-Engine.
- Go-Live-Dashboard `app/admin/go-live` mit derselben Logik wie
  `scripts/go-live-check.ts` — die verlässlichste Übersicht im System.
- Sehr breite Admin-Navigation (78 Bereiche unter `app/admin/`).
- Mandantenumschaltung `POST /api/organizations/switch`, Abo-Status,
  Zertifikatsverwaltung.

**FEHLT**
- **Drei konkurrierende Einstiegsseiten.** `/admin/home` (Nutzer-/Buchungs-
  zählungen), `/admin/dashboard` und `/mis` zeigen unterschiedliche Bilder
  desselben Betriebs. `/admin/home` zählt Plattform-Metriken (Benutzer, Buchungen,
  Plattform-Gebühren) statt der Betriebskennzahlen (offene Nachweise, fällige
  Rechnungen, Budgetausschöpfung). Der Befund aus dem UX-Audit vom 13.08. besteht
  fort. — **P2, mittel**
- **Keine Mandantenverwaltung.** Es gibt `switch`, `subscription` und
  `zertifikat`, aber keinen Weg, eine Organisation anzulegen, umzubenennen oder
  zu deaktivieren. Live existieren 6 Organisationen, davon **5 Testmandanten**
  (`E2E_TEST_*`) — sie lassen sich über die Oberfläche nicht entfernen und stehen
  im Go-Live-Check als Blocker. — **P2, mittel**
- **Kein Rollen-/Rechte-UI jenseits von „Admin ja/nein".**
  `POST /api/admin/manage-role` kennt nur `grant`/`revoke` der Admin-Rolle
  (nur `superadmin` darf das). — siehe Bereich 13. — **P2, mittel**
- **Keine betriebliche Tagesübersicht** („Wer ist heute wo, was ist offen,
  was ist eskaliert") — die Information verteilt sich auf Dienstplan,
  Tourenplanung, Aufgaben und Eskalationen. — **P2, mittel**

---

## 11. Benachrichtigungen

**IST**
- Drei Kanäle in `lib/notifications.ts`: In-App (`notifications`-Tabelle, live
  191 Einträge), E-Mail über Resend, Web-Push über VAPID (`lib/push.ts`) und
  FCM V1 für die App (`lib/fcm.ts`). HTML-Escaping für alle Nutzereingaben.
- Ops-Benachrichtigungen mit Zähler, Gelesen-Markierung und Präferenzen
  (`app/api/ops/benachrichtigungen/*`, `app/api/ops/praeferenzen`).
- Ereignis- und Eskalationsregeln (`app/api/ops/ereignis-regeln`,
  `eskalationsregeln`, `eskalationshistorie`), Workflow-Engine mit
  Dead-Letter-Queue.
- Service Worker `public/sw.js` (v3) mit Push-Handler,
  `components/PushProvider.tsx`, `components/NotificationBell.tsx`.

**FEHLT**
- **Keine Terminerinnerung an Kunden oder Angehörige.** Es gibt Erinnerungen für
  fehlende Nachweise und Unterschriften, aber keine „Ihr Termin morgen um 10 Uhr".
  — **P2, klein**
- **Kein SMS-Kanal.** `lib/whatsapp` existiert für eingehende Nachrichten;
  ausgehende SMS/WhatsApp-Benachrichtigung an Kunden ohne App fehlt. — **P3, mittel**
- **Kein Benachrichtigungs-Log / keine Zustellkontrolle.** Fehlgeschlagene
  Resend-Sendungen werden nur geloggt (`log.errorWithException`), nicht
  persistiert — ob eine Mail angekommen ist, lässt sich nicht nachweisen.
  — **P2, mittel**
- **Push braucht gesetzte VAPID-/FCM-Schlüssel**; ohne sie überspringt der Code
  still den Versand (`log.info('VAPID keys not configured — push skipped')`). Ob
  sie in der Produktionsumgebung gesetzt sind, ist von hier aus nicht prüfbar
  (kein Vercel-Login) — siehe Abschnitt „Nicht verifizierbar".

---

## 12. Offline-Fähigkeit

**IST**
- Vollständige Offline-Bibliothek in `lib/offline/`: verschlüsselter
  IndexedDB-Store (AES-GCM), Queue mit Idempotenzschlüsseln, Retry mit
  Backoff, Konflikt-Log, Audit-Log, GPS- und Kamera-Adapter.
- Serverseitige Gegenstelle vollständig: `POST /api/sync` mit Entity-Registry,
  Konflikterkennung (`lib/sync/conflict.ts`), Audit, Dead-Letter;
  Admin-Oberflächen `app/admin/sync-status` und `app/admin/sync-konflikte`.
- Service Worker cacht die App-Shell (`public/sw.js`, 137 Zeilen).

**FEHLT**
- **Die Offline-Bibliothek hat in der Web-App keinen einzigen Aufrufer.** Ein
  Import von `@/lib/offline` außerhalb von `lib/offline` selbst findet sich nur in
  `app/api/sync/route.ts` und `lib/sync/*` — und dort ausschließlich als
  **Typ-Import**. Keine Seite, keine Komponente reiht jemals etwas in die Queue
  ein. Die einzigen echten Nutzer stehen in `native/src/lib/offline-queue.ts` —
  im nicht ausgelieferten Expo-Projekt.
- **Was heute bei Netzausfall passiert:** Der Service Worker liefert die
  App-Shell aus dem Cache; jeder `fetch` auf eine API-Route schlägt fehl. Eine
  begonnene Nachweiserfassung, eine Unterschrift oder eine Vitalwertmessung
  gehen verloren. Für Einsätze in Wohnungen mit schlechtem Empfang — dem
  Normalfall dieses Geschäfts — ist das der praktisch relevanteste Mangel.
- **P1, groß** — entweder die vorhandene Queue in die Web-UI einbinden
  (Leistungsnachweis, Unterschrift, Vitalwerte, Medikamentengabe) oder die
  native App produktiv nehmen. Die Serverseite ist fertig; es fehlt die
  Client-Anbindung.

---

## 13. Rollen und Rechte

**IST**
- Serverseitiges Routing-Gating in `proxy.ts`: `ROLE_ACCESS`, `ROLE_HOME`,
  `PROTECTED_PREFIXES`, Rolle aus `app_metadata.role` (manipulationssicher) mit
  Fallback auf `profiles.role`; `user_metadata.role` wird bewusst ignoriert.
- Rollenvergabe nur durch `superadmin` (`/api/admin/manage-role`), mit
  Audit-Eintrag; DB-Trigger `prevent_role_escalation` gegen Selbst-Erhöhung.
- Je Route zusätzlich Rollenprüfung (`requireAdmin`, `requireOpsAdmin`,
  `requireAngehAdmin`, `requireCaregiverSession`).

**FEHLT**
- **Das Rollenmodell kennt fünf Rollen: `admin`, `superadmin`, `kunde`, `engel`,
  `fahrer`.** Für einen Pflegebetrieb fehlen damit:
  - **PDL** — obwohl `/admin/pdl-cockpit` existiert, gibt es die Rolle nicht;
    eine PDL braucht heute volle Admin-Rechte inklusive Abrechnung und
    Rollenvergabe.
  - **QM** — `/admin/quality` ist Admin-only.
  - **Buchhaltung** — kein Weg, jemandem Rechnungen und Mahnwesen zu geben,
    ohne Personal- und Gesundheitsdaten mit auszuliefern.
  — **P2, mittel**
- **`angehoerige` ist keine geführte Rolle.** `/angehoerige` steht **nicht** in
  `PROTECTED_PREFIXES` und hat keinen `ROLE_ACCESS`/`ROLE_HOME`-Eintrag; der
  Schutz hängt allein am Client-Guard in `app/angehoerige/layout.tsx`. Der
  Login-Umweg funktioniert nur, weil `app/auth/login/page.tsx` eigens
  `angehoerigen_zugaenge` abfragt. — **P2, klein**
- **Login-Weiterleitung liest `user_metadata.role`** (`app/auth/login/page.tsx:220`)
  — genau die Quelle, die `proxy.ts` als unsicher verwirft. Für die
  Zugriffskontrolle unerheblich (die Middleware entscheidet), aber wer nur
  `profiles.role` gesetzt hat, landet nach dem Login auf `/kunde/home` statt im
  richtigen Portal. — **P2, klein**
- **Kein Vier-Augen-Prinzip** für kritische Vorgänge (Rechnungsfreigabe,
  Tarifverifizierung, Storno). Die Tarifverifizierung protokolliert zwar
  unveränderlich, verlangt aber keine zweite Person. — **P3, mittel**

---

## 14. Audit-Trail

**IST**
- Zentrale Funktion `lib/audit-log.ts` → `mis_audit_log`, mit
  `logAuditEventOrWarn()` als Pflichtmuster (durch Regressionstest über `app/`
  und `lib/` erzwungen). **436 Aufrufstellen** in `app/` + `lib/`.
- Fachliche Zweitspur für die Abrechnung: `logBillingAction()` →
  `billing_audit_trail` (live 6 Einträge), Tarif-Audit unveränderlich.
- Workflow-Audit `wf_audit_log` (live 78 Einträge), Signatur-Audit
  (`lib/signaturen/signaturen.ts::protokolliereSignaturAudit`), Sync-Audit,
  Personal-Audit (`/api/personal/audit`), Angehörigen-Zugriffsprotokoll.
- Auswertungs-UIs: `app/admin/ops-audit`, `app/admin/nachweise`.

**FEHLT**
- **Keine Feldhistorie.** Protokolliert wird, *dass* geändert wurde und *welche
  Feldnamen* betroffen waren (`geaenderte_felder`), nicht der Wert davor. Eine
  Rückfrage „was stand vorher im Pflegegrad" ist nicht beantwortbar. Für
  Pflegedokumentation ist die Nachvollziehbarkeit von Änderungen Standard.
  — **P2, mittel**
- **Vier getrennte Audit-Spuren ohne gemeinsame Sicht.** `mis_audit_log`,
  `billing_audit_trail`, `wf_audit_log` und die Modul-Logs lassen sich nirgends
  zusammen für einen Klienten oder Zeitraum auswerten. — **P2, mittel**
- **Keine Aufbewahrungs-/Exportregel.** Kein Export der Audit-Spur für eine
  Prüfung, keine dokumentierte Aufbewahrungsfrist (SGB XI: 10 Jahre für
  Abrechnungsunterlagen). — **P2, mittel**
- **Live sehr dünn besetzt:** `mis_audit_log` 9 Einträge, `billing_audit_trail`
  6 — bei 30 Leistungsnachweisen und 3 Rechnungen. Die Erfassung der 30
  Nachweise hat offenbar keine Audit-Einträge erzeugt; die CRUD-Route
  `/api/leistungsnachweis/crud` ruft tatsächlich kein `logAuditEvent()` auf.
  — **P2, klein**

---

## IK-Nummer (Institutionskennzeichen 460629986)

**Geprüft am 21.08.2026 direkt gegen die Produktionsdatenbank.**

| Quelle | Zustand |
|---|---|
| `organizations.ik_nummer` (Stamm-Org `…000460629986`) | **`460629986` gesetzt** ✓ |
| `organizations.ik_nummer` der übrigen 5 Organisationen | `null` (alles `E2E_TEST_*`-Mandanten) |
| `ALLTAGSENGEL_IK` in Vercel Production | **nicht verifizierbar** — kein Vercel-Login in dieser Umgebung |
| `ALLTAGSENGEL_IK` in `.env.local` / `.env` | nicht gesetzt |
| `ALLTAGSENGEL_IK` in `.env.example` | **nicht dokumentiert** |

**Bewertung:** `lib/config/org-config.ts::getOrgIK()` löst in der Reihenfolge
Datenbank → Env → Fehler auf. Da der DB-Wert für die produktive Stamm-Organisation
gesetzt ist, ist der produktive Pfad **funktionsfähig** — Rechnungs-PDF,
Leistungsnachweis-PDF, XRechnung und DTA-Export bekommen die IK. Der Go-Live-Check
bestätigt das unabhängig: „Absender-IK der Organisation: 460629986" und
„Absenderdaten für den Briefkopf: Alltagsengel UG · IK 460629986".

**Offene Punkte dazu:**
1. **`ALLTAGSENGEL_IK` fehlt in `.env.example`.** Der Fallback ist im Code
   dokumentiert, aber nirgends als konfigurierbare Variable ausgewiesen — beim
   Aufsetzen einer neuen Umgebung fällt er niemandem auf. — **P2, klein**
2. **Ob die Variable in Vercel gesetzt ist, konnte nicht geprüft werden**
   (`npx vercel whoami` → „No existing credentials found"). Sie ist im
   Normalbetrieb nicht nötig; sie wird erst relevant, wenn das Lesen der
   `organizations`-Zeile fehlschlägt. Dann wirft `getOrgIK()` — kein stiller
   falscher Wert, aber ein harter Fehler im Rechnungsweg. — **P2, klein**
3. **Fünf Testmandanten ohne IK** stehen in der Produktions-DB. Für sie würde
   `getOrgIK()` auf den Env-Fallback und dann in den Fehler laufen. Sie gehören
   ohnehin gelöscht (steht als Blocker im Go-Live-Check, blockiert durch
   `wf_audit_log`-Referenzen). — **P2, klein**

Das CI-Gate `scripts/ci-ik-check.sh` (aktiv in `.github/workflows/ci.yml:81`)
verhindert zuverlässig, dass die IK wieder hart in `app/` oder `lib/` landet.

---

## Live-Datenbestand am 21.08.2026 (Kontext)

| Tabelle | Zeilen | | Tabelle | Zeilen |
|---|---|---|---|---|
| `clients` | 4 | | `payments` | **0** |
| `caregivers` | 2 | | `tours` / `tour_stops` | **0** / **0** |
| `assignments` | 5 | | `wounds` | **0** |
| `service_records` | 30 | | `sis_assessments` | **0** |
| `invoices` | 3 | | `medikamente` | **0** |
| `invoice_items` | 15 | | `angehoerigen_zugaenge` | **0** |
| `client_budgets` | 4 | | `akten_vertraege` | **0** |
| `bookings` | 10 | | `dunning_entries` | **0** |
| `profiles` | 61 | | `monthly_closings` | **0** |
| `organizations` | 6 (5 davon Test) | | `billing_feiertage` | **0** |

Die Kette Kunde → Einsatz → Nachweis → Rechnung ist einmal durchlaufen worden;
alles ab „Zahlung" und alle Dokumentationsmodule sind produktiv unbenutzt. Das
ist bei der Bewertung „funktioniert" mitzudenken: geprüft ist der Code, nicht der
Betrieb.

Bemerkenswert: `akten_vertraege` ist leer, obwohl
`pruefeClientFreigabe()` (`lib/personal/einsatzfreigabe.ts:133`) einen aktiven
Vertrag verlangt und `POST /api/einsatzplanung` bei fehlendem Vertrag mit 422
abweist (übersteuerbar nur mit `force_override`). Die vorhandenen Einsätze sind
also entweder erzwungen oder an dieser Route vorbei entstanden.

Anlegen lassen sich Verträge sehr wohl — `app/admin/vertraege/page.tsx` →
`POST /api/akten/vertraege` ist vollständig. Es ist also **keine Codelücke,
sondern ein Betriebsschritt, der nie ausgeführt wurde**. Nur: bevor der erste
echte Kunde geplant wird, muss für ihn ein Vertrag im System stehen, sonst
blockiert die Einsatzplanung ihn. — **kein P-Rating, Betriebsaufgabe**

---

## Nicht verifizierbar in dieser Session

Diese Punkte gelten damit als **nicht erfüllt**, nicht als erfüllt:

- Environment-Variablen in Vercel Production (`ALLTAGSENGEL_IK`, `RESEND_API_KEY`,
  `VAPID_*`, `FCM_*`, `CRON_SECRET`, `SECON_ZERT_PASSWORT`) — kein Vercel-Login.
- Ob die Migrationen `20260907010000` (clients_status_check) und weitere offene
  SQL-Dateien live angewendet sind — kein DDL-Zugang, `public._run_sql` ist
  inzwischen geschlossen (PGRST202).
- Ob `check_assignment_overlap` als Trigger tatsächlich aktiv ist — die
  Migrationsdatei existiert, der Live-Zustand ist ohne Katalogzugriff nicht
  lesbar.
- Tatsächliche Zustellung von E-Mails (Resend-Domain-Verifikation, Bounce-Rate).

---

## Empfohlene Reihenfolge

**Sofort (klein, entsperrt jeweils eine ganze Kette):**
1. `dunning_email_queue` abarbeiten — Cron oder Button im Mahnwesen (B-09).
2. Manuelle Zahlungserfassung ins UI holen — `POST /api/billing/payments` ist fertig (B-09).
3. Kundenstammdaten-Whitelist erweitern + Deaktivierung (B-01).
4. Für jeden echten Kunden einen Vertrag in `akten_vertraege` anlegen — sonst
   weist `/api/einsatzplanung` ihn mit 422 ab (Betriebsschritt, kein Code).
5. Abwesenheits- und Verfügbarkeitsprüfung aus `lib/touren/server.ts` in
   `/api/einsatzplanung` mitbenutzen (B-03).
6. Jahresübertrag als Cron + Button (B-05).
7. `ALLTAGSENGEL_IK` in `.env.example` aufnehmen (IK-Abschnitt).

**Als Nächstes (mittel, schließt die Kette):**
8. Buchung → Einsatz → Nachweis verbinden (B-03).
9. Rechnungszustellung per E-Mail mit PDF-Anhang (B-05).
10. Belegte § 45b-/VP-Tarife eintragen und verifizieren, sobald der Bescheid
    vorliegt — inkl. Qualifikationsstaffelung (B-06/B-07).

**Größer, aber betrieblich entscheidend:**
11. Offline-Erfassung in die ausgelieferte App bringen (B-12).
12. Rollen PDL / QM / Buchhaltung (B-13).
