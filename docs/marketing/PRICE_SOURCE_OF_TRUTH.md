# PRICE_SOURCE_OF_TRUTH — Alltagsengel UG

**Stand:** 12.09.2026
**Zweck:** Kanonischer Referenzpunkt fuer ALLE Preisangaben im Projekt
**Regel:** Keine neuen Preise veroeffentlichen, bis die Geschaeftsfuehrung entscheidet.

---

## 1. Kanonischer Konfigurationspunkt

### Entlastungsbetrag (§45b SGB XI)

**Source of Truth:** `lib/config/budget-constants.ts`

| Zeitraum | Monatlich | Jaehrlich |
|----------|-----------|-----------|
| bis 2024 | 125 EUR | 1.500 EUR |
| ab 2025 (aktuell) | **131 EUR** | **1.572 EUR** |

**ACHTUNG:** In ALLEN oeffentlichen Texten, Social-Media-Posts, Flyern und Webseiten ist **131 EUR** zu verwenden. Der alte Wert 125 EUR darf NUR in historischem Kontext erscheinen ("zuvor 125 EUR, jetzt 131 EUR").

Der Wert 125 EUR ist in `scripts/forbidden-strings.json` als verbotene Zeichenkette hinterlegt ("125 EUR/Monat" ohne historischen Kontext wird blockiert).

### Stundensaetze

**Source of Truth:** `lib/pricing/b2c-constants.ts` (B2C) + `lib/mis/constants.ts` (MIS/Investor)

| Komponente | Wert | Quelle |
|------------|------|--------|
| Engel-Stundenlohn | 20 EUR/h | `lib/pricing/b2c-constants.ts` → ENGEL_HOURLY_RATE |
| Kunden-Stundensatz (B2C) | 32 EUR/h | `lib/pricing/b2c-constants.ts` → CUSTOMER_HOURLY_RATE |
| Plattform-Gebuehr | 8,5% | `lib/pricing/b2c-constants.ts` → PLATFORM_FEE_FACTOR |
| MIS Billing Rate | 35 EUR/h | `lib/mis/constants.ts` → billingRatePerHour |
| MIS Marge/h | 15 EUR/h (43%) | `lib/mis/constants.ts` → marginPerHour |

### PfluV Hessen — Preisobergrenzen (§45a)

| Leistungstyp | Max. Stundensatz |
|-------------|-----------------|
| Betreuung/Pflegeentlastung (Nr. 2) | 30 EUR/Std |
| Hauswirtschaft/Alltag (Nr. 3) | 25 EUR/Std |

### NRW — Preisobergrenzen (Expansion)

| Leistungstyp | Richtwert | Maximum |
|-------------|-----------|---------|
| Einzelleistung | 37,50 EUR/Std | 39,50 EUR/Std |
| Betreuungsgruppe ganztags | 100 EUR/Tag | 108 EUR/Tag |
| Betreuungsgruppe stundenweise | 20 EUR/Std | 22 EUR/Std |

### Weitere Budgets (§39/§42)

**Source of Truth:** `lib/config/budget-constants.ts`

| Budget | Monatlich (ab 2025) |
|--------|---------------------|
| Verhinderungspflege (§39) | 1.685 EUR/Jahr |
| Kurzzeitpflege (§42) | 1.854 EUR/Jahr |
| Kombiniert (§42a) | 3.539 EUR/Jahr |
| Pflegehilfsmittel (§40) | 42 EUR/Monat |

### Minijob-Grenze

| Wert | Kontext |
|------|---------|
| 538 EUR/Monat | Steuerfrei, nur in Recruiting-Content verwenden |

---

## 2. Identifizierte Widersprueche

### KRITISCH: Investor-Seiten vs. MIS-Konstanten

| Quelle | Billing Rate | Marge/h | Marge% | Marge/Kunde/Monat |
|--------|-------------|---------|--------|-------------------|
| `lib/mis/constants.ts` | 35 EUR/h | 15 EUR/h | 43% | 45 EUR |
| `app/investor/en/market-analysis/` | ~40 EUR/h | ~20 EUR/h | ~50% | — |
| `app/investor/en/financial-projections/` | ~40 EUR/h | ~20 EUR/h | ~50% | 65 EUR |
| `app/investor/en/executive-summary/` | 35–40 EUR/h | ~20 EUR/h | ~50% | — |
| `app/investor/finanzplan/` | ~40 EUR/h | — | — | ~65 EUR |

**Betroffene Dateien:**
- `app/investor/en/market-analysis/page.tsx` (Zeile ~134)
- `app/investor/en/financial-projections/page.tsx` (Zeile ~18)
- `app/investor/en/executive-summary/page.tsx` (Zeile ~126)
- `app/investor/finanzplan/page.tsx` (Zeile ~83)

**Handlungsbedarf:** Geschaeftsfuehrung muss entscheiden, welcher Wert korrekt ist (35 oder 40 EUR/h). Danach alle Stellen vereinheitlichen.

### MODERAT: Billing-Tarife vs. PfluV-Obergrenzen

Die `billing_tariffs` Tabelle hat §45b-Tarife bei **35 EUR/h** konfiguriert. Die PfluV Hessen setzt Obergrenzen bei **30 EUR/h** (Betreuung) bzw. **25 EUR/h** (Hauswirtschaft).

**Status:** Tarife sind `blocked` (§45a-Anerkennung ausstehend). Vor Freischaltung MUSS die Preisstruktur an die PfluV-Obergrenzen angepasst werden.

**Betroffene Stelle:** `docs/FINALER_RESTSTATUS.md` (Zeile ~78) dokumentiert dies bereits.

### GERING: Recruiting-Texte mit abweichendem Stundenlohn

| Quelle | Engel-Stundenlohn |
|--------|-------------------|
| Alle Code-Dateien | 20 EUR/h |
| Blog-Erfahrungsbericht | 20 EUR/h |
| Stellenanzeigen (allgemein) | 20 EUR/h |
| Werbung-Mai-2026 / Jobcenter-Mailings | 12–18 EUR/Std + Trinkgeld |

**Handlungsbedarf:** Klaeren, ob die 12–18 EUR eine andere Verguetungsstruktur darstellen (z.B. ohne Plattform-Anteil) oder ein Fehler sind.

### GERING: Audit-Dokument mit altem Entlastungsbetrag

- `audit/TARIF_DATEN_MATRIX_2026-08-10.md` (Zeile ~33): "Entlastungsleistungen (125 EUR/Monat)" — ohne historische Einordnung.
- **Handlungsbedarf:** Korrigieren auf 131 EUR oder als historisch markieren.

### GERING: Pflegehilfsmittel (§40)

- Alle oeffentlichen Seiten: korrekt **42 EUR/Monat**
- `app/admin/verordnungen/page.tsx` (Zeile ~1185): "bis 40 EUR/Monat" (alter Wert)
- **Handlungsbedarf:** Admin-Text auf 42 EUR aktualisieren.

---

## 3. Regeln fuer neue Preisangaben

1. **KEINE neuen Preise in Marketing-Content** veroeffentlichen, bis die Geschaeftsfuehrung die Widersprueche geloest hat.

2. **Erlaubt in Marketing-Content:**
   - 131 EUR Entlastungsbetrag (allgemeine Info, nicht als "bei uns abrechenbar")
   - 538 EUR Minijob-Grenze (nur Recruiting)
   - "Faire Bezahlung" (ohne konkreten Betrag)
   - "Flexible Arbeitszeiten" (ohne Stundenangabe)

3. **VERBOTEN in Marketing-Content:**
   - Konkrete Stundensaetze (weder fuer Kunden noch fuer Engel)
   - "20 EUR pro Stunde" in oeffentlichen Posts
   - "Kostenlos" oder "0 EUR Eigenanteil" (da §45a noch nicht erteilt)
   - Jegliche Preise, die nicht in diesem Dokument stehen

4. **Aenderungen an Preisen:** Nur durch Aenderung in der jeweiligen Source-of-Truth-Datei (siehe Tabelle oben). Danach alle abhaengigen Stellen aktualisieren. Kein Hardcoden von Preisen in Marketingtexten.

---

## 4. Offene Entscheidungen (Geschaeftsfuehrung)

| # | Thema | Optionen | Auswirkung |
|---|-------|----------|------------|
| 1 | Billing Rate: 35 oder 40 EUR/h? | A: 35 EUR (MIS) / B: 40 EUR (Investor) | Investor-Seiten oder Code anpassen |
| 2 | Marge: 43% oder 50%? | A: 43% (Code) / B: 50% (Investor) | Finanzmodell + Investor-Seiten |
| 3 | PfluV-Obergrenzen vs. Tarife | Tarife auf 30/25 EUR senken? | Billing-Tabelle vor §45a-Freischaltung |
| 4 | Recruiting-Stundenlohn: 12–18 oder 20 EUR? | Klaeren und vereinheitlichen | Werbematerial aktualisieren |
| 5 | Stundensaetze in Marketing erwaehnen? | Ja/Nein | Content-Richtlinie anpassen |

---

*Dokument erstellt: 12.09.2026*
*Alltagsengel UG — info@alltagsengel.care*
*Dieses Dokument ist die kanonische Preisreferenz. Alle anderen Preisangaben muessen hiermit konsistent sein.*
