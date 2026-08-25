# Geldrundung — vollständige Durchsicht (Track 2)

Stand: 2026-08-25 · Vorlauf: Phase-6A-Report (3 dokumentierte Reststellen)

Diese Datei ist das Protokoll einer **vollständigen** Durchsicht aller
`Math.round(`-, `toFixed(`- und `parseFloat(`-Stellen in `app/`, `lib/` und
`scripts/`. Sie hält beides fest: was umgestellt wurde **und was bewusst
stehen bleibt**. Der zweite Teil ist der wichtigere — ohne ihn wird die
nächste Durchsicht dieselben 60 Fundstellen noch einmal einzeln prüfen.

Der zentrale Konverter ist `lib/geld.ts`. Die Begründung, warum
`Math.round(x * 100)` falsch ist und warum `+ Number.EPSILON` es nicht
repariert, steht dort im Kopfkommentar und wird hier nicht wiederholt.

---

## 1. Zwei getrennte Fehlerbilder

Die Durchsicht unterscheidet konsequent zwei Fälle. Sie brauchen
verschiedene Helfer, und wer sie vermischt, ändert Stellen ohne Wirkung.

### (A) EURO → CENT — die Kommaverschiebung

`Math.round(betrag * 100)` auf einem **Euro**-Wert. Der exakte halbe Cent
fällt in IEEE-754 nach unten: `1.005 * 100` ist `100.49999999999999`.

→ **`euroZuCent()`** / **`aufCent()`** (verschieben das Komma auf der
Dezimal-Zeichenkette).

### (B) CENT-Zwischenergebnis — die Asymmetrie

`Math.round(cent)` auf einem Wert, der **schon in Cent** gerechnet ist
(Einzelpreis × Menge, Zuschlag, Gesamtpreis / Menge). Die
Kommaverschiebung hilft hier nichts. Was bleibt, ist:
`Math.round(100.5) = 101`, aber `Math.round(-100.5) = -100`.

Auf einer **Gutschrift**, einer **Storno-Position** oder einer
**Rücklastschrift** steht damit ein Cent weniger als auf der Rechnung, die
sie ausgleichen soll — die Position gleicht sich nicht auf null aus.

→ **`centRunden()`** (neu in `lib/geld.ts`, rundet symmetrisch, DIN 1333).

---

## 2. Geänderte Stellen

### 2.1 Die drei aus dem Phase-6A-Report

| Datei | vorher | nachher | Fall |
|---|---|---|---|
| `lib/billing/camt/camt-parser.ts` (`betragToCent`) | `Math.round(n * 100)` | `euroZuCent(roh)` | A |
| `app/admin/gutschriften/page.tsx` (`parseEuroToCents`) | eigener Parser + `Math.round(value * 100)` | `parseBetragZuCent()` | A |
| `app/admin/abrechnung/page.tsx` | `Math.round(r.amount * 100)` | `euroZuCent(r.amount)` | A |

Beim CAMT-Parser wird die **Zeichenkette** `roh` weitergereicht, nicht die
schon geparste Zahl — sie ist eine Zeile oberhalb als ISO-20022-Betrag
validiert und trägt die exakte Dezimaldarstellung.

Der Gutschriften-Dialog hatte zusätzlich einen eigenen Bug: die
Normalisierung strich Punkte bedingungslos, also wurde die englische
Schreibweise `12.50` als **1250 €** gelesen. `parseBetragZuCent()` aus
`lib/admin/betrag.ts` unterscheidet Tausender- und Dezimalpunkt.

### 2.2 Weitere Euro→Cent-Stellen (Fall A) aus der globalen Suche

| Datei | Stelle |
|---|---|
| `app/admin/rechnungen/[id]/page.tsx` | Zahlungs- **und** Gutschriftbetrag aus dem Prompt → `parseBetragZuCent()` |
| `app/admin/zahlungseingaenge/zuordnung/page.tsx` | Zuordnungsbeträge (2×) → `parseBetragZuCent()` über `zuordnungCent()` |
| `app/admin/leistungsnachweis-digital/page.tsx` | `parseFloat(f.amount)` → `Number()` + `aufCent()` (siehe 2.4) |
| `lib/billing/core/budget-cap.ts` | lokales `aufCent()` mit `+ Number.EPSILON` → `aufCent()` aus `lib/geld.ts` |
| `lib/billing/core/invoice-engine.ts` | Privatanteil nach Budgetdeckel, `+ Number.EPSILON` → `aufCent()` |
| `lib/billing/core/sammelrechnung.ts` | `erfassterBetragEuro` → `aufCent()` |
| `app/kunde/buchen/[id]/page.tsx`, `app/kunde/buchen-service/page.tsx` | Plattformgebühr → `aufCent()` |
| `lib/analytics/pdl-cockpit.ts` | 3 Euro-Kennzahlen → `aufCent()` |

**Zum EPSILON-Trick:** er war *nicht durchgehend* falsch — genau das machte
ihn gefährlich. Für 1,005 € und 2,675 € lieferte er zufällig das richtige
Ergebnis, für **8,575 € aber 8,57 € statt 8,58 €**. Und bei negativen
Beträgen schob er in die falsche Richtung: `-1,005 € → -1,00 €`, während
`+1,005 € → 1,01 €` wurde. Beides ist in
`lib/__tests__/geld-rundung-track2.test.ts` als ausführbarer Beleg
festgehalten.

### 2.3 Cent-Zwischenergebnisse (Fall B) → `centRunden()`

| Datei | Stelle |
|---|---|
| `lib/abrechnung/edifact-generator.ts` | `leistungsBetragCent` — Einzelpreis × Menge |
| `lib/abrechnung/edifact-validator.ts` | `fallBrutto` aus dem ELS-Segment |
| `lib/abrechnung/kassenabrechnung-engine.ts` | Einzelpreis aus Gesamtpreis / Menge |
| `lib/abrechnung/monatsabschluss.ts` | Minuten-anteiliger Betrag |
| `lib/billing/core/price-resolver.ts` | Zuschlag, Abschlag, Gesamtbetrag |
| `lib/billing/core/invoice-engine.ts` | Snapshot-Einzelpreis + Plausibilitätsprüfung der Korrekturpositionen |
| `lib/billing/xrechnung/invoice-to-xrechnung.ts` | Einzelpreis aus Zeilensumme / Menge |
| `app/admin/abrechnung/page.tsx` | Einzelpreis + Fall-Brutto (2 Stellen) |
| `app/api/billing/dta/dry-run/route.ts` | Einzelpreis aus Gesamtpreis / Menge |
| `app/api/billing/payments/route.ts` | Zahlungs-, Zuordnungs- und Überzahlungsbetrag |
| `app/api/billing/differences/route.ts` | `sollCents` / `istCents` (Kürzung kann negativ sein) |
| `app/api/billing/invoices/[id]/zahlung/route.ts` | `amountCents` aus dem Request-Body |
| `lib/coach/rechnung.ts` | `zerlegeBrutto` — Netto aus Brutto |
| `lib/coach/pricing.ts`, `app/pflegecoach/checkout/page.tsx` | Monatsrate aus Intervallbetrag |

### 2.4 Zwei echte Bugs, die die Durchsicht nebenbei gefunden hat

**(1) `parseBetragZuCent('12€34')` ergab 1234,00 €.**
`lib/admin/betrag.ts` strich das Währungszeichen *global*, also auch
mitten in der Zahl. Der naheliegende Vertipper `12€34` (gemeint: 12,34 €)
wurde zu `1234` — der **hundertfache Betrag**, ohne jede Warnung. Seit
dieser Durchsicht wird das € nur noch an den Rändern entfernt; innen fällt
es durch die Formatprüfung. Leerraum darf weiterhin überall weg (er
trennt höchstens Tausendergruppen, `1 234,56` bleibt lesbar).

Das wiegt schwerer als vorher, weil jetzt **drei** Dialoge diesen Parser
aufrufen (Gutschrift, Rechnungszahlung, Zahlungszuordnung).

**(2) `parseFloat()` im Leistungsnachweis-Formular.**
`app/admin/leistungsnachweis-digital/page.tsx` las den Betrag mit
`parseFloat()`. Das akzeptiert einen Müll-Suffix still (`12.5x` → 12.5) und
liefert bei ungültiger Eingabe `NaN`, das `JSON.stringify` als `null`
verschickt — der Leistungsnachweis wäre **ohne Betrag** entstanden und
damit nicht abrechenbar. Jetzt: `Number()` (streng), Fehlermeldung statt
stillem `null`, `aufCent()` vor dem Versand.

### 2.5 Neu in `lib/geld.ts`

`centRunden(wert)` — rundet ein Cent-Zwischenergebnis symmetrisch. Ohne
Kommaverschiebung, weil der Wert bereits Cent ist.

### 2.6 Angepasster Bestandstest

`__tests__/billing/billing-f1-f8-audit.test.ts` (F6) prüft den Quelltext
von `invoice-engine.ts` per Regex und war auf das Literal `Math.round`
festgenagelt. Der geprüfte Sachverhalt — Einzelpreis wird aus
Gesamtpreis / Menge *abgeleitet* statt gleichgesetzt — ist unverändert;
nur der erwartete Helfer heißt jetzt `centRunden`.

---

## 3. Bewusst NICHT geändert

### 3.1 Prozent-, Quoten- und Fortschrittswerte (kein Geld)

`Math.round((a / b) * 100)` ergibt eine **Prozentzahl**, keine Cent.
Der halbe Cent existiert dort nicht, und `centRunden` wäre irreführend.

`app/admin/schedule`, `app/admin/vpkzp`, `app/admin/quality`,
`app/admin/dipa` (2×), `app/admin/aufgaben/[id]`, `app/admin/verordnungen`,
`app/admin/analytics`, `app/admin/kim/einstellungen`, `app/kunde/budget`,
`app/mis/*` (privacy, complaints, training, signatures, scheduling, crm,
vehicles, recruiting, analytics), `lib/personal/einsatzfreigabe` (2×),
`lib/admin/ops`, `lib/touren/planung`, `lib/coach/nachweise`,
`lib/coach/anforderungskatalog`, `lib/coach/pricing:232` (Ersparnis in
Prozent), `lib/pilot/kundenkette`, `lib/analytics/kpi` (3×),
`lib/analytics/bonusEngine` (2×), `lib/analytics/pdl-cockpit`
(Quoten- und Trendwerte), `scripts/dipa-katalog-check`,
`scripts/dipa-compliance-check`.

### 3.2 Mengen, Zeiten, Distanzen, Laufzeiten

Keine Geldwerte:
`lib/monitoring/metrics` (Perzentile, Uptime, Fehlerrate),
`app/api/health` (Dauer in ms), `app/admin/sammelrechnung:111`
(Sekunden), `app/admin/leistungsnachweis-upload`, `app/kunde/notfall`
(OCR-Fortschritt), `app/kunde/home` (Distanz in km).

Sonderfall `app/admin/abrechnung`: `menge` ist eine **Stundenzahl**, keine
Cent. Sie läuft jetzt über `rundeAufStellen(stunden, 2)` — dieselbe
symmetrische Rundung, aber ausdrücklich als Nicht-Geld-Helfer benannt.

### 3.3 `toFixed()` in der Darstellung

`toFixed()` rundet auf der **Dezimaldarstellung** und leidet nicht unter
dem `* 100`-Fehler. Alle gefundenen Stellen rendern einen bereits
berechneten Wert (`{b.total_amount?.toFixed(2)}€`, `(cent / 100).toFixed(2)`)
und schreiben nichts zurück. Eine Umstellung auf `formatCentDe()` wäre
eine reine Darstellungsvereinheitlichung — **kein Rundungsfehler** und
darum nicht Teil dieser Durchsicht.

Betroffen: `app/engel/*`, `app/fahrer/*`, `app/kunde/*`, `app/admin/home`,
`app/admin/bookings`, `app/admin/zuzahlungen`, `app/admin/dta/laeufe`,
`app/krankenfahrten`, `app/api/admin/ocr`, `app/api/ai-chat`,
`app/api/billing/dta/dry-run` (Report-Text und `betrag_euro` des
**Dry-Runs** — geht in keine Kassendatei).

### 3.4 Bestandstests, die `Math.round` als Gegenbeispiel zitieren

`lib/__tests__/geld-rundung.test.ts`, `lib/__tests__/welle-6-kassenabrechnung-pure.test.ts`,
`lib/abrechnung/sgb-v/__tests__/positionen.test.ts`,
`lib/abrechnung/__tests__/edifact-validator.test.ts` und der Kopfkommentar
von `lib/geld.ts` selbst nennen `Math.round(x * 100)` **absichtlich** —
als dokumentiertes Fehlerbild. Diese Vorkommen dürfen nicht umgestellt
werden, sonst verschwindet der Beleg.

`scripts/forbidden-strings.json` bleibt aus demselben Grund unangetastet:
ein Literal-Verbot auf `Math.round` würde genau diese Testbelege blocken.

---

## 4. Regressionsabdeckung

`lib/__tests__/geld-rundung-track2.test.ts` (node:test, läuft in
`npm run test:unit`) deckt die geänderten Stellen ab:

- **Grenzwerte** aus dem Auftrag: 1,005 · 2,675 · 10,005 · 999,995 · 0,005
  und jeweils das negative Gegenstück.
- **`centRunden`**: Symmetrie über die ganze Halb-Cent-Reihe,
  `-0`-Normalisierung, `null`/`''` als Nullbetrag, Wurf bei Müll.
- **CAMT**: Eingang und Rücklastschrift desselben Betrags summieren sich
  auf null; deutsch formatierter Betrag wird abgewiesen statt still
  falsch gelesen; großer Betrag bleibt exakt.
- **`parseBetragZuCent`**: deutsche und englische Schreibweise ergeben
  denselben Betrag; `12€34` wird abgewiesen; Rand-€ und Leerraum-Trenner
  bleiben lesbar.
- **`zerlegeBrutto`**: Netto + Steuer ergeben wieder das Brutto, auch für
  negatives Brutto.
- **EDIFACT `leistungsBetragCent`**: halber Cent, Storno-Gegenstück,
  gebrochene Mengen (1,5 Std.).
- **EPSILON**: der ausführbare Beleg, dass der alte Trick bei 8,575 und
  bei negativen Beträgen danebenliegt.

Alle Beträge in der Suite sind **Testwerte** — keine Tarife, keine echten
Kostenträger, keine echten Geschäftsvorfälle.

**Ergebnis der Umstellung:** `npm run test:unit` 2211/2211 grün,
`npx vitest run` 5270 Tests grün, `tsc --noEmit` 0 Fehler.
