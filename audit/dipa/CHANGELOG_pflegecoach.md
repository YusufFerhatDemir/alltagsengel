# Changelog — Digitaler PflegeCoach (Produktversion)

Separater Versionsstrang des DiPA-Produkts (unabhängig von Plattform-Deployments).
Jede MINOR-/MAJOR-Änderung ist vor Release regulatorisch zu bewerten
(Änderungsanzeige? — BfArM-Frage 20, `bfarm_fragenkatalog.md`).

## 0.4.0 — 2026-08-13 (Widerruf wirkt, Schalter greifen, keine Sackgassen)

**Regulatorische Bewertung dieser MINOR-Änderung:** Die Zweckbestimmung bleibt
unverändert. Es kommt keine Funktion hinzu, die den Nutzen für die betroffene
Person verändert; es entfällt auch keine. Die Änderungen betreffen die
Durchsetzung der Einwilligung, die Wirksamkeit der Produktschalter und die
Fehlerführung. Ob daraus eine Anzeigepflicht folgt, ist mit BfArM-Frage 20 zu
klären. `COACH_DIPA_MODUS` bleibt Default `false`.

- **Widerruf der Pflicht-Einwilligung wirkt jetzt (Art. 7 Abs. 3 DSGVO).**
  Bisher war der Widerruf folgenlos: Die Oberfläche kündigte an, der
  PflegeCoach lasse sich danach nicht weiter nutzen — tatsächlich lief alles
  unverändert weiter. Neu prüft `requireCoachUser({ schreibzugriff: true })`
  vor jedem Schreibzugriff die Einwilligung (`lib/coach/consent.ts`) und
  antwortet sonst mit 403. Bewusst weiterhin offen bleiben Lesen, Datenexport
  (Art. 15/20), Löschung (Art. 17) und das erneute Erteilen — sonst wäre der
  Widerruf eine Falle. Bestehende Daten werden nicht automatisch gelöscht;
  die Löschung bleibt ein ausdrücklicher, eigener Schritt.
- **`COACH_FREISCHALTUNG_PFLICHT` war ein wirkungsloser Schalter.** Er wurde
  nur angezeigt, nie durchgesetzt. Ist er aktiv, sperrt er nun Schreibzugriffe
  bis zur Freischaltung. Solange er aus ist (Normalbetrieb), entsteht keine
  zusätzliche Abfrage.
- **Freischaltungs-API gegatet.** `/api/coach/freischaltung` war auch dann
  erreichbar, wenn beide Schalter aus waren — die Seite leitete um, die Route
  nicht. Sie antwortet jetzt mit 404. Der Navigationspunkt „Zugang
  freischalten" erscheint nur, wenn ein Verfahren tatsächlich aktiv ist.
- **Onboarding ist abbruchfest.** Ein zwischen Profilanlage und Einwilligung
  abgebrochener Anlauf endete in einem stillen Zwischenzustand: Profil
  vorhanden, Einwilligung fehlt, jeder spätere Speicherversuch scheitert.
  `/pflegecoach/start` erkennt das jetzt und holt gezielt den fehlenden
  Schritt nach; ein bereits vorhandenes Profil (409) ist kein Fehlerfall mehr.
- **Erste Schritte:** Nach dem Onboarding führt die Übersicht durch
  Assessment, erstes Ziel und erste Aktivität. Die Karte verschwindet, sobald
  alle drei erledigt sind.
- **Belastungs-Check in der Hauptnavigation** — er war bisher nur über
  Querverweise erreichbar, obwohl er ein eigener Inhaltsbereich mit eigenem
  Verlauf ist.
- **Keine Sackgassen mehr:** eigene Fehlergrenze (`error.tsx`) und 404-Seite
  (`not-found.tsx`) innerhalb der Produkt-Shell statt der Plattform-Seiten;
  Lösch- und Freischaltseite blieben bei einem Ladefehler dauerhaft auf
  „Wird geladen …" stehen; ungültige Fortschrittseingaben bei Zielen wurden
  stillschweigend verworfen.
- **Netzwerkfehler auf Deutsch:** Ein Verbindungsabbruch zeigte der Zielgruppe
  bisher die Browser-Meldung „Failed to fetch". Jetzt erscheint ein
  verständlicher Hinweis mit Schaltfläche „Erneut versuchen".
- **Einstellungen verwiesen falsch** auf Konto-Löschung und Support, obwohl
  die produkteigene Löschung (`/pflegecoach/loeschung`) längst existiert.
  Datenschutzhinweise um Widerrufswirkung und Selbstlöschung ergänzt.
- **Neue Tests:** Schalter-Semantik (`config.test.ts`), Einwilligungs-
  Auswertung (`consent.test.ts`) und ein Strukturtest der Produktgrenze
  (`produktgrenze.test.ts`) — er schlägt an, wenn im ungegateten
  Produktbereich eine Erstattungs- oder Zulassungsaussage auftaucht, ein
  DiPA-Gate fehlt oder eine neue Schreibroute die Einwilligungsprüfung
  auslässt.

## 0.3.0 — 2026-08-13 (Betrieb als normaler Service, Zulassungsunterlagen)

**Regulatorische Bewertung dieser MINOR-Änderung:** Die Zweckbestimmung bleibt
unverändert. Es kommt keine Funktion hinzu, die den Nutzen für die betroffene
Person verändert. Die Änderungen betreffen Auffindbarkeit, Sichtbarkeitsregeln
und Unterlagen. Ob daraus eine Anzeigepflicht folgt, ist mit BfArM-Frage 20 zu
klären.

- **Einstiegspunkt:** `/pflegecoach/start` zeigt Nicht-Angemeldeten jetzt die
  Zweckbestimmung samt Negativabgrenzung und den Anmeldeweg, statt sie ohne
  Erklärung auf das Login umzuleiten. Das Produkt ist erstmals von außen
  auffindbar (Fußzeile der Website, Schnellzugriff im Kundenbereich). Vorher war
  es aus der laufenden Anwendung heraus nicht erreichbar.
- **Freischaltseite versteckt:** `/pflegecoach/freischaltung` wird nur noch
  gerendert, wenn `COACH_DIPA_MODUS` oder `COACH_FREISCHALTUNG_PFLICHT` aktiv
  ist. Im Auslieferungszustand existierte dort eine Codeeingabe für ein
  Verfahren, das gar nicht gilt.
- **`COACH_DIPA_MODUS` in `.env.example` dokumentiert** — der Hauptschalter war
  als einziger nicht beschrieben. Default unverändert `false`.
- **Barrierefreiheit:** vollständiger `jsx-a11y`-Regelsatz als Fehler für
  `app/pflegecoach/**` (`eslint.config.mjs`); Lauf ohne Befund.
- **Neue Unterlagen:** Verarbeitungsverzeichnis, technische Dokumentation und
  Risikoanalyse (je `audit/dipa/*_pflegecoach.md`), zusammengeführt in
  `docs/DIPA_BFARM_READINESS.md`.
- **Korrektur zum Eintrag 0.2.0:** Die dort als offen bezeichneten Migrationen
  `20260819010000` und `20260826010000` sind seit dem 12.08.2026 auf der
  Produktionsdatenbank angewendet (GAP-DB damit erledigt).

## 0.2.0 — 2026-08-12 (Nutzerflow, Nachweise, eUL — nicht veröffentlicht)

Block 15a–15d. Weiterhin nicht produktiv: Migrationen `20260819010000` und
`20260826010000` sind nicht auf die Produktionsdatenbank angewendet (GAP-DB).

**Regulatorische Bewertung dieser MINOR-Änderung:** Die Zweckbestimmung bleibt
unverändert; es kommen keine Funktionen hinzu, die den Nutzen für die betroffene Person
verändern. Neu sind Berechtigungs-, Nachweis- und Betriebsfunktionen. Ob daraus eine
Anzeigepflicht folgt, ist mit BfArM-Frage 20 zu klären.

- **Nutzerflow (15a):** Anspruchsprüfung als versionierte Selbstauskunft
  (`/pflegecoach/anspruch`), Freischaltcode-Verfahren (Ausgabe im Betrieb, Einlösung im
  Produkt), pseudonymisierte Nutzungsnachweise, konfigurierbare Abrechnungswege ohne
  Beträge. Neue Migration `20260826010000` (7 Tabellen + Pseudonym-Infrastruktur).
- **Trennungskonzept:** HMAC-Pseudonymisierung mit eigenem, für niemanden lesbaren
  Schlüssel (`coach_pseudonym_key`). Ein Betriebs-Admin sieht Einlösungen, aber weder
  Person noch Inhalte.
- **Freischaltung ist bewusst KEINE Zugangsvoraussetzung** —
  `COACH_FREISCHALTUNG_PFLICHT` steht auf `false`, weil das Verfahren regulatorisch nicht
  feststeht (ORF-DIPA-FLOW).
- **Nutzungsnachweise** nur bei gesetztem Schalter **und** erteilter Einwilligung; ohne
  Zeitstempel, ohne Inhalte, mit Unterdrückung kleiner Gruppen. Schließt GAP-NUTZUNG.
- **Datenschutz (15b):** produktbezogene Löschung ohne Kontoverlust
  (`/pflegecoach/loeschung`) — schließt GAP-LOESCHUNG; Verschlüsselungs- und
  Löschkonzept, DSFA-Vorbereitung, TR-03161-Vorbereitungscheckliste.
- **Zulassung (15c):** maschinenlesbarer Anforderungskatalog mit Prüfstatus je Eintrag
  (`lib/coach/anforderungskatalog.ts`), MDR-Negativabgrenzung als eigenes Dokument,
  Testprotokoll-Vorlage für die Gebrauchstauglichkeit, Evaluationskonzept um das
  umgesetzte Datenerhebungs-Framework ergänzt.
- **eUL (15d):** Nachweisführung und Qualifikationskatalog für ergänzende
  Unterstützungsleistungen (`/admin/eul`) — als Betriebsdaten, strikt außerhalb des
  Produktpfads; keine Bewerbung und kein Buchungsweg im PflegeCoach.
- **Abweichung vom bisherigen Grundsatz „kein service_role im Coach-Code":** Zwei Routen
  nutzen den Systemkontext, ausschließlich für Berechtigungs- bzw. Aggregationsdaten —
  begründet in `security_review_pflegecoach.md` §4.
- 48 neue Unit-Tests (`anspruch`, `freischaltung`, `nachweise`, `eul`, `abrechnung`).

## 0.1.0 — 2026-08-09 (MVP, nicht veröffentlicht)

Erster Stand des Produkts. Nicht produktiv (Migration `20260819010000` nicht angewendet,
Push-/Deploy-Sperre aktiv).

- Datenmodell `coach_*` (10 Tabellen inkl. `coach_audit_log`), RLS nutzer-eigen +
  widerrufliche Freigaben, kein Betriebs-/Admin-Zugriff, anon vollständig entzogen.
- Append-only-Audit aller Schreibzugriffe (Metadaten ohne Datenwerte).
- API `/api/coach/*` (12 Routen, Session-Client/RLS, Whitelisting).
- UI `/pflegecoach` (13 Seiten): Onboarding mit versionierten Art.-9-Einwilligungen,
  Assessment, SMART-Ziele, Wochenplan, Mobilität, Alltag, Angehörige, Belastungs-Check,
  Verlauf, unveränderliche Berichte (Druck/PDF), Einstellungen, Datenschutz (Entwurf).
- Barrierefreiheit: Schriftskalierung (3 Stufen), Kontrastmodus, Fokus-Stile,
  Touch-Ziele ≥ 48 px, Skip-Link, `prefers-reduced-motion`.
- Werbe-/Trackerfreiheit im Produktpfad technisch erzwungen.
- Datenexport `de.alltagsengel.pflegecoach.export` v1.0 (JSON, Art. 20 DSGVO).
- Regelbasierte, rein organisatorische Anpassungs-Hinweise (MDR-Verbotsliste im Code).
- Inhalte mit `pruefstatus: 'entwurf'` (fachliche Freigabe ausstehend).
