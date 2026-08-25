# Phase 6B — Technischer Fortschrittsbericht

**Zeitraum:** 25.08.2026 (Abend)
**Repository:** Alltagsengel (`main`)
**Code-Stand am Ende:** `0a63657` — `fix: Track 2+3 — Geldrundung Reststellen + DATEV/Tarif PGlite-Tests`
**Vorher-Stand:** `17272f0` / Code `5ed3ae9` (Ende Phase 6A)

Phase 6B hat die drei technischen Punkte abgearbeitet, die Phase 6A offen
gelassen hatte: die wartende Migration (T-1), den Rest der Geldrundung (T-2)
und die beiden ungetesteten Abrechnungsmodule (T-3/T-4).

Der Ertrag liegt wieder nicht in den Punkten selbst. Die drei Reststellen aus
dem 6A-Bericht waren **nicht** die ganze Wahrheit — eine vollständige Durchsicht
fand 18 weitere Stellen und ein zweites, bis dahin unbenanntes Fehlerbild. Und
die beiden neuen Testsuiten fanden, wie schon in T1, zwei echte Fehler in Code,
der an einen Steuerberater ausliefert.

---

## 0. Überblick

| Track | Thema | Ergebnis | Commit |
|---|---|---|---|
| 1 | Migration `payment_allocation_rueckzahlung` | **LIVE_VERIFIZIERT** + transaktional + Verifikationsskript | `6ef8d7f` (+ Live-Apply) |
| 2 | Geldrundung: Reststellen | **erledigt** — 21 Stellen, `centRunden()` neu, **2 Bugs** | `8a99e04`, `0a63657` |
| 3 | DATEV + Tarif-Verifizierung auf PGlite | **erledigt** — 2 Suiten, Shim erweitert, **2 Bugs** | `0a63657` |

**Vier neue Produktionsbefunde**, alle gefixt — Details in §4.

---

## 1. Track 1 — Migration `20261004000000_payment_allocation_rueckzahlung`

### 1.1 Ausgangslage

Der Befund R-1 aus Phase 6A war nur halb geschlossen: der Code las den Fehler
zwar, aber `allocation_type = 'rueckzahlung'` stand weiterhin nicht im
CHECK-Constraint. Bis zum Apply griff ein dokumentierter Rückfall (Zuordnungs-
zeile wird entfernt — Bücher konsistent, Historie fehlt).

Der Apply war extern blockiert: `service_role` bekommt auf
`payment_allocations` ein `42501 must be owner of table` und kann kein DDL.

### 1.2 Zwei Vorarbeiten am Migrationsskript

**Transaktionale Kapselung.** `DROP CONSTRAINT` und `ADD CONSTRAINT` liefen als
zwei getrennte Anweisungen. Scheitert das `ADD` — etwa an einer Bestandszeile,
die keinen der sechs Werte trägt —, stünde `payment_allocations` danach **ganz
ohne** `allocation_type`-Prüfung da. Genau der Zustand, den die Migration
beheben soll, nur schlimmer. Beide Dateien (Migration und Rollback) sind jetzt
in `BEGIN; … COMMIT;` gefasst.

**Verifikationsskript.** `scripts/verify-payment-allocation-rueckzahlung.mjs`
prüft nach dem Apply gegen die Live-Datenbank — nebenwirkungsfrei über das
`_run_sql`-Lese-Orakel (`RAISE`-Fehlermeldung als Rückkanal, es wird nichts
geschrieben). Geprüft werden fünf Dinge, nicht nur das eine:

1. kennt der CHECK den Wert `rueckzahlung`?
2. sind **alle fünf Altwerte** erhalten? (Ein `DROP`+`ADD` kann sie verlieren.)
3. verletzt eine Bestandszeile den neuen Constraint?
4. ist RLS auf der Tabelle weiterhin aktiv?
5. steht `org_fence_payment_allocations` weiterhin **RESTRICTIVE**?

Punkt 4 und 5 stehen dort, weil eine Constraint-Migration kein Anlass ist, die
Sicherheitslage einer Geldtabelle ungeprüft zu lassen.

### 1.3 Live-Stand: verifiziert

Der Apply ist erfolgt (Supabase MCP `apply_migration`). Das Verifikationsskript
wurde beim Verfassen dieses Berichts **erneut ausgeführt**:

```
OK    CHECK kennt rueckzahlung           vorhanden
OK    Altwert erhalten: vollzahlung      ja
OK    Altwert erhalten: teilzahlung      ja
OK    Altwert erhalten: ueberzahlung     ja
OK    Altwert erhalten: sammelzahlung_anteil ja
OK    Altwert erhalten: gutschrift_verrechnung ja
OK    Bestandsdaten gueltig              0 Verletzer
OK    RLS aktiv                          ja
OK    org_fence RESTRICTIVE              alloc_admin_all=PERMISSIVE,
                                         org_fence_payment_allocations=RESTRICTIVE
OK    Admin-Policy vorhanden             …
ALLES GRUEN
```

**Damit ist R-1 aus Phase 6A vollständig geschlossen.** Der CHECK trägt sechs
Werte, RLS und `org_fence` sind unverändert.

**Der Rückfall im Code bleibt stehen** (`lib/billing/sepa/ruecklastschrift.ts:185`).
Er ist jetzt ein toter Zweig — und genau deshalb sinnvoll: liefe die Anwendung
je gegen eine Datenbank ohne diese Migration (Shadow-Instanz, neuer Mandanten-
Stack, Rollback), bleiben die Bücher konsistent, statt still auseinanderzulaufen.

---

## 2. Track 2 — Geldrundung: die Reststellen

### 2.1 Der Auftrag war zu klein gefasst

Der 6A-Bericht nannte drei Reststellen. Sie sind erledigt:

| Datei | vorher | nachher |
|---|---|---|
| `lib/billing/camt/camt-parser.ts` (`betragToCent`) | `Math.round(n * 100)` | `euroZuCent(roh)` |
| `app/admin/gutschriften/page.tsx` (`parseEuroToCents`) | eigener Parser + `Math.round(…)` | `parseBetragZuCent()` |
| `app/admin/abrechnung/page.tsx` | `Math.round(r.amount * 100)` | `euroZuCent(r.amount)` |

Beim CAMT-Parser wird bewusst die **Zeichenkette** `roh` weitergereicht, nicht
die schon geparste Zahl — sie ist eine Zeile darüber als ISO-20022-Betrag
validiert und trägt die exakte Dezimaldarstellung.

Die anschließende **globale** Durchsicht aller `Math.round(`-, `toFixed(`- und
`parseFloat(`-Stellen in `app/`, `lib/` und `scripts/` fand jedoch **18 weitere**
geldrelevante Stellen — und ein zweites Fehlerbild, das im 6A-Bericht nicht
vorkam.

### 2.2 Das zweite Fehlerbild: Cent-Zwischenergebnisse

Die Durchsicht trennt seither zwei Fälle. Wer sie vermischt, ändert Stellen ohne
Wirkung:

**(A) EURO → CENT.** `Math.round(euro * 100)` — der exakte halbe Cent fällt in
IEEE-754 nach unten (`1.005 * 100` = `100.49999999999999`).
→ `euroZuCent()` / `aufCent()`, Kommaverschiebung auf der Zeichenkette.

**(B) CENT-Zwischenergebnis.** `Math.round(cent)` auf einem Wert, der **schon in
Cent** gerechnet ist (Einzelpreis × Menge, Zuschlag, Gesamtpreis ÷ Menge). Die
Kommaverschiebung hilft hier nichts. Was bleibt, ist die Asymmetrie:
`Math.round(100.5) = 101`, aber `Math.round(-100.5) = -100`.

Auf einer **Gutschrift**, einer **Storno-Position** oder einer
**Rücklastschrift** steht damit ein Cent weniger als auf der Rechnung, die sie
ausgleichen soll. Die Position gleicht sich nicht auf null aus — und der
Differenzbetrag bleibt als Restforderung stehen.

→ **`centRunden()`**, neu in `lib/geld.ts`, rundet symmetrisch (DIN 1333),
normalisiert `-0` und wirft bei Müll statt still `NaN` weiterzureichen.

### 2.3 Umgestellt

**Fall A (Euro → Cent), zusätzlich zu den drei oben:**
`app/admin/rechnungen/[id]/page.tsx` (Zahlungs- und Gutschriftbetrag),
`app/admin/zahlungseingaenge/zuordnung/page.tsx` (2×),
`app/admin/leistungsnachweis-digital/page.tsx`,
`lib/billing/core/budget-cap.ts`, `lib/billing/core/invoice-engine.ts`,
`lib/billing/core/sammelrechnung.ts`, `app/kunde/buchen/[id]/page.tsx`,
`app/kunde/buchen-service/page.tsx`, `lib/analytics/pdl-cockpit.ts` (3 Kennzahlen).

**Fall B (Cent-Zwischenergebnis) → `centRunden()`:**
`lib/abrechnung/edifact-generator.ts`, `edifact-validator.ts`,
`kassenabrechnung-engine.ts`, `monatsabschluss.ts`,
`lib/billing/core/price-resolver.ts`, `invoice-engine.ts`,
`lib/billing/xrechnung/invoice-to-xrechnung.ts`, `app/admin/abrechnung/page.tsx` (2×),
`app/api/billing/dta/dry-run/route.ts`, `app/api/billing/payments/route.ts`,
`app/api/billing/differences/route.ts`,
`app/api/billing/invoices/[id]/zahlung/route.ts`,
`lib/coach/rechnung.ts`, `lib/coach/pricing.ts`, `app/pflegecoach/checkout/page.tsx`.

### 2.4 Der EPSILON-Trick war *nicht durchgehend* falsch

Phase 6A hatte `+ Number.EPSILON` als verworfene Variante dokumentiert. Track 2
hat den Beweis nachgeliefert und dabei präzisiert, warum die Variante so zäh
ist: sie liefert **manchmal** das richtige Ergebnis.

| Eingabe | mit `+ Number.EPSILON` | korrekt |
|---|---|---|
| 1,005 € | 1,01 € ✅ | 1,01 € |
| 2,675 € | 2,68 € ✅ | 2,68 € |
| **8,575 €** | **8,57 € ❌** | 8,58 € |
| **−1,005 €** | **−1,00 € ❌** | −1,01 € |

Wer nur die beiden Lehrbuchbeispiele prüft, hält den Trick für eine Lösung.
Beide Gegenbeispiele stehen jetzt als ausführbarer Beleg in
`lib/__tests__/geld-rundung-track2.test.ts`.

### 2.5 Das Protokoll der *nicht* geänderten Stellen

`docs/MONEY_ROUNDING_REVIEW_COMPLETE.md` führt rund **60 Fundstellen**, die
bewusst stehen bleiben, mit Begründung je Gruppe:

- **Prozent-, Quoten-, Fortschrittswerte** — `Math.round((a/b)*100)` ergibt eine
  Prozentzahl, keine Cent. Der halbe Cent existiert dort nicht.
- **Mengen, Zeiten, Distanzen** — Perzentile, ms, km, Sekunden, OCR-Fortschritt.
  Sonderfall `app/admin/abrechnung`: `menge` ist eine **Stundenzahl** und läuft
  jetzt über `rundeAufStellen(stunden, 2)` — dieselbe symmetrische Rundung, aber
  ausdrücklich als Nicht-Geld-Helfer benannt.
- **`toFixed()` in der Darstellung** — rundet auf der Dezimaldarstellung und
  leidet nicht unter dem `* 100`-Fehler. Alle Fundstellen rendern einen bereits
  berechneten Wert und schreiben nichts zurück.
- **Bestandstests, die `Math.round(x * 100)` als Gegenbeispiel zitieren** —
  diese Vorkommen dürfen **nicht** umgestellt werden, sonst verschwindet der
  Beleg. Aus demselben Grund bleibt `scripts/forbidden-strings.json`
  unangetastet: ein Literal-Verbot auf `Math.round` würde genau diese
  Testbelege blocken.

Dieser zweite Teil ist der eigentliche Wert des Dokuments. Ohne ihn prüft die
nächste Durchsicht dieselben 60 Fundstellen noch einmal einzeln.

---

## 3. Track 3 — DATEV-Export und Tarif-Verifizierung auf PGlite

T-3 und T-4 aus dem 6A-Handoff. Beide Module waren ungetestet, weil der
PGlite-Shim die von ihnen benutzten PostgREST-Merkmale nicht abbilden konnte —
ein Test wäre an einer fehlenden Methode gescheitert, nicht an der Abfrage.

### 3.1 Der Shim, erweitert

`__tests__/e2e/helpers/pglite-supabase.ts`, jede Ergänzung mit dem Aufrufer, der
sie erzwungen hat:

| Fehlend | Aufrufer | Ergänzung |
|---|---|---|
| `.or('a.eq.1,b.is.null')` | Buchungssatz-Generator, Tarif-Verifizierung (Org-Fence auf `leistungspreise`) | `parseOderAusdruck()` + Filterart `oder`, rekursive WHERE-Erzeugung |
| `.not(spalte,'eq',wert)` | Buchungssatz-Generator (`.not('status','eq','entwurf')`) | Filterart `nicht`; vorher warf der Shim ausdrücklich „wird nicht unterstuetzt" |
| verschachtelte Einbettung `invoice:invoices(… client:clients(last_name))` | DATEV-Generator, 4× | `ergaenzeEingebettet()` ist rekursiv |
| eins-zu-viele `payments(… allocations:payment_allocations(…))` | Rücklastschrift-Zweig des DATEV-Generators | Richtung wird am echten Schema bestimmt: FK am Eltern → Objekt, FK am Kind → Array |

**Die Falle, die dabei sichtbar wurde.** Die erste Fassung löste die tiefere
Ebene auf der schon **zugeschnittenen** Zeile auf. Das geht schief, sobald ein
Embed keine flachen Spalten anfordert:

```
allocations:payment_allocations(invoice:invoices(id, client_id, …))
```

Von `payment_allocations` wird keine einzige flache Spalte verlangt — auch nicht
`invoice_id`. Wer auf der zugeschnittenen Zeile weitersucht, findet den
Fremdschlüssel nicht mehr und liefert still `null`. PostgREST hat das Problem
nicht, weil es serverseitig joint. Der Shim löst tiefere Ebenen deshalb auf den
**vollen** Zeilen auf (`loeseTieferAuf`).

**Ohne diese Korrektur wäre der Test grün geworden** und hätte behauptet, die
Rücklastschrift trage ein Debitorenkonto — sie fiel in Wahrheit auf das
Sammelkonto 1400 zurück. Dasselbe Muster wie die Shim-Lücke aus Phase 6A: ein
Testhilfsmittel, das freundlicher antwortet als die echte Schicht, beweist nichts.

**Schemabausteine** in `__tests__/e2e/helpers/kette-schema.ts`, beide mit
wortgleichen Migrationsschnitten: `baueDatevTabellen()` (`datev_exports`,
`datev_kontenzuordnung`, `organizations.datev_config` — 20260812180000) und
`baueTarifVerifizierung()` (Verifizierungsspalten, `billing_tarif_belege`,
`billing_tariff_audit`, Trigger `trg_verifizierung_belegpflicht` —
20260831040000 / 20260902000000 / 20260904000000).

### 3.2 DATEV-Suite — 46 Tests

`__tests__/billing/datev-export-pglite.test.ts`. Abgedeckt: Beträge und
Buchungsrichtung (Rechnung, Zahlung, Gutschrift mit Generalumkehr, Mahngebühr,
Rücklastschrift), Ausschluss unzulässiger Buchungen (Entwürfe, gelöschte
Rechnungen, Beträge ≤ 0, Belege außerhalb des Zeitraums), Mandantentrennung über
alle vier Buchungsarten, Kontenzuordnung (Stabilität, aufsteigende Vergabe,
UNIQUE-Sperre, erschöpfter Nummernkreis), Fail-Closed bei Lesefehlern auf
`invoices` / `payment_allocations` / `dunning_entries` / `zahlungseingaenge`,
und das CSV-Format bis in die SKR03/SKR04-Unterscheidung.

Ein eigener Test geht **jeden** live vorkommenden `correction_type` durch und
prüft, dass die beiden Abfragen des Generators zusammen jeden genau einmal
erfassen — keiner doppelt, keiner vergessen.

**Was diese Suite nicht prüft:** `erstelleDatevExport()` schreibt in Supabase
Storage. Storage bildet der Shim nicht ab; die Suite läuft auf den beiden
Schichten darunter (Buchungssatz-Generator und CSV-Format). Hier benannt statt
stillschweigend übergangen.

### 3.3 Tarif-Suite — 41 Tests

`__tests__/billing/tarif-verifizierung-pglite.test.ts`, gegen `resolvePrice()`
und den DB-Trigger `trg_verifizierung_belegpflicht`. Abgedeckt:
Mandantentrennung, Bundesland-/Kostenträger-Spezifität, Gültigkeitszeiträume
(einschließende Grenzen, verdrehte Zeiträume, Nicht-ISO-Datum), Überlappung,
Fail-Closed (`TarifNichtVerifiziertError`, `blocked` blockiert auch privat,
unbekannter Status gilt als `unverified`) und die Belegpflicht des Triggers.

Zwei Feinheiten, die die Suite festhält:

- **Ein unverifizierter Privattarif ist abrechenbar** — Privatpreise sind frei
  wählbar. Die Fail-Closed-Sperre gilt für Kassentarife.
- **DB-Fehler eskalieren als DB-Fehler.** Ein Lesefehler ergibt „Tarifladen
  fehlgeschlagen", ausdrücklich **nicht** „Kein Tarif gefunden". Sonst sieht ein
  Datenbankausfall aus wie eine Lücke im Tarifwerk, und der Bearbeiter legt einen
  Tarif an, den es längst gibt.

**Beobachtung, ausdrücklich kein Befund:** `tarif-verifizierung-service.ts`
begründet `organization_id.eq.<org>,organization_id.is.null` mit
`leistungspreise`-Altbestand aus der Zeit vor Phase 3. Nach dem Schema, das die
Migrationen aufbauen, kann es diesen Altbestand nicht geben — der Phase-3-DO-Block
(20260801) füllt die Spalte und setzt `NOT NULL`. Ob die Produktionsdatenbank das
tatsächlich so trägt, lässt sich aus dem Repo nicht feststellen; und ein
zusätzlicher ODER-Zweig ist kein Leck — er öffnet nur für herrenlose Zeilen, nie
für fremde. Geprüft wird deshalb, was in beiden Fällen gelten muss.

**Grenze, unverändert aus Phase 6A:** `no_overlapping_tariffs` ist live ein
`EXCLUDE USING gist` und braucht `btree_gist`, das PGlite nicht liefert. An
seiner Stelle steht ein Stellvertreter-Trigger mit derselben Fehlermeldung.
Geprüft wird die **Reaktion** auf eine abgewiesene Überschneidung — nicht, ob der
echte Constraint richtig greift.

---

## 4. Die vier neuen Produktionsbefunde

Schweregrad nach Wirkung, nicht nach Aufwand.

### G-1 — `parseBetragZuCent('12€34')` ergab 1.234,00 € 🔴 P1 (Geld)

`lib/admin/betrag.ts` strich das Währungszeichen **global**, also auch mitten in
der Zahl. Der naheliegende Vertipper `12€34` (gemeint: 12,34 €) wurde zu `1234`
— dem **hundertfachen Betrag**, ohne jede Warnung.

Das wiegt schwerer als beim Schreiben der Funktion, weil inzwischen **drei**
Dialoge diesen Parser aufrufen: Gutschrift, Rechnungszahlung, Zahlungszuordnung.
Eine als 1.234 € gebuchte Gutschrift von 12,34 € ist ein Verlust von 1.221,66 €,
den erst der Kontoabgleich findet.

**Fix:** Das € wird nur noch an den Rändern entfernt; innen fällt es durch die
Formatprüfung. Leerraum darf weiterhin überall weg — er trennt höchstens
Tausendergruppen, `1 234,56` bleibt lesbar.

### G-2 — `parseFloat()` erzeugte Leistungsnachweise ohne Betrag 🟠 P2 (Funktion)

`app/admin/leistungsnachweis-digital/page.tsx` las den Betrag mit `parseFloat()`.
Das akzeptiert einen Müll-Suffix still (`'12.5x'` → `12.5`) und liefert bei
ungültiger Eingabe `NaN` — das `JSON.stringify` als `null` verschickt. Der
Leistungsnachweis entstand **ohne Betrag** und war damit nicht abrechenbar.

**Fix:** `Number()` (streng), Fehlermeldung statt stillem `null`, `aufCent()` vor
dem Versand.

### D-1 — CSV-Injection über die Debitorennummer 🔴 P1 (Sicherheit/Geld)

`generateDatevBuchungszeile()` schrieb Konto und Gegenkonto als
`` `"${bs.konto}"` `` — **ohne** Verdoppeln der Anführungszeichen und **ohne**
Formel-Riegel, anders als jedes andere Textfeld derselben Zeile.

Das Konto ist bei jeder Rechnungs-, Gutschrift- und Mahnbuchung die
**Debitorennummer**, und `POST /api/billing/datev/kontenzuordnung` prüfte sie nur
auf „nicht leer". Ein Wert wie `1";"9999` beendete das Feld mitten in der Zeile
und schob alles Folgende in die falsche Spalte — der Steuerberater importiert
dann Beträge auf fremde Konten. Ein Wert mit führendem `=` war beim Öffnen in
Excel eine Formel.

**Fix an beiden Enden:**
- `lib/billing/datev/kontenrahmen.ts`: neue `pruefeDebitorennummer()` —
  ganzzahlig im Bereich 10000–69999, dieselbe Regel, nach der die automatische
  Vergabe zieht. `upsertKontenzuordnung()` ruft sie auf, die Route gibt den
  Fehler als 400 zurück.
- `lib/billing/datev/datev-format.ts`: Konto und Gegenkonto laufen jetzt durch
  `escapeText(sanitize(…, 9))` wie die übrigen Textfelder. Zweiter Riegel, weil
  die Zeile auch aus Werten entsteht, die **vor** der neuen Eingangsprüfung in
  die Tabelle gelangt sind.

### D-2 — Unbekannter Kontenrahmen warf einen nichtssagenden TypeError 🟡 P3 (Diagnose)

`getKonto()` griff mit `KONTENRAHMEN[rahmen][schluessel]` doppelt zu.
`getDatevConfig()` castet den Wert aus der JSONB-Spalte
`organizations.datev_config` nur (`stored.kontenrahmen as Kontenrahmen`); steht
dort etwas anderes als SKR03/SKR04, kam „Cannot read properties of undefined
(reading 'bank')" aus der Tiefe des Generators.

**Fix:** `getKonto()` meldet Klartext. (`saveDatevConfig()` validiert bereits —
der Weg dorthin führt über einen direkten Schreibzugriff auf die Spalte, nicht
über die Route.)

### 4.1 Nebenbefund aus Track 2

Der Gutschriften-Dialog hatte zusätzlich einen eigenen Parser, dessen
Normalisierung Punkte **bedingungslos** strich: die englische Schreibweise
`12.50` wurde als **1.250 €** gelesen. Mit der Umstellung auf
`parseBetragZuCent()` (das Tausender- und Dezimalpunkt unterscheidet) ist der
Fall miterledigt.

### 4.2 Einordnung

| Befund | Bereich | Gefunden durch |
|---|---|---|
| G-1 | Geld — hundertfacher Betrag in 3 Dialogen | globale Durchsicht (nicht im Auftrag) |
| G-2 | Funktion — unfakturierbarer Nachweis | globale Durchsicht (nicht im Auftrag) |
| D-1 | Sicherheit/Geld — Buchungen auf fremde Konten | neue Testsuite |
| D-2 | Diagnose | neue Testsuite |

**Zwei von vier Befunden lagen außerhalb des beauftragten Umfangs.** Der Auftrag
nannte drei Reststellen; die vollständige Durchsicht fand 18 weitere und die
beiden schwersten Fehler. Das ist derselbe Befund hinter den Befunden wie in
Phase 6A — mit dem Zusatz, dass diesmal nicht fehlende Tests das Problem waren,
sondern eine **zu eng gefasste Fundstellenliste**.

---

## 5. Teststatistik — vorher / nachher

| Runner | Ende 6A (`5ed3ae9`) | Ende 6B (`0a63657`) | Delta |
|---|---:|---:|---:|
| vitest | 5.232 | **5.319** | +87 |
| node:test (`npm run test:unit`) | 2.175 | **2.211** | +36 |
| **Gesamt** | **7.407** | **7.530** | **+123** |

Am Endstand gemessen (`0a63657`, node:test und vitest **nacheinander**, nicht
gleichzeitig):

| Lauf | Ergebnis |
|---|---|
| `npm run test:unit` | **2.211 grün / 0 rot**, 276 Suiten |
| `npx vitest run` | **5.319 grün**, 38 übersprungen, 0 rot |
| `npx tsc --noEmit` | **0 Fehler** |
| `scripts/verify-payment-allocation-rueckzahlung.mjs` | **Exit 0 — alles grün** (live) |

Die 111 bestehenden PGlite-Suiten laufen mit dem erweiterten Shim unverändert
grün — die Erweiterungen sind additiv.

**Neue Testdateien:**

| Datei | Runner | Tests |
|---|---|---:|
| `lib/__tests__/geld-rundung-track2.test.ts` | node:test | 36 |
| `__tests__/billing/datev-export-pglite.test.ts` | vitest (PGlite) | 46 |
| `__tests__/billing/tarif-verifizierung-pglite.test.ts` | vitest (PGlite) | 41 |

---

## 6. Offene Punkte am Ende von Phase 6B

| # | Punkt | Art | Wer |
|---|---|---|---|
| 1 | 30 der 36 ungetesteten `lib/`-Module (P2/P3-Kategorien) stehen weiter aus | technisch | Agent |
| 2 | DATEV-**Storage**-Schicht (`erstelleDatevExport()`) ungeprüft — Shim bildet Supabase Storage nicht ab | benannte Grenze | Agent |
| 3 | `no_overlapping_tariffs` unter PGlite unbeweisbar (kein `btree_gist`) | benannte Grenze | — |
| 4 | 3× 7-Tage-Signaturlaufzeit (`documents`, `service-proofs`, OCR) | **BUSINESS_INPUT_REQUIRED** | Yusuf |
| 5 | `getOposListe()` zeigt Entwürfe im Forderungsbestand | **fachliche Entscheidung** | Yusuf |
| 6 | Geldpfade nie mit echtem Geld gelaufen (`payments` = 0, `camt_imports` = 0) | **EXTERN** | Yusuf |
| 7 | `RECHNUNGSVERSAND_AUTOMATISCH` / `MAHNVERSAND_AUTOMATISCH` nicht gesetzt | **EXTERN** (Vercel) | Yusuf |
| 8 | efy care: Buchung ohne Persistenz, Konto-Löschung TODO (DSGVO Art. 17) | funktional/rechtlich | Fremdrepo |
| 9 | efy care: Prod-Migrationsstand + Edge-Function-Secrets unverifiziert | Betrieb | Fremdrepo |

**Kein technischer P0 oder P1 aus dem Alltagsengel-Repo ist mehr offen.** Punkt 1
ist Abdeckungsarbeit in P2/P3-Modulen, 2 und 3 sind benannte Grenzen der
Testumgebung, 4–7 liegen außerhalb des Codes, 8 und 9 gehören einem anderen Repo.

---

## 7. Relevante Dateien

| Zweck | Pfad |
|---|---|
| Geldrundung-Durchsichtsprotokoll (inkl. ~60 nicht geänderter Stellen) | `docs/MONEY_ROUNDING_REVIEW_COMPLETE.md` |
| DATEV-/Tarif-Testbericht | `docs/DATEV_TARIF_PGLITE_TESTS.md` |
| Zentraler Geldkonverter | `lib/geld.ts` |
| Betragsparser (G-1) | `lib/admin/betrag.ts` |
| DATEV-Kontenrahmen (D-1, D-2) | `lib/billing/datev/kontenrahmen.ts` |
| DATEV-CSV-Format (D-1) | `lib/billing/datev/datev-format.ts` |
| PGlite-Shim | `__tests__/e2e/helpers/pglite-supabase.ts` |
| Schemaaufbau Kettentests | `__tests__/e2e/helpers/kette-schema.ts` |
| Migration (live) | `supabase/migrations/20261004000000_payment_allocation_rueckzahlung.sql` |
| Rollback dazu | `supabase/migrations/20261004000001_rollback_payment_allocation_rueckzahlung.sql` |
| Live-Verifikationsskript | `scripts/verify-payment-allocation-rueckzahlung.mjs` |
| Vorgänger-Bericht | `docs/reports/PHASE6A_TECHNICAL_PROGRESS.md` |

---

*Phase 6B abgeschlossen 25.08.2026 — Alltagsengel*
