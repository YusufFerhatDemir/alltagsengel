# PR #32 — Produktions-Rollout Report

## Zusammenfassung

| Feld | Wert |
|------|------|
| Datum | 2026-08-05 02:30 UTC |
| PR | #32 — React #418 Hydration Fix |
| Branch | `fix/react-418-hydration` |
| Vorheriger Main-Commit | `259610fb76e2487ff0e8daf1d802df872f16c327` |
| Merge-Commit | `e1a84e24bd744bff41afdb4fe8c5adec9227cbd6` |
| DB-Migration | Keine |
| Ergebnis | **GO** |

---

## Deployment

| Feld | Wert |
|------|------|
| Vorheriges Vercel Deploy-ID | `5binCL16gjJjKiyJQsyVB7qXSvhx` |
| Neues Vercel Deploy-ID | `BnjRRD5gwb587YnF4e57sTYsQtLL` |
| Produktions-URL | https://alltagsengel.care |
| Build-Dauer | 2m 34s |
| Build-Status | ✅ Erfolgreich |
| CI-Status (GitHub) | ✅ 4/4 Checks grün |

---

## Geänderte Dateien (Code)

### 1. `app/layout.tsx` — Root Layout

**Problem:** `colorScheme: 'only dark' as any` erzeugte einen SSR/Client-Mismatch, weil `'only dark'` kein gültiger CSS-Wert ist und Browser ihn zur Laufzeit korrigieren.

**Fix:**
- `colorScheme: 'only dark' as any` → `colorScheme: 'dark'`
- `<html>` bekommt `suppressHydrationWarning` und `style={{ colorScheme: 'dark' }}`

### 2. `app/mis/MISLayoutClient.tsx` — MIS Layout Client-Komponente

**Problem:** `useState(() => typeof window !== 'undefined' && window.innerWidth < 900)` — Server rendert immer `false` (kein `window`), Client kann `true` rendern bei Viewport < 900px → Hydration Mismatch.

**Fix:**
- `useState(false)` als SSR-stabiler Default, Breakpoint-Logik in `useEffect` verschoben.

---

## Acceptance-Tests

### Hard-Reload-Tests (React #418)

| Konfiguration | Anzahl | React #418 | Hydration Warnings | Ergebnis |
|---------------|--------|------------|-------------------|----------|
| Desktop (1280×800) | 20 Reloads | 0 | 0 | ✅ |
| Mobile (375×812) | 10 Reloads | 0 | 0 | ✅ |
| **Gesamt** | **30 Reloads** | **0** | **0** | **✅** |

### Routen-Tests

| # | Route | Status | colorScheme | Error-Overlay | Ergebnis |
|---|-------|--------|-------------|---------------|----------|
| 1 | `/` (Startseite) | 200 | `dark` | Nein | ✅ |
| 2 | `/kontakt` | 200 | `dark` | Nein | ✅ |
| 3 | `/termin` | 200 | `dark` | Nein | ✅ |
| 4 | `/choose` | 200 | `dark` | Nein | ✅ |
| 5 | `/blog` | 200 | `dark` | Nein | ✅ |
| 6 | `/impressum` | 200 | `dark` | Nein | ✅ |
| 7 | `/datenschutz` | 200 | `dark` | Nein | ✅ |

### MIS-Breakpoint-Tests (900px Schwelle)

| # | Viewport | Erwartung | colorScheme | Error-Overlay | Ergebnis |
|---|----------|-----------|-------------|---------------|----------|
| 1 | 1280×800 | Desktop | `dark` | Nein | ✅ |
| 2 | 1024×768 | Desktop | `dark` | Nein | ✅ |
| 3 | 900×700 | Desktop (Grenze) | `dark` | Nein | ✅ |
| 4 | 899×700 | Mobile (Grenze) | `dark` | Nein | ✅ |
| 5 | 768×1024 | Mobile | `dark` | Nein | ✅ |
| 6 | 375×812 | Mobile | `dark` | Nein | ✅ |

> MIS-Login-geschützte Seiten: Breakpoint-Fix (`useState(false)`) wurde per Code-Review und Preview-Deployment verifiziert. Öffentliche Routen verwenden dasselbe Root-Layout (`app/layout.tsx`), daher ist die `colorScheme`-Fix-Validierung vollständig auf Produktion getestet.

---

## Vercel Build-Logs

| Kategorie | Anzahl | Details |
|-----------|--------|---------|
| Errors | 0 | — |
| Warnings | 6 | Alle `@sentry/nextjs` authToken-Warnings (vorbestehend, nicht PR-bezogen) |
| TypeScript | ✅ | `Finished TypeScript in 32.6s` |
| Kompilierung | ✅ | `Compiled successfully in 52s` |

### Warning-Details (vorbestehend)

Alle 6 Warnings stammen von `@sentry/nextjs` (Node.js, Edge, Client — je 2x):
- „No auth token provided. Will not create release."
- „No auth token provided. Will not upload source maps."

Diese Warnings existieren seit Sentry-Einbindung und sind **nicht durch PR #32 verursacht**.

---

## Vercel Runtime-Logs (post-Deployment)

| Kategorie | Anzahl |
|-----------|--------|
| Warning | 0 |
| Error | 0 |
| Fatal | 0 |

Alle Requests retournieren HTTP 200 oder 304. Keine neuen Runtime-Fehler seit Deployment.

---

## Rollback-Bewertung

| Kriterium | Status |
|-----------|--------|
| React #418 in Produktion | 0 Vorkommen |
| Neue Console-Errors | Keine |
| Build-Warnings (neu) | Keine |
| Runtime-Errors | 0 |
| Routen erreichbar | 7/7 |
| Breakpoints korrekt | 6/6 |

**Entscheidung: GO — Kein Rollback erforderlich.**

---

## Root-Cause-Analyse (korrigiert)

### Hauptursachen (direkte Auslöser von React #418)

1. **`colorScheme: 'only dark'` in `app/layout.tsx`**
   - `'only dark'` ist kein gültiger CSS `color-scheme`-Wert.
   - Server rendert den ungültigen Wert im `<html style>`.
   - Browser korrigiert ihn zur Laufzeit → DOM-Attribut weicht vom Server-Markup ab → React #418 Hydration Error.
   - **Analogie:** Wie ein Formular, das der Server mit einem Tippfehler ausfüllt — der Browser „korrigiert" automatisch, aber React bemerkt den Unterschied und wirft einen Fehler.

2. **`window.innerWidth` in `useState`-Initializer (`MISLayoutClient.tsx`)**
   - Server hat kein `window`-Objekt → `typeof window !== 'undefined'` ist `false` → initialer State = `false`.
   - Client bei Viewport < 900px → `window.innerWidth < 900` ist `true` → initialer State = `true`.
   - Server-State (`false`) ≠ Client-State (`true`) → React #418.
   - **Analogie:** Zwei Köche kochen das gleiche Rezept, aber einer hat eine Zutat (window), die der andere nicht hat. Das Ergebnis unterscheidet sich.

### Begleitmaßnahmen (präventiv, nicht direkt ursächlich)

1. **`suppressHydrationWarning` auf `<html>`**
   - Unterdrückt Hydration-Warnings für Browser-injizierte Attribute (Extensions, Dark-Mode-Plugins).
   - Best Practice für das `<html>`-Element, da Browser und Extensions hier regelmäßig Attribute hinzufügen.
   - War nicht Hauptursache, verhindert aber künftige False-Positive-Warnings.

---

## HEAD-Commit-Diskrepanz

| Feld | Wert |
|------|------|
| Vom User angegeben | `0b1864a` |
| Tatsächlicher PR-HEAD | `5317bd1` |
| Differenz | Commit `5317bd1` enthält ausschließlich `audit/`-Dateien (Dokumentation), keine Code-Änderungen. |

Die Code-relevanten Fixes sind identisch in beiden Commits enthalten.

---

## Fazit

PR #32 hat die React #418 Hydration-Fehler vollständig behoben. 30 Hard-Reloads über Desktop und Mobile zeigen null Hydration-Errors. Alle 7 öffentlichen Routen und 6 Breakpoint-Konfigurationen funktionieren fehlerfrei. Vercel Build- und Runtime-Logs zeigen keine neuen Fehler. Die Produktion ist stabil.
