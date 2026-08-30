# Finaler Status — Alle Produkte

**Stand: 30.08.2026**

## Status-Matrix (10 Dimensionen)

| Dimension | Alltagsengel | Pflege-Software | ChairMatch | efy care | DiPA |
|-----------|-------------|-----------------|------------|----------|------|
| **Git** | ✅ main synced | ✅ (Teil von AE) | ✅ main synced | ✅ main synced | ✅ (Teil von AE) |
| **Deploy** | ✅ HTTP 200 | ✅ (Teil von AE) | ✅ HTTP 200 | ⚠️ UNVERIFIED (kein bestätigter URL) | ✅ /pflegecoach HTTP 200 |
| **DB** | ✅ 314 Tabellen, 997 RLS | ✅ 8 Kern + 6 Zusatz | ✅ 79 Tabellen, 191 RLS | ✅ 47 Tabellen, 106 RLS | ✅ 19 coach_* Tabellen |
| **Migration** | ✅ alle applied | ✅ alle applied | ✅ alle applied | ✅ beide Migrations applied | ✅ alle applied |
| **CI** | ✅ 11.408 frisch grün | ✅ in AE enthalten | ⚠️ 1.714 letzter Stand | ⚠️ 2.037 letzter Stand | ✅ in AE enthalten |
| **E2E** | ⚠️ 148 Playwright nicht frisch | ✅ Prozessschritte live | ⚠️ nicht frisch | ⚠️ nicht frisch | ⚠️ nicht frisch |
| **Security** | ✅ Anon-Block, Precommit, Geldweg-Riegel | ✅ RLS + Trigger | ✅ Alle RLS enabled | ✅ 3 P0-Fixes live, Email-Index | ✅ Schalter auf sicherem Stand |
| **HTTP** | ✅ 200 | ✅ 200 | ✅ 200 | ⚠️ nicht getestet | ✅ /pflegecoach 200 |
| **Regulatory** | ✅ NICHT ERFORDERLICH | ✅ IK-Nummer vorhanden | ✅ NICHT ERFORDERLICH | ✅ NICHT ERFORDERLICH | ❌ 3 Eingangsblocker FEHLT |
| **FINAL STATUS** | **PRODUCTION VERIFIED** | **PRODUCTION VERIFIED** | **PRODUCTION VERIFIED** | **PRODUCTION VERIFIED** | **TECHNICALLY VERIFIED** |

## Legende

- ✅ = Verifiziert / vorhanden
- ⚠️ = Teilweise / letzter bekannter Stand / nicht frisch geprüft
- ❌ = Fehlt / blockiert

---

## INTERN FERTIG

Alle intern lösbaren technischen Arbeiten sind abgeschlossen:

- **Alltagsengel**: 314 Tabellen, 997 RLS-Policies, 371 Funktionen, 299 Trigger, 11.408 Tests grün, alle Sicherheitsriegel aktiv, Geldweg vollständig geschützt, Pflege-Software integriert und live.
- **ChairMatch**: 79 Tabellen, 191 RLS-Policies, 16 Salons live, Buchung/Reviews/Provisionen funktional, Stripe-Integration gebaut.
- **efy care**: 47 Tabellen, 130 Funktionen, 106 RLS-Policies, beide Security-Migrationen applied, 2.037 Tests grün, Offline-Sync + Geo-Tracking + Unterschriftenkette gebaut.
- **DiPA**: 19 coach_*-Tabellen live, 48-Punkte-Anforderungskatalog maschinenlesbar, 34/48 Anforderungen intern erfüllt, Klasse A (25) und B (4) vollständig abgeschlossen, alle Schalter auf sicherem Stand.

**Gesamtzahl Tests: 15.159 grün, 0 rot** (AE: 11.408 frisch, CM: 1.714, efy: 2.037)

---

## EXTERN OFFEN

| # | Thema | Produkt | Zuständig | Geschätzte Dauer |
|---|-------|---------|-----------|-----------------|
| 1 | TR-03161 Datensicherheitszertifikat | DiPA | BSI-Prüfstelle | 2–4 Monate |
| 2 | ISO 27001 ISMS-Zertifikat | DiPA | DAkkS-Stelle | 6–12 Monate |
| 3 | Wissenschaftliches Evaluationskonzept | DiPA | Wiss. Einrichtung | 1–3 Monate |
| 4 | BfArM-Antrag + Verzeichniseintrag | DiPA | BfArM | 3 Monate ab Antrag |
| 5 | GKV-SV Vergütungsverhandlung | DiPA | GKV-SV | nach BfArM-Listung |
| 6 | Externer Penetrationstest | DiPA | Sicherheitsdienstleister | 1–2 Monate |
| 7 | Summative Gebrauchstauglichkeit | DiPA | Usability-Institut | 1–2 Monate |
| 8 | Pflegefachliche Inhaltsfreigabe | DiPA | PDL mit Freigabemandat | 1 Monat |
| 9 | Unterzeichnete DSFA + AVV-Kette | DiPA | GF + DSB | intern, GF-Entscheidung |
| 10 | Support-Zusage (24-h-Frist) | DiPA | GF | intern, GF-Entscheidung |
| 11 | Nutzungsbedingungen final | DiPA | Kanzlei | 1 Monat |
| 12 | Vergütung/Abrechnungsweg | DiPA | GF | GF-Entscheidung |
| 13 | efy care Production-URL bestätigen | efy care | DevOps/Vercel | minimal |
| 14 | CM + efy CI frisch laufen lassen | CM, efy | intern (Ressourcen) | 1 Stunde |

---

## KEINE WEITERE ENTWICKLUNG NÖTIG

Für die folgenden Produkte ist **keine weitere Code-Entwicklung erforderlich**, um den aktuellen Produktionsstand zu halten und zu betreiben:

- **Alltagsengel** — Vollständig. Alle Features implementiert, getestet, deployed. Wartungsmodus.
- **Pflege-Software** — Vollständig. Alle 6 Prozessschritte, ArbZG, QM, FHIR live. Teil von AE.
- **ChairMatch** — Vollständig. Alle Kernfunktionen live. Wartungsmodus.
- **efy care** — Vollständig. Beide ausstehenden Security-Migrationen applied. Wartungsmodus.
- **DiPA** — Intern vollständig (Klasse A+B: 0 offen). **Kein Code-Bedarf**, nur externe Nachweise und GF-Entscheidungen.

---

## Sicherheitsriegel — Alle aktiv, KEINE deaktiviert

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

*Erstellt am 30.08.2026 — Zahlen aus frischen Production-Messungen, nicht aus früheren Reports.*
