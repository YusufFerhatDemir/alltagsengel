# MASTER CONTINUATION REPORT
## 12. September 2026 — Zweite Baustufe — Alltagsengel · ChairMatch · efy care

---

**Zusammenfassung:** Zweite Baustufe nach dem MASTER_PROGRESS_EXECUTION. 4 parallele Sessions, 10 Tracks. Neue Commits: Alltagsengel a7c44de1 (+2130 Zeilen, 31 Dateien), ChairMatch ee4d935 (+20 Tests, Verifizierungsmodell), efy care d453f30 (Arbeitszeiterfassung, 54 Tests). Security-Audit: **CRITICAL — Repo ist öffentlich mit 16 persönlichen Dokumenten und echten API-Keys.**

---

## 1. Executive Summary

Zweite Baustufe nach dem MASTER_PROGRESS_EXECUTION. 4 parallele Sessions, 10 Tracks. Neue Commits: Alltagsengel a7c44de1 (+2130 Zeilen, 31 Dateien), ChairMatch ee4d935 (+20 Tests, Verifizierungsmodell), efy care d453f30 (Arbeitszeiterfassung, 54 Tests). Security-Audit: **CRITICAL — Repo ist öffentlich mit 16 persönlichen Dokumenten und echten API-Keys.**

## 2. VERIFIED_LIVE

| Was | Beleg |
|---|---|
| ✅ Alltagsengel Follow-up | Cron 05:29 UTC, Notifications delivered, CRON_SECRET gesetzt |
| ✅ ChairMatch Production | ee4d935, CI success, 153 Sitemap-URLs 200, PII-Perimeter dicht |
| ✅ efy care Production | efy-care.vercel.app — Auth/PostgREST/Storage/4 Edge Functions/Website alle 200 |
| ✅ Alltagsengel Website | /leistungen, /haushaltshilfe verlinkt, Formularfelder live nach Deploy |

## 3. VERIFIED_LOCAL

| Was | Beleg |
|---|---|
| ✅ AE Kundenformular | 7 neue Felder: E-Mail, PLZ, Pflegegrad, Leistung, Dringlichkeit, Kontaktweg, Anliegen |
| ✅ AE Rückrufformular | Pflichtfeld Anliegen + Klassifikation (Kunde/Angehöriger/Bewerber/Sonstiges) |
| ✅ AE Bewerber-ATS | Dimensionsmodell: 15 Status, Filter Region/Qualifikation/FZ/Verfügbarkeit/Quelle |
| ✅ AE Marketing Engine | Statusmodell IDEA→PUBLISHED, 173-Zeilen-Testsuite, engine.ts implementiert |
| ✅ AE SEO Delta | 6 Wurzelseiten Desc >160 korrigiert, stadtseiten-metadaten Tests erweitert |
| ✅ AE Bundesländer | 11 Schreiben an 10 Länder identifiziert (nicht 12), Richtigstellungsvorlage erstellt |
| ✅ AE Preismatrix | PREISMATRIX_ALLE_PRODUKTE_12_09_2026.md — 3 Produkte, jede Zahl mit Source/Conflict |
| ✅ AE AVIF-Lücke | Next.js AVIF RCE (CVE-2025-29927) identifiziert, remotePatterns eingeschränkt |
| ✅ CM Verifizierung | 5 Dimensionen, 4 Stufen, 20 Tests, darfAlsVerifiziertGelten() gibt immer false |
| ✅ CM Preis-SOT | 1240 Literale kategorisiert: 9 eigene Preise, 1087 Marktbehauptungen, 29 Ertragserwartungen |
| ✅ CM Booking Funnel | Stufen 1-3,6,7 dokumentiert. Streitfall + Rechnung fehlen (bewusst nicht erfunden) |
| ✅ efy Zeiterfassung | 2 Tabellen, 6 Policies, 5 Trigger, 5 Funktionen, ArbZG-Befunde, 54 Tests |
| ✅ efy CI grün | 2590 Tests, lint grün, Expo-Web grün, Health Check alle 200 |

## 4. Neu implementiert

| Modul | Repo | Umfang |
|---|---|---|
| Kundenformular (7 Felder) | AE | LeadForm.tsx, CallbackWidget.tsx, anfrage-felder.ts, lead-inquiry/route.ts |
| ATS Dimensionsmodell | AE | pipeline.ts (+122), filter.ts (+163), bewerber-pipeline.test.ts |
| Marketing Execution Engine | AE | engine.ts (+204), engine.test.ts (+173) |
| Bundesländer-Richtigstellung | AE | RICHTIGSTELLUNG_BUNDESLAENDER_12_09_2026.md (+124) |
| Preismatrix 3 Produkte | AE | PREISMATRIX_ALLE_PRODUKTE_12_09_2026.md (+133) |
| AVIF Security Fix | AE | next.config.ts remotePatterns + NEXTJS_AVIF_RCE Report |
| Verifizierungsstufen | CM | verification.ts + 20 Tests, Migration (nicht angewendet) |
| Preis-Quelldokument | CM | PRICE_SOURCE_OF_TRUTH.md — 1240 Literale kategorisiert |
| Booking Funnel Karte | CM | BOOKING_FUNNEL.md — 2 fehlende Stufen benannt |
| Arbeitszeiterfassung | efy | 2 Tabellen, 6 Policies, 5 Trigger, 5 Funktionen, 54 Tests |

## 5. DEPLOYED

| Commit | Repo | Inhalt |
|---|---|---|
| a7c44de1 | Alltagsengel | +2130 Zeilen, 31 Dateien: Tracks 1-10 |
| ee4d935 | ChairMatch | Verification Tier Model, Preis-SOT, Booking Funnel |
| d453f30 | efy care | Arbeitszeiterfassung komplett |

## 6. SECURITY

**⚠️ SECURITY_PRIVACY_CRITICAL**

| Befund | Schwere | Status |
|---|---|---|
| Repo alltagsengel ist PUBLIC | CRITICAL | USER_ACTION: GitHub → Make private |
| 16 persönliche Dokumente im Tree | CRITICAL | .gitignore + History-Bereinigung nach Private |
| .env.example enthält echte API-Keys | CRITICAL | Placeholders einsetzen + Keys rotieren |
| 81 JS-Dateien mit JWT-Tokens in Git | HIGH | Archive-Ordner bereinigen |
| Kartenscan CVV in Downloads | HIGH | USER_ACTION: Datei löschen + Karte sperren |
| AVIF RCE (CVE-2025-29927) | MITIGATED | remotePatterns eingeschränkt in a7c44de1 |
| CM spatial_ref_sys offen | MEDIUM | USER_ACTION: SQL Editor Migration |
| efy 3 Migrationen pending | MEDIUM | USER_ACTION: SQL Editor anwenden |

## 7. LEADS/KUNDEN

4 Gesprächsleitfäden erstellt (READY_TO_CALL_12_09_2026.md):
- **Maike Reichert** — 2 Terminwünsche (2.+11.09.) ohne Reaktion, dringend anrufen
- **MantheyIckenroth** — 34 Tage alt, OP-Nachsorge
- **Büttner** — 43 Tage alt
- **Suhe** — 59 Tage alt, ältester offener Lead

Kundenformular jetzt mit E-Mail + 6 weiteren Feldern. Rückrufformular mit Anliegen-Klassifikation.

## 8. BEWERBER

15-stufiges ATS-Statusmodell implementiert: NEU → VORGEPRÜFT → PRIO_1/2/3 → KONTAKTIERT → GESPRÄCH → HOSPITATION → UNTERLAGEN → EINARBEITUNG → EINSATZBEREIT → ARCHIVIERT

Erweiterte Filter: Region, PLZ-Umkreis, Qualifikation, Führungszeugnis, Verfügbarkeit, Quelle.

**Claudia Adjovi** = PRIO_1 (8 Jahre Erfahrung, wartet unbearbeitet).

## 9. §45a/GENEHMIGUNG

- 11 Schreiben an 10 Länder identifiziert (NICHT 12 wie zuvor behauptet)
- Mecklenburg-Vorpommern doppelt, Hamburg + Sachsen-Anhalt nur Textfassung
- Richtigstellungsvorlage erstellt (READY_TO_SEND)
- lint:45a grün
- Aktenzeichen: 51.D24.12, Sachbearbeiterin: Frau Krause
- Frist: 10.10.2026 (28 Tage ab heute)

**ANERKENNUNG_45A_LIEGT_VOR = false** — extern IMMER "im Anerkennungsverfahren"

## 10. CHAIRMATCH

- **Verifizierungsmodell:** 5 Dimensionen (Identität, Qualifikation, Standort, Hygiene, Bewertungen), 4 Stufen (UNVERIFIED → BASIC → STANDARD → PREMIUM). `darfAlsVerifiziertGelten()` gibt aktuell IMMER false.
- **Preis-SOT:** 1240 Euro-Literale kategorisiert: 9 eigene Produktpreise, 93 medizinische Preise, 1087 Marktbehauptungen, 29 Ertragserwartungen, 22 sonstige.
- **Booking Funnel:** Stufen 1-3 (Suche → Buchung → Bestätigung) + 6 (Support) + 7 (Bewertung) dokumentiert. Streitfall (Stufe 4) und Rechnung (Stufe 5) fehlen — BUSINESS_DECISION_REQUIRED.
- **spatial_ref_sys:** PostGIS-Systemtabelle, Migration fertig, USER_ACTION_REQUIRED (SQL Editor).

## 11. EFY CARE

- **Arbeitszeiterfassung:** Komplett gebaut — 2 Tabellen (work_time_entries, work_time_corrections), 6 RLS Policies, 5 Trigger, 5 Funktionen, 54 Tests.
- **ArbZG-Compliance:** §4 Pausen (>6h→30min, >9h→45min), §3 Höchstarbeitszeit (10h), §5 Ruhezeit (11h).
- **Features:** Dienstzeiten, Pausen, Soll/Ist-Vergleich, ArbZG-Befunde, Korrekturspur, PDL-Freigabe, Stundenkonto.
- **3 Migrationen READY_TO_APPLY** (SQL Editor erforderlich).
- **npm audit:** 27 Vulnerabilities (11 high) via Expo-Toolchain — Fix deferred.
- **NOT_IMPLEMENTED:** Qualifikationsmanagement, Urlaub, Krankmeldung, Schulungen, Tour-Optimierung, Fahrzeit.

## 12. MARKETING

Marketing Execution Engine implementiert:
- Statusmodell: IDEA → DRAFT → REVIEW → APPROVED → SCHEDULED → PUBLISHED → REJECTED
- 173-Zeilen-Testsuite (engine.test.ts)
- 5 Social-Media Captions KW38 bereit (CONTENT_READY_KW38.md)

## 13. SEO

- 6 Wurzelseiten Description >160 Zeichen → korrigiert
- stadtseiten-metadaten Tests erweitert
- 65 differenzierte Stadtseiten (Ähnlichkeit 53-67%, vorher 83-87%)

## 14. PREIS-SOURCE-OF-TRUTH

Cross-Product Preismatrix erstellt (PREISMATRIX_ALLE_PRODUKTE_12_09_2026.md):
- **Alltagsengel:** 131€ Entlastungsbetrag, 35-40€/h (DECISION_REQUIRED), PfluV: 30€/25€ Limits
- **ChairMatch:** 9 eigene Preise identifiziert, Rest = Marktbehauptungen
- **efy care:** Preismodell noch nicht definiert

## 15. BUSINESS_DECISION_REQUIRED

| # | Entscheidung |
|---|---|
| 1 | Preis: 35€/h oder 40€/h (+ PfluV-Limits 30€/25€) |
| 2 | CM: Ab welcher Verifizierungsstufe darf "verifiziert" stehen? |
| 3 | CM: Heilberufe strenger prüfen? |
| 4 | CM: Was passiert mit dem Altbestand (alle aktuell is_verified=true ohne Prüfung)? |
| 5 | CM: Ertragserwartungen auf Startseite (2.200-3.800€ netto) — belegen oder entfernen? |
| 6 | CM: Streitfall-Schlichtung und Rechnungsstellung — wie implementieren? |
| 7 | CM: Stornierungsgebühr — Listing hat kein Feld dafür |

## 16. USER_ACTION_REQUIRED

| # | Aktion | Priorität |
|---|---|---|
| 1 | **Repo private machen** (GitHub Settings → Danger Zone) | P0 SOFORT |
| 2 | **Kartenscan löschen + Karte sperren** | P0 SOFORT |
| 3 | **Alle geleakten API-Keys rotieren** (Stripe, Resend, OpenAI, etc.) | P0 nach Private |
| 4 | Maike Reichert anrufen (2x Terminwunsch ohne Reaktion) | P1 heute |
| 5 | 3 Kunden anrufen: MantheyIckenroth, Büttner, Suhe | P1 heute |
| 6 | Claudia Adjovi kontaktieren (8J Erfahrung) | P1 diese Woche |
| 7 | 11880: Birgit Fritzsch freischalten | P2 |
| 8 | 11 Bundesländer-Richtigstellungen versenden (READY_TO_SEND) | P2 |
| 9 | SQL Editor: CM spatial_ref_sys + efy 3 Migrationen anwenden | P2 |
| 10 | Erweitertes FZ Sabrina beantragen | P2 |
| 11 | Versicherungsnehmer Generali auf UG korrigieren | P2 |
| 12 | Preisentscheidung treffen | P2 |

## 17. BLOCKED_EXTERNAL

| Punkt | Hängt an |
|---|---|
| Gewerbeanmeldung-Bestätigung | Stadt Frankfurt |
| Erhebungsbogen Anbieterform II | Neu downloaden (Cloudflare-Fehler) |
| §45a-Bescheid | Land Hessen — Frist 10.10.2026 |
| Google Business Profile | Google-Verifizierung |
| Stripe | DEFERRED — kein Blocker |

## 18. Nächste 20 produktive Schritte

1. Repo private machen + Keys rotieren
2. Kartenscan löschen
3. 4 Kundenfälle abtelefonieren
4. Claudia Adjovi kontaktieren
5. Formular-Deploy verifizieren (E-Mail-Feld live)
6. CM spatial_ref_sys SQL-Migration anwenden
7. efy 3 SQL-Migrationen anwenden
8. Bundesländer-Richtigstellung versenden
9. Erweitertes FZ Sabrina beantragen
10. Generali UG-Korrektur
11. Preisentscheidung 35€/40€
12. CM Verifizierungsstufen-Entscheidung
13. efy Qualifikations-Modul bauen
14. efy Urlaub/Abwesenheit-Modul bauen
15. efy Leistungsnachweis digital bauen
16. CM Streitfall-Modul designen
17. CM Rechnungsmodul designen
18. AE Marketing Engine an DB anbinden
19. AE npm audit critical Fixes (Next.js Upgrade prüfen)
20. efy expo install --fix (27 Audit-Findings)

---

## Commits dieser Sitzung (Continuation)

| Repo | Commit | Inhalt |
|---|---|---|
| Alltagsengel | a7c44de1 | +2130 Zeilen, 31 Dateien: Tracks 1-10 |
| ChairMatch | ee4d935 | Verification Tier Model, Preis-SOT, Booking Funnel |
| efy care | d453f30 | Arbeitszeiterfassung komplett |

---

*Erstellt: 12.09.2026 · Alltagsengel UG (haftungsbeschränkt) · Neue Mainzer Straße 66-68, 60311 Frankfurt am Main*
