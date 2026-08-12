# Qualitätsanforderungen an eUL-Erbringer

**Stand:** 2026-08-12 · **Block:** 15d
**Maschinenlesbarer Katalog:** `lib/coach/eul.ts` (`EUL_QUALITAETSKRITERIEN`)
**Nachweisführung:** `eul_qualifikationen`, `/admin/eul` → Qualifikation der Erbringer

---

## 1. Herkunft der Kriterien — bitte genau lesen

Welche Qualifikation für die Erbringung ergänzender Unterstützungsleistungen
**regulatorisch** gefordert ist, konnte nicht aus einer offiziellen Quelle belegt werden
(siehe ORF-1, `audit/DIPA_REGULATORIK_2026-08-09.md`).

Der Katalog unten ist deshalb der **selbst gesetzte Qualitätsstandard von Alltagsengel**.
Jedes Kriterium trägt seine Herkunft:

| Kennzeichnung | Bedeutung |
|---|---|
| `intern_gesetzt` | Von uns begründet und verantwortet |
| `offen` | Regulatorisch nicht belegt — vor einer Antragstellung zu verifizieren und ggf. zu ersetzen |

Ein Katalog aus erfundenen „Vorgaben" wäre schlimmer als keiner: Er würde im Verfahren als
Beleg vorgelegt, ohne einer zu sein.

## 2. Kriterienkatalog

| Kriterium | Anforderung | Nachweisform | Pflicht | Herkunft | Wiederholung |
|---|---|---|---|---|---|
| **Einweisung in den PflegeCoach** | Nachweisliche Einweisung in Funktionsumfang, Grenzen und Datenschutzregeln der Anwendung | Einweisungsprotokoll mit Datum und Unterschrift | ja | intern gesetzt | alle 24 Monate |
| **Pflegerische Grundqualifikation** | Abgeschlossene pflegerische Ausbildung oder anerkannte Betreuungs-/Alltagsbegleitungsqualifikation | Zeugnis, Zertifikat, Schulungsnachweis | ja | **offen** | einmalig |
| **Datenschutzunterweisung** | Unterweisung zu Gesundheitsdaten und Verschwiegenheit, dokumentiert und unterschrieben | Unterweisungsnachweis, Verpflichtungserklärung | ja | intern gesetzt | jährlich |
| **Kenntnis der Leistungsabgrenzung** | Die Person kennt die Grenze zwischen Nutzungsbegleitung und pflegefachlicher oder medizinischer Beratung und hält sie ein | Schulungsteilnahme, Bestätigung im Einweisungsprotokoll | ja | intern gesetzt | alle 24 Monate |
| **Erweitertes Führungszeugnis** | Aktuelles erweitertes Führungszeugnis vor dem ersten Einsatz | Einsichtnahme dokumentiert | ja | intern gesetzt | alle 60 Monate |

### Warum „Kenntnis der Leistungsabgrenzung" ein Pflichtkriterium ist

Das ist kein Formalkriterium. Eine Begleitperson, die im Wohnzimmer sitzt und gefragt
wird „Was soll ich denn gegen die Schmerzen nehmen?", entscheidet in diesem Moment über
die MDR-Abgrenzung des Produkts mit. Wer die Grenze nicht kennt, überschreitet sie
freundlich und in bester Absicht.

## 3. Einsatzfreigabe — fail-closed

`pruefeEulFreigabe()` gibt eine Person **nur** frei, wenn **alle** Pflichtkriterien
erfüllt und nicht abgelaufen sind. Fehlt ein Nachweis oder ist er abgelaufen, ist der
Einsatz nicht freigegeben — es gibt keine Kulanzregel und keinen Übergangszeitraum im
Code.

Die Admin-Ansicht listet je Person die fehlenden Nachweise auf.

**Was der Code heute noch nicht tut:** Die Freigabe wird angezeigt, aber die Erfassung
eines eUL-Nachweises nicht technisch blockiert — stattdessen ist
„Qualifikation der erbringenden Person ist geprüft" eine Pflichtangabe für die
Bestätigung des Nachweises. Eine harte Kopplung (Erfassung nur für freigegebene Personen)
setzt voraus, dass jede erbringende Person als `caregiver_id` oder `user_id` geführt wird;
das ist erst sinnvoll, wenn der Kreis der Erbringer feststeht.

## 4. Pflegeprozess

1. Neues oder geändertes Kriterium zuerst hier begründen.
2. `EUL_QUALITAETSKRITERIEN` in `lib/coach/eul.ts` anpassen.
3. `lib/coach/eul.test.ts` läuft grün (Freigabelogik prüft alle Pflichtkriterien).
4. Bestehende Nachweise auf das neue Kriterium hin nacherfassen — sonst verlieren alle
   Personen die Freigabe, weil ein Pflichtnachweis fehlt. **Das ist beabsichtigt**, muss
   aber eingeplant werden.

## 5. Offene Punkte

| ID | Punkt |
|---|---|
| ORF-1 | Regulatorische Anforderungen an eUL-Erbringer klären; danach Kriterien mit `regulatorischGefordert: 'offen'` ersetzen oder bestätigen |
| — | Harte Kopplung Freigabe → Erfassung, sobald der Erbringerkreis feststeht |
| — | Ablauferinnerung für auslaufende Nachweise (heute nur Anzeige beim Aufruf) |
