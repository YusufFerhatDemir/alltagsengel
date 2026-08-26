# Phase 8.4 — Production Readiness Verification

**Stand:** 27.08.2026 · **Commit-Anker:** `06c27b9` (Basis: `063aba7`)
**Mandant:** Alltagsengel UG — `00000000-0000-4000-8000-000460629986`

Alle Zahlen in diesem Bericht sind gegen die **Produktionsdatenbank** gemessen
(`scripts/verify-pilot-control-center-live.ts`, `scripts/verify-pilot-send-gate.mjs`)
bzw. gegen die **Vercel-Produktionsumgebung** (`vercel env ls production`).
Keine Rechnung wurde versendet, keine Mahnung, keine Zahlung gebucht, kein
CAMT importiert. Es wurde kein Freigabe-Token erzeugt.

---

## Gesamturteil

| Kriterium | Soll | Ist | |
|---|---|---|---|
| Migration `20261005000000` | LIVE | **LIVE, 26/26 Prüfpunkte** | ✅ |
| P0 (technisch) | 0 | **0** | ✅ |
| P1 (technisch) | 0 | **0** | ✅ |
| Typecheck | 0 Fehler | **0** | ✅ |
| Tests | grün | **6089 vitest + 2211 node:test** | ✅ |
| Safety Switches (Produktion) | alle AUS | **alle AUS** | ✅ |
| `payments` / `camt_imports` / `invoice_email_log` | 0 / 0 / 0 | **0 / 0 / 0** | ✅ |
| Pilot-Kandidat | `NO_PILOT_INVOICE` | **`NO_PILOT_INVOICE`** | ✅ |

**Technisch ist der begleitete Erstversand startklar.** Was fehlt, ist kein
Code, sondern ein Geschäftsvorgang: es existiert keine festgeschriebene,
unversendete Rechnung. Zusätzlich sind **drei Altbestands-Zeilen zu klären**
(Befund B-3) und **zwei externe Eingaben offen** (DATEV-Stammdaten).

---

## Was sich in dieser Phase geändert hat

Drei Befunde, alle im Commit `06c27b9` geschlossen.

### B-1 (P0) — Die Einmal-Freigabe war ausstellbar und wirkungslos

Der Befund war aus Phase 8.3 als **T3-1 „BEWUSST_OFFEN"** bekannt und ist der
schwerwiegendste des Projekts gewesen:

`pruefeSendeToken()` und `verbraucheSendeToken()` hatten außerhalb ihrer
eigenen Testdatei **keinen einzigen Aufrufer**. `POST /api/billing/invoices/[id]/versenden`
kannte `lib/pilot/send-gate.ts` nicht und nahm kein Token entgegen. Der
Kommentar in der Freigabe-Route — *„Der Versand selbst ist ein eigener,
getrennter Aufruf, der das Token mitbringen muss"* — beschrieb einen Zustand,
den es nicht gab. Ein Administrator mit `abrechnung.schreiben` konnte echte
Post auslösen, ohne Token und ohne dass `PILOT_ERSTVERSAND_FREIGEGEBEN`
gesetzt war. Die gesamte Phase-8-Architektur der Einmal-Freigabe war damit
Dekoration.

**Geschlossen.** `versendeRechnungPerEmail()` verlangt jetzt die Freigabe:

- **Wann sie gilt:** genau dann, wenn `PILOT_ERSTVERSAND_FREIGEGEBEN=1` steht
  — also wenn Freigaben überhaupt ausstellbar sind. Die Kopplung steht in
  `pilotGatePflicht()` (`lib/pilot/send-gate.ts`) und ist bewusst so herum:
  Ein unbedingter Tokenzwang wäre ein Deadlock, weil ohne den Schalter keine
  Freigabe entsteht — jeder Rechnungsversand wäre dauerhaft gesperrt, auch der
  reguläre Betrieb nach dem Piloten.
- **Wirkung heute:** keine. Der Schalter ist in beiden Vercel-Projekten nicht
  gesetzt, das Verhalten ist unverändert (Rolle → Preflight → `frozen_at` →
  `sent_at`).
- **Wirkung beim Umlegen:** ohne gültiges Token geht auf **keinem** Weg etwas
  raus — auch nicht über den Automaten nach dem Festschreiben oder den
  Wiederholungslauf. Während eines begleiteten Erstlaufs ist genau das richtig.
- **Reihenfolge:** geprüft wird **nach** dem Preflight und **vor** der
  PDF-Erzeugung (kein Beleg für einen Versand, der am Token scheitert);
  **verbraucht** wird unmittelbar **vor** `sendRawEmail()`. Bricht der Lauf
  dazwischen ab, ist das Token verbrannt und ein Mensch stellt nach einer
  Sichtung ein neues aus — andersherum wäre ein Abbruch genau der Zustand, in
  dem ein Wiederholungslauf ein zweites Mal senden dürfte.
- **Ausnahme:** der bewusste Nachversand (`erneutSenden`). Für eine bereits
  versendete Rechnung ist keine Freigabe mehr ausstellbar — der Preflight
  blockt, und der UNIQUE-Teilindex `einmal_verbraucht` erst recht. Ein
  Tokenzwang wäre dort keine Sperre, sondern eine Sackgasse.

Der Betragsvergleich nutzt `euroZuCent()` — dieselbe Umrechnung wie der Pilot.
Mit `Math.round(x * 100)` wäre ein gültiges Token an einem Rundungsunterschied
gescheitert.

**Belege:** `__tests__/billing/rechnung-versand-sendgate.test.ts` (22 Tests):
ohne Token kein Versand *und kein PDF*; unbekannt / abgelaufen / verbraucht /
entwertet / falscher Betrag / falscher Empfänger / offene Versandsperre /
bereits protokolliert werden je einzeln abgewiesen; das bedingte UPDATE
verliert das Rennen zweier gleichzeitiger Läufe, statt doppelt zu senden.

### B-2 (P1) — Der Token-Lebenslauf stand in keinem Audit-Trail

`send-gate.ts` protokollierte ausschließlich über `logger` — flüchtig und
mandantenblind. Wer nachträglich fragt „wer hat den ersten echten Versand
freigegeben, und wann wurde die Freigabe verbraucht", fand die Antwort
nirgends: `pilot_send_gate` trägt zwar Zeitstempel, verschwindet aber mit einem
Rollback der Migration.

**Geschlossen.** Vier Ereignisse gehen jetzt in `billing_audit_trail`
(`entity_type: 'invoice'`, Freigabe-Kennung in `new_state.gate_id`):

| Aktion | Wann |
|---|---|
| `pilot_freigabe_erteilt` | Token ausgestellt (mit Empfänger, Betrag, Gültigkeit) |
| `pilot_freigabe_verbraucht` | Token vor dem Versand verbraucht |
| `pilot_freigabe_verbrauch_abgelehnt` | Verbrauch traf keine offene Zeile — **die Spur eines Doppelversand-Versuchs** |
| `pilot_freigabe_entwertet` | Von Hand oder durch die Nachprüfung entwertet (je Freigabe eine Zeile) |

Alle vier sind **fail-soft**: `logBillingAction()` wirft bei Schreibfehlern,
und ein durchschlagender Audit-Fehler nach einem bereits verbrauchten Token
würde den Aufrufer zu einem Wiederholungsversuch verleiten. Eine fehlende
Protokollzeile ist schlimm; ein daraus entstehender Doppelversand wäre schlimmer.

`actorId` wird jetzt bis in `entwerteSendeToken()` und
`entwerteAlleOffenenTokens()` durchgereicht — vorher ging der Handelnde dort
verloren.

Live gegengeprüft: `billing_audit_trail` hat **keinen** CHECK auf `action`,
`entity_type` erlaubt `'invoice'`, und die Tabelle trägt
`trg_audit_trail_no_update` / `trg_audit_trail_no_delete` — INSERT-only,
also append-only und schreibbar.

### B-3 (P1) — `sent_at` galt als Beweis, den es nicht trug

**Der Live-Befund:** Die Stamm-Organisation enthält drei Rechnungen
(`RE-2026-0001/0002/0003`) mit gesetztem `sent_at` — aber

- `frozen_at` ist bei allen drei **NULL**,
- `invoice_email_log` hat **0 Zeilen**,
- `created_at` (02.07.2026) liegt **nach** zwei der drei „Versandzeitpunkte"
  (02.04. und 05.05.2026),
- `RE-2026-0003` steht auf `paid`, während `payments` und `zahlungseingaenge`
  leer sind.

Der Versandweg weist eine nicht festgeschriebene Rechnung ab
(`'Rechnung ist nicht festgeschrieben.'`). Diese Zeitstempel können also nicht
von ihm stammen — es sind eingespielte Demo-Daten.

**Was das anrichtete:** Das Control Center meldete `PRE_FLIGHT: VERIFIED`
(*„der Preflight ist mindestens einmal durchlaufen"*), `SEND: VERIFIED`
(*„3 Rechnungen tragen sent_at"*), `AUDIT: VERIFIED` und `pilot-kandidat`
antwortete `BEREITS_VERSENDET`. Der Erstversand galt damit als **erledigt**,
obwohl er nie stattgefunden hat — und `NO_PILOT_INVOICE`, der Zustand, der die
fehlende Geschäftshandlung benennt, wurde nie erreicht.

**Geschlossen.** Neue Messgröße `versendet ohne Festschreibung`
(`sent_at IS NOT NULL AND frozen_at IS NULL`) in `control-center.ts`,
`pilot-phasen.ts` und `pilot-kandidat.ts`. Abgeleitet daraus `versendetBelegt`;
`VERIFIED` und `BEREITS_VERSENDET` hängen ab sofort an **belegten**
Versendungen. `SEND` meldet bei ausschließlich unbelegten Zeitstempeln
`BLOCKED` mit der Aufforderung, die Herkunft zu klären — nicht `VERIFIED`.
Die Messung ist fail-closed: schlägt sie fehl, ist der Bereich `ungeprueft`,
nicht `0`.

---

## Track-Ergebnisse

### 1 · Control Center — alle 14 Kategorien

`scripts/verify-pilot-control-center-live.ts` (neu, rein lesend) ruft die
produktive Auswertungslogik gegen die echte DB. **14/14 aufgelöst, keine
Messung gescheitert, kein `null`.**

| Bereich | Ampel | Kern |
|---|---|---|
| CAMT | grün | 0 Importe, 0 Buchungen, 0 Hash-Dubletten |
| Rechnung | **rot** | 3 Rechnungen, 0 versandbereit, **3 versendet ohne Festschreibung** (B-3) |
| Mahnung | grün | 0 mahnfähig, Dead Letter 0 |
| DATEV | **rot** | Berater-/Mandantennummer fehlen (`BUSINESS_INPUT_REQUIRED`) |
| System | rot* | Audit schreibt (2 Einträge), Versandschalter 0 scharf |

\* Die Meldung „1 Pflicht-Variable fehlt" stammt aus der **lokalen** Umgebung
(`CRON_SECRET` fehlt in `.env.local`). In Vercel-Produktion ist sie gesetzt —
siehe Track 10. Der Bereich ist produktionsseitig vollständig.

| Phase | Status |
|---|---|
| 1 PRE_FLIGHT | `NOT_STARTED` — keine festgeschriebene, versandfähige Rechnung |
| 2 **APPROVAL** | `NOT_STARTED` — **nicht mehr `BLOCKED`**: die Freigabetabelle ist lesbar |
| 3 SEND | `BLOCKED` — Sachbefund B-3, Herkunft der Zeitstempel klären |
| 4 DELIVERY | `NOT_STARTED` |
| 5–7 CAMT/MATCH/ALLOCATION | `NOT_STARTED` |
| 8 RECONCILIATION | `NOT_STARTED` — keine Kette abzustimmen |
| 9 AUDIT | `NOT_STARTED` — kein Geldvorgang zu protokollieren |

Vor dieser Phase stand APPROVAL auf `BLOCKED` („Migration nicht angewendet"),
PRE_FLIGHT und SEND fälschlich auf `VERIFIED`. Beides ist bereinigt.

### 2 · Rechnungs-Draft-Workflow

Der Pfad Draft → `frozen_at` → Preflight (16+3) → PDF → Empfänger → Kandidat
ist vollständig und wird korrekt als **leer** erkannt:

```
Zustand:        NO_PILOT_INVOICE
actionRequired: NO_PILOT_INVOICE — ACTION_REQUIRED: CREATE_OR_SELECT_REAL_DRAFT_INVOICE
versandbereit:  0   ohneEmpfaenger: 0   versendetUnbelegt: 3
```

Die Begründung nennt jetzt zusätzlich den Altbestand aus B-3, damit die „0"
nicht wie ein ladender Bildschirm aussieht. **Es wurde keine Rechnung erzeugt.**

### 3 · Resend-Preflight — verifiziert

| Punkt | Fundstelle | Befund |
|---|---|---|
| Idempotenz-Schlüssel | `rechnung-versand.ts` → `idempotenzSchluessel: \`rechnung:${invoiceId}\`` | ✅ ; beim Nachversand bewusst **ohne** (zwei Mails sind dort die Absicht) |
| Weitergabe an Resend | `notifications.ts` → `{ idempotencyKey }` als 2. Argument von `emails.send` | ✅ |
| Zeitlimit | `RESEND_ZEITLIMIT_MS = 20_000`, via `mitZeitlimit()` | ✅ 20 s, Zeitüberschreitung ⇒ 408 ⇒ als vorübergehend klassifiziert, also wiederholbar |
| Absender | `ALLTAGSENGEL_ABSENDER = 'Alltagsengel <info@alltagsengel.care>'` — Konstante | ✅ entspricht der Kundenkommunikations-Regel (kein persönlicher Name) |
| PDF im Mailkörper | `Buffer.from(a.content).toString('base64')` | ✅ |
| Erfolg nur mit Provider-ID | `if (!data?.id) → gescheitert(PROVIDER_OHNE_ID)` | ✅ `sent_at` wird ohne Empfangsbestätigung nicht gesetzt |

### 4 · Approval-Token-Flow — E2E

Alle drei Zustände, der Ablauf und die vier Bindungen sind abgedeckt
(`__tests__/pilot/send-gate.test.ts`, 60 Tests + die 22 neuen aus B-1):

- **offen** → erlaubt; **verbraucht** → `token_verbraucht`; **entwertet** → `token_entwertet`
- `gueltig_bis` überschritten → `token_abgelaufen`
- Bindungen: `invoice_id` → `rechnung_abweichend`, `empfaenger` →
  `empfaenger_abweichend` (Groß-/Kleinschreibung zählt bewusst nicht),
  `betrag_cents` → `betrag_abweichend`, `preflight_status` →
  `preflight_nicht_bereit`
- Nachträgliche Sperren: protokollierter Versand → `bereits_versendet`,
  offene `pilot_versand_sperre` → `versandsperre`
- Fail-closed: jeder Lesefehler auf `pilot_send_gate`, `invoice_email_log`
  oder `pilot_versand_sperre` ⇒ `quelle_unlesbar` ⇒ Ablehnung
- Mandantenzaun im `WHERE`: ein fremdes Token ist schlicht `token_unbekannt`
- UNIQUE-Teilindizes live verifiziert (26/26): `offen_je_rechnung` und
  `einmal_verbraucht`, beide mit korrekter Teilbedingung; `23505` wird als
  Sperre gemeldet, nicht als Datenbankproblem

### 5 · Duplicate-Send-Schutz — drei Ebenen, jetzt alle wirksam

| Ebene | Mechanismus | Stand |
|---|---|---|
| 1 · Datenbank | `pilot_send_gate_einmal_verbraucht` (UNIQUE, partiell) — max. 1 verbrauchtes Token je Rechnung | ✅ live verifiziert |
| 1b · Datenbank | Verbrauch ist ein **bedingtes UPDATE** (`is('verbraucht_am', null)`); der zweite gleichzeitige Lauf trifft 0 Zeilen | ✅ getestet |
| 2 · Anwendung | `sent_at`-Prüfung + `invoice_email_log`-Prüfung auf eine `versendet`-Zeile | ✅ |
| 3 · Provider | Resend `Idempotency-Key: rechnung:{invoiceId}` (24-h-Fenster) | ✅ |

Ebene 1 lag vor dieser Phase **hinter** dem Versandweg statt davor (B-1) und
war damit unwirksam. Sie ist es jetzt nicht mehr.

### 6 · Post-Send-Reconciliation

8 Prüfpunkte in `lib/pilot/post-send-verification.ts`: `resend_erfolg`,
`message_id`, `protokoll_genau_eins`, `keine_retry_dublette`,
`empfaenger_betreff_betrag`, `rechnungsstatus`, `keine_fremde_organisation`,
`audit_eintrag`.

Bei Abweichung: `pilot_versand_sperre` gesetzt (P0) → **alle** offenen
Freigaben entwertet (jetzt mit `actorId` und je Freigabe einer Audit-Zeile) →
`pilot_nachpruefung_abweichung` im Audit-Trail (fail-soft).

**Kein automatischer Aufruf — bestätigt.** `pruefeNachVersand` wird
ausschließlich aus `lib/pilot/index.ts` re-exportiert; es existiert kein
Aufrufer in `app/` oder `lib/`. Das ist die dokumentierte Absicht (der
Nachprüfer setzt Sperren und darf nicht ungesehen laufen) — **hat aber eine
Kehrseite:** es gibt auch keine Route und kein Skript, mit dem ein Betreiber
sie starten kann. Siehe „Offen" unten.

### 7 · Audit-Trail im kritischen Pfad

| Vorgang | Aktion | Stand |
|---|---|---|
| Versand erfolgreich | `email_versendet` (mit Provider-ID + PDF-Prüfsumme) | ✅ bestand |
| Versand übersprungen / gescheitert | `email_uebersprungen` / `email_fehlgeschlagen` | ✅ bestand |
| Token erteilt / verbraucht / abgelehnt / entwertet | siehe B-2 | ✅ **neu** |
| Nachprüfung mit Abweichung | `pilot_nachpruefung_abweichung` | ✅ bestand |

Keine Lücke mehr im kritischen Pfad. Alle Schreibvorgänge nach erfolgtem
Mailversand sind fail-soft — ein Audit-Fehler darf einen Wiederholungsversuch
nicht auslösen.

### 8 · Rollback / Recovery

- `scripts/rollback.sh`: `git revert --no-edit HEAD~N..HEAD`. **Kein
  `reset --hard`, kein Force-Push**, N auf 1..20 begrenzt, Sicherheitsfrage nur
  bei interaktivem TTY. ✅
- `20261005000001_rollback_pilot_send_gate.sql`: korrekte Umkehr —
  4 Policies + 2 Tabellen, in `BEGIN/COMMIT`. Indizes und Constraints fallen
  mit den Tabellen. Der Warnhinweis („nur ausführen, solange kein echter
  Erstversand über das Gate gelaufen ist") steht im Kopf. ✅
- **Recovery-Pfad:** `entwerteSendeToken()` (einzeln, per `DELETE`-Route) und
  `entwerteAlleOffenenTokens()` (mandantenweit, aus der Nachprüfung). Beide
  entwerten **nur offene** Freigaben — ein bereits verbrauchtes Token bleibt
  unangetastet, weil das Geschichtsfälschung wäre. ✅

### 9 · CAMT bleibt DRY_RUN

- `CAMT_IMPORT_MODE` ist in **beiden** Vercel-Projekten nicht gesetzt →
  `camtImportModus()` liefert `DRY_RUN`, `buchend: false`.
- `PILOT_QUELLE` ist `Object.freeze`t — bestätigt zur Laufzeit
  (`Object.isFrozen === true`). Ein Aufrufer, der `LIVE` hineinschreiben will,
  scheitert im strict mode mit `TypeError`, statt still einen buchenden Lauf zu
  erzeugen.
- `camtPilotLauf()` bricht fail-closed ab, wenn der Preflight trotz fester
  Pilotquelle `buchend` meldet.
- `camt_imports` = 0, `zahlungseingaenge` = 0.

### 10 · Production Readiness

**Vercel-Produktion — `vercel env ls production`, beide Projekte:**

| Variable | `alltagsengel` | `alltagsengel-deploy` |
|---|---|---|
| `PILOT_ERSTVERSAND_FREIGEGEBEN` | **nicht gesetzt** ✅ | **nicht gesetzt** ✅ |
| `RECHNUNGSVERSAND_AUTOMATISCH` | **nicht gesetzt** ✅ | **nicht gesetzt** ✅ |
| `MAHNVERSAND_AUTOMATISCH` | **nicht gesetzt** ✅ | **nicht gesetzt** ✅ |
| `CAMT_IMPORT_MODE` | **nicht gesetzt** ✅ | **nicht gesetzt** ✅ |
| `VERSAND_NICHT_PRODUKTION_ERLAUBT` | **nicht gesetzt** ✅ | **nicht gesetzt** ✅ |
| `CRON_SECRET` | gesetzt ✅ | – |
| `RESEND_API_KEY` | gesetzt ✅ | nicht gesetzt (kann nicht senden) |
| `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_*` | gesetzt ✅ | gesetzt |

Nur Namen ausgelesen, **keine Werte**. Alle fünf Pflicht-Variablen sind in der
Produktion vorhanden — die Meldung aus Track 1 betrifft ausschließlich die
lokale `.env.local`.

**Datenbestand (live):**

| Tabelle | Zeilen |
|---|---|
| `payments` | **0** |
| `camt_imports` | **0** |
| `zahlungseingaenge` | **0** |
| `invoice_email_log` | **0** |
| `pilot_send_gate` | **0** |
| `pilot_versand_sperre` | **0** |
| `invoices` | 3 (alle drei = Altbestand B-3) |

**Qualitätsstand:** `tsc --noEmit` 0 Fehler · `vitest run` 272 Dateien,
6089 Tests grün · `npm run test:unit` 2211 Tests grün · Typecheck und Tests
wurden **nacheinander** gefahren (OOM-Vermeidung).

---

## Offen — und wer dran ist

| # | Punkt | Art | Zuständig |
|---|---|---|---|
| O-1 | Keine festgeschriebene, unversendete Rechnung → kein Pilot-Kandidat | Geschäftsvorgang | **Nutzer** |
| O-2 | 3 Rechnungen mit `sent_at` ohne `frozen_at` (B-3) — bereinigen oder als Altbestand dokumentieren | Datenbestand | **Nutzer** (Freigabe zum Bereinigen erforderlich) |
| O-3 | DATEV: Berater- und Mandantennummer fehlen | `BUSINESS_INPUT_REQUIRED` | **Steuerkanzlei** |
| O-4 | `pruefeNachVersand()` hat keine Route und kein Skript — nach dem Erstversand nur programmatisch aufrufbar | Werkzeuglücke | **Entwicklung** |
| O-5 | `PILOT_ERSTVERSAND_FREIGEGEBEN=1` setzen — erst unmittelbar vor dem begleiteten Erstlauf | Betriebsentscheidung | **Nutzer** |

O-2 wurde **nicht** eigenmächtig bereinigt: das Löschen oder Ändern von
Produktionsdaten ist keine Entscheidung, die ein Prüflauf trifft. Solange die
Zeilen stehen, meldet das Control Center sie korrekt als Befund statt sie
als Fortschritt zu verbuchen.

O-4 ist bewusst nicht in dieser Phase gebaut worden: `pruefeNachVersand()`
schreibt (Sperre, Entwertung, Audit) und ist damit keine Lese-Route, deren
Zuschnitt sich nebenbei festlegen ließe.

---

## Ablauf des begleiteten Erstlaufs — Sollstand

1. Kunde anlegen, Leistung erfassen, Rechnung erzeugen, **festschreiben**.
2. `GET /api/billing/invoices/<id>/preflight` → `READY_FOR_SEND` gegenlesen.
3. `PILOT_ERSTVERSAND_FREIGEGEBEN=1` in Vercel-Produktion setzen.
   **Ab hier verlangt jeder Erstversand ein Token — auf jedem Weg.**
4. `POST /api/billing/invoices/<id>/freigabe` mit bestätigtem Empfänger und
   Betrag → Token (60 Min gültig). Audit: `pilot_freigabe_erteilt`.
5. `POST /api/billing/invoices/<id>/versenden` mit `{ token }`.
   Verbrauch vor dem Absenden. Audit: `pilot_freigabe_verbraucht`.
6. `pruefeNachVersand()` fahren (O-4 beachten) und die 8 Punkte gegenlesen.
7. `PILOT_ERSTVERSAND_FREIGEGEBEN` wieder entfernen.

---

## Prüfwerkzeuge dieser Phase

| Skript | Zweck | Nebenwirkung |
|---|---|---|
| `scripts/verify-pilot-send-gate.mjs` | Migration `20261005000000` gegen live — 26 Prüfpunkte | keine (DO-Block + `RAISE`, rollt zurück) |
| `scripts/verify-pilot-control-center-live.ts` | **neu** — produktive Auswertungslogik gegen live, alle 14 Kategorien | keine (nur `ermittle*`/`pruefe*`) |

`verify-pilot-send-gate.mjs` hatte einen eigenen Fehler: die Existenzprüfung
verglich `to_regclass(...)::text` mit `'public.<tabelle>'`, während Postgres
den Namen unqualifiziert zurückgibt, sobald `public` im `search_path` steht.
Zwei Prüfpunkte meldeten dadurch „nicht gefunden" für Tabellen, gegen die alle
übrigen 24 Prüfpunkte erfolgreich liefen. Korrigiert → **26/26**.

`verify-pilot-control-center-live.ts` unterscheidet **Messfehler** (Exit 1 —
dem Lauf ist nicht zu trauen) von **Sachbefund** (Exit 0 — die Messung gelang,
das Ergebnis ist ein Missstand). Ohne diese Trennung färbte jeder korrekt
erkannte Missstand den Lauf rot, und man gewöhnte sich das Rot ab.
