# Nutzungsbedingungen Selbstzahler-Weg — Arbeitsentwurf

**Produkt:** Digitaler PflegeCoach · **Version:** 0.5.0 · **Stand:** 2026-08-14
**Deckt ab:** DiPA-Matrix VS-04 (Vorbereitung)
**Betrifft Produkt A** (privat zu zahlendes Angebot) — **nicht** die DiPA-Aufnahme

---

## ⚠ Status: ENTWURF — nicht veröffentlichen

Dieser Text ist **keine wirksame Vertragsgrundlage** und darf nicht als
solche eingesetzt werden. Er ist eine Arbeitsgrundlage für die juristische
Prüfung, die zusammen mit DS-02 zu beauftragen ist.

Ausdrücklich ungeprüft sind: Wirksamkeit der Klauseln nach AGB-Recht,
Vollständigkeit der Pflichtinformationen für Fernabsatzverträge, Form und
Wortlaut der Widerrufsbelehrung, steuerliche Angaben.

**Es steht bewusst kein Betrag in diesem Entwurf.** Die Preise sind
kaufmännisch nicht entschieden; der Bestellweg ist deshalb technisch
gesperrt (`COACH_PREISE_FREIGEGEBEN` = aus). Wo ein Betrag hingehört, steht
`[Betrag]`. Ein Entwurf mit erfundenen Zahlen wäre gefährlicher als einer
mit Lücken.

---

## Nutzungsbedingungen für den Digitalen PflegeCoach

### § 1 Anbieter und Gegenstand

(1) Anbieter des Digitalen PflegeCoach ist Alltagsengel. Die
Anbieterkennzeichnung nach § 5 DDG steht im Impressum.

(2) Gegenstand ist der Zugang zum Digitalen PflegeCoach, einer digitalen
Anwendung zur Selbstorganisation im Pflegealltag. Der Leistungsumfang
ergibt sich aus der Leistungsbeschreibung in § 2.

### § 2 Leistungsbeschreibung

(1) Der Digitale PflegeCoach stellt zur Verfügung:

* Selbsteinschätzung der Selbständigkeit in fünf Lebensbereichen
* Anlegen und Verfolgen eigener Ziele
* Wochenplan mit Alltagsaktivitäten und Erledigungsübersicht
* Allgemeine Bewegungsübungen und Wissensmodule
* Belastungs-Selbsteinschätzung für pflegende Angehörige
* Verlaufsansicht und druckbare Berichte
* Vollständigen Datenexport (maschinenlesbar und im FHIR-Format)
* Freigabe eigener Daten an Angehörige oder einen Pflegedienst,
  jederzeit widerruflich

(2) **Der Digitale PflegeCoach ist kein Medizinprodukt.** Er stellt keine
Diagnose, gibt keine Therapieempfehlung und ersetzt keine ärztliche oder
pflegerische Beratung. In Notfällen ist der Rettungsdienst unter 112 zu
verständigen.

(3) **Der Digitale PflegeCoach ist keine Leistung der Pflege- oder
Krankenkassen.** Er ist nicht in das Verzeichnis für digitale
Pflegeanwendungen aufgenommen. Eine Erstattung durch einen Kostenträger
findet nicht statt.

(4) Die Inhalte sind allgemeine Alltags- und Bewegungsanleitungen. Sie
sind nicht auf den Einzelfall zugeschnitten. Vor der Ausführung von
Übungen ist im Zweifel ärztlicher Rat einzuholen.

> **Hinweis für die juristische Prüfung:** Solange die Inhalte den Status
> „Entwurf" tragen (QI-01), weist das Produkt dies sichtbar aus. Ob dieser
> Umstand zusätzlich in den Bedingungen zu erwähnen ist, ist zu bewerten.

### § 3 Vertragsschluss

(1) Die Darstellung im Bestellweg ist eine Aufforderung zur Abgabe eines
Angebots. Mit Absenden der Bestellung gibt die Nutzerin oder der Nutzer ein
verbindliches Angebot ab.

(2) Der Vertrag kommt mit der Bestellbestätigung durch den Anbieter
zustande.

(3) Voraussetzung ist ein Nutzerkonto sowie die Einwilligung in die
Verarbeitung der Gesundheitsdaten. Ohne diese Einwilligung ist die Nutzung
technisch nicht möglich.

### § 4 Preise und Zahlung

(1) Es gelten die im Bestellweg zum Zeitpunkt der Bestellung angezeigten
Preise: `[Betrag]` je Monat im Monatstarif, `[Betrag]` je Jahr im
Jahrestarif, jeweils brutto.

(2) Umsatzsteuer: `[Angabe — Kleinunternehmerregelung nach § 19 UStG oder
Regelbesteuerung mit Satz]`.

(3) Die Zahlung erfolgt über den im Bestellweg angebotenen
Zahlungsdienstleister.

(4) Der Betrag wird zu Beginn jedes Abrechnungszeitraums fällig.

> **Offen:** Absätze 1 und 2 sind erst nach der kaufmännischen und
> steuerlichen Entscheidung ausfüllbar. Die technische Sperre bleibt bis
> dahin aktiv (`lib/coach/pricing.ts`).

### § 5 Laufzeit und Kündigung

(1) Der Vertrag läuft je nach gewähltem Tarif einen Monat oder ein Jahr
und verlängert sich jeweils um denselben Zeitraum, sofern nicht gekündigt
wird.

(2) Die Kündigung ist jederzeit zum Ende des laufenden Abrechnungszeitraums
möglich, ohne Frist und ohne Angabe von Gründen. Sie erfolgt unmittelbar in
der Anwendung.

(3) Nach der Kündigung bleibt der Zugang bis zum Ende des bezahlten
Zeitraums bestehen.

(4) **Unabhängig vom Vertrag** kann die Nutzung jederzeit beendet werden:
Die Einwilligung ist jederzeit widerrufbar, und die eigenen Daten können
jederzeit exportiert und gelöscht werden. Es besteht keine Mindestlaufzeit
für die Nutzung selbst.

### § 6 Widerrufsrecht

Verbraucherinnen und Verbrauchern steht ein Widerrufsrecht von 14 Tagen ab
Vertragsschluss zu.

> **Wichtige technische Festlegung, die nicht verwässert werden darf:**
> Die Anwendung prüft ausschließlich die Frist und lässt das Widerrufsrecht
> **nicht** vorzeitig erlöschen (`lib/coach/bestellung.ts`,
> `widerrufMoeglich()`). Ein vorzeitiges Erlöschen setzte eine ausdrückliche
> Zustimmung und einen Kenntnisnahmevermerk voraus; darauf wird bewusst
> verzichtet. Die Widerrufsbelehrung muss zu diesem Verhalten passen — ein
> Belehrungstext, der ein vorzeitiges Erlöschen behauptet, stünde im
> Widerspruch zur Technik.

Die vollständige Widerrufsbelehrung nebst Muster-Widerrufsformular ist im
Rahmen der juristischen Prüfung zu erstellen und im Bestellweg vor
Vertragsschluss bereitzustellen.

### § 7 Pflichten der Nutzerinnen und Nutzer

(1) Die Zugangsdaten sind geheim zu halten. Es wird empfohlen, den zweiten
Faktor zu aktivieren (Einstellungen → Anmeldesicherheit).

(2) Die Anwendung darf nicht missbräuchlich genutzt werden, insbesondere
nicht zur Speicherung von Daten Dritter ohne deren Kenntnis.

(3) Die Freigabe eigener Daten an Angehörige oder einen Pflegedienst
erfolgt eigenverantwortlich und ist jederzeit widerruflich.

### § 8 Verfügbarkeit

(1) Der Anbieter bemüht sich um eine hohe Verfügbarkeit, schuldet jedoch
keine bestimmte Verfügbarkeitsquote.

(2) Wartungsarbeiten werden nach Möglichkeit angekündigt.

> **Offen:** Ob eine Verfügbarkeitszusage aufgenommen werden soll, ist eine
> geschäftliche Entscheidung. Ohne Betriebsüberwachung (siehe
> Lebenszyklus-Dokument §2.5) wäre sie derzeit nicht überprüfbar — und
> deshalb wird hier keine gemacht.

### § 9 Datenschutz

Es gelten die Datenschutzhinweise zum Digitalen PflegeCoach. Die
Verarbeitung der Gesundheitsdaten beruht ausschließlich auf der
ausdrücklichen Einwilligung, die jederzeit mit Wirkung für die Zukunft
widerrufen werden kann.

### § 10 Änderungen dieser Bedingungen

Änderungen werden mindestens sechs Wochen vor Wirksamwerden in Textform
mitgeteilt. Widerspricht die Nutzerin oder der Nutzer nicht bis zum
Wirksamwerden, gelten die Änderungen als angenommen; auf diese Wirkung wird
in der Mitteilung gesondert hingewiesen. Im Fall des Widerspruchs kann
jede Seite zum Wirksamkeitszeitpunkt kündigen.

> **Prüfhinweis:** Zustimmungsfiktionen sind AGB-rechtlich heikel und
> ausdrücklich zu bewerten.

### § 11 Haftung

`[Von der juristischen Prüfung zu formulieren.]`

Hier wird bewusst kein Entwurf vorgelegt: Eine Haftungsklausel, die im
Ernstfall unwirksam ist, ist schlechter als keine — und die Grenzen sind
gerade bei einem gesundheitsnahen Angebot eng.

### § 12 Support

Anfragen erreichen den Anbieter unter der im Produkt genannten
Supportadresse sowie über das Anfrageformular.

> **Offen:** Eine Reaktionszeit ist nicht zugesagt und wird deshalb hier
> auch nicht genannt (VS-02).

### § 13 Schlussbestimmungen

Es gilt deutsches Recht. Verbraucherinnen und Verbrauchern bleiben
zwingende Vorschriften ihres Aufenthaltsstaates erhalten. Der Anbieter ist
`[zur Teilnahme an einem Streitbeilegungsverfahren bereit / nicht bereit
und nicht verpflichtet — zu entscheiden]`.

---

## Anhang: Prüfliste für das juristische Mandat

| Nr. | Punkt | Warum |
|---|---|---|
| 1 | Wirksamkeit sämtlicher Klauseln nach AGB-Recht | Verbrauchervertrag |
| 2 | Vollständigkeit der Pflichtinformationen im Fernabsatz | Bestellweg ist rein digital |
| 3 | Widerrufsbelehrung und Muster-Widerrufsformular | § 6 — muss zur Technik passen |
| 4 | Zustimmungsfiktion in § 10 | AGB-rechtlich heikel |
| 5 | Haftungsklausel | § 11, bewusst offen gelassen |
| 6 | Steuerliche Angaben | § 4 Abs. 2 |
| 7 | Rollenverhältnis zum Zahlungsdienstleister | zugleich DS-04 |
| 8 | Abstimmung mit den Datenschutzhinweisen | Einwilligung vs. Vertragserfüllung als Grundlage |
| 9 | Prüfung, ob die Aussagen in § 2 Abs. 2–4 ausreichen | Abgrenzung zu Medizinprodukt und Kassenleistung |
| 10 | Verhältnis zu den Plattform-AGB unter `/agb` | Doppelregelungen vermeiden |

## Status

Entwurf erstellt, nicht geprüft, nicht veröffentlicht, nicht wirksam.
**Nächster Schritt:** gemeinsam mit DS-02 und PROD-02 in ein Mandat geben —
eine Kanzlei, drei Themen, ein Vorgang.
