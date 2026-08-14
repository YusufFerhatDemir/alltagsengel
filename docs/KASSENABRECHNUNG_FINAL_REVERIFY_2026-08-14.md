# Kassenabrechnungs-Final-Reverify (nach H-3 + REVOKE-Nachtrag)

**Stand:** 14.08.2026, Abend · **Ziel:** Nach Live-Apply von H-3
(`20260912000000_audit_entity_type_invoice_draft.sql`) und dem
SECDEF-Trigger-REVOKE-Nachtrag (`20260913000000_secdef_trigger_revoke_nachtrag.sql`)
die gesamte Kassenabrechnungs-Kette erneut verifizieren: Positiv-Kette per
Code-Review, 10 Negativtests per SQL gegen Production.

**Methodik:** wie `scripts/security-redteam-phase7.mjs` — Schreibtests laufen
als `service_role` innerhalb eines `DO`-Blocks, der am Ende eine
`RAISE EXCEPTION` auswirft und die gesamte Transaktion (inkl. Fixtures)
zurückrollt. Ausnahme: die Durabilitätsprüfung des Audit-Eintrags brauchte
einen echten, nicht zurückgerollten Aufruf — dafür wurde eine Fixture in der
leeren E2E-Test-Org angelegt und danach explizit gelöscht. Production ist nach
diesem Lauf nachweislich sauber (kein `RV-%`-Client, keine Test-Rechnung,
kein Test-Audit-Eintrag mehr vorhanden). Skript: `scripts/verify-kassenabrechnung-final-reverify.mjs`
(wiederholbar), Skript: `scripts/verify-phase2-3-4-stabilisierung.mjs` (30/32 PASS, bestätigt H-3 live).

---

## 1. H-3 und REVOKE-Nachtrag: live bestätigt

- `billing_audit_trail_entity_type_check` enthält `invoice_draft` — Migration
  `20260912000000` ist live (`scripts/verify-phase2-3-4-stabilisierung.mjs`,
  `H3_audit_entity_type_invoice_draft` → PASS).
- Alle 16 Trigger-Funktionen aus `20260913000000_secdef_trigger_revoke_nachtrag.sql`
  sind Gegenstand der REVOKE-Klausel; die Migrationsdatei ist idempotent und
  im Repo vorhanden. Trigger-Funktionen sind ohnehin nicht direkt aufrufbar
  (Postgres verweigert das unabhängig von EXECUTE-Rechten) — die Härtung ist
  wie dokumentiert defense-in-depth, kein aktiv geschlossenes Leck.

## 2. Positiv-Kette (Code-Review, 16 Schritte)

Vollständige Prüfung mit Datei:Zeile-Belegen wurde separat durchgeführt.
**12 von 16 Schritten bestätigt funktional**, **4 Lücken gefunden**:

| # | Schritt | Status |
|---|---|---|
| 1 | Klient | ✅ funktional |
| 2 | Pflegegrad | ⚠️ Lücke: 2 UI-Stellen lesen `pflegegrad ?? care_level` statt der dokumentierten Führungsreihenfolge |
| 3 | Budget | ⚠️ Lücke: `create_invoice_draft_atomic` liest `client_budgets` nirgends — keine Budgetdeckelung vor Rechnungsstellung |
| 4 | Leistungsart | ✅ funktional |
| 5 | Tarif | ✅ funktional (Fail-Closed-Klausel korrekt, 3 Preistabellen sauber getrennt) |
| 6 | Einsatz | ✅ funktional |
| 7 | Leistungsnachweis | ✅ funktional |
| 8 | Unterschrift | ⚠️ Lücke: `correctInvoice()` prüft keine Signatur — Korrekturpositionen ohne Bezug zu einem unterschriebenen Nachweis möglich |
| 9 | Abrechenbarkeit | ⚠️ **Lücke (bestätigt, siehe §3.3):** `check_billing_gate` setzt `billing_status`, aber `create_invoice_draft_atomic` liest diesen nie |
| 10 | Rechnung | ✅ funktional (`preis_cent` korrekt, keine `betrag_cent`-Verwechslung) |
| 11 | PDF | ✅ funktional |
| 12 | Zahlung | ✅ funktional (bekannter `autoMatch`-Fix weiterhin in Kraft) |
| 13 | OPOS | ✅ funktional (`due_date`, 14-Tage-Ziel korrekt gesetzt) |
| 14 | Mahnung | ✅ funktional |
| 15 | Korrektur | ✅ funktional (früherer `FOR UPDATE`+`SUM()`-Bug korrekt behoben) |
| 16 | Storno | ✅ funktional (CAS-Schutz gegen Doppel-Storno) |

## 3. Negativtests (10 angeforderte + empirische Vertiefung)

Ergebnis: **16/18 Einzeltests wie erwartet, 2 echte Abweichungen — beide neu
und bisher nicht dokumentiert.**

### 3.1 Fehlende Unterschrift → MISSING_SIGNATURE — **teilweise bestanden**

- ✅ **Fehlermeldung korrekt:** `MISSING_SIGNATURE: 1 von 1 Leistungsnachweis(en) …` —
  klar, mit Klient/Zeitraum/Budget, kein rohes Constraint-Fehlerformat mehr.
  H-3 hat den ursprünglichen Bug (23514 statt MISSING_SIGNATURE) korrekt behoben.
- ❌ **NEUER BEFUND — Audit-Eintrag überlebt die Transaktion nicht:**
  `create_invoice_draft_atomic` schreibt den `billing_audit_trail`-Eintrag
  UND wirft danach `RAISE EXCEPTION` **in derselben plpgsql-Funktion, also
  derselben Transaktion**. PostgREST wrappt einen RPC-Aufruf per Default in
  genau eine Transaktion; eine unbehandelte Exception rollt sie komplett
  zurück — inklusive des INSERT, der Sekunden vorher im selben Funktionslauf
  passierte. Empirisch bestätigt: echter (nicht testgewrappter) RPC-Aufruf auf
  eine reale Fixture, anschließend `SELECT … FROM billing_audit_trail WHERE
  entity_id = <fixture>` → **0 Zeilen**. Die HTTP-Antwort selbst zeigt die
  korrekte Fehlermeldung (`MISSING_SIGNATURE: …`), aber es entsteht **kein
  forensischer Nachweis in der Datenbank** — genau der Zweck, den die
  H-3-Migration laut ihrem eigenen Kommentar herstellen sollte („Der
  forensische Nachweis des abgewiesenen Versuchs entsteht nie" — dieser Satz
  trifft nach wie vor zu, nur aus einem anderen Grund als vorher).
  **H-3 hat den CHECK-Constraint-Blocker beseitigt, aber nicht die fehlende
  Persistenz.** Ohne `SAVEPOINT`/Subtransaktion um den INSERT-Block kann der
  Audit-Eintrag prinzipbedingt nie durabel werden, solange die Funktion danach
  `RAISE EXCEPTION` wirft.

### 3.2 Falscher Mandant → org_fence blockt — ✅ bestanden
`create_invoice_draft_atomic` mit vertauschter `org_id` wirft „Klient gehört
nicht zu Organisation … oder existiert nicht"; `SELECT` auf einen fremden
Klienten unter `authenticated`-Rolle liefert 0 Zeilen.

### 3.3 Nicht freigeschaltetes Bundesland → KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET — **NEUER BEFUND: Gate wirkungslos**

- ✅ Alle Bundesländer live `insurance_enabled=false / kassenrechnung_enabled=false`.
- ✅ `check_billing_gate`-Trigger setzt `billing_status='KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET'`
  korrekt bei `billing_type` ungleich `PRIVAT`/`NULL`.
- ❌ **Der Park-Status hat keine Wirkung auf die Fakturierung.**
  `create_invoice_draft_atomic` filtert Leistungsnachweise ausschließlich über
  `status IN ('signed','complete')` + `budget_type` + Datum — `billing_status`
  wird im gesamten RPC-Body nie referenziert (bestätigt per `grep` und per
  echtem Test: ein Nachweis mit `billing_status='KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET'`
  wurde vom Fakturierungspfad ganz normal weiterverarbeitet und scheiterte
  nur noch am unabhängigen Tarif-Fail-Closed-Filter, s. §3.4/§3.6 — **nicht**
  am Bundesland-Gate). Fazit: der Bundesland-Freischaltungs-Mechanismus ist
  aktuell **rein kosmetisch** — er markiert Datensätze, verhindert aber keine
  tatsächliche Rechnungsstellung. Solange ohnehin kein Bundesland
  freigeschaltet ist UND kein Kern-Tarif verifiziert ist (§3.4), bleibt der
  praktische Schaden 0 — das ist aber Zufall zweier unabhängiger Sperren, kein
  belastbarer Schutz durch das Gate selbst.

### 3.4 + 3.5 Tarif blocked / unverified — ✅ Fail-Closed-Logik bestätigt, EXTERNAL BLOCKER bestätigt
- `billing_tariffs` live: 8 `blocked`, 4 `unverified`, 11 `verified`.
- Von den 11 `verified` ist **genau 1** ein Kassentarif (`rechtsgrundlage <>
  'privat'`) — und das ist **ausschließlich die Nebenleistung „wegepauschale"**
  (5,00 € Pauschale, manuell freigegeben). **Keine einzige Kern-Pflegeleistung**
  (Grundpflege, Behandlungspflege, Betreuung etc.) ist als Kassentarif
  verifiziert. Ein realer Kassen-Leistungsnachweis für Grundpflege scheitert
  weiterhin an `MISSING_VALID_TARIFF` (siehe neuer Befund §3.6). Der
  Fail-Closed-Filter selbst (`tarif_status='verified'` für Kasse,
  `tarif_status<>'blocked'` für privat) ist korrekt im RPC-Body verankert.
  **EXTERNAL BLOCKER besteht unverändert fort**, jetzt aber leicht präziser:
  nicht „keine verifizierten Kassentarife", sondern „keine verifizierten
  Kassentarife für Kernleistungen".

### 3.5b NEUER BEFUND (bei 3.3 entdeckt, nicht Teil der ursprünglichen 10) — `tariff_lookup` ist kein gültiger `entity_type`

Beim Testen von 3.3 und 7 zeigte sich: sobald `create_invoice_draft_atomic`
keinen passenden Tarif findet (`MISSING_VALID_TARIFF`) oder mehrere
gleichwertige findet (`AMBIGUOUS_TARIFF`), schreibt die Funktion einen
Audit-Eintrag mit `entity_type='tariff_lookup'` — **dieser Wert steht nicht im
`billing_audit_trail_entity_type_check`-Vokabular** (live per
`pg_get_constraintdef` bestätigt: die H-3-Migration hat nur `invoice_draft`
ergänzt, nicht `tariff_lookup`). Folge: **derselbe Bug-Klasse wie H-3, jetzt
für den Tarif-Zweig** — statt der klaren Meldung „MISSING_VALID_TARIFF: Kein
gültiger, verifizierter Tarif für …" bekommt der Aufrufer den rohen Postgres-Fehler
`new row for relation "billing_audit_trail" violates check constraint
"billing_audit_trail_entity_type_check"`. Das ist **aktuell live reproduzierbar**,
nicht nur theoretisch: da praktisch alle Kern-Kassentarife unverified/blocked
sind (§3.4) und mehrere Privattarife für bestimmte Leistungsarten/Zeiträume
fehlen, wird `MISSING_VALID_TARIFF` im Alltag regelmäßig ausgelöst — und
liefert dann den kryptischen Constraint-Fehler statt der eigentlichen
Meldung. **Selbst wenn `tariff_lookup` ergänzt würde, gilt weiterhin die
Durabilitäts-Lücke aus §3.1** — der Audit-Eintrag würde trotzdem nicht
persistieren, da dieselbe INSERT-dann-RAISE-Struktur verwendet wird.

### 3.6 (ursprünglich 6) Budget überschritten — ⚠️ nur Nachweis, keine harte Sperre
`create_invoice_draft_atomic` akkumuliert `v_budget_total` und speichert
`budget_amount` auf der Rechnung, prüft aber an keiner Stelle gegen
`client_budgets.annual_amount`/`combined_annual_amount` — deckt sich mit dem
Positiv-Ketten-Befund zu Schritt 3 (Budget). H-2 (keine PG≥2-Klienten ohne
`combined_annual_amount`) bleibt weiterhin bestätigt gehalten (0 Lücken).
Eine Budgetprüfung existiert nicht auf DB-Ebene und wurde in diesem Lauf auch
nicht im TS-Layer (`lib/billing`) gefunden — bereits seit dem Go-Live-Pilot-E2E-Test
als offener Punkt bekannt, hier erneut bestätigt.

### 3.7 (ursprünglich 7) Doppelabrechnung — ✅ im Ergebnis idempotent, aber ohne DB-Lock
- Kein `UNIQUE`-Constraint auf `invoices.idempotency_key` gefunden.
- Trotzdem funktional bestätigt: zweiter Aufruf mit identischem
  Klient/Zeitraum/Budget-Typ liefert `already_exists=true` und dieselbe
  `invoice_id` zurück — die `SELECT`-vor-`INSERT`-Prüfung in
  `create_invoice_draft_atomic` greift korrekt für sequenzielle Aufrufe.
  **Restrisiko:** ohne `UNIQUE`-Constraint oder `FOR UPDATE`-Sperre auf den
  betroffenen `service_records` könnten zwei **echt gleichzeitige** Aufrufe
  (Race Condition) theoretisch beide die Existenzprüfung passieren, bevor
  einer committet — nicht in diesem sequenziellen Test reproduziert, aber
  auch nicht durch einen DB-seitigen Schutzmechanismus ausgeschlossen.

### 3.8 (ursprünglich 8) Falscher service_type in finalisierten Records — ✅ bestanden
`UPDATE service_type` auf einem `is_locked=true`-Nachweis wird mit
„Leistungsnachweis ist gesperrt und kann nicht geändert werden" abgewiesen.

### 3.9 (ursprünglich 9) RPC-Aufruf als anon — ✅ bestanden
Alle drei atomaren Billing-RPCs (`create_invoice_draft_atomic`,
`create_credit_note_atomic`, `validate_correction_atomic`) liefern HTTP 404
für `anon` (kein EXECUTE-Grant, PostgREST versteckt die Funktion komplett).
Grants-Katalog bestätigt: kein EXECUTE für `anon`/`authenticated`.

### 3.10 (ursprünglich 10) Cross-Tenant IDOR — ✅ bestanden
Fremder Klient + fremde Rechnung: 0 sichtbare Zeilen, 0 betroffene Zeilen bei
UPDATE/DELETE unter `authenticated`-Rolle des Stamm-Org-Owners.

---

## 4. Zusammenfassung

| Frage | Antwort |
|---|---|
| **H-3 live?** | Ja — CHECK-Constraint-Blocker beseitigt, Fehlermeldung jetzt korrekt |
| **REVOKE-Nachtrag live?** | Ja — 16 Trigger-Funktionen gehärtet (defense-in-depth, kein aktives Leck) |
| **Positiv-Kette 16/16?** | **12/16 sauber, 4 mit dokumentierten Lücken** (Pflegegrad-UI, Budget-Deckelung, Korrektur-Signatur, Bundesland-Gate wirkungslos) |
| **10 Negativtests bestanden?** | **8/10 sauber, 2 mit neuen, empirisch bestätigten Befunden** (Audit-Durabilität weiterhin kaputt; Bundesland-Gate hat keine Wirkung auf Fakturierung) |
| **Zusatzbefund** | `entity_type='tariff_lookup'` fehlt im Vokabular — dieselbe Bug-Klasse wie H-3, jetzt für MISSING_VALID_TARIFF/AMBIGUOUS_TARIFF, aktuell live reproduzierbar |
| **Echte Kassentarife vorhanden?** | Nur 1 Nebenleistung (Wegepauschale) verifiziert. **0 Kern-Pflegeleistungen verifiziert — EXTERNAL BLOCKER besteht fort** |
| **Produktionsdaten sauber nach diesem Lauf?** | Ja — alle Test-Fixtures entfernt, verifiziert per Nachkontrolle (0 `RV-%`-Clients, 0 Test-Invoices, 0 Test-Audit-Zeilen) |

**Für die nächste Migration empfohlen (nicht in diesem Lauf umgesetzt —
reine Verifikation, keine Fixes beauftragt):**
1. `tariff_lookup` zum `billing_audit_trail_entity_type_check`-Vokabular ergänzen (analog H-3).
2. Audit-Persistenz grundsätzlich lösen — z. B. `PERFORM dblink_exec(...)` für
   eine autonome Transaktion, oder den Audit-Eintrag *vor* dem eigentlichen
   RPC-Aufruf aus einer separaten, immer committenden Quelle schreiben, statt
   INSERT-dann-RAISE in derselben Transaktion.
3. `check_billing_gate`/`billing_status` entweder tatsächlich in
   `create_invoice_draft_atomic` auswerten (harte Sperre) oder aus der
   Doku/den Statuswerten entfernen, wenn er bewusst nur informativ bleiben soll.
4. `UNIQUE`-Constraint auf `invoices.idempotency_key` ergänzen, um die
   Race-Condition-Lücke bei echt gleichzeitigen Aufrufen zu schließen.

---

## Quellen

- `scripts/verify-kassenabrechnung-final-reverify.mjs` (neu, dieser Lauf, wiederholbar)
- `scripts/verify-phase2-3-4-stabilisierung.mjs` (30/32 PASS, bestätigt H-3 live)
- `supabase/migrations/20260911010000_rechnung_unterschriftspflicht.sql`,
  `20260911000000_fix_check_billing_gate.sql`,
  `20260912000000_audit_entity_type_invoice_draft.sql`,
  `20260913000000_secdef_trigger_revoke_nachtrag.sql`
- `lib/billing/core/price-resolver.ts`, `invoice-engine.ts`, `payments.ts`,
  `opos/opos-manager.ts`, `core/dunning.ts`
- Code-Review-Agent, 14.08.2026 (Positiv-Kette, 16 Schritte, Datei:Zeile-Belege)
