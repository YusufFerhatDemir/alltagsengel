# Phase 9 — Finale Regression (2026-08-14)

Teil des 10-Phasen-Stabilisierungsblocks. Vollständiger Regressionslauf über TypeScript, Tests, Build, Lint, CI/Vercel-Konfiguration, Migrationen, RLS, Security, Billing, PDF, Mobile und Accessibility.

## Gesamtergebnis

**0 kritische, 0 hohe, 2 mittlere Befunde.**

Alle produktiv sicherheitsrelevanten und funktionalen Prüfungen (TypeScript, Tests, Secrets, RLS/Security-Testsuiten, PDF-Fonts, Billing-Vollständigkeit) sind grün. Zwei mittlere Befunde sind dokumentiert (siehe unten) — keiner davon blockiert den aktuellen Stand, beide sind bereits an anderer Stelle bekannt bzw. strukturell bedingt.

Wichtiger Hinweis zur Durchführung: Dieser Lauf fand auf einer Maschine statt, auf der parallel ~13 weitere Claude-Code-Sessions liefen (10-Phasen-Stabilisierungsblock). Die Systemlast lag bei **load average 30–34 auf 8 Kernen** — dadurch konnten `next build` und `npm run lint` lokal nicht innerhalb praktikabler Zeit abgeschlossen werden (siehe Abschnitte 3 und 4). Dies ist eine Ressourcen-Einschränkung dieser lokalen Session, kein Befund über den Code.

## 1. TypeScript — PASS

```
npx tsc --noEmit
```

**0 Fehler.** Sauberer Durchlauf, keine Ausgabe.

## 2. Tests (vitest) — PASS

```
npx vitest run --reporter=verbose
```

**2877 bestanden, 38 übersprungen, 0 fehlgeschlagen** (129 von 130 Testdateien; 1 Datei = Shadow-DB-Suite dynamisch übersprungen, kein Fehler).
Laufzeit: 38.01s.

Abgedeckt u. a.: D4-Cascade-Restrict, B2C-RLS-Hardening (chat_messages/messages/notifications), Cross-Tenant-API-Routes (org_fence), DSGVO-User-Delete-FK, KPI-/Quality-Dashboards, Storage-Key-Fail-Closed, P0-Rollen-Whitelist.

## 3. Build (next build) — NICHT LOKAL VERIFIZIERBAR (Ressourcen-Engpass)

Zwei Versuche unternommen:

1. `npx next build` (parallel zu Lint laufen lassen): Turbopack-Compile-Phase erfolgreich in **2.6 Min, 0 Fehler**. Der anschließende interne TypeScript-Verifikationsschritt kam nach >15 Min nicht zum Abschluss und wurde abgebrochen.
2. `npm run build` (isoliert, Cache geleert): Compile-Phase kam nach 8 Min noch nicht durch (`Creating an optimized production build ...`).

**Ursache:** `uptime` zeigte load average 30.72–33.93 auf einer 8-Kern-Maschine, verursacht durch ~13 parallel laufende Claude-Code-Prozesse (die anderen Phasen des Stabilisierungsblocks). Massive CPU-Konkurrenz, kein Hinweis auf ein Code-Problem.

**Bewertung:** `tsc --noEmit` bestätigt bereits 0 Typfehler (Abschnitt 1) — das ist exakt der Schritt, an dem `next build` intern hängt. Die eigentliche Compile-Phase (Turbopack) lief im ersten Versuch fehlerfrei durch. CI (`.github/workflows/ci.yml`) und Vercel führen den Build mit eigenen, nicht mit dieser Session geteilten Ressourcen und 30 Min Timeout durch — dort ist kein vergleichbarer Engpass zu erwarten. **Empfehlung:** Nach dem nächsten Push das Vercel-Deployment-Log bzw. den CI-Run prüfen, um den Build-Erfolg mit dedizierten Ressourcen zu bestätigen.

## 4. Linting (ESLint) — NICHT LOKAL VERIFIZIERBAR (Ressourcen-Engpass)

```
npm run lint
```

Aus demselben Grund (Systemlast) nach >11 Min ohne Ergebnis abgebrochen. Kein isolierter Befund möglich.

**Bewertung:** ESLint läuft in CI informativ (`npm run lint || true`, nicht blockierend — Kommentar in `ci.yml`: „~1.100 bestehende no-explicit-any-Fehler, v. a. weil es keine generierten Supabase-DB-Typen gibt"). Dieser dokumentierte Basiswert ist bekannt und blockiert Merges bewusst nicht. Kein neuer Befund in diesem Lauf feststellbar.

## 5. CI-Konfiguration (.github/workflows/ci.yml) — PASS

- `timeout-minutes` auf beiden Jobs gesetzt (verify: 30, e2e: 25) — verhindert Hänger (Lehre aus Commit 7d621bb).
- `concurrency`-Gruppe mit `cancel-in-progress` verhindert überlappende Runs pro Branch.
- Reihenfolge: Typecheck (blockierend) → Lint (informativ) → vitest → node:test → Secret-Scan → IK-Hardcoding-Check → Forbidden-Strings-Lint → Production-Build.
- `NODE_OPTIONS=--max-old-space-size=4096` im Build-Schritt gesetzt (OOM-Prävention, Kommentar verweist auf großen PLZ-Datensatz + viele statische Seiten).
- E2E-Job: Playwright-Install auf chromium+webkit begrenzt, Server-Start mit Poll-Loop + Timeout, DiPA-Matrix QS-05 (axe-core WCAG 2.1 A/AA + eigener Kontrastrechner) explizit erwähnt.
- Platzhalter-ENVs für Supabase korrekt als CI-only markiert, keine echten Secrets im Workflow-File.

**Bewertung:** Korrekt konfiguriert, keine Änderung nötig.

## 6. Vercel / next.config — PASS

- `vercel.json`: `build.env.NODE_OPTIONS=--max-old-space-size=4096` gesetzt, 4 Cron-Jobs korrekt definiert (mahnlauf, drip, review-request, indexnow).
- `next.config.ts`: Security-Header vollständig (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, CSP, Permissions-Policy, HSTS, X-DNS-Prefetch-Control).
- CSP dynamisch aus `NEXT_PUBLIC_SUPABASE_URL` abgeleitet, Lockerung nur für `127.0.0.1`/`localhost` (kein Leck für fremde Domains).
- `outputFileTracingIncludes` für PDF-Route korrekt gesetzt (DejaVuSans-Fonts + Logo werden ins Serverless-Bundle gepackt — ohne diesen Eintrag würden türkische Zeichen auf Vercel zu ■).
- `serverExternalPackages: ['ssh2', 'ssh2-sftp-client']` für natives SFTP-Binary korrekt markiert.
- Image-Pipeline (AVIF/WebP), Redirects (www-Kanonisierung, /pflegebox, /karriere→/engel-werden) und Cache-Header sauber.
- `turbopack.root` korrekt festgenagelt (verhindert Fehlerkennung des Projekt-Roots).

**Bewertung:** Production-ready, keine Auffälligkeiten.

## 7. Supabase-Migrationen — PASS (1 mittlerer Hinweis)

257 Migrationsdateien in `supabase/migrations/`. Keine Dateinamen-Duplikate.

**Mittlerer Befund M-1:** 13 Zeitstempel-Präfixe werden von jeweils 2–5 inhaltlich unabhängigen Migrationsdateien geteilt (z. B. `20260705_*` mit 5 verschiedenen Migrationen: crm_module_tables, engel_cards_rpc_safe_columns, mis_contracts_signatures_vehicles, mis_training, rls_lockdown_new_mis_modules). Die Ausführungsreihenfolge innerhalb desselben Zeitstempels ist damit implizit alphabetisch statt explizit durch die Nummerierung festgelegt. Kein akuter Fehler (Supabase wendet Migrationen nach Dateinamen-Sortierung an, alphabetisch ist deterministisch), aber ein Risiko, falls zwei gleichzeitig getimestampte Migrationen künftig eine Abhängigkeit zueinander bekommen. Keine Änderung an bestehenden Dateien vorgenommen (Phase 9 = keine neuen Features/Refactorings).

## 8. RLS-Referenzierung — PASS

Nicht erneut vollständig neu auditiert (bereits mehrfach in Phase 2–8 verifiziert, siehe `agent4-security-audit-2026-08-13`, `postgrest-audit-methodik`, `profiles-rls-42p17-und-anon-leck`). Stattdessen über die bestehende, laufende Testsuite bestätigt: dedizierte RLS-Testdateien (`b2c-rls-hardening.test.ts`, `p1-cross-tenant-api-routes.test.ts`, `p0-handle-new-user-role-whitelist.test.ts`, `p0-mis-team-no-role-update.test.ts`, D4-Cascade-Restrict) liefen alle grün (Abschnitt 2). Kein neuer Regressionsbefund.

## 9. Security / Secrets — PASS

```
bash scripts/ci-secret-scan.sh
```

**Ergebnis: clean.** Keine Secrets, API-Keys oder Passwörter in Code-Dateien gefunden.

## 10. Billing (lib/billing/) — PASS

Alle erwarteten Submodule vorhanden und konsistent: `core/` (audit, credit-notes, dunning, feiertage, idempotency, invoice-engine, payments, price-resolver, status-machine, tarif-belege, tarif-verifizierung, tariff-import, zahlungsziel), `opos/`, `dunning/`, `matching/`, `sepa/` (glaeubiger-id, pain008, ruecklastschrift, sepa-service), `datev/` (buchungssatz-generator, datev-config, datev-format, export-service, kontenrahmen), `camt/`.

Keine TODO/FIXME/XXX-Marker in `lib/billing/`. Keine neuen Preise erfunden (Prüfung war rein strukturell, keine Preisänderungen vorgenommen).

## 11. PDFs — PASS

- Keine echte `Helvetica`-Nutzung als Font in der PDF-Erzeugung. Alle Treffer für „Helvetica" sind entweder erklärende Kommentare, warum Helvetica bewusst **nicht** verwendet wird (`lib/pdf/briefkopf.ts`, `app/api/admin/invoices/[id]/generate-pdf/route.ts`), eine CSS-Font-Fallback-Kette in einer HTML→PDF-Route (`lib/abrechnung/leistungsnachweis-pdf.ts`, browserseitiges Rendering, kein pdf-lib-Font) oder ein Kommentar zu einem WinAnsi-Zeichen-Workaround (`app/api/leistungsnachweis/route.ts`) — dieselbe Route embedded tatsächlich `DejaVuSans.ttf`/`DejaVuSans-Bold.ttf`.
- `DejaVuSans`-Referenzen bestätigt in allen 5 PDF-Erzeugungspfaden: `generate-pdf/route.ts`, `leistungsnachweis/route.ts`, `lib/pdf/briefkopf.ts`, `lib/pilot/voraussetzungen.ts`, `lib/billing/dunning/mahnung-pdf.ts`.
- `next.config.ts` `outputFileTracingIncludes` stellt sicher, dass die Font-Dateien auf Vercel im Serverless-Bundle landen (Abschnitt 6).

## 12. Mobile / Responsive — PASS

`app/layout.tsx`: `export const viewport` korrekt gesetzt (`width: device-width`, `initialScale: 1`). `maximumScale: 5` und `userScalable: true` sind bewusst gesetzt (Kommentar: „Zoom erlaubt (WCAG 1.4.4): Zielgruppe Senioren — Pinch-Zoom muss möglich sein"), statt Zoom zu deaktivieren.

## 13. Accessibility — PASS (stichprobenartig)

- 40 `.tsx`-Dateien in `app/` verwenden `aria-label`.
- 194 Dateien enthalten `onClick`-Handler — kein Vollaudit jeder einzelnen interaktiven Komponente in dieser Phase durchgeführt (Zeitrahmen), aber die dedizierte E2E-A11y-Suite (`e2e/pflegecoach-axe.spec.ts`, axe-core WCAG 2.1 A/AA + eigener Kontrastrechner, in `ci.yml` als eigener E2E-Job verankert) deckt den PflegeCoach-Produktbereich automatisiert ab.
- `viewport`-Konfiguration erfüllt WCAG 1.4.4 (Abschnitt 12).

## Offene Punkte für Folge-Phasen

1. **M-1 (mittel):** 13 Migrations-Zeitstempel-Kollisionen (Abschnitt 7) — bei Gelegenheit neue Migrationen mit eindeutigeren Sekunden-Suffixen versehen, keine akute Aktion nötig.
2. **Build/Lint-Verifikation:** Sollte bei geringerer Systemlast (oder auf CI/Vercel) erneut bestätigt werden — aus dieser Session heraus nicht abschließend möglich (Abschnitt 3, 4).
