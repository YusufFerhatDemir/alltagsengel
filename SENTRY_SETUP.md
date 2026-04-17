# Sentry-Setup AlltagsEngel.care

**Stand:** 2026-04-17
**Ziel:** Sentry-Projekt anlegen, DSN eintragen, Vercel-Umgebungsvariablen setzen, erstes Test-Event verifizieren.

---

## Analogie zum Einstieg

Stell dir Sentry wie den **Fahrtenschreiber eines LKW** vor: Wenn der Motor stottert, bekommst du nicht erst beim nächsten TÜV (dem Support-Ticket) Bescheid — sondern sofort ein Log mit Ort, Geschwindigkeit, Last und Umgebungstemperatur. Der Code läuft weiter, aber du siehst in Echtzeit, wo's geruckelt hat.

Unser Setup ist so konfiguriert, dass **nur die Diagnose-Daten** übertragen werden (Stack-Trace, Route, Browser) — **keine PII** (keine E-Mails, keine Passwörter, keine Kundendaten). Das ist DSGVO-Art.-32-konform.

---

## 1. Sentry-Projekt anlegen (Dashboard)

1. Öffne [sentry.io](https://sentry.io) → Konto erstellen / einloggen (SSO via GitHub empfohlen).
2. **"Create Project"** → Platform: **Next.js** → Alert-Frequency: **"Alert me on every new issue"**.
3. Projekt-Name: `alltagsengel-web` (Plan: **Developer** free bis 5k Events/Monat — reicht für Start).
4. Organization-Slug merken (wird gleich gebraucht), z.B. `alltagsengel`.

## 2. DSN und Auth-Token holen

Nach dem Anlegen zeigt dir Sentry:

- **DSN** (sieht aus wie `https://<public_key>@o<org_id>.ingest.sentry.io/<project_id>`) → Settings → Projects → alltagsengel-web → Client Keys (DSN)
- **Auth-Token** für Source-Map-Uploads → User-Avatar → User Auth Tokens → **"Create New Token"** → Scope: `project:releases` + `org:read` → Name: `vercel-ci-alltagsengel` → Token sofort kopieren (nie wieder sichtbar!)

## 3. Vercel-Environment-Variables setzen

Im Vercel-Dashboard → Project `alltagsengel` → Settings → Environment Variables → jeweils für **Production, Preview, Development** anlegen:

| Variable | Wert | Scope |
|---|---|---|
| `SENTRY_DSN` | die DSN von oben | alle |
| `NEXT_PUBLIC_SENTRY_DSN` | dieselbe DSN | alle |
| `SENTRY_ORG` | `alltagsengel` | alle |
| `SENTRY_PROJECT` | `alltagsengel-web` | alle |
| `SENTRY_AUTH_TOKEN` | Auth-Token von Schritt 2 | nur Production + Preview (nicht Development!) |

**Sicherheitsregel:** `SENTRY_AUTH_TOKEN` ist eine Vercel-Build-Secret — **nie** in der Client-JS-Bundle. Darum kein `NEXT_PUBLIC_`-Prefix. Das `withSentryConfig`-Wrapping in `next.config.ts` nutzt ihn nur zur Build-Zeit für Source-Map-Upload.

Danach: Deployment neu triggern (Vercel → Deployments → `...` → "Redeploy") oder einen dummy-Commit pushen.

## 4. Erstes Test-Event auslösen

Nach Redeploy:

1. Öffne `https://alltagsengel.care/sentry-example` (falls wir den Test-Route dazufügen — nicht Pflicht) **oder** öffne eine Seite, wirf eine bekannte Exception:
   ```js
   // In der Browser-Konsole auf einer beliebigen Seite:
   throw new Error('Sentry-Smoke-Test ' + Date.now())
   ```
2. In Sentry-Dashboard → Issues → sollte innerhalb von 30 Sekunden ein neues Issue erscheinen.
3. Verifiziere dort:
   - ✅ User-Kontext enthält **nur UUID**, keine E-Mail (`SessionKeepAlive.tsx` liefert nur `Sentry.setUser({ id })`)
   - ✅ Request-Headers enthalten **kein Cookie**, kein `authorization`, kein `x-supabase-auth` (gefiltert in `instrumentation-client.ts`)
   - ✅ URL-Parameter enthalten **keine Tokens** (gefiltert durch `beforeSend`)
   - ✅ Source-Maps auflösen → Stacktrace zeigt lesbaren TS-Code, nicht Minified-JS

## 5. Release-Tracking aktivieren

Vercel setzt automatisch `VERCEL_GIT_COMMIT_SHA` — das wird von `@sentry/nextjs` als Release-Tag genutzt. Jedes Deployment bekommt so einen eigenen Release-Eintrag in Sentry, und du siehst in "Releases", welches Deploy welche Fehler verursacht hat.

**Bonus:** Richte in Sentry → Alerts → "Issue-Alert" ein:
- Condition: "A new issue is created"
- Action: Slack/Email-Benachrichtigung (E-Mail an `y.cilcioglu@googlemail.com` reicht für Start)
- Filter: nur `level: error` oder höher (ignoriere `warning`/`info`)

## 6. Performance-Monitoring (optional, später)

Für **Tracing** (misst wie lange Routes brauchen) können wir später `tracesSampleRate: 0.1` (10% der Requests) aktivieren. Aktuell steht's auf `1.0` nur für Errors — Performance ist **noch aus**, um Free-Tier-Quota zu schonen.

---

## Checkliste

- [ ] Sentry-Account + Projekt `alltagsengel-web` erstellt
- [ ] DSN + Auth-Token notiert (1Password/Vault)
- [ ] Vercel-Env-Vars gesetzt (5 Variablen, 3 Environments)
- [ ] Redeploy ausgelöst + durchgelaufen
- [ ] Test-Event im Sentry-Dashboard sichtbar
- [ ] PII-Check bestanden (UUID-only User-Context, keine Cookies/Tokens)
- [ ] Source-Map-Upload in Build-Log bestätigt (`[sentry] Successfully uploaded source maps`)
- [ ] Alert auf neue Issues eingerichtet (E-Mail)

---

## Troubleshooting

**Problem: Keine Events kommen an, obwohl DSN gesetzt**
→ Check Browser-DevTools → Network → Request an `*.ingest.sentry.io`. Wenn blockiert: Ad-Blocker. Unser Setup nutzt `tunnelRoute: '/monitoring'` — der sollte das umgehen. Wenn nicht, Vercel-Env-Vars checken (Case-Sensitive!).

**Problem: Source-Maps im Build-Log sagen "401 Unauthorized"**
→ `SENTRY_AUTH_TOKEN` fehlt oder falscher Scope. Token mit `project:releases` + `org:read` neu erstellen.

**Problem: Issue zeigt Minified-Code statt TS**
→ Source-Map-Upload hat nicht funktioniert. In Sentry → Releases → suche den Commit-SHA → sollte "Artifacts" > 0 haben. Falls 0: Auth-Token-Scope prüfen.

**Problem: User-Context leaked E-Mail**
→ Darf nicht passieren. Check `SessionKeepAlive.tsx` — dort steht explizit nur `Sentry.setUser({ id: user.id })`. Falls doch: `sendDefaultPii: false` im `instrumentation-client.ts` prüfen.

---

## Kostenhorizont

- **Developer-Plan:** kostenlos bis 5k Events/Monat. Reicht für bis zu ~5k Fehler/Monat.
- **Team-Plan:** $26/Monat → 50k Events. Upgrade erst nötig wenn produktiver Traffic hochgefahren ist.
- **Retention:** Events 30 Tage auf Free, 90 Tage auf Team.
- **Source-Maps:** zählen nicht als Events, kostenlos.

Nach Launch monitor'n: Wenn Events konstant >3k/Monat → Team-Plan.
