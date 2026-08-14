**Stand:** 2026-08-14 · **Zweck:** Konsolidierte Risikoübersicht (technisch und datenschutzrechtlich) des Digitalen PflegeCoach für die DiPA-Vorbereitung.

# Risikoübersicht — Digitaler PflegeCoach

**Produktversion:** 0.5.0 · **Betriebsmodus:** `COACH_DIPA_MODUS=false`

Dieses Dokument konsolidiert zwei Quellen mit unterschiedlicher Funktion:

- `audit/dipa/risikoanalyse_pflegecoach.md` — **Identifikation.** Benennt Risiken
  und vorhandene Maßnahmen, bewertet aber bewusst nicht (die Spalte "Bewertung"
  bleibt dort durchgehend "offen").
- `audit/dipa/risikoakte_pflegecoach.md` — **Führung.** Ergänzt Bewertung vor/nach
  Maßnahme, Restrisiko, Verantwortung und Wiedervorlage.

Beide Dokumente decken sowohl technische als auch datenschutzrechtliche Risiken
ab (Kategorien R1 Nutzung, R2 Datenschutz, R3 technische Sicherheit,
R4 Regulatorik/Produktpolitik). Die Zahlen unten wurden durch Lesen der
Risikoakte verifiziert, nicht aus der Matrix übernommen.

---

## 1. Bewertungsmaßstab (aus der Risikoakte)

Zweidimensional, bewusst grob (dreistufig je Achse):

**Eintritt:** selten (S) · gelegentlich (G) · häufig (H)
**Auswirkung:** gering (1) · spürbar (2) · schwer (3)

| | 1 gering | 2 spürbar | 3 schwer |
|---|---|---|---|
| **H häufig** | mittel | hoch | **kritisch** |
| **G gelegentlich** | niedrig | mittel | hoch |
| **S selten** | niedrig | niedrig | mittel |

**Akzeptanzregel:** "kritisch" wird nicht ausgeliefert. "hoch" wird nur mit
schriftlicher Begründung und Wiedervorlagetermin getragen. Für "Auswirkung"
ist stets die Sicht der pflegebedürftigen Person maßgeblich, nicht die des
Unternehmens.

## 2. Verifizierte Restrisiko-Zusammenfassung

Direkt aus `audit/dipa/risikoakte_pflegecoach.md` §6 gelesen (Stand 14.08.2026):

| Stufe | Anzahl |
|---|---|
| kritisch | **0** |
| hoch | **3** |
| mittel | **11** |
| niedrig | **5** |
| **Summe** | **19** |

Diese Zahlen bestätigen die in `docs/DIPA_MATRIX_FINAL.md` (QMS-02) genannte
Angabe "0 kritisch, 3 hoch, 11 mittel, 5 niedrig" — Gegenprobe erfolgreich.

## 3. Die drei hohen Restrisiken (verifiziert)

Alle drei sind laut Risikoakte **nicht intern schließbar** — sie benötigen eine
Pflegefachkraft, eine juristische Beauftragung bzw. eine externe
Sicherheitsprüfstelle:

| ID | Risiko | Vorher | Maßnahme (Nachweis) | Nachher (Restrisiko) | Verantwortung |
|---|---|---|---|---|---|
| **R1.4** | Fachlich unzutreffende Inhalte | H3 kritisch | Alle Inhalte in `lib/coach/inhalte.ts` tragen `pruefstatus: 'entwurf'`, im Produkt sichtbar als Entwurfs-Hinweis; pflegefachliche Freigabe fehlt (Matrix-Punkt QI-01) | **G3 hoch** | Fachlich — offen |
| **R2.9** | Auftragsverarbeiter-Kette unbekannt/ohne Verträge | G3 hoch | Gerüst und 10-Punkte-Prüfliste liegen vor (`audit/dipa/avv_dossier_pflegecoach.md`), Verträge und Unterauftragnehmerlisten fehlen (Matrix-Punkt DS-04) | **G3 hoch** (unverändert) | Geschäftsführung — offen |
| **R3.2** | Unentdeckte Schwachstelle / kein externer Penetrationstest | G3 hoch | Interne Sicherheitsprüfung, Secret-Guard vor jedem Push, 68 automatische Zugriffstests; kein externer Penetrationstest (Matrix-Punkt SEC-04) | **G3 hoch** (unverändert) | extern — offen |

Dies deckt sich mit den in `docs/DIPA_MATRIX_FINAL.md` genannten drei
Restrisiken R1.4, R2.9, R3.2. **R1.4 ist laut Risikoakte das höchste getragene
Risiko des Produkts** und ist nicht technisch lösbar — die einzige heutige
Minderung ist Transparenz (sichtbarer Entwurfs-Hinweis).

## 4. Nutzungsrisiken (R1) — vollständige Übersicht

| Nr. | Risiko | Restrisiko | Kernmaßnahme |
|---|---|---|---|
| R1.1 | Produkt wird als medizinische Beratung missverstanden | S3 mittel | Zweckbestimmung + Negativabgrenzung, Notrufhinweis, E2E-geprüft |
| R1.2 | Ärztliche Hilfe wird verzögert in Anspruch genommen | S3 mittel | Keine automatische Deutung von Messwerten |
| R1.3 | Verletzung bei Bewegungsübungen | S2 niedrig | Nur niedrigschwellige Übungen, eigener Sicherheitshinweis je Übung |
| **R1.4** | Fachlich unzutreffende Inhalte | **G3 hoch** | siehe oben |
| R1.5 | Menschen mit Seh-/Motorikeinschränkung können nicht bedienen | G2 mittel | Schriftgrade, Kontrastmodus, Skip-Link, Tastaturbedienung; externer Test offen (BF-01) |

## 5. Datenschutzrisiken (R2) — vollständige Übersicht

| Nr. | Risiko | Restrisiko | Kernmaßnahme |
|---|---|---|---|
| R2.1 | Fremdzugriff auf Gesundheitsdaten | S3 mittel | RLS auf allen `coach_*`-Tabellen; 68 Zugriffstests bestanden |
| R2.2 | Einsicht durch eigene Administration | S3 mittel | Keine Admin-Policy auf `coach_*`; kein `service_role` im Produktpfad |
| R2.3 | Verarbeitung ohne wirksame Einwilligung | S3 mittel | Erzwungene, versionierte, widerrufbare Einwilligung; fail-closed |
| R2.4 | Auswertung ohne Einwilligung | S3 mittel | Doppelte Sperre: Deployment-Schalter **und** individuelle Einwilligung |
| R2.5 | Re-Identifikation aus Auswertungsdaten | S3 mittel | HMAC-Pseudonym, getrennter unlesbarer Schlüssel, Unterdrückung kleiner Fallzahlen |
| R2.6 | Zweitkopie der Daten im Protokoll | S1 niedrig | `coach_audit_log` speichert nur Metadaten, keine Werte |
| R2.7 | Daten bleiben nach Widerspruch bestehen | S3 mittel | Produktbezogene Löschung ohne Kontoverlust; Regelaufbewahrungsfristen offen (DS-03) |
| R2.8 | Ungewollte Weitergabe an Angehörige | S2 niedrig | Freigabe nur auf aktive Veranlassung, jederzeit widerrufbar |
| **R2.9** | Auftragsverarbeiter-Kette ohne Verträge | **G3 hoch** | siehe oben |

## 6. Technische Sicherheitsrisiken (R3) — vollständige Übersicht

| Nr. | Risiko | Restrisiko | Kernmaßnahme |
|---|---|---|---|
| R3.1 | Kontoübernahme über gestohlenes Passwort | G3 hoch | TOTP-Zweitfaktor verfügbar und serverseitig durchgesetzt, aber **freiwillig** — Restrisiko bleibt hoch, solange `COACH_MFA_PFLICHT` aus ist |
| **R3.2** | Unentdeckte Schwachstelle / kein Penetrationstest | **G3 hoch** | siehe oben |
| R3.3 | Freischaltcodes entwendet/erraten | S2 niedrig | SHA-256 mit Pfeffer, Klartext nur einmalig sichtbar |
| R3.4 | Datenverlust | S3 mittel | Sicherung durch Datenbankplattform; **Rücksicherung nie erprobt** (siehe `docs/dipa/09_BACKUP_RESTORE_DOKUMENTATION.md`) |
| R3.5 | Fehlerhafte Migration bricht das Produkt | S2 niedrig | Rollback-Skript zu jeder Migration, Shadow-Datenbank als Gegenprobe |

## 7. Regulatorische/produktpolitische Risiken (R4) — vollständige Übersicht

| Nr. | Risiko | Restrisiko | Kernmaßnahme |
|---|---|---|---|
| R4.1 | Produkt erweckt Eindruck einer Erstattung | S3 mittel | `COACH_DIPA_MODUS` aus per Default; keine Preis-/Erstattungsaussage; Strukturtest sperrt Regressionen |
| R4.2 | Abrechnung ohne Vergütungsvereinbarung | S3 mittel | `istAbrechnungsbereit()` fail-closed über `verguetung_geklaert` |
| R4.3 | Funktionserweiterung überschreitet Zweckbestimmung | G2 mittel | Eigene Produktversionierung; MAJOR-Änderungen vor Umsetzung regulatorisch zu bewerten |
| R4.4 | Werbung/Cross-Selling im Produktbereich | S2 niedrig | Tracker unter `/pflegecoach` technisch abgeschaltet, E2E-geprüft |
| R4.5 | Arbeitsfassungen von Anforderungstexten für Verordnungstext gehalten | G2 mittel | `anforderungstextGeprueft`-Flag je Katalogeintrag; **43 von 48 Einträgen ungeprüft** |
| R4.6 | Falscher Statusbericht: Migration gilt als live, ist es nicht | S2 niedrig | Live-Apply-Bestätigung als Pflichtschritt im Änderungsverfahren |

## 8. Was getragen wird und was nicht

**Getragen wird:** der aktuelle Betrieb als privat zu zahlendes Angebot (Produkt
A, Selbstzahler) mit sichtbarem Entwurfs-Hinweis auf allen Inhalten.

**Nicht getragen wird:** ein DiPA-Antrag im heutigen Stand. R1.4 und R2.9 müssen
davor geschlossen sein.

## 9. Wiedervorlage

| Anlass | Was zu prüfen ist |
|---|---|
| Jede MINOR- oder MAJOR-Version | Sind neue Risiken entstanden? Gilt jede Bewertung noch? |
| Nach jedem P0/P1-Vorfall | Vorfall aufnehmen, Bewertung des betroffenen Risikos neu ansetzen |
| Nach jeder externen Prüfung | Befunde übernehmen, Restrisiken neu bewerten |
| Spätestens halbjährlich | Vollständige Durchsicht |

Es ist bislang keine Wiedervorlage durchlaufen worden; die Risikoakte ist die
Erstfassung (Stand 14.08.2026).

**EXTERN_BENÖTIGT:** Ein anerkanntes Verfahren zur Risikobewertung nach einer
einschlägigen Norm ist nicht festgelegt — die Risikoanalyse selbst benennt dies
als offenen Punkt.

---

## Quellen

- `audit/dipa/risikoanalyse_pflegecoach.md`
- `audit/dipa/risikoakte_pflegecoach.md`
- `docs/DIPA_MATRIX_FINAL.md` (Abschnitte QMS-02, "Drei Restrisiken stehen auf hoch")
