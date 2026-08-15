# Datenschutz-Folgenabschätzung (Vorbereitung) — „Digitaler PflegeCoach"

**Stand:** 2026-08-15 · **Block:** 15b · **Status:** VORBEREITUNG, Risikobewertung als Vorschlag ergänzt
**Verantwortlich:** Geschäftsführung · **Zu beteiligen:** Datenschutzbeauftragter (falls benannt) — nicht zwingend extern

> **Das ist noch keine unterzeichnete DSFA.** Eine Datenschutz-Folgenabschätzung nach
> Art. 35 DSGVO ist vom Verantwortlichen durchzuführen — das ist per Gesetz die
> Geschäftsführung selbst, nicht zwingend eine externe Kanzlei oder ein Gutachter
> (Art. 35 Abs. 2 sieht nur den *Rat* eines Datenschutzbeauftragten vor, *falls* einer
> benannt ist; keine externe Zertifizierungsstelle ist vorgeschrieben, siehe
> `lib/coach/anforderungskatalog.ts` AK-DS-02, korrigiert 15.08.2026). Dieses Dokument
> trug bis 14.08.2026 die [zu bewerten]-Felder als Platzhalter. **Update 15.08.2026:**
> Abschnitt 4b liefert einen Vorschlag für die Eintrittswahrscheinlichkeits-/
> Schwere-Bewertung, Abschnitt 3b eine Entscheidungsvorlage für das Kopplungsverbot —
> beide als Vorschlag der Technik, zur Bestätigung durch die Geschäftsführung. Was
> wirklich noch fehlt, steht in Abschnitt 6.

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
| Kopplungsverbot | Siehe Abschnitt 3b — Entscheidungsvorlage statt offenem Feld |

## 3b. Kopplungsverbot — Entscheidungsvorlage

**Frage:** Art. 7 Abs. 4 DSGVO vermutet eine Einwilligung als nicht freiwillig erteilt,
wenn die Erbringung einer Leistung von einer Einwilligung abhängig gemacht wird, die für
die Vertragserfüllung nicht erforderlich ist. Der PflegeCoach macht die Nutzung
vollständig von der Art.-9-Einwilligung abhängig (DiPAV § 5 Abs. 3 lässt ohnehin keine
andere Rechtsgrundlage zu, siehe `lib/coach/consent.ts`). Ist das zulässig?

**Weg A — Notwendigkeit bejahen (von der Technik für vertretbar gehalten):**
Die Verarbeitung von Gesundheitsdaten ist hier nicht eine Zusatzfunktion neben dem
eigentlichen Produkt, sondern **ist** das Produkt — ein PflegeCoach ohne Erfassung von
Pflegegrad, Selbständigkeit und Zielen wäre ein anderes Produkt. Das Kopplungsverbot
zielt nach Erwägungsgrund 43 und der Aufsichtspraxis auf Fälle, in denen eine
Einwilligung für eine **sachfremde** Verarbeitung (typischerweise Werbung,
Profilbildung, Weitergabe an Dritte) an eine Kernleistung gekoppelt wird. Genau das ist
hier durch VS-01/DS-07 ausgeschlossen: kein Cross-Selling, keine Werbung, keine
Weitergabe an Dritte außer selbst gewählten Freigaben (VS-03/DS-03). Die
wissenschaftliche Auswertung (NN-02) ist bereits **gesondert** und freiwillig
eingeholt — nur die Kernverarbeitung ist gekoppelt, und die ist ohne Alternative,
weil sie den Zweck selbst ausmacht.

**Weg B — vorsichtiger, zusätzliche Absicherung:** Sollte die Aufsicht die
Argumentation aus Weg A nicht teilen, wäre eine differenzierte Einwilligungsstufe
(z. B. ein datensparsamer Modus mit reduziertem Funktionsumfang ohne
Gesundheitsdaten-Verarbeitung) die technische Absicherung. Das ist heute **nicht**
gebaut und wäre ein eigenständiges Vorhaben, kein DSFA-Abschluss-Schritt.

**Empfehlung der Technik:** Weg A ist gut vertretbar und deckt sich mit der
Produktarchitektur (Zweckbindung technisch erzwungen, siehe DS-07/AK-SEC-08). Die
Entscheidung, ob das für die DSFA ausreicht oder Weg B angestoßen werden soll, liegt
bei der Geschäftsführung — das ist eine Risikoabwägung, keine technische Frage.

## 4. Risiken für die Rechte der Betroffenen

Bewertung nach Eintrittswahrscheinlichkeit × Schwere ist **[zu bewerten]**. Die Risiken
und die bereits umgesetzten Maßnahmen:

| # | Risiko | Umgesetzte Maßnahme | Restrisiko |
|---|---|---|---|
| R1 | Unbefugter Zugriff durch andere Nutzer | RLS als einzige Zugriffswahrheit, mit 39 Rollen-/Rechte-Tests belegt | gering |
| R2 | Einsichtnahme durch eigene Administratoren | Keine Admin-Policies auf `coach_*`; Produkttrennung im Datenmodell | gering, aber: Datenbank-Superuser des Betreibers bleibt technisch möglich — **[zu bewerten]** |
| R3 | Re-Identifikation aus Auswertungsdaten | HMAC-Pseudonym mit nicht lesbarem Schlüssel; keine Zeitstempel; Unterdrückung kleiner Gruppen | gering |
| R4 | Kompromittierte Zugangsdaten | TOTP-basierte Zwei-Faktor-Authentifizierung: lib/coach/mfa.ts, Durchsetzung über lib/coach/api-auth.ts; im DiPA-Modus fail-closed (O.Auth_3). 5 Tests belegen beide Richtungen | gering (seit 15.08.2026) |
| R5 | Zweckentfremdung für Vermittlung/Werbung | Keine Tracker im Produktpfad; eUL strikt auf der Betriebsseite; kein Buchungsweg aus dem Produkt heraus | gering |
| R6 | Unbeabsichtigte Weitergabe über Freigaben | Freigabe nur lesend, jederzeit widerruflich, `coach_users` bleibt privat | gering; Verwaltungs-UI fehlt noch (GAP-SHARES-UI) |
| R7 | Datenverlust durch Löschung | Export vor Löschung angeboten, Bestätigungswort erforderlich | gering |
| R8 | Fehlgebrauch der Inhalte als medizinischer Rat | Statische Hinweise, regelbasierte Empfehlungen mit Verbotsliste, Notfallhinweis in jeder Fußzeile | **[zu bewerten]** — hängt an der pflegefachlichen Freigabe (GAP-QS) |
| R9 | Gemeinsame Infrastruktur mit dem Betriebsteil | Tabellen-, RLS- und Pfadtrennung | mittel (GAP-TRENNUNG) |

## 4b. Risikobewertung — Vorschlag (Eintrittswahrscheinlichkeit × Schwere)

Art. 35 DSGVO verlangt eine Einschätzung von Eintrittswahrscheinlichkeit und Schwere je
Risiko. Das ist eine Wertung, keine Berechnung — die folgende Tabelle ist ein
**Vorschlag der Technik**, hergeleitet aus den in Abschnitt 4 dokumentierten
Maßnahmen und der Sensibilität der jeweils betroffenen Daten (Skala je gering / mittel
/ hoch; Risikostufe = ungefähre Kombination, keine formale Matrix-Rechenregel).

| # | Eintrittswahrscheinlichkeit | Schwere | Risikostufe | Begründung |
|---|---|---|---|---|
| R1 | gering | hoch | mittel | RLS mehrschichtig, 39 Rollen-/Rechtetests bestanden — aber betrifft im Fall des Falles Gesundheitsdaten Dritter |
| R2 | gering | hoch | mittel | kein regulärer Zugriffsweg für Admins; Restrisiko liegt im DB-Superuser, der organisatorisch (nicht technisch) zu adressieren ist — siehe R2 in Abschnitt 4 |
| R3 | gering | mittel | niedrig | HMAC-Pseudonym mit gesperrtem Schlüssel, keine Zeitstempel, Gruppenunterdrückung — betrifft nur Ereignis-Metadaten, keine Klartext-Inhalte |
| R4 | mittel | hoch | mittel | TOTP-Pflicht seit 15.08.2026 senkt die Wahrscheinlichkeit deutlich, schließt Phishing aber nicht aus; Schwere bleibt hoch, weil ein kompromittiertes Konto vollen Lesezugriff gibt |
| R5 | gering | mittel | niedrig | technisch erzwungene Zweckbindung (kein Tracker im Produktpfad), E2E-geprüft |
| R6 | gering | mittel | niedrig-mittel | Freigabe ist nur lesend, jederzeit widerrufbar, Empfängerkreis selbst gewählt; die fehlende Verwaltungs-UI (GAP-SHARES-UI) betrifft die Bedienbarkeit der Rücknahme, nicht die Zugriffskontrolle selbst |
| R7 | gering | mittel | niedrig | Export vor Löschung angeboten, Bestätigungswort erforderlich; betrifft den Nutzer selbst, kein Drittzugriff |
| R8 | mittel | hoch | **hoch** | Alle 12 Module tragen weiterhin `pruefstatus: entwurf` (GAP-QS/AK-QI-01) — solange die pflegefachliche Freigabe offen ist, bleibt dies das höchste Einzelrisiko im Katalog |
| R9 | gering | mittel | niedrig-mittel | Tabellen-, RLS- und Pfadtrennung technisch umgesetzt; gemeinsames DB-Projekt bleibt eine offene Architekturfrage (BfArM-Frage 13), keine akute Schwere-Erhöhung |

**Auffälligkeit:** R8 ist das einzige Risiko mit Stufe „hoch" — und es hängt an
AK-QI-01 (pflegefachliche Freigabe), nicht an dieser DSFA. Die DSFA kann R8 nicht
selbst senken; das kann nur der Abschluss der Inhaltsfreigabe (`audit/dipa/inhalte_pruefdossier.md`).

**Zu bestätigen durch die Geschäftsführung:** diese neun Einschätzungen (Zustimmung,
Korrektur oder abweichende Bewertung) sowie Datum und Unterschrift.

## 5. Abhilfemaßnahmen — geplant

| Maßnahme | Adressiert | Status |
|---|---|---|
| Zweiter Faktor bei der Anmeldung | R4 | **erledigt** (TOTP seit 15.08.2026, lib/coach/mfa.ts) |
| Externes Security-Review und Penetrationstest | R1, R2, R4 | offen (GAP-EXT-REVIEW) |
| Pflegefachliche Freigabe aller Inhalte | R8 | offen (GAP-QS) |
| Eigenes Projekt/Deployment für das Produkt | R9 | zu entscheiden (GAP-TRENNUNG) |
| Verwaltungs-UI für Freigaben | R6 | offen (GAP-SHARES-UI) |
| AVV-Dossier inkl. Regionen und Backup-Fristen | R2, Drittland | offen (AK-DS-04) |

## 6. Was zum Abschluss noch fehlt

**Korrigiert 15.08.2026 (WS4):** Eine externe Kanzlei- oder Gutachterbeteiligung ist
für die DSFA selbst **nicht** vorgeschrieben (siehe Kopfnotiz). Was tatsächlich noch
fehlt, ist ausschließlich Geschäftsführungshandlung:

1. Abschnitt 4b (Risikobewertung) und 3b (Kopplungsverbot) prüfen und bestätigen, oder
   abweichend bewerten.
2. AVV-Dossier der eingesetzten Auftragsverarbeiter abschließen — das ist ein eigener
   Punkt (AK-DS-04), siehe `audit/dipa/avv_dossier_pflegecoach.md` Abschnitt 5b.
3. Entscheidung zur Infrastrukturtrennung (GAP-TRENNUNG) — unverändert offen.
4. Datum, Unterschrift, Festlegung des Überprüfungsintervalls.

**Weiterhin empfohlen, aber keine Voraussetzung:** eine anwaltliche Zweitmeinung zu den
Einwilligungstexten, insbesondere zur Kopplungsverbot-Einschätzung aus 3b — das ist ein
Qualitätsanspruch, keine Rechtspflicht (siehe AK-DS-02).

> Solange Punkt 1–4 offen sind, ist dieses Dokument eine **Vorbereitung** und darf nicht
> als abgeschlossene, unterzeichnete DSFA gegenüber Dritten verwendet werden. Aber:
> anders als bisher dargestellt hängt der Abschluss an einer Entscheidung der
> Geschäftsführung, nicht an einer externen Beauftragung.
