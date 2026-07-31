# Kostenträger-Datenbank Hessen — Recherche-Report

**Stand:** 31.07.2026 · **Eingetragen in:** Alltagsengel Supabase (`nnwyktkqibdjxgimjyuq`) **und** efy care Supabase (`nsfbwhpjesmathsrqkfi`), Tabellen `kostentraeger_kontakte` (je 21 Zeilen) und `leistungspreise` (je 24 Zeilen).

---

## 1. Kostenträger (kostentraeger_kontakte)

Jede Krankenkasse wurde **doppelt** angelegt: einmal als `krankenkasse`, einmal als `pflegekasse` — mit den jeweils korrekten IK-Nummern. Die GKV-Systematik ist durchgängig: **Pflegekassen-IK = Krankenkassen-IK mit „18" statt „10" am Anfang** (bei allen recherchierten Kassen bestätigt).

| Kasse | IK Krankenkasse | IK Pflegekasse | Adresse | Status |
|---|---|---|---|---|
| AOK Hessen | 105313145 | 185313145 | Basler Str. 2, 61352 Bad Homburg (Post: 64520 Groß-Gerau) | ✅ verifiziert (aok.de/gp) |
| BARMER | 104940005 | 184940005 | 42283 Wuppertal · HKP-Abrechnung Hessen: Gottlieb-Daimler-Str. 19, 73529 Schwäbisch Gmünd | ✅ verifiziert (barmer.de) |
| TK | 101575519 | 181575519 | Bramfelder Str. 140, 22305 Hamburg (Post: 20908 Hamburg) | ✅ verifiziert (tk.de) |
| DAK-Gesundheit | 105830016 | 185830016 | Nagelsweg 27-31, 20097 Hamburg | ✅ verifiziert (dak.de) |
| IKK classic | 107202793 | 187202793 | Tannenstr. 4b, 01099 Dresden | ✅ verifiziert — **Achtung: zentrale IKs erst seit 07/2026, Vorgänger-IKs laufen aus** |
| KNAPPSCHAFT | 109905003 (West) | 189905003 | Pieperstr. 14-28, 44789 Bochum | ✅ verifiziert |
| VIACTIV | 104526376 | 184526376 | Universitätsstr. 43, 44789 Bochum | ✅ verifiziert |
| hkk | 103170002 | 183170002 | Martinistr. 26, 28195 Bremen (Post: 28185) | PK-IK ✅ verifiziert, KK-IK aus 18→10-Systematik abgeleitet |
| Salus BKK (größte hessische BKK) | 105330168 (West) | 185330168 | 63263 Neu-Isenburg | KK-IK ✅ verifiziert, PK-IK abgeleitet → vor Erstabrechnung prüfen |
| Merck BKK | 105230076 | 185230076 | 64293 Darmstadt | KK-IK ✅ verifiziert, PK-IK abgeleitet → vor Erstabrechnung prüfen |
| Jugend- und Sozialamt Frankfurt | — | — | Eschersheimer Landstr. 241-249, 60320 Frankfurt, Tel 069 212-44900, jugend-und-sozialamt@stadt-frankfurt.de | ✅ verifiziert (frankfurt.de) · Typ `sozialamt`, nicht elektronisch abrechenbar |

**E-Mail-Hinweis:** Kassen veröffentlichen keine Abrechnungs-E-Mail-Adressen — Abrechnung läuft **verpflichtend elektronisch** über DTA nach §302 SGB V / §105 SGB XI (Datenannahmestellen), nicht per Mail. Eingetragene Mails sind allgemeine Service-Adressen (in `notes` gekennzeichnet). BARMER hat zusätzlich KIM: `barmer@barmer-kim.kim.telematik`.

**AOK Harburg-Buxtehude ist NICHT dabei** (Fake-Verzeichnis-Thema, irrelevant für Kostenträger).

---

## 2. Leistungspreise Hessen (leistungspreise)

### Wichtigste Erkenntnis zur Hessen-Systematik
Hessen hat **keine landesweiten Festpreise pro Leistungskomplex**. Es gilt die Vergütungssystematik **M 5.1** (Anlage zur Vergütungsvereinbarung nach §89 SGB XI, vdek Hessen): Jedem LK ist eine **Punktzahl** zugeordnet, der **Punktwert (€/Punkt) wird individuell pro Pflegedienst mit den Kassenverbänden verhandelt** (AOK Hessen, vdek, BKK LV Süd, IKK classic, Knappschaft gemeinsam).

Als **Referenz-Punktwert** wurde **0,08034 €/Punkt** verwendet (realer, veröffentlichter Hessen-§89-Vertragswert gültig ab 01.01.2025). Die eingetragenen Cent-Beträge = Punktzahl × 0,08034 €, gerundet. **Für die eigene Abrechnung gilt der selbst verhandelte Punktwert — Werte dann aktualisieren!**

### Eingetragene Leistungskomplexe (M 5.1, Hessen — Punktzahlen amtlich aus vdek-Anlage)

| LK | Leistung | Punkte | Preis (Referenz) |
|---|---|---|---|
| LK1 | Kleine Körperpflege (inkl. Wahlleistungen) | 400 | 32,14 € |
| LK2 | Große Körperpflege m. Ganzkörperwäsche/Dusche | 510 | 40,97 € |
| LK3 | Große erweiterte Körperpflege (Vollbad) | 610 | 49,01 € |
| LK4 | Spezielle Lagerung | 100 | 8,03 € |
| LK5 | Umfangreiche Hilfe bei Ausscheidungen | 150 | 12,05 € |
| LK6 | Einfache Hilfe bei der Nahrungsaufnahme | 100 | 8,03 € |
| LK7 | Umfangreiche Hilfe bei der Nahrungsaufnahme | 250 | 20,09 € |
| LK8 | Verabreichung von Sondenkost | 150 | 12,05 € |
| LK9 | Hilfestellung Aufstehen/Zubettgehen | 100 | 8,03 € |
| LK10 | Verlassen/Wiederaufsuchen der Wohnung | 120 | 9,64 € |
| LK11 | Mobilisation in der Wohnung | 120 | 9,64 € |
| LK12 | Begleitung bei Aktivitäten (15-Min-Takt) | 150 | 12,05 € |
| LK13 | Haushaltsführung (50 P = 5 Min, Grundwert 150 P) | 150 | 12,05 € |
| LK14 | Pflegerische Betreuung (100 P = 10 Min, Grundwert 300 P) | 300 | 24,10 € |
| LK15 | Pflegefachliche Anleitung (Grundwert 150 P, max. 1.200 P/Monat) | 150 | 12,05 € |
| LK16 | Erstgespräch Pflegefachkraft | 900 | 72,31 € |
| LK17 | Folgegespräch bei Pflegegradänderung | 300 | 24,10 € |
| LK18 | **Beratungseinsatz §37 Abs. 3 SGB XI** | Festpreis | **75,00 €** (amtlich, M 5.1) |
| LK19/LK20 | Hausbesuchspauschale / erhöhte HBP (Nacht/WE/Feiertag) | individuell vereinbart | nicht eingetragen |
| LK21 | Einsatz 2. Pflegekraft | wie erbrachte Leistung | nicht eingetragen |

Hinweis: Es gibt in Hessen **keine LK1–LK35** — die M 5.1-Systematik endet bei LK21.

Zusätzlich mit App-kompatiblen Slugs eingetragen: `kleine_koerperpflege` (32,14 €), `grosse_koerperpflege` (40,97 €), `hilfe_ausscheiden` (12,05 €), `hauswirtschaft` (12,05 €), `alltagsbegleitung_45a` (25,00 €/h), `entlastung_45b` (131,00 €/Monat).

### §45a Alltagsbegleitung (Kerngeschäft Alltagsengel)
- Rechtsgrundlage in Hessen: **Pflegeunterstützungsverordnung (PfluV)**, Anerkennung für Frankfurt durch den **Magistrat der Stadt Frankfurt** (frankfurt.de → „Anerkennung und Förderung nach §45a SGB XI").
- Aktuelle Entgeltgrenze: für **Angebote zur Entlastung im Alltag max. 25 €/Stunde inkl. USt.**; generell müssen Entgelte **unter den §89-Sätzen der Pflegedienste** liegen. → Eingetragen: 2.500 Cent/h.
- **Wichtig (02.04.2026):** Hessen hat eine PfluV-Novelle in der Verbändeanhörung — die **starren Vergütungsgrenzen sollen fallen** (Orientierung dann an Preisen zugelassener Pflegeeinrichtungen), gewerbliche Anbieter und Einzelpersonen werden ausdrücklich zugelassen, Basisqualifikation per E-Learning. Das ist für Alltagsengel eine Chance auf höhere Stundensätze — beobachten!

### Entlastungsbetrag §45b
- **131 €/Monat** seit Pflegereform 01.01.2025 (NICHT 125 €) — so eingetragen (`entlastung_45b`, 13.100 Cent, gültig ab 2025-01-01).
- Zusätzlich umwandelbar: bis **40 % der ambulanten Sachleistung** (§45a Abs. 4 Umwandlungsanspruch).

---

## 3. Quellen
- vdek Hessen: „Leistungsbeschreibung und Vergütungsregelung ambulante Pflege Hessen" (M 5.1) + Mustervergütungsvereinbarung GVWG — vdek.com/LVen/HES
- AOK Gesundheitspartner (IK-Merkblatt, Positionsnummern-Systematik Hessen §105 SGB XI) — aok.de/gp
- Kassenprofile: krankenkassen-direkt.de, krankenkasseninfo.de, pflegehilfsmittelparadies.de, sanubi.de (IK-Nummern jeweils gegengeprüft)
- Stadt Frankfurt: frankfurt.de (Jugend- und Sozialamt; §45a-Anerkennung)
- Hessische Landesregierung: hessen.de Pressemitteilung 02.04.2026 (PfluV-Novelle)
- PfluV Hessen mit Begründung — dvlab.de/hessen

## 4. Offene Punkte / Empfehlungen
1. **Eigenen Punktwert verhandeln:** Sobald Alltagsengel/efy einen §89-Vertrag hat, Referenzpreise durch echte Vertragswerte ersetzen (`leistungspreise` per `gueltig_ab` versionieren).
2. **Abgeleitete Pflegekassen-IKs** (hkk KK-IK, Salus BKK PK, Merck BKK PK) bei Erstabrechnung einmal telefonisch bestätigen — in `notes` markiert.
3. **DTA-Anbindung:** Alle GKV-Kassen sind als `elektronisch_abrechenbar = true` markiert; Abrechnung §105 SGB XI läuft über die Datenannahmestellen der Kassenarten (Alltagsengel-IK 460629986 liegt vor).
4. **IKK classic:** ausschließlich die neuen zentralen IKs verwenden (107202793 / 187202793) — Alt-IKs der Vorgängerkassen werden seit 01.07.2026 abgeschaltet.
