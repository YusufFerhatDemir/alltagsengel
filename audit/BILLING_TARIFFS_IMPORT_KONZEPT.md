# Import- und Pflegekonzept: billing_tariffs

**Datum:** 2026-08-07
**Branch:** feature/unified-invoice-creation
**Status:** Konzeptdokument (Punkt 4 der Pre-Production-Pruefung)

---

## 1. Pflichtfelder und Validierungsregeln

### Pflichtfelder (NOT NULL im Schema)

| Feld | Typ | Validierung |
|------|-----|-------------|
| organization_id | UUID | FK → organizations, automatisch via current_org_id() |
| leistungsart | TEXT | Muss service_records.service_type-Werten entsprechen (case-insensitiv) |
| rechtsgrundlage | TEXT | Muss Budget-Typ-Mapping entsprechen: '§45b SGB XI', '§39 SGB XI', '§36 SGB XI', 'privat' |
| verguetungsart | TEXT | CHECK: 'zeit_stunde', 'zeit_minute', 'leistungskomplex', 'pauschale', 'wegepauschale', 'zuschlag' |
| preis_cent | INTEGER | CHECK: >= 0, Wert in Cent (nicht EUR) |
| gueltig_ab | DATE | Muss gesetzt sein, Beginn der Tarifgueltigkeit |

### Optionale Felder (fuer Spezifitaets-Scoring)

| Feld | Wirkung |
|------|---------|
| kostentraeger_ik | Match +10 Punkte, Mismatch → Tarif nicht anwendbar |
| bundesland | Match +5 Punkte, Mismatch → Tarif nicht anwendbar |
| qualifikation | Match +3 Punkte (fuer Zukunft, aktuell nicht im Matching) |
| vertrag_referenz | Match +2 Punkte (fuer Zukunft, aktuell nicht im Matching) |
| gueltig_bis | NULL = unbegrenzt gueltig, sonst Ende der Gueltigkeit |

### Format-Regeln

- `leistungsart`: Kleinbuchstaben empfohlen (RPC vergleicht mit LOWER())
- `preis_cent`: Ganzzahl in Cent (3500 = 35,00 EUR)
- `gueltig_ab`/`gueltig_bis`: ISO-Datum (YYYY-MM-DD)
- `kostentraeger_ik`: Institutionskennzeichen (9-stellig, z.B. '109034001')
- `bundesland`: Kleinbuchstaben (z.B. 'hessen')
- `einheit`: Beschreibung der Abrechnungseinheit (z.B. 'Stunde', 'Einsatz')

---

## 2. Dubletten-Erkennung

### Definition einer Dublette

Ein Tarif ist eine Dublette, wenn fuer die gleiche Kombination aus:
- `organization_id`
- `leistungsart`
- `rechtsgrundlage`
- `kostentraeger_ik` (oder beide NULL)

ein zeitlich ueberlappender Tarif existiert.

### Schutz im Schema

Der **Exclusion Constraint** `no_overlapping_tariffs` (Migration 20260807110000) verhindert automatisch:
```sql
EXCLUDE USING gist (
  organization_id WITH =,
  leistungsart WITH =,
  rechtsgrundlage WITH =,
  COALESCE(kostentraeger_ik, '__ALL__') WITH =,
  tariff_validity_range(gueltig_ab, gueltig_bis) WITH &&
) WHERE (deleted_at IS NULL)
```

→ Ein INSERT/UPDATE mit ueberlappenden Zeitraeumen wird von der DB abgewiesen.

---

## 3. Zeitliche Ueberschneidungen

### Regeln

- `gueltig_ab` MUSS gesetzt sein
- `gueltig_bis` NULL = unbegrenzt gueltig (wird als 9999-12-31 behandelt)
- `CONSTRAINT valid_period CHECK (gueltig_bis IS NULL OR gueltig_bis >= gueltig_ab)`
- Exclusion Constraint verhindert Ueberlappungen
- Tarifwechsel: Alter Tarif auf `gueltig_bis = neuer_tarif.gueltig_ab - 1 Tag` setzen

### Ablauf bei Tarifwechsel

1. Bestehenden Tarif: `UPDATE SET gueltig_bis = '2026-06-30'`
2. Neuen Tarif: `INSERT (gueltig_ab = '2026-07-01', ...)`
3. Constraint prueft automatisch: kein Overlap → OK

---

## 4. Kostentraeger-Unterschiede

### Hierarchie

- `kostentraeger_ik = NULL`: Allgemeiner Tarif (gilt fuer alle Kostentraeger)
- `kostentraeger_ik = '109034001'`: Spezifischer Tarif (nur fuer diesen Kostentraeger)

### Spezifitaets-Scoring

Die RPC wählt automatisch den spezifischsten Tarif:
- Kostentraeger-Match: +10 Punkte
- Kostentraeger auf Tarif gesetzt, aber Client hat anderen IK: Tarif nicht anwendbar (-100)
- Kostentraeger auf Tarif NULL: 0 Punkte (Allgemeintarif)

→ Ein kostentraeger-spezifischer Tarif hat IMMER Vorrang vor einem allgemeinen.

---

## 5. Org-Unterschiede (Multi-Mandant)

### Prinzip

- Jeder Tarif gehoert zu genau einer Organisation (`organization_id NOT NULL`)
- RLS-Policies beschraenken den Zugriff auf die eigene Organisation
- Die RPC filtert explizit: `WHERE organization_id = p_org_id`
- Mandant A sieht und verwendet NIE Tarife von Mandant B

### Import

- Beim Import muss die organization_id mitgeliefert werden
- Admin-UI: organization_id wird automatisch aus dem eingeloggten User abgeleitet
- CSV-Import: organization_id als Pflichtfeld oder aus dem Upload-Kontext

---

## 6. Versionierung

### Ansatz: Zeitraum-basierte Versionierung

Keine explizite Versionsnummer, sondern Gueltigkeitszeitraeume:

- Alter Tarif: `gueltig_bis = letzter_Tag_der_alten_Periode`
- Neuer Tarif: `gueltig_ab = erster_Tag_der_neuen_Periode`
- Bestehende Rechnungen: Unveraendert (Tarif-ID + Snapshot in invoice_items)

### Audit-Trail

- `created_at`, `created_by`: Wer hat den Tarif angelegt?
- `updated_at`: Letzte Aenderung
- `deleted_at`: Soft-Delete (Tarif wird bei Aufloesung ignoriert)

### Nachvollziehbarkeit bei Rechnungen

Jede Rechnungsposition speichert:
- `tariff_id` → Referenz zum verwendeten Tarif
- `tariff_gueltig_ab/bis` → Gueltigkeit zum Zeitpunkt der Rechnung
- `tariff_preis_cent` → Preis zum Zeitpunkt der Rechnung
- `price_source = 'billing_tariffs'`

---

## 7. Import-Wege

### Weg A: Admin-UI (empfohlen fuer Einzeltarife)

- Formular in `/admin/billing-tariffs/`
- Pflichtfelder visuell markiert
- Sofortige Validierung (Format, Overlap, Pflichtfelder)
- Audit: `created_by = aktueller Admin-User`

### Weg B: CSV-Upload (empfohlen fuer Massen-Import)

- Format: CSV mit Header-Zeile
- Pflichtfelder: leistungsart, rechtsgrundlage, verguetungsart, preis_cent, gueltig_ab
- Optionale Felder: kostentraeger_ik, bundesland, gueltig_bis, einheit, Zuschlaege
- Ablauf:
  1. CSV hochladen
  2. Validierung (Format, Pflichtfelder, Overlap-Check)
  3. Vorschau der zu importierenden Tarife
  4. Bestaetigung durch Admin (Vier-Augen-Prinzip)
  5. Transaktionaler Import (alle oder keine)
  6. Ergebnis-Report

### CSV-Beispiel

```csv
leistungsart,rechtsgrundlage,verguetungsart,preis_cent,gueltig_ab,gueltig_bis,kostentraeger_ik,bundesland,einheit
alltagsbegleitung,§45b SGB XI,zeit_stunde,3500,2026-07-01,,,,Stunde
demenzbetreuung,§45b SGB XI,zeit_stunde,3800,2026-07-01,,,hessen,Stunde
haushaltshilfe,§45b SGB XI,zeit_stunde,3200,2026-07-01,,,hessen,Stunde
```

---

## 8. Vier-Augen-Freigabe

### Rollen

- **Ersteller**: Admin mit Berechtigung `billing_tariffs_insert`
- **Freigeber**: Anderer Admin (oder Superadmin)

### Vorgeschlagener Workflow

1. Tarif wird angelegt (Status: konzeptuell als "Entwurf" — ueber `deleted_at` steuerbar oder separates Feld)
2. Zweiter Admin prueft und gibt frei
3. Alternativ: Vier-Augen ueber den Import-Prozess (Upload → Vorschau → Bestaetigung)

### Offene fachliche Entscheidung

Ob ein separates `status`-Feld ('entwurf', 'aktiv', 'deaktiviert') benoetigt wird oder ob `deleted_at` reicht. Aktuell: `deleted_at IS NULL` = aktiv.

---

## 9. Audit-Trail fuer Tarifaenderungen

### Bestehende Audit-Felder

- `created_at` + `created_by`: Erstanlage
- `updated_at`: Letzte Aenderung
- `deleted_at`: Soft-Delete

### Erweiterung (empfohlen, separater PR)

- `billing_audit_trail` Eintraege fuer jede Tarifaenderung:
  - `entity_type = 'tariff'`
  - `action = 'created' | 'updated' | 'deleted'`
  - `previous_state` + `new_state`: Vorher/Nachher-JSONB
- Automatisch via Trigger oder ueber die Admin-API

### Bei Rechnungserstellung

- Die RPC schreibt bereits Audit-Eintraege:
  - Erfolg: `action = 'created'`, `new_state.price_source = 'billing_tariffs'`
  - Fehlender Tarif: `action = 'missing_tariff'`, Fehlerdetails
  - Mehrdeutiger Tarif: `action = 'ambiguous_tariff'`, Fehlerdetails

---

## 10. Rollback bei fehlerhaftem Import

### Transaktionaler Import

- CSV-Import laeuft in EINER Datenbank-Transaktion
- Bei Validierungsfehler in EINER Zeile: gesamter Import abgebrochen
- Keine halbfertigen Tarif-Daten

### Einzeltarif-Rollback

- Soft-Delete: `UPDATE SET deleted_at = now()` (Tarif wird bei Aufloesung ignoriert)
- Bestehende Rechnungen mit diesem Tarif bleiben unveraendert (Snapshot in invoice_items)

### Notfall-Rollback

- Bei fehlerhaftem Tarif NACH Rechnungserstellung:
  - Tarif soft-deleten
  - Betroffene Rechnungen identifizieren (ueber `invoice_items.tariff_id`)
  - Storno/Korrektur ueber bestehende Storno-/Korrektur-Funktionen

---

## 11. Teststrategie

### Vor Produktivschaltung

1. **Staging-Tarife**: Klar gekennzeichnete Testdaten (z.B. leistungsart = 'TEST_alltagsbegleitung')
2. **E2E-Test**: Tarif anlegen → Leistung erfassen → Rechnung erstellen → Preis pruefen
3. **Grenzfaelle**: Abgelaufener Tarif, zukuenftiger Tarif, mehrdeutiger Tarif
4. **Overlap-Test**: Versuch, ueberlappende Tarife anzulegen → muss scheitern
5. **Multi-Mandant-Test**: Tarif fuer Org A darf nicht in Rechnung fuer Org B erscheinen
6. **Cleanup**: Alle Testdaten nach Abschluss entfernen

### Automatisierte Tests (im Branch)

- `tariff-based-invoice.test.ts`: 22+ Tests fuer Tarif-basierte Rechnungserstellung
- `transaction-safety.test.ts`: Aktualisiert fuer Tarif-Pflicht
- `atomic-rpc-comprehensive.test.ts`: 29 Tests fuer RPC-Szenarien

---

## 12. Datenschutz

### Sensible Daten

- Tarife selbst: NICHT personenbezogen (organisationsbezogen)
- `kostentraeger_ik`: Institutionskennzeichen, öffentlich zugaenglich
- **KEINE** personenbezogenen Daten in billing_tariffs

### Zugriffskontrolle

- RLS aktiv: `billing_tariffs_org_fence` beschraenkt auf eigene Organisation
- Nur Admins koennen Tarife sehen/aendern (Policy `billing_tariffs_select/insert/update`)
- Kein DELETE-Policy (Soft-Delete statt Loeschen)

---

## Zusammenfassung: Offene fachliche Entscheidungen

| # | Frage | Empfehlung |
|---|-------|------------|
| 1 | Vier-Augen: separates Status-Feld oder deleted_at? | Status-Feld empfohlen |
| 2 | Welche Leistungsarten muessen initial angelegt werden? | Mindestens: alltagsbegleitung, demenzbetreuung, haushaltshilfe, hauswirtschaft |
| 3 | Welche Kostentraeger-IKs fuer Hessen? | Yusufs Input erforderlich |
| 4 | Standard-Preise fuer Entlastungsbetrag? | 131 EUR/Monat Budget, Stundensaetze aus service_pricing als Orientierung |
| 5 | Private Tarife: eigene Rechtsgrundlage oder gleiche Leistungsart? | Fachliche Klärung noetig |
| 6 | Zuschlagsregeln (Wochenende/Feiertag/Nacht): aktiv oder vorbereitet? | Schema vorhanden, Logik vorbereitet, Aktivierung per Tarif-Konfiguration |

---

**KEINE Tarifdaten auf Produktion importiert.** Konzept und Code auf Branch, wartet auf Yusufs Freigabe.
