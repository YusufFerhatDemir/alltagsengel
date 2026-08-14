# Kassenabrechnung — Readiness-Matrix

**Stand:** 14.08.2026 · Grundlage: Code-Audit (Datei:Zeile-Belege) + Live-Check per PostgREST
(`service_role`, ausschließlich lesend) gegen die Produktions-Datenbank.

Für die technische Tiefe zu §105 SGB XI / §302 SGB V / KIM (Ablauf, Sperr-Reihenfolge,
Zugangsmittel, Betriebsmodus) siehe **[`KASSENABRECHNUNG_FREISCHALTUNG.md`](./KASSENABRECHNUNG_FREISCHALTUNG.md)** —
dieses Dokument dupliziert das nicht, sondern liefert die Gesamtmatrix und den aktuellen
Live-Status.

---

## Matrix

| Bereich | INTERN READY | EXTERN BENÖTIGT | BLOCKED | NICHT ERFORDERLICH |
|---|:---:|:---:|:---:|:---:|
| §45b Entlastungsleistungen (131 €/Monat) | ✅ | | | |
| Verhinderungspflege (§39 SGB XI) | ✅ | | | |
| Kurzzeitpflege (VP/KZP kombiniert 3.539 €) | ✅ | | | |
| DTA-Datenaustausch (§105 SGB XI) | ✅ Code vollständig | ✅ Zertifikat + SFTP-Zugang | | |
| §302 SGB V (häusliche Krankenpflege) | ✅ Gerüst, bewusst gesperrt | ✅ Technische Anlage 1 | | |
| ITSG-Zertifizierung | ✅ Upload/Validierung vorbereitet | ✅ Zertifizierung selbst | | |
| Rückläufer-Verarbeitung | ✅ Mechanik vollständig | ✅ echte Fehlercodes der Kassen | | |
| OPOS-Management | ✅ | | | |
| Mahnwesen | ✅ | | | |
| Kassen-/Tarifverträge (billing_tariffs) | ✅ live verifiziert | | | |

Kein Bereich ist aktuell `BLOCKED` (weder Code noch extern bereit, aktiv blockierend) oder
`NICHT ERFORDERLICH` — alle zehn geprüften Bereiche sind für den Go-Live-Scope relevant und
technisch mindestens vorbereitet.

---

## Details je Bereich

### 1. §45b Entlastungsleistungen (131 €/Monat) — INTERN READY
Quelle der Wahrheit: `lib/config/budget-constants.ts:41-49` — versioniertes `BUDGET_VERSIONEN`-Array,
ab 01.01.2025 `entlastungMonatlich: 131`, `entlastungJaehrlich: 1572`. 2024er Wert (125 €) bleibt
unverändert für rückwirkende Berechnungen erhalten (`gueltigBis: '2024-12-31'`). Fail-closed über
`budgetVersionFuerJahr()` — ein Jahr ohne Eintrag wirft, statt still den falschen Satz zu nehmen.
Verwendet in `lib/budget/auto-budget.ts` und im Rechtsgrundlage-Mapping von
`create_invoice_draft_atomic` (`entlastung → §45b SGB XI`).

### 2. Verhinderungspflege (§39 SGB XI) — INTERN READY
`budget_type='verhinderung'` durchgängig in `lib/admin/service-records.ts`,
`lib/billing/core/price-resolver.ts`, `lib/billing/core/invoice-engine.ts`. Referenzwert
`vpJaehrlich: 1685` (`budget-constants.ts:47`) — seit 01.07.2025 nur noch informativ, das operative
Limit ist das kombinierte Budget (Punkt 3).

### 3. Kurzzeitpflege / VP+KZP kombiniert (3.539 €) — INTERN READY
`budget-constants.ts:48`: `vpKzpKombiniert: 3539` (Vorjahr 3.386 €). §42a-Logik: seit 01.07.2025
ein flexibles Gemeinschaftsbudget, frei zwischen VP und KZP aufteilbar.

### 4. DTA-Datenaustausch §105 SGB XI — INTERN READY (Code) / EXTERN BENÖTIGT (Freischaltung)
EDIFACT-Generator/Validator/Parser, echtes SFTP (`lib/abrechnung/transport.ts`), SECON-Verschlüsselung
(`lib/abrechnung/secon.ts`), Retry + Dead-Letter (`lib/abrechnung/versand.ts`), Rückläufer-Import,
Wiedervorlage-Queue — alles gebaut und im Testmodus (`{"testmodus": true}`) heute durchspielbar.
Gesperrt einzig durch das Env-Gate `ITSG_ZERTIFIZIERT` (String muss exakt `'true'` sein).
Details/Ablauf: `KASSENABRECHNUNG_FREISCHALTUNG.md` Kanal 1.

**Live-Korrektur zu diesem Dokument:** Die dort als „wartet auf Live-Apply" markierte Migration
`20260903010000_kassenabrechnung_betrieb.sql` ist **inzwischen live** — heute per PostgREST
bestätigt (`abrechnung_betriebsmodus`, `abrechnung_betriebsmodus_historie`,
`abrechnung_credential_rotationen`, `dta_dead_letter` liefern alle HTTP 200, nicht mehr
PGRST205/404). Betriebsmodus, Rotationsprotokoll und Dead-Letter-Queue laufen also nicht mehr
ins Leere. Der Migrationsstatus in `KASSENABRECHNUNG_FREISCHALTUNG.md` §„Migrationen" sollte bei
nächster Bearbeitung dieses Dokuments von „wartet auf Live-Apply" auf „live" korrigiert werden.

### 5. §302 SGB V — INTERN READY als bewusst gesperrtes Gerüst / EXTERN BENÖTIGT für Wirkbetrieb
`lib/abrechnung/sgb-v/generator.ts`: `erzeugeSgbVDatei()` wirft absichtlich immer
`SgbVSpecFehltError`, `exportImplementiert()` liefert hart `false` — weil die Technische Anlage 1
(Segmentstrukturen) nicht aus dem Gedächtnis rekonstruiert werden darf. Routing, Positionsaufbereitung,
Versionsauflösung, Statusmodell, Lauf-Anlage sind fertig; `POST /api/billing/sgb-v/versand` legt
heute schon einen echten, prüfbaren Lauf an und endet planmäßig bei `gesperrt_extern`.

### 6. ITSG-Zertifizierung — EXTERN BENÖTIGT (mit interner Vorbereitung)
Kann kein Code herstellen — echter, kostenpflichtiger Vorgang beim ITSG Trust Center. Intern
vorbereitet: `app/api/admin/abrechnung/itsg/route.ts` (lädt Empfänger-Zertifikate aus dem
öffentlichen ITSG-Verzeichnis), `app/api/admin/abrechnung/zertifikat/route.ts` (validiert
PKCS#12-Uploads). Ablageorte für Zertifikat/Passwort/SSH-Key: siehe Freischaltungs-Dokument,
Abschnitt „Zugangsmittel".

### 7. Rückläufer-Verarbeitung — INTERN READY (Mechanik) / Fehlercode-Katalog leer (Absicht)
Tabellen/Logik vorhanden (`lib/abrechnung/ruecklaeufer.ts`, `ruecklaeufer-fehlercodes.ts`,
`wiedervorlage.ts`). `dta_fehlercode_katalog` ist heute live leer bestätigt (0 Zeilen per
PostgREST) — **bewusst**: geratene Kassen-Fehlercodes würden eine echte Ablehnung still falsch
einsortieren. Ohne Katalogtreffer greift eine Heuristik, die im Zweifel `unbekannt` liefert und
im Arbeitsvorrat sichtbar bleibt. Befüllung braucht reale Rückläufer von Kostenträgern.

### 8. OPOS-Management — INTERN READY
`createPayment` (`lib/billing/core/payments.ts`), `autoMatchPayment` (Scoring-System),
`allocatePayment` (Überzahlungsschutz + Org-Fence + optimistische Sperre). `autoMatch`-Default ist
`true`; API-Aufrufer, die selbst zuordnen, müssen explizit `autoMatch:false` setzen (historischer
Bug bereits behoben, siehe `zahlung-automatch-doppelzuordnung` in den Projektnotizen). `due_date`
ist seit der entsprechenden Migration nicht mehr NULL.

**Bekannte offene Frage (kein Blocker):** Eine zweite, unabhängige Matching-Engine existiert
für CAMT-Kontoauszug-Import (`lib/billing/matching/matching-engine.ts`) neben dem manuellen
Zahlungsweg. Architektonisch getrennt, aber zwei parallele Implementierungen sind eine offene
Konsolidierungsfrage — nicht go-live-relevant.

### 9. Mahnwesen — INTERN READY
`lib/billing/core/dunning.ts`: 7 Stufen
(`offen → erinnerung → mahnung_1 → mahnung_2 → letzte_mahnung → inkasso_vorbereitung → bezahlt`),
Fristen 14/28/42/56/70 Tage, Gebühren 2,50 €/5 €/7,50 €/10 €. Blocker-Logik für Storno/strittige
Posten/offene Beanstandungen, Batch-Mahnlauf mit Dry-Run. 21 Testfälle in
`__tests__/billing/mahnlauf.test.ts`.

### 10. Kassen-/Tarifverträge (billing_tariffs) — INTERN READY, live verifiziert
Live per PostgREST bestätigt (heute, service_role, nur lesend):

| Tabelle | Zeilen | Status-Verteilung |
|---|---|---|
| `billing_tariffs` | 23 | 11 verified · 8 blocked · 4 unverified |
| `leistungspreise` | 24 | 24 unverified |
| `service_pricing` | — | dritte, unabhängige Legacy-Tabelle, kein `tarif_status` |

Fail-Closed-Regel (nur `verified` zählt für Kassentarife) einheitlich in
`lib/billing/core/tarif-verifizierung.ts`, `create_invoice_draft_atomic`
(`supabase/migrations/20260908000000_leistungsart_tarif_mapping.sql`) und DB-Trigger durchgesetzt.

**Bekanntes Risiko (Dauerhinweis, kein aktueller Fehler):** Drei Definitionen von
`zaehle_kassentarife` existieren im Migrationsverlauf (`20260808120000`, `20260808130000` — beide
ohne `tarif_status`-Filter — und `20260831050000` mit `AND tarif_status='verified'`). Die
zeitlich letzte gewinnt und ist heute aktiv. Risiko besteht nur, falls künftig eine neue
Migration diese RPC erneut ohne Filter definiert und damit die Fail-Closed-Sperre still wieder
öffnet.

### `create_invoice_draft_atomic` — Rechtsgrundlage-Zuordnung
Aktuellste Fassung: `supabase/migrations/20260908000000_leistungsart_tarif_mapping.sql` (v7).
Mapping: `entlastung → §45b SGB XI`, `verhinderung → §39 SGB XI`, `carryover → §45b SGB XI`,
`haeusliche_pflege_36 → §36 SGB XI`, `private → privat`. Unbekannter `budget_type` wirft
`RAISE EXCEPTION` statt still `NULL` zu setzen — fail-closed.

---

## Nicht Teil der ursprünglichen 10 Punkte, aber im selben Themenfeld

**KIM / Telematikinfrastruktur** ist wie §302 bewusst fail-closed (`lib/kim/versand.ts` wirft
immer `KimSpecFehltError` bis TA5 vorliegt) und wird im Freischaltungs-Dokument als dritter Kanal
mitgeführt. Für den aktuellen Go-Live-Scope (Kassenabrechnung SGB XI/SGB V) nicht blockierend.

---

## Zusammenfassung

Kein Bereich ist heute `BLOCKED`. Alle zehn geprüften Bereiche sind entweder vollständig
`INTERN READY` (§45b, VP, VP/KZP-Budget, OPOS, Mahnwesen, Tarifverträge) oder vollständig
code-fertig und einzig durch echte externe Vorgänge gesperrt (Zertifizierung, TA1-Spezifikation,
reale Kassen-Fehlercodes) — genau die drei Dinge, die kein Code herstellen kann. Keine Zahl, kein
Preis und kein Fehlercode in diesem Dokument ist erfunden; wo eine Angabe fehlt, ist sie zu
beschaffen, nicht zu ergänzen.
