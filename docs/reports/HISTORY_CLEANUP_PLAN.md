# Historien-Bereinigung — Plan, nicht Ausführung

**Stand:** 13.09.2026
**Ausgeführt:** `git rm --cached` für zwölf Dateien · `.gitignore` erweitert
**NICHT ausgeführt:** kein `force push`, kein `git filter-repo`, kein BFG.
Beides bleibt ohne ausdrückliche Freigabe liegen.

---

## 0. Was `git rm --cached` leistet — und was nicht

| | |
|---|---|
| **Leistet** | Die Dateien sind ab dem nächsten Commit nicht mehr im Baum. `raw.githubusercontent.com/…/main/…` liefert dann **404**. Sie bleiben lokal auf der Platte erhalten. |
| **Leistet NICHT** | Jeder **alte Commit** bleibt abrufbar. Wer die Commit-SHA kennt — sie steht unten in dieser Tabelle und in jedem Klon —, lädt die Datei weiter anonym herunter. |

**Der Schutz ist also unvollständig.** Vollständig wird er erst durch eine der beiden
Maßnahmen in Abschnitt 3.

---

## 1. Die zwölf entfernten Dateien

Einführungs-Commit und Größe wurden **vor** dem Entfernen gesichert — danach sind sie
nur noch über `git log --all` auffindbar.

| # | Pfad | Kategorie | Schwere | Eingeführt in | Datum | Bytes |
|---|---|---|---|---|---|---|
| 1 | `anerkennung-hessen/Erweitertes-Fuehrungszeugnis-Yusuf-Ferhat-Demir-2026.pdf` | Führungszeugnis | **KRITISCH** | `e5785561` | 10.08.2026 | 1.584.846 |
| 2 | `docs/genehmigung/06_Fuehrungszeugnis.pdf` | Führungszeugnis (byte-identisch zu #1) | **KRITISCH** | `aac2b162` | 09.09.2026 | 1.584.846 |
| 3 | `anerkennung-hessen/Anlage-02-Berufserlaubnis-Fachkraft-Sabrina-Martin.pdf` | Berufsurkunde, Name + Geburtsdatum | **HOCH** | `6b6dc335` | 10.08.2026 | 640.749 |
| 4 | `docs/genehmigung/17a_Berufserlaubnis_Fachkraft.pdf` | dieselbe Urkunde | **HOCH** | `aac2b162` | 09.09.2026 | 640.749 |
| 5 | `anerkennung-hessen/Anlage-03-ARGE-IK-Bestaetigung-460629986.pdf` | Behördenschreiben mit Bankverbindung | **MITTEL** | `6b6dc335` | 10.08.2026 | 1.178.748 |
| 6 | `docs/genehmigung/05_IK_Nachweis.pdf` | dasselbe Schreiben | **MITTEL** | `aac2b162` | 09.09.2026 | 1.178.748 |
| 7 | `anerkennung-hessen/Anlage-15-Betriebshaftpflicht-Police.pdf` | Versicherungsvertrag, 13 Seiten | **MITTEL** | `5e9886b1` | 12.09.2026 | 18.289.599 |
| 8 | `docs/genehmigung/07_Haftpflichtversicherung.pdf` | dieselbe Police | **MITTEL** | `aac2b162` | 09.09.2026 | 18.289.599 |
| 9 | `anerkennung-hessen/Anlage-08-Erklaerung-Fuehrungszeugnisse.pdf` | **leerer Vordruck** | NIEDRIG | `6a116554` | 10.08.2026 | 5.164 |
| 10 | `docs/genehmigung/17c_Erklaerung_Fuehrungszeugnisse.pdf` | **leerer Vordruck** | NIEDRIG | `aac2b162` | 09.09.2026 | 5.164 |
| 11 | `docs/genehmigung/hessen/final/Anlage-08-Erklaerung-Fuehrungszeugnisse.pdf` | **leerer Vordruck** | NIEDRIG | `5d68d475` | 12.09.2026 | 5.164 |
| 12 | `§45a-Erklaerung-Fuehrungszeugnisse.pdf` | **leerer Vordruck** | NIEDRIG | `4719b0ed` | **15.07.2026** | 5.164 |

**Nicht entfernt, ausdrücklich:**
`components/onboarding/bewerber/Schritt09Fuehrungszeugnis.tsx` — eine UI-Komponente, die
nur so heißt. Vor und nach dem Eingriff als getrackt geprüft.

### Zur Einstufung der vier Vordrucke (#9–12)

Am 12.09.2026 visuell geprüft: Es sind **leere Arbeitgeber-Erklärungen** ohne
Personendaten — Name, Geburtsdatum und Wohnort sind unausgefüllt. Der Dateiname enthält
„Führungszeugnisse", der Inhalt ist keines.

Sie wurden trotzdem entfernt, weil sie unter dieselbe `.gitignore`-Regel fallen und ihre
Trennung von den echten Zeugnissen jedem künftigen Leser eine Einzelfallprüfung abverlangt
hätte. Vier regenerierbare Vordrucke sind der günstigere Verlust.

**Für die Risikobewertung zählen also acht Dateien, nicht zwölf** — und davon vier
Dokumente in je zwei Ablagen.

---

## 2. Risikobewertung

### Zeitliche Exposition

| Dokument | öffentlich seit | Dauer bis 13.09.2026 |
|---|---|---|
| Erweitertes Führungszeugnis (GF) | 10.08.2026 | **34 Tage** |
| Berufsurkunde der Fachkraft | 10.08.2026 | **34 Tage** |
| IK-Bestätigung mit Bankverbindung | 10.08.2026 | **34 Tage** |
| Zweitablagen aller drei | 09.09.2026 | 4 Tage |
| Haftpflichtpolice | 09.09. / 12.09.2026 | 1–4 Tage |

**Nachweis der Abrufbarkeit:** Am 12. und 13.09.2026 über
`raw.githubusercontent.com`, **ohne Token**, nur Kopfzeilen abgefragt: alle acht **HTTP
200** mit vollem `Content-Length`. Kein Inhalt geladen.

### Was das bedeutet

| Betroffen | Bewertung |
|---|---|
| **Führungszeugnis des Geschäftsführers** | Auskunft aus dem Bundeszentralregister. 34 Tage abrufbar. Als **offengelegt** zu behandeln, unabhängig davon, ob ein Zugriff nachweisbar ist. |
| **Berufsurkunde der Mitarbeiterin** | Name und Geburtsdatum einer dritten Person. **Es sind ihre Daten, nicht die der Gesellschaft** — sie hat ein eigenes Informationsinteresse. |
| **Bankverbindung** | Kontodaten der Gesellschaft. Für Lastschriftbetrug allein nicht ausreichend, aber ein Baustein. |
| **Versicherungspolice** | Vertrags- und Zahlungsdaten, Schein-Nummer. |

### Umstände, die das Risiko begrenzen

| Umstand | Beleg |
|---|---|
| **Keine Forks** | `gh api …/alltagsengel` → `forks_count: 0` (13.09.2026) |
| **Keine Secrets betroffen** | Vollscan über 28.581 Historienobjekte: alle gefundenen JWTs `role=anon`, **kein** `service_role`. Keine Rotation nötig. |
| Kein Hinweis auf gezielten Zugriff | GitHub liefert Traffic-Statistiken nur 14 Tage rückwirkend und nicht je Datei — ein Ausschluss ist damit **nicht** möglich |

Die letzte Zeile ist wichtig: **Fehlender Nachweis eines Zugriffs ist kein Nachweis, dass
keiner stattfand.**

---

## 3. Zwei Wege zur vollständigen Schließung

### Weg A — Repository auf privat stellen · **empfohlen**

| | |
|---|---|
| Wirkung | **Sofort und vollständig.** Auch die Historie ist dann nicht mehr anonym erreichbar. |
| Aufwand | Ein Schalter in den GitHub-Einstellungen |
| Risiko | **Keines technisch.** Öffentliche Links auf das Repo brechen. |
| Voraussetzung | keine |

Das ist der einzige Schritt, der heute wirkt und nichts kaputt macht.

### Weg B — Historie umschreiben · **nur wenn das Repo öffentlich bleiben muss**

| | |
|---|---|
| Werkzeug | **BFG Repo-Cleaner** (schneller und fehlerärmer als `git filter-branch`), alternativ `git filter-repo` |
| Wirkung | Die Blobs verschwinden aus allen Commits |
| Risiko | **Hoch.** Jede Commit-SHA ändert sich. Jeder vorhandene Klon wird unbrauchbar. Offene Pull Requests brechen. Force-Push auf `main` nötig. |
| Voraussetzung | **Vollständiges Backup** und ausdrückliche Freigabe |

#### Ablauf, falls Weg B gewählt wird

```
# 1. Backup — ZUERST, ohne Ausnahme
git clone --mirror https://github.com/YusufFerhatDemir/alltagsengel.git \
    alltagsengel-backup-2026-09-13.git
tar czf alltagsengel-backup-2026-09-13.tar.gz alltagsengel-backup-2026-09-13.git

# 2. Trockenlauf auf einer KOPIE, nie auf dem Arbeitsverzeichnis
git clone --mirror https://github.com/YusufFerhatDemir/alltagsengel.git bfg-arbeit.git
bfg --delete-files "Erweitertes-Fuehrungszeugnis-*.pdf" bfg-arbeit.git
bfg --delete-files "06_Fuehrungszeugnis.pdf"            bfg-arbeit.git
bfg --delete-files "Anlage-02-Berufserlaubnis-*.pdf"    bfg-arbeit.git
bfg --delete-files "17a_Berufserlaubnis_Fachkraft.pdf"  bfg-arbeit.git
bfg --delete-files "Anlage-03-ARGE-IK-*.pdf"            bfg-arbeit.git
bfg --delete-files "05_IK_Nachweis.pdf"                 bfg-arbeit.git
bfg --delete-files "Anlage-15-Betriebshaftpflicht-*.pdf" bfg-arbeit.git
bfg --delete-files "07_Haftpflichtversicherung.pdf"     bfg-arbeit.git

# 3. Prüfen, DANN erst aufräumen
cd bfg-arbeit.git && git reflog expire --expire=now --all && git gc --prune=now --aggressive

# 4. Erst nach Sichtprüfung: Force-Push
#    git push --force
```

**Schritt 4 gehört nicht in ein Skript.** Er ist eine Entscheidung.

---

## 4. Was unabhängig vom gewählten Weg zu tun ist

| # | Schritt | Warum |
|---|---|---|
| 1 | **Diesen Commit pushen** | Schließt `main` — ab sofort 404 auf dem aktuellen Stand |
| 2 | **Repo auf privat stellen** | Schließt auch die Historie, heute |
| 3 | **Die Mitarbeiterin informieren** | Ihre Berufsurkunde war 34 Tage abrufbar. Das ist ihre Entscheidung, nicht unsere. |
| 4 | Bank informieren oder Konto beobachten | Die IK-Bestätigung enthält die Kontoverbindung |
| 5 | Entscheiden, ob das Repo je wieder öffentlich wird | Erst diese Antwort macht Weg B nötig oder überflüssig |

**Kein Handlungsbedarf bei Schlüsseln:** gemessen, nicht vermutet — siehe
`docs/reports/SECURITY_P0_LIVE_LATEST.md`, Abschnitt C.

---

## 5. Was diesen Fall verhindert hätte — und ab jetzt verhindert

| Riegel | Wirkung | Seit |
|---|---|---|
| `.gitignore`: `anerkennung-hessen/*.pdf`, `docs/genehmigung/**/*.pdf`, `§45a-*.pdf` | Neue PDFs in diesen Ordnern werden ignoriert | 13.09.2026 |
| `npm run lint:pii` (blockierend in CI) | Prüft den **getrackten Baum**, nicht nur ungetrackte Dateien — `git add -f` kommt daran nicht vorbei | 12.09.2026 |
| 30 Dateinamensmuster für Dokumentklassen | Führungszeugnis, Ausweis, Kontoauszug, Kamerascans (`Gescanntes Dokument*`) | 12.09.2026 |

**Nebenwirkung der neuen `.gitignore`-Regeln, bewusst in Kauf genommen:** Sie erfassen
**jede** PDF in beiden Ordnern, auch die unbedenklichen Konzepte. Bereits getrackte
Dateien bleiben getrackt; eine **neue** Konzept-PDF würde aber stillschweigend ignoriert.
Wer bewusst eine hinzufügen will, braucht `git add -f`. Der Preis ist, dass hier nie
wieder versehentlich eine Urkunde landet.
