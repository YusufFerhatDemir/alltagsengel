# QM-Handbuch — Digitaler PflegeCoach

**Produkt:** Digitaler PflegeCoach · **Version:** 0.5.0 · **Stand:** 2026-08-14
**Geltungsbereich:** ausschließlich der Digitale PflegeCoach (`app/pflegecoach/**`,
`app/api/coach/**`, `lib/coach/**`, Tabellen `coach_*`)
**Deckt ab:** DiPA-Matrix QMS-01 · **Status:** intern erstellt, extern nicht auditiert

---

## 0. Was dieses Handbuch ist — und was nicht

**Es ist:** die schriftliche Fassung der Arbeitsweise, mit der dieses Produkt
gebaut, geändert und betrieben wird. Bisher existierten die Bausteine
(Versionierung, Changelog, Testtore, Prüfprotokolle, Audit-Log) — aber
niemand hatte sie als System beschrieben. Genau das war die Lücke QMS-01.

**Es ist nicht:** ein Nachweis der Konformität zu ISO 13485, ISO 9001 oder
ISO/IEC 27001. Kein Auditor hat dieses System geprüft. Wo ein Verfahren nur
auf dem Papier existiert und noch nie durchlaufen wurde, steht das
ausdrücklich dabei — ein QM-Handbuch, das gelebte und geplante Praxis
vermischt, ist im Audit wertlos.

**Ehrliche Rahmenbedingung:** Das Produkt wird von einem sehr kleinen Team
entwickelt. Ein Verfahren, das eine Vier-Augen-Freigabe durch eine zweite
Person vorschreibt, wäre eine Fiktion. Die Verfahren unten sind deshalb auf
das zugeschnitten, was tatsächlich einhaltbar ist — und dort, wo eine
zweite Person unverzichtbar ist (fachliche Inhaltsfreigabe, juristische
Prüfung, Sicherheitsprüfung), ist sie als externe Beauftragung benannt und
nicht wegdefiniert.

## 1. Verantwortlichkeiten

| Rolle | Wer | Verantwortet |
|---|---|---|
| Produktverantwortung | Geschäftsführung Alltagsengel | Zweckbestimmung, Produktgrenze, Freigabe von Releases, regulatorische Entscheidungen |
| Technische Umsetzung | Entwicklung | Code, Migrationen, Tests, technische Dokumentation |
| Pflegefachliche Freigabe | **noch nicht besetzt** | Inhaltsprüfung (QI-01) — offene Beauftragung |
| Datenschutz | **extern zu beauftragen** | DSFA, AVV-Kette (DS-02, DS-04) |
| Informationssicherheit | **extern zu beauftragen** | Prüfstellen-Zertifikat, Penetrationstest (SEC-01, SEC-04) |

Nicht besetzte Rollen sind hier bewusst als Leerstelle geführt und nicht
ersatzweise der Geschäftsführung zugeschlagen. Eine Inhaltsfreigabe durch
Personen ohne Pflegefachqualifikation wäre keine Freigabe.

## 2. Dokumentenlenkung

Alle produktbezogenen Dokumente liegen versioniert im Repository unter
`audit/dipa/`. Das ist die vollständige und einzige Ablage; es gibt keine
zweite Fassung in einem Laufwerk oder Postfach.

| Regel | Umsetzung |
|---|---|
| Jede Änderung ist nachvollziehbar | Versionsverwaltung (Git): Autor, Zeitpunkt, Änderungsumfang je Dokument |
| Gültige Fassung ist eindeutig | Der Stand auf `main` ist die gültige Fassung. Ältere Fassungen bleiben in der Historie abrufbar. |
| Dokument und Produktstand gehören zusammen | Jedes Dokument trägt Produktversion und Stand im Kopf |
| Keine Datei ohne erkennbaren Zweck | Jedes Dokument nennt in Zeile 1–5, welche Matrix-Anforderung es abdeckt |

**Schwachstelle, offen benannt:** Es gibt keine formale Freigabekennzeichnung
je Dokument („geprüft von / freigegeben am"). Für die intern erstellten
Dokumente wäre sie eine Selbstbestätigung. Sie wird eingeführt, sobald die
erste externe Prüfung (DSFA oder Prüfstelle) läuft — dann hat sie Inhalt.

## 3. Änderungsverfahren

Jede Produktänderung durchläuft dieselben fünf Schritte:

1. **Einordnung.** Ist die Änderung PATCH, MINOR oder MAJOR
   (`lib/coach/version.ts`)? MAJOR bedeutet: Zweckbestimmung oder
   Produktgrenze ist berührt — dann ist sie **vor** der Umsetzung
   regulatorisch zu bewerten, nicht danach.
2. **Umsetzung** mit Tests. Neue Fachlogik ohne Test gilt als nicht fertig.
3. **Automatische Tore** (siehe §4). Rot heißt: nicht ausliefern.
4. **Eintrag** in `audit/dipa/CHANGELOG_pflegecoach.md` mit Datum,
   Version und Kategorie.
5. **Auslieferung** über `./deploy.sh` — inklusive Secret-Prüfung und
   Bestätigung, dass der Stand tatsächlich am Ziel angekommen ist.

Bei Änderungen an Datenbankstrukturen kommt hinzu: Migration **und**
Rollback-Skript, und die Bestätigung, dass die Migration auf der
Produktionsdatenbank tatsächlich angewendet wurde. „Migration geschrieben"
ist nicht „Migration live" — dieser Unterschied hat in diesem Repository
schon mehrfach zu falschen Statusmeldungen geführt und ist deshalb ein
eigener, verpflichtender Prüfschritt.

## 4. Qualitätstore

| Tor | Werkzeug | Was es verhindert |
|---|---|---|
| Fachlogik | `lib/coach/*.test.ts` (`npm run test:unit`) | Falsche Berechnungen, falsche Auswertung von Einwilligung, Freischaltung, zweitem Faktor |
| Produktgrenze | `lib/coach/produktgrenze.test.ts` | Erstattungs- und Zulassungsaussagen, ungeschützte Schreibrouten, DiPA-Oberflächen ohne Schalter |
| Zugriffsregeln | `supabase/shadow/50_pflegecoach_tests.sql` (68 Tests) | Fremdzugriff, Admin-Zugriff auf Produktdaten, Selbst-Freischaltung, Pseudonym-Orakel |
| Exportformat | `lib/coach/export.test.ts`, `lib/coach/fhir.test.ts` | Abweichung vom veröffentlichten Schema; unbelegte Profil- oder Terminologie-Behauptungen |
| Oberfläche | `e2e/pflegecoach.spec.ts` | Nicht erreichbare Seiten, fehlender Zugangsschutz, Tracker im Produktbereich, Strukturmängel der Barrierefreiheit |
| Typprüfung | `npm run typecheck` | Formfehler, die erst im Betrieb auffallen würden |
| Auslieferung | `./deploy.sh` (Secret-Guard, Push-Verifikation) | Geheimnisse im Repository, geglaubte statt tatsächlicher Auslieferung |

**Grenze dieser Tore, ausdrücklich:** Sie prüfen Regeln, die wir selbst
gesetzt haben. Ob diese Regeln den regulatorischen Anforderungen
entsprechen, prüft kein Test — das ist REG-01 und offen.

## 5. Fehler- und Vorkommnisbehandlung

| Schweregrad | Definition | Reaktion |
|---|---|---|
| P0 | Gesundheitsdaten sind fremdzugänglich, oder das Produkt macht eine unzulässige Zusage | Sofort: Ursache beheben oder betroffene Funktion abschalten (Schalter, siehe §7). Danach Eintrag in die Risikoakte. |
| P1 | Kernfunktion für Nutzer unbrauchbar | Innerhalb eines Arbeitstages beheben |
| P2 | Einschränkung mit Umweg | Im nächsten Release |
| P3 | Kosmetik, Text | Gesammelt |

Alle P0- und P1-Ereignisse werden in `audit/dipa/risikoakte_pflegecoach.md`
aufgenommen — auch wenn sie behoben sind. Ein behobener Vorfall, der nirgends
steht, kann sich unbemerkt wiederholen.

**Ehrlich:** Ein Meldeweg gegenüber einer Behörde ist bewusst **nicht**
beschrieben. Ob und wann für eine DiPA eine Meldepflicht besteht, ist eine
regulatorische Frage (REG-05, BfArM-Beratung). Ein erfundenes Meldeverfahren
wäre schlimmer als keines.

## 6. Rückmeldungen aus dem Betrieb

Rückmeldungen erreichen den Hersteller über `info@alltagsengel.care`
(in Fußzeile, Produktseite, Einstellungen und Kontoseite hinterlegt) sowie
über `/pflegecoach/anfrage`. Sie werden gesichtet und, sofern sie das
Produkt betreffen, als Fehler (§5) oder als Änderungswunsch aufgenommen.

**Offen:** Eine zugesagte Reaktionszeit gibt es noch nicht (VS-02). Solange
sie nicht zugesagt ist, wird sie auch nirgends behauptet.

## 7. Beherrschte Abschaltung (Fail-Closed-Schalter)

Ein Merkmal dieses Produkts: Was regulatorisch nicht geklärt ist, läuft
nicht — und zwar per Voreinstellung, nicht per Disziplin.

| Schalter | Voreinstellung | Was er sperrt |
|---|---|---|
| `COACH_DIPA_MODUS` | aus | Anspruchsprüfung, Kostenträgerbezug, Abrechnungsoberflächen |
| `COACH_FREISCHALTUNG_PFLICHT` | aus | Zugangsverfahren über Freischaltcode |
| `COACH_NUTZUNGSNACHWEIS_AKTIV` | aus | Erhebung pseudonymer Nutzungsereignisse |
| `COACH_MFA_PFLICHT` | aus | Pflicht zum zweiten Faktor (freiwillige Nutzung bleibt möglich) |
| `COACH_PREISE_FREIGEGEBEN` | aus | gesamter Bestellweg, solange kein Preis kaufmännisch entschieden ist |

Jeder Schalter ist so gebaut, dass die *sichere* Stellung die Voreinstellung
ist. Fällt eine Prüfung aus, wird nicht geschrieben — das gilt für die
Einwilligung, die Freischaltung, den zweiten Faktor und die Preisfreigabe
gleichermaßen.

## 8. Verweise

| Thema | Dokument |
|---|---|
| Risiken mit Bewertung | `audit/dipa/risikoakte_pflegecoach.md` |
| Risikoanalyse (Ausgangsfassung) | `audit/dipa/risikoanalyse_pflegecoach.md` |
| Lebenszyklus, Versionierung, Wartung | `audit/dipa/software_lebenszyklus_pflegecoach.md` |
| Technische Dokumentation | `audit/dipa/technische_dokumentation_pflegecoach.md` |
| Sicherheitsarchitektur | `audit/dipa/sicherheitsarchitektur_pflegecoach.md` |
| Änderungshistorie | `audit/dipa/CHANGELOG_pflegecoach.md` |
| Gesamtstand der Anforderungen | `docs/DIPA_MATRIX_FINAL.md` |

## 9. Was diesem QMS zur Auditfähigkeit fehlt

Vollständig und ohne Beschönigung:

1. **Externe Auditierung** — niemand von außen hat dieses System geprüft.
2. **Managementbewertung** — kein turnusmäßiger Review-Termin etabliert.
3. **Lieferantenbewertung** — die Auftragsverarbeiter-Kette ist nicht
   dokumentiert (DS-04); ohne sie ist keine Bewertung möglich.
4. **Schulungsnachweise** — nicht geführt.
5. **Wiederanlaufprüfung** — die Rücksicherung aus einem Backup ist nie
   erprobt worden (Risiko R3.4).
6. **Freigabekennzeichnung je Dokument** — siehe §2.

Punkte 1–3 hängen an externen Beauftragungen. Punkte 4–6 sind intern
machbar und offen.
