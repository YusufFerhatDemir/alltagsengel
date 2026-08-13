# Risikoanalyse — Digitaler PflegeCoach

**Produkt:** Digitaler PflegeCoach
**Stand:** 2026-08-13
**Status:** ENTWURF — Risiken und Maßnahmen sind aus dem Code abgeleitet, die
**Bewertung** (Eintrittswahrscheinlichkeit, Schadensausmaß, Akzeptanz) ist
fachlich und geschäftsführend zu treffen und hier bewusst offen gelassen.

---

## Vorbemerkung

Was dieses Dokument leistet: Es benennt die Risiken, die sich aus dem tatsächlich
vorhandenen Code ergeben, und stellt ihnen die tatsächlich vorhandenen Maßnahmen
gegenüber. Jede Zeile ist im Repository überprüfbar.

Was es **nicht** leistet: eine Bewertung. Eine Risikomatrix mit Zahlen wäre hier
eine Erfindung — die Einstufung setzt Kenntnis des Einsatzkontexts, der
Nutzerzahlen und der Risikoakzeptanz des Unternehmens voraus. Die Spalte
„Bewertung" bleibt deshalb leer, bis sie jemand mit dieser Kenntnis füllt.

Ein anerkanntes Verfahren zur Risikobewertung (z. B. nach einer einschlägigen
Norm) ist nicht festgelegt — das ist selbst ein offener Punkt, siehe
`docs/DIPA_BFARM_READINESS.md`, Punkt 10 und 11.

---

## R1 — Nutzungsrisiken (Anwendung durch die Zielgruppe)

| ID | Risiko | Vorhandene Maßnahme im Produkt | Bewertung |
|----|--------|-------------------------------|-----------|
| R1.1 | Nutzende verstehen den PflegeCoach als medizinische Beratung oder Diagnostik | Zweckbestimmung und ausdrückliche Negativabgrenzung („Was er nicht ist") beim Einstieg und in der Fußzeile jeder Seite; Notrufhinweis 112 | offen |
| R1.2 | Verzögerte Inanspruchnahme ärztlicher Hilfe, weil die Selbsteinschätzung als Bewertung missverstanden wird | Belastungs- und Assessment-Seiten weisen ausdrücklich aus, dass es keine medizinische Bewertung ist; keine automatische Interpretation von Messwerten (`coach_measurements` speichert Rohantworten und Summe, ohne Deutung) | offen |
| R1.3 | Verletzung bei der Ausführung von Bewegungsübungen | Jede Übung in `lib/coach/inhalte.ts` trägt einen eigenen Sicherheitshinweis; nur niedrigschwellige Alltagsübungen, keine individualisierte Therapie | offen |
| R1.4 | Fachlich unzutreffende Inhalte | Jedes Inhaltselement trägt `pruefstatus`; bei `entwurf` erscheint im Produkt ein sichtbarer Hinweis. **Offen:** die pflegefachliche Freigabe steht für alle Inhalte noch aus (GAP-QS) | offen |
| R1.5 | Menschen mit Seh- oder Motorikeinschränkung können das Produkt nicht bedienen | Drei Schriftgrößen, Kontrastmodus, Skip-Link, Tastaturbedienbarkeit, `aria`-Auszeichnung; Barrierefreiheitsregeln als Lint-Fehler für `app/pflegecoach/**`. **Offen:** externer Test mit der Zielgruppe (GAP-A11Y-AUDIT) | offen |

## R2 — Datenschutzrisiken

| ID | Risiko | Vorhandene Maßnahme im Produkt | Bewertung |
|----|--------|-------------------------------|-----------|
| R2.1 | Fremdzugriff auf Gesundheitsdaten | Row Level Security auf allen `coach_*`-Tabellen; jede Route arbeitet mit dem Session-Client (`lib/coach/api-auth.ts`) | offen |
| R2.2 | Einsicht durch eigene Administration/Support | Für `coach_*` existiert bewusst **keine** Admin-Policy; kein `service_role`-Client im Produktpfad | offen |
| R2.3 | Verarbeitung ohne wirksame Einwilligung | Onboarding erzwingt die Art.-9-Einwilligung; `coach_consents` hält Textversion, Erteilung und Widerruf; Widerruf jederzeit in den Einstellungen | offen |
| R2.4 | Auswertung ohne Einwilligung | Doppelte Absicherung: Deployment-Schalter **und** individuelle Einwilligung; fehlt eines, wird nichts geschrieben (`app/api/coach/nutzung/route.ts`) | offen |
| R2.5 | Re-Identifikation aus Auswertungsdaten | Pseudonym aus getrenntem Schlüsselbestand; keine Fremdschlüssel auf `coach_users`; Unterdrückung kleiner Fallzahlen in der Auswertung | offen |
| R2.6 | Zweitkopie von Gesundheitsdaten im Protokoll | `coach_audit_log` speichert nur Feldnamen, keine Werte | offen |
| R2.7 | Daten bleiben nach Widerspruch bestehen | Produktbezogene Löschung ohne Kontoverlust (`/pflegecoach/loeschung`), `ON DELETE CASCADE` ab `coach_users`. **Offen:** Regelaufbewahrungsfristen sind nicht festgelegt | offen |
| R2.8 | Ungewollte Weitergabe an Angehörige/Pflegedienst | Freigabe nur auf aktive Veranlassung, jederzeit widerrufbar (`coach_shares`) | offen |
| R2.9 | Auftragsverarbeiter-Kette unbekannt | **keine Maßnahme vorhanden** — offener Punkt (GAP-DSFA / AK-DS-04) | offen |

## R3 — Technische Sicherheitsrisiken

| ID | Risiko | Vorhandene Maßnahme im Produkt | Bewertung |
|----|--------|-------------------------------|-----------|
| R3.1 | Kontoübernahme | Anmeldung über die Plattform-Authentifizierung. **Offen:** kein zweiter Faktor (GAP-MFA) | offen |
| R3.2 | Unentdeckte Schwachstelle | Interne Sicherheitsprüfung (`audit/dipa/security_review_pflegecoach.md`), Secret-Guard vor jedem Push. **Offen:** kein externer Penetrationstest (GAP-EXT-REVIEW) | offen |
| R3.3 | Freischaltcodes werden entwendet oder erraten | Codes nie im Klartext gespeichert (SHA-256 mit Pfeffer); Klartext erscheint genau einmal bei der Ausgabe | offen |
| R3.4 | Datenverlust | Verantwortung der Datenbankplattform. **Offen:** ein produktbezogenes Wiederanlaufkonzept mit geprüfter Rücksicherung fehlt | offen |
| R3.5 | Fehlerhafte Migration bricht das Produkt | Zu jeder Migration existiert ein Rollback-Skript; Code-Rollback über `scripts/rollback.sh` | offen |

## R4 — Regulatorische und produktpolitische Risiken

| ID | Risiko | Vorhandene Maßnahme im Produkt | Bewertung |
|----|--------|-------------------------------|-----------|
| R4.1 | Das Produkt erweckt den Eindruck einer Kostenträger-Erstattung, ohne dass eine Grundlage besteht | `COACH_DIPA_MODUS` ist Default aus; Anspruchsseite und -API antworten ohne den Schalter nicht; im Produkt existiert **keine** Preis- oder Erstattungsaussage | offen |
| R4.2 | Abrechnung gegen einen Weg ohne Vergütungsvereinbarung | `istAbrechnungsbereit()` ist fail-closed: ohne `verguetung_geklaert` niemals bereit (`lib/coach/abrechnung.ts`) | offen |
| R4.3 | Funktionserweiterung überschreitet unbemerkt die Zweckbestimmung | Eigene Produktversionierung mit Änderungskategorien; Änderungen an der Zweckbestimmung sind als MAJOR definiert und immer regulatorisch zu bewerten (`lib/coach/version.ts`) | offen |
| R4.4 | Werbung oder Cross-Selling im Produktbereich | Tracker und Marketing-Rahmen sind unter `/pflegecoach` technisch abgeschaltet | offen |
| R4.5 | Arbeitsfassungen von Anforderungstexten werden für den Verordnungstext gehalten | `anforderungstextGeprueft` je Katalogeintrag; ungeprüfte Einträge zählen in `katalogFortschritt()` nicht als erfüllt | offen |

---

## Nächste Schritte

1. Bewertungsverfahren festlegen (Skala, Akzeptanzkriterien, Zuständigkeit).
2. Spalte „Bewertung" für alle Zeilen füllen.
3. Für nicht akzeptierte Risiken Maßnahmen mit Termin und Verantwortlichem
   hinterlegen; die offenen Punkte oben sind die Kandidaten.
4. Verknüpfung mit dem Qualitätsmanagementsystem herstellen — derzeit deckt
   `docs/QMS_GRUNDGERUEST.md` den Pflegedienst ab, nicht das Softwareprodukt.
