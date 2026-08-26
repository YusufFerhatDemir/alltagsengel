# Phase 8.3 — Final Live-Pilot Preparation, Tracks 6–10

Stand: 2026-08-27
Commit-Anker: `d534383` (docs: Phase 8.2 Commit-Anker nachgezogen)
Sitzung: Tracks 6–10 (Tracks 1–5 laufen parallel in einer eigenen Sitzung)

**Nicht committet, nicht deployed** — auftragsgemäß. Es wurde keine Mail
versendet, kein Flag gesetzt, kein Kunde angelegt, kein CAMT-Import ausgeführt.

---

## TRACK 6 — RESEND FINAL DRY CHECK

**Ergebnis: VERSANDBEREIT.** Alle elf Punkte geprüft, zwei Beobachtungen
(R-1 niedrig, R-2 informativ), kein Blocker. Es wurde keine Mail versendet.

### 6.1 RESEND_API_KEY

| Prüfung | Befund |
|---|---|
| In `.env.local` gesetzt? | **JA** — Präfix `re_`, Länge 36. Der Wert wird nirgends ausgegeben. |
| Gültig? | **JA** — `scripts/verify-resend.mjs` liefert HTTP 200 auf `GET /domains`, Exit 0. Rein lesend, es wurde nichts versendet. |
| In `.env` / `.env.production`? | `.env` enthält keinen Resend-Schlüssel, `.env.production` existiert nicht. |
| Fehlender Schlüssel | `sendRawEmail()` wirft **nicht**, sondern liefert `{ ok:false, uebersprungen:true }`. `versendeRechnungPerEmail()` setzt `sent_at` dann **nicht** — die Rechnung geht beim nächsten Lauf mit gesetztem Key wieder mit (`lib/billing/versand/rechnung-versand.ts:246`). |

Ebenfalls geprüft (und korrekt **nicht** gesetzt): `PILOT_ERSTVERSAND_FREIGEGEBEN`,
`CAMT_IMPORT_MODE`, `*_AUTOMATISCH`-Versandschalter, `CRON_SECRET`.

### 6.2 Domain alltagsengel.care — DNS

| Record | Live-Stand |
|---|---|
| Resend-Kontostatus | `alltagsengel.care: status=verified, region=eu-west-1` (1 Domain im Konto) |
| DKIM `resend._domainkey.alltagsengel.care` | TXT vorhanden, `p=MIGfMA0…` (RSA-Public-Key) |
| MX `send.alltagsengel.care` | `20 feedback-smtp.eu-west-1.amazonses.com.` |
| SPF `send.alltagsengel.care` | `v=spf1 include:amazonses.com ~all` |
| DMARC `_dmarc.alltagsengel.care` | `v=DMARC1;p=reject;` |
| SPF **Apex** `alltagsengel.care` | **kein TXT-Record** → Beobachtung R-2 |

**Beurteilung R-2:** Kein Blocker. SPF wird gegen die Envelope-Domain
(Return-Path = `send.alltagsengel.care`) geprüft, und die trägt einen gültigen
SPF-Record; DMARC-Ausrichtung läuft ohnehin über DKIM (`d=alltagsengel.care`
= From-Domain). `p=reject` ist die schärfste Stufe: eine fremde, nicht
DKIM-signierte Mail mit From `@alltagsengel.care` wird abgelehnt — genau das
Gewünschte. Der fehlende Apex-SPF ist eine Härtungslücke gegen Direct-Domain-
Spoofing bei Empfängern, die kein DMARC auswerten, nicht mehr.

### 6.3 Absender (From)

`lib/notifications.ts:49`

```
export const ALLTAGSENGEL_ABSENDER = 'Alltagsengel <info@alltagsengel.care>'
```

Eine einzige Konstante, in `sendRawEmail()` **fest** verdrahtet (`:349`) — kein
Parameter, kein Aufrufer kann sie überschreiben. Regressionstest
`__tests__/notifications/resend-integration.test.ts:112-123` prüft Wortlaut,
Domain und die Namens-Policy (`not.toMatch(/yusuf|cilcioglu|abdullah/)`).
**Konform zur Kundenkommunikations-Regel.**

### 6.4 Reply-To — **Befund R-1 (NIEDRIG)**

`replyTo` ist in `RawEmailParams` deklariert (`lib/notifications.ts:263`) und
wird korrekt durchgereicht (`:354`), aber **kein einziger Aufrufer im gesamten
Repo setzt es** — auch der Rechnungsversand nicht.

Wirkung: Ohne `Reply-To`-Header antwortet ein Mailclient an `From`, also an
`info@alltagsengel.care`. Das ist die **richtige** Adresse, die Kette
funktioniert. Der Mailtext lädt ausdrücklich zum Antworten ein („antworten Sie
einfach auf diese E-Mail", `lib/emails/rechnung-email.ts`), es geht also nichts
ins Leere.

Offen bleibt nur die **Konfigurierbarkeit je Mandant**: ein zweiter Mandant mit
eigener Rückkanaladresse kann sie heute nicht hinterlegen. Für den Pilot
(Stamm-Org = Alltagsengel) irrelevant. Kein Handlungsbedarf vor dem Erstversand.

### 6.5 PDF-Anhang

**Base64 im Mailkörper, keine Storage-URL.** Der Kunde braucht keinen Login und
keinen Link, der ablaufen kann.

Weg: `erzeugeRechnungsPaket()` liefert `pdfBytes` (`Uint8Array`) → Übergabe als
`attachments[0].content` → `sendRawEmail()` kodiert mit
`Buffer.from(a.content).toString('base64')` (`lib/notifications.ts:357-361`).
Dateiname aus `anhangDateiname(belegart, rechnungsnummer)`, dateisystem-
bereinigt, z. B. `Rechnung_RE-2026-00042.pdf`. `contentType: application/pdf`.

Dasselbe Paket wird nebenbei in den Storage geladen und in `invoice_packages`
verzeichnet — das ist die Archivkopie, nicht der Zustellweg.

**Keine Gesundheitsdaten im Mailkörper**: der Text nennt nur Rechnungsnummer,
Zeitraum, Betrag, Fälligkeit, Bankverbindung. Leistungspositionen und
Unterschriften stehen ausschließlich im PDF.

### 6.6 Idempotency-Key — **geprüft und jetzt testgesichert**

`lib/billing/versand/rechnung-versand.ts:259`

```
idempotenzSchluessel: erneutSenden ? undefined : `rechnung:${invoiceId}`,
```

→ Resend-Header `Idempotency-Key`, Fenster 24 Stunden. Beim ausdrücklichen
Nachversand (`erneutSenden: true`) **bewusst weggelassen** — dort ist die zweite
Mail die Absicht.

Dieser Schlüssel war bis heute von **keinem Test berührt**. Siehe Track 9.

### 6.7 Provider-Zeitlimit

`RESEND_ZEITLIMIT_MS = 20_000` (`lib/notifications.ts:64`), umgesetzt über
`mitZeitlimit()` als `Promise.race`. Das Resend-SDK bringt kein eigenes
Zeitlimit mit; ohne dieses hinge der Aufruf, bis die Serverless-Funktion
abgeräumt wird — dann gäbe es weder Protokollzeile noch `invoice_email_log`-
Eintrag.

Ein Riss wird als `statusCode 408` gemeldet → `klassifiziereFehler()` stuft ihn
als **vorübergehend** ein → der Wiederholungslauf versucht es erneut → und der
Idempotenzschlüssel (6.6) verhindert dabei die zweite Kundenmail. Die drei
Bausteine gehören zusammen; einer allein trägt nicht.

Der verlorene Aufruf wird nicht abgebrochen (das SDK nimmt kein `AbortSignal`);
der Timer läuft `unref()`, blockiert also keinen Batchlauf.

### 6.8 Duplikat-Schutz — vier Ebenen, aber nicht alle sperren

Die Formulierung „4 Ebenen" verdient eine Präzisierung, weil zwei davon **vor**
dem Versand greifen und zwei **danach**:

| # | Ebene | Wo | Wirkung |
|---|---|---|---|
| 1 | `pilot_send_gate` — zwei partielle UNIQUE-Indizes | `20261005000000_pilot_send_gate.sql:91,96` | **SPERRT VOR VERSAND, DB-Ebene.** `pilot_send_gate_einmal_verbraucht` erlaubt höchstens EIN verbrauchtes Token je Rechnung; ein zweiter paralleler Lauf bekommt 23505. Token wird **vor** dem Senden verbraucht (verbranntes Token > zweite Rechnung beim Kunden). |
| 2 | `invoices.sent_at` | `rechnung-versand.ts:157` | **SPERRT VOR VERSAND, TS-Ebene.** Gesetzt → `uebersprungen`, außer `erneutSenden`. |
| 3 | Resend `Idempotency-Key` | `rechnung:{invoiceId}`, 24 h | **SPERRT BEIM PROVIDER.** Fängt genau den Fall ab, den 1 und 2 nicht sehen können: Zeitlimit gerissen, Auftrag beim Provider trotzdem angenommen. |
| 4 | `uq_notification_delivery_log_erfolg` UNIQUE `(correlation_id, channel) WHERE status IN ('sent','delivered')` | `20260923000000:115` | **Zweischneidig.** Für den **Wiederholungslauf** sperrend (`bereitsZugestellt()` fragt vorher, fail-closed). Für den **Erstversand** erst *nach* dem Senden ausgewertet — `protokolliere()` läuft nach `resend.emails.send()`, ein 23505 liefert dort `{ doppelt: true }` und wird protokolliert, hält die Mail aber nicht mehr auf. Das ist Absicht: nach angenommener Mail darf ein Protokollfehler den Aufrufer nicht in einen Fehlerpfad schicken. |

`invoice_email_log` ist **keine Sperre**, sondern die Versuchshistorie (kein
UNIQUE-Index; `versuch` wird aus `count()` hochgezählt, best effort). Es dient
der Nachprüfung, nicht der Abwehr — das gehört so gesagt, damit niemand sich
auf einen Riegel verlässt, den es nicht gibt.

**Fazit:** Vor dem Versand halten zwei unabhängige Riegel (einer davon in der
DB), beim Provider ein dritter. Das trägt.

### 6.9 Audit-Log

`versendeRechnungPerEmail()` schreibt über `auditOderWarnen()` →
`logBillingAction()` → `billing_audit_trail`:

| Ausgang | `action` |
|---|---|
| Erfolg | `email_versendet` (mit `provider_message_id`, `pdf_checksum`, Empfänger, Betreff) |
| Provider-Fehler | `email_fehlgeschlagen` |
| Übersprungen | `email_uebersprungen` |

Nach erfolgtem Versand darf ein Audit-Fehler **nicht** werfen (`auditOderWarnen`
fängt ab und loggt) — sonst würde ein Retry doppelt senden. Getestet:
`rechnung-versand.test.ts:334`.

### 6.10 Dead-Letter / Fehlerklassifikation

`lib/notifications/fehlerklassen.ts`. Leitsatz: **im Zweifel vorübergehend** —
ein fälschlich als dauerhaft eingestufter Fehler kostet eine Nachricht, die nie
ankommt; umgekehrt nur vier weitere Versuche.

| Klasse | Auslöser |
|---|---|
| `dauerhaft` | Codes 400, 404, 410, 422 · Textmuster: `validation_error`, `invalid recipient`, `mailbox not found`, `hard bounce`, `suppressed`, `unsubscribed` · **`PROVIDER_OHNE_ID`** |
| `voruebergehend` | Codes 401, 402, 403, 408, 409, 425, 429 · 5xx · Netzfehler · alles ohne Anhaltspunkt |

Zwei Entscheidungen, die man kennen muss:

- **401/403 sind vorübergehend.** Ein abgelehnter Schlüssel ist ein Betriebs-,
  kein Empfängerproblem — nach dem Nachziehen in Vercel sollen die
  liegengebliebenen Mails zugestellt werden. Sonst wäre jede Nachricht während
  einer Schlüsselrotation verloren.
- **„2xx ohne Nachrichten-ID" ist dauerhaft.** Der Provider hat bestätigt, die
  Mail ist womöglich raus — nur unbestätigt. Eine Wiederholung könnte eine
  zweite Rechnung erzeugen. Der Vorgang geht sofort ins Dead Letter und damit
  vor menschliche Augen. Genau deshalb gilt in `sendRawEmail()` ein Versand
  **erst mit `data.id` als Erfolg** (`lib/notifications.ts:386-397`); ohne ID
  bleibt `sent_at` leer statt eine Falschaussage festzuschreiben.

### 6.11 Post-Send-Reconciliation

`lib/pilot/post-send-verification.ts` — acht Prüfpunkte nach dem ersten echten
Versand:

1. Resend hat angenommen
2. Provider-Kennung vorhanden **und** im Protokoll wiederzufinden
3. Genau **eine** Erfolgszeile in `invoice_email_log` — nicht null, nicht zwei
4. Keine Retry-Dublette in der Zustellspur
5. Empfänger, Betreff und Betrag sind die, die sie sein sollten
6. Audit-Eintrag existiert
7. `invoices.sent_at` ist gesetzt
8. Keine fremde Organisation betroffen

**Fail-closed ohne Mittelweg:** Ein Punkt, der *nicht prüfbar* war
(`bestanden: null`), zählt als Abweichung — nicht als „vermutlich in Ordnung".
Jede Abweichung setzt eine P0-Sperre in `pilot_versand_sperre` und entwertet
alle offenen Einmal-Freigaben. Der schwerste Zustand (`sperreFehlgeschlagen`)
ist eigens im Rückgabewert ausgewiesen: Abweichung **und** Sperre nicht
schreibbar — dort muss ein Mensch von Hand stoppen.

Die Datei **heilt nicht**: sie setzt kein `sent_at` nach, legt keine fehlende
Protokollzeile an, löscht keine doppelte. Testabdeckung:
`__tests__/pilot/post-send-verification.test.ts`.

### 6.12 Resend-Testmodus — wie man ihn nutzen KÖNNTE

Im Repo existiert **kein** Resend-Testmodus und **kein** Test-Sink. Der einzige
Testmodus im Haus ist der der DTA-/§-105-Pipeline (`{"testmodus": true}`) — der
hat mit Resend nichts zu tun.

Resend bietet reservierte Empfängeradressen (`delivered@resend.dev`,
`bounced@resend.dev`, `complained@resend.dev`), die den jeweiligen Zustellausgang
erzwingen, ohne dass eine Mail an einen Menschen geht. Sie ließen sich für einen
Ende-zu-Ende-Rauchtest verwenden, verlangen aber einen Klienten-Datensatz mit
dieser Adresse, weil `versendeRechnungPerEmail()` den Empfänger ausschließlich
aus `clients.email` zieht und das Send-Gate ihn gegen die Token-Zeile abgleicht.

**Nicht ausgeführt, nicht vorbereitet, nicht empfohlen ohne ausdrückliche
Freigabe** — der Auftrag verbietet Testversand, und die Kette ist über
`__tests__/notifications/kanaele-e2e-pglite.test.ts` und die PGlite-E2E-Ketten
bereits ohne Provider-Kontakt abgedeckt.

---

## TRACK 7 — CAMT FINAL PREPARATION

**Ergebnis: TECHNISCH BEREIT bis unmittelbar vor den Upload.** Ein Befund aus
Phase 8.2 (C-1) ist **weiterhin offen**. Es wurde kein Import ausgeführt.

### 7.1 Erzwingt `/api/billing/camt/import` den DRY_RUN?

**JA, fail-closed.** `app/api/billing/camt/import/route.ts:63-75`: `camtImportModus()`
wird gelesen, und bei `!modus.buchend` beantwortet die Route den Aufruf mit
`camtPreflight()` und **HTTP 200** (nicht 201 — „es wurde nichts angelegt";
ein 201 mit leerem Ergebnis wäre die stille Falschaussage, die der Modus
verhindern soll). Es entsteht kein Zahlungseingang, keine Zuordnung, kein
Klärfall, keine Rücklastschrift-Verarbeitung.

### 7.2 `CAMT_IMPORT_MODE`

| Frage | Antwort |
|---|---|
| Wo gelesen? | Ausschließlich `lib/billing/camt/camt-modus.ts` (rein, ohne DB). Aufrufer: die Import-Route und `pre-pilot-snapshot.ts`. |
| Wie gesetzt? | Umgebungsvariable. Aktuell **nicht gesetzt** (weder `.env.local` noch `.env`). |
| Fehlender Wert? | `DRY_RUN`, `buchend: false`, `gesetzt: false`. |
| Unbekannter Wert (`live`, `Live`, `true`)? | `DRY_RUN`, aber `wertGueltig: false` — ein Tippfehler geht **nicht** als bewusste Entscheidung durch. Groß-/Kleinschreibung zählt. |
| Scharf ab | Exakt `LIVE`. |

Anders als bei den Versand-Schaltern hängt hier bewusst **keine**
Umgebungstrennung dran: ein Trockenlauf ist überall harmlos, und der scharfe
Modus verlangt ohnehin eine hochgeladene Datei und einen angemeldeten Admin —
er kann nicht wie ein Cron von selbst losgehen.

### 7.3 `camt-pilot.ts` — `Object.freeze` verifiziert

`lib/pilot/camt-pilot.ts:97`

```
export const PILOT_QUELLE: Readonly<Record<string, string>> = Object.freeze({
  CAMT_IMPORT_MODE: PILOT_MODUS,   // 'DRY_RUN'
})
```

`camtPilotLauf()` übergibt `{ ...PILOT_QUELLE }` an `camtPreflight()` **statt**
`process.env`. Steht die echte Umgebungsvariable auf `LIVE`, ändert das an
diesem Lauf nichts — der Bericht meldet den Umgebungsstand nur zusätzlich als
Warnung.

Zusätzlich ein Selbstzweifel-Riegel (`:424-431`): meldet der Preflight trotz
fester Pilotquelle `buchend` oder einen anderen Modus, **wirft** der Lauf und
liefert gar keinen Bericht aus, statt einen mit falscher Kopfzeile.

Test: `__tests__/pilot/camt-pilot.test.ts:172-190` prüft `PILOT_QUELLE` und
belegt, dass `CAMT_IMPORT_MODE: 'LIVE'` in der Umgebung den Lauf nicht scharf
schaltet.

### 7.4 Was der DRY_RUN-Bericht zeigt

`POST /api/pilot/camt-dry-run` (Feldname `datei`, max. 10 MB, `abrechnung.lesen`).
JSON oder `?format=text` zum Ausdrucken.

Je Buchung eine Einordnung:

| Einordnung | Bedeutung |
|---|---|
| `MATCHED` | Würde scharf gebucht und zugeordnet (`wuerdeBuchen: true`) |
| `UNMATCHED` | Kein Treffer → würde Klärfall |
| `AMBIGUOUS` | Mehrere Kandidaten → würde Klärfall |
| `DUPLICATE` | Bereits verbucht oder Dublette **innerhalb derselben Datei** |
| `INVALID` | Scheitert an Währung/Format |
| `CROSS_TENANT_BLOCKED` | Referenz zeigt auf einen fremden Mandanten |

Dazu Betrag, Währung, Verwendungszweck, Rechnungsreferenzen und die Begründung
im Klartext. `gebucht` steht auf allen Posten fest auf `false`.

Der Textbericht enthält **keine vollständige IBAN und keine fremde
Mandantenkennung** — die Cross-Tenant-Prüfung liest bewusst nur
`organization_id` und gibt nie preis, welcher Mandant gemeint ist.

### 7.5 Freigegebener Ablauf

```
1. ECHTE BANKDATEI (camt.053)
2. POST /api/pilot/camt-dry-run        → schreibt nichts, PILOT_QUELLE fest
3. ERGEBNIS prüfen                     → Einordnung je Buchung, IBAN gekürzt
4. USER_APPROVAL                       ← ausdrücklich, durch einen Menschen
5. CAMT_IMPORT_MODE=LIVE setzen        (Vercel-Env)
6. POST /api/billing/camt/import       → bucht
7. CAMT_IMPORT_MODE zurücksetzen       ← Pflicht, nicht optional
```

Zu **Schritt 7**: `CAMT_IMPORT_MODE` ist der einzige Schalter der Kette, der
nach Gebrauch aktiv zurückgenommen werden muss. Er hat weder ein Ablaufdatum
noch eine Einmal-Semantik — anders als `pilot_send_gate`, das sich selbst
verbraucht. Bleibt er auf `LIVE` stehen, bucht der nächste Upload sofort scharf.

### 7.6 Befund C-1 aus Phase 8.2 — **weiterhin OFFEN**

Geprüft am Quelltext, nicht am alten Bericht: `app/api/billing/camt/import/route.ts`
ruft im **buchenden** Zweig weder `camtPreflight()` noch eine eigene
Cross-Tenant-Prüfung. Der Weg ist: Dateihash → Parser → Buchungshash-Dubletten →
`camt_imports` → je Buchung `zahlungseingaenge`-Insert → `matchBuchung()`.

Unverändert mitigiert: `matchBuchung(supabase, buchung, ze.id, organizationId)`
filtert nach `organization_id`, eine fremde Rechnungsnummer im Verwendungszweck
kann also **nicht** zu einer falschen Zuordnung führen — sie landet im Klärfall.

Was bleibt: Eine Buchung, die fachlich zu einem anderen Mandanten gehört, wird
als `zahlungseingaenge`-Zeile **dieses** Mandanten angelegt und erscheint dort
als offener Klärfall, statt vorab blockiert zu werden. Kein Geldfehler, aber
eine Zeile im falschen Haus.

**Einstufung unverändert MITTEL.** Für den Pilot beherrschbar, weil Schritt 2
des Ablaufs (Trockenlauf) `CROSS_TENANT_BLOCKED` explizit ausweist und ein
Mensch die Freigabe erteilt. **Empfehlung:** `camtPreflight()` auch im buchenden
Zweig vorschalten und bei `CROSS_TENANT_BLOCKED > 0` abweisen — dann fällt der
Schutz nicht weg, sobald jemand den Trockenlauf überspringt. Nicht in dieser
Sitzung geändert (Track 7 ist Dokumentation, kein Umbau).

### 7.7 Duplikat-Schutz CAMT

| Ebene | Wirkung |
|---|---|
| **Dateihash** SHA-256 über den XML-Inhalt, `camt_imports.quelldatei_hash` | Exakt dieselbe Datei ein zweites Mal → **409** |
| **Buchungshash** SHA-256 über Betrag, Währung, Daten, Zahler-IBAN, Zweck, EndToEndId, Buchungsreferenz → `zahlungseingaenge.quelldatei_hash` | Fängt **überlappende** Auszüge (camt.054-Avis + camt.053 derselben Periode, neu gezogener größerer Zeitraum). Alle Buchungen bekannt → 409 mit `dublettenUebersprungen`. |
| **Dubletten in derselben Datei** | Der Pilot meldet sie als `DUPLICATE` samt Zeilennummer der ersten Fundstelle — scharf scheitert die zweite Zeile am UNIQUE-Index und der ganze Auszug landet im Status `fehler`. |
| **Fail-closed** | Ist die Dublettenprüfung nicht lesbar, wird **geworfen** statt importiert. |

Weitere Riegel derselben Route, hier nur benannt: 20-MB-Grenze vor dem
Einlesen; „ganz oder gar nicht" (ein einziger Parse-Fehler weist den kompletten
Auszug ab, ein halb importierter Auszug ist nicht reparierbar); nur `BOOK`
(vorgemerkte `PDNG`/`INFO` werden nicht verbucht); ausgehende `DBIT`-Buchungen,
die keine Rücklastschrift sind, werden übersprungen statt per `Math.abs()` als
Eingang zu verbuchen.

---

## TRACK 8 — BUSINESS INPUT DOKUMENTATION

### 8.1 DATEV

**Eingabeort:** `/admin/datev` → Reiter **Konfiguration** (`app/admin/datev/page.tsx:417 ff.`).
Speichern über `POST /api/billing/datev/config`. Ablage:
`organizations.datev_config` (JSON). Der Export-Reiter zeigt einen Warnhinweis,
solange `beraternummer` leer ist (`:338`).

**Formate** (`lib/billing/datev/datev-config.ts:47-48`):

| Feld | Regel | Fehlermeldung |
|---|---|---|
| Beraternummer | `/^\d{1,7}$/` — 1–7 Ziffern | „Beraternummer muss 1-7 Ziffern sein (DATEV-Vorgabe)." |
| Mandantennummer | `/^\d{1,5}$/` — 1–5 Ziffern | „Mandantennummer muss 1-5 Ziffern sein (DATEV-Vorgabe)." |

**Ohne die Nummern:** `erstelleDatevExport()` bricht ab, **bevor irgendetwas
entsteht** (`lib/billing/datev/export-service.ts:90-92`):

```
DATEV-Konfiguration unvollstaendig. Fehlend: Beraternummer, Mandantennummer
```

Keine CSV, kein Datensatz in `datev_exports`. Beide werden **gemeinsam**
geprüft — eine allein genügt nicht.

**D3–D6: die tatsächlich einkompilierten Standardwerte** (`DEFAULT_CONFIG`,
`datev-config.ts:33-41` und `kontenrahmen.ts`) — abgelesen, nicht erfunden:

| ID | Frage | Aktueller Standardwert | Status |
|---|---|---|---|
| D1 | Beraternummer | `''` (leer) | **blockierend** |
| D2 | Mandantennummer | `''` (leer) | **blockierend** |
| D3 | Kontenrahmen | `SKR03` (zulässig: SKR03 \| SKR04) | unbestätigter Standard |
| D4 | Erlöskonto steuerfreie Pflege (§ 4 Nr. 16 UStG) | SKR03: **8120** „Steuerfreie Erloese Pflege" · SKR04: **4120** | unbestätigter Standard |
| D5 | Sachkontenlänge | `4` (zulässig: 4 \| 5) | unbestätigter Standard |
| D6 | Beginn Wirtschaftsjahr | `01-01` | unbestätigter Standard |

Nebenwerte derselben Konfiguration: `naechsteDebitorennummer: 10000`,
`erzeugerKuerzel: 'AE'`. Weitere Konten im SKR03-Satz: `8400` Erlöse 19 % USt,
`8100` Sonstige Erlöse, `8610` Mahngebühren-Erlöse, `4970` Nebenkosten
Geldverkehr (SKR04 entsprechend `4400` / `4100` / `4610`).

Ein **Standardwert ist keine Erfindung**: D3–D6 stammen aus dem
veröffentlichten SKR03/SKR04 und sind **unbestätigt** — nur die Kanzlei kann
sagen, ob sie für diesen Mandanten gelten. Geprüft wird im Code lediglich, dass
jedes Konto **aus einem definierten Vorrat** stammt, nicht ob es das richtige ist.
Eine falsche Sachkontenlänge lehnt DATEV erst beim Import ab.

**Blockiert den Rechnungspilot: NEIN.** Nachweisbar, nicht behauptet:
`__tests__/pilot/business-inputs.test.ts` liest die fünf Dateien des
Rechnungswegs (`invoice-engine`, `rechnung-preflight`, `rechnung-pilot`,
`rechnung-versand`, `rechnung-paket`) und stellt fest, dass keine davon
`billing/datev` importiert. Baut jemand eine Kontenprüfung in die Festschreibung
ein, wird der Test rot.

Ohne D1/D2 läuft **nicht**: DATEV-Buchungsstapel, Übergabe an die Kanzlei,
Stufe 8 der Money-Path-Abstimmung.

### 8.2 ChairMatch

**Eingabeort: nicht in diesem Repo.** ChairMatch ist ein eigenes Repo
(`/Users/work/chairmatch`) mit eigenem Supabase-Projekt (`pwdbjqfpgumyfktbfswg`).
Preise gehören in die Tabellen `protect_pricing` und `compliance_plans` dort.
Diese Sitzung hat **keine** Verbindung dorthin; `ermittleBusinessInputs()` meldet
die C-Punkte deshalb fest als `nicht_pruefbar` — das ist die ehrliche Antwort,
nicht `offen`.

**Template `docs/chairmatch-pricing-template.md` — geprüft, 74 Zeilen, enthält
keinen einzigen Preis.** Inhalt: Statusabsatz, Verweis auf die beiden
Migrationen (`20260824_pricing_schema.sql`, `20260826_pricing_gueltigkeit.sql`),
zwei Seed-Templates und das validierte Feldschema beider Tabellen.

Die Seed-Templates enthalten `<<<PLATZHALTER>>>`: läuft eine Datei ungefüllt,
bricht Postgres mit Syntaxfehler ab. **Fantasiepreise sind konstruktiv
ausgeschlossen.**

| ID | Offene Frage | Quelle |
|---|---|---|
| **C1** | Welche Beträge stehen in `protect_pricing` und `compliance_plans`? Beide Tabellen sind strukturell fertig und **leer**; die Werte der Entwurfsmigration 20260310 gelten ausdrücklich **nicht**. | Geschäftsführung |
| **C2** | Protect für alle vier Risikostufen (LOW/MED/HIGH/VERY_HIGH) oder nur HIGH/VERY_HIGH? Nicht verkaufte Stufen gehören **gestrichen**, nicht mit 0 befüllt — eine 0 heißt „gratis", nicht „gibt es nicht". | Geschäftsführung |
| **C3** | Netto oder brutto? Die Spalten heißen `*_cents` ohne Steuerkennzeichen — im Schema ist die Frage nicht beantwortet. | Geschäftsführung / Steuerkanzlei |
| **C4** | Bleibt es bei `one_time` / `yearly` / `monthly`? Ein weiterer Zyklus verlangt eine **Schemaänderung**, keine Datenpflege. | Geschäftsführung |
| **C5** | Gültigkeitsmigration (`effective_from`/`effective_to`) vor dem ersten Verkauf anwenden? Ohne sie überschreibt der Seed alte Preise und zu einem Vertrag von gestern lässt sich der damals gültige Preis nicht mehr feststellen. Solange beide Tabellen leer sind, ist der Schaden **null** — vorher billig, nachher teuer. | Geschäftsführung |

**Blockiert Alltagsengel: NEIN.** Anderes Repo, anderes Supabase-Projekt, kein
gemeinsamer Code. Derselbe Unabhängigkeitstest wie bei DATEV deckt das ab
(verbotene Import-Kennzeichen: `chairmatch`, `protect_pricing`, `compliance_plans`).

### 8.3 § 45a — Anerkennungsverfahren

**Stand laut Auftrag (Mail vom 26.08.2026):** Antrag **unvollständig**,
**1. Erinnerung** vom Landesamt für Pflege eingegangen.

**Keine externe Aktion durchgeführt** — auftragsgemäß wurde nichts eingereicht,
nachgereicht, beantwortet oder kontaktiert.

Was im Code davon abhängt (nur zur Einordnung, unverändert):

- `lib/abrechnung/readiness.ts:133` — ohne freigeschaltetes Bundesland:
  „In keinem Bundesland freigeschaltet — setzt die Anerkennung nach § 45a SGB XI
  voraus"
- `lib/abrechnung/externe-freigaben.ts:63` — „Anerkennung nach § 45a SGB XI im
  Bundesland nachweisen"
- `lib/go-live/status.ts:373` — Tarifverifikation verlangt den
  Anerkennungsbescheid bzw. die Vergütungsvereinbarung als Primärquelle;
  Preise werden **nicht geraten und nicht automatisch geändert**
- Freischaltung je Bundesland über `state_settings`

**Blockiert den Rechnungspilot: NEIN.** Der Pilot rechnet gegen **Privatkunden
per Rechnung** ab. § 45a gated die **Kassenabrechnung** (§ 45b, VP/KZP, § 105)
— ein anderer Weg, der ohnehin über weitere externe Voraussetzungen (ITSG-
Zertifikat, SFTP-Zugang, verifizierte Tarife) gesperrt ist.

**Hinweis zur Bundesland-Zuordnung:** Der Auftrag nennt Bayern (LfP), die
bestehende Tarif-/PLZ-Gatelogik im Code ist auf **Hessen** ausgelegt
(`lib/hessen-plz.ts`, Kassenabrechnung nur Hessen). Ob hier zwei Verfahren
parallel laufen oder eine Angabe nachzuziehen ist, kann diese Sitzung nicht
entscheiden — sie hat keinen Zugriff auf den Bescheidvorgang. **Als Frage an
die Geschäftsführung vermerkt, nicht selbst aufgelöst.**

---

## TRACK 9 — TESTS

**Ergebnis: EIN echter ungetesteter Geldpfad gefunden und geschlossen.
Zwei Tests ergänzt, kein einziger Test zum Zählen geschrieben.**

### Was geprüft wurde

Für jeden Riegel aus Track 6 und 7 wurde nach vorhandener Abdeckung gesucht:

| Riegel | Abdeckung | Ergebnis |
|---|---|---|
| Absender-Konstante, Namens-Policy | `resend-integration.test.ts:112-123` | abgedeckt |
| Provider-Zeitlimit, „2xx ohne ID", Statuscode-Erhalt | `resend-fehlerpfade.test.ts` | abgedeckt |
| `vorgang_art` / Wiederhersteller-Registrierung | `resend-fehlerpfade.test.ts:419-431` | abgedeckt |
| Fehlerklassifikation | `fehlerklassen.test.ts` | abgedeckt |
| Zustellspur-UNIQUE, Dublettenerkennung | `kanaele-e2e-pglite.test.ts:387-394` | abgedeckt |
| Ungeprüfte Resend-SDK-Aufrufer | `resend-aufrufer-regression.test.ts` (Scan über `app/` + `lib/`) | abgedeckt |
| Send-Gate, Einmal-Freigabe, Cross-Tenant-`invoice_id` | `send-gate.test.ts` | abgedeckt |
| Post-Send-Nachprüfung (8 Punkte) | `post-send-verification.test.ts` | abgedeckt |
| CAMT `PILOT_QUELLE` fest, LIVE wirkungslos | `camt-pilot.test.ts:172-190` | abgedeckt |
| CAMT fail-closed ohne `LIVE` | `camt-pipeline-pglite.test.ts:225` | abgedeckt |
| Preflight-Pflicht im Versandweg | `rechnung-preflight-pflicht.test.ts` | abgedeckt |
| DATEV/ChairMatch-Unabhängigkeit | `business-inputs.test.ts` | abgedeckt |
| **Resend-Idempotenzschlüssel** | **keine** | **LÜCKE** |

### Die Lücke, und warum sie zählt

`grep -rn "idempotenzSchluessel" __tests__/` lieferte **null Treffer**. Der
Schlüssel `rechnung:{invoiceId}` war von keinem Test berührt — obwohl er der
einzige Schutz gegen genau den Fall ist, für den das 20-Sekunden-Zeitlimit
überhaupt gebaut wurde:

> Resend antwortet nicht in 20 s → Versuch gilt als fehlgeschlagen (408,
> vorübergehend) → Wiederholungslauf sendet erneut → niemand weiß, ob der erste
> Auftrag beim Provider doch angenommen wurde.

`invoices.sent_at` hilft hier nicht (wurde nie gesetzt, der Versuch galt als
gescheitert). `pilot_send_gate` hilft nicht (der Wiederholungslauf ist kein
zweiter Erstversand). Der Zustellspur-Index greift erst *nach* dem Senden.
Bleibt der Idempotenzschlüssel — und der war ungeschützt. Fällt er weg oder
ändert sich seine Form, bleibt die Suite grün und der Schaden zeigt sich zuerst
beim Kunden im Posteingang: **zwei Rechnungen für dieselbe Leistung.**

### Was ergänzt wurde

`__tests__/billing/rechnung-versand.test.ts` — zwei Tests:

1. `sendet mit Idempotenzschluessel rechnung:{invoiceId}` — der Regelfall.
2. `laesst den Idempotenzschluessel beim Nachversand bewusst weg` — die
   Gegenprobe. Ein ausdrücklicher Nachversand **soll** eine zweite Mail
   erzeugen; mit Schlüssel würde Resend sie 24 Stunden lang verschlucken und
   der Kunde bekäme nichts, obwohl ein Mensch genau das angefordert hat.

Der zweite Test ist kein Beiwerk: ohne ihn ließe sich die Lücke „schließen",
indem man den Schlüssel bedingungslos setzt — und damit den gewollten
Nachversand kaputtmachen.

### Beleg, dass die Tests etwas halten

```
vitest run __tests__/billing/rechnung-versand.test.ts
  → 15 passed (vorher 13), Exit 0

Mutationsprobe: idempotenzSchluessel im Quelltext auf `undefined` gesetzt
  → 1 failed | 14 passed, Exit 1
  → Quelltext unverändert wiederhergestellt (verifiziert)
```

Die Tests sind nicht leer — sie fallen, wenn der Riegel fällt.

### Kein weiterer Test nötig

Für alle übrigen Punkte aus Tracks 6–8 gilt: **kein neuer Test erforderlich,
die kritischen Pfade sind abgedeckt.** Insbesondere wurde bewusst **kein** Test
geschrieben für:

- **Reply-To (R-1)** — der `replyTo`-Parameter selbst ist in
  `resend-integration.test.ts` abgedeckt; dass ihn niemand setzt, ist eine
  Feststellung über die Aufrufer, kein Fehlverhalten. Ein Test darauf würde den
  Ist-Zustand zementieren, nicht schützen.
- **Apex-SPF (R-2)** — DNS ist keine Repo-Eigenschaft; ein Test darüber wäre
  netzabhängig und flakey. Der lesende `scripts/verify-resend.mjs` deckt das ab.
- **C-1 (CAMT Cross-Tenant im Live-Import)** — hier fehlt eine **Prüfung im
  Code**, nicht ein Test über vorhandenes Verhalten. Ein Test, der den heutigen
  Zustand festschreibt, wäre schädlich. Der Test gehört zur Behebung, und die
  ist nicht Gegenstand dieser Sitzung.

---

## TRACK 10 — ZUSAMMENFASSUNG

### Neue Befunde

| ID | Track | Befund | Schwere | Status |
|---|---|---|---|---|
| **R-1** | 6 | `replyTo` wird von **keinem** Aufrufer gesetzt. Antworten laufen an `From` (`info@alltagsengel.care`) — die richtige Adresse; nur nicht je Mandant konfigurierbar. | NIEDRIG | Beobachtung, kein Handlungsbedarf vor dem Erstversand |
| **R-2** | 6 | Kein SPF-TXT auf dem Apex `alltagsengel.care`. SPF steht auf der Envelope-Domain `send.alltagsengel.care`, DMARC-Ausrichtung über DKIM, `p=reject` aktiv. | INFO | Kein Blocker; Härtungsoption |
| **T-1** | 9 | Resend-Idempotenzschlüssel war von keinem Test berührt — einziger Schutz gegen Doppelversand nach Zeitlimit. | war MITTEL | **GESCHLOSSEN** (2 Tests, Mutationsprobe bestanden) |

### Übernommene Befunde aus Phase 8.2

| ID | Befund | Schwere | Status |
|---|---|---|---|
| **C-1** | Cross-Tenant-Check fehlt im **buchenden** Zweig von `/api/billing/camt/import`. Preflight und Pilot prüfen es, der Live-Import nicht. Org-Filter beim Matching verhindert falsche Zuordnungen; die Zeile landet im Klärfall des falschen Mandanten statt blockiert zu werden. | MITTEL | **WEITERHIN OFFEN** — am Quelltext nachgeprüft, nicht aus dem Altbericht übernommen |

**Kein P0, kein P1.**

### Geänderte Dateien

| Datei | Änderung |
|---|---|
| `__tests__/billing/rechnung-versand.test.ts` | +2 Tests (Idempotenzschlüssel Regelfall + Nachversand-Gegenprobe) |

Sonst nichts. `lib/billing/versand/rechnung-versand.ts` wurde für die
Mutationsprobe kurzzeitig verändert und **verifiziert wiederhergestellt**
(`git status` zeigt die Datei unverändert).

> **Hinweis für die Dispatch-Sitzung:** `git status` weist zusätzlich eine
> **nicht von dieser Sitzung** stammende, unversionierte Datei aus:
> `scripts/verify-pilot-send-gate.mjs` (Tracks 1–5). `deploy.sh` nutzt
> `git add -A` und würde sie mitnehmen — vor dem Commit prüfen, ob das gewollt
> ist.

### BUSINESS_INPUT_REQUIRED

| ID | Frage | Quelle | Blockiert Erstversand? |
|---|---|---|---|
| D1 | Beraternummer der DATEV-Kanzlei (1–7 Ziffern) | Steuerkanzlei | **NEIN** — blockiert nur den DATEV-Export |
| D2 | Mandantennummer der DATEV-Kanzlei (1–5 Ziffern) | Steuerkanzlei | **NEIN** — dito |
| D3 | Kontenrahmen SKR03 (Standard) bestätigen? | Steuerkanzlei | NEIN |
| D4 | Erlöskonto steuerfreie Pflege — 8120 (SKR03) bestätigen? | Steuerkanzlei | NEIN |
| D5 | Sachkontenlänge 4 (Standard) bestätigen? | Steuerkanzlei | NEIN |
| D6 | Wirtschaftsjahresbeginn 01-01 bestätigen? | Steuerkanzlei | NEIN |
| C1–C5 | ChairMatch-Preise und Preisversionierung | Geschäftsführung | **NEIN** — anderes Repo, anderes Supabase-Projekt |
| — | § 45a: Bayern (LfP) **und/oder** Hessen? Die Code-Gates sind auf Hessen ausgelegt. | Geschäftsführung | NEIN (betrifft die Kassenabrechnung, nicht den Privatkunden-Pilot) |

**Der erste echte Rechnungsversand hängt an keiner dieser Angaben.**
Vollständig ohne sie lauffähig: Kunde anlegen → Leistung erfassen →
Leistungsnachweis unterschreiben → Rechnung erzeugen, prüfen, festschreiben →
16-Punkte-Preflight und Pilotprüfung → PDF erzeugen und per Resend versenden →
`invoice_email_log` → Kontoauszug im Trockenlauf einordnen → Zahlung über das
Allocation-Gate zuordnen → Mahnwesen-Trockenlauf → Money-Path-Abstimmung.

### EXTERN_BLOCKIERT

| Punkt | Was fehlt | Wer liefert | Wirkung |
|---|---|---|---|
| **§ 45a-Anerkennung** | Antrag unvollständig, 1. Erinnerung vom LfP (26.08.) | Landesamt für Pflege / Geschäftsführung | Kassenabrechnung (§ 45b, VP/KZP, § 105) gesperrt. Privatkunden-Rechnung **nicht** betroffen. |
| **ITSG-Zertifikat + SFTP-Zugang** | Zertifikat und Zugangsdaten | ITSG / Datenannahmestellen | § 105-Übertragung gesperrt; Erzeugung und Testmodus laufen |
| **Kassentarife** | Anerkennungsbescheid bzw. Vergütungsvereinbarung als Primärquelle | Pflegekassen / Landesverbände | Tarife bleiben `unverified` → Fail-Closed-Sperre im Rechnungsweg der Kasse |
| **DATEV D1/D2** | Berater- und Mandantennummer | Steuerkanzlei | DATEV-Export bricht ab, bevor eine CSV entsteht |
| **ChairMatch C1–C5** | Preisentscheidungen | Geschäftsführung | ChairMatch kann nichts verkaufen (beide Tabellen leer) |

### Gesamturteil

Die Versandkette (Resend) und die CAMT-Kette sind **technisch bis unmittelbar
vor die jeweilige menschliche Freigabe fertig**. Beide sind fail-closed und in
der Grundstellung stumm:

- `PILOT_ERSTVERSAND_FREIGEGEBEN` nicht gesetzt, `FIRST_REAL_INVOICE_APPROVED = false`
- `CAMT_IMPORT_MODE` nicht gesetzt → DRY_RUN
- `*_AUTOMATISCH`-Schalter nicht gesetzt

Was noch fehlt, ist in **beiden** Fällen dasselbe: eine ausdrückliche
Entscheidung eines Menschen. Kein Code-Schritt steht dazwischen.

**Status: READY_FOR_EXPLICIT_USER_APPROVAL** (unverändert gegenüber Phase 8.2 —
diese Sitzung hat die Aussage geprüft und einen Testschutz ergänzt, nicht den
Stand verändert).
