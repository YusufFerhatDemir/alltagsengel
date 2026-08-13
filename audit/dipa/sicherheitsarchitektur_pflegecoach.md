# Sicherheitsarchitektur — Digitaler PflegeCoach

**Stand:** 2026-08-13
**Status:** ENTWURF — aus dem Quellcode abgeleitet; externe Prüfung steht aus
**Verhältnis zum Sicherheits-Review:** `security_review_pflegecoach.md` ist die
**Prüfung** (Befunde, Auflagen, Testmatrix). Dieses Dokument ist die
**Beschreibung der Bauweise** — was verteidigt wird, womit, und wo die Grenzen
liegen.

---

## 1. Schutzziele

| Ziel | Konkret für dieses Produkt | Priorität |
|------|---------------------------|-----------|
| Vertraulichkeit | Pflege- und Gesundheitsdaten sieht ausschließlich die betroffene Person und wer von ihr freigegeben wurde | höchste |
| Integrität | Einwilligungen, Berichte und Protokolle sind nachträglich nicht veränderbar | hoch |
| Zurechenbarkeit | Jeder schreibende Zugriff ist protokolliert — ohne dabei eine zweite Datenkopie zu erzeugen | hoch |
| Verfügbarkeit | Ausfall ist unangenehm, aber nicht gefährlich: Der PflegeCoach ist kein Notrufsystem und keine Überwachung | mittel |

Die Reihenfolge ist bewusst. Sie folgt daraus, dass Verfügbarkeit hier keine
Gefahr für Leib und Leben bedeutet — anders als bei einem System mit
Alarmierungsfunktion, das dieses Produkt ausdrücklich nicht ist.

---

## 2. Verteidigungslinien

Sechs Schichten. Jede setzt voraus, dass die darüberliegende versagen kann.

```
 1  Transport            HTTPS erzwungen; HTTP wird umgeleitet
 2  Antwort-Header       CSP, X-Frame-Options, HSTS (next.config.ts)
 3  Sitzung              Plattform-Authentifizierung; requireCoachUser()
 4  Route                Feld-Whitelist, Wertebereiche, Längen, Einwilligungstor
 5  Row Level Security   die eigentliche Zugriffswahrheit
 6  Grants               entzogene Rechte, die auch ohne Policy nicht greifen
```

Der Entwurfsgrundsatz: **Schicht 5 allein muss halten.** Die Schichten 3 und 4
sind Bequemlichkeit und frühe Fehlermeldung, keine Sicherheitsgarantie. Fiele eine
Prüfung in einer Route ersatzlos weg, bliebe der Zugriff trotzdem verwehrt.

Schicht 6 ist der Umgang mit einer bekannten Falle: Im öffentlichen Schema der
Datenbankplattform sind neue Tabellen und Funktionen standardmäßig für nicht
angemeldete Zugriffe nutzbar. Beide Migrationen entziehen diese Rechte
ausdrücklich (`REVOKE ALL … FROM anon`) und entziehen zusätzlich einzelne Rechte
dort, wo die Unveränderlichkeit zählt.

---

## 3. Angriffsflächen und Maßnahmen

### 3.1 Fremdzugriff auf Daten anderer

| Angriffsweg | Maßnahme | Wo |
|-------------|----------|-----|
| Fremde Kennung im Anfrage-Körper | Zuordnung stammt immer aus dem Auth-Kontext, nie aus dem Body; zusätzlich `WITH CHECK` in der Datenbank | alle Routen, Migration Teil 10 |
| Fremde Kennung im Pfad | Änderungsrouten filtern zusätzlich auf die eigene Zuordnung; RLS greift ohnehin | `ziele/[id]`, `aktivitaeten/[id]` |
| Zugriff ohne Anmeldung | Grants für nicht angemeldete Zugriffe vollständig entzogen | beide Migrationen |
| Zugriff über ein Verwaltungskonto | für Gesundheitsdaten existiert **keine** Verwaltungs-Policy | Migration Teil 10 |
| Pseudonym einer anderen Person berechnen | die parametrisierte Pseudonym-Funktion ist angemeldeten Sitzungen entzogen | Migration Teil 1 |
| Nachwirkende Freigabe nach Widerruf | Policy prüft `widerrufen_am IS NULL` bei jedem Zugriff; kein Zwischenspeicher | Migration Teil 10 |

### 3.2 Manipulation eigener Daten

| Angriffsweg | Maßnahme |
|-------------|----------|
| Zusätzliche Felder mitschicken (Mass Assignment) | jede Route listet die erlaubten Felder ausdrücklich auf |
| Summenwert der Belastungs-Selbsteinschätzung fälschen | Berechnung erfolgt serverseitig aus den Antworten |
| Unzulässige Werte | Wertebereiche als CHECK-Constraint in der Datenbank **und** serverseitige Prüfung |
| Bericht nachträglich schönen | kein Ändern, kein Löschen — weder Policy noch Grant |
| Einwilligung nachträglich entfernen | kein Löschen; ein Widerruf setzt nur `widerrufen_am` |
| Eigenes Protokoll bereinigen | Schreibrechte auf das Protokoll entzogen; Eintrag nur durch Trigger mit Eigentümerrechten |

### 3.3 Einschleusen und Ausführen

| Angriffsweg | Maßnahme |
|-------------|----------|
| SQL-Einschleusung | kein zusammengesetztes SQL im Produktcode — ausschließlich der Abfrage-Erzeuger der Datenbankbibliothek |
| Skript-Einschleusung über Freitexte | keine Roh-HTML-Ausgabe im Produktbereich; Inhalte sind statische Konstanten; Freitexte werden als Text gerendert |
| Suchpfad-Manipulation bei Datenbankfunktionen | alle Funktionen mit erweiterten Rechten setzen `SET search_path` ausdrücklich |
| Einbettung der Anwendung in fremde Seiten | `X-Frame-Options` und Inhaltsrichtlinie in `next.config.ts` |

Die Suchpfad-Frage ist hier kein theoretischer Punkt: Eine Funktion mit
Eigentümerrechten und ohne festgelegten Suchpfad ist ein bekannter Weg zur
Rechteausweitung. Betroffen wären `coach_audit_trigger()`, `coach_pseudonym()`
und `coach_mein_pseudonym()` — alle drei setzen ihn.

### 3.4 Freischaltcodes

| Angriffsweg | Maßnahme |
|-------------|----------|
| Codes aus der Datenbank auslesen | nur SHA-256 mit serverseitigem Pfeffer gespeichert; Klartext erscheint genau einmal bei der Ausgabe |
| Codetabelle über die Nutzer-Schnittstelle lesen | Nutzende haben auf diese Tabelle keinerlei Rechte |
| Präfixe durchprobieren | einheitliche Fehlermeldung ohne Rückschluss darauf, ob ein Code existiert |
| Denselben Code mehrfach einlösen | `UPDATE … WHERE status = 'ausgegeben'` — bei parallelen Versuchen gewinnt genau einer; schlägt der Folgeschritt fehl, wird der Code zurückgesetzt |
| Sich selbst eine Freischaltung eintragen | Schreibrechte auf `coach_freischaltungen` sind angemeldeten Sitzungen entzogen |

Fehlt der Pfeffer in der Umgebung, warnt der Verwaltungsbereich sichtbar. Eine
nachträgliche Änderung des Pfeffers entwertet alle ausgegebenen Codes — das ist
in der technischen Dokumentation vermerkt.

### 3.5 Fehlende Rechtsgrundlage

Seit der Einführung von `lib/coach/consent.ts` ist die Einwilligung nicht nur
Text, sondern ein technisches Tor:

* Jede **schreibende** Route ruft `requireCoachUser({ schreibzugriff: true })`
  auf und schreibt nur, wenn die Pflicht-Einwilligung aktiv ist.
* Die Prüfung ist **fail-closed**: Lässt sich die Einwilligung nicht ermitteln,
  wird nicht geschrieben (Antwort 503), statt im Zweifel zu schreiben.
* Lesen, Export, Löschung und die Einwilligungsverwaltung bleiben nach einem
  Widerruf offen — sonst wäre der Widerruf eine Falle, die den Zugang zu den
  eigenen Daten versperrt.
* Ein Strukturtest (`lib/coach/produktgrenze.test.ts`) prüft, dass **jede**
  schreibende Route dieses Tor benutzt. Eine neu hinzugefügte Route ohne das
  Tor lässt den Test fehlschlagen, statt still an der Einwilligung vorbei
  Gesundheitsdaten anzulegen.

Derselbe Test sichert zwei weitere Zusagen ab: dass im ungegateten Produktbereich
keine Aussage zu Erstattung oder Zulassung steht und dass die DiPA-spezifischen
Seiten und Routen tatsächlich an ihre Schalter gebunden sind.

---

## 4. Kryptografische Verfahren

| Zweck | Verfahren | Schlüssel |
|-------|-----------|-----------|
| Transport | TLS über die Hosting-Plattform | Plattform |
| Ruhezustand | Verschlüsselung der Datenbankplattform | Plattform — **vor Antragstellung zu verifizieren** |
| Freischaltcodes | SHA-256 über normalisierten Code und serverseitigen Pfeffer | `COACH_CODE_PEPPER` (Umgebungsvariable) |
| Pseudonymisierung | HMAC-SHA256 | 32 Byte in `coach_pseudonym_key`, für niemanden lesbar |
| Passwörter | Verfahren der Plattform-Authentifizierung; das Produkt sieht keine Passwörter | Plattform |

Zwei Punkte, die hier nicht beschönigt werden:

1. **Alle Angaben zu Plattformleistungen** (Hosting, Datenbank, Verschlüsselung
   im Ruhezustand, Sicherungskopien) sind vor einer Antragstellung zu
   verifizieren. Sie werden hier nicht als gesichert dargestellt.
2. **Keine Ende-zu-Ende-Verschlüsselung.** Die Entscheidung samt Begründung steht
   in `verschluesselungskonzept.md` §5.

---

## 5. Protokollierung

Vollständig in `logging_audit_konzept.md`. Sicherheitsrelevant sind drei
Eigenschaften:

* Das Protokoll wird ausschließlich durch einen Datenbank-Trigger geschrieben —
  nicht durch Anwendungscode, der vergessen werden könnte.
* Es enthält **keine Datenwerte**, damit es keine zweite Kopie der
  Gesundheitsdaten wird.
* Es ist für alle Beteiligten unveränderlich; Nutzende können ihre eigenen
  Einträge lesen, aber nicht schreiben, ändern oder löschen.

**Bekannte Grenze:** Es gibt kein Protokoll erfolgloser Anmeldeversuche im
Produktbereich und keine Auswertung auf auffällige Muster. Beides läge auf Ebene
der Plattform-Authentifizierung.

---

## 6. Sicherheit im Entwicklungsprozess

| Maßnahme | Umsetzung |
|----------|-----------|
| Geheimnisse gelangen nicht ins Repository | Prüfung vor jedem Ausbringen (`precommit-guard` in `deploy.sh`) |
| Typprüfung | `npm run typecheck`, zusätzlich bei jedem Bauen durch die Hosting-Plattform |
| Fachliche Regeln getestet | Unit-Tests je Modul in `lib/coach/*.test.ts` |
| Zugriffsregeln getestet | `supabase/shadow/50_pflegecoach_tests.sql` gegen eine aus dem Repository aufgebaute Datenbank |
| Produktgrenze getestet | `lib/coach/produktgrenze.test.ts` (Strukturtest über den Quelltext) |
| Barrierefreiheitsregeln | als Fehler für `app/pflegecoach/**` (`eslint.config.mjs`) |
| Rückrollbarkeit | zu jeder Migration ein Rückrollskript; Code-Rückrollung über `scripts/rollback.sh` |

---

## 7. Bekannte Schwächen — ohne Beschönigung

| # | Schwäche | Bewertung | Zuordnung |
|---|----------|-----------|-----------|
| S1 | **Kein zweiter Faktor.** Wer Zugangsdaten erlangt, erlangt vollen Zugriff auf die Gesundheitsdaten dieser Person | die derzeit gewichtigste Schwäche; betrifft die gesamte Plattform, nicht nur dieses Produkt | GAP-MFA |
| S2 | **Kein externer Penetrationstest.** Die vorliegende Prüfung ist ein Selbst-Review desselben Autors wie der Code | strukturelle Grenze, nicht durch mehr Eigenprüfung behebbar | GAP-EXT-REVIEW |
| S3 | **Kein Sicherheitszertifikat** einer akkreditierten Prüfstelle | Selbsteinschätzung liegt vor, Zertifikat nicht | GAP-TR03161 |
| S4 | **Kein Managementsystem für Informationssicherheit** | Bausteine vorhanden, System nicht | GAP-ISMS |
| S5 | **Kein geprüftes Wiederanlaufkonzept.** Sicherung liegt bei der Plattform; eine Rücksicherung wurde nie erprobt | Verfügbarkeitsrisiko, kein Vertraulichkeitsrisiko | offen |
| S6 | **Datenbankadministration kann alles lesen.** Gilt bauartbedingt; nur organisatorisch begrenzbar, und diese Maßnahmen sind nicht dokumentiert | Restrisiko | EXT-06 |
| S7 | **Keine Begrenzung der Anfragehäufigkeit** in den Produktrouten | begrenzt relevant, da jede Route ohnehin nur eigene Daten liefert; für die Code-Einlösung dennoch prüfenswert | offen |
| S8 | **Gemeinsame Infrastruktur mit der Plattform** (Anmeldung, Hosting) | für Pilotbetrieb tragbar; vor Antragstellung zu bewerten | GAP-TRENNUNG |
| S9 | **Keine Laufzeitprüfung der Zugriffsregeln gegen die Produktionsdatenbank.** Geprüft ist gegen eine aus dem Repository aufgebaute Datenbank | Restrisiko einer Abweichung zwischen Repository und Produktion | GAP-E2E |
| S10 | **Datenbanktests fehlen für die sieben Tabellen der zweiten Migration** | Lücke im Nachweis, nicht im Schutz | GAP-SHADOW-15 |

## 8. Bewertungsreihenfolge für die Behebung

Ohne Zahlen, weil die Bewertungsmethodik erst festzulegen ist
(`risikobewertungsverfahren.md`). Die Reihenfolge folgt der Frage: *Wie
wahrscheinlich ist der Weg, und wie groß ist der Schaden am Ende?*

1. **S1 (zweiter Faktor)** — der einzige Punkt, bei dem ein realistischer Weg zu
   einem vollständigen Zugriff auf Gesundheitsdaten führt.
2. **S10, S9 (Nachweislücken)** — intern lösbar, senken die Unsicherheit über
   alles Übrige.
3. **S2, S3 (externe Prüfung, Zertifikat)** — lange Vorlaufzeiten, deshalb früh
   beauftragen, auch wenn sie erst später wirken.
4. **S6, S5 (Organisation, Wiederanlauf)** — Aufwand niedrig, Wirkung stetig.
5. **S7, S8, S4** — nach Klärung des Verfahrens und der Zielarchitektur.

---

## 9. Was für einen Pilotbetrieb reicht und was nicht

**Trägt einen Pilotbetrieb:** Zugriffskontrolle in der Datenbank, Trennung von
Berechtigungs- und Gesundheitsdaten, unveränderliche Protokolle und Berichte,
fail-closed durchgesetzte Einwilligung, Werbe- und Trackerfreiheit, dokumentierte
Rückrollwege.

**Trägt eine Antragstellung nicht:** S1 bis S4. Diese vier Punkte sind nicht durch
weitere Arbeit am Code zu schließen — sie erfordern eine Entscheidung
(zweiter Faktor), eine Beauftragung (Prüfung, Zertifikat) oder einen Aufbau
(Managementsystem). Der Aktionsplan dafür steht in
`docs/DIPA_EXTERNAL_ACTIONS.md`.
