# Logging- und Audit-Konzept — Digitaler PflegeCoach

**Stand:** 2026-08-13
**Status:** ENTWURF — aus dem Quellcode abgeleitet
**Umsetzung:** `coach_audit_log` und `coach_audit_trigger()`
(Migration `20260819010000`, Teil 12; Erweiterung in `20260826010000`, Teil 9)

---

## 1. Die zentrale Entscheidung

Ein Protokoll über Zugriffe auf Gesundheitsdaten hat ein eingebautes Problem:
**Protokolliert man die Inhalte mit, entsteht eine zweite Kopie genau der Daten,
die man schützen wollte** — und zwar eine, die nicht gelöscht werden darf, weil
sie ja Nachweis sein soll.

Die Entscheidung hier: **Das Protokoll enthält keine Datenwerte.** Es beantwortet
die Frage *wer hat wann welche Zeile in welcher Tabelle wie verändert und welche
Felder betraf das* — nicht die Frage *was stand drin*.

Der Preis ist ehrlich zu benennen: Aus dem Protokoll lässt sich ein früherer
Zustand **nicht** rekonstruieren. Es ist ein Nachweis von Vorgängen, keine
Versionsgeschichte. Für den Zweck — Nachvollziehbarkeit von Zugriffen und
Löschungen — genügt das; für eine Wiederherstellung überschriebener Werte
genügt es nicht, und das ist beabsichtigt.

---

## 2. Was protokolliert wird

| Feld | Inhalt | Beispiel |
|------|--------|----------|
| `coach_user_id` | Eigentümer der betroffenen Daten | Kennung |
| `actor_user_id` | wer gehandelt hat (`auth.uid()`); leer bei Systemkontext | Kennung |
| `tabelle` | betroffene Tabelle | `coach_goals` |
| `aktion` | `INSERT`, `UPDATE` oder `DELETE` | `UPDATE` |
| `zeilen_id` | betroffene Zeile | Kennung |
| `geaenderte_felder` | **nur bei Änderungen:** Feld**namen**, keine Werte | `{status, aktueller_wert}` |
| `created_at` | Zeitpunkt | Zeitstempel |

Bei einer Änderung werden nur die tatsächlich veränderten Felder aufgeführt.
`updated_at` wird dabei ausgenommen — es ändert sich bei jeder Änderung und
träge sonst keine Information.

## 3. Wo protokolliert wird

Trigger auf allen elf nutzer-eigenen Tabellen:

`coach_users`, `coach_consents`, `coach_shares`, `coach_assessments`,
`coach_goals`, `coach_activities`, `coach_activity_log`, `coach_measurements`,
`coach_reports`, `coach_freischaltungen`, `coach_anspruchspruefungen`

### Die zwei bewussten Ausnahmen

| Tabelle | Warum kein Trigger |
|---------|--------------------|
| `coach_nutzungsereignisse` | Die Tabelle hat weder eine Eigentümer-Spalte noch einen Primärschlüssel vom passenden Typ — die Trigger-Funktion würde ihn umwandeln wollen und scheitern. Inhaltlich ist es auch unnötig: Die Tabelle enthält selbst nur Metadaten ohne Personenbezug. Ein Protokoll über ein Protokoll. |
| `coach_pseudonym_key` | Ein Zugriff auf den Schlüssel wäre höchst protokollwürdig — die Tabelle ist aber für niemanden lesbar. Es gibt keinen Zugriff, der zu protokollieren wäre. |

Für die **Betriebs**tabellen (`coach_freischaltcodes`, `coach_abrechnungswege`,
`eul_*`) gibt es kein eigenes Coach-Protokoll. Sie unterliegen den
Protokollierungsregeln des Betriebsbereichs. Das ist eine Lücke im Nachweis, kein
Schutzproblem — sie enthalten keine Gesundheitsdaten. Sie ist in §7 als offener
Punkt geführt.

## 4. Warum ein Datenbank-Trigger und nicht Anwendungscode

Ein Protokoll, das die Anwendung schreibt, wird bei der nächsten neuen Route
vergessen. Der Trigger hängt an der Tabelle: Jeder Schreibvorgang wird
protokolliert — gleichgültig, ob er aus einer Produktroute, aus einem
Wartungsvorgang oder aus der Datenbankkonsole kommt.

Die Trigger-Funktion läuft mit **Eigentümerrechten** (`SECURITY DEFINER`), damit
der Eintrag auch dann gelingt, wenn die schreibende Sitzung selbst keine Rechte
auf die Protokolltabelle hat — was sie ausdrücklich nicht hat. Der Suchpfad ist
festgelegt (`SET search_path = public`); ohne das wäre die Funktion ein bekannter
Weg zur Rechteausweitung.

## 5. Unveränderlichkeit

| Wer | Lesen | Schreiben | Ändern | Löschen |
|-----|-------|-----------|--------|---------|
| Nutzende Person | nur die eigenen Einträge | – | – | – |
| Person mit Freigabe | – | – | – | – |
| Verwaltung | – | – | – | – |
| Trigger | – | ja | – | – |

Umgesetzt zweifach: Es existiert nur eine Lese-Policy, und die Schreibrechte sind
zusätzlich auf Grant-Ebene entzogen. Ein Protokoll, das der Protokollierte ändern
kann, ist kein Protokoll.

Dass die betroffene Person ihre eigenen Einträge lesen kann, ist Absicht: Sie
kann damit selbst nachvollziehen, was mit ihren Daten geschehen ist — ohne
jemanden fragen zu müssen, der ohnehin keine Auskunft geben könnte.

## 6. Verhalten bei Löschung

Wird ein Profil gelöscht, verschwinden die Daten. Die Protokolleinträge bleiben:

* Sie enthalten keine Werte — es bleibt keine Datenkopie zurück.
* Ihre Eigentümer-Kennung zeigt auf eine Zeile, die es nicht mehr gibt.
* Der Löschvorgang selbst wird protokolliert und ist damit belegbar.

Genau das ist ihr Zweck: Der Nachweis, **dass** und **wann** gelöscht wurde, muss
die Löschung überdauern. Die Löschseite weist darauf vorher ausdrücklich hin
(`loeschkonzept.md` §3).

## 7. Was **nicht** protokolliert wird

| Vorgang | Protokolliert? | Bewertung |
|---------|---------------|-----------|
| Lesezugriffe | nein | eine vollständige Lese-Protokollierung wäre bei jedem Seitenaufruf ein Vielfaches der Nutzdaten und selbst ein Datenschutzproblem. Der Zugriff ist ohnehin auf die eigene Person begrenzt. |
| Lesezugriffe durch Personen mit Freigabe | nein | **hier ist die Auslassung diskussionswürdig** — wer Daten freigibt, könnte ein berechtigtes Interesse daran haben zu sehen, wann darauf zugegriffen wurde. Offener Punkt (§9). |
| Anmeldeversuche, erfolglose Anmeldungen | nein im Produkt | liegt auf Ebene der Plattform-Authentifizierung |
| Aufrufe der Schnittstelle ohne Datenänderung | nein | siehe Lesezugriffe |
| Datenwerte | nein | Kernentscheidung, §1 |
| Ausgabe und Einlösung von Freischaltcodes | nur die Nutzer-Seite | die Betriebs-Seite unterliegt der Betriebsprotokollierung |

## 8. Anwendungsprotokolle

Neben dem Datenbankprotokoll entstehen technische Protokolle der Laufzeitumgebung
(Anfragen, Fehler). Für den Produktbereich gilt:

* Die Routen geben in Fehlerfällen **keine Datenwerte** aus, sondern feste
  Meldungstexte.
* Es werden keine Gesundheitsdaten in Auswertungs- oder Fehlerdienste gemeldet;
  im Produktpfad sind solche Dienste abgeschaltet.
* Pfade können Kennungen enthalten (etwa `/api/coach/ziele/<id>`), aber keine
  Inhalte.

**Nicht dokumentiert und aus dem Code nicht ableitbar:** wie lange die
Laufzeitumgebung ihre Protokolle aufbewahrt und wer sie einsehen kann. Das gehört
in das Dossier zur Auftragsverarbeitung (AK-DS-04).

## 9. Offene Punkte

| Punkt | Bewertung |
|-------|-----------|
| Kein Protokoll über Lesezugriffe von Personen mit Freigabe | prüfenswert; wäre über ein gezieltes Protokoll in der Leseroute umsetzbar, ohne eine allgemeine Lese-Protokollierung einzuführen |
| Kein Coach-eigenes Protokoll auf den Betriebstabellen | Lücke im Nachweis, kein Schutzproblem |
| Keine Aufbewahrungsfrist für das Protokoll festgelegt | es wächst unbegrenzt; Regelfrist ist festzulegen (`loeschkonzept.md` §6) |
| Keine Auswertung des Protokolls auf auffällige Muster | derzeit ist es ein reines Nachschlagewerk, keine Überwachung |
| Aufbewahrung und Einsehbarkeit der Laufzeitprotokolle nicht dokumentiert | AK-DS-04 |
| Keine Prüfung des Protokollverhaltens gegen die Produktionsdatenbank | GAP-E2E; die Datenbanktests (Gruppe P7) prüfen es gegen eine aus dem Repository aufgebaute Datenbank |
