# Track 2 — Elektronische Kassenabrechnung: Stand 19.08.2026

Bestandsaufnahme, geschlossene Lücken und verbleibende Blocker der
EDIFACT-Abrechnung nach § 105 Abs. 2 SGB XI (`lib/abrechnung/`).

**Kurzfassung:** Die Verarbeitungskette ist technisch vollständig — von den
Leistungsdaten über PLGA/PLAA, Auftragsdatei und SECON-Verschlüsselung bis zum
Rückläufer-Import. Was fehlt, sind ausschließlich externe Zugänge. In diesem
Durchgang wurden vier inhaltliche Fehler gefunden und behoben, davon zwei, die
bei der ersten Echtlieferung zur Abweisung geführt hätten. Die Testabdeckung
des Formats stieg von faktisch null auf 200 Tests.

---

## 1. Bestandsaufnahme — was implementiert ist

| Baustein | Datei | Stand |
|---|---|---|
| Segment-Bausteine PLGA/PLAA v6 | `edifact-segments.ts` | vollständig (UNA…UNZ, FKT, REC, SRD, UST, GES, NAM, INV, NAD, MAN, ESK, ELS, IAF) |
| Nutzdaten-Generator | `edifact-generator.ts` | vollständig, gruppiert je Kostenträger und je Datenannahmestelle |
| Validator (Prüfstufen 1–3) | `edifact-validator.ts` | Struktur, Syntax, IK-/KVNR-Prüfziffern, Summenabgleich GES ↔ IAF ↔ ELS |
| Auftragsdatei (348-Byte-Satz) | `auftragsdatei.ts` | vollständig, jetzt zusätzlich mit Parser und Nachtrag |
| Schlüsselverzeichnis TA3 | `schluesselverzeichnis.ts` | Leistungsarten, Vergütungsarten, Qualifikationen, Tarifbereiche aller 16 Länder |
| Datenannahmestellen-Routing | `schluesselverzeichnis.ts` | 10 Annahmestellen, DB-Override je Organisation über `findeDatenannahmestelleAsync()` |
| Rückläufer-Parser SLGA/SLAA | `slga-parser.ts` | UNA-abhängige Trennzeichen, FHL/EHK, Typerkennung |
| Rückläufer-Import + Aufgaben | `ruecklaeufer*.ts` | Import, Zuordnung, Fehlerklassifizierung, Wiedervorlage |
| SECON-Verschlüsselung | `secon.ts` | PKCS#7, Absender-P12 + Empfängerzertifikat |
| Versandpipeline | `versand.ts`, `transport.ts` | SFTP mit Wiederholversuchen, Dead-Letter-Queue, Versandprotokoll |
| Testübertragungsmodus | `betriebsmodus.ts` | Dateiindikator 0/2, fail-closed, drei Sperren vor Echtbetrieb |
| Abrechnungslauf-Tracking | `kassenabrechnung-engine.ts` | 12 Status, Fehlerprotokoll, Content-Hash, Audit-Trail |
| Korrektur- und Stornoläufe | `korrekturlaeufe.ts` | Korrekturlieferungs-Kennung im logischen Dateinamen |

Das heißt: **kein Baustein der Kette fehlt.** Die im Auftrag genannten
Verdachtspunkte (Auftragsdatei-Generierung, Routing, IK-Prüfziffern,
Rückläufer, Testmodus, Lauf-Tracking) waren alle bereits vorhanden.

---

## 2. Geschlossene Lücken

### 2.1 Testlieferung wurde als Echtlieferung angekündigt (P0)

`kassenabrechnung-engine.ts` erzeugte die Auftragsdatei ohne den `test`-Schalter.
Ergebnis: bei Dateiindikator `0` hieß die Nutzdatendatei `TPFL0nnn`, die
Auftragsdatei nannte aber die Verfahrenskennung `EPFL0` — Echtlieferung. Die
Annahmestelle hätte eine Echtabrechnung angekündigt bekommen und die dazu
passende Nutzdatei nicht gefunden. Der Schalter hängt jetzt am selben
Dateiindikator wie der physikalische Dateiname.

Mit derselben Änderung werden nun auch Transfernummer, Art der abgegebenen
Leistung und der physikalische Dateiname in den Auftragssatz geschrieben — bis
dahin standen dort Vorgabewerte bzw. Leerzeichen.

### 2.2 Auftragsdatei beschrieb die unverschlüsselte Datei (P0)

Der Auftragssatz entsteht beim **Export**, die SECON-Verschlüsselung passiert
beim **Versand**. Dazwischen ändern sich drei Angaben im Satz: übertragene
Dateigröße, Verschlüsselungsart und elektronische Unterschrift. Die
Auftragsdatei ging bisher unverändert mit — sie meldete die Klartextgröße und
„keine Verschlüsselung", während eine PKCS#7-Nutzlast anderer Größe übertragen
wurde. Genau diese Felder gleicht die Annahmestelle gegen die gelieferte Datei
ab.

Neu in `auftragsdatei.ts`: `patcheAuftragsdatei()` trägt die erst beim Versand
bekannten Tatsachen längentreu nach, `parseAuftragsdatei()` liest einen Satz
zurück, `AUFTRAGSDATEI_FELDER` ist die gemeinsame Feldtabelle. `versand.ts`
ruft den Nachtrag direkt nach der Verschlüsselung auf und bricht ab, wenn der
gespeicherte Satz nicht die vorgeschriebenen 348 Bytes hat.

### 2.3 Doppelte Datenaustauschreferenz bei mehreren Dateien je Lauf

`generateAlleDateien()` gab jeder Datei des Laufs dieselbe
Datenaustauschreferenz aus den Optionen. Gehen zwei Dateien an dieselbe
Annahmestelle — etwa BITMARCK für BKK und für IKK — ist eine doppelte Referenz
ein Abweisungsgrund. Sie läuft jetzt parallel zur Dateinummer weiter.

### 2.4 Rückläufer-Parser schnitt Fehlertexte der Kassen ab

Der SLGA/SLAA-Parser zerlegt eine Antwortdatei in drei Stufen (Segment →
Element → Komponente) und entfernte das EDIFACT-Freigabezeichen schon in der
ersten Stufe. Ein maskiertes `?+` war danach ein gewöhnliches `+`, an dem die
zweite Stufe mitten im Text trennte. Aus der Begründung
`Betrag ?+ Zuschlag unzulässig` wurde das bloße `Betrag` — und alle Folgefelder
rutschten ein Feld nach vorn, sodass der Schweregrad im Segmentfeld landete.
Betroffen war jeder Kassentext mit `+`, `:` oder `'`.

Die Maskierung bleibt jetzt bis nach der letzten Zerlegungsstufe stehen und
fällt erst in `entmaskiere()` weg. Vier Regressionstests halten das fest.

---

## 3. Tests

200 neue Tests in `lib/abrechnung/__tests__/`, alle über `npm run test:unit`
(node:test). Vorher gab es für das EDIFACT-Format selbst keinen einzigen Test —
geprüft wurden nur Status-Enums und die Admin-UI-Absicherung.

| Suite | Tests | Prüft |
|---|---:|---|
| `edifact-segments.test.ts` | 35 | jedes Segment zeichengenau, Maskierung, Betrags-/Mengenformat |
| `edifact-validator.test.ts` | 34 | IK-/KVNR-Prüfziffern, Dateistruktur, Summenabgleich, Pflichtsegmente |
| `edifact-generator.test.ts` | 31 | Erzeugung + Roundtrip gegen den Validator, Gruppierung, Fail-closed |
| `slga-parser.test.ts` | 32 | Rückläufer-Typerkennung, Beträge, Fehlersegmente, Maskierung |
| `auftragsdatei.test.ts` | 22 | Feldtabelle lückenlos, 348 Bytes, Test-/Echtkennung, Nachtrag |
| `schluesselverzeichnis.test.ts` | 19 | Prüfziffern aller Katalog-IKs, Kassenerkennung, Tarifkennzeichen |
| `betriebsmodus.test.ts` | 15 | die drei Sperren vor dem Echtbetrieb, einzeln und in ihrer Reihenfolge |
| `ruecklaeufer-fehlercodes.test.ts` | 12 | Heuristik, und dass Unbelegtes „unbekannt" bleibt |

Zwei Prüfungen tragen dabei mehr als ihre Zeilenzahl:

- **Generator ↔ Validator gekoppelt.** Jede erzeugte Datei muss die eigene
  Validierung bestehen. Das fängt jede Änderung, die nur eine der beiden
  Seiten anfasst.
- **Feldtabelle der Auftragsdatei lückenlos.** Der Test rechnet die 348 Bytes
  aus den Feldoffsets nach; eine Verschiebung um ein Byte fällt sofort auf
  statt erst bei der Annahmestelle.

Gesamtlauf: **768 Tests grün**, `tsc --noEmit` fehlerfrei.

---

## 4. EXTERNAL_BLOCKER — was ohne Dritte nicht geht

Alle vier Blocker sperren **nur die Übertragung**. Erzeugung, Validierung,
Verschlüsselung, Testmodus und Rückläufer-Verarbeitung laufen ohne sie.

### EXTERNAL_BLOCKER 1 — ITSG-Zertifikat
- **Stelle:** ITSG Trust Center
- **Sperrt:** SECON-Verschlüsselung mit einem echten Absenderzertifikat, damit den gesamten Versand nach § 105
- **Schalter:** `ITSG_ZERTIFIZIERT=true` (`lib/abrechnung/externe-freigaben.ts`)
- **Vorbedingung:** § 45a-Anerkennung im Bundesland; IK 460629986 liegt vor
- **Danach einzutragen:** PKCS#12 über Admin → Abrechnung → Einstellungen, `SECON_ZERT_PASSWORT` in Vercel

### EXTERNAL_BLOCKER 2 — DTA-/SFTP-Zugang je Datenannahmestelle
- **Stelle:** jede Annahmestelle einzeln (ITSCare, BITMARCK, T-Systems, DDG, DAVASO, ARZ Emmendingen)
- **Sperrt:** den Transportweg; ohne `sftp_host` + `sftp_user` bleibt der Auftrag auf Status `externer_zugang_fehlt` stehen
- **Danach einzutragen:** SSH-Key über Admin → Annahmestellen, Verbindungsdaten in `datenannahmestellen`

### EXTERNAL_BLOCKER 3 — Kassenverträge und Vergütungsvereinbarung
- **Stelle:** Landesverbände der Pflegekassen (Hessen)
- **Sperrt:** die Tarifverifizierung. `billing_tariffs.tarif_status` steht überwiegend auf `unverified`, der Preis-Resolver ist fail-closed. Die 35 €/h-Tarife bleiben `blocked` — sie liegen über den PfluV-Obergrenzen (30 €/h Betreuung, 25 €/h Hauswirtschaft)
- **Anmerkung:** technisch nichts zu tun; es fehlt der belegte Vertragspreis

### EXTERNAL_BLOCKER 4 — Testübertragung mit der Annahmestelle
- **Stelle:** die jeweilige Datenannahmestelle
- **Sperrt:** den Wechsel von Dateiindikator `0` auf `2`. `pruefeUmschaltung()` verlangt Datum **und** Beleg der bestandenen Testübertragung, zusätzlich zum offenen Env-Gate und zum Bestätigungswort `ECHTBETRIEB`
- **Reihenfolge:** Blocker 1 und 2 zuerst — ohne Zugang gibt es keine Testübertragung

### Nachrangig: § 302 SGB V (häusliche Krankenpflege)
`lib/abrechnung/sgb-v/generator.ts` wirft absichtlich immer
(`SgbVSpecFehltError`), weil die Technische Anlage 1 zur § 302-Vereinbarung
nicht vorliegt. Das ist ein eigener Blocker mit eigenem Schalter
(`SGB_V_302_FREIGABE`) und berührt die Pflegeabrechnung nach § 105 nicht.

---

## 5. Bekannte Grenzen (kein Blocker, aber offen)

- **Fehlercode-Katalog** (`dta_fehlercode_katalog`): gepflegte Einträge stammen aus dem § 105-Fehlerverzeichnis. Bis echte Rückläufer eingehen, greift für fremde Codes nur die Heuristik — die für Unbelegtes bewusst `unbekannt` liefert statt zu raten.
- **Datenannahmestellen-Tabelle**: Stand der TP6-Broschüre vom 15.07.2026. Maßgeblich bleibt die aktuelle Kostenträgerdatei; Abweichungen gehören in die DB-Tabelle `datenannahmestellen`, nicht in den Code.
- **Eine Leistungsart je PLGA**: der Generator wählt bei gemischten Fällen die häufigste Art und warnt. Sauberer wäre eine Aufteilung auf getrennte Nachrichten — bis die erste Abrechnung mit gemischten Arten ansteht, reicht die Warnung.
- **Beschäftigtennummern** nach § 293 Abs. 8 SGB V liegen nicht vor; es wird der Ersatzwert gesetzt. Das ist zulässig, kann aber von einzelnen Kassen moniert werden.

---

## 6. Nächster technischer Schritt

Sobald Blocker 1 und 2 vorliegen: Testlauf über `POST /api/billing/dta/dry-run`
erzeugen, Datei und Auftragssatz herunterladen, mit der Annahmestelle die
Testübertragung mit Indikator `0` vereinbaren. Erst nach deren schriftlicher
Bestätigung über Admin → Abrechnung auf Echtbetrieb umschalten — der
Umschalter verlangt den Beleg und nimmt kein Datum ohne Referenz an.
