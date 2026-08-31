# Master Production Proof — 31.08.2026

| | |
|---|---|
| **Commit** | `88101633` — Nachtrag `c31da31a` (Restblocker 4 geschlossen) |
| **CI-Lauf** | GitHub Actions `33376373932` — **success**, beide Jobs grün |
| **Tests** | vitest **9150** / 404 Dateien · node:test **2659** · Playwright-E2E **148** von 154 (6 übersprungen) |
| **Build** | Production-Build grün, 610 statische Seiten |
| **Messzeitpunkt der Live-Läufe** | **2026-08-31T09:22:36Z** |
| **Datenbank** | Produktion (Stamm-Organisation `00000000-0000-4000-8000-000460629986`, 6 Organisationen) |

> **Ein grüner Testlauf ist kein Beleg dafür, dass etwas live steht.**
> Alle Aussagen unten, die sich auf die Datenbank beziehen, stammen aus
> `verify:*`- und `audit:*`-Läufen gegen die Produktionsdatenbank, nicht
> aus dem Repo.

---

## Ergebnis je Bereich

| Bereich | Status | Beleg |
|---|---|---|
| **CODE** | **PASS** | typecheck grün, `lint:org-id` 0/1502, `lint:route-auth` 0/440, `lint:forbidden` 0/25070 |
| **DB** | **PASS** | 9 Live-Ketten grün gegen Produktion (Zahlen unten) |
| **MIGRATIONS** | **BLOCKED** | 24 von 32 stehen live, **8 offen** — DDL scheitert am Eigentümer (42501) |
| **RLS** | **PARTIAL** | Entscheidung getroffen, Migration geschrieben und geprüft — **0 von 24 Policies live** |
| **SECURITY** | **PASS** (1 Restpunkt) | Security-Kette 7/7 · Perimeter 7/8 (offener Punkt = offene Migration) |
| **PFLEGE-WORKFLOWS** | **PASS** | Dienstplan/Touren 20/20 · Pflege 12/12 · Zeiterfassung 10/10 · Unterschrift 9/10 |
| **BILLING** | **PASS** | Geldweg 12/12 · OPOS/Mahnwesen 17/17 · Abrechnung 10/10 |
| **MARKETING** | **PASS** (Webhook BLOCKED) | Marketing-Kette 16/16 · Webhook live 503, `RESEND_WEBHOOK_SECRET` fehlt |
| **CI** | **PASS** | Run `33376373932`, beide Jobs success |
| **E2E** | **PASS** | 148/154 Playwright-Tests, 6 übersprungen |
| **PRODUCTION** | **PASS** | Deployment live, neue Cron-Route erreichbar und fail-closed (401) |

---

## Live-Läufe im Einzelnen — 2026-08-31, gegen Produktion

| Prüfung | Ergebnis | Was sie beweist |
|---|---|---|
| `verify:geldweg` | **12/12** | Nachweis → Unterschrift → Sperre → Rechnung → Position → Versand → Zahlung läuft durch |
| `verify:dienstplan-touren` | **20/20** | Schicht → Dienst → Einsatz → Doppelbelegung (auch über Mitternacht) → Abwesenheit → Vertretung → Tour → Stops → Durchschlag auf den Einsatz |
| `verify:opos-mahnwesen` | **17/17** | Offene Posten, Altersstruktur, Klientensalden, Mahntor mit allen zehn Punkten, Eskalation samt Gebühr, Zahlungszuordnung, Statuswege |
| `verify:marketing-kette` | **16/16** | Doppel-Opt-in, Sperrliste, Zustellereignisse, Segmentierung, Empfängerlage einer Kampagne, Versandtore |
| `verify:pflege-kette` | **12/12** | Plan → Maßnahme → Durchführung → Freigabe → Evaluation → Wiedervorlage → Unveränderlichkeit |
| `verify:zeiterfassung` | **10/10** | Ist-Minuten, ArbZG-Riegel (Pause, Tageshöchstzeit, Ruhezeit), Sperre |
| `verify:unterschrift` | **9/10** | Hash, Bindung an den Inhalt, Sperre, geschlossener Umgehungsweg — **offen: U10 (Altbestand)** |
| `verify:security-kette` | **7/7** | Ereignis → Spur → Watchlist → Regel → Register → Zustellspur |
| `verify:abrechnung` | **10/10** | Abrechnungsdaten und ihre Riegel |
| `verify:perimeter` | **7/8** | **offen: N2** — 6 SECDEF-Triggerfunktionen für `anon` ausführbar (= offene Migration 20261021000002) |
| `audit:rls-rollen` | **4 Befunde** | 3× fehlende Lesepolicy (= die offene Migration), 1× `is_internal_staff()` nennt `buero` (= offene Migration) |
| `lint:rls-sicht` | **50 Paare** | Obergrenze in CI auf 50 gesenkt (war 52) |
| `verify:rls-lesepolicies` | **0/24 live** | Die neue Migration steht **nicht** — genau das misst dieser Lauf |
| `check:migrationen` | **24 von 32 live** | 8 offen, jede mit Grund, Risiko, SQL und Verifikationsabfrage |

---

## Was in dieser Sitzung entstanden ist

### P0 — RLS: die 48 blinden Seite/Rolle-Paare · `4e541a78`

48 Paare über 25 Tabellen lieferten `pdl`, `qm` und `buchhaltung` unter RLS
**null Zeilen** — nicht wegen einer Sperre, sondern weil keine Policy dort
eine Berechtigung auswertete. Für jede Tabelle wurde entschieden, **welches
Recht** sie trägt, nach einer Regel: maßgeblich ist der Gegenstand, nicht
die Seite, die ihn zufällig liest.

24 Policies, je `FOR SELECT TO authenticated` mit
`darf('<recht>') AND organization_id = current_org_id()`. Vier
Entscheidungen fallen bewusst restriktiv aus und lassen Seiten weiter leer
— `verordnungen` (Spalte `diagnose`), `care_notes`, `absences`
(Krankheitsgrund) und `caregiver_bonuses`. Damit die Seite das **sagt**,
tragen die vier betroffenen Bereiche jetzt `zusatzRechte`.

**Ein Fehlbefund verhindert:** `/admin/sepa` → `documents` war keine
Tabellenlesung, sondern der Speicher-Eimer. Die Tabelle führt live
Führungszeugnisse und Ausweise — eine Policy nach demselben Muster hätte
sie der Buchhaltung geöffnet. Der Linter blendet Speicherpfade jetzt aus.

Belege: `docs/security/RLS_LESEPOLICIES_ENTSCHEIDUNG_2026-08-31.md`,
`lib/auth/rls-lesepolicies.ts` (Entscheidung mit Begründung je Zeile),
`__tests__/security/rls-lesepolicies.test.ts` (14 Tests halten Entscheidung
und Migration deckungsgleich), `npm run verify:rls-lesepolicies` (misst live).

### P3 — Migrationen: der Ledger war an fünf Stellen falsch · `da39b199`

In **beide** Richtungen. Drei Marketing-Migrationen galten als offen und
stehen live; `20261008000000` und `20261009000000` galten als erledigt und
fehlen. `npm run check:migrationen` fragt jetzt den Katalog nach dem
Objekt, das jede Migration hinterlässt — 32 Dateien ab `20261006000000`.

Zwei Fallen sind eingearbeitet, weil sie beim ersten Anlauf zuschlugen:
`information_schema` verschweigt PUBLIC-Grants (meldete `angels`
fälschlich als ungeschützt), und der Constraint auf `kim_audit_log` heißt
`…_aktion_check`, nicht `…_action_check`.

Beleg: `docs/MIGRATIONEN_OFFEN_2026-08-31.md` — acht offene Migrationen mit
MIGRATION | GRUND | RISIKO | EXAKTEM SQL | VERIFIKATIONSQUERY.

### P1 — Unterschrifts-Integrität: die 30 Nachweise ohne Hash · `2b13dd78`

**Es fehlt kein Hash — es fehlt eine Unterschrift.** Der Trigger
`compute_signature_hash` steht live und rechnet richtig; er verlangt
`proof_status='UNTERSCHRIEBEN' AND client_signed_at IS NOT NULL`, und auf
allen 30 Zeilen steht `ENTWURF` ohne Zeitstempel. 26 tragen ein
Unterschrifts**bild** — das die Verwaltungsmaske mitspeichert und das
ausdrücklich kein Beleg ist.

Neue Unterschriften werden korrekt gehasht (live gemessen, U2/U3), die
Sperre hält gegen den Dienstschlüssel (U7), und der früher offene Umweg
(`proof_status` allein) wird seit `20261017000000` von der Datenbank
abgewiesen (U4).

**Nachziehen ist ausgeschlossen.** Der Hash bildet den
Unterschriftszeitpunkt mit ab, und der ist unbekannt — ein Backfill wäre
von einer echten Unterschrift nicht mehr unterscheidbar. Die sichere
Strategie (Nacherfassung über `service_signatures` statt über
`signature_hash`) steht in `docs/UNTERSCHRIFT_ALTBESTAND_2026-08-31.md`.

### P2 — Zwei Live-Ketten · `c1d331f5`, `50a8e250`

**Dienstplan/Touren/Einsätze, 20 Stationen.** Der Nachtdienst-Fix
(`20261012000000`) greift live: 22:00–02:00 und am Folgetag 01:00–03:00
werden als Doppelbelegung erkannt. Die Dienstplan-Spur hängt nachweislich
an der Route und nicht an einem Trigger — und ein Trigger wäre hier keine
Lösung: `personal_audit_log.benutzer_id` ist NOT NULL, `auth.uid()` unter
dem Dienstschlüssel NULL; das bräche jeden Schreibweg. Die Revisionsspur
hält gegen den Dienstschlüssel.

**OPOS/Zahlung/Mahnwesen, 17 Stationen.** Teil A liest nur, Teil B läuft in
einer Transaktion, die **immer** zurückrollt — keine Rechnung, keine
Mahnung, keine Zahlung, und der Nummernkreis wird nicht angefasst.

### P1-Befund aus P2: `invoices.status` führt zwei Vokabulare · `50a8e250`

`invoices_status_check` lässt ein deutsches **und** ein älteres englisches
Vokabular zu, und der Bestand nutzt beide (`sent`, `disputed`, `paid`).
**Fünf** Stellen führten je eine eigene, halbe Liste:

- **Mahntor:** Prüfpunkt 3 meldete wörtlich „Status ‚paid' ist mahnfähig" —
  er hat live **nie** gesperrt. Bezahlt und bestritten fingen andere Punkte
  ab; ein **Entwurf** (`draft`) mit offenem Betrag und überschrittener
  Fälligkeit wäre durch alle zehn gelaufen und gemahnt worden.
- **Offene Posten:** eine stornierte Rechnung als `cancelled` behält ihren
  Betrag und stand weiter in der Liste — die Forderung war zu hoch
  ausgewiesen.
- **Zahlungszuordnung** (2 Stellen) **und Matching:** dieselbe stornierte
  Rechnung wurde als Ziel einer eingehenden Zahlung angeboten und
  automatisch zugeordnet.

Jetzt eine Liste: `lib/billing/status-vokabular.ts`. Drei Tests, die den
Quelltext nach Zeichenketten durchsuchten, wurden durch echte Prüfungen
ersetzt.

### P4 — Marketing: 16/16

Die bestehende Kette (13 Stationen) um drei ergänzt:
Empfängerlage einer echten Kampagne (geht auf: im Segment = versandfähig +
Ausschlüsse), die gesperrte Adresse in keiner Empfängermenge, und die vier
Versandtore an einer frisch angelegten Kampagne.

**Webhook: BLOCKED.** `RESEND_WEBHOOK_SECRET` ist in Vercel nicht gesetzt;
die Route antwortet live mit **HTTP 503** — fail-closed, also der richtige
Zustand, aber Öffnungen und Klicks erreichen das System nicht.
Kein Massenversand ausgelöst: `MARKETINGVERSAND_FREIGEGEBEN` ist nicht
gesetzt, und jede Kampagne braucht zusätzlich Trockenlauf und Freigabe.

### P5 — Security: geprüft, nicht neu gebaut

`verify:security-kette` 7/7: Ereignis → Spur → Watchlist → Regel greift für
das überwachte Konto und **nicht** für ein gewöhnliches → Register →
Zustellspur. Keine heimliche Aktivierung, keine Umgehung. Der einzige
offene Punkt (`verify:perimeter` N2) ist die offene Migration
`20261021000002`.

### P6 — Zentrale Aufbewahrung · `88101633`

Es gab eine Frist nur für den Perimeter; alles, was der Betrieb erzeugt,
wuchs unbegrenzt. Jetzt **ein** Katalog (`lib/aufbewahrung/katalog.ts`),
der die Perimeter-Regeln **importiert statt sie abzuschreiben**, plus
`geo_events=14d` und `offline_queue=30d` als Ausgangskonfiguration.

- **Konfigurierbar:** jede Frist über `AUFBEWAHRUNG_<TABELLE>_TAGE`. Ein
  unbrauchbarer Wert fällt **nicht** stumm auf die Vorgabe zurück, sondern
  wird gemeldet — wer `0` schreibt, meint möglicherweise „sofort löschen".
- **Zwei Schutzbedingungen, die den Kern ausmachen.** `geo_events` mit
  `service_record_id` bleibt: 14 Tage sind kürzer als ein
  Abrechnungszeitraum, der Standortbeleg wäre vor der Rechnung weg.
  `offline_queue` nur `synced`/`failed`: `pending` ist die Arbeit einer
  Kollegin aus dem Funkloch.
- Der geo-Filter prüft `IS NULL`, nicht `= NULL`. Als `eq` wäre er
  wirkungslos gewesen und der Lauf hätte **alles** gelöscht. Ein eigener
  Test hält das fest.
- **Audit der Löschung:** nach `mis_audit_log` mit `action='delete'` (vom
  Live-CHECK gedeckt). Trockenläufe und wirkungslose Läufe schreiben
  **keine** Zeile.
- **Standard ist Trockenlauf** bis `AUFBEWAHRUNG_AKTIV=1`. Cron 03:45 in
  `vercel.json`. Route live und fail-closed (401 ohne Geheimnis).

16 Tests, drei ENV-Einträge im Register.

---

## Restblocker

### 1 · Acht Migrationen brauchen den SQL-Editor — **BLOCKED**

Kein Weg daran vorbei in dieser Umgebung: DDL scheitert am Eigentümer
(`must be owner of table absences`, 42501), kein Supabase-MCP, kein
`SUPABASE_ACCESS_TOKEN`, kein `DATABASE_URL`, `supabase db push` im Projekt
verboten.

| Migration | Risiko |
|---|---|
| `20261010000000_medikamente_abgesetzt_sperre_db` | **HOCH** — abgesetzte Medikamente bleiben änderbar |
| `20261010000002_wund_kindtabellen_sperre_db` | **HOCH** — abgeheilte Wunddoku bleibt änderbar |
| `20261010000004_pflege_verlauf_backdating_sperre_db` | **HOCH** — Verlaufseinträge rückdatierbar |
| `20261008000000_vitalwerte_plausibilitaet_db_check` | MITTEL — unplausible Vitalwerte werden angenommen |
| `20261009000000_pflege_massnahmenplaene_ein_aktiver_plan` | MITTEL — zwei aktive Pläne je Klient möglich |
| `20261022000000_rk_lesepolicies_verwaltungsrollen` | kein Sicherheits-, ein Funktionsrisiko |
| `20261021000004_is_internal_staff_ohne_buero` | NIEDRIG heute, HOCH bei der nächsten CHECK-Erweiterung |
| `20261021000002_secdef_trigger_revoke` | NIEDRIG (Triggerfunktionen sind über PostgREST nicht aufrufbar) |

Empfohlene Reihenfolge: die drei Unveränderlichkeits-Trigger der Pflegeakte
zuerst, dann die Lesepolicies, dann der Rest. Nach jeder Anwendung
`npm run check:migrationen`.

### 2 · Ein abgerechneter Nachweis ohne jeden Beleg — **Entscheidung offen**

`2821966f-5251-482b-992a-c84dda0ad0c3` (24.06.2026, 68,00 €,
Rechnung RE-2026-0001, Status „sent"): kein Hash, kein Bild, keine Zeile in
`service_signatures`. Es ist Testbestand — aber es geht um eine
**versendete Rechnung**, und diese Entscheidung trifft kein Skript. Drei
Wege stehen in `docs/UNTERSCHRIFT_ALTBESTAND_2026-08-31.md`.

### 3 · Drei fehlende Umgebungsvariablen — **BLOCKED**

| Variable | Folge, solange sie fehlt |
|---|---|
| `RESEND_WEBHOOK_SECRET` | Öffnungen, Klicks, Bounces erreichen das System nicht (Route antwortet 503) |
| `CRON_SECRET` | Nicht überprüfbar von hier: alle Cron-Routen antworten fail-closed mit 401, und ein 401 sieht bei „nicht gesetzt" genauso aus wie bei „kein Header". Nur ein ausgelöster Lauf beweist etwas. |
| `AUFBEWAHRUNG_AKTIV` | Aufbewahrungslauf zählt nur — **so gewollt**, bis die Zahlen des Trockenlaufs angesehen wurden |

### 4 · `/admin/abrechnung` und die Verordnungen — **GESCHLOSSEN** (`c31da31a`)

War: RLS kann keine Spalten ausblenden, `verordnungen` führt `diagnose` und
steht unter `pflege.lesen` — der Verordnungsteil blieb für die Buchhaltung
leer.

Jetzt: `GET /api/billing/verordnungen` verlangt `abrechnung.lesen`, nimmt
den Mandanten aus dem Kontext (nie aus der Anfrage) und gibt eine
**Erlaubnisliste** von acht Spalten heraus
(`lib/billing/verordnung-projektion.ts`). Erlaubnis- und nicht Sperrliste:
eine künftige Spalte mit Befunden ist damit automatisch draußen statt
versehentlich drin. Die Policy bleibt unverändert bei `pflege.lesen` — die
Route ist ein zusätzlicher, engerer Weg, keine Lockerung.

`lint:rls-sicht` steht dadurch bei **50** Paaren (CI-Obergrenze
nachgezogen).

---

## Verifikationsbefehle

```bash
npm run check:migrationen          # welche Migration steht live, welche nicht
npm run verify:rls-lesepolicies    # die 24 Policies, live gemessen
npm run verify:unterschrift        # Unterschrift, Hash, Sperre, Altbestand
npm run verify:dienstplan-touren   # Dienstplan → Tour → Einsatz
npm run verify:opos-mahnwesen      # offene Posten → Zahlung → Mahnwesen
npm run verify:marketing-kette     # Doppel-Opt-in bis Versandtore
npm run verify:security-kette      # Ereignis → Alarm → Zustellung
npm run verify:geldweg             # Nachweis → Rechnung → Zahlung
npm run lint:rls-sicht             # blinde Seite/Rolle-Paare
npm run audit:rls-rollen           # dieselbe Frage per Impersonation
```
