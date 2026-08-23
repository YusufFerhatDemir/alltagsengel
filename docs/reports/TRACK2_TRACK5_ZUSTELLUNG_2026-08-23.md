# Prüfprotokoll — Track 2 (Resend) + Track 5 (Benachrichtigungen E2E)

**Datum:** 23.08.2026
**Umfang:** E-Mail-Versand über Resend; Zustellspur über alle vier Kanäle
**Vorgehen:** Code-Analyse, öffentliche DNS-Abfrage, Testläufe gegen echtes
Postgres (PGlite/WASM). **Es wurde keine einzige echte Nachricht versendet.**

---

## Kurzfassung

| Frage | Antwort |
| --- | --- |
| Ist der Versandcode korrekt? | **Ja** — 17 neue Tests, Gegenprobe bestanden |
| Ist die Absenderdomain in Resend verifiziert? | **Ja** — per DNS belegt |
| Ist der Schlüssel in Vercel gültig? | **Nicht feststellbar** — siehe §2.4 |
| Schreiben alle vier Kanäle in die Zustellspur? | **Ja** — gegen echtes Postgres bewiesen |
| Greift die Dublettensperre? | **Ja** — echter Unique-Index, auch parallel |
| Läuft der Aufräum-Job? | **Nein, er hatte keinen Aufrufer** → behoben, siehe §3.4 |
| Läuft Retry/Dead-Letter produktiv? | **Nein** — gebaut und getestet, aber unverdrahtet, siehe §3.5 |

---

## 1. Was neu dazugekommen ist

| Datei | Inhalt |
| --- | --- |
| `__tests__/notifications/resend-integration.test.ts` | 17 Tests: Resend-Kette mit Attrappe statt echtem Versand |
| `__tests__/notifications/kanaele-e2e-pglite.test.ts` | 26 Tests: alle vier Kanäle gegen echtes Postgres mit echter Migration |
| `lib/notifications/aufraeumen.ts` | Aufrufer für `cleanup_notification_delivery_log()` (fehlte) |
| `app/api/cron/automatisierung/route.ts` | ruft den Aufräum-Lauf einmal pro Cron-Durchlauf auf |

Testlauf gesamtes Repo nach der Änderung:

```
vitest      205 Dateien | 4116 Tests bestanden | 38 übersprungen | 0 rot
node:test   794 Tests bestanden | 0 rot
tsc --noEmit  ohne Befund
```

---

## 2. Track 2 — Resend

### 2.1 Wie Resend aufgerufen wird

Zwei Ausgänge, beide in `lib/notifications.ts`:

| Funktion | Zweck | Verhalten ohne Schlüssel |
| --- | --- | --- |
| `sendEmailNotification()` (Z. 170) | Systemmails mit „Hallo {Name}"-Rahmen | `false`, Protokoll `skipped` |
| `sendRawEmail()` (Z. 271) | Rechnungen/Mahnungen: eigenes HTML + PDF-Anhang | `{ok:false, uebersprungen:true}`, Protokoll `skipped` |

Der Client entsteht in `getResend()` (Z. 54) und liest `process.env.RESEND_API_KEY`
**bei jedem Aufruf neu**. Das ist wichtig und wurde eigens getestet: ein
nachträglich in Vercel gesetzter Schlüssel wirkt sofort und braucht keinen
Neustart aller Lambdas.

Der Unterschied `uebersprungen` ↔ `fehlgeschlagen` ist fachlich tragend:
`rechnung-versand.ts` setzt bei `uebersprungen` **kein** `sent_at` und nimmt die
Rechnung beim nächsten Lauf wieder mit. Wäre es `fehlgeschlagen`, zählte der
Lauf gegen die Versuchsobergrenze und die Rechnung bliebe liegen. Beide Pfade
sind getestet.

### 2.2 Wo der Schlüssel gelesen wird

`process.env.RESEND_API_KEY` wird an **11 Stellen** gelesen. Jede baut ihren
eigenen Resend-Client:

- `lib/notifications.ts` (zentral, für Systemmails, Rechnungen, Mahnungen)
- `lib/whatsapp/escalation.ts` (2×, Eskalationsmails an das Team)
- `app/api/kontakt`, `app/api/newsletter`, `app/api/drip`, `app/api/coach/anfrage`,
  `app/api/visitor-alert`, `app/api/cron/review-request`
- `supabase/functions/account-hard-delete/index.ts` (Deno, eigene Laufzeit,
  eigene Env — **nicht** durch Vercel-Variablen abgedeckt)

Kein Fehler, aber eine Beobachtung: es gibt keinen zentralen Resend-Zugang.
Eine Umstellung (Domain, Absender, Ratenbegrenzung) müsste an allen 11 Stellen
nachgezogen werden.

### 2.3 Absenderdomain — verifiziert

Drei Absenderadressen, alle auf `alltagsengel.care`:
`info@` (Kundenkommunikation), `alert@` (Besucher-Alarm), `bot@` (WhatsApp-Eskalation).

Öffentliche DNS-Abfrage am 23.08.2026:

| Eintrag | Wert | Bedeutung |
| --- | --- | --- |
| `resend._domainkey.alltagsengel.care` TXT | DKIM-Public-Key vorhanden | Resend-Selector — wird nur gesetzt, wenn die Domain in Resend angelegt ist |
| `send.alltagsengel.care` TXT | `v=spf1 include:amazonses.com ~all` | Resends SPF-Eintrag (Resend versendet über AWS SES) |
| `send.alltagsengel.care` MX | `feedback-smtp.eu-west-1.amazonses.com` | Bounce-Rücklauf, **EU-Region** — datenschutzrechtlich die richtige |
| `_dmarc.alltagsengel.care` TXT | `v=DMARC1;p=reject;` | Nicht-ausgerichtete Mail wird beim Empfänger **abgewiesen**, nicht in Spam gelegt |

**Bewertung:** Die Domain ist in Resend eingerichtet und verifiziert. DKIM
signiert mit `d=alltagsengel.care`, die Absenderdomain ist dieselbe — DMARC
ist damit über DKIM ausgerichtet und besteht. Ein Test hält den Absender
gegen genau diese Domain fest: wird er künftig auf eine andere Domain
geändert, wird der Test rot, bevor die erste Mail abgewiesen wird.

Am Wurzeleintrag `alltagsengel.care` selbst liegt **kein** SPF-Record. Für
Resend ist das ohne Folge (die Hüllenabsenderdomain ist `send.alltagsengel.care`),
und `p=reject` deckt Missbrauch ab. Erwähnt, damit es bei einer künftigen
Prüfung nicht als neuer Befund auftaucht.

### 2.4 Was nicht feststellbar ist

**Die Gültigkeit des in Vercel hinterlegten Schlüssels.** Gründe:

1. Das Vercel-CLI ist in dieser Umgebung nicht eingeloggt.
2. Der Zugriff auf den lokalen Wert in `.env.local` wurde durch den
   Sicherheitsfilter der Arbeitsumgebung unterbunden.
3. Ein Gültigkeitsnachweis erfordert zwingend einen echten API-Aufruf **mit**
   dem Schlüssel.

`MASTER_PROJECT_STATUS.md` vermerkt, dass die Variable in Vercel existiert
(angelegt 19.03.) und im Dashboard „Needs Attention" trägt. Das sagt nichts
über die Gültigkeit.

**Der eine Schritt, der es entscheidet:** einen realen Rechnungsversand
auslösen und danach `invoice_email_log` lesen.

- Zeile `versendet` mit `provider_message_id` ⇒ Schlüssel gültig, Kette live.
- Zeile `uebersprungen` ⇒ Variable kommt in der Laufzeit nicht an.
- Zeile `fehlgeschlagen` mit Resend-Fehlertext ⇒ Schlüssel ungültig oder
  Domain in Resend abgelaufen.

### 2.5 Einordnung

Die geforderte Zweiteilung passt nicht sauber, deshalb ausdrücklich:

- **`RESEND_BLOCKED` trifft nicht zu.** Es gibt keinen blockierenden Befund:
  Code korrekt, Fehlerbehandlung vollständig, Domain verifiziert, DMARC
  ausgerichtet.
- **`RESEND_LIVE_VERIFIED` ist nicht belegbar**, weil ein einziges Glied
  offen bleibt — die Gültigkeit des Schlüssels — und dieses Glied von hier
  aus prinzipiell nicht prüfbar ist.

Präziser Stand: **CODE_VERIFIED + DOMAIN_VERIFIED, KEY_UNVERIFIED.**
Alles, was im Code liegt, ist geprüft; offen ist genau eine Betriebsvariable.

---

## 3. Track 5 — Benachrichtigungen E2E

### 3.1 Prüfaufbau

Der neue E2E-Test bootet eine echte PostgreSQL-Instanz (PGlite/WASM), spielt
`20260923000000_notification_delivery_log.sql` unverändert ein und legt den
PostgREST-Shim (`__tests__/e2e/helpers/pglite-supabase.ts`) darüber. Der
Produktivcode läuft dadurch unverändert gegen echtes Postgres — CHECK-Constraints,
Fremdschlüssel und der Partial-Unique-Index greifen **wirklich**.

Das schließt eine Lücke zwischen den bestehenden Suiten:

| Bestehender Test | Prüft | Lücke |
| --- | --- | --- |
| `zustellspur.test.ts`, `zustellung-retry.test.ts` | TS-Code gegen JS-Stub | Der Stub *bildet* den Unique-Index *nach* — Annahme, kein Beweis |
| `notification-delivery-log-pglite.test.ts` | Migration gegen echtes Postgres | Anwendungscode kommt nicht vor |
| **neu: `kanaele-e2e-pglite.test.ts`** | Anwendungscode **und** echte DB zusammen | — |

### 3.2 Ergebnis je Kanal

| Kanal | Einstieg | Provider | Status bei Erfolg | Belegt |
| --- | --- | --- | --- | --- |
| `email` | `sendRawEmail()` / `sendEmailNotification()` | `resend` | `sent` + `provider_message_id` | ✓ |
| `in_app` | `createNotification()` | `supabase` | `delivered` | ✓ |
| `push` | `sendPushToUser()` | `web_push` | `sent` | ✓ |
| `whatsapp` | `sendWhatsAppMessage()` | `whatsapp_api` | `sent` + `wamid` | ✓ |

`in_app` schreibt bewusst `delivered` statt `sent`: die Zeile in `notifications`
**ist** die Zustellung, sie liegt im Postfach. Ein Wiederholungslauf darf hier
nie nachlegen. Eine Gegenprobe (Status testweise auf `sent` geändert) machte den
Test wie erwartet rot.

Weiter belegt:
- Derselbe Vorgang darf über alle vier Kanäle laufen — vier Zeilen, keine
  gegenseitige Blockade.
- Fehlschläge landen je Kanal mit `failed_at` und leerem `delivered_at`.
- Fehlende Zugangsdaten ergeben `skipped`, **nicht** `failed`, und es wird
  gar nicht erst gesendet.

### 3.3 Idempotenz, Retry, Dead Letter

| Prüfung | Ergebnis |
| --- | --- |
| Zweiter Erfolg pro (Vorgang, Kanal) | Von der Datenbank abgewiesen (23505) — für alle vier Kanäle einzeln geprüft |
| `sendeIdempotent` zweiter Lauf | `bereits_zugestellt`, Versandfunktion wird **nicht** aufgerufen |
| Fehlschlag | `failed`, wiederholbar, `attempt_count` zählt korrekt hoch (1, 2, …) |
| Nach `MAX_VERSUCHE` (5) | `aufgegeben` — Dead Letter, kein weiterer Versandversuch |
| `skipped`-Läufe | Zählen **nicht** gegen die Obergrenze; nach 8 Übersprüngen geht es raus, sobald die Voraussetzung da ist |
| Wartezeit ohne `sofort` | `wartet`, kein Versand |
| **Zwei gleichzeitige Läufe** | Genau **eine** Erfolgszeile überlebt |
| Parallel auf zwei Kanälen | Beide gehen durch — die Sperre ist kanalgenau |
| `offeneZustellungen` | Listet den offenen Fall, markiert ihn ab 5 Versuchen als aufgegeben, blendet ihn nach Erfolg aus, zeigt fremde Mandanten nicht |

**Gegenprobe:** Wird in der Migration `CREATE UNIQUE INDEX` zu `CREATE INDEX`
abgeschwächt, fallen genau die drei Dubletten-Tests um. Der Beweis hängt also
am echten Index, nicht am Testaufbau.

### 3.4 Befund 1 (behoben): Der Aufräum-Job lief nie

`cleanup_notification_delivery_log()` ist in der Migration angelegt, gegen
`anon`/`authenticated` gesperrt und für `service_role` freigegeben — hatte aber
**keinen einzigen Aufrufer im gesamten Repo**. Weder ein Cron-Endpunkt noch eine
Automatisierungskette noch ein Skript. Die Funktion existierte und lief nie;
`notification_delivery_log` wäre unbegrenzt gewachsen.

Behoben:
- `lib/notifications/aufraeumen.ts` — fehlertoleranter Aufrufer. Fehlt die
  Migration oder das Recht, wird gewarnt und `ok:false` gemeldet; der Cron-Lauf
  bricht **nicht** ab.
- `app/api/cron/automatisierung/route.ts` — Aufruf **einmal pro Lauf**, außerhalb
  der Organisationsschleife. Die Funktion löscht nach Alter, nicht nach Mandant;
  je Organisation aufgerufen liefe sie N-mal und meldete ab dem zweiten Mal 0.

Getestet gegen echtes Postgres: löscht genau die Zeile mit 401 Tagen, lässt die
mit 399 Tagen stehen, ist gefahrlos wiederholbar, und meldet einen fehlenden
RPC als `ok:false` statt zu werfen.

### 3.5 Befund 2 (offen): Retry und Dead Letter sind nicht verdrahtet

`sendeIdempotent()` und `offeneZustellungen()` haben **keinen Produktionsaufrufer**.
Die gesamte Maschinerie ist gebaut, funktioniert und ist jetzt bewiesen — aber
kein Versandweg der Anwendung geht durch sie.

Konkret: `rechnung-versand.ts` und `mahn-versand.ts` rufen `sendRawEmail()`
direkt auf und geben dabei den Zustellkontext mit. Sie **protokollieren** also
korrekt, nutzen aber die Vorab-Sperre nicht. Der Schutz gegen Doppelversand
liegt dort an `invoices.sent_at` plus dem Unique-Index als Protokollriegel.

Was daraus folgt — nüchtern:
- Doppelversand ist nicht akut zu befürchten (`sent_at` hält).
- Aber es gibt **keinen Wiederholungslauf**: eine wegen Provider-Ausfall
  gescheiterte Mail wird nie automatisch erneut versucht.
- Und es gibt **keine Betriebsansicht**: `offeneZustellungen()` liefert die
  Daten, aber keine Oberfläche und kein Endpunkt liest sie. Gescheiterte
  Zustellungen sind heute nur per SQL sichtbar.

Ein Test hält den Ist-Zustand ehrlich fest: zwei Aufrufe von `sendRawEmail()`
mit demselben Vorgang versenden **zweimal**; nur das Protokoll bleibt eindeutig.
Das ist dokumentiertes Verhalten, kein Fehler — aber es ist nicht das, was
„Retry live" bedeuten würde.

**Nicht in diesem Auftrag geändert**, weil es zwei neue Bausteine bräuchte
(einen Wiederholungslauf im Cron und eine Admin-Ansicht) und damit über
„E2E prüfen" hinausginge.

### 3.6 Befund 3: Native Push (FCM) ist protokollfrei

`sendFCMToUser()` wird in `lib/notifications.ts` bewusst **ohne** Zustellkontext
aufgerufen (Kommentar Z. 409): der Kanalkatalog der Migration kennt nur `push`
mit Provider `web_push`. Ein Eintrag für FCM wäre eine Falschaussage.

Folge: Zustellungen an die native App sind in der Spur unsichtbar. Das Schließen
bräuchte einen zusätzlichen Provider-Wert (`fcm`) im CHECK-Constraint, also eine
Migration.

### 3.7 Fehlertexte: keine Geheimnisse, keine PII

`sanitisiereFehler()` wendet 11 Muster an, spezifisch vor allgemein. Gegen
echtes Postgres geprüft mit einem Fehlertext, der gleichzeitig einen
Meta-Zugangstoken, einen Resend-Schlüssel, eine E-Mail-Adresse und eine
Telefonnummer enthielt — in `sanitized_error` landete keines davon, und der
Text blieb unter 500 Zeichen. Ebenfalls geprüft: der Stacktrace wird nie
mitgeschrieben (er enthielte Serverpfade).

---

## 4. Offene Punkte

| # | Punkt | Wer | Warum offen |
| --- | --- | --- | --- |
| 1 | Gültigkeit von `RESEND_API_KEY` in Vercel | Betrieb | Nur über echten Versand feststellbar (§2.4) |
| 2 | Wiederholungslauf, der `sendeIdempotent()` nutzt | Entwicklung | Neuer Baustein, außerhalb dieses Auftrags (§3.5) |
| 3 | Admin-Ansicht für `offeneZustellungen()` | Entwicklung | dito |
| 4 | FCM in den Kanalkatalog aufnehmen | Entwicklung | Braucht Migration (§3.6) |
| 5 | `account-hard-delete` (Supabase Edge Function) | Betrieb | Eigene Laufzeit, eigene Env — nicht durch Vercel-Variablen abgedeckt (§2.2) |
