# Bundle-Size-Report — April 2026

> Erzeugt im Rahmen von **P1.4 Bundle-Size-Report**.
> Datum: 2026-04-19
> Next.js: 16.2.4 · React: 19.2.3
> Analyse-Tool: `@next/bundle-analyzer` 16.2.4 (Webpack-Modus)

## 1 Setup

`@next/bundle-analyzer` ist als Dev-Dependency installiert und konditional
in `next.config.ts` eingebunden:

```ts
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
})

export default withSentryConfig(withBundleAnalyzer(nextConfig), { ... })
```

NPM-Script:

```json
"analyze": "ANALYZE=true next build --webpack"
```

**Warum `--webpack`?** Next 16 nutzt Turbopack per Default. Der Bundle-Analyzer
(basiert auf `webpack-bundle-analyzer`) ist aktuell nicht Turbopack-kompatibel,
daher muss man explizit den Webpack-Builder anfordern. Der normale Dev- und
Production-Pfad (`npm run build`) bleibt Turbopack.

**Analogie:** Turbopack ist der neue Sportwagen — schnell, aber der
Röntgen-Apparat passt noch nicht rein. Für die Röntgen-Durchleuchtung
steigen wir kurz in den bewährten Kombi (Webpack) um.

Run:

```bash
npm run analyze
# Reports:
#   .next/analyze/nodejs.html     — Server-Bundle (Node-Runtime)
#   .next/analyze/edge.html       — Edge-Runtime (Middleware, Edge-APIs)
#   .next/analyze/client.html     — Client-Bundle (falls generiert)
```

## 2 Status der Messung

| Runtime  | Report generiert   | In diesem Report ausgewertet |
|----------|--------------------|------------------------------|
| Node.js  | ja (`nodejs.html`) | ja — Abschnitt 3             |
| Edge     | ja (`edge.html`)   | Kurzanalyse in 3.2           |
| Client   | nein *             | **siehe Abschnitt 4 — lokal nachziehen** |

\* Der Build brach in der Session-Sandbox ab, bevor der Client-Bundle erzeugt
wurde (FUSE-Mount + Symlink-Auflösung in `node_modules/tesseract.js`). Die
Analyse-Output-Dateien für Server/Edge waren zu dem Zeitpunkt bereits
geschrieben. Auf einer normalen Dev-Maschine (ohne FUSE-Mount) läuft der
Build komplett durch — siehe Abschnitt 4 für die Anleitung.

## 3 Server-Bundle (Node-Runtime)

### 3.1 Gesamt

| Metrik           | Wert         |
|------------------|--------------|
| Chunks total     | 184          |
| Parsed-Size      | **12,24 MB** |
| Gzip-Size        | **4,17 MB**  |
| Größter Chunk    | `3632.js` (1,36 MB parsed / 418 KB gzip) |

Hinweis: Server-Bundles sind *nicht* First-Load-JS-relevant. Sie werden nie
an Browser ausgeliefert. Aber sie zeigen, **was Edge-Functions und SSR-Server
laden müssen** — das wirkt auf Cold-Start-Zeiten und Memory-Footprint.

### 3.2 Top-10 größte Chunks (Server)

| # | Chunk                       | Parsed     | Gzip       |
|---|-----------------------------|-----------:|-----------:|
| 1 | `3632.js`                   | 1 359 971  |   418 021  |
| 2 | `../instrumentation.js`     |   985 523  |   311 399  |
| 3 | `6701.js`                   |   967 664  |   305 611  |
| 4 | `5382.js`                   |   841 827  |   363 204  |
| 5 | `209.js`                    |   841 824  |   363 211  |
| 6 | `4262.js`                   |   465 805  |   228 979  |
| 7 | `1822.js`                   |   465 804  |   228 976  |
| 8 | `7600.js`                   |   236 980  |    51 738  |
| 9 | `3199.js`                   |   227 793  |    61 857  |
|10 | `4060.js`                   |   191 769  |    49 571  |

### 3.3 Top-10 aggregierte Module (Server-Side)

Aggregiert nach Paket-Name. `entry modules (concatenated)` ist Webpack-
interne Zusammenfassung von tree-shakten Entry-Modulen und wird hier nicht
als einzelnes Paket gezählt.

| # | Paket / Modul                                 | Parsed    | Gzip      |
|---|-----------------------------------------------|----------:|----------:|
| 1 | `@zxcvbn-ts/language-common/wikipedia`        | 1 398 928 |   603 350 |
| 2 | `instrumentation.ts` (Sentry + OpenTelemetry) |   985 523 |   311 399 |
| 3 | `@zxcvbn-ts/language-common/passwords`        |   774 888 |   380 648 |
| 4 | `@zxcvbn-ts/language-de/commonWords`          |   215 316 |    92 864 |
| 5 | `@zxcvbn-ts/language-common/diceware`         |   124 236 |    61 028 |
| 6 | `@supabase` / GoTrueClient                    |   104 637 |    26 993 |
| 7 | `ponyfill.es2018.js` (web-streams-polyfill)   |    57 555 |    13 367 |
| 8 | `@zxcvbn-ts/language-de/lastnames`            |    45 912 |    19 802 |
| 9 | `request-cookies.js` (Next-internal)          |    45 828 |    19 760 |
|10 | `@zxcvbn-ts/language-common/adjacencyGraphs`  |    30 614 |    15 038 |

**Größter Kostenfaktor Server:** `@zxcvbn-ts` (Password-Strength-Dictionaries)
— in Summe **~2,60 MB parsed / ~1,17 MB gzip** über alle Dictionary-Shards.

**Das ist kein Problem für den Client**, weil `lib/password-validation.ts`
zxcvbn via `await import(...)` lazy lädt und die Dictionaries nur im
Server-Handler für `/api/auth/password-check` (P1.1 HIBP-Flow) beteiligt
sind. Für Cold-Start-Latenzen auf Edge ist der Ausschluss von Edge-Runtime
auf der Password-Check-API wichtig — bestätigt in 3.4.

**Zweitgrößter Kostenfaktor Server:** `instrumentation.ts` + `@sentry/nextjs`
(986 KB parsed / 311 KB gzip). Das ist erwartbar — Sentry instrumentiert
Server-Routen, Edge-Middleware und Client separat. Die Größe geht nicht
an Browser.

### 3.4 Edge-Runtime-Bundle

| Metrik           | Wert        |
|------------------|-------------|
| Report           | `edge.html` |
| Größe der HTML-Datei | 367 KB  |

Edge-Runtime ist Next-Middleware und ggf. Edge-API-Routes. Da wir zxcvbn-ts
**nicht** aus Edge-Code aufrufen (nur aus Node-Runtime-API), bleibt der
Edge-Bundle klein. Analogie: Edge ist ein Kurier auf dem Motorrad — nur
leichtes Gepäck (Cookies, Redirects, Auth-Checks), die schwere Fracht
(zxcvbn-Dictionaries) bleibt im LKW (Node-Runtime).

## 4 Client-Bundle — lokal nachziehen

Für den Client-Bundle (der die First-Load-JS-Zahlen liefert, gegen die die
Ziele `Landing < 150 KB` / `App-Routen < 200 KB` gemessen werden) ist ein
sauberer Webpack-Build nötig.

**Anleitung:**

```bash
cd /pfad/zu/alltagsengel
rm -rf .next
npm run analyze
open .next/analyze/client.html   # macOS
# oder manuell in Browser: file:///.../.next/analyze/client.html
```

Der Webpack-Build dauert auf einer normalen Dev-Maschine ca. 2–5 Minuten
(Next 16 + Webpack + Sentry-Source-Map-Upload entfällt, da lokal kein
`SENTRY_AUTH_TOKEN`).

Nach dem Build steht zusätzlich in der Terminal-Ausgabe die
First-Load-JS-Tabelle pro Route (Format: `First Load JS shared by all`
+ Summe pro `/route`). Diese Zahlen tragen wir hier ergänzend nach.

## 5 Strukturelle Client-Analyse (ohne Build)

Damit der Report trotz fehlendem Client-Bundle einen Wert hat, hier eine
statische Analyse der Client-Seite:

### 5.1 Routen-Übersicht

**Gesamt: 109 Routen (`page.tsx`)**, verteilt auf Gruppen:

| Gruppe               | Routen | Einordnung        |
|----------------------|-------:|-------------------|
| `app/page.tsx` (Landing) | 1 | Marketing         |
| `alltagsbegleitung`  | 1      | Marketing         |
| `krankenfahrten`     | 1      | Marketing         |
| `hygienebox`         | 1      | Marketing         |
| `lp`                 | 1      | Marketing         |
| `faq`                | 1      | Marketing         |
| `kontakt`            | 1      | Marketing         |
| `agb`, `datenschutz`, `impressum` | 3 | Legal   |
| `blog`               | 16     | Content/SEO      |
| `auth`               | 4      | Login/Signup/Reset |
| `choose`             | 1      | Rolle wählen     |
| `kunde`              | 20     | App (B2C)        |
| `engel`              | 10     | App (Fahrer/Helfer) |
| `fahrer`             | 7      | App (Fahrer)     |
| `admin`              | 6      | App (Admin)      |
| `mis`                | 13     | App (Management) |
| `investor`           | 20     | Pitch (intern)   |
| `notfall`            | 1      | Standalone       |

**Client-Components mit `'use client'`:** 89 von ~300 Dateien.

### 5.2 Schwergewichte im Client (statische Analyse)

Geprüfte „teure" Libraries und wie sie importiert werden:

| Library          | Import-Modus | Fundorte                       | Bewertung |
|------------------|--------------|--------------------------------|-----------|
| `tesseract.js` (~2,3 MB WASM) | **dynamic** via `await import('tesseract.js')` | `app/kunde/notfall/page.tsx` | ✅ sauber |
| `@zxcvbn-ts/*` (~2,5 MB Dicts) | **dynamic** via Lazy-Singleton in `lib/password-validation.ts` | Auth-Signup / Reset | ✅ sauber |
| `@sentry/nextjs` | static in `app/error.tsx`, `app/global-error.tsx` | 2 Dateien | ✅ korrekt (von Sentry dokumentierter Pattern) |
| `recharts`       | — (nicht gefunden) | — | ✅ nicht im Bundle |
| `mammoth`        | — (nicht gefunden) | — | ✅ nicht im Bundle |
| `framer-motion`  | — (nicht gefunden) | — | ✅ nicht im Bundle |
| `chart.js`       | — (nicht gefunden) | — | ✅ nicht im Bundle |

**Ergebnis:** Die bekannten Client-Side-Schwergewichte sind **bereits
defensiv eingebunden**. Es gibt keinen offensichtlichen statischen Import
einer 1-MB+-Library in einer Client-Component.

### 5.3 Erwartetes Bild (prognostisch)

Basierend auf der strukturellen Analyse erwarte ich beim lokalen Build:

| Route-Typ             | Erwartung First-Load-JS | Ziel      | Voraussichtlich |
|-----------------------|-------------------------|-----------|-----------------|
| Landing (`/`)         | ~130 – 150 KB           | < 150 KB  | knapp, prüfen   |
| Marketing (`/alltagsbegleitung`, `/faq`, …) | ~120 – 140 KB | < 150 KB  | erreicht        |
| Auth (`/auth/signup`) | ~150 – 180 KB *         | < 200 KB  | erreicht        |
| Kunde-App (`/kunde/home`) | ~180 – 220 KB       | < 200 KB  | auf der Kante   |
| Engel-App             | ~180 – 210 KB           | < 200 KB  | auf der Kante   |
| Notfall               | ~150 – 180 KB (OCR lazy)| < 200 KB  | erreicht        |
| Investor-Pitch        | irrelevant (intern)     | –         | –               |

\* Plus lazy-loaded `zxcvbn` erst beim Tippen.

Diese Zahlen sind **geschätzt aus Server-Chunk-Größen + bekannten Lib-
Footprints** — nicht gemessen. Nach dem lokalen Build tragen wir die
echten Zahlen in Abschnitt 6 nach.

## 6 Empfehlungen

Priorisiert nach Impact/Aufwand:

### 6.1 Monitoring einrichten (Impact: hoch, Aufwand: niedrig)

- **`size-limit` oder `next-size-limit`** in CI integrieren: automatischer
  Fail im PR, wenn First-Load-JS auf Landing über 150 KB oder auf App-Route
  über 200 KB wandert.
- **Bundle-Analyzer vorhalten**: `npm run analyze` ist jetzt verfügbar —
  in die Dev-Docs aufnehmen (z.B. `docs/dev/onboarding.md`), damit Neue
  das Tool kennen.

### 6.2 Route-Group-Trennung verifizieren (Impact: mittel, Aufwand: niedrig)

Next gruppiert Client-Bundles pro Route-Gruppe. Nach lokalem Build prüfen:
Teilen sich `(auth)`, `(kunde)`, `(engel)`, `(admin)`, `(mis)`, `(investor)`
wirklich keine großen Libraries? Falls ja, ist das Bundle-Splitting optimal.

### 6.3 Investor-Routen isolieren (Impact: niedrig, Aufwand: niedrig)

Die 20 `investor/*`-Routen sind intern und sollten nicht im Landing-Entry-
Bundle landen. Prüfen: sind sie über eine eigene Route-Gruppe `(investor)`
abgeschottet?

### 6.4 Image-Bundles (Impact: niedrig, Aufwand: niedrig)

Der Bundle-Analyzer misst **JS**. Große Bildassets (z.B. Hero-Images auf
Landing) werden separat geladen und zählen nicht gegen First-Load-JS —
aber sie zählen gegen LCP. Nach dem Build zusätzlich Lighthouse gegen
Landing laufen lassen.

### 6.5 Server-Side: zxcvbn-Dictionaries evtl. kleiner laden
(Impact: niedrig, Aufwand: mittel)

`@zxcvbn-ts/language-common/wikipedia` (1,4 MB parsed) ist der größte
Server-Module. Für Deutsch reicht evtl. `language-de` allein — prüfen,
ob `language-common` wirklich gebraucht wird oder ob wir die Dictionaries
gezielter laden. Laut Doku braucht `@zxcvbn-ts/core` `language-common` als
Basis, aber einzelne Dict-Dateien können weggelassen werden. Nur optimieren,
wenn Edge-Cold-Start-Latenz zum Problem wird.

## 7 Nächste Schritte

1. Auf Dev-Maschine `npm run analyze` ausführen.
2. First-Load-JS-Tabelle aus Next-Terminal-Output in Abschnitt 5.3 → 6
   dieses Reports als „gemessene Werte" eintragen.
3. `.next/analyze/client.html` öffnen, Top-10 Client-Module dokumentieren.
4. Wenn eine Route die Zielgröße überschreitet:
   - statisch importierte `components/*`-Barrel-Imports prüfen
   - `next/dynamic` für unter-the-fold-Komponenten (z.B. `SocialProof`,
     `AppMockup` auf Landing) einführen
5. Optional: `size-limit` als Dev-Dep + CI-Check ergänzen.

---

*Erzeugt 2026-04-19. Script: `package.json` → `npm run analyze`.
Konfiguration: `next.config.ts` (konditional via `ANALYZE=true`).*
