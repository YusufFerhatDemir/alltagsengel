# Stream 1 — Echtbetrieb / Pilot Ready

**Datum:** 14.08.2026
**Umfang:** `/admin/pilot`, `lib/pilot/**`, vollständiger E2E-Durchlauf der 13-Schritte-Kundenkette
**Daten:** ausschliesslich synthetisch. Keine echten Kundendaten erzeugt, verändert oder gelesen-und-kopiert.

---

## 1. Ergebnis in einem Satz

Die Kundenkette läuft **synthetisch vollständig durch (13/13)**. Auf dem Weg dorthin wurden
**drei Defekte** gefunden, die im echten Betrieb je einen Kettenschritt unbemerkt blockiert
hätten. Zwei sind im Code behoben, einer braucht eine Migration auf Produktion.

---

## 2. Was geprüft wurde

`scripts/pilot-e2e-durchlauf.ts` legt einen synthetischen Mandanten an, schickt einen
synthetischen Kunden durch alle 13 Schritte und wertet **nach jedem Schritt** mit der
produktiven Logik (`lib/pilot/kundenkette.ts`) aus, ob der Stand korrekt umspringt.

```
npx tsx scripts/pilot-e2e-durchlauf.ts                 # Durchlauf inkl. Aufräumen
npx tsx scripts/pilot-e2e-durchlauf.ts --stand         # Was /admin/pilot live anzeigt
npx tsx scripts/pilot-e2e-durchlauf.ts --nur-aufraeumen
```

Letzter Lauf:

```
● ● ● ● ● ● ● ● ● ● ● ● ●   13/13   13 In DATEV übergeben   → Kette vollständig
```

**Warum gegen die echte Datenbank:** die vorhandene Unit-Suite arbeitet mit einem Stub, der
den `select`-String ignoriert hat. Genau dort lag Defekt 1 — der Stub lieferte eine Spalte
mit, die es live nicht gibt. Ein Test, der die Datenbank nur nachspielt, kann Schema-Drift
grundsätzlich nicht sehen.

---

## 3. Befunde

### B1 — Budget-Schritt war dauerhaft blind (behoben)

`lib/pilot/kundenkette.ts` las `client_budgets.budget_type`. Diese Spalte existiert auf
Produktion **nicht**: die Migration `20260831020000_d2_vp_budget.sql`, die sie einführen
würde, ist nicht angewendet.

PostgREST beantwortet die Abfrage mit `42703`. Der Fehler wurde nicht geprüft, die Abfrage
lieferte damit „keine Zeilen" — und die Seite meldete für **jeden** Kunden beruhigend
*„kein Budget für das laufende Jahr"*, obwohl live vier Budgets existieren.

**Fix:** Select auf die Spalten umgestellt, die den Anspruch wirklich tragen
(`annual_amount` = § 45b, `combined_annual_amount` = § 42a). Schritt 3 steht seitdem für
alle vier Kunden korrekt auf erledigt.

### B2 — Ein defekter Select sah aus wie ein Kunde ohne Daten (behoben)

Die Ursache, warum B1 unentdeckt blieb: `ladeRohdaten()` prüfte bei **keiner** der zehn
Abfragen `error`. Jeder Datenbankfehler wurde zu einer leeren Liste geglättet.

**Fix:** jede Abfrage wird ausgewertet. Eine nicht lesbare Tabelle setzt die betroffenen
Schritte auf `blockiert` mit der echten Fehlermeldung, und `KundenKette.datenfehler`
trägt sie nach oben. `/admin/pilot` und die Detailseite zeigen dafür jetzt einen roten
Banner mit dem Hinweis, dass „blockiert" hier *technischer Defekt* heisst und nicht
*„noch nichts passiert"*.

Das ist die eigentliche Härtung: eine Diagnoseseite, die ihren eigenen Defekt verdeckt,
ist schlimmer als gar keine.

### B3 — Jeder Zahlungseingang scheitert (Migration liegt bereit, **noch nicht live**)

```
INSERT INTO public.payments (…) → 42703
„record 'new' has no field 'invoice_id'"
```

`public.wf_trigger_zahlung()` aus `20260813010000_workflow_engine.sql` liest
`NEW.invoice_id`. `public.payments` hat diese Spalte nicht und soll sie nicht haben — die
Verknüpfung Zahlung→Rechnung liegt in `payment_allocations` (n:m, wegen Teil- und
Sammelzahlungen).

Der `AFTER INSERT`-Trigger rollt damit **jeden** Zahlungseingang zurück. Betroffen sind
Schritt 11 (Zahlungseingang), Schritt 12 (OPOS-Ausgleich), das Mahnwesen und in der Folge
der DATEV-Weg. Passt zum Live-Bild: 5 offene Rechnungen, aber 0 Zeilen in `payments` und
`payment_allocations`.

**Fix liegt bereit:** `supabase/migrations/20260905000000_fix_wf_trigger_zahlung.sql`
(idempotent, mit Rollback). Das Event trägt danach nur Felder, die es auf `payments`
wirklich gibt.

> **Offen: muss auf Produktion angewendet werden.** DDL ist über den vorhandenen Zugang
> nicht ausführbar (`service_role` hat kein CREATE auf `public`, die SQL-RPC liefert kein
> DDL). Bis dahin bleibt Schritt 11 im Echtbetrieb blockiert.

Die anderen drei Emitter-Trigger (`dta_ruecklaeufer`, `dta_fehler`, `dienstplan`) wurden
gegen ihre Quelltabellen geprüft — sie sind in Ordnung.

---

## 4. Nebenbefunde ohne Codeänderung

| Befund | Bewertung |
|---|---|
| `service_records.duration_minutes` ist live eine **GENERATED**-Spalte. Ein mitgeschickter Wert lässt den INSERT mit `428C9` scheitern. | Im Durchlauf bestätigt: ohne Wert wird 09:00–11:00 korrekt zu 120 Minuten berechnet. `app/api/leistungsnachweis/crud/route.ts` sendet den Wert mit — dort ist zu prüfen, ob der Pfad live überhaupt trägt. **Nicht Teil dieses Streams, aber gemeldet.** |
| Schritt 4 („Betreuungskraft zugeordnet") kann nie vor Schritt 5 erledigt sein, weil er die Zuordnung über einen Einsatz misst. | So gewollt laut Kriterium — kein Defekt. |
| Testmandanten sind nach einer Rechnung **nicht mehr löschbar**: `billing_audit_trail` ist unveränderlich und zeigt per Fremdschlüssel auf `organizations`. | Bekannte Grenze, schon in `scripts/bereinige-testdaten.ts` dokumentiert. Der Audit-Trigger wird **nicht** abgeschaltet. Das Skript nutzt deshalb *eine feste* Test-Organisation statt einer pro Lauf und kennzeichnet Altlasten als Testmandant. |

---

## 5. Datenlage auf Produktion

**Zu Beginn der Session vorgefunden:**

- 3 Organisationen: `Alltagsengel UG` (Stamm) + 2 Testmandanten `E2E_TEST_DEL_ORG_A` / `_B`
- 4 aktive Kunden, alle in der Stamm-Organisation, alle ohne Pflegegrad
- Demo-Bewertung „Lisa war wunderbar!" in `reviews` (Seed-UUIDs `3333…` / `4444…`)

**Am Ende der Session:** `E2E_TEST_DEL_ORG_B` und die Demo-Bewertung sind **weg**;
`E2E_TEST_DEL_ORG_A` steht noch.

Das ist exakt die Signatur von `scripts/bereinige-testdaten.ts --apply`: es löscht
Seed-UUID-Bewertungen und Organisationen mit „TEST" im Namen, und lässt `ORG_A` stehen,
weil deren `wf_audit_log`-Zeilen das Löschen blockieren. **Dieser Lauf ging nicht von
diesem Stream aus** — hier wurde nur nach `E2E_PILOT*` / fester Test-ID gelöscht, was
keinen dieser Namen trifft. Vermutlich eine parallele Session.

**Synthetische Daten dieses Streams:** restlos entfernt. Es bleibt eine leere
Organisationshülle `E2E_TEST_PILOT` (feste ID `…e2e1`), die der unveränderliche
Audit-Trail festhält — ohne Kunden, Nachweise, Rechnungen oder Zahlungen. Der Name
enthält „TEST", damit die bestehende Datenhygiene und das Go-Live-Dashboard sie als
Testmandant zählen.

---

## 6. Was `/admin/pilot` jetzt anzeigt (Stamm-Organisation, live)

```
7/13  Ingrid Bauer        → 2. Pflegegrad erfasst
5/13  Erika Testfall      → 1. Kunde angelegt   (fehlt: Geburtsdatum)
5/13  Gerlinde Hoffmann   → 2. Pflegegrad erfasst
4/13  Werner Krause       → 2. Pflegegrad erfasst

Betriebs-Checkliste: 8 grün, 2 gelb, 3 rot — Echtbetrieb gesperrt
  rot  [PFLICHT] Betreuungskräfte mit Einsatzfreigabe: 0 freigegeben
  rot  [PFLICHT] DATEV-Konfiguration: fehlt Berater-/Mandantennummer
  rot            SEPA-Gläubiger-ID: Platzhalter
  gelb           12 aktive Tarife ohne Verifizierung
  gelb           Kassenabrechnung: 0 von 16 Bundesländern
```

Stand je Kunde und nächster Schritt werden korrekt benannt, absteigend nach Fortschritt
sortiert. Die drei roten Punkte sind echte offene Voraussetzungen, keine Anzeigefehler.

---

## 7. Prävention

- **Der Test-Stub prüft jetzt Spalten.** `__tests__/billing/pilot-kundenkette.test.ts`
  kennt je Tabelle die live vorhandenen Spalten und antwortet auf alles andere mit
  demselben `42703` wie die Datenbank. Ein Select auf eine nicht existierende Spalte
  lässt den Test fallen, statt ihn grün zu lügen.
- **Zwei neue Fälle:** Budget-Select passt zum Live-Schema; eine nicht lesbare Tabelle
  wird als Defekt gemeldet und die Kette darf sich nie als vollständig ausgeben.
- **`__tests__/workflow/trigger-spalten.test.ts`** gleicht die Emitter-Trigger statisch
  gegen die Spalten ihrer Quelltabelle ab — der Trigger-Defekt kann nicht zurückkehren.

**Prüflauf:** `tsc --noEmit` fehlerfrei · `vitest run` 2603 Tests grün (118 Dateien).

---

## 8. Offene Punkte

| Punkt | Wer | Wirkung, solange offen |
|---|---|---|
| `20260905000000_fix_wf_trigger_zahlung.sql` auf Produktion anwenden | manuell (SQL-Editor) | Kein Zahlungseingang buchbar; OPOS und Mahnwesen stehen still |
| `20260831020000_d2_vp_budget.sql` — noch nicht live | Entscheidung | `lib/budget/auto-budget.ts`, `lib/personal/einsatzfreigabe.ts` und `app/api/admin/clients/[id]/pflegegrad/route.ts` schreiben/lesen weiterhin `budget_type` und laufen dort ins Leere. Der Pilot ist davon **nicht mehr** betroffen. |
| `duration_minutes` im Leistungsnachweis-API | Folge-Stream | Anlage über die API sendet eine GENERATED-Spalte mit |
