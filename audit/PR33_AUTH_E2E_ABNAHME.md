# PR #33 — Auth E2E Abnahme

| Feld | Wert |
|---|---|
| **Ergebnis** | **NO-GO** |
| **PR** | #33 (`feature/middleware-route-protection`) |
| **HEAD-Commit** | `9082fd2` (audit: PR #33 Preview-Abnahme) |
| **Vorheriger Code-Commit** | `8db7526` (Security: Serverseitiger Routenschutz) |
| **Preview-URL** | `https://alltagsengel-8ki4kc3bh-yusufferhatdemirs-projects.vercel.app` |
| **Datum** | 2026-08-05 |
| **Prüfer** | Automatisierte E2E-Abnahme (Claude) |

---

## NO-GO-Ursache: Preview nutzt Produktionsdatenbank

### Befund

Die Vercel-Preview-Deployment auf Branch `feature/middleware-route-protection` ist mit der
**Produktions-Supabase-Datenbank** verbunden:

- **Projekt-ID:** `nnwyktkqibdjxgimjyuq` (eu-west-1)
- **Nachweis:** Beim Laden der Login-Seite sendet die App einen `POST`-Request an
  `https://nnwyktkqibdjxgimjyuq.supabase.co/rest/v1/page_views` (HTTP 201).
- **Zusätzlicher Nachweis:** In `proxy.ts` (Zeile 5) ist der Cookie-Storage-Key
  `sb-nnwyktkqibdjxgimjyuq-auth-token` hartcodiert — identisch mit der Produktions-Projekt-ID.

### Konsequenz

Gemäß Sicherheitsregel wurde die E2E-Abnahme **sofort abgebrochen**:

- Keine Testkonten erstellt
- Keine Testdaten erstellt
- Keine Produktionsdaten verändert, gelesen, kopiert oder exportiert
- Keine authentifizierten Sitzungen auf der Preview gestartet
- Keine service_role-Zugriffe durchgeführt

### Bestätigung

**Keine Produktionsdaten wurden verändert.** Es wurde lediglich die öffentliche Landing-Page
und die Login-Seite der Preview aufgerufen. Der einzige beobachtete Supabase-Request
(`POST /rest/v1/page_views`) wurde von der App selbst initiiert (Analytics), nicht vom Tester.

---

## Vorhandene Staging-Infrastruktur

In `.env.staging.local` existiert ein separates Supabase-Projekt:

| Feld | Wert |
|---|---|
| Projekt-Ref | `uwmjqckhjkgukhzeidyw` |
| Variable | `STAGING_SUPABASE_URL` |

**Problem:** Dieses Projekt ist unter `STAGING_SUPABASE_URL` konfiguriert, die App liest aber
`NEXT_PUBLIC_SUPABASE_URL`. Die Preview-Deployment nutzt die Vercel-Environment-Variables,
die auf Produktion zeigen.

---

## Was wird benötigt, um die E2E-Abnahme durchzuführen

### Option A: Isolierte Preview-Datenbank (empfohlen)

1. **Vercel Preview Environment Variables** konfigurieren:
   - `NEXT_PUBLIC_SUPABASE_URL` → auf ein isoliertes Supabase-Projekt setzen
     (z. B. `uwmjqckhjkgukhzeidyw` oder ein neues Preview-Projekt)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → passender Anon-Key
   - `SUPABASE_SERVICE_ROLE_KEY` → passender Service-Role-Key
   - Scope: nur "Preview" (nicht "Production")

2. **Neues Preview-Deployment** triggern (Vercel baut automatisch neu bei Env-Änderung
   oder Push).

3. **Bestätigung**, dass die Preview-URL auf die isolierte DB zeigt
   (Network-Request prüfen → neues Projekt-ID).

4. E2E-Abnahme erneut starten.

### Option B: Freigegebene bestehende Testkonten

Falls keine isolierte DB eingerichtet werden kann:

1. **Bestehende Testkonten** auf der Produktions-DB identifizieren, die explizit für
   Tests freigegeben sind (je Rolle: admin, superadmin, kunde, engel, fahrer).
2. **Schriftliche Freigabe** durch den Projektverantwortlichen, dass diese Konten
   auf der Produktions-DB für E2E-Tests verwendet werden dürfen.
3. **Einschränkung:** Keine neuen Konten erstellen, keine Daten ändern, nur Lese-
   und Navigations-Tests.

### Option C: Hartcodierten Cookie-Key entkoppeln

Unabhängig von der Preview-DB-Konfiguration:

- `proxy.ts` Zeile 5: `STORAGE_KEY` sollte dynamisch aus `NEXT_PUBLIC_SUPABASE_URL`
  abgeleitet werden (Format: `sb-{PROJECT_REF}-auth-token`), statt hartcodiert zu sein.
  Sonst funktioniert der Cookie-Abgleich nur mit dem Produktionsprojekt.

---

## Rollenmatrix — nicht getestet

Die folgenden Tests konnten **nicht durchgeführt** werden:

| Rolle | /admin | /mis | /kunde | /engel | /fahrer |
|---|---|---|---|---|---|
| admin | ⏸ | ⏸ | ⏸ | ⏸ | ⏸ |
| superadmin | ⏸ | ⏸ | ⏸ | ⏸ | ⏸ |
| kunde | ⏸ | ⏸ | ⏸ | ⏸ | ⏸ |
| engel | ⏸ | ⏸ | ⏸ | ⏸ | ⏸ |
| fahrer | ⏸ | ⏸ | ⏸ | ⏸ | ⏸ |

⏸ = Test ausgesetzt (Produktions-DB, keine isolierte Umgebung)

## Session-/Token-Tests — nicht durchgeführt

- Login mit `?next=` → ⏸
- Logout + Direktzugriff → ⏸
- Browser Zurück nach Logout → ⏸
- Hard Reload → ⏸
- Cookie-Löschung → ⏸
- Token-Ablauf → ⏸
- DB-Fallback (fehlende app_metadata.role) → ⏸
- user_metadata-Manipulation → ⏸

## Weitere Prüfungen — nicht durchgeführt

- Quelltext-Inspektion → ⏸
- Browser-Konsole → ⏸
- Network-Requests → ⏸
- Vercel Runtime-Logs → ⏸
- Desktop/Mobil → ⏸

## Testdaten-Bereinigung

Nicht erforderlich — es wurden keine Testdaten erstellt.

---

## Verbleibende Risiken

1. **Produktions-DB in Preview:** Jeder Vercel-Preview-Deployment-Nutzer interagiert
   mit echten Produktionsdaten. Dies ist ein Sicherheitsrisiko unabhängig von dieser Abnahme.

2. **Hartcodierter Storage-Key:** `proxy.ts` hat den Produktions-Projekt-Ref im Cookie-Key
   hartcodiert. Bei Wechsel auf eine isolierte DB funktioniert die Middleware nicht ohne
   Code-Anpassung.

3. **Fehlende Environment-Isolation:** Vercel-Projekt hat keine getrennten Env-Vars
   für Preview vs. Production konfiguriert.

---

## Fazit

**NO-GO.** Die authentifizierte E2E-Abnahme kann nicht auf einer Preview durchgeführt werden,
die mit der Produktionsdatenbank verbunden ist. Vor dem Merge von PR #33 muss eine der
oben genannten Optionen umgesetzt und die Abnahme wiederholt werden.
