# PflegeCoach Selbstzahler — Verkaufsfähigkeits-Check

**Stand:** 14.08.2026 · Grundlage: Code-Audit (Datei:Zeile-Belege) des am 14.08.2026 gebauten
Selbstzahler-Verkaufswegs (Checkout, Bestellung, Rechnung, Zugang, Kündigung, Widerruf, AGB).

## Ergebnis

12 von 14 Checklist-Punkten sind vollständig vorhanden. Die verbleibenden zwei sind kein
Baurückstand, sondern jeweils entweder bereits korrekt gelöst (siehe unten) oder eine bewusste
Architekturentscheidung, die hier nicht ohne Rücksprache aufgehoben wird.

**Nachtrag 14.08.2026 abends (siehe Punkt 12 unten):** Der Verkaufsweg selbst ist vollständig,
aber Verkauf und Zugangs-Gate hängen an zwei getrennten Schaltern
(`COACH_PREISE_FREIGEGEBEN` und `COACH_FREISCHALTUNG_PFLICHT`). Werden nicht beide zusammen
gesetzt, schaltet Zahlung faktisch nichts frei, was ein unbezahlter, eingeloggter Nutzer nicht
ohnehin schon hätte. Das ist bei der Preisfreigabe zu beachten.

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
| 12 | Zugriffsfreischaltung `quelle='selbstzahler'` | ✅ mit Voraussetzung, siehe unten |
| 13 | Ein-Klick-Kündigung, §312k BGB | ✅ kein Dark Pattern |
| 14 | noindex an Verkaufsfreigabe gekoppelt | ✅ bereits korrekt — s.u. |

## Punkt 12 — wichtiger Nachtrag (14.08.2026, später Abend): zwei Schalter, nicht einer

Erneute Code-Prüfung deckt eine bisher nicht dokumentierte Abhängigkeit auf: `schalteZugangFrei()`
(`lib/coach/verkauf-server.ts:58-87`) legt bei Zahlung korrekt eine Zeile in `coach_freischaltungen`
an, und `istFreigeschaltet()` (`lib/coach/freischaltung.ts:130-135`) prüft diese Zeile technisch
richtig (Status `aktiv` + Gültigkeitszeitraum). **Diese Prüfung wird aber nur ausgeführt, wenn
`freischaltungPflicht()` `true` liefert** (`lib/coach/api-auth.ts:156`: `if
(!freischaltungPflicht()) return null` — Gate übersprungen). Diese Funktion liest denselben
Schalter wie das DiPA-Freischaltcode-Verfahren: `COACH_FREISCHALTUNG_PFLICHT`, **Default AUS**
(`lib/coach/config.ts:35`), bewusst wegen der bei DiPA offenen Frage, ob ein Code-Verfahren
verbindlich ist (siehe `docs/dipa/16_PHASE7_FINALAUDIT_2026-08-14.md`, REG-02).

**Konsequenz für den Selbstzahler-Weg:** Der Schalter ist produktübergreifend derselbe. Setzt
jemand künftig **nur** `COACH_PREISE_FREIGEGEBEN=true` (Verkauf ermöglichen), ohne zusätzlich
`COACH_FREISCHALTUNG_PFLICHT=true` zu setzen, verkauft die Seite zwar korrekt und bucht auch
korrekt ab — aber **jeder eingeloggte, einwilligende Nutzer hat exakt denselben Funktionszugriff
wie ein zahlender Kunde**, weil das Zugangs-Gate dann für niemanden greift (weder für
Selbstzahler noch für DiPA-Codes). Das ist kein Implementierungsfehler — der Mechanismus selbst
ist korrekt gebaut und mit `bestellung.test.ts` (`hatZugang`, separat für die reine Statusanzeige
auf der Konto-Seite) sowie über die Shadow-DB-Tests abgesichert — sondern eine bisher nicht
explizit festgehaltene **Kopplung zweier unabhängiger Schalter**, die bei der Verkaufsfreigabe
leicht übersehen werden kann.

**Handlungsbedarf vor echtem Go-Live:** `COACH_FREISCHALTUNG_PFLICHT=true` muss zusammen mit
`COACH_PREISE_FREIGEGEBEN=true` gesetzt werden (oder eine bewusste Entscheidung getroffen werden,
den PflegeCoach dauerhaft ohne Zugangs-Gate als kostenpflichtiges, aber technisch offenes Produkt
zu betreiben — was nicht empfohlen wird). Dies ist eine reine Konfigurationsentscheidung, kein
Code-Fix; in dieser Sitzung bewusst nicht selbst umgestellt, weil das Umschalten von
`COACH_FREISCHALTUNG_PFLICHT` auch das DiPA-Freischaltcode-Verfahren scharf schaltet — das ist
laut REG-02 weiterhin eine offene regulatorische Frage und keine Entscheidung, die hier ohne
Rücksprache getroffen werden darf.

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
wäre. Offen sind ausschließlich Entscheidungen des Produktverantwortlichen:

1. Reale Preisfreigabe (`COACH_PREISE_FREIGEGEBEN`) — echte Preise statt Platzhalter, echte
   Stripe-Price-IDs (aktuell in `.env.example` nicht gesetzt).
2. **Zusammen damit** `COACH_FREISCHALTUNG_PFLICHT=true`, sonst bleibt das Zugangs-Gate für alle
   Nutzer wirkungslos (Punkt 12 oben) — unabhängig von der Preisfreigabe zu entscheiden, weil der
   Schalter auch das DiPA-Freischaltcode-Verfahren betrifft.
3. Umsatzsteuer-Regime (Kleinunternehmer vs. Regelbesteuerung) und Steuernummer/USt-IdNr., ohne
   die jede ausgestellte Rechnung formal unvollständig bleibt (`lib/coach/rechnung.ts`,
   `pruefeRechnungsangaben`, `.env.example` aktuell leer).
4. Falls gewünscht — eine bewusste Aufweichung der Admin-Zugriffsgrenze auf `coach_bestellungen`
   (Punkt 10 unten).

**PflegeCoach technisch verkaufsfähig: NEIN** — nicht wegen einer Baulücke, sondern weil die
Sperren (Preise, Zugangs-Gate) bewusst und korrekt fail-closed stehen, bis die vier Punkte oben
kaufmännisch entschieden sind.
