# Umgebungsvariablen — Verzeichnis, Prüfung und die zwei Versand-Schalter

Stand: 24.08.2026 · Quelle der Wahrheit im Code: `lib/env/register.ts`

Dieses Dokument erklärt drei Dinge:

1. was die beiden Versand-Schalter `RECHNUNGSVERSAND_AUTOMATISCH` und
   `MAHNVERSAND_AUTOMATISCH` genau tun,
2. wie `CRON_SECRET` verteilt ist,
3. wie die zentrale ENV-Prüfung arbeitet und warum sie manches *nicht*
   abbricht.

---

## 1. Die zwei Versand-Schalter

Beide sind **fail-closed**: der Code prüft auf die exakte Zeichenkette `'1'`.
Jeder andere Wert — `true`, `yes`, `on`, `ja`, ein Leerstring oder das
komplette Fehlen — bedeutet **aus**. Das ist Absicht: es gibt keinen
Tippfehler, der versehentlich Post an echte Kunden auslöst.

### `RECHNUNGSVERSAND_AUTOMATISCH`

**Gelesen an genau zwei Stellen** (beide in Routen, nie in der Kern-Logik —
die Engine bekommt nur ein `autoVersand`-Flag übergeben):

| Datei | Zeile | Ausdruck |
|---|---|---|
| `app/api/billing/invoices/[id]/freeze/route.ts` | 62 | `process.env.RECHNUNGSVERSAND_AUTOMATISCH === '1'` |
| `app/api/billing/sammelrechnung/route.ts` | 103 | `festschreiben && process.env.RECHNUNGSVERSAND_AUTOMATISCH === '1'` |

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

**Gelesen an genau einer Stelle:** `app/api/cron/mahnlauf/route.ts:53`
(täglich 07:00 laut `vercel.json`). Erwähnt wird er außerdem im Hinweistext
unter `/admin/mahnwesen`.

**Was er steuert:** ob derselbe Cron-Lauf nach dem Eskalieren der Mahnstufen
auch `verarbeiteMahnQueue()` aufruft — also die in
`dunning_email_queue` liegenden Mahnschreiben tatsächlich verschickt
(inklusive `wiederholen: true` für fällige Fehlversuche).

**Was passiert, wenn er NICHT gesetzt ist:**
Der Mahnlauf eskaliert weiterhin die Stufen (14/28/42/56/70 Tage nach
Fälligkeit, höchstens eine Stufe je Rechnung und Lauf) und legt die
Mahnungen als PDF+E-Mail mit `status='wartend'` in die Queue. Verschickt
wird nichts. Die Antwort des Cron enthält dann ausdrücklich
`versand: { aktiv: false, hinweis: 'MAHNVERSAND_AUTOMATISCH ist nicht gesetzt — Queue wurde nur befüllt.' }`.
Freigabe von Hand unter `/admin/mahnwesen`, bzw. `POST /api/billing/dunning/versand`.

### Setzen — Möglichkeiten und Stand

Setzbar wären beide über die Vercel-CLI (`vercel env add <NAME> production`,
Wert über stdin). Der Zugang dafür ist in dieser Umgebung vorhanden
(`vercel whoami` → angemeldet, Projekt `alltagsengel` verknüpft).

**Sie sind trotzdem bewusst NICHT gesetzt worden.** Der Auftrag für Phase 5
lautete, sie zu *dokumentieren* und die Setzbarkeit zu prüfen — nicht, sie
umzulegen. Beide Schalter lösen echte Post an echte Kunden aus; das ist eine
Geschäftsentscheidung, keine Konfigurationsaufgabe. Zum Umlegen genügt:

```
vercel env add RECHNUNGSVERSAND_AUTOMATISCH production   # Wert: 1
vercel env add MAHNVERSAND_AUTOMATISCH production        # Wert: 1
```

anschließend ein Redeploy (Environment-Variablen greifen erst im nächsten
Deployment).

**Vorher zu klären — sonst geht der erste automatische Lauf an echte Kunden
mit unfertigen Daten raus:**

- Die Testmandanten in der Produktions-Datenbank. Der Mahnlauf iteriert über
  **alle** Organisationen.
- Rechnungs- und Mahnvorlagen einmal gegengelesen (Absender „Alltagsengel", nie
  ein persönlicher Name).
- Die Zahlungsziele: `due_date` war live durchgängig NULL, Standard sind 14 Tage.

---

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
