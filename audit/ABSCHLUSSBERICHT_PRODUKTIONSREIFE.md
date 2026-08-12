# Abschlussbericht — Produktionsreife

**Datum:** 08.08.2026
**Branch:** `staging/expansion-abnahme`
**Ausgangsstand:** `a54573a`
**Ziel-Projekt Production:** Supabase `nnwyktkqibdjxgimjyuq` — **nicht berührt**

> Kein Production-Objekt wurde gelesen, geschrieben, angelegt oder gelöscht.
> Alle Prüfungen liefen gegen eine lokale Postgres-16-Instanz unter
> `.shadow-db/`, die ausschließlich aus den Migrationen dieses Repos
> aufgebaut wurde, plus eine daran angeschlossene Anwendung
> (`next start` auf `127.0.0.1:8080`, Supabase-Ersatz aus PostgREST und
> einem Auth-Shim).

---

## 1. Ergebnis

**PRODUKTIONS-GO für den Code. NO-GO für die Migration ohne die unten
genannten Vorbedingungen.**

Der Anwendungscode ist auslieferbar: CI vollständig grün, keine 5xx,
keine ungeschützten Endpunkte, kein toter Code, keine Debug-Ausgaben,
keine Demodaten. Die Migrationskette ist vorbereitet, vollständig
idempotent und mit Rollback belegt — aber sie enthält jetzt **zwei
Eingriffe an `profiles`**, die vorher nicht Teil des Expansionsplans
waren und die vor dem Apply eine gesonderte Entscheidung brauchen
(§4, Punkte M3 und M4).

---

## 2. Was gefunden und behoben wurde

Zwölf Befunde, alle behoben und nachgeprüft. Sortiert nach Tragweite.

### B1 — Registrierung verlor PLZ und Ort (schwerwiegend)

Eine vollständig ausgefüllte Registrierung (PLZ 80331, München) landete
mit leerem `postal_code` im Profil. Drei Ursachen übereinander:

1. **`profiles.agb_accepted_at` / `agb_version` existieren in keiner
   Migration**, werden aber bei jeder Registrierung geschrieben. Der
   Upsert scheitert an der fehlenden Spalte.
2. **`lib/pending-profile.ts` verwarf den geparkten Datensatz auch bei
   Fehlschlag.** PostgREST wirft nicht; der Fehler steht in `{ error }`.
   Das `try/catch` hielt jeden abgewiesenen Upsert für geglückt und
   löschte danach die einzige Kopie der Daten.
3. **`trg_prevent_role_escalation_insert` wies jeden INSERT ab.**
   Migration `20260804140000` hängt `prevent_role_escalation()`
   zusätzlich als BEFORE INSERT an `profiles`. Die Funktion ist für
   UPDATE geschrieben und beginnt mit
   `IF NEW.role IS NOT DISTINCT FROM OLD.role THEN RETURN NEW`.
   Bei INSERT ist `OLD` NULL — der Vergleich ist immer falsch, und die
   Funktion wirft für **jede** Rolle, auch `kunde`.

**Warum das zählt:** ohne PLZ fällt die Bundesland-Erkennung auf
„unbekannt" zurück. Der Kunde sieht dauerhaft den Verfahrenshinweis —
auch in einem längst anerkannten Bundesland — und der Umkreis-Filter
findet keine Engel.

**Behoben:** `20260808160000_profiles_agb_spalten.sql`,
`20260808170000_role_guard_insert_fix.sql`, `lib/pending-profile.ts`.
Der neue Wächter blockt weiterhin `role='admin'`/`'superadmin'` durch
Nicht-Admins — genau die in `20260804140000` dokumentierte Absicht.

**Nachgewiesen:** Registrierung im Browser durchgespielt, `postal_code`,
`location` und AGB-Nachweis kommen an; Selbstanlage als `admin` wird
weiterhin mit „Anlegen eines Administrator-Profils nicht erlaubt"
abgewiesen.

### B2 — Kreuz-Mandanten-Leck in zwei Views (schwerwiegend)

`state_expansion_dashboard` und `billing_preisschichten_uebersicht`
wurden ohne `security_invoker` angelegt und liefen daher mit den Rechten
ihres Eigentümers. Beide sind an `authenticated` freigegeben. Ein
gewöhnlicher Kunde las 48 Dashboard-Zeilen über 3 Organisationen —
inklusive `approval_document`, `approval_reference`,
`approval_authority` und der internen `notes`; über die Preisschichten
zusätzlich die Tarife fremder Organisationen.

**Behoben:** `20260808150000_view_invoker_und_haertung.sql`.
`state_settings_public` bleibt bewusst auf Definer-Semantik — das ist
der öffentliche Kundenendpunkt mit ausschließlich unkritischen Feldern.

### B3 — `/kunde/home` versprach Kassenabrechnung ohne Anerkennung

Das §45b-Banner („Bis zu 131 €/Monat über Ihre Pflegekasse. **Direkt
über Alltagsengel abrechnen.**") erschien unabhängig vom
Freischaltungsstatus. Der Kunde war angemeldet, seine PLZ bekannt, das
Bundesland nicht anerkannt — und die App sagte trotzdem eine
Direktabrechnung zu. Dasselbe im Onboarding-Abschluss („0 € Eigenanteil",
„Abrechnung läuft").

**Behoben:** beide an `lage.kassenabrechnung` gebunden. Ohne
Freischaltung steht an derselben Stelle der Verfahrenshinweis samt
Warteliste; im Onboarding „131 €/Monat stehen Ihnen nach §45b SGB XI
zu" und „Privat abrechnen".

Die Marketing- und Ratgeberseiten nennen den Betrag weiterhin
ungefiltert — der gesetzliche Anspruch gilt bundesweit, und Werbung ist
laut Freischaltungsmatrix in jedem Bundesland erlaubt. Gebunden ist nur
die Zusage, dass **wir** abrechnen.

### B4 — Demodaten in der Kundenoberfläche

`/kunde/home` zeigte drei erfundene Engel („Anna Müller, 4,9 ★, 127
Einsätze") unter der Überschrift „Vorschau — Diese Engel werden bald in
Ihrer Nähe verfügbar sein", sobald keine echten Engel im Umkreis waren.
Entfernt; es bleibt der ehrliche Leerzustand („Noch keine Engel in Ihrer
Nähe").

### B5 — Hessen-Fallback in der Kundenoberfläche

`/kunde/home` zeigte `profile?.location || 'Frankfurt am Main'`. Ein
Kunde ohne hinterlegten Standort bekam „Frankfurt am Main" angezeigt.
Ersetzt durch den GPS-/IP-Standort, sonst „Standort nicht hinterlegt".

### B6 — Fünf Tabellen mit RLS und ohne jede Policy, aber im Einsatz

`app_settings`, `datenannahmestellen`, `fcm_tokens`,
`push_subscriptions` und `referrals` hatten RLS aktiviert und keine
einzige Policy — damit für alles außer `service_role` gesperrt. Alle
fünf werden im Code mit dem Nutzer-Client angesprochen, zwei davon aus
`'use client'`-Seiten. Auf einer aus dem Repo aufgebauten Datenbank
sind Admin-Einstellungen, Push-Registrierung und das
Empfehlungsprogramm damit still tot.

**Behoben:** `20260808190000_fehlende_policies.sql`. Jeder Block legt
seine Policy **nur an, wenn auf der Tabelle noch gar keine existiert** —
trägt Production bereits handgemachte Regeln, passiert nichts. So kann
die Migration keine bestehende, womöglich strengere Absicherung
aufweichen.

`login_rate_limits`, `conversions`, `notfall_access_attempts` und
`whatsapp_conversations` bleiben bewusst gesperrt: sie werden
ausschließlich über `service_role` angefasst.

### B7 — Google-Ads-Conversions von der eigenen CSP blockiert

Die CSP `connect-src` erlaubte `googletagmanager` nicht und
`pagead2.googlesyndication.com` ebenfalls nicht. gtag lud, feuerte —
und der Beacon wurde vom Browser verworfen. Im Konsolen-Log der
Abnahme nachweisbar. Das Ads-Konto (AW-18061588897) sah von diesen
Conversions nichts.

**Behoben:** `next.config.ts`, fünf Google-Hosts plus
`*.google-analytics.com` (GA4 sendet regionsabhängig) ergänzt. Es
wurde **kein neuer Tracker** hinzugefügt — die Tags liefen längst, nur
ihre Rückmeldung kam nicht an. Falls das so gewollt war, ist die
Änderung in einer Zeile rückgängig zu machen.

### B8 — `/api/organizations/zertifikat` antwortete mit 500 statt 400

`req.formData()` wirft bei falschem Content-Type; der Aufruf lag im
äußeren `try`. Eigener Zweig ergänzt, liefert jetzt 400 mit klarem Text.

### B9 — Fehlende Fremdschlüssel-Indizes im Abrechnungskern

20 Fremdschlüssel auf `invoices`, `invoice_items`, `service_records`,
`client_budgets`, `budget_transactions`, `clients`, `caregivers`,
`assignments` hatten keinen Index auf der Kindspalte. Jedes DELETE am
Elternsatz erzwang einen Sequential Scan unter Lock.

**Behoben:** `20260808180000_fk_indizes_operativer_kern.sql`.
Die übrigen ~100 FKs ohne Index liegen auf Randtabellen (Marketing,
Chat, Krankenfahrt-Partner) und wurden **bewusst nicht** pauschal
indiziert — jeder Index kostet bei jedem Schreibvorgang. Sie stehen in
§6 zum Nachziehen bei Bedarf.

### B10 — Debug-Ausgaben in Produktion

10 `console.debug`-Zeilen in `SessionKeepAlive`, `NativePushProvider`
und `SplashController` schrieben bei jedem Token-Refresh in die
Browser-Konsole; dazu 3 `console.log` in `PushProvider` und
`NotificationBell`, ein Conversion-Log mit Emoji in `lib/tracking.ts`,
4 auskommentierte `[MIS_DEBUG]`-Zeilen und die Debug-Präfixe selbst.
Alle entfernt bzw. auf sprechende Präfixe umgestellt.

Die 14 verbliebenen `console.log` sind bewusste Betriebsprotokolle
(`[CRON]`, `[auto-invoice]`, `[wa-webhook]`, Push/FCM/E-Mail) und
bleiben — sie zu löschen wäre ein Rückschritt bei der
Nachvollziehbarkeit.

### B11 — Toter Code

Fünf Dateien ohne einen einzigen Verweis im gesamten Repo entfernt:
`components/GA4Provider.tsx`, `components/InlineSignupForm.tsx`,
`components/TopBar.tsx`, `lib/file-upload-example.ts`,
`lib/organizations/features.ts` (528 Zeilen). Dazu ein verwaister
Icon-Import.

`lib/organizations/features.ts` enthielt `checkFeature` und
`checkClientLimit` — Plan-Gating, das nie verdrahtet wurde. Wenn das
noch geplant ist, steht es in der Git-Historie.

Ein erster Suchlauf hatte ~30 Dateien gemeldet, darunter nachweislich
importierte Module. Das Muster war falsch (mehrzeilige Importe,
`@/`-Pfade); die Erkennung wurde ersetzt, bevor irgendetwas gelöscht
wurde.

### B12 — Offene TODOs

Zwei TODOs in `lib/whatsapp/system-prompt.ts` („App-Bereich-Name
bestätigen"). Gegen die App-Oberfläche abgeglichen — die Bereiche
heißen dort tatsächlich „Pflege-Boxen" und „Krankenfahrten". TODOs
durch die Feststellung samt Fundstellen ersetzt. Danach: 0 TODO,
0 FIXME, 0 HACK, 0 `debugger` in `app/`, `lib/`, `components/`.

---

## 3. Prüfergebnisse

### Datenbank

| Prüfung | Ergebnis |
|---|---|
| Aufbau von null aus dem Repo | 81 Migrationen, 0 Fehler |
| Idempotenz (zweiter Lauf über alle) | 81 / 81 OK |
| Tenant-Isolation (`supabase/shadow/20_tenant_tests.sql`) | 28 / 28 |
| E2E Expansion | 28 / 28 |
| E2E alle 16 Bundesländer | 162 / 162 |
| Sicherheit (Angriffsproben) | 30 / 30 (+1 INFO) |
| Regression Abrechnung | 10 / 10 |
| A1 — public-Tabellen ohne RLS | 0 |
| A2 — RLS ohne Policy | 4, alle bewusst gesperrt |
| A5 — SECURITY DEFINER ohne `search_path` | 0 |
| A7 — Views mit Definer-Semantik | 1, bewusst (`state_settings_public`) |

### Schnittstellen

`node scripts/api-audit.mjs` fährt jede Route unauthentifiziert an:

```
Routen: 71, Aufrufe: 89
  OK: 85
  HINWEIS-VALIDIERUNG-VOR-AUTH: 4
Keine 5xx, keine ungeschützten Endpunkte.
```

Die 4 Hinweise sind Routen, die Eingaben vor der Authentifizierung
prüfen und deshalb 400 statt 401 liefern. Kein Datenabfluss, nur eine
ungünstige Reihenfolge.

Zusätzlich als **angemeldeter Kunde** gegen alle Admin-Endpunkte:

```
GET   /api/expansion/states                        403
POST  /api/expansion/states/hessen/activate        403
POST  /api/expansion/states/hessen/notify-waitlist 403
GET   /api/expansion/waitlist                      403
POST  /api/admin/manage-role                       403
POST  /api/admin/reset-password                    403
GET   /api/admin/krankenfahrten                    403
GET   /api/admin/pricing                           401
POST  /api/admin/abrechnung/itsg                   403
```

Alle Admin-Seiten leiten für einen Kunden um (307).

### Oberfläche (echter Browser gegen die laufende Anwendung)

| Ablauf | Ergebnis |
|---|---|
| Registrierung Kunde (PLZ 80331) | ✓ Profil angelegt, PLZ/Ort/AGB gespeichert |
| Erstanmeldung, geparkte Daten nachtragen | ✓ |
| Anmeldung Kunde / Admin | ✓ |
| Abmelden | ✓ Cookie gelöscht, Umleitung auf `/` |
| Sitzung nach Seitenwechsel | ✓ (Refresh-Token-Zweig im Shim ergänzt) |
| Rollentrennung Kunde → Admin | ✓ alle Seiten 307, alle APIs 401/403 |
| PLZ-Erkennung 60311 → Hessen | ✓ |
| PLZ-Erkennung 80331 → Bayern | ✓ |
| Gating-Text wortgleich wie gefordert | ✓ |
| Warteliste eintragen | ✓ „Eingetragen. Wir melden uns …" |
| Ein-Klick-Freischaltung ohne Bescheid | ✓ blockiert (`FREISCHALTUNG_OHNE_BESCHEID`) |
| Ein-Klick-Freischaltung mit Bescheid | ✓ Status ANERKANNT, Kasse/Tarife/Budget/Rechnung/eLNW/Dakota an, 2 Tarife + 1 Landesregel mitaktiviert, Audit-Eintrag mit Akteur und SHA-256 |
| Kundensicht nach Freischaltung | ✓ §45b-Banner erscheint — **ohne Codeänderung** |
| Bayern bleibt gesperrt | ✓ keine Vermischung |
| Admin-Dashboard 16 Bundesländer | ✓ Kennzahlen korrekt |
| Bundesland-Umschalter | ✓ wirkt bis in `/admin/clients` („Gefiltert auf Bayern — 2 von 3 Einträgen ausgeblendet") |
| Alle 28 Links der Admin-Seitenleiste | ✓ 0 Fehlerseiten |
| Mobil (375 × 812) | ✓ kein waagerechtes Scrollen, kein überbreites Element |

### CI

```
typecheck          ✓  tsc --noEmit, 0 Fehler
vitest             ✓  31 Dateien, 683 Tests, 0 Fehler (29 übersprungen)
test:unit          ✓  29 / 29
ci-secret-scan     ✓  clean
ci-ik-check        ✓  keine hartcodierte IK
lint:forbidden     ✓  22 697 Dateien, 0 verbotene Strings
build              ✓  next build --webpack
```

`npm run lint` ist in der CI mit `|| true` hinterlegt und damit kein
Tor. Die verbleibenden Meldungen sind Bestand (`no-explicit-any`); die
geänderten Dateien haben **keine neue** Meldung — vor und nach den
Änderungen identisch 14 Befunde.

---

## 4. Vorbedingungen für die Migration

Zusätzlich zu den bereits im
[Migrationsplan](../docs/PRODUCTION_MIGRATION_PLAN_EXPANSION.md)
genannten Punkten:

| # | Punkt | Warum |
|---|---|---|
| **M1** | Phase H (`20260808150000`) darf **nicht** ausgelassen werden | schließt das Kreuz-Mandanten-Leck B2 |
| **M2** | Vor Phase L prüfen, welche Policies auf den fünf Tabellen tatsächlich existieren (Abfrage steht im Plan) | die Migration überspringt Tabellen mit vorhandener Policy — das Ergebnis soll bewusst sein, nicht zufällig |
| **M3** | Klären, ob `profiles.agb_accepted_at` / `agb_version` auf Production bereits von Hand angelegt wurden | ist das nicht so, schlägt seit Einführung **jeder** Registrierungs-Upsert fehl und es gibt keinen AGB-Nachweis für Bestandskunden. Die Migration ist idempotent, die Frage bleibt trotzdem offen |
| **M4** | Entscheiden, ob `trg_prevent_role_escalation_insert` auf Production überhaupt existiert | falls ja, ist die Selbstanlage dort seit dem 04.08. gebrochen — dann sind Bestandsprofile ohne PLZ nachzupflegen |
| **M5** | Phase K auf einer belasteten Datenbank einzeln mit `CREATE INDEX CONCURRENTLY` | `CREATE INDEX` sperrt gegen Schreibzugriffe |
| **M6** | Entscheiden, ob die CSP-Erweiterung für Google Ads gewollt ist | sie stellt Conversion-Tracking wieder her, das faktisch aus war |

**M3 und M4 sind von hier aus nicht prüfbar** — dazu müsste die
Produktionsdatenbank gelesen werden, und das war ausgeschlossen. Beide
sind Ja/Nein-Fragen, die sich mit zwei Abfragen beantworten lassen:

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'profiles' AND column_name LIKE 'agb%';

SELECT tgname FROM pg_trigger
 WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal;
```

---

## 5. Restrisiken

| # | Risiko | Bewertung |
|---|---|---|
| **R1** | `anon` hat auf ~100 `public`-Tabellen INSERT/UPDATE/DELETE/TRUNCATE-Rechte | Supabase-Standard. Die RLS greift nachweislich (Tenant-Tests 15–18: `anon` sieht 0 Zeilen). Ein Recht ohne Bedarf bleibt trotzdem unnötige Angriffsfläche. Ein pauschales `REVOKE` würde die öffentliche Strecke (Kontakt, Newsletter, Lead, Warteliste) brechen und wurde deshalb **nicht** blind gemacht — der Katalog- und Policy-Teil ist in `20260808140000` und `20260808190000` gezielt erledigt |
| **R2** | ~100 Fremdschlüssel auf Randtabellen weiterhin ohne Index | reine Leistungsfrage, heute unkritisch (< 10 000 Zeilen je Tabelle) |
| **R3** | Der Abgleich Repo ↔ Production ist nicht belegt | die Shadow-DB beweist, dass das **Repo** konsistent ist. Ob Production zusätzliche, handgemachte Objekte trägt, bleibt offen — B1 und B6 sind genau Symptome dieser Lücke |
| **R4** | PfluV-Obergrenzen weiterhin `bestaetigt = false` | unverändert aus dem Vorbericht; ohne Bestätigung greift die Preisdeckelung nicht |
| **R5** | Der Auth-Shim ist kein GoTrue | Passwortregeln, HIBP-Prüfung, E-Mail-Versand und OAuth wurden **nicht** end-to-end geprüft. Die HIBP-Logik ist über `npm run test:unit` (29 Tests) abgedeckt |

---

## 6. Was bewusst nicht gemacht wurde

- **Kein Production-Zugriff.** Weder lesend noch schreibend.
- **Keine erfundenen Tarife.** Der Hessen-Seed bleibt bei den zwei
  belegten PfluV-Werten mit `bestaetigt = false` und Quellenangabe.
- **Kein pauschales `REVOKE` der `anon`-Schreibrechte** (R1).
- **Keine Indizes auf Randtabellen** (R2).
- **Keine Policies auf Tabellen, die zu Recht gesperrt sind** —
  `whatsapp_conversations` gehört auf den Admin-Client, nicht in eine
  Policy; sie ist es bereits.
- **Keine Entfernung der Betriebsprotokolle** (B10).
- **Keine Änderung an den Marketing-Aussagen zum §45b-Betrag** (B3).

---

## 7. Werkzeuge, die dabei entstanden sind

| Datei | Zweck |
|---|---|
| `scripts/api-audit.mjs` | fährt alle API-Routen unauthentifiziert an, klassifiziert die Antworten, bricht bei 5xx oder offenen Endpunkten ab |
| `tests/audit-rls-vollstaendig.sql` | Befundliste A1–A9: RLS, Policies, `anon`-Rechte, `search_path`, FK-Indizes, View-Semantik, Ausführungspläne |
| `scripts/shadow-auth-shim.mjs` | um `/auth/v1/signup` erweitert — ohne den war die Registrierstrecke im Browser nicht prüfbar. Legt den Nutzer über `psql` in `auth.users` an, damit der Profil-Trigger wie in Supabase greift |

Ein Hinweis zum Shim, weil er beinahe zu einem Fehlbefund geführt
hätte: seine erste Fassung lieferte `identities: []`. Bei GoTrue ist
das das Signal „diese E-Mail gibt es schon" (Enumeration-Schutz), und
der Registrier-Code steigt darauf korrekt aus. Der scheinbare Defekt
lag am Werkzeug, nicht an der Anwendung.
