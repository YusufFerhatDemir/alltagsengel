# Prüfung: Security-Guards, Priority Inbox, ATS — 12.09.2026

**Ausgangsstand:** `909110b6` · kein Truth Reset, Prüfung auf dem laufenden Code
**Keine PII-Inhalte in diesem Bericht** — nur Pfad, Kategorie, Severity.

---

## TRACK 1 — Security-Guards

### 1.1 · 1.2 Beide Läufe grün

| Lauf | Ergebnis |
|---|---|
| `npm run lint:pii` | **Exit 0** — 5.184 getrackte Dateien geprüft, Bestand 11, **0 neu** |
| `bash scripts/ci-secret-scan.sh` | **Exit 0** — clean |

### 1.3 `.gitignore`-Härtung ist korrekt — und zwar jetzt erst

| Kennzahl | Wert |
|---|---|
| Muster im PII-Block | **41** |
| Gegenausnahmen (`!…`) im PII-Block | **0** |

Die Null ist der Punkt. Die erste Fassung (`b136c9d9`) enthielt `!*.ts` und `!*.tsx` als
Schutz für gleichnamigen Quelltext — und hob damit **jede vorherige Ignore-Regel für
TypeScript** auf, weil eine Negation in `.gitignore` ab ihrer Zeile für alles Folgende
gilt. Sichtbar an `next-env.d.ts`. In `909110b6` durch endungsspezifische Muster ersetzt.

**Beidseitige Gegenprobe, 15 Fälle, alle wie erwartet:**

| Kategorie | Severity | ignoriert |
|---|---|---|
| Führungszeugnis | KRITISCH | ✓ |
| Ausweis | KRITISCH | ✓ |
| Bankdokument | KRITISCH | ✓ |
| Berufsurkunde | HOCH | ✓ |
| Arbeitsvertrag | HOCH | ✓ |
| Entgeltunterlage | HOCH | ✓ |
| Personenstand | HOCH | ✓ |
| Kamerascan (2 Formen) | HOCH | ✓ |
| Versicherung | MITTEL | ✓ |

Fünf Quelldateien mit gleichlautenden Namen (u. a. `Schritt09Fuehrungszeugnis.tsx`,
`leistungsnachweis-scan.tsx`, `verify-security-delta-phase4-iban.mjs`) bleiben **getrackt**.

---

## TRACK 2 — Priority Inbox und CI

### 2.1 CI-Stand, frisch gemessen

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | **0** |
| `npx vitest run` | **0** — 476 Dateien, **10.448 Tests**, 38 übersprungen |
| `npm run test:unit` | **0** — 2.770 Tests, 0 Fehler |
| `npm run lint` (ESLint) | **0** |
| `npm run build` | **0** — „Compiled successfully in 31,0 s" |

### 2.2 Alle sieben Körbe geprüft — Logik und Live-Daten

`__tests__/leads/koerbe.test.ts` und vier weitere Lead-Suiten: **97 Tests, alle grün.**

Live gegen die Produktionsdaten (`scripts/verify-koerbe-live.ts`):

| Korb | Live |
|---|---|
| Heute fällig | 0 |
| Überfällig | 1 |
| Dringend | 47 |
| Neu | 1 |
| Terminwünsche | 2 |
| Rückrufe | 8 |
| Bewerber | 36 |
| **in ≥ 1 Korb** | **50 von 50** |
| **ohne Korb** | **0** |

Die Summe der Körbe (95) ist größer als die Zahl der Vorgänge (50) — Absicht: ein
Bewerber kann überfällig sein. Entscheidend ist die letzte Zeile: **kein Vorgang fällt
durch das Raster.** Vor dem Rückfall-Fix in `b136c9d9` waren es zwei.

### 2.3 Follow-up-Kette

| Frage | Antwort |
|---|---|
| Letzter Lauf | **12.09.2026, 05:29:51 UTC** |
| Lauftage insgesamt | genau einer (`2026-09-12`) — die Kette ist neu |
| Greift der Dedupe? | **ja**: 3 Meldungen an 3 Empfänger, 1:1, **0 Doppel** |
| Audit-Zeilen `lead_follow_up_lauf` | **0** — erwartet |

Die Null bei den Audit-Zeilen ist kein Fehler: Migration `20261105000000` erweitert den
CHECK auf `mis_audit_log.action` und ist **nicht angewendet** (DDL braucht den
SQL-Editor). Bis dahin meldet `logAuditEventOrWarn` eine sichtbare AUDIT-LÜCKE ins Log,
statt still zu scheitern — der Lauf selbst bleibt unberührt.

### 2.4 Deep-Link `?korb=dringend`

Verdrahtet in `app/admin/posteingang/page.tsx:114–115`: der Parameter wird gelesen und
gegen `KOERBE` validiert, ein unbekannter Wert wird ignoriert statt die Liste zu leeren.

**Nicht im Browser bestätigt** — `/admin/posteingang` ist auth-gesichert, es wurden keine
Zugangsdaten eingegeben. Belegt sind Typecheck, ESLint, Build und die Korblogik selbst.

---

## TRACK 3 — ATS und Bewerber

### 3.1 Statusmodell — alle 15 angeforderten Werte sind abgedeckt

Nicht als eine Kette von 15, sondern auf **drei Achsen**. Die Zuordnung:

| # | Angefordert | Umgesetzt als |
|---|---|---|
| 1 | NEU | Stufe `neu` |
| 2 | VORGEPRÜFT | Stufe `vorgeprueft` |
| 3–5 | PRIO_1 / _2 / _3 | **Achse `prio`** (`1`, `2`, `3`) |
| 6 | KONTAKTIERT | Stufe `kontaktiert` |
| 7 | GESPRÄCH | Stufe `vorstellungsgespraech` (Label „Gespräch") |
| 8 | UNTERLAGEN_FEHLEN | **Achse `blocker`** → `unterlagen_fehlen` |
| 9 | FZ_FEHLT | **Achse `blocker`** → `fz_fehlt` |
| 10 | QUALIFIKATION_PRÜFEN | **Achse `blocker`** → `qualifikation_pruefen` |
| 11 | ZUSAGE | Stufe `zusage` |
| 12 | VERTRAG | Stufe `vertrag` |
| 13 | EINSATZBEREIT | Stufe `einsatzbereit` |
| 14 | ABGELEHNT | Stufe `abgelehnt` |
| 15 | ARCHIVIERT | Stufe `archiviert` |

Dazu zwei vorbestehende Stufen: `rueckfrage` und `unterlagen`.
**Bestand: 11 Stufen + 3 Prioritäten + 3 Blocker = 17 Zustandswerte.**

Warum drei Achsen und nicht eine Kette: Ein Bewerber ist PRIO 1 **und** im Gespräch
**und** ohne erweitertes FZ — gleichzeitig. In einer linearen Kette verlöre jeder
Stufenwechsel eine dieser Angaben. Der Test dazu ist explizit: ein Stufenwechsel darf die
Priorität nicht löschen (er hat beim Schreiben einen echten Fehler gefunden).

### 3.2 Tests

| Suite | Ergebnis |
|---|---|
| `bewerber-pipeline` · `bewerber-filter` · `koerbe` · `posteingang` · `anfrage-felder` | **97 Tests grün** |

### 3.3 Fehlende Dimensionen

| # | Dimension | Stand |
|---|---|---|
| 1 | **Startdatum** | **fehlt vollständig** — `BewerbungDaten` hat kein Feld, der Katalog keinen Eintrag, das Formular fragt nichts ab. Ein Filter darauf ist nicht nachrüstbar, ohne zuerst das Feld zu erheben. |
| 2 | **Erweitertes FZ vorhanden?** | **nur negativ** — als Blocker `fz_fehlt`, den die Verwaltung selbst setzt. Es gibt keine positive Angabe aus dem Formular („liegt vor, ausgestellt am …"). |
| 3 | ~~Region~~ | **geschlossen** (siehe unten) |

**Region war die Ausnahme mit Anhang.** Sie hing als einziger Filter handverdrahtet in
`app/admin/applications/page.tsx` — eigener `useState`, eigene Zählung, eigene Zeile in
der Auswahlbedingung — und hatte deshalb als einzige **keine Abdeckungsanzeige**
(„Ohne Angabe (34)"). Jetzt im deklarativen Modell: **11 Dimensionen**, alle gleich
behandelt, alle geprüft.

### 3.4 Die beiden Namen in der Datenbank

**Nicht kontaktiert.** Nur Metadaten, keine Kontaktdaten wiedergegeben.

| Name | In der DB | Befund |
|---|---|---|
| **Claudia Adjovi** | **ja** | `status=new` · Quelle `engel-bewerbung` · Eingang **02.09.2026** · PLZ 63739 · Telefon vorhanden, **keine E-Mail** · **kein UTM** |
| **Mohamed Semmami** | **nein** | 0 Treffer, auch nicht unter `semm*`, `mohamed`, `mohammed`, `muhamm*` |

**Zu Claudia Adjovi, und das ist der wichtigere Teil:** Ihr Datensatz trägt
`bewerbung_daten = null`. Die Qualifikationsangabe („Sozialbetreuerin +
Pflegefachhelferin, 8 Jahre") steht **im Freitextfeld** (599 Zeichen) und im
`service`-Feld (`Engel-Bewerbung (Pflegehelfer/in)`) — **nicht** in strukturierten Feldern.
Die elf Filter erreichen sie daher nicht. Und ihre PRIO-1-Einstufung existiert **nur als
Prosa in einem Report**, nicht im System.

**Mohamed Semmami** ist der zweite Fall dieser Art nach Birgit Fritzsch: ein Bewerber, den
jemand kennt, den der Funnel aber nie gesehen hat.

### 3.5 Der Befund, der über allem steht

| Kennzahl | Wert |
|---|---|
| Bewerbungen in `lead_inquiries` | **36** |
| mit strukturierten Formularangaben | **2** |
| mit gespeicherter Pipeline-Stufe | **0** |
| mit gesetzter Priorität | **0** |

**Das ganze ATS-Statusmodell ist gebaut, getestet — und in den Livedaten unbenutzt.**
11 Stufen, 3 Prioritäten, 3 Blocker, 11 Filterdimensionen: null Zeilen tragen davon
etwas. Die Priorisierung der 36 Bewerbungen existiert als Text in
`LEAD_TRUTH_RESET_12_09_2026.md`, nicht als Zustand in der Datenbank.

Das ist keine Lücke im Code. Es ist eine Lücke zwischen Werkzeug und Gebrauch: Jemand muss
die 36 Bewerbungen **einmal** durch die Oberfläche einstufen, dann rechnet das Modell
mit. Solange das nicht geschieht, ist jeder Filter auf Prio oder Blocker leer, und die
Follow-up-Kette arbeitet nur mit den Stufen, die sie aus `status` ableiten kann.

---

## Statusübersicht

### VERIFIED_LIVE

| Was | Beleg |
|---|---|
| Korbabdeckung | **50/50** in ≥ 1 Korb, **0 ohne** |
| Follow-up-Lauf | 12.09.2026 05:29:51 UTC, Dedupe 1:1, 0 Doppel |
| Secrets im getrackten Baum | **0** (`ci-secret-scan` Exit 0) |
| PII-Bestand | 11 bekannt, **0 neu** (`lint:pii` Exit 0) |
| Claudia Adjovi | in der DB, `status=new`, ohne strukturierte Angaben |
| Mohamed Semmami | **nicht** in der DB |
| ATS-Datenlage | 2/36 strukturiert · **0/36 Stufe** · **0/36 Priorität** |
| Audit-Zeilen der Kette | 0 — Migration nicht angewendet, wie erwartet |

### VERIFIED_LOCAL

`typecheck 0` · `ESLint 0` · `vitest 10.448` · `node:test 2.770` · `build 0` ·
9 projekteigene Lints 0 · `.gitignore` 41 Muster / 0 Negationen, 15 Fälle gegengeprüft ·
97 Lead-Tests · Region als 11. Filterdimension konsolidiert

### Was noch fehlt

| # | Punkt | Art |
|---|---|---|
| 1 | **36 Bewerbungen einmal einstufen** | USER_ACTION — ohne das bleibt das ATS-Modell leer |
| 2 | **Startdatum erheben** | Formularfeld fehlt; Filter erst danach möglich |
| 3 | **Erw. FZ als positive Angabe** | heute nur als Blocker abbildbar |
| 4 | Migration `20261105000000` einspielen | BLOCKED_EXTERNAL (SQL-Editor) |
| 5 | Oberflächenprüfung `/admin/posteingang` und `/admin/applications` | Login nötig, nicht durchgeführt |
| 6 | Zweiter Cron-Lauftag | erst ein Lauf vorhanden; Dedupe über Tagesgrenze noch unbelegt |
