# Einwilligungslogik — Digitaler PflegeCoach

**Stand:** 2026-08-13
**Status:** ENTWURF — technische Beschreibung; juristische Prüfung der Texte
steht aus (GAP-DSFA)
**Umsetzung:** `coach_consents` (Migration `20260819010000`), `lib/coach/consent.ts`,
`lib/coach/api-auth.ts`, `app/api/coach/consents`, `app/pflegecoach/einstellungen`

---

## 1. Der Grundsatz

**Die Einwilligung ist kein Text, den man wegklickt, sondern das technische Tor
zum Produkt.** Ohne sie entsteht kein Datensatz. Mit ihrem Widerruf endet das
Entstehen neuer Datensätze — sofort und ohne dass eine Route das vergessen könnte.

Das war nicht immer so: In früheren Fassungen sagte die Oberfläche zwar, ohne die
Einwilligung sei die Nutzung nicht möglich, tatsächlich lief aber alles weiter.
Diese Lücke ist mit `lib/coach/consent.ts` geschlossen.

---

## 2. Die drei Einwilligungen

`coach_consents.consent_typ`, per CHECK-Constraint auf drei Werte begrenzt:

| Typ | Gegenstand | Freiwillig? | Wirkung, wenn nicht erteilt |
|-----|-----------|-------------|----------------------------|
| `gesundheitsdaten_art9` | Verarbeitung der Pflege- und Gesundheitsdaten | **erforderlich** für die Nutzung | kein Profil, keine Nutzung |
| `wissenschaftliche_auswertung` | pseudonymisierte Auswertung für die Evaluation | freiwillig | keine Erfassung von Nutzungsereignissen; Produkt uneingeschränkt nutzbar |
| `datenfreigabe` | Lesefreigabe an Angehörige oder Pflegedienst | freiwillig | keine Freigabe möglich; Produkt uneingeschränkt nutzbar |

Die Trennung ist der Kern: Die Zustimmung zur Nutzung ist nicht an die Zustimmung
zur Auswertung gekoppelt. Wer den PflegeCoach nutzen, aber nicht ausgewertet
werden will, kann das — ohne Nachteil und ohne Nachfrage.

---

## 3. Datenmodell

| Feld | Zweck |
|------|-------|
| `consent_typ` | welche der drei Einwilligungen |
| `text_version` | Fassung des Einwilligungstextes, dem zugestimmt wurde (z. B. `2026-08-v1`) |
| `erteilt` | Erteilung (true) oder Ablehnung (false) |
| `erteilt_am` | Zeitpunkt der Erklärung |
| `widerrufen_am` | Zeitpunkt des Widerrufs, sonst leer |

Die Tabelle ist **append-only**: Es gibt keine Löschregel und das Löschrecht ist
zusätzlich auf Grant-Ebene entzogen. Eine Einwilligung, die man löschen könnte,
wäre als Nachweis wertlos.

**Warum `text_version` mitgeführt wird:** Ändert sich der Text, ist die alte
Zustimmung keine Zustimmung zum neuen Text. Ohne dieses Feld ließe sich später
nicht sagen, wozu jemand tatsächlich zugestimmt hat. Es ist die Voraussetzung
dafür, bei einer Textänderung gezielt erneut zu fragen.

---

## 4. Wie Erteilung und Widerruf abgebildet sind

```
Erteilung   ─► INSERT: erteilt = true, text_version, erteilt_am
Ablehnung   ─► INSERT: erteilt = false
Widerruf    ─► UPDATE: widerrufen_am wird auf allen offenen Erteilungen gesetzt
                (die Zeilen bleiben bestehen)
```

Ob eine Einwilligung **jetzt** gilt, entscheidet eine einzige Funktion
(`hatAktiveEinwilligung()` in `lib/coach/consent.ts`):

> Aktiv ist eine Einwilligung genau dann, wenn mindestens eine Zeile dieses Typs
> existiert, die erteilt und nicht widerrufen ist.

Die Reihenfolge der Zeilen spielt dabei bewusst keine Rolle. Eine Auswertung
„die zeitlich letzte Zeile gewinnt" wäre fehleranfällig, sobald Zeitstempel
gleich sind oder Zeilen nachträglich ergänzt werden. Erneutes Erteilen nach einem
Widerruf legt eine neue Zeile an und macht die Einwilligung damit wieder aktiv.

---

## 5. Durchsetzung: was der Widerruf bewirkt

Die Wirkung ist **bewusst asymmetrisch**:

| Vorgang | Nach Widerruf der Pflicht-Einwilligung |
|---------|---------------------------------------|
| Neue Assessments, Ziele, Aktivitäten, Erledigungen, Messungen, Berichte anlegen oder ändern | **gesperrt** |
| Eigene Daten lesen | erlaubt |
| Datenexport (Art. 15 / Art. 20) | erlaubt |
| Löschung (Art. 17) | erlaubt |
| Einwilligung erneut erteilen | erlaubt |
| Schriftgröße und Kontrast ändern | erlaubt |
| Bestehende Daten | bleiben bestehen — der Widerruf wirkt ab jetzt, nicht rückwirkend |

**Warum nicht alles sperren:** Ein Widerruf, der auch das Lesen, den Export und
die Löschung sperrt, wäre eine Falle — die Person käme an ihre eigenen Daten
nicht mehr heran und könnte sie auch nicht mehr löschen lassen. Genau die Rechte,
die ein Widerruf schützen soll, würden dadurch unausübbar.

**Warum keine automatische Löschung:** Ein Widerruf ist keine Löschanweisung. Wer
nur die weitere Verarbeitung beenden will, verliert sonst ungefragt seinen
gesamten Verlauf. Die Löschung ist ein eigener, ausdrücklicher Schritt mit
Bestätigungswort und vorheriger Mengenvorschau (`/pflegecoach/loeschung`).

### Technische Umsetzung

Jede schreibende Route ruft `requireCoachUser({ schreibzugriff: true })` auf.
Der Wächter prüft dann:

1. Ist die Pflicht-Einwilligung aktiv? Wenn nein: Ablehnung mit dem Code
   `EINWILLIGUNG_FEHLT` und einem Text, der den Weg zurück beschreibt (erneut
   erteilen — oder exportieren und löschen).
2. Ist eine Freischaltung erforderlich und vorhanden? Diese Prüfung entfällt
   vollständig, solange der Schalter aus ist (Normalbetrieb).

Beide Prüfungen sind **fail-closed**: Lässt sich die Einwilligung wegen eines
Datenbankfehlers nicht ermitteln, wird nicht geschrieben (Antwort 503). Ein
technischer Fehler darf nicht dazu führen, dass ohne Rechtsgrundlage
Gesundheitsdaten entstehen.

### Absicherung gegen Vergessen

Ein Strukturtest (`lib/coach/produktgrenze.test.ts`) durchsucht alle
Schreib-Handler unter `app/api/coach/**` und verlangt, dass jeder das Tor
benutzt. Ausnahmen sind namentlich aufgeführt und begründet — und der Test
schlägt auch dann fehl, wenn eine Ausnahme verwaist, also auf eine Route
verweist, die es nicht mehr gibt.

Damit ist die Durchsetzung nicht von der Sorgfalt beim nächsten Feature abhängig.

---

## 6. Die begründeten Ausnahmen vom Schreib-Tor

| Route | Warum ohne Tor |
|-------|----------------|
| `profil` (POST) | legt das Profil **zusammen mit** der Ersteinwilligung an — die Prüfung liefe gegen einen Datensatz, der noch nicht existiert |
| `profil` (PATCH) | ändert nur Anzeigename und Darstellungseinstellungen; muss nach einem Widerruf offen bleiben |
| `consents` (POST) | ist der Weg, die Einwilligung zu erteilen oder zu widerrufen — ein Tor davor wäre selbstblockierend |
| `loeschung` (DELETE) | Art. 17 muss gerade nach einem Widerruf ausübbar sein |
| `freischaltung` (POST) | betrifft die Zugangsberechtigung, keine Gesundheitsdaten |
| `nutzung` (POST) | hat ein **strengeres** eigenes Tor (Betriebsschalter **und** gesonderte Einwilligung) und antwortet bei fehlender Grundlage weich, um keinen Nutzerablauf abzubrechen |

---

## 7. Die doppelte Freigabe für Auswertungsdaten

Nutzungsereignisse werden nur erfasst, wenn **beides** vorliegt:

```
COACH_NUTZUNGSNACHWEIS_AKTIV = true          (Betriebsentscheidung)
        UND
Einwilligung 'wissenschaftliche_auswertung' aktiv   (Entscheidung der Person)
```

Fehlt eines von beidem, wird nichts geschrieben — und zwar ohne Fehlermeldung,
damit die Erfassung nie einen Ablauf blockiert. Die Route antwortet mit
`{ erfasst: false }` und einer Begründung (`erfassung_inaktiv` bzw.
`keine_einwilligung`).

Im Auslieferungszustand ist der Schalter aus. Vor einer Erprobung muss er
**bewusst** gesetzt werden — sonst liegen am Ende keine Daten vor. Das ist im
Evaluationskonzept vermerkt.

---

## 8. Einwilligung im Ablauf

```
Erster Aufruf ohne Profil
   └─► /pflegecoach/start
         ├─ Zweckbestimmung sichtbar, inkl. „Was er nicht ist"
         ├─ Rolle wählen, freiwillige Angaben
         ├─ ☐ Einwilligung in die Verarbeitung von Pflege- und Gesundheitsdaten
         │    └─ ohne Häkchen: kein Profil, keine Nutzung
         └─► POST /api/coach/profil
               ├─ INSERT coach_users
               └─ INSERT coach_consents (gesundheitsdaten_art9, text_version)

Später, jederzeit
   └─► /pflegecoach/einstellungen
         ├─ Stand jeder der drei Einwilligungen
         ├─ freiwillige Einwilligungen einzeln erteilen oder widerrufen
         ├─ Pflicht-Einwilligung widerrufen (mit Erklärung der Folgen)
         └─ Datenexport und Weg zur Löschung
```

---

## 9. Anforderungen aus Art. 7 DSGVO — technische Entsprechung

| Anforderung | Umsetzung | Bewertung |
|-------------|-----------|-----------|
| Nachweisbarkeit (Abs. 1) | append-only Tabelle mit Zeitpunkt und Textversion | umgesetzt |
| Verständliche, von anderen Sachverhalten getrennte Form (Abs. 2) | eigene Häkchen je Zweck, keine Sammelzustimmung, keine Kopplung an Nutzungsbedingungen | umgesetzt; Verständlichkeit der Texte ist Gegenstand der ausstehenden Prüfung |
| Widerruf so einfach wie die Erteilung (Abs. 3) | ein Bedienschritt in den Einstellungen, an derselben Stelle wie die Erteilung; Wirkung sofort | umgesetzt |
| Freiwilligkeit (Abs. 4) | die beiden freiwilligen Einwilligungen haben keinerlei Einfluss auf die Nutzbarkeit | umgesetzt |

Bei der Pflicht-Einwilligung ist die Kopplung an die Nutzung sachlich
unvermeidbar: Ohne Verarbeitung von Pflegedaten gibt es keinen PflegeCoach. Ob
die gewählte Ausgestaltung trägt, ist Gegenstand der juristischen Prüfung.

---

## 10. Offene Punkte

| Punkt | Status |
|-------|--------|
| Juristische Prüfung und Freigabe der Einwilligungstexte | offen — GAP-DSFA |
| Verfahren bei einer Textänderung: erneut fragen, ab welcher Änderungstiefe? | offen — `text_version` ist vorhanden, das Verfahren nicht festgelegt |
| Einwilligungsfähigkeit bei kognitiven Einschränkungen; Vertretung | offen — im Pilotmaterial als Papier-Rückfallweg vorgesehen (`pilotdesign.md` §1), im Produkt nicht abgebildet |
| Oberfläche für Freigaben (die Einwilligung `datenfreigabe` ist ohne Bedienweg) | offen — GAP-SHARES-UI |
| Nachweis der Durchsetzung gegen die Produktionsdatenbank | offen — GAP-E2E |
