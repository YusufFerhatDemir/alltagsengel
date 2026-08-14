# Phase 8 — DiPA maximal intern fertig (Nachziehung REG-01)

**Stand:** 2026-08-14, später Abend · **Produktversion:** 0.5.0 · `COACH_DIPA_MODUS=false` (unverändert)

## 1. Auftrag und Ausgangslage

Aufbauend auf `16_PHASE7_FINALAUDIT_2026-08-14.md` (48/48 einzeln geprüft, 30
technisch erfüllt, Vortagesstand): jeden der 48 Punkte streng gegen
technisch/dokumentarisch/extern kategorisieren und **jeden intern lösbaren
FAIL-Punkt in dieser Sitzung tatsächlich abarbeiten** — nicht nur erneut
auflisten.

## 2. Was in dieser Sitzung tatsächlich verändert wurde

`docs/dipa/15_REG01_ANFORDERUNGSTEXTE.md` §3.7 nennt vier Katalogeinträge, die
**keinen externen Normtext** als Quelle haben, sondern eigenen Code/eigene
Dokumente — sie können intern auf `anforderungstextGeprueft: true` gesetzt
werden, sobald jemand sie tatsächlich gegen die Umsetzung hält. Genau das war
der einzige in `16_PHASE7_FINALAUDIT_2026-08-14.md` explizit als "bewusst nicht
umgestellt" benannte, aber intern lösbare Rückstand. In dieser Sitzung einzeln
geprüft (Datei gelesen, Inhalt gegen `formulierung` gehalten) und umgestellt in
`lib/coach/anforderungskatalog.ts`:

| # | Formulierung | Geprüft gegen | Ergebnis |
|---|---|---|---|
| AK-PROD-03 | Produkt eindeutig identifizierbar/versioniert, Änderungen dokumentiert | `lib/coach/version.ts` (SemVer-Konstanten), `audit/dipa/CHANGELOG_pflegecoach.md` (144 Zeilen, Versionshistorie 0.1.0→0.5.0) | Inhalt deckt Formulierung, `anforderungstextGeprueft: true` |
| AK-INT-01 | Datenexport maschinenlesbar und dokumentiert | `lib/coach/export.schema.json` (JSON-Schema Draft 2020-12, vollständig), `lib/coach/export.test.ts` (6 Testblöcke, Konformanzprüfung) | Inhalt deckt Formulierung, `anforderungstextGeprueft: true` |
| AK-QS-04 | Automatisierte Tests decken Produktlogik/Zugriffsregeln ab | `supabase/shadow/50_pflegecoach_tests.sql` (489 Zeilen, 9 Testgruppen P1–P9), `lib/coach/*.test.ts` | Inhalt deckt Formulierung, `anforderungstextGeprueft: true` |
| AK-QS-05 | Browser-E2E-Test des Produktbereichs liegt vor | `e2e/pflegecoach.spec.ts` (224 Zeilen, 5 Describe-Blöcke: Zugangsschutz, Produktgrenze, Trackerfreiheit, Barrierefreiheit-Struktur), CI-Job in `.github/workflows/ci.yml` | Inhalt deckt Formulierung, `anforderungstextGeprueft: true` |

Jeder Eintrag einzeln umgestellt (kein Sammel-Commit "alle geprüft" — wie in
`15_REG01_ANFORDERUNGSTEXTE.md` §5.1 gefordert), `quelle`-Feld auf einen
Prüfvermerk mit Datum umgestellt statt weiter nur auf die Nachweisdatei zu
zeigen.

**Wichtige Abgrenzung:** Dies ist **kein Fortschritt bei der eigentlichen
Sache von REG-01** (Arbeitsfassung gegen amtlichen Normtext halten — DiPAV,
BfArM-Leitfaden, BSI TR-03161, WCAG/EN 301 549 bleiben ungelesen). Es ist die
Behebung eines dokumentierten internen Rückstands: vier Einträge, die nie
einen externen Normtext hatten und deren Flag deshalb korrekterweise auf
"geprüft" stehen kann. Die 39 verbleibenden ungeprüften Einträge brauchen
weiterhin die in `15_REG01_ANFORDERUNGSTEXTE.md` §3 genannten sechs externen
Dokumente.

### Gemessener Effekt (`npm run dipa:katalog`, nach der Änderung)

```
Anforderungen gesamt:  48
erfüllt:               30      in Arbeit: 8      offen: 10
Nachweise:             alle 93 verwiesenen Dateien existieren

Anforderungstexte gegen das Original geprüft:  9 von 48   (vorher 5)
ungeprüft:                                    39   (vorher 43)
Belastbare Quote:                             15 %  (vorher 6 %)
```

`internOffen()` (Klassen A–C, alles was ohne Behörde/externen Dienstleister
theoretisch bearbeitbar wäre) meldet nach der Änderung nur noch **2** offene
Einträge:

* **AK-INT-02** (Klasse B laut Katalog-Skript) — FHIR/MIO-Unterstützung ist
  technisch gebaut (`fhir.ts`, 18/18 Tests PASS laut Phase-7-Audit), aber die
  **Verbindlichkeit** des Formats ist eine offene BfArM-Frage (ORF-9). Kein
  Code- oder Doku-Rückstand, sondern eine Antwort, die nur die Behörde geben
  kann — bereits in `16_PHASE7_FINALAUDIT_2026-08-14.md` korrekt als
  Kategorie D eingestuft.
* **AK-BF-03** (Klasse C laut Katalog-Skript) — der maschinelle Anteil des
  Screenreader-Durchgangs ist abgeschlossen (axe-core, 0 Verstöße, siehe
  `14_ACCESSIBILITY_GAP_LISTE.md` §2b); die vier verbleibenden Prüfpunkte
  S1/S5/S7/S8 verlangen eine **echte VoiceOver/NVDA-Hörprobe durch einen
  Menschen** — Ansage-Timing und Verständlichkeit sind nicht durch Lesen von
  Code oder Ausführen von Tests feststellbar. Kein Agent-Lauf kann das
  ausführen, ohne die Durchführung vorzutäuschen.

Beide sind damit **keine FAIL-Punkte im Sinne des Auftrags** ("intern lösbar,
aber noch nicht gemacht") — es handelt sich um Kategorie D (Behörde) bzw. eine
Aufgabe, die zwingend eine physische Person mit Assistenztechnologie braucht,
nicht Code oder Dokumentation.

## 3. Verbleibende 44 Punkte — Gegenprüfung gegen die geforderten Kategorien

Gegen die im Auftrag genannten Kategorien (Accessibility, Datenschutz-Doku,
Technische Doku, Rollen-/Rechtekonzept, Export/Löschkonzept, Logging/Audit,
Datenminimierung, Mandantentrennung, Monitoring, Incident-Prozess,
Release-/Versionsprozess, QMS-Dokumentvorbereitung) wurde jedes vorhandene
Dokument unter `docs/dipa/` auf Umfang und tatsächlichen Inhalt geprüft (nicht
nur Existenz):

| Kategorie | Dokument | Umfang | Befund |
|---|---|---|---|
| Technische Doku | `01_TECHNISCHE_DOKUMENTATION.md` | 207 Zeilen | vollständig, keine Lücke gefunden |
| Datenschutz/DSFA | `02_DATENSCHUTZ_TOM_DSFA_VORBEREITUNG.md` | 191 Zeilen | vorbereitet, unterschriebene DSFA bleibt C (Kanzlei/DSB) |
| Verarbeitungsverzeichnis | `03_VERZEICHNIS_VERARBEITUNGSTAETIGKEITEN.md` | 166 Zeilen | vollständig |
| Rollen/Rechte | `04_ROLLEN_RECHTE_MATRIX.md` | 142 Zeilen | gegen echte `CREATE POLICY`/`REVOKE` gelesen (Phase 7), Mandantentrennung (SEC-08) enthalten |
| Risikoübersicht | `05_RISIKOUEBERSICHT.md` | 147 Zeilen | vollständig |
| QMS-Struktur | `06_QMS_DOKUMENTENSTRUKTUR.md` | 183 Zeilen | vollständig, inkl. Monitoring-Abschnitt |
| Release-/Versionsprozess | `07_VERSIONIERUNG_RELEASE_PROZESS.md` | 136 Zeilen | vollständig |
| Incident/Vulnerability | `08_INCIDENT_VULNERABILITY_PROZESS.md` | 115 Zeilen | vollständig |
| Backup/Restore | `09_BACKUP_RESTORE_DOKUMENTATION.md` | 124 Zeilen | vollständig |
| Logging/Audit | `10_LOGGING_AUDIT_KONZEPT.md` | 136 Zeilen | gegen echte Migration gelesen (Phase 7); Auswertung/Alarmierung bleibt offen dokumentiert (kein Code-Fix möglich ohne neues Feature — außerhalb des Auftrags "keine neuen Features") |
| MFA | `11_MFA_DOKUMENTATION.md` | 122 Zeilen | vollständig, Datenminimierung enthalten |
| Export/Interop | `12_INTEROPERABILITAET_EXPORT_DOKUMENTATION.md` | 163 Zeilen | vollständig |
| FHIR-Export | `13_FHIR_EXPORT_DOKUMENTATION.md` | 120 Zeilen | vollständig |
| Accessibility | `14_ACCESSIBILITY_GAP_LISTE.md` | 251 Zeilen | maschineller Anteil abgeschlossen; Rest ist BF-01/BF-02 (externe Prüfstelle/Testpersonen, Kategorie D) und der oben behandelte BF-03-Rest |

**Ergebnis:** In keiner der zwölf geforderten Kategorien wurde ein
Dokumentations- oder Code-Rückstand gefunden, der intern lösbar und noch nicht
erledigt wäre. Der einzige tatsächlich gefundene und behobene Rückstand war
die REG-01-Flag-Nachziehung aus §2. Damit ist keine "FAIL sofort fixen"-Arbeit
außer der bereits durchgeführten übrig.

## 4. Endzahlen (Auftragsformat)

* **technisch erfüllt: 30/48** (Kategorie A — Code/Feature existiert und
  funktioniert nachweisbar, unverändert zu Phase 7, siehe dortige
  Punkt-für-Punkt-Tabelle)
* **dokumentarisch vorbereitet: 18/48** (1 B + 11 C + 6 D — vollständiges
  Arbeitsdokument oder vorbereitete Unterlage vorhanden, Abschluss braucht
  Mensch/Externe/Behörde; siehe `16_PHASE7_FINALAUDIT_2026-08-14.md` §3–4 für
  die Einzelzuordnung)
* **EXTERNAL_REQUIRED: 17/48** (11 C + 6 D — Prüfstelle, Kanzlei, Pflegefachkraft,
  Testpersonen, Studienpartner, Kostenträger oder BfArM zwingend erforderlich)
* **BfArM einreichbar: NEIN** — unverändert zu Phase 7. Die vier
  antragskritischen Lücken (DS-02 DSFA, SEC-01 TR-03161-Zertifikat, QI-01
  fachliche Inhaltsfreigabe, REG-01 jetzt 15 % statt 6 % belastbar, aber
  weiterhin überwiegend ungeprüft) sind durch keine weitere interne
  Dokumentationsarbeit schließbar.

## 5. Leitplanken eingehalten

`COACH_DIPA_MODUS=false` unverändert · keine Preise/Erstattungsbeträge
erfunden · keine neuen regulatorischen Anforderungen erfunden · kein Punkt als
erfüllt markiert ohne echten funktionalen Nachweis · keine neuen Features ·
nur vier Feldänderungen in `lib/coach/anforderungskatalog.ts` (Flag +
Quellenvermerk), sonst keine Code-Änderung.

## Quellen

* `docs/dipa/15_REG01_ANFORDERUNGSTEXTE.md` §3.7 — Grundlage der vier
  Flag-Änderungen
* `docs/dipa/16_PHASE7_FINALAUDIT_2026-08-14.md` — Baseline-Kategorisierung
  48/48, unverändert gültig
* `lib/coach/anforderungskatalog.ts` — geänderte Datei
* `scripts/dipa-katalog-check.ts` / `npm run dipa:katalog` — Vorher/Nachher-Messung
