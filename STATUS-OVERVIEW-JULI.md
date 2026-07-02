# Projektstatus — 02. Juli 2026

## Erledigt (letzte Sessions)
- SEO/GEO für beide Projekte (Schema.org, FAQ, LocalBusiness)
- Killer-Features: Budgetrechner, Pflegegrad-Check, PLZ-Check, AI Match-Finder, Mietvertrag-Generator
- Sicherheitsfixes (XSS, GDPR)
- Native iOS Apps gebaut (Expo SDK 57)
- EAS-Setup komplett (Alltagsengel + ChairMatch)
- Graphify Knowledge Graph (7.200 + 3.582 Nodes)
- Marketing-Content (Reels, Posts, 4-Wochen-Kampagnenplan)

## Offen — Sofort

### PROCARE-Meeting
War heute 14:00 mit Marco Jürgens geplant. Status?

### iOS-Builds starten
EAS konfiguriert, erster Build braucht einmalig Apple-Developer-Login.

### Barbara Dalchow
4 Kundenanfragen via 11880.com (55128 Mainz). Kontaktdaten noch nicht freigeschaltet.

### Google Ads Eskalation
Ticket 9-0872000040936, seit 28+ Tagen keine Antwort.

## Offen — Mittelfristig

### Betriebssystem Phase 1 — GEBAUT & LIVE (ein manueller Schritt offen)
Digitale Leistungsnachweise, Budgetverwaltung (131€/Monat §45b), Abrechnungs-Workflow sind
gebaut, deployed und unter `/admin` (Übersicht/Klienten/Leistungsnachweise/Budgets/Rechnungen)
live. Tabellen in Supabase mit realistischen Testdaten befüllt (3 Klienten PG2–3, Betreuungskraft,
28 Leistungsnachweise, Budgets mit Ampel 🟢🟡🔴, 3 Rechnungen + Streitfall via
`scripts/seed-betriebssystem.mjs`). Budget-Automatik: DB-Trigger pflegt `used_amount` automatisch
(verifiziert). Frontend-Bug (generierte Spalte `duration_minutes`) behoben.
**Offen (1 manueller Schritt):** Constraint-Migration `supabase/migrations/20260702_fix_service_records_check_constraints.sql`
im Supabase SQL-Editor ausführen — erst danach speichert das Leistungsnachweis-Formular
Status `signed`/`complete` (aktuell blockiert eine falsch angelegte CHECK-Constraint das).

### ChairMatch App Store
Neuen App-Eintrag in App Store Connect anlegen.

### Tagesmütter-Plattform
Wartet auf Alex (~4 Wochen). Nichts bauen bis Vertrag steht.

## Marketing-Status

4-Wochen-Kampagnenplan fertig: LinkedIn, Instagram, TikTok, Newsletter, Blog, Podcast. Grafiken, Reels und Posting-Anleitungen vorhanden.

### Was im Marketing noch fehlt:
- Kein Tracking wann was gepostet wurde
- Google Business Profil pflegen (Bewertungen, Posts)
- Branchenverzeichnisse eintragen (Vorlage existiert)
- Kooperationspartner aktiv ansprechen (Pflegestützpunkte, Kliniken)
- Content-Kalender wird nicht automatisch ausgeführt
