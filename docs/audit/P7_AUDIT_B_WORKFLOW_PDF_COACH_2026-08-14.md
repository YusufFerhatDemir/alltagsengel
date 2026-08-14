# Phase 7 — Agent B: Workflow/PDF/PflegeCoach/Mobile-Audit

**Datum:** 14.08.2026 (Abend)
**Scope:** Workflow, PDF, PflegeCoach, Mobile/A11y/CI
**Basis:** Commit d91d773 (aktuell live)
**Methodik:** Unabhängige Code-Prüfung durch 3 parallele Explore-Agents + eigene Verifikation (Read/grep/Node-Repro/tsc/vitest). Keine Übernahme von Ergebnissen aus Parallel-Audits.

**Ergebnis in Kürze:** 1 kritischer Bug gefunden und **live gefixt** (Leistungsnachweis-PDF war komplett kaputt). Alle anderen geprüften Bereiche PASS. Ein bekanntes Coach-Risiko (Freischaltungs-Gate) wurde unabhängig reproduziert und bestätigt — Verhalten unverändert wie gefordert.

---

## 1. PDF-Erzeugung: DejaVuSans vs. Helvetica

| Datei | Font | Status |
|---|---|---|
| `lib/pdf/briefkopf.ts` | DejaVuSans/-Bold, `embedFont(bytes, {subset:true})`, `registerFontkit` via aufrufende Route | OK |
| `app/api/admin/invoices/[id]/generate-pdf/route.ts` | DejaVuSans, `registerFontkit(fontkit)` vor `loadPdfFonts()` (Z. 188-194) | OK |
| `app/api/leistungsnachweis/route.ts` | DejaVuSans, aber **`registerFontkit` fehlte** | **P0 — GEFIXT** |
| `lib/pilot/voraussetzungen.ts` | Kein PDF-Generator, nur Existenz-Check der Font-Dateien (fail-closed, `pflicht:true`) | OK, aber lückenhaft (s.u.) |
| `lib/billing/dunning/mahnung-pdf.ts` | Kein pdf-lib — reines HTML mit `font-family: 'DejaVu Sans', Arial` (Browser-Rendering, kein Encoding-Risiko) | OK |
| `lib/abrechnung/leistungsnachweis-pdf.ts` | Kein pdf-lib — HTML-Blob, clientseitig gedruckt | OK |

**grep-Vollscan** (`Helvetica`, `StandardFonts` über `app/` + `lib/`): keine einzige echte Verwendung von `StandardFonts.Helvetica`. Alle Treffer sind Kommentare, die bewusst vor Helvetica warnen, plus ein unkritischer CSS-Font-Stack-Fallback (`'Helvetica Neue'`) in einem HTML/CSS-Kontext.

### P0-Fund: `app/api/leistungsnachweis/route.ts` — Route war komplett defekt

`pdfDoc.embedFont()` mit Custom-TTF (DejaVuSans) verlangt zwingend eine vorher registrierte Fontkit-Instanz (`pdfDoc.registerFontkit(fontkit)`). Diese Route importierte `@pdf-lib/fontkit` nirgends und rief die Registrierung nie auf. **Empirisch reproduziert** (Node-Repro gegen installierte pdf-lib-Version):

```
Error: Input to `PDFDocument.embedFont` was a custom font, but no `fontkit`
instance was found. You must register a `fontkit` instance with
`PDFDocument.registerFontkit(...)` before embedding custom fonts.
```

→ **Jeder Aufruf von `GET /api/leistungsnachweis` (offizieller Monats-Leistungsnachweis für Pflegekassen) warf einen 500er.** Zusätzlich fehlte der Font-Pfad in `next.config.ts` `outputFileTracingIncludes` — selbst nach Fix des Fontkit-Problems wäre die Route auf Vercel mit `ENOENT` gescheitert (File-Tracing pro Serverless-Function ist strikt, `public/` wird nicht automatisch mitgebündelt).

**Fix (dieser Commit):**
- `app/api/leistungsnachweis/route.ts`: `import fontkit from '@pdf-lib/fontkit'` ergänzt, `pdfDoc.registerFontkit(fontkit)` direkt nach `PDFDocument.create()` eingefügt — identisches Muster wie in der bereits produktiv laufenden `generate-pdf`-Route.
- `next.config.ts`: neuer Eintrag `outputFileTracingIncludes['/api/leistungsnachweis']` mit beiden DejaVuSans-Dateien.
- Verifiziert: `tsc --noEmit` → 0 Fehler; Node-Repro mit identischem Import-/Registrierungsmuster gegen die echten Font-Dateien aus `public/fonts/` → PDF mit Umlauten/türkischen Zeichen (Ä Ö Ü ß ş ç ğ) erfolgreich erzeugt (803.874 Bytes).

**Nicht behoben, nur dokumentiert (kein P0):**
- Kommentar `app/api/leistungsnachweis/route.ts:54` referenziert „Helvetica ist WinAnsi" — irreführend/veraltet, da der Font tatsächlich DejaVuSans ist. Kosmetisch, keine Funktionsauswirkung.
- `lib/pilot/voraussetzungen.ts` prüft nur Dateiexistenz der Fonts, nicht die `registerFontkit`-Verdrahtung pro Route. Der oben gefundene Bug wäre vom Pilot-Ampel-Check „PDF-Schriften" **nicht** erkannt worden (hätte grün angezeigt). Empfehlung für künftige Phase: Health-Check um einen echten Smoke-Test (PDF mit 1 Umlaut erzeugen) statt nur Dateiexistenz erweitern.

---

## 2. PflegeCoach E2E-Flow

Flow **vollständig im Code vorhanden**: Produktseite (`app/pflegecoach/start/page.tsx`) → Checkout (`app/pflegecoach/checkout/page.tsx` + `app/api/coach/checkout/route.ts`) → Stripe-Webhook (`app/api/coach/webhook/route.ts`) → Nutzung (Gate über `lib/coach/api-auth.ts`) → Kündigung (`POST /api/coach/abo` mit `aktion: 'kuendigen'`, inkl. separatem Widerruf §355 BGB).

- **COACH_PREISE_FREIGEGEBEN** (`lib/coach/pricing.ts:33/43-45`): Default aus (nur exakter String `'true'` aktiviert), bestätigt durch `.env.example:127` und Unit-Test.
- **COACH_FREISCHALTUNG_PFLICHT** (`lib/coach/config.ts:11/35-37`): Default aus, gleiches Muster.
- **Bekanntes Risiko unabhängig reproduziert:** `istVerkaufBereit()` (`pricing.ts:271-301`) prüft nur Preisfreigabe/Stripe-Key/Price-ID, **nicht** `freischaltungPflicht()`. Wird nur `COACH_PREISE_FREIGEGEBEN=true` gesetzt (ohne `COACH_FREISCHALTUNG_PFLICHT=true`), verkauft und bucht der Weg korrekt ab, aber der einzige Content-Gate (`pruefeSchreibzugriff`, `api-auth.ts:156`) bleibt für alle Nutzer gleichermaßen offen — Bezahlstatus (`hatZugang`) fließt in keine der 10 Coach-Content-Routen ein. Beide Schalter müssen zusammen gesetzt werden, sonst ist das Bezahl-Gate wirkungslos. **Verhalten nicht verändert**, wie vorgegeben — nur bestätigt.
- **COACH_DIPA_MODUS** (`lib/coach/config.ts:10/21-23`): Default `false`, bestätigt durch Code, `.env.example:97`, Unit-Tests, Verwendung in Produktseite und Go-Live-Status. **Nicht angetastet.**
- **Stripe Price IDs:** keine erfundenen echten IDs im Code. `stripePriceId` fällt ohne gesetzte Env-Var auf `''` zurück, `.env.example` markiert Platzhalter explizit (`price_...`, auskommentiert), fail-closed mit Code `PREIS_ID_FEHLT` pro Tarif.
- **Tests:** `npx tsx --test $(find lib/coach -name '*.test.ts')` → **176/176 PASS**, 0 Fail. (Diese Tests laufen über `node:test`/tsx, nicht vitest — liegen außerhalb des vitest-`include`-Patterns.)

---

## 3. Mobile/Responsive

`app/layout.tsx:12-20`:
```ts
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  ...
}
```
`userScalable: true`, `maximumScale: 5` — Zoom explizit erlaubt (Kommentar verweist bewusst auf Zielgruppe Senioren). **Kein WCAG-1.4.4-Verstoß.**

---

## 4. Accessibility

- `aria-label`: 112 Vorkommen in 40 von 357 `.tsx`-Dateien unter `app/` (~11 % der Dateien) — gezielt vorhanden, nicht flächendeckend, aber kein Totalausfall.
- **axe-core E2E-Test vorhanden:** `e2e/pflegecoach-axe.spec.ts` (275 Zeilen) — läuft gegen `wcag2a/2aa/21a/21aa` auf 3 öffentlichen Seiten, inkl. Formular-Interaktionstest, eigenem Kontrastrechner für `.pc-btn` (wegen dokumentiertem axe-„incomplete"-Fall) und Landmark-/Heading-Struktur-Check. Läuft laut `ci.yml:145` im E2E-Job.
- Kontrast/`globals.css`: reines Dunkel-Theme, kein klassisches Hellgrau-auf-Weiß-Muster. `--ink5: #6A5E4E` als dunkelste Ink-Abstufung ist ein möglicher Kandidat für knappen Kontrast bei Fließtext-Verwendung — nur grob gescannt, keine konkrete Fundstelle mit tatsächlichem Kontrastverstoß identifiziert.

---

## 5. Workflow/CI

`.github/workflows/ci.yml`: `timeout-minutes` gesetzt (`verify`: 30, `e2e`: 25, Playwright-Install-Schritt: 10). `concurrency`-Block vorhanden (`group: ci-${{ github.ref }}`, `cancel-in-progress: true`).

**Nebenbefund (klein):** `.github/workflows/deploy-chairmatch.yml` hat **kein** `timeout-minutes` im `deploy`-Job — läuft im Worst Case bis zum GitHub-Default von 6 Stunden. Concurrency-Block ist dort vorhanden. Nicht Teil des Kern-Scopes (anderes Projekt/Repo-Deploy), daher nur als Hinweis vermerkt, nicht gefixt.

`vercel.json` Cron-Jobs: alle 4 Einträge (`mahnlauf`, `drip`, `review-request`, `indexnow`) haben gültige Cron-Syntax und referenzieren existierende Routen.

---

## 6. next.config.ts Security-Headers

Alle 5 angefragten Header vollständig gesetzt: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy` (dynamisch), `Strict-Transport-Security` (`max-age=63072000; includeSubDomains; preload`), plus zusätzlich `X-DNS-Prefetch-Control`. **Keine Lücke.**

Nebenbeobachtung: CSP `script-src` enthält `'unsafe-inline' 'unsafe-eval'` (kein Nonce/Hash-Ansatz) — schwächt XSS-Schutzwirkung ab, war nicht Teil der gestellten Frage, nur vermerkt.

---

## 7. TypeScript

`npx tsc --noEmit` → **0 Fehler** (vor und nach dem PDF-Fix erneut verifiziert).

---

## 8. Tests (vitest)

Voller Lauf zunächst mit 4 Fehlschlägen (`check-billing-gate`, `rechnung-unterschriftspflicht`, `vp-kzp-budget-nachberechnung`, `mittel-fixes-2026-08-14-pglite` — alle `beforeAll`-Hook-Timeout nach 60s beim PGlite-Setup). **Ursache identifiziert:** Ressourcen-Konkurrenz durch parallel laufende Audit-Agents in derselben Session, nicht Code-Regression. Isolierter Nachlauf derselben 4 Dateien:

```
Test Files  4 passed (4)
     Tests  85 passed (85)
```

**Gesamtbild (voller Lauf + isolierter Nachlauf zusammengeführt): 2877 Tests, 0 Fail** — deckt sich mit dem bekannten Referenzwert aus Phase 9.

---

## 9. Build-Konfiguration

`NODE_OPTIONS=--max-old-space-size=4096` konsistent an 3 Stellen gesetzt: `package.json` (`build`, `build:webpack`, `analyze`), `vercel.json` (`build.env`), `.github/workflows/ci.yml`. Begründung im Code dokumentiert (reproduzierter OOM bei 543 Routen auf Standard-8-GB-Buildern).

---

## Zusammenfassung

| # | Bereich | Status |
|---|---|---|
| 1 | PDF-Fonts (5 Routen) | 1× P0 gefunden **und gefixt** (`/api/leistungsnachweis`), Rest OK |
| 2 | PflegeCoach E2E-Flow | Vollständig vorhanden, Coach-Freischaltungs-Risiko unabhängig bestätigt (unverändert) |
| 3 | Mobile/Viewport | OK |
| 4 | Accessibility | OK (axe-Test vorhanden und in CI verdrahtet) |
| 5 | CI/Workflow | OK (1 kleiner Nebenbefund: fehlender Timeout in Fremd-Workflow) |
| 6 | Security-Headers | OK, vollständig |
| 7 | TypeScript | 0 Fehler |
| 8 | Tests | 2877/0 fail (nach Auflösung Ressourcenkonkurrenz) |
| 9 | Build-Konfiguration | OK |

**Geänderte Dateien in diesem Audit:**
- `app/api/leistungsnachweis/route.ts` (fontkit-Import + Registrierung)
- `next.config.ts` (outputFileTracingIncludes-Eintrag)
