# Tarif-Daten-Matrix — 2026-08-10

Stand: Branch `staging/expansion-abnahme` @ Commit `7126f42`

## Vorbemerkung

Alle Preise muessen aus Originaldokumenten (Verguetungsvereinbarungen, Anerkennungsbescheide, Preislisten) stammen.
**KEINE erfundenen Preise** in dieser Matrix. Spalte `preis_status` zeigt den tatsaechlichen Zustand.

---

## 1. Katalog-Tabellen (DB-Schema)

### billing_leistungsarten (Seed in 20260807120000)
| code | bezeichnung |
|------|-------------|
| alltagsbegleitung | Alltagsbegleitung |
| betreuung_45a | Betreuung nach §45a SGB XI |
| verhinderungspflege | Verhinderungspflege |
| hauswirtschaft | Hauswirtschaftliche Versorgung |
| einkaufsservice | Einkaufsservice |
| begleitservice | Begleitservice |
| nachtbetreuung | Nachtbetreuung |
| wochenendbetreuung | Wochenendbetreuung |
| krankenfahrt | Krankenfahrt |
| demenzbetreuung | Demenzbetreuung |
| wegepauschale | Wegepauschale |
| sonstige | Sonstige Leistung |

### billing_rechtsgrundlagen (Seed in 20260807120000)
| code | bezeichnung |
|------|-------------|
| §45b SGB XI | Entlastungsleistungen (125 EUR/Monat) |
| §39 SGB XI | Verhinderungspflege (bis 1.612 EUR/Jahr) |
| §36 SGB XI | Haeusliche Pflegehilfe (nach Pflegegrad) |
| privat | Privatzahler (ohne Kasse) |

### Fehlende Rechtsgrundlagen (noch nicht im Katalog)
| code | beschreibung | aktion |
|------|-------------|--------|
| §37 SGB V | Behandlungspflege (aerztl. Verordnung, SGB V) | Katalog erweitern wenn HKP angeboten |
| §38a SGB XI | Wohngruppenzuschlag (214 EUR/Monat) | Nur relevant bei ambulanten WGs |

---

## 2. Vollstaendige Tarif-Matrix

### §45b SGB XI — Entlastungsleistungen (Angebote zur Unterstuetzung im Alltag)

| leistungsart | rechtsgrundlage | abrechnungspfad | kostentraeger_typ | bundesland | einheit | preis_status | tarifquelle | zuschlaege | voraussetzungen | im_code_implementiert |
|---|---|---|---|---|---|---|---|---|---|---|
| alltagsbegleitung | §45b SGB XI | Pflegekasse | pflegekasse | hessen | stunde | **LEER — Preis fehlt** | ANERKENNUNGSBESCHEID | Feiertag/WE/Nacht — Saetze fehlen | Anerkennung nach §45a SGB XI, PG 1-5 | JA (tariff-import, invoice-engine, RPC) |
| betreuung_45a | §45b SGB XI | Pflegekasse | pflegekasse | hessen | stunde | **LEER** | ANERKENNUNGSBESCHEID | — | Anerkennung nach §45a SGB XI | JA |
| hauswirtschaft | §45b SGB XI | Pflegekasse | pflegekasse | hessen | stunde | **LEER** | ANERKENNUNGSBESCHEID | — | Anerkennung nach §45a SGB XI | JA |
| einkaufsservice | §45b SGB XI | Pflegekasse | pflegekasse | hessen | einsatz | **LEER** | ANERKENNUNGSBESCHEID | — | Anerkennung nach §45a SGB XI | JA |
| begleitservice | §45b SGB XI | Pflegekasse | pflegekasse | hessen | stunde | **LEER** | ANERKENNUNGSBESCHEID | — | Anerkennung nach §45a SGB XI | JA |
| demenzbetreuung | §45b SGB XI | Pflegekasse | pflegekasse | hessen | stunde | **LEER** | ANERKENNUNGSBESCHEID | — | Anerkennung nach §45a SGB XI | JA |

**Budget:** 125 EUR/Monat (§45b SGB XI), ansparbar bis 30.06. des Folgejahres (Uebertrag = carryover im Code)

### §39 SGB XI — Verhinderungspflege

| leistungsart | rechtsgrundlage | abrechnungspfad | kostentraeger_typ | bundesland | einheit | preis_status | tarifquelle | zuschlaege | voraussetzungen | im_code_implementiert |
|---|---|---|---|---|---|---|---|---|---|---|
| verhinderungspflege | §39 SGB XI | Pflegekasse | pflegekasse | hessen | stunde | **LEER** | VERGUETUNGSVEREINBARUNG | Saetze aus Vertrag | PG 2-5, Pflegeperson > 6 Mon. | JA |
| alltagsbegleitung | §39 SGB XI | Pflegekasse | pflegekasse | hessen | stunde | **LEER** | VERGUETUNGSVEREINBARUNG | — | PG 2-5 | JA |

**Budget:** bis 1.612 EUR/Jahr, teilweise umwidmbar aus §42 (Kurzzeitpflege)

### §36 SGB XI — Haeusliche Pflegehilfe (ambulante Sachleistungen)

| leistungsart | rechtsgrundlage | abrechnungspfad | kostentraeger_typ | bundesland | einheit | preis_status | tarifquelle | zuschlaege | voraussetzungen | im_code_implementiert |
|---|---|---|---|---|---|---|---|---|---|---|
| hauswirtschaft | §36 SGB XI | Pflegekasse | pflegekasse | hessen | leistungskomplex | **LEER** | VERGUETUNGSVEREINBARUNG | nach Vertrag | Versorgungsvertrag §72 SGB XI noetig | JA (Code vorhanden, Tarife fehlen) |

**Budget:** PG-abhaengig (761-2.095 EUR/Monat, Stand 2025)
**Voraussetzung:** Versorgungsvertrag nach §72 SGB XI — Alltagsengel hat Stand 2026-08 **KEINEN** §72-Vertrag

### Privatleistungen

| leistungsart | rechtsgrundlage | abrechnungspfad | kostentraeger_typ | bundesland | einheit | preis_status | tarifquelle | zuschlaege | voraussetzungen | im_code_implementiert |
|---|---|---|---|---|---|---|---|---|---|---|
| alltagsbegleitung | privat | Direktrechnung Klient | privat | alle | stunde | **LEER** | PRIVATE_PREISLISTE | nach interner Preisliste | Dienstleistungsvertrag | JA |
| hauswirtschaft | privat | Direktrechnung Klient | privat | alle | stunde | **LEER** | PRIVATE_PREISLISTE | — | Dienstleistungsvertrag | JA |
| einkaufsservice | privat | Direktrechnung Klient | privat | alle | einsatz | **LEER** | PRIVATE_PREISLISTE | — | Dienstleistungsvertrag | JA |
| begleitservice | privat | Direktrechnung Klient | privat | alle | stunde | **LEER** | PRIVATE_PREISLISTE | — | Dienstleistungsvertrag | JA |
| krankenfahrt | privat | Direktrechnung Klient | privat | alle | km | **LEER** | PRIVATE_PREISLISTE | — | Dienstleistungsvertrag | JA |
| wegepauschale | privat | Direktrechnung Klient | privat | alle | pauschale | **LEER** | PRIVATE_PREISLISTE | — | — | JA |

### Zuschlaege

| zuschlagsart | tarifquelle | saetze | im_code_implementiert |
|---|---|---|---|
| zuschlag_feiertag_prozent | Verguetungsvereinbarung/Tarifvertrag | **LEER — Saetze fehlen** | JA (billing_tariffs Spalte, Default 0%) |
| zuschlag_wochenende_prozent | Verguetungsvereinbarung/Tarifvertrag | **LEER** | JA (billing_tariffs Spalte, Default 0%) |
| zuschlag_nacht_prozent | Verguetungsvereinbarung/Tarifvertrag | **LEER** | JA (billing_tariffs Spalte, Default 0%) |
| nacht_von / nacht_bis | Verguetungsvereinbarung/Tarifvertrag | Default 20:00-06:00 (aus Code) | JA (price-resolver) |

---

## 3. billing_tariffs Tabellen-Schema

| Spalte | Typ | Constraint | Beschreibung |
|--------|-----|-----------|-------------|
| id | UUID | PK | |
| organization_id | UUID | FK, NOT NULL | Mandantentrennung |
| bundesland | TEXT | | Bundesland-Code |
| kostentraeger_ik | TEXT | CHECK(validate_ik_nummer) | IK-Nummer (9 Ziffern, Luhn) |
| leistungsart | TEXT | FK → billing_leistungsarten | |
| rechtsgrundlage | TEXT | FK → billing_rechtsgrundlagen | |
| preis_cent | INTEGER | >= 0, NOT NULL | Ganzzahlig, in Cent |
| einheit | TEXT | | stunde/minute/einsatz/pauschale/km/tag |
| verguetungsart | TEXT | CHECK | zeit_stunde/zeit_minute/leistungskomplex/pauschale/wegepauschale/zuschlag |
| gueltig_ab | DATE | NOT NULL | |
| gueltig_bis | DATE | | NULL = unbefristet |
| tarifquelle | TEXT | | Herkunft des Tarifs |
| vertrag_referenz | TEXT | | Aktenzeichen/Vertragsnummer |
| qualifikation | TEXT | | Fachkraft-Stufe |
| zuschlag_wochenende_prozent | NUMERIC | DEFAULT 0 | |
| zuschlag_feiertag_prozent | NUMERIC | DEFAULT 0 | |
| zuschlag_nacht_prozent | NUMERIC | DEFAULT 0 | |
| nacht_von | TIME | DEFAULT '20:00' | |
| nacht_bis | TIME | DEFAULT '06:00' | |
| kombinations_abschlag_prozent | NUMERIC | DEFAULT 0 | |
| deleted_at | TIMESTAMPTZ | | Soft-Delete |
| created_by | UUID | | Audit |

### Unique-Constraint / Overlap-Schutz
- `no_overlapping_tariffs` Exclusion-Constraint (via 20260807120000):
  Verhindert zeitliche Ueberschneidung bei gleicher (org_id, leistungsart, rechtsgrundlage, kostentraeger_ik, bundesland)

---

## 4. Verguetungsart → Preisberechnung (aus RPC)

| verguetungsart | Berechnung |
|---|---|
| zeit_stunde | preis_cent × (duration_minutes / 60) |
| zeit_minute | preis_cent × duration_minutes |
| leistungskomplex | preis_cent × 1 (pro Einsatz) |
| pauschale | preis_cent × 1 |
| wegepauschale | preis_cent × 1 |
| zuschlag | preis_cent (aufschlag, additiv) |

---

## 5. Budget-Type → Rechtsgrundlage Mapping (aus price-resolver.ts)

| budget_type (Code) | rechtsgrundlage (DB) |
|---|---|
| entlastung | §45b SGB XI |
| verhinderung | §39 SGB XI |
| carryover | §45b SGB XI |
| haeusliche_pflege_36 | §36 SGB XI |
| private | privat |

---

## 6. Status-Zusammenfassung

| Bereich | Status | Details |
|---------|--------|---------|
| Schema billing_tariffs | VORHANDEN | Tabelle + Constraints + Kataloge existieren in Migrationen |
| Tarif-Import-Pipeline | VORHANDEN | lib/billing/core/tariff-import.ts — Validierung, Dry-Run, Fehlerhandling |
| Tarif-Aufloesung | VORHANDEN | price-resolver.ts + RPC create_invoice_draft_atomic |
| Preisberechnung | VORHANDEN | Zuschlagslogik, Verguetungsart-Switch |
| **Echte Tarif-Daten** | **FEHLEN KOMPLETT** | billing_tariffs hat 0 Zeilen — kein einziger Preis hinterlegt |
| Zuschlagssaetze | FEHLEN | Default 0% — echte Saetze muessen aus Vertraegen kommen |

---

## 7. Was Yusuf beschaffen muss

| Dokument | Woher | Wofuer |
|----------|-------|--------|
| **Anerkennungsbescheid §45a SGB XI** | RP Giessen / Hessisches Sozialministerium | Stundensaetze fuer §45b-Leistungen |
| **Verguetungsvereinbarung(en)** | AOK Hessen, BKK, IKK classic, etc. | Kassentarife, IK-Nummern, Zuschlagssaetze |
| **Private Preisliste** | Interne Kalkulation / GF-Entscheidung | Privatleistungs-Tarife |
| **IK-Nummer(n) der Kostentraeger** | GKV-Spitzenverband / ARGE IK | kostentraeger_ik fuer Tarif-Zuordnung |
| **Eigene IK-Nummer** | ARGE IK / Pflegekasse | Absender-Identifikation fuer DTA |
| **Tarifvertrag** (falls tarifgebunden) | Arbeitgeberverband / Gewerkschaft | Zeitzuschlaege (Nacht/WE/Feiertag) |
