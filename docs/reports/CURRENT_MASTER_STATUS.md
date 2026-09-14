# CURRENT MASTER STATUS — Alltagsengel · ChairMatch · efy care

**Stand:** 14.09.2026 12:00 UTC
**Erstellt von:** Claude (Lead Engineer / Technical COO)
**Alle vorherigen Master-Reports:** SUPERSEDED
**Methodik:** V4 — verifiziert gegen echte Systeme, nicht alte Reports

---

## Git HEAD (verifiziert 14.09.2026)

| Projekt | Branch | HEAD | Letzter Commit |
|---|---|---|---|
| Alltagsengel | main | `ab451104` | Block 16: Vertrags-PDF-Generator, unterschriftsreifes Blatt |
| ChairMatch | main | `4ac3485` | Abrechnungs-Dashboard: tägliche/wöchentliche Widersprüche, Instant-Payout entfernt, 3206 Tests |
| efy care | main | `34731a3` | Block 16: Monatsvorschau — Diagnose ohne Schreibvorgang |

## Tests (verifiziert 14.09.2026)

| Projekt | Testdateien | it()-Blöcke |
|---|---|---|
| Alltagsengel | ~500+node | ~10.932+2.773 |
| ChairMatch | ~170 | ~3.206 |
| efy care | ~149 | ~3.704 |
| **Gesamt** | **~1.019+** | **~17.842+** |

## CI / Typecheck / Lint

| Projekt | Typecheck | Lint | Build |
|---|---|---|---|
| Alltagsengel | VERIFIED_LOCAL (0 Fehler) | VERIFIED_LOCAL | VERIFIED_LOCAL |
| ChairMatch | VERIFIED_LOCAL (0 Fehler) | VERIFIED_LOCAL (0) | VERIFIED_LOCAL (Exit 0) |
| efy care | VERIFIED_LOCAL | VERIFIED_LOCAL | VERIFIED_LOCAL |

## DB / Migrationen

### Alltagsengel (nnwyktkqibdjxgimjyuq)
- Schema: PRODUCTION_VERIFIED
- Offene Migrationen: keine bekannt
- 10 echte neue Nutzer im September (7 Engel, 3 Kunden)

### ChairMatch Production (pwdbjqfpgumyfktbfswg)
- Schema: PRODUCTION_VERIFIED
- Offene Migrationen: 9+ ausstehend (Vercel blockiert Deployment, jetzt 24 Commits ahead)
- **KRITISCH:** 2FA fail-closed + Stornofrist-Fix + Rate-Limiting + Bewertungs-Fix + Such-Limit-Fix + Multi-Standort-Fix + Abrechnungs-Dashboard-Fix NICHT LIVE
- Doppelbewertungs-Sperre war fail-open → fail-closed GEFIXT
- Freier Bewertungsweg ohne Unique-Index → Migration vorbereitet (Bestandsprüfung nötig)
- Such-Limit begrenzte Suche statt Ergebnis → GEFIXT
- Salons haben KEINE Koordinaten → geo-Schema nie gelaufen, Umkreissuche = Stadtmitte zu Stadtmitte
- available_from: Schreiber HH:MM vs. Leser YYYY-MM-DD → BUSINESS_DECISION_REQUIRED

### ChairMatch Dev (vlrviyrgggzhayepfmop) — NEUTRALISIERT
- Key-Rotation: HUMAN_BLOCKER (Supabase Dashboard Login)

### efy care (nsfbwhpjesmathsrqkfi)
- Migrationen 010000–160000: **ALLE APPLIED** (verifiziert 14.09.2026), Block 16 brauchte keine Migration
- prod-schema: 70/70 Tabellen, 98 Funktionen
- prod-rls: 70 Tabellen befragt, 0 offen (anon-Probe)
- Bucket `klientendokumente`: APPLIED, private, 20 MB, PDF+Bilder
- Migration 150000 (vorfall_meldung): Trigger + Funktion + Constraints VERIFIED
- Migration 160000 (verordnung_leseseite): Funktion + Policy VERIFIED — is_org_member-Bug in 3 Zweigen behoben
- **Status: KEINE offenen Migrationen**

## Deployment

### Vercel (Hobby-Account, yusufferhatdemirs-projects)
- **BLOCKER:** Storage Overflow (letzte Messung: 46.78 GB / 10 GB Deployments)
- CM: 24 Commits ahead of Production (Prod: `a68833d`)
- **HUMAN_BLOCKER:** Alte Deployments löschen + Retention auf 7 Tage
- NEEDS_FRESH_VERIFICATION (V4-Pflicht)

### efy care (Expo/React Native)
- Web-Export: VERIFIED_LOCAL
- Native Build: über EAS

## Google Play
- Closed-Test Track: EINGERICHTET
- Tester: HUMAN_BLOCKER (10 weitere rekrutieren, 14-Tage-Wartezeit)
- Händlerkonto: KEIN pauschal Release-Blocker (keine In-App-Käufe)
- Status: USER_ACTION

## Security
- PII/SCHUFA Git-History: **CLOSED** — nicht mehr erwähnen
- Repos: ALLE PRIVATE
- Secrets-Scan: Keine echten Secrets (nur role=anon)
- CM 2FA: fail-open → fail-closed GEFIXT (nicht live wg. Vercel)
- CM Rate-Limiting: Login + 2FA + Passwort-Reset GEFIXT (nicht live)
- CM Stornofrist: fail-open bei DB-Fehler → fail-closed GEFIXT (nicht live)
- CM Bewertungen: Doppelbewertungs-Sperre fail-open → fail-closed GEFIXT (nicht live)
- CM Bewertungs-Rate-Limiting: 10/Konto, 20/IP je Stunde GEFIXT (nicht live)
- CM Sitemap: konnte still auf 0 Salons fallen → Fehlerbehandlung GEFIXT (nicht live)
- efy Offline-Sync: Wartesperre bei Uhrenversatz GEFIXT (live im Code)

## HUMAN_BLOCKER

| # | Blocker | Projekt |
|---|---|---|
| 1 | Vercel Storage aufräumen | ALLE |
| 2 | Google-Passwort ändern (kompromittiert 02.09.2026) | ALLE |
| 3 | Recovery-E-Mail bestätigen (ferhatfaroz@gmail.com) | Google |
| 4 | 10 weitere Play Store Tester | efy care |
| 5 | CM Dev API-Key Rotation (Dashboard) | ChairMatch |
| 6 | KALENDER_FEED_SECRET in Vercel setzen | ChairMatch |

## BUSINESS_DECISIONS

| # | Entscheidung | Projekt |
|---|---|---|
| 1 | ChairMatch Preise festlegen | ChairMatch |
| 2 | Stripe (DEFERRED, kein Blocker) | CM + AE |
| 3 | Vollzeitstunden je Träger | efy care |
| 4 | Aufbewahrungsfristen AU | efy care |
| 5 | Leistungsnachweis: 10 von 13 = Datenproblem (client_signed_at NULL trotz Bild), 3 echt unsigniert — Datenkorrektur entscheiden | AE |
| 6 | ChairMatch available_from: HH:MM vs. YYYY-MM-DD — welches Format gilt? | CM |

## Aktive Code-Sessions

| Session | Projekt | Status | Block |
|---|---|---|---|
| Kundenfunnel + Bewerberfunnel E2E | AE | RUNNING Block 17 (`ab451104`) | Block 16 done: Vertrags-PDF, 10.932+2.773 Tests → Block 17 Bewerberfunnel dispatched |
| ChairMatch Truth State | CM | RUNNING next block (`4ac3485`) | Abrechnungs-Dashboard done, 3206 Tests → next block dispatched |
| efy care Truth State | efy | RUNNING Block 17 (`34731a3`) | Block 16 done: Monatsvorschau, 3704 Tests → Block 17 Abrechnungslauf dispatched |

## Letzte abgeschlossene Blöcke (14.09.2026)
- AE Block 16 (`ab451104`): Vertrags-PDF-Generator, DejaVuSans verifiziert, ENTWURF-Gate, BD#5 geklärt — 500 Dateien, 10.932+2.773 Tests
- CM (`4ac3485`): Abrechnungs-Dashboard — tägliche/wöchentliche Auszahlung widersprüchlich, Instant-Payout ohne Funktion entfernt (PRICE_DECISION_REQUIRED), Zahlungsstatus 4 Zustände — 170 Dateien, 3.206 Tests
- efy Block 16 (`34731a3`): Monatsvorschau — Diagnose ohne Schreibvorgang, Befunde mit IK-Nummern, keine Migration nötig — 149 Dateien, 3.704 Tests
- efy Block 15 (`4fcb247`): is_org_member-Audit auf 12 Tabellen

## Nächster Block
1. Vercel frisch verifizieren (HUMAN_BLOCKER)
2. Code-Sessions monitoren + nächste Blöcke dispatchen
3. PDFs generieren nach Block-Abschluss
4. Release-Readiness vorantreiben
