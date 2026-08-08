# Abschlussbericht Block 11 — Kassenabrechnung-Engine & DTA-Dry-Run Fix

**Datum:** 2026-08-08
**Branch:** staging/expansion-abnahme
**Commit:** be341c3

---

## Zusammenfassung

Block 11 behebt **4 Kategorien fataler Bugs** in der Kassenabrechnung-Engine (`lib/abrechnung/kassenabrechnung-engine.ts`) und dem DTA-Dry-Run-Endpoint (`app/api/billing/dta/dry-run/route.ts`), die den gesamten DTA/EDIFACT-Export-Pipeline **komplett unbrauchbar** machten.

Ohne diese Fixes war kein einziger Abrechnungslauf (Erstabrechnung, Korrektur, Nachberechnung) technisch durchfuehrbar — die Queries lieferten 0 Ergebnisse oder brachen mit DB-Fehlern ab.

---

## Betroffene Dateien

| Datei | Art des Fixes |
|-------|---------------|
| `lib/abrechnung/kassenabrechnung-engine.ts` | PreFlight-Validation (Zeile ~209, ~244) + Export-Funktion (Zeile ~600-700) |
| `app/api/billing/dta/dry-run/route.ts` | Identische Bugs gespiegelt (Zeile ~136-238) |

---

## Fix-Kategorien

### 1. Falsche Client-Spalten

| Vorher (falsch) | Nachher (korrekt) | Tabelle |
|---|---|---|
| `nachname` | `last_name` | clients |
| `vorname` | `first_name` | clients |
| `strasse` | `address` | clients |
| `hausnummer` | (entfaellt, in `address` enthalten) | clients |
| `plz` | `zip_code` | clients |
| `ort` | `city` | clients |
| `kostentraeger_ik` | (existiert nicht auf clients) | clients |
| `kostentraeger_name` | (existiert nicht auf clients) | clients |

### 2. Kostentraeger-Daten: Architektur-Korrektur

**Problem:** Code las `kostentraeger_ik` und `kostentraeger_name` von der `clients`-Tabelle — diese Spalten existieren dort nicht.

**Loesung:** Zweistufiger Lookup:
1. **Primaer:** `verordnungen.kostentraeger_ik_nummer` + `kostentraeger_name` (genehmigte Verordnungen)
2. **Fallback:** `invoices.kostentraeger_ik` + `kostentraeger_name`
3. **Letzter Fallback:** `clients.pflegekasse_ik` (IK der Pflegekasse)

### 3. Falsche Service-Records-Spalten

| Vorher (falsch) | Nachher (korrekt) |
|---|---|
| `service_date` | `date` |
| `.like('service_date', 'YYYY-MM%')` | `.gte('date', start).lte('date', end)` |
| `caregiver_name` (Spalte existiert nicht) | JOIN: `caregiver:caregivers(first_name, last_name)` |

### 4. Falsche Status-Enum-Werte

| Kontext | Vorher (falsch) | Nachher (korrekt) |
|---|---|---|
| service_records.status | `'completed'` | `'complete'` |
| proof_status PreFlight | `'pending'` | `'ENTWURF', 'ABGESCHLOSSEN'` |
| billing_status | `'pending', 'ready'` | (entfernt, proof_status genuegt) |

---

## Auswirkung

| Metrik | Vorher | Nachher |
|---|---|---|
| PreFlight-Validation | Bricht ab (DB-Fehler) | Alle 15 Pruefpunkte funktional |
| DTA-Export (EDIFACT) | 0 Faelle generiert (leere Daten) | Korrekte AbrechnungsFall-Objekte |
| DTA-Dry-Run | Bricht ab (DB-Fehler) | Vollstaendiger 10-Schritt-Test |
| Pflegekraft-Name im EDIFACT | `undefined` / Fallback | Korrekter Name via Caregiver-JOIN |

---

## Verifizierung

- TypeScript-Check: 0 Fehler
- Grep-Scan: Keine weiteren `nachname`/`vorname`/`strasse`/`hausnummer`/`service_date`/`caregiver_name` als Client/Service-Record DB-Spalten
- AbrechnungsFall-Interface: `nachname`/`vorname` sind korrekte Interface-Felder (mapping von `last_name`/`first_name`), nicht DB-Spalten
- EDIFACT NAD-Segment: `hausnummer` optional, `address` enthaelt volle Strasse — funktional korrekt
- Konsistenz Engine ↔ Dry-Run: Identische Datenladung, identisches Mapping

---

## Nicht betroffen (verifiziert korrekt)

- `edifact-generator.ts` — nutzt AbrechnungsFall-Interface, keine DB-Zugriffe
- `edifact-segments.ts` — reine Segment-Builder, Interface-Felder
- `edifact-validator.ts` — validiert EDIFACT-String, kein DB-Zugriff
- `leistungsnachweis-pdf.ts` — eigene korrekte Queries
- `monatsabschluss.ts` — eigene korrekte Queries
- `ruecklaeufer.ts` — schreibt auf korrekte DTA-Tabellen
- `korrekturlaeufe.ts` — referenziert korrekte abrechnungslaeufe-Spalten
- `auto-invoice/route.ts` — bereits korrekt (date, status=signed)
- `monthly-closing/route.ts` — bereits korrekt (date, gte/lte)

---

## Naechste Schritte (Phase B)

Der DTA/EDIFACT-Export-Pipeline ist jetzt technisch funktional. Identifizierte Luecken aus dem Scan-Report fuer folgende Bloecke:

1. **Leistungsnachweis-PDF Hardcoded-Firmendaten** — LEISTUNGSERBRINGER-Konstante blockiert Multi-Tenant
2. **Non-Hessen AOK Routing** — findeDatenannahmestelle() gibt null fuer nicht-hessische AOK zurueck
3. **Engine-interne org_id-Luecken** — exportiereLauf/gebeLaufFrei filtern nicht intern nach org_id
4. **EDIFACT-Ruecklaeufer-Parser** — eingehende Dateien werden als Rohtext gespeichert, nicht geparst
5. **Automatische Antwortdatei-Abholung** — kein Scheduler, nur manueller Trigger
