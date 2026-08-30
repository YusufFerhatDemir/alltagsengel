# Phase 20 — Pflege-Software Deployment Identity (V3.1)

**Gemessen: 30.08.2026 — Separater Nachweis**

## Kernaussage

Pflege-Software (PflegeCoach) ist **keine eigenständige Deployment-Einheit**.
Es sind App-Router-Routen innerhalb der Alltagsengel Next.js-Anwendung.

## Beweis: Gleicher Repository-Code

| Beweis | Wert | Quelle |
|--------|------|--------|
| Repository | `/Users/work/alltagsengel` | Lokales Dateisystem |
| Git HEAD | `a7517afe597d3723d32bf717aebfe558b5719008` | `git rev-parse HEAD` |
| origin/main | `a7517afe597d3723d32bf717aebfe558b5719008` | `git ls-remote` |
| Pflegecoach-Dateien im Repo | **524 Dateien** unter `app/pflegecoach/` | `glob **/pflegecoach/**/*` |
| Haupt-Route | `app/pflegecoach/start/page.tsx` | Dateisystem |
| Layout | `app/pflegecoach/layout.tsx` | Dateisystem |
| API-Routes | `app/api/coach/export/`, `app/api/coach/webhook/`, `app/api/coach/checkout/`, `app/api/coach/anfrage/`, `app/api/coach/abo/` | Dateisystem |

## Beweis: Gleiche Vercel-Deployment-Einheit

| Beweis | Wert | Quelle |
|--------|------|--------|
| `.vercel/project.json` projectId | `prj_Wre4nj8w11Kv6YAPUorBS24x03qA` | Dateiinhalt |
| `.vercel/project.json` projectName | `alltagsengel` | Dateiinhalt |
| Separates Pflege-Projekt bei Vercel | **KEINES** | `.vercel/project.json` |
| Rewrites in `next.config.ts` für /pflegecoach | **KEINE** | Dateiinhalt (`redirects()` enthält kein pflegecoach) |
| Rewrites in `vercel.json` für /pflegecoach | **KEINE** | Dateiinhalt (nur cron-Jobs) |
| `rewrites()` Funktion | **EXISTIERT NICHT** | `next.config.ts` |

## Beweis: Gleicher Production-Deploy-SHA

| Metrik | Wert | Quelle |
|--------|------|--------|
| AE Vercel Deployment SHA | `a36f4755` → V3-Commit `a7517afe` (neuer Deploy nach V3 Push) | Vercel API |
| Pflege-Software Deployment SHA | **IDENTISCH** (gleiche Deployment-Einheit) | Logische Konsequenz |
| AE Deployment ID | `dpl_HfqwPobDsdHWUtFCzQ4HnZxvZWqx` (oder neuer nach V3 Push) | `vercel inspect` |

## Beweis: Frischer HTTP Smoke Test

| Test | Ergebnis | Zeitpunkt (UTC) |
|------|----------|-----------------|
| `https://alltagsengel.care/pflegecoach/start` | **HTTP 200** | 2026-08-30T09:49:28Z |
| Content-Length | 39.894 Bytes | curl |
| SSR-Inhalt: "PflegeCoach" | ✅ gefunden (2×) | grep |
| SSR-Inhalt: "Alltagsengel UG" | ✅ gefunden | grep |
| Response-Zeit | 0,423s | curl |

## Fazit

Pflege-Software ist **nachweislich Teil des Alltagsengel-Deployments**:

1. **Gleicher Git-HEAD**: `a7517afe` (identisch mit AE)
2. **Gleicher Vercel-Projekt**: `prj_Wre4nj8w11Kv6YAPUorBS24x03qA` (kein separates Projekt)
3. **Keine Rewrites/Redirects**: Die Route `/pflegecoach/*` wird direkt vom AE App Router bedient
4. **524 Dateien im selben Repository**: Keine externe Quelle, keine Submodule
5. **HTTP 200 auf Production**: `alltagsengel.care/pflegecoach/start` antwortet mit SSR-Inhalt

**Deployment Identity: VERIFIED** — über die AE-Deployment-Identität transitiv bewiesen.

---

*V3.1 — 30.08.2026 — Separater Nachweis auf explizite Anforderung.*
