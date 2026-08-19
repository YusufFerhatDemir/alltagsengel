# Simulationscheck — erscheint irgendwo eine Simulation als echte Produktivfunktion?

**Stand:** 19.08.2026 · **Prüfer:** Code-Audit mit Verhaltenstests
**Regressionswächter:** `__tests__/simulationscheck.test.ts` (21 Prüfungen, alle grün)

> **Ausgangsfrage.** An fünf Stellen kann dieses System etwas tun, das wie Produktivbetrieb
> aussieht, ohne es zu sein: eine EDIFACT-Datei mit Echtdatei-Indikator, eine simulierte
> KIM-Zustellung, ein § 302-Lauf ohne verifizierte Tarife, ein DTA-Transport ohne Gegenstelle,
> ein Zertifikat ohne ITSG. Geprüft wurde nicht, ob es Sicherungen *gibt*, sondern ob sie an
> jedem Weg liegen, der zum Ergebnis führt.

## Gesamtergebnis

| # | Punkt | Ergebnis |
|---|---|---|
| 1 | EDIFACT-Testlieferung (Dateiindikator, Verfahrenskennung) | **VERIFIZIERT** — mit einem behobenen Befund |
| 2 | KIM simulierte Zustellung (`metadata.kim_simulation`) | **VERIFIZIERT** |
| 3 | § 302 SGB V — Stopp bei fehlenden verifizierten Tarifen | **VERIFIZIERT** |
| 4 | DAKOTA/DTA — keine vorgetäuschte Verbindung | **VERIFIZIERT** |
| 5 | ITSG — kein Fake-Zertifikat | **VERIFIZIERT** |

Ein Befund war zu beheben (1.4). Er hätte nicht heute geschadet, sondern in dem Moment, in dem
das Gate aufgeht — die gefährlichste Sorte.

---

## 1. EDIFACT-Testlieferung — VERIFIZIERT (ein Befund behoben)

**Die Sicherung.** Im UNB-Kopfsegment steht ein Dateiindikator: `0` = Testdatei, `2` = Echtdatei.
Die Annahmestelle verarbeitet eine `0` folgenlos und eine `2` als Forderung.

| Prüfpunkt | Datei/Zeile | Ergebnis |
|---|---|---|
| 1.1 Indikator kommt aus dem Betriebsmodus, nicht vom Aufrufer | `lib/abrechnung/kassenabrechnung-engine.ts:853-854` | **VERIFIZIERT** — `await dateiindikatorFuer(supabase, lauf.organization_id, 'sftp_105')`; ohne `organization_id` fällt es auf `'0'` |
| 1.2 Ohne hinterlegten Modus gilt Testbetrieb | `lib/abrechnung/betriebsmodus.ts:99-117, 147-152` | **VERIFIZIERT** — fehlende Zeile, Lesefehler und unbekannte Organisation enden alle bei `'0'`; die Funktion wirft nie |
| 1.3 Gate zu ⇒ Indikator bleibt `0`, auch bei Modus „produktion" | `lib/abrechnung/betriebsmodus.ts:152` | **VERIFIZIERT** — `modus === 'produktion' && gateOffen ? '2' : '0'` |
| 1.4 Default des Generators | `lib/abrechnung/edifact-generator.ts:247`, `lib/abrechnung/edifact-segments.ts:77` | **PROBLEM → BEHOBEN** (siehe unten) |
| 1.5 Verfahrenskennung der Auftragsdatei folgt dem Indikator | `lib/abrechnung/kassenabrechnung-engine.ts:941, 947` | **VERIFIZIERT** — `istTestlieferung = dateiindikator === '0'` wird als `test:` an `generateAuftragsdatei()` gereicht |
| 1.6 Physikalischer Dateiname folgt dem Indikator | `lib/abrechnung/edifact-generator.ts:192, 404` | **VERIFIZIERT** — `TPFL0nnn` bei `0`, `EPFL0nnn` bei `2` |
| 1.7 § 302 darf herunterstufen, nie heraufstufen | `lib/abrechnung/sgb-v/versand.ts:151-153` | **VERIFIZIERT** — ein API-Parameter kann `'0'` erzwingen, aber niemals `'2'` erzeugen |
| 1.8 Umschalten auf Echtbetrieb ist dreifach gesperrt | `lib/abrechnung/betriebsmodus.ts:227-265` | **VERIFIZIERT** — Env-Gate offen **und** belegte Testübertragung (Datum + Referenz der Annahmestelle) **und** getipptes Wort `ECHTBETRIEB`; Rückweg nach `test` braucht nur eine Begründung |

### Befund 1.4 — Fail-open-Default beim Dateiindikator (behoben)

`generateEDIFACT()` setzte ohne ausdrückliche Angabe `'2'` (Echtdatei), ebenso der
Segment-Builder `UNB()`. Der einzige Produktivaufrufer setzt den Wert immer korrekt — der Default
griff also nur im Vergessensfall. Genau dann aber wäre die Vergesslichkeit zur Forderung gegen
eine Kasse geworden.

Die Richtung war falsch herum: der teurere Fehler ist die versehentliche Echtdatei.

```
lib/abrechnung/edifact-generator.ts:247   optionen.dateiindikator ?? '2'  →  ?? '0'
lib/abrechnung/edifact-segments.ts:77     dateiindikator = '2'            →  = '0'
```

Ein Test hielt die alte Erwartung ausdrücklich fest („UNB ohne Angabe erzeugt eine Echtdatei").
Er ist auf die sichere Erwartung umgestellt, ein zweiter Test im Generator kam dazu.
**101/101 EDIFACT-Tests grün.**

---

## 2. KIM — simulierte Zustellung ist gekennzeichnet — VERIFIZIERT

**Die Gefahr.** Eine Zeile mit `status='zugestellt'` sieht aus wie eine echte KIM-Zustellung an
eine Arztpraxis — in einem Postfach, das im Gesundheitswesen als Zustellnachweis gilt.

| Prüfpunkt | Datei/Zeile | Ergebnis |
|---|---|---|
| 2.1 Simulierende Provider bekennen sich | `lib/kim/mock-provider.ts:91`, `lib/kim/test-provider.ts:67` | **VERIFIZIERT** — beide melden `isSimulated: true` |
| 2.2 Marker wird am Ort des Statuswechsels gesetzt (Ausgang) | `lib/kim/outbox-service.ts:73-74, 105, 133, 203-204, 226` | **VERIFIZIERT** — an allen fünf schreibenden Stellen |
| 2.3 Marker auch beim Abruf (Eingang) | `lib/kim/inbox-service.ts:39-40, 65` | **VERIFIZIERT** |
| 2.4 Marker-Inhalt ist für Menschen lesbar | `lib/kim/versandmodus.ts:37-49, 106-115` | **VERIFIZIERT** — `metadata.kim_simulation` trägt `simuliert`, Providertyp, Bezeichnung, Zeitpunkt und den Klartext „…ist KEIN Zustellnachweis" |
| 2.5 Marker überlebt spätere Bearbeitung | `lib/kim/versandmodus.ts:125-132` | **VERIFIZIERT** — `mitSimulationsMarker()` führt zusammen, entfernt nie |
| 2.6 Gate offen + Simulator wird hart abgewiesen | `lib/kim/versandmodus.ts:83, 96-100` | **VERIFIZIERT** — `pruefeVersandModus()` wirft `KimBetriebsmodusError`; verhaltensgetestet mit `KIM_AKTIV=true` |
| 2.7 Die Oberfläche zeigt die Kennzeichnung | `app/admin/kim/outbox/page.tsx:65` | **VERIFIZIERT** — `istSimulierteNachricht(m.metadata)` |
| 2.8 Echtes Senden bleibt gesperrt | `lib/kim/provider-factory.ts:28`, `lib/kim/versand.ts:90` | **VERIFIZIERT** — `createKimProvider()` wirft für `kim_plus`/`kim_basis`, der Block-18-Pfad wirft bedingungslos |

Der Marker ist ein **Zusatz zur Wahrheit**, kein Ersatz für sie: er erlaubt nichts, er verhindert
nur, dass eine Simulation wie Echtbetrieb aussieht.

---

## 3. § 302 SGB V — Tarifprüfung hält den Lauf an — VERIFIZIERT

| Prüfpunkt | Datei/Zeile | Ergebnis |
|---|---|---|
| 3.1 Tarifprüfung läuft vor dem Lauf, nicht daneben | `lib/abrechnung/sgb-v/versand.ts:167-168` | **VERIFIZIERT** — `pruefeAufbereitungTarife()` als eigene Stufe über der synchronen Aufbereitung |
| 3.2 Schon **eine** Position ohne verifizierten Tarif stoppt | `lib/abrechnung/sgb-v/versand.ts:295-306` | **VERIFIZIERT** — `return stoppe('tarif', …)` |
| 3.3 Keine stille Teilabrechnung | `lib/abrechnung/sgb-v/versand.ts:288-294` (Kommentar) | **VERIFIZIERT** — die betroffenen Positionen wegzulassen wäre gegenüber der Kasse eine unvollständige Abrechnung, die vollständig aussieht; das ist ausdrücklich ausgeschlossen |
| 3.4 Der Lauf wird trotzdem protokolliert | `lib/abrechnung/sgb-v/versand.ts:183-193` | **VERIFIZIERT** — bei Tarif-Stopp ist `faelle` leer, Kassenname und Monat stehen trotzdem am Lauf |
| 3.5 Der Generator wirft ohne Technische Anlage 1 | `lib/abrechnung/sgb-v/generator.ts:97` | **VERIFIZIERT** — `SgbVSpecFehltError`; ohne TA1 entsteht keine Datei |
| 3.6 Zusätzliches Env-Gate | `lib/abrechnung/externe-freigaben.ts` (`SGB_V_302_FREIGABE`) | **VERIFIZIERT** — sperrt Erzeugung **und** Versand |

Der Status „verifiziert" eines Tarifs ist selbst belegpflichtig
(`billing_tariffs.tarif_status`, Migration 20260831040000) — es genügt nicht, dass ein Preis
eingetragen ist.

---

## 4. DAKOTA/DTA — keine vorgetäuschte Verbindung — VERIFIZIERT

| Prüfpunkt | Datei/Zeile | Ergebnis |
|---|---|---|
| 4.1 Echter SFTP-Client, kein Stub | `lib/abrechnung/transport.ts:15` | **VERIFIZIERT** — `import SftpClient from 'ssh2-sftp-client'`; kein Simulations- oder Mock-Pfad in der Datei |
| 4.2 Kein Erfolg ohne Schlüsselmaterial | `lib/abrechnung/transport.ts:95` | **VERIFIZIERT** — „weder SSH-Key noch Passwort konfiguriert" wirft, bevor eine Verbindung versucht wird |
| 4.3 Bundesland-Freischaltung wird geprüft | `lib/abrechnung/transport.ts:70-77` | **VERIFIZIERT** — `DAKOTA_NICHT_FREIGESCHALTET`, mit dem ausdrücklichen Satz „es entsteht keine Forderung" |
| 4.4 Der KIM-Transportweg meldet keinen Erfolg | `lib/abrechnung/transport.ts:239-242` | **VERIFIZIERT** — `sendePerKIM()` wirft, statt `{erfolg: true}` zurückzugeben |
| 4.5 Aufträge ohne Zugang bleiben als solche erkennbar | `lib/abrechnung/kassenabrechnung-engine.ts` (DAKOTA-Auftragsstatus) | **VERIFIZIERT** — Status `externer_zugang_fehlt` statt `bereit_zur_uebermittlung` |

Erzeugung, SECON-Verschlüsselung und Validierung laufen weiter — das ist gewollt und harmlos,
solange die erzeugte Datei den Indikator `0` trägt (siehe 1).

---

## 5. ITSG — kein Fake-Zertifikat — VERIFIZIERT

| Prüfpunkt | Datei/Zeile | Ergebnis |
|---|---|---|
| 5.1 Es wird kein Zertifikat erzeugt | `lib/abrechnung/zertifikate.ts` | **VERIFIZIERT** — `node-forge` wird ausschließlich lesend benutzt (`certificateFromPem`, `certificateFromAsn1`); kein `createCertificate`, kein Selbstsignieren |
| 5.2 Kein Zertifikat im Repository | `git ls-files` | **VERIFIZIERT** — einzige Zertifikatsdatei ist `native/AppleWWDRCAG3.cer` (Apple-Root für den App-Store-Build), nichts ITSG-Bezogenes |
| 5.3 Kein Ersatzweg ohne hinterlegtes Zertifikat | `lib/abrechnung/zertifikate.ts:349, 370` | **VERIFIZIERT** — fehlendes `SECON_ZERT_PASSWORT` und fehlendes Absenderzertifikat werfen beide |
| 5.4 Das Gate ist keine Produktentscheidung | `lib/abrechnung/externe-freigaben.ts:161` | **VERIFIZIERT** — `ITSG_ZERTIFIZIERT` ist eine Env-Variable, kein Feature-Flag in der Datenbank; nur der exakte String `'true'` schaltet frei |
| 5.5 Ein offenes Gate ersetzt keine Prüfung | `lib/abrechnung/externe-freigaben.ts` (Kopfkommentar), `lib/abrechnung/readiness.ts:202-233` | **VERIFIZIERT** — Reihenfolge Readiness → Zertifikat/Schlüssel → Gate → Übertragung |

---

## Was diese Prüfung nicht abdeckt

- **Die Datenbank.** Ob in `abrechnung_betriebsmodus` produktiv eine Zeile mit `modus='produktion'`
  steht, ist hier nicht geprüft — mit geschlossenem Gate wäre sie folgenlos (1.3), aber die
  Betriebsansicht unter `/admin/kassenabrechnung/betrieb` zeigt es an.
- **Altbestand.** KIM-Nachrichten, die vor Track 5 (19.08.2026) über den Simulator liefen, tragen
  den Marker nicht — er wird beim Schreiben gesetzt, nicht rückwirkend.
- **Die Auftragsdatei selbst.** Dass `generateAuftragsdatei()` das `test`-Flag korrekt in die
  Verfahrenskennung umsetzt, ist über den Aufruf geprüft, nicht über eine von der Annahmestelle
  bestätigte Datei. Das kann nur die Testübertragung zeigen.

## Damit es so bleibt

`__tests__/simulationscheck.test.ts` hält alle fünf Punkte fest — teils als Verhaltenstest
(Indikator, KIM-Modus, Marker), teils am Quelltext, wo die Sicherung eine *Abwesenheit* ist
(dass `sendePerSFTP` keinen verbindungslosen Erfolgspfad hat, lässt sich nicht aufrufen).

```
npx vitest run __tests__/simulationscheck.test.ts     # 21 Prüfungen
```
