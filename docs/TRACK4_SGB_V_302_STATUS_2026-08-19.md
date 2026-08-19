# Track 4 — Ambulante Pflege / SGB V / § 302: Statusbericht

**Stand:** 19.08.2026
**Umfang:** `lib/abrechnung/sgb-v/`, `app/api/billing/sgb-v/`, `app/admin/sgb-v/`, § 302-bezogene Migrationen und Tests
**Kurzfassung:** Die Pipeline ist gebaut und getestet. Abgerechnet werden kann **nicht** — der amtliche Datensatz-Generator ist gesperrt, weil die Technische Anlage nicht vorliegt. Track 4 hat vier Lücken geschlossen, durch die die vorhandenen Sperren teilweise wirkungslos waren.

---

## 1. Bestandsaufnahme — was existiert

| Modul | Zeilen | Zustand |
|---|---:|---|
| `positionen.ts` | 248 | vollständig — HKP-Leistungen → Fälle je (Kassen-IK, Klient) |
| `versionen.ts` | 160 | vollständig — Versionsregister, fail-closed ohne `spec_bestaetigt` |
| `routing.ts` | 105 | vollständig — Datenannahmestelle je Kassen-IK |
| `validierung.ts` | 211 | vollständig **(Track 4 erweitert)** |
| `generator.ts` | 107 | **absichtlich gesperrt** — wirft immer `SgbVSpecFehltError` |
| `versand.ts` | 400+ | vollständig **(Track 4 erweitert)** — Lauf, Statusmodell, Protokoll, Audit |
| `export-generator.ts` | 78 | vollständig — interner Prüf-Export, sichtbar als „KEIN AMTLICHER DATENSATZ" |
| `transport-adapter.ts` | 241 | Mock/File-Export nutzbar; Dakota/KIM gesperrt |
| `abrechnungslauf.ts` | 60 | Lese-Fassade für die Admin-UI |
| `storno-korrektur.ts` | 178 | vollständig — Zwei-Schritt-Muster mit Begründungspflicht |
| `zahlungsabgleich.ts` | 169 | vollständig — OPOS über `zahlungseingaenge.sgb_v_lauf_id` |
| `ruecklaufer-service.ts` | 95 | vollständig **(Track 4 korrigiert)** |
| `verordnung-service.ts` | 207 | vollständig |
| `leistungsnachweis-service.ts` | 209 | vollständig |
| `readiness.ts` | 177 | vollständig **(Track 4 korrigiert)** |

**API:** 14 Routen unter `/api/billing/sgb-v/` · **UI:** 7 Seiten unter `/admin/sgb-v/`

**Migrationen — alle live bestätigt** (per PostgREST gegen Produktion, 19.08.2026):

| Tabelle | Live | Zeilen |
|---|---|---:|
| `sgb_v_laeufe` | ja | 0 |
| `sgb_v_routing` | ja | **0** |
| `sgb_v_formatversionen` | ja | 3 |
| `sgb_v_korrekturlaeufe` | ja | 0 |
| `sgb_v_uebertragungsqueue` | ja | 0 |

Alle drei Formatversionen stehen live auf `spec_bestaetigt = false`, `spec_quelle = null`:
TA1 Version 21 (bis 01/2027), TA1 Version 22 (ab 02/2027), HKP-XML 1.3.0 (ab 02/2027).

---

## 2. Was Track 4 geändert hat

### 2.1 Tarifprüfung lief am Abrechnungslauf vorbei — **behoben**

`pruefeRegelwerk()` in `validierung.ts` enthielt die Fail-Closed-Regel „ohne verifizierten § 37-Tarif keine Kassenabrechnung". Die Funktion wurde **ausschließlich von Tests aufgerufen**. Der Produktivpfad (`versand.ts` → `ladeAufbereitung` → `bereiteHkpVor` → `pruefePosition`) kennt keine Preise — die Regel war damit wirkungslos.

Neu: `pruefeAufbereitungTarife()` prüft eine ganze Aufbereitung gegen `resolvePrice` und ist in **beiden** Lesepfaden eingehängt:
- `lib/abrechnung/sgb-v/versand.ts` — eigene Stufe vor Version, Routing und Gate; ein einziger fehlender Tarif hält den gesamten Lauf an (`gestoppt: 'tarif'`). Keine Teilabrechnung: stillschweigend weggelassene Positionen wären gegenüber der Kasse eine unvollständige Abrechnung, die wie eine vollständige aussieht.
- `app/api/billing/sgb-v/vorschau/route.ts` — der Trockenlauf zeigt jetzt dasselbe Ergebnis wie der echte Lauf (neue Felder `ohne_tarif`, `anzahl_faelle_vor_tarifpruefung`, `summe_cent_vor_tarifpruefung`).

Preise werden je (Leistungsart, Datum, Kassen-IK) einmal aufgelöst und geteilt.

**Wirkung heute:** der Lauf stoppt an dieser Stufe, weil keine § 37-Tarife hinterlegt sind. Das ist der korrekte Zustand, keine Regression — vorher stoppte er nur eine Stufe später am Generator und verdeckte die eigentliche Ursache.

### 2.2 Readiness zählte mandantenübergreifend — **behoben**

Der Punkt „Genehmigte HKP-Verordnungen" in `readiness.ts` filterte **nicht** nach `organization_id`. Da die Readiness mit einem `service_role`-Client läuft (RLS greift dort nicht), zählte sie die Verordnungen aller Mandanten. Eine Organisation ohne eigene HKP-Verordnung konnte den Punkt grün sehen.

### 2.3 Absender-IK wurde nie geladen — **behoben**

`versand.ts` übergab `absenderIk: ''` an `erzeugeSgbVDatei()`. Die Readiness prüft die IK, der Lauf tat es nicht. Sobald der Generator implementiert wird, wäre eine leere Absender-IK ins Kopfsegment einer echten Datei gelaufen.

Neu: die IK wird vor dem Generator aus `organizations.ik_nummer` geladen und auf neun Stellen geprüft; fehlt sie, stoppt der Lauf mit `gestoppt: 'stammdaten'`.

Live-Stand: nur `Alltagsengel UG` hat eine IK (`460629986`), die fünf Testmandanten haben keine.

### 2.4 § 302-Rückläufer erbten § 105-Fehlercodes — **behoben**

`dta_fehlercode_katalog` hat kein Verfahrensfeld. Alle 20 live gepflegten Einträge stammen aus dem Fehlerverzeichnis zur **§ 105 SGB XI**-Vereinbarung (`spec_quelle` = „TA1 6.5.1 Anlage 4 Fehlerverzeichnis"). Die Codes sind kurz und numerisch („01", „02", „03") und im § 302-Verfahren mit anderer Bedeutung belegt. Ein § 302-Rückläufer mit Code „02" hätte die Beschreibung „Nutzdatendatei fehlerhaft — EDIFACT-Struktur ungueltig" samt Maßnahme geerbt — eine unbelegte Behauptung über eine fremde Spezifikation.

Neu: `klassifiziereFehlercode()` nimmt eine **optionale** Verfahrensangabe (Default = unverändertes § 105-Verhalten). `importiereSgbVRuecklaeufer()` setzt fest `verfahren: 'sgb_v_302'`. Erkannt wird über `spec_quelle`, weil kein DDL-Zugang für ein eigenes Feld besteht.

Die Erkennung ist bewusst streng: „TA1" allein genügt nicht — beide Vereinbarungen haben eine Technische Anlage 1. **Konsequenz: die 20 heute gepflegten Einträge greifen für § 302 nicht** und ein § 302-Rückläufer bleibt unklassifiziert sichtbar auf dem Tisch. Das ist gewollt.

### 2.5 Neue Stopp-Gründe

`SgbVLaufErgebnis.gestoppt` kennt zusätzlich `'tarif'` und `'stammdaten'`. Beide führen zum Lauf-Status `validierung_fehlgeschlagen`, **nicht** zu `gesperrt_extern` — ein hausgemachter Pflegefehler darf nicht aussehen wie ein fehlender Kassenvertrag. Neues Ergebnisfeld: `ohneTarif`.

---

## 3. EXTERNAL_BLOCKER — nicht wegprogrammierbar

| # | Blocker | Zuständige Stelle | Blockiert |
|---|---|---|---|
| **EB-1** | **Technische Anlage 1 zur § 302 Abs. 2 SGB V-Vereinbarung** inkl. Schlüsselverzeichnisse (Leistungserbringergruppenschlüssel, Abrechnungspositionsnummern, Tarifkennzeichen) | GKV-Spitzenverband / gkv-datenaustausch.de | **Alles.** Ohne sie kein Segment-Builder, kein Validator, keine Datei. |
| **EB-2** | **Zulassung nach § 132a SGB V** (Versorgungsvertrag häusliche Krankenpflege) | Landesverbände der Krankenkassen | Jede Abrechnung — ohne Vertrag besteht kein Vergütungsanspruch |
| **EB-3** | **§ 37-Vergütungsvereinbarung** (Preise je Leistungskomplex) | Landesverbände der Krankenkassen | Tarifstufe (2.1). Keine Preise → kein Lauf. |
| **EB-4** | **Datenannahmestellen-Verzeichnis** je Krankenkasse | Kassenverzeichnisse | Routing-Stufe. `sgb_v_routing` ist live **leer** (0 Zeilen) und wird nicht geraten. |
| **EB-5** | **§ 302-Fehlerverzeichnis** (Anlage zur Vereinbarung) | GKV-Spitzenverband | Rückläufer-Klassifizierung bleibt bei „unbekannt" (s. 2.4) |
| **EB-6** | **ITSG-Zertifikat / SECON-Verschlüsselung** für den Transport | ITSG GmbH | Übertragung an die Datenannahmestelle |
| **EB-7** | **IK-Nummer** für Mandanten ohne eigene | Arbeitsgemeinschaft IK | Stammdaten-Stufe (2.3) |

**Reihenfolge:** EB-2 vor EB-3 vor EB-1. Ohne Versorgungsvertrag gibt es keine Vergütungsvereinbarung, ohne Preise keine abrechenbare Position — die Technische Anlage nützt ohne beides nichts.

---

## 4. Interne Restarbeit (nach Eintreffen von EB-1)

1. Segment-Builder nach TA1 (Vorbild: `lib/abrechnung/edifact-segments.ts` für PLGA/PLAA)
2. Validator (Vorbild: `edifact-validator.ts`)
3. `sgb_v_formatversionen.spec_bestaetigt = true` **mit** `spec_quelle` (Dokumentname + Stand)
4. `erzeugeSgbVDatei()` implementieren, `exportImplementiert()` auf `true`
5. Transportanschluss von `versand.ts` an den § 105-SFTP-Weg
6. `SGB_V_302_FREIGABE=true` — erst nach belegter Testübertragung

Die Sperren sind bewusst doppelt: `exportImplementiert()` **und** `erzeugeSgbVDatei()` müssen beide fallen. Ein versehentlich gesetztes `spec_bestaetigt` allein öffnet nichts.

---

## 5. Tests

Neu: `__tests__/abrechnung/sgb-v-302-track4.test.ts` — 12 Tests
- Tarif-Fail-Closed: Ablehnung ohne Tarif, Durchlass mit Tarif, Neuberechnung des Fallbetrags, Fall-Entfernung bei 0 verbleibenden Positionen, Position ohne Leistungsart, Cache-Wirksamkeit
- Verfahrenstrennung: Live-Quellenangabe → kein Verfahren, ausdrückliche § 302-/§ 105-Quellen, Katalogtreffer wird für § 302 verworfen, passender § 302-Eintrag greift

Bestand: `sgb-v-302.test.ts` (339 Z.), `sgb-v-302-erweiterung.test.ts` (153 Z.), `sgb-v-302-migration.test.ts` (157 Z.)

**Lauf 19.08.2026:** `__tests__/abrechnung/` → 19 Dateien, **337 Tests grün**. Volle Suite: 3091 grün. Typecheck (`tsc --noEmit`) fehlerfrei.

---

## 6. Was NICHT geprüft ist (UNVERIFIZIERT)

- **Kein Lauf gegen echte Daten.** `sgb_v_laeufe` ist live leer; die Kette wurde nie mit echten HKP-Leistungen durchlaufen. Alle Aussagen zur Pipeline stammen aus Unit-Tests und Code-Lektüre.
- **Der Generatorpfad ab „Datei erzeugt" ist toter Code.** Er ist per Konstruktion unerreichbar und daher unerprobt.
- **Die Formatangaben im Versionsregister** (TA1 V21/V22, HKP-XML 1.3.0 ab 02/2027) stammen aus der Projekt-Roadmap, nicht aus einem eingesehenen Dokument. Sie sind Platzhalter mit `spec_bestaetigt = false`.
- **Zahlungsabgleich und Storno** sind live nie gelaufen (0 Läufe, 0 Zahlungseingänge mit `sgb_v_lauf_id`).
