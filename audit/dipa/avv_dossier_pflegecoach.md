# Auftragsverarbeitung — Dossier und Prüfliste

**Produkt:** Digitaler PflegeCoach · **Version:** 0.5.0 · **Stand:** 2026-08-15
**Deckt ab:** DiPA-Matrix DS-04 (Vorbereitung) · **Status der Anforderung:** GESCHÄFTSFÜHRUNG
(korrigiert 15.08.2026 — Unterschriften unter bestehende Anbieterbeziehungen, kein neuer
Dienstleister nötig; Abschnitt 5b liefert die Checkliste)

---

## 0. Was hier erledigt ist — und was nicht

**Erledigt (intern):** Die Kette ist erhoben. Für jeden Empfänger ist
benannt, welche Daten ihn erreichen, in welcher Rolle er steht, wo er
verarbeitet und was vertraglich fehlt.

**Nicht erledigt (extern):** Es liegt **kein einziger unterzeichneter
Auftragsverarbeitungsvertrag im Produktbestand vor**, und keine
Unterauftragnehmerliste ist eingeholt. Das ist der Kern von DS-04 und mit
interner Arbeit nicht schließbar — der Vertrag muss geschlossen, die Liste
angefordert und beides juristisch geprüft werden.

Bis dahin bleibt Risiko R2.9 auf „hoch".

## 1. Die Kette

### 1.1 Datenbank, Anmeldung und Dateiablage — Supabase

| Merkmal | Angabe |
|---|---|
| Rolle | Auftragsverarbeiter (Art. 28 DSGVO) |
| Verarbeitete Daten | **Alle Produktdaten**, einschließlich Gesundheitsdaten (Art. 9): Assessments, Ziele, Aktivitäten, Erledigungen, Messungen, Berichte, Einwilligungen; zusätzlich Anmeldedaten und die Geheimnisse des zweiten Faktors |
| Verarbeitungsort | Region Frankfurt (EU) — **zu bestätigen und vertraglich festzuhalten** |
| Kritikalität | höchste in der Kette |
| Was zu klären ist | Vertrag; Unterauftragnehmerliste; Löschfristen der Sicherungen; Zugriffsmöglichkeit des Anbieterpersonals; Verhalten bei behördlichen Auskunftsersuchen |

Der offene Punkt aus dem Löschkonzept (DS-03) hängt hier: Wie lange
Sicherungskopien nach einer Löschung fortbestehen, ist ohne Angabe des
Anbieters nicht bestimmbar. Solange das offen ist, kann dem Nutzer keine
belastbare Löschfrist zugesagt werden — und es wird auch keine behauptet.

### 1.2 Betrieb der Anwendung — Vercel

| Merkmal | Angabe |
|---|---|
| Rolle | Auftragsverarbeiter |
| Verarbeitete Daten | Verbindungsdaten (IP-Adresse, Zeitpunkt, aufgerufener Pfad); Produktdaten fließen **durch**, werden aber nicht dort gespeichert |
| Verarbeitungsort | zu bestätigen; Ausführung soll in der EU erfolgen |
| Kritikalität | mittel — kein dauerhafter Bestand an Gesundheitsdaten |
| Was zu klären ist | Vertrag; Aufbewahrungsdauer der Zugriffsprotokolle; Verarbeitungsregion; Unterauftragnehmer |

Die Protokolldauer ist relevant: Ein Zugriffsprotokoll, das den Pfad
`/pflegecoach/belastung` samt IP-Adresse über Monate vorhält, ist selbst
eine Gesundheitsdaten-nahe Verarbeitung.

### 1.3 E-Mail-Versand — Resend

| Merkmal | Angabe |
|---|---|
| Rolle | Auftragsverarbeiter |
| Verarbeitete Daten | E-Mail-Adresse, Betreff, Nachrichtentext von Systemnachrichten und Produktanfragen |
| Gesundheitsdaten | **nein** — der Produktbereich versendet keine Gesundheitsdaten per E-Mail; Nutzer werden ausdrücklich gebeten, dies ebenfalls zu unterlassen |
| Kritikalität | niedrig bis mittel |
| Was zu klären ist | Vertrag; Verarbeitungsort; Aufbewahrung der Versandprotokolle; Unterauftragnehmer |

**Risiko trotz „nein":** Über `/pflegecoach/anfrage` kann ein Nutzer im
Freitext Gesundheitsdaten schreiben. Der Hinweis steht am Formular; ein
technischer Filter wäre unzuverlässig. Diese Restmöglichkeit gehört in die
DSFA (DS-02).

### 1.4 Zahlungsabwicklung — Stripe

| Merkmal | Angabe |
|---|---|
| Rolle | eigenständig Verantwortlicher für Zahlungsdaten, Auftragsverarbeiter für die Vertragsabwicklung — **juristisch zu klären** |
| Verarbeitete Daten | Name, Rechnungsanschrift, E-Mail, Zahlungsmittel |
| Gesundheitsdaten | **nein** — der Bestellweg ist von den Produktdaten getrennt (eigene Tabellen `coach_bestellungen`, `coach_zahlungen`, `coach_rechnungen`) |
| Betroffenheit heute | **keine** — der Bestellweg ist über `COACH_PREISE_FREIGEGEBEN` abgeschaltet, es gibt keine Zahlungen |
| Was zu klären ist | Rollenverhältnis; Vertrag; Datenübermittlung in Drittländer |

Die Rollenfrage ist bei Zahlungsdienstleistern regelmäßig strittig und wird
hier nicht selbst entschieden — sie gehört ins Mandat aus DS-02.

## 2. Was in jedem Vertrag stehen muss

Prüfliste für die juristische Durchsicht — sie ist kein Ersatz für diese:

1. Gegenstand, Dauer, Art und Zweck der Verarbeitung, Art der Daten,
   Kategorien betroffener Personen
2. Weisungsbindung; Meldung, wenn eine Weisung gegen Datenschutzrecht
   verstößt
3. Vertraulichkeitsverpflichtung des eingesetzten Personals
4. Technische und organisatorische Maßnahmen — konkret, nicht als Floskel
5. Regelung zu Unterauftragnehmern: Genehmigung, Liste, Änderungsanzeige,
   Widerspruchsrecht
6. Unterstützung bei Betroffenenrechten (Auskunft, Löschung, Portabilität)
7. Unterstützung bei Meldepflichten und bei der DSFA
8. Löschung oder Rückgabe nach Vertragsende — **mit Frist**
9. Nachweis- und Prüfrechte
10. Verarbeitungsort; bei Drittlandbezug die Übermittlungsgrundlage

## 3. Besonderheit: Gesundheitsdaten

Bei Supabase werden Daten nach Art. 9 DSGVO verarbeitet. Daraus folgt für
die Vertragsgestaltung ein erhöhter Anspruch an Punkt 4 und 5 der Liste —
insbesondere daran, wer beim Anbieter technisch auf die Daten zugreifen
kann und wie das protokolliert wird. Diese Frage ist ausdrücklich zu
stellen und die Antwort schriftlich festzuhalten.

## 4. Was intern bereits belegt ist

Damit die juristische Prüfung nicht bei null anfängt, ist die technische
Seite dokumentiert und teilweise automatisch nachgewiesen:

| Aussage | Nachweis |
|---|---|
| Nur der Nutzer selbst sieht seine Produktdaten | 68 Zugriffstests, alle bestanden (14.08.2026) |
| Kein Administrator-Zugriff auf Produktdaten | dieselben Tests, Bereich P3 |
| Protokolle enthalten keine Datenwerte | Test P7 |
| Nachweisdaten sind nicht re-identifizierbar | Test P9 (Schlüssel unlesbar, Pseudonymfunktion gesperrt) |
| Vollständige Datenflussübersicht | `audit/dipa/datenfluesse_pflegecoach.md` |
| Verzeichnis der Verarbeitungstätigkeiten | `audit/dipa/verarbeitungsverzeichnis_pflegecoach.md` |

## 5. Nächste Schritte

| Schritt | Zuständig | Bemerkung |
|---|---|---|
| Verträge der drei aktiven Anbieter beschaffen und im Produktbestand ablegen | Geschäftsführung | Abschluss ist Voraussetzung für den DiPA-Antrag |
| Unterauftragnehmerlisten anfordern | Geschäftsführung | jeweils mit Änderungsanzeige |
| Sicherungs- und Protokollfristen schriftlich erfragen | Geschäftsführung | schließt zugleich die offene Frist in DS-03 |
| Verträge und Rollenfrage Stripe juristisch prüfen | extern | zusammen mit DS-02 beauftragen |
| Ergebnis in Verarbeitungsverzeichnis und Risikoakte nachziehen | intern | erst danach sinkt R2.9 |

## 5b. Abschluss-Checkliste für die Geschäftsführung

**Korrigiert 15.08.2026 (WS4):** AK-DS-04 ist keine „externer Dienstleister nötig"-
Anforderung (Bearbeitungsklasse D→C, siehe `lib/coach/anforderungskatalog.ts`) —
gebraucht werden keine neuen Verträge mit neuen Dienstleistern, sondern
**Unterschriften unter bereits bestehende Anbieterbeziehungen**. Bei allen vier
Anbietern unten ist ein Auftragsverarbeitungsvertrag (DPA) im Regelfall als
Online-Zustimmung im Kunden-Dashboard oder als öffentliches Vertragsdokument auf der
Rechtsseite des Anbieters hinterlegt — die genaue Fundstelle ändert sich erfahrungsgemäß
häufiger als dieses Dokument gepflegt wird, deshalb bewusst kein Link hier, sondern der
Suchpfad:

| Anbieter | Wonach suchen | Was danach hier abzulegen ist |
|---|---|---|
| Supabase | Projekteinstellungen → „Legal" / „Compliance", alternativ öffentliche Rechtsseite des Anbieters | unterzeichnete/akzeptierte DPA-Bestätigung, Verarbeitungsregion (Zeile 1.1), Unterauftragnehmerliste |
| Vercel | Team-/Projekteinstellungen → „Legal", alternativ öffentliche Rechtsseite des Anbieters | dieselben drei Punkte, zusätzlich Aufbewahrungsdauer der Zugriffsprotokolle (Zeile 1.2) |
| Resend | Kontoeinstellungen → „Legal"/„Compliance", alternativ öffentliche Rechtsseite des Anbieters | DPA-Bestätigung, Aufbewahrung der Versandprotokolle (Zeile 1.3) |
| Stripe | Dashboard → „Legal"/„Agreements", alternativ öffentliche Rechtsseite des Anbieters | DPA-Bestätigung UND schriftliche Klärung der Rollenfrage (Zeile 1.4) — hier zusätzlich die unter „extern" vermerkte juristische Prüfung, weil die Rollenfrage selbst strittig ist |

**Reihenfolge, die den größten Blocker zuerst löst:** Supabase (höchste Kritikalität,
alle Gesundheitsdaten) → Vercel → Resend → Stripe (derzeit ohne Betroffenheit, da
`COACH_PREISE_FREIGEGEBEN` aus ist — kann zuletzt kommen).

**Was diese Checkliste NICHT ersetzt:** Prüfliste aus Abschnitt 2 (was in jedem Vertrag
stehen muss) bleibt die inhaltliche Prüfgrundlage, insbesondere Punkt 10
(Drittlandbezug) — bei Ablehnung eines Standard-DPA wegen SCC-Klausel in einem
Drittstaat ist der Dienstleister zu ersetzen, nicht die Klausel zu akzeptieren (siehe
`AK-DS-04`-Eintrag im Katalog, DiPAV § 5 Abs. 4 lässt Standardvertragsklauseln nicht
zu). Sobald ein Punkt aus der Tabelle erledigt ist, hier abhaken und in Abschnitt 1 den
jeweiligen „Was zu klären ist"-Eintrag streichen.
