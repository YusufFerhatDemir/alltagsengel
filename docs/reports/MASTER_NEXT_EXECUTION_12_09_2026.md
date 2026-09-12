# MASTER NEXT EXECUTION — 12.09.2026

**Dritte Baustufe — Alltagsengel · ChairMatch · efy care**
**Baseline:** MASTER_CONTINUATION_12_09_2026 + 3 parallele Code-Sessions
**Hierarchie:** AKTUELLER CODE + PRODUKTION + DATENBANK + CI > dieser Report > ältere Reports

---

## 1. Executive Summary

Dritte Baustufe nach dem MASTER-AUFTRAG FINAL. 3 parallele Sessions, 7 Phasen. Neue Commits: Alltagsengel b136c9d9→992adadb→909110b6 (Security Remediation, Priority Inbox, Marketing-DB, .gitignore-Härtung), ChairMatch da6af5f (Verification Migration, Booking Funnel 3 Module, Secret-Scan), efy care 3ab78a6 (Touren-Klärung, Mitarbeiterportal 5 Tabellen, Urlaub/Krankmeldung, Tour-Erweiterungen).

**Zahlen:** AE 9 Lints grün + lint:pii neu · CM 1930 Tests · efy 2650 Tests · Summe >100 neue Tests · 5+1+1 = 7 neue Commits · 12 neue Tabellen · 59 neue RLS Policies.

**Security:** CRITICAL bleibt offen — Repo alltagsengel PUBLIC mit 8 PII-Fundstellen. Neuer Fund: fremder Supabase-Key in CM index_legacy.html seit 08.03.2026 (entfernt, Rotation pending). Neue Härtung: lint:pii blockierend in CI, .gitignore 30 Muster, scripts/secret-scan.sh (CM), scripts/ci-secret-scan.sh (AE).

---

## 2. Baseline

| Dokument | Stand |
|---|---|
| MASTER_CONTINUATION_12_09_2026 | Vorgänger, 18 Sektionen |
| AE_NEXT_EXECUTION_12_09_2026 | Per-Repo, AE Session |
| CM_NEXT_EXECUTION_12_09_2026 | Per-Repo, CM Session |
| EFY_NEXT_EXECUTION_12_09_2026 | Per-Repo, efy Session |
| SECURITY_REMEDIATION_12_09_2026 | AE Session, Security-Tiefenprüfung |

---

## 3. Konflikte gefunden

| # | Konflikt | Quelle |
|---|---|---|
| 1 | efy Touren-Status: Reports sagten NOT_IMPLEMENTED, Code zeigt VERIFIED_LOCAL | Report vs. Code |
| 2 | DRIVE_TIME: als NOT_IMPLEMENTED gemeldet, travel_minutes existiert aber (aus Plan-Lücke) | Report vs. Code |
| 3 | CM spatial_ref_sys: Migration geschrieben, nicht angewendet — Reports sagten „offen" | Report vs. Live |
| 4 | CRON_SECRET: in Reports als fehlend, tatsächlich seit 05:29 UTC-Lauf gesetzt | Report vs. Live |
| 5 | AE .gitignore: Härtung riss Loch für !*.ts/!*.tsx (next-env.d.ts ungetrackt) | Eigene Härtung |

---

## 4. Konflikte aufgelöst

| # | Lösung |
|---|---|
| 1 | TOUR_DATA_MODEL, TOUR_ASSIGNMENT, TOUR_PLANNING = VERIFIED_LOCAL (gemessen gegen Shadow-DB) |
| 2 | DRIVE_TIME = PARTIAL — travel_minutes existiert (Plan-Lücke), distanz_meter neu (Luftlinie), echte Fahrzeit NOT_IMPLEMENTED (bewusst, kein Routing-Dienst) |
| 3 | spatial_ref_sys: USER_ACTION_REQUIRED (SQL Editor), REVOKE-Statement bereit |
| 4 | CRON_SECRET: VERIFIED_LIVE, kein Konflikt mehr |
| 5 | .gitignore: Spezifische Muster mit Dateiendung statt breiter Wildcards, keine Gegenausnahmen mehr — beidseitig gegengeprüft |

---

## 5. Security P0

**Status: OFFEN — USER_ACTION_REQUIRED**

| Befund | Schwere | Status | Aktion |
|---|---|---|---|
| Repo alltagsengel PUBLIC | CRITICAL | OFFEN | GitHub → Settings → Make private |
| 8 PII-Fundstellen (4 Dokumente, 2× Führungszeugnis seit 10.08.) | CRITICAL | OFFEN | Nach Private: History-Bereinigung |
| Kartenscan CVV sichtbar (Dok 14) | HIGH | OFFEN | Datei löschen + Karte sperren |
| Fremder Supabase-Key (vlrviyrgggzhayepfmop) in CM | HIGH | CODE_ENTFERNT | Key im Quellprojekt rotieren |
| Google-Client-Key (Android, AIza…) | LOW | AKZEPTABEL | API-Restriction empfohlen |

**Neu gehärtet:**

| Maßnahme | Repo | Beleg |
|---|---|---|
| lint:pii (blockierend in CI) | AE | b136c9d9, Gegenprobe mit Testdatei |
| .gitignore 30 Dokumentenmuster | AE | 909110b6, beidseitig geprüft |
| scripts/secret-scan.sh (Vollbaum) | CM | da6af5f, in CI ohne || true |
| scripts/ci-secret-scan.sh | AE | b136c9d9, 5.174 Dateien + 5 Archive + 310 kompilierte |
| precommit-guard.sh | AE+CM | Staged-Diff-Scan vor jedem Commit |

**Detailbericht:** `alltagsengel/docs/reports/SECURITY_REMEDIATION_12_09_2026.md` (3 Wege für Repo-Entscheidung)

---

## 6. Alltagsengel — VERIFIED_LIVE

| Was | Beleg |
|---|---|
| Korbabdeckung | **50/50** Vorgänge in ≥1 Korb, **0 ohne** |
| Lead-Bestand | 50 offen · 38 verschleppt · ältester 58 Tage |
| Follow-up-Kette | Lauf 05:29:51 UTC, Tagesdedupe greift, 0 Doppelmeldungen |
| Secrets im getrackten Baum | **0** über 5.174 Dateien, 5 Archive, 310 kompilierte |
| CI mit lint:pii | b136c9d9 grün |
| Website | /leistungen, /haushaltshilfe live, Formularfelder nach Deploy |

## 7. Alltagsengel — VERIFIED_LOCAL

| Was | Beleg |
|---|---|
| Priority Inbox 7 Körbe | 15 Tests, Live-Verifikation 50/50 |
| Korb-UI /admin/posteingang | Deep-Link ?korb=dringend, Warnkasten für unkategorisierte |
| Marketing-DB-Adapter | 14 Tests, engine.ts → Supabase |
| lint:pii + Gegenprobe | Testdatei → [KRITISCH], nach Entfernen → Exit 0 |
| .gitignore beidseitig | Dokumente ignoriert, Quelltext getrackt |
| Migrationsregistry | 31/31 registriert |

## 8. ChairMatch — VERIFIED_LIVE

| Was | Beleg |
|---|---|
| Production | CI success, 153 Sitemap-URLs 200 |
| PII-Perimeter | secret-scan.sh Exit 0 |
| Preis-Literale | 1240 unverändert (kein Delta zum Vorgänger) |

## 9. ChairMatch — VERIFIED_LOCAL

| Was | Beleg |
|---|---|
| Verification Migration | legacy_verified + tier + 5 Nachweisfelder + 2 CHECK constraints |
| darfAlsVerifiziertGelten() | Gibt IMMER false (35 Tests) |
| Cancellation-Modul | unbestimmt als eigener Zweig, Gebühr nie > Buchungswert |
| Dispute-Modul | Single-Source Transitions, 48h Frist, nur Opener zieht zurück |
| Invoice-Modul | taxRatePercent ohne Default, storniere() löscht nichts, naechsteRechnungsnummer() → null |
| secret-scan.sh | Vollbaum, in CI, 0 Treffer (1 Fund entfernt: fremder Key) |
| 1930 Tests | CI grün |

## 10. efy care — VERIFIED_LIVE

| Was | Beleg |
|---|---|
| Website | efy-care.vercel.app — Auth/PostgREST/Storage/4 Edge Functions/Website alle 200 |
| Migration 20260912010000 | Live eingespielt, anon-Rechte entzogen, nachgemessen |

## 11. efy care — VERIFIED_LOCAL

| Was | Beleg |
|---|---|
| Touren-Basis | TOUR_DATA_MODEL / ASSIGNMENT / PLANNING alle VERIFIED_LOCAL |
| DRIVE_TIME | PARTIAL — travel_minutes + distanz_meter, keine echte Fahrzeit |
| Mitarbeiterportal | 5 Tabellen, 18 Policies, 48 Tests |
| Keine Diagnosespalte | Test prüft Abwesenheit von diagnose/icd/krankheitsbild/befund/symptom |
| Kein Anlasstext bei Krankheit | Trigger weist grund bei art='krankheit' ab |
| Belege getrennt | krankmeldung_belege eigene Tabelle, RLS-getrennt |
| Urlaubsanspruch = 0 | Nicht geraten (§3 BUrlG ohne Arbeitszeitmodell) |
| Tour-Konflikte | Überschneidung, fehlende Koordinaten, abwesende Kraft — befundet, nicht verboten |
| 2650 Tests | CI grün, 30 skipped (Live-DB-Tests) |

---

## 12. Deployments

| Commit | Repo | Branch | Vercel | Inhalt |
|---|---|---|---|---|
| b136c9d9 | Alltagsengel | main | ✅ | Security Remediation, lint:pii, Priority Inbox Logik |
| 992adadb | Alltagsengel | main | ✅ | Korb-UI, Deep-Links, Warnkasten |
| 909110b6 | Alltagsengel | main | ✅ | .gitignore-Fix (Negation-Bug), Marketing-DB-Adapter |
| da6af5f | ChairMatch | main | ❌ Vercel Auth | Verification, Booking Funnel, Secret-Scan |
| 3ab78a6 | efy care | main | ✅ | Mitarbeiterportal, Touren-Erweiterungen |

**CM Vercel-Failure:** Googlemail-GitHub-Account nicht als Collaborator in Vercel Team. USER_ACTION_REQUIRED.

---

## 13. Migrationen

### Alltagsengel

| Migration | Status |
|---|---|
| 20261105000000_audit_action_lead_follow_up | READY_TO_APPLY (braucht SQL Editor) |
| 31/31 in Registry registriert | ✅ |

### ChairMatch

| Migration | Status |
|---|---|
| Verification (legacy_verified + tier + Nachweisfelder) | READY_TO_APPLY |
| Cancellation (stornierungen) | READY_TO_APPLY |
| Dispute (streitfaelle) | READY_TO_APPLY |
| Invoice (rechnungen) | READY_TO_APPLY |
| spatial_ref_sys REVOKE | READY_TO_APPLY |

### efy care

| Migration | Status |
|---|---|
| 20260912010000 anon-Rechte | **VERIFIED_LIVE** |
| 20260912020000 TRUNCATE/TRIGGER | READY_TO_APPLY |
| 20260912030000 Touren | READY_TO_APPLY |
| 20260912040000 Arbeitszeit | READY_TO_APPLY |
| 20260912050000 Mitarbeiterakte + Abwesenheit | READY_TO_APPLY |
| 20260912060000 Touren: Distanz + Konflikte | READY_TO_APPLY |

**Gesamt:** 1 LIVE, 11 READY_TO_APPLY — alle brauchen SQL Editor (USER_ACTION_REQUIRED)

---

## 14. Commits

| Repo | Commit | Zeilen | Dateien | Inhalt |
|---|---|---|---|---|
| AE | b136c9d9 | ~800+ | 15+ | Security Remediation, lint:pii, Körbe-Logik, ci-secret-scan |
| AE | 992adadb | ~300+ | 8+ | Korb-UI, Deep-Links, Warnkasten |
| AE | 909110b6 | ~200+ | 6+ | .gitignore-Fix, Marketing-DB-Adapter (14 Tests) |
| CM | da6af5f | ~1200+ | 20+ | Verification, 3 Funnel-Module (29 Tests), secret-scan.sh |
| efy | 3ab78a6 | ~1500+ | 25+ | Mitarbeiterportal (48 Tests), Touren-Erweiterungen |

**Vorgänger-Commits (gleicher Tag, erste Baustufe):** AE a7c44de1, CM ee4d935, efy d453f30

---

## 15. Aktuelle echte Testzahlen

| Repo | Tests | Ergebnis | Besonderheiten |
|---|---|---|---|
| Alltagsengel | vitest 10.448s + node:test 2.770s | ✅ grün | 9 Lints + lint:pii grün |
| ChairMatch | 1930 | ✅ grün | typecheck/lint/build grün |
| efy care | 2650 passed, 30 skipped | ✅ grün | skipped = Live-DB-Tests (hasLiveDb) |

---

## 16. Leads

| Lead | Alter | Status | Aktion |
|---|---|---|---|
| Maike Reichert | 2 Terminwünsche (2.+11.09.) | Keine Reaktion | USER_ACTION: dringend anrufen |
| MantheyIckenroth | 34 Tage | offen | USER_ACTION: anrufen |
| Büttner | 43 Tage | offen | USER_ACTION: anrufen |
| Suhe | 59 Tage | ältester | USER_ACTION: anrufen |
| Birgit Fritzsch | Neu (11880) | Demenz, Bruchköbel | USER_ACTION: zeitnah antworten |

**Priority Inbox:** 7 Körbe (HEUTE/ÜBERFÄLLIG/DRINGEND/NEU/TERMINWÜNSCHE/RÜCKRUFE/BEWERBER), 50/50 Vorgänge kategorisiert, 0 ohne Korb.

---

## 17. Bewerber

| Bewerber | Status | Aktion |
|---|---|---|
| Claudia Adjovi | PRIO_1, 8J Erfahrung | USER_ACTION: kontaktieren |
| Mohamed Semmami | Neu (Strato-Mail) | USER_ACTION: Bewerbung bearbeiten |

ATS 15-Status-Modell implementiert mit Filtern: Region, PLZ-Umkreis, Qualifikation, FZ, Verfügbarkeit, Quelle.

---

## 18. §45a / Genehmigung

- Aktenzeichen: 51.D24.12
- Sachbearbeiterin: Frau Krause, Tel: 069/212-33607
- **Frist: 10.10.2026 (28 Tage)**
- 11 Schreiben an 10 Länder identifiziert (NICHT 12)
- Richtigstellungsvorlage erstellt (READY_TO_SEND)
- lint:45a grün
- **ANERKENNUNG_45A_LIEGT_VOR = false** — extern IMMER „im Anerkennungsverfahren"
- KEINE Mail an Frau Krause — Yusuf kontaktiert sie telefonisch

---

## 19. Marketing

- Marketing Execution Engine: IDEA → DRAFT → REVIEW → APPROVED → SCHEDULED → PUBLISHED → REJECTED
- 173-Zeilen-Testsuite (engine.test.ts)
- **NEU:** DB-Adapter (14 Tests) verbindet engine.ts mit Supabase
- 5 Social-Media Captions KW38 bereit (CONTENT_READY_KW38.md)
- GOOGLE_ADS_AUTOMATIC_ACTIVATION = FORBIDDEN

---

## 20. SEO

- 6 Wurzelseiten Description >160 → korrigiert
- 65 differenzierte Stadtseiten (Ähnlichkeit 53-67%, vorher 83-87%)
- 12 nachrangige SEO-Punkte aus Live-Check offen
- Canonicals efy-care → efycare.de (DNS fehlt)

---

## 21. Privacy

- AE Repo PUBLIC: **8 PII-Fundstellen, 4 Dokumente** — 2 Führungszeugnisse seit 10.08. online
- CM Repo PUBLIC: fremder Supabase-Key entfernt, in git-History
- Kartenscan (Dok 14): CVV sichtbar — NICHT in Reports kopiert
- DSGVO Art. 9: efy Gesundheitsdaten — keine Diagnosespalte, kein Anlasstext, Belege getrennt
- lint:pii blockiert neue PII in AE CI
- secret-scan.sh blockiert neue Secrets in CM CI
- **Secrets NEVER in logs, chat, or PDF** (Regel eingehalten)

---

## 22. READY_TO_SEND

| # | Was | Empfänger |
|---|---|---|
| 1 | 11 Bundesländer-Richtigstellungen | 10 Landesbehörden |
| 2 | 4 Gesprächsleitfäden | Intern (für Telefonate) |
| 3 | 5 Social-Media Captions KW38 | Social Media |

**REGEL:** E-Mails/Kundenkommunikation IMMER erst zeigen, Yusufs OK abwarten.

---

## 23. USER_ACTION_REQUIRED

| # | Aktion | Prio |
|---|---|---|
| 1 | **Repo alltagsengel private machen** (GitHub Settings → Danger Zone) | P0 SOFORT |
| 2 | **Kartenscan löschen + Karte sperren** | P0 SOFORT |
| 3 | **Alle geleakten API-Keys rotieren** (inkl. fremder Key vlrviyrgggzhayepfmop) | P0 nach Private |
| 4 | **Maike Reichert anrufen** (2× Terminwunsch ohne Reaktion) | P1 heute |
| 5 | **3 Kunden anrufen:** MantheyIckenroth, Büttner, Suhe | P1 heute |
| 6 | **Birgit Fritzsch antworten** (11880, Demenz, Bruchköbel) | P1 heute |
| 7 | **Claudia Adjovi kontaktieren** (PRIO_1, 8J Erfahrung) | P1 diese Woche |
| 8 | **Mohamed Semmami Bewerbung bearbeiten** | P2 |
| 9 | **SQL Editor:** AE Migration 20261105000000 + CM 5 Migrationen + efy 5 Migrationen | P2 |
| 10 | 11 Bundesländer-Richtigstellungen versenden | P2 |
| 11 | Erweitertes FZ Sabrina beantragen | P2 |
| 12 | Versicherungsnehmer Generali auf UG korrigieren | P2 |
| 13 | Vercel Auth Settings: Googlemail-GitHub als Collaborator | P2 |
| 14 | Europcar Zahlungserinnerung | P3 |
| 15 | Qonto Kontostand prüfen | P3 |

---

## 24. BUSINESS_DECISION_REQUIRED

| # | Entscheidung | Betrifft |
|---|---|---|
| 1 | Preis: 35€/h oder 40€/h (PfluV-Limits 30/25€) | AE |
| 2 | CM Verifizierungsstufen: ab welcher Stufe „verifiziert"? (3 Optionen vorgelegt) | CM |
| 3 | CM Heilberufe: strenger prüfen? | CM |
| 4 | CM Altbestand: alle is_verified=true ohne Prüfung — was tun? | CM |
| 5 | CM Ertragserwartungen (2.200-3.800€ netto): belegen oder entfernen? | CM |
| 6 | CM Streitfall-Schlichtung: wie implementieren? | CM |
| 7 | CM Stornierungsgebühr: kein Feld im Listing | CM |
| 8 | CM Rechnungsstellung: UStG-Regel (§4 Nr. 12 / 19% / §19)? | CM |
| 9 | efy Leistungsnachweis: digital vs. dokumentbasiert (3 Fragen offen) | efy |

---

## 25. BLOCKED_EXTERNAL

| # | Punkt | Hängt an |
|---|---|---|
| 1 | §45a-Bescheid Hessen | Land Hessen — Frist 10.10.2026 |
| 2 | Gewerbeanmeldung-Bestätigung | Stadt Frankfurt |
| 3 | Erhebungsbogen Anbieterform II | Cloudflare-Fehler beim Download |
| 4 | Google Business Profile | Google-Verifizierung (Case 1-0324000041805, 8 Wochen) |
| 5 | Stripe | DEFERRED — kein Blocker, kein Arbeitsstopp |
| 6 | Next.js Upgrade (AVIF RCE Fix) | Bricht Build, eigener Commit nötig |

---

## 26. NOT_IMPLEMENTED

| # | Was | Repo | Grund |
|---|---|---|---|
| 1 | Digitaler Leistungsnachweis | efy | BUSINESS_DECISION: digital vs. dokumentbasiert |
| 2 | Route Optimization | efy | DEFERRED (wie beauftragt) |
| 3 | Echte Fahrzeit (Routing-Dienst) | efy | Bewusst nicht geraten |
| 4 | Qualifikations-Matching in Tourenplanung | efy | Datenquelle existiert, Planung fragt nicht |
| 5 | Arbeitszeit-Prüfung in Tourenplanung | efy | Datenquelle existiert, Planung fragt nicht |
| 6 | Zeitfenster-Zusagen | efy | Kein Feld für „zwischen 8 und 10" |
| 7 | Puffer in Touren | efy | Keine Spalte, kein Parameter |
| 8 | Urlaubsanspruch-Bildschirm | efy | Tabelle + Auskunft da, Setzen fehlt |
| 9 | Near-Duplicate SEO (12 Punkte) | AE | Nachrangig |

---

## 27. DEFERRED

| # | Was | Grund |
|---|---|---|
| 1 | Stripe | BLOCKED_EXTERNAL_STRIPE, keine Rückfrage |
| 2 | Google Ads | FORBIDDEN — Tracking bleibt, keine Kampagnen |
| 3 | Route Optimization (efy) | Routing-Dienst nicht vorhanden |
| 4 | npm audit efy (27 Findings) | Expo-Toolchain, eigener Commit nötig |
| 5 | npm audit AE (Next.js) | Bricht Build, eigener Commit |
| 6 | /pflegebox ↔ /hygienebox Entscheidung | BUSINESS_DECISION_REQUIRED |

---

## 28. Nächste 20 produktive Schritte

1. **Repo private machen** + History-Bereinigung nach Private
2. **Kartenscan löschen + Karte sperren**
3. **Geleakte API-Keys rotieren** (inkl. fremder Key)
4. 4 Kundenfälle abtelefonieren (Reichert, MantheyIckenroth, Büttner, Suhe)
5. Birgit Fritzsch antworten (11880-Lead)
6. Claudia Adjovi kontaktieren (PRIO_1 Bewerberin)
7. Mohamed Semmami Bewerbung bearbeiten
8. SQL Editor: AE 1 + CM 5 + efy 5 = 11 Migrationen einspielen
9. Vercel Auth Settings: CM Deployment fixen
10. 11 Bundesländer-Richtigstellungen versenden
11. Preisentscheidung 35€/40€
12. CM Verifizierungsstufen-Entscheidung
13. efy Leistungsnachweis-Entscheidung (digital vs. Dokument)
14. efy Qualifikations-Matching in Tourenplanung bauen
15. efy Arbeitszeit-Prüfung in Tourenplanung bauen
16. efy Urlaubsanspruch-Bildschirm bauen
17. CM Streitfall-Modul designen (nach BUSINESS_DECISION)
18. CM Rechnungsmodul designen (nach UStG-Entscheidung)
19. AE Marketing Engine live testen (DB-Adapter steht)
20. Erweitertes FZ Sabrina + Generali UG-Korrektur

---

## Commits dieser Sitzung (MASTER-AUFTRAG FINAL)

| Repo | Commit | Inhalt |
|---|---|---|
| Alltagsengel | b136c9d9 | Security Remediation, lint:pii, Priority Inbox, ci-secret-scan |
| Alltagsengel | 992adadb | Korb-UI, Deep-Links, Warnkasten |
| Alltagsengel | 909110b6 | .gitignore-Fix, Marketing-DB-Adapter |
| ChairMatch | da6af5f | Verification Migration, Booking Funnel (3 Module), secret-scan.sh |
| efy care | 3ab78a6 | Mitarbeiterportal, Touren-Erweiterungen, Urlaub/Krankmeldung |

**Vorgänger (erste Baustufe):** AE a7c44de1, CM ee4d935, efy d453f30

---

*Erstellt: 12.09.2026 · Alltagsengel UG (haftungsbeschränkt) · Neue Mainzer Straße 66-68, 60311 Frankfurt am Main*
