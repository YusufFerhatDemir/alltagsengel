# DATEV-Export und Tarif-Verifizierung auf PGlite (Track 3)

Stand: 2026-08-25

Zwei Module waren bis hierher ohne Integrationstest — nicht aus
Nachlässigkeit, sondern weil der PGlite-Shim die von ihnen benutzten
PostgREST-Merkmale nicht abbilden konnte. Ein Test hätte an einer
fehlenden Methode scheitern müssen, nicht an der Abfrage.

---

## 1. Was im PGlite-Shim gefehlt hat

`__tests__/e2e/helpers/pglite-supabase.ts` — jede Ergänzung mit dem
Aufrufer, der sie erzwungen hat:

| Fehlend | Aufrufer | Ergänzung |
|---|---|---|
| `.or('a.eq.1,b.is.null')` | `buchungssatz-generator.ts` (correction_type), `tarif-verifizierung-service.ts` (Org-Fence auf `leistungspreise`) | `parseOderAusdruck()` + Filterart `oder`, rekursive WHERE-Erzeugung |
| `.not(spalte, 'eq', wert)` | `buchungssatz-generator.ts` (`.not('status','eq','entwurf')`) | Filterart `nicht`; vorher warf der Shim ausdrücklich `wird nicht unterstuetzt` |
| verschachtelte Einbettung `invoice:invoices(… client:clients(last_name))` | DATEV-Generator, 4× | `ergaenzeEingebettet()` ist rekursiv |
| eins-zu-viele Einbettung `payments(… allocations:payment_allocations(…))` | Rücklastschrift-Zweig des DATEV-Generators | Richtung wird am echten Schema bestimmt: FK am Eltern → Objekt, FK am Kind → Array |

### Die Falle, die dabei sichtbar wurde

Die erste Fassung der Verschachtelung löste die tiefere Ebene auf der
schon **zugeschnittenen** Zeile auf. Das geht schief, sobald ein Embed
keine flachen Spalten anfordert:

```
allocations:payment_allocations(invoice:invoices(id, client_id, …))
```

Hier wird von `payment_allocations` keine einzige flache Spalte verlangt
— auch nicht `invoice_id`. Wer auf der zugeschnittenen Zeile weitersucht,
findet den Fremdschlüssel nicht mehr und liefert still `null`. PostgREST
hat das Problem nicht, weil es serverseitig joint. Der Shim löst tiefere
Ebenen deshalb auf den **vollen** Zeilen auf und kopiert das Ergebnis
danach in die zugeschnittenen (`loeseTieferAuf`).

Ohne diese Korrektur wäre der Test grün geworden und hätte behauptet, die
Rücklastschrift trage ein Debitorenkonto — sie fiel in Wahrheit auf das
Sammelkonto 1400 zurück.

### Schema-Bausteine

`__tests__/e2e/helpers/kette-schema.ts` hat zwei neue Aufbauhelfer, beide
mit wortgleichen Migrationsschnitten:

- `baueDatevTabellen()` — `datev_exports`, `datev_kontenzuordnung`,
  `organizations.datev_config` (20260812180000)
- `baueTarifVerifizierung()` — Verifizierungsspalten,
  `billing_tarif_belege`, `billing_tariff_audit` und der Trigger
  `trg_verifizierung_belegpflicht` (20260831040000 / 20260902000000 /
  20260904000000)

---

## 2. DATEV-Suite

`__tests__/billing/datev-export-pglite.test.ts` — 46 Tests.

- **Beträge und Richtung**: Rechnung = Debitor (S) an Erlös; Zahlung =
  Bank (S) an Debitor mit Cent→Euro-Umrechnung; Gutschrift ohne
  Vorzeichen mit Generalumkehr; Mahngebühr an Mahnerlöse; Rücklastschrift
  Debitor (S) an Bank.
- **Rücklastschrift: genau EINE Buchung.** Früher kam eine zweite über
  pauschal 5,00 EUR „Nebenkosten Geldverkehr" dazu — ein Literal im
  Generator, das auf keinem Kontoauszug stand. Der Test hält die
  Entfernung fest und prüft zusätzlich, dass gegen das Aufwandskonto gar
  nicht gebucht wird.
- **Nur zulässige Buchungen**: Entwürfe, gelöschte Rechnungen, Beträge
  ≤ 0 und Belege außerhalb des Zeitraums bleiben draußen. Ein eigener
  Test geht **jeden** live vorkommenden `correction_type` durch und
  prüft, dass die beiden Abfragen zusammen jeden genau einmal erfassen —
  keiner doppelt, keiner vergessen. `korrektur` gehört zu den
  Ausgangsrechnungen.
- **Mandantentrennung**: Rechnungen, Zahlungen, Mahngebühren und
  Rücklastschriften eines fremden Mandanten erscheinen nicht; die
  Debitoren-Nummernkreise laufen je Mandant unabhängig.
- **Kontenzuordnung**: Stabilität derselben Nummer, aufsteigende Vergabe,
  UNIQUE-Sperre der Datenbank, erschöpfter Nummernkreis.
- **Fail-Closed**: ein Lesefehler auf `invoices`, `payment_allocations`,
  `dunning_entries` oder `zahlungseingaenge` bricht den Export ab; ein
  leerer Zeitraum dagegen ist ein leerer Stapel, kein Fehler.
- **CSV**: Dezimalkomma, Formel-Riegel für Buchungstext, Belegnummer,
  KOST1/KOST2 und die Beraternummer, Verdoppeln von Anführungszeichen,
  Semikolon im Text, Steuerschlüssel `0` vs. leer, Generalumkehr,
  CRLF-Zeilenenden, SKR03 vs. SKR04 bis in die Buchung.

### Zwei echte Befunde aus dieser Suite

**Befund 1 — die Debitorennummer ging ungeprüft und ungeschützt in die CSV.**

`generateDatevBuchungszeile()` schrieb Konto und Gegenkonto als
`` `"${bs.konto}"` `` — ohne Verdoppeln der Anführungszeichen und ohne
Formel-Riegel, anders als jedes andere Textfeld der Zeile. Das Konto ist
bei jeder Rechnungs-, Gutschrift- und Mahnbuchung die **Debitorennummer**,
und `POST /api/billing/datev/kontenzuordnung` prüfte sie nur auf „nicht
leer". Ein Wert wie `1";"9999` beendete das Feld mitten in der Zeile und
schob alles Folgende in die falsche Spalte — der Steuerberater importiert
dann Beträge auf fremde Konten. Ein Wert mit führendem `=` war beim
Öffnen in Excel eine Formel.

Geschlossen an beiden Stellen:
- `lib/billing/datev/kontenrahmen.ts`: neue `pruefeDebitorennummer()` —
  ganzzahlig im Bereich 10000–69999, dieselbe Regel, nach der die
  automatische Vergabe zieht. `upsertKontenzuordnung()` ruft sie auf, die
  Route gibt den Fehler als 400 zurück.
- `lib/billing/datev/datev-format.ts`: Konto und Gegenkonto laufen jetzt
  durch `escapeText(sanitize(…, 9))` wie die übrigen Textfelder. Zweiter
  Riegel, weil die Zeile auch aus Werten entsteht, die vor der neuen
  Eingangsprüfung in die Tabelle gelangt sind.

**Befund 2 — unbekannter Kontenrahmen warf einen nichtssagenden TypeError.**

`getKonto()` griff mit `KONTENRAHMEN[rahmen][schluessel]` doppelt zu.
`getDatevConfig()` castet den Wert aus der JSONB-Spalte
`organizations.datev_config` nur (`stored.kontenrahmen as Kontenrahmen`);
steht dort etwas anderes als SKR03/SKR04, kam „Cannot read properties of
undefined (reading 'bank')" aus der Tiefe des Generators. `getKonto()`
meldet jetzt Klartext. (`saveDatevConfig()` validiert bereits — der Weg
führt über einen direkten Schreibzugriff auf die Spalte, nicht über die
Route.)

### Was diese Suite NICHT prüft

`erstelleDatevExport()` schreibt in Supabase Storage. Storage bildet der
Shim nicht ab; die Suite läuft auf den beiden Schichten darunter
(Buchungssatz-Generator und CSV-Format). Die Storage-Schicht bleibt
ungeprüft — hier benannt statt stillschweigend übergangen.

---

## 3. Tarif-Suite

`__tests__/billing/tarif-verifizierung-pglite.test.ts` — 41 Tests, gegen
`resolvePrice()` und den DB-Trigger `trg_verifizierung_belegpflicht`.

- **Mandantentrennung**: fremder Tarif wird nicht gefunden; ohne
  `organizationId` wird gar nicht erst gesucht; gleicher Tarifschlüssel
  bei zwei Mandanten liefert je den eigenen Preis; ein Beleg des falschen
  Mandanten trägt die Freigabe nicht.
- **Bundesland/Region**: spezifisch schlägt allgemein; ein Tarif für ein
  anderes Bundesland wird nicht verwendet; ohne Bundesland in der Anfrage
  greift nur der allgemeine; Kostenträger (+10) schlägt Bundesland (+5).
- **Gültigkeit**: künftiger Beginn gilt nicht, abgelaufener Tarif gilt
  nicht, die Grenzen sind einschließend, `valid_period` weist verdrehte
  Zeiträume ab, ein Nicht-ISO-Datum wird abgewiesen statt still
  verglichen, inaktive und gelöschte Tarife bleiben draußen.
- **Überlappung**: echte Überschneidung wird abgewiesen; lückenlose
  Anschlusszeiträume liefern je nach Datum den richtigen Preis; bei
  gleichem Spezifitäts-Score gewinnt der jüngere `gueltig_ab`.
- **Fail-Closed**: kein Tarif → Fehler; unverifizierter Kassentarif →
  `TarifNichtVerifiziertError`; `blocked` blockiert auch privat; ein
  unverifizierter **Privat**tarif ist abrechenbar (Privatpreise sind frei
  wählbar); negativer Preis scheitert an `positive_price`; ein unbekannter
  Status gilt als `unverified`.
- **DB-Fehler eskalieren**: ein Lesefehler ergibt „Tarifladen
  fehlgeschlagen", ausdrücklich **nicht** „Kein Tarif gefunden" — sonst
  sieht ein Datenbankausfall aus wie eine Lücke im Tarifwerk und der
  Bearbeiter legt einen Tarif an, den es längst gibt.
- **Belegpflicht** (der Trigger, wortgleich aus der Migration): ohne
  Rechtsquelle, mit zu kurzer Rechtsquelle, ohne Bearbeiter, ohne Beleg
  und mit dem Beleg eines anderen Tarifs wird abgelehnt; mit
  vollständigem Nachweis erlaubt; Privattarife brauchen keinen Beleg;
  `leistungspreise` sind immer belegpflichtig; Sperren und Zurücknehmen
  gehen jederzeit. Ein eigener Test hält Anwendungsprüfung
  (`pruefeStatusaenderung`) und Trigger auf derselben Regel.
- **Org-Fence über `.or(…)`** auf `leistungspreise`, lesend und
  schreibend.

### Eine Beobachtung, ausdrücklich kein Befund

`tarif-verifizierung-service.ts` begründet den Ausdruck
`organization_id.eq.<org>,organization_id.is.null` mit
`leistungspreise`-Altbestand aus der Zeit vor Phase 3. Nach dem Schema,
das die Migrationen aufbauen, kann es diesen Altbestand nicht mehr geben:
der Phase-3-DO-Block (20260801) füllt die Spalte auf die Stamm-Org und
setzt danach `NOT NULL`. Die `is.null`-Hälfte trifft auf diesem Schema
keine Zeile.

Das ist **nicht** als Fehler notiert: ob die Spalte auf der
Produktionsdatenbank tatsächlich `NOT NULL` ist, lässt sich aus dem Repo
nicht feststellen, und ein zusätzlicher ODER-Zweig ist kein Leck — er
öffnet nur für herrenlose Zeilen, nie für fremde. Geprüft wird deshalb
das, was in beiden Fällen gelten muss: eigene Zeilen sichtbar, fremde
nicht.

### Grenze dieser Suite

`no_overlapping_tariffs` ist live ein `EXCLUDE USING gist` und braucht
`btree_gist`, das PGlite nicht hat. `baueTarifStammdaten()` setzt an seine
Stelle einen Stellvertreter-Trigger mit derselben Fehlermeldung. Geprüft
wird damit die **Reaktion** auf eine abgewiesene Überschneidung — nicht,
ob der echte Constraint richtig greift.

---

## 4. Ergebnis

- `npm run test:unit` (node:test): 2211/2211 grün
- `npx vitest run`: 5357 Tests, 5319 grün, 38 übersprungen, 0 rot
- `tsc --noEmit`: 0 Fehler
- Die 111 bestehenden PGlite-Suiten laufen mit dem erweiterten Shim
  unverändert grün — die Erweiterungen sind additiv.

Alle Beträge, Kontonummern-Testwerte, Mandanten und Klienten in beiden
Suiten sind Testdaten innerhalb der In-Memory-Instanz. Die
SKR03/SKR04-Kontonummern stammen aus dem Standardkontenrahmen in
`lib/billing/datev/kontenrahmen.ts` und sind nicht erfunden.
