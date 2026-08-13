# Datenschutzarchitektur — Digitaler PflegeCoach

**Stand:** 2026-08-13
**Status:** ENTWURF — aus dem Quellcode abgeleitet; juristische Prüfung steht aus
**Verhältnis zu den anderen Datenschutz-Unterlagen:**

| Frage | Dokument |
|-------|----------|
| **Was** wird verarbeitet, zu welchem Zweck, wie lange | `verarbeitungsverzeichnis_pflegecoach.md` |
| **Wohin** fließt es | `datenfluesse_pflegecoach.md` |
| **Wie** ist der Schutz gebaut — dieses Dokument | hier |
| Welche **Risiken** bleiben, wie werden sie bewertet | `dsfa_pflegecoach.md`, `risikoanalyse_pflegecoach.md` |
| Wie wird **gelöscht** | `loeschkonzept.md` |
| Wie wird **eingewilligt** | `einwilligungslogik.md` |

Dieses Dokument beschreibt die **Bauweise**. Es behauptet keine Rechtskonformität —
das ist die Aussage einer juristischen Prüfung, die aussteht (GAP-DSFA).

---

## 1. Sieben Entwurfsentscheidungen

Datenschutz ist hier nicht eine Schicht über dem Produkt, sondern eine Folge von
Entscheidungen im Datenmodell. Jede ist im Repository überprüfbar.

### E1 — Keine Verwaltungs-Policy auf Gesundheitsdaten

Für keine der Tabellen mit Gesundheitsdaten existiert eine Policy, die einem
Verwaltungs- oder Supportkonto Lesezugriff gäbe. Es gibt keinen Schalter, keine
Notfall-Freigabe, keinen Umweg über eine Servicefunktion.

*Wirkung:* Der wahrscheinlichste Weg unbefugter Einsicht in einem
Plattform-Produkt — die eigene Administration — existiert nicht.
*Preis:* Support kann bei Datenproblemen nicht helfen, ohne dass die betroffene
Person selbst exportiert. Das ist bewusst so.

### E2 — Kein Mandantenbezug im Nutzerbereich

Die operativen Tabellen der Plattform tragen eine Organisationszugehörigkeit. Die
`coach_*`-Tabellen bewusst **nicht**: Es handelt sich um Daten der Person, nicht
um Betriebsdaten eines Mandanten.

*Wirkung:* Es gibt keine Konstruktion, aus der sich ein „unser Kunde, also unsere
Daten" ableiten ließe.

### E3 — Trennung von Berechtigung und Gesundheitsdaten

`coach_freischaltcodes` (Betrieb) und `coach_users` (Person) sind durch **keinen**
Fremdschlüssel verbunden. Die Einlösung wird nur als HMAC-Pseudonym vermerkt.

*Wirkung:* Die Verwaltung sieht „Code X ist eingelöst", kann die Einlösung aber
weder einer Person noch deren Daten zuordnen. Der Schlüssel liegt in einer
Tabelle ohne Policy und ohne Grants; nur Funktionen mit Eigentümerrechten kommen
heran.

### E4 — Auswertungsdaten ohne Personenbezug

`coach_nutzungsereignisse` enthält kein `coach_user_id`, keinen Verweis auf ein
Konto und **keinen Zeitstempel** — nur die Auswertungswoche (Montag), die
Ereignisart, einen Modulschlüssel und die Rolle.

*Wirkung:* Ohne den Schlüssel ist eine Re-Identifikation ausgeschlossen. Der Preis
ist methodisch: Analysen auf Tages- oder Tageszeitebene sind nicht möglich. Das
ist im Evaluationskonzept berücksichtigt.

### E5 — Protokoll ohne Werte

`coach_audit_log` speichert Tabelle, Aktion, Zeilen-Kennung, die **Namen** der
geänderten Felder, den Handelnden und den Zeitpunkt — aber **keine Werte**.

*Wirkung:* Das Protokoll ist keine zweite Kopie der Gesundheitsdaten. Ohne diese
Entscheidung entstünde durch die Auditierung genau das Risiko, das sie absichern
soll.

### E6 — Doppelte Freigabe für jede Auswertung

Nutzungsereignisse werden nur erfasst, wenn **beides** vorliegt: die
Betriebsentscheidung (`COACH_NUTZUNGSNACHWEIS_AKTIV`) **und** die individuelle
Einwilligung `wissenschaftliche_auswertung`. Fehlt eines, wird nichts geschrieben.

*Wirkung:* Weder ein versehentlich gesetzter Schalter noch eine fehlerhafte
Einwilligungsprüfung allein führt zur Erfassung.

### E7 — Werbe- und Trackerfreiheit als technische Eigenschaft

Im Produktpfad sind sämtliche Auswertungs- und Marketingbausteine der Plattform
abgeschaltet (`components/ClientSideProviders.tsx`, `GoogleTagManager.tsx`,
`LayoutWrapper.tsx`). Der Beratungs-Chat ist dort ebenfalls deaktiviert.

*Restpunkt, ehrlich benannt:* Wechselt jemand innerhalb derselben Sitzung von
einer Marketingseite in den Produktbereich, ist der Marketing-Baustein bereits
im Speicher des Browsers geladen. Beim Direkteinstieg in `/pflegecoach` lädt
nichts. Bewertung: für Pilotbetrieb tragbar; vor einer Antragstellung zu klären
(GAP-TRENNUNG).

---

## 2. Datenminimierung im Detail

| Stelle | Was **nicht** gespeichert wird | Warum |
|--------|-------------------------------|-------|
| `coach_users` | Name, Anschrift, Telefonnummer, E-Mail, Geburtsdatum | Anzeigename ist frei wählbar, Geburts**jahr** genügt für Alterskontext |
| `coach_users.pflegegrad` | nichts erzwungen | freiwillig, ohne Zugangswirkung |
| `coach_audit_log` | Datenwerte | siehe E5 |
| `coach_nutzungsereignisse` | Person, Zeitpunkt, Inhalte | siehe E4 |
| `coach_freischaltcodes` | Code im Klartext, Person | nur SHA-256 mit Pfeffer; Klartext erscheint genau einmal |
| Datenexport | interne Kennungen, Plattform-Nutzer-ID | per Unit-Test erzwungen |
| `eul_erbringungen` | Inhalte aus `coach_*` | Betriebsdaten bleiben ohne Gesundheitsdatenbezug |
| Browser-Speicher | alles außer Schriftgröße und Kontrast | keine Fachdaten außerhalb des Servers |

## 3. Rechte der betroffenen Person — technische Umsetzung

| Recht | Umsetzung | Ort |
|-------|-----------|-----|
| Auskunft (Art. 15) | vollständiger Export aller eigenen Daten; Nachweisdaten separat einsehbar | `/api/coach/export`, `/api/coach/nutzung` |
| Berichtigung (Art. 16) | alle Fachdaten sind durch die Person änderbar | Produktoberfläche |
| Löschung (Art. 17) | produktbezogene Löschung ohne Kontoverlust, mit Bestätigungswort und vorheriger Mengenvorschau | `/pflegecoach/loeschung` |
| Einschränkung (Art. 18) | teilweise: einzelne Ziele und Aktivitäten sind pausierbar bzw. deaktivierbar; eine allgemeine Sperre der Verarbeitung gibt es nicht | Produktoberfläche |
| Datenübertragbarkeit (Art. 20) | strukturiertes, dokumentiertes JSON mit veröffentlichtem Schema | `lib/coach/export.schema.json` |
| Widerspruch (Art. 21) | die Verarbeitung beruht auf Einwilligung; der Widerruf tritt an diese Stelle | `/pflegecoach/einstellungen` |
| Widerruf (Art. 7 Abs. 3) | jede Einwilligung einzeln, jederzeit, protokolliert | `/pflegecoach/einstellungen` |

**Ehrlich benannte Teilerfüllung:** Art. 18 ist nicht als eigenständige Funktion
umgesetzt. Wer die Verarbeitung eingeschränkt haben will, hat heute die Wahl
zwischen Weiternutzung und Löschung. Ob das genügt, ist Teil der ausstehenden
juristischen Prüfung.

## 4. Rechtsgrundlagen — wie sie technisch verankert sind

| Verarbeitung | Grundlage | Technische Verankerung |
|--------------|-----------|------------------------|
| Pflege- und Gesundheitsdaten | ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a) | ohne `gesundheitsdaten_art9` entsteht kein Profil, und ohne Profil antwortet jede Datenroute mit `NO_COACH_PROFILE` |
| Freigabe an Angehörige oder Pflegedienst | gesonderte Einwilligung | eigener Einwilligungstyp `datenfreigabe` + `coach_shares` |
| Auswertung für die Evaluation | gesonderte, freiwillige Einwilligung | eigener Typ + Betriebsschalter (E6) |
| Protokollierung | Rechenschaftspflicht, Datensicherheit | Trigger ohne Werte (E5) |

Die Einwilligung ist damit nicht nur eine Erklärung, sondern das **technische
Tor**: Ohne sie existiert kein Datensatz, an dem eine Verarbeitung ansetzen
könnte.

## 5. Datenschutz durch Voreinstellung

| Voreinstellung | Wert im Auslieferungszustand |
|----------------|------------------------------|
| Erfassung von Nutzungsereignissen | aus |
| Einwilligung in die wissenschaftliche Auswertung | nicht erteilt |
| Freigabe an Dritte | keine |
| DiPA-Modus (Kostenträgerbezug) | aus |
| Freischaltpflicht | aus |
| Werbung und Auswertungsdienste im Produktpfad | aus, technisch entfernt |
| Sichtbarkeit für die Verwaltung | keine |

Es gibt keine Voreinstellung, die zugunsten weiterer Verarbeitung wirkt. Jede
zusätzliche Verarbeitung erfordert eine aktive Handlung der betroffenen Person
und zusätzlich eine Betriebsentscheidung.

## 6. Was diese Architektur **nicht** leistet

* **Keine Ende-zu-Ende-Verschlüsselung.** Die Begründung steht in
  `verschluesselungskonzept.md` §5: Bei ausschließlich clientseitigen Schlüsseln
  wären Passwortverlust gleich Datenverlust, serverseitige Regeln (Row Level
  Security) wirkungslos und Freigabe, Export und Bericht nur mit erheblichem
  Zusatzaufwand umsetzbar. Die Entscheidung ist bewusst und dokumentiert.
* **Kein Schutz gegen die Datenbankadministration.** Wer die Datenbank
  administriert, kann technisch lesen. Dagegen helfen keine Policies, sondern nur
  organisatorische Maßnahmen — die nicht dokumentiert sind (EXT-06).
* **Keine Aussage über die Auftragsverarbeiter.** Welche Dienste beteiligt sind,
  wo verarbeitet wird, welche Verträge bestehen: aus dem Code nicht ableitbar,
  deshalb hier nicht behauptet (AK-DS-04).
* **Keine automatische Löschfrist.** Es existiert keine zeitgesteuerte Löschung;
  gelöscht wird auf Veranlassung. Regelfristen sind festzulegen
  (`loeschkonzept.md` §6).
* **Kein zweiter Faktor.** GAP-MFA.

## 7. Offene Punkte

| ID | Punkt | Zuständig |
|----|-------|-----------|
| GAP-DSFA | Datenschutz-Folgenabschätzung abschließen und freigeben | extern |
| AK-DS-04 | Dossier zur Auftragsverarbeitung inkl. Verarbeitungsort und Sicherungsfristen | Geschäftsführung |
| GAP-TRENNUNG | Trennungstiefe zur Plattform bewerten (E7, Restpunkt) | Geschäftsführung / extern |
| — | Art. 18 als eigenständige Funktion prüfen | fachlich |
| — | Regelaufbewahrungsfristen festlegen | Geschäftsführung |
| EXT-06 | Organisatorische Begrenzung des Administrationszugriffs | Geschäftsführung |

Aktionsplan für die externen Punkte: `docs/DIPA_EXTERNAL_ACTIONS.md`.
