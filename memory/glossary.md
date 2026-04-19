# Glossary — AlltagsEngel

Interne Begriffe, Abkürzungen und Shorthand für das AlltagsEngel-Projekt.

## Produkt & Rollen

| Begriff | Bedeutung |
|---------|-----------|
| **AlltagsEngel** | Marktplatz-App: zertifizierte Alltagsbegleiter ↔ Senioren/Pflegebedürftige |
| **Engel** | Alltagsbegleiter-Rolle (Dienstleister, zertifiziert nach §45a SGB XI) |
| **Kunde** | Pflegebedürftiger / Senior (bucht Engel) |
| **Angehörige** | Familienmitglied, das für einen Pflegebedürftigen bucht (neue Rolle, seit 13.04.2026) |
| **Fahrer** | Krankenfahrt-Fahrer (eigenes Modul mit Fahrzeugen, Preistabellen) |
| **Superadmin / Admin** | Plattform-Betreiber (Yusuf + 2 weitere) |
| **MIS** | Management-Informationssystem (internes Dashboard mit KPIs, Prozessen, Dokumenten) |
| **Slogan** | "Mit Herz für dich da" |

## Gesetze & Geld

| Begriff | Bedeutung |
|---------|-----------|
| **§45b SGB XI** | Entlastungsbetrag — 131 €/Monat von der Pflegekasse für Alltagsbegleitung |
| **§45a SGB XI** | Anerkennung niedrigschwelliger Betreuungsangebote (Engel-Zertifizierung) |
| **Pflegegrad** | 1–5, Voraussetzung für §45b-Anspruch |
| **Entlastungsbetrag** | Synonym für §45b SGB XI — Killer-Message der App |
| **Pflegekasse** | Gesetzliche Pflegeversicherung, rechnet den Entlastungsbetrag direkt ab |

## Tech-Stack (aktuell, Stand 14.04.2026)

| Begriff | Bedeutung |
|---------|-----------|
| **Next.js 16.2** | Web-Framework (nicht Expo/React Native — alte Glossary-Einträge sind veraltet) |
| **Capacitor 8.2** | Hybrid-Wrapper für iOS + Android (wrappt die Next.js-Webapp) |
| **Supabase** | Backend: Postgres + Auth + RLS. Projekt-ID: `nnwyktkqibdjxgimjyuq` |
| **RLS** | Row Level Security (Postgres-Policies pro Tabelle) |
| **Resend** | Transactional E-Mail (info@alltagsengel.care) |
| **FCM V1** | Firebase Cloud Messaging OAuth2 für Push |
| **VAPID** | Web-Push-Keys |
| **Tesseract.js** | OCR für Ausweis-/Dokumenten-Upload |
| **GTM + Consent Mode v2** | Google Tag Manager, DSGVO-konform |

## Code-Organisation

| Begriff | Bedeutung |
|---------|-----------|
| **(auth)** | Next.js Route-Group für Login/Registrierung (wird in tsconfig excluded) |
| **(kunde)** | Route-Group für Kunden-Flow |
| **(engel)** | Route-Group für Engel-Flow |
| **cap:sync** | `npm run cap:sync` — syncht Web-Build in iOS/Android Capacitor-Projekte |
| **bundleRelease** | Android Gradle-Build für Play Store |
| **care.alltagsengel.app** | iOS/Android Bundle-ID |

## Projektstruktur (Stand 14.04.2026, nach Aufräumen)

| Pfad | Zweck |
|---|---|
| `app/` | Next.js App Router (Web + Admin + MIS + 22 API-Routes) |
| `components/`, `lib/`, `hooks/`, `constants/`, `types/` | Shared Code |
| `supabase/` | Migrations + initial-setup.sql |
| `android/`, `ios/` | Capacitor-Projekte |
| `docs/` | Dokumentation: store/, security/, growth/, releases/, data-room/, data-room-de/ |
| `marketing/` | Broschüren, Videos, Images, Scripts, ads, kampanya, social-media-grafiken, werbe-videos |
| `archive/` | Altlasten (gitignored): next-old/, video-generation/, private/ |
| `memory/` | Cowork-Memory (glossary, projects, people, context) |
| `README.md` | Einstiegspunkt |

## Wichtige Tabellen (Supabase)

| Tabelle | Zweck |
|---------|-------|
| `profiles` | 29 Nutzer (13 kunde, 9 engel, 4 fahrer, 3 superadmin) |
| `angels` | 7 Engel-Profile (Preis, Bio, Zertifikate, §45b-fähig) |
| `bookings` | Buchungen (6: 5 accepted + 1 completed, Umsatz gesamt 500 €) |
| `krankenfahrten` | Krankenfahrten (9: 4 pending, 3 completed, 1 confirmed, 1 in_progress) |
| `care_recipients` | **NEU 14.04.2026** — Angehörige verwalten Pflegebedürftige |
| `visitors` | Website-Traffic (2260 gesamt, 267 in letzten 7 Tagen) |
| `page_views` | Seitenaufrufe (1126 gesamt, 626 in letzten 7 Tagen) |
| `notfall_info`, `medikamentenplan` | Pflege-Dokumentation |
| `mis_*` | Management-Informationssystem (KPIs, Prozesse, Dokumente) |
| `kf_pricing_*` | Krankenfahrten-Preislogik (Tiers, Surcharges, Config) |

## Personen (Nicknames → Vollname)

| Kürzel | Person |
|--------|--------|
| **Yusuf** | Yusuf Cilcioglu — Gründer, Entwickler (y.cilcioglu@googlemail.com) |
| **RA Dörr** | Rechtsanwalt für UG-Gründung (ra.doerr@t-online.de) |
| **Trabzon / Faroz** | Kontaktperson, bekam Leistungskonzept + Datenschutz + Minijob-/Pflegekassen-Docs (Mai 2025) |
| **Marika** | Beta-Testerin (marika-74@gmx.de) |
| **Hasan** | Beta-Tester (hasan.kuecuekyalcin@outlook.de) |
| **Ali** | Beta-Tester (ali_k88@hotmail.de) |

## Store-Status (Stand 14.04.2026)

| Plattform | Status |
|-----------|--------|
| **iOS App Store** | LIVE — Version 1.0.0 Build 4 (seit ca. 12.04.2026 nach 2 Apple-Review-Runden: Build 2 am 31.03, Build 4 am 01.04) — 18 Downloads, 20.9 % Conversion |
| **Google Play** | Identity verified 08.04.2026, 25 $ Dev-Fee bezahlt 06.04.2026. Noch KEIN bestätigter Live-Status |
| **Web (Vercel)** | alltagsengel.care — live |

## Drittanbieter & Konten

| Dienst | Detail |
|--------|--------|
| **Vercel** | Hosting Web |
| **STRATO** | Domain + Mail (Kundennr. 78372956) |
| **Zadarma** | Telefonie |
| **Google Ads** | 132-671-1476 |
| **GitHub Repo** | YusufFerhatDemir/alltagsengel |

## Bekannte Probleme / Risiken

| Thema | Status |
|-------|--------|
| **GitGuardian-Alert 02.03.2026** | Company-Email-Passwort auf GitHub exponiert — Rotation noch manuell durch Yusuf in STRATO erforderlich |
| **Service-Role-Key in .env** | Laut Security Audit exponiert — Rotation noch manuell durch Yusuf im Supabase-Dashboard erforderlich |
| ~~**DSGVO VisitorTracker**~~ | ✓ ERLEDIGT 14.04.2026 — Code prüft `consent !== 'accepted'` korrekt |
| ~~**RLS "Herkes profilleri okuyabilir"**~~ | ✓ ERLEDIGT 14.04.2026 — true-SELECT-Policies entfernt, ersetzt durch `profiles_select_own/admin/engels/booking_partner` |
| **`angels` public SELECT** | Marktplatz braucht es, aber sensible Felder (z. B. `hourly_rate`) nur für authentifizierte Nutzer zeigen — offen |
| **`/api/admin/*` Authz** | Audit aller Admin-Routes auf authz-Checks — offen |
| **`/api/visitor-alert` Rate-Limiting** | Kein Rate-Limit — offen |
| **Upload-Validation** | Dateigröße + Mime-Type auf allen Upload-Routes — offen |

## Prozesse

| Prozess | Bedeutung |
|---------|-----------|
| **Buchungsflow** | Kunde wählt Engel → Datum/Zeit → Zahlungsart → Bestätigung |
| **Angehörigen-Modus** | Angehöriger erstellt `care_recipient`, bucht für diese Person |
| **§45b-Abrechnung** | Direkt mit Pflegekasse (Kostenvoranschlag → Rechnung) — größter Pain Point |
