# BfArM-Fragenkatalog (Innovationsbüro-Beratung) — „Digitaler PflegeCoach"

**Stand:** 2026-08-09 (aktualisiert nach MVP-Bau des Moduls `/pflegecoach`)
**Basis:** `audit/DIPA_REGULATORIK_2026-08-09.md` (Teil 5), ergänzt um Fragen, die sich aus der
konkreten Implementierung ergeben. Für die kostenpflichtige DiPA-Beratung des BfArM-Innovationsbüros.

> Statusnotiz zum Produkt bei Beratungsanfrage: MVP implementiert als eigenständiges Modul
> innerhalb der Alltagsengel-Plattform (eigener Pfad `/pflegecoach`, eigene Tabellen `coach_*`,
> eigene Zugriffsregeln, werbefrei/tracker-frei). Noch offen: TR-03161, ISO 27001, BITV-Test,
> wissenschaftlicher Partner (siehe `dipav_gap_liste.md`).

## A. Verfahren & Zeitplan
1. Ist der Pfad „vorläufige Aufnahme nach § 78a Abs. 6a SGB XI" (Aufnahme zur Erprobung) für ein
   Produkt möglich, das zum Antragszeitpunkt als MVP existiert, aber noch keine Nutzungsdaten hat —
   und welche Mindestreife (Funktionsumfang, Nutzerzahlen) erwartet das BfArM?
2. Welche Fristen und Gebühren gelten aktuell für (a) Beratung, (b) Antrag auf vorläufige Aufnahme,
   (c) Antrag auf endgültige Aufnahme, (d) Änderungsanzeigen?
3. Kann die 12-Monats-Frist der vorläufigen Aufnahme verlängert werden, und was passiert mit
   Bestandsnutzern bei Nichtverlängerung/Streichung?

## B. Zweckbestimmung & Abgrenzung
4. Trägt die vorgelegte Zweckbestimmung (`finale_zweckbestimmung.md`) die Einordnung als
   Nicht-Medizinprodukt aus Sicht des BfArM — insbesondere die Erinnerungsfunktion als reine
   Organisationsfunktion?
5. Wird die Doppelzielgruppe „Pflegebedürftige + pflegende Angehörige" in EINEM Produkt akzeptiert,
   oder erwartet das BfArM getrennte Nutzenargumentationen je Nutzergruppe nach der 1. DiPAV-ÄndV?
6. Ab welcher Ausgestaltung stuft das BfArM kognitive Trainingsmodule als medizinische
   Zweckbestimmung ein? (Im MVP nicht enthalten; Roadmap-Entscheidung hängt an der Antwort.)
7. Ist die strikte Trennung vom Betreuungsdienst-Geschäft der Alltagsengel UG ausreichend, oder
   bestehen Bedenken, wenn der DiPA-Hersteller zugleich Leistungserbringer nach § 45a/§ 71 SGB XI
   ist (Interessenkonflikt, Werbeverbot)?
8. **NEU (implementierungsbezogen):** Genügt dem BfArM eine regelbasierte, rein organisatorische
   „Anpassungs-Hinweis"-Funktion (Ziel überprüfen, Aktivität anpassen, statischer Verweis auf
   Pflegeberatung/Entlastungsangebote — ohne Scores, ohne Bewertungen) als Umsetzung der
   Anforderung „Anpassung von Maßnahmen", ohne die MDR-Abgrenzung zu gefährden?
   (Implementierung: `lib/coach/empfehlungen.ts`.)

## C. Technik & Nachweise
9. Welche Version der BSI TR-03161 und welches Prüfverfahren wird zum voraussichtlichen
   Antragszeitpunkt akzeptiert — und gilt die Zertifikatspflicht (seit 01.01.2025) uneingeschränkt
   auch für die vorläufige Aufnahme?
10. Welche konkreten Interoperabilitätsformate verlangt Anlage 2 DiPAV aktuell: genügt PDF +
    dokumentiertes strukturiertes JSON (implementiert: Export `de.alltagsengel.pflegecoach.export`
    v1.0 + druckbarer Bericht), oder sind FHIR-Profile/MIOs bzw. gelistete Standards verpflichtend?
    (ORF-9; FHIR-Mapping als Architektur-Option vorgesehen.)
11. Muss das ISO-27001-ISMS-Zertifikat bereits bei Antragstellung auf vorläufige Aufnahme vorliegen,
    und akzeptiert das BfArM einen ISMS-Scope nur für das DiPA-Produkt (nicht die gesamte UG)? (ORF-2)
12. Welche Barrierefreiheits-Nachweise werden konkret verlangt (BITV-Test? Selbsterklärung nach
    EN 301 549? WCAG-2.1-AA-Audit durch Dritte?) und in welcher Prüftiefe?
13. **NEU (implementierungsbezogen):** Der MVP läuft als eigenständiges, technisch getrenntes Modul
    (eigener URL-Pfad, eigene Tabellen mit eigenen Zugriffsregeln, werbe-/trackerfrei) innerhalb der
    Plattform-Infrastruktur des Herstellers; die Regulatorik-Analyse empfiehlt langfristig ein
    vollständig separates Deployment mit eigenem Datenbestand. Welche Trennungstiefe (eigene
    Domain/App? eigenes Backend-Projekt? eigene Datenbank?) erwartet das BfArM für Produktidentität,
    Datenschutz-Nachweis und TR-03161-Prüf-Scope?

## D. Evidenz & Evaluation
14. Welche methodischen Mindestanforderungen gelten für den Nachweis des pflegerischen Nutzens nach
    der 1. DiPAV-ÄndV — ist eine prospektive einarmige Beobachtungsstudie mit Prä-Post-Vergleich
    ausreichend oder wird eine Vergleichsgruppe erwartet? (ORF-10)
15. Werden die vorgesehenen Endpunkte akzeptiert: FES-I Kurzform (Sturzangst), HPS/BSFC-s (Belastung
    pflegender Angehöriger), selbstberichtete Selbständigkeit — oder gibt es präferierte Instrumente
    für DiPA-Nutzenkategorien?
16. **NEU (implementierungsbezogen):** Bis zur Lizenzklärung validierter Instrumente nutzt der MVP
    eine eigene, nicht validierte 7-Item-Belastungs-Selbsteinschätzung (nur Selbstreflexion/Verlauf,
    keine Bewertung). Ist ein solches Hilfskonstrukt im Produkt neben der späteren validierten
    Studienmessung zulässig, oder erwartet das BfArM durchgängig validierte Instrumente auch im
    Produkt-UI?
17. Genügt für die Nutzenkategorie „Entlastung pflegender Angehöriger" ein Nachweis ausschließlich
    bei Angehörigen, ohne Effektmessung beim Pflegebedürftigen?

## E. Vertrieb, Preis, Betrieb
18. Ist der Vertrieb einer gelisteten DiPA über zwei Marken-Einstiegspunkte zulässig, solange
    Produktname, Version und Datenhaltung identisch sind? (ORF-11)
19. Wie läuft die Vergütungsverhandlung nach § 78a Abs. 1 SGB XI zeitlich zur vorläufigen Aufnahme —
    gibt es während der Erprobungsphase bereits Erstattung, und zu welchem Betrag? (Rahmen: 53 €/Monat
    Gesamtanspruch nach § 40b, davon bis 40 € DiPA-Anteil.)
20. Welche Änderungen gelten als „wesentliche Veränderung" mit Anzeigepflicht (neue Wissensmodule?
    UI-Redesign? neue Erinnerungslogik?)?
21. Bestehen Anforderungen an technischen Support/Erreichbarkeit (Servicezeiten, Kanäle) aus
    Anlage 2 DiPAV, die eine UG mit kleiner Personaldecke einplanen muss?
