# Security Remediation — 12.09.2026

**Umfang:** PII im getrackten Git-Baum · Secrets über alle Provider · Archive ·
kompilierte Artefakte · `.gitignore` · CI-Riegel
**Regel dieses Berichts:** Es werden **nur Pfade, Typen und Schweregrade** genannt.
Kein Dokumentinhalt, kein Schlüsselwert, keine Nummer, kein Maskenfragment.

---

## 1. Ausgangslage in einem Satz

Das Repository `YusufFerhatDemir/alltagsengel` ist **öffentlich** (`gh repo view`:
`"visibility": "PUBLIC"`). Was darin liegt, liegt im Netz.

## 2. PII-Scan — 5.174 getrackte Dateien

### 2.1 Befunde, nach Schwere

| Schwere | Pfad | Art |
|---|---|---|
| **KRITISCH** | `anerkennung-hessen/Erweitertes-Fuehrungszeugnis-Yusuf-Ferhat-Demir-2026.pdf` | Scan, Führungszeugnis (Bundeszentralregister) |
| **KRITISCH** | `docs/genehmigung/06_Fuehrungszeugnis.pdf` | Scan, **zweite Ablage desselben Dokuments** |
| **HOCH** | `anerkennung-hessen/Anlage-02-Berufserlaubnis-Fachkraft-Sabrina-Martin.pdf` | Scan, Berufsurkunde mit Name und Geburtsdatum |
| **HOCH** | `docs/genehmigung/17a_Berufserlaubnis_Fachkraft.pdf` | Scan, **zweite Ablage** |
| **MITTEL** | `anerkennung-hessen/Anlage-15-Betriebshaftpflicht-Police.pdf` | Scan, 13 Seiten Versicherungsschein, Vertrags- und Zahlungsdaten |
| **MITTEL** | `docs/genehmigung/07_Haftpflichtversicherung.pdf` | Scan, **zweite Ablage** |
| **MITTEL** | `anerkennung-hessen/Anlage-03-ARGE-IK-Bestaetigung-460629986.pdf` | Scan, Behördenschreiben mit Bankverbindung der Gesellschaft |
| **MITTEL** | `docs/genehmigung/05_IK_Nachweis.pdf` | Scan, **zweite Ablage** |

**Vier Dokumente, achtfach abgelegt.** Jede Kopie ist eine eigene Fundstelle; wer eine
entfernt, hat nichts entfernt.

**Ältester Eintrag:** 10.08.2026 — die beiden Führungszeugnisse und die Berufserlaubnis
liegen seit über einem Monat öffentlich.

### 2.2 Was ausdrücklich **kein** Befund ist

| Pfad | Warum nicht |
|---|---|
| `…Anlage-04-Arbeitsvertrag-…-Sabrina-Martin.pdf` (3 Ablagen) | Vordruck, Felder leer (Beginn, Stunden, Vergütung, Adresse) — am 12.09.2026 visuell geprüft. Der Name steht nur im Dateinamen. |
| `…Erklaerung-Fuehrungszeugnisse.pdf` (4 Ablagen) | Erklärung **über** Führungszeugnisse, nicht ein Führungszeugnis. Leerer Arbeitgebervordruck. |
| `…Schweigepflichterklaerung.pdf` | Vordruck, Name/Geburtsdatum/Wohnort leer. |
| `components/onboarding/bewerber/Schritt09Fuehrungszeugnis.tsx` | Quelltext. Heißt so, ist keins. |

Ein Scanner, der diese als „kritisch" meldet, wird nach der dritten Fehlmeldung ignoriert.
Die Unterscheidung steckt deshalb als Gegenmuster in der Regel selbst.

### 2.3 Eine Einschränkung, die genannt sein muss

Die acht Befunde sind **reine Bildscans ohne Textebene**. Ein Textscan nach IBAN- oder
Geburtsdatumsmustern findet darin **nichts** — er meldete für alle acht „sauber". Die
Einordnung oben stammt aus dem visuellen Öffnen der Dokumente, nicht aus einem Grep.

**Wer PDFs nur greppt, hält Scans für unbedenklich.** Das ist die gefährlichste
Einzelannahme in diesem Bereich.

## 3. Secrets-Scan

### 3.1 Abgedeckte Provider

Stripe (live/test/restricted), Resend, Supabase (Service-JWT, `sb_secret_`,
`sb_publishable_`), OpenAI, Google/Gemini, Firebase Admin, Meta/Facebook, TikTok, Vercel,
GitHub, Slack. Dazu private Schlüsselblöcke und IBAN-Muster.

**Geprüft:** 5.174 getrackte Dateien · 88 Dateien aus 5 entpackten Archiven ·
310 JS/JSON/HTML/Map-Dateien gezielt auf JWT-Form.

### 3.2 Ergebnis

| Bereich | Ergebnis |
|---|---|
| `scripts/ci-secret-scan.sh` (Voll-Scan, bereits in CI) | **clean**, Exit 0 |
| Stripe · Resend · Supabase-JWT · `sb_secret_` · OpenAI · TikTok · Vercel · GitHub · Slack | **kein Treffer** |
| JWT-Form in kompilierten JS/JSON/HTML/Map | **0 Dateien** |
| Archive (`docs/proof/*.zip`, 5 Stück, 88 Dateien) | **kein Treffer** — auch nicht in dem Eintrag, der `11_secrets_env.md` heißt |
| Getrackte Build-Ausgaben / Bundles | keine. `.next/`, `/out`, `/build` sind ignoriert; die sechs gefundenen `.js`/`.mjs` sind Werkzeugskripte, keine Bundles |

### 3.3 Zwei Fehlalarme meines eigenen Musters — benannt, nicht verschwiegen

| Muster | Treffer | Befund |
|---|---|---|
| Firebase Admin Private Key | 4 | Alle in `__tests__/` — **absichtlich unechte** Schlüssel, mit denen geprüft wird, dass der Guard Schlüsselmaterial abweist. Der Treffer ist der Beweis, dass es den Guard gibt. |
| Meta/Facebook `EAA…` | 8 | Alle sind **base64-kodierte Bilder** (`iVBORw0KGgo` = PNG, `/9j/4AAQ` = JPEG), dazu `package-lock.json`-Integritätshashes und eine CSR. Das Muster `EAA[A-Za-z0-9]{40,}` trifft in jedem längeren Base64-Block. |

### 3.4 Ein echter, aber unkritischer Treffer

`android/app/google-services.json` — Google-API-Key (39 Zeichen, Präfix `AIza`).

**Einordnung:** Das ist die **Client**-Konfiguration einer Android-App. Sie ist dafür
gemacht, im APK ausgeliefert zu werden, und ist an Paketnamen plus SHA-Fingerprint
gebunden. Die Datei enthält **kein** `private_key` und **kein** `client_email`, also kein
Dienstkonto (geprüft). Projekt `alltagsengel-2bbe9`, Paket `care.alltagsengel.app`.

**Empfehlung, keine Dringlichkeit:** Den Key in der Google-Cloud-Konsole auf die
benötigten APIs und den App-Fingerprint einschränken. Nicht rotieren, nicht entfernen —
ohne ihn baut die App nicht.

## 4. `.env.example` — bereits sauber

Alle acht auffälligen Zeilen wurden einzeln geprüft. Die Form (Werte maskiert):

| Datei | Variable | Form |
|---|---|---|
| `.env.example` | `NEXT_PUBLIC_SUPABASE_URL` | `https://your-project.supabase.co`-Gestalt |
| `.env.example` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_your_key`-Gestalt |
| `.env.example` | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | `https://your_dsn@your_org.ingest.sentry.io/your_project_id`-Gestalt |
| `.env.example` | `SENTRY_AUTH_TOKEN` | Wortmarke mit Unterstrichen |
| `.env.example` | `VAPID_SUBJECT` | `mailto:`-Adresse |
| `native/.env.example` | beide | dieselbe Gestalt wie oben |

**Es war nichts zu ersetzen.** Mein Heuristik-Treffer war die Zeichenlänge, nicht ein
echter Wert. Getrackt sind ausschließlich `.env.example` und `native/.env.example`;
`.env`, `.env.*` und `.env*.local` sind ignoriert.

## 5. Was gehärtet wurde

### 5.1 `.gitignore`

30 neue Muster für Dokumentenklassen, die nie hineingehören: Führungszeugnis,
Ausweis/Reisepass/Führerschein, Arbeits- und Aushilfsverträge, Versicherungsscheine,
Kontoauszüge, Entgeltabrechnungen, Personenstandsurkunden — und **Kamerascans**
(`Gescanntes Dokument*`, `Scanned Document*`, `IMG_*.HEIC`).

Letzteres aus konkretem Anlass: `Gescanntes Dokument 14.pdf` war der Scan einer
Debitkarte samt Prüfziffer. Der Name verrät bei Kamerascans grundsätzlich nichts.

Mit Gegenausnahme für Quelltext (`!*.ts`, `!*.tsx`, …) — ohne sie fiele
`Schritt09Fuehrungszeugnis.tsx` unter die Regel. Beim Setzen geprüft und korrigiert.

### 5.2 `npm run lint:pii` — in CI, blockierend

**Warum zusätzlich zu `.gitignore`:** `.gitignore` wirkt nur auf **ungetrackte** Dateien.
Für die acht Befunde oben ändert es nichts, und `git add -f` umgeht es in einer Sekunde.

Der Lauf prüft, was **tatsächlich getrackt ist**. Der Bestand vom 12.09.2026 (11 Einträge,
inklusive der vier begründeten Nicht-Befunde) ist namentlich eingefroren; jede zwölfte
Datei macht den Lauf rot. Er liest **nur Dateinamen** und öffnet kein Dokument.

Gegenprobe gefahren: `docs/Kontoauszug_Test_2026.pdf` per `git add -f` eingeschmuggelt →
`[KRITISCH] … Bank- oder Kartendokument (Regel bank)`, Exit 1. Nach Entfernen wieder Exit 0.

### 5.3 CI-Bypässe

Der Auftrag nennt „keine `|| true` Bypässe". Befund: **es gibt keine mehr.**
Vier Treffer im Workflow, davon

* **drei in Kommentaren**, die die Abschaffung des ESLint-Bypasses vom 12.09.2026 erklären,
* **einer echt**: `sudo apt-get update -qq || true` innerhalb einer Wiederholungsschleife,
  die nach vier Versuchen `exit 1` liefert. Der `|| true` verhindert nur, dass ein
  vorübergehend nicht erreichbarer Paketspiegel die Schleife abbricht — das Scheitern der
  Installation selbst macht den Schritt weiterhin rot.

Das ist kein Bypass, sondern der richtige Einsatz.

## 6. Was **nicht** getan wurde — und warum

Die acht Dokumente sind **weiterhin im Baum und in der Historie**.

`git rm --cached` nimmt sie aus dem Arbeitsbaum, **nicht aus der Historie** — jeder alte
Commit bleibt abrufbar. Die Historie zu bereinigen heißt `git filter-repo` oder
`filter-branch` mit erzwungenem Push: alle Commit-Hashes ändern sich, jeder Klon wird
ungültig, und geöffnete Pull Requests brechen. Dazu kommt, dass GitHub Forks und
Caches vorhalten kann, die ein Rewrite nicht erreicht.

Das ist **unumkehrbar und außenwirksam** und deshalb keine Entscheidung, die
nebenbei fällt. Drei Wege, in der Reihenfolge, die ich empfehlen würde:

| # | Weg | Wirkung | Kosten |
|---|---|---|---|
| 1 | **Repository auf privat stellen** | Wirkt sofort für alle acht Dokumente und die Historie | Öffentliche Links brechen; kostet nichts an Arbeit |
| 2 | Dateien entfernen **und** Historie umschreiben | Vollständig, auch für Klone, die danach ziehen | Alle Hashes neu, Force-Push, Forks bleiben ein Restrisiko |
| 3 | Nur `git rm --cached` | Kosmetisch — die Historie bleibt lesbar | gering, aber löst das Problem nicht |

Weg 1 ist der einzige, der die Lücke schließt, ohne etwas kaputt zu machen. Weg 3 allein
wäre die schlechteste Variante: sie sieht nach Behebung aus.

**Unabhängig vom Weg:** Ein Führungszeugnis, das einen Monat öffentlich lag, ist als
offengelegt zu behandeln. Für die Mitarbeiterin (Berufserlaubnis mit Geburtsdatum) ist das
zusätzlich eine Frage der Information — es sind ihre Daten, nicht die der Gesellschaft.

## 7. Zusammenfassung

| Bereich | Stand |
|---|---|
| Secrets in getrackten Dateien | **keine** |
| Secrets in Archiven | **keine** |
| JWT/Token in kompilierten Artefakten | **keine** |
| `.env.example` | **sauber**, nichts zu ersetzen |
| Google-Client-Key (Android) | vorhanden, erwartbar, einschränken empfohlen |
| **PII im öffentlichen Baum** | **8 Fundstellen, 4 Dokumente** — offen, Entscheidung des Inhabers |
| `.gitignore` | gehärtet, 30 Muster, Quelltext-Ausnahme geprüft |
| `lint:pii` | neu, blockierend in CI, mit Gegenprobe belegt |
| CI-Bypässe | keine |
