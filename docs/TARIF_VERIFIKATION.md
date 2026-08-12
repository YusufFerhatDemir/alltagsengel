# TARIF-VERIFIKATION — Im System hinterlegte Abrechnungsdaten

**Stand:** 2026-08-12  
**Quelle:** Supabase-Migrationen im Repository (`supabase/migrations/`)  
**Status:** NICHT VERIFIZIERT — fachliche Prüfung vor Produktivbetrieb erforderlich

---

## 1. Leistungsarten-Katalog (`billing_leistungsarten`)

Quelle: `20260807120000_tariff_model_hardening.sql`

| # | Code | Bezeichnung |
|---|------|------------|
| 1 | `alltagsbegleitung` | Alltagsbegleitung |
| 2 | `betreuung_45a` | Betreuung nach §45a SGB XI |
| 3 | `verhinderungspflege` | Verhinderungspflege |
| 4 | `hauswirtschaft` | Hauswirtschaftliche Versorgung |
| 5 | `einkaufsservice` | Einkaufsservice |
| 6 | `begleitservice` | Begleitservice |
| 7 | `nachtbetreuung` | Nachtbetreuung |
| 8 | `wochenendbetreuung` | Wochenendbetreuung |
| 9 | `krankenfahrt` | Krankenfahrt |
| 10 | `demenzbetreuung` | Demenzbetreuung |
| 11 | `wegepauschale` | Wegepauschale |
| 12 | `sonstige` | Sonstige Leistung |

**Verifikations-Status:** NICHT VERIFIZIERT — fachliche Prüfung erforderlich, ob diese Leistungsarten dem Leistungskatalog der Organisation entsprechen.

---

## 2. Rechtsgrundlagen-Katalog (`billing_rechtsgrundlagen`)

Quelle: `20260807120000_tariff_model_hardening.sql`

| # | Code | Bezeichnung |
|---|------|------------|
| 1 | `§45b SGB XI` | Entlastungsleistungen |
| 2 | `§39 SGB XI` | Verhinderungspflege |
| 3 | `§36 SGB XI` | Häusliche Pflegehilfe |
| 4 | `privat` | Privatzahler (ohne Kasse) |

**Verifikations-Status:** NICHT VERIFIZIERT — fachliche Prüfung erforderlich, ob diese Rechtsgrundlagen für die angebotenen Leistungen korrekt und vollständig sind.

---

## 3. Tarifquellen-Katalog (`billing_tarifquellen`)

Quelle: `20260807180000_tariff_stammdaten_v2.sql`

| # | Code | Bezeichnung |
|---|------|------------|
| 1 | `PRIVATE_PREISLISTE` | Interne Preisliste für Privatzahler |
| 2 | `ANERKENNUNGSBESCHEID` | Preis aus Anerkennungsbescheid (Landesbehörde) |
| 3 | `VERGUETUNGSVEREINBARUNG` | Vergütungsvereinbarung mit Pflegekasse |
| 4 | `KASSENVEREINBARUNG` | Rahmenvertrag / Kassenvereinbarung |
| 5 | `MANUELL_FREIGEGEBEN` | Manuell geprüft und von Geschäftsführung freigegeben |

**Verifikations-Status:** NICHT VERIFIZIERT — Metadaten-Katalog, der die Herkunft/Verbindlichkeit eines Tarifs dokumentiert.

---

## 4. Interne Service-Preise (`service_pricing`)

Quelle: `20260719_eylem_audit_complete_features.sql`

**WICHTIG:** Diese Tabelle ist explizit als **INTERNE Preisliste für die Native-App-Leistungserfassung** markiert. Die Preise sind NUR für die Schnell-Kalkulation bei der Einsatzerfassung. Für die korrekte Abrechnung wird AUSSCHLIESSLICH `billing_tariffs` genutzt (siehe Kommentar in Migration `20260807180000`).

| # | Leistungsart | Budget-Typ | Beschreibung | Stundensatz | Min. Std. | Einheit |
|---|-------------|-----------|-------------|-------------|----------|---------|
| 1 | `alltagsbegleitung` | `entlastung` | Alltagsbegleitung über Entlastungsbetrag §45b | 35,00 € | 1 | Stunde |
| 2 | `alltagsbegleitung` | `verhinderung` | Alltagsbegleitung über Verhinderungspflege §39 | 35,00 € | 1 | Stunde |
| 3 | `alltagsbegleitung` | `private` | Alltagsbegleitung privat | 40,00 € | 1 | Stunde |
| 4 | `betreuung_45a` | `entlastung` | Betreuung nach §45a über Entlastungsbetrag | 35,00 € | 1 | Stunde |
| 5 | `betreuung_45a` | `verhinderung` | Betreuung nach §45a über Verhinderungspflege | 35,00 € | 1 | Stunde |
| 6 | `hauswirtschaft` | `entlastung` | Hauswirtschaftliche Unterstützung | 35,00 € | 1 | Stunde |
| 7 | `hauswirtschaft` | `private` | Hauswirtschaft privat | 38,00 € | 1 | Stunde |
| 8 | `einkaufsservice` | `entlastung` | Einkaufsbegleitung / Einkaufsservice | 35,00 € | 1 | Stunde |
| 9 | `begleitservice` | `entlastung` | Begleitservice (Arzt, Behörde, Freizeit) | 35,00 € | 1 | Stunde |
| 10 | `begleitservice` | `private` | Begleitservice privat | 40,00 € | 1 | Stunde |

**Verifikations-Status:** NICHT VERIFIZIERT — fachliche Prüfung erforderlich, ob diese internen Kalkulationspreise den tatsächlichen Stundensätzen der Organisation entsprechen.

---

## 5. Abrechnungstarife (`billing_tariffs`)

Quelle: Keine INSERT-Statements in Migrationen. Die Tabelle `billing_tariffs` enthält **keine geseedeten Preisdaten** — Tarife sind mandantenspezifisch (`organization_id`) und müssen pro Organisation angelegt werden.

**Tabellenstruktur** (relevante Spalten):
- `leistungsart` → FK auf `billing_leistungsarten`
- `rechtsgrundlage` → FK auf `billing_rechtsgrundlagen`
- `preis_cent` — Preis in Cent
- `einheit` — Abrechnungseinheit
- `verguetungsart` — `zeit_stunde`, `zeit_minute`, `leistungskomplex`, `pauschale`, `wegepauschale`
- `bundesland` — Bundesland-Zuordnung
- `kostentraeger_ik` — IK des Kostenträgers
- `tarifquelle` → FK auf `billing_tarifquellen`
- `gueltig_ab` / `gueltig_bis` — Gültigkeitszeitraum
- `zuschlag_wochenende_prozent`, `zuschlag_feiertag_prozent`, `zuschlag_nacht_prozent`

**Verifikations-Status:** Tabelle ist strukturell korrekt, aber ohne hinterlegte Produktivtarife. Tarife müssen vor dem Abrechnungsbetrieb angelegt und fachlich freigegeben werden.

**Hinweis zum Memory-Eintrag:** Laut früherer Prüfung (Stand 12.08.2026) befanden sich 23 Zeilen in `billing_tariffs` und 24 Zeilen in `leistungspreise` auf der Live-Datenbank. Diese stammen nicht aus Migrationen sondern wurden direkt in die Datenbank eingetragen. Die fachliche Verifikation dieser Live-Daten ist ausstehend.

---

## 6. Gesetzliche Preisobergrenzen (`billing_gesetzliche_obergrenzen`)

Quelle: `20260808110000_tarifschichten_bundesland.sql`

**WICHTIG:** Diese Tabelle enthält PREISOBERGRENZEN (Deckelungen), keine Abrechnungstarife. Der Trigger `enforce_tariff_obergrenze` ist auf `bestaetigt=FALSE` gesetzt und damit **inaktiv**.

| # | Bundesland | Rechtsgrundlage | Angebotstyp | Vergütungsart | Obergrenze | Quelle | Gültig ab | Bestätigt |
|---|-----------|----------------|-------------|--------------|-----------|--------|----------|-----------|
| 1 | Hessen | §45b SGB XI | Betreuungsangebot | zeit_stunde | 30,00 €/Std. | PfluV Hessen §3 Nr. 1+2 | 2026-01-01 | **NEIN** |
| 2 | Hessen | §45b SGB XI | Entlastungsangebot | zeit_stunde | 25,00 €/Std. | PfluV Hessen §3 Nr. 3 | 2026-01-01 | **NEIN** |

**Verifikations-Status:** NICHT VERIFIZIERT — fachliche Prüfung gegen aktuelle PfluV Hessen erforderlich. Beide Zeilen haben `bestaetigt=FALSE`, der Obergrenze-Trigger ist damit inaktiv. Vor Scharfschaltung (`bestaetigt=TRUE`) muss der aktuelle Verordnungstext gegengelesen und der Stand der PfluV-Novelle geprüft werden.

---

## 7. Landesspezifische Regeln (`billing_landesregeln`)

Quelle: `20260808110000_tarifschichten_bundesland.sql`

| # | Bundesland | Regel | Wert | Quelle | Bestätigt |
|---|-----------|-------|------|--------|-----------|
| 1 | Hessen | `anerkennung_rechtsgrundlage` | PfluV Hessen | Angabe Geschäftsführung, Stand 08.08.2026 | **NEIN** |

Weitere Regel-Schlüssel sind als Katalog definiert (`billing_landesregel_keys`, 16 Einträge), aber ohne konkrete Werte für Hessen oder andere Bundesländer. Die Werte müssen aus der jeweiligen Landesverordnung entnommen werden.

**Definierte Regel-Schlüssel (ohne hinterlegte Werte):**
- `min_einsatzdauer_minuten` — Mindesteinsatzdauer
- `taktung_minuten` — Abrechnungstaktung
- `max_stunden_pro_einsatz` — Maximale Einsatzdauer
- `max_stunden_pro_monat` — Maximale Stunden pro Monat
- `qualifikation_erforderlich` — Erforderliche Qualifikation
- `schulungsstunden_minimum` — Mindest-Schulungsumfang
- `fuehrungszeugnis_pflicht` — Erweitertes Führungszeugnis Pflicht
- `unterschrift_pflicht` — Unterschrift des Klienten Pflicht
- `nachweis_aufbewahrung_jahre` — Aufbewahrungsfrist Leistungsnachweise
- `abrechnung_frist_monate` — Abrechnungsfrist
- `elektronische_abrechnung` — Elektronische Abrechnung zulässig
- `wegekosten_erstattungsfaehig` — Wegekosten erstattungsfähig
- `zuschlag_wochenende_zulaessig` — Wochenendzuschlag zulässig
- `zuschlag_feiertag_zulaessig` — Feiertagszuschlag zulässig
- `zuschlag_nacht_zulaessig` — Nachtzuschlag zulässig
- `anerkennung_rechtsgrundlage` — Landesrechtliche Grundlage

**Verifikations-Status:** NICHT VERIFIZIERT — nur die landesrechtliche Grundlage für Hessen ist hinterlegt. Alle anderen Regeln müssen aus der PfluV Hessen entnommen und eingetragen werden.

---

## 8. Wegepauschalen (`billing_wegepauschalen`)

Quelle: `20260808110000_tarifschichten_bundesland.sql`

**Keine Seed-Daten vorhanden.** Die Tabelle ist strukturell angelegt, aber ohne Einträge. Die Migration kommentiert explizit: "KEINE Seed-Werte — Beträge sind vertraglich zu belegen."

Mögliche Modelle:
- `keine` — Wegekosten im Leistungspreis enthalten
- `pro_einsatz` — Fester Betrag je Einsatz
- `pro_km` — Betrag je gefahrenem Kilometer
- `zone` — Betrag je Entfernungszone

**Verifikations-Status:** Keine Daten zum Verifizieren — Beträge und Modell müssen aus dem Versorgungsvertrag / der Vergütungsvereinbarung entnommen werden.

---

## Zusammenfassung

| Tabelle | Zeilen in Migration | Zeilen auf Live-DB (Stand 12.08.) | Status |
|---------|--------------------|---------------------------------|--------|
| `billing_leistungsarten` | 12 | 12 | NICHT VERIFIZIERT |
| `billing_rechtsgrundlagen` | 4 | 4 | NICHT VERIFIZIERT |
| `billing_tarifquellen` | 5 | 5 | NICHT VERIFIZIERT |
| `service_pricing` | 10 | 10 | NICHT VERIFIZIERT (interne Kalkulation) |
| `billing_tariffs` | 0 (keine Seeds) | 23 (direkt eingetragen) | NICHT VERIFIZIERT |
| `leistungspreise` | 0 (keine Seeds) | 24 (direkt eingetragen) | NICHT VERIFIZIERT |
| `billing_gesetzliche_obergrenzen` | 2 | 2 | NICHT VERIFIZIERT, Trigger inaktiv |
| `billing_landesregeln` | 1 | 1 | NICHT VERIFIZIERT |
| `billing_wegepauschalen` | 0 | 0 | Keine Daten |

---

## HINWEIS

Diese Tabelle enthält die aktuell im System hinterlegten Werte, extrahiert aus den Supabase-Migrationen im Repository. Sie wurden **NICHT** gegen echte Vergütungsvereinbarungen verifiziert.

**Vor Produktivbetrieb muss jeder Eintrag gegen die geltende Vergütungsvereinbarung des jeweiligen Bundeslandes / Kostenträgers geprüft werden.**

Insbesondere:
1. Die 23 Zeilen in `billing_tariffs` (Live-DB) — Herkunft und Korrektheit unklar
2. Die 24 Zeilen in `leistungspreise` (Live-DB) — Herkunft und Korrektheit unklar
3. Die Preisobergrenzen (30 €/25 € für Hessen) — gegen aktuelle PfluV Hessen prüfen
4. Die `service_pricing`-Stundensätze (35 €/38 €/40 €) — gegen interne Preisliste prüfen

**Verantwortlich für Verifikation:** Fachliche Leitung / Abrechnungsexperte  
**Empfohlener Ablauf:** Vergütungsvereinbarung beschaffen → Soll-Ist-Abgleich → Freigabe durch Geschäftsführung → `tarifquelle` auf `MANUELL_FREIGEGEBEN` oder `VERGUETUNGSVEREINBARUNG` setzen
