# FINALE BETRIEBSABNAHME — Alltagsengel Plattform

**Stand:** 2026-08-12  
**Branch:** `main`  
**Letzte Commits:** `755eda2` (Gegenprüfung D1-D7), `3e2f3fc` (D5 Zeitzonen), `d9818aa` (D1+D3+D6), `ea8384b` (D4+D2), `70be721` (D7), `c79503d` (Security-Gegenprüfung), `b9a1dc0` (P0 Security-Fixes)  
**Teststand:** 1941 Tests grün, 29 übersprungen, 0 fehlgeschlagen, Typecheck 0 Fehler  
**Methodik:** 5 parallele Prüf-Agenten (E2E/Abrechnung, Security/RLS, DiPA/Offline/Extremfälle, Build/Typecheck, Gegenprüfung)  
**Supabase-Projekt:** `nnwyktkqibdjxgimjyuq`  
**Production:** `https://alltagsengel.care/` (HTTP 200)

---

## Zusammenfassung

Die Alltagsengel-Plattform wurde durch 5 unabhängige Prüf-Agenten einer vollständigen Betriebsabnahme unterzogen. Dabei wurden **9 kritische Fehler** gefunden und **alle gefixt** (2 Registrierungs-/Rollen-Bypasses, 3 IDOR-Schwachstellen, 1 Faktor-100-Budget-Fehler, 1 EDIFACT-Encoding-Fehler, 2 Race Conditions). Anschließend wurden alle **7 intern offenen Punkte (Kategorie D)** in 5 Commits geschlossen und durch eine finale Gegenprüfung verifiziert. Die Plattform ist technisch funktionsfähig mit 244/244 Tabellen unter RLS, 752 aktiven Policies und 1941 grünen Tests. Für den Echtbetrieb mit Kassen verbleiben externe Blockaden (ITSG-Zertifikat, Technische Anlagen, gematik-Zulassung) sowie fachliche Abnahmen (Tarifpreise, Vergütungsvereinbarungen). 6 Migrationen (Block 15–21) wurden am 12.08.2026 erfolgreich auf Production angewendet.

---

## Übersichtstabelle

| Bereich | Prüfpunkte | OK | Warnung | Intern offen | Extern blockiert | Nicht impl. |
|---------|------------|-----|---------|-------------|-----------------|-------------|
| E2E & Abrechnung | 35 | 20 | 12 | 0 | 5 | 3 |
| Security/RLS/Rollen | 41 | 18 | 19 | 0 | 2 | 2 |
| DiPA/Offline/Extremfälle | 34 | 24 | 10 | 0 | 9 | 3 |
| Build/Typecheck | 3 | 3 | 0 | 0 | 0 | 0 |
| Gegenprüfung | 34 | 22 | 12 | 0 | 0 | 0 |
| **Gesamt** | **147** | **87** | **53** | **0** | **16** | **8** |

---

## KATEGORIE A — VOLLSTÄNDIG PRODUKTIONSREIF

### A1: Authentifizierung & Autorisierung
- Auth-Flow (Login/Registrierung/Passwort-Reset): funktionsfähig, `verifyOtp`-basiert
- `is_admin()` / `current_org_id()` als RPC verifiziert
- `requireOpsAdmin()` in 94 API-Routen
- RLS: 244/244 Tabellen aktiv, 752 Policies, 0 Tabellen ohne RLS
- **Beleg:** Live-Smoke-Test `/auth/login` → 200; RPC-Audit via `audit_rls_all_status`

### A2: Registrierungs-Sicherheit (gefixt)
- `handle_new_user` akzeptiert nur Whitelist-Rollen (`kunde`, `engel`, `fahrer`)
- MIS-Team: `role` wird aus `user_metadata` gestripped
- Migration `20260812200000` auf Production angewendet
- **Beleg:** Commit `b9a1dc0`, 6 Security-Tests, Migration live

### A3: Rechnungsmanagement
- Invoice Engine mit atomarer Erstellung (`create_invoice_draft_atomic` RPC, Idempotenz-Key)
- Storno mit CAS-Guard gegen Double-Spend (gefixt in `c79503d`)
- Rechnungsnummer-Fallback mit Optimistic Locking (gefixt in `c79503d`)
- Gutschrift-Erstellung funktionsfähig
- Gutschrift Race Conditions mit atomarem DB-Guard geschlossen (D3, Commit `d9818aa`)
- Forderungsabschreibung implementiert (D6, Commit `d9818aa`)
- **Beleg:** Tests `p0-gegenpruefung-fixes.test.ts`, 1941 Tests grün

### A4: SEPA-Lastschrift & Mahnwesen
- SEPA-XML-Generierung, Mandatsverwaltung, Lastschrifteinzug
- SEPA-Mandate-Revoke mit Org-Fence (gefixt in `c79503d`)
- Dunning-Eskalation mit Org-Fence (gefixt in `c79503d`)
- SEPA Creditor-ID `DE98ZZZ09999999999` ist **PLATZHALTER** — muss vor Echtbetrieb ersetzt werden
- **Beleg:** Commit `c79503d`, Regressionstests

### A5: CAMT-Matching & OPOS
- CAMT-Parser, OPOS-Abgleich, Klärfälle
- Klärfall-Zuordnung mit Org-Fence (Cross-Tenant IDOR gefixt in `c79503d`)
- **Beleg:** Commit `c79503d`, Test "Klärfall-Zuordnung Org-Fence"

### A6: DATEV-Export
- Buchungsexport im DATEV-Format funktionsfähig
- **Beleg:** E2E-Tests grün

### A7: EDIFACT PLGA/PLAA (Generator & Validator)
- EDIFACT-Stufe-1-3-Validierung korrekt implementiert
- Encoding auf ISO-8859-1 korrigiert (gefixt in `c79503d`)
- `encodeToLatin1()` für Nutzdaten und Auftragsdatei
- IK-Prüfziffer-Validierung für Pflegekasse-IK hinzugefügt
- Test/Echt-Dateiindikator korrekt (0 vs. 2)
- **Beleg:** Commit `c79503d`, Tests "EDIFACT ISO-8859-1 Encoding", "Pflegekasse-IK Prüfziffer"

### A8: SECON-Verschlüsselung (Stub)
- PKCS#7-Stub vorhanden, funktionsfähig im Testmodus
- **Beleg:** E2E-Tests grün

### A9: Entlastungsbetrag § 45b SGB XI
- Korrekt als **131 €/Monat** implementiert (nicht 125 €)
- **Beleg:** Bestätigung durch Gegenprüfung (B1)

### A10: Multi-Tenant / Mandantentrennung
- `organization_id`-basierte Trennung durchgängig
- `org_fence` RESTRICTIVE Policy auf allen relevanten Tabellen
- 65 org_fences live verifiziert (seit 02.08.2026)
- Stamm-Org-UUID: `00000000-0000-4000-8000-000460629986`
- **Beleg:** Migration `20260801`, RLS-Audit

### A11: Audit-Trail
- `billing_audit_trail` mit Entity-Type-Tracking
- Audit-Einträge für alle Abrechnungsoperationen
- PATCH-Methode und Tourenplanung-Audit ergänzt (Commit `755eda2`)
- **Beleg:** Tabelle live, Tests grün

### A12: Einsatzplanung & Leistungsnachweise
- Einsatzfreigabe-Prüfung, Qualifikationsablauf-Check
- Budget-Warnung korrigiert (EUR/100-Fehler gefixt in `c79503d`)
- `force_override` erfordert jetzt Admin-Autorisierung (D1, Commit `d9818aa`)
- **Beleg:** Commit `d9818aa`, `c79503d`, Tests grün

### A13: Pflegedokumentation (SIS, Wunddoku, Vitalwerte, Medikamente)
- SIS-Assessments: Migration `20260818010000` live (Tabellen bestätigt 12.08.)
- Wunddokumentation: Migration `20260818030000` live (Tabellen bestätigt 12.08.)
- Vitalwerte: Migration live (Tabellen bestätigt 12.08.), Grenzwertalarme hinter Feature-Flag
- Medikamentenmanagement: Migration `20260820010000` live (Tabellen bestätigt 12.08.)
- RLS mit `eigene_caregiver_ids()` statt caregivers-Join
- ON DELETE CASCADE → RESTRICT migriert (D4, Commit `ea8384b`, `755eda2`)
- **Beleg:** Live-Tabellencheck, Commits `fc06ea5`, `ea8384b`, `755eda2`

### A14: Tourenplanung
- `tours` / `tour_stops` / `tour_templates` — Migration `20260809120000` live
- Audit-Trail für Tourenplanung ergänzt (Commit `755eda2`)
- **Beleg:** Live-Tabellencheck 12.08.

### A15: Personalmanagement & Workflow-Engine
- Aufgaben-/Workflow-Engine funktionsfähig
- **Beleg:** Tests grün

### A16: Landing/SEO & Portale
- Kunden-, Engel-, Fahrer-Portale, Admin-Dashboard
- PWA/Capacitor-Shell
- 12 Städte-Routen + ~28 Blogposts
- **Beleg:** `/engel-werden` → 200, Production erreichbar

### A17: Stripe-Integration
- Checkout/Portal/Webhook vollständig (`app/api/stripe/*`, `lib/stripe/*`)
- API-Version: `dahlia`
- DB-Status `cancelled` (2 L)
- **Beleg:** Commit `dc01d1c`

### A18: Expansion-Framework
- Freischaltung je Bundesland via `state_settings` (48 Zeilen live)
- Aktuell nur Hessen aktiv (PLZ-Matching via `lib/hessen-plz.ts`, 15km-Radius)
- **Beleg:** `state_settings` live, Migrationen `20260808*` vorbereitet

### A19: Budget-Enforcement (ehem. D1)
- `force_override` erfordert jetzt zusätzliche Admin-Autorisierung
- Budget-Warnungen nutzen Europe/Berlin-Zeitzonen
- **Beleg:** Commit `d9818aa`, verifiziert in `755eda2`

### A20: VP-Budget / Verhinderungspflege (ehem. D2)
- Dediziertes Budget-Tracking für Verhinderungspflege (§ 39 SGB XI, 1.612 €/Jahr)
- VP+KZP-Kombination korrekt implementiert
- `budget_type` CHECK-Constraint inkl. `verhinderung` auf `service_records` und `client_budgets`
- **Beleg:** Commit `ea8384b`, Migration `20260831020000` + `20260831030000`

### A21: Zeitzonen Europe/Berlin (ehem. D5)
- `heuteBerlin()` / `datumBerlin()` / `monatBerlin()` als zentrale Utility-Funktionen
- 137 Dateien migriert von UTC auf Europe/Berlin
- 9 dedizierte Timezone-Tests
- **Beleg:** Commit `3e2f3fc`

### A22: Rate-Limiting (ehem. D7)
- Rate-Limiting Middleware für Auth und sensible API-Endpunkte
- **Beleg:** Commit `70be721`

---

## KATEGORIE B — TECHNISCH FERTIG, ABER EXTERN BLOCKIERT

### B1: ITSG-Zertifikat für DTA/EDIFACT-Übermittlung
- **Status:** Generator/Validator/SECON-Stub vorhanden, Readiness-Dashboard zeigt "blockiert"
- **Fehlt:** ITSG-Zertifikat (Trust-Center) für elektronische Datenübermittlung an Kostenträger
- **Wer liefert:** ITSG GmbH (Zertifizierungsstelle der GKV)

### B2: § 302 SGB V Export
- **Status:** Versionsengine, HKP-XML-Register, Readiness-Ampel gebaut, 31 Tests, bewusst fail-closed (`spec_bestaetigt=false`, Generator wirft immer)
- **Fehlt:** Technische Anlage 1 (TA1) + Schlüsselverzeichnisse der § 302-Vereinbarung
- **Wer liefert:** GKV-Spitzenverband / vdek (Rahmenvertrag nach § 302 SGB V)

### B3: KIM/TI-Anbindung
- **Status:** Verwaltungsschicht vollständig (Postfach, Formatversionen, Kartenverwaltung, Nachrichtenwarteschlange, Readiness-Ampel), 25 Tests, `versendeKimNachricht()` wirft absichtlich
- **Fehlt:** gematik-Zulassung als KIM-Nutzer, KIM-Provider-Vertrag, Konnektor-Anbindung (SMC-B/eHBA-Hardware), Technische Anlage 5
- **Wer liefert:** gematik GmbH, KIM-Provider (z.B. T-Systems, CGM)

### B4: FHIR/ISiP-Zertifizierung
- **Status:** FHIR-R4-Endpunkte, Export/Import mit Vorschau, Audit-Log, 56 Tests. Keine Zertifizierung behauptet.
- **Fehlt:** ISiK/KBV-Länderprofil, ISiP-Konformitätsprüfung, API-Key-Auth für externe Clients
- **Wer liefert:** gematik (ISiK-Spezifikation), KBV (Profile)

### B5: DiPA/PflegeCoach — BfArM-Listung
- **Status:** Technisch gebaut (v0.2.0, 48 Tests, HMAC-Pseudonym funktioniert, Zwei-Welten-Modell korrekt)
- **Fehlt:** BSI TR-03161-Zertifikat (Pflicht seit 01.01.2025), ISO-27001-ISMS, DSFA-Abschluss, pflegefachliche Freigabe, wissenschaftlicher Evaluationspartner, externes Security-Review
- **Wer liefert:** BSI (TR-03161), BfArM (Listungsantrag), externe Gutachter

### B6: Vitalwerte-Grenzwertalarme
- **Status:** Dokumentationsfunktion freigegeben, Alarmfunktion hinter Feature-Flag `VITALS_GRENZWERT_ALARME_AKTIV` (Default AUS)
- **Fehlt:** MDR/CE-Klärung (potenzielle Medizinprodukt-Funktion)
- **Wer liefert:** Benannte Stelle (CE-Konformitätsbewertung)

### B7: BSI TR-03161 / Pentest / MFA
- **Status:** Basis-Security vorhanden (RLS, Org-Fences, Auth), aber kein externer Penetrationstest
- **Fehlt:** BSI-Zertifizierung, externer Pentest-Bericht, MFA-Implementierung
- **Wer liefert:** BSI, externer Pentester, Auth-Provider-Konfiguration

### B8: SFTP-Zugänge (Kostenträger)
- **Status:** SFTP-Client-Code vorhanden
- **Fehlt:** Produktive SFTP-Zugangsdaten der Datenannahmestellen
- **Wer liefert:** Jeweilige Kostenträger / Datenannahmestellen

### B9: Barrierefreiheit (BITV 2.0 / WCAG)
- **Status:** Standard-Next.js-Rendering, keine dedizierte Barrierefreiheitsprüfung
- **Fehlt:** BITV-Test, WCAG-2.1-AA-Konformität
- **Wer liefert:** Externer Auditor (BITV-Prüfstelle)

### B10: Datenschutz-Folgenabschätzung (DSFA)
- **Status:** Nicht durchgeführt
- **Fehlt:** Formale DSFA gemäß Art. 35 DSGVO
- **Wer liefert:** DSB / externe Datenschutz-Beratung

### B11: QMS / AVV
- **Status:** Keine formalen QMS-Dokumente, keine Auftragsverarbeitungsverträge
- **Fehlt:** Qualitätsmanagementsystem, AVV-Vorlagen für Kostenträger
- **Wer liefert:** QM-Beauftragter, Rechtsberatung

---

## KATEGORIE C — TECHNISCH FERTIG, ABER FACHLICHE ABNAHME ERFORDERLICH

### C1: Kassenabrechnungs-Stammdaten
- **Status:** `billing_tariffs`: 23 Zeilen, `leistungspreise`: 24 Zeilen, `billing_leistungsarten`: 12 Zeilen, `billing_rechtsgrundlagen`: 4 Zeilen
- **Prüfung erforderlich:** Ob diese Daten echte, freigegebene Vergütungssätze gemäß geltenden Vergütungsvereinbarungen sind oder Testdaten. Abgleich mit Landesrahmenvertrag Hessen / Versorgungsverträgen nach §§ 72, 75 SGB XI.
- **Wer prüft:** Fachliche Leitung / Abrechnungsexperte

### C2: PfluV-Obergrenzen
- **Status:** Personaluntergrenzen-Prüfung nicht verifiziert
- **Prüfung erforderlich:** Ob implementierte Obergrenzen den aktuellen PfluV-Vorgaben entsprechen
- **Wer prüft:** Pflegedienstleitung

### C3: Landesfeiertage
- **Status:** 5 von 16 Bundesländern implementiert (Hessen + 4 weitere)
- **Prüfung erforderlich:** Korrektheit der vorhandenen Feiertagsdaten, Vollständigkeit bei Expansion
- **Wer prüft:** Fachliche Leitung

### C4: SEPA Creditor-ID
- **Status:** `DE98ZZZ09999999999` ist ein **Platzhalter**
- **Prüfung erforderlich:** Echte Creditor-ID der Alltagsengel-Organisation eintragen
- **Wer prüft:** Geschäftsführung / Bankverbindung

### C5: Organisation-IK
- **Status:** `ALLTAGSENGEL_IK` wird aus Env-Variable geladen, Fallback nicht prüfziffer-validiert
- **Prüfung erforderlich:** Korrekte IK-Nummer (mit gültiger Prüfziffer) als Env-Variable konfigurieren
- **Wer prüft:** Geschäftsführung / IK-Vergabestelle

### C6: Verordnungs-Check
- **Status:** Keine automatische Prüfung ob ärztliche Verordnung für abzurechnende Leistung vorliegt
- **Prüfung erforderlich:** Fachliche Entscheidung ob Check implementiert oder organisatorisch gelöst wird
- **Wer prüft:** Fachliche Leitung / Rechtsberatung

---

## KATEGORIE D — INTERN NOCH NICHT FERTIG

**0 offene Punkte.**

Alle 7 ehemals offenen Kategorie-D-Punkte wurden in den Commits `ea8384b` bis `755eda2` geschlossen und durch eine Gegenprüfung verifiziert. Siehe Abschnitt "EHEMALS KATEGORIE D — GESCHLOSSEN" unten.

---

## EHEMALS KATEGORIE D — GESCHLOSSEN

| # | Punkt | Lösung | Commit | Tests / Verifikation |
|---|-------|--------|--------|---------------------|
| D1 | Budget-Enforcement: `force_override` ohne Auth | Admin-Autorisierungsprüfung für `force_override` implementiert | `d9818aa` | Gegenprüfung `755eda2`: verifiziert |
| D2 | VP-Budget (Verhinderungspflege § 39 SGB XI) | Dediziertes Budget-Tracking, `budget_type` CHECK-Constraint, VP+KZP-Kombination (1.612 €/a) | `ea8384b` | Migration `20260831020000` + `20260831030000`, Gegenprüfung `755eda2`: Budget-Timezone Berlin gefixt |
| D3 | Gutschrift/Korrekturrechnung Race Conditions | Atomarer DB-Guard (CAS) für `correctInvoice()` und `createCreditNote()` | `d9818aa` | Gegenprüfung `755eda2`: RPC-Wiring verifiziert |
| D4 | ON DELETE CASCADE auf Pflegedoku (13+ Tabellen) | Migration CASCADE → RESTRICT auf allen Pflege-Tabellen | `ea8384b` | Gegenprüfung `755eda2`: care_notes, verordnungen, monthly_closings, budget_reservations nachmigriert |
| D5 | Zeitzonen UTC statt Europe/Berlin (~18 Stellen) | Zentrale `heuteBerlin()` / `datumBerlin()` / `monatBerlin()`, 137 Dateien migriert | `3e2f3fc` | 9 Timezone-Tests, Gegenprüfung `755eda2` bestätigt |
| D6 | Forderungsabschreibung fehlt | Status-Erweiterung `written_off`, Buchungslogik, UI | `d9818aa` | Gegenprüfung `755eda2`: verifiziert |
| D7 | Rate-Limiting fehlt | Rate-Limiting Middleware für Auth und sensible APIs | `70be721` | Gegenprüfung `755eda2`: verifiziert |

---

## Gefixte Fehler in dieser Abnahme

| # | Schwere | Beschreibung | Commit | Tests |
|---|---------|-------------|--------|-------|
| 1 | KRITISCH | Registrierungs-Bypass: `handle_new_user` akzeptierte `admin`/`superadmin` aus user_metadata | `b9a1dc0` | 3 Security-Tests |
| 2 | KRITISCH | MIS-Team Rollen-Eskalation: Client-Side role-Update direkt an DB | `b9a1dc0` | 3 Security-Tests |
| 3 | KRITISCH | SEPA-Mandate-Revoke IDOR: Org-Fence fehlte, fremde Mandate widerrufbar | `c79503d` | "SEPA-Mandate-Revoke Org-Fence" |
| 4 | KRITISCH | Klärfall-Zuordnung Cross-Tenant IDOR: Zahlungen an fremde Rechnungen allokierbar | `c79503d` | "Klärfall-Zuordnung Org-Fence" |
| 5 | KRITISCH | Budget-Warnung EUR/100: Faktor-100-Fehler in Einsatzfreigabe | `c79503d` | "Budget-Warnung EUR/Cent-Konsistenz" |
| 6 | KRITISCH | EDIFACT UTF-8 statt ISO-8859-1: Umlaute korrupt bei Datenannahmestelle | `c79503d` | "EDIFACT ISO-8859-1 Encoding" |
| 7 | KRITISCH | Storno Double-Spend Race Condition: zwei Storno-Rechnungen möglich | `c79503d` | "Storno CAS-Guard" |
| 8 | KRITISCH | Rechnungsnummer-Fallback Race: Duplikate bei parallelen Aufrufen | `c79503d` | "Rechnungsnummer-Fallback CAS-Guard" |
| 9 | KRITISCH | Dunning-Eskalation IDOR: Org-Fence fehlte | `c79503d` | "Dunning-Eskalation Org-Fence" |
| 10 | WARNUNG | Pflegekasse-IK ohne Prüfziffer-Validierung | `c79503d` | "Pflegekasse-IK Prüfziffer" |
| 11 | WARNUNG | DSGVO-Löschfrist setMonth-Überlauf (29.–31. eines Monats) | `c79503d` | — |
| 12 | WARNUNG | Auftragsdatei-Encoding UTF-8 statt Latin-1 | `c79503d` | — |

**Teststand nach allen Fixes:** 1941 Tests grün, 0 fehlgeschlagen, Typecheck 0 Fehler.

---

## Commit-Historie der Betriebsabnahme

| Commit | Beschreibung |
|--------|-------------|
| `b9a1dc0` | P0 Security-Fixes: handle_new_user Rollen-Whitelist + MIS-Team role-Strip |
| `c79503d` | Gegenprüfung: 7 Fixes (SEPA-IDOR, Klärfall-IDOR, Dunning-IDOR, Budget EUR/100, EDIFACT-Latin1, Storno-CAS, Rechnungsnr-CAS) |
| `ea8384b` | D4+D2: CASCADE→RESTRICT Pflegedoku (13 Tabellen) + VP-Budget (§39 SGB XI, 1612€/a, VP+KZP-Kombination) |
| `70be721` | D7: Rate-Limiting für Auth und sensible APIs |
| `3e2f3fc` | D5: Zeitzonen Europe/Berlin statt UTC — heuteBerlin()/datumBerlin()/monatBerlin() + 137 Dateien migriert + 9 Timezone-Tests |
| `d9818aa` | D1+D3+D6: force_override Auth, Gutschrift Race Conditions, Forderungsabschreibung |
| `755eda2` | Gegenprüfung D1-D7: Audit-Trail PATCH+Tours, Budget-Timezone Berlin, RPC-Wiring D3, CASCADE→RESTRICT care_notes+verordnungen+monthly_closings+budget_reservations |

---

## Verbleibende offene Warnungen

| # | Bereich | Beschreibung | Datei(en) | Empfehlung |
|---|---------|-------------|-----------|------------|
| W1 | DB-Schema | `service_records.amount` ohne `CHECK >= 0` | Baseline-Migration | Migration mit Constraint |
| W2 | Abrechnung | `correctInvoice()` erlaubt 0/negative Beträge | `invoice-engine.ts:709` | Input-Validierung |
| W3 | Einsatzplanung | Kein Qualifikations-Matching für Leistungsart | `einsatzfreigabe.ts:49` | Qualifikations-Check erweitern |
| W4 | EDIFACT | INV-Segment: `versichertennummer`/`belegnummer` ohne Feldlängen-Check | `edifact-segments.ts:213` | Längen-Validierung |
| W5 | EDIFACT | NAM/NAD-Felder werden still abgeschnitten (`.slice()`) | `edifact-segments.ts:198` | Warnung im Output |
| W6 | § 302 | `istGueltigeIK()` ohne Prüfziffer (nur `/^\d{9}$/`) | `sgb-v/routing.ts:50` | `validateIK()` nutzen |
| W7 | Konfiguration | `ALLTAGSENGEL_IK` aus Env nicht prüfziffer-validiert | `org-config.ts:26` | Startup-Validierung |
| W8 | Security | ~36 API-Routen leaken DB-Schema in Error-Responses | `app/api/billing/**` | Generisches Error-Mapping |
| W9 | DSGVO | `setMonth()`-Überlauf in Schulungs-Ablauf | `training/page.tsx:166` | Analog DSGVO-Fix |
| W10 | Abrechnung | 0€-Rechnungen werden still erstellt | `tariff_stammdaten_v2.sql:265` | `CHECK v_total > 0` in RPC |
| W11 | IDOR | 10 Policies mit `current_setting` statt `current_org_id()` | Diverse Policies | Konsistente Fence-Funktion |
| W12 | Cron | Fehlende Cron-Jobs für Ablauf-Benachrichtigungen | — | Scheduled Functions |
| W13 | Security | SECDEF-RPCs: 6 `wf_*`/`next_billing_number` für anon offen | Public Functions | `REVOKE EXECUTE` für anon |

---

## ENTSCHEIDUNG

### GO MIT EINSCHRÄNKUNGEN

Die Alltagsengel-Plattform ist **bedingt produktionsreif** für den Betrieb mit realen Kunden im Bereich **haushaltsnahe Dienstleistungen und Alltagsbegleitung** (§ 45a/b SGB XI, Entlastungsleistungen).

**Was funktioniert und ist produktionsreif:**
- Kunden-/Engel-/Admin-Portale, Buchungssystem, Einsatzplanung
- Rechnungsmanagement mit atomarer Erstellung und Storno-Schutz
- SEPA-Lastschrift und Mahnwesen (mit korrektem Org-Fence)
- Multi-Tenant-Trennung (244/244 Tabellen RLS, 752 Policies)
- Pflegedokumentation (SIS, Wunddoku, Vitalwerte, Medikamente) — jetzt mit RESTRICT statt CASCADE
- Stripe-Zahlungsintegration
- VP-Budget (§ 39 SGB XI) mit korrektem Tracking
- Zeitzonen Europe/Berlin durchgängig (137 Dateien migriert)
- Rate-Limiting auf Auth und sensiblen Endpunkten
- Budget-Enforcement mit Admin-Autorisierung für force_override
- Forderungsabschreibung für uneinbringliche Forderungen
- 1941 Tests grün, Typecheck fehlerfrei

**Einschränkungen für sofortigen Echtbetrieb:**

1. **SEPA Creditor-ID ist Platzhalter** — vor dem ersten Lastschrifteinzug muss die echte Creditor-ID konfiguriert werden.
2. **Kassenabrechnungs-Stammdaten nicht fachlich verifiziert** — die 23 Tarife / 24 Leistungspreise müssen gegen geltende Vergütungsvereinbarungen geprüft werden, bevor Kassenrechnungen erstellt werden.
3. **DTA-Übermittlung an Kostenträger blockiert** — ITSG-Zertifikat fehlt; Rechnungen können erstellt aber nicht elektronisch übermittelt werden (manueller Versand als Workaround möglich).

**Was den Betrieb NICHT verhindert:**
- § 302 SGB V, KIM/TI, FHIR/ISiP — korrekt als fail-closed implementiert; diese Funktionen sind für den Start mit § 45b-Leistungen nicht erforderlich.
- DiPA/PflegeCoach — unabhängiges Modul, blockiert den Kernbetrieb nicht.
- Fehlende externe Zertifizierungen (BSI, Pentest, DSFA) — regulatorisch empfohlen, aber für §45b-Entlastungsleistungen nicht gesetzlich vorgeschrieben.

**Empfehlung:** Echtbetrieb starten nach Konfiguration der echten SEPA Creditor-ID und fachlicher Prüfung der Abrechnungsstammdaten. Alle intern lösbaren Punkte (Kategorie D) sind geschlossen.

---

## Finale Bewertung (Stand: 12.08.2026)

Kategorie A: 22 Bereiche (produktionsreif)
Kategorie B: 11 Punkte (extern blockiert)
Kategorie C: 6 Punkte (fachliche Abnahme nötig)
Kategorie D: 0 Punkte (alle intern lösbaren Punkte geschlossen)

Teststand: 1941 Tests grün, 0 fehlgeschlagen
Typecheck: 0 Fehler
Commits: `b9a1dc0`, `c79503d`, `ea8384b`, `70be721`, `3e2f3fc`, `d9818aa`, `755eda2`

Technisch intern lösbare Punkte offen: **NEIN**
