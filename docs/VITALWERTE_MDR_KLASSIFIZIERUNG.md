# MDR-Klassifizierung: Vitalwerte-Grenzwertalarme

**Stand:** 2026-08-12  
**Betrifft:** B6 — Vitalwerte-Grenzwertalarme  
**Grundlage:** MDR (EU) 2017/745, MDCG-Guidance

---

## Fragestellung

Fällt die Alarmfunktion der Vitalwerte-Dokumentation unter die Medizinprodukteverordnung (MDR)?

---

## Aktuelle Implementierung

- **Dokumentation:** Vitalwerte (Blutdruck, Puls, Temperatur, SpO2, Blutzucker, Gewicht, Atemfrequenz, Schmerzskala, Trinkmenge, Ausscheidung) können erfasst und dokumentiert werden → **freigegeben**
- **Grenzwertalarme:** Feature-Flag `VITALS_GRENZWERT_ALARME_AKTIV` (Default: AUS) → **gesperrt bis MDR-Klärung**

---

## MDR-Analyse

### Wann ist Software ein Medizinprodukt?

Nach Art. 2 Abs. 1 MDR ist Software ein Medizinprodukt, wenn sie einen der folgenden Zwecke verfolgt:
1. Diagnose, Verhütung, Überwachung, Vorhersage, Prognose, Behandlung oder Linderung von Krankheiten
2. Untersuchung, Ersatz oder Veränderung der Anatomie oder eines physiologischen Vorgangs

### Klassifizierung der Alltagsengel-Funktionen

| Funktion | Medizinprodukt? | Begründung |
|----------|----------------|-----------|
| **Vitalwerte-Dokumentation** (reine Erfassung und Speicherung) | **NEIN** | Reine Dokumentation/Archivierung ohne diagnostische oder therapeutische Funktion. Vergleichbar mit Pflegedokumentation auf Papier. |
| **Grenzwertalarme** (Benachrichtigung bei Überschreitung) | **WAHRSCHEINLICH JA** | Software, die Vitalwerte analysiert und bei Abweichungen alarmiert, trifft eine klinische Entscheidung. Dies fällt unter die MDR-Regel 11 (Software als Medizinprodukt). |

### MDR-Regel 11 (Anhang VIII)

> Software, die dazu bestimmt ist, Informationen zu liefern, die zu Entscheidungen für diagnostische oder therapeutische Zwecke herangezogen werden, wird eingestuft als:
> - **Klasse IIa:** Wenn die Entscheidungen eine Diagnose oder Behandlung betreffen, die nicht zu einer Situation führen kann, die unmittelbar oder mittelbar lebensbedrohlich ist
> - **Klasse IIb:** Bei Gefahr einer irreversiblen Verschlechterung
> - **Klasse III:** Bei Lebensgefahr

### Einstufung der Grenzwertalarme

**Wahrscheinliche Klasse: IIa**

Begründung:
- Die Alarme dienen der Überwachung, nicht der unmittelbaren Lebensrettung
- Die Empfänger (Pflegekräfte/Angehörige) müssen selbst entscheiden, was zu tun ist
- Die Alarme ersetzen keine medizinische Überwachung (kein Monitoring-Gerät)
- Die Zielpopulation (§45b-Kunden mit Pflegegrad) wird nicht primär medizinisch betreut

**Aber:** Die exakte Klasse hängt von der konkreten Ausgestaltung ab:
- Reine „Merker" (gelbe Markierung im Dashboard): eher kein Medizinprodukt
- Push-Benachrichtigung mit Handlungsaufforderung: wahrscheinlich IIa
- Automatische Eskalation an Rettungsdienst: mindestens IIb

---

## Empfehlung

### Option A: Dokumentation ohne Alarm (AKTUELLER ZUSTAND)
- **MDR-Pflicht:** NEIN
- **Aufwand:** 0 (bereits implementiert)
- **Feature-Flag bleibt AUS**
- **Empfehlung für §45b-Start**

### Option B: Visuelle Hervorhebung (keine Push-Benachrichtigung)
- Werte außerhalb definierter Bereiche werden farblich markiert (rot/gelb)
- Kein aktiver Alarm, keine Benachrichtigung
- **MDR-Pflicht:** Grenzfall — eher NEIN, wenn keine Handlungsaufforderung
- **Aufwand:** Gering (UI-Änderung)
- **Risiko:** Niedrig, aber rechtliche Klärung empfohlen

### Option C: Aktive Alarmfunktion (Push/E-Mail)
- **MDR-Pflicht:** JA (Klasse IIa)
- **Erforderlich:** CE-Kennzeichnung, Qualitätsmanagementsystem nach ISO 13485, Technische Dokumentation, Klinische Bewertung, Benannte Stelle
- **Aufwand:** 50.000-150.000 €, 6-12 Monate
- **Empfehlung:** Nur wenn eigenständiges Medizinprodukt-Geschäftsmodell geplant

---

## Handlungsempfehlung

1. **Für §45b-Start: Option A beibehalten** (Dokumentation ohne Alarm)
2. **Feature-Flag `VITALS_GRENZWERT_ALARME_AKTIV` bleibt AUS**
3. **Farbliche Hervorhebung (Option B)** kann nach rechtlicher Klärung aktiviert werden
4. **Aktive Alarme (Option C)** erst nach MDR-Zertifizierung

---

## Kontakt für MDR-Beratung

- **BfArM (Bundesinstitut für Arzneimittel und Medizinprodukte):** https://www.bfarm.de/
- **Benannte Stellen (CE-Zertifizierung):** TÜV SÜD, TÜV Rheinland, DEKRA, BSI
- **MDCG-Guidance:** MDCG 2019-11 (Qualification and Classification of Software)
