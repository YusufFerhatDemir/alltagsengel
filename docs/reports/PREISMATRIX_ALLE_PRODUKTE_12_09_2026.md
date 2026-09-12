# Preismatrix — Alltagsengel · ChairMatch · efy care

**Stand:** 12.09.2026 · **Dieses Dokument ändert keinen einzigen Preis.**
Es sagt je Zahl: woher sie kommt, wo sie steht, was sie ist, ob sie einer anderen
widerspricht, und wer entscheiden muss.

---

## Lesehilfe

| Spalte | Bedeutung |
|---|---|
| **SOURCE** | Wer die Zahl setzt — Gesetz/Verordnung, Code-Konstante, Datenbank, Marketingtext |
| **LOCATION** | Die eine Stelle, an der sie steht |
| **CURRENT_VALUE** | Der heute geltende Wert |
| **CONFLICT?** | Gibt es eine zweite Stelle mit einem anderen Wert? |
| **DECISION?** | Braucht es eine Entscheidung der Geschäftsführung? |

---

## A · Alltagsengel — gesetzliche Budgets

Diese Werte sind **nicht verhandelbar**: sie stehen im SGB XI. Sie dürfen nur nachgeführt,
nie entschieden werden.

| Größe | SOURCE | LOCATION | CURRENT_VALUE | CONFLICT? | DECISION? |
|---|---|---|---|---|---|
| Entlastungsbetrag § 45b | SGB XI (ab 2025) | `lib/config/budget-constants.ts` | **131 €/Monat · 1.572 €/Jahr** | **ja** — `audit/TARIF_DATEN_MATRIX_2026-08-10.md` nennt 125 € ohne historische Einordnung | nein — nachführen |
| Verhinderungspflege § 39 | SGB XI | `lib/config/budget-constants.ts` | 1.685 €/Jahr | nein | nein |
| Kurzzeitpflege § 42 | SGB XI | `lib/config/budget-constants.ts` | 1.854 €/Jahr | nein | nein |
| Kombiniert § 42a | SGB XI | `lib/config/budget-constants.ts` | 3.539 €/Jahr | nein | nein |
| Pflegehilfsmittel § 40 | SGB XI | `lib/config/budget-constants.ts` | **42 €/Monat** | **ja** — `app/admin/verordnungen/page.tsx` ~Z. 1185 nennt „bis 40 €/Monat" (alter Wert) | nein — nachführen |
| Minijob-Grenze | SGB IV | Recruiting-Texte | 538 €/Monat | nein | nein |

**Der 125-€-Wert ist als verbotene Zeichenkette hinterlegt** (`scripts/forbidden-strings.json`)
und wird von `npm run lint:45a` zusätzlich als Regel `veralteter-betrag` geprüft — beide
liefen am 12.09.2026 mit 0 Befunden über 1.600 Dateien.

## B · Alltagsengel — eigene Preise

| Größe | SOURCE | LOCATION | CURRENT_VALUE | CONFLICT? | DECISION? |
|---|---|---|---|---|---|
| Engel-Stundenlohn | Code | `lib/pricing/b2c-constants.ts` → `ENGEL_HOURLY_RATE` | 20 €/h | **ja** — Werbung Mai 2026 und Jobcenter-Mailings nennen 12–18 €/Std. + Trinkgeld | **ja** — ist das eine andere Vergütungsstruktur oder ein Fehler? |
| Kundenstundensatz B2C | Code | `lib/pricing/b2c-constants.ts` → `CUSTOMER_HOURLY_RATE` | 32 €/h | nein | nein |
| Plattformgebühr | Code | `lib/pricing/b2c-constants.ts` → `PLATFORM_FEE_FACTOR` | 8,5 % | nein | nein |
| **MIS Billing Rate** | Code | `lib/mis/constants.ts` → `billingRatePerHour` | **35 €/h** | **ja — vier Investorenseiten** | **JA — die teuerste offene Entscheidung** |
| MIS Marge/h | Code | `lib/mis/constants.ts` → `marginPerHour` | 15 €/h (43 %) | ja — Investorenseiten nennen ~20 €/h (~50 %) | ja, folgt aus der Rate |
| Leistungs-/Kostenübersicht § 45a | PDF | `anerkennung-hessen/Anlage-07-…` | **30,00 €/Std.** | offen gegen 35 €/h der Tarife | **ja** — geht an die Behörde |

### Der Widerspruch 35 € vs. 40 € — vollständig

| Stelle | Rate | Marge/h | Marge % | Marge/Kunde/Monat |
|---|---|---|---|---|
| `lib/mis/constants.ts` (kanonisch) | **35 €/h** | 15 €/h | 43 % | 45 € |
| `app/investor/en/market-analysis/page.tsx` ~Z. 134 | ~40 €/h | ~20 €/h | ~50 % | — |
| `app/investor/en/financial-projections/page.tsx` ~Z. 18 | ~40 €/h | ~20 €/h | ~50 % | 65 € |
| `app/investor/en/executive-summary/page.tsx` ~Z. 126 | 35–40 €/h | ~20 €/h | ~50 % | — |
| `app/investor/finanzplan/page.tsx` ~Z. 83 | ~40 €/h | — | — | ~65 € |

**BUSINESS_DECISION_REQUIRED.** Das ist der einzige Widerspruch, der **nach außen** zeigt —
an Investoren. Solange er offen ist, darf keine dieser Zahlen in neues Material.

## C · Alltagsengel — regulatorische Obergrenzen

Nicht unsere Preise, sondern Deckel darüber. Werden sie überschritten, ist die Leistung
nicht abrechenbar — unabhängig davon, was vereinbart wurde.

| Land | Leistungstyp | Obergrenze | Status |
|---|---|---|---|
| **Hessen (PfluV)** | Betreuung/Pflegeentlastung (Nr. 2) | **30 €/Std.** | bindend nach Anerkennung |
| **Hessen (PfluV)** | Hauswirtschaft/Alltag (Nr. 3) | **25 €/Std.** | bindend nach Anerkennung |
| NRW | Einzelleistung | 37,50 €/Std. (max. 39,50) | Expansion |
| NRW | Betreuungsgruppe ganztags | 100 €/Tag (max. 108) | Expansion |
| NRW | Betreuungsgruppe stundenweise | 20 €/Std. (max. 22) | Expansion |

**KONFLIKT, der vor der Freischaltung gelöst sein muss:** `billing_tariffs` führt
§ 45b-Tarife bei **35 €/h**. Die PfluV Hessen deckelt bei **30 €/h**. Die Tarife stehen
deshalb auf `blocked`; der DB-Trigger aus Migration `20261017000002` trennt 30 und 25 EUR
über `angebotstyp`. Vor der Freischaltung **muss** die Preisstruktur angepasst werden —
sonst entstehen nicht abrechenbare Leistungen.

## D · ChairMatch

Eigenes Inventar, erzeugt aus `src/lib/pricing/price-audit.ts`
(`npm run price-audit`, Gegenprobe `npm run price-audit:check`), dokumentiert in
`chairmatch/docs/PRICE_SOURCE_OF_TRUTH.md`.

| Gruppe | Literale | SOURCE | DECISION? |
|---|---:|---|---|
| Marktbehauptungen | **1.087** (88 %), davon 972 in `src/lib/seo-data/` | Marketingtext **ohne Quelle im Repo** | ja — als Marktwissen dargestellt, unbelegt |
| Heilbehandlungspreise | 93 (8 %) | Code | **ja — Zusagen an einzelne Menschen** |
| Ertragserwartungen | 29 (2 %) | Code | **ja — höchste Fallhöhe** |
| Eigene Produktpreise | 9 (< 1 %) | Code statt Datenbank | **ja** |
| Sonstiges / Testdaten | 22 | intern | nein |
| **Gesamt** | **1.240** | | |

**Die Regel dort:** Ein Preis gehört in die Datenbank. Steht eine Zahl im Quelltext, wurde
sie dort beiläufig entschieden. Nach Fallhöhe sind die Gruppen Ertragserwartungen,
Heilbehandlungspreise und eigene Produktpreise zuerst dran — nicht die 1.087
Marketingzahlen.

## E · efy care

| Größe | SOURCE | LOCATION | CURRENT_VALUE | CONFLICT? | DECISION? |
|---|---|---|---|---|---|
| Leistungspreise | **Datenbank** | Tabelle `leistungspreise` (`leistungsart`, `preis_cent`) | laufzeitabhängig | nein | nein |
| Preis-Literale im Quelltext | — | `app/src/**` | **1** | nein | nein |

**efy care ist das sauberste der drei Produkte:** genau ein Preisliteral im gesamten
Anwendungscode, alles andere kommt zur Laufzeit aus der Datenbank. Das ist genau das
Muster, das ChairMatch anstrebt und Alltagsengel bei den Tarifen bereits hat.

*Einschränkung: Der Live-Bestand von `leistungspreise` wurde aus dieser Sitzung heraus
nicht abgefragt — das ist ein eigenes Supabase-Projekt. Die Aussage betrifft den Code.*

---

## Zusammenfassung — was entschieden werden muss

| # | Entscheidung | Wirkung | Dringlichkeit |
|---|---|---|---|
| 1 | **35 €/h oder 40 €/h** (MIS-Rate) | Vier Investorenseiten widersprechen der Code-Konstante | **hoch** — zeigt nach außen |
| 2 | **Tarifstruktur an PfluV anpassen** (35 → ≤ 30/25 €/h) | Ohne Anpassung entstehen nach der Anerkennung nicht abrechenbare Leistungen | **hoch** — Blocker für Freischaltung |
| 3 | **30,00 €/Std. in Anlage-07** | Steht in einem Behördendokument | **hoch** — geht mit dem Antrag raus |
| 4 | **12–18 €/Std. im Recruiting-Altmaterial** | Widerspricht 20 €/h im Code | mittel |
| 5 | ChairMatch: Ertragserwartungen und Heilbehandlungspreise | 122 Literale, Zusagen an Menschen | mittel |
| 6 | ChairMatch: 1.087 unbelegte Marktzahlen | Als Marktwissen dargestellt, ohne Quelle | mittel |

## Was **keine** Entscheidung braucht

Nachführen, nicht entscheiden: 125 € → 131 € in `audit/TARIF_DATEN_MATRIX_2026-08-10.md`
(oder als historisch markieren), und 40 € → 42 € in `app/admin/verordnungen/page.tsx`.
Beides sind gesetzliche Werte, die sich geändert haben.
