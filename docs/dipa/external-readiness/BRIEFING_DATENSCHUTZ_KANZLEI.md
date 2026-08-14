# Briefing für Mandatsvergabe — Datenschutz- und Regulatorikpaket „Digitaler PflegeCoach"

**Produkt:** Digitaler PflegeCoach
**Hersteller:** Alltagsengel UG (haftungsbeschränkt), Neue Mainzer Straße 66-68, 60311 Frankfurt am Main
**Produktversion:** 0.5.0 (`lib/coach/version.ts`)
**Stand dieses Briefings:** 2026-08-15
**Status:** Briefing für Mandatsvergabe — **noch nicht beauftragt**

> Dieses Dokument ist kein Mandatsvertrag und keine Rechtsberatung. Es fasst
> zusammen, was intern vorbereitet ist, damit eine Kanzlei mit Erfahrung im
> Gesundheitswesen- und Medizinprodukterecht das Mandat ohne Vorlauf annehmen
> kann. Alle mit „[zu bewerten]" oder „offen" gekennzeichneten Punkte sind
> ausdrücklich nicht selbst entschieden worden.

---

## 1. Auftrag in einem Satz

Eine Kanzlei erstellt in einem Mandat: die **Datenschutz-Folgenabschätzung**
(DSFA), schließt die **Auftragsverarbeitungsverträge** (AVV) mit den drei
identifizierten Anbietern, nimmt die **MDR-Negativabgrenzung** juristisch ab
und prüft die **Selbstzahler-Nutzungsbedingungen** — vier zusammenhängende
Arbeitspakete, weil sie inhaltlich ineinandergreifen (dieselbe
Rechtsgrundlage, dieselben Datenkategorien, dieselbe Zweckbestimmung).

Dies entspricht Punkt 3 („Datenschutzpaket", DS-02/DS-04/PROD-02/VS-04) der
externen To-do-Liste in `docs/DIPA_EXTERNE_TODO_2026-08-14.md`, dort als
**P0-Blocker** eingestuft.

---

## 2. DSFA-Vorbereitung

**Quelle:** `audit/dipa/dsfa_pflegecoach.md` (Stand 2026-08-12)

**Was bereits vorbereitet ist:**

- Beschreibung der Verarbeitung: Verantwortlicher, Zweck, vorgesehene
  Rechtsgrundlage (Art. 9 Abs. 2 lit. a i. V. m. Art. 6 Abs. 1 lit. a DSGVO),
  betroffene Personengruppen, Datenkategorien (siehe `coach_users`,
  `coach_consents`, `coach_assessments`, `coach_goals`, `coach_activities`,
  `coach_activity_log`, `coach_measurements`, `coach_reports`,
  `coach_anspruchspruefungen`/`coach_freischaltungen`,
  `coach_nutzungsereignisse`, `coach_audit_log`).
- Explizite Negativliste: **nicht** verarbeitet werden Vitalparameter,
  Sensordaten, Diagnosen, Medikationspläne mit Dosierlogik, Standortdaten,
  Kommunikationsinhalte mit Ärzten.
- Neun identifizierte Risiken (R1–R9) mit jeweils bereits umgesetzter
  technischer Maßnahme und benanntem Restrisiko, u. a.:
  - R4 (kompromittierte Zugangsdaten): **hoch** — MFA fehlt (GAP-MFA)
  - R9 (gemeinsame Infrastruktur mit dem Betriebsteil): mittel
    (GAP-TRENNUNG)
  - R8 (Fehlgebrauch als medizinischer Rat): hängt an der noch offenen
    pflegefachlichen Inhaltsfreigabe (GAP-QS, separates P0-Mandat)
- Geplante Abhilfemaßnahmen mit Status je Risiko.

**Was die Kanzlei prüfen, fertigstellen und unterschreiben soll:**

1. Erforderlichkeit nach Art. 35 Abs. 3 lit. b DSGVO förmlich feststellen
   (im Vorbereitungsdokument nur als Einschätzung markiert).
2. Alle mit „[zu bewerten]" gekennzeichneten Felder bewerten, insbesondere:
   Drittlandtransfer (abhängig vom AVV-Ergebnis, siehe Abschnitt 3),
   Kopplungsverbot bei der Pflicht-Einwilligung, Restrisiko der
   Datenbank-Administratorzugriffe.
3. Eintrittswahrscheinlichkeit und Schwere der neun Risiken bewerten (bisher
   nur technische Maßnahmen dokumentiert, keine juristische
   Risikoeinstufung).
4. Einwilligungstexte und Datenschutzhinweise juristisch prüfen (Entwurf,
   siehe `audit/dipa/einwilligungslogik.md`).
5. Die DSFA als Dokument abschließen, datieren, unterschreiben und ein
   Überprüfungsintervall festlegen.

Das bestehende Dokument ist ausdrücklich **keine DSFA**, sondern eine
Vorbereitung — es darf laut eigener Kennzeichnung nicht als abgeschlossene
DSFA gegenüber Dritten (z. B. BfArM) verwendet werden, solange Beteiligung,
Bewertung und juristische Prüfung offen sind.

---

## 3. AVV-Dossier

**Quelle:** `audit/dipa/avv_dossier_pflegecoach.md` (Stand 2026-08-14)

**Identifizierte Auftragsverarbeiter (technisch erhoben, vertraglich offen):**

| Anbieter | Rolle | Verarbeitete Daten | Kritikalität |
|---|---|---|---|
| Supabase | Auftragsverarbeiter (Art. 28) | Alle Produktdaten inkl. Gesundheitsdaten (Art. 9), Anmeldedaten, MFA-Geheimnisse | höchste |
| Vercel | Auftragsverarbeiter | Verbindungsdaten (IP, Zeitpunkt, Pfad); Produktdaten fließen durch, werden dort nicht gespeichert | mittel |
| Resend | Auftragsverarbeiter | E-Mail-Adresse, Betreff, Nachrichtentext von Systemnachrichten; keine Gesundheitsdaten im Regelfall, aber Restrisiko über das Freitextfeld unter `/pflegecoach/anfrage` | niedrig bis mittel |
| Stripe | Rollenverhältnis **juristisch zu klären** (eigenständig Verantwortlicher vs. Auftragsverarbeiter) | Name, Rechnungsanschrift, E-Mail, Zahlungsmittel; **keine** Gesundheitsdaten; Bestellweg aktuell technisch abgeschaltet (`COACH_PREISE_FREIGEGEBEN` = aus), daher aktuell keine tatsächliche Betroffenheit | — |

**Kern der Lücke:** Es liegt **kein einziger unterzeichneter AVV im
Produktbestand vor**, keine Unterauftragnehmerliste ist eingeholt. Das ist
mit interner Arbeit nicht schließbar. Solange offen, bleibt Risiko R2.9 auf
„hoch" eingestuft.

**Was für jeden Vertrag zu klären ist** (Prüfliste aus dem Dossier,
Abschnitt 2): Gegenstand/Dauer/Art/Zweck der Verarbeitung, Weisungsbindung,
Vertraulichkeitsverpflichtung, TOMs, Unterauftragnehmer-Regelung,
Unterstützung bei Betroffenenrechten und Meldepflichten, Löschung/Rückgabe
nach Vertragsende **mit Frist**, Nachweis-/Prüfrechte, Verarbeitungsort
(bei Drittlandbezug: Übermittlungsgrundlage).

**Besonderheit Supabase:** Da hier Art.-9-Daten verarbeitet werden, ist ein
erhöhter Anspruch an TOMs und Unterauftragnehmer-Regelung zu stellen —
insbesondere die Frage, wer beim Anbieter technisch auf die Daten zugreifen
kann und wie das protokolliert wird, ist ausdrücklich zu stellen und
schriftlich festzuhalten.

**Offener Anschlusspunkt:** Wie lange Backups nach einer Nutzerlöschung
fortbestehen, ist ohne Angabe des Anbieters nicht bestimmbar
(`audit/dipa/loeschkonzept.md` §6) — das ist Teil des AVV-Gesprächs mit
Supabase, nicht separat zu klären.

**Bereits intern belegt** (Grundlage, nicht Ersatz für die juristische
Prüfung): 68 Zugriffskontrolltests bestanden (14.08.2026) — kein
Administratorzugriff auf Produktdaten, Protokolle ohne Datenwerte,
Nachweisdaten nicht re-identifizierbar.

---

## 4. MDR-Negativabgrenzung

**Quelle:** `audit/dipa/mdr_negativabgrenzung.md` (Stand 2026-08-12)

**Kernaussage der Zweckbestimmung:** Der Digitale PflegeCoach dient nicht
der Erkennung, Verhütung, Überwachung, Vorhersage, Prognose, Behandlung oder
Linderung von Krankheiten, Verletzungen oder Behinderungen und trifft keine
diagnostischen oder therapeutischen Entscheidungen. Er ersetzt keine
ärztliche oder pflegefachliche Beratung.

**Aktueller Stand:** Laut `docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md` ist
Punkt PROD-02 (MDR-Abgrenzung) **intern textlich vollständig durchgeprüft**
— Art. 2 Nr. 1 MDR wurde gegen alle vier Zweckbestimmungs-Alternativen
gehalten und als „VERIFIED" markiert. Das bedeutet: Die Argumentation ist
sorgfältig gegen den MDR-Wortlaut abgeglichen, aber es handelt sich um eine
**interne, nicht-juristische** Prüfung.

**Was die Kanzlei genau abnehmen soll:** die abschließende juristische
Bewertung, ob die Zweckbestimmung tatsächlich außerhalb des MDR-Anwendungs­
bereichs liegt — inklusive einer prüfbaren Einschätzung zur
Negativabgrenzung in der vom BfArM geforderten Form (Format ist laut
Quelldokument dem Originalantragsverfahren zu entnehmen, hier nicht
vorweggenommen).

**Was bewusst nicht gebaut wird** (Schutzmauer gegen Grenzüberschreitung):
Vitalparameter-Messung/Sensorik/Telemonitoring, Medikamenten-Dosierung und
Wechselwirkungsprüfung, Symptom-Checker/Triage/KI-Risikobewertung,
automatische Grenzwertalarme mit Handlungsaufforderung,
Sturzrisiko-Berechnung/-Vorhersage (Sturz**angst** als Selbstauskunft ist
zulässig), Notruf-/Alarmfunktionen mit Gefahrenabwehr-Anspruch,
Arztkommunikation/Verordnungswesen. Ein verwandtes, aber getrenntes Modul
(Vitalwerte-Erfassung mit fail-closed abgeschalteten Grenzwert-Alarmen)
existiert im Betriebsteil der Plattform und gehört ausdrücklich **nicht**
zum PflegeCoach.

**Auslösepunkte für eine Neubewertung** (aus der Quelle, für die Kanzlei
zur Kenntnis): Auswertung von Eingaben gegen Grenz-/Referenzwerte,
Darstellung eines Ergebnisses als Risiko/Befund/Empfehlung zu einer
Gesundheitsfrage, Lernverfahren mit personenbezogenen Hinweisen, Einbindung
eines validierten klinischen Instruments mit Auswertungslogik (offene
Lizenzfrage, GAP-INSTRUMENTE), Anbindung eines Sensors/Messgeräts.

**Offene interne Punkte, die die Abgrenzung mittelbar berühren:**
GAP-QS (Inhalte tragen den Status „Entwurf", ohne fachliche Freigabe ist
„qualitätsgesichert" nicht belegbar) und GAP-INSTRUMENTE.

---

## 5. Selbstzahler-Nutzungsbedingungen

**Quelle:** `audit/dipa/nutzungsbedingungen_entwurf_selbstzahler.md`
(Stand 2026-08-14)

**Status: ENTWURF — keine wirksame Vertragsgrundlage, nicht veröffentlicht.**
Der Text ist eine Arbeitsgrundlage für die juristische Prüfung. Ausdrücklich
ungeprüft sind: Wirksamkeit der Klauseln nach AGB-Recht, Vollständigkeit der
Pflichtinformationen für Fernabsatzverträge, Form und Wortlaut der
Widerrufsbelehrung, steuerliche Angaben.

**Es steht bewusst kein Betrag im Entwurf.** Die Preise sind kaufmännisch
nicht entschieden; der Bestellweg ist deshalb technisch gesperrt
(`COACH_PREISE_FREIGEGEBEN` = aus). Wo ein Betrag hingehört, steht
`[Betrag]`. **Dieses Briefing führt ebenfalls keinen Betrag ein** — die
Preisentscheidung ist Sache der Geschäftsführung, nicht der Kanzlei.

**Was der Entwurf bereits enthält:** Leistungsbeschreibung, ausdrückliche
MDR-Abgrenzung und Kassenleistungs-Abgrenzung in § 2, Regelung zu
Vertragsschluss, Laufzeit/Kündigung (inkl. jederzeitigem, vertrags­
unabhängigem Widerruf der Einwilligung und Löschung), Widerrufsrecht mit
einer bewusst **nicht** vorzeitig erlöschenden Widerrufsfrist
(`widerrufMoeglich()` in `lib/coach/bestellung.ts`), Nutzerpflichten,
Verfügbarkeitsregelung ohne Zusage einer Quote, Datenschutzverweis,
Änderungsklausel mit Zustimmungsfiktion. § 4 (Preise/Steuer), § 11
(Haftung), § 12 (Reaktionszeit) und § 13 (Streitbeilegung) sind bewusst
offen bzw. mit Platzhaltern versehen.

**Was die Kanzlei konkret prüfen soll** (Prüfliste aus dem Entwurf,
Anhang):

1. Wirksamkeit sämtlicher Klauseln nach AGB-Recht (Verbrauchervertrag)
2. Vollständigkeit der Pflichtinformationen im Fernabsatz
3. Widerrufsbelehrung und Muster-Widerrufsformular — muss zur Technik
   passen (kein vorzeitiges Erlöschen)
4. Zustimmungsfiktion in § 10 (AGB-rechtlich heikel)
5. Haftungsklausel (§ 11, bislang bewusst nicht formuliert)
6. Steuerliche Angaben (§ 4 Abs. 2, abhängig von der noch offenen
   kaufmännischen Entscheidung)
7. Rollenverhältnis zum Zahlungsdienstleister Stripe (siehe Abschnitt 3)
8. Abstimmung mit den Datenschutzhinweisen (Einwilligung vs.
   Vertragserfüllung als Rechtsgrundlage)
9. Prüfung, ob die Aussagen in § 2 Abs. 2–4 als MDR- und
   Kassenleistungs-Abgrenzung ausreichen
10. Verhältnis zu den allgemeinen Plattform-AGB unter `/agb`
    (Doppelregelungen vermeiden)

**Wichtig für die Kanzlei:** Betrifft ausschließlich **Produkt A** (der
private, kostenpflichtige Selbstzahler-Weg, aktuell technisch nicht
aktivierbar) — **nicht** die DiPA-Aufnahme. Der Digitale PflegeCoach ist
für Endnutzer dauerhaft **kostenlos** nutzbar; eine Erstattung durch
Pflege-/Krankenkassen findet aktuell nicht statt, eine DiPA-Zulassung liegt
weder vor noch ist sie beantragt.

---

## 6. Verarbeitungsverzeichnis & Datenflüsse

Als Arbeitsgrundlage für die DSFA und die AVV-Prüfung stehen zwei weitere
aus dem Quellcode abgeleitete Dokumente zur Verfügung:

- **`audit/dipa/verarbeitungsverzeichnis_pflegecoach.md`** — Verzeichnis von
  Verarbeitungstätigkeiten nach Art. 30 DSGVO: Zwecke, Kategorien
  betroffener Personen, Datenkategorien je Tabelle, Empfänger, technisch
  abgeschaltete Verarbeitungen (Nutzungsnachweis, Anspruchsprüfung,
  Freischaltcode-Pflicht — alle standardmäßig aus), Löschfristen soweit im
  Code hinterlegt, TOMs, Drittlandübermittlung (im Produktcode nicht
  vorgesehen, abhängig vom AVV-Ergebnis).
- **`audit/dipa/datenfluesse_pflegecoach.md`** — zehn dokumentierte
  Datenflüsse (F1–F10: Erfassung, Anzeige, Einwilligung, Freigabe an
  Angehörige, Export, Bericht, Nutzungsereignisse, Auswertung,
  Freischaltung, Löschung) sowie eine Liste vermuteter, aber tatsächlich
  nicht existierender Flüsse (z. B. keine Verbindung zu Werbe-/
  Auswertungsdiensten, keine Verbindung zu operativen Plattformtabellen).

Beide Dokumente sind als **ENTWURF** gekennzeichnet, vollständig aus Code
und Migrationen abgeleitet, ohne juristische Bewertung der
Rechtsgrundlagen. Sie eignen sich als Faktengrundlage, ersetzen aber nicht
die eigene Prüfung der Kanzlei.

Ergänzend für den Gesamtkontext: `audit/dipa/einwilligungslogik.md`
(technische Durchsetzung der drei Einwilligungstypen — Pflicht-Einwilligung
`gesundheitsdaten_art9`, freiwillige `wissenschaftliche_auswertung` und
`datenfreigabe`) und `audit/dipa/datenschutzarchitektur_pflegecoach.md`
(sieben Entwurfsentscheidungen der Datenschutzarchitektur, u. a. keine
Verwaltungs-Policy auf Gesundheitsdaten, keine Ende-zu-Ende-Verschlüsselung
mit begründeter Abwägung, kein Schutz gegen Datenbankadministration).

---

## 7. Scope: Was die Kanzlei konkret liefern soll

| # | Deliverable | Grundlage |
|---|---|---|
| 1 | **Unterschriebene DSFA** nach Art. 35 DSGVO, inkl. Risikobewertung (Eintrittswahrscheinlichkeit × Schwere) und Festlegung eines Überprüfungsintervalls | `audit/dipa/dsfa_pflegecoach.md` |
| 2 | **Geschlossene AVVs** mit Supabase, Vercel, Resend (und geklärtem Rollenverhältnis zu Stripe), inkl. eingeholter Unterauftragnehmerlisten und schriftlich festgehaltener Backup-/Protokollfristen | `audit/dipa/avv_dossier_pflegecoach.md` |
| 3 | **Juristische Abnahme der MDR-Negativabgrenzung** in der vom Antragsverfahren geforderten Form | `audit/dipa/mdr_negativabgrenzung.md` |
| 4 | **Geprüfte Selbstzahler-Nutzungsbedingungen** (AGB-Recht, Fernabsatz, Widerrufsbelehrung, Haftungsklausel) — ohne Preisfestlegung, die bleibt Geschäftsführungssache | `audit/dipa/nutzungsbedingungen_entwurf_selbstzahler.md` |

Alle vier Deliverables werden für den späteren DiPA-Antrag als Anlagen
benötigt (siehe `docs/DIPA_EXTERNE_TODO_2026-08-14.md`, Punkt 3, P0).

---

## 8. Zuständige Stelle / Ansprechpartner

| Rolle | Ansprechpartner |
|---|---|
| Mandatsvergabe / Auftraggeber | Geschäftsführung, Alltagsengel UG (haftungsbeschränkt) |
| Fachlicher Ansprechpartner für Rückfragen zu Code/Architektur | `[Platzhalter — durch Geschäftsführung zu benennen]` |
| Datenschutzbeauftragter | noch nicht bestellt (offener Punkt, siehe `docs/DIPA_EXTERNE_TODO_2026-08-14.md`, Punkt 8) |

> Es wird bewusst kein Personenname eingesetzt, der nicht aus den
> Quelldokumenten hervorgeht. Die konkrete Kontaktperson benennt die
> Geschäftsführung bei Mandatserteilung.

---

## 9. Bereitzustellende Unterlagen

Für die Mandatsbearbeitung stehen folgende Dokumente aus `audit/dipa/`
bereit:

| Dokument | Inhalt |
|---|---|
| `dsfa_pflegecoach.md` | DSFA-Vorbereitung |
| `avv_dossier_pflegecoach.md` | AVV-Dossier und Prüfliste |
| `mdr_negativabgrenzung.md` | MDR-Negativabgrenzung, Sprachregeln, technische Verankerung |
| `nutzungsbedingungen_entwurf_selbstzahler.md` | Nutzungsbedingungen-Entwurf Selbstzahler-Weg |
| `verarbeitungsverzeichnis_pflegecoach.md` | Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO) |
| `datenfluesse_pflegecoach.md` | Datenflüsse F1–F10, Flussmatrix |
| `einwilligungslogik.md` | Technische Durchsetzung der drei Einwilligungstypen |
| `loeschkonzept.md` | Löschwege, Löschfristen, Betroffenenrechte |
| `datenschutzarchitektur_pflegecoach.md` | Sieben Entwurfsentscheidungen, Datenschutz durch Voreinstellung, Grenzen der Architektur |
| `finale_zweckbestimmung.md` | Zweckbestimmung im Wortlaut (Grundlage der MDR-Abgrenzung) |
| `zielgruppendefinition.md` | Kategorien betroffener Personen |
| `verschluesselungskonzept.md` | Transportverschlüsselung, Begründung gegen Ende-zu-Ende-Verschlüsselung |

Ergänzend, für den regulatorischen Gesamtkontext:

| Dokument | Inhalt |
|---|---|
| `docs/DIPA_EXTERNE_TODO_2026-08-14.md` | Vollständige externe To-do-Liste, Punkt 3 = dieses Mandat |
| `docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md` | 48-Punkte-Prüftabelle gegen Primärquellen (DiPAV, BfArM-Leitfaden, MDR), inkl. PROD-02-Fundstelle |

---

## 10. Harte Leitplanken für dieses Mandat

- Der Digitale PflegeCoach ist für Endnutzer **dauerhaft kostenlos**. Eine
  Monetarisierung ist ausschließlich über eine künftige, tatsächliche
  DiPA-Zulassung mit Kassenerstattung vorgesehen — nicht über den aktuell
  gesperrten Selbstzahler-Weg.
- **Keine DiPA-Zulassung liegt vor, keine ist beantragt.** Dieses Briefing
  und die zugrunde liegenden Dokumente behaupten weder das eine noch das
  andere.
- Keine Preise oder Erstattungsbeträge sind in diesem Briefing genannt oder
  vorweggenommen.
- Kundengerichtete Kommunikation zu diesem Mandat erfolgt ausschließlich
  unter dem Absender „Alltagsengel", nicht unter Namen einzelner
  Mitarbeitender.
