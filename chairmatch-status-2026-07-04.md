# ChairMatch — Statusbericht

**Datum:** 04.07.2026
**Projekt:** ChairMatch — Stuhlvermietungsplattform für die Beauty-Branche
**Gründer:** Yusuf Ferhat Demir | Sitz: Frankfurt am Main

---

## Was ist ChairMatch?

Zweiseitiger Marktplatz für Stuhlmiete in der Beauty-Branche. Saloninhaber vermieten freie Arbeitsplätze an selbstständige Beauty-Profis (Friseure, Barbershops, Kosmetik, Nails, Massage, Ästhetik). Branding: Schwarz-Gold, Premium-Positionierung. Soziale Komponente: 1 € jeder Buchung geht an Kinder in Not.

---

## Erledigter Stand

### Website (chairmatch.de)
- Landing Page live (index.html) — responsiv, Schwarz-Gold-Design, Kategorien, How-it-works, Spenden-Sektion
- FAQ-Seite vorhanden
- **24 Stadt-Seiten** (Frankfurt, Berlin, Hamburg, München, Köln, Düsseldorf, Stuttgart u.v.m.) — für lokales SEO
- **7 Blog-Artikel** (Stuhlvermietung, Freelancer-Arbeitsplatz, Beauty-Coworking, Stuhlmiete-Preise 2026 etc.)
- **5 Ads-Seiten** (Salon-Rekrutierung, Freelancer-Akquise, E-Mail-Outreach, TikTok-Skripte, WhatsApp-Katalog)
- Sitemap + robots.txt konfiguriert
- Google Search Console verifiziert (googlef0812a4982d52ce4.html)

### Marketing
- **Werbestrategie 2026** ausgearbeitet (Supply-First-Ansatz: erst Salons, dann Freelancer)
- **Content-Kalender** für 12 Wochen (Q3/Q4 2026) — Blog, Social Media, Newsletter
- **SEO-Strategie** mit Keyword-Recherche (primär, sekundär, Long-Tail, saisonal)
- **Social-Media-Plan** für Instagram, TikTok, Facebook, LinkedIn
- **Spotify Audio-Ad** produziert (Salon-Rekrutierung)

### Investoren & Finanzierung
- Umfangreiche **Investorenliste** erstellt: Corporate VCs (L'Oréal BOLD, Henkel Ventures, Beiersdorf VC), Fintech-Investoren, europäische VCs, Accelerator, Förderprogramme, lokale Hessen-Programme
- **Pitch Deck** vorhanden (ChairMatch_Pitch_Deck_2026.pptx)

### App
- Noch keine eigenständige App-Codebasis im Repository vorhanden. Die Plattform ist aktuell eine statische Website.

---

## Nächste Schritte

1. **Salon-Onboarding starten** — Phase 1 der Supply-First-Strategie: Salons mit freien Stühlen gewinnen (Rhein-Main als Pilotregion)
2. **Plattform-Funktionalität aufbauen** — Buchungssystem, Salonprofile, Suchfunktion, Zahlungsabwicklung (aktuell nur statische Seiten)
3. **Content-Kalender umsetzen** — Woche 1 des 12-Wochen-Plans starten (Blog + Social Media)
4. **Investorenansprache** — Pitch Deck an priorisierte VCs und Förderprogramme senden
5. **Blog/Ads-Routing fixen** — laut Sitemap-Kommentar werden Blog- und Ads-Pfade auf `/auth?callbackUrl=...` weitergeleitet und sind nicht crawlbar

---

## Offene Issues / Blocker

| Issue | Priorität |
|-------|-----------|
| **Kein funktionales Backend** — Website ist rein statisch, kein Buchungs-/Matchingsystem | Hoch |
| **Blog-Routen nicht öffentlich erreichbar** — 307-Redirect auf /auth blockiert Crawler und Nutzer | Hoch |
| **Keine App vorhanden** — Mobile Experience fehlt komplett | Mittel |
| **Budget für Ads noch nicht freigegeben** — Werbestrategie steht, wartet auf Budgetfreigabe | Mittel |
| **Salons noch nicht ongeboardet** — Supply-Seite des Marktplatzes ist leer | Hoch |

---

## Fazit

Das Fundament steht: Website mit SEO-Infrastruktur, Marketing-Strategie, Pitch Deck und Investorenliste sind vorhanden. Der kritische nächste Schritt ist der Aufbau der eigentlichen Plattformfunktionalität (Buchung, Matching, Zahlung) und das erste Salon-Onboarding im Rhein-Main-Gebiet.
