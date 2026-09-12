# PRICE_COMPLIANCE_MATRIX — Alltagsengel UG

**Stand:** 12.09.2026
**Zweck:** Compliance-Pruefung aller Leistungen gegen §45a/§45b SGB XI und PfluV Hessen
**Referenz:** PRICE_SOURCE_OF_TRUTH.md (kanonisch)

---

## Rechtsrahmen

### Bundesrecht
- **§45a SGB XI:** Angebote zur Unterstuetzung im Alltag — Anerkennung durch Landesbehoerde erforderlich
- **§45b SGB XI:** Entlastungsbetrag — 131 EUR/Monat (ab 01.01.2025, PUEG), 1.572 EUR/Jahr
- **Pflegegrad 1–5:** Anspruch auf Entlastungsbetrag bei haeuslicher Pflege

### Landesrecht Hessen
- **PfluV Hessen** (Pflegeunterstuetzungsverordnung vom 25.04.2018, befristet bis Ende 2026)
- **Anbieterformen:** I (gemeinnuetzig), II (gewerblich/selbstaendig), III (Einzelpersonen im Arbeitsverhaeltnis)
- **Qualifikation:** Basisqualifikation 30 UE nach §5 PfluV oder 20 UE + Erste-Hilfe-Kurs
- **Zustaendige Behoerde Frankfurt:** Magistrat der Stadt Frankfurt am Main

### Quellen
- PfluV Hessen Volltext: https://www.dvlab.de/hessen/pdf/PfluV_mit_Begruendung.pdf
- Hessenrecht: https://www.rv.hessenrecht.hessen.de/bshe/document/jlr-UntAngVHErahmen
- Frankfurt.de Anerkennung: https://frankfurt.de/themen/soziales-und-gesellschaft/pflege/anerkennung-und-foerderung-von-angeboten-zur-unterstuetzung-im-alltag
- Pflege-in-Hessen Anbieterinfo: https://www.pflege-in-hessen.de/formen-der-pflege/pflege-zuhause/haeufig-gestellte-fragen/informationen-fuer-anbieterinnen-und-anbieter/

---

## Alltagsengel-Status

| Kriterium | Status | Anmerkung |
|-----------|--------|-----------|
| §45a-Anerkennung | **AUSSTEHEND** | Anerkennungsverfahren laeuft |
| Anbieterform | II (gewerblich) | Alltagsengel UG |
| Kassenabrechnung moeglich | **NEIN** | Erst nach Anerkennung |
| Entlastungsbetrag abrechenbar | **NEIN** | Erst nach Anerkennung |

---

## Leistungs-Compliance-Matrix

### §45a-relevante Leistungen (nach Anerkennung ueber Entlastungsbetrag abrechenbar)

| Leistung | PfluV-Kategorie | §45a relevant? | Max. zulaessiger Preis (PfluV Hessen) | Aktueller Privatpreis | Fahrtkosten | Werbeaussage "abrechenbar" erlaubt? | Quelle |
|----------|-----------------|----------------|----------------------------------------|-----------------------|-------------|-------------------------------------|--------|
| Alltagsbegleitung | Betreuung/Pflegeentlastung (Nr. 2) | JA | 30 EUR/Std (inkl. MwSt) | Noch nicht veroeffentlicht | Nicht definiert | **NEIN** — nur "im Anerkennungsverfahren" | PfluV §8 Abs. 1 Nr. 2 |
| Arztbegleitung | Betreuung/Pflegeentlastung (Nr. 2) | JA | 30 EUR/Std (inkl. MwSt) | Noch nicht veroeffentlicht | Nicht definiert | **NEIN** — nur "im Anerkennungsverfahren" | PfluV §8 Abs. 1 Nr. 2 |
| Einkaufsbegleitung | Betreuung/Pflegeentlastung (Nr. 2) | JA | 30 EUR/Std (inkl. MwSt) | Noch nicht veroeffentlicht | Nicht definiert | **NEIN** — nur "im Anerkennungsverfahren" | PfluV §8 Abs. 1 Nr. 2 |
| Spaziergaenge / Gesellschaft | Betreuung/Pflegeentlastung (Nr. 2) | JA | 30 EUR/Std (inkl. MwSt) | Noch nicht veroeffentlicht | Nicht definiert | **NEIN** — nur "im Anerkennungsverfahren" | PfluV §8 Abs. 1 Nr. 2 |
| Haushaltshilfe (Putzen, Kochen) | Hauswirtschaft/Alltag (Nr. 3) | JA | 25 EUR/Std (inkl. MwSt) | Noch nicht veroeffentlicht | Nicht definiert | **NEIN** — nur "im Anerkennungsverfahren" | PfluV §8 Abs. 1 Nr. 3 |
| Organisatorische Hilfe (Termine, Formulare) | Betreuung/Pflegeentlastung (Nr. 2) | JA | 30 EUR/Std (inkl. MwSt) | Noch nicht veroeffentlicht | Nicht definiert | **NEIN** — nur "im Anerkennungsverfahren" | PfluV §8 Abs. 1 Nr. 2 |

### Private Zusatzleistungen (NICHT ueber §45a/Entlastungsbetrag abrechenbar)

| Leistung | PfluV-Kategorie | §45a relevant? | Max. zulaessiger Preis | Privatpreis | Fahrtkosten | Werbeaussage "abrechenbar" erlaubt? | Quelle |
|----------|-----------------|----------------|------------------------|-------------|-------------|-------------------------------------|--------|
| Krankenfahrten (Liegend/Sitzend) | Keine — §60 SGB V | NEIN | Marktpreis / Kassen-Verhandlung | Lt. kf_pricing_tiers | Lt. kf_pricing_config | Nicht relevant (andere Rechtsgrundlage) | SGB V |
| Pflegehilfsmittel-Versand (Hygienebox) | Keine — §40 SGB XI | NEIN | 42 EUR/Monat (Pauschale) | Pauschale | Entfaellt (Versand) | Nicht relevant (§40-Pauschale) | §40 SGB XI |

---

## Preisobergrenzen-Abgleich: PfluV vs. aktuelle Konfiguration

| Preispunkt | PfluV-Obergrenze | Aktuelle Config | Differenz | Handlungsbedarf |
|------------|-------------------|-----------------|-----------|-----------------|
| Betreuung (Nr. 2) | 30 EUR/Std | 35 EUR/Std (billing_tariffs) | +5 EUR | **VOR Freischaltung senken** |
| Hauswirtschaft (Nr. 3) | 25 EUR/Std | 35 EUR/Std (billing_tariffs) | +10 EUR | **VOR Freischaltung senken** |
| Kunden-Stundensatz (B2C) | — (privat) | 32 EUR/h | n/a | Nur fuer Privatmarkt relevant |
| Engel-Stundenlohn | — (intern) | 20 EUR/h | n/a | Kein externer Compliance-Bedarf |

**KRITISCH:** Die billing_tariffs muessen VOR der §45a-Freischaltung auf die PfluV-Obergrenzen angepasst werden (30 EUR bzw. 25 EUR). Aktueller Status: `blocked`.

---

## Marketing-Werbeaussagen: Was ist erlaubt?

### ERLAUBT in Marketing-Content

| Aussage | Bedingung |
|---------|-----------|
| "131 EUR Entlastungsbetrag pro Monat" | Allgemeine Information, kein Bezug zu Alltagsengel-Abrechnung |
| "Alltagsbegleitung nach §45a SGB XI" | Beschreibung der Leistungsart |
| "Im Anerkennungsverfahren" | Pflichthinweis bei Entlastungsbetrag-Bezug |
| "Ab Pflegegrad 1" | Allgemeine Info ueber Anspruchsvoraussetzung |
| "Faire Bezahlung" (Recruiting) | Ohne konkreten Betrag |
| "538 EUR Minijob-Grenze" (Recruiting) | Allgemeine Steuerinformation |
| "Flexible Arbeitszeiten" | Ohne Stundenangabe |

### VERBOTEN in Marketing-Content

| Aussage | Grund |
|---------|-------|
| "Bereits anerkannt nach §45a" | Falsch — Verfahren laeuft |
| "Kostenlos ueber den Entlastungsbetrag" | Falsch — Anerkennung fehlt |
| "0 EUR Eigenanteil" | Falsch — noch nicht abrechenbar |
| "Wir rechnen mit der Pflegekasse ab" | Falsch — keine Anerkennung |
| "Buchbar ueber den Entlastungsbetrag" | Falsch — keine Anerkennung |
| "Bei uns ueber §45b abrechenbar" | Falsch — keine Anerkennung |
| "Garantiert abrechenbar" | Falsch — keine Anerkennung |
| Konkrete Stundensaetze (Kunden oder Engel) | Geschaeftsfuehrung hat noch nicht entschieden |
| "20 EUR pro Stunde" in Recruiting-Posts | Gesperrt bis Klaerung (12–20 EUR Spanne) |
| "125 EUR" ohne historischen Kontext | Alter Wert — forbidden-strings.json |

### Pflichthinweis bei Entlastungsbetrag-Bezug

> Alltagsengel befindet sich aktuell im Anerkennungsverfahren. Nach erfolgter Anerkennung koennen berechtigte Pflegebeduerftige Leistungen ueber den Entlastungsbetrag (bis zu 131 EUR/Monat) nach §45b SGB XI abrechnen.

---

## Entlastungsbetrag — Kurzuebersicht

| Eigenschaft | Wert |
|-------------|------|
| Hoehe (ab 2025) | 131 EUR/Monat |
| Jaehrlich | 1.572 EUR |
| Anspruch ab | Pflegegrad 1 |
| Voraussetzung | Haeusliche Pflege |
| Zweckbindung | Anerkannte Angebote nach §45a |
| Ansammlung | Bis 30.06. des Folgejahres |
| Rechtsgrundlage Erhoehung | PUEG (01.07.2023), wirksam ab 01.01.2025 |

---

## Offene Punkte (Geschaeftsfuehrung)

1. **Tarife auf PfluV-Obergrenzen anpassen** (30/25 EUR) — VOR Freischaltung
2. **Billing Rate klaeren** (35 vs. 40 EUR/h) — Investor-Seiten vs. Code
3. **Recruiting-Stundenlohn vereinheitlichen** (12–18 vs. 20 EUR/h)
4. **Fahrtkosten-Regelung fuer §45a-Leistungen** definieren
5. **Stundensaetze in Marketing** — ja/nein Entscheidung

---

*Dokument erstellt: 12.09.2026*
*Alltagsengel UG — info@alltagsengel.care*
*Referenz: PRICE_SOURCE_OF_TRUTH.md | PfluV Hessen | §45a/§45b SGB XI*
