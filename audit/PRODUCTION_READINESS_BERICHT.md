# Production-Readiness-Bericht: Tarif-basierte Rechnungserstellung

**Datum:** 2026-08-07
**Branch:** `main` (Commit `9af5982`)
**Status:** CI grün (Typecheck, Lint, Tests, Build)
**Production-DB:** NICHT verändert, keine Migration angewendet

---

## 1. Benötigte billing_tariffs Stammdaten

### Ist-Zustand
`billing_tariffs` auf Production ist **leer**. Jeder Aufruf von `create_invoice_draft_atomic()` wird mit `MISSING_VALID_TARIFF` fehlschlagen, bis echte Tarife eingetragen sind.

### Benötigte Tarife für den Produktivbetrieb

Für jede Leistungsart, die Alltagsengel aktuell erbringt und abrechnet, wird mindestens ein Tarif benötigt. Basierend auf der Code-Analyse (service_records, UI-Formulare, Tests) sind folgende Leistungsarten im System bekannt:

**Kernleistungen (§45b SGB XI — Entlastungsleistungen):**
- `alltagsbegleitung` (Vergütung: zeit_stunde)
- `demenzbetreuung` (Vergütung: pauschale oder zeit_stunde)
- `haushaltshilfe` / `hauswirtschaft` (Vergütung: zeit_minute oder zeit_stunde)
- `wegepauschale` (Vergütung: wegepauschale)

**Weitere Rechtsgrundlagen (sofern Alltagsengel diese bedient):**
- `§39 SGB XI` (Verhinderungspflege)
- `§36 SGB XI` (Häusliche Pflegehilfe)
- `privat` (Privatzahler)

### Was Yusuf liefern muss

Für jeden Tarif werden folgende Angaben benötigt:

| Feld | Pflicht | Beschreibung |
|------|---------|-------------|
| leistungsart | JA | Exakter Name (z.B. "alltagsbegleitung") — muss mit service_records.service_type übereinstimmen |
| rechtsgrundlage | JA | Exakt "§45b SGB XI", "§39 SGB XI", "§36 SGB XI" oder "privat" — Tippfehler = keine Zuordnung |
| preis_cent | JA | Preis in Cent (ganzzahlig, z.B. 3500 = 35,00€) |
| verguetungsart | JA | Einer von: `zeit_stunde`, `zeit_minute`, `leistungskomplex`, `pauschale`, `wegepauschale`, `zuschlag` |
| einheit | empfohlen | Anzeigetext (z.B. "Stunde", "Minute", "Einsatz", "Fahrt") |
| gueltig_ab | JA | Ab welchem Datum gilt dieser Tarif |
| gueltig_bis | optional | Bis wann (NULL = unbegrenzt) |
| kostentraeger_ik | optional | IK der Pflegekasse für kassenspezifische Tarife |
| bundesland | optional | Für bundeslandspezifische Tarife (aktuell nur "hessen" funktionsfähig — siehe Punkt 4) |

### Wichtige Regeln

1. **leistungsart und rechtsgrundlage sind Freitext** — es gibt keine Enum-Validierung. Tippfehler führen stillschweigend zu `MISSING_VALID_TARIFF`. Empfehlung: Vor dem Import eine feste Werteliste definieren.
2. **Überlappungsschutz** besteht: Der Exclusion Constraint `no_overlapping_tariffs` verhindert, dass zwei aktive Tarife mit gleicher Org+Leistungsart+Rechtsgrundlage+Kostenträger sich zeitlich überschneiden.
3. **Preise sind NIEMALS Dummy-Werte** — nur echte, vertraglich vereinbarte Tarife eintragen.

---

## 2. pflegekasse_ik Validierung

### Ist-Zustand

| Komponente | IK-Validierung | Status |
|------------|---------------|--------|
| `organizations.ik_nummer` | Luhn/Prüfziffer (§293 SGB V) | ✅ Validiert (Onboarding + Admin) |
| `clients.pflegekasse_ik` | Keine | ❌ **FEHLT** — beliebiger Text akzeptiert |
| `billing_tariffs.kostentraeger_ik` | Keine | ❌ **FEHLT** — beliebiger Text akzeptiert |

### Verhalten bei fehlender/ungültiger IK

- **Client ohne IK (NULL):** Funktioniert — RPC wählt generische Tarife (ohne kostentraeger_ik-Einschränkung). Getestet in E2E-8.
- **Client mit ungültiger IK:** RPC vergleicht den IK-String literal mit `billing_tariffs.kostentraeger_ik`. Ein Tippfehler führt dazu, dass kassenspezifische Tarife nicht greifen und der generische Tarif verwendet wird — **kein Fehler, aber falscher Preis**.
- **Vorhandener Validator:** `lib/organizations/ik.ts` → `validateIkNummer()` — implementiert korrekte Luhn-Prüfziffer nach §293 SGB V. Wird aktuell NUR für die Organisations-IK verwendet.

### Empfehlung (Blocker: NEIN, aber dringend empfohlen)

IK-Validierung auf `clients.pflegekasse_ik` und `billing_tariffs.kostentraeger_ik` ausweiten — entweder als DB-CHECK-Constraint (9 Ziffern + Prüfziffer) oder als Application-Level-Validierung im Admin-UI.

---

## 3. Zuschlagslogik

### Ist-Zustand

| Aspekt | Status |
|--------|--------|
| DB-Spalten für Zuschläge | ✅ Vorhanden (zuschlag_wochenende_prozent, zuschlag_feiertag_prozent, zuschlag_nacht_prozent, nacht_von, nacht_bis) |
| RPC liest Zuschlag-Spalten | ✅ Ja (SELECT INTO v_tariff) |
| RPC wendet Zuschläge an | ❌ **NEIN** — expliziter `TODO`-Kommentar in der Migration |
| TypeScript-Implementierung | ✅ Vorhanden in `lib/billing/core/price-resolver.ts` (calculateLineTotal, isNachtzeit) — aber ungenutzt |

### Konkrete Lücke

Die RPC-Funktion liest die Zuschlag-Werte aus dem Tarif, ignoriert sie aber bei der Preisberechnung. Zeile 398 der Migration:
```sql
-- TODO: Zuschlagsberechnung (Wochenende/Feiertag/Nacht) hier erweitern
```

**Auswirkung:** Rechnungen für Wochenend-/Feiertag-/Nachtdienste werden systematisch zu niedrig berechnet, wenn Zuschläge vereinbart sind.

### Hardcodierte Werte im Code

Keine hardcodierten Zuschlagsprozentsätze gefunden. Die Zuschlagswerte kommen ausschließlich aus `billing_tariffs`-Spalten. Die TypeScript-Implementierung in `price-resolver.ts` verwendet ebenfalls nur Werte aus dem Tarif-Objekt.

### Empfehlung

**Fachliche Entscheidung erforderlich:** Werden aktuell Zuschläge berechnet? Falls ja → Blocker. Falls Alltagsengel aktuell keine Wochenend-/Feiertag-/Nachtdienste mit Zuschlag abrechnet → kein Blocker, aber die Spalten sollten auf 0 gesetzt bleiben.

---

## 4. Bundesland-Hardcoding — KRITISCH

### Gefundene Hardcodings

**RPC-Funktion (3 Stellen):**

In `supabase/migrations/20260807110000_tariff_based_invoice_creation.sql`:

```sql
-- Zeile 249, 280, 344 (jeweils identisch):
CASE
  WHEN bt.bundesland IS NOT NULL AND LOWER(bt.bundesland) = 'hessen' THEN 5
  WHEN bt.bundesland IS NOT NULL THEN -100
  ELSE 0
END
```

Das Bundesland `'hessen'` ist ein **String-Literal**, nicht dynamisch aus `organizations.bundesland` oder `clients.bundesland` abgeleitet.

### Auswirkung

- Tarife mit `bundesland = 'hessen'` erhalten +5 Spezifitäts-Punkte
- Tarife mit jedem anderen Bundesland erhalten -100 Punkte → werden ausgeschlossen
- Eine Organisation in Bayern, die einen Tarif mit `bundesland = 'bayern'` anlegt, wird diesen Tarif NIE zugeordnet bekommen

### Vorhandene Infrastruktur

- `organizations.bundesland` existiert als TEXT-Spalte (befüllt mit 'Hessen' für die Alltagsengel-Org)
- `clients` hat KEINE `bundesland`-Spalte

### Empfehlung

**Blocker für Multi-Mandanten-Betrieb: JA.**
**Blocker für Alltagsengel allein (nur Hessen): NEIN** — solange nur Hessen bedient wird, funktioniert die Logik korrekt, weil alle Tarife `bundesland = 'hessen'` haben werden.

Für den Multi-Mandanten-Betrieb muss die RPC-Funktion geändert werden:
1. `organizations.bundesland` als Variable laden (analog zu `v_client_ik`)
2. Die drei `'hessen'`-Literale durch die Variable ersetzen

---

## 5. Serverseitige Preisberechnung — Manipulationsschutz

### Rechnungserstellung (Hauptpfad): SICHER ✅

| Prüfpunkt | Status |
|-----------|--------|
| RPC akzeptiert Preisparameter | NEIN — nur client_id, org_id, period_month, budget_type, actor_id |
| API-Route akzeptiert Preise | NEIN — nur clientId, periodMonth, budgetType |
| org_id kommt serverseitig | JA — aus profile.organization_id |
| service_records.amount wird als Preis verwendet | NEIN — nur für Abweichungs-Dokumentation |
| Preisquelle ist immer billing_tariffs | JA — hardcoded `'billing_tariffs'` |

### Korrektur-/Gutschrift-Pfad: EINGESCHRÄNKT ⚠️

| Endpunkt | Akzeptiert Client-Preise | Auth-Gate |
|----------|------------------------|-----------|
| POST /api/billing/invoices/[id]/correct | JA (einzelpreisCent, gesamtpreisCent) | admin/superadmin |
| POST /api/billing/invoices/[id]/credit | JA (amountCents) | admin/superadmin |
| POST /api/billing/tariffs | JA (gesamter Body) | admin/superadmin |

**Risiko:** Gering (nur Admin-Zugriff), aber bei kompromittiertem Admin-Account könnten beliebige Korrektur-/Gutschriftbeträge erstellt werden, ohne Tarif-Gegenprüfung.

**Empfehlung:** Kein Blocker für Go-Live, aber mittelfristig Plausibilitätsprüfungen einbauen.

---

## 6. Production-Seed-/Import-Plan für billing_tariffs

### Voraussetzungen

1. **Echte Tarifvereinbarungen** müssen vorliegen (Verträge mit Pflegekassen)
2. **Leistungsarten-Katalog** muss fixiert werden (exakte Schreibweisen)
3. **Gültigkeitszeiträume** müssen bekannt sein

### Import-Struktur (Vorlage)

Für jeden Tarif ein Eintrag mit folgenden Pflichtfeldern:

```
organization_id:       <Alltagsengel-Org-UUID>
leistungsart:          <exakt wie in service_records.service_type>
rechtsgrundlage:       <exakt: "§45b SGB XI" | "§39 SGB XI" | "§36 SGB XI" | "privat">
verguetungsart:        <"zeit_stunde" | "zeit_minute" | "pauschale" | "wegepauschale">
preis_cent:            <ganzzahlig, z.B. 3500 für 35,00€>
einheit:               <"Stunde" | "Minute" | "Einsatz" | "Fahrt">
gueltig_ab:            <YYYY-MM-DD>
gueltig_bis:           <YYYY-MM-DD oder NULL>
bundesland:            "hessen"
kostentraeger_ik:      <9-stellige IK oder NULL für generischen Tarif>
zuschlag_*:            <0 wenn nicht verwendet>
```

### Import-Methode

Drei Optionen:

1. **Admin-UI** (`/admin/tariffs`): Einzeln über Formular — geeignet für wenige Tarife
2. **API** (POST `/api/billing/tariffs`): Programmatisch — geeignet für Batch-Import
3. **SQL-Migration**: Kontrollierter INSERT via Migrations-Datei — empfohlen für den initialen Seed, da versioniert und reproduzierbar

### Versionierung

- Tarifänderungen NICHT durch UPDATE, sondern durch neuen Tarif mit `gueltig_ab` = Änderungsdatum und altem Tarif mit `gueltig_bis` = Tag davor
- Overlap-Constraint verhindert Fehler automatisch
- Alte Rechnungen bleiben unverändert (invoice_items speichern den zum Erstellungszeitpunkt gültigen Tarif)

### Empfohlener Ablauf

1. Yusuf liefert Tarif-Tabelle (Excel/CSV) mit echten Werten
2. Agent erstellt daraus eine SQL-Migration (INSERT-Statements)
3. Migration wird auf einem neuen Staging-Branch getestet
4. Nach Freigabe: Migration auf Production anwenden

---

## 7. Production-Readiness: GO/NO-GO

### Gesamtbewertung: BEDINGTES GO

Die Tarif-basierte Rechnungserstellung ist **technisch funktionsfähig und getestet** (10/10 E2E, Staging-Abnahme bestanden). Für den produktiven Einsatz bei Alltagsengel (nur Hessen) bestehen keine technischen Blocker, sofern die fachlichen Voraussetzungen erfüllt werden.

### Blocker (müssen VOR Production-Migration erledigt werden)

| Nr | Blocker | Verantwortlich | Aufwand |
|----|---------|----------------|---------|
| B1 | **Echte billing_tariffs Stammdaten** — ohne Tarife = jede Rechnung scheitert | Yusuf (Tarif-Tabelle liefern) + Agent (Migration erstellen) | Gering |
| B2 | **Leistungsarten-Katalog fixieren** — exakte Schreibweisen für leistungsart und rechtsgrundlage festlegen | Yusuf | Gering |

### Fachliche Entscheidungen (müssen VOR Production-Migration geklärt werden)

| Nr | Entscheidung | Frage |
|----|-------------|-------|
| F1 | **Zuschläge** | Werden aktuell Wochenend-/Feiertag-/Nachtdienste mit Aufschlag abgerechnet? Falls ja: Blocker — RPC-Erweiterung nötig. Falls nein: kein Blocker, Zuschlag-Spalten auf 0 setzen. |
| F2 | **Kassenspezifische Tarife** | Gibt es unterschiedliche Preise je nach Pflegekasse (IK)? Falls ja: IK-spezifische Tarife anlegen. Falls nein: nur generische Tarife nötig. |

### Bekannte Einschränkungen (KEIN Blocker für Alltagsengel allein)

| Nr | Einschränkung | Auswirkung | Wann beheben |
|----|--------------|------------|-------------|
| E1 | Bundesland hardcoded "hessen" | Nur Hessen-Tarife funktionieren | Vor Multi-Mandanten-Betrieb |
| E2 | Keine IK-Validierung auf clients/tariffs | Tippfehler → falscher Tarif (kein Fehler) | Dringend empfohlen, aber kein Blocker |
| E3 | Korrektur-/Gutschrift-Endpoints ohne Tarif-Gegenprüfung | Admin kann beliebige Beträge setzen | Mittelfristig |
| E4 | Zuschlagsberechnung nicht implementiert | Zuschläge werden ignoriert | Wenn Zuschläge vereinbart werden |
| E5 | leistungsart/rechtsgrundlage sind Freitext | Tippfehler → MISSING_VALID_TARIFF | Enum-Migration empfohlen |

### Exakte Schritte vor Production-Migration

1. ☐ Yusuf: Tarif-Tabelle mit echten Preisen, Leistungsarten, Gültigkeitszeiträumen liefern
2. ☐ Yusuf: Fachliche Entscheidung zu Zuschlägen (F1) und kassenspezifischen Tarifen (F2)
3. ☐ Yusuf: Leistungsarten-Katalog bestätigen (exakte Schreibweisen)
4. ☐ Agent: SQL-Migration aus Tarif-Tabelle erstellen
5. ☐ Agent: Staging-Branch erstellen, Migration + Tarif-Import testen
6. ☐ Agent: E2E-Test mit echten Tarifen auf Staging
7. ☐ Yusuf: Staging-Ergebnisse prüfen und freigeben
8. ☐ Agent: Production-Migration anwenden (nur mit expliziter Freigabe)
9. ☐ Agent: Production-Smoke-Test (RPC-Aufruf ohne Rechnungserstellung)
10. ☐ Yusuf: PRODUKTIONS-GO erteilen

---

*Erstellt durch vollständige Code-Analyse des Billing-Systems, 2026-08-07*
*Keine Production-Daten verändert, keine Migration angewendet, keine Dummy-Tarife erstellt.*
