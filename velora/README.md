# Velora — Digitale Alltagsbegleitung & ambulante Pflege

## Überblick

**Velora** ist eine eigenständige App-Plattform der Alltagsengel UG (haftungsbeschränkt) für die digitale Organisation von Alltagsbegleitung und perspektivisch ambulanter Pflege. Velora tritt mit eigenem Branding auf und positioniert sich als modernes Konkurrenzprodukt zu Alltagsengel.

## Vision

Velora verbindet pflegebedürftige Menschen, Angehörige und qualifizierte Begleiter auf einer intuitiven digitalen Plattform — von der Terminbuchung über Echtzeit-Updates bis zur automatischen Abrechnung mit der Pflegekasse.

## Kernfunktionen

### Phase 1 — Alltagsbegleitung (MVP)
- Digitale Buchung und Verwaltung von Alltagsbegleitung nach §45a SGB XI
- Matching-Algorithmus: passende Begleiter basierend auf Standort, Verfügbarkeit und Qualifikation
- Echtzeit-Updates für Angehörige (Begleitung gestartet/beendet, Fotos, Notizen)
- Automatische Abrechnung des Entlastungsbetrags (131€/Monat) mit der Pflegekasse
- In-App-Chat zwischen Angehörigen, Begleitern und Koordination

### Phase 2 — Erweiterte Features
- **Medikamenten-Tracking** — Push-Erinnerungen, Angehörigen-Überwachung, Überdosis-Schutz (siehe `konzept-medikamenten-tracking.md`)
- Digitales Pflegetagebuch mit Exportfunktion für MDK-Begutachtungen
- Vitalwerte-Monitoring (Integration mit Wearables)
- Notfall-Button mit automatischer Benachrichtigung an Angehörige und Notruf

### Phase 3 — Ambulante Pflege
- Erweiterung um ambulante Pflegeleistungen (SGB V / SGB XI)
- Pflegefachkraft-Netzwerk und Dienstplanung
- Behandlungspflege-Dokumentation
- Qualitätsmanagement nach MDK-Anforderungen

## Abgrenzung zu Alltagsengel

| Aspekt | Alltagsengel | Velora |
|--------|-------------|--------|
| Branding | Warmherzig, familiär | Modern, technologisch |
| Zielgruppe | Angehörige 50+ | Angehörige 30–50 (digital-affin) |
| Fokus | Alltagsbegleitung | Alltagsbegleitung + ambulante Pflege |
| Kanal | Web + WhatsApp | Native App (iOS + Android) |
| Abrechnung | Manuell/teilautomatisiert | Vollautomatisch |

## Technologie-Stack

- **Frontend**: React Native (iOS + Android)
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **Push**: Expo Push Notifications
- **Abrechnung**: Integration mit Pflegekassen-Schnittstellen
- **Hosting**: Vercel (Web), Supabase (API)

## Rechtlicher Rahmen

- Anbieteranerkennung nach §45a SGB XI (identisch mit Alltagsengel)
- Datenschutz nach DSGVO — Gesundheitsdaten Art. 9 Abs. 2 lit. h
- Betreiber: Alltagsengel UG (haftungsbeschränkt)
- Adresse: Neue Mainzer Straße 66-68, 60311 Frankfurt am Main
- Kontakt: info@alltagsengel.care

## Projektstruktur

```
velora/
├── README.md                           # Dieses Dokument
├── konzept-medikamenten-tracking.md    # Feature-Konzept Medikamenten-Tracking
├── app/                                # (geplant) React Native App
├── docs/                               # (geplant) Weitere Konzeptdokumente
└── design/                             # (geplant) Branding & UI/UX
```
