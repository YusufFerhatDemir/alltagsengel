# Phase 8.3 — Tracks 1–5

**Stand:** 2026-08-27
**Commit-Basis bei Beginn:** `d534383`
**Gesamturteil:** `NOT_READY_FOR_LIVE_PILOT` — ein **P0** aus Track 2 ist offen.

---

## Kurzfassung

| Track | Gegenstand | Ergebnis |
|---|---|---|
| 1 | Source of Truth | **GEKLÄRT** — kein echter Widerspruch, Ursache war ein stehengebliebener Git-Lock |
| 2 | Pilot Send Gate | **P0 — NICHT LIVE.** Beide Tabellen fehlen in der Produktionsdatenbank |
| 3 | Pilot-Rechnungsworkflow | 12 von 15 Schritten verdrahtet, **2 bewusst offen**, **1 unbeabsichtigt offen** |
| 4 | `/admin/pilot` | 8 von 11 Punkten waren vorhanden, **3 nachgerüstet** |
| 5 | Flag-Safety | **SAFE** — die Variable kann für sich genommen keinen Versand auslösen |

**Der wichtigste Befund:** Der Phase-8.2-Report meldet die Migration
`20261005000000_pilot_send_gate.sql` als **LIVE**. Sie ist es nicht. Zwei
unabhängige Prüfwege sagen übereinstimmend, dass beide Tabellen fehlen.
Damit ist die Aussage „letzter technischer Blocker entfallen" aus Phase 8.2
zurückzunehmen.

---

## Track 1 — Source of Truth

```
CODE_HEAD=d5343832772a1e58a806d0369ec8f895d601a530
ORIGIN_MAIN=d5343832772a1e58a806d0369ec8f895d601a530
LAST_CODE_COMMIT=d6d4f1f01f832fde98baffd1eff8970f316dab30
CI=grün (Lauf vom 2026-08-26 17:43:30Z auf d534383)
```

### Was der gemeldete Widerspruch war

Der vorige Report nannte `CODE_HEAD=d6d4f1f` bei `ORIGIN_MAIN=d534383`. Beim
Nachmessen zeigte sich: **es gab nie eine Divergenz.** `git ls-remote` lieferte
von Anfang an `d534383` — denselben Wert wie der lokale `HEAD`.

Die Ursache lag im lokalen Ref-Cache: `.git/refs/remotes/origin/main.lock`
(0 Byte, vom 26.08. 19:42) blockierte jede Aktualisierung von
`refs/remotes/origin/main`. `git fetch` meldete das auch:

```
! d6d4f1f..d534383  main -> origin/main  (unable to update local ref)
```

`git rev-parse origin/main` gab deshalb weiter den veralteten Wert `d6d4f1f`
aus. **Gelöst:** Lock entfernt, neu gefetcht, `HEAD` und `origin/main` stehen
identisch, `git rev-list --left-right --count` meldet `0 0`.

> **Merksatz:** `git rev-parse origin/main` liest einen *lokalen Cache*.
> Die Remote-Wahrheit steht in `git ls-remote`. Wo beide auseinanderlaufen,
> ist nicht der Remote falsch, sondern der Cache alt — und ein stehengebliebener
> `.lock` ist die häufigste Ursache.

### Code-Commits vs. Docs-Nachzug

| Commit | Dateien | davon Nicht-Docs | Art |
|---|---|---|---|
| `d534383` | 1 | 0 | **reiner Docs-Nachzug** |
| `d6d4f1f` | 8 | 3 | **Code** (`app/admin/pilot/page.tsx`, `lib/billing/datev/datev-config.ts`, `lib/pilot/pilot-phasen.ts`) |
| `5019ac4` | 2 | 0 | reiner Docs-Nachzug |
| `ae080be` | 2 | 0 | reiner Docs-Nachzug |
| `f4ded2a` | 21 | 19 | Code (Phase 8, Tracks 5–10) |

Die Docs-Nachzug-Konvention dieses Projekts: der Report eines Blocks trägt
den Commit-Anker des Code-Commits, kann aber selbst erst danach geschrieben
werden. Der Nachzug-Commit ändert dann ausschließlich `docs/`. **Ein
`CODE_HEAD`, der auf einen reinen Docs-Commit zeigt, ist deshalb normal** —
der laufende Code ist derselbe wie bei `LAST_CODE_COMMIT=d6d4f1f`.

Für Vercel heißt das: eine Bereitstellung aus `d6d4f1f` und eine aus `d534383`
führen **denselben Anwendungscode** aus. Die früher gemeldete Differenz
zwischen `VERCEL_PRODUCTION=d6d4f1f` und `ORIGIN_MAIN=d534383` war also auch
inhaltlich folgenlos — sie unterschieden sich um genau eine Markdown-Datei.

---

## Track 2 — Pilot Send Gate: P0, NICHT LIVE

Neues Prüfwerkzeug: **`scripts/verify-pilot-send-gate.mjs`** (rein lesend,
26 Prüfpunkte, Exit-Code als Urteil).

### Ergebnis

```
0/26 Prüfpunkte erfüllt
```

Beide Tabellen fehlen in der Produktionsdatenbank:

```
to_regclass('public.pilot_send_gate')     → NULL
to_regclass('public.pilot_versand_sperre') → NULL
```

### Gegenprobe — das Werkzeug ist nicht das Problem

Bevor dieser Befund gemeldet wird, wurde das Prüfwerkzeug selbst geprüft:

| Kontrolle | Ergebnis |
|---|---|
| Datenbank / Rolle | `postgres` / `service_role` |
| `to_regclass('public.invoices')` | `invoices` ✓ |
| `to_regclass('public.camt_imports')` | `camt_imports` ✓ |
| Tabellen in `public` gesamt | **308** |
| Tabellen mit Präfix `pilot%` | **KEINE** |
| Zweiter Weg: PostgREST `GET /rest/v1/pilot_send_gate` | `HTTP 404 PGRST205 — Could not find the table` |

Das Orakel findet alles andere. Zwei voneinander unabhängige Wege — der
Systemkatalog und die REST-Schnittstelle — sagen dasselbe.

### Warum ich es nicht selbst anwenden kann

```
has_schema_privilege('service_role','public','CREATE') → f
pg_has_role('service_role','postgres','USAGE')         → f
```

`service_role` darf in diesem Projekt kein DDL. Der Weg über
`public._run_sql` steht offen, führt aber nur Anweisungen aus, die die Rolle
ohnehin ausführen dürfte — `CREATE TABLE` gehört nicht dazu.

**Status: `EXTERN_BLOCKIERT`.** Die Migration muss im Supabase-SQL-Editor
angewendet werden; das kann in dieser Umgebung niemand außer dem
Projektinhaber.

### Was das für den Pilotbetrieb bedeutet

| Wirkung | Bewertung |
|---|---|
| Die Einmal-Freigabe lässt sich nicht ausstellen | `erzeugeSendeToken()` schlägt beim `insert` fehl → `anlage_fehlgeschlagen` |
| Die beiden UNIQUE-Riegel gegen Doppelversand existieren nicht | Sie sind der einzige Doppelversand-Schutz **auf Datenbankebene** |
| Die Versandsperre nach abweichender Nachprüfung kann nicht gesetzt werden | `pilot_versand_sperre` fehlt |
| Das Control Center zeigt es korrekt an | Phase `APPROVAL` steht auf `BLOCKED` mit dem Hinweis auf genau diese Migration — **nicht** auf „0 Freigaben" |

Der letzte Punkt ist die gute Nachricht: das Dashboard verdeckt den Zustand
nicht. Der Code hat diesen Fall vorgesehen (`lib/pilot/pilot-phasen.ts`
misst `pilot_send_gate` getrennt, damit ein Fehler dort nicht die übrigen
acht Phasen mitreißt).

### Nach dem Anwenden

`node scripts/verify-pilot-send-gate.mjs` — erwartet wird `26/26` und
Exit-Code 0. Geprüft werden Existenz, RLS, alle CHECK-Constraints
(`betrag_cents > 0`, `preflight_status = 'READY_FOR_SEND'`,
`pilot_send_gate_nicht_beides`, `pilot_send_gate_gueltigkeit`), beide
UNIQUE-Teilindizes **samt ihrer WHERE-Klauseln**, beide RLS-Policies je
Tabelle (Admin permissiv, `org_fence` **restriktiv**), alle vier
Fremdschlüssel, die Nullability von `invoice_id` in beiden Tabellen und der
Zeilenstand 0.

---

## Track 3 — Pilot-Rechnungsworkflow: Kettenprüfung

Es gibt **0** unversendete festgeschriebene Rechnungen (live gemessen), also
Code-Review statt Durchlauf. Keine Fantasie-Rechnung angelegt.

| # | Schritt | Verdrahtet? | Ort |
|---|---|---|---|
| 1 | Kunde anlegen | ✅ | `POST /api/personal/stammdaten`, `/admin/kunden` |
| 2 | Leistung erfassen | ✅ | `service_records` |
| 3 | Rechnung als DRAFT | ✅ | `lib/billing/core/invoice-engine.ts` |
| 4 | Festschreiben (`frozen_at`) | ✅ | `freezeInvoice()` |
| 5 | Preflight 16 + 3 Pilotpunkte | ✅ | `lib/billing/preflight/rechnung-preflight.ts` + `lib/pilot/rechnung-pilot.ts` |
| 6 | PDF (`erzeugeRechnungsPaket`) | ✅ | `lib/billing/versand/rechnung-versand.ts:205` |
| 7 | Empfänger-E-Mail | ✅ | Preflight-Punkt 3 |
| 8 | Pilot-Bewertung | ✅ | `GET /api/billing/invoices/[id]/pilot` |
| 9 | Token erzeugen | ✅ Code / ⛔ DB | `POST /api/billing/invoices/[id]/freigabe` — **scheitert, solange Track 2 offen ist** |
| 10 | USER_APPROVAL | ✅ | manuell, `PILOT_ERSTVERSAND_FREIGEGEBEN` + Route |
| 11 | **Token-Verbrauch** | ❌ **BEWUSST_OFFEN** | `verbraucheSendeToken()` wird von **keiner** Route gerufen |
| 12 | Einzelversand | ✅ | `POST /api/billing/invoices/[id]/versenden` |
| 13 | Resend-Antwort | ✅ | `sendRawEmail()` |
| 14 | **Provider-Nachprüfung (8 Punkte)** | ❌ **UNBEABSICHTIGT OFFEN** | `pruefeNachVersand()` wird von **keiner** Route gerufen |
| 15 | `invoice_email_log` | ✅ | `rechnung-versand.ts:391` |
| 16 | `billing_audit_trail` | ✅ | `logBillingAction()` |
| 17 | `sent_at` gesetzt | ✅ | `rechnung-versand.ts:299` |

### Befund T3-1 — Token → Versand: BEWUSST_OFFEN

`pruefeSendeToken()` und `verbraucheSendeToken()` haben außerhalb ihrer
Testsuite und des Barrel-Exports **keinen einzigen Aufrufer**. Die
Versandroute (`app/api/billing/invoices/[id]/versenden/route.ts`) importiert
`send-gate` nicht und nimmt kein Token entgegen.

Der Phase-8-Report benennt das als Absicht („Verdrahtung in den Versandweg
bewusst nicht gebaut"). Der Auftrag für Phase 8.3 sagt ausdrücklich: **nicht
bauen**, das ist eine `USER_APPROVAL`-Entscheidung. Ich habe sie nicht gebaut.

**Was daraus praktisch folgt — und in Phase 8.2 nicht steht:** Der
Versandweg ist heute **nicht durch das Pilot-Gate geschützt**. Ein Nutzer mit
`abrechnung.schreiben` löst mit einem `POST` auf die Versenden-Route einen
echten Versand aus, ohne Token, ohne `PILOT_ERSTVERSAND_FREIGEGEBEN`, ohne
`FIRST_REAL_INVOICE_APPROVED`. Was ihn heute aufhält, ist ausschließlich:
Rolle, Mandantenzaun, Status, `frozen_at`, der 16-Punkte-Preflight und ein
gesetzter `RESEND_API_KEY`.

Das ist als Zustand vertretbar — die Kette hatte diesen Schutz auch vor
Phase 8 nicht. Es ist **nicht** vertretbar, das Send-Gate für einen aktiven
Schutz zu halten. **Es ist heute Infrastruktur ohne Konsument.**

### Befund T3-2 — Nachprüfung nach Versand: UNBEABSICHTIGT OFFEN

`lib/pilot/post-send-verification.ts` (537 Zeilen, 8 Prüfpunkte) wird von
**keiner** Route und keinem Modul gerufen — nur vom Barrel-Export. Damit
läuft die Nachprüfung nach einem Versand nie, und in der Folge auch
`entwerteAlleOffenenTokens()` nicht.

Anders als T3-1 ist das in keinem Report als Absicht dokumentiert. Da es
denselben Verdrahtungspunkt betrifft (den Versandweg), wird es hier als
`BEWUSST_OFFEN` **mitverwaltet**, nicht eigenmächtig geschlossen — ein
Nachprüfungslauf, der eine Versandsperre setzt, greift in denselben Pfad ein,
den der Auftrag ausdrücklich der Nutzerentscheidung vorbehält.

### Befund T3-3 — irreführender Kommentar (GERING)

`app/api/billing/invoices/[id]/freigabe/route.ts:16` schreibt: *„Der Versand
selbst ist ein eigener, getrennter Aufruf, der das Token mitbringen muss."*
Das beschreibt die Absicht, nicht den Code — der Versandweg verlangt kein
Token. Der Satz sollte beim Schließen von T3-1 wahr werden oder vorher
umformuliert. Nicht geändert, weil er zur selben Entscheidung gehört.

---

## Track 4 — `/admin/pilot`

| # | Geforderter Punkt | Vorher | Jetzt |
|---|---|---|---|
| 1 | Production Commit + CI | ❌ | ✅ **neu** (Commit gemessen; CI bleibt bewusst außen, s. u.) |
| 2 | Supabase-Status | ⚠️ nur Env-Existenz | ✅ **erweitert** um die Projektkennung |
| 3 | Send Gate (Tokens, Sperren) | ✅ | ✅ |
| 4 | Versandflags | ✅ | ✅ |
| 5 | Unversendete Rechnungen | ✅ | ✅ |
| 6 | `NO_PILOT_INVOICE — ACTION_REQUIRED: …` | ❌ | ✅ **neu** |
| 7 | Kandidat: Kunde, Empfänger, Betrag, PDF | ❌ | ✅ **neu** |
| 8 | Resend-Status | ⚠️ nur im Snapshot | ✅ **verdrahtet** |
| 9 | Approval-Status offen/verbraucht/**verfallen** | ⚠️ ohne „verfallen" | ✅ **erweitert** |
| 10 | Send-Status (`invoice_email_log`) | ✅ | ✅ |
| 11 | CAMT (`camt_imports`, DRY_RUN) | ✅ | ✅ |

### Neu: `lib/pilot/pilot-kandidat.ts`

Beantwortet die Frage, die eine Zählung nicht beantwortet: **welche** Rechnung
trägt den Erstversand, an **wen**, über **welchen Betrag**.

- Deterministische Auswahl (älteste zuerst, `order` + `limit 1`) — zwei
  Aufrufe hintereinander zeigen auf dieselbe Rechnung. Ohne die Sortierung
  entschiede die Speicherreihenfolge, und die ändert sich beim ersten UPDATE.
- Vier Zustände statt zwei: `KANDIDAT_VORHANDEN`, `NO_PILOT_INVOICE`,
  `BEREITS_VERSENDET`, `NICHT_MESSBAR`. **„Nichts da" und „nicht lesbar" sind
  getrennt** — sie führen zu entgegengesetzten nächsten Schritten, und der
  zweite Fall ist der gefährlichere, weil eine kaputte Abfrage sonst wie
  Ordnung aussieht.
- Bei leerem Bestand: `NO_PILOT_INVOICE — ACTION_REQUIRED: CREATE_OR_SELECT_REAL_DRAFT_INVOICE`.
- Token-Zählung **dreiteilig**: offen / verbraucht / **verfallen**. Ein
  abgelaufenes Token sieht aus wie ein vorhandenes, ist aber keines — der
  Versand lehnt es mit `token_abgelaufen` ab.
- Der Pilot läuft für **höchstens eine** Rechnung. Die übrigen werden gezählt,
  nicht geprüft.

### Neu: `lib/pilot/laufzeit-herkunft.ts`

Welcher Commit misst hier gegen welche Datenbank. Bewusst **ohne**
`git HEAD`, `origin/main` und CI-Ausgang: ein Serverless-Lauf hat kein
Arbeitsverzeichnis, ein „gemessen" daneben wäre eine Erfindung. Wer die drei
braucht, nimmt `GET /api/pilot/snapshot?git=…&origin=…&ci=…`, wo sie als
`gemeldet` gekennzeichnet sind. Von `RESEND_API_KEY`, `CRON_SECRET` und den
Supabase-Schlüsseln steht nur, **ob** sie gesetzt sind — ein Test prüft, dass
kein Geheimniswert in der Antwort landet.

### Keine versteckte Automatik

`GET /api/admin/pilot` hat weiterhin **kein** POST/PUT/PATCH/DELETE. Beide
neuen Module führen ausschließlich `select` aus; ein Test prüft für **jeden**
protokollierten Aufruf, dass die Operation `select` ist und der
`organization_id`-Filter sitzt.

---

## Track 5 — `PILOT_ERSTVERSAND_FREIGEGEBEN`

### `PILOT_FLAG_SAFETY: SAFE`

| Frage | Antwort |
|---|---|
| **1. Wo gelesen?** | Genau einer Stelle: `lib/pilot/send-gate.ts:97` in `erstversandFreigabe()`. `lib/env/register.ts` beschreibt sie nur. |
| **2. Was passiert bei `1`?** | `erstversandFreigabe()` liefert `freigegeben: true`. Das erlaubt **ausschließlich**, dass `erzeugeSendeToken()` und `pruefeSendeToken()` nicht sofort mit `keine_freigabe` abbrechen. |
| **3. Reicht sie allein zum Versand?** | **Nein.** Sie ist am Versandweg **überhaupt nicht beteiligt** — `rechnung-versand.ts` liest sie nicht. |
| **4. Braucht es zusätzlich Rechnung + Token?** | Für die **Freigabe** ja: `erzeugeSendeToken()` verlangt eine konkrete `invoiceId`, führt den Piloten selbst aus und schreibt nur bei `READY_FOR_SEND`. Für den **Versand** ist beides heute nicht erforderlich (Befund T3-1). |
| **5. Kann ein Cron dadurch senden?** | **Nein.** Keine der sieben Cron-Routen liest die Variable; ein Test prüft das durch Quelltext-Scan über `app/api/cron`. |
| **6. Verhältnis zu `RECHNUNGSVERSAND_AUTOMATISCH`?** | Getrennte Module, nie miteinander verrechnet. `RECHNUNGSVERSAND_AUTOMATISCH` steuert `autoVersand` nach dem Festschreiben; `PILOT_ERSTVERSAND_FREIGEGEBEN` steuert die Token-Ausstellung. Ein Test prüft, dass `send-gate.ts` die Versandschalter nicht erwähnt. |
| **7. Verhältnis zu `FIRST_REAL_INVOICE_APPROVED`?** | Gleichrangiges ODER: die Konstante (`false`, einkompiliert) wird zuerst geprüft, dann die Variable. Die Konstante zu ändern erzeugt einen Commit im Diff; die Variable erlaubt dasselbe ohne Deployment. |

### Warum SAFE und nicht UNSAFE

Der Auftrag verlangt eine Härtung, falls die Variable **allein** zum Versand
reicht. Das ist nicht der Fall — sie ist vom Versandweg vollständig
entkoppelt und kann dort nichts auslösen.

**Die Lücke liegt in der anderen Richtung** und ist bereits als T3-1
protokolliert: der Versandweg ist *durch gar nichts* aus dem Pilot-Gate
geschützt. Diese Lücke schließt man nicht, indem man die Flag-Auswertung
verschärft — sondern indem man Schritt 11 der Kette verdrahtet, und das ist
ausdrücklich eine Nutzerentscheidung.

### Neu: `__tests__/pilot/erstversand-flag-safety.test.ts`

12 Tests, die die Architekturaussage festnageln — insbesondere die drei
Quelltext-Scans, die anschlagen, sobald jemand die Variable **zusätzlich**
irgendwo auswertet und sie damit zu einem zweiten, schwächeren Versandschalter
macht. Das ist die gefährliche Änderung, nicht das Lockern des Werts selbst.

---

## Geänderte und neue Dateien

| Datei | Art |
|---|---|
| `lib/pilot/pilot-kandidat.ts` | **neu** — Kandidatenfrage, `NO_PILOT_INVOICE` |
| `lib/pilot/laufzeit-herkunft.ts` | **neu** — Commit/Umgebung/Projekt, ohne Geheimnisse |
| `scripts/verify-pilot-send-gate.mjs` | **neu** — 26 Live-Prüfpunkte, rein lesend |
| `__tests__/pilot/pilot-kandidat.test.ts` | **neu** — 17 Tests |
| `__tests__/pilot/laufzeit-herkunft.test.ts` | **neu** — 12 Tests |
| `__tests__/pilot/erstversand-flag-safety.test.ts` | **neu** — 12 Tests |
| `app/api/admin/pilot/route.ts` | Kandidat + Herkunft verdrahtet |
| `app/admin/pilot/page.tsx` | Abschnitt 0 (Kandidat) + Herkunftszeile |
| `lib/pilot/index.ts` | Barrel-Export ergänzt |

---

## Prüfläufe

| Lauf | Ergebnis |
|---|---|
| `npx tsc --noEmit` | **0 Fehler**, Exit 0 |
| `vitest run __tests__/pilot __tests__/config __tests__/security/rollen-angriffsvektoren` | **583/583 grün**, 17 Dateien, Exit 0 |
| `node scripts/verify-pilot-send-gate.mjs` | **0/26**, Exit 1 — der P0 aus Track 2 |
| CI auf `d534383` | grün |

`tsc` und `vitest` wurden getrennt ausgeführt (OOM-Vorgabe).

---

## Live-Betriebslage (gemessen 2026-08-27)

| Kennzahl | Wert |
|---|---|
| Rechnungen gesamt | 3 |
| davon festgeschrieben (`frozen_at`) | **0** |
| davon mit `sent_at` | 3 |
| **unversendet + festgeschrieben** | **0** |
| Statusverteilung | `sent=1`, `disputed=1`, `paid=1` |
| `invoice_email_log` | **0** |
| `billing_audit_trail` | 12 |
| `camt_imports` | 0 |
| `zahlungseingaenge` | 0 |
| aktive Klienten | 4 (3 mit E-Mail) |

**Bestätigt die Seed-These aus Phase 8.2 und schärft sie:** alle drei
Rechnungen tragen `sent_at`, aber **keine** trägt `frozen_at`. Über den
Versandweg ist dieser Zustand nicht erreichbar — `versendeRechnungPerEmail()`
bricht ohne `frozen_at` mit „übersprungen" ab. Diese `sent_at`-Werte können
also **nicht** aus einem Versand stammen. Zusammen mit `invoice_email_log = 0`
ist damit belegt: **es wurde nie eine echte Rechnung per E-Mail versendet.**

---

## Sicherheitsstand — unverändert

| Schalter | Wert |
|---|---|
| `RECHNUNGSVERSAND_AUTOMATISCH` | **nicht gesetzt** |
| `MAHNVERSAND_AUTOMATISCH` | **nicht gesetzt** |
| `CAMT_IMPORT_MODE` | **nicht gesetzt** (= DRY_RUN) |
| `PILOT_ERSTVERSAND_FREIGEGEBEN` | **nicht gesetzt** |
| `FIRST_REAL_INVOICE_APPROVED` | **`false`** (einkompiliert) |

## REAL_ACTIONS_EXECUTED: NONE

Keine Rechnung versendet. Keine Mahnung gesendet. Kein Freigabe-Token
erzeugt. Keine Versandsperre gesetzt. Keine Bankdatei importiert. Keine
Zahlung gebucht. Kein Kunde angelegt. Kein Flag aktiviert. Kein Preis
festgelegt. Kein DDL ausgeführt. Sämtliche Datenbankzugriffe dieser Phase
waren Leseabfragen; die Ergebnisse kamen über `RAISE EXCEPTION` zurück, was
die Transaktion zusätzlich zurückrollt.

---

## Offene Punkte

| # | Punkt | Schwere | Zuständig |
|---|---|---|---|
| P0-1 | Migration `20261005000000_pilot_send_gate.sql` anwenden | **P0** | **Nutzer** (SQL-Editor — `service_role` darf kein DDL) |
| T3-1 | Token → Versandweg verdrahten | offen | **Nutzer** (`USER_APPROVAL`) |
| T3-2 | `pruefeNachVersand()` nach dem Versand aufrufen | offen | **Nutzer** (gehört zu T3-1) |
| T3-3 | Kommentar in `freigabe/route.ts:16` | gering | mit T3-1 |
| B-1 | Pilotrechnung erzeugen (Kunde → Leistung → Rechnung → festschreiben) | Geschäftshandlung | **Nutzer** |

### Reihenfolge für den Erstversand

1. **P0-1** anwenden, danach `node scripts/verify-pilot-send-gate.mjs` → `26/26`.
2. **B-1**: Pilotrechnung erzeugen und festschreiben. `/admin/pilot`
   Abschnitt 0 zeigt sie dann mit Kunde, Empfänger, Betrag und PDF-Stand.
3. Entscheiden, ob **T3-1/T3-2** vor dem Erstversand gebaut werden sollen.
   *Ohne sie ist der Versand nicht durch das Pilot-Gate geschützt* — er ist
   dann ein normaler Admin-Versand mit 16-Punkte-Preflight.
4. `PILOT_ERSTVERSAND_FREIGEGEBEN=1` setzen, Token ausstellen, begleitet senden.

**Solange P0-1 offen ist, gilt: `NOT_READY_FOR_LIVE_PILOT`.**
