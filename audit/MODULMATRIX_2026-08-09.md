# MODULMATRIX — Production-Inventur Alltagsengel

**Datum:** 2026-08-09
**Codebase:** /Users/work/alltagsengel (Next.js App Router)
**Supabase:** nnwyktkqibdjxgimjyuq (Production)
**Methode:** Vollständige Code-Inventur (Routen, lib/, Migrations, Tests, Komponenten). Keine Annahmen — nur was im Code verifiziert wurde.

**Testbasis (verifiziert):**
- 54 Vitest-Dateien unter `__tests__/` (vitest.config.ts, ~905 it/test-Cases gesamt inkl. lib)
- 19 node:test-Dateien unter `lib/**` (`npm run test:unit`)
- 3 Playwright-Browser-E2E-Specs (`e2e/auth-delete.spec.ts`, `e2e/booking.spec.ts`, `e2e/register.spec.ts`) — **nur B2C-Flows, kein Admin-/Billing-Browser-E2E**
- CI: `.github/workflows/ci.yml` (Typecheck, Lint, Tests, Build als Merge-Gate; kein Deploy)
- „E2E" heißt unten: Browser-E2E via Playwright. Integrationsketten-Tests auf DB-Ebene (z. B. `__tests__/abrechnung/e2e-ruecklaeufer-kette.test.ts`) werden gesondert erwähnt.

---

## A) Stammdaten & Organisation

### Mandanten (Multi-Tenancy)
- **Status:** EXISTIERT
- **Dateien:** `lib/organizations/{server,ik,types}.ts`, `app/api/organizations/**` (CRUD, switch, subscription, zertifikat), `components/OrgSwitcher.tsx`, `supabase/migrations/20260801_phase3_multi_mandant_saas.sql`
- **DB-Tabellen:** organizations, organization_members, organization_subscriptions; `current_org_id()` mit RESTRICTIVE org_fence-Policies auf allen neuen Fachtabellen
- **Tests:** JA — `__tests__/shadow-db/tenant-isolation.test.ts`, `__tests__/security/p0-billing-mandanten-isolation.test.ts`, `p0-personal-…`, `p0-pflege-…` (4 dedizierte Suiten)
- **E2E:** NEIN
- **Fachlich korrekt:** JA (Isolationsmodell sauber, per Tests abgesichert)
- **Regulatorisch:** DSGVO (Auftragsverarbeitung je Mandant, falls SaaS-Betrieb)
- **Bugs:** Keine bekannten; Altbestand-Tabellen (B2C: bookings, profiles …) sind nicht org-gefenced, sondern über eigene RLS gehärtet (20260806120000)
- **Fehlend:** Mandanten-Onboarding-Flow (Self-Service), Abrechnung je Mandant (Stripe-Subscription vorhanden, aber ungetestet)
- **Priorität:** P2

### Klienten
- **Status:** EXISTIERT
- **Dateien:** `app/admin/clients/**`, `app/admin/kundenakte/[id]/`, `app/api/admin/clients/route.ts`, `app/kunde/**` (Selbstportal), `lib/pflege/aufnahmen.ts`, `lib/pflege/stammdaten` (via `lib/pflege/types.ts` PflegeStammdaten), Migration `20260810010000_pflegedokumentation.sql` (Teil 1: erweiterte clients-Spalten)
- **DB-Tabellen:** clients (erweitert um wohnsituation, familienstand, aufnahmestatus, …), care_recipients, client_budgets, client_preferred_substitutes, akten_kontaktpersonen, notfall_info
- **Tests:** TEILWEISE — `lib/pflege/__tests__/aufnahmen.test.ts`; keine dedizierte clients-CRUD-Suite
- **E2E:** NEIN (nur Registrierung/Buchung als Kunde via Playwright)
- **Fachlich korrekt:** JA für Alltagsbegleitung (strukturierte Aufnahme mit Wohnsituation, Schlüsselregelung, Dringlichkeit)
- **Regulatorisch:** DSGVO (besondere Kategorien: Gesundheitsdaten), SGB XI §45a
- **Bugs:** Keine bekannten
- **Fehlend:** Duplikat-Erkennung, Klienten-Zusammenführung, Archivierungs-/Aufbewahrungsfristen-Logik auf Klientenebene
- **Priorität:** P2

### Mitarbeiter (Engel/Betreuungskräfte)
- **Status:** EXISTIERT
- **Dateien:** `app/admin/personal/**`, `app/admin/mitarbeiterakte/[id]/`, `app/admin/caregivers/**`, `app/engel/**` (MA-Portal: profil, qualifikationen, arbeitszeiten, dienstplan, dokumente, vertraege), `lib/personal/{stammdaten,qualifikationen,einsatzfreigabe}.ts`, `app/api/personal/**`, Migration `20260811010000_personalmanagement.sql`
- **DB-Tabellen:** caregivers, angels, caregiver_qualifications, caregiver_documents, caregiver_bonuses, caregiver_initials_history, applications, personal_audit_log
- **Tests:** JA — 6 Suiten `lib/personal/__tests__/` (abwesenheiten, arbeitszeiten, dienstplan, einsatzfreigabe, qualifikationen, urlaubskonto)
- **E2E:** NEIN
- **Fachlich korrekt:** JA (Einsatzfreigabe koppelt Qualifikations-/Dokumentenstatus an Einsetzbarkeit)
- **Regulatorisch:** DSGVO, §45a (Qualifikationsnachweis Betreuungskräfte), ArbZG (Arbeitszeiten)
- **Bugs:** Doppelstruktur caregivers vs. angels (historisch) — Konsolidierung offen
- **Fehlend:** Lohn-/Gehaltsexport, eAU-Abruf, Führungszeugnis-Fristenautomatik (Dokumentablauf existiert generisch)
- **Priorität:** P2

### Rollen / Rechte
- **Status:** EXISTIERT
- **Dateien:** `app/api/admin/manage-role/route.ts` (nur superadmin), `app/admin/users/page.tsx`, `middleware` (Route-Protection, s. audit/MIDDLEWARE_ROUTE_PROTECTION_REPORT.md), `scripts/rls-matrix.ts` (`npm run rls:matrix:check`), diverse `*/api-auth.ts` (akten, ops, personal, pflege, expansion), `lib/abrechnung/require-admin.ts`
- **DB-Tabellen:** profiles.role (superadmin, admin, engel/caregiver, kunde, fahrer; punktuell zusätzlich 'pdl', 'buero', 'staff' in Checks), admin_audit_log
- **Tests:** JA — `__tests__/security/p0-1-admin-auth.test.ts`, b2c-rls-hardening, bookings-policy-*, secdef-Härtungs-Suiten (8+ Security-Suiten)
- **E2E:** TEILWEISE (auth-delete.spec.ts)
- **Fachlich korrekt:** JA für aktuelles Rollenmodell
- **Regulatorisch:** DSGVO Art. 32 (Zugriffskontrolle)
- **Bugs:** Rollen 'pdl'/'buero' sind inkonsistent verankert: in `20260706_monatsabschluss_ki_pruefzentrale.sql` und `20260719_eylem_audit_complete_features.sql` als gültige Rollen geprüft, aber in `manage-role` / admin/users nicht vergebbar → tote Rollenpfade
- **Fehlend:** Feingranulare Berechtigungen (Rechte-Matrix pro Modul statt Rolle), 4-Augen-Prinzip konfigurierbar
- **Priorität:** P1 (Rollen-Inkonsistenz bereinigen)

### PDL (Pflegedienstleitung)
- **Status:** TEILWEISE
- **Dateien:** `lib/ops/types.ts` (EskalationRolle 'pdl', EreignisEmpfaengerRolle 'pdl'), `lib/ops/ereignis-emitter.ts`, `components/admin/CareNotesPanel.tsx`, `supabase/migrations/20260706_monatsabschluss_ki_pruefzentrale.sql` (role-Check inkl. 'pdl')
- **DB-Tabellen:** keine eigene; nutzt profiles.role + ops_eskalationsregeln
- **Tests:** NEIN (nur indirekt über ops-Eskalations-Tests)
- **E2E:** NEIN
- **Fachlich korrekt:** UNKLAR — für reine §45a-Alltagsbegleitung ist keine PDL vorgeschrieben; für Ausbau Richtung Pflegedienst (SGB V/XI-Zulassung) fehlt das Modul komplett (PDL-Freigaben, Pflegevisiten, Fachaufsicht)
- **Regulatorisch:** SGB XI §71 (bei echtem Pflegedienst), MDK/MD-QPR
- **Bugs:** 'pdl'-Rolle existiert in Checks, ist aber nirgends vergebbar (siehe Rollen/Rechte)
- **Fehlend:** PDL-Dashboard, Pflegevisiten, Freigabe-Workflows mit PDL-Pflicht, Vertretungsregelung PDL
- **Priorität:** P2 (P1, sobald Kassenzulassung als Pflegedienst angestrebt)

---

## B) Pflege-/Betreuungsdokumentation

### Pflegeplanung
- **Status:** TEILWEISE
- **Dateien:** `lib/pflege/massnahmenplaene.ts`, `app/admin/pflegedoku/massnahmenplan/[id]/`, `app/api/pflege/massnahmenplaene/**` (inkl. freigeben, sperren)
- **DB-Tabellen:** pflege_massnahmenplaene (PlanTyp: versorgungsplan | betreuungsplan | massnahmenplan | notfallplan; Status entwurf→aktiv→abgelaufen/gesperrt/ersetzt)
- **Tests:** JA — `lib/pflege/__tests__/massnahmenplaene.test.ts`
- **E2E:** NEIN
- **Fachlich korrekt:** JA für Betreuungsplanung (Alltagsbegleitung); NEIN als klassischer Pflegeprozess (kein 6-Phasen-Modell, keine Pflegeziel-Evaluation mit Soll/Ist)
- **Regulatorisch:** §45a-Dokumentationspflichten (Land Hessen PfluV); bei Pflegedienst: MD-QPR
- **Bugs:** Keine bekannten
- **Fehlend:** Evaluationszyklen mit Zielerreichung, Verknüpfung Plan ↔ Risiko-Reassessment (Risiken haben eigene Prüfintervalle, aber keine Plan-Kopplung)
- **Priorität:** P2

### SIS (Strukturierte Informationssammlung)
- **Status:** FEHLT
- **Dateien:** keine (Volltextsuche nach SIS/Themenfeldern ohne Treffer; `pflege_anamnesen` ist ein eigenes Format)
- **DB-Tabellen:** keine
- **Tests:** —
- **E2E:** —
- **Fachlich korrekt:** — (Anamnese-Ersatz vorhanden, aber kein SIS-Schema: keine Themenfelder 1–6, keine Risikomatrix nach Entbürokratisierungsmodell)
- **Regulatorisch:** SIS ist für §45a-Angebote nicht verpflichtend; für zugelassene Pflegedienste De-facto-Standard (EinSTEP)
- **Bugs:** —
- **Fehlend:** SIS-Bogen (6 Themenfelder + Matrix), Verknüpfung zu Maßnahmenplan
- **Priorität:** P2 (P1 bei Pflegedienst-Zulassung)

### Maßnahmenplanung
- **Status:** EXISTIERT
- **Dateien:** `lib/pflege/massnahmen.ts`, `app/api/pflege/massnahmen/**`, UI in `app/admin/pflegedoku/massnahmenplan/[id]/`
- **DB-Tabellen:** pflege_massnahmen (Kategorie, Priorität, Status geplant→aktiv→pausiert→abgeschlossen/abgebrochen), FK auf massnahmenplaene
- **Tests:** JA (über massnahmenplaene-Suite mit abgedeckt)
- **E2E:** NEIN
- **Fachlich korrekt:** JA für Betreuungsleistungen
- **Regulatorisch:** wie Pflegeplanung
- **Bugs:** Keine bekannten
- **Fehlend:** Durchführungs-Abzeichnung pro Maßnahme je Einsatz (Verknüpfung service_record ↔ massnahme existiert nur im Verlauf, keine Pflicht-Abzeichnung)
- **Priorität:** P2

### Pflegeberichte (Verlaufsdokumentation)
- **Status:** EXISTIERT
- **Dateien:** `lib/pflege/verlauf.ts`, `lib/pflege/doku-perioden.ts`, `app/admin/pflegedoku/verlauf/[clientId]/`, `app/engel/pflegedoku/**`, `app/kunde/pflegedoku/`, `app/api/pflege/verlauf/**`, `app/api/pflege/doku-perioden/**` (abschliessen/wiedereroeffnen)
- **DB-Tabellen:** pflege_verlauf (Typen: verlauf, ereignis, beobachtung, uebergabe, telefonat, arztbesuch, angehoerigenkontakt, besonderheit, sturz, notfall; Sichtbarkeit intern/engel/kunde/alle; Sperr-Mechanik), pflege_doku_perioden (Monatsabschluss der Doku), care_notes
- **Tests:** JA — `lib/pflege/__tests__/verlauf.test.ts`
- **E2E:** NEIN
- **Fachlich korrekt:** JA (Unveränderbarkeit via gesperrt/Perioden-Abschluss, Autor + Rolle protokolliert)
- **Regulatorisch:** DSGVO, Dokumentationspflicht §45a; Beweissicherung (Sturz/Notfall-Einträge)
- **Bugs:** Keine bekannten
- **Fehlend:** PDF-Export des Verlaufs je Klient/Periode für Prüfungen
- **Priorität:** P2

### Vitalwerte
- **Status:** FEHLT
- **Dateien:** keine (grep blutdruck/vitalzeichen/puls: 0 Treffer in app/lib/migrations)
- **DB-Tabellen:** keine
- **Tests / E2E:** —
- **Fachlich korrekt:** — (für Alltagsbegleitung §45a nicht erforderlich; Betreuungskräfte dürfen keine Behandlungspflege)
- **Regulatorisch:** erst relevant bei SGB-V-Behandlungspflege
- **Fehlend:** komplettes Modul
- **Priorität:** P3

### Wunddokumentation
- **Status:** FEHLT
- **Dateien:** keine (nur Marketing-/Infotexte erwähnen „Wunde")
- **DB-Tabellen:** keine
- **Tests / E2E:** —
- **Fachlich korrekt:** — (außerhalb des §45a-Leistungsspektrums)
- **Regulatorisch:** erst bei SGB-V-Zulassung (Expertenstandard Wundversorgung)
- **Fehlend:** komplettes Modul (Wundanamnese, Fotodoku, Verlauf)
- **Priorität:** P3

### Medikationsverwaltung
- **Status:** TEILWEISE
- **Dateien:** `app/kunde/notfall/page.tsx` (liest medikamentenplan für Notfallpass), `app/notfall/[id]/page.tsx`; keine Admin-/Engel-Verwaltungs-UI
- **DB-Tabellen:** medikamentenplan (Baseline `20260101000000_baseline_live_only_tables.sql`: Name, Wirkstoff, Dosierung, Einnahmezeiten, Dauermedikation) — user-zentriert, nicht klientenzentriert
- **Tests:** NEIN
- **E2E:** NEIN
- **Fachlich korrekt:** UNKLAR — als Info-Liste für Notfallpass ok; als Medikationsmanagement (Gabe-Doku, BTM, Wechselwirkungen) nicht existent und für §45a auch nicht zulässig
- **Regulatorisch:** DSGVO (Gesundheitsdaten); Betreuungskräfte dürfen Medikamente nicht verabreichen — nur „Erinnerung" dokumentierbar
- **Bugs:** medikamentenplan hängt an user_id (profiles), nicht an clients/care_recipients → bei Angehörigen-Accounts unklar, wessen Medikation gemeint ist
- **Fehlend:** Verwaltungs-UI, Verknüpfung an Klient statt User, Erinnerungs-Doku im Einsatz
- **Priorität:** P2

### Übergaben
- **Status:** TEILWEISE
- **Dateien:** `lib/pflege/types.ts` (VerlaufTyp 'uebergabe', AnamneseTyp 'uebergabe'), Einträge über normalen Verlauf; `lib/admin/ops.ts`
- **DB-Tabellen:** pflege_verlauf (typ='uebergabe'), keine eigene Übergabe-Struktur
- **Tests:** nur indirekt (verlauf.test.ts)
- **E2E:** NEIN
- **Fachlich korrekt:** UNKLAR — Übergabe ist nur ein Verlaufs-Eintragstyp; kein strukturiertes Übergabe-Protokoll (offene Punkte, Lesebestätigung des Nachfolgers)
- **Regulatorisch:** Dokumentationspflicht
- **Fehlend:** Übergabe-Board je Klient/Schicht, Lesebestätigungen, Pflichtübergabe bei Engel-Wechsel
- **Priorität:** P2

---

## C) Leistungserbringung & Nachweise

### Leistungsnachweise
- **Status:** EXISTIERT
- **Dateien:** `app/admin/leistungsnachweis-digital/`, `app/admin/leistungsnachweis-upload/`, `app/admin/leistungsnachweis/[verordnung_id]/`, `app/admin/nachweise/`, `app/kunde/leistungsnachweis/`, `app/api/leistungsnachweis/**`, `app/api/native/leistungsnachweis-upload/`, `lib/abrechnung/leistungsnachweis-pdf.ts`, `lib/admin/service-records.ts`, `lib/upload-service-proof.ts`, Migrationen `20260808200000_einsatzplanung_leistungsnachweise.sql`, `20260814010000_leistungsnachweis_haertung.sql`
- **DB-Tabellen:** service_records, service_record_items, service_record_audit_log, service_signatures, ocr_results, review_errors
- **Tests:** JA — `lib/abrechnung/__tests__/admin-ui-security.test.ts`; Härtung per Migration + Security-Suiten; kein dedizierter Fach-Unit-Test des Nachweis-Lebenszyklus
- **E2E:** NEIN (Browser); Integrationskette teilweise über billing-Tests
- **Fachlich korrekt:** JA (Doppelweg: Papier-Upload + OCR-Abgleich sowie voll digital mit Signatur; Audit-Trail; Budget-Reservierung)
- **Regulatorisch:** SGB XI §45b Nachweispflicht ggü. Kassen, GoBD (Unveränderbarkeit nach Signatur)
- **Bugs:** Keine bekannten
- **Fehlend:** Browser-E2E des Signier-Flows; Massen-PDF-Export je Kasse/Monat
- **Priorität:** P1 (Kernprozess für Abrechnung — E2E-Absicherung fehlt)

### Digitale Unterschriften
- **Status:** EXISTIERT
- **Dateien:** `app/api/native/signatures/route.ts` (Expo-Bridge, service_role-Insert, Device-Info + optional GPS-Einmalmessung), `app/api/akten/vertraege/[id]/unterschreiben/`, `app/mis/signatures/`, native App (`native/`)
- **DB-Tabellen:** service_signatures (RLS: nur service_role-Insert), mis_signature_requests, caregiver_initials_history
- **Tests:** TEILWEISE (RLS-Absicherung über Security-Suiten; kein Unit-Test des Signatur-Endpunkts)
- **E2E:** NEIN
- **Fachlich korrekt:** JA (Signer-Rolle client/caregiver, Base64-PNG, Kontextdaten)
- **Regulatorisch:** eIDAS (einfache elektronische Signatur — für Leistungsnachweise ausreichend, Kassen akzeptieren i. d. R.; keine QES), DSGVO (GPS nur Einmalmessung)
- **Bugs:** Keine bekannten
- **Fehlend:** Zeitstempel-/Hash-Verkettung der Signaturbilder (Manipulationsnachweis), Signatur auf Vertrags-PDFs einbetten
- **Priorität:** P2

### OCR
- **Status:** EXISTIERT
- **Dateien:** `app/api/admin/ocr/route.ts` (nimmt client-seitiges Tesseract-Ergebnis, vergleicht gegen service_records, schreibt review_errors), Upload-Flow `app/admin/leistungsnachweis-upload/`
- **DB-Tabellen:** ocr_results, review_errors (Storage-Bucket service-proofs)
- **Tests:** NEIN (kein Unit-Test der Abgleichlogik)
- **E2E:** NEIN
- **Fachlich korrekt:** JA als Plausibilisierung (Datum/Zeiten/Beträge/Unterschrift-Erkennung); kein Ersatz für manuelle Prüfung — als solche auch designt
- **Regulatorisch:** GoBD (Original-Scan bleibt erhalten)
- **Bugs:** Confidence-Schwellen/Feld-Mapping ungetestet
- **Fehlend:** OCR für andere Dokumenttypen (Verordnungen, Bescheide), Test-Suite
- **Priorität:** P2

---

## D) Kostenträger & Leistungsrecht

### SGB XI (Leistungs-/Budgetlogik)
- **Status:** EXISTIERT
- **Dateien:** `lib/billing/core/{invoice-engine,price-resolver}.ts`, `lib/abrechnung/schluesselverzeichnis.ts` (TA1/TA3 Pflege), `app/admin/budgets/`, `app/kunde/budget/`, Tarif-Migrationen `20260807110000`–`20260807180000`, `20260808110000_tarifschichten_bundesland.sql`
- **DB-Tabellen:** billing_rechtsgrundlagen (Seed: §45b, §39, §36 SGB XI), billing_gesetzliche_obergrenzen, billing_tariffs, billing_landesregeln, billing_leistungsarten, billing_wegepauschalen, client_budgets, budget_transactions, budget_reservations
- **Tests:** JA — 13 Suiten `__tests__/billing/**` (invoice-engine, price-resolver, tariff-based-invoice, tariff-stammdaten-v2, status-machine, transaction-safety, atomic-rpc …)
- **E2E:** NEIN (Browser); `e2e-invoice-paths.test.ts` als DB-Integrationskette JA
- **Fachlich korrekt:** JA für §45b/§39/§36-Zuordnung (Rechtsgrundlage → Tarif-Matching, Obergrenzen mit Archiv-Historie)
- **Regulatorisch:** SGB XI §§36, 39, 45a/b, 105 (Abrechnung), Landesrecht (PfluV Hessen; Bundesland-Tarifschichten für Expansion)
- **Bugs:** Keine offenen bekannten (PR35-Serie + Rollbacks dokumentiert in audit/)
- **Fehlend:** §37.3-Beratungseinsätze, Pflegegeld-Kombileistung-Rechner
- **Priorität:** P1 (produktionskritisch, gut getestet — E2E-Lücke schließen)

### SGB V
- **Status:** TEILWEISE
- **Dateien:** Verordnungen: `app/admin/verordnungen/`, Migrationen `20260730_verordnungen_workflow_complete.sql` (§37-SGB-V-Leistungsarten, Muster-12-Nummer, Kassengenehmigungs-Workflow), `20260731*`; Krankenfahrten §60 SGB V: `app/krankenfahrten/**`, `app/fahrer/**`, `app/api/admin/krankenfahrten/`, kf_*-Tabellen
- **DB-Tabellen:** verordnungen, verordnung_leistungen, krankenfahrten, krankenfahrt_providers, kf_pricing_* (9 Tabellen), fahrzeuge
- **Tests:** NEIN (keine Suite für Verordnungs-Workflow oder Krankenfahrten)
- **E2E:** NEIN
- **Fachlich korrekt:** UNKLAR — Verordnungserfassung/Genehmigung modelliert, aber **keine §302-SGB-V-Abrechnung** (EDIFACT-Generator ist ausschließlich §105 SGB XI PLGA/PLAA; `lib/abrechnung/schluesselverzeichnis.ts:200` stellt explizit klar: „…pflege nach SGB V!" ausgenommen). Krankenfahrten werden privat/Zuzahlung bepreist, nicht mit Kasse abgerechnet
- **Regulatorisch:** SGB V §§37, 60, 302; TA-Anlagen §302
- **Bugs:** Keine bekannten
- **Fehlend:** §302-Abrechnungsstrecke (falls Behandlungspflege/Krankenfahrt-Kassenabrechnung geplant), Tests
- **Priorität:** P1 (falls SGB-V-Umsatz geplant), sonst P2

### Privatleistungen
- **Status:** EXISTIERT
- **Dateien:** `lib/billing/core/invoice-engine.ts` (Privatrechnung als Zahlerart), `lib/pricing-engine.ts`, `app/admin/leistungspreise/`, `app/api/pricing/**`, Stripe (`lib/stripe/**`, `app/api/stripe/**`)
- **DB-Tabellen:** service_pricing, leistungspreise, invoices/invoice_items, kf_pricing_*
- **Tests:** JA — über billing-Suiten (unified-invoice-creation, price-resolver decken Privat-Pfad ab)
- **E2E:** NEIN
- **Fachlich korrekt:** JA
- **Regulatorisch:** UStG (Kleinunternehmer/Steuerbefreiung §4 Nr. 16 — im Code nicht explizit verifiziert), GoBD
- **Bugs:** Keine bekannten
- **Fehlend:** USt-Logik explizit prüfen/konfigurierbar machen
- **Priorität:** P2

### §45b (Entlastungsbetrag)
- **Status:** EXISTIERT
- **Dateien:** `app/entlastungsbetrag/`, `app/budgetrechner/`, `components/BudgetRechner.tsx`, `app/kunde/budget/`, `app/admin/budgets/`, Tarif-/Obergrenzen-Migrationen (Rechtsgrundlage '§45b SGB XI' inkl. carryover = Übertrag Vorjahresbudget)
- **DB-Tabellen:** client_budgets, budget_transactions, budget_reservations, billing_gesetzliche_obergrenzen (+ Archiv)
- **Tests:** JA — billing-Suiten (tariff-based-invoice mappt entlastung/carryover), Budget-Reservierung in Einsatzplanungs-Migration
- **E2E:** NEIN
- **Fachlich korrekt:** JA (131 €/Monat gem. Pflegereform 2025 auf den Info-Seiten; Obergrenzen in DB versioniert statt hardcoded)
- **Regulatorisch:** SGB XI §45b, Landesanerkennung §45a (Hessen läuft, s. expansion-Migration)
- **Bugs:** Keine bekannten
- **Fehlend:** automatischer Jahres-Übertragsverfall (30.06.-Regel) — carryover als Rechtsgrundlage vorhanden, Verfalls-Automatik im Code nicht verifiziert
- **Priorität:** P1 (Kernprodukt)

### Verhinderungspflege (§39)
- **Status:** TEILWEISE
- **Dateien:** `app/verhinderungspflege/page.tsx` (Marketing), Abrechnungsseite: Rechtsgrundlage '§39 SGB XI' im Tarifmodell (`20260807120000_tariff_model_hardening.sql:64`), Obergrenzen-Tabelle
- **DB-Tabellen:** über billing_rechtsgrundlagen/billing_tariffs/billing_gesetzliche_obergrenzen abgebildet; keine eigene VP-Antrags-/Anspruchstabelle
- **Tests:** TEILWEISE (Tarif-Matching-Tests decken §39 als Rechtsgrundlage ab)
- **E2E:** NEIN
- **Fachlich korrekt:** UNKLAR — Abrechnung gegen §39-Budget möglich, aber kein Anspruchs-Tracking (Gemeinsamer Jahresbetrag seit 07/2025, 6-Monats-Vorpflegezeit entfallen, Kombination mit Kurzzeitpflege) und keine Antragsunterstützung
- **Regulatorisch:** SGB XI §39 (inkl. GVE-Reform 2025)
- **Bugs:** Keine bekannten
- **Fehlend:** VP-Budgetverwaltung je Klient (Jahresbetrag, Verbrauch, Kombination §42), stunden-/tageweise Unterscheidung
- **Priorität:** P1 (wird aktiv vermarktet, Backend-Lücke)

---

## E) Planung & Personal-Einsatz

### Tourenplanung
- **Status:** FEHLT
- **Dateien:** keine (grep tourenplan/routenplan: 0 Treffer in app/lib; nur Marketingtext)
- **DB-Tabellen:** keine
- **Tests / E2E:** —
- **Fachlich korrekt:** — Einsatzplanung existiert (siehe Dienstplanung), aber keine Touren-/Fahrwege-Optimierung, keine Tourenansicht je Engel/Tag mit Wegzeiten
- **Regulatorisch:** Wegezeiten = Arbeitszeit (ArbZG); Wegepauschalen-Tabelle (billing_wegepauschalen) existiert bereits abrechnungsseitig
- **Fehlend:** komplettes Modul (Tagestouren, Kartenansicht, Fahrzeitberechnung; Geodaten-Basis via lib/geo.ts, plz-coords vorhanden)
- **Priorität:** P2

### Dienstplanung
- **Status:** EXISTIERT
- **Dateien:** `app/admin/dienstplan/`, `app/engel/dienstplan/`, `app/admin/einsatzfreigabe/`, `app/api/personal/dienstplan/**` (schichten, eintraege, tagesansicht), `app/api/einsatzplanung/`, `lib/personal/dienstplan.ts`, Migration `20260811010000_personalmanagement.sql`, `20260808200000_einsatzplanung_leistungsnachweise.sql` (assignments: Doppelbelegungsschutz, Recurrence-Rules)
- **DB-Tabellen:** dienstplan_schichten, dienstplan_eintraege, assignments (erweitert), einsatz_absagen, substitution_requests, client_preferred_substitutes, assignment_audit_log, dispatch_status
- **Tests:** JA — `lib/personal/__tests__/dienstplan.test.ts`, `einsatzfreigabe.test.ts`
- **E2E:** NEIN
- **Fachlich korrekt:** JA (Doppelbelegungsschutz, Vertretungslogik, Freigabe-Kopplung an Qualifikation)
- **Regulatorisch:** ArbZG (Ruhezeiten-Prüfung im Code nicht verifiziert)
- **Bugs:** Keine bekannten
- **Fehlend:** Ruhezeiten-/Höchstarbeitszeit-Validierung, Wunschdienstplan
- **Priorität:** P1 (operativer Kern)

### Kalender
- **Status:** EXISTIERT
- **Dateien:** `app/admin/kalender/`, `app/admin/schedule/`, `app/engel/kalender/`, `app/kunde/kalender/`, `lib/availability.ts`, `app/engel/verfuegbarkeit/`
- **DB-Tabellen:** angel_availability, mis_availability, assignments, bookings
- **Tests:** NEIN (kein Kalender-spezifischer Test)
- **E2E:** TEILWEISE (booking.spec.ts berührt Terminwahl)
- **Fachlich korrekt:** JA
- **Regulatorisch:** —
- **Bugs:** Keine bekannten
- **Fehlend:** iCal-/CalDAV-Export, Erinnerungen
- **Priorität:** P3

### Urlaub
- **Status:** EXISTIERT
- **Dateien:** `app/admin/urlaub/`, `app/engel/urlaub/`, `app/api/personal/urlaubskonto/**`, `app/api/personal/abwesenheiten/**` (genehmigen/ablehnen), `lib/personal/{urlaubskonto,abwesenheiten}.ts`
- **DB-Tabellen:** personal_urlaubskonto, absences (Typen: vacation, sonderurlaub, unbezahlt …)
- **Tests:** JA — `lib/personal/__tests__/urlaubskonto.test.ts`, `abwesenheiten.test.ts`
- **E2E:** NEIN
- **Fachlich korrekt:** JA (Genehmigungsworkflow, Kontoführung, Audit)
- **Regulatorisch:** BUrlG
- **Bugs:** Keine bekannten
- **Fehlend:** Resturlaubs-Verfallsautomatik (31.03.)
- **Priorität:** P2

### Krankmeldungen
- **Status:** EXISTIERT
- **Dateien:** wie Urlaub (absences mit Typ 'sick'), `lib/personal/abwesenheiten.ts`
- **DB-Tabellen:** absences (absence_type='sick', reported_at)
- **Tests:** JA (abwesenheiten.test.ts)
- **E2E:** NEIN
- **Fachlich korrekt:** JA für Erfassung/Genehmigung; Einsatz-Umplanung bei Krankheit läuft über substitution_requests
- **Regulatorisch:** EntgFG; eAU-Abruf (Krankenkasse) nicht angebunden
- **Bugs:** Keine bekannten
- **Fehlend:** eAU-Schnittstelle, automatische Einsatzkonflikt-Erkennung bei Krankmeldung (Kopplung an assignments nicht verifiziert)
- **Priorität:** P2

---

## F) Organisation & Kommunikation

### Aufgaben
- **Status:** EXISTIERT
- **Dateien:** `app/admin/aufgaben/**`, `app/engel/aufgaben/`, `app/api/ops/aufgaben/**` (inkl. checklisten, kommentare, anhaenge), `lib/ops/{aufgaben,checklisten,kommentare,anhaenge}.ts`, Migration `20260812010000_aufgaben_kommunikation.sql`
- **DB-Tabellen:** ops_aufgaben, ops_aufgaben_checklisten, ops_aufgaben_kommentare, ops_aufgaben_anhaenge, ops_aktivitaetslog
- **Tests:** JA — 4 Suiten (`__tests__/ops/{aufgaben,checklisten,kommentare,…}.test.ts`), insgesamt 10 ops-Suiten
- **E2E:** NEIN
- **Fachlich korrekt:** JA
- **Regulatorisch:** —
- **Bugs:** Keine bekannten
- **Fehlend:** Wiederkehrende Aufgaben (Recurrence)
- **Priorität:** P2

### Dokumente (DMS)
- **Status:** EXISTIERT
- **Dateien:** `app/admin/dokumente/**` (inkl. ablauf), `app/engel/dokumente/`, `app/kunde/dokumente/`, `app/api/akten/**` (dokumente, versionen, sperren, download, suche, zugriff, vertraege), `lib/akten/**`, Migration `20260809010000_dokumentenmanagement_akten.sql`
- **DB-Tabellen:** akten_dokumente, akten_dokument_versionen, akten_vertraege, akten_kontaktpersonen, akten_zugriff_log, documents, caregiver_documents
- **Tests:** JA — 4 Suiten `lib/akten/__tests__/` (ablauf, dokumentenmanagement, vertraege, zugriff) + `__tests__/cleanup-documents-table.test.ts`, `delete-document.test.ts`
- **E2E:** NEIN
- **Fachlich korrekt:** JA (Versionierung, Sperren, Ablaufwarnung, Zugriffsprotokoll)
- **Regulatorisch:** DSGVO (Zugriffslog), GoBD (Versionierung), Aufbewahrungsfristen
- **Bugs:** Doppelstruktur documents vs. akten_dokumente (Migration/Cleanup-Tests vorhanden, Konsolidierung dokumentiert)
- **Fehlend:** Aufbewahrungsfristen-/Löschkonzept je Dokumenttyp
- **Priorität:** P2

### Kommunikation
- **Status:** EXISTIERT
- **Dateien:** interne Nachrichten: `app/admin/nachrichten/**`, `app/engel/nachrichten/`, `app/kunde/nachrichten/`, `app/api/ops/nachrichten/**`, `lib/ops/nachrichten.ts`; Chat: `app/{kunde,engel,fahrer}/chat/**`, chat_messages; Push: `lib/{push,fcm,notifications}.ts`, `app/api/push/**`; WhatsApp-Bot: `lib/whatsapp/**`, `app/api/whatsapp/webhook/`; E-Mail: `app/api/kontakt/`, `lib/emails/**`
- **DB-Tabellen:** ops_nachrichten (+empfaenger), messages, chat_messages, notifications, ops_benachrichtigungen (+praeferenzen), push_subscriptions, fcm_tokens, whatsapp_conversations
- **Tests:** JA — `__tests__/ops/nachrichten.test.ts`, `benachrichtigungen.test.ts`, `praeferenzen.test.ts`
- **E2E:** NEIN
- **Fachlich korrekt:** JA; WhatsApp-KI mit Confidence-Gating + Eskalation (`lib/whatsapp/{confidence,escalation}.ts`)
- **Regulatorisch:** DSGVO (WhatsApp-Einsatz mit Gesundheitsbezug heikel — AVV/Einwilligung prüfen), UWG (Newsletter-Double-Opt-In nicht verifiziert)
- **Bugs:** Keine bekannten
- **Fehlend:** zentrale Kommunikations-Historie je Klient (Kanäle verteilt)
- **Priorität:** P2

### Angehörigenzugang
- **Status:** TEILWEISE
- **Dateien:** `supabase/migrations/20260414_care_recipients.sql` (Angehöriger = Account-Inhaber, Pflegebedürftiger = care_recipient mit relationship-Feld), `app/kunde/**` (Portal), `pflege_verlauf.sichtbarkeit='kunde'`, akten_kontaktpersonen
- **DB-Tabellen:** care_recipients, akten_kontaktpersonen
- **Tests:** NEIN (dediziert)
- **E2E:** TEILWEISE (register.spec.ts / booking.spec.ts als Kunde)
- **Fachlich korrekt:** UNKLAR — Modell „Angehöriger bucht für Pflegebedürftigen" funktioniert; aber kein separater Lese-Zugang für weitere Angehörige (z. B. Geschwister), keine granulare Freigabe (wer darf Doku sehen)
- **Regulatorisch:** DSGVO (Einwilligung des Betreuten für Angehörigen-Einsicht!)
- **Bugs:** Sichtbarkeit 'kunde' zeigt Doku dem Account-Inhaber — Einwilligungs-Nachweis des Betreuten nicht modelliert
- **Fehlend:** Mehrpersonen-Zugriff, Einwilligungsverwaltung, eigene Angehörigen-Rolle
- **Priorität:** P2

---

## G) Abrechnung & Finanzen

### Rechnungen
- **Status:** EXISTIERT
- **Dateien:** `lib/billing/core/**` (invoice-engine, status-machine, idempotency, audit), `app/admin/rechnungen/**`, `app/admin/rechnungserstellung/`, `app/admin/gutschriften/`, `app/api/billing/invoices/**` (create, cancel, correct, credit, freeze, snapshots), `app/api/admin/invoices/[id]/generate-pdf/`, `app/kunde/rechnungen/`, Migrationen `20260806200000_billing_core_corrections.sql`, `20260807100000_create_invoice_draft_atomic.sql` u. a.
- **DB-Tabellen:** invoices, invoice_items, invoice_snapshots, invoice_line_snapshots, invoice_corrections, invoice_disputes, invoice_packages, billing_number_sequences, billing_audit_trail
- **Tests:** JA — 13 Suiten `__tests__/billing/**`, dichteste Testabdeckung des Projekts
- **E2E:** NEIN (Browser); DB-Integrationskette `e2e-invoice-paths.test.ts` JA
- **Fachlich korrekt:** JA (Statusmaschine inkl. 'strittig', atomare RPC-Erstellung, Festschreibung/freeze mit GoBD-Bezug, lückenlose Nummernkreise)
- **Regulatorisch:** GoBD (freeze + snapshots), UStG §14, ab 2025/2028 E-Rechnung (XRechnung/ZUGFeRD) — **nicht implementiert**
- **Bugs:** Keine offenen bekannten
- **Fehlend:** E-Rechnung (XRechnung) für B2B/Behörden, DATEV-Export
- **Priorität:** P1

### Kassenabrechnung (DTA §105 SGB XI)
- **Status:** EXISTIERT (Code vollständig) — **Produktiv-Verifikation offen**
- **Dateien:** `lib/abrechnung/**`: edifact-generator/-segments/-validator (PLGA/PLAA nach TA1, IK-Prüfziffer §293 SGB V), secon.ts (Verschlüsselung), auftragsdatei.ts (Anlage 3), transport.ts (SFTP zu DAVASO/BITMARCK/AOK-RZ; KIM ab 12/2026 vermerkt), kassenabrechnung-engine.ts, versand-guard.ts, zertifikate.ts, readiness.ts; UI: `app/admin/kassenabrechnung/**` (inkl. readiness, stammdaten), `app/admin/dta/**`, `app/admin/dakota/`, `app/admin/annahmestellen/`, `app/admin/kostentraeger/`; API: `app/api/billing/dta/**` (create, validate, dry-run, preflight, export, freigabe, storno), `app/api/admin/abrechnung/**` (itsg, sftp-key, sftp-test, zertifikat); Migration `20260808220000_kassenabrechnung_dta_dakota.sql`
- **DB-Tabellen:** abrechnungslaeufe, dta_dakota_auftraege, dta_lauf_rechnungen, dta_validierungen, dta_fehlerprotokoll, dta_korrekturlaeufe, dta_kostentraeger, datenannahmestellen, kostentraeger_kontakte, abrechnung_zertifikate
- **Tests:** JA — `lib/abrechnung/__tests__/kassenabrechnung-engine.test.ts`, `secon.test.ts`, `__tests__/abrechnung/{stammdaten,readiness,schema-konsistenz}.test.ts`, Security `p0-5-no-hardcoded-ik`
- **E2E:** NEIN — **kein nachgewiesener Echtlauf gegen eine Datenannahmestelle** (ITSG-Zertifikat/SFTP-Test-Endpunkte existieren, Erprobungsverfahren der Kassen im Repo nicht dokumentiert)
- **Fachlich korrekt:** UNKLAR bis zum ersten akzeptierten Echtlauf (EDIFACT/TA1-Konformität nur eigen-validiert; TA1-Regel „eine Leistungsart je PLGA" ist implementiert)
- **Regulatorisch:** SGB XI §105, §302-Analogien, TA1/TA3, §293 SGB V (IK), Anlage-3-Auftragsdatei, SECON/GKV-Verschlüsselung; KIM-Umstellung Dez 2026
- **Bugs:** Keine bekannten im Code; Risiko liegt im ungetesteten Echtbetrieb
- **Fehlend:** Erprobungsverfahren je Annahmestelle durchführen und Ergebnis dokumentieren; KIM-Transport
- **Priorität:** **P0** (Umsatzkritisch: ohne verifizierten DTA-Versand keine Kassenerstattung; betrifft auch Fall Rita Meyer)

### Rückläufer
- **Status:** EXISTIERT
- **Dateien:** `app/admin/ruecklaeufer/`, `app/api/billing/dta/ruecklaeufer/`, `lib/abrechnung/{ruecklaeufer,ruecklaeufer-aufgaben,fehlerprotokoll,korrekturlaeufe}.ts`, `app/admin/korrekturlaeufe/`, `app/admin/abrechnungsfehler/`
- **DB-Tabellen:** dta_ruecklaeufer, dta_ruecklaeufer_positionen, dta_fehlerprotokoll, dta_korrekturlaeufe
- **Tests:** JA — `__tests__/abrechnung/e2e-ruecklaeufer-kette.test.ts` (vollständige Kette als Integrationstest), `ruecklaeufer-aufgaben.test.ts`
- **E2E:** NEIN (Browser); Integrationskette JA
- **Fachlich korrekt:** JA im Modell (Rückläufer → Aufgabe → Korrekturlauf); real erst mit echten Kassen-Rückläufern verifizierbar
- **Regulatorisch:** TA1-Fehlerverfahren
- **Bugs:** Keine bekannten
- **Fehlend:** Parser für echte Antwortdateien der Annahmestellen (Formatvielfalt) — nur gegen Eigenformat getestet
- **Priorität:** P1 (hängt an P0 Kassenabrechnung)

### OPOS (Offene Posten)
- **Status:** EXISTIERT
- **Dateien:** `app/admin/forderungen/`, `app/admin/zahlungseingaenge/**` (inkl. zuordnung), `app/admin/zahlungskontrolle/`, `app/api/billing/payments/**` (allocate), `app/api/billing/differences/`, `lib/billing/core/payments.ts`
- **DB-Tabellen:** payments, payment_allocations, payment_differences, payment_status, dunning_entries
- **Tests:** TEILWEISE — über billing-Statusmaschine/Reconciliation-Tests (`status-constraint`, `pre-backfill-security`, PR35-Reconciliation lt. audit/), keine dedizierte OPOS-Suite
- **E2E:** NEIN
- **Fachlich korrekt:** JA (Teilzahlungen via allocations, Differenzen inkl. Status 'strittig')
- **Regulatorisch:** GoBD
- **Bugs:** Keine bekannten
- **Fehlend:** Bank-Import (MT940/CAMT) — Zahlungseingänge werden manuell erfasst/zugeordnet
- **Priorität:** P1 (Bank-Import fehlt = manueller Engpass)

### Mahnwesen
- **Status:** EXISTIERT
- **Dateien:** `lib/billing/core/dunning.ts`, `app/api/billing/dunning/route.ts`, `app/api/billing/dunning/advance/route.ts`
- **DB-Tabellen:** dunning_entries
- **Tests:** NEIN (keine dedizierte dunning-Suite; Statusübergänge teilweise über status-machine-Tests)
- **E2E:** NEIN
- **Fachlich korrekt:** UNKLAR — Stufenlogik vorhanden (advance), Mahngebühren/Verzugszins und Brief-/Mail-Versand aus dem Modul heraus nicht verifiziert
- **Regulatorisch:** BGB §§286 ff. (Verzug), Vorgaben für Kassen ≠ Privat (Kassen mahnt man nicht per Standard-Mahnlauf)
- **Bugs:** Keine bekannten
- **Fehlend:** Tests, Mahnschreiben-Generierung (PDF/Versand), Trennung Privat-/Kassenforderungen im Mahnlauf verifizieren
- **Priorität:** P2

### Monatsabschluss (Ergänzung, im Auftrag implizit)
- **Status:** EXISTIERT — `app/admin/monatsabschluss/**`, `monatsabschluss-vorbereitung/`, `lib/abrechnung/monatsabschluss.ts`, `app/api/billing/monthly-closing/`, Tabellen monthly_closings, `20260706_monatsabschluss_ki_pruefzentrale.sql` (KI-Prüfzentrale), plus pflege_doku_perioden. Tests indirekt. Priorität P1.

---

## H) Steuerung, Qualität, Compliance

### Reporting
- **Status:** TEILWEISE
- **Dateien:** `app/admin/analytics/`, `app/mis/analytics/`, `app/mis/finance/`, `app/api/billing/dta/dashboard/`, `lib/workflow/dashboard.ts`, `app/admin/dashboard/`, page_views/analytics_events-Tracking
- **DB-Tabellen:** analytics_events, page_views, mis_kpis, mis_financial_reports, conversions
- **Tests:** NEIN
- **E2E:** NEIN
- **Fachlich korrekt:** UNKLAR — operative Dashboards ja; betriebswirtschaftliches Reporting (Umsatz je Kostenträger/Leistungsart, Auslastung je Engel, DB-Rechnung) nicht als eigenes Modul verifiziert
- **Regulatorisch:** —
- **Fehlend:** Standard-Reports (Umsatz, Auslastung, Budgetausschöpfung je Klient), Export
- **Priorität:** P2

### QM (Qualitätsmanagement)
- **Status:** TEILWEISE
- **Dateien:** `app/admin/quality/`, `app/mis/quality/`, `app/mis/complaints/`, `app/admin/pruefprotokoll/`
- **DB-Tabellen:** mis_quality_audits, mis_quality_processes, mis_capa, mis_complaints, satisfaction_calls, reviews/angel_reviews
- **Tests:** NEIN
- **E2E:** NEIN
- **Fachlich korrekt:** UNKLAR — MIS-Modul wirkt als eigenständiges Management-Informations-System (teils vom Kernprodukt entkoppelt); QM-Handbuch/Prozesslenkung nicht mit Betriebsdaten verzahnt
- **Regulatorisch:** §45a-Qualitätsanforderungen der Länder; bei Zulassung: MD-QPR
- **Fehlend:** Beschwerde→CAPA-Workflow mit Betriebsdaten verknüpft, QM-Dokumentenlenkung
- **Priorität:** P2

### Audits (intern/extern)
- **Status:** TEILWEISE
- **Dateien:** `app/admin/ops-audit/`, `app/mis/quality/` (mis_quality_audits), `app/admin/pruefprotokoll/`, umfangreiche Selbst-Audits in `audit/` (80+ Berichte, Security-Release 2026-08-09 P0=0/P1=0)
- **DB-Tabellen:** mis_quality_audits, mis_capa
- **Tests:** NEIN (fachlich)
- **E2E:** NEIN
- **Fachlich korrekt:** UNKLAR
- **Regulatorisch:** MD-Prüfung (bei Zulassung), Landesprüfungen §45a
- **Fehlend:** Auditplan mit Wiedervorlage-Kopplung, Prüfungs-Readiness-Checkliste §45a
- **Priorität:** P3

### Fristen
- **Status:** EXISTIERT
- **Dateien:** `app/admin/wiedervorlagen/`, `app/api/ops/wiedervorlagen/**`, `lib/ops/wiedervorlagen.ts`; `lib/akten/ablauf-warnungen.ts` + `app/admin/dokumente/ablauf/`; `app/api/personal/qualifikationen/ablauf/`; Eskalationsregeln (`lib/ops/eskalationen.ts`)
- **DB-Tabellen:** ops_wiedervorlagen, ops_eskalationsregeln, ops_eskalationshistorie
- **Tests:** JA — `__tests__/ops/wiedervorlagen.test.ts`, `eskalationen.test.ts`, `lib/akten/__tests__/ablauf.test.ts`
- **E2E:** NEIN
- **Fachlich korrekt:** JA
- **Regulatorisch:** Verordnungs-Gültigkeit (2–6 Monate, in verordnungen modelliert), Qualifikations-/Dokumentablauf
- **Bugs:** Keine bekannten
- **Fehlend:** zentrale Fristenübersicht über alle Quellen (Wiedervorlagen + Dok-Ablauf + Quali-Ablauf + Verordnungsende in einer Ansicht)
- **Priorität:** P2

### Schulungen
- **Status:** EXISTIERT
- **Dateien:** `app/api/personal/schulungen/**`, `lib/personal/schulungen.ts`, `app/mis/training/`, Migration `20260705_mis_training.sql`
- **DB-Tabellen:** personal_schulungen, mis_training_catalog, mis_training_records
- **Tests:** TEILWEISE (personal-Suite deckt Schulungen nicht separat; qualifikationen.test.ts angrenzend)
- **E2E:** NEIN
- **Fachlich korrekt:** JA (Basiskurs-Pflicht für §45a-Betreuungskräfte über Qualifikationen abbildbar)
- **Regulatorisch:** §45a-Landesvorgaben (Hessen: Schulungsumfang Betreuungskräfte), jährliche Fortbildungspflicht
- **Bugs:** Doppelstruktur personal_schulungen vs. mis_training_* (nicht synchronisiert)
- **Fehlend:** Fortbildungs-Pflichtstunden-Tracking pro Jahr mit Warnung
- **Priorität:** P2

---

## I) Plattform & Compliance

### Admin
- **Status:** EXISTIERT
- **Dateien:** `app/admin/**` (90+ Seiten), `components/admin/**`, Middleware-Route-Protection (audit/MIDDLEWARE_ROUTE_PROTECTION_REPORT.md), `app/api/admin/**`
- **DB-Tabellen:** app_settings, admin_audit_log, content_blocks
- **Tests:** JA — Security-Suiten (p0-1-admin-auth, admin-ui-security)
- **E2E:** NEIN
- **Fachlich korrekt:** JA
- **Regulatorisch:** DSGVO Art. 32
- **Bugs:** Parallelwelt `app/mis/**` (22 Seiten) mit eigenem Auth-Log/Context — Abgrenzung zum Admin unklar, teils redundante Module (quality, documents, contracts, scheduling)
- **Fehlend:** Konsolidierung admin ↔ mis
- **Priorität:** P2

### Datenschutz
- **Status:** EXISTIERT
- **Dateien:** `app/api/user/delete/**` (Soft-Delete + Undo), `supabase/functions/account-hard-delete/` (60-Tage-Hard-Delete via pg_cron), `lib/emails/account-deletion.ts`, `components/CookieConsent.tsx`, `app/datenschutz/`, `app/mis/privacy/`, Migrationen `20260419_soft_delete.sql`, `20260804300000_fix_all_auth_user_fks.sql`
- **DB-Tabellen:** account_deletion_tokens, mis_privacy_consents, mis_privacy_requests, mis_privacy_records, mis_privacy_audit_log, profiles.deleted_at
- **Tests:** JA — `__tests__/dsgvo-all-auth-user-fks.test.ts`, `dsgvo-user-delete-fk.test.ts`, `__tests__/shadow-db/dsgvo-account-deletion.test.ts`
- **E2E:** JA — `e2e/auth-delete.spec.ts`
- **Fachlich korrekt:** JA (Löschkette über alle FKs getestet)
- **Regulatorisch:** DSGVO Art. 17 (Löschung), Art. 20 (Portabilität — **fehlt**), Art. 15 (Auskunft — nicht automatisiert)
- **Bugs:** Spannungsfeld: DSGVO-Löschung vs. GoBD/SGB-Aufbewahrungspflichten für Abrechnungsdaten — Anonymisierung statt Löschung für abgerechnete Daten im Code nicht verifiziert
- **Fehlend:** Datenexport für Betroffene (Art. 20), Auskunfts-Report (Art. 15), Verzeichnis von Verarbeitungstätigkeiten im System
- **Priorität:** P1 (Aufbewahrungs-/Löschkonflikt klären)

### Audit Logs
- **Status:** EXISTIERT
- **Dateien:** `lib/audit-log.ts`, `lib/billing/core/audit.ts`, `lib/personal/audit.ts`, `lib/workflow/audit.ts`, `lib/akten/zugriff-log.ts`, `lib/ops/aktivitaetslog.ts`, `app/api/billing/audit/`, `app/admin/workflow/audit/`, Migration `20260806600000_audit_security.sql` (+ Probe-Zeilen-Doku 20260817020000)
- **DB-Tabellen:** audit_logs, admin_audit_log, billing_audit_trail, personal_audit_log, service_record_audit_log, assignment_audit_log, akten_zugriff_log, wf_audit_log, mis_audit_log, mis_auth_log, ops_aktivitaetslog, kf_pricing_audit, state_settings_audit
- **Tests:** JA — audit_security-Migration mit Test-Suiten (p0-secdef, audit-Bezug in billing-Suiten)
- **E2E:** NEIN
- **Fachlich korrekt:** JA (append-only-Härtung per 20260806600000)
- **Regulatorisch:** DSGVO Art. 32, GoBD
- **Bugs:** 13 verschiedene Audit-Tabellen ohne einheitliches Schema/zentrale Auswertung
- **Fehlend:** zentraler Audit-Viewer über alle Logs
- **Priorität:** P2

### Export
- **Status:** TEILWEISE
- **Dateien:** DTA-Export `app/api/billing/dta/[id]/export/`, Rechnungs-PDF `app/api/admin/invoices/[id]/generate-pdf/`, Leistungsnachweis-PDF `lib/abrechnung/leistungsnachweis-pdf.ts`, Dokument-Download `app/api/akten/dokumente/[id]/download/`
- **DB-Tabellen:** invoice_snapshots (GoBD-Festschreibung)
- **Tests:** TEILWEISE (Snapshot-Logik über billing-Suiten)
- **E2E:** NEIN
- **Fachlich korrekt:** JA für vorhandene Exporte
- **Regulatorisch:** GoBD Z1–Z3-Datenzugriff (Betriebsprüfung: maschinenlesbarer Export **fehlt**), DATEV
- **Bugs:** Keine bekannten
- **Fehlend:** CSV-/DATEV-Export (0 Treffer im Code), GoBD-Z3-Export, Gesamtdatenexport je Mandant
- **Priorität:** P1 (steuerliche Prüfbarkeit)

### Schnittstellen
- **Status:** TEILWEISE
- **Dateien:** DTA/SECON/SFTP (`lib/abrechnung/{secon,transport,auftragsdatei}.ts` — dakota-Ersatz in Eigenbau), Stripe (`lib/stripe/**`, Webhook), WhatsApp Business (`app/api/whatsapp/webhook/`), FCM/WebPush (`lib/fcm.ts`, `lib/push.ts`), Meta CAPI (`app/api/analytics/capi/`), Google Reviews (`app/api/google-reviews/`), Sentry (`app/sentry-example/`), IndexNow (`app/api/cron/indexnow/`), Capacitor/Expo Native-Bridge (`app/api/native/**`)
- **DB-Tabellen:** je Schnittstelle (s. o.); offline_queue, sync_conflicts (Native-Sync)
- **Tests:** TEILWEISE — `lib/abrechnung/secon.test.ts`; Stripe/WhatsApp/FCM ungetestet
- **E2E:** NEIN
- **Fachlich korrekt:** UNKLAR für SECON (Eigenimplementierung der GKV-Verschlüsselung — Architekturentscheidung dokumentiert in audit/SECON_ARCHITECTURE_DECISION.md, aber nur eigen-verifiziert)
- **Regulatorisch:** GKV-Datenaustausch-Richtlinien, ab Dez 2026 KIM-Pflicht (im Code als TODO vermerkt), PSD2 (Stripe)
- **Bugs:** Keine bekannten
- **Fehlend:** KIM, Bank-Import (CAMT), Lohn-Schnittstelle, eAU
- **Priorität:** P1 (KIM-Deadline Dez 2026)

---

# ZUSAMMENFASSUNG

## Zählung
- **Gesamtzahl geprüfte Module:** 45 (Auftragsliste) + 1 Ergänzung (Monatsabschluss)
- **EXISTIERT:** 29
- **TEILWEISE:** 12 (PDL, Pflegeplanung, Medikationsverwaltung, SGB V, Verhinderungspflege, Übergaben, Reporting, QM, Audits, Angehörigenzugang, Export, Schnittstellen)
- **FEHLT:** 4 (SIS, Vitalwerte, Wunddokumentation, Tourenplanung)

## Test-Realität
- Sehr gute Abdeckung: Billing/Rechnungen (13 Suiten), Security/RLS (10+), ops (10), personal (6), pflege (4), akten (4), abrechnung/DTA (7)
- Null Tests: OCR, Mahnwesen, Kalender, Verordnungen/Krankenfahrten, QM/Reporting, Medikation
- Browser-E2E: nur 3 B2C-Specs (Registrierung, Buchung, Account-Löschung). **Kein einziges Admin-/Abrechnungs-Browser-E2E.**

## P0-Liste
1. **Kassenabrechnung Echtlauf-Verifikation** — kompletter DTA-Stack (EDIFACT §105, SECON, Auftragsdatei, SFTP) ist gebaut und unit-getestet, aber nie gegen eine echte Datenannahmestelle gelaufen (Erprobungsverfahren). Ohne das: kein Kassen-Umsatz, Fall Rita Meyer bleibt blockiert.

## P1-Liste
1. Leistungsnachweis-/Abrechnungs-Kette Browser-E2E (Signatur → Nachweis → Rechnung → DTA-Lauf)
2. Verhinderungspflege: Anspruchs-/Jahresbudget-Verwaltung (§39, GVE 2025) fehlt trotz aktiver Vermarktung
3. §45b: Übertrags-Verfallsautomatik (30.06.) verifizieren/nachrüsten
4. SGB V: Entscheidung + ggf. §302-Abrechnungsstrecke (Krankenfahrten/Behandlungspflege)
5. Export/GoBD: DATEV-/Z3-Export fehlt komplett (steuerliche Prüfbarkeit)
6. Datenschutz: Konflikt DSGVO-Löschung vs. GoBD/SGB-Aufbewahrung (Anonymisierungsstrategie für abgerechnete Daten)
7. Rollen-Inkonsistenz 'pdl'/'buero' (tote Rollenpfade in Policies/Checks)
8. OPOS: Bank-Import (CAMT/MT940) fehlt — Zahlungszuordnung rein manuell
9. Schnittstellen: KIM-Transport (Pflicht ab Dez 2026, im Code als TODO)
10. Rückläufer: Parser für echte Annahmestellen-Antwortformate
11. Dienstplanung: ArbZG-Validierung (Ruhezeiten/Höchstarbeitszeit)
12. E-Rechnung (XRechnung) für Rechnungen

## Top 5 kritische Lücken
1. **DTA-Erprobungsverfahren nie durchlaufen** — das gesamte Kassenabrechnungs-Modul ist produktionsbereit gebaut, aber unverifiziert gegen die reale Gegenstelle (P0).
2. **Keine Browser-E2E für den Geldweg** — Einsatz → Signatur → Nachweis → Rechnung → Zahlung ist nur auf DB-Ebene getestet; der Umsatzprozess hat keinen UI-Regressionstest.
3. **Verhinderungspflege ohne Backend-Substanz** — beworben (eigene Landingpage + Blog), abrechenbar als Rechtsgrundlage, aber keine Anspruchs-/Jahresbudgetführung nach der 2025er GVE-Reform.
4. **GoBD-Datenzugriff/DATEV fehlt** — Rechnungen sind festschreibbar (gut), aber es gibt keinerlei maschinenlesbaren Export für Steuerberater/Betriebsprüfung.
5. **Fachliche Doppelstrukturen** — admin vs. mis (22 redundante Seiten), caregivers vs. angels, documents vs. akten_dokumente, personal_schulungen vs. mis_training: erhöht Wartungslast und Inkonsistenzrisiko in jeder künftigen Änderung.

## Explizit NICHT gefundene Module (Klartext)
- SIS (Strukturierte Informationssammlung): kein Code
- Vitalwerte: kein Code
- Wunddokumentation: kein Code
- Tourenplanung: kein Code (nur Einsatz-/Dienstplanung ohne Routen)
- DATEV/CSV-Export: kein Code
- KIM, eAU, Bank-Import: kein Code

*Hinweis Priorisierung: P3-Einstufungen für Vitalwerte/Wunddoku spiegeln das aktuelle Geschäftsmodell (Alltagsbegleitung §45a, keine Pflege im engeren Sinn). Bei Kassenzulassung als Pflegedienst (SGB V/XI) rücken SIS, PDL, Vitalwerte und Wunddoku auf P1.*
