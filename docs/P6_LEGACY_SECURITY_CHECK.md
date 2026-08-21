# P6 Legacy Security Check — ChairMatch Legacy (`vlrviyrgggzhayepfmop`)

**Stand:** 2026-08-21
**Auftrag:** Track 4 — P6 vollständig prüfen, bevor über Löschung entschieden wird (CEO: „P6 NICHT löschen, ZUERST vollständig prüfen").
**Prüfer:** automatisiert, read-only + non-destruktive Write-Probes.
**Ergänzt:** P5 (`uwmjqckhjkgukhzeidyw`) Karteileichen-Bestätigung.

> **Keine Secret-Werte in diesem Dokument.** Dokumentiert werden nur Key-**Typ**, **Ref**, **Fundort** (Datei:Zeile) und **Zugriffs-Posture** (HTTP-Codes / RLS-Verhalten). Der Anon-Key wurde dekodiert (nur Claims), nie geloggt.

---

## 0. Kernbefund in einem Satz

P6 ist **nicht** „keine aktive Nutzung" — es existiert ein **live erreichbares öffentliches Deployment** (GitHub Pages), das die Legacy-SPA mit **hartkodiertem Anon-Key** ausführt und zur Laufzeit gegen die **lebende** P6-Datenbank verbindet. Zwei Aussagen der bisherigen Dependency-Map sind damit widerlegt (siehe §7). **Status: `DECOMMISSION_CANDIDATE` — mit einer akuten, sofort schließbaren Live-Exposition.**

---

## 1. Key-Identifikation (nur Typ)

| Feld | Wert |
|------|------|
| Fundort | `/Users/work/chairmatch/index_legacy.html:199-200` (`SUPABASE_URL` + `SUPABASE_KEY`) |
| Key-Typ | **anon JWT** (HS256), Claims: `iss=supabase`, `ref=vlrviyrgggzhayepfmop`, `role=anon` |
| Gültigkeit | `iat=2026-03-01`, `exp=2036-02-27` — **noch ~10 Jahre gültig** |
| Signaturmodell | Legacy-JWT (anon + service_role am selben Projekt-Secret → nur gemeinsam rotierbar) |
| Repo-Status | **getrackt** im **öffentlichen** Repo `YusufFerhatDemir/chairmatch` (`private:false`, `visibility:public`) |
| Öffentlich abrufbar | **ja** — `raw.githubusercontent.com/.../main/index_legacy.html` → **HTTP 200** |

---

## 2. Projekt lebt — Erreichbarkeit & Auth-Konfiguration

| Endpoint | Ergebnis |
|----------|----------|
| `REST /rest/v1/` (ohne Key) | 401 „No API key found" |
| `REST /rest/v1/` (mit anon-Key) | 401 „Only the `service_role` API key can be used for this endpoint" (OpenAPI-Root, erwartbar) |
| `GET /auth/v1/health` | **200** — GoTrue v2.195.0 |
| `GET /auth/v1/settings` (anon) | **200** |

**Auth-Settings (Live):**

| Setting | Wert | Bewertung |
|---------|------|-----------|
| `disable_signup` | **`false`** | ⚠️ **Jeder kann sich auf dem Zombie-Projekt registrieren.** |
| `mailer_autoconfirm` | **`true`** | ⚠️ Konten werden **ohne E-Mail-Bestätigung** sofort aktiv. |
| `email` Provider | `true` | Passwort-Signup offen |
| `sms_provider` | `twilio` | Falls Twilio-Guthaben hängt → potenzieller Kostenhebel via `/otp` |
| externe OAuth | alle `false` | — |
| `saml_enabled` | `false` | — |

> Kombination `disable_signup=false` + `mailer_autoconfirm=true` auf einem unbeobachteten Projekt = offene Account-Fabrik. Selbst wenn RLS die Daten schützt, ist die Auth-Fläche eine Missbrauchsquelle (Spam-Konten, ggf. SMS-Kosten).

---

## 3. Tabellen & anon-Lesezugriff (verifiziert)

Enumeriert über PostgREST mit dem öffentlichen anon-Key (= exakt das, was ein Angreifer mit dem Public-Repo kann). Zeilenzahl via `Prefer: count=exact` / `Content-Range`.

### 3a. Anon SELECT **ERLAUBT** (RLS lässt anon lesen)

| Tabelle | Zeilen | Sensible Spalten | Leck-Bewertung |
|---------|-------:|------------------|----------------|
| `salons` | 16 | `owner_id`, `email`, `phone`, `street`, `postal_code` | **MITTEL** — Betreiber-Kontaktdaten (i.d.R. gewollt öffentlich für Marktplatz, aber `owner_id`+`email` sind PII) |
| `services` | 44 | Preise, `salon_id` | NIEDRIG (Katalog, öffentlich sinnvoll) |
| `rental_options` | 24 | Preise, `photo_url`, `images` | NIEDRIG |
| `opening_hours` | 112 | — | NIEDRIG |
| `reviews` | 21 | **`customer_id`**, **`username`**, `comment`, `rating` | **MITTEL** — verknüpft Kunden-UUID mit Klarnamen/Kommentar |

### 3b. Anon SELECT liefert **0 Zeilen** (RLS-blockiert **ODER** leer — unentscheidbar¹)

| Tabelle | HTTP | Interpretation |
|---------|------|----------------|
| `profiles` | 200 `*/0` | wahrscheinlich RLS-geschützt (o. leer) |
| `bookings` | 200 `*/0` | „ |
| `favorites` | 200 `*/0` | „ |
| `payments` | 200 `*/0` | **sensibel** — falls je befüllt, muss RLS hart sein |
| `messages` | 200 `*/0` | **sensibel** |
| `notifications` | 200 `*/0` | **sensibel** |
| `salon_images` | 200 `*/0` | — |

¹ **Methodik-Hinweis:** PostgREST liefert für „RLS filtert alle Zeilen" und „Tabelle leer" **identisch** `200 []` / `*/0`. Ohne `service_role`/SQL-Zugang ist nicht unterscheidbar, ob hier RLS greift oder die Tabelle nur leer ist. Fail-closed bewerten: **nicht als sicher annehmen**, bis per Policy-Read bewiesen.

### 3c. Nicht existent (404)

`providers`, `provider_specialists`, `specialists` — im Legacy-SPA-Code referenziert, aber im P6-Schema nicht vorhanden (die SPA war beim letzten Stand teilweise auf ein anderes Schema verdrahtet). Kein Sicherheitsbefund, aber Beleg, dass die SPA gegen ein **veraltetes** Schema läuft.

---

## 4. anon Schreibzugriff (non-destruktiv geprüft)

**Methodik:** INSERT mit leerem Body (kann keine valide Zeile erzeugen); UPDATE/DELETE mit unmöglicher `WHERE`-Bedingung (`id=eq.<Null-UUID>`, trifft 0 Zeilen). Keine Daten verändert.

| Operation | Ergebnis | Interpretation |
|-----------|----------|----------------|
| **INSERT** (alle 10 getesteten Tabellen) | **401 / `42501` „new row violates row-level security policy"** | ✅ **Fail-closed** — anon INSERT ist RLS-gesperrt (`WITH CHECK` aktiv). |
| **DELETE** (impossible WHERE) | 204 / `[]` | ⚠️ **Unentscheidbar** — kein „permission denied for table" → anon **hat Tabellen-Grant**; 0 betroffene Zeilen sagen nichts über die `USING`-Policy. |
| **UPDATE** (impossible WHERE) | 200 / `[]` | ⚠️ **Unentscheidbar** — wie DELETE. |

> **Wichtig:** Dass DELETE/UPDATE **kein** `42501 permission denied for table` werfen, heißt: die anon-Rolle **besitzt die Tabellen-Privilegien** (Supabase-Default). Der Schutz hängt damit **ausschließlich** an den per-Command-`USING`-Policies — und die sind ohne `service_role` nicht lesbar. Da anon in 5 Tabellen (§3a) Zeilen **sehen** kann, wäre eine zu permissive `USING`-Policy für UPDATE/DELETE auf einer davon direkt ausnutzbar. **Write-Posture ist nicht als sicher bewiesen.** Ein destruktiver Beweis wurde bewusst unterlassen.

---

## 5. Storage & Edge Functions

| Prüfung | Ergebnis |
|---------|----------|
| `GET /storage/v1/bucket` (anon) | `200 []` — keine anon-sichtbaren Buckets (oder keine Buckets) |
| Bild-URLs in Daten (`logo_url`, `cover_url`, `gallery`, `photo_url`, `images`) | **durchgängig `null` / `[]`** — kein P6-Storage tatsächlich in Nutzung |
| Edge Functions | anon kann `/functions/v1/*` nicht enumerieren; SPA ruft keine `functions.invoke` auf → keine bekannten Functions |

---

## 6. Repo-Referenzen auf `vlrviyrgggzhayepfmop`

| Fundort | Art | Bewertung |
|---------|-----|-----------|
| `index_legacy.html:199-200` | hartkodierter Anon-Key + URL | **Kern-Leck** |
| **`next.config.ts:183-187`** | `next/image` `remotePattern` erlaubt `vlrviyrgggzhayepfmop.supabase.co` | ⚠️ **Von Map übersehen** — steht in der **Produktions**-Config von chairmatch.de. In der Praxis harmlos (alle Bild-URLs `null`, keine anon-Buckets), aber stale und sollte mit weg. |
| `VORSCHLAEGE.md`, `ICONS-ANLEITUNG.md`, `CLAUDE.md` | Doku-Erwähnungen von `index_legacy.html` | kein Key, unkritisch |
| SQL/Migrationen | **0 Treffer** | Alle `supabase/migrations/*` zielen auf P3 (`pwdbjqfpgumyfktbfswg`), keine auf P6 → P6 hat ein **eigenes, älteres** Schema, das nicht mehr gepflegt wird |

---

## 7. Widerlegte Annahmen der Dependency-Map

Zwei Aussagen aus `SUPABASE_KEY_DEPENDENCY_MAP.md` §6/Stufe 0 sind **falsch** und müssen korrigiert werden:

| Map-Aussage | Realität (verifiziert) |
|-------------|------------------------|
| „Keine aktive Nutzung im Code, `index_legacy.html` wird von keinem Build referenziert" | **`next.config.ts:186` referenziert P6 in Produktion.** Und: die Datei wird zwar von **Vercel** nicht serviert (nicht in `public/`, Next serviert kein Root-HTML) — **aber von GitHub Pages** (siehe unten). |
| „Pages ist aus, der Workflow ist heute Attrappe" | **GitHub Pages ist `status: "built"` und LIVE.** `gh api .../pages`: `source: branch main, path /`, `public:true`, `https_enforced:true`. |

### Der akute Live-Befund

```
https://yusufferhatdemir.github.io/chairmatch/index_legacy.html
→ HTTP 200, 363 068 Bytes — die vollständige Legacy-SPA
→ enthält den P6-Host + hartkodierten anon-Key
→ ruft window.supabase.createClient(P6_URL, P6_ANON_KEY) auf
```

Jeder mit dem Link öffnet eine **laufende App**, die sich live mit der P6-Datenbank verbindet — nicht nur Quelltext, sondern ein **aktives Deployment**. (Die Pages-Root `index.html` selbst ist nur ein 2,7-KB-Redirect-Stub auf `https://chairmatch.de` ohne Supabase-Bezug; die Exposition liegt allein an der direkt adressierbaren `index_legacy.html`.)

---

## 8. Gesamtbewertung

| Dimension | Bewertung |
|-----------|-----------|
| Projekt lebt? | **Ja** (Auth + REST antworten) |
| Produktive Abhängigkeit? | **Nein** — keine Migration, kein aktiver App-Konsument, keine Storage-Daten. `next.config.ts`-Eintrag ist wirkungslos (URLs null). |
| Offene Tabelle **ohne RLS**? | **Nicht nachgewiesen.** INSERT fail-closed; SELECT in 5 Tabellen offen (Marktplatz-typisch, aber `reviews`/`salons` mit PII); UPDATE/DELETE-Posture **unbewiesen**. |
| Akute Exposition? | **Ja** — öffentliches Pages-Deployment + öffentlicher anon-Key + offene Signups auf einem unbeobachteten Projekt. |
| **Status** | **`DECOMMISSION_CANDIDATE`** mit **sofort zu schließender Live-Exposition** (unabhängig vom Löschzeitpunkt). |

**Warum trotzdem nicht „kritisches Datenleck":** Die lesbaren Tabellen sind Marktplatz-Stammdaten (Salons, Services, Preise, Öffnungszeiten, Bewertungen). Sensible Tabellen (`payments`, `messages`, `profiles`, `bookings`) liefern anon **0 Zeilen**. Der schärfste Punkt ist nicht ein bestätigtes Massenleck, sondern die **unbewiesene Write-Posture** + die **offene Auth-/Signup-Fläche** eines **öffentlich deployten** Zombie-Projekts.

---

## 9. Sicherer Stilllegungsplan (fail-closed, ohne Datenverlust)

CEO-Vorgabe „NICHT löschen, erst prüfen" bleibt gewahrt: **kein** Schritt unten löscht die P6-Daten. Reihenfolge = höchster Wirkungsgrad zuerst.

### Stufe A — Live-Exposition sofort schließen (kein Datenverlust, reversibel)

Diese Schritte brauchen **Dashboard-Zugang** (Supabase/GitHub) — in dieser Session nicht verfügbar (kein Supabase-MCP/DDL, kein `gh`-Pages-Write-Recht bestätigt). **Aktion durch Yusuf:**

1. **GitHub Pages abschalten** für `YusufFerhatDemir/chairmatch` (Settings → Pages → Source: „None"). → killt das laufende Legacy-Deployment. **Einzelmaßnahme mit größter Wirkung.**
2. **Supabase P6: Signups sperren** (`disable_signup = true`). → stoppt die Account-Fabrik, ohne Bestandsdaten zu berühren.
3. **Supabase P6: Projekt „Pause"** (Supabase Dashboard → Pause project). → REST + Auth gehen offline, **Daten bleiben erhalten**. Der öffentliche anon-Key ist damit **wirkungslos**, egal wo er noch liegt. Das ist der eigentliche „prüfen-statt-löschen"-konforme Zustand.

### Stufe B — Repo bereinigen (kann ich autonom via `deploy.sh` — aber im chairmatch-Repo, s. Hinweis)

4. `git rm index_legacy.html` im chairmatch-Repo. **Hinweis:** History enthält den Key weiter → der Key ist **verbrannt** und darf nie wiederverwendet werden. Da P6 ohnehin pausiert/gelöscht wird, ist Rotation gegenstandslos.
5. `next.config.ts:183-187` (den `vlrviyrgggzhayepfmop`-`remotePattern`) entfernen.
6. `.gitignore`/ESLint-Ausnahme für `index_legacy.html` (`eslint.config.mjs:19`) mitentfernen, sobald die Datei weg ist.

> Diese Bereinigung betrifft **`/Users/work/chairmatch`** (eigenes Repo, eigener `deploy.sh`), **nicht** alltagsengel. Sie ist bewusst **nicht** Teil des alltagsengel-Deploys dieses Reports und wartet auf explizite Freigabe (Key aus History = eigener Umgang).

### Stufe C — Endgültige Löschung (später, CEO-Entscheidung, irreversibel)

7. Nach Retention-Fenster: P6-Projekt in Supabase löschen. Erst **nachdem** Stufe A/B stehen und ein Export gesichert ist. Irreversibel → nicht ohne separate Freigabe.

---

## 10. P5 — `uwmjqckhjkgukhzeidyw` (Alltagsengel Staging, verwaist)

| Prüfung | Ergebnis |
|---------|----------|
| REST-Erreichbarkeit | **HTTP 000** — DNS tot, Projekt existiert nicht mehr |
| `.env.staging.local` | vorhanden: `/Users/work/alltagsengel/.env.staging.local` (491 B, gitignored, **nur** `STAGING_SUPABASE_URL`/`ANON_KEY`/`PROJECT_REF` — **kein** service_role) |
| Runtime-Loader für `.env.staging.local` | **keiner** — kein Script/Loader liest die Datei; `staging-apply.sh` referenziert sie nicht |
| `STAGING_SUPABASE_*` Lesepfad | **keiner** im Code |
| Code-Referenzen auf den Ref | nur **Doku** (`audit/*.md`, diese Map) + **inerte String-Fixtures** in `__tests__/storage-key.test.ts:11,12,83,84` (testen die Regex `extractProjectRef`, verbinden **nicht** zum Projekt) |

**Bewertung:** Reine Karteileiche. Kein produktiver Traffic, keine Code-Abhängigkeit, Projekt physisch weg.
**Empfehlung:** `.env.staging.local` löschen — der enthaltene anon-Key ist auf ein nicht mehr existentes Projekt ausgestellt (wertlos), die Datei ist nur Inventur-Rauschen. Die Test-Fixtures bleiben unberührt (hardcodierte Strings, kein Env-Read). **Nicht in diesem Lauf gelöscht** (gitignored → kein Deploy-Effekt; Löschung auf Zuruf).

---

## 11. Was diese Session NICHT verifizieren konnte (`UNVERIFIED`)

Kein Supabase-MCP / kein `service_role` / kein DDL in dieser Session (konsistent mit bisherigem Session-Befund). Nicht geprüft, **nicht geraten**:

- **RLS-Policy-Quelltext** (`pg_policies`) für P6 → UPDATE/DELETE-`USING` bleibt unbewiesen (§4).
- Vollständige Tabellenliste (nur die aus dem SPA-Code + geratene Namen probiert; PostgREST-Root-Introspektion braucht `service_role`).
- Storage-RLS/Bucket-Policies über anon `[]` hinaus.
- Deployte Edge-Function-Secrets.

Diese Punkte sind erst mit Dashboard-/`service_role`-Zugang schließbar — der aber genau der Zugang ist, den Stufe A ohnehin voraussetzt.
