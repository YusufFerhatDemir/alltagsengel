# P4 — Kassenabrechnung Komplett-Reverify nach Audit-Persistenz v9

**Stand:** 14.08.2026, später Abend · **Anlass:** Reverify nach Live-Apply von
`20260914000000_audit_persistenz_v9.sql` (`create_invoice_draft_atomic` v9,
RETURNS JSONB statt RAISE bei `MISSING_SIGNATURE`; `tariff_lookup` im
Entity-Type-Constraint) und `20260914010000_security_search_path_und_profiles.sql`
(`profiles_select_engels` gedroppt, `search_path` bei 4 Funktionen gesetzt).

**Methodik:** `scripts/verify-phase2-3-4-stabilisierung.mjs` +
`scripts/verify-kassenabrechnung-final-reverify.mjs` (beide bestehend) plus
gezielte Ad-hoc-Prüfungen gegen die v9-Vertragsänderung (JSONB-Rückgabe statt
Composite-Type). Schreibtests laufen als `service_role` in einem `DO`-Block
mit abschließendem `RAISE EXCEPTION` → vollständiger Rollback. Production ist
nach diesem Lauf nachweislich sauber (kein `RV-%`/`RV9-%`-Client, keine
Test-Rechnung, kein Test-Audit-Eintrag zurückgeblieben — verifiziert).

---

## Zusammenfassung

| Frage | Antwort |
|---|---|
| **A) Intern technisch ready?** | **JA für den geprüften Umfang** — alle 5 angeforderten Punkte live bestätigt, 0 Regressionen |
| **B) Extern freigeschaltet?** | **NEIN, wie erwartet** — `insurance_enabled`/`kassenrechnung_enabled` = `false/false` für alle 16 Bundesländer × alle Orgs. Jeder Kassenweg bleibt am Gate geparkt. |

**Wichtiger Fund während der Reverify:** Die beiden alten Testskripte meldeten
2 FAILs (`1a_missing_signature_fehlermeldung`,
`7_doppelabrechnung_idempotent_verhindert`). Beide sind **keine Regressionen**,
sondern **Testcode**, der noch den v8-Vertrag erwartet (RAISE EXCEPTION +
Composite-Type `create_invoice_draft_result`). Mit v9 gibt die Funktion bei
`MISSING_SIGNATURE` ein `JSONB` mit `success:false` zurück statt zu raisen —
das ist die beabsichtigte Änderung. Nach Anpassung der Prüflogik an den
v9-Vertrag: beide Fälle bestätigt korrekt (siehe §2 und §3).

---

## A) Intern technisch ready — Einzelprüfung

### A1. `check_billing_gate()` → `state_flag()` statt `kasse_status`
✅ **PASS** (bereits P0, erneut bestätigt) — `state_flag()` im Funktionskörper
aufgerufen, kein `kasse_status`-Vorkommen mehr.

### A2. `create_invoice_draft_atomic` v9 — RETURNS JSONB, MISSING_SIGNATURE → Audit persistiert + Fehler-JSON

✅ **NEU VERIFIZIERT, PASS.**

- Rückgabetyp live: `jsonb` (`pg_get_function_result` bestätigt, 1 Funktion
  dieses Namens, keine Überladung).
- Test: Klient mit unterschriftslosem Leistungsnachweis (§45b, entlastung) →
  RPC-Aufruf **wirft keine Exception mehr**, sondern liefert
  `success=false error=MISSING_SIGNATURE`. Danach: **0 Rechnungen** für den
  Klienten in `invoices` — kein Leck, kein Teil-Insert.
- Audit-Eintrag durabel (§2 unten, echter nicht zurückgerollter Aufruf):
  `missing_signature|MISSING_SIGNATURE` in `billing_audit_trail`
  überlebt die Transaktion — **das ist exakt der v9-Fix, der den am
  14.08. abends dokumentierten Befund (`kassenabrechnung-audit-durabilitaet-kaputt`)
  schließt.**
- `invoice-engine.ts:259-271` prüft `rpcResult.success === false` und wirft im
  App-Layer korrekt (`MISSING_SIGNATURE` → Error, Tarif-Fehler → mit
  `tariffErrorCode`, sonstige → generischer Error). Kein anderer Call-Site im
  Repo ruft die RPC direkt auf (`grep` über `app/` und `lib/` bestätigt — nur
  Kommentare referenzieren den Funktionsnamen).

**Bekannte, im Migrationskommentar selbst dokumentierte Einschränkung, erneut
bestätigt:** `MISSING_VALID_TARIFF`/`AMBIGUOUS_TARIFF` behalten weiterhin
`RAISE EXCEPTION` (nicht JSONB) — bei diesen Fehlern ist zu dem Zeitpunkt
bereits eine Rechnungszeile angelegt, die zurückgerollt werden muss. Live
nachgetestet: Audit-Insert für `tariff_lookup` bei `MISSING_VALID_TARIFF`
läuft in **derselben** Transaktion wie der nachfolgende `RAISE` →
`audit_zeilen_innerhalb_derselben_tx=0` nach Rollback. **Das ist kein neuer
Fund, sondern die im Migrationskommentar explizit benannte Grenze von v9**
(„der Audit-Eintrag wird ebenfalls zurückgerollt — das ist eine bekannte
Einschränkung"). Für die Praxis irrelevant, solange kein Kassenweg
freigeschaltet ist (siehe B).

### A3. `tariff_lookup` im Entity-Type-Constraint

✅ **NEU VERIFIZIERT, PASS.** `billing_audit_trail_entity_type_check` enthält
`tariff_lookup` (direkte Constraint-Definition abgefragt, `LIKE
'%tariff_lookup%'` → `JA`). Damit können `MISSING_VALID_TARIFF`- und
`AMBIGUOUS_TARIFF`-Audit-Inserts den CHECK passieren (auch wenn sie wegen A2
innerhalb der Fehler-Transaktion trotzdem zurückgerollt werden — der
Constraint selbst blockiert sie nicht mehr vorzeitig).

### A4. `invoice-engine.ts` prüft `success===false` und wirft im App-Layer

✅ **NEU VERIFIZIERT, PASS.** Siehe Code-Stelle `lib/billing/core/invoice-engine.ts:259-271`.
Kommentar im Code selbst benennt den v9-Vertrag korrekt ("v9: Fehler-JSON
erkennen (Audit-Eintrag wurde in der DB persistiert, kein Rollback)").

### A5. Budget-Konstanten, Tarif-Status, Unterschriftspflicht

- Entlastungsbetrag: **131€/Monat** live bestätigt (`monthly_amount` — alle
  gesetzten Werte = 131, keine Abweichung).
- VP/KZP: **3539€/Jahr gemeinsam** live bestätigt (`combined_annual_amount` —
  alle gesetzten Werte = 3539).
- Tarif-Status-Vokabular: `verified`/`unverified`/`blocked` per CHECK
  erzwungen, live-Verteilung `blocked=8 · unverified=4 · verified=11`.
- Unterschriftspflicht bleibt fail-closed (A2) — auch privat abgerechnete
  Leistungen benötigen `signature_hash`/`proof_status='UNTERSCHRIEBEN'`.

---

## B) Extern freigeschaltet — Einzelprüfung

✅ **PASS (alles wie erwartet gesperrt).**

`state_settings` — alle 16 Bundesländer (je 6 Zeilen/Orgs) zeigen
`insurance_enabled=false` und `kassenrechnung_enabled=false`, keine einzige
Ausnahme:

```
baden_wuerttemberg, bayern, berlin, brandenburg, bremen, hamburg, hessen,
mecklenburg_vorpommern, niedersachsen, nordrhein_westfalen, rheinland_pfalz,
saarland, sachsen, sachsen_anhalt, schleswig_holstein, thueringen
→ jeweils false/false
```

Damit bleibt jeder Kassenweg am `check_billing_gate`-Trigger
(`billing_status = 'KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET'`) geparkt —
Business-Layer-Ergebnis bestätigt live: RPC-Aufruf für einen geparkten
Kassen-Leistungsnachweis endet mit `GEBLOCKT:MISSING_VALID_TARIFF` (Gate
UND Tarif-Fail-Closed greifen unabhängig voneinander).

Zusätzlich weiterhin gültig: nur die Nebenleistung **`wegepauschale`**
(5,00€ Pauschale) ist als Kassentarif `verified` — **keine einzige
Kern-Pflegeleistung** (Grundpflege/Behandlungspflege/etc.) ist verifiziert.
Ein echter Kassen-Leistungsnachweis scheitert also selbst bei
hypothetischer Freischaltung weiterhin an `MISSING_VALID_TARIFF`
(**externer Blocker, unverändert**).

---

## 1. Migrations-Vollständigkeit

| Migration | Live? | Prüfmethode |
|---|---|---|
| `20260912000000_audit_entity_type_invoice_draft` | ✅ live | `invoice_draft` im Constraint |
| `20260913000000_secdef_trigger_revoke_nachtrag` | ✅ live (Datei vorhanden, Härtung defense-in-depth) | Repo-Abgleich |
| `20260914000000_audit_persistenz_v9` | ✅ live | Returntyp `jsonb`, `tariff_lookup` im Constraint, MISSING_SIGNATURE-Verhalten empirisch bestätigt |
| `20260914010000_security_search_path_und_profiles` | ✅ live | `profiles_select_engels`-Policy nicht mehr vorhanden; alle 4 Funktionen mit `search_path=public` |

`scripts/verify-phase2-3-4-stabilisierung.mjs`: **30 PASS / 0 FAIL / 1 SKIP
(schema_migrations für service_role strukturell unlesbar, bekannte Grenze) /
1 INFO**.

## 2. MISSING_SIGNATURE — Audit-Durabilität (Kernbefund von P3, jetzt geschlossen)

Echter, nicht zurückgerollter RPC-Aufruf (Fixture in leerer E2E-Test-Org,
danach Cleanup):

```
success=false error=MISSING_SIGNATURE
Audit-Eintrag ueberlebt die Transaktion: missing_signature|MISSING_SIGNATURE
```

Damit ist der am 14.08. abends dokumentierte Befund
([[kassenabrechnung-audit-durabilitaet-kaputt]]) **behoben**: der forensische
Nachweis eines abgewiesenen Rechnungsversuchs wegen fehlender Unterschrift
wird jetzt tatsächlich persistiert.

## 3. Idempotenz / Doppelabrechnung — Re-Test unter v9-Vertrag

Alter Testcode deklarierte die Rückgabevariable als
`public.create_invoice_draft_result` (Composite-Type aus v8) und erhielt
`malformed record literal`, weil v9 `jsonb` zurückgibt — Testcode-Fehler, kein
Produktfehler. Mit `jsonb`-Deklaration erneut getestet (Stamm-Org,
verifizierter Privat-Tarif `alltagsbegleitung`):

```
erster_success=true  erste_invoice_id=<uuid>
zweiter_success=true zweite_already_exists=true gleiche_id=true
```

✅ Idempotenz hält unverändert — zweiter Aufruf mit identischem
`idempotency_key` liefert dieselbe `invoice_id` statt einer Dublette.

**Zusätzlicher Fund (Korrektur einer alten Fehlmeldung):** Das alte Skript
meldete „KEIN UNIQUE-Constraint auf idempotency_key gefunden", weil es nur
`pg_constraint` (Tabellen-Constraints) abfragte. Tatsächlich existieren
**zwei** partielle UNIQUE-Indizes auf `invoices.idempotency_key`
(`idx_invoices_idempotency`, `idx_invoices_idempotency_key_unique`, beide
`WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL`) — die
Datenbankebene ist also zusätzlich zur Anwendungslogik (`SELECT ... existing_id`)
gegen Doppelabrechnung abgesichert. Kein offener Punkt.

## 4. Security-Härtung (profiles_select_engels + search_path)

- `profiles_select_engels`-Policy: **nicht mehr vorhanden** — PII-Leck
  (E-Mail, Telefon, Nachname, PLZ aller Engel-Profile für jeden
  authentifizierten Nutzer) geschlossen. `get_engel_cards()` bleibt als
  sicherer Ersatz.
- `search_path=public` gesetzt bei allen 4 genannten SECURITY-DEFINER-Funktionen:
  `check_aufgabe_eskalation`, `create_recurring_aufgabe`,
  `compute_signature_hash`, `prevent_locked_record_change`.
- Gesamtabdeckung: 0 SECURITY-DEFINER-Funktionen in `public` ohne
  `search_path` (`secdef_ohne_search_path` → PASS).
- `anon`-Zugriff auf `/rest/v1/profiles`: HTTP 401 (`permission denied for
  function current_org_id`) — weiterhin blockiert.

## 5. Restliche 10 Negativtests (unverändert vs. 14.08. abends)

Alle bereits am 14.08. abends bestätigten Schutzmechanismen erneut PASS,
keine neuen Abweichungen:

- Org-Fence (RPC-Mismatch + SELECT fremde Org): PASS
- Bundesland-Gate setzt `billing_status` UND wirkt auf Fakturierung: PASS
- Tarif blocked/unverified: nur `wegepauschale` verifiziert (External Blocker
  unverändert), Fail-Closed-Klausel im RPC-Body: PASS
- Budget: keine PG≥2-Lücke (H-2 weiterhin gehalten); harte DB-seitige
  Budgetsperre bleibt bewusst Business-Layer-Aufgabe (unverändert dokumentiert)
- Finalisierungsschutz (`service_type`-Änderung an gesperrtem Nachweis): PASS
- RPC als `anon`: HTTP 404 / kein EXECUTE-Grant: PASS
- Cross-Tenant IDOR (SELECT/UPDATE/DELETE auf fremde Org): 0 Treffer, PASS

---

## Ergebnis

**30/30 relevante Prüfpunkte PASS**, 2 vermeintliche FAILs als Testcode-Artefakte
des v8→v9-Vertragswechsels identifiziert und mit korrigierter Prüflogik
bestätigt. Keine neuen Regressionen durch v9 oder die Security-Härtung
gefunden. Production nach Lauf nachweislich sauber (keine Testdaten
zurückgeblieben).

- **A) Intern technisch ready:** JA für den geprüften Kernpfad (Gate, Audit-
  Persistenz, Tarif-Vokabular, App-Layer-Fehlerbehandlung, Budget-Konstanten,
  Unterschriftspflicht). Bekannte, nicht in diesem Auftrag liegende Lücken aus
  der Positiv-Ketten-Prüfung vom 14.08. abends (Budget-Deckelung im DB-Layer,
  `correctInvoice()`-Signaturprüfung) bleiben unverändert offen.
- **B) Extern freigeschaltet:** NEIN — wie beabsichtigt. Jeder Kassenweg
  bleibt am Gate geparkt, keine Kern-Pflegeleistung ist als Kassentarif
  verifiziert.

**Kein BfArM-/Vertriebs-Blocker durch diesen Reverify beeinflusst** —
reine technische Bestätigung der v9-Fixes.
