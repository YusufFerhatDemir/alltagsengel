# Phase 8, Tracks 1–4 — Pilot-Snapshot, Rechnungs-Pilot, Einmal-Freigabe, Nachprüfung

Stand 26.08.2026. Vorgänger: `docs/reports/PHASE7_MONEY_PATH_PILOT.md`,
Gesamtlage: `docs/reports/MASTER_HANDOFF_LATEST.md`.

> ## Was in diesen vier Tracks NICHT passiert ist
>
> **Keine Rechnung versendet. Keine Mahnung verschickt. Keine Bankdatei
> importiert. Keine Zahlung verbucht. Keine Migration angewendet. Kein
> Schalter umgelegt.**
>
> `FIRST_REAL_INVOICE_APPROVED` steht im Quelltext auf `false`,
> `PILOT_ERSTVERSAND_FREIGEGEBEN` ist nicht gesetzt, beide Versand-Flags sind
> ungesetzt, `CAMT_IMPORT_MODE` steht auf DRY_RUN. Ein Test hält jede dieser
> Zusicherungen einzeln fest.

---

## 0. Was Phase 8 gegenüber Phase 7 hinzufügt

Phase 7 hat für jeden Geldpfad eine **Vorstufe** gebaut, die das Ergebnis
zeigt, ohne es auszulösen. Das beantwortet die Frage „was würde passieren?".

Es beantwortet drei andere Fragen nicht:

1. **Wogegen** liefe der Vorgang? Der Commit, die Datenbank, die
   Schalterlage standen in einem Handoff-Dokument — also in Prosa, von Hand
   gepflegt, mit dem Stand von gestern. → **Track 1**
2. Darf ausgerechnet **dieser** Beleg der erste sein? Der 16-Punkte-Preflight
   beantwortet die Frage des Regelbetriebs. Für den Erstbetrieb ist sie zu
   milde gestellt. → **Track 2**
3. Was hindert daran, den Erstversand **zweimal** oder für die **falsche**
   Rechnung auszulösen? Alle bisherigen Bedingungen sind wiederholbar. →
   **Track 3**, und die Gegenprobe danach → **Track 4**

---

## 1. Track 1 — `PRE_PILOT_SNAPSHOT`

`lib/pilot/pre-pilot-snapshot.ts` · Route `GET /api/pilot/snapshot`
(nur lesend, `?format=text` für die menschenlesbare Fassung)

Sieben Abschnitte: Code, Deployment, Datenbank, Migrationen, Sicherheit,
Zustellung, Schalter.

### Die zentrale Entscheidung: jeder Punkt trägt seine Herkunft

| Herkunft | Bedeutung |
|---|---|
| `gemessen` | Zur Laufzeit gegen die echte Umgebung/Datenbank ermittelt |
| `gemeldet` | Vom Aufrufer hereingereicht (Git, CI) — nicht nachgeprüft |
| `dokumentiert` | Belegter Wert aus einem Prüflauf, der hier nicht wiederholbar ist |
| `nicht_messbar` | Es gibt keinen Wert. Nicht 0, nicht „ok" |

Ohne diese Unterscheidung sähe ein abgeschriebener Wert genauso aus wie ein
gemessener — der Snapshot wäre ein zweites Handoff-Dokument mit dem Anschein
von Messung, und das ist **schlechter als gar keiner**.

Zwei Tests halten das fest: **kein `dokumentiert`-Punkt und kein
`nicht_messbar`-Punkt darf grün erscheinen.**

### Was zur Laufzeit wirklich messbar ist — und was nicht

**Messbar:** der laufende Commit (`VERCEL_GIT_COMMIT_SHA`), die
Vercel-Umgebung, der Supabase-Projekt-Ref, die Erreichbarkeit der Datenbank,
die Existenz des angefragten Mandanten, die Erreichbarkeit des Audit-Trails,
das Vorhandensein von `RESEND_API_KEY`/`CRON_SECRET`, und **alle drei
Schalter**.

**Nicht messbar:** `git rev-parse` läuft auf dem Rechner, der deployt hat,
nicht in der Serverless-Funktion. `origin/main` und der CI-Ausgang werden
deshalb als `?git=…&origin=…&ci=…` hereingereicht und als `gemeldet`
ausgewiesen. Ebenfalls nicht messbar: die RLS-Abdeckung (`pg_tables` ist über
PostgREST nicht exponiert) und die Frage, ob eine Migration live angewendet
ist (`supabase_migrations.schema_migrations` liegt in einem nicht exponierten
Schema).

> **Der wertvollste Punkt im ganzen Snapshot** ist trotzdem der Abgleich der
> drei Commit-Werte. Weichen sie ab, beschreibt **jede** Aussage darunter
> einen anderen Stand als den, der gerade Post verschicken würde. Der Punkt
> ist dann rot, nicht gelb.

### Zwei Fehlerbilder, die sonst gleich aussehen

`organizations` wird nicht auf Erreichbarkeit, sondern auf **genau diesen
Mandanten** gezählt. Ein Lesefehler ergibt `null` („Datenbank tot"), eine 0
ergibt `false` („Mandant existiert dort nicht"). Ohne diese Frage wären beide
Zustände ununterscheidbar, und der zweite ließe jede folgende Zählung leer
aussehen — nicht weil nichts da ist, sondern weil der Mandant nicht stimmt.

Dasselbe für einen falschen Supabase-Projekt-Ref: `ERWARTETER_PROJEKT_REF`
steht im Code, eine Abweichung ist **rot**. Ein grüner Bericht über die
falsche Datenbank wäre die gefährlichste Antwort, die dieses Modul geben
kann.

### Keine Geheimnisse

Von `RESEND_API_KEY` und `CRON_SECRET` steht im Snapshot ausschließlich, **ob**
sie gesetzt sind. Ein Test setzt einen erkennbaren Wert und prüft, dass er
weder im JSON noch in der Textfassung auftaucht.

### Die Migrationsliste

`JUENGSTE_MIGRATIONEN` ist eine Konstante, kein Verzeichnis-Scan:
`supabase/migrations` wird nicht mit ins Serverless-Bundle gepackt, ein
`readdir` zur Laufzeit fände dort nichts und lieferte eine leere Liste, die
wie „keine Migrationen" aussähe.

Ein Test hält die Konstante gegen das echte Verzeichnis und nennt bei
Abweichung die vollständige Ersatzliste in der Fehlermeldung. **Beim nächsten
Migrationsschritt ist diese Liste nachzuziehen** — das ist der bewusst
eingekaufte Preis dafür, dass der Snapshot nicht still einen Stand von
vorgestern behauptet.

---

## 2. Track 2 — Rechnungs-Pilot

`lib/pilot/rechnung-pilot.ts` · Route `GET /api/billing/invoices/[id]/pilot`
(nur lesend, `?format=text`)

Führt `pruefeRechnungVersandbereit()` **vollständig** aus (alle 16 Punkte) und
legt drei Pilot-Prüfungen darüber. Drei Urteile: `READY_FOR_SEND` /
`NEEDS_REVIEW` / `BLOCKED`.

### Der Auftragskatalog ist auf den bestehenden abgebildet, nicht danebengebaut

Der Auftrag nennt **siebzehn** Gegenstände, der Katalog hat **sechzehn**
Punkte — „Organisation" und „Rechnungssteller" sind derselbe Punkt (die
eigene Firma mit Beleg-Pflichtangaben und Bankverbindung, alles an
`organizations`).

`AUFTRAGS_KATALOG` bildet das explizit ab. Die naheliegende und falsche
Antwort wäre gewesen, einen siebzehnten Punkt danebenzustellen — dann gäbe es
zwei Kataloge, die auseinanderlaufen. Zwei Tests prüfen **beide Richtungen**:
jeder Auftragsname trifft einen existierenden Punkt, und kein Punkt bleibt
ohne Auftragsnamen.

| Auftrag | Punkt | | Auftrag | Punkt |
|---|---|---|---|---|
| Organisation | 2 `mandant` | | PDF | 11 `pdf` |
| Kunde | 1 `kunde` | | ZUGFeRD | 12 `xrechnung` |
| Rechnungsnummer | 4 `rechnungsnummer` | | Audit | 16 `audit` |
| Empfänger | 3 `empfaengeradresse` | | Duplikat-Schutz | 15 `kein_doppelversand` |
| Leistungszeitraum | 5 `leistungszeitraum` | | Cross-Tenant | 14 `mandantengrenze` |
| Positionen | 6 `positionen` | | Testdaten | 13 `testdaten` |
| Preise | 7 `preise` | | Steuern | 8 `steuern` |
| Betrag | 9 `betrag` | | IBAN | 10 `bankdaten` |
| Rechnungssteller | 2 `mandant` | | | |

### Was der Pilot hinzufügt: zwei weitere Doppelversand-Beine

Der Preflight kennt **einen** Riegel gegen Doppelversand: `invoices.sent_at`.
Genau dieses Feld wird beim Versand **zuletzt** gesetzt. Steht die Mail beim
Kunden und der anschließende UPDATE scheitert, ist `sent_at` leer und der
Beleg sieht wieder unversendet aus — der Versandweg protokolliert das
absichtlich fail-soft, weil ein Fehlerpfad nach angenommener Mail einen
Wiederholungslauf auslösen würde.

Der Pilot prüft deshalb zusätzlich die beiden Quellen, die davon unabhängig
sind:

| Bein | Quelle | Was es fängt |
|---|---|---|
| 1 (Preflight) | `invoices.sent_at` | den Normalfall |
| **2 (neu)** | `invoice_email_log`, Status `versendet` | den Versand, der nach der Mail abbrach |
| **3 (neu)** | `notification_delivery_log`, Kanal E-Mail, Status `sent`/`delivered` | den verbrauchten Idempotenzschlüssel |

Ein Test belegt das gezielt: bei leerem `sent_at` steht Punkt 15 auf
`erfuellt` — und das Urteil trotzdem auf `BLOCKED`.

Dazu als vierte Prüfung die **offene Versandsperre** aus Track 4, mandantenweit
(`invoice_id IS NULL`) oder auf diesen Beleg bezogen. Eine Sperre, die der
Vorlauf nicht liest, hält nichts auf.

### Fail-closed, und zwar strenger als im Regelbetrieb

Ist eine der drei Quellen **nicht lesbar**, ist das Urteil `BLOCKED` — nicht
„vermutlich in Ordnung". Im Regelbetrieb wäre das zu streng (ein
Protokollausfall darf den Versand nicht anhalten); beim allerersten Versand
ist es umgekehrt: durch Warten geht nichts verloren, durch eine zweite Mail
an einen echten Kunden sehr wohl.

Geprüft wird auch der Fall, den Befund F-1 aus Phase 7 aufgedeckt hat: der
PostgREST-Client meldet einen Verbindungsabbruch als **geworfene Ausnahme**,
nicht als `error`-Feld. Beide Wege führen zu `BLOCKED`.

### Der Pilot kann nicht versenden

Ein Test liest die **Import-Zeilen** der Datei (nicht den Volltext — der
Modulkopf nennt den Versandweg in Prosa, weil er sich von ihm abgrenzt) und
schlägt an, sobald `rechnung-versand`, `sendRawEmail`, `rechnung-paket`,
`notifications` oder `mahn-versand` darin auftaucht. Zwei weitere Tests
prüfen, dass **kein** Datenbankaufruf schreibt — auch nicht im Blockierfall.

Die Textfassung gibt die **vollständige E-Mail-Adresse nicht aus**
(`m***@web.de`): ein Pilotbericht wird herumgereicht, und der Empfänger einer
Pflegerechnung benennt den Kunden einer Gesundheitsleistung.

---

## 3. Track 3 — Einmal-Freigabe

`lib/pilot/send-gate.ts` · Migration `20261005000000_pilot_send_gate.sql`
Routen: `GET/POST/DELETE /api/billing/invoices/[id]/freigabe`

### Die Grundstellung

```ts
export const FIRST_REAL_INVOICE_APPROVED = false
```

Eine Konstante und kein Funktions-Standardwert: sie zu ändern heißt, einen
Commit zu schreiben, der im Diff steht. Für den laufenden Betrieb gibt es
`PILOT_ERSTVERSAND_FREIGEGEBEN`; **nur der exakte Wert `'1'`** gibt frei
(nicht getrimmt, dieselbe Strenge wie bei den Versand-Schaltern). Ein Test
geht `'0'`, `'true'`, `'ja'`, `'yes'`, `' 1'`, `'1 '`, `'JA'`, `''` einzeln
durch.

### Warum der Aufrufer den Preflight-Stand nicht mitbringt

`erzeugeSendeToken()` nimmt **kein** Preflight-Ergebnis entgegen — es führt
den Piloten selbst aus, und Empfänger und Betrag kommen aus der Datenbank.

Käme das Urteil aus dem Request, wäre die stärkste Sperre des Systems ein
Feld in einem Request-Body: eine Oberfläche, die
`preflight_status: 'READY_FOR_SEND'` mitschickt, hätte sich die Freigabe
selbst ausgestellt. Der Auftrag verlangt ausdrücklich das Gegenteil („keine
UI-Manipulation allein kann Versand auslösen"), und das geht nur so: **der
Server prüft, der Client fragt.**

Optional darf der Body die **Bestätigung** dessen enthalten, was auf dem
Bildschirm stand (`empfaenger`, `betragCent`). Weicht sie vom hinterlegten
Stand ab, wird abgelehnt — ein bestätigter Bildschirm, der etwas anderes
zeigte als die Datenbank, ist keine Freigabe.

`NEEDS_REVIEW` bekommt **kein** Token. Im Regelbetrieb darf ein Mensch das
verantworten; beim ersten Versand gibt es keine Erfahrung, auf die er sich
stützen könnte.

### Drei Riegel, zwei davon in der Datenbank

| Riegel | Wo |
|---|---|
| Jedes Feld wird abgeglichen (Rechnung, Empfänger, Betrag, Gültigkeit, Zustand) | TypeScript |
| Höchstens **ein offenes** Token je Rechnung | `pilot_send_gate_offen_je_rechnung` (UNIQUE, partiell) |
| Höchstens **ein verbrauchtes** Token je Rechnung | `pilot_send_gate_einmal_verbraucht` (UNIQUE, partiell) |
| Nur `READY_FOR_SEND` ist als Preflight-Stand speicherbar | `CHECK (preflight_status = 'READY_FOR_SEND')` |

Der zweite Index **ist** die Doppelversand-Sperre: ein zweiter erfolgreicher
Versand derselben Rechnung kann nicht protokolliert werden, also findet er
nicht statt — auch bei zwei gleichzeitigen Läufen, dort mit `23505` statt
einer zweiten Erlaubnis. Der Code übersetzt diesen Fehlercode ausdrücklich
als „die Sperre bei der Arbeit" statt als Datenbankproblem; sonst sucht
jemand eine Stunde nach der falschen Ursache.

### Der Verbrauch ist ein bedingtes UPDATE, kein Lesen-dann-Schreiben

```
.update({ verbraucht_am, verbraucht_von })
.eq('id', token).eq('organization_id', …).eq('invoice_id', …)
.is('verbraucht_am', null).is('entwertet_am', null)
.select('id')
```

Die Bedingung wird von Postgres **beim Schreiben** ausgewertet. Wer verliert,
bekommt null Zeilen zurück und weiß daran, dass ein anderer schneller war.
Ein „erst lesen, dann schreiben" hätte genau hier ein Zeitfenster — und das
Fenster wäre eine zweite Rechnung beim Kunden.

### Reihenfolge: erst verbrauchen, dann senden

Bricht der Lauf zwischen Verbrauch und Mail ab, ist das Token verbrannt und
ein Mensch stellt nach einer Sichtung ein neues aus. Andersherum wäre ein
Abbruch genau der Zustand, in dem ein Wiederholungslauf ein zweites Mal
senden dürfte. **Ein verbranntes Token kostet eine Minute; eine zweite
Rechnung beim Kunden kostet Vertrauen.**

### Was zwischen Ausstellung und Verwendung passiert sein kann

`pruefeSendeToken()` liest bei jeder Prüfung erneut das Versandprotokoll und
die Sperrtabelle. Ohne diesen Schritt wäre das Token eine Freigabe für einen
Zustand von vorhin — dieselbe Lücke wie bei einem Dashboard, das seine
Zählung als Erlaubnis weiterreicht.

### Angriffsrichtungen, die die Suite durchgeht

ohne Freigabe · ohne Token · Token mit falschem Format (wird abgelehnt,
**ohne** die Datenbank zu fragen — PostgREST antwortete sonst mit `22P02`,
und ein Formatfehler soll nicht wie ein Datenbankproblem aussehen) ·
unbekanntes Token · fremdes Token (der Mandant steht im `WHERE`, ein fremdes
Token ist damit schlicht *unbekannt* und gibt sich nicht als „existiert, gehört
aber woanders hin" zu erkennen) · verbrauchtes · entwertetes · abgelaufenes ·
Token ohne `READY_FOR_SEND` · richtiges Token auf **anderer** Rechnung ·
geänderter Empfänger · geänderter Betrag · zweiter Verbrauch · inzwischen
protokollierter Versand · inzwischen gesetzte Sperre · jede Quelle einzeln
unlesbar.

---

## 4. Track 4 — Nachprüfung nach dem Versand

`lib/pilot/post-send-verification.ts`

Acht Prüfpunkte gegen einen erfolgten Versand:

| # | Punkt | Was er fängt |
|---|---|---|
| 1 | Resend hat angenommen | ein „übersprungen"/„fehlgeschlagen", das durchgereicht wurde |
| 2 | Provider-Kennung vorhanden **und im Protokoll** | ein Protokoll, das zu einem **anderen** Versand gehört |
| 3 | Genau **eine** Erfolgszeile in `invoice_email_log` | null (Mail draußen, im Haus nichts davon) oder zwei |
| 4 | Keine Retry-Dublette in der Zustellspur | zwei Erfolgszeilen, oder `attempt_count > 1` |
| 5 | Empfänger, Betreff und Betrag stimmen | einen Beleg über einen anderen Betrag, als versendet wurde |
| 6 | Audit-Eintrag `email_versendet` vorhanden | den fail-soft verschluckten Audit-Fehler |
| 7 | `invoices.sent_at` gesetzt | genau den Zustand, aus dem ein Doppelversand entsteht |
| 8 | Keine fremde Organisation betroffen | eine Zeile zu diesem Beleg unter einem anderen Mandanten |

### Punkt 8 liest bewusst OHNE Mandantenfilter

`invoice_email_log` und `notification_delivery_log` werden über
`invoice_id` bzw. `correlation_id` gelesen, **ohne** `organization_id`. Das
ist keine vergessene Grenze, sondern der Prüfgegenstand: gäbe es eine Zeile
unter einer fremden Organisation, würde ein org-gefilterter Lauf sie **nicht
sehen** — und das ist der Zustand, den niemand bemerkt. Ein Test prüft
ausdrücklich, dass der Filter dort **fehlt** und bei `invoices` **steht**.

### Ein nicht prüfbarer Punkt zählt wie eine Abweichung

Der Sinn dieser Datei ist, den ersten Versand zu **bestätigen**. Ein
unbestätigter Versand ist kein bestätigter. `bestanden: null` führt deshalb
genauso zu P0 wie `bestanden: false`.

### Bei jeder Abweichung

1. **P0-Zeile** in `pilot_versand_sperre` — auf diesen Beleg bezogen, oder
   **mandantenweit** (`invoice_id = NULL`), wenn eine fremde Organisation im
   Spiel war: dieser Befund lässt sich nicht auf einen Beleg begrenzen.
   Die Einzelbefunde gehen als JSONB mit, damit die Sperre begründbar bleibt.
2. **Alle offenen Einmal-Freigaben** des Mandanten werden entwertet — sie
   beziehen sich auf einen Zustand, den es nicht mehr gibt.
3. Audit-Eintrag `pilot_nachpruefung_abweichung`, **fail-soft**: der Versand
   ist bereits passiert, ein geworfener Audit-Fehler darf den Aufrufer nicht
   in einen Fehlerpfad schicken. Die Sperre steht ohnehin.

Konnte die Sperre selbst **nicht** geschrieben werden, trägt das Ergebnis
`sperreFehlgeschlagen: true` und die Textfassung sagt es wörtlich: *„Weitere
Sendungen müssen VON HAND gestoppt werden."* Das ist der schwerste denkbare
Zustand — etwas ist schiefgegangen **und** nichts hält den nächsten Versand
auf.

### Die Nachprüfung heilt nichts

Sie setzt kein `sent_at` nach, legt keine fehlende Protokollzeile an und
löscht keine doppelte. Ein Prüfwerkzeug, das seine eigenen Befunde wegräumt,
kann sie beim nächsten Mal nicht mehr finden — und was hier fehlt, ist immer
eine Frage für einen Menschen. Ein Test hält die Menge der beschriebenen
Tabellen auf `pilot_versand_sperre`, `pilot_send_gate` und
`billing_audit_trail` fest.

---

## 5. Migration `20261005000000_pilot_send_gate.sql` — **wartet auf Apply**

⚠️ **Nicht angewendet.** DDL geht in diesem Repo nur über den
Supabase-SQL-Editor (siehe `docs/reports/MASTER_HANDOFF_LATEST.md`).

Zwei Tabellen, beide mit RLS, Admin-Policy und **RESTRICTIVE** `org_fence`,
transaktional gekapselt, mit Rollback (`20261005000001`).

> ### ‼️ Wirkung, solange die Migration nicht eingespielt ist
>
> `pruefeRechnungFuerPilot()` antwortet für **jede** Rechnung mit `BLOCKED`,
> Begründung: `pilot_versand_sperre` ist nicht lesbar. Das ist **richtig**
> (fail-closed) und trotzdem eine Aussage, die man kennen muss, bevor man den
> Bericht liest: der Trockenlauf ist erst nach dem Apply aussagekräftig.
>
> Dasselbe gilt für die Einmal-Freigabe — ohne `pilot_send_gate` lässt sich
> kein Token anlegen. Der bestehende Preflight
> (`GET /api/billing/invoices/[id]/preflight`) ist davon **nicht** betroffen
> und bleibt unverändert benutzbar.

`npm run check:schema-drift` meldet für die beiden neuen Tabellen nichts: der
Zuordner überspringt Tabellen, die er im Live-Schema nicht kennt. **Das ist
kein grünes Licht für sie**, sondern die dokumentierte Grenze des Checks bei
wartenden Migrationen.

---

## 6. Was ausdrücklich NICHT gebaut wurde — und warum

| Nicht gebaut | Begründung |
|---|---|
| **Die Verdrahtung des Gates in `versendeRechnungPerEmail()`** | Das wäre eine Änderung am produktiven Versandweg. Der Auftrag verlangt das Gate als Modul mit Tests („aber nicht wirklich senden im Test") und zieht die Stop-Grenze bei „keine echte Rechnung senden". Die Verdrahtung ist der **nächste** Schritt und eine eigene Entscheidung — sie gehört an den Punkt, an dem der Erstversand tatsächlich ansteht, damit sie nicht wochenlang scharf im Weg steht. |
| **Eine Oberfläche für die Freigabe** | Die Routen sind da und fail-closed. Ein Knopf, der nichts auslösen kann, wäre eine Einladung, ihn scharf zu machen. |
| **Live-Messung von RLS/org_fence im Snapshot** | Über PostgREST nicht abfragbar. Als `dokumentiert` ausgewiesen, mit Prüfbefehl — nicht als Messung getarnt. |

---

## 7. Prüfläufe

| Lauf | Ergebnis |
|---|---|
| `npx tsc --noEmit` | **0 Fehler**, Exit 0 |
| `npm run test:unit` (node:test) | **2.211 grün / 0 rot** |
| `npx vitest run` | **5.792 grün / 38 übersprungen / 0 rot**, 262 Dateien |
| `npm run lint:forbidden` | **0 Treffer** (24.603 Dateien, FULL-Scan, Exit 0) |
| `npm run check:schema-drift` | **0 Befunde** (1.305 Dateien gegen 331 Live-Tabellen) |

**Neu in diesen vier Tracks: 159 Tests.**

| Suite | Tests |
|---|---|
| `__tests__/pilot/pre-pilot-snapshot.test.ts` | 31 |
| `__tests__/pilot/rechnung-pilot.test.ts` | 33 |
| `__tests__/pilot/send-gate.test.ts` | 52 |
| `__tests__/pilot/post-send-verification.test.ts` | 43 |

> **Zur Lesart der Gesamtzahlen.** Der volle vitest-Lauf fand im
> Arbeitsverzeichnis **auch die nicht committeten Dateien einer parallel
> laufenden Session** (Phase 8, Tracks 5–8: `allocation-gate`, `camt-pilot`,
> `mahnwesen-dryrun`, `reconciliation`, `business-inputs`, `pilot-phasen`).
> Die 5.792 sind deshalb **nicht** allein diesem Commit zuzurechnen; die 159
> oben sind es. Node:test und vitest liefen nacheinander, nicht gleichzeitig
> und nicht parallel zum Typecheck.

Der Commit staged ausschließlich die eigenen Pfade (`DEPLOY_PATHS`) — die
Dateien der parallelen Session bleiben unangetastet.

> **`lib/pilot/index.ts` ist bewusst NICHT in diesem Commit.** Beide Sessions
> haben ihre Exporte an dieselbe Sammeldatei angehängt; sie mitzucommitten
> hieße, Exporte auf Module zu schreiben, die es im Repo noch nicht gibt —
> der Build bräche. Die vier neuen Module werden ohnehin **direkt** importiert
> (`@/lib/pilot/send-gate` usw.), von den Routen wie von den Tests; kein
> Import läuft über die Sammeldatei. Sie kommt mit dem Commit der Tracks 5–8
> nach und referenziert dann Module, die bereits liegen — deshalb diese
> Reihenfolge.

---

## 8. Zwei Befunde am eigenen neuen Code

Beide vor dem ersten Einsatz gefunden, beide von den Tests, nicht vom
Nachdenken.

| # | Befund | Wirkung | Schwere |
|---|---|---|---|
| **A-1** | `pruefeVersandsperre()` las `gesetzt_am.slice(0, 10)` unbedingt. Fehlt das Feld, wirft der Zugriff — der `catch` machte daraus den Befund `quelle_unlesbar`. | Aus einer **echten** Sperre wäre „Quelle unlesbar" geworden. Beide blockieren, aber die Begründung hätte jemanden in die falsche Richtung geschickt: er hätte eine Datenbank repariert statt einen P0 gelesen. Gefixt (defensives Lesen). | 🟡 P3 Diagnose |
| **A-2** | Der Regressionstest „importiert den Versandweg nicht" scannte den **Volltext** der Datei. | Der Modulkopf nennt den Versandweg in Prosa (er grenzt sich ja gerade von ihm ab) — der Test war ab der ersten Zeile rot und hätte, um grün zu werden, die Erklärung entfernt statt die Regel geprüft. Umgestellt auf die **Import-Zeilen**. | 🟡 Test |

---

## 9. Nächster sinnvoller Schritt

1. **Migration `20261005000000` im Supabase-SQL-Editor anwenden.** Vorher ist
   der Trockenlauf aus Track 2 nicht aussagekräftig (§5).
2. **`GET /api/pilot/snapshot?format=text` einmal ansehen** — mit `?git=`,
   `?origin=` und `?ci=`, damit der Commit-Abgleich etwas zu vergleichen hat.
   Zeile 1 muss `RUHEND` sagen.
3. **`GET /api/billing/invoices/<id>/pilot?format=text`** auf eine echte
   Rechnung. Steht dort `READY_FOR_SEND`, ist der Beleg ein Kandidat für den
   Erstversand; steht etwas anderes da, nennt der Bericht den Grund.
4. **Erst dann** über die Verdrahtung des Gates in den Versandweg entscheiden
   (§6) — und über `PILOT_ERSTVERSAND_FREIGEGEBEN`.
5. Nach dem Versand **`pruefeNachVersand()` laufen lassen**, bevor irgendein
   zweiter Versand angestoßen wird.

---

## 10. Dateipfade

| Zweck | Pfad |
|---|---|
| Pre-Pilot-Snapshot | `lib/pilot/pre-pilot-snapshot.ts` |
| Rechnungs-Pilot | `lib/pilot/rechnung-pilot.ts` |
| Einmal-Freigabe | `lib/pilot/send-gate.ts` |
| Nachprüfung | `lib/pilot/post-send-verification.ts` |
| Migration (**wartet auf Apply**) | `supabase/migrations/20261005000000_pilot_send_gate.sql` |
| Rollback dazu | `supabase/migrations/20261005000001_rollback_pilot_send_gate.sql` |
| Route Snapshot (lesend) | `app/api/pilot/snapshot/route.ts` |
| Route Pilot-Bericht (lesend) | `app/api/billing/invoices/[id]/pilot/route.ts` |
| Route Freigabe | `app/api/billing/invoices/[id]/freigabe/route.ts` |
| ENV-Verzeichnis-Eintrag | `lib/env/register.ts` → `PILOT_ERSTVERSAND_FREIGEGEBEN` |
| Bestehender Preflight (unverändert) | `lib/billing/preflight/rechnung-preflight.ts` |
| Bestehender Versandweg (unverändert) | `lib/billing/versand/rechnung-versand.ts` |
| Test-Doppelgänger | `__tests__/helpers/supabase-fake.ts` |

---

*Erstellt 26.08.2026 — Phase 8, Tracks 1–4, Alltagsengel*
