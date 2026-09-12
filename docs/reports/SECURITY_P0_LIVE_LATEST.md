# Security P0 — Live-Verifikation

**Stand:** 13.09.2026 · Alles in diesem Bericht **jetzt gemessen**, nichts übernommen.
**Keine Schlüsselwerte, keine Dokumentinhalte.** Nur Provider, Pfad, Ort, Schwere.
Keine History-Rewrite durchgeführt.

---

## A · Ist das Repository aktuell öffentlich?

**Ja.** Dreifach belegt, davon zweimal **ohne** Anmeldung — `VERIFIED_LIVE`:

| Prüfung | Ergebnis |
|---|---|
| `gh api repos/…` (authentifiziert) | `visibility=public` · `private=false` · **`forks=0`** |
| `curl https://api.github.com/repos/…` (**anonym, ohne Token**) | **HTTP 200** |
| `curl https://github.com/…` (**anonym**) | **HTTP 200** |

Dass `forks_count = 0` ist, ist für den Sanierungsplan der wichtigste Nebenbefund: es gibt
keine Kopie, die eine spätere Bereinigung überdauern würde.

## B · Welche sensiblen Dateien sind anonym abrufbar?

Über `raw.githubusercontent.com`, **ohne jede Anmeldung**, nur Kopfzeilen geprüft — kein
Inhalt geladen. Alle `VERIFIED_LIVE`:

| Schwere | Pfad | Kategorie | HTTP |
|---|---|---|---|
| **KRITISCH** | `anerkennung-hessen/Erweitertes-Fuehrungszeugnis-Yusuf-Ferhat-Demir-2026.pdf` | Führungszeugnis | **200** |
| **KRITISCH** | `docs/genehmigung/06_Fuehrungszeugnis.pdf` | Führungszeugnis (dieselbe Datei, zweite Ablage) | **200** |
| **HOCH** | `anerkennung-hessen/Anlage-02-Berufserlaubnis-Fachkraft-Sabrina-Martin.pdf` | Berufsurkunde, Name + Geburtsdatum | **200** |
| **HOCH** | `docs/genehmigung/17a_Berufserlaubnis_Fachkraft.pdf` | dieselbe Urkunde, zweite Ablage | **200** |
| **MITTEL** | `anerkennung-hessen/Anlage-03-ARGE-IK-Bestaetigung-460629986.pdf` | Behördenschreiben mit Bankverbindung | **200** |
| **MITTEL** | `docs/genehmigung/05_IK_Nachweis.pdf` | dasselbe Schreiben, zweite Ablage | **200** |
| **MITTEL** | `anerkennung-hessen/Anlage-15-Betriebshaftpflicht-Police.pdf` | Versicherungsvertrag, 13 Seiten | **200** |
| **MITTEL** | `docs/genehmigung/07_Haftpflichtversicherung.pdf` | dieselbe Police, zweite Ablage | **200** |

**Acht Fundstellen, vier Dokumente** — jedes doppelt abgelegt. Die beiden
Führungszeugnis-Dateien sind byte-identisch (1.584.846 Bytes): dasselbe Dokument zweimal.
Wer eine Kopie entfernt, hat nichts entfernt.

**Ältester Eintrag:** 10.08.2026 — die Führungszeugnisse und die Berufsurkunde liegen seit
über einem Monat öffentlich.

## C · Secrets im Baum und in der Historie

### Arbeitsbaum — sauber

`bash scripts/ci-secret-scan.sh` → **Exit 0**, `VERIFIED_LOCAL`.

### Historie — vollständig durchsucht

28.581 Objekte, davon 11.562 Textkandidaten, alle Blobs aller Commits gelesen.

| Provider | Pfad(e) | Ort | Rotation? |
|---|---|---|---|
| **Supabase** | `.next-old/server/chunks/*.js` (3) · `.next-old/server/edge/chunks/*.js` · `.next-old/static/chunks/*.js` · `archive/dripfy-mis-legacy/dripfy-mis/.env` · `lib/supabase.ts` | **nur Historie** | **NEIN** — siehe unten |
| Google | `android/app/google-services.json` | Historie **und** Baum | **NEIN** |
| „Private Key"-Block | `__tests__/abrechnung/credentials-und-dead-letter.test.ts` · `__tests__/abrechnung/versand-freigaben.test.ts` · `__tests__/notifications/push-fcm.test.ts` | Historie und Baum | **NEIN** |
| Stripe · Resend · OpenAI · GitHub · Slack · `sb_secret_` | — | — | kein Treffer |

### Warum keine Rotation nötig ist — die entscheidende Messung

Von jedem gefundenen JWT wurde **ausschließlich der `role`-Claim** dekodiert; der Token
selbst wurde nie ausgegeben oder gespeichert.

> **Alle sieben Fundstellen tragen `role=anon`. Kein einziges `service_role`.**
> Projekt-Ref durchgehend `nnwyktkqibdjxgimjyuq`, Aussteller `supabase`.

Der anon-Key ist **dafür gemacht**, öffentlich zu sein — er steckt in jedem Browser-Bundle
jeder Supabase-Anwendung. Die Sicherheitsgrenze ist nicht der Schlüssel, sondern RLS. Und
die wurde separat gemessen: `npm run verify:perimeter` → **8/8 bestanden**, anon liest aus
keiner Perimeter-Tabelle Zeilen.

Die beiden anderen Treffer entsprechend:
* **Google:** Client-Konfiguration einer Android-App, gebaut zum Ausliefern im APK, gebunden
  an Paketname und SHA-Fingerprint. Kein `private_key`, kein `client_email` in der Datei.
  Empfehlung ohne Dringlichkeit: in der Cloud-Konsole auf die benötigten APIs beschränken.
* **„Private Key"-Blöcke:** drei Testdateien mit **absichtlich unechtem** Schlüsselmaterial,
  mit dem geprüft wird, dass der Guard solches Material abweist. Der Treffer ist der Beweis,
  dass es den Guard gibt.

**Ein Hinweis bleibt trotzdem:** `archive/dripfy-mis-legacy/dripfy-mis/.env` wurde einmal
committet. Diesmal enthielt sie nur einen anon-Key. Eine `.env` zu committen ist die
Gewohnheit, die irgendwann den echten Schlüssel erwischt — `.gitignore` deckt das heute ab.

## D · Klassifizierung und Sanierungsplan

| Klasse | Zutreffend? | Begründung |
|---|---|---|
| **REPO_PRIVATE_REQUIRED** | **JA** | Schließt alle acht Fundstellen **sofort**, auch in der Historie. Einziger Schritt, der heute wirkt. |
| **DOCUMENT_REMOVAL_REQUIRED** | **JA** | Die acht Dateien gehören unabhängig davon aus dem Baum — auch ein privates Repo ist kein Dokumentenarchiv. |
| **HISTORY_CLEANUP_REQUIRED** | **bedingt** | Nur nötig, wenn das Repository je wieder öffentlich werden soll. `forks=0` heißt: es existiert derzeit keine Kopie außerhalb. |
| **KEY_ROTATION_REQUIRED** | **NEIN** | Gemessen: ausschließlich `role=anon`. Kein `service_role`, kein Stripe, kein Resend, kein OpenAI in Baum oder Historie. |

### Reicht „Repo auf privat" als Schutz?

**Für die Zukunft ja, für die Vergangenheit nicht sicher.**

Was es löst: ab dem Umschalten ist keine der acht Dateien mehr anonym abrufbar — auch
nicht über die Historie, auch nicht über `raw.githubusercontent.com`.

Was es **nicht** löst: Was in einem Monat öffentlicher Verfügbarkeit heruntergeladen,
gecrawlt oder zwischengespeichert wurde, holt kein Schalter zurück. Ein Führungszeugnis,
das 34 Tage abrufbar war, ist als **offengelegt** zu behandeln — unabhängig davon, ob ein
Zugriff nachweisbar ist.

### Empfohlene Reihenfolge — nicht destruktiv

| # | Schritt | Wirkung | Risiko |
|---|---|---|---|
| 1 | **Repository auf privat stellen** | sofort, vollständig, auch Historie | keines; öffentliche Links brechen |
| 2 | **Acht Dateien aus dem Baum nehmen** (`git rm --cached` + Commit) | Arbeitsbaum sauber; `lint:pii` führt sie dann als entfernt | gering |
| 3 | **Betroffene informieren** | Die Berufsurkunde gehört einer Mitarbeiterin — es sind **ihre** Daten | — |
| 4 | Entscheiden, ob das Repo je wieder öffentlich wird | bestimmt, ob Schritt 5 nötig ist | — |
| 5 | *nur dann:* Historie bereinigen (`git filter-repo`) | vollständig | **hoch** — alle Hashes ändern sich, Force-Push, jeder Klon wird ungültig |

**Schritt 5 wurde nicht ausgeführt und wird ohne ausdrückliche Anweisung nicht
ausgeführt.** Er ist unumkehrbar und außenwirksam.

## E · Ergänzung: § 45a-Compliance der Live-Seiten

Gehört nicht zu P0, wurde in derselben Runde geprüft.

| Prüfung | Ergebnis |
|---|---|
| `npm run lint:45a` über 1.607 Quelldateien | **0 Befunde**, `ANERKENNUNG_45A_LIEGT_VOR = false` · `VERIFIED_LOCAL` |
| Live-Stichprobe, 8 Seiten, Suche nach behaupteter Kassenzulassung | **kein Verstoß** · `VERIFIED_LIVE` |

Zwei Treffer meines Ad-hoc-Musters, beide beim Nachlesen entkräftet:

* **`/`** — „Bis zu 42 € pro Monat von der Pflegekasse übernommen — 0 € Eigenanteil bei
  anerkanntem **Pflegegrad**". Das betrifft die Pflegebox nach **§ 40 SGB XI**, die
  tatsächlich voll erstattet wird. „Anerkannt" bezieht sich auf den Pflegegrad, nicht auf uns.
* **`/entlastungsbetrag`** — „ein **anerkannter Anbieter** rechnet sie über den
  Entlastungsbetrag § 45b ab". Allgemeine Erklärung der Systematik in der dritten Person,
  keine Aussage über uns. Dieselbe Seite nennt „Anerkennungsverfahren".

**Eine Beobachtung ohne Befundcharakter:** Der Satz „**Ihr** anerkannter Anbieter rechnet
per Abtretungserklärung ab" steht in einem Kundenbeispiel auf unserer eigenen Seite. Formal
korrekt, aber ein eiliger Leser kann uns als diesen Anbieter lesen. Eine Umformulierung
(„ein nach § 45a anerkannter Anbieter") wäre eindeutiger — kein Verstoß, eine Härtung.

---

## Zusammenfassung

| Aussage | Status |
|---|---|
| Repository ist öffentlich | `VERIFIED_LIVE` (anonym, zweifach) |
| 8 sensible Dateien anonym abrufbar, HTTP 200 | `VERIFIED_LIVE` |
| Forks: 0 | `VERIFIED_LIVE` |
| Keine Secrets im Arbeitsbaum | `VERIFIED_LOCAL` |
| In der Historie ausschließlich `role=anon`, kein `service_role` | `VERIFIED_LOCAL` |
| RLS-Perimeter hält (8/8) | `VERIFIED_LIVE` |
| § 45a-Compliance: kein Verstoß | `VERIFIED_LIVE` + `VERIFIED_LOCAL` |
| **KEY_ROTATION_REQUIRED** | **NEIN** — gemessen, nicht vermutet |
| **REPO_PRIVATE_REQUIRED** | **JA** |
| **DOCUMENT_REMOVAL_REQUIRED** | **JA** |
| **HISTORY_CLEANUP_REQUIRED** | bedingt — nur bei erneuter Öffentlichkeit |
