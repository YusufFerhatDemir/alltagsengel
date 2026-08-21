# ChairMatch — Delta-Analyse

**Stand:** 21.08.2026 · **Repo:** `/Users/work/chairmatch` · **Referenz-Commit:** `c0e6af6`
**Typ:** Delta-Check (kein Voll-Audit). Bereits abgenommene Bereiche — Security-P0s, E2E-Testbasis, i18n de/en, WCAG-Grundlagen — wurden bewusst nicht erneut geprüft.

---

## VERIFIZIERT SEIT LETZTEM STAND

| Prüfung | Ergebnis |
|---|---|
| `git log` / Delta zu `c0e6af6` | HEAD **ist** `c0e6af6` — 0 neue Commits |
| Remote-Sync | `origin/main` = `HEAD`, 0 ahead / 0 behind |
| Arbeitsverzeichnis | sauber bis auf `STATUS.md` (Generat, 5 Zeilen Drift) |
| `npx vitest run` | **231/231 grün**, 9 Testdateien, 27 s, Exit 0 |
| `npx tsc --noEmit` | **0 Fehler**, Exit 0 |
| Production `https://www.chairmatch.de/` | HTTP 200 |
| `/api/public-stats` (live) | 50 User · 16 Salons · **1 Buchung** · 48 Bewertungen · 7 Städte |
| `/api/admin/health` | HTTP 401 (Rollenschutz greift) |

---

## NEUE COMMITS

**Keine.** Der letzte Commit ist unverändert `c0e6af6 „E2E-Tests für Booking-, Payment- und Auth-Flow (+3 Produktionsfixes)"`. Es gibt keinen unverifizierten Code seit der letzten Abnahme; das Delta liegt vollständig in der *Funktionsabdeckung*, nicht im Code-Zuwachs.

Einzige lokale Änderung: `STATUS.md` zeigt noch `fac3eb9` (Generat wurde nach dem letzten Deploy nicht neu geschrieben) — kosmetisch, kein Funktionsrisiko.

---

## TESTSTAND

**231 von 231 Tests grün** (die genannten „174" sind zwischenzeitlich gewachsen; `it.each`-Expansionen erklären die Differenz zu 193 rohen `it()`-Blöcken).

| Datei | `it()`-Blöcke |
|---|---|
| `src/__tests__/e2e/booking-flow.test.ts` | 45 |
| `src/__tests__/e2e/payment-flow.test.ts` | 32 |
| `src/__tests__/e2e/auth-flow.test.ts` | 25 |
| `src/__tests__/e2e/permissions.test.ts` | 19 |
| `src/__tests__/e2e/error-cases.test.ts` | 15 |
| `src/lib/__tests__/utils.test.ts` | 39 |
| `src/lib/matching/match-engine.test.ts` | 8 |
| `src/components/ui/__tests__/Button|Input.test.tsx` | 10 |

**Keine fehlgeschlagenen Tests, keine Skips, kein Flake.**

### Was diese Suite strukturell NICHT sehen kann

Die E2E-Tests laufen gegen `src/__tests__/e2e/_harness/fake-supabase.ts` und rufen **API-Routen direkt** auf. Sie beweisen, dass die Routen korrekt sind — sie beweisen **nicht**, dass die UI diese Routen aufruft. Genau in dieser Lücke liegen alle unten gelisteten Befunde: getestete, funktionierende Backends ohne Frontend-Anbindung.

Nebenbefund: `vitest run --reporter=basic` bricht mit „Failed to load custom Reporter" ab (Reporter in Vitest 4 entfernt) — nur den Default-Reporter benutzen.

---

## OFFENE FUNKTIONALE LÜCKEN

### 1. Anbieter-/Vermieter-/Mieter-Selbstverwaltung speichert in `localStorage` statt in der DB — P0

`src/components/MeinBereichSubPage.tsx:33-63` sammelt alle `[data-storage]`-Felder und schreibt sie nach `localStorage.setItem(storageKey, …)`. Danach erscheint der grüne Toast **„✓ Gespeichert"** und es wird zur Elternseite zurücknavigiert. Es gibt einen `onSave`-Prop für echte Persistenz — **keine einzige** der 22 nutzenden Seiten übergibt ihn.

Betroffen (9 Seiten mit aktivem Speichern-Button, 0 DB-Zugriffe):

| Seite | `storageKey` | Inhalt |
|---|---|---|
| `vermieter/mein-inserat/preise` | `cm_vermieter_preise` | Stunden-/Tages-/Wochen-/Monatspreis |
| `vermieter/mein-inserat/verfuegbarkeit` | `cm_vermieter_verfuegbarkeit` | Verfügbarkeiten |
| `vermieter/mein-inserat/ausstattung` | `cm_vermieter_ausstattung` | Ausstattungsmerkmale |
| `vermieter/mein-inserat/auszahlung` | `cm_vermieter_auszahlung` | **Auszahlungsdaten** |
| `anbieter/mein-salon/zeiten` | `cm_anbieter_zeiten` | Öffnungszeiten |
| `anbieter/mein-salon/beschreibung` | `cm_anbieter_beschreibung` | Salonbeschreibung |
| `anbieter/mein-salon/auszahlung` | `cm_anbieter_auszahlung` | **Auszahlungsdaten** |
| `mieter/mein-bereich/profil` | `cm_mieter_profil` | Profildaten |
| `mieter/mein-bereich/radius` | `cm_mieter_radius` | Suchradius |

Konsequenz: Ein Anbieter pflegt Preise und Öffnungszeiten, sieht „Gespeichert", und nichts davon ist auf einem zweiten Gerät, für Kunden oder für das Matching sichtbar. Bei den beiden Auszahlungsseiten kommen Bankdaten unverschlüsselt in den Browser-Speicher und erreichen niemanden.

Die echte API existiert bereits: `PATCH /api/provider/salon` — sie wird ausschließlich von `ProviderDashboardClient.tsx:59` (Route `/provider/dashboard`) benutzt.

### 2. Bild-Uploads verlassen den Browser nicht — P0

`src/components/UploadField.tsx` liest Dateien per `FileReader` in eine Data-URL und legt sie in `localStorage` ab (Zeilen 52, 162, 269). Betroffen: Salon-**Logo**, **Galerie**, **Zertifikate**, Inserat-**Fotos**.

Eine funktionierende Upload-Pipeline ist vorhanden (`POST /api/upload`, `DELETE /api/upload/[id]`, Storage-Anbindung) — Aufrufer sind nur `ImageUpload.tsx` und `ProviderDashboardClient.tsx`, also erneut ausschließlich der `/provider`-Zweig. Zusätzliches Risiko: Base64-Bilder im `localStorage` sprengen bei mehreren Fotos das ~5-MB-Quota; der `catch {}` in Zeile 52 schluckt den Fehler stillschweigend.

### 3. Mietanfrage wird nie zugestellt — P0

`src/app/(public)/inserat/[id]/anfragen/page.tsx:38-49` schreibt die Anfrage nach `localStorage['cm_mietanfragen']` (gekappt auf 30 Einträge). Kein `fetch`, keine E-Mail, kein Datensatz. Der Vermieter erfährt von der Anfrage nichts. `/vermieter/mein-inserat/anfragen` liest ebenfalls nur lokal.

### 4. Die komplette Stuhl-Miete ist vom Frontend abgeklemmt — P0

`POST /api/rental-bookings` ist die am sorgfältigsten gebaute Route des Repos: Zod-Validierung, Overlap-Prüfung plus DB-Exclusion-Constraint (`23P01`), Preisberechnung Tag/Monat, Selbstbuchungs-Sperre, Stripe-Checkout-Erzeugung und Rollback der Buchung bei Stripe-Fehler (kein Zombie-Pending). 32 Payment-Tests decken sie ab.

**Sie hat null Aufrufer.** `grep` über `src/**` außerhalb von `src/app/api` und den Tests findet keine einzige Fundstelle.

Stattdessen verlinkt `/rentals` (Zeile 202) auf `/booking/{salonId}?rental={id}` — den **Termin**-Buchungsflow. Dessen Seite (`src/app/(protected)/booking/[salonId]/page.tsx`) kennt den Parameter `rental` überhaupt nicht (0 Treffer) und sendet einen Body mit `serviceId`/`date`/`startTime` an `/api/bookings`. Wer einen Stuhl mieten will, landet also in der Terminbuchung; `rental_bookings`, der Payout-Cron und die Miet-Bewertungen (`/api/reviews/rental`) laufen ins Leere.

### 5. Stuhl-/Mietobjekt-Verwaltung hat kein CRUD — P0

`rental_equipment` wird an 13 Stellen **gelesen** (Startseite, `/rentals`, `/karte`, `/preisvergleich`, `/match`, Salon-Detail, Availability, Webhook …). Es gibt **keinen einzigen** `insert`/`update`/`delete` im gesamten `src/`-Baum außer der Typdefinition in `database.types.ts:292`. Ein Vermieter kann seinen Stuhl also weder anlegen noch bearbeiten noch deaktivieren — jedes Mietobjekt muss von Hand in Supabase eingetragen werden. Das erklärt die 16 Salons bei nur 1 Buchung live.

### 6. In-App-Notifications haben keinen Erzeuger — P1

`src/lib/notifications.ts` exportiert `createNotification()` und `createBulkNotifications()`. **Kein Aufrufer im gesamten Repo.** `/api/notifications` bietet nur `GET` (Liste) und `PUT` (als gelesen markieren). Die Glocke bleibt für jeden Nutzer dauerhaft leer.

### 7. Zahlungseingang löst keine Benachrichtigung aus — P1

`src/app/api/stripe/webhook/route.ts` (419 Z., 8 Event-Typen) aktualisiert Buchung, schreibt `payments`, legt `audit_logs` an und triggert die Provision — aber ruft **weder E-Mail noch Notification noch Push** auf (0 Treffer für `sendBooking|sendProvider|Email|notification`). Nach erfolgreicher Zahlung erfährt weder Mieter noch Vermieter etwas.

Zum Vergleich: Der Termin-Flow ist hier korrekt — `booking.actions.ts:178` verschickt `sendBookingConfirmation` + `sendProviderNotification`.

### 8. Keine Terminerinnerung — P2

`sendBookingReminder()` existiert in `lib/email.ts:188`, wird aber nur über die manuelle Route `/api/email` erreicht. `vercel.json` definiert drei Crons (`hard-delete`, `publish-reviews`, `rental-payouts`) — keinen Reminder-Cron.

### 9. Stripe-Konfiguration in Vercel weiterhin ungeklärt — P0 (extern)

`docs/VERCEL_ENV_VARS.md` (Stand 09.07.2026) meldet **alle 6 Stripe-Variablen** als fehlend; der letzte lokale `vercel env pull` (`.env.prod`) enthält weder `STRIPE_*` noch `RESEND_API_KEY`, `CRON_SECRET`, `VAPID_*` oder `TWILIO_*`. Verifizieren ließ sich das in dieser Session nicht: `/api/admin/health` verlangt `super_admin` (401), und die Introspektion der Produktions-DB mit dem Service-Role-Key wurde vom Sandbox-Classifier blockiert.

Solange die Keys fehlen, sind Checkout, Webhook, Connect-Onboarding, Refunds und der Payout-Cron produktiv tot — unabhängig von der Code-Qualität.

### Was funktional intakt ist

- **Termin-Buchung**: `/booking/[salonId]` → `POST /api/bookings` → `createBooking` (Bestätigungs-E-Mail an Kunde + Anbieter) → `/booking/success` → optionaler Stripe-Checkout. Storno über `POST /api/bookings/[id]/cancel`, Statuswechsel `confirmed`/`completed`/`no_show` vorhanden.
- **Stripe-Backend**: 8 Event-Typen inkl. `charge.refunded`, `account.updated`, SEPA-Async-Pfad; Admin-Refund-Route (138 Z.); Connect-Onboarding (113 Z.).
- **Bewertungen**: Erstellung, beidseitig, Antwort (`/reviews/[id]/reply`), DSA-Meldung (`/reviews/[id]/report`), Aggregat, Publish-Cron.
- **Admin/Reporting**: MIS-Dashboard (503 Z.), KPI-Cockpit (177 Z.), Health, Audit-Logs, Newsletter-Kampagnen, Analytics-Events + Meta-CAPI + Web-Vitals. Alles DB-gestützt, keine Attrappen.
- **Provider-Zweig `/provider/dashboard`**: der einzige Bereich, in dem Salon-Bearbeitung und Bild-Upload wirklich persistieren.

---

## EMPFOHLENE NÄCHSTE SCHRITTE

Priorisiert nach „blockiert Umsatz" — nicht nach Aufwand.

1. **Stripe-Keys in Vercel setzen** (extern, nur Yusuf). Ohne sie ist jede Payment-Arbeit unverifizierbar. Ebenso `CRON_SECRET` und `RESEND_API_KEY` — sonst laufen die drei Crons ins 401 und Bestätigungsmails ins Leere. Danach `/api/admin/health` als Super-Admin aufrufen und den Ist-Stand festhalten.
2. **Miet-Flow verdrahten** (Befunde 4 + 5): `/rentals` und `/inserat/[id]` auf `POST /api/rental-bookings` umhängen statt auf den Termin-Flow; dazu CRUD für `rental_equipment` (Route + Formular) nachziehen. Das Backend ist fertig und getestet — es fehlt die Anbindung. Grösster Hebel: ohne diesen Schritt kann das Kerngeschäft nicht stattfinden.
3. **`MeinBereichSubPage` auf `onSave` umstellen** (Befund 1): pro Seite eine `PATCH`-Route, `localStorage` nur noch als Entwurfs-Cache. Zuerst die beiden Auszahlungsseiten — Bankdaten gehören nicht in den Browser-Speicher.
4. **`UploadField` auf `POST /api/upload` umstellen** (Befund 2) und den stillen `catch {}` beim Quota-Überlauf durch eine sichtbare Fehlermeldung ersetzen.
5. **Mietanfrage-Route bauen** (Befund 3): Persistenz + E-Mail an den Vermieter; das lokale `cm_mietanfragen` entfällt.
6. **`createNotification()` im Webhook und in `booking.actions` aufrufen** (Befunde 6 + 7), plus Reminder-Cron in `vercel.json` (Befund 8).
7. **Testlücke schliessen**: Die aktuelle Suite prüft Routen, nicht Aufrufer. Ein Test der Bauart „jede API-Route unter `src/app/api` hat mindestens einen Aufrufer in `src/**` ausserhalb von `api/` und Tests" hätte die Befunde 3–6 sofort gefunden — als Regressionssperre nachrüsten.
8. **`STATUS.md` regenerieren** (`scripts/status.sh`), damit die Wahrheits-Quelle wieder auf `c0e6af6` zeigt.

---

## Methodik & Grenzen

Geprüft wurde per Code-Analyse (Route-Inventar 87 API-Routen / 132 Seiten, Aufrufer-Graph via `grep`), lokalem Testlauf, Typecheck und drei unauthentifizierten Production-Requests. **Nicht** geprüft: Laufzeitverhalten gegen die Produktions-DB (Service-Role-Zugriff vom Classifier blockiert), Vercel-Env-Ist-Stand (kein Dashboard-Zugang), Browser-Durchlauf der beschriebenen Flows. Die Befunde 1–8 sind Code-Fakten mit Datei- und Zeilenbelegen; Befund 9 ist ein dokumentierter, aber in dieser Session nicht gegengeprüfter Zustand.
