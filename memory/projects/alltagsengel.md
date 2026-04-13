# Projekt: AlltagsEngel

**Stand:** 14.04.2026
**Typ:** Pflege-Marktplatz (Deutschland)
**Domain:** alltagsengel.care
**Bundle-ID:** care.alltagsengel.app

## Was es ist

Zweiseitiger Marktplatz, der Senioren/Pflegebedürftige und Angehörige mit zertifizierten Alltagsbegleitern ("Engel") verbindet. Abrechnung direkt über §45b SGB XI (Entlastungsbetrag 131 €/Monat) mit der Pflegekasse — Kunde zahlt nichts aus eigener Tasche.

**Analogie:** Wie Uber für Pflege-Alltagshilfe, aber mit Krankenkassen-Abrechnung statt Kreditkarte.

**Slogan:** "Mit Herz für dich da"

## Rollen

1. **Kunde** (Senior/Pflegebedürftiger)
2. **Engel** (Alltagsbegleiter, §45a-zertifiziert)
3. **Angehörige** (neu seit 13.04.2026 — buchen für Pflegebedürftige über `care_recipients`)
4. **Fahrer** (Krankenfahrten-Modul)
5. **Admin/Superadmin** (Plattformbetrieb)

## Tech-Stack

| Layer | Tech |
|-------|------|
| Web-App | Next.js 16.2 + React 19.2 (TypeScript 6.0) |
| Mobile | Capacitor 8.2 (iOS + Android Wrapper um die Webapp) |
| Backend | Supabase (Postgres + Auth + RLS) |
| E-Mail | Resend 6.9 |
| Push | FCM V1 OAuth2 (nativ) + Web-Push VAPID |
| OCR | Tesseract.js 7.0 |
| Tracking | GTM + Consent Mode v2, Meta Pixel, TikTok Pixel |
| Hosting | Vercel (Web) |

**Wichtig:** Nicht Expo / nicht React Native — alte Memory-Einträge waren veraltet.

## Store-Status

| Plattform | Status | Detail |
|-----------|--------|--------|
| **iOS App Store** | LIVE | v1.0.0 Build 4 seit ca. 12.04.2026. 2 Apple-Reviews (Build 2 am 31.03, Build 4 am 01.04). 18 Downloads, 20.9 % Conversion. |
| **Google Play** | Pending Live | Identity verified 08.04, Dev-Fee ($25) bezahlt 06.04.2026. Live-Status nicht bestätigt. |
| **Web** | LIVE | alltagsengel.care |

## Live-Daten (Supabase, 14.04.2026)

- **Profile:** 29 gesamt (13 Kunden, 9 Engel, 4 Fahrer, 3 Superadmin)
- **Engel:** 7 aktive Profile
- **Buchungen:** 6 (5 accepted, 1 completed), Gesamtumsatz 500 €
- **Krankenfahrten:** 9 (4 pending, 3 completed, 1 confirmed, 1 in progress)
- **Website-Traffic letzte 7 Tage:** 267 Visitors / 626 Page Views
- **Traffic gesamt:** 2260 Visitors / 1126 Page Views

## Letzte Sitzung (14.04.2026)

- Migration `20260414_care_recipients.sql` erstellt + via Supabase-MCP angewandt (`success: true`)
- TypeScript-Check clean (`npx tsc --noEmit` → exit 0)
- Commit `b360f09` auf main gepusht
- Gestern bereits gepusht (Origin): `c764641` Angehörigen-Modus + `85082d0` Build-Fix

## Offene Sicherheits-Risiken

1. **GitGuardian Alert 02.03.2026** — Company-Email-Passwort auf GitHub exponiert → Rotation ausstehend
2. **Service-Role-Key in `.env`** laut Security Audit exponiert → Rotation ausstehend
3. **RLS `"Herkes profilleri okuyabilir"`** — Public-Read auf profiles (CRITICAL)
4. **DSGVO VisitorTracker** — trackt bei `null`-Consent statt nur bei `'accepted'`

## Aktive To-Dos (aus TASKS.md)

- Social-Media-Kampagnen-Content (Instagram, Facebook, TikTok)
- Pressemitteilung zum Launch
- App Store + Play Store Listing-Texte finalisieren

## Geschäftsmodell

- **Entlastungsbetrag:** 131 €/Monat × Pflegegrad 1–5
- **Plattform-Provision:** 15–20 % → 18,75–26 €/Monat/Nutzer
- **Engel-Vergütung:** 80–85 % → 105–111 €/Monat/Nutzer
- **Break-Even:** ~4 aktive Nutzer
- **Ziel 1000 Nutzer:** 18.750–25.000 €/Monat Provision

## Wichtige Dokumente im Repo

- `GROWTH_STRATEGY.md` — Phase 1-3 Wachstumsplan
- `APPLE_APP_STORE_ANLEITUNG.md` — Einreichungs-Guide
- `GOOGLE_PLAY_STORE_METADATA.md` — Store-Texte
- `SECURITY_AUDIT_REPORT.md` — 4 Critical / 7 High / 6 Medium / 4 Low Findings
- `SECURITY_FIXES_SUMMARY.md` — bereits umgesetzte Fixes
- `DSGVO_TODO.md` — Cookie-Consent-Fixes
- `TASKS.md` — aktuelle Backlog-Liste
- `kampanya/` — Social-Media-Content (Wochen 1-4)
- `data-room/` — Pitch-Deck + Markt-Analyse + Financials (EN + DE)

## Kommunikation mit dem User

- Sprache: Türkisch (laut CLAUDE.md), aber User bittet häufig auf Deutsch
- Code/UI: immer Deutsch
- Nach Änderungen: **immer** `git add -A && git commit && git push` ohne Nachfrage
- Commit-Messages: Türkisch oder Deutsch
- Analogien sind hilfreich beim Erklären neuer Konzepte
