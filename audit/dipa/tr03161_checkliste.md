# BSI TR-03161 — Vorbereitungs-Checkliste

**Stand:** 2026-08-12 · **Block:** 15b · **Status:** Selbsteinschätzung, **kein Zertifikat**

> ## Lesehinweis — bitte zuerst lesen
>
> **Diese Checkliste enthält bewusst KEINE Anforderungstexte aus der TR-03161.**
> Die Richtlinie ist ein umfangreiches, versioniertes Dokument des BSI in drei Teilen; ihre
> Anforderungen hier aus dem Gedächtnis oder aus Sekundärquellen zu paraphrasieren, würde
> eine Genauigkeit vortäuschen, die nicht besteht — und im Prüfverfahren sofort auffallen.
>
> Was hier steht, ist die **Gegenseite**: unser Ist-Zustand, nach den Themenfeldern
> sortiert, die die Richtlinie erkennbar adressiert. Beim Ausfüllen wird jeder Zeile die
> konkrete Anforderungs-ID aus dem Originaldokument zugeordnet.
>
> **Verbindlich ist allein die vom BSI veröffentlichte Fassung** in der zum
> Prüfzeitpunkt gültigen Version, bezogen über das BSI. Die Prüfung erfolgt durch eine
> akkreditierte Prüfstelle — nicht durch Selbstauskunft.
>
> Quelle laut Regulatorik-Analyse: `audit/DIPA_REGULATORIK_2026-08-09.md`, Teil 1.

---

## 0. Verfahrensstand

| Punkt | Stand |
|---|---|
| Prüfstelle beauftragt | **nein** (GAP-TR03161) |
| Anwendungsbereich festgelegt (welche Teile der Richtlinie gelten für uns?) | **nein** — Webanwendung ohne native App; welche Teile damit einschlägig sind, ist mit der Prüfstelle zu klären |
| Zertifikat | **nein** |
| Gilt die Anforderung schon für eine vorläufige Aufnahme? | **offen** (ORF-2, BfArM-Frage 9) |

**Nächster Schritt:** Prüfstelle anfragen und den Anwendungsbereich klären. Alles Weitere
in dieser Liste ist Vorarbeit, kein Ersatz.

## 1. Ist-Zustand nach Themenfeldern

Spalte „Anf.-ID" wird beim Abgleich mit dem Originaldokument gefüllt.

### 1.1 Anwendungszweck und Architektur

| Anf.-ID | Thema | Ist-Zustand | Nachweis |
|---|---|---|---|
| _(offen)_ | Zweckbestimmung dokumentiert | erfüllt | `finale_zweckbestimmung.md` |
| _(offen)_ | Architektur- und Datenflussbeschreibung | teilweise | `audit/DIPA_REGULATORIK_2026-08-09.md` Teil 4; produktbezogene Fassung fehlt |
| _(offen)_ | Abgrenzung zu anderen Systemen des Herstellers | erfüllt | Produkttrennung im Datenmodell; `nutzerflow_dipa.md` |
| _(offen)_ | Versionierung und Änderungsdokumentation | erfüllt | `lib/coach/version.ts`, `CHANGELOG_pflegecoach.md` |

### 1.2 Anwendungssicherheit

| Anf.-ID | Thema | Ist-Zustand | Nachweis |
|---|---|---|---|
| _(offen)_ | Eingabevalidierung serverseitig | erfüllt | Whitelisting in allen Routen, Enum-/Längen-/Datumsprüfung |
| _(offen)_ | Schutz gegen Injection | erfüllt | ausschließlich Query-Builder, kein String-SQL |
| _(offen)_ | Ausgabe-Kodierung / XSS | erfüllt | kein `dangerouslySetInnerHTML` im Produktpfad |
| _(offen)_ | Fehlerbehandlung ohne Informationspreisgabe | erfüllt | einheitliche Fehlertexte; Code-Einlösung mit identischer Meldung |
| _(offen)_ | Abhängigkeiten aktuell und geprüft | **offen** | kein dokumentierter Prozess |

### 1.3 Authentisierung und Autorisierung

| Anf.-ID | Thema | Ist-Zustand | Nachweis |
|---|---|---|---|
| _(offen)_ | Sichere Anmeldung | teilweise | Plattform-Auth; **zweiter Faktor fehlt** (GAP-MFA) |
| _(offen)_ | Sitzungsverwaltung | teilweise | Plattformmechanismus, produktbezogen nicht bewertet |
| _(offen)_ | Rechtetrennung, Zugriff nur auf eigene Daten | erfüllt | RLS + 39 Rollen-/Rechte-Tests (`supabase/shadow/50_pflegecoach_tests.sql`) |
| _(offen)_ | Kein privilegierter Zugriff durch Betreiberpersonal | erfüllt | keine Admin-Policies auf `coach_*` |
| _(offen)_ | Passwort-Wiederherstellung | teilweise | Plattform-Flow, produktbezogen nicht geprüft |

### 1.4 Kryptografie

| Anf.-ID | Thema | Ist-Zustand | Nachweis |
|---|---|---|---|
| _(offen)_ | Transportverschlüsselung | erfüllt | `verschluesselungskonzept.md` §2 |
| _(offen)_ | Verschlüsselung im Ruhezustand | konfigurationsabhängig | ebd. §3 — AVV-Nachweis offen |
| _(offen)_ | Verfahren und Schlüssellängen | teilweise | HMAC-SHA256 (32-Byte-Schlüssel), SHA-256 für Codes |
| _(offen)_ | Schlüsselverwaltung und Rotation | teilweise | ebd. §6 |

### 1.5 Daten- und Speicherschutz

| Anf.-ID | Thema | Ist-Zustand | Nachweis |
|---|---|---|---|
| _(offen)_ | Keine sensiblen Daten im Client-Speicher | erfüllt | nur Darstellungseinstellungen im `localStorage` |
| _(offen)_ | Keine sensiblen Daten in Protokollen | erfüllt | Audit ohne Werte; keine Coach-Daten in Analytics |
| _(offen)_ | Löschbarkeit | erfüllt | `loeschkonzept.md`, `/pflegecoach/loeschung` |
| _(offen)_ | Pseudonymisierung von Auswertungsdaten | erfüllt | `coach_nutzungsereignisse` + `coach_pseudonym_key` |

### 1.6 Netzwerk und Plattform

| Anf.-ID | Thema | Ist-Zustand | Nachweis |
|---|---|---|---|
| _(offen)_ | Sicherheitsrelevante HTTP-Header | **zu prüfen** | plattform-/konfigurationsabhängig |
| _(offen)_ | Keine unnötigen offenen Schnittstellen | teilweise | API-Routen mit Auth-Guard; Gesamtinventar produktbezogen nicht erhoben |
| _(offen)_ | Trennung von Produktiv- und Testumgebung | teilweise | Preview-/Production-Trennung vorhanden; produktbezogene Bewertung offen |

### 1.7 Organisation und Prozesse

| Anf.-ID | Thema | Ist-Zustand | Nachweis |
|---|---|---|---|
| _(offen)_ | Informationssicherheits-Managementsystem | **offen** | GAP-ISMS |
| _(offen)_ | Schwachstellenmanagement und Meldewege | **offen** | kein dokumentierter Prozess |
| _(offen)_ | Penetrationstest | **offen** | GAP-EXT-REVIEW |
| _(offen)_ | Qualitäts- und Risikomanagement | **offen** | GAP-QMS |
| _(offen)_ | Sicherheitsschulung der Beteiligten | **offen** | für eUL-Erbringer als Kriterium angelegt (`lib/coach/eul.ts`), unternehmensweit offen |

## 2. Zusammenfassung der Lücken

| Priorität | Lücke | Gap-ID |
|---|---|---|
| 1 | Prüfstelle nicht beauftragt, Anwendungsbereich unklar | GAP-TR03161 |
| 2 | Kein zweiter Faktor | GAP-MFA |
| 3 | Kein ISMS, kein Schwachstellenmanagement | GAP-ISMS |
| 4 | Kein externer Penetrationstest | GAP-EXT-REVIEW |
| 5 | Kein QMS/Risikomanagement | GAP-QMS |
| 6 | HTTP-Header und Plattformkonfiguration produktbezogen ungeprüft | — |
| 7 | Kein dokumentierter Abhängigkeits-/Update-Prozess | — |

**Bewertung:** Die anwendungsseitigen Themenfelder (1.1–1.5) sind überwiegend belegt. Die
Lücken liegen fast vollständig im organisatorischen Bereich (1.7) und bei der
Authentisierung — und genau dort ist der Vorlauf am längsten. Beides gehört als Erstes
angegangen, nicht zuletzt.
