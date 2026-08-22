# Supabase Key-Migration — Roadmap (publishable / secret)

**Stand:** 2026-08-21
**Vorgänger-Dokument:** [`SUPABASE_KEY_DEPENDENCY_MAP.md`](./SUPABASE_KEY_DEPENDENCY_MAP.md) — dort steht, *was bricht*. Hier steht, *wie man es vermeidet*.
**CEO-Entscheidung, die diesem Plan zugrunde liegt:** erst auf `publishable`/`secret` migrieren, dann rotieren.

> **Keine Key-Werte in diesem Dokument.** Dokumentiert werden ausschließlich Key-**Typ**, **Variablenname** und **Ort**.

---

## 0. Kurzfassung

| | |
|---|---|
| **In diesem Lauf umgesetzt** | Alle Lesepfade in P1 (Alltagsengel) auf die Fallback-Kette `PUBLISHABLE \|\| ANON` bzw. `SECRET \|\| SERVICE_ROLE` gehoben — **rein additiv**, Produktion läuft unverändert mit den Legacy-Keys weiter. |
| **Nicht im Code lösbar** | Das Anlegen der neuen Keys und das Setzen der Vercel-Variablen. Siehe [§7 CEO_ACTION_REQUIRED](#7-ceo_action_required). |
| **Wichtige Korrektur zur Ausgangsannahme** | Die Migration auf `publishable`/`secret` macht die **API-Keys** unabhängig rotierbar — sie macht **nicht** das Session-Signaturgeheimnis rotierbar. Dafür braucht es eine **zweite, davon getrennte Migration** (*JWT signing keys*). Details in [§2](#2-die-entscheidende-korrektur-es-sind-zwei-migrationen). |
| **Offen / nicht verifizierbar** | Ob `@supabase/supabase-js` mit einem Publishable-Key ohne Anpassung funktioniert — messbar, sobald ein Key existiert: `npm run verify:publishable-key`. Siehe [§6](#6-der-eine-offene-technische-punkt). |

---

## 1. Faktenlage aus der Supabase-Dokumentation

Abgerufen am 2026-08-21 von `supabase.com/docs`:
[Migrating to publishable and secret API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys) ·
[Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys) ·
[JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys)

| Punkt | Aussage der Doku | Konsequenz für uns |
|-------|------------------|--------------------|
| Neue Key-Typen | `sb_publishable_…` ersetzt `anon`, `sb_secret_…` ersetzt `service_role` | 1:1-Abbildung, keine Umbauten an der Rechtelogik |
| Abkündigung | Legacy-Keys werden **Ende 2026** abgekündigt | Die Migration ist kein Optimierungsprojekt, sondern hat eine Frist |
| Parallelbetrieb | „Both key types work simultaneously" — das Anlegen der neuen Keys ändert nichts an den alten | Die Umstellung ist ohne Wartungsfenster machbar, Client für Client |
| RLS | Publishable-Key = dieselben niedrigen Rechte wie `anon`; Rolle bleibt `anon` bzw. `authenticated` | **Kein RLS-Policy-Umbau nötig.** Alle bestehenden Policies gelten unverändert |
| Auth | „User authentication through Supabase Auth is unchanged" | Login-Flow, PKCE, Session-Handling bleiben wie sie sind |
| **Header-Regel** | **„You can't send a publishable or secret key in the `Authorization: Bearer …` header. Send it on the `apikey` header instead."** | **Der teuerste Punkt der ganzen Migration** — siehe unten |
| Secret-Key-Schutz | Secret-Keys antworten im Browser (User-Agent-Erkennung) immer mit HTTP 401 | Zusätzliche Schutzschicht über unseren `server-only`-Guard hinaus |
| Mehrere Secret-Keys | Pro Backend-Komponente ein eigener benannter Secret-Key möglich | Ein Leck erzwingt dann nur *eine* Rotation, nicht alle |
| Edge Functions | Neue Env-Variablen `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS` — **JSON-Objekte**, nicht Strings; Zugriff über `JSON.parse(...)['default']` | Unsere Edge Function muss angefasst werden, wenn sie auf die neuen Keys geht |
| Edge Functions / `verify_jwt` | Die Plattform-JWT-Prüfung versteht nur die Legacy-Keys → `verify_jwt = false` und Autorisierung im Funktionscode | Betrifft `account-hard-delete` |
| `pg_net` / Database Webhooks | Senden den Key üblicherweise als `Authorization: Bearer` → mit neuen Keys abgelehnt; stattdessen `apikey`-Header | **Bei uns aktuell nicht betroffen** — kein `pg_net`-Aufruf mit Service-Key im Repo gefunden |
| Realtime | Öffentliche Realtime-Verbindungen ohne User-Auth sind auf 24 h begrenzt | Für uns unkritisch: Realtime läuft nur eingeloggt |
| Rückweg | Legacy-Keys lassen sich nach dem Deaktivieren wieder aktivieren | **Schritt 6 der Migration ist umkehrbar** — anders als ein JWT-Roll |

### Warum die Header-Regel der teuerste Punkt ist

Die neuen Keys sind keine JWTs. Wird ein solcher Key trotzdem als `Authorization: Bearer …` geschickt, antwortet die API mit *Invalid JWT*.

Für ein Sicherheits-Prüfskript ist das die gefährlichste denkbare Fehlerform: **eine abgelehnte Anfrage sieht aus wie „kein Zugriff möglich" — also wie ein bestandener Test.** Ein Lauf wie `verify-anon-exposure.mjs` hätte nach der Umstellung 322 Relationen als „dicht" gemeldet, ohne eine einzige davon tatsächlich geprüft zu haben.

Deshalb ist die Header-Logik in diesem Umbau nicht in 24 Skripten einzeln nachgebaut, sondern zentralisiert (`scripts/lib/supabase-keys.mjs`, `lib/supabase/keys.ts`) und mit einem Regressionstest gegen Rückfall gesichert.

---

## 2. Die entscheidende Korrektur: es sind zwei Migrationen

Die Ausgangsannahme lautete: „Erst auf publishable/secret migrieren, dann rotieren — dann werden keine Nutzer mehr ausgeloggt."

Der erste Teil stimmt. Der zweite gilt nur für die API-Keys, nicht für die Nutzersessions. Die Supabase-Doku sagt es am Ende des Migrationsleitfadens ausdrücklich:

> Die neuen Keys sind keine JWTs und berühren das JWT-Secret des Projekts nicht mehr. Die Access-Tokens, die Supabase Auth an die **Nutzer** ausgibt, werden aber weiterhin mit genau diesem gemeinsamen Secret signiert.

Daraus folgt die saubere Trennung:

| Migration | Was sie löst | Was sie **nicht** löst |
|-----------|--------------|------------------------|
| **A · publishable / secret API keys** | Anon- und Service-Key werden **einzeln** rotierbar. Ein kompromittierter Server-Key erzwingt keine Rotation des Client-Keys mehr. Kein Logout, weil das JWT-Secret gar nicht angefasst wird. | Das JWT-Secret selbst. Wer es rollt, loggt weiterhin alle aus. |
| **B · JWT signing keys** | Das Session-Signaturgeheimnis wird rotierbar — laut Doku ausdrücklich **ohne Downtime und ohne dass Nutzer ausgeloggt werden**: nach der Rotation werden neue Tokens mit dem neuen Schlüssel ausgestellt, noch gültige alte Tokens bleiben akzeptiert. Bei asymmetrischen Schlüsseln erfolgt die Prüfung lokal über `/auth/v1/.well-known/jwks.json`. | Nichts an den API-Keys — das ist Migration A. |

**Für P1 ist das der eigentliche Hebel.** Die App betreibt bewusst eine 365-Tage-Session mit dreifacher Redundanz (Cookie + localStorage + IndexedDB) unter der Zusage „einmal anmelden → nie wieder fragen". Nur Migration B macht diese Zusage und ein rotierbares Signaturgeheimnis miteinander vereinbar.

**Empfohlene Reihenfolge:** A vollständig abschließen (inkl. Deaktivierung der Legacy-Keys), **danach** B als eigenes Vorhaben. Nicht gleichzeitig — bei einem Fehler wäre sonst nicht unterscheidbar, welche der beiden Migrationen ihn verursacht hat.

Zwei Punkte, die vor B geprüft sein müssen (Doku, „Getting started"):

1. Verifiziert irgendein Code-Pfad JWTs direkt gegen das Legacy-Secret (`jose`, `jsonwebtoken`)? — **Im Alltagsengel-Repo: nein.** Die Prüfung läuft ausschließlich über `supabase.auth.getUser()` in `proxy.ts`.
2. Steht bei einer Edge Function die „Verify JWT"-Einstellung an? — betrifft `account-hard-delete`, siehe [§7](#7-ceo_action_required).

---

## 3. P1 Alltagsengel (`nnwyktkqibdjxgimjyuq`) — umgesetzt

### 3.1 Das Muster

Zwei zentrale Helfer, überall sonst nur noch Aufrufe:

```
lib/supabase/keys.ts          → supabasePublishableKey()  = PUBLISHABLE || ANON
                                supabaseApiHeaders(key)   = apikey [+ Bearer nur bei Legacy-JWT]
lib/supabase/admin.ts         → supabaseSecretKey()       = SECRET || SERVICE_ROLE   (server-only)
scripts/lib/supabase-keys.mjs → publishableKey() / secretKey() / apiHeaders()
```

Drei Entwurfsentscheidungen, die nicht offensichtlich sind:

- **Die `process.env.…`-Zugriffe sind ausgeschrieben, nicht dynamisch.** Next.js (und Expo) ersetzen `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` **textuell zur Build-Zeit**. `process.env[name]` wird im Browser-Bundle nicht ersetzt und ist dort `undefined`. Ein „eleganter" dynamischer Zugriff hätte die Web-App beim ersten Deploy stillgelegt.
- **Der geheime Key steht bewusst *nicht* in `lib/supabase/keys.ts`.** Diese Datei wird über `client.ts` ins Browser-Bundle gezogen. Der Secret-Key lebt ausschließlich in `lib/supabase/admin.ts`, das per `import 'server-only'` gesperrt ist.
- **`supabaseApiHeaders()` überschreibt einen mitgegebenen `Authorization`-Header nie.** Wo ein User-JWT durchgereicht wird, muss dieses gewinnen.

### 3.2 Alle Fundstellen — Vorher/Nachher

**Laufzeit-Code (öffentlicher Key)**

| Datei | vorher | nachher |
|-------|--------|---------|
| `lib/supabase/client.ts:140` | `process.env.…ANON_KEY!` | `supabasePublishableKey()` |
| `lib/supabase/server.ts:8` | `process.env.…ANON_KEY!` | `supabasePublishableKey()` |
| `lib/supabase.ts:5` | `process.env.…ANON_KEY \|\| ''` | `supabasePublishableKey()` |
| `proxy.ts:146` | `process.env.…ANON_KEY!` | `supabasePublishableKey()` |
| `app/api/user/delete/route.ts:78-80` | eigene Fallback-Kette (die eine Vorreiter-Stelle) | auf den zentralen Helfer gehoben |
| `lib/go-live/status.ts:194` | `apikey` **+** `Authorization: Bearer` | `supabaseApiHeaders()` — Bearer entfällt bei neuen Keys |
| `lib/go-live/status.ts:93` | Pflicht-Env-Liste kannte nur `…ANON_KEY` | akzeptiert `PUBLISHABLE` **oder** `ANON` |
| `native/src/constants/config.ts:8` | `EXPO_PUBLIC_…ANON_KEY` | `EXPO_PUBLIC_…PUBLISHABLE_KEY \|\| EXPO_PUBLIC_…ANON_KEY` |

**Laufzeit-Code (geheimer Key)**

| Datei | Änderung |
|-------|----------|
| `lib/supabase/admin.ts` | `supabaseSecretKey()` = `SECRET \|\| SERVICE_ROLE`; einziger Konstruktionsort, unverändert durch den `server-only`-Guard geschützt |
| `app/api/push/send/route.ts` | Der `x-service-key`-Vergleich akzeptiert jetzt **beide** Keys; leere Werte gelten nie als Treffer (fail-closed) |
| `app/api/analytics/vitals/route.ts` | Env-Gate akzeptiert beide |
| `lib/go-live/status.ts` (Bereich Security) | Prüfung „Geheimer Server-Key gesetzt" akzeptiert beide und **nennt die Quelle** — im Dashboard ist damit ablesbar, ob das Projekt schon umgestellt ist |

**Skripte** — 16 × `.mjs` (Key-Lesepfad + Header über `apiHeaders()`), 8 × `.ts` (Key-Lesepfad; diese nutzen `supabase-js` und bauen keine Roh-Header):

```
.mjs  apply-migration · schema-drift-check · security-redteam-phase7 · seed-betriebssystem
      stammdaten-bestand · verify-anon-exposure · verify-kassenabrechnung-final-reverify
      verify-pflegecoach-migration · verify-phase2-3-4-stabilisierung · verify-profiles-rls
      verify-registration-flow · verify-rls-abrechnungsdaten · verify-security-fixes-2026-08-19
      verify-security-p0 · verify-sis-migration · verify-sql-exec-abgesichert
.ts   audit-rls · bereinige-testdaten · budget-nachziehen · go-live-check
      kernpfad-dryrun · pilot-e2e-durchlauf · readiness-live · rls-matrix
```

**Bewusst *nicht* angefasst**

| Ort | Begründung |
|-----|------------|
| `.github/workflows/ci.yml:29-31` | Platzhalterwerte. Der Legacy-Name bleibt stehen, damit CI weiterhin den Fallback-Zweig durchläuft — der Publishable-Zweig ist durch Unit-Tests abgedeckt. |
| `SHADOW_SUPABASE_*` (P2) und `scripts/shadow-db-http.sh`, `scripts/staging-app.sh` | Der lokale Shadow-Shim signiert eigene JWTs mit `SHADOW_JWT_SECRET`. Er kennt keine `sb_*`-Keys und darf nicht umgestellt werden. |
| `chairmatch-landing/` | Deploy-Pfad ist tot (GitHub Pages aus), Config-Datei ist gitignored. Kein Konsument, der brechen könnte. |

### 3.3 Regressionsschutz

Neu: `__tests__/security/supabase-key-migration.test.ts` — **14 Tests, grün.**

Der Skript-Scan kennt eine benannte Ausnahmeliste (`BEARER_AUSNAHMEN`):
`scripts/lib/supabase-keys.mjs` (der Header-Helfer selbst) und
`scripts/verify-publishable-key.mjs` (Diagnoseskript — sein Test 2 schickt den
Bearer-Header absichtlich, um zu messen, ob Supabase den supabase-js-Aufrufweg
ohne Session annimmt). Ein eigener Test faellt, sobald ein Listeneintrag auf
eine nicht mehr existierende Datei zeigt.

| Was geprüft wird | Warum |
|------------------|-------|
| Publishable gewinnt gegen Anon; leerer Publishable-Wert fällt auf Anon zurück; keiner gesetzt → `''` | Beide Zweige der Fallback-Kette müssen belegt sein, nicht nur der gerade aktive |
| `supabaseApiHeaders()`: Bearer bei `eyJ…`, **kein** Bearer bei `sb_publishable_…` | Verhindert das „still grüne" Sicherheitsskript aus §1 |
| Mitgegebener `Authorization`-Header wird nie überschrieben | Durchgereichte User-JWTs |
| Scan: kein direkter `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` in `app/`, `lib/`, `components/`, `proxy.ts` | Ein neuer Direktzugriff würde beim Umschalten still am alten Key hängen bleiben |
| Scan: kein roher `Authorization: Bearer` in `scripts/*.mjs` | dito für die Prüfwerkzeuge |
| `lib/supabase/admin.ts` enthält die Secret-Fallback-Kette | |

**Zusätzlich mit den Legacy-Keys gegen Production nachgemessen** (der Umbau darf den Ist-Zustand nicht verändern):

| Lauf | Ergebnis |
|------|----------|
| `node scripts/verify-anon-exposure.mjs` | OK — 322 Relationen geprüft, 6 bewusst öffentlich |
| `node scripts/verify-security-p0.mjs` | 9/9 bestanden |
| `node scripts/verify-profiles-rls.mjs` | unverändert zum Vorbefund (offen bleibt allein die Profil-Anzahl 61 statt 59 — eine Datenstandsabweichung, kein Key-Thema) |
| `npm run test:unit` | 794/794 |
| `npx vitest run` (Security-Suiten einzeln) | grün |

### 3.4 Neu: Rauchtest vor dem Umschalten

```bash
npm run verify:publishable-key
```

Prüft mit einem echten Publishable-Key vier Aufrufformen gegen das Projekt:
`apikey` allein · `apikey` + identischer `Authorization: Bearer` (**so ruft `supabase-js` ohne aktive Session**) · `createClient(url, key)` · Auth-Endpunkt.

Ohne gesetzten Key endet der Lauf mit **Exit 2 („nicht ausführbar")** — bewusst nicht mit 0. Ein übersprungener Test darf nie wie ein bestandener aussehen.

---

## 4. P3 ChairMatch (`pwdbjqfpgumyfktbfswg`) — Roadmap

Eigenes Repo `/Users/work/chairmatch`, **öffentlich**. Hier wurde nichts geändert (Auftragsgrenze: Code-Änderungen nur im Alltagsengel-Repo).

### 4.1 Fundstellen

| Datei | Key | Anmerkung |
|-------|-----|-----------|
| `src/lib/supabase.ts:5` | anon | Browser-Client |
| `src/modules/auth/auth.config.ts:9`, `auth.actions.ts:8` | anon | Auth-Pfad |
| `src/app/api/auth/register/route.ts:7` | anon | |
| `src/app/api/auth/forgot-password/route.ts:5` | anon | |
| `src/app/api/register-provider/route.ts:7` | anon | |
| `src/app/(auth)/auth/reset-password/page.tsx:9` | anon | |
| `src/__tests__/e2e/auth-flow.test.ts:18` | anon | Testplatzhalter |
| `src/lib/supabase-server.ts:13` | service_role | **fail-closed**, kein Anon-Fallback |
| `src/app/api/admin/health/route.ts:27` | service_role | reine Existenzprüfung |
| `scripts/rls-security-test.mjs:23-24` | anon + service_role | Sicherheitslauf |
| `mobile/src/lib/supabase.ts:11-18` | anon **hartkodiert** | in drei JWT-Segmente zerlegt, um `precommit-guard.sh` zu umgehen |

### 4.2 Schritte

1. **Denselben Helfer anlegen** — `src/lib/supabase-keys.ts` mit `publishableKey()` / `apiHeaders()`, Muster 1:1 aus `lib/supabase/keys.ts` übernehmen. Die 7 Anon-Lesepfade darauf heben.
2. **`src/lib/supabase-server.ts` auf `SUPABASE_SECRET_KEY || SUPABASE_SERVICE_ROLE_KEY`.** Das bewusste Fail-Closed-Verhalten bleibt: kein Fallback auf den öffentlichen Key. **Erhöhtes Risiko beachten** — bei ChairMatch läuft der gesamte Server-Code über `service_role`, RLS ist dort *nicht* die Datengrenze. Ein falscher Key legt die App vollständig lahm (dafür sofort sichtbar statt schleichend).
3. **`scripts/rls-security-test.mjs`** auf `apiHeaders()` — mit derselben Begründung wie in §1: ein Sicherheitslauf, der wegen *Invalid JWT* nichts prüft, meldet grün.
4. **`mobile/src/lib/supabase.ts` — der eigentliche Blocker.** Den hartkodierten, zerlegten Anon-Key ersatzlos entfernen und `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` verbindlich machen (fail-closed werfen, wie `supabase-server.ts` es vormacht). Der `.join('.')`-Trick gehört gestrichen: er unterläuft `precommit-guard.sh` genau für die Kategorie, die der Guard erkennen soll. Danach Release **und Adoptionsfenster** — ausgelieferte Installationen mit dem alten Fallback funktionieren nach dem Abschalten der Legacy-Keys nicht mehr.
5. **`index_legacy.html`** (P6-Key, siehe [§8](#8-p2-p5-p6)) im selben Zug entfernen.
6. Vercel-Variablen setzen → **Redeploy** (`NEXT_PUBLIC_*` ist build-time) → `scripts/rls-security-test.mjs` mit dem neuen Secret-Key → Cron-Routen (`hard-delete`, `publish-reviews`, `rental-payouts`) im nächsten Zyklus prüfen.

`@supabase/supabase-js` liegt dort auf `^2.98.0` — dieselbe Generation wie bei P1, dieselbe offene Frage aus [§6](#6-der-eine-offene-technische-punkt).

---

## 5. P4 efy care (`nsfbwhpjesmathsrqkfi`) — Roadmap

Eigenes Repo `/Users/work/efy-care`, Expo-App + Edge Functions. Hier wurde nichts geändert.

### 5.1 Fundstellen

| Datei | Key | Anmerkung |
|-------|-----|-----------|
| `app/src/lib/supabaseConfig.ts:20-21` | `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | **mit hartkodiertem `FALLBACK_URL` / `FALLBACK_ANON_KEY` im committeten Quelltext** |
| `app/src/lib/supabaseConfig.ts:29` | — | leitet den Session-Storage-Key aus der URL ab (gleiche Kopplung wie P1) |
| `app/env.example` | anon | Vorlage |
| `supabase/functions/ocr-leistungsnachweis/index.ts:111-113` | plattform-injiziert | `SUPABASE_URL` / `_ANON_KEY` / `_SERVICE_ROLE_KEY` |
| `supabase/functions/_shared/stripe-helpers.ts:16,23` | plattform-injiziert | dito |

### 5.2 Schritte — abweichend, weil eine App im Store hängt

1. **Fallback-Konstanten entfernen** und die Kette aufbauen:
   ```ts
   export const supabaseAnonKey =
     process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
     process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
     ''
   ```
   Fehlt beides: werfen, nicht auf einen Literalwert zurückfallen. Ausgeschrieben lassen — Expo ersetzt `EXPO_PUBLIC_*` beim Bundeln textuell, dynamischer Zugriff funktioniert nicht.
   *Genau dieses Muster ist in diesem Lauf in `native/src/constants/config.ts` bereits umgesetzt und kann von dort übernommen werden.*
2. **`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in EAS hinterlegen** (`npx eas env:create`) und in `app/env.example` dokumentieren.
3. **Release ausliefern, dann Adoptionsfenster abwarten.** Dessen Länge bestimmt der App-Store-Verlauf, nicht dieser Plan. **Erst danach** dürfen die Legacy-Keys deaktiviert werden — sonst sind alle nicht aktualisierten Installationen ausgesperrt.
4. **Edge Functions** (`ocr-leistungsnachweis`, `stripe-webhook`, `_shared/stripe-helpers.ts`): heute plattform-injiziert und damit selbstnachziehend. Für die neuen Keys ändert sich die Zugriffsform — die neuen Variablen sind **JSON-Objekte**:
   ```ts
   const secretKey = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default']
   ```
   Zusätzlich: `verify_jwt = false` setzen und die Autorisierung im Funktionscode selbst prüfen, weil die Plattform-JWT-Prüfung die neuen Keys nicht versteht. **Solange die Funktionen die Legacy-Variablen lesen, ist hier nichts zu tun** — Punkt 4 wird erst mit dem Abschalten der Legacy-Keys fällig.

`@supabase/supabase-js` liegt dort auf `^2.110.0`.

---

## 6. Der eine offene technische Punkt

**Frage:** Funktioniert `createClient(url, publishableKey)` ohne Anpassung?

`@supabase/supabase-js` (P1: 2.103.3) setzt in `SupabaseClient` den Header `Authorization: Bearer ${supabaseKey}`, solange keine Nutzersession existiert. Die Doku sagt an einer Stelle klar „nicht im Bearer-Header senden", an anderer Stelle differenzierter: bei **exakt gleichem Wert** in `apikey` und `Authorization` werde die Anfrage durchgereicht. Gleichzeitig ist `createClient(url, 'sb_publishable_…')` das offizielle Beispiel des Migrationsleitfadens.

**Diese Frage wird hier nicht geraten.** Sie ist mit einem Kommando beantwortbar, sobald ein Publishable-Key existiert:

```bash
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_… npm run verify:publishable-key
```

- **Alle vier Prüfungen grün** → die Umstellung ist eine reine ENV-Änderung, der Code ist fertig.
- **Prüfung 2/3 rot bei grüner Prüfung 1** → `supabase-js` braucht einen expliziten Header-Override (`global.headers`) oder eine neuere Version. Das ist dann eine begrenzte Änderung an genau vier Konstruktionsorten (`client.ts`, `server.ts`, `lib/supabase.ts`, `proxy.ts`) — der Rest des Umbaus bleibt gültig.

**Dieser Lauf ist der Gate-Schritt vor jeder Vercel-Änderung.**

---

## 7. CEO_ACTION_REQUIRED

Alles hier ist **außerhalb** dessen, was ein Agent tun kann: Dashboard-Zugriff und Vercel-Environment. Die Reihenfolge ist bindend.

### Schritt 1 — Keys anlegen (kein Risiko, kein Wartungsfenster)

Für **jedes** Projekt einzeln, im Supabase-Dashboard unter
**Settings → API Keys → Tab „Publishable and secret API keys" → `Create new API keys`**:

| # | Projekt | Ref |
|---|---------|-----|
| P1 | Alltagsengel Production | `nnwyktkqibdjxgimjyuq` |
| P2 | Alltagsengel Shadow (CI) | `ecknsffriyeihkorxmci` |
| P3 | ChairMatch Production | `pwdbjqfpgumyfktbfswg` |
| P4 | efy care | `nsfbwhpjesmathsrqkfi` |

> Das Anlegen **deaktiviert die Legacy-Keys nicht.** Beide Modelle laufen parallel. Dieser Schritt ist folgenlos für den laufenden Betrieb — er erzeugt nur die Werte, ohne die alles Weitere nicht messbar ist.

Die neuen Keys entstehen unter dem Namen `default`. Optional lassen sich später weitere benannte Secret-Keys anlegen (ein Key je Backend-Komponente), damit ein Leck nur eine Rotation erzwingt. Für die Erstmigration reicht `default`.

**Werte bitte in den Passwortmanager, nicht in eine Datei im Repo, nicht in eine Chatnachricht.**

### Schritt 2 — Gate: Rauchtest (vor jeder Vercel-Änderung)

Publishable-Key von P1 lokal in `.env.local` eintragen und laufen lassen:

```bash
npm run verify:publishable-key
```

Erst bei **4/4 grün** weiter zu Schritt 3. Bei einem Befund: Ergebnis melden, der Code wird nachgezogen — die Vercel-Variablen bleiben so lange unberührt.

### Schritt 3 — Vercel-Variablen setzen

Vercel-Projekt **`alltagsengel`** (Team `team_iJXOJqpBTNdePfg1tMV0r1ip`), **Production *und* Preview**:

| Variable | Wert | Environment |
|----------|------|-------------|
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable-Key aus Schritt 1 | Production + Preview |
| `SUPABASE_SECRET_KEY` | Secret-Key aus Schritt 1 | Production + Preview |

**Die Legacy-Variablen `NEXT_PUBLIC_SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` bleiben zunächst stehen.** Sie sind der Rückfallweg: Wird die neue Variable entfernt, greift automatisch wieder die alte. Ohne diesen doppelten Boden gäbe es keinen Rollback ohne Redeploy.

Vercel-Projekt **`chairmatch`**: dieselben zwei Variablen — aber **erst nach** Umsetzung von [§4](#4-p3-chairmatch-pwdbjqfpgumyfktbfswg--roadmap), Schritte 1-4.

### Schritt 4 — Redeploy (zwingend)

`NEXT_PUBLIC_*` wird **zur Build-Zeit** ins Client-Bundle gebacken. Eine geänderte Variable ohne Redeploy ändert **gar nichts** — die ausgelieferte App läuft weiter mit dem alten Key. `SUPABASE_SECRET_KEY` dagegen wird zur Laufzeit gelesen und greift beim nächsten Function-Kaltstart.

### Schritt 5 — Abnahme in dieser Reihenfolge

1. `/api/health`
2. Login mit Testkonto → belegt Publishable-Key + Auth
3. Zugriff auf eine geschützte Route → belegt, dass `proxy.ts` nicht fail-closed blockt
4. `/admin/go-live` öffnen → die Zeile „Geheimer Server-Key gesetzt" muss **„gesetzt (SUPABASE_SECRET_KEY)"** anzeigen. Steht dort noch „Legacy", greift der Fallback und Schritt 3/4 ist unvollständig.
5. `node scripts/verify-security-p0.mjs` → belegt Secret-Key + RLS
6. `node scripts/verify-anon-exposure.mjs` → belegt, dass der neue öffentliche Key nichts freilegt
7. Nächster Cron-Zyklus: `mahnlauf` (07:00), `automatisierung` (05:00)

### Schritt 6 — Edge Function `account-hard-delete` (P1)

Erst fällig, wenn die Legacy-Keys abgeschaltet werden sollen. Heute liest die Funktion `SUPABASE_SERVICE_ROLE_KEY` aus der plattform-injizierten Umgebung und zieht sich selbst nach. Für die neuen Keys sind drei Dinge nötig:
1. `JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default']` statt des Strings,
2. `verify_jwt = false`, weil die Plattformprüfung die neuen Keys nicht versteht,
3. Autorisierung im Funktionscode (der `CRON_SECRET`-Check ist dort bereits vorhanden).

### Schritt 7 — Legacy-Keys deaktivieren (umkehrbar)

Erst wenn für **jedes** Projekt belegt ist, dass nichts mehr am alten Key hängt — inklusive:
- ausgelieferter Mobile-Builds (P3 `mobile/`, P4 Expo-App) — **das ist der langsamste Pfad, er bestimmt den Termin**,
- CI/CD und Deploy-Skripte,
- Drittanbieter-Integrationen und Webhooks,
- Cron-Jobs, Worker, `pg_net`/Database-Webhooks.

Deaktivieren im Dashboard unter **Settings → API Keys → Legacy API Keys**. **Dieser Schritt ist umkehrbar** — anders als ein JWT-Roll. Wird ein übersehener Client sichtbar, lassen sich die Legacy-Keys reaktivieren.

### Schritt 8 — separat und später: JWT signing keys

Eigenes Vorhaben, eigener Termin (siehe [§2](#2-die-entscheidende-korrektur-es-sind-zwei-migrationen)). Einstieg im Dashboard über **JWT signing keys → `Migrate JWT secret`**; laut Doku ohne Downtime und **ohne** Nutzer-Logout. Vor dem Widerruf des Legacy-Secrets mindestens die Access-Token-Laufzeit plus 15 Minuten warten.

**Nicht mit Schritt 1-7 am selben Tag.**

---

## 8. P2, P5, P6

| Projekt | Bewertung | Maßnahme |
|---------|-----------|----------|
| **P2** Shadow (CI) | unkritisch | Neue Keys anlegen, `gh secret set SHADOW_SUPABASE_*`. **Abnahme nicht an „CI grün" festmachen** — die vier Shadow-Suiten *skippen* bei fehlenden Keys, statt fehlzuschlagen. Im Log nachweisen, dass `tenant-isolation` und `dsgvo-account-deletion` tatsächlich **gelaufen** sind. |
| **P5** Staging (`uwmjqckhjkgukhzeidyw`) | Projekt existiert nicht mehr (DNS tot), kein Code-Konsument | `.env.staging.local` löschen. Nichts zu migrieren. |
| **P6** ChairMatch Legacy (`vlrviyrgggzhayepfmop`) | Projekt **lebt**, Anon-Key liegt in `index_legacy.html` in einem **öffentlichen** Repo | Keine Migration. Erst RLS-Zustand prüfen, dann entscheiden: **Projekt löschen** (richtig) oder Datei entfernen und Key rollen (Minimum). Eine Migration auf `publishable` würde hier nur den nächsten Key in dasselbe öffentliche Repo legen. |

---

## 9. Rollback

| Ebene | Rückweg | Dauer |
|-------|---------|-------|
| Vercel-Variable | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` entfernen → die Fallback-Kette greift automatisch wieder auf die Legacy-Variablen | Minuten (+ Redeploy für `NEXT_PUBLIC_*`) |
| Legacy-Keys deaktiviert | Im Dashboard reaktivieren — **laut Doku ausdrücklich umkehrbar** | Minuten |
| Secret-Key kompromittiert | Neuen Secret-Key anlegen, Komponenten umstellen, alten löschen. **Kein Logout, kein JWT-Roll.** Genau das ist der Gewinn der Migration. | Minuten |
| Code-Änderungen dieses Laufs | `./scripts/rollback.sh <N> --push` (`git revert`, kein `reset --hard`) | Minuten |
| **JWT-Secret gerollt** | **Nicht rückholbar.** Supabase gibt das alte Secret nicht wieder heraus. | — |

Die eiserne Regel bleibt: **das Rollen eines Secrets ist immer der letzte Schritt einer Stufe, nie der erste.** Alles davor ist Vorbereitung, alles danach ist Nachziehen.

Nach Abschluss von Migration A gibt es für die API-Keys allerdings keinen Grund mehr, das JWT-Secret überhaupt anzufassen — genau darum ging es.

---

## 10. Was in diesem Lauf **nicht** verifiziert werden konnte

| # | Punkt | Warum offen | Wer klärt |
|---|-------|-------------|-----------|
| 1 | Ob `supabase-js` einen Publishable-Key ohne Header-Override akzeptiert | Es existiert noch kein Publishable-Key | `npm run verify:publishable-key`, nach CEO-Schritt 1 |
| 2 | Tatsächlich gesetzte Vercel-Environment-Variablen | Vercel-CLI in dieser Umgebung nicht eingeloggt | CEO / Dashboard |
| 3 | Ob P1/P3/P4 im Dashboard bereits Publishable-Keys haben | kein Dashboard-Zugang aus dieser Session | CEO |
| 4 | `npx tsc --noEmit` über das Gesamtprojekt | Lauf überschreitet lokal 10 Minuten — bekannt und in `deploy.sh` deshalb warn-only | Vercel type-checkt beim Build; zusätzlich `eslint` über alle geänderten Dateien: sauber |
| 5 | Verhalten der efy-care- und ChairMatch-Repos nach der Umstellung | dort wurde auftragsgemäß kein Code geändert | eigener Durchgang je Repo |

---

## 11. Reihenfolge auf einen Blick

```
① Keys anlegen (alle 4 Projekte)          — folgenlos, kein Fenster
② npm run verify:publishable-key          — GATE, muss 4/4 sein
③ Vercel: neue Variablen setzen (P1)      — Legacy-Variablen bleiben stehen
④ Redeploy                                — zwingend für NEXT_PUBLIC_*
⑤ Abnahme (7 Punkte, §7)
⑥ ChairMatch: Code §4 → Vercel → Redeploy
⑦ efy care: Code §5 → Release → Adoptionsfenster
⑧ Edge Functions auf SUPABASE_SECRET_KEYS
⑨ Legacy-Keys deaktivieren                — umkehrbar
⑩ separater Termin: JWT signing keys      — löst erst das Logout-Problem
```

Zwischen ⑤ und ⑥ liegt kein Zwang zur Eile: der Parallelbetrieb beider Key-Modelle ist von Supabase bis Ende 2026 vorgesehen. Der einzige Pfad mit echter Vorlaufzeit ist ⑦ — das App-Store-Adoptionsfenster bestimmt, wann ⑨ überhaupt möglich wird.
