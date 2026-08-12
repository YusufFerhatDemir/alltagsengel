# Löschkonzept — „Digitaler PflegeCoach"

**Stand:** 2026-08-12 · **Block:** 15b · **Schließt:** GAP-LOESCHUNG
**Umsetzung:** `app/api/coach/loeschung`, `/pflegecoach/loeschung`, Migration
`20260826010000` (Kaskaden), `app/api/coach/export` (Portabilität)

> **Aufbewahrungsfristen:** Für die DiPA-Daten selbst ist **keine** gesetzliche
> Aufbewahrungsfrist bekannt, die eine Löschung hindern würde — der PflegeCoach ist keine
> Pflegedokumentation eines Leistungserbringers und keine Buchführung. Sollten sich aus
> einer künftigen Abrechnung Aufbewahrungspflichten ergeben, betreffen sie die
> **Betriebs-Seite** (Codes, eUL-Nachweise), nicht die Gesundheitsdaten. Vor der
> Antragstellung ist das mit der Datenschutzberatung zu verifizieren; dieses Dokument
> erfindet keine Fristen.

---

## 1. Drei Löschwege

| Weg | Auslöser | Umfang |
|---|---|---|
| **A — Produktlöschung** | Nutzer löscht seine PflegeCoach-Daten | alle `coach_*`-Daten, Konto bleibt |
| **B — Kontolöschung** | Nutzer löscht sein Alltagsengel-Konto | zusätzlich der auth-Account; `coach_users` fällt über `ON DELETE CASCADE` auf `auth.users` |
| **C — Einwilligungswiderruf** | Nutzer widerruft `wissenschaftliche_auswertung` | Erfassung neuer Nachweisdaten endet sofort |

Weg A ist neu und die eigentliche Konsequenz der Produkttrennung: Wer den PflegeCoach
nicht mehr nutzen will, muss nicht sein Alltagsengel-Konto aufgeben.

## 2. Was Weg A löscht

Löschung von `coach_users` — alles Folgende hängt per `ON DELETE CASCADE` daran:

`coach_consents`, `coach_shares`, `coach_assessments`, `coach_goals`,
`coach_activities`, `coach_activity_log`, `coach_measurements`, `coach_reports`,
`coach_freischaltungen`, `coach_anspruchspruefungen`

Zusätzlich, weil nicht an `coach_users` hängend, explizit vorab gelöscht:
`coach_nutzungsereignisse` (über das eigene Pseudonym).

**Reihenfolge ist bewusst:** erst die Nachweisdaten, dann das Profil. Andersherum wäre
das Pseudonym nicht mehr ermittelbar und die Ereignisse blieben als Waisen zurück.

## 3. Was bleibt — und die Begründung

| Was | Warum | Personenbezug |
|---|---|---|
| `coach_audit_log`-Einträge | Nachweis, dass und wann gelöscht wurde. Enthält nur Metadaten (Tabelle, Aktion, Feldnamen), **keine Werte** | `coach_user_id` verweist auf eine nicht mehr existierende Zeile |
| `coach_freischaltcodes` (Status „eingelöst") | Abrechnungs- und Missbrauchsnachweis: ein Code darf nicht nach Löschung erneut einlösbar sein | nur ein HMAC-Pseudonym — ohne den Schlüssel nicht auflösbar |
| `eul_erbringungen` | Leistungsnachweise des Erbringers, Betriebsdaten | kein Bezug zu Gesundheitsdaten; ggf. Kundenbezug über `client_id` (unterliegt dem allgemeinen Betriebs-Löschkonzept) |

**Der Nutzer wird über beides vor der Löschung ausdrücklich informiert** — die
Löschseite listet es auf.

## 4. Der Schlüssel als Löschwerkzeug

Wird `coach_pseudonym_key` gelöscht oder rotiert, sind **alle** bestehenden Pseudonyme
dauerhaft nicht mehr zuordenbar. Das ist der belastbarste Anonymisierungsschritt, den
das System kennt, und der vorgesehene Weg, um Nachweisdaten am Ende einer Erprobung
endgültig vom Personenbezug zu lösen.

Zu beachten: Danach sind auch Freischaltcodes nicht mehr mit späteren Einlösungen
korrelierbar. Der Schritt gehört ans **Ende** eines Auswertungszeitraums, nicht mitten
hinein.

## 5. Löschanspruch, Auskunft, Portabilität

| Recht | Umsetzung | Ort |
|---|---|---|
| Art. 15 Auskunft | Vollständiger Export aller eigenen Daten; Nachweisdaten separat einsehbar | `/api/coach/export`, `/api/coach/nutzung` |
| Art. 17 Löschung | Produktlöschung, Bestätigungswort erforderlich | `/pflegecoach/loeschung` |
| Art. 20 Portabilität | Strukturiertes, dokumentiertes JSON (`de.alltagsengel.pflegecoach.export`) mit veröffentlichtem Schema | `lib/coach/export.schema.json` |
| Art. 7 Abs. 3 Widerruf | Jede Einwilligung einzeln widerrufbar, Widerruf protokolliert | `/pflegecoach/einstellungen` |

Die Löschseite bietet den Export **vor** der Löschung an — die Reihenfolge ist Absicht.

## 6. Fristen

| Vorgang | Frist |
|---|---|
| Löschung auf Nutzerwunsch | sofort, synchron mit der Anfrage — keine Warteschlange, kein „Papierkorb" |
| Backups | Löschung wirkt erst mit Ablauf der Backup-Aufbewahrung des Betreibers — **Dauer zu verifizieren** und im AVV-Dossier zu dokumentieren |
| Nachweisdaten nach Ende einer Erprobung | Anonymisierung durch Schlüssellöschung; Zeitpunkt im jeweiligen Studienprotokoll festzulegen |

## 7. Offene Punkte

| ID | Punkt |
|---|---|
| AK-DS-04 | AVV-Dossier inkl. Backup-Aufbewahrungsfristen fehlt |
| GAP-DSFA | Juristische Prüfung der Löschtexte und der Aufbewahrungslogik steht aus |
| — | Weg B (Kontolöschung) ist der allgemeine Plattform-Flow; die Kaskade auf `coach_users` ist über den Fremdschlüssel auf `auth.users` gegeben, ein expliziter Test dafür fehlt noch |
