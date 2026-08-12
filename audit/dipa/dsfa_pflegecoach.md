# Datenschutz-Folgenabschätzung (Vorbereitung) — „Digitaler PflegeCoach"

**Stand:** 2026-08-12 · **Block:** 15b · **Status:** VORBEREITUNG, nicht abgeschlossen
**Verantwortlich:** Geschäftsführung · **Zu beteiligen:** Datenschutzberatung (extern)

> **Das ist noch keine DSFA.** Eine Datenschutz-Folgenabschätzung nach Art. 35 DSGVO ist
> vom Verantwortlichen durchzuführen, im Regelfall unter Einbeziehung eines
> Datenschutzbeauftragten; die Bewertung von Eintrittswahrscheinlichkeit und Schwere ist
> eine Entscheidung, keine technische Ableitung. Dieses Dokument trägt zusammen, was ohne
> juristische Bewertung belastbar feststellbar ist, und markiert alles Übrige als offen.
> Die mit **[zu bewerten]** gekennzeichneten Felder füllt die Datenschutzberatung.

---

## 1. Warum eine DSFA erforderlich ist

Verarbeitet werden Gesundheitsdaten (Art. 9 DSGVO) einer besonders schutzbedürftigen
Personengruppe (pflegebedürftige, teils hochbetagte Menschen) in größerem Umfang mittels
neuer Technologie. Das spricht für eine Pflicht nach Art. 35 Abs. 3 lit. b DSGVO.
**[zu bewerten]** durch die Datenschutzberatung.

## 2. Beschreibung der Verarbeitung

| Punkt | Angabe |
|---|---|
| Verantwortlicher | Alltagsengel UG (haftungsbeschränkt) — Anschrift siehe Impressum |
| Zweck | Unterstützung der häuslichen Pflege durch Anleitung, Erinnerung, Zielverfolgung und Dokumentation; Zweckbestimmung siehe `finale_zweckbestimmung.md` |
| Rechtsgrundlage | Ausdrückliche Einwilligung, Art. 9 Abs. 2 lit. a i. V. m. Art. 6 Abs. 1 lit. a DSGVO |
| Betroffene | Pflegebedürftige, pflegende Angehörige, ggf. Beschäftigte eines Pflegedienstes |
| Empfänger | Nur vom Nutzer selbst freigegebene Personen (`coach_shares`); Auftragsverarbeiter (Hosting, Datenbank) |
| Drittlandtransfer | **[zu bewerten]** — abhängig von der Regionswahl der eingesetzten Dienste; im AVV-Dossier zu belegen |
| Speicherdauer | Bis zur Löschung durch den Nutzer; siehe `loeschkonzept.md` |

### Verarbeitete Datenkategorien

| Kategorie | Beispiele | Tabelle |
|---|---|---|
| Stammdaten | Anzeigename, Geburtsjahr, Rolle, Pflegegrad | `coach_users` |
| Einwilligungen | Typ, Textversion, Erteilung, Widerruf | `coach_consents` |
| Selbsteinschätzungen | Selbständigkeit in 5 Lebensbereichen, Freitextnotizen | `coach_assessments` |
| Ziele und Alltag | Ziele, Messgrößen, Wochenplan, Erledigungen | `coach_goals`, `coach_activities`, `coach_activity_log` |
| Fragebogenergebnisse | Belastungs-Selbsteinschätzung, Befinden | `coach_measurements` |
| Berichte | unveränderliche Verlaufs-Snapshots | `coach_reports` |
| Berechtigung | Anspruchsprüfung, Freischaltung | `coach_anspruchspruefungen`, `coach_freischaltungen` |
| Auswertung | pseudonyme Ereignisse (Woche, Ereignisart, Modul) | `coach_nutzungsereignisse` |
| Protokoll | Metadaten von Schreibzugriffen, **keine Werte** | `coach_audit_log` |

**Nicht verarbeitet:** Vitalparameter, Sensordaten, Diagnosen, Medikationspläne mit
Dosierlogik, Standortdaten, Kommunikationsinhalte mit Ärzten.

## 3. Notwendigkeit und Verhältnismäßigkeit

| Prüfpunkt | Feststellung |
|---|---|
| Datenminimierung | Nachweisdaten ohne Personenbezug, ohne Zeitstempel, ohne Inhalte; Audit ohne Werte; Export ohne interne IDs |
| Zweckbindung | Keine Nutzung der Daten für Werbung oder Vermittlung; technisch dadurch abgesichert, dass der Betriebsteil keine Leserechte hat |
| Speicherbegrenzung | Löschung jederzeit durch den Nutzer, produktbezogen ohne Kontoverlust |
| Freiwilligkeit der Einwilligung | Die wissenschaftliche Auswertung ist getrennt und freiwillig; ohne sie ist das Produkt voll nutzbar |
| Kopplungsverbot | **[zu bewerten]** — Prüfung, ob die Art.-9-Einwilligung als Nutzungsvoraussetzung zulässig ist, wenn keine andere Rechtsgrundlage greift |

## 4. Risiken für die Rechte der Betroffenen

Bewertung nach Eintrittswahrscheinlichkeit × Schwere ist **[zu bewerten]**. Die Risiken
und die bereits umgesetzten Maßnahmen:

| # | Risiko | Umgesetzte Maßnahme | Restrisiko |
|---|---|---|---|
| R1 | Unbefugter Zugriff durch andere Nutzer | RLS als einzige Zugriffswahrheit, mit 39 Rollen-/Rechte-Tests belegt | gering |
| R2 | Einsichtnahme durch eigene Administratoren | Keine Admin-Policies auf `coach_*`; Produkttrennung im Datenmodell | gering, aber: Datenbank-Superuser des Betreibers bleibt technisch möglich — **[zu bewerten]** |
| R3 | Re-Identifikation aus Auswertungsdaten | HMAC-Pseudonym mit nicht lesbarem Schlüssel; keine Zeitstempel; Unterdrückung kleiner Gruppen | gering |
| R4 | Kompromittierte Zugangsdaten | — | **hoch: MFA fehlt (GAP-MFA)** |
| R5 | Zweckentfremdung für Vermittlung/Werbung | Keine Tracker im Produktpfad; eUL strikt auf der Betriebsseite; kein Buchungsweg aus dem Produkt heraus | gering |
| R6 | Unbeabsichtigte Weitergabe über Freigaben | Freigabe nur lesend, jederzeit widerruflich, `coach_users` bleibt privat | gering; Verwaltungs-UI fehlt noch (GAP-SHARES-UI) |
| R7 | Datenverlust durch Löschung | Export vor Löschung angeboten, Bestätigungswort erforderlich | gering |
| R8 | Fehlgebrauch der Inhalte als medizinischer Rat | Statische Hinweise, regelbasierte Empfehlungen mit Verbotsliste, Notfallhinweis in jeder Fußzeile | **[zu bewerten]** — hängt an der pflegefachlichen Freigabe (GAP-QS) |
| R9 | Gemeinsame Infrastruktur mit dem Betriebsteil | Tabellen-, RLS- und Pfadtrennung | mittel (GAP-TRENNUNG) |

## 5. Abhilfemaßnahmen — geplant

| Maßnahme | Adressiert | Status |
|---|---|---|
| Zweiter Faktor bei der Anmeldung | R4 | offen (GAP-MFA) |
| Externes Security-Review und Penetrationstest | R1, R2, R4 | offen (GAP-EXT-REVIEW) |
| Pflegefachliche Freigabe aller Inhalte | R8 | offen (GAP-QS) |
| Eigenes Projekt/Deployment für das Produkt | R9 | zu entscheiden (GAP-TRENNUNG) |
| Verwaltungs-UI für Freigaben | R6 | offen (GAP-SHARES-UI) |
| AVV-Dossier inkl. Regionen und Backup-Fristen | R2, Drittland | offen (AK-DS-04) |

## 6. Was zum Abschluss noch fehlt

1. Beteiligung und Stellungnahme der Datenschutzberatung.
2. Bewertung aller **[zu bewerten]**-Felder.
3. Juristische Prüfung der Einwilligungstexte und Datenschutzhinweise (aktuell Entwurf).
4. AVV-Dossier der eingesetzten Auftragsverarbeiter, produktbezogen.
5. Entscheidung zur Infrastrukturtrennung (GAP-TRENNUNG).
6. Datum, Unterschrift, Festlegung des Überprüfungsintervalls.

> Solange Punkt 1–3 offen sind, ist dieses Dokument eine **Vorbereitung** und darf nicht
> als abgeschlossene DSFA gegenüber Dritten verwendet werden.
