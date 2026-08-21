# Supabase Key Dependency Map

**Stand:** 2026-08-21
**Scope:** Alle Supabase-Projekte der Alltagsengel-/ChairMatch-/efy-care-Landschaft
**Zweck:** Vor jeder Key-Rotation muss bekannt sein, *was* bricht. Dieses Dokument listet jede Fundstelle, jeden Konsumenten und die zwingende Reihenfolge.

> **Keine Secret-Werte in diesem Dokument.** Dokumentiert werden ausschließlich Key-**Typ**, **Ort** (Datei:Zeile) und **Abhängigkeit**. Wo ein hartkodierter Key gefunden wurde, steht der Fundort — nie der Wert.

---

## 0. Methodik

Erhoben durch Voll-Scan (ohne `node_modules`, `.next`, `.git`, `graphify-out`, Worktrees) über:

| Quelle | Abgedeckt |
|--------|-----------|
| `.env`, `.env.local`, `.env.staging.local`, `.env.example` | nur Variablennamen ausgelesen, keine Werte |
| `lib/`, `app/`, `components/`, `scripts/`, `supabase/`, `__tests__/`, `e2e/` | `process.env.*`, `Deno.env.get(*)` |
| `proxy.ts`, `next.config.ts`, `vercel.json`, `capacitor.config.json` | Laufzeit-/Build-Konfiguration |
| `.github/workflows/*.yml` | CI-Secrets, Cron-Workflows |
| `chairmatch-landing/` | statisches Landing-Bundle |
| `/Users/work/chairmatch` (eigenes Repo) | Web-App + `mobile/` |
| `/Users/work/efy-care` (eigenes Repo) | App + Edge Functions |
| `gh secret list`, `gh api .../pages` | tatsächlich gesetzte GitHub-Secrets, Pages-Status |
| `curl https://<ref>.supabase.co/rest/v1/` | Erreichbarkeit jedes Projekt-Refs |

**Nicht auslesbar aus dieser Session:** Vercel Environment Variables (CLI nicht eingeloggt), Supabase-Dashboard-Einstellungen, tatsächlich deployte Edge-Function-Secrets. Diese Punkte sind unten als `UNVERIFIED` markiert und **nicht** geraten.

---

## 1. Projekt-Inventar

Der Scan hat **sechs** Projekt-Refs gefunden — zwei mehr als beauftragt.

| # | Projekt | Ref | REST-Erreichbarkeit | Rolle | Im Auftrag genannt |
|---|---------|-----|---------------------|-------|--------------------|
| P1 | Alltagsengel Production | `nnwyktkqibdjxgimjyuq` | **401** (lebt) | Produktion Web + iOS + Cron | ja |
| P2 | Alltagsengel Shadow Branch | `ecknsffriyeihkorxmci` | **401** (lebt) | CI-Tests (Shadow-DB) | ja |
| P3 | ChairMatch Production | `pwdbjqfpgumyfktbfswg` | **401** (lebt) | Produktion chairmatch.de + Mobile | ja |
| P4 | efy care | `nsfbwhpjesmathsrqkfi` | **401** (lebt) | Expo-App efy care | ja |
| **P5** | **Alltagsengel Staging (verwaist)** | `uwmjqckhjkgukhzeidyw` | **000** (DNS tot / Projekt weg) | nur noch `.env.staging.local` lokal | **nein — neu gefunden** |
| **P6** | **ChairMatch Legacy (lebt!)** | `vlrviyrgggzhayepfmop` | **401** (lebt) | ⚠️ **live erreichbares Public-Deployment** — Anon-Key hartkodiert in getracktem Repo-File **und** in `next.config.ts:186` referenziert; GitHub Pages serviert die Legacy-SPA live. Voll geprüft → [P6_LEGACY_SECURITY_CHECK.md](P6_LEGACY_SECURITY_CHECK.md) | **nein — neu gefunden** |

`401` bedeutet: Endpoint antwortet, Projekt existiert. `000` bedeutet: kein DNS/keine Verbindung.

**P5** ist ein Karteileichen-Eintrag: `.env.staging.local` (lokal, gitignored) hält URL/Anon-Key/Project-Ref eines Projekts, das es nicht mehr gibt. Keine Code-Referenz auf `STAGING_SUPABASE_*` — die Variablen werden nirgends gelesen.

**P6** ist der einzige akute Punkt: siehe [§6 Legacy & hartkodierte Keys](#6-legacy--hartkodierte-keys).

---

## 2. Die entscheidende Kopplungsregel

**Alle sechs Projekte nutzen das Legacy-JWT-Key-Modell.** Verifiziert durch Dekodieren der JWT-Payloads (nur Header-Claims, keine Werte):

```
{ iss: "supabase", ref: "<projekt-ref>", role: "anon" | "service_role", iat: …, exp: … }
```

Daraus folgt die Regel, die die gesamte Rotationsplanung bestimmt:

> **`anon` und `service_role` sind beide mit demselben JWT-Secret des Projekts signiert. Es gibt keine Rotation eines einzelnen Keys.**
> Ein Roll des JWT-Secrets rotiert **anon + service_role gleichzeitig** und invalidiert **zusätzlich sämtliche User-Sessions und Refresh-Tokens** des Projekts.

Praktische Konsequenz für jedes Projekt:

| Was rotiert wird | Was mitrotiert | Kollateralschaden |
|------------------|----------------|-------------------|
| JWT-Secret | anon **und** service_role | **Alle eingeloggten Nutzer werden ausgeloggt.** Alle Refresh-Tokens sind tot. |
| einzelner Key | *nicht möglich im Legacy-Modell* | — |

Der Ausweg wäre die Migration auf die neuen Supabase-Keys (`publishable` / `secret`), die unabhängig rotierbar sind. Der Code ist darauf **erst zu 1/32 vorbereitet**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` wird an genau einer Stelle als Fallback gelesen (`app/api/user/delete/route.ts:79`), alle anderen 31 Lesepfade kennen nur `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### Zweiter Kopplungspunkt: der Auth-Storage-Key

`lib/supabase/storage-key.ts:63` leitet den Session-Storage-Key aus `NEXT_PUBLIC_SUPABASE_URL` ab (`sb-<ref>-auth-token`), mit Fail-Closed-Fallback auf einen Dummy. Die Kette hängt an drei Stellen daran: `lib/supabase/client.ts`, `proxy.ts`, plus der IndexedDB-/Cookie-Backup-Mechanismus in `client.ts` (365-Tage-Persistenz, dreifach redundant).

> **Ein Key-Roll ändert den Ref nicht → Storage-Key bleibt gleich → die Backups in Cookie/localStorage/IndexedDB überleben, enthalten aber tote Tokens.** Der Client versucht dann mit alten Refresh-Tokens zu refreshen und scheitert. Ein Projekt**wechsel** (anderer Ref) dagegen ändert den Storage-Key und macht die Altsessions unsichtbar statt kaputt.

### Dritter Kopplungspunkt: CSP

`next.config.ts:52-55` baut `connect-src` aus `NEXT_PUBLIC_SUPABASE_URL`. Solange der Ref gleich bleibt, ist die CSP unbeeinflusst (die Prod-Regel steht ohnehin auf `https://*.supabase.co`, `next.config.ts:29-30`). Ein Projektwechsel auf eine Nicht-`supabase.co`-Domain würde die CSP brechen.

---

## 3. Key-Katalog

### P1 — Alltagsengel Production (`nnwyktkqibdjxgimjyuq`)

#### P1-A · `NEXT_PUBLIC_SUPABASE_URL` (Typ: URL, nicht geheim)

| Feld | Wert |
|------|------|
| Environment | dev (`.env`, `.env.local`), prod (Vercel), CI (Platzhalter) |
| Fundstellen | **41 Dateien / 75 Referenzen** |

Kern-Lesepfade:

| Datei:Zeile | Kontext |
|-------------|---------|
| `lib/supabase/client.ts:139` | Browser-Client |
| `lib/supabase/server.ts:7` | SSR-Client |
| `lib/supabase/admin.ts:25` | Admin-Client (service_role) |
| `lib/supabase.ts:4` | Legacy-/RN-Client (AsyncStorage) |
| `lib/supabase/storage-key.ts:63` | Session-Storage-Key-Ableitung |
| `proxy.ts:135, 145` | Middleware, **fail-closed**: fehlt die Variable, sind alle geschützten Routen gesperrt |
| `next.config.ts:52` | CSP `connect-src` |
| `lib/middleware/rate-limit.ts` | persistentes Rate-Limit |
| `lib/go-live/status.ts:94, 194` | Go-Live-Dashboard-Prüfung |
| `app/api/analytics/vitals/route.ts:62`, `app/api/user/delete/route.ts:78` | API-Routen |
| `.github/workflows/ci.yml:29` | CI-**Platzhalter** (`https://ci-placeholder.supabase.co`) |
| 24 × `scripts/verify-*.mjs`, `scripts/audit-rls.ts`, `scripts/rls-matrix.ts`, … | Verifikations-/Audit-Werkzeug |

**Rotation:** entfällt — die URL rotiert nicht, sie ändert sich nur bei Projektwechsel.

#### P1-B · `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Typ: anon JWT, öffentlich by design)

| Feld | Wert |
|------|------|
| Environment | dev, prod (Vercel), CI (Platzhalter `ci-placeholder-anon-key`) |
| Fundstellen | 18 Dateien / 32 Referenzen |
| Hartkodiert im Repo | **nein** — `git grep` auf JWT-Muster im getrackten Code: 0 Treffer. Die Cleanup-Runde hat gegriffen. |

| Datei:Zeile | Betroffener Service bei Rotation |
|-------------|----------------------------------|
| `lib/supabase/client.ts:140` | **Gesamte Web-App im Browser** |
| `lib/supabase/server.ts:8` | Alle Server-Components/SSR-Reads |
| `proxy.ts:146` | **Middleware/Auth-Gate — fail-closed, blockt bei falschem Key alle geschützten Routen** |
| `lib/supabase.ts:5` | React-Native-/Legacy-Client |
| `app/api/user/delete/route.ts:80` | Re-Auth beim Kontolöschen (mit `PUBLISHABLE_KEY`-Vorrang) |
| `lib/go-live/status.ts:93, 194` | Go-Live-Dashboard |
| `.github/workflows/ci.yml:30` | CI (Platzhalter, kein echter Key) |
| `scripts/verify-anon-exposure.mjs`, `verify-profiles-rls.mjs`, `verify-security-p0.mjs`, `security-redteam-phase7.mjs`, `verify-sis-migration.mjs`, `verify-kassenabrechnung-final-reverify.mjs`, `verify-sql-exec-abgesichert.mjs`, `verify-registration-flow.mjs`, `verify-security-fixes-2026-08-19.mjs` | Sicherheits-Verifikationslauf — **alle brechen still, wenn der Key alt ist** |
| `__tests__/security/p0-1-admin-auth.test.ts:98, 256, 310` | Security-Testsuite |
| `scripts/staging-app.sh:88` | Staging-Starter (referenziert P5, tot) |

#### P1-C · `SUPABASE_SERVICE_ROLE_KEY` (Typ: service_role JWT, **hochgeheim**)

| Feld | Wert |
|------|------|
| Environment | dev (`.env.local`), prod (Vercel), CI (Platzhalter), Edge Function (**Plattform-injiziert**) |
| Zentraler Konstruktor | `lib/supabase/admin.ts:26` — einziger Ort, an dem der Key zu einem Client wird |
| Schutz | `import 'server-only'` (Build-Guard) + `typeof window !== 'undefined'` throw (Runtime-Guard) |
| Regressionsschutz | `__tests__/security/admin-client-server-only-guard.test.ts:51-59` scannt `app/` + `lib/` und schlägt fehl, sobald irgendwo außer `admin.ts` ein `createClient(` mit dem Service-Key gebaut wird |

Konsumenten (alle serverseitig):

| Datei:Zeile | Service |
|-------------|---------|
| `lib/supabase/admin.ts:26` | **alle** `createAdminClient()`-Aufrufer |
| `app/api/push/send/route.ts:15` | Web-Push-Versand |
| `app/api/analytics/vitals/route.ts:62` | Web-Vitals-Ingest |
| `app/api/cron/mahnlauf/route.ts` | Vercel-Cron `0 7 * * *` |
| `app/api/cron/review-request/route.ts` | Vercel-Cron `0 10 * * *` |
| `app/api/cron/automatisierung/route.ts` | Vercel-Cron `0 5 * * *` |
| `app/api/cron/drip/route.ts` → `app/api/drip/route.ts` | Vercel-Cron `0 9 * * *` |
| `app/api/cron/indexnow/route.ts` | Vercel-Cron `0 6 * * 1` |
| `app/api/newsletter/route.ts`, `newsletter/unsubscribe`, `lead-inquiry`, `referral`, `referral/complete` | Lead-/Newsletter-Pfade |
| `app/admin/go-live/page.tsx` | Server-Component (`force-dynamic`) |
| `supabase/functions/account-hard-delete/index.ts:76` | **Edge Function — liest `SUPABASE_SERVICE_ROLE_KEY` aus `Deno.env`, das Supabase selbst injiziert** |
| 20 × `scripts/*.mjs` / `scripts/*.ts` | Audit-, Seed-, Migrations-, Verifikationswerkzeuge |

> **Wichtig für die Reihenfolge:** Die Edge Function bezieht `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` aus der von Supabase automatisch gesetzten Function-Umgebung — **nicht** aus einem manuell gepflegten Secret. Ein Key-Roll wirkt dort ohne Deploy. Das ist der einzige Konsument, der sich selbst nachzieht.

#### P1-D · JWT-Secret (Typ: Signaturgeheimnis, im Dashboard)

Nirgends im Code referenziert — wirkt aber implizit über P1-B und P1-C (siehe §2). Der einzige Hebel, mit dem P1-B/P1-C überhaupt rotierbar sind.

---

### P2 — Alltagsengel Shadow Branch (`ecknsffriyeihkorxmci`)

Reines CI-/Test-Projekt. Drei Variablen, alle als **echte GitHub-Secrets** hinterlegt.

| Key | GitHub-Secret | Zuletzt gesetzt |
|-----|---------------|-----------------|
| `SHADOW_SUPABASE_URL` | ✅ vorhanden | 2026-08-20 |
| `SHADOW_SUPABASE_ANON_KEY` | ✅ vorhanden | 2026-08-20 |
| `SHADOW_SUPABASE_SERVICE_ROLE_KEY` | ✅ vorhanden | 2026-08-20 |

Injiziert in `.github/workflows/ci.yml:69-71`.

Konsumenten:

| Datei:Zeile | Test |
|-------------|------|
| `__tests__/shadow-db/tenant-isolation.test.ts:278-280` | Mandantentrennung; **skippt still**, wenn die Vars fehlen (`:347`) |
| `__tests__/shadow-db/dsgvo-account-deletion.test.ts:32-34, 99` | DSGVO-Löschkette; setzt intern `process.env.SUPABASE_SERVICE_ROLE_KEY` auf den Shadow-Key |
| `__tests__/security/bookings-policy-consolidation.test.ts:208-210` | Policy-Konsolidierung |
| `__tests__/billing/fail-closed-invoice.test.ts:176-177` | Fail-Closed-Rechnungsweg |

**Achtung — die Fail-Silent-Falle:** Alle vier Suiten sind so gebaut, dass sie bei fehlenden/falschen Shadow-Keys **überspringen statt fehlzuschlagen**. Nach einer Shadow-Rotation sieht CI grün aus, obwohl die Mandantentrennung ungetestet blieb. Die Rotation muss deshalb mit einem Nachweis abgeschlossen werden, dass die Tests tatsächlich *gelaufen* sind — nicht nur, dass der Lauf grün war.

#### Lokaler Shadow-Shim (nicht das gehostete Projekt)

`scripts/shadow-db-http.sh:75-77` exportiert dieselben Variablennamen, zeigt aber auf `http://127.0.0.1:<port>` (lokaler Postgres aus `scripts/shadow-db.sh`, Port 55432). Signiert wird mit `SHADOW_JWT_SECRET`; `scripts/shadow-db-http.sh:24` und `scripts/staging-app.sh:36` halten dafür einen **hartkodierten Default-Wert** vor.

- Dieser Default ist ein reines Lokal-Artefakt, kein Projekt-Secret — er signiert Tokens für einen Shim auf `127.0.0.1`.
- Risiko: **LOW**, aber die Namensgleichheit ist gefährlich. Wer `SHADOW_SUPABASE_*` sieht, kann nicht unterscheiden, ob das gehostete P2 oder der lokale Shim gemeint ist. Bei einer P2-Rotation sind beide Bedeutungen zu prüfen.
- `scripts/shadow-auth-shim.mjs:27-30` bricht ohne `SHADOW_JWT_SECRET` ab (fail-closed) — nur die beiden Shell-Skripte setzen den Default.

---

### P3 — ChairMatch Production (`pwdbjqfpgumyfktbfswg`)

Eigenes Repo: `/Users/work/chairmatch` · Repo-Sichtbarkeit: **PUBLIC**

| Key | Environment | Fundstellen |
|-----|-------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | dev (`.env.local`), prod (Vercel) | 14 Referenzen |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | dev, prod | 11 Referenzen |
| `SUPABASE_SERVICE_ROLE_KEY` | prod (Vercel) | `src/lib/supabase-server.ts:13`, `src/app/api/admin/health/route.ts:27`, `scripts/rls-security-test.mjs:24` |
| `DATABASE_URL` | nur dev (`.env.local`) | **kein einziger Code-Konsument** — enthält aber das Postgres-Passwort für `db.pwdbjqfpgumyfktbfswg.supabase.co` |

Besonderheiten:

- **`src/lib/supabase-server.ts:13-23` ist bewusst fail-closed:** kein Fallback auf den Anon-Key, wenn `SUPABASE_SERVICE_ROLE_KEY` fehlt — die App wirft. Gut fürs Sicherheitsmodell, heißt aber: eine unvollständige Rotation legt ChairMatch **sofort und vollständig** lahm, nicht schleichend.
- **RLS ist bei ChairMatch nicht die Datengrenze.** Der gesamte Server-Code läuft über `getSupabaseAdmin()` (service_role) — siehe `src/__tests__/e2e/permissions.test.ts:6` und `_harness/fake-supabase.ts:8`. Der service_role-Key ist damit die *einzige* Datengrenze. Sein Blast Radius ist maximal.
- **Hartkodierter Anon-Key im Mobile-Client:** `mobile/src/lib/supabase.ts:12-18`. Der Key ist absichtlich in drei JWT-Segmente zerlegt und per `.join('.')` zusammengesetzt, um `scripts/precommit-guard.sh` zu umgehen (der Kommentar sagt das offen, Zeile 5-7). Überschreibbar per `EXPO_PUBLIC_SUPABASE_ANON_KEY`, aber der Fallback greift, sobald die Variable fehlt.
- **CI:** `.github/workflows/auto-create-pr.yml`, `auto-merge.yml` — nutzen nur `GITHUB_TOKEN`. **Keine Supabase-Secrets im ChairMatch-Repo** (`gh secret list` → leer).
- **Cron:** `vercel.json` definiert `/api/cron/hard-delete`, `/api/cron/publish-reviews`, `/api/cron/rental-payouts` — laufen über den service_role-Pfad.

#### ChairMatch Landing (im Alltagsengel-Repo, `chairmatch-landing/`)

| Punkt | Befund |
|-------|--------|
| Key-Träger | `chairmatch-landing/js/supabase-config.js` — setzt `window.__SUPABASE_URL` / `window.__SUPABASE_ANON_KEY` |
| Git-Status | **gitignored** (`.gitignore:95`) — korrekt, kein Key im Repo |
| Lokaler Inhalt | reiner Platzhalter (`https://example.invalid`), **kein echter Key** |
| Erzeugung | `chairmatch-landing/generate-config.sh` aus `SUPABASE_URL` / `SUPABASE_ANON_KEY` |
| Konsumenten | **33 HTML-Seiten** referenzieren `js/supabase-config.js` |
| Deploy | `.github/workflows/deploy-chairmatch.yml` lädt `chairmatch-landing/` als Pages-Artefakt hoch — **ruft `generate-config.sh` nicht auf** |
| Pages-Status | `gh api repos/…/pages` → **404, GitHub Pages ist nicht aktiviert** |

> **Befund:** Der Deploy-Pfad der Landing-Seite ist heute komplett tot. Pages ist aus, und selbst wenn es an wäre, würde das Artefakt aus einem frischen Checkout gebaut — `supabase-config.js` ist gitignored, wäre also nicht dabei, und der Lead-Form-Code auf 33 Seiten liefe gegen ein 404-Skript. **Für die Rotation ist das eine gute Nachricht:** die Landing hat keine Key-Abhängigkeit, die brechen könnte. Als Funktionsbefund gehört es trotzdem notiert.

---

### P4 — efy care (`nsfbwhpjesmathsrqkfi`)

Eigenes Repo: `/Users/work/efy-care`

| Key | Environment | Fundstellen |
|-----|-------------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Expo-App | `app/src/lib/supabaseConfig.ts:21` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Expo-App | `app/src/lib/supabaseConfig.ts:22` |
| `SUPABASE_URL` (Plattform-injiziert) | Edge Functions | `supabase/functions/ocr-leistungsnachweis/index.ts:111`, `_shared/stripe-helpers.ts:15, 22` |
| `SUPABASE_ANON_KEY` (Plattform-injiziert) | Edge Functions | `ocr-leistungsnachweis/index.ts:112`, `_shared/stripe-helpers.ts:23` |
| `SUPABASE_SERVICE_ROLE_KEY` (Plattform-injiziert) | Edge Functions | `ocr-leistungsnachweis/index.ts:113`, `_shared/stripe-helpers.ts:16` |

> **Hartkodierter Anon-Key — die härteste Rotationsbremse in P4.**
> `app/src/lib/supabaseConfig.ts:16-19` enthält `FALLBACK_URL` und `FALLBACK_ANON_KEY` als Literale im Quelltext, **committed**. Ebenso `app/env.example`. Der Kommentar begründet das damit, dass der Anon-Key öffentlich und per RLS geschützt sei — das stimmt für die Vertraulichkeit, ändert aber nichts an der Abhängigkeit: **eine Anon-Rotation in P4 ist keine ENV-Änderung, sondern eine Code-Änderung plus App-Store-Release.** Bereits ausgelieferte App-Installationen mit dem alten Fallback funktionieren nach der Rotation nicht mehr, bis der Nutzer aktualisiert.
> Zusätzlich: `app/src/lib/supabaseConfig.ts:29` leitet den Session-Storage-Key aus derselben URL ab — dieselbe Kopplung wie in P1.

Weitere efy-care-Fundstellen des Refs (Dokumentation/generierte Typen, keine Keys): `app/scripts/gen-types.sh`, `app/src/types/supabase.ts`, `app/src/types/database.generated.ts`, `supabase/migrations/20260801120000_abrechnung_edifact.sql`, `supabase/functions/_shared/stripe-client.ts`, `_shared/stripe-config.ts`, `audit/GO_NO_GO_REPORT_v2.md`, `audit/PROD_DEPLOY_PLAN.md`.

Zusätzlich referenziert der efy-care-Code `SHADOW_SUPABASE_URL` / `SHADOW_SUPABASE_ANON_KEY` (je 3 Treffer) — eigene Shadow-Testinfrastruktur, unabhängig von P2.

---

### P5 — Alltagsengel Staging (`uwmjqckhjkgukhzeidyw`) · **VERWAIST**

| Feld | Wert |
|------|------|
| Träger | `.env.staging.local` (lokal, gitignored) |
| Variablen | `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `STAGING_SUPABASE_PROJECT_REF` |
| Code-Konsumenten | **null** — `grep 'STAGING_SUPABASE'` über `*.ts`/`*.mjs`/`*.sh`/`*.yml`: 0 Treffer |
| Erreichbarkeit | `000` — DNS löst nicht auf, Projekt existiert nicht mehr |

`scripts/staging-app.sh:88-89` schreibt zwar `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`, bezieht sie aber aus dem lokalen Shadow-Shim, nicht aus P5.

**Empfehlung:** `.env.staging.local` löschen. Kein Rotationsbedarf, weil es nichts mehr zu rotieren gibt — aber ein toter Key in einer lokalen Datei ist Rauschen, das die nächste Inventur wieder kostet.

---

### P6 — ChairMatch Legacy (`vlrviyrgggzhayepfmop`) · **LEBT, KEY ÖFFENTLICH**

| Feld | Wert |
|------|------|
| Fundort | `/Users/work/chairmatch/index_legacy.html:199-200` — URL **und** Anon-JWT als Literale |
| Git-Status | **TRACKED** im Repo `YusufFerhatDemir/chairmatch` |
| Repo-Sichtbarkeit | **PUBLIC** |
| Projekt-Status | REST antwortet mit `401` → **Projekt existiert und ist online** |
| Aktive Nutzung | keine. `index_legacy.html` wird von keinem Build referenziert; `eslint.config.mjs:19` schließt die Datei sogar aus |

Bewertung: Ein Anon-Key ist per Design öffentlich — die Exposition allein ist kein Leak. Der Punkt ist ein anderer: **hier steht ein öffentlich lesbarer Zugang zu einem lebenden Projekt, dessen RLS-Zustand in keinem Audit dieser Landschaft je geprüft wurde.** P6 taucht in `SECURITY_AUDIT_RLS_2026-08-20.md` und `SECRETS_SERVICE_ROLE_AUDIT_2026-08-20.md` nicht auf. Ohne diesen Nachweis lässt sich nicht sagen, ob der Key harmlos ist.

Gleiches Muster, aber geprüfter Kontext: `mobile/src/lib/supabase.ts` (P3-Anon-Key, guard-umgehend zerlegt) — ebenfalls im öffentlichen Repo.

---

## 4. CI/CD, Cron & Plattform-Injektion

### GitHub Secrets

| Repo | Secret | Vorhanden | Zweck |
|------|--------|-----------|-------|
| `YusufFerhatDemir/alltagsengel` | `SHADOW_SUPABASE_URL` | ✅ | P2 · CI-Shadow-Tests |
| `YusufFerhatDemir/alltagsengel` | `SHADOW_SUPABASE_ANON_KEY` | ✅ | P2 |
| `YusufFerhatDemir/alltagsengel` | `SHADOW_SUPABASE_SERVICE_ROLE_KEY` | ✅ | P2 |
| `YusufFerhatDemir/chairmatch` | — | keine | nur `GITHUB_TOKEN` |

**Kein einziges Production-Supabase-Secret liegt in GitHub.** CI arbeitet für P1 durchgehend mit Platzhaltern (`ci.yml:29-31`). Das ist die beste Nachricht dieser Analyse: **Eine P1-Rotation berührt GitHub Actions nicht.**

### Vercel Environment Variables · `UNVERIFIED`

Zwei Vercel-Projekte (`.vercel/project.json`: `prj_Wre4nj8w11Kv6YAPUorBS24x03qA` / `alltagsengel`, Team `team_iJXOJqpBTNdePfg1tMV0r1ip`; ChairMatch separat). Die Vercel-CLI ist in dieser Umgebung nicht eingeloggt, die tatsächlich gesetzten Variablen sind **von hier aus nicht lesbar**.

Aus dem Code ableitbar, was dort gesetzt sein *muss*:

| Projekt | Erforderlich | Environment |
|---------|--------------|-------------|
| alltagsengel | `NEXT_PUBLIC_SUPABASE_URL` | Production + Preview |
| alltagsengel | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production + Preview |
| alltagsengel | `SUPABASE_SERVICE_ROLE_KEY` | Production (+ Preview, falls Preview-Crons laufen) |
| alltagsengel | `CRON_SECRET` | Production — schützt alle 5 Cron-Routen |
| chairmatch | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | laut `VERCEL_ENV_SETUP.md:42-44` |

`vercel.json` selbst enthält **keine** Secrets — nur `NODE_OPTIONS` und die Cron-Definitionen. Korrekt.

> **Rotationsrelevant:** `NEXT_PUBLIC_*` wird zur **Build-Zeit** ins Client-Bundle gebacken. Es reicht nicht, die Variable in Vercel zu ändern — es braucht einen **Redeploy**, sonst läuft die ausgelieferte App weiter mit dem alten Key. `SUPABASE_SERVICE_ROLE_KEY` dagegen wird zur Laufzeit gelesen und greift beim nächsten Function-Kaltstart.

### Vercel Cron (alltagsengel)

| Pfad | Zeitplan | Key-Abhängigkeit |
|------|----------|------------------|
| `/api/cron/automatisierung` | `0 5 * * *` | service_role + `CRON_SECRET` |
| `/api/cron/mahnlauf` | `0 7 * * *` | service_role + `CRON_SECRET` |
| `/api/cron/drip` | `0 9 * * *` | service_role + `CRON_SECRET` (reicht ihn an `/api/drip` weiter) |
| `/api/cron/review-request` | `0 10 * * *` | service_role + `CRON_SECRET` |
| `/api/cron/indexnow` | `0 6 * * 1` | `CRON_SECRET` |

`CRON_SECRET` ist ein **eigenständiges Secret**, kein Supabase-Key — es rotiert unabhängig und ist nicht Teil dieses Plans. Es taucht hier nur auf, weil eine misslungene Supabase-Rotation und ein falsches `CRON_SECRET` denselben Symptomverlauf haben (Cron läuft, tut aber nichts) und in der Fehlersuche auseinandergehalten werden müssen.

### GitHub Actions Cron

`.github/workflows/uptime.yml` — alle 5 Minuten `curl` auf `/api/health`. **Keine Supabase-Keys.** Taugt aber als Rotations-Kanarienvogel, falls `/api/health` die DB anfasst.

### Supabase Edge Functions

| Projekt | Function | Env-Quelle |
|---------|----------|-----------|
| P1 | `account-hard-delete` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` **plattform-injiziert**; `CRON_SECRET`, `RESEND_API_KEY` manuell |
| P4 | `ocr-leistungsnachweis` | `SUPABASE_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY` plattform-injiziert; `OCR_ENABLED`, `ANTHROPIC_API_KEY` manuell |
| P4 | `stripe-webhook`, `_shared/stripe-*` | `SUPABASE_URL`/`SERVICE_ROLE_KEY`/`ANON_KEY` plattform-injiziert; Stripe-Keys manuell |

**Plattform-injizierte Werte ziehen sich bei einer Rotation selbst nach.** Kein manueller Schritt, kein Redeploy nötig. Das ist der einzige Konsumententyp, der ohne Zutun korrekt bleibt — und deshalb auch der einzige, den man beim Rollback nicht zurückdrehen kann.

---

## 5. Was der Cleanup erledigt hat

| Prüfung | Ergebnis |
|---------|----------|
| Hartkodierte JWTs im getrackten Alltagsengel-Code | **0 Treffer** — sauber |
| `.env`, `.env.local`, `.env.staging.local` getrackt? | **nein** — `.gitignore:24-26` deckt `.env`, `.env.*`, `.env*.local` ab |
| `vercel.json` mit Secrets | nein |
| `chairmatch-landing/js/supabase-config.js` | gitignored, lokal nur Platzhalter |
| service_role außerhalb `lib/supabase/admin.ts` zu Client verarbeitet | nein — durch Regressionstest abgesichert |
| Hartkodierte Keys in `ios/`, `android/`, `native/`, `src-tauri/`, `capacitor.config.json` | keine (die iOS-App ist ein Capacitor-WKWebView der Live-Site, trägt also gar keinen Key) |

**Offen geblieben sind drei Fundstellen — alle außerhalb des Alltagsengel-Repos:**

1. `/Users/work/efy-care/app/src/lib/supabaseConfig.ts:16-19` (P4-Anon, committed)
2. `/Users/work/chairmatch/mobile/src/lib/supabase.ts:12-18` (P3-Anon, guard-umgehend zerlegt)
3. `/Users/work/chairmatch/index_legacy.html:199-200` (P6-Anon, totes Projekt-Artefakt, Projekt lebt)

---

## 6. Rotationsbewertung

| ID | Key | Bewertung | Begründung |
|----|-----|-----------|------------|
| P2-ALL | Shadow-Branch anon + service_role + URL | **ROTATE_SAFE** | Nur CI. Keine Nutzer, keine Sessions, keine Produktionsdaten. Drei GitHub-Secrets nachziehen, fertig. Einziger Fallstrick: die Tests skippen still (§3/P2). |
| P5-ALL | Staging-Keys | **N/A — ersatzlos löschen** | Projekt existiert nicht mehr, kein Code liest die Variablen. |
| P6-ANON | ChairMatch-Legacy-Anon | **ROTATE_SAFE, aber falsche Maßnahme** | Kein aktiver Konsument, Rotation bricht nichts. Rotation löst hier aber das Problem nicht: solange das Projekt lebt, ist auch der neue Key wieder in einem öffentlichen Repo — oder das Projekt gehört abgeschaltet. **Erst RLS prüfen, dann entscheiden: Projekt löschen (richtig) oder Datei entfernen + Key rollen (Minimum).** |
| P4-ANON | efy-care-Anon | **BLOCKED_BY_RISK** | Hartkodierter Fallback in ausgelieferten App-Builds (`supabaseConfig.ts:16-19`). Rotation sperrt jede Installation aus, die nicht aktualisiert. Braucht: Code-Fix (Fallback raus) → Release → Adoptionsfenster → **erst dann** Rotation. |
| P4-SERVICE | efy-care-service_role | **BLOCKED_BY_RISK (gekoppelt)** | Legacy-Modell: nicht ohne P4-ANON rotierbar (§2). Erbt dessen Blocker vollständig. |
| P3-ANON | ChairMatch-Anon | **ROTATE_WITH_WINDOW** | Web-App zieht per Redeploy nach. Blocker ist `mobile/src/lib/supabase.ts` — dort erst den Fallback entfernen bzw. `EXPO_PUBLIC_SUPABASE_ANON_KEY` verbindlich setzen. |
| P3-SERVICE | ChairMatch-service_role | **ROTATE_WITH_WINDOW, hoher Blast Radius** | `supabase-server.ts` ist fail-closed **und** service_role ist bei ChairMatch die einzige Datengrenze. Falscher Key = App sofort komplett tot. Dafür ist der Fehler unübersehbar statt schleichend. Gekoppelt an P3-ANON. |
| P1-ANON | Alltagsengel-Anon | **ROTATE_WITH_WINDOW** | Nicht hartkodiert, kein GitHub-Secret, sauber zentralisiert. Aber: Build-Zeit-Variable → Redeploy zwingend. `proxy.ts` ist fail-closed → falscher Key sperrt alle geschützten Routen. |
| P1-SERVICE | Alltagsengel-service_role | **ROTATE_WITH_WINDOW** | Zentral in `admin.ts`, Regressionstest schützt vor Streuung, Edge Function zieht sich selbst nach. Betroffen: 5 Vercel-Crons, 7 API-Routen, 1 Server-Component, 20 Skripte. |
| **P1-JWT** | **Alltagsengel-JWT-Secret** | **BLOCKED_BY_RISK** | **Der eigentliche Blocker.** Weil P1-ANON und P1-SERVICE im Legacy-Modell nur gemeinsam über das JWT-Secret rotierbar sind, bedeutet jede P1-Key-Rotation: **alle eingeloggten Nutzer fliegen raus.** Die App ist auf das Gegenteil ausgelegt — `lib/supabase/client.ts` betreibt eine 365-Tage-Session mit dreifacher Redundanz (Cookie + localStorage + IndexedDB) unter der ausdrücklichen Prämisse „einmal anmelden → nie wieder fragen". Ein JWT-Roll bricht diese Zusage für jeden Nutzer gleichzeitig und hinterlässt in allen drei Speichern tote Tokens (§2). |
| P3-JWT / P4-JWT | ChairMatch-/efy-care-JWT-Secret | **BLOCKED_BY_RISK** | Identische Kopplung. |

### Der strukturelle Befund

Ohne Migration auf das neue Key-Modell (`publishable` / `secret`) ist **für kein einziges Produktionsprojekt eine gezielte Rotation eines einzelnen Keys möglich.** Jede Rotation ist ein Mandanten-weiter Logout. Der Code kennt das neue Modell an genau einer von 32 Stellen.

**Das ist die Empfehlung, nicht der Rotationsplan unten:** Erst `publishable`/`secret` einführen, dann rotiert sich alles Weitere ohne Nutzerschmerz. Der Plan unten beschreibt, was zu tun ist, *wenn* vorher rotiert werden muss.

---

## 7. Vorgeschlagene Rotationsreihenfolge

Aufsteigend nach Risiko. Jede Stufe ist ein eigener Termin — **nie zwei Stufen am selben Tag**, sonst ist bei einem Fehler nicht unterscheidbar, welche ihn verursacht hat.

### Stufe 0 — Aufräumen (kein Risiko, sofort)

1. `.env.staging.local` löschen (P5, totes Projekt).
2. ✅ **ERLEDIGT** — RLS-/Zugriffs-Zustand von P6 geprüft ([P6_LEGACY_SECURITY_CHECK.md](P6_LEGACY_SECURITY_CHECK.md)). Ergebnis: `DECOMMISSION_CANDIDATE` mit **akuter Live-Exposition** (Public-Pages-Deployment + offene Signups). Nächster Schritt ist **nicht** „Key rollen", sondern Pages abschalten + Projekt pausieren (Stufe A dort). INSERT ist fail-closed, UPDATE/DELETE-Posture unbewiesen.
3. `index_legacy.html` aus dem ChairMatch-Repo entfernen.
4. Entscheiden, ob `deploy-chairmatch.yml` reaktiviert (dann `generate-config.sh` in den Workflow) oder gelöscht wird — Pages ist aus, der Workflow ist heute Attrappe.

### Stufe 1 — P2 Shadow Branch · `ROTATE_SAFE`

1. JWT-Secret in P2 rollen.
2. `gh secret set SHADOW_SUPABASE_ANON_KEY`, `… SHADOW_SUPABASE_SERVICE_ROLE_KEY` (URL bleibt).
3. CI-Lauf anstoßen.
4. **Abnahme:** Nicht „CI grün" prüfen, sondern im Log nachweisen, dass `__tests__/shadow-db/tenant-isolation.test.ts` und `dsgvo-account-deletion.test.ts` **ausgeführt** wurden. Ein Skip sieht identisch aus wie ein Erfolg.

### Stufe 2 — Vorbereitung der Produktionsrotationen (Code, keine Keys)

Diese Schritte sind Voraussetzung, nicht Kür:

1. **efy care:** `FALLBACK_URL` / `FALLBACK_ANON_KEY` aus `app/src/lib/supabaseConfig.ts` entfernen, `EXPO_PUBLIC_*` verbindlich machen (fail-closed werfen, wie ChairMatch es in `supabase-server.ts` vormacht). Release ausliefern. Adoptionsfenster abwarten — dessen Länge bestimmt der App-Store-Verlauf, nicht dieser Plan.
2. **ChairMatch Mobile:** analog in `mobile/src/lib/supabase.ts`. Den Guard-Umgehungs-Trick (`.join('.')`) ersatzlos streichen — er unterläuft `precommit-guard.sh` genau für die Kategorie, die der Guard erkennen soll.
3. **Alle drei Prod-Projekte:** `publishable`/`secret`-Keys aktivieren und die 31 verbliebenen `NEXT_PUBLIC_SUPABASE_ANON_KEY`-Lesepfade auf das Muster aus `app/api/user/delete/route.ts:79` heben (`PUBLISHABLE_KEY || ANON_KEY`). **Danach entfällt der gesamte Rest dieses Plans** — Keys werden einzeln rotierbar, ohne Sessions zu töten.

### Stufe 3 — P3 ChairMatch · `ROTATE_WITH_WINDOW`

Voraussetzung: Stufe 2.2 ausgeliefert.

1. Wartungsfenster ankündigen (Nutzer werden ausgeloggt).
2. JWT-Secret rollen.
3. Vercel: `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` setzen.
4. **Redeploy** (zwingend — `NEXT_PUBLIC_*` ist build-time).
5. `scripts/rls-security-test.mjs` mit dem neuen service_role laufen lassen.
6. Cron-Routen am nächsten Zyklus prüfen (`hard-delete`, `publish-reviews`, `rental-payouts`).
7. `.env.local` lokal nachziehen (inkl. `DATABASE_URL`, falls das Postgres-Passwort mitrotiert).

### Stufe 4 — P4 efy care · nach Adoptionsfenster

Voraussetzung: Stufe 2.1 ausgeliefert **und** Adoption belegt.

1. JWT-Secret rollen.
2. Expo-Build-Config / EAS-Secrets nachziehen.
3. Edge Functions: **nichts tun** — `SUPABASE_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY` sind plattform-injiziert.
4. Manuelle Function-Secrets prüfen (`ANTHROPIC_API_KEY`, Stripe) — die rotieren nicht mit, dürfen aber auch nicht verloren gehen.

### Stufe 5 — P1 Alltagsengel Production · höchstes Risiko, zuletzt

1. Wartungsfenster außerhalb der Pflegeeinsatzzeiten. **Alle Nutzer werden ausgeloggt** — Engel wie Kunden. Das ist kein Nebeneffekt, sondern die Hauptwirkung.
2. JWT-Secret rollen.
3. Vercel `alltagsengel`: `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` in Production **und** Preview setzen.
4. **Redeploy.**
5. Lokale `.env` / `.env.local` nachziehen — sonst sind ab sofort alle 24 `scripts/verify-*`-Läufe wertlos, und zwar still.
6. Edge Function `account-hard-delete`: nichts tun (plattform-injiziert).
7. **Abnahme in dieser Reihenfolge:**
   - `/api/health` (der Uptime-Workflow prüft ohnehin alle 5 Min.)
   - Login mit Testkonto → belegt, dass anon + Auth stehen
   - Zugriff auf eine geschützte Route → belegt, dass `proxy.ts` nicht fail-closed blockt
   - `node scripts/verify-security-p0.mjs` → belegt service_role + RLS
   - `node scripts/verify-anon-exposure.mjs` → belegt, dass der neue anon-Key nichts freilegt
   - nächster Cron-Zyklus: `mahnlauf` (07:00), `automatisierung` (05:00)
8. Nutzer-Kommunikation: einmaliges Neuanmelden ist erforderlich. Absender „Alltagsengel", keine persönlichen Namen.

---

## 8. Rollback-Plan

### Was rückholbar ist

| Ebene | Rollback | Dauer |
|-------|----------|-------|
| Vercel ENV | Vercel hält vorherige Deployments samt ENV-Snapshot → „Promote to Production" auf das letzte funktionierende Deployment | Minuten |
| GitHub Secrets (P2) | `gh secret set` mit dem alten Wert | Sekunden |
| Lokale `.env` | Datei-Backup vor der Rotation | Sekunden |
| Code-Änderungen aus Stufe 2 | `./scripts/rollback.sh <N> --push` (`git revert`, kein `reset --hard`) | Minuten |

### Was **nicht** rückholbar ist

> **Ein gerolltes Supabase-JWT-Secret lässt sich nicht zurückdrehen.** Supabase gibt das alte Secret nicht wieder heraus. Alle vor dem Roll ausgestellten Tokens bleiben ungültig — auch wenn danach alles andere zurückgesetzt wird.

Daraus folgt die eiserne Regel:

> **Erst wenn jede abhängige Stelle vorbereitet ist, wird das Secret gerollt.** Das Rollen ist immer der *letzte* Schritt einer Stufe, nie der erste. Alles davor ist Vorbereitung, alles danach ist Nachziehen.

### Pflicht-Backup vor jeder Stufe

1. Alte Keys in den Passwortmanager — **nicht** in eine Datei im Repo, nicht in eine Notiz, nicht in diesen Report.
2. Die laufende Vercel-Deployment-ID notieren (Rollback-Ziel).
3. `.env` / `.env.local` außerhalb des Repos sichern.
4. Aktuelle GitHub-Secret-Werte sichern, soweit noch verfügbar (GitHub zeigt sie nicht erneut an — falls nicht vorhanden, muss die Quelle Supabase sein).

### Notfallpfad, wenn P1 nach der Rotation nicht hochkommt

1. Vercel: letztes funktionierendes Deployment promoten → stellt das alte Bundle wieder her, **hilft aber nicht**, wenn das JWT-Secret schon gerollt ist (das alte Bundle trägt den alten anon-Key).
2. Deshalb ist der einzige echte Vorwärtspfad: neuen Key in Vercel korrigieren und **neu deployen**.
3. Symptom-Zuordnung für die Fehlersuche:
   - **Alle geschützten Routen 302/403** → `proxy.ts` fail-closed → anon-Key oder URL falsch
   - **Öffentliche Seiten ok, Login schlägt fehl** → anon-Key falsch
   - **App läuft, Crons tun nichts** → service_role falsch **oder** `CRON_SECRET` verstellt (beide Symptome sind identisch — beide prüfen)
   - **Build bricht** → `NEXT_PUBLIC_*` fehlt ganz, nicht nur falsch

---

## 9. Offene Punkte (nicht verifizierbar aus dieser Session)

| # | Punkt | Warum offen | Wer klärt |
|---|-------|-------------|-----------|
| 1 | Tatsächlich gesetzte Vercel ENV Variables (beide Projekte) | Vercel-CLI nicht eingeloggt | Yusuf im Vercel-Dashboard |
| 2 | Ob P1 `account-hard-delete` überhaupt deployed ist | kein Supabase-Access-Token in dieser Session | Supabase-Dashboard → Edge Functions |
| 3 | RLS-Zustand von P6 (`vlrviyrgggzhayepfmop`) | Projekt in keinem bisherigen Audit enthalten | eigener RLS-Lauf gegen P6 |
| 4 | Ob P4 (efy care) live Nutzer mit ausgelieferten Builds hat | Repo ausgelagert, keine Telemetrie hier | Expo-/Store-Konsole |
| 5 | Ob EAS-/Expo-Secrets für P3-Mobile und P4 existieren | keine EAS-Konfiguration im Scan gefunden | Expo-Konsole |
| 6 | `DATABASE_URL` in ChairMatch: rotiert das Postgres-Passwort mit dem JWT-Secret? | Nein (getrennte Credentials), aber der Ist-Wert ist ungeprüft | Supabase → Database Settings |

---

## 10. Kurzfassung

- **Sechs** Projekte gefunden, nicht vier. P5 ist tot (löschen), P6 lebt und war in keinem Audit.
- **Alle** Projekte im Legacy-JWT-Modell → **anon und service_role sind nicht einzeln rotierbar**, und jede Rotation loggt alle Nutzer aus.
- **`ROTATE_SAFE`:** nur P2 (Shadow, CI) und P6 (tot, aber lieber löschen als rotieren).
- **`BLOCKED_BY_RISK`:** P1-, P3-, P4-JWT-Secrets — sowie P4-Anon zusätzlich durch den hartkodierten App-Fallback.
- **Das Alltagsengel-Repo ist sauber:** null hartkodierte JWTs, null Production-Secrets in GitHub, service_role zentralisiert und per Regressionstest abgesichert. Die drei verbliebenen Fundstellen liegen alle in den beiden ausgelagerten Repos, die **öffentlich** sind.
- **Der wirksamste nächste Schritt ist keine Rotation**, sondern die Migration auf `publishable`/`secret`-Keys. Danach kostet jede Rotation kein Wartungsfenster mehr.
