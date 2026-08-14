# Finaler Bericht — 14.08.2026

Konsolidierung aller Parallel-Sessions (Gegenprüfung A + B) und Messung des
Ist-Zustands. Jede Zahl in diesem Bericht ist an diesem Tag gemessen, nicht
übernommen. Wo eine Aussage nicht belegbar war, steht das ausdrücklich dabei
statt einer Vermutung.

---

## 1. Production Commit

**`80e22c7`** — „Finale Konsolidierung: 32 rote Tests waren veraltete
Schema-Annahmen (budget_type, care_level) — Tests ans Live-Schema angeglichen"

Remote `origin/main` synchron (verify-push bestätigt). Der Commit, der diesen
Bericht hinzufügt, enthält ausschließlich dieses Dokument — kein Code.

**Was die Konsolidierung selbst ergab:** Es gab keine offenen Änderungen aus
Parallel-Sessions (Arbeitsverzeichnis sauber, `git pull` bereits aktuell). Die
eigentliche Arbeit war eine andere: **die letzten vier Commits hatten rote CI**,
und zwar durchgehend seit `4b7fd07`. 32 Tests in 3 Dateien waren rot, weil die
Gegenprüfungs-Fixes das Live-Schema korrekt abgebildet haben, die Tests aber
noch die alten, falschen Annahmen festhielten:

| Datei | Ursache |
|---|---|
| `__tests__/e2e/billing-e2e.test.ts` (18) | Mock bildete zwei Budgetzeilen je Kunde mit `budget_type` ab. Live gibt es EINE Zeile je Kunde und Jahr, die Typen stehen in Spalten. |
| `__tests__/billing/pilot-kundenkette.test.ts` (13) | Spaltenliste des Stubs kannte `clients.care_level` nicht — genau die Spalte, die `6e66c63` als führend eingeführt hat. Der Stub antwortete mit 42703, die Kette brach ab. |
| `__tests__/security/d2-vp-budget.test.ts` (1) | Forderte wörtlich `.eq('budget_type', budgetTyp)` — also genau die Abfrage, die live mit 42703 scheitert und die Budgetprüfung fail-open laufen ließ. |

Die Tests wurden ans Live-Schema angeglichen, nicht der Code an die Tests. Zur
Absicherung kamen zwei neue Tests dazu: `budget_type` darf nie mitgeschrieben
werden, und ein Lesefehler auf der Budgetzeile darf keine zweite Zeile anlegen
(fail-closed).

Belegt per PostgREST am 14.08.2026:

```
clients?select=care_level        → 200  [{"care_level":2}]
clients?select=pflegegrad        → 200  [{"pflegegrad":null}]
client_budgets?select=budget_type→ 400  42703 column does not exist
```

---

## 2. CI Status

**GRÜN** — Run `31757638434` auf `80e22c7`: `completed / success`,
Job „Typecheck, Lint, Tests, Build" = success.

Das ist der erste grüne Lauf seit `21bd1dc`. Die vier Vorgänger-Commits
(`4b7fd07`, `db450dd`, `6e66c63`, `150530f`) waren alle rot — aus dem in Punkt 1
beschriebenen Grund.

Lokal zusätzlich geprüft:

| Gate | Ergebnis |
|---|---|
| `tsc --noEmit` | 0 Fehler |
| `npm run check:schema-drift` | OK — 972 Dateien gegen 300 Live-Tabellen |
| `scripts/verify-security-p0.mjs` | 9/9 bestanden |
| `scripts/verify-anon-exposure.mjs` | OK — 300 Relationen, 6 bewusst öffentlich, kein Leck |

---

## 3. Vercel Status

**HTTP 200**

| URL | Status |
|---|---|
| `https://alltagsengel.care` | 200 |
| `https://alltagsengel.care/pflegecoach` | 200 |
| `https://alltagsengel.care/pflegecoach/anfrage` | 200 |

---

## 4. Supabase Status

**300 Relationen** (Tabellen + Views) und **50 RPCs** live, per
PostgREST-OpenAPI introspiziert. Im Repo liegen **229 Migrationsdateien**
(inkl. Rollback-Skripte).

### Verifiziert angewendet

| Migration | Nachweis |
|---|---|
| `20260906000000_view_invoker_systemisch` | Alle Akten-/Pflege-Views antworten anon mit 401 (`42501 permission denied for view`). Der P0 aus Gegenprüfung A ist zu. |
| `20260901020000_invoice_due_date_default` | 0 von 5 Rechnungen haben `due_date IS NULL` — OPOS/Mahnwesen ist nicht mehr blind. |

### Verifiziert NICHT angewendet

| Migration | Nachweis |
|---|---|
| `20260907000000_pflegegrad_backfill` | Alle 4 Kunden haben `care_level` gesetzt und `pflegegrad = NULL`. Der Code trägt das über `pflegegradVon()` — die Daten sind unverändert. |

### Nicht verifizierbar (ehrlich offen)

`20260901000000` (Bewertungs-Fence), `20260901010000` (service_record
Status-Sync), `20260904000000` (Tarif-Belegpflicht), `20260905000000`
(`wf_trigger_zahlung`-Fix). Diese vier sind Trigger bzw. Policies auf Tabellen,
die live **leer** sind. Lesend lässt sich ihr Zustand nicht feststellen: eine
leere Antwort ist bei PostgREST mehrdeutig (RLS greift vs. Tabelle leer), und
schreibend zu testen hieße, Produktivdaten in `payments` bzw.
`billing_tariffs` anzulegen. Das wurde bewusst nicht getan.

**Fail-Closed-Konsequenz:** Diese vier gelten in diesem Bericht als NICHT
bestätigt.

### Live-Datenstand

| Tabelle | Zeilen |
|---|---|
| `clients` | 4 |
| `service_records` | 30 |
| `invoices` | 5 |
| `payments` | 0 |
| `billing_tariffs` | 23 |
| `leistungspreise` | 24 |
| `service_pricing` | 10 |
| `organizations` | 6 — davon **5 E2E-Test-Mandanten** |

### Anon-Zugriff

`verify-anon-exposure.mjs` hat alle 300 Relationen geprüft: anon liest aus
keiner nicht freigegebenen Relation Zeilen. Der Differenztest auf
`akten_zugriff_log` (service_role sieht 1 Zeile, anon sieht 0) belegt, dass RLS
dort tatsächlich filtert und nicht nur zufällig leer ist.

---

## 5. Anzahl Tests

**2606 passed, 0 failed** (38 skipped, 2644 gesamt) in 119 Testdateien
(118 bestanden, 1 übersprungen). Laufzeit 6,6 s.

---

## 6. Freier Mac-Speicher

**30 GB frei** (`/dev/disk3s3s1`, 228 GB gesamt, 12 GB belegt, 29 % genutzt).

---

## 7. Pflege-Software produktionsreif

# NEIN

Die Regel war: JA nur, wenn **beide** Gegenprüfungen bestanden sind. Das ist
nicht der Fall.

**Gegenprüfung A — bestanden, aber mit erklärtem Prüfumfang.**
Agent A hat einen echten P0 gefunden: Views ohne `security_invoker` gaben
Gesundheitsdaten ohne Login preis. Der ist live geschlossen (Migration
`20260906000000`, in Punkt 4 nachgemessen). Bestätigt wurden außerdem
funktionierender `org_fence`, korrekter Tarifstatus, Auth auf 332 Routen und
korrekte Budget-Konstanten.

Nicht geprüft hat Agent A fünf Bereiche: **Rechnungs-Manipulation,
Leistungsnachweis-Bypass, IDOR, Payment/OPOS und PflegeCoach-Datenschutz.**
Das sind keine Randthemen — es sind genau die Wege, über die Geld und
Gesundheitsdaten das System verlassen.

**Gegenprüfung B — nicht bestanden.**
288 Turns Arbeit, dann blockierte die Session ohne finalen Report. Die Arbeit
ist sichtbar und wertvoll (drei Commits: 12 tote Abfragen, Pflegegrad-
Doppelspalte, P0 blockierte Kundenanlage), aber es gibt kein Prüfergebnis. Eine
unvollständige Prüfung ist keine bestandene Prüfung — sie ist eine offene.

**Bewertung.** Was gemessen wurde, steht gut da: CI grün, 2606 Tests grün, kein
Anon-Leck über 300 Relationen, kein Schema-Drift über 972 Dateien. Aber
„produktionsreif" ist eine Aussage über das, was man **nicht** weiß, und dort
stehen fünf ungeprüfte Sicherheitsbereiche und eine abgebrochene
Workflow-Prüfung. Fail-Closed heißt hier: NEIN, bis diese Lücken geschlossen
sind.

---

## 8. PflegeCoach Selbstzahler verkaufsfähig

# NEIN

Gebaut und live erreichbar (alle HTTP 200): Produktseite, Anfrage-Seite,
Konto/Kündigung, Support-Kontakt.

Was fehlt, entscheidet die Frage:

| Punkt | Stand (verifiziert) |
|---|---|
| Bezahlweg / Checkout | **fehlt** — `app/pflegecoach/anfrage/page.tsx` verzichtet ausdrücklich darauf („Bewusst OHNE Anmeldung erreichbar und bewusst ohne Checkout") |
| Preise | **nicht festgelegt** |
| Auffindbarkeit | `noindex` aktiv — `app/pflegecoach/layout.tsx`: `robots: { index: false, follow: false }` |

Ohne Preis und ohne Bezahlweg kann niemand kaufen, und mit `noindex` findet
niemand das Angebot. Es ist fertig **gebaut**, aber nicht verkaufsfähig.

---

## 9. DiPA technisch vorbereitet

# JA

`docs/DIPA_MATRIX_FINAL.md`, 48 Anforderungszeilen ausgezählt:

| Status | Anzahl |
|---|---|
| INTERN ERLEDIGT | **27** (25 vollständig, 1 „mit Lücke", 1 „mit Restrisiko") |
| INTERN OFFEN | **9** |
| EXTERN NÖTIG | **12** |

`COACH_DIPA_MODUS` ist **false** — verifiziert in `lib/coach/config.ts`: der
Modus schaltet nur bei exakt `'true'` ein, jeder andere Wert (auch ein
fehlender) bleibt aus. Das Produkt macht damit keine Aussagen zur
Kostenerstattung.

„Technisch vorbereitet" heißt hier genau das: die 27 internen Nachweise liegen
im Repo. Es heißt nicht, dass ein Antrag gestellt werden könnte — dafür fehlen
die 12 externen Punkte und die 9 noch offenen internen.

---

## 10. DiPA kassenerstattungsfähig

# NEIN — keine BfArM-Listung.

Ohne Aufnahme ins BfArM-Verzeichnis gibt es keine Erstattung. Der Schalter
`COACH_DIPA_MODUS` steht deshalb korrekt auf `false`; ihn vorher einzuschalten
würde Aussagen zur Kostenerstattung erzeugen, die nicht gedeckt sind.

---

## 11. Interne Blocker, die noch existieren

1. **E2E-Test-Mandanten sind nicht löschbar.** `E2E_TEST_DEL_ORG_A` existiert
   weiterhin — und **5 der 6 Organisationen live sind E2E-Test-Mandanten**. Der
   unveränderliche `wf_audit_log` hält per FK dagegen; ohne Schema-Migration
   geht das nicht weg. Der echte Mandant („Alltagsengel UG") ist damit einer
   von sechs.

2. **`service_pricing` hat keinen `tarif_status`** — per PostgREST bestätigt
   (`42703 column service_pricing.tarif_status does not exist`). Damit greift
   die Fail-Closed-Tarifsperre auf der dritten Preistabelle nicht. Der
   35 €/h-Fallback der Native App (`NATIVE_FALLBACK_HOURLY_RATE` in
   `lib/pricing/b2c-constants.ts`) läuft ungeprüft daran vorbei.

3. **Fünf Sicherheitsbereiche ungeprüft** (Rechnungs-Manipulation,
   Leistungsnachweis-Bypass, IDOR, Payment/OPOS, PflegeCoach-Datenschutz) —
   siehe Punkt 7. Das ist der Hauptgrund für „nicht produktionsreif".

4. **Gegenprüfung B ohne Ergebnis** — die Workflow-Prüfung ist nach 288 Turns
   abgebrochen. Der Prüfumfang ist unbekannt, also gilt er als offen.

5. **Vier Migrationen mit unbekanntem Live-Zustand** (Punkt 4). Betroffen sind
   Bewertungs-RLS, service_record-Statussynchronisation, Tarif-Belegpflicht und
   der `wf_trigger_zahlung`-Fix. Letzterer ist der bekannte P0, der **jeden**
   Zahlungseingang scheitern lässt — dass `payments` live 0 Zeilen hat, heißt,
   dass er noch nie im Echtbetrieb getestet wurde.

---

## 12. Externe Blocker

| Blocker | Wirkung |
|---|---|
| **§45a Anerkennungsbescheid Hessen** | Sperrt §45b, VP/KZP und §105 **gleichzeitig** — der größte Einzelhebel |
| **ITSG-Zertifikat** | §105 DTA nicht möglich |
| **GKV-SV Annahmestelle** | §302-Versand nicht möglich |
| **gematik KIM-Zugang** | Kein sicherer Nachrichtenkanal |
| **BfArM DiPA-Listung** | Keine Erstattungsfähigkeit (Punkt 10) |
| **SEPA Gläubiger-ID (Bundesbank)** | Kein Lastschrifteinzug |
| **8 von 9 §45b-Tarifen blockiert** | Live nachgezählt: 9 §45b-Tarife, davon **8 `blocked`**, 1 `verified`. Primärquelle für 35 €/h fehlt. Zusätzlich 4 §39-Tarife (VP) auf `unverified`. Nur die 10 Privattarife sind `verified`. |
| **Supabase CLI Login** | Ohne ihn kann kein Agent Migrationen autonom anwenden — deshalb die vier ungeklärten Migrationen in Punkt 11.5 |

---

## 13. Die 3 nächsten Dinge, die Yusuf persönlich machen muss

Priorisiert nach Wirkung, nicht nach Aufwand.

### 1. §45a-Anerkennungsbescheid in Hessen beantragen

Ein einziger Vorgang entsperrt vier Erlösquellen gleichzeitig (§45b,
Verhinderungspflege, Kurzzeitpflege, §105). Alles andere in der
Kassenabrechnung ist gebaut und wartet nur darauf. Die Vorlaufzeit einer Behörde
läuft nicht parallel zur Entwicklung — sie beginnt erst mit der Einreichung.
**Deshalb steht das hier auf Platz 1: es ist der einzige Punkt, bei dem jeder
Tag Verzögerung ein Tag am Ende ist.**

### 2. Supabase-CLI-Zugang herstellen und die vier offenen Migrationen anwenden

Das ist der kleinste Aufwand mit dem unmittelbarsten Effekt. Solange kein Agent
Migrationen anwenden kann, wächst der Abstand zwischen Repo (229 Migrationen)
und Live weiter — und niemand weiß, welcher Zustand gerade gilt. Konkret hängt
daran der `wf_trigger_zahlung`-Fix: **solange der nicht bestätigt live ist,
scheitert jeder Zahlungseingang.** Bei aktuell 0 Zahlungen fällt das nicht auf;
beim ersten echten Kunden schon.

### 3. Die fünf ungeprüften Sicherheitsbereiche prüfen lassen — und Gegenprüfung B zu Ende bringen

Das ist der Punkt, an dem „produktionsreif = NEIN" hängt. Rechnungs-
Manipulation, Leistungsnachweis-Bypass, IDOR, Payment/OPOS und
PflegeCoach-Datenschutz sind die Wege, über die Geld und Gesundheitsdaten das
System verlassen. Agent A hat sauber gearbeitet und seinen Prüfumfang ehrlich
benannt — aber genau deshalb weiß man jetzt, was noch fehlt. Das ist eine
Freigabe-Entscheidung, keine Entwicklungsaufgabe.

---

### Was in Punkt 13 bewusst NICHT steht

Die 8 blockierten §45b-Tarife (Primärquelle für 35 €/h) sind ein echter
Blocker — aber sie sind **nach** §45a wirksam. Die Tarifbelege zu beschaffen,
bevor der Anerkennungsbescheid läuft, verkürzt nichts. Sobald Punkt 1
eingereicht ist, rücken sie auf Platz 1 nach.

Dasselbe gilt für PflegeCoach-Preise und Checkout: Das ist ein
Produktentscheid, kein Blocker — er kostet Umsatz, aber er blockiert nichts
anderes.

---

**Methodik.** Alle Live-Aussagen dieses Berichts wurden am 14.08.2026 per
PostgREST mit `service_role` und `anon` gemessen. Bei mehrdeutigen Antworten
(HTTP 200 mit leerem Array — RLS greift oder Tabelle ist leer) steht
ausdrücklich „nicht verifizierbar" statt einer beruhigenden Vermutung. Kein
Zustand wurde aus einer früheren Session übernommen; die vier Kunden, fünf
Rechnungen und null Zahlungen sind nachgezählt.
