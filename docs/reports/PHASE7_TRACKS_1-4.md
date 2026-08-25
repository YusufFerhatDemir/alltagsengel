# Phase 7, Tracks 1–4 — Money Flags + CAMT/Rechnung/Mahnung Preflight

Stand: 26.08.2026 · Vorgänger: `docs/reports/PHASE6B_TECHNICAL_PROGRESS.md`

---

## 0. Was diese Phase getan hat — und was ausdrücklich nicht

Phase 6B endete mit dem Satz: *„Was jetzt bleibt, ist kein Code mehr, sondern
Erstbetrieb."* Das stimmte für die Frage, ob die Geldpfade **funktionieren**.
Es stimmte nicht für die Frage, ob man sie **gefahrlos scharf stellen kann**.

Die drei Schalter, die den Erstbetrieb auslösen, waren fail-closed — aber
niemand konnte vorher sehen, was beim Umlegen passieren würde. Diese Phase baut
genau das: für jeden der drei Geldpfade einen Weg, das Ergebnis zu prüfen,
**ohne es auszulösen**.

**Nichts davon wurde scharf gestellt.** Keine Rechnung versendet, keine Mahnung
verschickt, keine Bankdatei importiert, keine Zahlung gebucht. Beide
Versand-Schalter stehen weiter auf „nicht gesetzt"; `CAMT_IMPORT_MODE` ist neu
und steht auf seinem fail-closed-Standard.

---

## 1. Ergebnis in Zahlen

| Messung | Wert |
|---|---|
| Typecheck | **0 Fehler** (`npx tsc --noEmit`) |
| node:test | **2.211 grün / 0 rot** |
| vitest | siehe §7 — nacheinander gelaufen, nie gleichzeitig |
| Neue Tests | **+197** in 5 neuen Dateien, plus 3 in einer bestehenden E2E-Suite |
| Neue Module | 7 |
| Neue Routen | 2 (beide ausschließlich lesend) |
| Gefundene Produktionsbefunde | **6** (§5), alle behoben |

---

## 2. Track 1 — Die zwei Versand-Schalter

### Vorher

`RECHNUNGSVERSAND_AUTOMATISCH` und `MAHNVERSAND_AUTOMATISCH` wurden an drei
Stellen mit `process.env.X === '1'` verglichen. Fail-closed und insoweit
richtig. Drei Dinge fehlten.

### 1.1 Umgebungstrennung — der schwerste der drei

Eine Vercel-Variable, die für **„All Environments"** angelegt wird, steht auch
in jedem Preview-Deployment und in jedem lokalen `vercel env pull`. Beim
Umlegen des Schalters für die Produktion hätte damit **jeder Branch-Preview**
angefangen, echte Rechnungen und Mahnungen zu verschicken — an dieselbe
Produktionsdatenbank, mit demselben Resend-Schlüssel.

Das ist kein hypothetischer Fall: es ist die Vorauswahl im Vercel-Dialog.

Der Schalter wirkt jetzt nur im **Produktionslauf**. Maßgeblich ist
`istProduktionslauf()` aus `lib/env/pruefung.ts` — dieselbe Definition, die die
bestehende ENV-Prüfung verwendet, keine zweite. Für einen bewussten Test
außerhalb: zusätzlich `VERSAND_NICHT_PRODUKTION_ERLAUBT=1`.

### 1.2 Ungültige Werte sind jetzt sichtbar

`true`, `yes`, `ja`, `' 1'` mit Leerzeichen — alle bedeuteten AUS, und das ist
richtig. Aber niemand erfuhr davon. Wer den Schalter umlegt und `true` einträgt,
saß danach vor einem System, das schwieg und nichts verschickte.

Fünf unterscheidbare Befunde: `aus_fehlt`, `aus_explizit`, `aus_ungueltig`,
`aus_umgebung`, `an`. Der Mahn-Cron liefert den Befund in seiner Antwort mit;
vorher stand dort in allen Fällen derselbe Satz.

**Leerraum bleibt bewusst ungültig statt getrimmt.** `vercel env add` über
stdin nimmt gern ein Newline mit; `'1\n'` schaltet nicht ein. Ein Wert, bei dem
unklar ist, ob er so gemeint war, darf keine Post auslösen — er wird stattdessen
als ungültig gemeldet, sodass die Ursache auffindbar ist.

### 1.3 Audit bei Änderung

Ein Wechsel zwischen „verschickt automatisch" und „verschickt nicht" ist eine
geldrelevante Betriebsänderung und stand nirgends. Jetzt: eine Zeile im
`billing_audit_trail` (`entity_type='abrechnung_betriebsmodus'`,
`action='versand_flag_stand'`), **je Mandant und nur bei Wechsel**.

Warum nur bei Wechsel: ein Eintrag je Aufruf hieße eine Zeile pro
festgeschriebener Rechnung und eine pro Mandant und Tag aus dem Mahn-Cron. Der
Trail wäre nach einem Monat voller Zeilen, die alle dasselbe sagen.

Warum an der Verbrauchsstelle statt beim Start: zwischen Prozessstart und
Versand kann ein Redeploy liegen. Festgehalten wird der Zustand, der beim
Versand **tatsächlich galt**.

**Fail-soft, und das ist geprüft.** Diese Funktion steht vor dem Versand — wirft
sie, geht eine korrekt festgeschriebene Rechnung wegen eines Protokolleintrags
nicht raus. Der Test „wirft nicht, wenn die Datenbank komplett wegbricht" fand
genau diese Lücke: der PostgREST-Client meldet einen Verbindungsabbruch als
geworfene Ausnahme, nicht im `error`-Feld (Befund **F-1**).

### 1.4 Erzwungene Vollständigkeit blieb erhalten

`__tests__/env/env-register.test.ts` scannt `app/`, `lib/` und `components/`
nach literalen `process.env.NAME`-Zugriffen. Weil die Schalter jetzt über eine
Namensliste gelesen werden, sieht der Scan sie nicht mehr. Die Lücke ist
geschlossen, indem der bestehende Test seine Namen **aus `VERSAND_FLAGS`
selbst** zieht statt aus einer zweiten Liste — ein dritter Schalter könnte damit
nicht unverzeichnet dazukommen.

---

## 3. Track 2 — CAMT-Preflight

### 3.1 Der Standard ist jetzt DRY_RUN

Ein Kontoauszugsimport ist der einzige Vorgang im System, der aus einer
hochgeladenen Datei unmittelbar Geld bewegt: jede Zeile wird ein
Zahlungseingang, läuft ins Matching, setzt `invoices.paid_amount` und kann als
Rücklastschrift eine Rechnung wieder öffnen, eine Gebühr buchen und ein
SEPA-Mandat sperren. Rückgängig ist davon nichts mit einem Knopf.

Bis hierher gab es nur „importieren". Wer wissen wollte, was eine echte
camt.053 anrichten würde, musste sie importieren.

`CAMT_IMPORT_MODE=LIVE` bucht; **alles andere, auch das Fehlen, ist ein
Trockenlauf**. Der Standard kostet nichts: `camt_imports` steht live auf 0, es
gibt keinen Bestandsbetrieb, den diese Wahl unterbricht.

### 3.2 Eine Bewertung, nicht zwei

Der Preflight rechnet **nicht selbst**. Die Bewertung wurde aus `matchBuchung()`
herausgelöst (`bewerteBuchung()`, rein lesend) und wird von beiden Wegen
benutzt. Zwei Bewertungen wären zwei Wahrheiten: der Trockenlauf sähe eine
Zuordnung, die der scharfe Lauf nicht macht — oder, schlimmer, umgekehrt.

Dasselbe für die Erkennung von Rechnungsnummern im Verwendungszweck
(`extrahiereRechnungsnummern()`).

### 3.3 Einordnung je Buchung

`INVALID` › `CROSS_TENANT_BLOCKED` › `DUPLICATE` › `AMBIGUOUS` › `UNMATCHED` ›
`MATCHED`. Die Reihenfolge ist die Rangfolge — eine Zeile, die zugleich Dublette
und mehrdeutig ist, gilt als Dublette: der ernstere Befund gewinnt, weil er
derjenige ist, der eine Buchung verhindern muss.

**Gebucht würde ausschließlich `MATCHED`.** `AMBIGUOUS` und `UNMATCHED` werden
Klärfälle. Das ist keine eigene Regel des Preflights, sondern dieselbe, die der
scharfe Import anwendet.

Geprüft wird je Buchung: IBAN (MOD 97), Betrag, Vorzeichen gegen die Richtung,
Währung, EndToEndId, Mandatsreferenz, Gläubiger-ID, Verwendungszweck,
debtorName, Buchungsstatus (BOOK), Dublette und Mandantengrenze.

**Die Gläubiger-ID musste dafür erst gelesen werden** — der Parser extrahierte
`<CdtrSchmeId>` bisher nicht. Additiv nachgerüstet, ohne den Buchungshash zu
berühren (sonst wäre jede bekannte Buchung schlagartig eine neue gewesen).

### 3.4 Mandantengrenze — mit Sorgfalt gegen Fehlalarm

Drei Abfragen suchen **absichtlich ohne** `organization_id`-Filter; anders ließe
sich „gehört jemand anderem" nicht feststellen. Sie lesen deshalb ausschließlich
`organization_id` — keinen Namen, keinen Betrag, keine Rechnungsnummer. Der
Bericht sagt „gehört zu einem anderen Mandanten" und nie, zu welchem; ein Test
hält fest, dass die fremde Kennung in keiner Antwort auftaucht.

**Kein Fehlalarm bei Nummernkollision:** Rechnungsnummern sind je Mandant
fortlaufend, dieselbe Nummer kann in zwei Häusern existieren. Blockiert wird nur,
wenn die Referenz **ausschließlich** anderswo existiert.

### 3.5 Der Bericht

`POST /api/billing/camt/preflight?format=text` liefert einen Text zum
Ausdrucken. Die eine Frage — „darf ich diese Datei scharf importieren?" — steht
in der ersten Zeile, vor allen Zahlen. Keine vollständige IBAN (nur
`DE89…3000`), keine fremde Mandantenkennung.

### 3.6 Der Nachweis, dass nichts geschrieben wird

Zwei Ebenen, weil eine nicht genügt:

1. **Modultest:** der Doppelgänger protokolliert jede Operation; geprüft wird
   nicht „wahrscheinlich nichts geschrieben", sondern dass über den gesamten
   Lauf kein einziger `insert`/`update`/`delete` vorkommt.
2. **Gegen echtes Postgres** (PGlite, `camt-pipeline-pglite.test.ts`): die
   Zeilenzahlen von sechs Tabellen vor und nach dem Aufruf sind identisch —
   plus eine Gegenprobe, dass derselbe Aufruf mit `LIVE` sehr wohl anlegt. Ohne
   die Gegenprobe wäre der Test auch dann grün, wenn der Import generell nichts
   mehr schriebe.

---

## 4. Track 3 — Rechnungsversand-Preflight

### 4.1 Vorher

`versendeRechnungPerEmail()` prüfte fünf Dinge: gelöscht, Status,
festgeschrieben, schon versendet, E-Mail vorhanden. Das sind die Bedingungen,
unter denen der **Versand** technisch scheitert — nicht die, unter denen die
**Rechnung** falsch ist.

Eine Rechnung ohne Positionen, mit einer doppelt vergebenen Nummer, über 0,00 €
ohne Storno-Kennzeichen, an einen Testmandanten, mit einer IBAN ohne gültige
Prüfsumme: jede einzelne lief durch.

### 4.2 Die 16 Punkte

Alle 16 aus dem Auftrag, jeder mit einem eigenen Befundsatz. Drei Zustände:
`READY_FOR_SEND` / `NEEDS_REVIEW` / `BLOCKED`.

**Die Unterscheidung zwischen NEEDS_REVIEW und BLOCKED ist der Kern.** Ohne sie
müsste jede Unsicherheit entweder durchgehen (dann nützt der Preflight nichts)
oder blockieren (dann ist er im Weg und wird abgeschaltet). Eine unvollständige
Postanschrift ist kein Grund, einen **Menschen** am Versand zu hindern — aber
sehr wohl einer, einen **Automaten** daran zu hindern, der nachts läuft und
niemanden fragt.

Punkt 12 erzeugt das CII-XML tatsächlich (beides ist rein lesend) und sieht die
Pflichtangaben nach. Eine Behauptung „wäre valide" ohne Erzeugung wäre wertlos.

### 4.3 Zwei benannte Grenzen statt behaupteter Sicherheit

- **Punkt 11 (PDF):** Die Erzeugung lädt in den Storage und schreibt
  `invoice_packages`. Der Preflight schreibt nichts und kann sie nicht
  auslösen. Was er prüft, steht im Befund; was er nicht ausschließen kann, auch.
- **Punkt 16 (Audit):** Ob ein INSERT gelingt, lässt sich ohne INSERT nicht
  beweisen. Geprüft wird die **Erreichbarkeit** des Trails — ein Lesefehler dort
  heißt, dass auch der Schreibvorgang scheitern wird.

### 4.4 Verdrahtung ohne stillen Standard

`versendeRechnungPerEmail()` verlangt jetzt eine **ausdrückliche Entscheidung**
über die Strenge — es gibt keinen Standardwert, den ein neuer Aufrufer unbemerkt
erbt:

| Aufrufer | Strenge |
|---|---|
| Festschreibung mit `autoVersand` | `automatisch` |
| Sammelrechnungslauf (über die Festschreibung) | `automatisch` |
| Wiederholungslauf der Zustellspur | `automatisch` |
| `POST /api/billing/invoices/[id]/versenden` | `manuell` |

Der Fluchtweg `'uebersprungen'` existiert für Tests der Versandlogik selbst.
`__tests__/billing/rechnung-preflight-pflicht.test.ts` scannt `app/` und `lib/`
und schlägt fehl, sobald er dort auftaucht — dasselbe Muster wie bei den
ungeprüften Resend-Aufrufern. Eine Regel, die nur im Kommentar steht, ist keine.

`GET /api/billing/invoices/[id]/preflight` beantwortet die Frage lesend, mit
beiden Urteilen nebeneinander.

---

## 5. Track 4 — Mahn-Safety-Gate

### 5.1 Vorher

Die Mahnsperren lagen an drei Orten: `NICHT_MAHNFAEHIG` und die Betragsprüfung
im Massenlauf, `checkDunningBlocks()` in der Eskalation, `ermittleStoppgrund()`
im Versand-Consumer. Jede Stelle prüfte etwas anderes, keine prüfte alles, und
keine konnte sagen, **warum** eine bestimmte Rechnung heute nicht gemahnt wurde.

### 5.2 Zehn Sperren an einer Stelle

`pruefeMahnbarkeit()` prüft: Rechnung/Mandant, Löschung, Status, offener Betrag
(inkl. Teilzahlung und Überzahlung), Fälligkeit, Gutschrift, Beanstandung,
manuelle Sperre, Stufenabstand, Warteschlange. Drei Zustände: `MAHNBAR` /
`GESPERRT` / `NOCH_NICHT_FAELLIG`.

**`advanceDunning()` ruft es** — das ist der einzige Ort, an dem eine Mahnstufe
steigt. Damit kann kein Aufrufer, auch kein künftiger, daran vorbei eskalieren.

Ein Punkt ist bewusst **nicht** fail-closed: eine unlesbare Warteschlange hält
den Lauf nicht an. Der Consumer prüft unmittelbar vor jedem Versand erneut; den
ganzen Mahnlauf wegen einer Leseabweichung anzuhalten wäre der größere Schaden.
Die Entscheidung steht im Befundtext und im Test.

### 5.3 Gefundene Befunde

Siehe §6 — M-1 bis M-4.

---

## 6. Gefundene und behobene Produktionsbefunde

| # | Befund | Wirkung | Schwere |
|---|---|---|---|
| **M-4** | **Über `POST /api/billing/dunning/advance` liefen alle Mahnstufen unmittelbar hintereinander durch.** `advanceDunning()` prüfte den Stufenabstand nicht — nur der Massenlauf tat das. | Eine Rechnung ließ sich in Sekunden von „offen" bis „Inkasso-Vorbereitung" treiben, **samt aller vier Mahngebühren** (2,50 + 5,00 + 7,50 + 10,00 €). Der Kunde bekäme vier Mahnungen in einer Zustellung. | 🔴 **P1 Geld** |
| **P-1** | **Schema-Drift im neuen Preflight:** `clients.deleted_at` selektiert — die Spalte existiert nicht (Baseline 20260101000000; Soft-Delete liegt auf `profiles`). | PostgREST hätte mit 42703 geantwortet; weil nur `data` ausgewertet wurde, wäre daraus **„Klient existiert nicht mehr"** geworden — eine falsche, aber plausible Sperre auf **jeder** Rechnung. Gefunden vor dem ersten Einsatz, durch die E2E-Kette. | 🔴 **P1 Funktion** |
| **P-2** | **Punkt 11 hätte jeden automatischen Erstversand blockiert.** Erste Fassung stellte ein fehlendes Belegpaket zur Sichtung — beim Erstversand existiert nie eines, es entsteht *im* Versand. | Der Automat hätte dauerhaft geschwiegen, mit der plausibel klingenden Begründung „PDF noch nicht erzeugt". Genau die Sorte Fehler, die der Preflight verhindern soll. | 🟠 **P2 Funktion** |
| **M-1** | `checkDunningBlocks()` filterte Gutschriften nicht auf `deleted_at IS NULL`. `verwerfeGutschrift()` setzt beim Verwerfen nur `deleted_at` und lässt `status='entwurf'` stehen. | Eine **verworfene** Gutschrift blockierte die Mahnung dieser Rechnung **für immer**. Fail-closed, deshalb ohne Geldschaden — aber eine berechtigte Forderung lief still aus dem Mahnwesen heraus. | 🟠 **P2 Geld** |
| **M-3** | `dunning_entries.amount_paid_cents` wurde einmal bei der Anlage geschrieben und danach nie wieder. `getDunningOverview()` rechnet den offenen Betrag aber aus dem **Mahneintrag**. | Die Mahnübersicht wies dauerhaft den vollen Rechnungsbetrag als offen aus, auch bei längst bezahlten Posten. Der Mahnlauf selbst war nie betroffen (er liest die Rechnung) — falsch war die **Anzeige** des Forderungsbestands. | 🟡 **P3 Anzeige** |
| **F-1** | `letzterFlagZustand()` fing nur das `error`-Feld, nicht die geworfene Ausnahme. Der PostgREST-Client meldet einen Verbindungsabbruch als Ausnahme. | Ein Netzwerkfehler beim **Lesen** des Audit-Trails hätte die gesamte Festschreibung mitgerissen: eine korrekt erzeugte Rechnung wäre wegen eines Protokolleintrags nicht zustande gekommen. Vom Test gefunden, nicht vom Code. | 🟠 **P2 Funktion** |
| **M-2** | `ensureDunningEntry()`, `checkDunningBlocks()`, `advanceDunning()` und `ermittleStoppgrund()` lasen ohne `organization_id` — bei service-role (BYPASSRLS). | Kein Leck (alle Routen fencen davor), aber eine Funktion, die eine Mahngebühr bucht, darf sich darauf nicht verlassen. Geschlossen; `advanceDunning()` verlangt den Mandanten jetzt als Pflichtparameter. | 🟡 Härtung |

> **Zwei der sechs Befunde stammen aus dem neu gebauten Code (P-1, P-2), beide
> vor dem ersten Einsatz gefunden.** Nicht durch Nachdenken, sondern weil die
> bestehenden E2E-Ketten den neuen Code sofort mitgefahren haben. Eine
> Absicherung, die man nur gegen ihre eigenen Tests baut, prüft sich selbst.

---

## 7. Quality Gate

| Prüfung | Ergebnis |
|---|---|
| `npx tsc --noEmit` | **0 Fehler** |
| `npm run test:unit` (node:test) | **2.211 / 2.211 grün** |
| `npx vitest run` | siehe Deploy-Protokoll — getrennt gelaufen, nie gleichzeitig mit tsc |
| Secrets im Repo | keine; `precommit-guard` läuft in `deploy.sh` |
| Cross-Tenant-Regression | keine — org-Fence in 4 Funktionen **ergänzt**, in keiner entfernt |
| Stille Fehlerpfade | keine neuen; **zwei bestehende geschlossen** (F-1, M-1) |

### Angefasste Bestandstests — und warum

Kein Test wurde an ein verändertes Verhalten „angepasst", ohne dass die
Verhaltensänderung selbst gewollt war:

| Datei | Änderung |
|---|---|
| `camt-pipeline-pglite.test.ts` | Setzt `CAMT_IMPORT_MODE=LIVE` — die Suite prüft den **buchenden** Weg. Der fail-closed-Standard bekam einen eigenen Abschnitt (+3 Tests). |
| `go-live-pilot-hauptkette.test.ts` | Die Schleife, die fünfmal hintereinander eskalierte, war **kein Testartefakt, sondern Befund M-4**. Jetzt vergeht zwischen den Stufen Zeit; ein neuer Test hält fest, dass zwei Stufen im selben Zeitraum abgewiesen werden. |
| `mahn-versand.test.ts` | Der handgeschriebene Stub hing an der **Form** der Abfrage (`.eq()` genau einmal) statt an ihrem Inhalt. Durch einen kettbaren Lesehelfer ersetzt. |
| `sammelrechnung-e2e-phase4-pglite.test.ts` | Die Stammdaten sind jetzt preflight-tauglich (echte Anschrift, Bankverbindung, keine `@example.org`). Damit belegt die Suite die Kette **mitsamt** Absicherung statt an ihr vorbei. |
| `rollen-angriffsvektoren.test.ts`, `env-register.test.ts` | Prüfen jetzt den zentralen Auswertungsweg statt des literalen `process.env`-Zugriffs — und zusätzlich, dass **kein** zweiter Weg danebensteht. |

---

## 8. Was NICHT gemacht wurde

- **Kein Schalter umgelegt.** Beide Versand-Flags bleiben ungesetzt,
  `CAMT_IMPORT_MODE` steht auf DRY_RUN. Das Umlegen ist eine
  Geschäftsentscheidung; die vollständige Reihenfolge steht in
  `docs/ENV_KONFIGURATION.md` §1.
- **Keine echte Rechnung, Mahnung, Bankdatei, Zahlung.**
- **Keine Preise erfunden**, keine Freigaben oder Zertifikate behauptet.
- **Kein Eingriff in die Mahnfristen.** 14/28/42/56/70 Tage unverändert; das
  Gate macht das Mahnwesen ausschließlich **zurückhaltender**, nie aggressiver.

### Offen, außerhalb dieses Auftrags

`npm run check:schema-drift` meldet **8 vorbestehende Befunde** in Dateien, die
diese Phase nicht angefasst hat. Jeder lässt die betreffende Abfrage mit 42703
scheitern:

| Datei | Spalte |
|---|---|
| `lib/billing/core/payments.ts:412` | `payment_allocations.paid_amount` (`.eq`) |
| `lib/billing/core/sammelrechnung.ts:427` | `service_records.leistungsart` (`.in`) |
| `lib/pilot/control-center.ts:189` | `zahlungseingaenge.status` (`.eq`) |
| `lib/pilot/control-center.ts:194` | `klaerfaelle.ist_ruecklastschrift` (`.eq`) |
| `lib/pilot/control-center.ts:413/414` | `dunning_email_queue.block_dunning`, `.dunning_level`, `.next_dunning_at` |

Die ersten beiden liegen auf Geldpfaden. **Der Check ist weder in CI noch im
Precommit-Guard verdrahtet** — das ist der Grund, warum die Befunde überlebt
haben, und der eigentliche Punkt: eine Prüfung, die niemand ausführt, ist keine.
Beides gehört in eine eigene Runde.

---

## 9. Neue Dateien

| Zweck | Pfad |
|---|---|
| Versand-Schalter (rein, testbar) | `lib/config/versand-flags.ts` |
| Audit dazu | `lib/config/versand-flags-audit.ts` |
| CAMT-Betriebsart | `lib/billing/camt/camt-modus.ts` |
| CAMT-Preflight | `lib/billing/camt/camt-preflight.ts` |
| CAMT-Pilot-Bericht | `lib/billing/camt/camt-preflight-bericht.ts` |
| Rechnungs-Preflight (16 Punkte) | `lib/billing/preflight/rechnung-preflight.ts` |
| Mahn-Safety-Gate (10 Sperren) | `lib/billing/dunning/mahn-safety-gate.ts` |
| CAMT-Trockenlauf-Route | `app/api/billing/camt/preflight/route.ts` |
| Rechnungs-Preflight-Route | `app/api/billing/invoices/[id]/preflight/route.ts` |
| Tests | `__tests__/config/versand-flags.test.ts`, `…/versand-flags-audit.test.ts`, `__tests__/billing/camt-preflight.test.ts`, `…/rechnung-preflight.test.ts`, `…/rechnung-preflight-pflicht.test.ts`, `…/mahn-safety-gate.test.ts` |

---

## 10. Nächster sinnvoller Schritt

Unverändert **Erstbetrieb** — aber jetzt mit einer Vorstufe, die vorher fehlte:

1. **Eine echte Bankdatei durch `POST /api/billing/camt/preflight?format=text`
   schicken.** Kostet nichts, bucht nichts, und beantwortet vorab, was der
   scharfe Import täte.
2. **Eine echte Rechnung durch `GET /api/billing/invoices/<id>/preflight`.**
   Steht dort nicht `READY_FOR_SEND`, verschickt der Automat auch mit gesetztem
   Schalter nichts — der Preflight nennt den Grund.
3. Erst danach die Schalter in der Reihenfolge aus `docs/ENV_KONFIGURATION.md` §1.

**Parallel, ohne externe Abhängigkeit:** die 8 Schema-Drift-Befunde aus §8 und
die Verdrahtung von `check:schema-drift` in CI.
