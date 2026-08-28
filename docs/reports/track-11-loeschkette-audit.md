# AE Track 11 — Betroffenenrechte: Löschkette und Auskunft (DSGVO Art. 15/17)

**Datum:** 28.08.2026
**Auditor:** Claude (autonom)
**Angriffsfläche:** die Rechte der **betroffenen Person** an ihren eigenen
Daten — also nicht mehr „wer darf fremde Daten sehen", sondern: *Wirkt die
Löschung, die wir zusagen? Und stimmt, was wir der Person über den
Verbleib ihrer Daten mitteilen?*

---

## Warum diese Fläche (Abgrenzung zu Tracks 1–10)

Track 6/7 haben die Mandantengrenze geschlossen, Track 9 die Rollenmatrix,
Track 10 die Objektbindung innerhalb der Organisation. Alle zehn Tracks
fragten dieselbe Grundfrage: *Wer darf auf welche Daten zugreifen?*

Diese Fläche fragt die andere: *Was passiert, wenn jemand seine Daten
zurückzieht?* Das ist kein Zugriffsproblem, sondern ein Wirkungsproblem —
und Wirkungsprobleme fallen bei Zugriffsaudits per Konstruktion nicht auf:
ein Weg, den niemand geht, sieht in einem Zugriffstest genauso aus wie ein
sicherer Weg.

**Methode:**

1. Alle Wege gelesen, auf denen personenbezogene Daten das System
   verlassen oder verschwinden: `/api/user/export` (Art. 15),
   `/api/user/delete` + `/undo` (Art. 17), `/api/coach/export`,
   `/api/coach/loeschung`, die Edge Function `account-hard-delete` und
   ihren pg_cron-Auslöser.
2. Ein Lese-Orakel gegen die **Produktionsdatenbank**
   (`npm run verify:loeschkette`, nur lesend, jede Transaktion rollt
   zurück): 191 Fremdschlüssel auf `auth.users`/`profiles` mit ihrer
   ON-DELETE-Regel, der Zustand des pg_cron-Jobs, die RLS-Lage der
   Token-Tabelle, der CHECK auf `mis_audit_log.action`.
3. Gegen den Anmeldeweg gehalten: welche Stelle liest `profiles.deleted_at`
   überhaupt?

---

## Befunde

### B1 (P1) — Die Löschung war während der 60-Tage-Frist wirkungslos

**Dateien:** `proxy.ts`, `lib/auth/rollen-quelle.ts`, `lib/auth/guard.ts`,
`lib/angehoerige/portal-helpers.ts`

**WAS:** `DELETE /api/user/delete` setzt `profiles.deleted_at`, antwortet
„Konto wurde deaktiviert" und meldet die Sitzung ab. Danach fragte **keine
Stelle des Anmeldewegs** diese Spalte je wieder ab — nachgeprüft über
`lib/auth`, `lib/supabase`, `lib/organizations`, `proxy.ts`, `app/auth`:
null Treffer.

Und die Datenbank fragt sie auch nicht: die Selbstlese-Policy
`profiles_select_own USING (auth.uid() = id)` (Migration 20260815010000)
trägt keinen `deleted_at`-Filter. `auth.users` bleibt unangetastet, das
Passwort gilt weiter.

**Exploit-Pfad:** Konto löschen → erneut anmelden → normal weiterarbeiten.
Kein Trick nötig; der abgemeldete Zustand ist die einzige Wirkung, die die
Löschung hatte.

**WIRKUNG, in beide Richtungen falsch:**
* Das Recht auf Löschung lief für die betroffene Person praktisch leer.
* Umgekehrt: sobald die Löschkette wieder greift (B2), wäre ein Konto
  mitten im aktiven Betrieb am Tag 60 endgültig verschwunden — ohne
  weitere Warnung, weil aus Sicht der Anwendung nie etwas gesperrt war.
* Für die Rolle `angehoerige` wog es schwerer als sonst: über das Portal
  sieht dieses Konto Gesundheitsdaten **Dritter** ein.

**Dass die Absicht immer eine andere war, steht in der Datenbank:**
`is_admin()` trägt seit dem Soft-Delete-Entwurf `AND deleted_at IS NULL` —
ein vorgemerkter Admin verliert seine Adminrechte sofort. Nur für alle
übrigen Rollen fehlte das Gegenstück im Anwendungscode.

**FIX:** Eine Regel, eine Stelle: neues Modul `lib/auth/konto-status.ts`
(rein, ohne `next/server` und ohne Supabase, damit sie in der
Edge-Laufzeit des Proxys **und** in den Fach-Guards benutzbar und ohne
Sitzung prüfbar ist). Fail-closed: `null`/`undefined`/Leerstring heißen
„aktiv", **jeder** andere Wert heißt „vorgemerkt" — auch ein unlesbares
Datum. Ein `new Date(...)`-Vergleich läge dort bei `NaN` und fiele
stillschweigend auf „aktiv".

Angewandt an genau den vier Stellen, die die Rolle aus `profiles`
beziehen:

| Stelle | Wirkung |
|---|---|
| `lib/auth/rollen-quelle.ts` | `profilRolle: ''` ⇒ jede Berechtigungsfrage antwortet Nein. Schließt **alle 50** Routen, die davon lesen, in einem Zug — auch die, die das neue Feld gar nicht kennen. `holeRollenQuellen()` gibt zusätzlich `null` (401). |
| `lib/auth/guard.ts` | `holeRolle()` gibt `null` ⇒ `requireBerechtigung`/`requireAdministration` antworten 401. |
| `proxy.ts` | Kein Bereich mehr betretbar; Umleitung mit eigenem Grund `?error=konto_geloescht`. |
| `lib/angehoerige/portal-helpers.ts` | 403 vor jeder Datenausgabe (liest nicht über die Rollenquelle, deshalb ausdrücklich). |

Die Anmeldeseite erklärt den Grund und verweist auf den Widerrufslink,
statt nur „Zugriff verweigert" zu zeigen. Der Widerrufsweg selbst
(`/api/user/delete/undo`) ist token-basiert und unangemeldet — er bleibt
unberührt.

---

### B2 (P1) — Die endgültige Löschung konnte nie laufen — LIVE_VERIFIZIERT

**Dateien:** `supabase/migrations/20260918020000_dsgvo_hard_delete_cron.sql`,
`supabase/functions/account-hard-delete/index.ts`

**WAS:** Der pg_cron-Job baut seine Ziel-URL aus
`current_setting('app.settings.supabase_url', true)`. Diese GUC ist live
**nicht gesetzt** (`npm run verify:loeschkette`, Prüfung B). In Postgres
ist `NULL || '/functions/v1/…'` gleich `NULL`; `net.http_post(url := NULL)`
ruft nichts auf. Dasselbe für den Header: `'Bearer ' || NULL` ist `NULL`.

**Und selbst mit gesetzter GUC wäre es ein Widerspruch gewesen:** der Job
schickt den `service_role_key` als Bearer, die Function verglich gegen
`CRON_SECRET`. War das Geheimnis gesetzt, hätte sie den eigenen Cron mit
403 abgewiesen; war es nicht gesetzt, ließ `if (cronSecret && …)` **jeden**
Aufruf durch. Offen oder tot — dazwischen lag nichts. (`verify_jwt` ist
kein Ersatz: es akzeptiert jedes gültige Projekt-JWT, also auch den
öffentlichen anon-Key.)

**WIRKUNG:** Die Zusage „nach 60 Tagen wird endgültig gelöscht" wurde nie
eingelöst. Derzeit **latent**: live steht kein einziges Profil auf
`deleted_at` (Prüfung A), es liegt also nichts überfällig herum. Ein
Backfill ist nicht nötig.

**FIX:** Die Ausführung liegt jetzt im Anwendungscode, wo die
Umgebungsvariablen ohnehin stehen und der fail-closed-Türsteher
(`lib/api/cron-auth.ts`, Track „Cron-Secret fail-open") bereits existiert:

* `app/api/cron/konto-loeschung/route.ts`, eingeplant in `vercel.json`
  (`0 3 * * *`) neben den acht anderen Cron-Routen.
* Die Edge Function ist **stillgelegt**: sie antwortet mit 410, solange
  nicht ausdrücklich `HARD_DELETE_EDGE_AKTIV=1` gesetzt ist, und ihr
  Geheimnis-Check ist fail-closed mit Konstantzeit-Vergleich (Deno bringt
  kein `node:crypto`, deshalb von Hand). Sie bleibt im Repo, weil eine
  möglicherweise ausgerollte Function nicht dadurch verschwindet, dass man
  die Datei löscht — und weil ihre alte Kaskade sonst weiterlaufen könnte
  (siehe B3).

**Ausdrücklich NICHT behoben:** `app.settings.supabase_url` bleibt ungesetzt.
Ein `ALTER DATABASE … SET` ist über den Dienstschlüssel nicht möglich. Es
ist auch nicht mehr nötig — der Weg über die GUC wird nicht mehr benutzt.

---

### B3 (P1) — Die Löschung entfernte die Kundenakte nicht, meldete aber „unwiderruflich gelöscht"

**Dateien:** `supabase/functions/account-hard-delete/index.ts`,
`lib/emails/account-deletion.ts`

**WAS:** Die Kaskade löschte neun Tabellen — nicht, weil jemand entschieden
hätte, dass es genau diese neun sind, sondern weil sie im April 2026 gerade
bekannt waren. Alles, was seither dazukam (Pflegedokumentation, Wunddoku,
SIS, Akten, Angehörigenportal, PflegeCoach, Gerätetokens), stand in keiner
Liste. `clients.user_id` trägt live `ON DELETE SET NULL` — die Kundenakte
mit Anschrift, Pflegegrad und Diagnosen bleibt also stehen.

Gleichzeitig schrieb die Bestätigungsmail, „dein Konto und alle damit
verknüpften Daten" seien unwiderruflich gelöscht, und zählte unter „Was
wurde gelöscht?" ausdrücklich die **Buchungen** auf.

**Die Umkehrung desselben Fehlers:** die Function löschte `bookings`
tatsächlich — obwohl die Migration 20260804400000 für genau diese Tabelle
das Gegenteil entschieden hatte („Buchungsdaten — erhalten bleiben",
`ON DELETE SET NULL`). Buchungen sind abrechnungsrelevante Belege
(§ 147 AO). Zwei Stellen im Repo sagten Gegenteiliges, und die
handelnde gewann.

**WIRKUNG:** Zwei Verstöße in verschiedene Richtungen — Vernichtung
aufbewahrungspflichtiger Belege einerseits, eine unzutreffende Auskunft
über den Verbleib der eigenen Daten (Art. 12 Abs. 1 DSGVO) andererseits.

**Der Fehler war nie „es wird zu wenig gelöscht".** Art. 17 Abs. 3 lit. b
DSGVO nimmt Daten aus, deren Aufbewahrung gesetzlich vorgeschrieben ist —
§ 630f Abs. 3 BGB (Pflegedokumentation, 10 Jahre), § 147 AO / § 257 HGB
(Belege), Art. 30/32 DSGVO (der Nachweis der Verarbeitung selbst). Der
Fehler war, dass **nirgends eine Entscheidung stand**.

**FIX:**

* `lib/dsgvo/loeschkatalog.ts` — 26 Einträge, je eine personenbezogene
  Spalte, mit Entscheidung (`loeschen` / `aufbewahren`) und Grund. Bei
  `aufbewahren` mit Rechtsgrundlage; ein Test verlangt sie.
* `lib/dsgvo/loeschung.ts` führt genau das aus, was dort steht.
* Die Bestätigungsmail nennt jetzt beides getrennt: was gelöscht wurde und
  was aus welchem Grund bleibt — gespeist aus demselben Katalog. Die
  Katalogtexte werden vor dem Einsetzen ins HTML escaped.
* `npm run verify:loeschkette` hält den Katalog gegen das Live-Schema
  (Prüfung E: alle 26 Einträge existieren) und gegen die FK-Regeln
  (Prüfung F).

---

### B4 (P2) — Fehler der Löschschritte wurden verschluckt

**Datei:** `supabase/functions/account-hard-delete/index.ts`

**WAS:** Von zehn Schritten wurden zwei ausgewertet (`documents` und
`auth.deleteUser`). Die übrigen — darunter das `profiles`-Delete — liefen
ohne Fehlerprüfung durch; der Lauf meldete anschließend Erfolg und
verschickte die Bestätigungsmail.

**Dass das kein theoretischer Fall ist, steht live im Schema:** von 191
Fremdschlüsseln auf `auth.users`/`profiles` tragen 170 **kein** CASCADE,
sehr viele davon NO ACTION (`ops_nachrichten.absender_id`,
`ops_wiedervorlagen.*`, `pflege_audit_log.akteur_id`, `wf_events.*`, …).
Für jedes Mitarbeitendenkonto scheitert das `profiles`-Delete deshalb mit
23503 — stumm.

**FIX:** `loescheKonto()` wertet **jeden** Schritt aus und bricht für
dieses Konto ab. Drei unterscheidbare Ausgänge: `geloescht`, `blockiert`
(Fremdschlüssel steht im Weg), `fehler`. Bestätigungsmail nur bei
vollständigem Erfolg; Protokolleintrag in **allen** Fällen. Ein blockiertes
Konto hält die anderen nicht auf.

**Zusätzlich, und das ist der eigentliche Gewinn: eine Vorprüfung.** Die
Spalten, deren FK live NO ACTION trägt, sind im Katalog als `blockiert`
markiert und werden **zuerst** gezählt. Liegt dort eine Zeile, rührt der
Lauf nichts an. Ohne diese Vorprüfung wäre der halb gelöschte Zustand der
Normalfall gewesen: Nachrichten, Geräte und Profil weg, Konto aber noch da
— und über den Widerrufslink sogar reaktivierbar.

---

### B5 (P2) — Die PflegeCoach-Löschung meldete Erfolg ohne Wirkungsnachweis

**Datei:** `app/api/coach/loeschung/route.ts`

**WAS:** `.delete().eq('id', …)` ohne `.select()`. PostgREST meldet keinen
Fehler, wenn RLS alle Zeilen weggefiltert hat — es löscht dann null Zeilen
und antwortet zufrieden. Die Route gab `{ geloescht: true }` zurück, ohne
je geprüft zu haben, ob etwas verschwunden ist.

**WIRKUNG:** Eine falsche Auskunft über die Ausübung eines
Betroffenenrechts. Die Person löscht ihre DiPA-Daten, bekommt „erledigt"
und die Daten stehen weiter.

**FIX:** `.select('id')` und eine ausdrückliche Prüfung auf mindestens eine
entfernte Zeile; sonst 500 mit Verweis auf die Datenschutzadresse. Die
Antwort nennt jetzt die Zahl der entfernten Datensätze.

---

### B6 (P3) — `/api/user/delete` war ein unbegrenztes, unprotokolliertes Passwort-Orakel

**Datei:** `app/api/user/delete/route.ts`

**WAS:** Die Route prüft das Passwort per `signInWithPassword` gegen
GoTrue — ohne Ratenbegrenzung und ohne den Fehlversuch zu protokollieren.
Die Anmeldeseite hat für genau dasselbe eine Sperre nach fünf Versuchen
und schreibt jeden Fehlversuch nach `mis_auth_log`.

**Exploit-Pfad:** übernommene Sitzung (fremdes Gerät, gestohlenes Cookie)
→ Passwörter über diese Route durchprobieren, unbegrenzt und ohne Spur.

**WIRKUNG begrenzt und deshalb P3:** es geht nur um das eigene Konto der
bestehenden Sitzung, und wer die Sitzung hat, hat den Zugang ohnehin. Der
Gewinn wäre das Klartext-Passwort (oft anderswo wiederverwendet).

**FIX:** `rateLimitPersistent` (10 Versuche je Stunde und Konto, persistent
— die instanz-lokale Zählung aus `lib/rate-limit.ts` startet auf Vercel in
jeder neuen Instanz bei null) **vor** der Passwortprüfung; Fehlversuch nach
`mis_auth_log` mit `login_failed`, also in dieselbe Spur wie die
Anmeldeseite. Bewusst **nicht** nach `mis_audit_log`: dessen `action` trägt
live einen CHECK über eine feste Werteliste (Prüfung G), ein neuer Wert
hätte den Insert scheitern lassen — der Fehlversuch wäre wieder unsichtbar
gewesen.

---

## Negativbefunde — was ausdrücklich NICHT gefunden wurde

* **N1 — Die Auskunft nach Art. 15 kann konstruktionsbedingt nichts
  Fremdes ausliefern.** `/api/user/export` und `lib/dsgvo/auskunft.ts`
  lesen ausschließlich mit dem **Nutzer-Client**; RLS entscheidet, welche
  Zeilen zur Person gehören. Ein Fehler in der Quellenliste kann deshalb
  kein Leck erzeugen. Der Export ist ratenbegrenzt (5/Stunde) und wird als
  `data_export` protokolliert. Als Test festgehalten, damit ein späterer
  Umbau auf den Dienstschlüssel auffällt.
* **N2 — Der Widerrufs-Token ist nicht auslesbar.** LIVE: RLS auf
  `account_deletion_tokens` ist an, die einzige Policy lautet
  `USING (false)`, `anon` und `authenticated` haben **keine** Grants
  (Prüfung D). 256 Bit Entropie, einmal verwendbar (`confirmed_at`),
  mit Ablauf. Kein Ratenlimit nötig.
* **N3 — Es liegt nichts überfällig herum.** LIVE: 0 Profile mit gesetztem
  `deleted_at` (Prüfung A). Alle Befunde sind latent, kein Backfill.
* **N4 — `is_admin()` trug die Soft-Delete-Semantik bereits.** Deshalb galt
  B1 nie für rein adminbewehrte Datenbankwege.
* **N5 — `organization_members` hängt per CASCADE am Konto** (Prüfung H) —
  die Mitgliedschaft blockiert die Löschung nicht und gehört nicht in den
  Katalog.
* **N6 — Die `.or()`-Verkettung in der alten Kaskade war nicht
  einschleusbar.** Der interpolierte Wert stammt aus `profiles.id`
  (uuid-Spalte). Der neue Ablauf kommt trotzdem ohne Zeichenketten-Bau aus:
  zwei getrennte Einträge für `sender_id` und `receiver_id`.
* **N7 — Die PflegeCoach-Freigaben sind sauber gebunden.** Empfänger-Lookup
  hinter `requireCoachUser()`, der eigenen Einwilligung und einem
  persistenten Deckel (10/Stunde); `coach_finde_nutzer_id` ist auf
  `service_role` beschränkt.
* **N8 — Das Angehörigenportal liest fail-closed und protokolliert
  fail-closed** (Härtung vom 27.08.). Einzige verbliebene Lücke war die
  fehlende `deleted_at`-Prüfung — in B1 mit erledigt.

---

## Restposten — benannt und NICHT behoben

**Zwei Fremdschlüssel verhindern weiterhin die endgültige Löschung, und
das aus einem echten Grund:**

| Spalte | FK live | Warum nicht einfach SET NULL |
|---|---|---|
| `angehoerigen_audit_log.user_id` | NO ACTION | Der Eintrag beweist, **wer** wann Gesundheitsdaten Dritter eingesehen hat (Art. 30 DSGVO). `SET NULL` löscht genau diese Aussage — und damit den Zweck der Aufbewahrung. |
| `signaturen.signatar_id` | NO ACTION | Die Unterschrift trägt den Leistungsnachweis (§ 630f BGB, § 147 AO). Ohne benannten Unterzeichner verliert sie ihren Beweiswert. |

Beides ist eine geschäftliche und rechtliche Entscheidung — Aufbewahrung
mit Personenbezug gegen Löschanspruch —, keine technische. Sie wird hier
**nicht** getroffen. Bis dahin meldet der Lauf betroffene Konten als
`blockiert`, sichtbar in der Cron-Antwort und in `mis_audit_log`, und
rührt nichts an. Das ist der ehrliche Zustand: sichtbar offen statt
stillschweigend halb erledigt.

**Dritter Fremdschlüssel, hier entschieden:** `bookings.angel_id` stand
live auf NO ACTION, während die Schwesterspalte `customer_id` seit
20260804400000 auf `SET NULL` steht. Das ist keine Entscheidung, sondern
eine übersehene Zeile — die Migration `20261016000000` zieht sie nach
(mit Rollback `20261016000001`). **Beide sind nur eingecheckt, NICHT
angewendet.** Solange bleibt die `blockiert`-Marke im Katalog stehen; das
Nachziehen ist im Migrationskopf Schritt für Schritt beschrieben.

---

## Prüflauf

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | 0 Fehler |
| `npx vitest run` | 7809 grün, 0 rot, 38 übersprungen — davon 96 aus diesem Track |
| `npm run test:unit` (node:test) | 2513 grün, 0 rot |
| `npm run lint:forbidden` | 0 Treffer (24 800 Dateien) |
| `npm run lint:route-auth` | 0 Treffer (412 Routen) |
| `npm run lint:org-id` | 0 Treffer (1417 Dateien) |
| `npm run verify:loeschkette` | 9/10 — offen bleibt nur `app.settings.supabase_url`, siehe B2 |

**96 neue Tests**, davon **sechs Gegenproben**, die den alten Zustand
nachstellen und verlangen, dass er nicht mehr eintritt:

1. `bookings`/`clients`/`caregivers` dürfen im Lauf nicht angefasst werden
   (die alte Function löschte `bookings`).
2. Ein fehlgeschlagenes Delete bricht ab — kein `profiles`-Delete, kein
   Auth-Delete, keine Mail (vorher: alles lief weiter).
3. Null gelöschte Zeilen sind kein Erfolg mehr (PflegeCoach).
4. Ohne `deleted_at` kommt dieselbe Person unverändert durch — an der
   Rollenquelle, am Guard und am Portal je einzeln. Ohne diese drei wäre
   „alles gesperrt" ebenfalls grün, und die Sperre kein Beweis.

Ein Bestandstest musste nachgezogen werden, weil dieser Track zwei
Migrationsdateien hinzufügt: `JUENGSTE_MIGRATIONEN` in
`lib/pilot/pre-pilot-snapshot.ts` hält die Liste der fünf jüngsten
Migrationen gegen das echte Verzeichnis und wurde dadurch rot. Die
Konstante ist nachgezogen, die Regel selbst nicht gelockert.

**Wahrheitsstand:** B1, B3–B6 sind IMPLEMENTIERT und GETESTET. B2 ist
IMPLEMENTIERT und GETESTET, aber erst mit dem Deploy und einem gesetzten
`CRON_SECRET` betriebsbereit — der erste tatsächliche Lauf ist **nicht**
verifiziert. Die Tatsachen unter B2, B3 und im Restposten-Abschnitt sind
**LIVE_VERIFIZIERT** über `npm run verify:loeschkette`. Keine Migration
wurde angewendet.
