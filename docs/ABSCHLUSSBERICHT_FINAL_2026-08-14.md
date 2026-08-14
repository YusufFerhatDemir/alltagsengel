# Finaler 20-Punkte-Abschlussbericht

**Stand:** 14.08.2026 · **Basis-Commit:** `6724d80` · **Fix-Commit dieser Runde:** `576c34b`
**Datenbank:** Supabase Production `nnwyktkqibdjxgimjyuq`

**Methodik.** Zwei unabhängige Audits (A = Security/RLS/Datenschutz/Mandantentrennung,
B = Workflow Klient→Rechnung→Zahlung), beide gegen die **laufende Produktionsdatenbank**
geführt, nicht gegen das Repo. Werkzeuge: `pg_catalog`-Introspektion über die
service_role-RPC, **Rollen-Impersonation** (`SET LOCAL ROLE authenticated` mit echten
Nutzer-UUIDs) und **29 aktive Negativtests**, die alle in einem `DO`-Block mit
abschließendem `RAISE` liefen — vollständiger Rollback, keine Schreibwirkung auf
Produktionsdaten. Keine Zahl aus einem früheren Bericht übernommen.

> **Belegregel dieses Berichts:** Jede Aussage unten ist entweder durch eine
> Katalogabfrage, einen Negativtest oder einen Kommandolauf gedeckt. Wo etwas
> **nicht** geprüft werden konnte, steht das ausdrücklich da.

---

## 1. Kritische Fehler — vorher / nachher

| | Vorher (Bericht `41be647`) | Nachher (heute live geprüft) |
|---|---|---|
| Anzahl | **1** | **0** |

**P0-1 — `check_billing_gate()` las `state_settings.kasse_status` (Spalte existiert nicht, 42703).**
Jeder Nicht-PRIVAT-Leistungsnachweis wurde zurückgerollt; der Kassenweg war am ersten
Schritt dicht.

**Live-Nachweis der Schließung:**
`SELECT prosrc LIKE '%kasse_status%' FROM pg_proc WHERE proname='check_billing_gate'` → **false**.
Der Trigger arbeitet jetzt über `public.state_flag(v_org, v_land, 'kassenrechnung')`,
also mandantenscharf und über eine real existierende Auswertung. Das Verhalten ist
fail-closed: ist das Flag nicht gesetzt, wird `billing_status` auf
`KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET` gezwungen statt auf `OFFEN`.

**In dieser Runde neu gefundene kritische Fehler: 0.**

---

## 2. Hohe Fehler — vorher / nachher

| | Vorher | Nachher |
|---|---|---|
| Anzahl | **2** | **0 wirksam offen** — 1 neu gefunden, im Code behoben, DB-Teil wartet auf Apply |

**H-1 — Rechnung ohne Unterschriftsnachweis möglich. → geschlossen, live.**
`SELECT prosrc LIKE '%MISSING_SIGNATURE%' FROM pg_proc WHERE proname='create_invoice_draft_atomic'` → **true**.
Die RPC v8 verlangt `proof_status='UNTERSCHRIEBEN'` **oder** `signature_hash IS NOT NULL`,
auch für Privatrechnungen. Aktiv gegengeprüft (Negativtest N1): Der Rechnungslauf für
Klient `485c7022…`, Zeitraum 2026-04, Budget `entlastung` wird abgebrochen, es entsteht
**keine** Rechnung.

**H-2 — VP/KZP-Budget fehlte bei 2 von 4 Klienten. → geschlossen, live.**
```sql
SELECT count(*) FROM client_budgets cb JOIN clients c ON c.id = cb.client_id
 WHERE COALESCE(c.care_level, c.pflegegrad) >= 2
   AND COALESCE(cb.combined_annual_amount, 0) = 0;   -- → 0
```

### NEU in dieser Runde: H-3 — der MISSING_SIGNATURE-Audit-Eintrag war unmöglich

Beim Abbruch wegen fehlender Unterschrift schreibt die RPC **zuerst** einen Audit-Eintrag
und wirft **danach** `MISSING_SIGNATURE`. Der Eintrag trägt
`entity_type = 'invoice_draft'` — ein Wert, der in
`billing_audit_trail_entity_type_check` **nicht enthalten** ist. Der `INSERT` scheiterte
deshalb **immer** mit SQLSTATE 23514, und zwar **vor** dem `RAISE`.

Live reproduziert (Negativtest N1, Produktionsdatenbank):

```
BLOCKIERT  N1 Rechnung ohne Unterschrift ->
  23514 new row for relation "billing_audit_trail"
        violates check constraint "billing_audit_trail_entity_type_check"
```

**Zwei Folgen:**

1. Die Abrechnungskraft sah nicht „2 von 2 Nachweisen sind nicht unterschrieben",
   sondern den Constraint-Text — `lib/billing/core/invoice-engine.ts:252` reicht ihn
   unverändert als „Atomare Rechnungserstellung fehlgeschlagen: …" durch.
2. Der **forensische Nachweis des abgewiesenen Versuchs entstand nie** — genau der
   Zweck, für den die Unterschriftspflicht den Audit-Eintrag schreibt.

**Die Sperre selbst hielt.** In keinem Fall entstand eine Rechnung ohne Unterschrift;
die gesamte Transaktion wurde zurückgerollt. Deshalb HOCH und nicht KRITISCH.

**Warum die Testsuite das nicht gefunden hat:** Das PGlite-Testschema in
`__tests__/abrechnung/rechnung-unterschriftspflicht.test.ts` deklarierte
`entity_type text` **ohne** den CHECK, den die Produktion seit `20260903010000` trägt.
Ein Testschema, das lockerer ist als die Produktion, beweist nichts. Der CHECK steht
jetzt wortgleich im Testschema; die Gegenprobe (Fix-Migration im Setup deaktiviert)
lässt **7 Tests** mit exakt dem Live-Fehlertext rot laufen.

**Behoben in `576c34b`:**
`supabase/migrations/20260912000000_audit_entity_type_invoice_draft.sql` (+ Rollback).
Erweitert das Vokabular um `invoice_draft`, statt die RPC auf `'invoice'` umzubiegen —
denn `entity_id` trägt dort eine **client_id**; zum Abbruchzeitpunkt existiert keine
Rechnung, und ein Audit-Eintrag `entity_type='invoice'` mit Klienten-UUID wäre schlicht falsch.

**⚠️ Die Migration ist NICHT auf Production angewendet** — siehe Punkt 16.

---

## 3. Mittlere Fehler — vorher / nachher

| | Vorher | Nachher |
|---|---|---|
| Anzahl | **6** (M-1 … M-6) | **5 geschlossen, 1 nur teilweise (M-5, extern), 1 neu (M-7)** |

| # | Befund | Live-Nachweis heute | Ergebnis |
|---|---|---|---|
| M-1 | `validate_correction_atomic` nicht live | Funktion existiert; `create_credit_note_atomic` ebenfalls | **geschlossen** |
| M-2 | Audit-Logs ohne Unveränderlichkeits-Trigger | `trg_immutable_sr_audit_update/-delete` + `trg_immutable_as_audit_delete/-update` vorhanden; aktiv gegengeprüft (P2/P3): UPDATE **und** DELETE auf eine frisch erzeugte Zeile in `service_record_audit_log` werden mit P0001 abgewiesen | **geschlossen** |
| M-3 | Kein Pflegegrad-Sync-Trigger | `trg_sync_clients_pflegegrad` vorhanden | **geschlossen** |
| M-4 | `service_type` nach Unterschrift änderbar | `prosrc LIKE '%service_type%'` → true; Negativtest N4: Änderung an einem `invoiced`-Nachweis wird mit P0001 abgewiesen | **geschlossen** |
| M-5 | Tarife unverifiziert | **Kontrolle geschlossen, Datenlage unverändert.** Belegpflicht greift (M7/M8: `tarif_status='verified'` ohne Rechtsquelle/Bearbeiter → 23514). Aber live weiterhin: `leistungspreise` **24/24 unverified**, `billing_tariffs` §45b **1 verified / 8 blocked**, §39 SGB XI **4/4 unverified** | **teilweise — Rest ist extern/kaufmännisch** |
| M-6 | Zahlungsziel 30 statt 14 Tage | Alle **3** `sent`-Rechnungen: `payment_terms_days = 14`, `due_date` gesetzt. `RE-2026-0002` (disputed) und `RE-2026-0003` (paid) bleiben bei 30 — festgeschriebene Rechnungen sind unveränderlich, das ist korrekt | **geschlossen** |

### NEU: M-7 — `assignment_audit_log` wird von nichts befüllt

`assignments` trägt zwei Trigger (`trg_assignment_bundesland`, `trg_check_assignment_overlap`)
— **keinen Audit-Trigger**. `service_records` hat mit `trg_audit_service_record` das
Gegenstück und schreibt nachweislich (Probe P1: 1 Zeile nach einer Änderung).
`assignment_audit_log` hat 0 Zeilen und bekommt strukturell nie welche.

Die Unveränderlichkeits-Trigger aus `20260910010000` schützen also eine Tabelle, die
leer bleibt. **Nicht in dieser Runde geändert** — ein Audit-Trigger auf `assignments`
ist eine neue Kontrolle und lag außerhalb des Auftrags („keine neuen Features").
Wirkung: Für Einsätze existiert keine Änderungshistorie; für Leistungsnachweise,
Rechnungen und Tarife dagegen schon.

---

## 4. Pflege-Software produktionsreif: **JA** — mit zwei benannten Bedingungen

Alle vorher offenen KRITISCH- und HOCH-Befunde sind live geschlossen. Die
Beweiskette Klient → Leistungsnachweis → Unterschrift → Rechnung ist im Code
vollständig (Signaturweg: `app/api/leistungsnachweis/crud/route.ts:220` setzt
`proof_status='UNTERSCHRIEBEN'`, `trg_compute_signature_hash` erzeugt den Hash).
Die 29 Negativtests haben **keine** Umgehung gefunden.

**Bedingung 1:** Live hat **kein einziger** der 30 Leistungsnachweise einen
`signature_hash`, alle stehen auf `proof_status='ENTWURF'`. Die Kette
Unterschrift → Rechnung ist auf Produktionsdaten **noch nie durchgelaufen**. Das ist
kein Defekt — die Sperre wirkt genau so, wie sie soll —, aber der erste echte
Durchlauf steht aus.

**Bedingung 2:** Bis `20260912000000` angewendet ist, quittiert jeder Rechnungsversuch
ohne Unterschrift mit einem Constraint-Text statt mit der Sperrbegründung (H-3).
Fail-closed bleibt gewahrt.

## 5. Privatkundenbetrieb produktionsreif: **JA**

Live: 4 Klienten, 30 Leistungsnachweise, 5 Rechnungen, davon 3 versandt mit
14-Tage-Ziel und gesetztem `due_date`, 1 bezahlt. Hessen steht auf
`private_enabled = true` (einziges Bundesland). Festgeschriebene Rechnungen sind
unveränderlich (Negativtests M10/M11/N12: Betrag **und** Rechnungsnummer werden bei
`sent` und `paid` abgewiesen). Gutschriften sind betragsbegrenzt (N14: 99.999.999 Cent
gegen 18.700 Cent verfügbar → abgewiesen).

## 6. Kassenabrechnung technisch **intern** READY: **JA** (Technik) — betrieblich NEIN

**Intern/technisch ist die Kette frei:** P0-1 geschlossen, Unterschriftspflicht scharf,
Korrektur/Gutschrift atomar, Zahlungsziel gesetzt, Audit-Trail unveränderlich und
prüfsummenbewehrt (`billing_audit_trail` hat `checksum`, `checksum_before`,
`checksum_after`, `migration_id`).

**Betrieblich läuft trotzdem nichts**, und zwar aus zwei Gründen, die **beide nicht
technisch** sind:

1. **Kein Bundesland ist freigeschaltet.** Alle `state_settings`-Zeilen:
   `insurance_enabled = false`, `kassenrechnung_enabled = false`. Hessen steht auf
   `ANTRAG_EINGEREICHT`.
2. **Es fehlt die Preisgrundlage.** §39 SGB XI hat **null** verifizierte Kassentarife,
   `leistungspreise` sind zu 100 % unverified. Die 8 blockierten §45b-Tarife bleiben
   **blocked** — sie werden in diesem Bericht weder freigegeben noch bewertet.

## 7. Ausschließlich extern blockierte Kassenfunktionen

| Funktion | Blockiert durch | Wer |
|---|---|---|
| §45b-Abrechnung, VP/KZP (§42a), §105-DTA | §45a-Bescheid fehlt → `insurance_enabled = false` | Land Hessen |
| DTA-Versand (DAKOTA/§302) | ITSG-Zertifizierung, SECON-Zertifikat | ITSG Trust Center |
| Realer Versandweg | SFTP-Zugangsdaten der Kostenträger | Kostenträger |
| §302 SGB V Generator | Technische Anlage 1 fehlt → Generator wirft **absichtlich** immer | GKV-Spitzenverband |
| Rückläufer-Auswertung | Fehlercode-Katalog der Kassen | Kostenträger |
| Lastschrifteinzug | SEPA-Gläubiger-ID (aktuell Platzhalter) | Deutsche Bundesbank |
| Kassentarife §39 / §45b | Vergütungsvereinbarung + Beleg | Kassenverbände / kaufmännisch |

## 8. PflegeCoach technisch verkaufsbereit: **JA**

Selbstzahlerweg vollständig gebaut und live (Checkout, Bestellung, Rechnung
`PC-YYYY-NNNNNN`, Zugang, Kündigung §312k BGB, versionierte Widerrufsbelehrung).
Vierfaches Fail-Closed-Gate: Preisfreigabe, Stripe Secret Key, Stripe Price ID,
Betrag > 0. `COACH_DIPA_MODUS` bleibt `false` — kein DiPA- oder Kassenerstattungsbezug
im Verkaufsweg. Was fehlt, ist ausschließlich kaufmännisch: Preisentscheidung und
Stripe-Price-IDs (siehe Punkt 20).

## 9. DiPA intern: **30 / 48**

`npm run dipa:katalog` heute: 30 erfüllt, 8 in Arbeit, 10 offen, **0 Befunde**.

**Vorbehalt, unverändert:** Nur **5 von 48** Anforderungstexten sind gegen die
Originaldokumente (DiPAV, BfArM-Leitfaden, TR-03161) geprüft — belastbare Quote **6 %**.
Die 30 beziehen sich auf Arbeitsfassungen.

## 10. DiPA intern noch lösbar: **2 / 48**

* **AK-INT-02** [B] Interoperabilität — in Arbeit
* **AK-BF-03** [C] Barrierefreiheit: manueller Screenreader-Durchgang (VoiceOver/NVDA)
  — die maschinelle Strukturprüfung ist erledigt, der Durchgang braucht eine reale
  Testsitzung mit einer Person

## 11. DiPA extern blockiert: **16 / 48**

11 × externer Dienstleister (Kategorie D), 5 × Behörde/Kostenträger (Kategorie E) —
alle 16 offen. Kritischer Pfad: **BSI TR-03161** (Monate Vorlauf).
Günstigster nächster Schritt: **BfArM-Beratungstermin** — klärt 9 offene Punkte auf einmal.

## 12. Tests: **2.877 / 2.915 bestanden**

```
Test Files  129 passed | 1 skipped (130)
     Tests  2877 passed | 38 skipped (2915)
  Duration  24,62 s
```

0 fehlgeschlagen. Die 38 übersprungenen sind bewusste Skips.
**+2 gegenüber dem Lauf vor dem Fix** — die beiden neuen Regressionstests zu H-3
(„der Audit-Eintrag ist überhaupt schreibbar" und „die Fehlermeldung ist die
Sperrbegründung, nicht der Constraint-Text").

## 13. tsc: **0 Fehler**

`npx tsc --noEmit` → Exit 0, vor und nach dem Fix.

## 14. Build / CI

* `npm run build` (Turbopack) → **erfolgreich**, Routen-Manifest vollständig.
* `npm run lint:forbidden` → **0 verbotene Strings** bei 23.819 gescannten Dateien.
* **CI-Historie korrigiert:** Die Vorgabe dieser Runde nannte „8 CI-Failures seit heute
  Nacht". Das war zum Startzeitpunkt bereits **überholt**. Die Fehlläufe stammen aus
  der Nacht (23:38–23:56 Uhr) und vom Vormittag (06:54–07:11 Uhr); Ursache war
  `useSearchParams()` ohne Suspense-Boundary auf `/pflegecoach/checkout`. Der Lauf um
  07:22 Uhr war bereits wieder grün, und der Lauf zu `6724d80` (`31794277623`, 5m16s)
  ist in **beiden** Jobs grün: „Typecheck, Lint, Tests, Build" und „E2E — PflegeCoach
  (DiPA-Matrix QS-05)". Es gab an diesem Punkt **nichts mehr zu reparieren**.
* CI-Lauf zum Fix-Commit `576c34b`: `31796623330` — siehe Fußnote.

## 15. Vercel Production

Commit-Status zu `6724d80`: **success**
(Deployment `5904964214`, „Deployment has completed").
`https://alltagsengel.care/` → **HTTP 200**.
Auch hier gilt die Korrektur aus Punkt 14: Es lagen zum Startzeitpunkt keine offenen
Vercel-Fehlschläge vor.

## 16. Supabase Production / Migrationen

**Live verifiziert (Katalogabfrage, nicht aus einer Liste abgeschrieben):**

| Prüfung | Ergebnis |
|---|---|
| `check_billing_gate` ohne `kasse_status` | ✅ false |
| `create_invoice_draft_atomic` mit `MISSING_SIGNATURE` | ✅ true |
| `validate_correction_atomic` + `create_credit_note_atomic` | ✅ beide vorhanden |
| `trg_immutable_sr_audit_update` / `trg_immutable_as_audit_delete` | ✅ beide vorhanden (je auch die Gegenoperation) |
| `trg_sync_clients_pflegegrad` | ✅ vorhanden |
| `service_type` in `prevent_finalized_service_record_mutation` | ✅ enthalten |
| VP/KZP-Budgets bei Pflegegrad ≥ 2 ohne Betrag | ✅ 0 |
| Zahlungsziel der `sent`-Rechnungen | ✅ 3 × 14 Tage |
| RLS auf allen 280 `public`-Tabellen | ✅ **0** Tabellen ohne RLS |
| Views mit `security_invoker` | ✅ 22/23; `state_settings_public` bewusst ausgenommen |
| SECURITY-DEFINER-Funktionen ohne `SET search_path` | ✅ **keine** |

**⚠️ NICHT angewendet: `20260912000000_audit_entity_type_invoice_draft.sql`.**
`scripts/apply-migration.mjs` scheitert mit
`42501 must be owner of table billing_audit_trail` — die `service_role` besitzt die
Tabelle nicht und darf kein DDL. **Diese eine Migration braucht einen Lauf im
Supabase-SQL-Editor** (siehe Punkt 20). Die Datei ist idempotent, additiv und hat eine
Rollback-Datei.

## 17. Ergebnis Audit A — Security / RLS / Datenschutz / Mandantentrennung / Audit-Trails

**Bestanden. Kein Cross-Tenant-Zugriff, kein IDOR-Befund, keine offene anon-Lücke.**

| # | Prüfung | Methode | Ergebnis |
|---|---|---|---|
| A1 | RLS auf `clients`, `service_records`, `invoices`, `invoice_items`, `client_budgets`, `assignments`, `billing_tariffs`, `leistungspreise`, `payments`, `billing_audit_trail` | Katalog | **PASS** — überall aktiv, überall genau ein `org_fence` |
| A2 | RLS-Abdeckung insgesamt | Katalog | **PASS** — 0 von 280 Tabellen ohne RLS |
| A3 | Org-Fence-Charakter | `pg_policies.permissive` | **PASS** — **191 von 191** org_fence-Policies sind RESTRICTIVE |
| A4 | **IDOR, Kunde** | Impersonation als `kunde` (`017c60f8…`) | **PASS** — 0 Zeilen aus *jeder* Geschäftstabelle **und** aus `pflege_uebersicht`, `kundenakte_uebersicht`, `mitarbeiterakte_uebersicht`, `dta_dashboard`, `wf_events_dashboard`, `personal_arbeitszeitkonto` |
| A5 | **IDOR, Engel** | Impersonation als `engel` (`03bc8ae5…`) | **PASS** — identisch 0 Zeilen |
| A6 | **IDOR, Unbekannter** | Impersonation mit Null-UUID | **PASS** — 0 Zeilen; die Fail-open-Zuordnung von `current_org_id()` zur Stamm-Org trennt Mandanten, **nicht** Rollen — die permissiven Rollen-Policies fangen den Fall ab |
| A7 | Admin-Sicht funktioniert noch | Impersonation als `admin` (`049105ef…`) | **PASS** — `is_admin()`=true, 30 Nachweise / 4 Klienten / 5 Rechnungen sichtbar; die Härtung hat den Betrieb nicht mitgesperrt |
| A8 | Views umgehen RLS | `reloptions` je View | **PASS** — 22/23 mit `security_invoker=true`; `state_settings_public` ist der bewusste öffentliche Endpunkt |
| A9 | anon-Leseleck auf Views | `has_table_privilege('anon', …)` | **PASS** — nur `state_settings_public` |
| A10 | Audit-Trails unveränderlich | 8 aktive Negativtests | **PASS** — `billing_audit_trail` (UPDATE+DELETE), `billing_tariff_audit` (UPDATE+DELETE), `wf_audit_log` (UPDATE), `service_record_audit_log` (UPDATE+DELETE gegen eine frisch erzeugte Zeile) — alle P0001 |
| A11 | SECDEF ohne `search_path` | Katalog | **PASS** — keine |
| A12 | anon-EXECUTE auf SECDEF | Katalog | **PASS mit Hinweis** — 4 Treffer (`sync_service_record_status`, `set_invoice_due_date`, `trg_verifizierung_verfaellt`, `prevent_finalized_service_record_mutation`), **alle vier `RETURNS trigger`**: über PostgREST nicht aufrufbar und direkt nur als Trigger ausführbar. Kein Angriffsweg, aber Hygiene-Punkt |
| A13 | `billing_audit_trail` Prüfsummen | Katalog | **PASS** — `checksum`, `checksum_before`, `checksum_after`, `migration_id` vorhanden |
| A14 | service_role im Client-Bundle | Grep über `app/`, `components/` | **PASS** — ausschließlich in `route.ts`-Handlern, in keiner `'use client'`-Datei |
| A15 | Verbotene Strings / Secrets | `npm run lint:forbidden` | **PASS** — 0 Treffer bei 23.819 Dateien |

**Zwei Befunde aus früheren Berichten ausdrücklich widerrufen:**
Ein erster Katalogdurchlauf meldete „23 Views ohne `security_invoker`" — die
Suchbedingung dieses Durchlaufs prüfte auf `security_invoker=…on…` statt auf
`=true` und war schlicht falsch. Ebenso meldeten vier Negativtests
(`service_record_audit_log`/`assignment_audit_log` UPDATE+DELETE) zunächst
„durchgelassen": Beide Tabellen waren **leer**, das `WHERE id = (SELECT … LIMIT 1)`
traf 0 Zeilen, und ein Trigger, der nie feuert, beweist nichts. Der Nachtest mit einer
frisch erzeugten Zeile bestätigt: die Sperre greift. **Beide Male galt: erst der
Gegentest, dann das Urteil.**

## 18. Ergebnis Audit B — Klient bis Rechnung und Zahlung

**Bestanden mit einem HOCH-Befund (H-3, siehe Punkt 2) und einem MITTEL-Befund (M-7, Punkt 3).**

### Positivkette

| Schritt | Zustand |
|---|---|
| Kundenanlage → Pflegegrad | `pflegegradVon()` als führende Quelle (`care_level`), `trg_sync_clients_pflegegrad` hält `pflegegrad` nach |
| Pflegegrad → Budget | `lib/budget/auto-budget.ts`; §45b in `annual_amount`, §42a VP/KZP in `combined_annual_amount`. Live: **0** Klienten mit Pflegegrad ≥ 2 ohne VP/KZP-Betrag. Entlastungsbetrag **131 €/Monat** |
| Einsatzplanung | `pruefeBudget()` / `pruefeVPBudget()` in `app/api/einsatzplanung/route.ts:125` und `app/api/tours/route.ts:141` — Budgetprüfung sitzt **vor** der Einsatzanlage |
| Leistungsnachweis → Unterschrift | `app/api/leistungsnachweis/crud/route.ts:220` setzt `proof_status='UNTERSCHRIEBEN'`, `trg_compute_signature_hash` erzeugt den Hash, `trg_sync_record_status` hält `status` nach (monoton vorwärts) |
| Rechnung | `create_invoice_draft_atomic` v8, idempotent über `idempotency_key` |
| Zahlungsziel | `trg_set_invoice_due_date` — 14 Tage, live bei allen `sent`-Rechnungen gesetzt |
| Zahlung → OPOS → Mahnwesen | `lib/billing/core/payments.ts`, `lib/billing/opos`, `lib/billing/dunning`, `lib/billing/camt`, `lib/billing/matching` vorhanden. **Live: 0 Zahlungen** — dieser Abschnitt ist auf Produktionsdaten nie gelaufen |
| Korrektur / Storno | `validate_correction_atomic` + `create_credit_note_atomic`, beide live |

### Negativtests (Auszug — alle gegen die Produktionsdatenbank, mit Rollback)

| Test | Erwartung | Ergebnis |
|---|---|---|
| Rechnung ohne Unterschrift | blockiert | ✅ blockiert — **aber mit falschem Fehler → H-3** |
| Rechnung für fremde Organisation | blockiert | ✅ „Klient gehört nicht zu Organisation …" |
| Unbekannter `budget_type` | blockiert | ✅ Whitelist: entlastung, verhinderung, carryover, haeusliche_pflege_36, private |
| Gutschrift über Rechnungsbetrag | blockiert | ✅ „99999999 Cent übersteigt verfügbaren Betrag (18700 Cent)" |
| `service_type` an abgerechnetem Nachweis | blockiert | ✅ P0001 |
| `amount` an abgerechnetem Nachweis | blockiert | ✅ P0001 |
| `invoiced` → `draft` zurücksetzen | blockiert | ✅ P0001 |
| `amount` an unterschriebenem Nachweis | blockiert | ✅ P0001 |
| Betrag/Nummer an `sent`-Rechnung | blockiert | ✅ P0001 |
| Betrag an `paid`-Rechnung | blockiert | ✅ P0001 |
| Tarif ohne Rechtsquelle auf `verified` | blockiert | ✅ 23514 „verlangt eine Rechtsquelle (mindestens 5 Zeichen)" |
| Leistungspreis ohne Bearbeiter auf `verified` | blockiert | ✅ 23514 „verlangt einen Bearbeiter" |

**Korrektur einer Fehlvermutung:** `validate_correction_atomic` lässt eine **bezahlte**
Rechnung durch. Das ist **richtig** und kein Befund — abgewiesen werden nur `storniert`
und `abgeschrieben`. Eine Korrektur zu einer bezahlten Rechnung ist ein normaler
buchhalterischer Vorgang.

**Nicht prüfbar in dieser Runde:** die Budget-Überschreitungsgrenze auf DB-Ebene. Der
Testeinsatz scheiterte an einer `NOT NULL`-Spalte (`caregiver_initials`), bevor eine
Budgetprüfung greifen konnte. Die Prüfung liegt nachweislich in der API-Schicht
(`pruefeBudget`), **nicht** als DB-Trigger — wer an der API vorbei schreibt, umgeht sie.

## 19. Verbleibende externe Voraussetzungen

| Voraussetzung | Wer | Was sie freischaltet |
|---|---|---|
| **§45a-Bescheid Hessen** | Land Hessen | §45b + VP/KZP + §105-DTA gleichzeitig — größter einzelner Umsatzhebel |
| ITSG-Zertifizierung | ITSG Trust Center | DTA-Versand (Code fertig, Gate `ITSG_ZERTIFIZIERT`) |
| SECON-Zertifikat | Trust Center | Verschlüsselung für DTA |
| SFTP-Zugangsdaten | Kostenträger | Realer Versandweg |
| SEPA-Gläubiger-ID | Deutsche Bundesbank | Lastschrifteinzug (aktuell Platzhalter) |
| Technische Anlage 1 (§302) | GKV-Spitzenverband | §302-Generator bleibt bis dahin bewusst gesperrt |
| Kassen-Fehlercode-Katalog | Kostenträger | Rückläufer-Auswertung |
| Vergütungsvereinbarung §39 / §45b | Kassenverbände | Preisgrundlage — ohne sie bleibt jeder Kassentarif unverified/blocked |
| BSI TR-03161 | Prüfstelle | DiPA — **kritischer Pfad, Monate Vorlauf** |
| DSFA | Kanzlei / DSB | DiPA |
| AVV-Verträge (Supabase, Vercel, Resend, Stripe) | Anbieter | DiPA |
| Penetrationstest | Sicherheitsdienstleister | DiPA (Beauftragungsunterlage versandfertig) |
| ISMS-Beratung | Dienstleister | DiPA |
| BITV-Test + Gebrauchstauglichkeitstest | Prüfstelle / 5 Testpersonen | DiPA |
| Pflegefachliche Inhaltsprüfung | Fachperson | DiPA — **höchstes Produktrisiko** |
| Instrumentenlizenzen (FES-I, HPS/BSFC-s, SUS) | Lizenzgeber | DiPA |
| Evaluationspartner + Ethikvotum | Hochschule / Ethikkommission | DiPA |
| BfArM-Aufnahme | BfArM | DiPA-Erstattungsfähigkeit |

## 20. Was ausschließlich Yusuf persönlich erledigen muss

Nach Wirkung geordnet:

1. **Eine SQL-Datei im Supabase-SQL-Editor ausführen** — der einzige technische Punkt.
   Inhalt von `supabase/migrations/20260912000000_audit_entity_type_invoice_draft.sql`
   einfügen und ausführen. Danach meldet ein Rechnungsversuch ohne Unterschrift wieder
   im Klartext, woran er scheitert, und der Audit-Eintrag entsteht. Idempotent, additiv,
   Rollback-Datei liegt daneben. *Grund, warum das nicht autonom lief:* die
   `service_role` besitzt `billing_audit_trail` nicht und darf kein DDL (42501).

2. **PflegeCoach-Preise festlegen** — kaufmännische Entscheidung, Stripe-Price-IDs
   anlegen, dann `COACH_PREISE_FREIGEGEBEN=true`. Die einzige Umsatzquelle **ohne**
   externen Blocker.

3. **§45a-Antrag Hessen nachfassen** — steht auf `ANTRAG_EINGEREICHT`. Längste
   Vorlaufzeit, größter Hebel.

4. **SEPA-Gläubiger-ID beantragen** — Bundesbank, kostenfrei, online. Ohne sie muss
   jede Rechnung manuell überwiesen werden.

5. **Tarifentscheidung** — die 8 blockierten §45b-Tarife belegen oder neu vereinbaren;
   für §39 VP fehlt jede Preisgrundlage. Ohne Beleg lässt der DB-Trigger keine
   Freigabe zu (das ist gewollt).

6. **ITSG-Zertifizierung anstoßen** und SECON-Zertifikat beschaffen.

7. **Falls DiPA ein Ziel bleibt:** BfArM-Beratungstermin beantragen (klärt 9 Punkte auf
   einmal), Kanzlei für die DSFA, Pentest-Angebote, TR-03161-Prüfstelle. Alle mit
   Monaten Vorlauf — wenn, dann jetzt.

**Nicht auf dieser Liste:** M-7 (Audit-Trigger für `assignments`) — intern lösbar,
bewusst außerhalb dieser Runde gehalten, weil es eine neue Kontrolle wäre.

---

### Fußnote zum CI-Lauf des Fix-Commits

CI-Lauf `31796623330` zu `576c34b`:

* **„Typecheck, Lint, Tests, Build" → `success`.** Das ist der Job, der den Fix prüft.
* **„E2E — PflegeCoach (DiPA-Matrix QS-05)" → beim Schreiben dieses Berichts noch nicht
  fertig.** Der Job hing über 25 Minuten im Schritt *Install Playwright browsers*
  (Browser-Download), während derselbe Job im Lauf davor (`31794277623`) in 5m16s
  komplett durchlief. Das ist Runner-Infrastruktur, kein Ergebnis dieses Commits — der
  Commit ändert eine Testdatei und legt zwei SQL-Dateien an, **kein Anwendungscode**
  und nichts, was die E2E-Suite berührt.

Lokal vor dem Push: `npx tsc --noEmit` → 0 Fehler, `npm test` → 2.877/2.915 grün,
`npm run build` → erfolgreich. Vercel-Production-Status zu `576c34b`: **success**.

### Was dieser Bericht bewusst NICHT behauptet

* **Nicht**, dass eine Kasse zahlt. Kein Bundesland ist freigeschaltet.
* **Nicht**, dass die 35 €/h-Tarife gültig sind. Sie bleiben **blocked**.
* **Nicht**, dass DiPA antragsreif ist. 6 % belastbare Quote gegen Originaldokumente.
* **Nicht**, dass der Zahlungs-/Mahnweg erprobt ist. Live: 0 Zahlungen.
* **Nicht**, dass 5 von 6 Organisationen echte Mandanten sind — es sind Testmandanten.
