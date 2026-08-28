# COMPLETION-MATRIX — Alltagsengel · ChairMatch · efy care

> Erstellt: 2026-08-28 · Grundlage: Code-Scan der drei Repositories **plus**
> eigene Sonden gegen die drei Produktions-Instanzen (PostgREST, HTTP,
> Edge Functions). Keine Bewertung stammt aus einem Statusdokument allein;
> wo eine Stufe nur auf fremder Aussage beruht, steht das ausdrücklich dabei.

---

## 1. Bewertungsmodell

Die Stufen sind **kumulativ**: Stufe *n* setzt alle darunterliegenden voraus.
Ein Modul, das live läuft, aber keine echten Tests hat, bekommt deshalb
**nicht** DEPLOYED, sondern bleibt bei IMPLEMENTED.

| Stufe | Punkte | Bedeutung — und was als Nachweis zählt |
|---|---|---|
| `NOT_STARTED` | 0 | Kein Code vorhanden. |
| `IMPLEMENTED` | 1 | Code existiert und ist verdrahtet (nicht nur eine Datei ohne Aufrufer). |
| `TESTED` | 2 | Echte automatisierte Tests. Ein Quelltext-Grep (`toContain('rateLimit(')`) zählt **nicht**. |
| `DEPLOYED` | 3 | Der Code liegt auf Produktion (Vercel-Deploy bzw. angewendete Migration). |
| `PROVEN_LIVE` | 4 | Ein tragendes Element wurde **gegen Produktion** nachgewiesen: Zeilen, Spalten, Policies, Constraints oder HTTP-Antworten. |
| `E2E_PROVEN` | 5 | Die **vollständige Kette** ist durchlaufen — entweder in Produktion oder in einem Prüfstand gegen **echtes Postgres** (PGlite). Ein Lauf gegen eine Attrappe zählt hier nicht. |
| `DONE` | 6 | Zusätzlich: keine offenen Befunde, keine wartende Migration, kein externer Blocker — und im produktiven Einsatz. |

**Prozentformel:** `Summe erreichter Punkte / (6 × Anzahl Module) × 100`

> **Warum kein einziges Modul DONE ist:** in allen drei Produkten liegt
> mindestens eine committete, nicht angewendete Migration oder ein externer
> Blocker (fehlende ENV-Variable, fehlender Bescheid, nicht veröffentlichte
> App). DONE würde bedeuten: nichts mehr offen. Das trifft nirgends zu.

---

## 2. Was ich selbst gegen Produktion geprüft habe

Diese Sonden sind die Grundlage jeder `PROVEN_LIVE`-Vergabe unten.

### Alltagsengel — Supabase `nnwyktkqibdjxgimjyuq`, Dienstschlüssel, Zeilenzahlen

| Tabelle | HTTP | Zeilen | Tabelle | HTTP | Zeilen |
|---|---|---|---|---|---|
| `profiles` | 206 | **64** | `invoices` | 206 | **3** |
| `clients` | 206 | **4** | `invoice_items` | 206 | **15** |
| `caregivers` | 206 | **2** | `payments` | 200 | **0** |
| `angels` | 206 | **16** | `client_budgets` | 206 | **4** |
| `bookings` | 206 | **10** | `billing_tariffs` | 206 | **23** |
| `assignments` | 206 | **5** | `invoice_email_log` | 200 | **0** |
| `service_records` | 206 | **30** | `notification_delivery_log` | 200 | **0** |
| `lead_inquiries` | 206 | **32** | `newsletter_subscribers` | 200 | **0** |
| `page_views` | 206 | **8324** | `organizations` | 206 | **6** |

Zusätzlich live gelaufen: `npm run verify:perimeter` → **8 von 8 bestanden**
(4 Berichte), `npm run verify:abrechnung` → **8 von 9 bestanden**
(1 offen: E1, die Obergrenzen-Migration `20261017000002`).
HTTP: `alltagsengel.care` → 200, `/sitemap.xml` → 200, `/api/health` → 200,
`/admin` und `/kunde/home` → 307 (Wächter greift).

### ChairMatch — Supabase `pwdbjqfpgumyfktbfswg`, **anon**-Schlüssel

Der Dienstschlüssel in `.env.prod` ist **ungültig** („Invalid API key",
offenbar rotiert). Zeilenzahlen konnte ich deshalb **nicht** ziehen — das ist
eine Lücke in dieser Matrix und keine Aussage über den Bestand.

Was ging: anon-Sonde über 13 Tabellen — **alle 401/42501**, inklusive
`rental_equipment` (der REVOKE aus CM22 ist damit **von mir** live bestätigt,
nicht nur aus dem Ledger übernommen). Öffentliche Kennzahlen über
`GET /api/public-stats` (HTTP 200): **50 Nutzer, 15 Salons, 1 Buchung,
48 Bewertungen, 7 Städte**. `www.chairmatch.de` → 200, `chairmatch.de` → 308.

### efy care — Supabase `nsfbwhpjesmathsrqkfi`, **anon**-Schlüssel

Kein Dienstschlüssel im Repo. Zwei Erkenntnisse aus der anon-Sonde:

1. **Anders als bei Alltagsengel antwortet anon hier mit `200 []`, nicht mit
   `401`.** Über 14 Tabellen hinweg. Das heißt: anon hat das Tabellenrecht
   SELECT, und **RLS ist die einzige Grenze**. Es ist kein Leck — es kam keine
   einzige Zeile zurück —, aber es ist eine schwächere Aufstellung als bei
   Alltagsengel, wo anon schon am Recht scheitert.
2. **Spalten-Orakel** (eine fehlende Spalte wirft 42703, eine vorhandene
   liefert `200 []`) — damit lässt sich ohne Dienstschlüssel feststellen,
   welche Migration wirklich eingespielt ist:

| Sonde | Ergebnis | Bedeutung |
|---|---|---|
| `signatures.erfasst_von` | 200 | Track 12 **live** |
| `service_record_items.hand_sign_quelle` | 200 | Track 12 **live** |
| `client_caregiver_assignments.since` | 200 | Track 13 **live** |
| `invoices.storniert_am` | 200 | Track 14 **live** |
| `budget_jahreskonten`, `abrechnung_hoechstsaetze` | 200 | Track 14 **live** |
| `quality_documents` | 200 | Track 15 **live** |
| `organization_members.accepted_at` | **42703** | Track 16 **NICHT live** ✔ deckt sich mit dem Ledger |

**Edge Functions — alle vier sind deployed** (selbst angefragt):

| Function | HTTP | Bewertung |
|---|---|---|
| `ocr-leistungsnachweis` | 401 `UNAUTHORIZED_NO_AUTH_HEADER` | live, weist sauber ab |
| `stripe-checkout` | 401 `UNAUTHORIZED_NO_AUTH_HEADER` | live, weist sauber ab |
| `stripe-portal` | 401 `UNAUTHORIZED_NO_AUTH_HEADER` | live, weist sauber ab |
| `stripe-webhook` | **500 `WORKER_ERROR`** | **BEFUND — siehe unten** |

> **Neuer Befund (efy, P1): `stripe-webhook` stürzt beim Laden ab.**
> Erwartet wäre eine Signaturabsage (400/401). Stattdessen kommt
> `WORKER_ERROR — Function exited due to an error`. Die einzige Stelle in der
> Importkette, die beim **Modul-Laden** wirft, ist
> `supabase/functions/_shared/stripe-client.ts`:
> `if (!STRIPE_SECRET_KEY) throw new Error(...)`. Die anderen drei Functions
> antworten mit 401 **vor** dem Worker (Gateway-JWT-Prüfung), beweisen also
> nichts über ihren eigenen Modul-Load. Ich habe das Fehlen des Secrets nicht
> direkt gemessen — es ist die naheliegende, aber nicht bewiesene Ursache.
> Wirkung so oder so: **jedes Stripe-Event an efy care schlägt fehl.**

**efy care ist nicht ausgeliefert.** Vier plausible Domains (`efycare.de`,
`www.efycare.de`, `efy-care.de`, `efy.care`) antworten mit **000** (kein DNS).
`app.json` steht auf Version `1.0.0`, kein Hinweis auf ein Store-Release.
Backend und Edge Functions sind live, die **App ist es nicht**.

---

## 3. ALLTAGSENGEL

Repo `/Users/work/alltagsengel` · HEAD `41bdfce4` · main == origin/main ·
413 API-Routen · 353 Testdateien · 406 Migrationsdateien ·
CI zuletzt **grün** (Run 33193896467, 28.08. 17:16).

| # | Modul | Status | Punkte | Nachweis und was fehlt |
|---|---|---|---|---|
| 1 | **Auth/Login** | `PROVEN_LIVE` | 4 | 64 echte Profile live; `lib/auth` mit `konto-status.ts`, `rollen-quelle.ts`, `guard.ts`; `lint:route-auth` über 412 Routen = 0 in CI; Track 11 hat den wirkungslosen Soft-Delete geschlossen. **Kein E2E:** `e2e/auth-delete.spec.ts` und `register.spec.ts` existieren, laufen aber **nicht in CI** — die CI-E2E-Stufe startet ausdrücklich nur `pflegecoach*.spec.ts` und `landing-axe.spec.ts`. |
| 2 | **Buchungssystem** | `E2E_PROVEN` | 5 | 10 `bookings` + 5 `assignments` live; `__tests__/e2e/buchung-einsatz-kette.test.ts` läuft in CI gegen **echtes Postgres** (PGlite). Offen: `bookings.customer_id` zeigt auf `profiles`, nicht auf `clients` — Klient-Termine leben in `assignments`, die Kette ist zweigleisig. |
| 3 | **Engel-Verwaltung** | `PROVEN_LIVE` | 4 | 16 `angels` live; Track 9 Column-Level-GRANT **live belegt** (`has_column_privilege` für `hourly_rate` = false); Track 12 hat die Umgehung über `registerAsEngel` geschlossen. Kein durchgehender E2E-Lauf für Profil/Verfügbarkeit. |
| 4 | **Kundenverwaltung** | `PROVEN_LIVE` | 4 | 4 `clients`, 4 `client_budgets`, 6 `organizations` live; Mandantenzaun `org_fence` RESTRICTIVE. Vier Klienten sind ein Pilotbestand, kein Betrieb. |
| 5 | **Abrechnungssystem (§45a SGB XI)** | `E2E_PROVEN` | 5 | 3 Rechnungen, 15 Positionen, 23 Tarife live; `verify:abrechnung` **8/9 live bestanden**; PGlite-Ketten (`abrechnungskette`, `billing-e2e`, `go-live-pilot-hauptkette`) laufen in CI gegen echtes Postgres. **Nicht DONE:** `payments` = **0** — es wurde nie ein Zahlungseingang verbucht; Migration `20261017000002` (Obergrenze nach Angebotstyp) wartet, deshalb rechnet der Trigger `hauswirtschaft` mit 30 € statt 25 €; §45a-Bescheid Bayern extern offen. |
| 6 | **Leistungsnachweis** | `E2E_PROVEN` | 5 | 30 `service_records` live, davon 15 abgerechnet; `nachweis-kette-pglite.test.ts` in CI; Beleg-Trigger `trg_a_unterschrift_beleg` und CHECK `service_records_zeitfenster_gueltig` **live nachgewiesen** (Migration `20261017000000` ist eingespielt). **Offener Live-Befund:** `is_locked` = false auf **allen** 30 Zeilen, `signature_hash` auf **keiner** — der Manipulationsschutz hat in dieser Datenbank noch nie gegriffen; die 15 abgerechneten Zeilen stammen aus der Zeit vor der Sperre. |
| 7 | **Admin-Dashboard** | `PROVEN_LIVE` | 4 | 98 Bereiche unter `app/admin`; `/admin` antwortet live mit **307** (Wächter greift, kein Durchgriff); RLS-Lockdown der Betriebssystem-Tabellen per Impersonation belegt. **Bewusst nicht höher:** geprüft ist der Zugangsriegel und die Datenschicht — **nicht** die Funktion aller 98 Bereiche. |
| 8 | **SEO/Landing Pages** | `E2E_PROVEN` | 5 | Das einzige Modul mit echtem Publikumsverkehr: **8.324 `page_views`** seit 26.03., 3.398 `visitors`, **32 `lead_inquiries`**, 38 `conversions`. Die Kette Besucher → Seitenaufruf → Anfrage ist **in Produktion mit echten Menschen** durchlaufen. `sitemap.xml` und `robots.txt` → 200; `landing-axe.spec.ts` (BITV) läuft in CI. Offen: Track 13 Aufbewahrungsfristen laufen als Trockenlauf (`PERIMETER_AUFBEWAHRUNG_AKTIV` nicht gesetzt), 6.641 Seitenaufrufe tragen volle IPs. |
| 9 | **E-Mail-System** | `DEPLOYED` | 3 | Resend verdrahtet (9 Module), `lib/emails/*`, Versandkette samt `invoice_email_log` gebaut und getestet. **Warum nicht PROVEN_LIVE:** `invoice_email_log` = **0**, `notification_delivery_log` = **0**, `newsletter_subscribers` = **0**. Es ist über den produktiven Weg **nie eine Mail rausgegangen**. Ursache ist bekannt und extern: `RECHNUNGSVERSAND_AUTOMATISCH` und `MAHNVERSAND_AUTOMATISCH` sind in Vercel nicht gesetzt. |
| 10 | **API-Sicherheit (RLS, Policies)** | `E2E_PROVEN` | 5 | Der belastbarste Teil des Systems. 310/310 Tabellen mit RLS; anon-Schreibrechte = 0; `verify:perimeter` **8/8 live**; 13 aufeinander aufbauende Härte-Tracks mit je eigenem Bericht; `lint:forbidden`, `lint:route-auth`, `lint:org-id` blockieren in CI. Die Kette anon → PostgREST → RLS ist **gegen Produktion** durchlaufen. **Nicht DONE:** Migration `20261017000002` offen; Restposten R1 (Wegepauschale §45b steht auf `verified`, obwohl `obergrenzen.ts` das Gegenteil festhält), R2 (fünf Tabellen hängen nur an einem Funktionsrecht statt an einer Policy). |

**Alltagsengel: 44 von 60 Punkten = 73 %**

---

## 4. CHAIRMATCH

Repo `/Users/work/chairmatch` · HEAD `5af4013` · 106 API-Routen ·
78 Testdateien (~1.526 Tests laut Track-22-Commit) · 39 Migrationsdateien,
49 in Supabase · CI = Typecheck + vitest (**kein E2E in CI**).

| # | Modul | Status | Punkte | Nachweis und was fehlt |
|---|---|---|---|---|
| 1 | **Auth/Login** | `PROVEN_LIVE` | 4 | 50 echte Nutzer live (`/api/public-stats`); Track 21 hat sieben Auth-Befunde geschlossen (2FA per einzelnem POST abschaltbar, Passwortwechsel beendete keine Sitzung, Cookie ohne `__Secure`-Präfix, admin konnte super_admin herabstufen) — 51 neue Tests, Gegenprobe: 29 fallen mit zurückgesetztem Code durch. Playwright `protected-pages.spec.ts` existiert, läuft **nicht in CI**. |
| 2 | **Stuhl-Listings (Vermieter)** | `PROVEN_LIVE` | 4 | `rental_equipment` + `listing.service.ts`; **von mir live bestätigt:** anon bekommt `42501` — der CM22-REVOKE greift, unveröffentlichte Entwürfe und Inserate gesperrter Anbieter sind nicht mehr über PostgREST abgreifbar. 7/7 CHECK-Constraints laut Ledger live. Zeilenzahl nicht messbar (Dienstschlüssel ungültig). |
| 3 | **Buchung/Miete (Mieter)** | `PROVEN_LIVE` | 4 | `rental_bookings` mit Compare-and-Swap im Stripe-Webhook (CM22 — der Miet-Zweig war der einzige ohne CAS, zwei Zustellungen ergaben zwei `payments`-Zeilen für eine Miete); Datumsprüfung über `src/lib/iso-date.ts` (`2026-13-45` lief vorher als `NaN` durch beide Riegel). Constraints live. **Keine belegte Miet-Buchung** — `public-stats` meldet insgesamt 1 Buchung. |
| 4 | **Zahlungsabwicklung (Stripe)** | `DEPLOYED` | 3 | Checkout/Webhook/Connect implementiert, Webhook-Signaturprüfung getestet, CAS auf allen drei Zweigen. **Warum nicht höher:** `docs/VERCEL_ENV_VARS.md` hält fest, dass in Vercel **alle sechs Stripe-Variablen fehlen** — `src/lib/stripe.ts` initialisiert lazy und wirft zur Laufzeit. Ich konnte das nicht gegenprüfen (`/api/stripe/checkout` und `/api/admin/health` antworten beide mit 401, bevor Stripe überhaupt angefasst wird). Solange das nicht widerlegt ist, ist die Zahlungsstrecke **Code auf Produktion, aber nicht funktionsfähig** — die größte offene Position bei ChairMatch. |
| 5 | **Bewertungssystem** | `PROVEN_LIVE` | 4 | **48 Bewertungen live.** CM22 hat aufgedeckt, dass die 14-Tage-Freischaltung **nie gelaufen** ist: `publish_review_pair()` löste das Buchungsende nur aus `bookings` auf, Miet-Bewertungen tragen dort eine `rental_bookings.id` → `NULL >= 14` ist nie wahr, und weil die Funktion VOID zurückgibt, meldete der Cron trotzdem `ok`. Behoben und die Funktion polymorph repariert — die **Wirkung des Fixes in Produktion ist noch nicht belegt**. |
| 6 | **Such-/Filterlogik** | `PROVEN_LIVE` | 4 | `/api/rental-listings` + Suchseite; 15 Salons über 7 Städte live (`Berlin, Düsseldorf, Frankfurt, Hamburg, Köln, München, Stuttgart`); die Umstellung von Browser-Client auf Server-Route ist der Grund, warum der anon-REVOKE überhaupt möglich war. |
| 7 | **Admin-Dashboard** | `DEPLOYED` | 3 | `/admin/anbieter`, Freischaltung, Refunds, Health; `/api/admin`-Routen in Track 20 „ohne Befund" geprüft. **Kein Produktionsnachweis:** alle Admin-Endpunkte antworten anonym mit 401 — das belegt den Riegel, nicht die Funktion. |
| 8 | **Miet-Marktplatz Härtung** | `PROVEN_LIVE` | 4 | CM22: sieben Befunde, sechs im Code behoben, einer als Migration — **und die Migration ist eingespielt**: Ledger meldet 7/7 Constraints, `publish_review_pair` repariert, `schema_migrations` = `20260828230000`; den anon-REVOKE habe ich selbst nachgemessen. 18 neue Tests, Gegenprobe: 10 von 20 fallen mit zurückgesetztem Code durch. **Offen:** `20260828170738_benachrichtigungswege_haertung.sql` (CM23) ist committet, **nicht angewendet**. |
| 9 | **API-Sicherheit (RLS, Policies)** | `E2E_PROVEN` | 5 | Middleware-Default-Deny über alle 106 Routen; RLS 79/79 Tabellen; **eigene anon-Sonde über 13 Tabellen: durchweg 401/42501**, `salons` und `reviews` scheitern schon an `is_admin_or_super`. Die Kette anon → PostgREST → RLS ist gegen Produktion durchlaufen. **Nicht DONE:** Track 21 hält ausdrücklich fest, dass die *angewendeten* Policies ohne DB-Zugang nicht prüfbar sind; CM23-Migration offen. |

**ChairMatch: 35 von 54 Punkten = 65 %**

---

## 5. EFY CARE

Repo `/Users/work/efy-care` · HEAD `ce9af1b` · **Expo/React-Native-App**
(keine Next.js-API-Routen) · 62 Testdateien (~1.807 Tests laut Track-15-Commit)
· 35 Migrationsdateien, 50 in Supabase · 4 Edge Functions.

> **Rahmenbedingung für alle Zeilen:** Backend und Edge Functions sind live,
> die **App ist nicht ausgeliefert** (kein DNS auf vier geprüften Domains,
> Version 1.0.0, kein Store-Release-Beleg). `DEPLOYED` bezieht sich hier auf
> das Backend. Kein Modul kann `E2E_PROVEN` erreichen, weil kein Prüfstand
> gegen echtes Postgres existiert (die Suiten laufen gegen Doubles und
> Shadow-DB) und niemand die App benutzt.

| # | Modul | Status | Punkte | Nachweis und was fehlt |
|---|---|---|---|---|
| 1 | **Auth/Login** | `DEPLOYED` | 3 | `(auth)/login`, `(auth)/register`, `secureSessionStorage.ts`, `sessionMigration.ts`; Supabase-Auth live. **Warum nicht PROVEN_LIVE:** kein einziger Anmeldevorgang ist nachweisbar, `profiles` liefert anon 0 Zeilen und ohne Dienstschlüssel ist der Bestand nicht messbar. |
| 2 | **Klientenverwaltung (CAS)** | `PROVEN_LIVE` | 4 | `lib/cas.ts` mit bedingtem Update (Mandantenzaun **und** erwarteter Ausgangswert im WHERE), doppelt abgesichert durch Trigger `enforce_status_transition`; Migration `cas_statusuebergaenge` in der Supabase-History, `client_caregiver_assignments.since` von mir live nachgewiesen (Track 13). Track 13 schloss: gesperrte Konten lasen weiter, `since/until` wurden nie gelesen. |
| 3 | **Leistungserfassung** | `PROVEN_LIVE` | 4 | Prüfzentrale samt Offline-Warteschlange; Track 12 live nachgewiesen (`signatures.erfasst_von`, `service_record_items.hand_sign_quelle`). Track 12 schloss, dass die Unterschrift ein Beweisfeld **in der Hand der geprüften Seite** war (`present` false→true, Freigabe, Rechnung — nachgestellt). |
| 4 | **Abrechnung (§302 SGB V)** | `PROVEN_LIVE` | 4 | EDIFACT-Generator (`features/abrechnung/edifact`), `abrechnungslaeufe`, `datenannahmestellen`; Track 14 mit 15 Befunden **live nachgewiesen** (`invoices.storniert_am`, `budget_jahreskonten`, `abrechnung_hoechstsaetze` — 24 Funktionen, 15 Trigger laut Ledger). Track 14 fand u. a.: Rechnungssumme ×10 lösbar, direkter INSERT umging Nummernkreis und Budget, Doppelabrechnung nach Storno. **Nie an eine Kasse übermittelt** — die §302-Zahl war laut Track 14 „reine Behauptung"; Stripe-Strecke defekt (siehe §2). |
| 5 | **Dateispeicher/Storage** | `PROVEN_LIVE` | 4 | Track 15: 10 Befunde, u. a. der Beleg einer freigegebenen Rechnung war löschbar, und **ein einziger fremd benannter Ordner legte den Bucket für alle Mandanten still** (harter `::uuid`-Cast in elf Policies → 22P02 traf auch die unbeteiligte Organisation). Migration `20260828230000` laut Ledger PROVEN_LIVE (10 Funktionen, 12 Policies, 5 Trigger, 3 Bucket-Konfigurationen); `quality_documents` von mir live bestätigt. Der Bucket-Nachweis selbst stammt aus dem Ledger, nicht aus einer eigenen Messung. |
| 6 | **Admin-Audit-Trail** | `PROVEN_LIVE` | 4 | `audit_logs` live vorhanden; Migration `admin_audit_trail` (20260827191000) in der History. Track 11 schloss, dass `actor_profile_id` und `created_at` fälschbar waren — 30+ Tage Rückdatierung, Akteur frei wählbar. |
| 7 | **API Rate Limits** | `DEPLOYED` | 3 | `api_rate_limits` live vorhanden, Cron-Migration eingespielt, `docs/EDGE_FUNCTIONS_RATE_LIMIT_2026-08-27.md`. **Warum nicht PROVEN_LIVE:** die bloße Existenz der Tabelle ist mir für dieses Modul zu wenig, und die **Durchsetzung** ließ sich nicht messen — jede Edge Function weist anonym schon am Gateway ab, der Zähler wird nie erreicht. |
| 8 | **Edge Functions** | `PROVEN_LIVE` | 4 | **Alle vier live, von mir angefragt.** `ocr-leistungsnachweis`, `stripe-checkout`, `stripe-portal` antworten sauber mit 401. **`stripe-webhook` antwortet mit 500 `WORKER_ERROR`** — es stürzt beim Laden ab statt die Signatur abzulehnen; damit schlägt jedes Stripe-Event fehl (Ursache siehe §2). Das ist ein Befund, kein Abzug an der Stufe: dass die Functions live sind, ist damit gerade bewiesen. |
| 9 | **API-Sicherheit (RLS, Policies)** | `PROVEN_LIVE` | 4 | RLS 41/41 Tabellen, 185 Policies auf Migrationsebene; anon-Sonde über 14 Tabellen liefert **0 Zeilen** — RLS wirkt. **Zwei offene Punkte:** (a) anon hat hier das Tabellenrecht SELECT (`200 []` statt `401`), RLS ist die **einzige** Grenze — schwächer als bei Alltagsengel; (b) Track 16 (Mandantenzaun Organisation/Mitgliedschaft) ist committet und **nicht eingespielt** — von mir bestätigt: `organization_members.accepted_at` wirft 42703. |

**efy care: 34 von 54 Punkten = 63 %**

---

## 6. Gesamtbild

| Produkt | Module | Punkte | Maximum | Fertigstellung |
|---|---|---|---|---|
| **Alltagsengel** | 10 | 44 | 60 | **73 %** |
| **ChairMatch** | 9 | 35 | 54 | **65 %** |
| **efy care** | 9 | 34 | 54 | **63 %** |
| **Gesamt** | 28 | **113** | **168** | **67 %** |

### Verteilung der Stufen

| Stufe | Alltagsengel | ChairMatch | efy care | Summe |
|---|---|---|---|---|
| `NOT_STARTED` | 0 | 0 | 0 | **0** |
| `IMPLEMENTED` | 0 | 0 | 0 | **0** |
| `TESTED` | 0 | 0 | 0 | **0** |
| `DEPLOYED` | 1 | 2 | 2 | **5** |
| `PROVEN_LIVE` | 4 | 6 | 7 | **17** |
| `E2E_PROVEN` | 5 | 1 | 0 | **6** |
| `DONE` | 0 | 0 | 0 | **0** |

---

## 7. Was diese Zahl ehrlich bedeutet

**Kein Modul steht unter `DEPLOYED`.** Alles ist gebaut, getestet und auf
Produktion. Die fehlenden 33 % sind fast durchweg **keine fehlende Software**,
sondern fehlender **Nachweis in Produktion** und ein Bündel externer Blocker.

Die drei Systeme unterscheiden sich genau in einem Punkt: **wie viel echter
Betrieb schon durch sie hindurchgelaufen ist.**

- **Alltagsengel** hat als einziges echten Publikumsverkehr (8.324
  Seitenaufrufe, 32 Anfragen) und einen Pilotbestand (64 Konten, 30 Nachweise,
  3 Rechnungen). Aber: **0 Zahlungen, 0 versendete Rechnungen, 0 Mails.**
  Der Geldweg ist gebaut, geprüft und in PGlite durchgerechnet — er ist **nie
  gelaufen**.
- **ChairMatch** hat 50 Nutzer, 15 Salons und 48 Bewertungen — aber
  **1 Buchung** und eine Zahlungsstrecke, deren ENV-Variablen laut eigener
  Doku in Vercel fehlen.
- **efy care** hat das dichteste Regelwerk in der Datenbank (Tracks 9–16, je
  eine Migration mit Triggern und Constraints) und **keine ausgelieferte App**.

### Die fünf Positionen, die am meisten Prozent bewegen würden

| # | Position | Wirkung | Wer kann das? |
|---|---|---|---|
| 1 | `RECHNUNGSVERSAND_AUTOMATISCH` + `MAHNVERSAND_AUTOMATISCH` + `CRON_SECRET` in Vercel setzen | AE E-Mail-System 3 → 5, Abrechnung Richtung DONE | **Yusuf** (Vercel-Dashboard) |
| 2 | ChairMatch: sechs Stripe-Variablen in Vercel setzen | CM Zahlungsabwicklung 3 → 4/5 | **Yusuf** (Vercel-Dashboard) |
| 3 | efy: `STRIPE_SECRET_KEY` als Supabase-Function-Secret setzen | behebt `stripe-webhook` `WORKER_ERROR` | **Yusuf** (Supabase-Dashboard) |
| 4 | Drei wartende Migrationen anwenden: AE `20261017000002`, CM `20260828170738`, efy `20260828234500` | öffnet DONE für vier Module | **Yusuf** (SQL-Editor — Dienstschlüssel wird bei DDL mit 42501 abgewiesen) |
| 5 | ChairMatch-Dienstschlüssel erneuern | macht CM überhaupt erst messbar; ohne ihn bleibt jede CM-Zeilenzahl in dieser Matrix eine Lücke | **Yusuf** (Supabase-Dashboard) |

### Wo diese Matrix bewusst nicht weiter geht

- **ChairMatch-Bestandszahlen fehlen.** Der Dienstschlüssel ist ungültig; die
  öffentlichen Kennzahlen aus `/api/public-stats` sind ein Ersatz, kein Ersatz
  für eine Zeilenzählung. Drei CM-Bewertungen stützen sich auf das
  Migrations-Ledger statt auf eigene Messung.
- **Testzahlen sind übernommen, nicht nachgelaufen.** Ich habe Testdateien
  gezählt (353 / 78 / 62), aber die Suiten nicht ausgeführt — auf dieser
  Maschine laufen mehrere Sitzungen parallel, ein abgebrochener `tsc` wäre
  weder grün noch rot. Die Testzahlen (7.971 / 1.526 / 1.807) stammen aus den
  jeweils letzten Commit-Berichten.
- **`DEPLOYED` für efy** meint Backend plus Edge Functions. Die App ist es
  nicht. Wer diese Zeile als „ausgeliefert" liest, liest sie falsch.
