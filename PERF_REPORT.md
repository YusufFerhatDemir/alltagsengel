# Performance-Report — AlltagsEngel.care

**Stand:** 2026-04-17
**Fokus:** First-Load-JS (FLJS) pro Route, Code-Splitting, Critical-Path-Assets
**Next.js:** 16.2.0, React 19.2.3

---

## Analogie

Das Client-Bundle einer Next-App ist wie der Koffer, den Oma für eine Woche
Reha packt. Jede Bibliothek ist ein Ding im Koffer. Wenn du nichts sortierst,
schleppt die arme Frau auf jedem Stockwerk das Reise-Schachspiel, den Fön UND
den Rollator mit — obwohl sie in ihrem Zimmer nur den Rollator braucht. Next.js
macht den Koffer automatisch leichter, wenn man ihm per `dynamic()` oder
Route-Splitting hilft. Ohne diese Hilfe packt Next nach bestem Gewissen — was
meistens bedeutet, dass jede Page alles mitschleppt.

---

## Statische Analyse (ohne Build)

Weil `next build --profile` in der Sandbox ca. 3–5 Min. läuft und auf
Sentry-Upload-Auth wartet, habe ich den Report **statisch** aus Dependencies
+ Imports zusammengestellt. Die konkreten Byte-Werte bitte lokal nachmessen —
die Anleitung steht unten.

### Dependency-Schwergewichte (geschätzte Gzipped-Größen)

| Paket | Gzipped | Wo benutzt | Code-Split? |
|---|---|---|---|
| `tesseract.js` (+ WASM) | ~2.3 MB | `app/kunde/notfall/page.tsx` (OCR Rezept-Upload) | 🔴 Nein — `import Tesseract from 'tesseract.js'` static |
| `@sentry/nextjs` | ~90 KB | global (Error-Tracking) | ✅ auto via Next-SDK |
| `@supabase/ssr` + `supabase-js` | ~55 KB | jede Auth-nahe Route | ✅ tree-shakable |
| `next` Runtime | ~85 KB | immer | ✅ system |
| `react` + `react-dom` | ~45 KB | immer | ✅ system |
| `google-auth-library` | ~30 KB | nur Server-Routes | ✅ server-only |
| `resend` | ~15 KB | nur Server-Routes | ✅ server-only |
| `web-push` | ~25 KB | nur Server-Routes | ✅ server-only |
| `@capacitor/*` (9 Pakete) | nur im Capacitor-Bridge-Bundle | iOS/Android-Shell | ✅ excluded im Web-Build |

### 🔴 Problem 1: Tesseract statisch importiert

**Fundstelle:** `app/kunde/notfall/page.tsx`, Zeile 6:
```ts
import Tesseract from 'tesseract.js'
```

**Warum das schmerzt:**
- Jeder User, der `/kunde/notfall` ansteuert, lädt ~2.3 MB WASM + JS — obwohl
  nur ein Teil der Funktion (Rezept-Foto → OCR) Tesseract braucht.
- Wegen Next.js App-Router-Bundling könnte im schlimmsten Fall auch der
  `/kunde/*`-Segment-Root das Modul mit-bundeln (abhängig von Import-Graph).
- WASM-Init auf schwachen Mobiles (Zielgruppe: pflegende Angehörige, oft
  älteres Smartphone) dauert 2–5 Sekunden — *während der User schon auf dem
  Screen ist und rumklickt*.

**Fix-Pattern (nicht in dieser Session anwenden — Dokumentation only):**
```ts
// statisch:
import Tesseract from 'tesseract.js'

// besser: dynamisch nur wenn OCR-Button geklickt
const runOCR = async (imageBlob: Blob) => {
  const Tesseract = (await import('tesseract.js')).default
  const { data: { text } } = await Tesseract.recognize(imageBlob, 'deu')
  return text
}
```

Effekt: First-Load-JS für `/kunde/notfall` sollte von ~2.5 MB auf ~200 KB
fallen. Tesseract lädt erst, wenn der Nutzer tatsächlich fotografiert.

---

### 🟡 Problem 2: Null `next/dynamic`-Imports im ganzen Codebase

```bash
rg -l 'next/dynamic|dynamic\(' app/
# 0 Treffer
```

Das heißt: kein einziges schweres Widget ist nachgelagert geladen. Mögliche
Kandidaten zum Prüfen:

| Kandidat | Warum nachladbar |
|---|---|
| Chat-UI (`app/*/chat/page.tsx`) | Nur bei tatsächlicher Chat-Nutzung aktiv |
| Chart/Graph-Komponenten in `/mis` (KPI-Dashboards) | Admin-only, sollte nicht im Haupt-Bundle landen |
| QR-Code-Generator (falls verwendet für Notfall-Armband) | Nur im Profil-Edit |
| Signature-Pad / Stiftmalen (falls für Einwilligung verwendet) | Nur im Onboarding |

---

### 🟡 Problem 3: Build-Time Ignore-Flags

`next.config.ts`:
```ts
typescript: { ignoreBuildErrors: true },
eslint:     { ignoreDuringBuilds: true },
```

Beide sind *pragmatisch* (Deploy-Blocker vermeiden), aber langfristig:
- TS-Fehler, die nur im CI laufen, landen gerne in main. Die Playwright-
  Regression hilft teilweise, aber nicht gegen Type-Drift.
- Auf Sprint-3-Roadmap: `ignoreBuildErrors: false` umsetzen, dann schrittweise
  TS-Errors wegarbeiten. Die Archive-Dateien sollten über `tsconfig.json
  exclude` bzw. `tsconfig.strict.json` ausgeklammert werden.

---

## So misst du lokal (empfohlen vor jedem Release)

### 1. Bundle-Analyzer installieren + aktivieren

```bash
npm install --save-dev @next/bundle-analyzer
```

`next.config.ts` um den Analyzer erweitern (Beispiel, für lokales
Messen — für Production-Config einfach `ANALYZE` nicht setzen):

```ts
import type { NextConfig } from 'next'
import withBundleAnalyzer from '@next/bundle-analyzer'
import { withSentryConfig } from '@sentry/nextjs'

const baseConfig: NextConfig = {
  // bestehender Config bleibt unverändert
}

const analyzed = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})(baseConfig)

export default withSentryConfig(analyzed, {
  // Sentry-Config wie bisher
})
```

### 2. Build + Analyzer-HTML öffnen

```bash
ANALYZE=true npm run build
# → öffnet .next/analyze/client.html, .next/analyze/server.html
# → in den Treemaps die fetten Kästen anschauen
```

### 3. First-Load-JS pro Route aus `next build`-Output

Der Standard-Output enthält bereits eine Tabelle:

```
Route (app)                              Size     First Load JS
┌ ○ /                                    2.1 kB          98 kB
├ ○ /kunde/notfall                     4.5 kB         2.5 MB  ← auffällig
├ ○ /kunde/chat                        3.2 kB         142 kB
└ ○ /mis/dashboard                     8.1 kB         312 kB
```

**Ziel-Werte als Daumenregel:**
- Landing / Marketing: < 150 KB FLJS
- App-Seiten (Kunde/Engel): < 250 KB FLJS
- Admin/MIS (Power-User OK): < 400 KB FLJS
- Alles über 500 KB: Red Flag — Code-Split kandidat

---

## Low-Hanging-Fruits (nach Aufwand/Nutzen)

| # | Maßnahme | Aufwand | Erwartete FLJS-Ersparnis auf Hotpath |
|---|---|---|---|
| 1 | `tesseract.js` auf dynamic import | 15 min | ~2.3 MB auf `/kunde/notfall` |
| 2 | Chart-Lib in MIS (falls vorhanden) dynamisch | 30 min | ~50–150 KB auf MIS-Dashboards |
| 3 | `@sentry/nextjs` `tunnelRoute` bereits aktiv | ✓ done | — |
| 4 | `sourcemaps.deleteSourcemapsAfterUpload: true` bereits aktiv | ✓ done | — |
| 5 | `disableLogger: true` bereits aktiv | ✓ done | ~5–10 KB |
| 6 | Capacitor-Pakete aus Web-Build ausschließen | 1 h | unklar, bitte mit Analyzer prüfen |

---

## Non-Ziele (dokumentieren, aber nicht jetzt anfassen)

- **Font-Subsetting / System-Fonts:** Vercel-Fonts machen das gut automatisch
  — erst messen, bevor optimiert.
- **Image-CDN:** Next-Image-Domain-Allowlist prüfen, aber nicht kritisch.
- **Serverseitige Caching (`unstable_cache`):** Performance-sinnvoll, aber
  separate Überarbeitung — hängt mit Supabase-Query-Patterns zusammen und
  gehört in einen eigenen DB-Perf-Report.

---

## Checkliste

- [x] Statische Bundle-Analyse durchgeführt
- [x] Tesseract-Static-Import als P1-Performance-Issue dokumentiert
- [x] Build-Ignore-Flags als Sprint-3-Schuld festgehalten
- [x] Tesseract auf `dynamic import` umgestellt (2026-04-17, siehe Mitigation-Log)
- [ ] `@next/bundle-analyzer` hinzugefügt + einmal lokal laufen lassen
- [ ] First-Load-JS pro Route in CI-Artefakt loggen (z.B. via
  `next build` Output in PR-Kommentar — GitHub-Action `next-bundle-analyzer-action`)

---

## Mitigation-Log

### 2026-04-17 — Tesseract auf dynamic import umgestellt (PERF-P1)

**Vorher** (`app/kunde/notfall/page.tsx`, Zeile 6):
```ts
import Tesseract from 'tesseract.js'
```

**Nachher** (in `handlePhotoScan`, direkt vor `Tesseract.recognize(...)`):
```ts
// Dynamic Import: Tesseract (~2.3 MB WASM) erst laden, wenn Nutzer wirklich scannt
const { default: Tesseract } = await import('tesseract.js')
const result = await Tesseract.recognize(file, 'deu', { logger: ... })
```

**Begründung:** Tesseract wird nur im OCR-Pfad gebraucht (Kamera-Button „📷 Foto
aufnehmen") — nicht beim Seitenaufruf. Durch `dynamic import` fällt das ~2.3 MB
WASM-Paket aus dem First-Load-JS der Route `/kunde/notfall` raus und lädt erst
nach Interaktion. Erwartete First-Load-JS-Reduktion: von ~2.5 MB → ~200 KB für
diese Route.

**Verifiziert:** `npx tsc --noEmit` ohne neue Fehler (nur vorbestehende Fehler in
`archive/`, unrelated). Runtime-Smoketest steht noch aus — erfolgt beim nächsten
`npm run build` + Gerätetest.

**Bundle-Analyzer-Run steht noch aus** — ohne kann die tatsächliche Ersparnis
nicht auf 10 KB genau berichtet werden.

---

## Re-Run dieses Reports

Dieser Report ist statisch. Um die Zahlen wirklich zu wissen, einmal lokal
laufen lassen:

```bash
# 1. im Repo-Root
ANALYZE=true npm run build > bundle-report.txt 2>&1

# 2. Analyzer-HTML ansehen
open .next/analyze/client.html

# 3. Zahlen hier in diesem MD-File updaten, Datum neu setzen
```
