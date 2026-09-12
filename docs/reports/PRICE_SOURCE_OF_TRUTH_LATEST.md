# Preise — Source of Truth

**Stand:** 12.09.2026, alle DB-Werte live abgefragt · **kein Preis geändert.**
Architektur-Wegweiser: `lib/pricing/quelle.ts` · Riegel: `__tests__/pricing/verbraucherpreise.test.ts`

---

## 0. Korrektur meiner eigenen früheren Darstellung

Ein früherer Bericht nannte „**35 € vs. 40 €**" als *den* kritischen Widerspruch.
**Das war falsch.** Live nachgesehen sind es zwei Rechtsgrundlagen, die beide gelten:

| Betrag | Rechtsgrundlage | `tarif_status` |
|---|---|---|
| **35,00 €/Std** | § 45b / § 39 SGB XI (Kasse) | **blocked** |
| **40,00 €/Std** | privat (Selbstzahler) | **verified** |

Die Kassentarife sind gesperrt, weil die § 45a-Anerkennung fehlt. Die Privattarife sind
frei. Beide Zahlen sind gleichzeitig richtig — das ist ein Zwei-Spuren-Modell, kein Fehler.
Dasselbe gilt in `service_pricing`: die drei „gleichzeitig aktiven" Zeilen für
`alltagsbegleitung` unterscheiden sich im `budget_type` (entlastung 35, verhinderung 35,
private 40), nicht im Widerspruch.

**Der echte Konflikt liegt woanders — siehe Abschnitt 3.**

---

## 1. Die fünf Quellen, nach Besitzer

| # | Quelle | Was sie besitzt | Ändern heißt |
|---|---|---|---|
| 1 | `lib/pricing/b2c-constants.ts` | B2C-Marktplatz: Kundenpreis, Engel-Vergütung, Plattformgebühr | deployen |
| 2 | `lib/config/budget-constants.ts` | gesetzliche Budgets (§ 45b, § 39, § 42, § 40) | deployen |
| 3 | `service_pricing` (DB) | Stundensatz je `service_type` × `budget_type` | DB-Zeile |
| 4 | `billing_tariffs` (DB) | Abrechnungstarif je Leistungsart × Rechtsgrundlage, mit `tarif_status` | DB-Zeile |
| 5 | `billing_gesetzliche_obergrenzen` (DB) | PfluV-Deckel Hessen, `bestaetigt` | DB-Zeile |
| (6) | `leistungspreise` (DB) | Altbestand, **durchgehend `unverified`** | sollte verschwinden |

`lib/pricing/quelle.ts` ist ab jetzt der **eine Einstieg**: die Code-Preise stehen dort
gebündelt (als Spiegel der Konstanten, nicht als Kopie — ein Test prüft das), und für die
DB-Preise steht dort, welche Tabelle sie besitzt. Wer einen Preis sucht, braucht eine
Datei statt fünf.

## 2. Matrix

| Quelle | Preis | Kontext | Live? | Verbraucher? | Muss angepasst? | Source of Truth? |
|---|---|---|---|---|---|---|
| `b2c-constants.ts` | **32 €/Std** | Kundenpreis Marktplatz (brutto) | ja | **ja** | nein | **ja** (Code) |
| `b2c-constants.ts` | **20 €/Std** | Engel-Vergütung | ja | **ja** | nein | **ja** (Code) |
| `b2c-constants.ts` | 8,5 % | Plattformgebühr | ja | nein | nein | ja |
| `b2c-constants.ts` | 35 €/Std | Rückfall der App ohne `service_pricing` | ja | nein | **prüfen** — liegt über dem PfluV-Deckel | nein |
| `budget-constants.ts` | **131 €/Monat** | Entlastungsbetrag § 45b | ja | **ja** | nein | **ja** (Gesetz) |
| `budget-constants.ts` | 1.685 / 1.854 / 3.539 €/Jahr | § 39 / § 42 / § 42a | ja | ja | nein | ja (Gesetz) |
| `budget-constants.ts` | 42 €/Monat | § 40 Pflegehilfsmittel | ja | ja | nein | ja (Gesetz) |
| `service_pricing` | 35 / 35 / 40 €/Std | alltagsbegleitung je budget_type | ja | ja | nein | **ja** (DB) |
| `service_pricing` | 35 / 38 €/Std | hauswirtschaft | ja | ja | nein | ja |
| `billing_tariffs` | 40 € (privat) · 38 € (hausw.) · 45 € (nacht) · 5 €/Einsatz (Wege) | **verified** | ja | nein | nein | **ja** |
| `billing_tariffs` | 35 € (§ 45b / § 39) | **blocked** | nein | nein | **JA** — über dem Deckel | ja |
| `billing_gesetzliche_obergrenzen` | **30 €** Betreuung · **25 €** Entlastung | PfluV Hessen, `bestaetigt` | ja | nein | nein | **ja** (Verordnung) |
| `leistungspreise` | 12,05–40,97 €, dazu 131,00 € als „entlastung_45b" | Altbestand | `unverified` | nein | **JA** | **nein** |
| `app/faq/page.tsx` | „15 und 25 €/Std" | eigene Vergütungszusage | **ja** | **ja** | **JA** | nein |
| `app/blog/nebenjob-pflege` | „18–22 €/Std" | in der **Meta-Description** | **ja** | **ja** | **JA** | nein |
| `app/blog/alltagsbegleiter-werden` | „18–24 €/Std" | Meta-Description | **ja** | **ja** | **JA** | nein |
| `anerkennung-hessen/Anlage-07` | 30,00 €/Std | Kostenübersicht **für die Behörde** | — | ja | **JA** | nein |
| vier `app/investor/**`-Seiten | ~40 €/Std, ~20 €/h Marge | Investorenprojektion gegen `lib/mis/constants.ts` (35 / 15) | ja | nein | **JA** | nein |

## 3. Der echte Konflikt — strukturell sicher, nicht zufällig

> **Die gesperrten Kassentarife stehen auf 35,00 €. Der bestätigte PfluV-Deckel liegt bei
> 30,00 € (Betreuungsangebot) und 25,00 € (Entlastungsangebot).**

Am Tag der § 45a-Anerkennung werden die Tarife freigeschaltet — und sind dann 5 bis 10 Euro
zu hoch. Nicht aus Versehen, sondern weil niemand sie vorher angepasst hat. Eine Leistung
über dem Deckel ist **nicht abrechenbar**.

Es gibt zwei Riegel (DB-Trigger `enforce_tariff_obergrenze`, Modul
`lib/billing/obergrenzen.ts`), die das im Moment der Abrechnung abfangen. Sie verhindern
den Schaden, lösen aber nicht die Ursache: dann steht die Leistung erbracht und nicht
abrechenbar da.

**Dazu passend:** `NATIVE_FALLBACK_HOURLY_RATE = 35` in `b2c-constants.ts` — der Wert, den
die App nimmt, wenn `service_pricing` nichts liefert. Liegt ebenfalls über dem Deckel.

## 4. Verbrauchergerichtete Widersprüche

Drei **live ausgelieferte** Aussagen über unsere eigene Vergütung, drei verschiedene
Spannen, keine davon 20 €:

| Stelle | Aussage | Besonderheit |
|---|---|---|
| `app/faq/page.tsx` | „Die Vergütung liegt zwischen **15 und 25 €** pro Stunde" | eigene Zusage |
| `app/blog/nebenjob-pflege/page.tsx` | „**18–22 €** pro Stunde … bei Alltagsengel als Helfer starten" | steht in der **Meta-Description**, also im Suchergebnis |
| `app/blog/alltagsbegleiter-werden/page.tsx` | „Gehalt von **18–24 €**/Stunde" | Meta-Description |

**Ausdrücklich kein Widerspruch:** Im Fließtext von `alltagsbegleiter-werden` stehen
Marktangaben zu *anderen* Anbietern (14–18 € angestellt, 15–25 € privat organisiert). Das
sind Aussagen über den Markt, nicht über unser Angebot, und sie sind zulässig. Ein Prüfer,
der solche Sätze anmahnt, wird nach dem dritten Fehlalarm abgeschaltet — deshalb
unterscheidet der Riegel danach, ob eine Selbstbezeichnung in der Nähe steht.

## 5. Was gebaut wurde — und was ausdrücklich nicht

**Gebaut:**
* `lib/pricing/quelle.ts` — ein Einstieg, Besitzer je Preisart, Wegweiser statt Kopie
* `__tests__/pricing/verbraucherpreise.test.ts` — 10 Fälle. Der Bestand der drei
  Abweichungen ist **eingefroren und begründet**; eine **vierte** macht den Lauf rot.
  Mit Detektor in beide Richtungen: eine erfundene Eigenaussage fällt auf, eine reine
  Marktangabe nicht.

**Nicht getan:** kein Preis geändert, keine Entscheidung getroffen. Der Riegel macht die
Divergenz zählbar, ohne sie zu beseitigen — das ist genau die Grenze, die der Auftrag zieht.

Beim Bau ist mir das Muster einmal um die Ohren geflogen: Es verlangte „bis" oder „–"
zwischen den Zahlen, die FAQ schreibt aber „zwischen 15 **und** 25 €". Zwei von drei
bekannten Stellen wurden gefunden, die dritte nicht — aufgefallen nur, weil ein zweiter
Test den Bestand gegenzählt. Ein Prüfer, der seinen eigenen Katalog nicht wiederfindet,
ist die unauffälligste Art, falsche Sicherheit zu erzeugen.

## 6. BUSINESS_DECISION_REQUIRED

| # | Entscheidung | Dringlichkeit |
|---|---|---|
| 1 | **Kassentarife auf ≤ 30 / 25 €** anpassen | **vor** der Anerkennung — sonst nicht abrechenbar |
| 2 | **Eine Vergütungsaussage** festlegen (20 €, oder eine Spanne, dann überall dieselbe) | hoch — drei Varianten live, zwei im Suchergebnis |
| 3 | **30,00 €/Std in Anlage-07** | hoch — geht mit dem Antrag an die Behörde |
| 4 | Investorenseiten: 35 oder 40 €/h | mittel — zeigt nach außen |
| 5 | `NATIVE_FALLBACK_HOURLY_RATE` auf einen Wert unter dem Deckel | mittel |
| 6 | `leistungspreise` stilllegen oder verifizieren | niedrig — heute nirgends führend |
