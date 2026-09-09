# Alltagsengel — Statusrekonstruktion 09.09.2026

**Auditlauf:** 09.09.2026, 13:00–13:15 Uhr (lokal)
**Repository:** `/Users/work/alltagsengel`, Branch `main`
**Geprüfter Stand:** `392bbe42919ed84c7c805b48d6b3a0d8b2b8c8f1`
**Beweispflicht:** Jede Aussage in diesem Bericht ist an einen Befehl, eine Datei oder eine
Produktionsantwort gebunden. Wo kein Beleg vorliegt, steht ⚫ NICHT VERIFIZIERT — nicht 🟢.

> **Nachtrag zum Auditfenster:** Während dieses Laufs hat eine parallele Sitzung um ca. 13:10 Uhr
> `abb93cfb` („Marketing-Restart: 14-Tage-Contentplan + Report erstellt") auf `main` committet
> und dabei die zuvor unversionierte `MASTER_BEWEISBERICHT_P9_12_COMPLETE.pdf` mitgenommen.
> **Alle Befunde dieses Berichts beziehen sich auf `392bbe42`** — den Stand, der zum Zeitpunkt
> jedes einzelnen Prüflaufs sowohl lokal als auch remote als auch in Produktion lief.

**Legende:** 🟢 VERIFIZIERT · 🟡 TEILWEISE · 🔴 BLOCKIERT · ⚫ NICHT VERIFIZIERT

---

## 0. Kurzfassung

| Bereich | Status |
|---|---|
| Git: lokal = Remote = Produktion | 🟢 VERIFIZIERT |
| CI (GitHub Actions) | 🟢 VERIFIZIERT |
| Typecheck | 🟢 VERIFIZIERT |
| Testsuiten (12.780 Tests) | 🟢 VERIFIZIERT |
| Production-Build | 🟢 VERIFIZIERT |
| Deploy-Pipeline (`deploy.sh`, Vercel) | 🟢 VERIFIZIERT |
| Migrationsstand live | 🟡 TEILWEISE (5 von 37 stehen nicht live) |
| Automatischer Rechnungs-/Mahnversand | 🔴 BLOCKIERT (3 ENV-Schalter fehlen) |
| `docs/genehmigung/` | ⚫ EXISTIERT NICHT |
| Bewerber-Verwaltung `/admin/applications` | 🔴 BLOCKIERT (liest tote Tabelle) |
| Google-Ads-Tracking | 🟡 Code ist AKTIV, nicht inaktiv — siehe §4.14 |

---

## 1. Git-Status

### 1.1 Letzte 30 Commits (`git log --oneline -30`)

```
392bbe42 Fix: Engel-Validierung + Fahrer-Enumeration-Schutz (AUTH-005)
331998a2 docs: MASTER_BEWEISBERICHT_P9_11_FINAL — Auth-Blocker Analyse + Produktionsnachweis
02d71c60 docs: MASTER_BEWEISBERICHT_P9_RECONCILED_FINAL — Widersprueche korrigiert
a6c62dc1 docs: MASTER_BEWEISBERICHT_P9_FINAL
480ade99 fix(test): JUENGSTE_MIGRATIONEN auf aktuelle 5 Migrationsdateien nachgezogen
78a0bc64 fix(lint): termin-erinnerung profileFehler destrukturiert
e7fd42e9 P9.1 Abschlussbericht Auto-Kommunikation 16/16
c8f89dea fix(sql): min(uuid) durch separate SELECT ersetzt — safe_link_clients_user_id
6eb35e46 P5 Auto-Kommunikation 16/16: Freigabe-E-Mail, Welcome-Idempotenz, Termin-Erinnerung
a235248f docs: P9.4 Abschlussbericht P3 Security Audit 34/34
974ac74c fix(security): storage_mimetype_ok fail-closed bei leerem MIME-Type (P3-33)
a82e0379 MASTER-BEWEISBERICHT P0-P8 FINAL: P8 26/26 bestanden
745ed4cb MASTER-BEWEISBERICHT P0-P8 (53KB, DejaVuSans)
719f2e9f Beweisbericht v2: efy 14 Funktionen, PITR/MFA, Production Proof, Host Health
6be3b072 Beweisbericht 05.09.2026: Host Health, efy REVOKE 42 Trigger, CM Rate Limiting
fd45f1d9 P11.7: Korrigiertes Final-PDF + Verifikation
00e7811a P11.6+P11.7: E2E-Produktionstest + MASTER FINAL PRODUCTION REPORT
c456e2fb P11.2-P11.5: Datenqualität, Abrechnung, Auth+Rollen, Bugs+Performance Reports
f2b0e69e P11.1: Security Hardening Deep Audit Report
c24d4845 Security Hardening Report: DEFINER Audit + API-Key-Check + Headers
866c3c9a P10.6+P10.7: Produktionsreife-Bewertung + Abschlussbericht
587695c2 P10.5: E2E Re-Test Report erstellt — AE 11/12, efy 7/8, CM 10/10
1b756138 fix: CI-Fehler behoben — Diagnose-Spec beantwortet den Cookie-Banner vorweg
4ab42212 fix: CI-Fehler behoben — E2E-Spec auf die neuen Consent-Kategorien nachgezogen
ca53c994 fix: CI-Fehler behoben
6aba1b62 P10.3: Supabase Security Audit Report hinzugefügt
738f0cf4 fix: Resend-Webhook Fehlerbehandlung verbessert
c9b59610 feat: DSGVO Cookie-Consent-Banner implementiert
b7b295e9 P8+P9: Abschlussbericht PDF erstellt — Beweise gesammelt, deploy.sh mktemp fix
926486ce test(lib): Tests fuer ENV-Startpruefung und KIM-Provider-Konfiguration
```

**Beobachtung:** Der letzte Code-Commit (kein Doku-Commit) ist `392bbe42` vom 05.09.2026.
Seit vier Tagen gab es keine Code-Änderung.

### 1.2 Uncommitted Changes (`git status --porcelain`)

```
?? docs/reports/MASTER_BEWEISBERICHT_P9_12_COMPLETE.pdf
```

Genau **eine** unversionierte Datei, keine geänderten Tracked Files. Arbeitsbaum sauber.
🟢 VERIFIZIERT

### 1.3 Branches (`git branch -a`)

- **Lokal:** 38 Branches (1× `main`, 9× `claude/*`, 4× `worktree-agent-*`, Rest Feature/Fix/Cleanup)
- **Remote:** 33 Branches unter `origin/`
- **Aktiv:** `main`

🟡 TEILWEISE — funktional in Ordnung, aber 37 verwaiste Branches sind Altlast. Kein Blocker.

### 1.4 Lokal vs. Remote

```
$ git rev-parse HEAD origin/main
392bbe42919ed84c7c805b48d6b3a0d8b2b8c8f1
392bbe42919ed84c7c805b48d6b3a0d8b2b8c8f1

$ git diff --stat origin/main..HEAD
(leer)
```

**Lokal = Remote, Byte für Byte.** 🟢 VERIFIZIERT

### 1.5 Remote = Produktion

```
$ curl -s https://alltagsengel.care/api/health
{"status":"degraded","version":"392bbe4", ...}
```

Die laufende Produktion meldet **`392bbe4`** — dieselbe Revision.
Damit gilt die volle Kette: **Arbeitsbaum = `origin/main` = Produktion.** 🟢 VERIFIZIERT

---

## 2. CI/CD

### 2.1 GitHub Actions

**Letzter CI-Lauf auf `392bbe42` (Run `33984530072`, 05.09.2026, 10m17s):**

| Job | Ergebnis |
|---|---|
| Typecheck, Lint, Tests, Build | ✅ success |
| E2E — vollständige Playwright-Suite | ✅ success |

Log-Auszug aus diesem Lauf:
```
Test Files  458 passed (458)
     Tests  10077 passed (10077)
       154 passed (3.3m)          ← Playwright E2E
```

Die zwei `failure`-Läufe im Verlauf (`33950310116`, `33949779302`) liegen **vor** den
Fix-Commits `480ade99` / `78a0bc64` und sind nachgezogen.

**Scheduled Workflows, letzte 24 h — alle `success`:**
`Uptime Monitor` (34347894966, 11:53 Uhr), `Workflow-Engine` (34344224990, 11:11 Uhr),
`Zustellung Retry` (34337491163, 09:56 Uhr).

🟢 VERIFIZIERT

### 2.2 `npm run typecheck` — lokaler Lauf 09.09.2026

```
> NODE_OPTIONS='--max-old-space-size=4096' tsc --noEmit
TYPECHECK_EXIT=0
```
Null Fehler, null Ausgabe. 🟢 VERIFIZIERT

### 2.3 `npm test` (vitest) — lokaler Lauf 09.09.2026

```
Test Files  457 passed | 1 skipped (458)
     Tests  10040 passed | 38 skipped (10078)
  Duration  394.04s
VITEST_EXIT=0
```
🟢 VERIFIZIERT

> **Hinweis zur Methodik:** Ein erster Lauf mit `--reporter=basic` brach mit Exit 1 ab
> (`Failed to load custom Reporter from basic`). Ursache war der Reporter-Name, der in
> Vitest 3 entfernt wurde — **kein Projektfehler**. Der Wiederholungslauf mit dem
> Standard-Reporter ist oben protokolliert.

### 2.4 `npm run test:unit` (node:test, `lib/**/*.test.ts`)

```
ℹ tests 2740
ℹ suites 286
ℹ pass 2740
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 51999.32
UNIT_EXIT=0
```
🟢 VERIFIZIERT

**Testsumme gesamt: 10.040 + 2.740 = 12.780 bestandene Tests, 0 Fehlschläge.**
Dazu 154 Playwright-E2E-Tests im CI.

### 2.5 `npm run build` — lokaler Production-Build 09.09.2026

```
▲ Next.js 16.2.12 (Turbopack)
[lastmod] 102 Seiten → lib/generated/lastmod.json
✓ Compiled successfully in 4.7min
✓ Completed runAfterProductionCompile in 1376ms
  Finished TypeScript in 61s
✓ Generating static pages using 7 workers (620/620) in 1667ms
BUILD_EXIT=0
```

620 statische Seiten erzeugt. Einzige Warnungen sind Node-interne
`--localstorage-file`-Hinweise, keine Projektwarnungen.
🟢 VERIFIZIERT

---

## 3. Projekt-Struktur

### 3.1 Umfang (gezählt, nicht geschätzt)

| Bereich | Anzahl |
|---|---|
| `app/**/page.tsx` | 369 |
| davon `app/admin/**/page.tsx` | 159 |
| `app/api/**/route.ts` | 450 |
| `components/*.tsx` | 102 |
| `lib/**/*.ts` | 660 |
| `supabase/migrations/*.sql` | 471 |
| Vitest-Tests (`__tests__`) | 458 Dateien |
| node:test (`lib/**/*.test.ts`) | 145 Dateien |
| Playwright-Specs (`e2e/`) | 8 |

**Admin-Module (Auszug, 159 Seiten gesamt):** abrechnung, dienstplan, pflegedoku, kassenabrechnung,
mahnwesen, datev, dta, kim, dipa, pdl-cockpit, quality, monatsabschluss, sammelrechnung,
wunddokumentation, vitalwerte, sis, leistungsnachweis, gutschriften, forderungen, bonuses,
expansion, go-live, monitoring, ops-audit …

### 3.2 `docs/`

- `docs/` — 60+ Berichte und Konzepte auf oberster Ebene
- `docs/reports/` — **81 Einträge** (MD + PDF), neueste:
  `MASTER_BEWEISBERICHT_P9_12_COMPLETE.pdf` (unversioniert),
  `MASTER_BEWEISBERICHT_P9_11_FINAL.{md,pdf}`, `SECURITY_HARDENING_2026-09-05.md`,
  `E2E_RETEST_2026-09-04.md`, `SECURITY_AUDIT_2026-09-04.md`
- Unterordner: `docs/reports/P11/`

### 3.3 `docs/genehmigung/`

```
$ ls -la docs/genehmigung
ls: docs/genehmigung: No such file or directory
```

⚫ **EXISTIERT NICHT.** Auch kein gleichnamiger Ordner an anderer Stelle im Repo.
Falls die 45a-/Kassen-Genehmigungsunterlagen gemeint sind: die liegen unstrukturiert im
Repo-Wurzelverzeichnis (`45a-anerkennung/`, `anerkennung-hessen/`, `Bayern-45a-Antrag/`,
`NRW-45a-Antrag/`, `RLP-45a-Antrag/`, `Saarland-45a-Antrag/`, `§45a-*.pdf`).

### 3.4 Environment-Variablen

**`.env.local` (830 B, 7 Schlüssel — lokale Entwicklung):**
```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
RESEND_API_KEY, NEXT_PUBLIC_GA4_MEASUREMENT_ID,
NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
```

**`.env.example` (13.364 B, 37 dokumentierte Schlüssel):**
Supabase (URL, Anon, Publishable, Service-Role, Secret), Resend (+ Webhook-Secret),
Sentry (DSN, Org, Projekt, Auth-Token), Stripe (Secret, Publishable, Webhook, 3 Preise),
Firebase/FCM (5), Meta (Pixel + CAPI), TikTok (Pixel + CAPI), GA4, GTM, VAPID (3),
OpenAI, Gemini, Bing-Verifizierung.

Weitere Dateien vorhanden: `.env` (305 B), `.env.staging.local` (491 B).

**Fehlend gegenüber `.env.example` in dieser Umgebung** (bestätigt durch
`npm run verify:versand`): `CRON_SECRET`, `RECHNUNGSVERSAND_AUTOMATISCH`,
`MAHNVERSAND_AUTOMATISCH` — siehe §4.10.

🟡 TEILWEISE — lokal reicht der Satz für Entwicklung, für den Betrieb der Geldwege nicht.
Maßgeblich ist ohnehin die Vercel-Umgebung; die ist aus dieser Sitzung heraus nicht lesbar
(kein Vercel-Login) → für Vercel selbst: ⚫ NICHT VERIFIZIERT.

---

## 4. Features — geprüft an den Dateien, nicht geraten

Bewertungsraster je Feature: **(a)** Oberfläche vorhanden · **(b)** Backend verdrahtet ·
**(c)** live erreichbar · **(d)** Produktivdaten vorhanden. Der Prozentwert ist der Anteil
der erfüllten Kriterien — keine Schätzung.

### 4.1 Login / Auth — 🟢 VERIFIZIERT — 100 %

Dateien: `app/auth/login/{page.tsx,actions.ts}`, `app/auth/register/{page.tsx,actions.ts}`,
`app/auth/forgot-password/page.tsx`, `app/auth/reset-password/page.tsx`,
`app/auth/callback/route.ts`, `app/auth/error.tsx`.
Live: `GET https://alltagsengel.care/auth/login` → **200**.
Produktivdaten: `profiles` = **73 Zeilen**.
Letzter Fix: `392bbe42` (Engel-Validierung, Fahrer-Enumerationsschutz, AUTH-005).

### 4.2 Registrierung — 🟡 TEILWEISE — 75 %

| Weg | Pfad | Status |
|---|---|---|
| Kunde | `/auth/register?role=kunde` | 🟢 vorhanden |
| Engel | `app/engel/register/{page.tsx,actions.ts}` | 🟢 vorhanden |
| Fahrer | `app/fahrer/register` | 🟢 vorhanden |
| Angehörige | — | 🔴 kein Selbstregistrierungsweg |

`app/auth/register/page.tsx:20`: `const ALLOWED_SIGNUP_ROLES = ['kunde', 'engel', 'fahrer']`.

**Die im Auftrag genannten Pfade `app/kunden/register` und `app/angehoerige/register`
existieren nicht.** Kunden registrieren über `/auth/register?role=kunde` (verlinkt aus
`app/choose/page.tsx:25`). Angehörige haben **keinen** Selbstregistrierungsweg — der Bereich
`app/angehoerige/` (5 Seiten: Termine, Pflegebericht, Dokumente, Kommunikation) wird über
eine Freigabe im Code erschlossen, nicht über Selbstanmeldung. Das ist eine bewusste
Entscheidung, kein Defekt.

### 4.3 Admin-Dashboard — 🟢 VERIFIZIERT — 100 %

`app/admin/dashboard/page.tsx` (261 Zeilen) liest live aus `clients`, `caregivers`,
`absences`, `service_records`, `invoices`, `client_budgets`.
159 Admin-Seiten insgesamt. Produktivdaten in allen sechs Quelltabellen vorhanden (§4.16).

### 4.4 Buchung / Kalender — 🟢 VERIFIZIERT — 100 %

Oberflächen: `app/kunde/buchen/[id]/page.tsx`, `app/kunde/buchen-service/page.tsx`,
`app/kunde/buchungen`, `app/engel/buchungen`, Kalender für alle drei Rollen
(`app/{admin,engel,kunde}/kalender/page.tsx`).
API: `app/api/bookings/{cancel,notify,respond}/route.ts`.
Produktivdaten: `bookings` = **3 Zeilen**.

### 4.5 Leistungsnachweise — 🟢 VERIFIZIERT — 100 %

Oberflächen: `app/admin/leistungsnachweis/[verordnung_id]`, `-digital`, `-upload`,
`app/kunde/leistungsnachweis`, `app/admin/sgb-v/leistungsnachweise`.
API: `app/api/leistungsnachweis/{route.ts,crud/route.ts}`,
`app/api/billing/sgb-v/leistungsnachweise/route.ts`,
`app/api/native/leistungsnachweis-upload/route.ts`.
Produktivdaten: `service_records` = **30 Zeilen**.
**Kettenbeweis:** `npm run verify:geldweg` — 12/12 Stationen (§4.9).

### 4.6 Nachrichten — 🟢 VERIFIZIERT — 75 %

Oberflächen: Chat für Kunde/Engel/Fahrer (`app/{kunde,engel,fahrer}/chat/[id]`),
`app/admin/nachrichten/[id]`, Benachrichtigungen für Admin/Engel.
Backend: `lib/ops/nachrichten.ts`, `lib/ops/benachrichtigungen.ts`, `lib/kim/nachrichten.ts`,
6 Ops-Routen unter `app/api/ops/`.
Produktivdaten: `notifications` = **248 Zeilen**; `messages` und `chat_messages` = **0 Zeilen**
(Tabellen existieren, sind aber leer) → das vierte Kriterium ist nur teilweise erfüllt.

### 4.7 Billing / Rechnungen — 🟢 VERIFIZIERT — 100 %

`lib/billing/` mit 19 Untermodulen: `core`, `camt`, `datev`, `dunning`, `matching`, `opos`,
`preflight`, `sepa`, `versand`, `vpkzp`, `xrechnung`, `leistungsarten.ts`,
`obergrenzen.ts`, `nachweis-beleg.ts`, `status-vokabular.ts`, `tarif-verifizierung-service.ts`,
`verordnung-projektion.ts`.
API u. a. `app/api/billing/{invoices,auto-invoice,sammelrechnung,dunning}/…`,
`app/api/rechnungen/[id]/pdf/route.ts`.
Produktivdaten: `invoices` = **3 Zeilen**.

### 4.8 131 € Entlastungsbetrag (§45b SGB XI) — 🟢 VERIFIZIERT — 100 %

Führende Quelle: **`lib/config/budget-constants.ts`** — versioniert nach Gültigkeitszeitraum:

```
2024-01-01 … 2024-12-31 → 125 €/Monat, 1.500 €/Jahr, VP+KZP 3.386 €
2025-01-01 … offen      → 131 €/Monat, 1.572 €/Jahr, VP+KZP 3.539 €
```

`budgetVersionFuerJahr()` ist **fail-closed**: für ein Jahr ohne Eintrag wirft sie
`BudgetVersionFehltError`, es gibt bewusst keinen stillen Fallback.
19 Aufrufer, u. a. `lib/billing/core/budget-cap.ts`, `lib/billing/vpkzp/berechnung.ts`,
`lib/budget/auto-budget.ts`, `lib/personal/einsatzfreigabe.ts`,
`app/api/leistungsnachweis/crud/route.ts`.
Produktivdaten: `client_budgets` = **4 Zeilen**.

### 4.9 Geldweg-Kette (Produktionsnachweis) — 🟢 VERIFIZIERT

`npm run verify:geldweg`, Lauf 09.09.2026 gegen die Produktionsdatenbank
(endet mit `RAISE EXCEPTION`, nichts wird committet):

```
OK nachweis          angelegt 2026-09-15, 120 Min, Alltagsbegleitung, budget_type private
OK unterschrift      signature_hash 0b0ffeb92a3f… (64 hex), is_locked=true, status=signed
OK sperre            Betragsaenderung abgewiesen (Nachweis gesperrt)
OK rechnung          RE-2026-00004, 1 Position, 80.00 EUR
OK position          80.00 EUR = 4000 Cent/Std x 120 Min, Tarif 03f5e6fb, abweichung_cent=0
OK summe             Rechnungssumme deckt sich mit Positionssumme
OK abgerechnet       Nachweis invoiced, is_locked=true, signature_hash unveraendert
OK rueckweg          Ruecksetzen abgewiesen
OK ohne_unterschrift Rechnung verweigert (MISSING_SIGNATURE)
OK versand           entwurf→geprueft→freigegeben→uebermittelt, 1 Zeile invoice_email_log
OK festschreibung    Betragsaenderung an uebermittelter Rechnung abgewiesen
OK zahlung           uebermittelt→quittiert→bezahlt, paid_amount 80.00 EUR

12 von 12 Stationen bestanden.
```

### 4.10 Automatische E-Mails (Resend) — 🔴 BLOCKIERT — 50 %

`npm run verify:versand`, Lauf 09.09.2026:

```
1) ZUGANG — Resend
   Schluessel gueltig.
   alltagsengel.care: status=verified — DKIM/SPF stehen.  → OK

2) SCHALTER
   RECHNUNGSVERSAND_AUTOMATISCH   FEHLT
   MAHNVERSAND_AUTOMATISCH        FEHLT
   CRON_SECRET                    FEHLT   ← ohne ihn weist pruefeCronGeheimnis
                                            jeden der neun Cron-Laeufe ab

3) WIRKUNG — Zustellspuren in der Produktionsdatenbank
   invoice_email_log                   0
   notification_delivery_log           4
   newsletter_subscribers              0
```

**Befund:** Die Technik ist nachweislich funktionsfähig (gültiger Schlüssel, verifizierte
Domain, 4 echte Zustellungen). Der automatische Rechnungs- und Mahnversand läuft trotzdem
nicht, weil drei Schalter fehlen. **Das ist der schärfste operative Blocker im gesamten Audit.**

Gemessen wurde in dieser Umgebung; maßgeblich für den Betrieb ist die Vercel-Umgebung.
Ob die Schalter dort gesetzt sind: ⚫ NICHT VERIFIZIERT (kein Vercel-Zugang aus dieser Sitzung).

Code: `lib/notifications.ts` (einziger Ort mit `new Resend(`), `lib/notifications/retry-worker.ts`,
`lib/notifications/{delivery-log,zustellrueckmeldung}.ts`, `lib/onboarding/erinnerungen.ts`,
`app/api/marketing/resend-webhook/route.ts`.

### 4.11 Bewerber-Onboarding — 🔴 BLOCKIERT (Verwaltungsansicht) — 75 %

Erfassung funktioniert:
`components/EngelBewerbungForm.tsx:30` → `POST /api/lead-inquiry` → Tabelle `lead_inquiries`.
Zusätzlich der 12-Schritt-Assistent `app/onboarding/bewerber/page.tsx` über
`/api/onboarding/{fortschritt,dokumente,absenden}`; `absenden` schreibt ebenfalls nach
`lead_inquiries` (`app/api/onboarding/absenden/route.ts:130`).
Produktivdaten: **`lead_inquiries` = 47 Zeilen.**

**Der Bruch liegt in der Verwaltung:** `app/admin/applications/page.tsx:44` liest
`supabase.from('applications')`. Diese Tabelle hat live **0 Zeilen** und ist laut der eigenen
Migration `20261027000000_lead_inquiries_bewerbung.sql` bewusst tot:

> „Es gibt eine Tabelle `applications` … Sie ist im Code aber praktisch tot: genau zwei
> Dateien nennen sie … Die echten Bewerbungen laufen seit jeher ueber das Website-Formular
> nach `lead_inquiries`."

**Folge:** `/admin/applications` zeigt dauerhaft eine leere Liste, während 47 echte
Bewerbungen/Anfragen in `lead_inquiries` liegen. Sichtbar sind die nur unter `app/mis/crm/page.tsx`
— der einzigen Oberfläche, die `lead_inquiries` liest. Wer über das Admin-Menü nach
Bewerbungen sucht, findet nichts und schließt daraus, es gäbe keine.

**Empfehlung (nicht ausgeführt, außerhalb des Auditauftrags):** `/admin/applications`
entweder auf `lead_inquiries` umstellen oder entfernen und auf `/mis/crm` verweisen.

### 4.12 Kunden-Onboarding — 🟡 TEILWEISE — 75 %

`app/onboarding/{page,start,kunde,angehoerige,bewerber}/page.tsx` + `app/admin/onboarding`.
`lib/onboarding/` mit 11 Modulen (`assistent`, `schritte`, `wizard-logik`, `einreichung`,
`erinnerungen`, `finanzierung`, `triggers`, `uebersicht`, `service`, `notifications`, `anleitung`).
API: `/api/onboarding/{fortschritt,dokumente,absenden}`, `/api/admin/onboarding`,
`/api/cron/onboarding-erinnerung`.
Produktivdaten: der Fortschritt liegt in `profiles`/`lead_inquiries`, eigene
`onboarding_*`-Tabellen existieren nicht (per PostgREST geprüft: 404). Das ist konsistent
mit dem Code, aber die Erinnerungskette hängt am fehlenden `CRON_SECRET` (§4.10).

### 4.13 SEO / regionale Landingpages — 🟢 VERIFIZIERT — 100 %

Vier Städte-Strecken mit `generateStaticParams()`:

| Strecke | Städte |
|---|---|
| `app/alltagsbegleitung/[stadt]` | 22 |
| `app/krankenfahrten/[stadt]` | 22 |
| `app/hygienebox/[stadt]` | 22 |
| `app/engel-werden/[stadt]` | 12 |

Abgedeckt: frankfurt, offenbach, wiesbaden, darmstadt, hanau, bad-homburg, mainz,
aschaffenburg, frankfurt-hoechst, neu-isenburg, friedberg-wetterau, rodgau, giessen,
marburg, kassel, fulda, limburg, koeln, duesseldorf, essen, dortmund, bonn.

Weiter: `app/lp/[source]` (Kampagnen-Landingpages), **41 Blogbeiträge**
(`lib/blog-posts.ts`), `app/sitemap.ts` mit `force-static` + echten Git-Commit-Daten je
Seite (`scripts/generate-lastmod.mjs`, 102 Seiten), `app/robots.ts`.

Live: `/sitemap.xml` → **200** mit **138 `<loc>`-Einträgen**; `/robots.txt` → 200;
`/engel-werden/frankfurt` → 200; `/blog` → 200; `/alltagsbegleitung` → 200;
`/entlastungsbetrag` → 200; `/` → 200; `/choose` → 200.

### 4.14 Google-Ads-Tracking — 🟡 KORREKTUR ZUR AUFTRAGSANNAHME — 100 % verdrahtet

**Der Auftrag nimmt an, der Code sei „vorhanden aber NICHT aktiv". Das trifft für den Code
nicht zu.** Belege:

- `components/GoogleTagManager.tsx:9` — `GOOGLE_ADS_ID = 'AW-18061588897'`, `GTM_ID = 'GTM-NPNL3D3Q'`
- `app/layout.tsx:337` — `<GoogleTagManager />` ist im Root-Layout **eingehängt**
- `components/GoogleTagManager.tsx:64` — `gtag/js?id=AW-…` wird mit `strategy="afterInteractive"`
  **immer geladen** (laut Kommentar bewusst, damit Google den Tag im SSR-HTML verifizieren kann)
- `lib/tracking.ts:38–48` — zwei scharfe Conversion-Labels mit Beträgen:
  Registrierung `f8HXCJuQvJgcEKHzt6RD` (110 €), Buchung `QXYmCJ6QvJgcEKHzt6RD` (50 €)
- **10 aufrufende Stellen**: `app/{auth,engel,fahrer}/register`, `app/kunde/buchen/[id]`,
  `app/kunde/krankenfahrt`, `components/{TerminBuchung,LeadForm,CallbackWidget,EngelBewerbungForm,PflegeboxKonfigurator}`
- Serverseitiger Zweitweg `app/api/track-conversion/route.ts` (gegen ITP/AdBlocker),
  ratenbegrenzt über `rateLimitPersistent`
- **Produktivdaten: `conversions` = 52 Zeilen, `page_views` = 9.846 Zeilen** — es wird real gemessen

**Was den Versand tatsächlich begrenzt, ist die Einwilligung, nicht ein Aus-Schalter:**
`app/layout.tsx:327` setzt Consent Mode v2 auf `ad_storage/ad_user_data/ad_personalization/
analytics_storage = denied` als Default; erst `CookieConsent` hebt das je Kategorie an.
Auf `/pflegecoach` wird gtag/GTM gar nicht gerendert (DiPAV Anlage 2, Werbefreiheit).

**Ob das Google-Ads-Konto bzw. die Kampagnen extern aktiv sind: ⚫ NICHT VERIFIZIERT** —
das ist außerhalb des Repos und wurde auftragsgemäß **nicht** angefasst.
`GOOGLE_ADS_AUTOMATIC_ACTIVATION` = FORBIDDEN wurde eingehalten: in diesem Audit wurde
nichts aktiviert, geschaltet oder verändert.

Ergänzend `npm run verify:tracking` (3/3 bestanden): `MARKETING_TRACKING_ERLAUBT` ist nicht
gesetzt → keine Öffnungs-/Klickmessung; Transaktionspost wird nie gemessen; die Resend-Domain
hat `open_tracking=false`, `click_tracking=false`.

### 4.15 Cookie-Consent — 🟢 VERIFIZIERT — 100 %

`components/CookieConsent.tsx` + `lib/consent/kategorien.ts`.
Drei einzeln wählbare Kategorien: `notwendig` (nicht abwählbar), `statistik`, `marketing`.
Altbestand (`'accepted'`/`'rejected'` als reine Zeichenkette) wird übersetzt statt verworfen.
**Fail-closed:** kaputtes JSON, unbekannte Version oder fehlender Eintrag ergeben
„nur notwendig" — „Eine Einwilligung, die aus einem Fehler entsteht, ist keine."
Angebunden: `GoogleTagManager`, `MetaPixel`, `TikTokPixel`, `VisitorTracker`,
`CookieSettingsLink` (nachträglicher Widerruf).
E2E-Abdeckung: `e2e/cookie-consent.spec.ts`, eingeführt mit `c9b59610`.

### 4.16 Produktivdatenstand (PostgREST, `count=exact`, 09.09.2026)

| Tabelle | Zeilen |
|---|---|
| `page_views` | 9.846 |
| `profiles` | 73 |
| `conversions` | 52 |
| `lead_inquiries` | 47 |
| `service_records` | 30 |
| `organizations` | 6 |
| `clients` | 4 |
| `client_budgets` | 4 |
| `notification_delivery_log` | 4 |
| `bookings` | 3 |
| `invoices` | 3 |
| `caregivers` | 2 |
| `notifications` | 248 |
| `messages` / `chat_messages` | 0 / 0 |
| **`applications`** | **0** (tote Tabelle, §4.11) |
| `invoice_email_log` | 0 (§4.10) |

**Einordnung ohne Beschönigung:** Die Plattform ist technisch weit gebaut, der
Produktivbetrieb steht aber erst am Anfang — 4 Klienten, 2 Pflegekräfte, 3 Buchungen,
3 Rechnungen. Der Marketing-Trichter läuft dagegen bereits (9.846 Seitenaufrufe,
52 Conversions, 47 Anfragen/Bewerbungen).

---

## 5. Migrationsstand live

`npm run check:migrationen`, Lauf 09.09.2026 13:00 Uhr:

```
Geprueft werden 37 Migrationen ab 20261006000000.
Alles davor gilt seit dem 27.08.2026 als angewendet (227+ Dateien).

✅ 32 Migrationen live
❌  5 MIGRATION(EN) STEHEN NICHT LIVE:
     20261008000000_vitalwerte_plausibilitaet_db_check
     20261009000000_pflege_massnahmenplaene_ein_aktiver_plan
     20261010000000_medikamente_abgesetzt_sperre_db
     20261010000002_wund_kindtabellen_sperre_db
     20261010000004_pflege_verlauf_backdating_sperre_db
```

🟡 TEILWEISE. Alle fünf offenen Migrationen sind **DB-seitige Plausibilitäts- und Sperr-Riegel
im Pflegemodul** (Vitalwerte-Grenzen, nur ein aktiver Maßnahmenplan, Sperre für abgesetzte
Medikamente, Wund-Kindtabellen, Rückdatierungssperre im Pflegeverlauf). Solange sie fehlen,
verlässt sich das Pflegemodul allein auf die TypeScript-Prüfungen — ein direkter
Datenbankzugriff umginge sie.

**Anwenden geht nur manuell** im Supabase-SQL-Editor als `postgres`: über den Dienstschlüssel
scheitert jedes DDL am Eigentümer (42501, geprüft am 31.08.2026). Das ist ein Schritt für
Yusuf, kein Agent kann ihn ausführen.

---

## 6. Deploy-Status

### 6.1 `vercel.json` — 🟢 VERIFIZIERT

Build-Env `NODE_OPTIONS=--max-old-space-size=4096` (gegen den 2-GB-Heap-Tod bei Preview-Builds).
**12 Cron-Jobs**, jeder mit einem tatsächlich existierenden Endpunkt unter `app/api/cron/`
(1:1 abgeglichen, keine Karteileiche, kein toter Pfad):

| Zeit | Pfad |
|---|---|
| 02:00 täglich | `/api/cron/workflow-engine` |
| 03:00 täglich | `/api/cron/konto-loeschung` |
| 03:30 täglich | `/api/cron/perimeter-aufbewahrung` |
| 03:45 täglich | `/api/cron/aufbewahrung` |
| 04:00 täglich | `/api/cron/zustellung-retry` |
| 05:00 täglich | `/api/cron/automatisierung` |
| 07:00 täglich | `/api/cron/mahnlauf` |
| 08:00 täglich | `/api/cron/onboarding-erinnerung` |
| 09:00 täglich | `/api/cron/drip` |
| 10:00 täglich | `/api/cron/review-request` |
| Mo 06:00 | `/api/cron/indexnow` |
| 01.01. 03:00 | `/api/cron/jahresuebertrag` |

⚠️ **Alle zwölf laufen ins Leere, solange `CRON_SECRET` fehlt** — `pruefeCronGeheimnis`
weist jeden Aufruf ab (§4.10).

### 6.2 `deploy.sh` — 🟢 VERIFIZIERT

238 Zeilen, ausführbar (`-rwxr-xr-x`), `set -euo pipefail`.
Pipeline: Stale-Lock-Cleanup → Typecheck (**blockierend**) → `precommit-guard`
(Secrets/.env/node_modules) → `git add -A` → Commit → Push (Worktree-Branches `claude/*`,
`worktree/*` automatisch nach `main`) → `verify-push.sh` (Remote-Wahrheitsabgleich) →
IndexNow-Ping.
Notausstiege dokumentiert: `SKIP_TYPECHECK=1`, `GUARD_BYPASS=1`, `DEPLOY_PATHS="…"`
(für parallele Sessions, damit `git add -A` keine fremden In-Flight-Änderungen mitnimmt).

### 6.3 Laufende Produktion — 🟢 VERIFIZIERT

```
$ curl -sI https://alltagsengel.care/
server: Vercel
x-vercel-cache: HIT
x-vercel-id: fra1::x7428-…
age: 319609            ← ca. 3,7 Tage, deckt sich mit dem letzten Commit vom 05.09.

$ curl -s https://alltagsengel.care/api/health
{"status":"degraded","version":"392bbe4","durationMs":2241,"checks":[
  {"name":"app","status":"pass"},
  {"name":"database","status":"pass","durationMs":842},
  {"name":"table:profiles","status":"pass","durationMs":913,"slow":true,
   "message":"Tabelle profiles erreichbar, aber 913 ms — Budget 800 ms."},
  {"name":"table:bookings","status":"pass","durationMs":146},
  {"name":"table:organizations","status":"pass","durationMs":339}]}
```

**`degraded` heißt hier nicht „kaputt":** alle fünf Prüfungen stehen auf `pass`. Der Status
kippt allein, weil `table:profiles` mit 913 ms 113 ms über dem 800-ms-Budget liegt.
🟡 TEILWEISE — beobachten, kein Blocker.

Getestete Produktions-URLs, alle **200**:
`/`, `/alltagsbegleitung`, `/entlastungsbetrag`, `/auth/login`, `/choose`, `/blog`,
`/sitemap.xml`, `/robots.txt`, `/engel-werden/frankfurt`.
`/api/uptime` → 404 (existiert nicht; der Uptime-Workflow nutzt einen anderen Pfad).

---

## 7. Gesamtbild

### 7.1 Feature-Vollständigkeit

| Feature | Status | % |
|---|---|---|
| Login / Auth | 🟢 | 100 |
| Admin-Dashboard | 🟢 | 100 |
| Buchung / Kalender | 🟢 | 100 |
| Leistungsnachweise | 🟢 | 100 |
| Billing / Rechnungen | 🟢 | 100 |
| 131 € Entlastungsbetrag | 🟢 | 100 |
| SEO / regionale Seiten | 🟢 | 100 |
| Cookie-Consent | 🟢 | 100 |
| Google-Ads-Tracking (Code) | 🟢 | 100 |
| Registrierung | 🟡 | 75 |
| Nachrichten | 🟢 | 75 |
| Kunden-Onboarding | 🟡 | 75 |
| Bewerber-Onboarding | 🔴 | 75 |
| Automatische E-Mails (Resend) | 🔴 | 50 |
| **Durchschnitt** | | **~89 %** |

Das ist die **Code- und Verdrahtungsreife**. Sie sagt bewusst nichts über die
Geschäftsreife: mit 4 Klienten und 3 Rechnungen ist der Betrieb im Pilotstadium.

### 7.2 Blocker, nach Schärfe

1. 🔴 **`CRON_SECRET`, `RECHNUNGSVERSAND_AUTOMATISCH`, `MAHNVERSAND_AUTOMATISCH` fehlen.**
   Zwölf Cron-Jobs laufen ins Leere, kein automatischer Rechnungs- oder Mahnversand.
   `invoice_email_log` = 0. → In Vercel setzen (nur Yusuf).
2. 🔴 **`/admin/applications` liest die tote Tabelle `applications` (0 Zeilen).**
   47 echte Bewerbungen/Anfragen liegen in `lead_inquiries` und sind nur unter `/mis/crm`
   sichtbar. → Umstellen oder entfernen.
3. 🟡 **5 Migrationen stehen nicht live** (Pflegemodul-Riegel).
   → Manuell im Supabase-SQL-Editor als `postgres` anwenden (nur Yusuf, 42501 blockiert Agents).
4. 🟡 **Angehörige haben keinen Selbstregistrierungsweg** — bewusst so, hier nur festgehalten.
5. 🟡 **`table:profiles` 913 ms** über dem 800-ms-Budget → `/api/health` meldet `degraded`.
6. ⚫ **`docs/genehmigung/` existiert nicht.** Genehmigungsunterlagen liegen unstrukturiert
   im Repo-Wurzelverzeichnis.
7. 🟡 **37 verwaiste Branches** lokal und remote.

### 7.3 Was in diesem Audit ausdrücklich NICHT geprüft wurde

- **Vercel-Umgebungsvariablen** — kein Vercel-Login in dieser Sitzung. Alle ENV-Aussagen
  beziehen sich auf die **lokale** Umgebung. ⚫
- **Google-Ads-Konto und Kampagnenstatus** — extern, auftragsgemäß nicht angefasst. ⚫
- **Playwright lokal** — nur das CI-Ergebnis vom 05.09. (154 bestanden) wird berichtet. ⚫
- **RLS-Vollmatrix, DSGVO-Löschkette, Perimeter** — eigene Prüfskripte vorhanden
  (`verify:rls-matrix`, `verify:loeschkette`, `verify:perimeter`), in diesem Lauf nicht
  ausgeführt. ⚫

---

## 8. Beweismittel-Register

| Nr. | Aussage | Beleg |
|---|---|---|
| B1 | Lokal = Remote | `git rev-parse HEAD origin/main` → 2× `392bbe42919e…` |
| B2 | Remote = Produktion | `/api/health` → `"version":"392bbe4"` |
| B3 | Arbeitsbaum sauber | `git status --porcelain` → 1 unversionierte PDF |
| B4 | CI grün auf HEAD | Run `33984530072`, beide Jobs `success` |
| B5 | Typecheck grün | `TYPECHECK_EXIT=0`, keine Ausgabe |
| B6 | Vitest grün | `10040 passed`, 38 übersprungen, `VITEST_EXIT=0` |
| B7 | node:test grün | `pass 2740`, `fail 0`, `UNIT_EXIT=0` |
| B8 | E2E grün | CI-Log: `154 passed (3.3m)` |
| B9 | Build grün | `✓ Compiled successfully in 4.7min`, `620/620`, `BUILD_EXIT=0` |
| B10 | Geldweg intakt | `verify:geldweg` → 12/12 |
| B11 | Versand blockiert | `verify:versand` → 3 Schalter `FEHLT`, `invoice_email_log` 0 |
| B12 | 5 Migrationen offen | `check:migrationen` → 32 ✅ / 5 ❌ |
| B13 | `applications` tot | PostgREST `content-range: */0` + Migrationskommentar |
| B14 | 47 Bewerbungen/Anfragen | PostgREST `lead_inquiries` → `0-0/47` |
| B15 | Ads-Code aktiv | `app/layout.tsx:337`, `lib/tracking.ts:38`, `conversions` = 52 |
| B16 | 131 € versioniert | `lib/config/budget-constants.ts`, fail-closed |
| B17 | Live-Seiten 200 | 9 URLs per `curl -o /dev/null -w "%{http_code}"` |
| B18 | Sitemap 138 URLs | `curl /sitemap.xml \| grep -c "<loc>"` |
| B19 | Tracking-Grenzen | `verify:tracking` → 3/3 |
| B20 | `docs/genehmigung` fehlt | `ls: No such file or directory` |

---

*Erstellt 09.09.2026 durch Statusaudit gegen Commit `392bbe42`.
Es wurden keine Daten verändert, keine Migration angewendet, kein Schalter gesetzt und
keine Werbekampagne aktiviert. Alle Produktionszugriffe waren lesend; der Geldweg-Kettenlauf
endet konstruktionsbedingt mit `RAISE EXCEPTION` und committet nichts.*
