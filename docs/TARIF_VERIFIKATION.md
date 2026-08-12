# TARIF-VERIFIKATION — Vollständige Prüfung aller 47 Live-Tarife

**Stand:** 2026-08-12
**Prüfmethode:** Direkter PostgREST-Export aller Einträge aus Production-DB + Punktwert-Berechnung + Code-Analyse
**Datenquelle:** Supabase Project nnwyktkqibdjxgimjyuq (PostgREST mit service_role)
**Ergebnis:** 23 billing_tariffs + 24 leistungspreise = 47 Einträge geprüft

---

## KRITISCHE BEFUNDE

### BEFUND K1: billing_tariffs hat KEIN `bestaetigt`-Feld

**Risiko: HOCH** — Es gibt keinen Mechanismus, der verhindert, dass nicht-verifizierte Tarife für echte Kassenabrechnungen verwendet werden.

- `billing_gesetzliche_obergrenzen` hat ein `bestaetigt`-Feld → aber das ist die Obergrenzen-Tabelle, NICHT die Tarif-Tabelle
- `billing_tariffs` hat nur `ist_aktiv` (boolean) und `tarifquelle` (text) — beides ist KEIN Verifikationsstatus
- Alle 23 Einträge stehen auf `ist_aktiv = true`
- Der Trigger `enforce_tariff_obergrenze` prüft nur gegen **bestätigte** Obergrenzen — aktuell sind ALLE Obergrenzen `bestaetigt = FALSE`, d.h. der Trigger ist **INAKTIV**

**Konsequenz:** Jeder aktive Tarif kann sofort für echte Kassenabrechnungen verwendet werden, egal ob der Preis verifiziert wurde oder nicht.

**Empfehlung:**
1. `bestaetigt`-Spalte auf `billing_tariffs` ergänzen (analog zu `billing_gesetzliche_obergrenzen`)
2. Kassenabrechnung-Engine darf nur `bestaetigt = TRUE`-Tarife verwenden
3. Alternativ: `tarifquelle`-Prüfung im Pre-Flight — `MANUELL_FREIGEGEBEN` als Warnung markieren

### BEFUND K2: price-resolver.ts filtert NICHT nach `ist_aktiv`

**Datei:** `lib/billing/core/price-resolver.ts:129-135`

```typescript
let query = supabase
    .from('billing_tariffs')
    .select('*')
    .eq('leistungsart', params.leistungsart)
    .eq('rechtsgrundlage', params.rechtsgrundlage)
    .lte('gueltig_ab', params.datum)
    .is('deleted_at', null);
    // FEHLT: .eq('ist_aktiv', true)
```

**Risiko:** Deaktivierte Tarife (`ist_aktiv = false`) könnten für Abrechnungen verwendet werden. Aktuell sind alle 23 Tarife aktiv, daher latenter Bug — aber bei zukünftiger Deaktivierung wirkungslos.

### BEFUND K3: LK18 Beratungseinsatz 75 € vs. Standard 23/33 €

**Tabelle:** `leistungspreise`, Position `lk18_beratungseinsatz_37_3`
**Wert im System:** 7500 Cent = **75,00 €**
**Gesetzlicher Standard §37.3 SGB XI:**
- Pflegegrade 1-3: **23,00 €**
- Pflegegrade 4-5: **33,00 €**

75 € liegt **weit über** dem gesetzlichen Standardwert. Das wäre nur bei einer individuellen Vergütungsvereinbarung mit Pflegekassen oder einem erweiterten Beratungseinsatz plausibel.

**Status: NICHT VERIFIZIERT** — ohne belegbare Vergütungsvereinbarung nicht erklärbar.

---

## A. BILLING_TARIFFS — 23 Einträge (vollständige Einzelprüfung)

Alle Einträge: Organization `00000000-0000-4000-8000-000460629986`, `gueltig_ab = 2026-07-19`, `ist_aktiv = true`, `deleted_at = null`.

### A.1 Kassentarife §45b SGB XI (8 Einträge)

| # | Leistungsart | Preis | Einheit | Tarifquelle | PfluV-Konformität | Status |
|---|---|---|---|---|---|---|
| 1 | alltagsbegleitung | **35,00 €/h** | Std | MANUELL_FREIGEGEBEN | Betreuung: max 30 €/h¹ | **NICHT EINDEUTIG** |
| 2 | betreuung_45a | **35,00 €/h** | Std | MANUELL_FREIGEGEBEN | Betreuung: max 30 €/h¹ | **NICHT EINDEUTIG** |
| 3 | hauswirtschaft | **35,00 €/h** | Std | MANUELL_FREIGEGEBEN | Entlastung: max 25 €/h¹ | **NICHT EINDEUTIG** |
| 4 | einkaufsservice | **35,00 €/h** | Std | MANUELL_FREIGEGEBEN | Entlastung: max 25 €/h¹ | **NICHT EINDEUTIG** |
| 5 | begleitservice | **35,00 €/h** | Std | MANUELL_FREIGEGEBEN | Entlastung: max 25 €/h¹ | **NICHT EINDEUTIG** |
| 6 | demenzbetreuung | **35,00 €/h** | Std | MANUELL_FREIGEGEBEN | Betreuung: max 30 €/h¹ | **NICHT EINDEUTIG** |
| 7 | nachtbetreuung | **35,00 €/h** | Std | MANUELL_FREIGEGEBEN | Betreuung: max 30 €/h¹ | **NICHT EINDEUTIG** |
| 8 | wochenendbetreuung | **35,00 €/h** | Std | MANUELL_FREIGEGEBEN | Betreuung: max 30 €/h¹ | **NICHT EINDEUTIG** |

¹ PfluV Hessen Obergrenzen gelten NUR für nach §45a anerkannte Dienste. §72-zugelassene Pflegedienste sind AUSGENOMMEN. Status von Alltagsengel ist unklar.

**Bewertung:** Alle 8 §45b-Tarife liegen bei einheitlich 35 €/h. Das ist intern konsistent, aber:
- Falls PfluV-anerkannt: **Betreuung** (alltagsbegleitung, betreuung_45a, demenzbetreuung, nachtbetreuung, wochenendbetreuung) überschreitet 30 €/h um 5 €
- Falls PfluV-anerkannt: **Entlastung** (hauswirtschaft, einkaufsservice, begleitservice) überschreitet 25 €/h um 10 €
- Falls §72-zugelassen: 35 €/h ist zulässig (keine PfluV-Bindung)

### A.2 Kassentarife §39 SGB XI / Verhinderungspflege (4 Einträge)

| # | Leistungsart | Preis | Einheit | Tarifquelle | Status |
|---|---|---|---|---|---|
| 9 | alltagsbegleitung | **35,00 €/h** | Std | MANUELL_FREIGEGEBEN | **PLAUSIBEL** |
| 10 | hauswirtschaft | **35,00 €/h** | Std | MANUELL_FREIGEGEBEN | **PLAUSIBEL** |
| 11 | betreuung_45a | **35,00 €/h** | Std | MANUELL_FREIGEGEBEN | **PLAUSIBEL** |
| 12 | demenzbetreuung | **35,00 €/h** | Std | MANUELL_FREIGEGEBEN | **PLAUSIBEL** |

**Bewertung:** VP-Preise unterliegen KEINER PfluV-Bindung (die PfluV reguliert nur §45b-Entlastungsleistungen). 35 €/h für VP ist marktüblich (20-45 €/h Bandbreite).

### A.3 Wegepauschalen (2 Einträge)

| # | Leistungsart | Rechtsgrundlage | Preis | Einheit | Tarifquelle | Status |
|---|---|---|---|---|---|---|
| 13 | wegepauschale | §45b SGB XI | **5,00 €** | Einsatz | MANUELL_FREIGEGEBEN | **PLAUSIBEL** |
| 14 | wegepauschale | privat | **5,00 €** | Einsatz | PRIVATE_PREISLISTE | **PLAUSIBEL** |

**Bewertung:** Laut pflege-in-hessen.de dürfen Fahrtkosten zusätzlich zu den PfluV-Obergrenzen erhoben werden. 5 €/Einsatz ist ein üblicher Wert, aber ohne Anerkennungsbescheid nicht gegen eine offizielle Quelle prüfbar.

### A.4 Privattarife (9 Einträge)

| # | Leistungsart | Preis | Einheit | Tarifquelle | Status |
|---|---|---|---|---|---|
| 15 | alltagsbegleitung | **40,00 €/h** | Std | PRIVATE_PREISLISTE | **PLAUSIBEL** |
| 16 | betreuung_45a | **40,00 €/h** | Std | PRIVATE_PREISLISTE | **PLAUSIBEL** |
| 17 | demenzbetreuung | **40,00 €/h** | Std | PRIVATE_PREISLISTE | **PLAUSIBEL** |
| 18 | hauswirtschaft | **38,00 €/h** | Std | PRIVATE_PREISLISTE | **PLAUSIBEL** |
| 19 | einkaufsservice | **40,00 €/h** | Std | PRIVATE_PREISLISTE | **PLAUSIBEL** |
| 20 | begleitservice | **40,00 €/h** | Std | PRIVATE_PREISLISTE | **PLAUSIBEL** |
| 21 | wochenendbetreuung | **40,00 €/h** | Std | PRIVATE_PREISLISTE | **PLAUSIBEL** |
| 22 | nachtbetreuung | **45,00 €/h** | Std | PRIVATE_PREISLISTE | **PLAUSIBEL** |
| 23 | sonstige | **40,00 €/h** | Std | PRIVATE_PREISLISTE | **PLAUSIBEL** |

**Bewertung:** Privattarife unterliegen keiner gesetzlichen Regulierung. Preise frei verhandelbar. Nachtbetreuung-Aufschlag (45 vs. 40 €) ist branchenüblich. Hauswirtschaft leicht unter dem Standardpreis (38 vs. 40 €) ist plausibel.

---

## B. LEISTUNGSPREISE — 24 Einträge (vollständige Einzelprüfung)

Alle Einträge: Bundesland `hessen`, Organization `00000000-0000-4000-8000-000460629986`, `gueltig_ab = 2025-01-01`.

### B.1 LK-Positionen mit Punktwert (17 Einträge) — Rechtsgrundlage: §36 SGB XI

| # | Leistungskomplex | Punkte | Preis (Cent) | Preis (EUR) | Ct/Punkt | Status |
|---|---|---|---|---|---|---|
| 1 | LK1 Kleine Körperpflege | 400 | 3214 | 32,14 | 8,0350 | **NICHT VERIFIZIERT** (intern konsistent) |
| 2 | LK2 Große Körperpflege | 510 | 4097 | 40,97 | 8,0333 | **NICHT VERIFIZIERT** (intern konsistent) |
| 3 | LK3 Große erw. Körperpflege | 610 | 4901 | 49,01 | 8,0344 | **NICHT VERIFIZIERT** (intern konsistent) |
| 4 | LK4 Lagerung | 100 | 803 | 8,03 | 8,0300 | **NICHT VERIFIZIERT** (intern konsistent) |
| 5 | LK5 Ausscheidung umfangreich | 150 | 1205 | 12,05 | 8,0333 | **NICHT VERIFIZIERT** (intern konsistent) |
| 6 | LK6 Nahrung einfach | 100 | 803 | 8,03 | 8,0300 | **NICHT VERIFIZIERT** (intern konsistent) |
| 7 | LK7 Nahrung umfangreich | 250 | 2009 | 20,09 | 8,0360 | **NICHT VERIFIZIERT** (intern konsistent) |
| 8 | LK8 Sondenkost | 150 | 1205 | 12,05 | 8,0333 | **NICHT VERIFIZIERT** (intern konsistent) |
| 9 | LK9 Aufstehen/Zu-Bett | 100 | 803 | 8,03 | 8,0300 | **NICHT VERIFIZIERT** (intern konsistent) |
| 10 | LK10 Verlassen Wohnung | 120 | 964 | 9,64 | 8,0333 | **NICHT VERIFIZIERT** (intern konsistent) |
| 11 | LK11 Mobilisation | 120 | 964 | 9,64 | 8,0333 | **NICHT VERIFIZIERT** (intern konsistent) |
| 12 | LK12 Begleitung Aktivitäten | 150 | 1205 | 12,05 | 8,0333 | **NICHT VERIFIZIERT** (intern konsistent) |
| 13 | LK13 Haushaltsführung Grundwert | 150 | 1205 | 12,05 | 8,0333 | **NICHT VERIFIZIERT** (intern konsistent) |
| 14 | LK14 Betreuung Grundwert | 300 | 2410 | 24,10 | 8,0333 | **NICHT VERIFIZIERT** (intern konsistent) |
| 15 | LK15 Anleitung Grundwert | 150 | 1205 | 12,05 | 8,0333 | **NICHT VERIFIZIERT** (intern konsistent) |
| 16 | LK16 Erstgespräch | 900 | 7231 | 72,31 | 8,0344 | **NICHT VERIFIZIERT** (intern konsistent) |
| 17 | LK17 Folgegespräch | 300 | 2410 | 24,10 | 8,0333 | **NICHT VERIFIZIERT** (intern konsistent) |

**Punktwert-Analyse:**
- Min: 8,0300 Cent/Punkt (LK4, LK6, LK9)
- Max: 8,0360 Cent/Punkt (LK7)
- Spread: 0,006 Cent/Punkt → reine Rundungsdifferenz
- **Effektiver Punktwert: 0,0803 EUR/Punkt**
- Die Differenzen entstehen durch kaufmännische Rundung auf ganze Cent (z.B. 100 × 8,0333... = 803,33... → 803 Cent)

**Verifikationsstatus:** INTERN KONSISTENT — alle 17 LK-Positionen verwenden denselben Punktwert. Ohne den offiziellen Vergütungsvertrag Hessen (Punktwertvereinbarung zwischen Pflegekassen und Pflegedienstverbänden) kann der Wert 0,0803 EUR nicht als korrekt bestätigt werden. Die Punktwerte werden landesspezifisch verhandelt und ändern sich periodisch.

### B.2 Nicht-LK-Positionen (7 Einträge)

| # | Leistungsart | Preis (Cent) | Preis (EUR) | Herkunft | Status |
|---|---|---|---|---|---|
| 18 | hauswirtschaft | 1205 | 12,05 | = 150P × Punktwert | **NICHT VERIFIZIERT** (Punktwert-konsistent) |
| 19 | hilfe_ausscheiden | 1205 | 12,05 | = 150P × Punktwert | **NICHT VERIFIZIERT** (Punktwert-konsistent) |
| 20 | kleine_koerperpflege | 3214 | 32,14 | = LK1-Duplikat (400P) | **NICHT VERIFIZIERT** (Duplikat) |
| 21 | grosse_koerperpflege | 4097 | 40,97 | = LK2-Duplikat (510P) | **NICHT VERIFIZIERT** (Duplikat) |
| 22 | entlastung_45b | 13100 | **131,00** | §45b Monatsbetrag | **VERIFIZIERT** |
| 23 | lk18_beratungseinsatz_37_3 | 7500 | **75,00** | §37.3 Beratungseinsatz | **NICHT VERIFIZIERT** |
| 24 | alltagsbegleitung_45a | 2500 | **25,00** | §45a Alltagsbegleitung | **PLAUSIBEL** |

**Einzelbewertungen:**

- **entlastung_45b = 131,00 €**: VERIFIZIERT. Exakt der gesetzliche §45b-Entlastungsbetrag seit 01.01.2025 (Dynamisierung +4,5% von 125 €). Rechtsgrundlage: §45b Abs. 1 S. 1 SGB XI i.V.m. §30 Abs. 1 SGB XI.

- **lk18_beratungseinsatz_37_3 = 75,00 €**: NICHT VERIFIZIERT. Der gesetzliche Standardwert für §37.3-Beratungseinsätze beträgt 23 € (PG 1-3) bzw. 33 € (PG 4-5). 75 € wäre nur mit individueller Vergütungsvereinbarung oder als erweiterter Beratungseinsatz erklärbar. Ohne Nachweis einer solchen Vereinbarung ist dieser Wert nicht plausibel.

- **alltagsbegleitung_45a = 25,00 €**: PLAUSIBEL. Entspricht exakt der PfluV-Obergrenze Hessen für Entlastung im Alltag (§45a Nr. 3). Könnte bewusst auf die Obergrenze gesetzt sein.

- **hauswirtschaft, hilfe_ausscheiden**: Identische Cent-Werte wie LK-Positionen mit 150 Punkten. Scheinen alternative Leistungsnamen für dieselbe Punktzahl zu sein.

- **kleine_koerperpflege, grosse_koerperpflege**: Exakte Duplikate von LK1 (400P) bzw. LK2 (510P). Vermutlich als Kurzbezeichnung für den gleichen Leistungskomplex.

---

## C. GESETZLICHE BUDGETGRENZEN

| Parameter | Wert im Code | Gesetzlicher Wert | Quelle | Status |
|---|---|---|---|---|
| §45b monatlich | 131 € | **131 €** (seit 01.01.2025) | §45b SGB XI, Dynamisierung +4,5% | **VERIFIZIERT** |
| §45b jährlich | 1.572 € | **1.572 €** (131 × 12) | §45b SGB XI | **VERIFIZIERT** |
| VP jährlich | 1.685 € | **1.685 €** (seit 01.01.2025) | §39 SGB XI, Dynamisierung +4,5% | **VERIFIZIERT** |
| KZP jährlich | 1.854 € | **1.854 €** (seit 01.01.2025) | §42 SGB XI, Dynamisierung +4,5% | **VERIFIZIERT** |
| VP+KZP §42a | 3.539 € | **3.539 €** | §42a SGB XI (seit 01.07.2025) | **VERIFIZIERT** |

---

## D. SICHERHEITSMECHANISMEN — Analyse

### D.1 Trigger `enforce_tariff_obergrenze`

- **Existiert:** Ja (Migration 20260808110000)
- **Status:** INAKTIV — alle Obergrenzen in `billing_gesetzliche_obergrenzen` stehen auf `bestaetigt = FALSE`
- **Wirkung wenn aktiv:** Verhindert INSERT/UPDATE auf `billing_tariffs` wenn `preis_cent > obergrenze_cent` (nur für Kassentarife, nicht privat)
- **Aktueller Schutz:** KEINER — der Trigger läuft, findet aber keine bestätigte Obergrenze und lässt alles durch

### D.2 Fehlende Schutzmaßnahmen

1. **Kein `bestaetigt`-Feld auf `billing_tariffs`** — Tarife können nicht als verifiziert/unverified markiert werden
2. **`price-resolver.ts` prüft `ist_aktiv` nicht** — deaktivierte Tarife könnten theoretisch verwendet werden
3. **Keine Tarifquellen-Prüfung** — `MANUELL_FREIGEGEBEN` wird behandelt wie `VERGUETUNGSVEREINBARUNG`
4. **Pre-Flight prüft nur Tarif-Existenz** — ob der Tarif verifiziert oder plausibel ist, wird nicht geprüft

### D.3 Vorhandene Schutzmaßnahmen

1. **`deleted_at`-Filter** in `price-resolver.ts` — Soft-deleted Tarife werden ausgeschlossen
2. **Gültigkeitszeitraum** (`gueltig_ab`/`gueltig_bis`) wird geprüft
3. **Spezifitäts-Score** — spezifischster Match gewinnt (Bundesland > bundesweit)
4. **Readiness-Check** in `readiness.ts` — prüft ob überhaupt aktive Tarife existieren

---

## E. GESAMTZUSAMMENFASSUNG

| Kategorie | Anzahl | VERIFIZIERT | PLAUSIBEL | NICHT VERIFIZIERT | NICHT EINDEUTIG |
|---|---|---|---|---|---|
| billing_tariffs §45b | 8 | 0 | 0 | 0 | **8** |
| billing_tariffs §39 | 4 | 0 | **4** | 0 | 0 |
| billing_tariffs Wege | 2 | 0 | **2** | 0 | 0 |
| billing_tariffs privat | 9 | 0 | **9** | 0 | 0 |
| leistungspreise LK | 17 | 0 | 0 | **17** | 0 |
| leistungspreise Sonstige | 7 | **1** | **1** | **5** | 0 |
| **GESAMT** | **47** | **1** | **16** | **22** | **8** |

**Fazit:**
- **1 von 47** Einträgen ist verifiziert (entlastung_45b = 131 €)
- **16 von 47** sind plausibel (marktübliche Preise, keine gesetzliche Gegenprüfung möglich/nötig)
- **22 von 47** sind nicht verifiziert (Punktwert/LK-Preise ohne offiziellen Vergütungsvertrag)
- **8 von 47** sind nicht eindeutig (35 €/h vs. PfluV-Obergrenzen — hängt vom §72-Status ab)

---

## F. HANDLUNGSBEDARF (priorisiert)

### P0 — Sofort

1. **§72-Zulassungsstatus klären** → bestimmt ob 35 €/h für §45b zulässig ist
2. **LK18 Beratungseinsatz 75 €** → entweder Vergütungsvereinbarung nachweisen oder auf 23/33 € korrigieren

### P1 — Vor erster echter Kassenabrechnung

3. **`bestaetigt`-Spalte auf `billing_tariffs` ergänzen** (oder tarifquelle-basierte Sperre im Code)
4. **`ist_aktiv`-Filter in `price-resolver.ts` ergänzen** (Zeile 131: `.eq('ist_aktiv', true)`)
5. **Vergütungsvertrag Hessen beschaffen** → Punktwert 0,0803 EUR verifizieren
6. **Obergrenzen bestätigen** → `bestaetigt = TRUE` setzen → Trigger wird aktiv

### P2 — Mittelfristig

7. Pre-Flight um Tarif-Verifikationsprüfung erweitern
8. Duplikate in leistungspreise bereinigen (kleine_koerperpflege = LK1, grosse_koerperpflege = LK2)

---

## Quellenverzeichnis

| # | Quelle | Geprüft am |
|---|---|---|
| 1 | §45b SGB XI — Entlastungsbetrag 131 €/Monat | 2026-08-12 |
| 2 | §39 SGB XI — VP 1.685 €/Jahr | 2026-08-12 |
| 3 | §42 SGB XI — KZP 1.854 €/Jahr | 2026-08-12 |
| 4 | §42a SGB XI — Gemeinsamer Jahresbetrag 3.539 € | 2026-08-12 |
| 5 | §37.3 SGB XI — Beratungseinsatz 23/33 € | 2026-08-12 |
| 6 | PfluV Hessen — Obergrenzen 30/25 €/h | 2026-08-12 |
| 7 | Supabase PostgREST — billing_tariffs (23 Rows) | 2026-08-12 |
| 8 | Supabase PostgREST — leistungspreise (24 Rows) | 2026-08-12 |
| 9 | Code-Analyse: price-resolver.ts, readiness.ts | 2026-08-12 |
| 10 | Migration: 20260808110000_tarifschichten_bundesland.sql | 2026-08-12 |
