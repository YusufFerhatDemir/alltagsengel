# COMPLETION-MATRIX — Alltagsengel · ChairMatch · efy care

> **ABSCHLUSS-FORTSCHREIBUNG 29.08.2026.** Der zusammenfassende Bericht über
> alle fünf Produkte steht in
> `docs/reports/MASTER_FINAL_COMPLETION_REPORT.md` (+ PDF). Was sich in dieser
> Matrix bewegt hat, steht in **Abschnitt 8** am Ende dieses Dokuments; die
> Punktstände der Abschnitte 3–6 sind **unverändert** — mit Begründung dort.
> Die Pflege-Software wird separat in `docs/PFLEGE_SOFTWARE_COMPLETION.md` und
> deren Fortschreibung vom 29.08. geführt (172/238 = 72,3 %).

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

> **Korrektur vom 29.08.2026:** dieses „1 offen" war ein **Messfehler, kein
> Befund**. Die Migration `20261017000002` ist live — der Quelltext aus
> `pg_proc` wurde gegen das Repo-Artefakt gehalten und ist bis auf
> SQL-Kommentare identisch. Die Prüfung E1 bildete noch die Auswahl *vor* der
> Migration nach und stellte damit eine Frage, die der Trigger gar nicht mehr
> stellt. Nachgezogen; `verify:abrechnung` steht jetzt bei **10/10**.
> Daneben steht neu **E2**, das den Trigger-Quelltext selbst liest — eine
> Nachbildung kann nie beweisen, dass sie noch die des Triggers *ist*.
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

Repo `/Users/work/alltagsengel` · main == origin/main ·
413 API-Routen · 357 Testdateien · 410 Migrationsdateien.

> **Nachgemessen am 29.08.2026, abschließend fortgeschrieben am selben Tag.**
> Anders als in der Fassung vom 28.08. sind die Zahlen zu ChairMatch und efy
> care inzwischen **selbst nachgelaufen** — siehe Abschnitt 8.
>
> Vollständiger Testlauf (Abschlussmessung): **8.431 vitest-Tests grün / 0 rot**
> (371 Dateien grün, 1 übersprungen, 38 Fälle übersprungen), **2.515 node:test
> grün / 0 rot**, `tsc --noEmit` **0 Fehler**, `lint:forbidden` 0 Treffer über
> 24.874 Dateien, `lint:route-auth` 0 über 417 Route-Dateien, `lint:org-id` 0
> über 1.432 Dateien, `verify:abrechnung` **10/10**, `verify:perimeter` **8/8**,
> `verify:e2e-ketten` **38/38**, `verify:personalverwaltung` **13/13**,
> `verify:loeschkette` **8/10**.

| # | Modul | Status | Punkte | Nachweis und was fehlt |
|---|---|---|---|---|
| 1 | **Auth/Login** | `PROVEN_LIVE` | 4 | 64 echte Profile live; `lint:route-auth` über 412 Routen = 0 in CI. **CI-Lücke geschlossen (29.08.):** die E2E-Stufe lief über eine Drei-Datei-Allowlist, `auth-delete/register/booking.spec.ts` waren in CI nie gelaufen. Jetzt läuft `npx playwright test` über das ganze Verzeichnis. Der erste Lauf war rot — **drei echte Befunde**, keiner ein kaputter Test (Homepage-Titel, leeres `[role=alert]`, unbekanntes AGB-Tor). **Bewusst NICHT auf E2E_PROVEN gehoben:** die Suite läuft gegen eine Platzhalter-Supabase-URL. Die Anmeldekette selbst (Zugangsdaten → Sitzung → Rolle → Weiterleitung) wird damit nie durchlaufen — und die Stufe verlangt die vollständige Kette. **Was fehlt, ist genau eine Sache:** ein Testkonto in den CI-Secrets (`PLAYWRIGHT_TEST_EMAIL` / `_PASSWORD`). Die drei Tests dafür stehen fertig in `auth-delete.spec.ts` und überspringen sich selbst, solange die Variablen fehlen. → **Yusuf**, GitHub-Secrets. |
| 2 | **Buchungssystem** | `E2E_PROVEN` | 5 | 10 `bookings` + 5 `assignments` live; `buchung-einsatz-kette.test.ts` in CI. Offen: `bookings.customer_id` zeigt auf `profiles`, Klient-Termine leben in `assignments` — die Kette ist zweigleisig. |
| 3 | **Engel-Verwaltung** | `E2E_PROVEN` | 5 | **Neu (29.08.):** `engel-verwaltung-kette-pglite.test.ts`, 20 Tests, fährt `registerAsEngel` und die drei Verfügbarkeits-Actions gegen **echtes Postgres**. Enthält die Gegenprobe zu Track 12/B1 in beiden Richtungen: der zweite Aufruf lässt die vier an der DB gesperrten Spalten unangetastet **und** schreibt die selbstgepflegten weiter fort. **Befund beim Schreiben gefunden und behoben:** die Wochentagsprüfung lief gegen `0..6` (JavaScript `Date.getDay()`), Spalte und Oberfläche zählen nach ISO `1..7` — **Sonntag ließ sich nicht hinterlegen**. |
| 4 | **Kundenverwaltung** | `E2E_PROVEN` | 5 | **Neu (29.08.):** `kundenverwaltung-kette-pglite.test.ts`, 18 Tests, Kette Berechtigung → Klient → Kundennummer → Budget durch den echten Route-Handler auf echtem Postgres. **Mandantenbefund (P2):** `clients_customer_number_key` ist live **global** eindeutig, die Route prüft mandantenweise — ein Mandant konnte eine Nummer nicht vergeben, die ein anderer führt, und die rohe 23505-Meldung ging als 500 nach außen. Route abgesichert (wirkt sofort), Migration `20260828210000` eingecheckt. |
| 5 | **Abrechnungssystem (§45a SGB XI)** | `E2E_PROVEN` | 5 | 3 Rechnungen, 15 Positionen, 23 Tarife live; `verify:abrechnung` jetzt **10/10** (vorher 8/9). **Nicht DONE:** `payments` = **0** — es wurde nie ein Zahlungseingang verbucht; §45a-Bescheid extern offen; Restposten R1 (Wegepauschale) ist eine **rechtliche** Frage, siehe unten. |
| 6 | **Leistungsnachweis** | `E2E_PROVEN` | 5 | **Der offene Live-Befund ist geklärt (29.08.), und die naheliegende Lesart war falsch.** `is_locked` = false auf allen 30 Zeilen, `signature_hash` auf keiner — aber der Trigger ist **nicht** kaputt: live hängen neun Trigger an `service_records`, alle aktiv, `compute_signature_hash` und `prevent_locked_record_change` sind byte-identisch mit `20260914010000`. Er hängt am **Ende einer Kette, die nie betreten wurde**: der einzige Schreiber von `UNTERSCHRIEBEN` im ganzen Repo weist alles ab, was nicht auf `ABGESCHLOSSEN` steht; alle 30 Zeilen stehen auf `ENTWURF`, `service_signatures` hat 0 Zeilen. Niemand hat je bestätigt, also konnte niemand je unterschreiben. Belegt durch `manipulationsschutz-nachweis-pglite.test.ts` (7 Tests). **Nicht DONE:** die 15 abgerechneten Zeilen stammen aus der Zeit vor der Sperre — ob nachzuunterschreiben, zu stornieren oder als Altbestand zu belassen, ist eine Entscheidung nach § 630f BGB. |
| 7 | **Admin-Dashboard** | `PROVEN_LIVE` | 4 | 98 Bereiche unter `app/admin`; `/admin` live **307**. **Neu (29.08.):** `admin-cockpit-kette-pglite.test.ts`, 24 Tests — die **Wirkung** der zwei folgenreichsten Funktionen (Statuswechsel, Pflegegrad) gegen echtes Postgres, samt Mandantenzaun mit echtem zweitem Mandanten (beide Routen fahren mit dem Admin-Client, der RLS umgeht — der Zaun ist hier eine Codezeile, keine Policy). **Bewusst NICHT auf E2E_PROVEN gehoben:** das sind zwei von 98 Bereichen. Die Stufe würde bedeuten, das Modul sei durchgelaufen; es sind die zwei mit den weitesten Folgen. Das ist eine **Ermessensentscheidung** — wer den Modulbegriff enger fasst, kann hier 5 vergeben. |
| 8 | **SEO/Landing Pages** | `E2E_PROVEN` | 5 | **8.324 `page_views`**, 3.398 `visitors`, **32 `lead_inquiries`** — die Kette Besucher → Seitenaufruf → Anfrage ist **in Produktion mit echten Menschen** durchlaufen. Offen: Aufbewahrungsfristen laufen als Trockenlauf, 6.641 Seitenaufrufe tragen volle IPs. |
| 9 | **E-Mail-System** | `DEPLOYED` **· EXTERNAL_BLOCKED** | 3 | **Der Blocker ist jetzt gemessen, nicht angenommen (29.08.).** Neues `npm run verify:versand` prüft drei Schichten: **Zugang** — Resend-Schlüssel gültig, `alltagsengel.care` = `verified`, DKIM/SPF stehen (nur lesend). **Wirkung** — `invoice_email_log` = 0, `notification_delivery_log` = 0, `newsletter_subscribers` = 0. Zugang trägt, Spuren leer: **damit** ist `EXTERNAL_BLOCKED` die richtige Beschreibung und nicht bloß die naheliegende. Die Software ist vollständig; es fehlt eine Einstellung außerhalb des Repos. → **Yusuf**, Vercel: `RECHNUNGSVERSAND_AUTOMATISCH`, `MAHNVERSAND_AUTOMATISCH`, `CRON_SECRET`. |
| 10 | **API-Sicherheit (RLS, Policies)** | `E2E_PROVEN` | 5 | 310/310 Tabellen mit RLS; anon-Schreibrechte = 0; `verify:perimeter` 8/8. **Migration `20261017000002` ist live — sie war nie offen.** Der Fehler lag in der Prüfung: `TRIGGER_AUSWAHL` in `verify-abrechnung-live.mjs` bildete die Auswahl *vor* der Migration nach und stellte eine Frage, die der Trigger nicht mehr stellt. Live liefert er `hauswirtschaft → 2500`, `betreuung_45a → 3000`. Nachgezogen, dazu neue Prüfung **E2**, die den Trigger-Quelltext selbst liest. **Offen:** R1 (Wegepauschale, rechtliche Frage — als stehender Bericht verdrahtet), R2 (fünf Geldtabellen hängen nur an einem Funktionsrecht; Migration `20260828200000` geschrieben, **nicht angewendet**). |

**Alltagsengel: 46 von 60 Punkten = 77 %** (vorher 44 / 73 %)

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
| **Alltagsengel** | 10 | 46 | 60 | **77 %** ⬆ von 73 % |
| **ChairMatch** | 9 | 35 | 54 | **65 %** |
| **efy care** | 9 | 34 | 54 | **63 %** |
| **Gesamt** | 28 | **115** | **168** | **68 %** |

### Verteilung der Stufen

| Stufe | Alltagsengel | ChairMatch | efy care | Summe |
|---|---|---|---|---|
| `NOT_STARTED` | 0 | 0 | 0 | **0** |
| `IMPLEMENTED` | 0 | 0 | 0 | **0** |
| `TESTED` | 0 | 0 | 0 | **0** |
| `DEPLOYED` | 1 | 2 | 2 | **5** |
| `PROVEN_LIVE` | 2 | 6 | 7 | **15** |
| `E2E_PROVEN` | 7 | 1 | 0 | **8** |
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

### Die Positionen, die am meisten Prozent bewegen würden

| # | Position | Wirkung | Wer kann das? |
|---|---|---|---|
| 1 | `RECHNUNGSVERSAND_AUTOMATISCH` + `MAHNVERSAND_AUTOMATISCH` + `CRON_SECRET` in Vercel setzen | AE E-Mail-System 3 → 5, Abrechnung Richtung DONE. **Der Blocker ist jetzt gemessen** (`npm run verify:versand`): Zugang trägt, Domain verifiziert, Spuren leer. | **Yusuf** (Vercel-Dashboard) |
| 2 | Testkonto in die GitHub-Secrets: `PLAYWRIGHT_TEST_EMAIL` / `PLAYWRIGHT_TEST_PASSWORD` | AE Auth/Login 4 → 5. Die drei Tests stehen fertig in `auth-delete.spec.ts` und überspringen sich selbst, solange die Variablen fehlen. **Ein Testprojekt nehmen, nicht die Produktion** — der Delete-Flow ist destruktiv. | **Yusuf** (GitHub-Secrets) |
| 3 | ChairMatch: sechs Stripe-Variablen in Vercel setzen | CM Zahlungsabwicklung 3 → 4/5 | **Yusuf** (Vercel-Dashboard) |
| 4 | efy: `STRIPE_SECRET_KEY` als Supabase-Function-Secret setzen | behebt `stripe-webhook` `WORKER_ERROR` | **Yusuf** (Supabase-Dashboard) |
| 5 | Wartende Migrationen anwenden: AE `20260828200000` (anon-Riegel als Policy) und `20260828210000` (Kundennummer pro Mandant), CM `20260828170738`, efy `20260828234500` | öffnet DONE für mehrere Module. **AE `20261017000002` steht hier nicht mehr — sie ist live**, siehe Korrektur in Abschnitt 2. | **Yusuf** (SQL-Editor — DDL über den Dienstschlüssel wird mit 42501 abgewiesen) |
| 6 | ChairMatch-Dienstschlüssel erneuern | macht CM überhaupt erst messbar; ohne ihn bleibt jede CM-Zeilenzahl in dieser Matrix eine Lücke | **Yusuf** (Supabase-Dashboard) |

### Was am 29.08.2026 dazukam — und was es über die Matrix selbst sagt

Sieben Lücken sind abgearbeitet. Drei Beobachtungen, die über die einzelnen
Zeilen hinausgehen:

1. **Zwei „offene" Punkte waren Messfehler.** Migration `20261017000002` war
   angewendet, `20260907010000` ebenfalls — gemeldet wurden sie als offen,
   weil die jeweilige Prüfung eine veraltete Frage stellte. Eine Prüfung, die
   sich vom geprüften Gegenstand wegbewegt, meldet nicht „unsicher", sondern
   **falsch** — hier zu streng, anderswo wäre es zu milde. Deshalb steht neben
   der nachgezogenen Prüfung E1 jetzt E2, das den Trigger-Quelltext selbst
   liest.

2. **Der auffälligste Live-Befund war keiner.** `is_locked` = false auf allen
   30 Nachweisen las sich wie ein kaputter Manipulationsschutz. Er ist intakt;
   die Kette davor wurde nie betreten. Der Unterschied ist praktisch: an einem
   kaputten Trigger repariert man Code, an einer nie betretenen Kette nicht.

3. **Jeder neue Prüflauf hat einen echten Defekt gefunden.** Sonntag ließ sich
   nicht als Verfügbarkeit hinterlegen; die Kundennummer war global statt pro
   Mandant eindeutig; drei E2E-Specs waren gegen die Anwendung veraltet, weil
   sie in CI nie liefen. Keiner davon wäre durch mehr Live-Sonden aufgefallen —
   sie brauchten einen Lauf **durch** den Code, nicht einen Blick **auf** ihn.

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

---

## 8. Abschluss-Fortschreibung 29.08.2026

> Diese Fortschreibung schließt den Zeitraum ab, in dem **alle intern lösbaren**
> Arbeitspakete abgearbeitet wurden. Der zusammenfassende Bericht über alle fünf
> Produkte ist `docs/reports/MASTER_FINAL_COMPLETION_REPORT.md`.

### 8.1 Warum sich kein Punktstand bewegt hat

**Die Punktstände der Abschnitte 3 bis 6 bleiben unverändert: Alltagsengel
46/60 (77 %), ChairMatch 35/54 (65 %), efy care 34/54 (63 %), Gesamt 115/168
(68 %).** Das ist kein Versäumnis der Fortschreibung, sondern die Folge des
Bewertungsmodells aus Abschnitt 1:

* Stufe 4 (`PROVEN_LIVE`) und höher wird **nur gegen Produktion** vergeben.
* Seit der letzten Bewertung ist **keine** Migration angewendet worden — DDL
  über den Dienstschlüssel läuft mit `42501` auf.
* Kein Modul hat einen Live-Nachweis dazugewonnen, den es vorher nicht hatte.

Bewegt hat sich die **Belastbarkeit**, nicht die Stufe: neue Ketten gegen echtes
PostgreSQL, zwei gefundene und behobene Fehler, ein neu benannter P0. Das
unverändert zu berichten ist ehrlicher als eine gerundete Verbesserung.

### 8.2 Testzahlen — jetzt selbst nachgelaufen statt übernommen

Abschnitt 7 hielt fest, die Testzahlen seien „übernommen, nicht nachgelaufen".
**Diese Lücke ist geschlossen.** Alle drei Suiten liefen am 29.08.2026 auf
dieser Maschine, `tsc` und `vitest` bewusst nacheinander:

| Repo | vitest | node:test | Typecheck |
|---|---|---|---|
| Alltagsengel | **8.431 grün / 0 rot** (371 Dateien) | **2.515 grün / 0 rot** | **0 Fehler** |
| ChairMatch | **1.614 grün / 1 rot** (81 Dateien) | — | **0 Fehler** |
| efy care | **1.919 grün / 0 rot** (65 Dateien) | — | **0 Fehler** |

### 8.3 Neuer Befund bei ChairMatch (Modul 3, Buchung/Miete)

`src/app/api/rental-bookings/__tests__/cancel.e2e.test.ts` → „storniert am Tag
vor dem Mietbeginn noch" erwartet 200 und bekommt **409**.

**Ursache, nicht Vermutung:** der Test bildet „morgen" über
`Date.getUTCDate() + 1` (**UTC**), die Route entscheidet über `berlinToday()`
(**Europe/Berlin**, `cancel/route.ts:117`). Zwischen 22:00 UTC und Mitternacht
UTC — im Sommer 00:00–02:00 Ortszeit — ist „UTC-morgen" bereits „Berlin-heute",
der Riegel „Mietzeitraum hat bereits begonnen" greift, und der Fall wird rot.
Der Lauf für diesen Bericht fiel um 01:31 Ortszeit genau in dieses Fenster.

**Es ist ein Testfehler, kein Produktfehler.** Die Route verhält sich richtig;
der Test stellt seine Frage in der falschen Zeitzone. Die Stufe von Modul 3
bleibt deshalb `PROVEN_LIVE` (4). Der Fall ist deshalb bemerkenswert, weil er in
**den meisten Läufen unsichtbar** ist — 22 von 24 Stunden am Tag ist er grün.

### 8.4 Sieben wartende Migrationen — live geprüft, nicht aus Dateien geschlossen

Jede Zeile ist gegen `pg_*` bzw. `information_schema` auf Produktion geprüft:

| Migration | Live-Beleg, dass sie **fehlt** |
|---|---|
| `20260829011500` (**P0**) | `prevent_locked_record_change` kennt den Wert `invoiced` nicht |
| `20260828200000` | keine der fünf Zieltabellen trägt eine anon-Deny-Policy |
| `20260828210000` | live steht weiterhin `clients_customer_number_key` (global) |
| `20260829005500` | Spalte `personal_arbeitszeiten.geaendert_von` existiert nicht |
| `20260829005600` | `to_regclass('public.qm_pflegevisiten')` = NULL |
| `20260829005700` | `to_regclass('public.dienstplan_freigaben')` = NULL |
| `20260829010000` | `fhir_isip_audit_log` existiert nicht |

Damit ist die in Abschnitt 7 genannte Position 5 („Wartende Migrationen
anwenden") **präzisiert und live belegt** statt aus dem Ledger übernommen.

### 8.5 Der P0, den dieser Zeitraum gefunden hat

**Ein ordnungsgemäß unterschriebener Leistungsnachweis kann live nie abgerechnet
werden.** `compute_signature_hash` setzt bei der Unterschrift `is_locked = true`;
`prevent_locked_record_change` weist auf einer gesperrten Zeile jede Änderung ab;
`create_invoice_draft_atomic` setzt nach dem Anlegen der Rechnung
`service_records.status = 'invoiced'`. Der Trigger wirft, die RPC ist atomar,
also rollt die **gesamte** Rechnungserstellung zurück.

Das trifft Modul 6 (Leistungsnachweis) und Modul 5 (Abrechnungssystem) direkt.
Beide bleiben bei `E2E_PROVEN` (5) — der Befund senkt die Stufe nicht, weil die
Kette im Prüfstand gegen echtes Postgres durchläuft; er ist aber der Grund,
warum keines der beiden `DONE` erreichen kann, und er hätte den Vorschlag
„einen echten Kunden komplett durchlaufen lassen" genau zwischen Unterschrift
und erster Rechnung scheitern lassen — ohne eine Meldung, aus der hervorginge
warum.

### 8.6 Was die Positionsliste aus Abschnitt 7 unverändert lässt

Alle sechs dort genannten Positionen stehen weiterhin offen und sind sämtlich
**außerhalb des Codes** zu lösen (Vercel-Variablen, GitHub-Secrets,
Supabase-SQL-Editor, Schlüsselrotation). Neu hinzugekommen ist als **dringlichste**
Position das Einspielen von `20260829011500` — sie ist die einzige der sieben
wartenden Migrationen, die einen Weg öffnet, der heute geschlossen ist.
