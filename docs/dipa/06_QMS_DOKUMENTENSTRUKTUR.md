**Stand:** 2026-08-14 · **Zweck:** Übersicht über das QM-System des Digitalen PflegeCoach (Verantwortlichkeiten, Dokumentenlenkung, Änderungsverfahren, Qualitätstore, Fehlerbehandlung, Fail-Closed-Schalter).

# QMS-Dokumentenstruktur — Digitaler PflegeCoach

**Produktversion:** 0.5.0 · **Geltungsbereich:** ausschließlich der Digitale
PflegeCoach (`app/pflegecoach/**`, `app/api/coach/**`, `lib/coach/**`, Tabellen
`coach_*`) · **Status:** intern erstellt, **extern nicht auditiert**

Konsolidiert aus `audit/dipa/qms_handbuch_pflegecoach.md`.

---

## 0. Was dieses QMS ist — und was nicht

**Es ist:** die schriftliche Fassung der Arbeitsweise, mit der das Produkt
gebaut, geändert und betrieben wird (Versionierung, Changelog, Testtore,
Prüfprotokolle, Audit-Log — als zusammenhängendes System beschrieben).

**Es ist nicht:** ein Nachweis der Konformität zu ISO 13485, ISO 9001 oder
ISO/IEC 27001. Kein Auditor hat dieses System geprüft. Verfahren, die nur auf
dem Papier existieren und nie durchlaufen wurden, sind als solche
gekennzeichnet.

**Ehrliche Rahmenbedingung:** Das Produkt wird von einem sehr kleinen Team
entwickelt. Eine Vier-Augen-Freigabe durch eine zweite Person ist deshalb nicht
generell vorgeschrieben — dort, wo eine zweite Person unverzichtbar ist
(fachliche Inhaltsfreigabe, juristische Prüfung, Sicherheitsprüfung), ist sie
als externe Beauftragung benannt, nicht wegdefiniert.

## 1. Verantwortlichkeiten

| Rolle | Wer | Verantwortet |
|---|---|---|
| Produktverantwortung | Geschäftsführung Alltagsengel | Zweckbestimmung, Produktgrenze, Freigabe von Releases, regulatorische Entscheidungen |
| Technische Umsetzung | Entwicklung | Code, Migrationen, Tests, technische Dokumentation |
| Pflegefachliche Freigabe | **noch nicht besetzt** | Inhaltsprüfung (Matrix-Punkt QI-01) — offene Beauftragung |
| Datenschutz | **extern zu beauftragen** | DSFA, AVV-Kette (Matrix-Punkte DS-02, DS-04) |
| Informationssicherheit | **extern zu beauftragen** | Prüfstellen-Zertifikat, Penetrationstest (Matrix-Punkte SEC-01, SEC-04) |

Nicht besetzte Rollen sind bewusst als Leerstelle geführt, nicht ersatzweise
der Geschäftsführung zugeschlagen — eine Inhaltsfreigabe ohne
Pflegefachqualifikation wäre keine Freigabe.

## 2. Dokumentenlenkung

Alle produktbezogenen Dokumente liegen versioniert im Repository unter
`audit/dipa/` (Detailunterlagen) und `docs/dipa/` (konsolidierte Fassungen wie
dieses Dokument). Das ist die vollständige und einzige Ablage.

| Regel | Umsetzung |
|---|---|
| Jede Änderung ist nachvollziehbar | Versionsverwaltung (Git): Autor, Zeitpunkt, Änderungsumfang je Dokument |
| Gültige Fassung ist eindeutig | Der Stand auf `main` ist die gültige Fassung; ältere Fassungen bleiben in der Git-Historie abrufbar |
| Dokument und Produktstand gehören zusammen | Jedes Dokument trägt Produktversion und Stand im Kopf |
| Keine Datei ohne erkennbaren Zweck | Jedes Dokument benennt eingangs die abgedeckte Matrix-Anforderung |

**Offen benannte Schwachstelle:** Es gibt keine formale Freigabekennzeichnung
je Dokument ("geprüft von / freigegeben am"). Für intern erstellte Dokumente
wäre sie eine Selbstbestätigung; sie wird eingeführt, sobald die erste externe
Prüfung (DSFA oder Prüfstelle) läuft.

## 3. Änderungsverfahren

Jede Produktänderung durchläuft dieselben fünf Schritte:

1. **Einordnung.** PATCH, MINOR oder MAJOR (`lib/coach/version.ts`)? MAJOR
   bedeutet: Zweckbestimmung oder Produktgrenze ist berührt — dann **vor** der
   Umsetzung regulatorisch zu bewerten, nicht danach.
2. **Umsetzung** mit Tests. Neue Fachlogik ohne Test gilt als nicht fertig.
3. **Automatische Tore** (siehe §4). Rot heißt: nicht ausliefern.
4. **Eintrag** in `audit/dipa/CHANGELOG_pflegecoach.md` mit Datum, Version und
   Kategorie.
5. **Auslieferung** über `./deploy.sh` — inklusive Secret-Prüfung und
   Bestätigung, dass der Stand tatsächlich am Ziel angekommen ist.

Bei Datenbankänderungen kommt hinzu: Migration **und** Rollback-Skript, sowie
die Bestätigung, dass die Migration auf der Produktionsdatenbank tatsächlich
angewendet wurde ("Migration geschrieben" ist nicht "Migration live" — dieser
Unterschied hat im Repository bereits zu falschen Statusmeldungen geführt und
ist deshalb ein eigener, verpflichtender Prüfschritt).

## 4. Qualitätstore

| Tor | Werkzeug | Was es verhindert |
|---|---|---|
| Fachlogik | `lib/coach/*.test.ts` (`npm run test:unit`) | Falsche Berechnungen, falsche Auswertung von Einwilligung, Freischaltung, zweitem Faktor |
| Produktgrenze | `lib/coach/produktgrenze.test.ts` | Erstattungs-/Zulassungsaussagen, ungeschützte Schreibrouten, DiPA-Oberflächen ohne Schalter |
| Zugriffsregeln | `supabase/shadow/50_pflegecoach_tests.sql` (68 Tests) | Fremdzugriff, Admin-Zugriff auf Produktdaten, Selbst-Freischaltung, Pseudonym-Orakel |
| Exportformat | `lib/coach/export.test.ts`, `lib/coach/fhir.test.ts` | Abweichung vom veröffentlichten Schema, unbelegte Profil-/Terminologie-Behauptungen |
| Oberfläche | `e2e/pflegecoach.spec.ts` | Nicht erreichbare Seiten, fehlender Zugangsschutz, Tracker im Produktbereich, Barrierefreiheits-Strukturmängel |
| Typprüfung | `npm run typecheck` | Formfehler, die erst im Betrieb auffallen würden |
| Auslieferung | `./deploy.sh` (Secret-Guard, Push-Verifikation) | Geheimnisse im Repository, geglaubte statt tatsächliche Auslieferung |

**Grenze dieser Tore, ausdrücklich:** Sie prüfen Regeln, die selbst gesetzt
wurden. Ob diese Regeln den regulatorischen Anforderungen entsprechen, prüft
kein Test — das ist Matrix-Punkt REG-01 und offen.

## 5. Fehler- und Vorkommnisbehandlung

| Schweregrad | Definition | Reaktion |
|---|---|---|
| P0 | Gesundheitsdaten sind fremdzugänglich, oder das Produkt macht eine unzulässige Zusage | Sofort: Ursache beheben oder betroffene Funktion abschalten (Fail-Closed-Schalter, siehe §6). Danach Eintrag in die Risikoakte. |
| P1 | Kernfunktion für Nutzer unbrauchbar | Innerhalb eines Arbeitstages beheben |
| P2 | Einschränkung mit Umweg | Im nächsten Release |
| P3 | Kosmetik, Text | Gesammelt |

Alle P0- und P1-Ereignisse werden in `audit/dipa/risikoakte_pflegecoach.md`
aufgenommen — auch nach Behebung.

**Explizit offen (nicht Teil dieses QMS):** Ein Meldeweg gegenüber einer
Behörde ist bewusst nicht beschrieben — siehe
`docs/dipa/08_INCIDENT_VULNERABILITY_PROZESS.md`.

## 6. Beherrschte Abschaltung (Fail-Closed-Schalter)

Ein Merkmal dieses Produkts: Was regulatorisch nicht geklärt ist, läuft
nicht — per Voreinstellung, nicht per Disziplin.

| Schalter | Voreinstellung | Was er sperrt |
|---|---|---|
| `COACH_DIPA_MODUS` | aus | Anspruchsprüfung, Kostenträgerbezug, Abrechnungsoberflächen |
| `COACH_FREISCHALTUNG_PFLICHT` | aus | Zugangsverfahren über Freischaltcode |
| `COACH_NUTZUNGSNACHWEIS_AKTIV` | aus | Erhebung pseudonymer Nutzungsereignisse |
| `COACH_MFA_PFLICHT` | aus | Pflicht zum zweiten Faktor (freiwillige Nutzung bleibt möglich) |
| `COACH_PREISE_FREIGEGEBEN` | aus | gesamter Bestellweg, solange kein Preis kaufmännisch entschieden ist |

Jeder Schalter ist so gebaut, dass die *sichere* Stellung die Voreinstellung
ist. Fällt eine Prüfung aus, wird nicht geschrieben — gilt für Einwilligung,
Freischaltung, zweiten Faktor und Preisfreigabe gleichermaßen.
`COACH_DIPA_MODUS` bleibt `false`, bis eine tatsächliche Aufnahme ins
DiPA-Verzeichnis vorliegt; das wird hier nicht in Frage gestellt.

## 7. Verweise innerhalb der Quellunterlagen

| Thema | Dokument |
|---|---|
| Risiken mit Bewertung | `audit/dipa/risikoakte_pflegecoach.md` |
| Risikoanalyse (Ausgangsfassung) | `audit/dipa/risikoanalyse_pflegecoach.md` |
| Lebenszyklus, Versionierung, Wartung | `audit/dipa/software_lebenszyklus_pflegecoach.md` |
| Technische Dokumentation | `audit/dipa/technische_dokumentation_pflegecoach.md` |
| Sicherheitsarchitektur | `audit/dipa/sicherheitsarchitektur_pflegecoach.md` |
| Änderungshistorie | `audit/dipa/CHANGELOG_pflegecoach.md` |
| Gesamtstand der Anforderungen | `docs/DIPA_MATRIX_FINAL.md` |

## 8. Was diesem QMS zur Auditfähigkeit fehlt — EXTERN_BENÖTIGT

Vollständig und ohne Beschönigung, aus `audit/dipa/qms_handbuch_pflegecoach.md`
§9:

1. **Externe Auditierung — EXTERN_BENÖTIGT.** Niemand von außen hat dieses
   System geprüft.
2. **Managementbewertung** — kein turnusmäßiger Review-Termin etabliert
   (intern machbar).
3. **Lieferantenbewertung — EXTERN_BENÖTIGT.** Die Auftragsverarbeiter-Kette
   ist nicht vertraglich dokumentiert (Matrix-Punkt DS-04); ohne sie ist keine
   Bewertung möglich.
4. **Schulungsnachweise** — nicht geführt (intern machbar).
5. **Wiederanlaufprüfung** — die Rücksicherung aus einem Backup ist nie
   erprobt worden (intern machbar; siehe `docs/dipa/09_BACKUP_RESTORE_DOKUMENTATION.md`).
6. **Freigabekennzeichnung je Dokument** — siehe §2 (intern machbar).

Für eine externe Zertifizierung nach ISO 27001 oder vergleichbarer Norm
(Informationssicherheits-Managementsystem) besteht darüber hinaus noch **kein
festgelegter Geltungsbereich** und **keine Sicherheitsleitlinie** — siehe
`audit/dipa/isms_scope_vorbereitung.md`. Dort sind drei mögliche Geltungsbereiche
bewertet (Produkt / Produkt + gemeinsame Infrastruktur / gesamtes Unternehmen),
der Bestand nach 13 Themenfeldern erhoben und die fünf größten Lücken benannt
(keine Sicherheitsleitlinie, keine erprobte Rücksicherung, keine personellen
Regelungen, keine Lieferantenverträge, keine Auswertung/Alarmierung des
Zugriffsprotokolls). Punkte 1–3 dieser Liste hängen an externen Beauftragungen,
Punkte 4–6 sind intern lösbar.

**EXTERN_BENÖTIGT — zusammengefasst:** Externe Auditierung, Lieferantenbewertung
(Verträge), Zertifizierungsberatung/-Audit selbst (ISO 27001 o. ä.), Klärung des
ISMS-Geltungsbereichs mit dem BfArM.

---

## Quellen

- `audit/dipa/qms_handbuch_pflegecoach.md`
- `audit/dipa/isms_scope_vorbereitung.md`
- `docs/DIPA_MATRIX_FINAL.md` (Abschnitt 9 "QMS, Risikomanagement, Betrieb")
