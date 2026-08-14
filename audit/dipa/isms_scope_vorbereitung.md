# Informationssicherheit — Geltungsbereich und Vorbereitung

**Produkt:** Digitaler PflegeCoach · **Version:** 0.5.0 · **Stand:** 2026-08-14
**Deckt ab:** DiPA-Matrix SEC-05 (Vorbereitung) · **Status der Anforderung:** EXTERN NÖTIG

---

## 0. Ehrliche Ausgangslage

SEC-05 verlangt ein Informationssicherheits-Managementsystem. Ein solches
System **existiert nicht** — weder zertifiziert noch unzertifiziert als
geschlossenes Regelwerk. Was existiert, sind einzelne wirksame Maßnahmen
ohne verbindenden Rahmen.

Dieses Dokument behauptet deshalb nichts. Es leistet drei Dinge, die intern
leistbar sind:

1. Es legt den **Geltungsbereich** fest — die Frage, an der solche Vorhaben
   zuerst scheitern (und zugleich BfArM-Frage 11 / ORF-2).
2. Es erhebt, **was bereits vorhanden ist**, damit eine Beratung nicht bei
   null beginnt.
3. Es benennt die **Lücken** vollständig.

## 1. Vorgeschaltete Frage: Wie groß muss der Geltungsbereich sein?

Das ist keine technische, sondern eine regulatorische Frage — und sie ist
offen. Drei denkbare Zuschnitte:

| Zuschnitt | Umfang | Aufwand | Risiko |
|---|---|---|---|
| **A — Produkt** | nur der PflegeCoach: `app/pflegecoach/**`, `app/api/coach/**`, `lib/coach/**`, `coach_*` und die zugehörigen Anbieter | am geringsten | Wird der Zuschnitt als zu eng bewertet, ist die Arbeit teilweise verloren |
| **B — Produkt + gemeinsame Infrastruktur** | zusätzlich Anmeldung, Auslieferung, Rechteverwaltung, Zugänge der Fremdanbieter | mittel | ausgewogen |
| **C — Unternehmen** | gesamter Geschäftsbetrieb einschließlich Pflegedienst-Betrieb | hoch | für ein Unternehmen dieser Größe unrealistisch |

**Empfehlung, ausdrücklich als Empfehlung und nicht als Feststellung:**
Zuschnitt B. Zuschnitt A klammert die Anmeldung aus — und genau dort sitzt
das größte technische Risiko (Kontoübernahme, R3.1). Ein
Sicherheitsmanagement, das die Anmeldung nicht umfasst, überzeugt keinen
Prüfer.

**Diese Entscheidung ist vor der Beauftragung mit dem BfArM zu klären**
(Frage 11). Ein zu enger Zuschnitt wird später beanstandet, ein zu weiter
kostet ein Vielfaches.

## 2. Was bereits vorhanden ist

Diese Übersicht ist bewusst nach den üblichen Themenfeldern eines
Sicherheitsmanagements gegliedert, damit eine Beratung direkt daran
anknüpfen kann. Sie behauptet **keine** Normkonformität.

| Themenfeld | Vorhanden | Nachweis | Lücke |
|---|---|---|---|
| Zugriffssteuerung | Zeilenfilter auf allen Produkttabellen; kein privilegierter Zugang im Produktpfad; keine Administrator-Policy | 68 automatische Tests | keine bekannt |
| Identität und Anmeldung | Passwortanmeldung mit Sperre nach Fehlversuchen; zweiter Faktor (TOTP) verfügbar und serverseitig durchgesetzt | `lib/coach/mfa.ts`, `app/auth/login` | zweiter Faktor ist freiwillig |
| Verschlüsselung | Transportverschlüsselung; Verschlüsselung im Ruhezustand durch die Plattform | `audit/dipa/verschluesselungskonzept.md` | keine Ende-zu-Ende-Verschlüsselung (bewusst, begründet) |
| Protokollierung | `coach_audit_log`, append-only, nur Metadaten | Test P7 | keine automatische Auswertung, keine Alarmierung |
| Änderungssteuerung | Versionierung, Changelog, Testtore, Auslieferungsprüfung | QM-Handbuch §3–4 | keine Vier-Augen-Freigabe (Teamgröße) |
| Umgang mit Geheimnissen | Secret-Guard blockiert vor jeder Auslieferung; keine Zugangsdaten im Repository | `scripts/` | keine turnusmäßige Rotation |
| Lieferantensteuerung | Kette erhoben | `audit/dipa/avv_dossier_pflegecoach.md` | keine Verträge, keine Bewertung |
| Sicherung und Wiederanlauf | Sicherung durch die Datenbankplattform | — | **Rücksicherung nie erprobt** |
| Störungsbehandlung | Schweregrade und Reaktionszeiten festgelegt | QM-Handbuch §5 | nie erprobt; kein Meldeweg an Behörden |
| Risikomanagement | Risikoakte mit Bewertung und Restrisiko | `audit/dipa/risikoakte_pflegecoach.md` | keine Wiedervorlage durchlaufen |
| Personelle Sicherheit | — | — | **keine Regelungen, keine Schulungsnachweise** |
| Physische Sicherheit | vollständig bei den Anbietern | — | nicht durch Verträge belegt |
| Sicherheitsleitlinie | — | — | **nicht vorhanden** |

## 3. Die fünf größten Lücken

1. **Keine Sicherheitsleitlinie.** Es gibt kein Dokument, das Zielsetzung
   und Verbindlichkeit festlegt. Ohne sie ist alles Übrige freiwillig.
2. **Keine Erprobung der Rücksicherung.** Eine Sicherung, deren
   Wiederherstellung nie geprüft wurde, ist eine Annahme (R3.4).
3. **Keine personellen Regelungen.** Keine Verpflichtungserklärungen, keine
   Schulungen, kein geregelter Entzug von Zugängen beim Ausscheiden.
4. **Keine Lieferantenverträge.** Siehe DS-04 — dieselbe Lücke, andere
   Perspektive.
5. **Keine Alarmierung.** Das Zugriffsprotokoll wird geschrieben, aber
   niemand wertet es aus. Ein Angriff fiele heute nicht auf.

Lücken 1, 2, 3 und 5 sind **intern** schließbar. Lücke 4 nicht.

## 4. Verhältnis zu SEC-01

SEC-01 (Zertifikat einer akkreditierten Prüfstelle nach BSI TR-03161)
betrifft das **Produkt**, SEC-05 die **Organisation**. Beides ist getrennt,
aber die Prüfstelle wird nach organisatorischen Nachweisen fragen. Es ist
deshalb sinnvoll, beide Anfragen gemeinsam zu stellen und dabei zu klären,
welche organisatorischen Nachweise die Prüfstelle tatsächlich verlangt —
möglicherweise weniger, als eine vollständige Zertifizierung erfordert.

## 5. Nächste Schritte

| Schritt | Art | Bemerkung |
|---|---|---|
| Geltungsbereich mit dem BfArM klären | extern | Frage 11; verhindert Fehlinvestition |
| Sicherheitsleitlinie verfassen | intern | wenige Seiten, muss von der Geschäftsführung getragen sein |
| Rücksicherung einmal vollständig erproben und protokollieren | intern | schließt zugleich R3.4 |
| Auswertung des Zugriffsprotokolls einrichten | intern | mindestens: fehlgeschlagene Anmeldungen, ungewöhnliche Zugriffsmengen |
| Personelle Regelungen aufsetzen | intern | Verpflichtung, Zugangsentzug, Schulungsnachweis |
| Beratung anfragen | extern | erst nach Klärung des Geltungsbereichs |

## 6. Status

Nicht begonnen im Sinne eines Managementsystems. Kein Berater beauftragt,
keine Zertifizierung angestrebt, keine Leitlinie vorhanden. Die vorhandenen
Maßnahmen sind wirksam, aber ungebündelt.
