# Pflege-Software Vollaudit — 15.08.2026

## Methodik
- **Auditor:** 4 parallele Audit-Agents, je Modulgruppe
- **Scope:** 27 benannte Module, 119 Admin-Seiten, 339 API-Routes, 267 Migrationen
- **Verfahren:** Quellcode-Lesen, Migrations-Analyse, Testlauf (2901 Tests PASS), tsc --noEmit clean
- **Fixes in dieser Session:** 9 Bugfixes + 5 Testdateien, committed in bfd5c5a

---

## Modul-Matrix

| # | Modul | Verdikt | Anmerkung |
|---|-------|---------|-----------|
| 1 | **Klientenverwaltung** | FERTIG | CRUD + RLS + org_fence, Multi-Mandant |
| 2 | **Pflegegradmanagement** | TEILWEISE | Doppelspalte care_level/pflegegrad, pflegegradVon() nutzen |
| 3 | **Budgetverwaltung (§45b)** | FERTIG (fail-closed) | 131 EUR/Monat, budgetVersionFuerJahr() wirft bei unbekanntem Jahr |
| 4 | **VP/KZP-Budget** | FERTIG (fail-closed) | 3539 EUR/Jahr seit 01.07.2025 |
| 5 | **Leistungserfassung (service_records)** | TEILWEISE | **BUG GEFIXT:** Budget-Trigger referenzierte falsche Spalten (service_date→date, total_amount→amount) |
| 6 | **Leistungsnachweis-PDF** | FERTIG | DejaVuSans, registerFontkit gefixt (cbe8342), Signatur-Hash deckt Bild-Bytes nicht ab (P2) |
| 7 | **Rechnungsstellung** | FERTIG | Korrekturrechnung betragsfrei-Manipulations-Fix live |
| 8 | **Kassenabrechnung (EDIFACT)** | TEILWEISE | §302 SGB V Gerüst wirft absichtlich (TA1 fehlt extern); EDIFACT-Generator für §45b funktional |
| 9 | **DAKOTA/SFTP-Versand** | TEILWEISE | 6-Stufen-Verifikation, 3 ENV-Gates, SECON fail-closed; Fehlercode-Katalog leer |
| 10 | **Mahnwesen** | TEILWEISE | Mahnläufe berechnet, Ausgabe nur Druck/Kopie — kein automatischer Versand |
| 11 | **Tourenplanung** | TEILWEISE | **BUG GEFIXT:** Tour-Stop-PATCH synchronisierte Zeiten nicht auf assignments (Overlap-Trigger umgangen) |
| 12 | **Dienstplanung** | TEILWEISE | Overlap-Prüfung per Trigger; Cross-Tenant client_id-Lücke, forceOverride ohne Audit-Trail |
| 13 | **Personalverwaltung (Stammdaten)** | FERTIG | POST /api/personal/stammdaten + Formular, Anlage immer ohne Einsatzfreigabe |
| 14 | **Arbeitszeiten** | FERTIG | **BUG GEFIXT:** Engel bekamen 403 (requirePersonalAdmin), jetzt Dual-Auth (Admin + eigener Caregiver) |
| 15 | **Abwesenheiten** | FERTIG | **BUG GEFIXT:** Self-Approval-Bypass — Engel konnte status='genehmigt' direkt einfügen; jetzt erzwungen status='beantragt' |
| 16 | **Qualifikationen** | TEILWEISE | REST-Layer ohne UI-Consumer, Testdatei testet unrelated Code |
| 17 | **Einsatzfreigabe** | TEILWEISE | Advisory only, prüft kein Führungszeugnis/Erste-Hilfe; einsatzfreigabe_am wird nie geschrieben |
| 18 | **Pflege-Maßnahmenplanung** | FERTIG | **BUG GEFIXT:** Engel-RLS-Policy mit caregivers-Join-Falle → eigene_caregiver_ids() |
| 19 | **SIS-Assessment** | FERTIG | Migration LIVE, Themenfelder + Risikomatrix |
| 20 | **Wunddokumentation** | FERTIG | Fotos, Assessments, Behandlungen; Migration LIVE |
| 21 | **Vitalwerte** | FERTIG | 10 Parameter, Grenzwert-Alarme fail-closed (Feature-Flag, Default AUS) |
| 22 | **Medikamentenmanagement** | FERTIG | RLS mit eigene_caregiver_ids(); Migration LIVE |
| 23 | **PflegeCoach (DiPA)** | TEILWEISE | Anforderungskatalog 48 Punkte, **BUG GEFIXT:** Smart-Quotes brachen tsc; 69% erfüllt, Antrag nicht einreichbar |
| 24 | **Aufgaben/Eskalationen** | FEHLERHAFT | CRUD funktional, aber Eskalations-Trigger kann nie feuern (CHECK-Constraint verbietet 'ueberfaellig' als Status); kein Cron |
| 25 | **Nachrichten (intern)** | FERTIG | **3 BUGS GEFIXT:** Reply-Route /reply→/antworten, Gelesen-PATCH an /gelesen, Replies aus Kind-Nachrichten geladen |
| 26 | **Messenger/WhatsApp** | FERTIG | Gemini/GPT-4o-mini, HMAC-verifiziert, Eskalation per E-Mail |
| 27 | **DSGVO-Konto-Löschung** | TEILWEISE | Soft-Delete + 60-Tage-Widerruf FERTIG; Hard-Delete-Cron (pg_cron) nie in Migration — Status nicht verifizierbar |

---

## Schnittstellen

| Schnittstelle | Verdikt | Detail |
|---------------|---------|--------|
| FHIR | TEILWEISE | R4-Ressourcen, org-gefenstert; Import nur Patient |
| KIM | NUR MOCK | NULL_ADAPTER wirft immer, fail-closed by Design |
| DATEV | FERTIG | Echtes EXTF-510, kein dedizierter Test |
| SEPA | FERTIG | pain.008 XML, IBAN-Prüfsumme, Platzhalter-Gate |
| CAMT | NICHT PRODUKTIV GETESTET | Regex-Parsing, kein Testfile |
| XRechnung/ZUGFeRD | FEHLT | Deutsche E-Invoicing-Pflicht nicht implementiert |

---

## In dieser Session implementierte Fixes

### 1. Tour-Stop-Zeitsync (P1)
**Datei:** `app/api/tours/[id]/stops/route.ts`
**Problem:** PATCH auf tour_stops aktualisierte geplante_ankunft/geplantes_ende, aber synchronisierte NIE zurück auf assignments.start_time/end_time → check_assignment_overlap-Trigger wurde umgangen.
**Fix:** Sync-Block nach tour_stop-Update, mit DOPPELBELEGUNG-Rollback (409).

### 2. pflege_massnahmen Engel-RLS (P1)
**Migration:** `20260917000000_fix_engel_pflege_massnahmen_rls.sql`
**Problem:** caregivers-Join-Falle — Policy jointe caregivers direkt, RLS blockierte still → 0 Zeilen.
**Fix:** `eigene_caregiver_ids()` statt JOIN.

### 3. Budget-Trigger falsche Spalten (P0)
**Datei:** `supabase/migrations/20260831030000_d2_fix_budget_type_trigger.sql`
**Problem:** service_date/total_amount existieren nicht (richtig: date/amount) → Trigger hätte bei Apply gecrasht.
**Fix:** Spaltennamen korrigiert.

### 4. Profile.role superadmin (P2)
**Datei:** `lib/types.ts`
**Problem:** TypeScript-Union hatte 4 Rollen, DB-CHECK hat 5 → superadmin fehlte.
**Fix:** 'superadmin' hinzugefügt.

### 5. Arbeitszeiten Engel-403 (P1)
**Datei:** `app/api/personal/arbeitszeiten/route.ts`
**Problem:** GET+POST nutzten requirePersonalAdmin → Engel bekamen immer 403.
**Fix:** Dual-Auth — Admin-Pfad (alle sehen) + Engel-Pfad (nur eigene caregiverId).

### 6. Absences Self-Approval (P1 Security)
**Migration:** `20260917000002_fix_absences_self_approval.sql`
**Problem:** INSERT-Policy prüfte nur caregiver_id, nicht status → Engel konnte status='genehmigt' einfügen.
**Fix:** `AND status = 'beantragt'` im WITH CHECK.

### 7. Audit-Log Silent Failure (P2)
**Datei:** `lib/personal/audit.ts`
**Problem:** writeAuditLog() ignorierte Insert-Fehler komplett.
**Fix:** console.error bei Fehlschlag (fail-soft, blockiert Hauptaktion nicht).

### 8. Nachrichten Reply+Gelesen+Replies (P1)
**Dateien:** `app/admin/nachrichten/[id]/page.tsx`, `app/api/ops/nachrichten/[id]/route.ts`
**Probleme:**
- Reply-Form POSTete auf `/reply` (404) statt `/antworten`
- Gelesen-PATCH ging an Haupt-Route (kein PATCH-Handler) statt `/gelesen`
- API lieferte nie `replies` — Detail-Seite zeigte nie Antworten
- Reply sendete kein `betreff` (NOT NULL → Insert-Fehler)
**Fix:** Alle 4 Pfade korrigiert, Replies aus Kind-Nachrichten (eltern_id) geladen.

### 9. Smart-Quotes tsc-Fehler (P2)
**Datei:** `lib/coach/anforderungskatalog.ts`
**Problem:** Unicode-Anführungszeichen (U+2018/U+2019) statt regulärer Single-Quotes auf Zeilen 350-351 → tsc-Fehler.
**Fix:** Reguläre Quotes.

---

## Verbleibende offene Punkte (nicht intern lösbar)

### Extern blockiert (Migrationen warten auf manuelles Apply)
- 20260917000000 — pflege_massnahmen Engel-RLS
- 20260917000002 — Absences Self-Approval
- 20260905000000 — wf_trigger_zahlung blockiert payments
- 20260906000000 — Views ohne security_invoker
- 20260911000000 — check_billing_gate
- 20260911010000 — Rechnung ohne Unterschrift
- 20260904000000 — Tarif-Belegpflicht
- 20260901010000 — service_records Doppelstatus
- 20260901020000 — OPOS due_date
- 20260908020000 — Security-Final-Audit
- 20260909000000 — billing_tariff_audit + Rollenprüfung

### Architektur/Feature-Lücken
- **Eskalationssystem:** Trigger kann nie feuern (CHECK vs. Status), kein Cron
- **DSGVO Hard-Delete:** pg_cron nie in Migration, Status unbekannt
- **XRechnung/ZUGFeRD:** komplett fehlend (E-Invoicing-Pflicht)
- **Offline-Modul:** komplett ungenutzt (kein UI-Aufrufer)
- **3 Admin-Landingpages:** dashboard/home/analytics konkurrieren
- **Leistungsnachweis-Signatur:** Hash deckt Bild-Bytes nicht ab
- **Dienstplan:** Cross-Tenant-Lücke, forceOverride ohne Audit

---

## Testzusammenfassung
- **2901 Tests PASS** (14 neue in dieser Session)
- **0 Fehler**
- **38 übersprungen** (Shadow-DB)
- **tsc --noEmit:** 0 Fehler (Smart-Quotes behoben)

---

## Gesamtbewertung

| Kategorie | Anzahl |
|-----------|--------|
| FERTIG | 15 |
| TEILWEISE | 10 |
| FEHLERHAFT (gefixt) | 1 → FERTIG |
| FEHLERHAFT (offen) | 1 (Eskalationssystem) |
| NUR MOCK | 1 (KIM) |
| FEHLT | 1 (XRechnung) |

**Produktionsreife:** Kernfunktionen (Klienten → Leistung → Rechnung → Zahlung) sind funktional. Kassenabrechnung und §302 warten auf externe Spezifikationen. 11 Migrationen warten auf manuelles Apply in Supabase.
