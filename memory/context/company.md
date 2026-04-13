# Company Context — AlltagsEngel UG

## Firma

- **Rechtsform:** UG (haftungsbeschränkt) — Gründung via RA Dörr, Juni 2025
- **Geplante Adresse:** Schillerstraße 31, 60313 Frankfurt am Main
- **Marke:** AlltagsEngel
- **Domain:** alltagsengel.care
- **Kontakt-E-Mail:** info@alltagsengel.care (Resend als Versender)

## Konten & Dienste

| Dienst | Zweck | Referenz |
|--------|-------|----------|
| Supabase | DB + Auth | Projekt-ID `nnwyktkqibdjxgimjyuq` |
| Vercel | Web-Hosting | alltagsengel.care |
| STRATO | Domain + Mail | Kundennr. 78372956 |
| Zadarma | Telefonie | — |
| Resend | Transaktions-E-Mail | info@alltagsengel.care |
| Firebase | FCM Push | Welcome-Mail 07.04.2026 |
| GitHub | Code-Repo | YusufFerhatDemir/alltagsengel |
| Google Ads | SEA | Konto 132-671-1476 |
| Apple App Store | iOS-Distribution | Bundle `care.alltagsengel.app` |
| Google Play | Android-Distribution | Identity verified 08.04, Fee 06.04 |

## Marke / Design

- **Farbe primär:** Koyu zemin #1A1612 (dunkler Hintergrund)
- **Akzent:** Altın #C9963C (Gold)
- **Sekundär:** Krem-Töne
- **Fonts:** Jost (UI), Cormorant Garamond (Serif-Akzent)
- **Ton:** Premium, vertrauensvoll, warm
- **Zielgruppe:** 35–60 Jahre (Angehörige, nicht Senioren direkt)

## Teams / Stakeholder

| Rolle | Person | Kontakt |
|-------|--------|---------|
| Gründer / Dev | Yusuf Cilcioglu | y.cilcioglu@googlemail.com |
| Rechtsanwalt | RA Dörr | ra.doerr@t-online.de |
| Externer Kontakt | Trabzon Faroz | bekam Konzept-Docs Mai 2025 |
| Beta-Tester | Marika | marika-74@gmx.de |
| Beta-Tester | Hasan | hasan.kuecuekyalcin@outlook.de |
| Beta-Tester | Ali | ali_k88@hotmail.de |

## Prozesse

| Prozess | Beschreibung |
|---------|--------------|
| Git-Workflow | `git add -A && commit && push` nach jeder Änderung, ohne Nachfrage |
| Deploys | Vercel automatisch bei Push auf `main` |
| iOS-Release | `npm run cap:sync` → Xcode Archive → App Store Connect |
| Android-Release | `npm run cap:build:android` → `.aab` → Play Console |
| Migrations | Supabase MCP `apply_migration` (CLI nicht gelinkt) |

## Sprach- und Kultur-Konventionen

- User spricht Türkisch und Deutsch (Code-Switching üblich)
- UI und Code-Texte: Deutsch
- Commit-Messages: Türkisch oder Deutsch erlaubt
- CLAUDE.md = Projekt-Regeln (nicht überschreiben)
