# Finaler Status — Alle Produkte (V2 Strict)

**Stand: 30.08.2026 — V2 nach Evidence Consistency Closing**

## Status-Matrix (10 Dimensionen, strikt nach Regel 7)

| Dimension | Alltagsengel | Pflege-Software | ChairMatch | efy care | DiPA |
|-----------|-------------|-----------------|------------|----------|------|
| **Git** | ✅ `5f72cf52` synced | ✅ (Teil von AE) | ✅ `5227751d` synced | ✅ `129144a0` synced | ✅ (Teil von AE) |
| **Deploy** | ⚠️ HTTP 200, Commit UNVERIFIED | ⚠️ (Teil von AE) | ⚠️ HTTP 200, Commit UNVERIFIED | ⚠️ Native App, kein Deploy-Beweis | ⚠️ (Teil von AE) |
| **DB** | ✅ 314 Tabellen, 997 RLS | ✅ 8 Kern + 6 Zusatz | ✅ 79 Tabellen, 191 RLS | ✅ 47 Tabellen, 106 RLS | ✅ 19 coach_* Tabellen |
| **Migration** | ✅ alle applied | ✅ alle applied | ✅ alle applied | ✅ beide applied | ✅ alle applied |
| **CI** | ✅ 11.408 FRISCH | ✅ in AE enthalten | ✅ 1.714 FRISCH | ✅ 2.037 FRISCH | ✅ in AE enthalten |
| **E2E** | ✅ FRISCH (PGlite) | ✅ FRISCH (PGlite) | ✅ FRISCH (PGlite) | ✅ FRISCH (PGlite) | ✅ in AE enthalten |
| **Security** | ✅ 11/11 Mechanismen | ✅ RLS + Trigger | ✅ Alle RLS enabled | ✅ 3 P0-Fixes, Email-Index | ✅ Schalter sicher |
| **HTTP** | ✅ 200 | ✅ 200 | ✅ 200 | N/A (Native App) | ✅ /pflegecoach 200 |
| **Regulatory** | ✅ N/A | ✅ IK vorhanden | ✅ N/A | ✅ N/A | ❌ 3 Blocker FEHLT |
| **FINAL STATUS** | **TECHNICALLY VERIFIED** | **TECHNICALLY VERIFIED** | **TECHNICALLY VERIFIED** | **TECHNICALLY VERIFIED** | **TECHNICALLY VERIFIED** |

## Legende

- ✅ = Frisch verifiziert am 30.08.2026
- ⚠️ = Nicht vollständig verifizierbar (Deploy Commit Match fehlt)
- ❌ = Fehlt / blockiert
- N/A = Nicht anwendbar

## Warum kein PRODUCTION VERIFIED

Gemäß **Regel 7**: Kein ⚠️ darf gleichzeitig mit PRODUCTION VERIFIED existieren.

- **AE + CM**: Vercel Auto-Deploy ist aktiv (jeder Push auf main), HTTP 200 bestätigt. Aber der exakte Commit-Match (deployed Build = Git HEAD) erfordert Vercel Dashboard/API-Zugang, der nicht automatisiert verfügbar ist.
- **efy care**: Native App (Expo/React Native). EAS Build-Status erfordert EAS CLI oder TestFlight-Screenshot.
- **DiPA**: 3 regulatorische Eingangsblocker extern (TR-03161, ISO 27001, BfArM).

**PRODUCTION VERIFIED wird möglich**, sobald diese Dimensionen nachgeholt werden.

---

## INTERN FERTIG

Alle intern lösbaren technischen Arbeiten sind abgeschlossen:

- **Alltagsengel**: 314 Tabellen, 997 RLS, 371 Funktionen, 299 Trigger, 11.408 Tests frisch grün, alle Sicherheitsriegel aktiv, Geldweg geschützt.
- **Pflege-Software**: 6/6 Prozesse, ArbZG, QM, FHIR, Evaluation-Immutabilität. Teil von AE.
- **ChairMatch**: 79 Tabellen, 191 RLS, 1.714 Tests frisch grün, Buchung/Reviews/Provisionen funktional.
- **efy care**: 47 Tabellen, 130 Funktionen, 106 RLS, 2.037 Tests frisch grün, beide Migrationen applied.
- **DiPA**: Klasse A+B: 0 intern offen. 48-Punkte-Katalog, 34/48 intern erfüllt.

**Gesamtzahl Tests: 15.159 frisch grün, 0 rot** (30.08.2026, alle auf aktuellem HEAD)

---

## EXTERN OFFEN

| # | Thema | Produkt | Zuständig | Geschätzte Dauer |
|---|-------|---------|-----------|-----------------|
| 1 | Vercel Deploy Commit Match | AE, CM | DevOps (API-Token) | minimal |
| 2 | EAS Build Beweis | efy care | DevOps (EAS CLI) | minimal |
| 3 | TR-03161 Datensicherheitszertifikat | DiPA | BSI-Prüfstelle | 2–4 Monate |
| 4 | ISO 27001 ISMS-Zertifikat | DiPA | DAkkS-Stelle | 6–12 Monate |
| 5 | BfArM-Antrag + Verzeichniseintrag | DiPA | BfArM | 3 Monate ab Antrag |
| 6 | GKV-SV Vergütungsverhandlung | DiPA | GKV-SV | nach BfArM-Listung |
| 7 | Externer Penetrationstest | DiPA | Sicherheitsdienstleister | 1–2 Monate |
| 8 | Summative Gebrauchstauglichkeit | DiPA | Usability-Institut | 1–2 Monate |
| 9 | Pflegefachliche Inhaltsfreigabe | DiPA | PDL | 1 Monat |
| 10 | DSFA + AVV-Kette | DiPA | GF + DSB | GF-Entscheidung |
| 11 | Support-Zusage (24h) | DiPA | GF | GF-Entscheidung |
| 12 | Nutzungsbedingungen final | DiPA | Kanzlei | 1 Monat |

---

## KEINE WEITERE ENTWICKLUNG NÖTIG

Für alle Produkte ist **keine weitere Code-Entwicklung** erforderlich:

- **Alltagsengel** — Vollständig. Wartungsmodus.
- **Pflege-Software** — Vollständig. Teil von AE. Wartungsmodus.
- **ChairMatch** — Vollständig. Wartungsmodus.
- **efy care** — Vollständig. Beide Security-Migrationen applied. Wartungsmodus.
- **DiPA** — Intern vollständig (Klasse A+B: 0 offen). Nur externe Nachweise und GF-Entscheidungen.

---

## Sicherheitsriegel — Alle aktiv

| Riegel | Wert | Typ |
|--------|------|-----|
| FIRST_REAL_INVOICE_APPROVED | false | Hardcoded (send-gate.ts:138) |
| PILOT_ERSTVERSAND_FREIGEGEBEN | nicht gesetzt | Env-Var |
| RECHNUNGSVERSAND_AUTOMATISCH | nicht gesetzt | Env-Var |
| MAHNVERSAND_AUTOMATISCH | nicht gesetzt | Env-Var |
| COACH_DIPA_MODUS | nicht gesetzt (= aus) | Env-Var |
| COACH_PREISE_FREIGEGEBEN | nicht gesetzt (= aus) | Env-Var |
| verkauf_moeglich | false | API-Response |

---

*V2 — Erstellt am 30.08.2026 — Alle Zahlen aus frischen Messungen, strikt nach Regel 7.*
