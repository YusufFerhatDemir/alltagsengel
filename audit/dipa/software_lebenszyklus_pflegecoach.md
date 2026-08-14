# Software-Lebenszyklus — Digitaler PflegeCoach

**Produkt:** Digitaler PflegeCoach · **Version:** 0.5.0 · **Stand:** 2026-08-14
**Deckt ab:** DiPA-Matrix QMS-01 (Lebenszyklus), QMS-03, PROD-03
**Status:** intern erstellt, extern nicht auditiert

---

## 0. Einordnung

Der PflegeCoach ist **kein Medizinprodukt** (Begründung:
`audit/dipa/mdr_negativabgrenzung.md`). Damit ist IEC 62304 nicht
anwendbar, und es wird auch keine Konformität dazu behauptet. Dieses
Dokument beschreibt den tatsächlich gelebten Lebenszyklus in der Gliederung,
die ein Prüfer erwartet — Planung, Entwicklung, Prüfung, Freigabe, Betrieb,
Wartung, Außerbetriebnahme.

Wo eine Phase nur geplant und noch nie durchlaufen ist, steht das dabei.

## 1. Versionierung und Produktidentität

`lib/coach/version.ts` ist die einzige Quelle der Produktversion. Sie
erscheint in der Fußzeile, im Datenexport und in jedem Verlaufsbericht —
ein exportierter Datensatz ist damit immer einer Produktfassung zuordenbar.

| Kategorie | Auslöser | Folge |
|---|---|---|
| PATCH | Fehlerbehebung ohne Funktionsänderung | Changelog-Eintrag |
| MINOR | neue oder geänderte Funktion | Changelog-Eintrag; potenziell anzeigepflichtig (offene Frage, BfArM-Frage 20) |
| MAJOR | Änderung an Zweckbestimmung oder Produktgrenze | **Vor** der Umsetzung regulatorisch zu bewerten |

Die Produktversion ist bewusst von der Plattform-Auslieferung getrennt: Die
Plattform wird mehrmals täglich ausgeliefert, ohne dass sich das Produkt
ändert. Eine gemeinsame Versionierung würde jede Änderungsanzeige sinnlos
machen.

## 2. Phasen

### 2.1 Planung

Eine Änderung beginnt mit der Einordnung nach §1 und der Frage, welche
Matrix-Anforderung sie berührt (`docs/DIPA_MATRIX_FINAL.md`). Berührt sie
die Produktgrenze, ist die Bewertung Teil der Planung und nicht der
Nacharbeit.

### 2.2 Entwicklung

| Grundsatz | Umsetzung |
|---|---|
| Fachlogik ist frei von Ein-/Ausgabe | Alle Regeln in `lib/coach/*.ts` sind reine Funktionen — deshalb überhaupt testbar |
| Zugriffsregeln liegen in der Datenbank | `service_role` wird ausschließlich in `lib/coach/verkauf-server.ts` und den Zahlungsrouten (`app/api/coach/checkout`, `/freischaltung`, `/abo`) genutzt — begrenzt auf Bestell-/Rechnungs-/Freischaltungstabellen (`coach_bestellungen`, `coach_rechnungen`, `coach_zahlungen`, `coach_freischaltungen`), nie für `coach_*`-Gesundheitsdaten. Details und Begründung: `audit/dipa/nutzerflow_dipa.md` §"Warum hier ausnahmsweise der Systemkontext genutzt wird" |
| Trennung von der Betriebsplattform | Eigene Tabellen, eigene Zeilenfilter, eigenes Layout, eigene Typen |
| Voreinstellungen sind die sichere Stellung | Jeder Schalter ist fail-closed (QM-Handbuch §7) |

### 2.3 Prüfung

Vier Ebenen, jede mit eigener Zuständigkeit:

1. **Fachlogik** — `lib/coach/*.test.ts`
2. **Produktgrenze** — `lib/coach/produktgrenze.test.ts` (liest den Quelltext)
3. **Zugriffsregeln** — `supabase/shadow/50_pflegecoach_tests.sql` gegen eine
   Datenbank, die allein aus dem Repository aufgebaut wird
4. **Oberfläche** — `e2e/pflegecoach.spec.ts` (prüft das tatsächlich
   Ausgelieferte)

Die Trennung ist Absicht: Ebene 2 prüft die Absicht im Code, Ebene 4 das
Ergebnis im Browser. Ein Fehler, der nur in einer der beiden Ebenen sichtbar
wird, wäre sonst unentdeckt geblieben.

### 2.4 Freigabe und Auslieferung

Auslieferung ausschließlich über `./deploy.sh`: Typprüfung, Secret-Guard,
Übertragung, anschließende Bestätigung am Ziel. Datenbankänderungen sind
erst dann fertig, wenn ihre Anwendung auf der Produktionsdatenbank
**bestätigt** ist — nicht, wenn die Datei existiert.

### 2.5 Betrieb

| Gegenstand | Umsetzung |
|---|---|
| Zugriffsprotokoll | `coach_audit_log`, append-only, nur Metadaten, nur eigene Einträge lesbar |
| Datensparsamkeit im Protokoll | Keine Wertespalten — durch Test P7 abgesichert |
| Rückmeldungen | `info@alltagsengel.care`, `/pflegecoach/anfrage` |
| Störungen | Schweregrade und Reaktion: QM-Handbuch §5 |

**Offen:** Es gibt keine Überwachung, die eine Störung im Produktbereich von
sich aus meldet. Störungen werden heute durch Nutzung oder Rückmeldung
bemerkt. Für den heutigen Nutzerkreis tragbar, für einen Pilotbetrieb nicht —
vor Pilotstart einzurichten.

### 2.6 Wartung

| Anlass | Vorgehen |
|---|---|
| Sicherheitsaktualisierung einer Abhängigkeit | Einspielen, Testtore, Auslieferung; bei kritischer Lücke vorrangig |
| Fehlerbehebung | Nach Schweregrad (QM-Handbuch §5) |
| Inhaltsänderung | Erst nach pflegefachlicher Freigabe (QI-01) — bis dahin bleibt jeder Inhalt auf `entwurf` |
| Regulatorische Änderung | Neubewertung der Matrix, dann Planung |

### 2.7 Rücknahme einzelner Funktionen

Der Regelweg ist der Schalter, nicht der Rückbau: Jede regulatorisch
unsichere Funktion lässt sich ohne Auslieferung abschalten (QM-Handbuch §7).
Das ist der schnellste verfügbare Weg, eine Funktion aus dem Verkehr zu
ziehen, und er wurde beim Entwurf jeder dieser Funktionen mitgebaut.

### 2.8 Außerbetriebnahme des Produkts

Noch nie durchlaufen; hier als Vorsorge festgehalten:

1. Ankündigung an alle Nutzer mit ausreichender Frist
2. Export der eigenen Daten bleibt bis zum letzten Tag verfügbar
   (JSON und FHIR)
3. Schreibsperre, Lesezugang bleibt
4. Löschung der Produktdaten; Kaskade ab `coach_users`
5. Löschung des Pseudonym-Schlüssels — damit sind auch alle
   Nachweisdaten unumkehrbar anonym
6. Vermerk in Changelog und Risikoakte

Schritt 5 ist bewusst der letzte: Ohne den Schlüssel ist keine Zuordnung
mehr möglich — auch keine nachträgliche Auswertung.

## 3. Abhängigkeiten und Fremdanteile

| Anteil | Rolle | Bemerkung |
|---|---|---|
| Anwendungsrahmen (Next.js/React) | Auslieferung der Oberfläche | Aktualisierung im Rahmen der Plattform |
| Datenbank- und Authentifizierungsplattform (Supabase) | Speicherung, Anmeldung, zweiter Faktor | Auftragsverarbeiter — Vertragslage offen (DS-04) |
| Hosting (Vercel) | Betrieb der Anwendung | Auftragsverarbeiter — Vertragslage offen (DS-04) |
| E-Mail-Versand (Resend) | Systemnachrichten | Auftragsverarbeiter — Vertragslage offen (DS-04); **keine** Gesundheitsdaten im Versand |

Eigenanteil des Produkts: die gesamte Fachlogik unter `lib/coach/**`, die
Oberfläche unter `app/pflegecoach/**`, die Routen unter `app/api/coach/**`
und die Datenstrukturen `coach_*`.

## 4. Nachvollziehbarkeit einer Auslieferung

Für jede ausgelieferte Fassung ist rekonstruierbar:

| Frage | Quelle |
|---|---|
| Welche Produktversion? | `lib/coach/version.ts` zum Zeitpunkt der Auslieferung |
| Was hat sich geändert? | `audit/dipa/CHANGELOG_pflegecoach.md` |
| Welcher Codestand? | Versionsverwaltung (Commit) |
| Welcher Datenbankstand? | Migrationsdateien mit Zeitstempel + bestätigte Anwendung |
| Welche Prüfungen liefen? | Testtore nach QM-Handbuch §4 |

## 5. Lücken

1. **Keine Betriebsüberwachung** im Produktbereich (§2.5).
2. **Rücksicherung nie erprobt** (Risiko R3.4).
3. **Kein turnusmäßiger Abhängigkeits-Review** — Aktualisierungen erfolgen
   anlassbezogen, nicht nach Plan.
4. **Außerbetriebnahme nie geprobt** — der Ablauf in §2.8 ist Vorsorge,
   kein Erfahrungswert.

Alle vier sind intern lösbar und heute offen.
