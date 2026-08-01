# P0-Abnahme und Beweisprüfung — Alltagsengel

**Datum:** 2026-08-01 · **Branch:** `audit/production-hardening` · **Prüfer:** unabhängige Abnahme-Session (Claude)
**Rahmen:** Keine Produktivänderung. Keine Produktivdatenbank berührt, kein Deployment, keine produktive Migration ausgeführt. Alle Befehle liefen ausschließlich lokal (Tests, Datei-Lektüre, git-Inspektion).

---

## 1. Git-Status und Commits

### Branch und Arbeitsverzeichnis

```
Branch:  audit/production-hardening
Status:  Your branch is up to date with 'origin/audit/production-hardening'.
         Untracked: audit/P0_STATUS_ZUSAMMENFASSUNG.md   (Doku aus Vorsession, wird mit dieser Abnahme committet)
         Sonst: nothing to commit — Arbeitsverzeichnis sauber.
```

### Lokal vs. Remote

```
git log --oneline origin/audit/production-hardening..HEAD   → leer (nichts nur lokal)
git log --oneline HEAD..origin/audit/production-hardening   → leer (nichts nur remote)
```

**Alle P0-Commits sind bereits nach `origin/audit/production-hardening` gepusht.** Lokal und Remote sind identisch.

### P0-relevante Commits (Suchkriterien: „P0", „fix(auth)", „fix(config)", „SECON", „middleware")

| Hash | Datum | Nachricht | Geänderte Dateien (git show --stat) |
|---|---|---|---|
| `6f41d87` | 2026-08-01 13:09 | fix(auth): P0-1 Admin-Routenschutz aktiviert + Tests | **middleware.ts** (+21), `__tests__/security/p0-1-admin-auth.test.ts` (+316), `vitest.config.ts` (+17), `package.json`/`package-lock.json` (vitest-Dependency), `audit/PHASE1_INVENTORY.md`, `audit/AUDIT_CONTRADICTIONS.md`, `audit/TOP10_RISKS_AND_TESTPLAN.md`, `APP-STATUS-01-08-2026.md`, `rita-meyer-antwort.md` — 10 Dateien, +2060/−82 |
| `329a806` | 2026-08-01 13:37 | fix(config): P0-5 IK aus Org-Config statt hardcodiert | **lib/config/org-config.ts** (neu, +49), `lib/abrechnung/edifact-generator.ts`, `lib/abrechnung/leistungsnachweis-pdf.ts`, `app/admin/abrechnung/page.tsx`, `app/admin/abrechnung/einstellungen/page.tsx`, `app/api/leistungsnachweis/route.ts`, `__tests__/security/p0-5-no-hardcoded-ik.test.ts` (+94), `vitest.config.ts` — 8 Dateien, +196/−21 |
| `5b1e767` | 2026-08-01 13:39 | docs: SECON-Architekturentscheidung dokumentiert | `audit/SECON_ARCHITECTURE_DECISION.md` (neu, +105) |
| `51ab34e` | 2026-08-01 13:41 | docs: P0-Abschlussbericht | `audit/P0_REMEDIATION_REPORT.md` (neu, +217), Mini-Fix im P0-1-Test |
| `2e9dc45` | 2026-08-01 10:40 | fix: Stripe-Client lazy initialisieren (Vercel-Build-Fix, kein P0-Fix i. e. S.) | `lib/stripe/client.ts`, `docs/MASTER_PROMPT…`, `lib/generated/lastmod.json` — 3 Dateien |

### Rollback (Stand nach dem Abnahme-Commit dieser Datei; HEAD = Abnahme-Commit)

`./scripts/rollback.sh <N> --push` revertet die letzten N Commits via `git revert` (kein reset --hard):

| Ziel | Befehl |
|---|---|
| Nur Abnahme-Doku zurück | `./scripts/rollback.sh 1 --push` |
| + P0-Abschlussbericht (`51ab34e`) | `./scripts/rollback.sh 2 --push` |
| + SECON-Doku (`5b1e767`) | `./scripts/rollback.sh 3 --push` |
| + **P0-5-Fix** (`329a806`) | `./scripts/rollback.sh 4 --push` |
| + **P0-1-Fix** (`6f41d87`) | `./scripts/rollback.sh 5 --push` |
| + Stripe-Lazy-Init (`2e9dc45`) | `./scripts/rollback.sh 6 --push` |

---

## 2. Test-Widerspruch geklärt: „61 grün" vs. „hessen-plz rot"

**Beide Aussagen sind korrekt — sie beziehen sich auf unterschiedliche Test-Runner.** Es gibt zwei getrennte Testwelten:

| Runner | Befehl | Umfang | Ergebnis |
|---|---|---|---|
| **Vitest** | `npx vitest run` | nur `__tests__/**/*.test.ts` (siehe `vitest.config.ts:12`) | **2 Dateien, 21/21 bestanden, 0 fehlgeschlagen, 0 übersprungen, 366 ms, Exit-Code 0** |
| **node:test** | `npx tsx --test lib/**/*.test.ts` | `lib/abrechnung/secon.test.ts`, `lib/hessen-plz.test.ts`, `lib/password-validation.test.ts` | **28 Tests, 26 bestanden, 2 fehlgeschlagen, 0 übersprungen, 1214 ms, Exit-Code 1** |

Die „61 grünen Tests" aus `P0_STATUS_ZUSAMMENFASSUNG.md:19` sind: **21 Alltagsengel-Vitest + 40 efy-care-Vitest**. `lib/hessen-plz.test.ts` war **nie Teil dieser 61** — Vitest schließt `lib/**` bewusst aus (`vitest.config.ts:8-12`), weil die lib-Tests node:test-Skripte sind, die Vitest mit „No test suite found" fälschlich als Fehler melden würde.

### Warum schlagen die 2 hessen-plz-Tests fehl?

**Es ist ein veralteter Test (stale expectation), kein Produktfehler und kein Umgebungsproblem.** Nachgewiesene Ursachenkette:

1. Die Tests (`lib/hessen-plz.test.ts:106-110` und `:139-145`) erwarten, dass Wiesbaden 65207 und Frankfurt-Griesheim 65933 **nicht** matchen. Sie wurden gegen einen Match-Radius von **15 km** geschrieben (Commit `d2f93ac`).
2. Commit `c4195df` („Geo-Filter + Verfügbarkeitskalender") erhöhte `ENGEL_MATCH_RADIUS_KM` **bewusst von 15 auf 25 km** (`lib/plz-radius.ts:13`, mit dokumentierter Begründung: „25 km deckt eine Stadt samt Speckgürtel ab und trennt Frankfurt von Wiesbaden (≈32 km Luftlinie) weiterhin sauber") — und vergaß, die zwei betroffenen Assertions anzupassen.
3. Nachgerechnet mit der Produktivlogik: Distanz 65207↔65933 = **21,05 km** → bei 25-km-Radius zurecht Match `true`, Test erwartet noch `false`. Der eigentliche Kernfall Wiesbaden-Mitte↔Frankfurt-Mitte (65183↔60311 = **31,78 km**) matcht weiterhin **nicht** — die Schutzabsicht des Tests ist im Produkt intakt.
4. Der zweite Fehler (`matchPlz: bekannte Zonen nutzen NICHT die Geocoding-API`) ist dieselbe PLZ-Kombination über den async-Pfad — gleiche Ursache. (Die Teilaussage „Geocoding wird nicht aufgerufen" stimmt weiterhin: `called === 0` wird gar nicht mehr erreicht, weil die Assertion davor bricht.)

**Bewertung:** Vorbestehend (Radius-Änderung `c4195df` liegt vor den P0-Commits), keine Datei-Überschneidung mit den P0-Fixes, kein Sicherheitsbezug. Zwei Assertions in `lib/hessen-plz.test.ts` müssen an den 25-km-Radius angepasst werden — separates Ticket, hier bewusst nicht gefixt (keine Produktivänderung im Abnahme-Rahmen).

**Zusatzbefund:** `npm run test:unit` schlägt in einem frischen Clone mit `sh: tsx: command not found` fehl — `tsx` steht nicht in den devDependencies. Die lib-Tests laufen nur über `npx tsx --test …`. Empfehlung: `tsx` als devDependency aufnehmen (separates Ticket).

---

## 3. P0-Evidenztabellen (Alltagsengel)

### P0-1: Admin-/Server-Routenschutz

| | |
|---|---|
| **Ursprünglicher Fehler** | Der komplette serverseitige Schutz (CSRF, JWT-Verifikation, Fail-Closed für `/admin`/`/mis`) lag in `proxy.ts` — Next.js lädt Middleware aber nur als `middleware.ts` im Root mit Export `middleware`. Der Schutz war seit dem ursprünglichen Commit **Dead Code**; Admin-Seiten waren nur durch den client-seitigen `AdminAuthGuard` „geschützt". |
| **Betroffene Dateien** | `middleware.ts` (neu), `proxy.ts` (Implementierung, unverändert aktiv geschaltet) |
| **Fix** | `middleware.ts` re-exportiert `proxy` als `middleware` + `config`-Matcher (Commit `6f41d87`) |
| **Testdatei + Tests** | `__tests__/security/p0-1-admin-auth.test.ts` — 13 Tests in 3 Blöcken: „Admin-Routenschutz (Fail-Closed)" (9), „CSRF-Schutz" (3), „Middleware Error Handling" (1). Testet die echte `proxy()`-Funktion per Import mit gemocktem Supabase/NextRequest. |
| **Testbefehl** | `npx vitest run __tests__/security/p0-1-admin-auth.test.ts --reporter=verbose` |
| **Tatsächliches Ergebnis** | **13/13 bestanden, Exit-Code 0** (Ausgabe s. Abschnitt 4). Die zwei stderr-Zeilen (`Admin DB check failed`, `Middleware error`) sind **erwartete** console.error-Ausgaben der Fail-Closed-Negativtests, keine Fehler. |
| **Restrisiko** | (a) Test mockt NextRequest/NextResponse — kein E2E-Beweis gegen laufende Edge-Runtime; ein Vercel-Preview-Smoke-Test (`curl -I https://…/admin` → 307) wäre der letzte Baustein. (b) `/api/admin/*`-Routen werden von der Middleware **nicht** rollen-geprüft (nur CSRF) — 6 von 10 verlassen sich auf eigene Route-interne Checks (s. Abschnitt 4). (c) Fail-Soft-Fenster für `/kunde`,`/engel` (außer sensiblen Pfaden) ist bewusste UX-Entscheidung, dokumentiert in `proxy.ts:85-95`. |
| **Rollback** | `./scripts/rollback.sh 5 --push` (revertet bis einschließlich `6f41d87`; Achtung: revertet auch P0-5 + Doku mit) — gezielter: `git revert 6f41d87` gefolgt von `./deploy.sh` |

### P0-5: Hartcodierte IK-Nummer

| | |
|---|---|
| **Ursprünglicher Fehler** | Das Institutionskennzeichen `460629986` stand als String-Literal in 4 Alltagsengel-Produktivdateien (`edifact-generator.ts:42` als exportierte Konstante, `leistungsnachweis-pdf.ts:35`, `einstellungen/page.tsx:14`, `api/leistungsnachweis/route.ts:42` als Env-Fallback). Für Single-Org harmlos, hätte aber jede weitere Organisation (Multi-Mandant/efy care) mit der falschen IK abrechnen lassen. |
| **Betroffene Dateien** | `lib/config/org-config.ts` (neu), `lib/abrechnung/edifact-generator.ts`, `lib/abrechnung/leistungsnachweis-pdf.ts`, `app/admin/abrechnung/page.tsx`, `app/admin/abrechnung/einstellungen/page.tsx`, `app/api/leistungsnachweis/route.ts` |
| **Fix** | Zentrale Auflösung `getOrgIK(supabase, organizationId = DEFAULT_ORG_ID)`: DB (`organizations.ik_nummer`) → Env (`ALLTAGSENGEL_IK`/`NEXT_PUBLIC_ALLTAGSENGEL_IK`) → **Fehler** (kein hartcodierter Fallback). `edifact-generator.ts` verlangt `absender_ik` als Pflichtparameter. (Commit `329a806`) |
| **Testdatei + Tests** | `__tests__/security/p0-5-no-hardcoded-ik.test.ts` — 8 Tests: grep-basierter Regressionstest über gesamten `app/`+`lib/`-Code auf `/['"]460629986['"]/` + Verdrahtungstests (alle 4 Ex-Fundstellen rufen `getOrgIK()`; keine `ALLTAGSENGEL_IK`-Konstante mehr exportiert). |
| **Testbefehl** | `npx vitest run __tests__/security/p0-5-no-hardcoded-ik.test.ts --reporter=verbose` |
| **Tatsächliches Ergebnis** | **8/8 bestanden, Exit-Code 0** (Ausgabe s. Abschnitt 5). |
| **Restrisiko** | (a) DB-Pfad greift erst, wenn Migration `20260801_phase3_multi_mandant_saas.sql` live ist — bis dahin trägt die Env-Variable; ist **beides** nicht gesetzt, wirft `getOrgIK()` zur Laufzeit (fail-fast, gewollt — muss aber im Vercel-Env vor Abrechnungsläufen gesetzt sein). (b) `getOrgIK()` validiert den zurückgegebenen Wert nicht per Prüfziffer — Validierung passiert nur bei Eingabe (Onboarding, `validateIkNummer` in `lib/organizations/ik.ts`) und im EDIFACT-Validator. (c) Client-Komponenten laden die IK per `useEffect` — kurzes leeres Feld bis zum Fetch. |
| **Rollback** | `./scripts/rollback.sh 4 --push` (bis einschließlich `329a806`) — gezielter: `git revert 329a806` gefolgt von `./deploy.sh` |

---

## 4. Admin- und Server-Schutz — Ist-Zustand (aus middleware.ts + proxy.ts gelesen)

`middleware.ts:21` → `export { proxy as middleware, config } from './proxy'`. Matcher (`proxy.ts:179`):
`/kunde/:path*`, `/engel/:path*`, `/admin/:path*`, `/mis/:path*`, `/mis`, `/fahrer/home|fahrzeuge|auftraege|profil`, `/fahrer/chat/:path*`, `/api/:path*`

| Schutzschicht | Pfade | Verhalten |
|---|---|---|
| **Fail-Closed + Rollenprüfung** | `/admin/**`, `/mis/**` | Ohne Session → sofort Redirect `/auth/login?error=auth_required`. Mit Session: Rolle aus `app_metadata.role` (nur serverseitig setzbar), Fallback `profiles.role` (DB). Kein admin/superadmin → Redirect `?error=admin_required`. DB-Fehler → **isAdmin=false** (fail-closed, `proxy.ts:148-152`). Middleware-Exception → Redirect (fail-closed, `proxy.ts:164-173`). `user_metadata` wird bewusst **nie** ausgewertet (Self-Escalation-Schutz, `proxy.ts:133-139`). |
| **Fail-Closed ohne Rollenprüfung** | `/kunde/zahlungsdaten`, `/kunde/dokumente`, `/engel/dokumente` | Ohne Session → sofort Redirect. |
| **Fail-Soft** | übrige `/kunde/**`, `/engel/**`, `/fahrer/*` (außer register) | Ohne Session → Seite lädt, Client-Session-Recovery + client-seitiger Redirect (bewusste UX-Entscheidung, WhatsApp-Style). |
| **CSRF (alle Matcher-Pfade inkl. `/api/**`)** | POST/PUT/PATCH/DELETE | Origin ≠ Host und nicht `*.alltagsengel.care`/`localhost:3000` → **403** (`proxy.ts:40-49`). |
| **API-Routen (`/api/admin/*`)** | 10 route.ts | **Nicht** von der Middleware rollen-geprüft (Middleware prüft Rolle nur für Pfade, die mit `/admin`/`/mis` beginnen — `/api/admin` beginnt mit `/api`). Eigene Guards: 4 Abrechnungs-Routen via `requireAdmin()` (`lib/abrechnung/require-admin.ts`: 401 ohne User, 403 ohne admin/superadmin-Profilrolle), `manage-role` prüft superadmin selbst. Übrige (invoices/generate-pdf, ocr, krankenfahrten, reset-password, pricing) haben eigene, route-interne Checks unterschiedlicher Tiefe — **nicht Teil dieser P0-Abnahme, Einzelreview empfohlen (P1)**. |
| **Server Actions** | — | Keine vorhanden (`grep -rln "'use server'" app lib` → 0 Treffer). |
| **Edge Functions** | `supabase/functions/account-hard-delete` | Eine einzige; läuft in Supabase, nicht hinter der Next-Middleware — Auth dort funktionsintern. |

### Testausgabe P0-1 (vollständig, `--reporter=verbose`, Lauf 2026-08-01 14:32)

```
 ✓ P0-1: Admin-Routenschutz (Fail-Closed) > nicht angemeldeter Benutzer → Redirect von /admin
 ✓ P0-1: Admin-Routenschutz (Fail-Closed) > nicht angemeldeter Benutzer → Redirect von /mis
 ✓ P0-1: Admin-Routenschutz (Fail-Closed) > nicht angemeldeter Benutzer → Redirect von /kunde/zahlungsdaten (sensibel)
 ✓ P0-1: Admin-Routenschutz (Fail-Closed) > normaler Benutzer (rolle=kunde) → kein Admin-Zugriff
 ✓ P0-1: Admin-Routenschutz (Fail-Closed) > Engel-Benutzer → kein Admin-Zugriff
 ✓ P0-1: Admin-Routenschutz (Fail-Closed) > Admin-Benutzer (app_metadata) → Zugriff erlaubt
 ✓ P0-1: Admin-Routenschutz (Fail-Closed) > Superadmin → Zugriff erlaubt
 ✓ P0-1: Admin-Routenschutz (Fail-Closed) > Admin per DB-Fallback (app_metadata leer) → Zugriff erlaubt
 ✓ P0-1: Admin-Routenschutz (Fail-Closed) > DB-Fallback schlägt fehl → Fail-Closed, kein Zugriff
 ✓ P0-1: CSRF-Schutz > Cross-Origin POST → 403 CSRF
 ✓ P0-1: CSRF-Schutz > Same-Origin POST → erlaubt
 ✓ P0-1: CSRF-Schutz > Subdomain-Origin → erlaubt
 ✓ P0-1: Middleware Error Handling > Middleware-Exception auf Admin-Route → Fail-Closed

 Test Files  1 passed (1) · Tests  13 passed (13) · Duration 198ms · Exit 0
```

(stderr-Zeilen `Admin DB check failed: Error: DB connection failed` und `Middleware error: Error: Supabase unreachable` stammen aus den zwei Fail-Closed-Negativtests selbst — erwartet.)

---

## 5. IK-Konfiguration

### Frühere Fundstellen des Literals (Stand `6f41d87^`, vor dem Fix)

| Datei | Art |
|---|---|
| `lib/abrechnung/edifact-generator.ts:42` | `export const ALLTAGSENGEL_IK = '460629986'` — **Produktivcode** |
| `lib/abrechnung/leistungsnachweis-pdf.ts:35` | `ik: '460629986'` — **Produktivcode** |
| `app/admin/abrechnung/einstellungen/page.tsx:14` | `const EIGENE_IK = '460629986'` — **Produktivcode** |
| `app/api/leistungsnachweis/route.ts:42` | `process.env.ALLTAGSENGEL_IK_NUMMER \|\| '460629986'` — **Produktivcode (Fallback)** |

### Heutige Treffer von `grep -rn '460629986' --include='*.ts' --include='*.tsx'` (ohne node_modules/.next/native)

Alle verbliebenen Treffer sind **keine** funktionalen String-Literale mehr:

- **Kommentare/Doku:** `einstellungen/page.tsx:5`, `leistungsnachweis-pdf.ts:9`, `zertifikate.ts:4`, `edifact-generator.ts:23`, `edifact-validator.ts:31` (Prüfziffern-Beispiel), `lib/organizations/ik.ts:11` (Referenz-Rechnung)
- **UI-Platzhalter:** `app/onboarding/page.tsx:208` (`placeholder="9 Ziffern, z. B. 460629986"`)
- **Testcode/-Fixtures:** `__tests__/security/p0-5-no-hardcoded-ik.test.ts`, `lib/abrechnung/secon.test.ts`
- **Kodiert in der Stamm-Org-UUID:** `lib/organizations/types.ts:6` (`DEFAULT_ORG_ID = '00000000-0000-4000-8000-000460629986'`) — dies ist die dokumentierte Standard-Organisations-ID, kein IK-Absenderwert; `getOrgIK()` löst die tatsächliche IK dagegen über DB/Env auf.

### Neues Konfigurationsmodell (`lib/config/org-config.ts`)

`getOrgIK(supabase, organizationId = DEFAULT_ORG_ID)` — Auflösungsreihenfolge:

1. **DB:** `organizations.ik_nummer` der Ziel-Organisation (greift, sobald Migration `20260801_phase3_multi_mandant_saas.sql` live ist)
2. **Env:** `ALLTAGSENGEL_IK` oder `NEXT_PUBLIC_ALLTAGSENGEL_IK`
3. **Fehler:** `throw new Error('IK-Nummer nicht konfiguriert: …')`

- **Verhalten bei fehlender IK:** kein stiller Fallback — Exception zur Laufzeit (fail-fast). Aufrufer (Abrechnungs-Seiten/API) schlagen sichtbar fehl, statt mit falscher IK abzurechnen.
- **Verhalten bei ungültiger IK:** `getOrgIK()` selbst validiert nicht; die Prüfziffern-Validierung (Luhn über Stellen 3–8, `lib/organizations/ik.ts::validateIkNummer`) greift bei der **Eingabe** (Onboarding-Formular) und im EDIFACT-Validator. Restrisiko: eine direkt in DB/Env gesetzte fehlerhafte IK würde durchgereicht — Empfehlung (P2): `validateIkNummer()` zusätzlich in `getOrgIK()` aufrufen.

### Testausgabe P0-5 (vollständig, `--reporter=verbose`, Lauf 2026-08-01 14:32)

```
 ✓ P0-5: keine hartcodierte IK-Nummer (Literal 460629986) im App-/Lib-Code > kein app/ oder lib/-Quellcode enthält die IK als String-Literal
 ✓ P0-5: lib/config/org-config.ts existiert und wird genutzt > exportiert getOrgIK()
 ✓ P0-5: … > liest primär aus der organizations-Tabelle, dann aus ALLTAGSENGEL_IK (Env), sonst Fehler
 ✓ P0-5: … > lib/abrechnung/leistungsnachweis-pdf.ts ruft getOrgIK() auf, statt die IK selbst zu kennen
 ✓ P0-5: … > app/admin/abrechnung/einstellungen/page.tsx ruft getOrgIK() auf, statt die IK selbst zu kennen
 ✓ P0-5: … > app/admin/abrechnung/page.tsx ruft getOrgIK() auf, statt die IK selbst zu kennen
 ✓ P0-5: … > app/api/leistungsnachweis/route.ts ruft getOrgIK() auf, statt die IK selbst zu kennen
 ✓ P0-5: … > edifact-generator.ts exportiert keine ALLTAGSENGEL_IK-Konstante mehr (absender_ik ist jetzt Pflichtparameter)

 Test Files  1 passed (1) · Tests  8 passed (8) · Duration 339ms · Exit 0
```

---

## 6. SECON-Architekturentscheidung

`audit/SECON_ARCHITECTURE_DECISION.md` (Commit `5b1e767`, 105 Zeilen) liegt vor und ist in sich schlüssig. Kernaussagen (vollständiger Text im Dokument selbst):

- **Entscheidung:** efy care baut **kein** eigenes SECON (Anlage 16). Übermittlung an Datenannahmestellen läuft zentral über `lib/abrechnung/secon.ts` im Alltagsengel-Backend; efy care erzeugt nur unverschlüsselte PLGA/PLAA + Auftragsdatei.
- **Begründung (4 Punkte):** (1) `node-forge`/`node:zlib` sind Node.js-spezifisch, ein React-Native-Port wäre eine Neuimplementierung der CMS-Krypto-Schicht inkl. erneuter Zertifizierung; (2) ITSG-Zertifikate sind IK-/Organisations-gebunden, nicht Client-gebunden; (3) private PKCS#12-Schlüssel gehören nicht auf Mobilgeräte; (4) SFTP-Zugangsdaten je Kostenträger nicht auf Handys spiegeln.
- **Zielarchitektur:** efy-care-App → POST an (noch zu bauenden) org-bewussten Alltagsengel-Endpunkt → SECON (Signieren→Komprimieren→Verschlüsseln, Org-Zertifikat aus `abrechnung_zertifikate`) → SFTP an Datenannahmestelle. Bis dahin: manueller EDIFACT-Download.
- **Konsequenzen:** kein node-forge-Port; ein Endpunkt für mehrere Organisationen (Vorarbeit durch P0-2/P0-5); Zertifikatsverwaltung bleibt zentral in `app/admin/abrechnung/einstellungen`.

---

## 7. Gesamtergebnis und Empfehlung

### Abnahme-Feststellungen

| Prüfpunkt | Ergebnis |
|---|---|
| P0-1 aktiv + belegt | ✅ `middleware.ts` verdrahtet `proxy.ts`; 13/13 Tests grün gegen die echte `proxy()`-Funktion |
| P0-5 behoben + belegt | ✅ 0 funktionale IK-Literale in app/+lib/; 8/8 Tests grün; fail-fast ohne Konfiguration |
| SECON-Entscheidung dokumentiert | ✅ vollständig, technisch nachvollziehbar |
| Commits gepusht | ✅ lokal = origin/audit/production-hardening |
| Test-Widerspruch | ✅ geklärt: 61 = 21 Vitest (Alltagsengel) + 40 Vitest (efy care); hessen-plz läuft im separaten node:test-Runner, 2 dortige Fehler sind veraltete Assertions nach bewusster Radius-Erhöhung 15→25 km (`c4195df`), vorbestehend, kein P0-Bezug, kein Produktfehler |
| Keine Produktivänderung durch Abnahme | ✅ nur Tests + Doku |

### Offene Punkte (kein P0, vor/mit Phase 3 einplanen)

1. **P1:** `/api/admin/*`-Routen ohne `requireAdmin()` einzeln reviewen (invoices/generate-pdf, ocr, krankenfahrten, reset-password, pricing) — Middleware deckt sie nur mit CSRF ab.
2. **P1:** Vercel-Preview-Smoke-Test (`curl -I /admin` → 307) als E2E-Bestätigung der Middleware in echter Edge-Runtime.
3. **P2:** 2 Assertions in `lib/hessen-plz.test.ts` an 25-km-Radius anpassen; `tsx` als devDependency (sonst ist `npm run test:unit` in frischen Clones kaputt).
4. **P2:** `validateIkNummer()` in `getOrgIK()` nachziehen (DB-/Env-Werte prüfziffern-validieren).
5. **Voraussetzung Live-Betrieb:** `ALLTAGSENGEL_IK` im Vercel-Env setzen ODER Migration `20260801_phase3_multi_mandant_saas.sql` anwenden — sonst wirft die Abrechnung zur Laufzeit (gewollt fail-fast, aber betrieblich vorzubereiten).

### Empfehlung

> **GO für Phase 3.**
> Die Alltagsengel-P0-Fixes (P0-1, P0-5) sind implementiert, getestet (21/21 Vitest, Exit 0), gepusht und rollback-fähig. Die zwei roten node:test-Fälle sind nachweislich veraltete Test-Erwartungen einer vorherigen, bewussten Produktentscheidung (Match-Radius 15→25 km) ohne Sicherheits- oder P0-Bezug. Die offenen Punkte oben sind P1/P2-Hygiene und blockieren den Phase-3-Start nicht — Punkt 5 (IK-Env bzw. Migration) muss vor dem ersten produktiven Abrechnungslauf erledigt sein.
