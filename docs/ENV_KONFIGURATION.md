# Umgebungsvariablen — Verzeichnis, Prüfung und die Geld-Schalter

Stand: 26.08.2026 (Phase 7) · Quelle der Wahrheit im Code: `lib/env/register.ts`,
Auswertung der Versand-Schalter: `lib/config/versand-flags.ts`,
Betriebsart des Kontoauszugsimports: `lib/billing/camt/camt-modus.ts`

Dieses Dokument erklärt drei Dinge:

1. was die beiden Versand-Schalter `RECHNUNGSVERSAND_AUTOMATISCH` und
   `MAHNVERSAND_AUTOMATISCH` genau tun,
2. wie `CRON_SECRET` verteilt ist,
3. wie die zentrale ENV-Prüfung arbeitet und warum sie manches *nicht*
   abbricht.

---

## 1. Die zwei Versand-Schalter

Beide sind **fail-closed**: nur die exakte Zeichenkette `'1'` schaltet ein.
Jeder andere Wert — `true`, `yes`, `on`, `ja`, `' 1'` mit Leerzeichen, ein
Leerstring oder das komplette Fehlen — bedeutet **aus**. Das ist Absicht: es
gibt keinen Tippfehler, der versehentlich Post an echte Kunden auslöst.

> **Seit Phase 7 werden beide zentral ausgewertet** — `lib/config/versand-flags.ts`.
> Kein Modul liest sie mehr direkt aus `process.env`. Drei Dinge sind dabei
> hinzugekommen:
>
> **a) Umgebungstrennung.** Eine Vercel-Variable, die für „All Environments"
> angelegt wird, steht auch in jedem Preview-Deployment und in jedem lokalen
> `vercel env pull`. Ohne diese Trennung hätte das Umlegen des Schalters für
> die Produktion **jeden Branch-Preview** anfangen lassen, echte Rechnungen zu
> verschicken — an dieselbe Produktionsdatenbank, mit demselben Resend-Schlüssel.
> Der Schalter wirkt jetzt nur im Produktionslauf (`VERCEL_ENV=production`).
> Für einen bewussten Test außerhalb: zusätzlich `VERSAND_NICHT_PRODUKTION_ERLAUBT=1`.
>
> **b) Ungültige Werte sind sichtbar.** `true` bedeutet weiterhin AUS — aber
> jetzt als eigener Befund (`aus_ungueltig`) mit lautem Protokolleintrag beim
> Start und im Ergebnis des Mahn-Cron. Vorher saß man vor einem System, das
> schwieg und nichts verschickte.
>
> **c) Audit.** Ein Wechsel zwischen „verschickt automatisch" und „verschickt
> nicht" landet als Zeile im `billing_audit_trail`
> (`entity_type='abrechnung_betriebsmodus'`, `action='versand_flag_stand'`) —
> **nur bei Änderung**, je Mandant. Nachträglich ist damit belegbar, ob ein
> Lauf vom 3. des Monats versendet hat.

### Die fünf Befunde

| Befund | Bedeutung |
|---|---|
| `aus_fehlt` | Nicht gesetzt — Normalzustand |
| `aus_explizit` | Steht auf `'0'` |
| `aus_ungueltig` | Gesetzt, aber weder `'1'` noch `'0'` → **Konfigurationsfehler** |
| `aus_umgebung` | Steht auf `'1'`, aber kein Produktionslauf und keine Ausnahme |
| `an` | Scharf |

### `RECHNUNGSVERSAND_AUTOMATISCH`

**Ausgewertet an genau einer Stelle** — `lib/config/versand-flags.ts`. Zwei
Routen fragen das Ergebnis ab (nie die Variable selbst, nie die Kern-Logik —
die Engine bekommt nur ein `autoVersand`-Flag übergeben):

| Datei | Ausdruck |
|---|---|
| `app/api/billing/invoices/[id]/freeze/route.ts` | `versandFlagsStand().rechnung.aktiv` |
| `app/api/billing/sammelrechnung/route.ts` | `festschreiben && flags.rechnung.aktiv` |

Dass keine dieser Routen einen zweiten, direkten Auswertungsweg daneben stellt,
hält `__tests__/security/rollen-angriffsvektoren.test.ts` fest.

**Was er steuert:** ob `freezeInvoice()` nach der Festschreibung
(`lib/billing/core/invoice-engine.ts:659`) zusätzlich
`versendeRechnungPerEmail()` aufruft — also das Belegpaket erzeugt und per
E-Mail an den Klienten schickt.

**Was passiert, wenn er NICHT gesetzt ist:**
Alles Übrige läuft unverändert. Die Rechnung wird festgeschrieben, bekommt
ihre Nummer, den Snapshot und die Prüfsumme; nur der E-Mail-Versand
unterbleibt. `versandStatus` bleibt `undefined`. Nachsenden ist jederzeit
möglich über `POST /api/billing/invoices/[id]/versenden`.

**Zusatzbedingung im Sammelrechnungslauf:** Der Schalter allein genügt dort
nicht — es muss zusätzlich `festschreiben: true` im Body stehen. Ein
`autoVersand` ohne Festschreibung wirft (`lib/billing/core/sammelrechnung.ts:700`).
Über den Body ist der Versand bewusst **nicht** steuerbar.

**Nebenwirkung, die man kennen muss:** Ein Versandfehler kippt die
Festschreibung *nicht*. Der Fehler wird protokolliert (`log.warn` /
`log.errorWithException`) und in `versandStatus` gemeldet, aber geschluckt.

### `MAHNVERSAND_AUTOMATISCH`

**Abgefragt an genau einer Stelle:** `app/api/cron/mahnlauf/route.ts` über
`versandFlagsStand().mahnung` (täglich 07:00 laut `vercel.json`). Erwähnt wird
er außerdem im Hinweistext unter `/admin/mahnwesen`.

**Was er steuert:** ob derselbe Cron-Lauf nach dem Eskalieren der Mahnstufen
auch `verarbeiteMahnQueue()` aufruft — also die in
`dunning_email_queue` liegenden Mahnschreiben tatsächlich verschickt
(inklusive `wiederholen: true` für fällige Fehlversuche).

**Was passiert, wenn er NICHT gesetzt ist:**
Der Mahnlauf eskaliert weiterhin die Stufen (14/28/42/56/70 Tage nach
Fälligkeit, höchstens eine Stufe je Rechnung und Lauf) und legt die
Mahnungen als PDF+E-Mail mit `status='wartend'` in die Queue. Verschickt
wird nichts. Die Antwort des Cron enthält dann ausdrücklich
`versand: { aktiv: false, hinweis: …, befund: … }`. Der Hinweistext kommt seit
Phase 7 aus der zentralen Auswertung und unterscheidet „nicht gesetzt" von
„ungültiger Wert" und „kein Produktionslauf"; vorher stand dort immer derselbe
Satz, auch wenn die Variable auf `true` stand.
Freigabe von Hand unter `/admin/mahnwesen`, bzw. `POST /api/billing/dunning/versand`.

### Setzen — was für einen kontrollierten Pilot nötig ist

Die Schalter sind **weiterhin bewusst NICHT gesetzt**. Beide lösen echte Post
an echte Kunden aus; das ist eine Geschäftsentscheidung, keine
Konfigurationsaufgabe. Was zum Umlegen gehört, steht hier vollständig — damit
niemand die halbe Liste abarbeitet.

#### Stufe 1 — erster begleiteter Rechnungsversand

```
vercel env add RECHNUNGSVERSAND_AUTOMATISCH production   # Wert: 1
```

Danach **Redeploy** (Environment-Variablen greifen erst im nächsten Deployment).

**Wichtig beim Anlegen:** Environment ausschließlich `Production` wählen, nicht
„All Environments". Die Umgebungstrennung in `versand-flags.ts` fängt den Fehler
zwar ab — aber eine Variable, die überall steht und nur an einer Stelle wirkt,
ist eine Falle für den Nächsten.

**Vorher zu klären, sonst geht der erste automatische Lauf an echte Kunden mit
unfertigen Daten raus:**

- **Testmandanten in der Produktions-Datenbank.** Der Mahnlauf iteriert über
  *alle* Organisationen. Der Rechnungs-Preflight (Punkt 13) blockiert einen
  Mandanten mit „Test" im Namen inzwischen von sich aus — aber der Befund
  gehört behoben, nicht umgangen.
- **Vorlagen gegengelesen** — Absender „Alltagsengel", nie ein persönlicher Name.
- **Zahlungsziele**: `due_date` war live durchgängig NULL, Standard sind 14 Tage.
  Ohne Fälligkeit sperrt das Mahn-Safety-Gate (Punkt 5) jede Mahnung.

**Zur Gegenprobe VOR dem Umlegen**, ohne etwas zu verschicken:

```
GET /api/billing/invoices/<id>/preflight
```

Liefert die 16 Punkte einzeln und beide Urteile (automatisch/manuell). Solange
dort nicht `READY_FOR_SEND` steht, verschickt der Automat auch mit gesetztem
Schalter nichts — er meldet den Grund.

#### Stufe 2 — erster begleiteter Mahnlauf

```
vercel env add MAHNVERSAND_AUTOMATISCH production        # Wert: 1
```

Erst sinnvoll, **nachdem** Stufe 1 mindestens einen belegten Versand hat
(`invoice_email_log` > 0). Eine Mahnung zu einer Rechnung, die nie zugestellt
wurde, ist ein Vorwurf ohne Grundlage.

Vorher `GET /api/billing/dunning/lauf?dryRun=1` ansehen: der Lauf zeigt, welche
Rechnungen eskalieren würden, ohne zu eskalieren.

#### Stufe 3 — erster Kontoauszugsimport

```
vercel env add CAMT_IMPORT_MODE production               # Wert: LIVE
```

**Standard ist DRY_RUN** — ohne diese Variable liest der Import die Datei
vollständig, prüft jede Buchung und ordnet sie ein, **bucht aber nichts**.
Vor dem Umlegen die echte Bankdatei durch den Trockenlauf schicken:

```
POST /api/billing/camt/preflight?format=text
```

Der Bericht beantwortet in der ersten Zeile, ob die Datei scharf importiert
werden darf. Solange dort ein Blocker steht, würde der scharfe Import
denselben Befund haben — nur ohne Vorwarnung.

#### Was NICHT gesetzt werden sollte

`VERSAND_NICHT_PRODUKTION_ERLAUBT` gehört **nicht** in die Produktion. Dort ist
die Variable wirkungslos und verschleiert nur, woran der Versand hängt; die
Startprüfung meldet sie als überflüssig.

## 2. `CRON_SECRET`

Ein Bearer-Token, kein Supabase-Key — es rotiert unabhängig.

**Schützt:** alle sieben Cron-Routen aus `vercel.json`
(`zustellung-retry`, `automatisierung`, `mahnlauf`, `drip`, `review-request`,
`indexnow`, `jahresuebertrag`) sowie `/api/drip` und
`/api/ops/workflow/processing`.

**Fail-closed:** Die Routen prüfen `!process.env.CRON_SECRET || authHeader !== …`.
Fehlt die Variable, antworten sie mit 401 — die Automatisierung steht still,
ohne dass irgendwo etwas rot wird.

**Stand nach Phase 5 — erledigt:**

| Ort | Stand |
|---|---|
| Vercel, Environment `Production` | war bereits gesetzt |
| GitHub Repository-Secret | **am 24.08.2026 gesetzt**, mit demselben Wert |

Der Wert wurde per `vercel env pull` gezogen und per `gh secret set` gesetzt,
ohne ihn in Protokoll, Chat oder Commit auszugeben; die Zwischendatei wurde
gelöscht.

**Verifiziert, nicht nur behauptet:** Lauf
[32716559957](https://github.com/YusufFerhatDemir/alltagsengel/actions/runs/32716559957)
des Workflows `Zustellung Retry` — Schritt „Lauf ausloesen" wurde ausgeführt
(vorher übersprang ihn der Workflow still) und
`https://alltagsengel.care/api/cron/zustellung-retry` antwortete mit HTTP 200:
`{"ok":true,"status":"fertig","metriken":{"verarbeitet":0,…,"organisationen":6}}`.

> Warum das der einzige belastbare Nachweis ist: Der Workflow ist absichtlich
> so gebaut, dass ein fehlendes Secret nur eine *Warnung* erzeugt und der Lauf
> **grün** endet (288 Läufe am Tag dürfen nicht rot sein). Die Läufe vor dem
> 24.08. waren also grün, ohne je etwas ausgelöst zu haben. Ein „grüner Lauf"
> ist hier kein Beweis — nur der Schritt „Lauf ausloesen" im Protokoll ist einer.

---

## 3. Zentrale ENV-Prüfung

`lib/env/register.ts` verzeichnet **jede** Umgebungsvariable mit
Notwendigkeit, Geltungsbereich (Server / Client / Plattform), Geheimhaltung
und Beschreibung. `lib/env/pruefung.ts` hält `process.env` dagegen.
Aufgerufen wird sie in `instrumentation.ts` — einmal pro Server-Prozess, vor
allem anderen.

### Was den Start abbricht

Nur zwei Dinge — beide bedeuten, dass die Anwendung nicht laufen *kann* oder
nicht laufen *darf*:

1. **Das Datenbank-Trio fehlt:** `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (oder Legacy `…_ANON_KEY`),
   `SUPABASE_SECRET_KEY` (oder Legacy `SUPABASE_SERVICE_ROLE_KEY`).
2. **Ein Geheimnis steht unter einem `NEXT_PUBLIC_`-Namen.** Next.js ersetzt
   solche Namen zur Build-Zeit textuell im Browser-Bundle — der Wert stünde
   im ausgelieferten JavaScript.

### Was den Start bewusst NICHT abbricht

Fehlende Produktions-Pflichten (`RESEND_API_KEY`, `CRON_SECRET`) werden laut
ins Protokoll geschrieben, aber sie brechen nicht ab. Eine Produktionsseite
wegen fehlendem Mailversand herunterzufahren wäre ein größerer Schaden als
der, den es verhindert. Das ist eine Entscheidung, kein halbes Fail-Fast —
begründet im Kopf von `lib/env/pruefung.ts`.

### Was im Build passiert

Bei `NEXT_PHASE=phase-production-build` wird nur gelesen und gewarnt, nie
geworfen. Ohne diese Ausnahme wäre jeder CI-Build rot: `.github/workflows/ci.yml`
setzt bewusst nur Platzhalter.

Der Produktions-Geltungsbereich wird an `VERCEL_ENV === 'production'`
festgemacht, **nicht** an `NODE_ENV` — letzteres steht auch beim `next build`
im CI auf `production`.

### Erzwungene Vollständigkeit

`__tests__/env/env-register.test.ts` scannt `app/`, `lib/`, `components/`,
`proxy.ts`, `next.config.ts` und die beiden `instrumentation`-Dateien nach
literalen `process.env.NAME`-Zugriffen und schlägt fehl, sobald einer davon
nicht im Verzeichnis steht. Ohne diesen Test wäre das Verzeichnis in drei
Monaten wieder unvollständig — und ein unvollständiges Verzeichnis ist
schlimmer als keines, weil es Vollständigkeit behauptet.

---

## 4. Nebenbefunde (nicht in Phase 5 geändert)

- **Drei parallele Basis-URLs.** `NEXT_PUBLIC_SITE_URL`,
  `NEXT_PUBLIC_APP_URL` und `NEXT_PUBLIC_BASE_URL` bezeichnen dieselbe Sache
  und werden je nach Datei unterschiedlich gelesen. Alle drei haben einen
  hartkodierten Rückfall, deshalb fällt es nicht auf — aber die Rückfälle sind
  nicht identisch: `app/api/referral/route.ts` fällt auf
  `https://www.alltagsengel.care` zurück, alle anderen auf
  `https://alltagsengel.care` (ohne `www`). Zusammenführen wäre eine eigene,
  kleine Aufgabe.
- **`SUPABASE_SECRET_KEY` und `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` sind in
  Vercel nicht gesetzt** — es laufen weiterhin die Legacy-Namen. Das ist
  zulässig (die Fallback-Kette deckt beides ab) und Teil der laufenden
  Supabase-Key-Migration.
