# Security- und Audit-System

Stand: 01.09.2026 · Modul: `lib/security/` · Tabelle: `public.security_audit_log`

Dieses Dokument ist die **Audit-Konfiguration**. Wer wissen will, was
protokolliert wird, wer es lesen darf und wer darüber eine E-Mail bekommt,
findet die Antwort hier — und sie stimmt mit dem Code überein, weil beide
dieselbe Quelle haben (`lib/security/ereignisse.ts`).

---

## 1. Was es ist — und was es nicht ersetzt

Das Produkt führte bereits fünf Spuren: `mis_audit_log` (Verwaltungs­aktionen),
`mis_auth_log` (An-/Abmeldung), `billing_audit_trail` (Geld), `wf_audit_log`
(Workflow), `sync_audit_log` (Offline-Sync). Keine davon beantwortet die
Sicherheitsfrage: *Was ist an diesem Konto passiert — von wo, mit welchem
Gerät, mit welcher Rolle, und war das ungewöhnlich?*

`security_audit_log` legt genau diese Sicht über die bestehenden Spuren. Sie
ersetzt keine davon; die haben fachliche Aufgaben und bleiben unverändert.

---

## 2. Was **nicht** gespeichert wird

| Nie in der Spur | Warum |
|---|---|
| Passwörter, Hashes | Es gibt keine Spalte dafür, und `bereinigeMetadaten()` entfernt jeden Schlüssel, der `passwor`/`pass` enthält. |
| Tokens, Session-Tokens, Cookies, `Authorization` | Dieselbe Filterung. Zusätzlich filtert `public.log_security_event()` in SQL noch einmal — zwei Siebe, weil das erste nur greift, wenn der Aufruf durch den TypeScript-Weg geht. |
| API-Schlüssel, MFA-Geheimnisse, private Schlüssel | Ebenso. |
| IBAN/BIC, Kartendaten | Ebenso — sie gehören in die Abrechnung, nicht in ein Sicherheitsprotokoll. |
| **MAC-Adressen** | Siehe unten. |

### MAC-Adressen

`device_info.mac_address` trägt **immer** den Wert `not_available`. Kein
Ersatzwert, keine Herleitung, kein Platzhalter, der wie eine Adresse aussieht.

Grund: Ein Browser gibt die MAC-Adresse über HTTP nicht heraus, und iOS wie
Android verweigern sie seit Jahren auch nativen Apps. Das Feld steht
ausdrücklich in den Daten, damit die Frage „habt ihr die MAC-Adresse?" ihre
Antwort **in** den Daten findet und nicht im Schweigen einer fehlenden Spalte.

### Kein Fingerprinting

Zur Erkennung unbekannter Geräte wird ausschließlich der User-Agent
verwendet, den der Browser ohnehin bei jedem Aufruf mitschickt. Kein
Canvas-Hash, keine Schriftenliste, keine Bildschirmauflösung, kein WebGL,
kein Zeitzonen-Abgleich.

Die Kennung ist `SHA-256(Konto-ID | Plattform | normalisierter User-Agent)`.
Versionsnummern werden vorher entfernt, damit ein Browser-Update nicht als
neues Gerät gilt. Die Konto-ID geht mit ein, damit derselbe Browser bei zwei
Konten zwei verschiedene Kennungen ergibt — der Hash taugt so **nicht** zum
kontoübergreifenden Wiedererkennen einer Person.

**Ehrlich benannte Folge:** zwei Rechner mit derselben Browser-Version ergeben
denselben Hash und gelten als dasselbe Gerät. Das Merkmal erkennt den Wechsel
der Geräteklasse zuverlässig und den Wechsel zwischen baugleichen Rechnern
nicht. Ein zuverlässigeres Merkmal gäbe es nur um den Preis echten
Fingerprintings — den zahlt dieses System nicht.

---

## 3. Tabellen

### `security_audit_log`

| Spalte | Typ | Anmerkung |
|---|---|---|
| `id` | uuid | |
| `user_id` | uuid → `auth.users` | `ON DELETE SET NULL` |
| `user_email` | text | Adress-Schnappschuss; überlebt die Kontolöschung |
| `organization_id` | uuid → `organizations` | **nullable**, siehe unten |
| `event_type` | text, NOT NULL | offener Text, **kein CHECK** |
| `event_category` | text | offener Text, **kein CHECK** |
| `created_at` | timestamptz | |
| `ip_address` | inet | aus `x-forwarded-for`/`x-real-ip`, nie aus dem Body |
| `user_agent` | text | |
| `platform` | text | `web` \| `ios` \| `android` \| `server` \| `unbekannt` |
| `device_info` | jsonb | Browser, Betriebssystem, Plattform, `mac_address` |
| `app_version` | text | aus `x-app-version`, falls die native Hülle sie setzt |
| `session_reference` | text | undurchsichtige Kennung zum Gruppieren, **kein Token** |
| `metadata` | jsonb | gefiltert |
| `severity` | text | `info` \| `warning` \| `critical` — **einziger CHECK** |

**Warum nur `severity` einen CHECK hat.** Ein CHECK auf einer offenen
Werteliste lässt den INSERT scheitern, sobald ein neuer Ereignistyp auftaucht.
Ein Sicherheitsereignis, das wegen einer Werteliste *nicht* geschrieben wird,
ist der schlimmste Ausgang, den diese Tabelle haben kann — und es sind genau
die unvorhergesehenen Fälle, auf die es ankommt. Die gültigen Werte stehen
deshalb in `lib/security/ereignisse.ts` und werden dort geprüft: ein
unbekannter Typ wird trotzdem geschrieben, Kategorie fällt auf `security`,
Schweregrad auf `warning` (also sichtbar).

**Warum `organization_id` nullable ist.** Genau ein Fall: eine
fehlgeschlagene Anmeldung mit einer Adresse, zu der es kein Konto gibt. Dann
gibt es keinen Mandanten. Ist ein Konto bekannt, löst
`organisationFuerKonto()` die Organisation auf (Mitgliedschaft → Engel →
Klient → `null`, fail-closed, dieselbe Reihenfolge wie `resolveUserOrgId()`).
Mandantenlose Zeilen enthalten deshalb keine Mandantendaten.

### `security_known_devices`

Vergleichsmaßstab für „unbekanntes Gerät". `ON DELETE CASCADE` — das
Gerätegedächtnis ist kein Protokoll und verschwindet mit dem Konto.

### `security_watchlist`

Ausdrücklich überwachte Konten. Jeder Eintrag trägt `grund` und
`angelegt_von`. Ergänzt die privilegierten Konten, ersetzt sie nicht.

**Befristet — 90 Tage, abgeleitet aus `created_at`.** Ein Eintrag, dessen
Frist vorbei ist, wird von `ladeAktive()` gar nicht erst in die aktive Menge
aufgenommen: die Überwachung endet von selbst, ohne dass jemand daran denken
muss. Die Zeile bleibt sichtbar (als „abgelaufen") — sie still zu löschen
wäre das Gegenteil von Transparenz.

**Wiederanordnung.** Wer nach Ablauf fortsetzen will, ordnet neu an: das
Einschalten setzt `created_at` (und `befristet_bis`) auf den Tag der
Anordnung, verlangt die vollständige Begründung und wird als
`watchlist_change` protokolliert. Eine **laufende** Maßnahme verlängert sich
beim Bearbeiten dagegen **nicht** — sonst ließe sich eine Überwachung durch
wiederholtes Speichern still fortsetzen. Regeln in
`lib/security/befristung.ts`, Belege auf echtem Postgres in
`__tests__/security/watchlist-befristung-pglite.test.ts`.

**Migration 20261024000000** legt `befristet_bis`, `zweck`,
`rechtsgrundlage` und `person_informiert_am` nach, dazu einen CHECK gegen
aktive Einträge ohne Fristende. Sie ist am 01.09.2026 **nicht angewendet**
(live geprüft). Der Code arbeitet mit beiden Schemaständen; `befristet_bis`
darf das Ende nur vorziehen, nie hinausschieben. Stand jederzeit:
`npm run verify:ueberwachung`.

---

## 4. Wer darf lesen

Berechtigung **`sicherheit.lesen`**, Vorbehalt der Administration
(`NUR_ADMINISTRATION` in `lib/auth/rollen.ts`) — also `admin` und
`superadmin`.

Bewusst **getrennt** von `audit.lesen`: die fachliche Revisionsspur brauchen
`pdl`, `qm` und `buchhaltung` für ihre Arbeit. In der Sicherheitsspur steht
daneben das Anmeldeverhalten von Kolleginnen und Kollegen — Material zur
Mitarbeiterüberwachung, das in keine Fachrolle gehört.

**Drei Türen, alle in dieselbe Richtung:**

1. **Navigation** — `lib/auth/bereiche.ts` blendet `/admin/security` für alle
   anderen Rollen aus (`darfPfad`).
2. **Schnittstelle** — `requireBerechtigung('sicherheit.lesen')` in
   `app/api/admin/security/audit-log/route.ts`. Die Rolle wird aus **beiden**
   nicht selbst beschreibbaren Quellen ermittelt (`profiles.role` bindend,
   `app_metadata.role` nur einschränkend).
3. **Datenbank** — RLS-Policy `sicherheitsadmin_liest_security_audit_log`:
   `ist_sicherheitsadmin() AND (organization_id = current_org_id() OR organization_id IS NULL)`.

`ist_sicherheitsadmin()` fragt zwei Wege ab: `darf('sicherheit.lesen')` und
`is_admin()`. Beide beschreiben dieselbe Personengruppe. Der zweite Weg
existiert, weil `public.rollen_matrix` eine von mehreren Migrationen geteilte
Funktion ist — fiele die Berechtigung dort durch eine spätere Überschreibung
heraus, wäre die Sicherheitsspur sonst für **alle** unlesbar, und niemand
merkte es.

### Niemand darf schreiben oder ändern

Es gibt **keine** INSERT-, UPDATE- oder DELETE-Policy — auch nicht für die
Administration. Geschrieben wird ausschließlich mit dem Dienstschlüssel
(`service_role` umgeht RLS). Zusätzlich verhindert der Trigger
`trg_security_audit_log_unveraenderlich` jedes UPDATE und DELETE **auch für
den Dienstschlüssel**.

**Eine Ausnahme, und nur eine:** die Fremdschlüssel-Kaskade der
DSGVO-Kontolöschung. `user_id` steht auf `ON DELETE SET NULL`, Postgres führt
das als UPDATE aus. Ein bedingungsloser Riegel hätte jede Kontolöschung
blockiert, sobald ein einziger Sicherheitseintrag dazu existiert. Der Trigger
lässt genau den Fall durch: `user_id` fällt von einem Wert auf `NULL` und
sonst ändert sich nichts.

---

## 5. Ereigniskatalog

Quelle: `lib/security/ereignisse.ts`. `meldepflichtig` bedeutet: löst bei
privilegierten und überwachten Konten eine E-Mail aus.

| Ereignistyp | Kategorie | Schweregrad | meldet |
|---|---|---|---|
| `login_success` | auth | info | ja |
| `login_failed` | auth | warning | nein |
| `logout` | auth | info | nein |
| `password_reset_requested` | auth | warning | ja |
| `password_changed` | auth | warning | ja |
| `mfa_enrolled` | auth | warning | ja |
| `mfa_removed` | auth | critical | ja |
| `mfa_challenge_failed` | auth | warning | ja |
| `session_start` | session | info | ja |
| `session_end` | session | info | nein |
| `app_start` | session | info | nein |
| `unknown_device` | device | warning | ja |
| `device_known` | device | info | nein |
| `role_change` | role | critical | ja |
| `permission_change` | role | critical | ja |
| `org_change` | role | warning | ja |
| `profile_change` | data | info | nein |
| `email_change` | data | critical | ja |
| `phone_change` | data | warning | ja |
| `account_data_change` | data | warning | ja |
| `customer_change` | data | info | nein |
| `employee_change` | data | info | nein |
| `critical_data_change` | data | critical | ja |
| `data_export` | data | warning | ja |
| `security_action` | security | warning | ja |
| `blocked_action` | security | warning | nein |
| `security_error` | security | critical | ja |
| `unusual_login_series` | security | critical | ja |
| `rate_limit_exceeded` | security | warning | nein |
| `security_notification_sent` | security | info | nein |
| `admin_action` | admin | info | nein |
| `account_created` | admin | warning | ja |
| `account_deleted` | admin | critical | ja |
| `watchlist_change` | admin | critical | ja |

Ein Aufrufer darf ein Ereignis **hochstufen**, nie herunterstufen
(`hoechsterSchweregrad`) — sonst ließe sich ein kritisches Ereignis am
Aufrufort unsichtbar machen.

---

## 6. E-Mail-Meldungen

### Wer bekommt eine

Zwei Mengen, beide vollständig herleitbar aus `profiles.role` und
`security_watchlist` — es gibt keine dritte, versteckte Menge:

1. **Privilegiert** — `superadmin`, `admin`, `pdl`, `qm`, `buchhaltung`.
2. **Überwacht** — Eintrag in `security_watchlist` mit `aktiv = true`.

Empfänger ist das **betroffene** Konto (bzw. `melde_email`, falls gesetzt),
nicht die auslösende Person. Bei einer Rollenänderung oder einem
administrativen Passwort-Reset ist das der Punkt: Wer eine Rolle bekommt oder
verliert, soll davon erfahren, ohne auf die Auskunft desjenigen angewiesen zu
sein, der sie vergeben hat.

Zusätzlich geht jede Meldung an `SECURITY_MELDE_POSTFACH`, falls gesetzt.

### ACCOUNT_SECURITY_ALERTS — der kontobezogene Schalter

`security_watchlist.aktiv` **ist** ACCOUNT_SECURITY_ALERTS. Es gibt keinen
zweiten Mechanismus und keine Sonderbehandlung einzelner Adressen im Code.

| Spalte | Bedeutung |
|---|---|
| `aktiv` | Alarm an/aus |
| `alle_ereignisse` | `true` = voller Überwachungssatz (unten), `false` = nur der Katalogsatz wie bei privilegierten Konten |
| `ohne_sperrfrist` | `true` = keine 12-Stunden-Bremse, jede Anmeldung meldet |
| `melde_email` | Zieladresse. **Leer = die Adresse des Kontos selbst.** Für eine Admin-Meldung hier die Verwaltungsadresse eintragen |
| `email_kontrolle` | Die beim Einrichten angegebene Adresse — nur Gegenprobe |
| `grund` | Pflicht, mindestens 40 Zeichen, und er muss die vier Angaben `Zweck:`, `Rechtsgrundlage:`, `Zeitraum:`, `Transparenz:` auffindbar enthalten. Ein Fließtext über 40 Zeichen genügt **nicht** |
| `befristet_bis` | Ende der Maßnahme (Migration 20261024000000, noch nicht angewendet). Darf früher liegen als die 90 Tage, nie später |

**Überwachungssatz** (`UEBERWACHUNGS_EREIGNISSE`, Obermenge von
`meldepflichtig`): zusätzlich `login_failed`, `logout`, `session_end`,
`app_start`, `profile_change`, `blocked_action`, `admin_action`. Ausdrücklich
**nicht** enthalten: `security_notification_sent` — sonst löste jede Mail die
nächste aus.

**Einrichten** — zwei Wege. Beide fahren dieselben Regeln (Mindestlänge,
die vier Pflichtangaben, Frist) und schreiben ein
`watchlist_change`-Ereignis. Bis zum 01.09.2026 galt das nur für die
Oberfläche: das Skript schrieb direkt per PostgREST, verlangte 5 statt 40
Zeichen, fragte nicht nach den Pflichtangaben und hinterließ keine
Protokollzeile — der eine Live-Eintrag ist genau so entstanden und hat
deshalb keine Spur.

1. Oberfläche: `/admin/security/audit-log` → „Überwachte Konten".
2. Kommandozeile (Trockenlauf ohne `--ja`):

```
npm run security:watchlist -- --email <adresse> --grund "<text>" --melde-an <admin-adresse> --ja
npm run security:watchlist -- --liste
npm run security:watchlist -- --user-id <uuid> --aus --ja
```

**Die Zuordnung hängt an `user_id`, nie an der Adresse.** Die Adresse ist
veränderlich — sie ist sogar eines der Ereignisse, die dieses System meldet.
Weicht die angegebene Adresse von der des Kontos ab, sagen Skript, API-Antwort
und Oberfläche das ausdrücklich, statt still das falsche Konto einzutragen.

**Kein Personenbezug im Repository.** Keine Migration und keine Quelldatei
trägt einen Namen oder eine Adresse. Wer überwacht wird, steht in der
Datenbank — ein Name in der Versionsgeschichte ließe sich nicht mehr löschen.

**Arbeitsrecht.** Die dauerhafte Überwachung eines einzelnen
Beschäftigtenkontos ist nach § 26 BDSG / Art. 88 DSGVO begründungs- und
dokumentationspflichtig und in mitbestimmten Betrieben mitbestimmungspflichtig.
Das Feld `grund` ist dafür da; die Rechtsgrundlage zu prüfen ist eine
Entscheidung der Geschäftsführung, nicht dieses Systems.

### Absender

Immer `Alltagsengel <info@alltagsengel.care>` über `sendRawEmail()` — die
Adresse der eigenen Domain (Strato-Postfach), versendet über den gehärteten
Weg in `lib/notifications.ts`. Kein persönlicher Name, kein Freemail-Konto.
Unterschrift: „Herzliche Grüße / Ihr Team von Alltagsengel".

### Inhalt

Benutzername · Benutzerkonto · Benutzer-ID · Rolle · Ereignis · Ergebnis
(SUCCESS/FAILED) · Schweregrad · Zeit UTC · Zeit lokal (Europe/Berlin) ·
betroffene Funktion · vorheriger Wert · neuer Wert · Zugang (Web/App) ·
App-/Web-Version · Browser · Betriebssystem · Gerät · User-Agent · IP-Adresse ·
Organisation · Sitzungsbezug · Audit-Event-ID.

Leere Felder werden weggelassen statt als „—" gezeigt. Alle Werte HTML-escaped
(`esc()`), weil ein User-Agent ein Wert von außen ist. Der Inhalt entsteht
ausschließlich aus der Ereigniszeile — und die ist bereits gefiltert.

### Stille Zeit

Pro Konto, Ereignistyp und Gerät höchstens **eine** Meldung in 12 Stunden.
Ereignisse mit Schweregrad `critical` umgehen die Bremse — eine
Rollenänderung darf nie unterdrückt werden.

Ohne die Bremse bekäme eine Verwaltungskraft, die sich dreimal täglich
anmeldet, drei Mails täglich — und läse nach einer Woche keine mehr. Eine
Meldung, die niemand mehr liest, ist wirkungslos.

Bei einer Anmeldung auf einem **neuen** Gerät wird `login_success` **nicht**
gemeldet; die Meldung trägt `unknown_device`. Eine Nachricht statt zweier zum
selben Vorgang.

Der Versand hinterlässt eine eigene Zeile (`security_notification_sent`) mit
`bezug_ereignis` — daran hängt die Sperrfrist. Kein UPDATE am Vorfall: die
Tabelle ist unveränderlich.

### Schalter

| Variable | Vorgabe | Wirkung |
|---|---|---|
| `SECURITY_MAIL_AKTIV` | **an** (Fehlen = an) | `0`/`false`/`aus` schaltet alle Sicherheitsmeldungen ab. |
| `SECURITY_MELDE_POSTFACH` | leer | Zusätzliches Sicherheitspostfach. |

Bewusst **umgekehrt** zu den Versand-Schaltern der Abrechnung
(`*_AUTOMATISCH`, fail-closed): dort verlässt Geld das Haus, hier eine
Warnung an die eigene Belegschaft. Ein Sicherheitssystem, das standardmäßig
schweigt, ist keines. Ohne `RESEND_API_KEY` geht ohnehin nichts raus —
`sendRawEmail()` meldet dann `uebersprungen`.

---

## 7. Ungewöhnliche Anmeldeserie

Gezählt werden fehlgeschlagene Anmeldungen der letzten **15 Minuten**, je
Konto **und** je IP-Adresse. Ab **5** Fehlversuchen auf einer der beiden
Achsen entsteht ein `unusual_login_series` (critical, meldepflichtig).

Beide Achsen sind nötig: ein Angriff auf ein einzelnes Konto fällt über das
Konto auf, ein Durchprobieren vieler Konten von einer Quelle nur über die IP.

Die Prüfung ist eine **Auswertung, keine Sperre**. Gesperrt wird an anderer
Stelle (`lib/rate-limit-persistent.ts`); dieses Modul stellt fest und meldet,
es entscheidet nicht über Zugang.

---

## 8. Wo protokolliert wird

| Ort | Ereignis |
|---|---|
| `app/auth/login/actions.ts` → `logSuccessLogin` | `login_success` (+ `unknown_device`) |
| `app/auth/login/actions.ts` → `logFailedLogin` | `login_failed` (+ `unusual_login_series`) |
| `app/auth/login/actions.ts` → `protokolliereAbmeldung` | `logout` |
| `app/auth/callback/route.ts` | `session_start` (Magic-Link, Bestätigung, Wiederherstellung) |
| `app/api/admin/manage-role/route.ts` | `role_change` |
| `app/api/admin/reset-password/route.ts` | `password_reset_requested` (critical, Weg „administration") |
| `app/api/auth/send-reset/route.ts` | `password_reset_requested` (Weg „selbst_angefordert") |
| `app/api/admin/security/audit-log/route.ts` | `data_export` beim CSV-Export |
| `app/api/admin/security/watchlist/route.ts` | `watchlist_change` (kritisch) |
| `app/api/security/app-start/route.ts` | `app_start` (Beacon der nativen Hülle) |
| `lib/audit-log.ts` → `logAuditEvent` | `admin_action` — Spiegel jeder Verwaltungshandlung, **nur** für überwachte Konten |
| DB-Trigger auf `auth.users` | `login_success` (Sicherheitsnetz für Wege ohne Anwendungscode) |
| DB-Trigger auf `profiles` | `email_change`, `phone_change`, `role_change`, `account_data_change` |

### Retry-Queue und Nachzügler

Zwei getrennte Wege, damit keine Meldung verlorengeht:

1. **Zustellspur + Wiederholungslauf.** Jeder Versand trägt einen
   Zustellkontext (`vorgangArt: 'sicherheitsmeldung'`, `vorgangRef` = die
   Ereignis-ID). Scheitert er, steht er in `notification_delivery_log`; der
   Wiederholungslauf (alle 5 Minuten,
   `.github/workflows/zustellung-retry.yml`) baut die Mail aus der
   Ereigniszeile neu auf — `lib/notifications/vorgaenge/sicherheitsmeldung.ts`.
   Ereignisse ohne Organisation bekommen keinen Zustellkontext (das Feld ist
   pflichtig); dort bleibt nur der Sofortversuch.
2. **Nachzügler.** `lib/security/nachzuegler.ts` läuft im selben
   Fünf-Minuten-Takt (angehängt an `/api/cron/zustellung-retry`) und sendet
   die Meldungen zu Ereignissen, die die **Datenbank** geschrieben hat — die
   Trigger auf `auth.users` und `profiles`. Ein Trigger kann keine Mail
   senden; ohne diesen Lauf stünde die Adressänderung im Protokoll und
   niemand erführe davon.

Gegen Doppelversand wirken drei Riegel: vorhandener Versandnachweis, bereits
in der Zustellspur, und der Idempotenzschlüssel `sec-<ereignis>-<adresse>`
(Resend, 24-Stunden-Fenster).

### Was noch **nicht** angebunden ist — offen benannt

* **Abmeldung** ist nur im Verwaltungsbereich (`app/admin/layout.tsx`)
  verdrahtet. Engel-, Kunden- und Fahrerprofil melden sich weiterhin ohne
  Protokollzeile ab.
* **`session_end`** wird nirgends geschrieben. Ein Sitzungsende ohne
  Abmeldung (Ablauf des Tokens) merkt der Server nicht — das ist keine
  Nachlässigkeit, sondern eine Grenze: ein ablaufendes Token erzeugt keinen
  Aufruf.
* **`app_start`** meldet nur die native Hülle (Capacitor). Im Browser gibt es
  kein „App-Start"; dort sind Sitzungsbeginn und Anmeldung die Ereignisse.
  Der Beacon setzt voraus, dass die App die Live-Seite lädt — er ist gegen
  Fluten auf 6 Meldungen je Konto und Stunde begrenzt.
* **`customer_change` / `employee_change` / `critical_data_change`** sind im
  Katalog vorgesehen, aber an keiner Schreibroute verdrahtet. Solche
  Änderungen erscheinen für überwachte Konten als `admin_action` (Spiegel aus
  `mis_audit_log`), nicht mit fachlichem Vorher/Nachher.
* **`mfa_enrolled` / `mfa_removed`** desgleichen.

---

## 9. Aufbewahrung

**24 Monate** (`security_audit_log_aufraeumen(730)`). Länger als die 12
Monate, nach denen ein Sicherheitsvorfall üblicherweise entdeckt wird; kürzer
als die 10-Jahres-Fristen der Pflege- und Buchhaltungsdokumentation — diese
Tabelle trägt ein Protokoll, keinen Beleg. Fristen unter 90 Tagen weist die
Funktion ab.

**Die Funktion hat derzeit keinen Aufrufer.** Es gibt keinen Cron-Eintrag in
`vercel.json`. Ohne Aufrufer wird nichts gelöscht — das ist der Ist-Zustand,
nicht eine Absichtserklärung. Wer den Takt setzen will, hängt sie wie die
übrigen Läufe in `vercel.json` ein (`lib/api/cron-auth.ts` für die
Authentifizierung, nie `Bearer ${CRON_SECRET}` von Hand).

Löschkatalog: `lib/dsgvo/loeschkatalog.ts` führt `security_audit_log.user_id`
als `aufbewahren` (Art. 32 DSGVO), `security_known_devices.user_id` und
`security_watchlist.user_id` als `loeschen`.

---

## 10. Oberfläche

`/admin/security/audit-log`

Filter: E-Mail, Konto-ID, Zeitraum von/bis, Ereignistyp, Kategorie,
Schweregrad, Plattform, IP, Herkunft (echt / Test / nachgestellt). Sortierung nach Zeitpunkt, Ereignistyp,
Schweregrad, Konto. Seiten zu 50 (max. 200). CSV-Export bis 10.000 Zeilen,
Semikolon-getrennt mit BOM (deutsche Excel-Locale) und Formel-Entschärfung
(`csvZelle`) — ein User-Agent ist ein Wert von außen und landet in einer
Datei, die jemand in Excel öffnet.

Der Export ist selbst ein Ereignis (`data_export`): wer die Sicherheitsspur
exportiert, hinterlässt eine Spur.

---

## 11. Migrationen

| Datei | Inhalt |
|---|---|
| `20261018000000_rollenmatrix_sicherheit_lesen.sql` | `sicherheit.lesen` in `public.rollen_matrix` |
| `20261018000001_rollback_…` | Rücknahme (behält `marketing.verwalten`) |
| `20261018000002_security_audit_log.sql` | Tabellen, RLS, Funktionen, Trigger |
| `20261018000003_rollback_…` | Rücknahme **mit Datenverlust** — vorher exportieren |
| `20261018000004_security_watchlist_kontoalarm.sql` | Schalter-Spalten + Trigger auf `profiles` |
| `20261018000005_rollback_…` | Rücknahme (Einträge bleiben stehen) |

**Reihenfolge beachten:** `public.rollen_matrix` ist eine geteilte Funktion.
Jede Migration, die eine Berechtigung ergänzt, setzt sie **vollständig** neu;
die zuletzt angewendete Fassung gewinnt. Wer künftig eine Berechtigung
ergänzt, übernimmt die vollständige Liste aus `lib/auth/rollen.ts`.
`__tests__/security/rollenkonzept-pglite.test.ts` vergleicht SQL und
TypeScript Zelle für Zelle und fällt sonst auf.

Der Trigger auf `auth.users` braucht Eigentümerrechte am `auth`-Schema. Läuft
die Migration im Supabase-SQL-Editor (als `postgres`), wird er angelegt.
Andernfalls meldet die Migration eine `WARNING` und läuft durch — der
Anwendungspfad protokolliert weiterhin, nur das Sicherheitsnetz fehlt.

---

## 12. Tests

| Datei | Prüft |
|---|---|
| `__tests__/security/security-audit-log-pglite.test.ts` | Schema, RLS, Unveränderlichkeit, FK-Kaskade, `log_security_event()`, Aufbewahrung, `auth.users`-Trigger, Rollback — auf echtem Postgres (PGlite/WASM) |
| `__tests__/security/security-audit-lib.test.ts` | Geheimnis-Filter, Ereigniskatalog, Gerätemerkmale, Hash-Stabilität, Meldemail |
| `__tests__/security/rollenkonzept-pglite.test.ts` | Gleichstand `rollen_matrix` (SQL) ↔ `ROLLEN_MATRIX` (TypeScript) |
| `__tests__/security/rollenkonzept.test.ts` | Vorbehalte der Administration |
| `__tests__/security/security-kontoalarm-pglite.test.ts` | Schalter-Spalten, Teilindex, `profiles`-Trigger (Vorher/Nachher, wer mitgeschrieben wird und wer nicht), Rollback |
| `__tests__/security/watchlist-befristung-pglite.test.ts` | Was ein UPSERT mit `created_at` macht, der CHECK aus 20261024000000, Rollback — auf echtem Postgres |
| `__tests__/security/watchlist-transparenz.test.ts` | Begründungs-Riegel, Wiederanordnung nach Ablauf, kein stilles Verlängern, Gleichstand Oberfläche ↔ Kommandozeile |
| `npm run verify:ueberwachung` | Live: Frist, Pflichtangaben, Fristspalte, Protokollspur — rein lesend, U7 misst das nach |
