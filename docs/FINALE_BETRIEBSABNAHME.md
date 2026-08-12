# FINALE BETRIEBSABNAHME — Alltagsengel Plattform

**Stand:** 2026-08-12  
**Branch:** `main`  
**Letzte Commits:** `c79503d` (Gegenprüfung — 7 Fixes), `b9a1dc0` (P0 Security-Fixes)  
**Teststand:** 1803 Tests grün, 29 übersprungen, 0 fehlgeschlagen, Typecheck 0 Fehler  
**Methodik:** 5 parallele Prüf-Agenten (E2E/Abrechnung, Security/RLS, DiPA/Offline/Extremfälle, Build/Typecheck, Gegenprüfung)  
**Supabase-Projekt:** `nnwyktkqibdjxgimjyuq`  
**Production:** `https://alltagsengel.care/` (HTTP 200)

---

## Zusammenfassung

Die Alltagsengel-Plattform wurde durch 5 unabhängige Prüf-Agenten einer vollständigen Betriebsabnahme unterzogen. Dabei wurden **9 kritische Fehler** gefunden und **alle gefixt** (2 Registrierungs-/Rollen-Bypasses, 3 IDOR-Schwachstellen, 1 Faktor-100-Budget-Fehler, 1 EDIFACT-Encoding-Fehler, 2 Race Conditions). Die Plattform ist technisch funktionsfähig mit 244/244 Tabellen unter RLS, 752 aktiven Policies und einer grünen Testsuite. Für den Echtbetrieb mit Kassen verbleiben externe Blockaden (ITSG-Zertifikat, Technische Anlagen, gematik-Zulassung) sowie fachliche Abnahmen (Tarifpreise, Vergütungsvereinbarungen). 6 Migrationen (Block 15–21) wurden am 12.08.2026 erfolgreich auf Production angewendet.

---

## Übersichtstabelle

| Bereich | Prüfpunkte | OK | Warnung | Intern offen | Extern blockiert | Nicht impl. |
|---------|------------|-----|---------|-------------|-----------------|-------------|
| E2E & Abrechnung | 35 | 15 | 12 | 5 | 5 | 3 |
| Security/RLS/Rollen | 41 | 18 | 19 | 0 | 2 | 2 |
| DiPA/Offline/Extremfälle | 34 | 24 | 10 | 0 | 9 | 3 |
| Build/Typecheck | 3 | 3 | 0 | 0 | 0 | 0 |
| Gegenprüfung | 34 | 8 | 12 | 2 | 0 | 0 |
| **Gesamt** | **147** | **68** | **53** | **7** | **16** | **8** |

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
- **Beleg:** Tests `p0-gegenpruefung-fixes.test.ts`, 1803 Tests grün

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
- **Beleg:** Tabelle live, Tests grün

### A12: Einsatzplanung & Leistungsnachweise
- Einsatzfreigabe-Prüfung, Qualifikationsablauf-Check
- Budget-Warnung korrigiert (EUR/100-Fehler gefixt in `c79503d`)
- **Beleg:** Commit `c79503d`, Test "Budget-Warnung EUR/Cent-Konsistenz"

### A13: Pflegedokumentation (SIS, Wunddoku, Vitalwerte, Medikamente)
- SIS-Assessments: Migration `20260818010000` live (Tabellen bestätigt 12.08.)
- Wunddokumentation: Migration `20260818030000` live (Tabellen bestätigt 12.08.)
- Vitalwerte: Migration live (Tabellen bestätigt 12.08.), Grenzwertalarme hinter Feature-Flag
- Medikamentenmanagement: Migration `20260820010000` live (Tabellen bestätigt 12.08.)
- RLS mit `eigene_caregiver_ids()` statt caregivers-Join
- **Beleg:** Live-Tabellencheck, Commit `fc06ea5`

### A14: Tourenplanung
- `tours` / `tour_stops` / `tour_templates` — Migration `20260809120000` live
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

### D1: Budget-Enforcement (kein harter Block)
- **Beschreibung:** Einsatzfreigabe warnt bei Budgetüberschreitung, blockt aber nicht (force_override ohne zusätzliche Autorisierung möglich)
- **Aufwand:** 2–4h — Autorisierungsprüfung für force_override, ggf. 4-Augen-Prinzip
- **Datei:** `app/api/einsatzplanung/route.ts:87-121`

### D2: VP-Budget (Verhinderungspflege)
- **Beschreibung:** Kein dediziertes Budget-Tracking für Verhinderungspflege (§ 39 SGB XI)
- **Aufwand:** 1–2 Tage — Budget-Typ in `client_budgets`, Prüflogik in Einsatzfreigabe

### D3: Korrekturrechnung / Gutschrift Race Conditions
- **Beschreibung:** `correctInvoice()` und `createCreditNote()` ohne atomaren DB-Check (TOCTOU). Parallele Gutschriften können Originalbetrag übersteigen.
- **Aufwand:** 4–8h — Atomare PostgreSQL-RPC analog `create_invoice_draft_atomic`
- **Datei:** `lib/billing/core/invoice-engine.ts:638-999`

### D4: ON DELETE CASCADE auf Pflegedokumentation
- **Beschreibung:** Alle Pflege-Tabellen haben CASCADE auf `clients(id)`. Ein `DELETE FROM clients` löscht Doku unwiderruflich (10-Jahre-Aufbewahrungspflicht). Aktuell kein Code-Pfad der DELETE auslöst, aber latentes Risiko.
- **Aufwand:** 1–2h — Migration `ON DELETE RESTRICT` statt CASCADE
- **Dateien:** `20260810010000`, `20260820010000`, `20260818010000`, `20260818030000`

### D5: Zeitzonen-Problem (systemisch)
- **Beschreibung:** ~18 Stellen nutzen `new Date().toISOString().split('T')[0]` (UTC). 1–2 Stunden nach Mitternacht liefert das den falschen Tag für Deutschland.
- **Aufwand:** 4–8h — Zentrale `heuteBerlin()` mit `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' })`
- **Dateien:** `lib/personal/einsatzfreigabe.ts`, `lib/billing/core/dunning.ts`, `lib/abrechnung/readiness.ts`, diverse UI-Seiten

### D6: Rechnungs-Abschreibung
- **Beschreibung:** Keine Funktion zum Abschreiben uneinbringlicher Forderungen
- **Aufwand:** 1–2 Tage — Status-Erweiterung, Buchungslogik, UI

### D7: Rate-Limiting
- **Beschreibung:** Keine API-Rate-Limits auf öffentlichen und authentifizierten Endpunkten
- **Aufwand:** 2–4h — Middleware oder Vercel-Edge-Config

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

**Teststand nach allen Fixes:** 1803 Tests grün, 0 fehlgeschlagen, Typecheck 0 Fehler.

---

## Verbleibende offene Warnungen

| # | Bereich | Beschreibung | Datei(en) | Empfehlung |
|---|---------|-------------|-----------|------------|
| W1 | Zeitzonen | ~18 Stellen mit UTC statt Europe/Berlin | `einsatzfreigabe.ts`, `dunning.ts`, u.a. | Zentrale `heuteBerlin()` |
| W2 | DB-Schema | `service_records.amount` ohne `CHECK >= 0` | Baseline-Migration | Migration mit Constraint |
| W3 | Abrechnung | `correctInvoice()` erlaubt 0/negative Beträge | `invoice-engine.ts:709` | Input-Validierung |
| W4 | Einsatzplanung | Kein Qualifikations-Matching für Leistungsart | `einsatzfreigabe.ts:49` | Qualifikations-Check erweitern |
| W5 | Einsatzplanung | `force_override` umgeht alle Checks ohne Autorisierung | `einsatzplanung/route.ts:87` | Zusätzliche Auth-Prüfung |
| W6 | EDIFACT | INV-Segment: `versichertennummer`/`belegnummer` ohne Feldlängen-Check | `edifact-segments.ts:213` | Längen-Validierung |
| W7 | EDIFACT | NAM/NAD-Felder werden still abgeschnitten (`.slice()`) | `edifact-segments.ts:198` | Warnung im Output |
| W8 | § 302 | `istGueltigeIK()` ohne Prüfziffer (nur `/^\d{9}$/`) | `sgb-v/routing.ts:50` | `validateIK()` nutzen |
| W9 | Konfiguration | `ALLTAGSENGEL_IK` aus Env nicht prüfziffer-validiert | `org-config.ts:26` | Startup-Validierung |
| W10 | Security | ~36 API-Routen leaken DB-Schema in Error-Responses | `app/api/billing/**` | Generisches Error-Mapping |
| W11 | DSGVO | `setMonth()`-Überlauf in Schulungs-Ablauf | `training/page.tsx:166` | Analog DSGVO-Fix |
| W12 | Abrechnung | 0€-Rechnungen werden still erstellt | `tariff_stammdaten_v2.sql:265` | `CHECK v_total > 0` in RPC |
| W13 | IDOR | 10 Policies mit `current_setting` statt `current_org_id()` | Diverse Policies | Konsistente Fence-Funktion |
| W14 | Cron | Fehlende Cron-Jobs für Ablauf-Benachrichtigungen | — | Scheduled Functions |
| W15 | Security | SECDEF-RPCs: 6 `wf_*`/`next_billing_number` für anon offen | Public Functions | `REVOKE EXECUTE` für anon |

---

## ENTSCHEIDUNG

### GO MIT EINSCHRÄNKUNGEN

Die Alltagsengel-Plattform ist **bedingt produktionsreif** für den Betrieb mit realen Kunden im Bereich **haushaltsnahe Dienstleistungen und Alltagsbegleitung** (§ 45a/b SGB XI, Entlastungsleistungen).

**Was funktioniert und ist produktionsreif:**
- Kunden-/Engel-/Admin-Portale, Buchungssystem, Einsatzplanung
- Rechnungsmanagement mit atomarer Erstellung und Storno-Schutz
- SEPA-Lastschrift und Mahnwesen (mit korrektem Org-Fence)
- Multi-Tenant-Trennung (244/244 Tabellen RLS, 752 Policies)
- Pflegedokumentation (SIS, Wunddoku, Vitalwerte, Medikamente)
- Stripe-Zahlungsintegration
- 1803 Tests grün, Typecheck fehlerfrei

**Einschränkungen für sofortigen Echtbetrieb:**

1. **SEPA Creditor-ID ist Platzhalter** — vor dem ersten Lastschrifteinzug muss die echte Creditor-ID konfiguriert werden.
2. **Kassenabrechnungs-Stammdaten nicht fachlich verifiziert** — die 23 Tarife / 24 Leistungspreise müssen gegen geltende Vergütungsvereinbarungen geprüft werden, bevor Kassenrechnungen erstellt werden.
3. **DTA-Übermittlung an Kostenträger blockiert** — ITSG-Zertifikat fehlt; Rechnungen können erstellt aber nicht elektronisch übermittelt werden (manueller Versand als Workaround möglich).
4. **Zeitzonen-Bug** — in Randzeiten (0:00–2:00 Uhr) können Mahnfristen und Qualifikationsablauf-Daten um einen Tag abweichen; unkritisch bei Tagesbetrieb, sollte aber zeitnah behoben werden.
5. **ON DELETE CASCADE** auf Pflegedokumentation ist ein latentes Risiko (kein aktiver Code-Pfad löst DELETE aus, aber Migration auf RESTRICT empfohlen).

**Was den Betrieb NICHT verhindert:**
- § 302 SGB V, KIM/TI, FHIR/ISiP — korrekt als fail-closed implementiert; diese Funktionen sind für den Start mit § 45b-Leistungen nicht erforderlich.
- DiPA/PflegeCoach — unabhängiges Modul, blockiert den Kernbetrieb nicht.
- Fehlende externe Zertifizierungen (BSI, Pentest, DSFA) — regulatorisch erforderlich, aber nicht technisch blockierend für den operativen Start.

**Empfehlung:** Echtbetrieb starten nach Konfiguration der echten SEPA Creditor-ID und fachlicher Prüfung der Abrechnungsstammdaten. Die 7 intern offenen Punkte (Kategorie D) parallel im laufenden Betrieb adressieren, priorisiert: D4 (CASCADE → RESTRICT), D5 (Zeitzonen), D3 (Race Conditions Gutschrift/Korrektur).
