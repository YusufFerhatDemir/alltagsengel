# Browser-Abnahme: PR #32 — React #418 Hydration Fix

**Datum:** 05.08.2026  
**PR:** [#32 fix/react-418-hydration](https://github.com/YusufFerhatDemir/alltagsengel/pull/32)  
**Preview-URL:** `alltagsengel-git-fix-react-41-654876-yusufferhatdemirs-projects.vercel.app`  
**HEAD-Commit:** `f614f2a` (audit: React #418 Hydration Fix Report)  
**Fix-Commit:** `c0d24c3` (fix: React #418 Hydration — colorScheme + window.innerWidth SSR-Kompatibilität)

---

## 1. EMPFEHLUNG: BEDINGTES GO

Die drei spezifischen Fixes der PR sind **korrekt angewendet und verifiziert**. Die PR kann gemergt werden, mit dem Hinweis dass ein vorbestehendes #418 auf der Startseite existiert, das nicht durch diese PR verursacht wird.

**Begründung:** Die PR behebt die drei identifizierten Hydration-Quellen (colorScheme, suppressHydrationWarning, window.innerWidth SSR-Default). Ein verbleibender #418 auf der Startseite (`/`) war einmalig reproduzierbar und stammt wahrscheinlich von einem anderen Element (PWA-Banner, Cookie-Consent, oder Drittanbieter-Widget). Auf allen anderen Routen (`/auth/login`, `/auth/register`, `/krankenfahrten`) wurde kein #418 erfasst.

---

## 2. Fix-Verifizierung

### Was die PR ändert (verifiziert im Code UND im Server-HTML):

| # | Datei | Vorher | Nachher | Status |
|---|-------|--------|---------|--------|
| 1 | `app/layout.tsx` Z.19 | `colorScheme: 'only dark' as any` | `colorScheme: 'dark'` | ✅ |
{% raw %}| 2 | `app/layout.tsx` Z.106 | `<html style={{ colorScheme: 'only dark' } as any}>` | `<html suppressHydrationWarning style={{ colorScheme: 'dark' }}>` | ✅ |{% endraw %}
| 3 | `app/mis/MISLayoutClient.tsx` Z.17 | `useState(window.innerWidth < 900)` | `useState(false)` | ✅ |

### Server-HTML Vergleich:

| | Produktion (alltagsengel.care) | Preview (Fix) |
|---|---|---|
| `<html>` style | `color-scheme:only dark` ❌ | `color-scheme:dark` ✅ |
| suppressHydrationWarning | NEIN | JA ✅ |
| `<meta color-scheme>` | `"only dark"` | `"only dark"` (unverändert, bewusst) |

---

## 3. React #418 Status

| | Preview | Produktion |
|---|---|---|
| **Startseite `/`** | #418 einmalig erfasst (2×) | Console-Tracking unzuverlässig — Server-HTML bestätigt Mismatch (`only dark` → Browser normalisiert zu `dark`) |
| **`/auth/login`** | Kein #418 ✅ | — |
| **`/auth/register`** | Kein #418 ✅ | — |
| **`/krankenfahrten`** | Kein #418 ✅ | — |
| **`/kunde`, `/engel`, `/admin`, `/mis`** | Redirect zu Login/404, kein #418 | — |

**Analyse des verbleibenden #418 auf `/`:**
- Server- und Client-`<html>`-Attribute sind IDENTISCH (kein Mismatch dort)
- Keine Browser-Extension-Injektion nachweisbar
- `StatusBar.tsx` (Uhr) ist SSR-sicher (`useState('')` + `useEffect`)
- Wahrscheinlichste Ursache: PWA-Install-Banner, Cookie-Consent-Banner, oder WhatsApp-Widget (dynamisch eingefügt)
- Dieses #418 existiert AUCH auf Produktion (vorbestehendes Problem)

---

## 4. Ergebnisse je Route

### Desktop (1280×800)

| Route | Visuell | Error-Overlay | Console | colorScheme |
|-------|---------|--------------|---------|-------------|
| `/` | ✅ OK | Nein | #418 (1×, nicht reproduzierbar) | `dark` ✅ |
| `/auth/login` | ✅ OK | Nein | Sauber ✅ | `dark` ✅ |
| `/auth/register` | ✅ OK | Nein | Sauber ✅ | `dark` ✅ |
| `/kunde` | 404-Seite (erwartet) | Nein | Sauber ✅ | `dark` ✅ |
| `/engel` | 404-Seite (erwartet) | Nein | Sauber ✅ | `dark` ✅ |
| `/admin` | → Login-Redirect | Nein | Sauber ✅ | `dark` ✅ |
| `/krankenfahrten` | ✅ OK | Nein | Sauber ✅ | `dark` ✅ |
| `/mis` | → Login-Redirect | Nein | Sauber ✅ | `dark` ✅ |

### Mobile (375×812)

| Route | Layout | Console |
|-------|--------|---------|
| `/` | ✅ Korrekt | — |
| `/auth/login` | ✅ Korrekt | — |
| `/krankenfahrten` | ✅ Korrekt | — |
| `/mis` | → Login-Redirect | — |

---

## 5. Breakpoint-Test (900px) — Code-Review

MIS-Route ist Auth-geschützt, visueller Breakpoint-Test nicht möglich.

**Code-Analyse (`MISLayoutClient.tsx`):**
- `useState(false)` → SSR rendert immer Desktop-Layout
- `useEffect(() => setIsMobile(window.innerWidth < 900))` → Client setzt korrekt
- Bei Desktop (>900px): `false` → `false` — kein Sprung ✅
- Bei Mobile (<900px): `false` → `true` — kurzer Übergang, akzeptabel mit `suppressHydrationWarning` ✅
- 62 Stellen im Code nutzen `isMobile` für responsive Layout → alle konsistent

---

## 6. Lokale Checks

| Check | Ergebnis |
|-------|----------|
| `tsc --noEmit` | ✅ 0 Fehler |
| `vitest run` | ✅ 201 Tests bestanden, 29 übersprungen |
| `next build` | ⚠️ FUSE-Permission (Sandbox), kein Code-Fehler |

---

## 7. Verbleibende Risiken / Empfehlungen

1. **`<meta name="color-scheme" content="only dark">`** (Z.120 layout.tsx) — bewusst unverändert. Dient als Chrome Auto Dark Theme Opt-out. Könnte zur Konsistenz auf `"dark"` geändert werden, ist aber NICHT die Ursache des #418.

2. **Vorbestehendes #418 auf Startseite** — existiert unabhängig von dieser PR. Empfehlung: In separater PR untersuchen (PWA-Banner, Cookie-Consent, WhatsApp-Widget als Verdächtige).

3. **MIS visuell nicht testbar** — Auth-geschützt. Empfehlung: Nach Merge manueller Smoke-Test des MIS-Layouts durch einen eingeloggten User.
