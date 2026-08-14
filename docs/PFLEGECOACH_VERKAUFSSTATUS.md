# PflegeCoach Selbstzahler — Verkaufsfähigkeits-Check

**Stand:** 14.08.2026 · Grundlage: Code-Audit (Datei:Zeile-Belege) des am 14.08.2026 gebauten
Selbstzahler-Verkaufswegs (Checkout, Bestellung, Rechnung, Zugang, Kündigung, Widerruf, AGB).

## Ergebnis

12 von 14 Checklist-Punkten sind vollständig vorhanden. Die verbleibenden zwei sind kein
Baurückstand, sondern jeweils entweder bereits korrekt gelöst (siehe unten) oder eine bewusste
Architekturentscheidung, die hier nicht ohne Rücksprache aufgehoben wird.

| # | Punkt | Status |
|---|---|---|
| 1 | Produktseite erreichbar | ✅ `/pflegecoach/start` |
| 2 | Leistungsbeschreibung klar | ✅ `app/pflegecoach/start/page.tsx:164-197` |
| 3 | Preis-Konfiguration zentral | ✅ `lib/coach/pricing.ts` — Platzhalter, s.u. |
| 4 | Checkout fail-closed | ✅ `istVerkaufBereit()`, 4 Sperren |
| 5 | Bestellbestätigung/Webhook | ✅ Danke-Seite mit Poll-Fenster |
| 6 | Rechnungsnummer PC-YYYY-NNNNNN | ✅ `lib/coach/rechnung.ts` |
| 7 | Datenschutzerklärung verlinkt | ✅ eigene Coach-Seite |
| 8 | Widerrufsbelehrung verlinkt + versioniert | ✅ `WIDERRUFSBELEHRUNG_VERSION`, protokolliert je Bestellung |
| 9 | AGB verlinkt | ✅ eigene Coach-AGB |
| 10 | Admin-Verwaltung: Bestellungen einsehbar | **Bewusst NICHT umgesetzt** — Produktgrenze, siehe unten |
| 11 | Kaufstatus sichtbar | ✅ Konto-Seite |
| 12 | Zugriffsfreischaltung `quelle='selbstzahler'` | ✅ `lib/coach/verkauf-server.ts` |
| 13 | Ein-Klick-Kündigung, §312k BGB | ✅ kein Dark Pattern |
| 14 | noindex an Verkaufsfreigabe gekoppelt | ✅ bereits korrekt — s.u. |

## Punkt 10 — Admin sieht Bestellungen nicht: Produktgrenze, kein Fehlen

`supabase/migrations/20260907000000_coach_selbstzahler.sql` legt das explizit fest (Kommentar im
Migrationskopf): *„Der Nutzer sieht ausschließlich seine eigenen Bestellungen, ein Admin sieht sie
überhaupt nicht."* Es existiert **keine** RLS-Policy, die Admins Lesezugriff auf
`coach_bestellungen` gibt — `authenticated` hat dort ausschließlich Selbst-Leserechte, Schreiben
läuft nur im Systemkontext (Stripe-Webhook mit `service_role`). Das folgt derselben Produktgrenze
wie beim DiPA-Modul (kein Admin-Zugriff auf `coach_*`-Tabellen), obwohl `coach_bestellungen`
selbst keine Gesundheitsdaten enthält, sondern Vertrags-/Zahlungsdaten.

Diese Grenze wurde hier **nicht aufgehoben**, weil sie erkennbar eine bewusste, begründete
Design-Entscheidung ist und nicht ein übersehenes Feature — eine Admin-Leseansicht auf
Kaufverträge ist ein Privacy-Entscheid, keine reine Implementierungslücke. Operative
Zahlungs-/Abo-Sicht (offene Zahlungen, Kündigungen, Rückerstattungen) ist über das Stripe-Dashboard
abgedeckt, ohne diese Grenze im eigenen Admin-Bereich aufzuweichen. Falls doch eine In-App-Ansicht
gewünscht ist, ist das eine Entscheidung, die Rücksprache mit dem Produktverantwortlichen braucht
— nicht etwas, das sich aus der bestehenden Checklist automatisch ergibt.

## Punkt 14 — noindex ist bereits korrekt an die Verkaufsfreigabe gekoppelt

`app/pflegecoach/layout.tsx` setzt `robots: { index: false, follow: false }` nur als **Vorgabewert**
für den gesamten Produktbereich (Assessment, Ziele, Verlauf, Konto — alles zeigt Nutzerdaten und
bleibt dauerhaft aus dem Index). Die öffentliche Verkaufsseite überschreibt das gezielt:
`app/pflegecoach/start/layout.tsx` exportiert `coachVerkaufsMetadata('Willkommen und
Zweckbestimmung')`, definiert in `app/pflegecoach/_lib/seitentitel.ts:57-63` — dort hängt
`robots.index` direkt an `verkaufMoeglich()` aus `lib/coach/pricing.ts`. AGB und Widerrufsbelehrung
bleiben unabhängig davon dauerhaft `noindex, follow` (Rechtstexte gehören nicht in den Suchindex,
ihre Links auf Impressum/Datenschutz sollen aber zählen) — das ist beabsichtigt, keine Lücke.

## Harte Anforderungen — eingehalten

- **DiPA/Kassenerstattung/BfArM im Verkaufsweg:** kein Treffer im kundensichtbaren Text. Zwei
  Treffer im gesamten Coach-Baum sind reine Code-Kommentare (`start/page.tsx:208`,
  `pricing.ts:30`), nicht im UI. Sichtbarer Text sagt explizit das Gegenteil: „Dies ist keine
  Kassenleistung" (`start/page.tsx:238-242`).
- **`COACH_DIPA_MODUS`:** `false` per Default (`lib/coach/config.ts:10-23`,
  `.env.example:97` auskommentiert).
- **Preise:** `lib/coach/pricing.ts` — ausdrücklich deklarierte Platzhalter
  (`PLATZHALTER_BETRAG_CENT`, 19 €/Monat bzw. 190 €/Jahr), mit Kopfkommentar „NICHT kaufmännisch
  entschieden und dürfen niemandem in Rechnung gestellt werden". Verkauf bleibt fail-closed
  gesperrt, bis `COACH_PREISE_FREIGEGEBEN=true` gesetzt wird — **das ist eine Entscheidung des
  Produktverantwortlichen, hier nicht vorweggenommen.**

## Fazit

Der Selbstzahler-Verkaufsweg ist technisch vollständig. Es fehlt nichts, was code-seitig zu bauen
wäre. Offen sind ausschließlich zwei Entscheidungen des Produktverantwortlichen: die reale
Preisfreigabe (`COACH_PREISE_FREIGEGEBEN`) und — falls gewünscht — eine bewusste Aufweichung der
Admin-Zugriffsgrenze auf `coach_bestellungen`.
