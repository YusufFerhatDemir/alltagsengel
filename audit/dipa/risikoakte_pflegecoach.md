# Risikoakte — Digitaler PflegeCoach

**Produkt:** Digitaler PflegeCoach · **Version:** 0.5.0 · **Stand:** 2026-08-14
**Deckt ab:** DiPA-Matrix QMS-01 (Risikoakte), QMS-02 (Bewertung)
**Grundlage:** `audit/dipa/risikoanalyse_pflegecoach.md` (Identifikation)

---

## 0. Verhältnis zur Risikoanalyse

Die Risikoanalyse **benennt** Risiken und Maßnahmen. Sie führte bis heute
jedes Risiko im Status „offen" — auch dort, wo die Maßnahme längst greift.
Diese Akte ergänzt das Fehlende: **Bewertung vor und nach der Maßnahme,
Restrisiko, Verantwortung, Wiedervorlage.**

Beide Dokumente bleiben nebeneinander bestehen. Die Analyse ist die
Aufnahme, die Akte die Führung.

## 1. Bewertungsmaßstab

Bewertet wird in zwei Größen, je dreistufig. Absichtlich grob: Eine
feinere Skala täuscht eine Genauigkeit vor, die es bei diesen Risiken nicht
gibt.

**Eintritt:** selten (S) · gelegentlich (G) · häufig (H)
**Auswirkung:** gering (1) · spürbar (2) · schwer (3)

| | 1 gering | 2 spürbar | 3 schwer |
|---|---|---|---|
| **H häufig** | mittel | hoch | **kritisch** |
| **G gelegentlich** | niedrig | mittel | hoch |
| **S selten** | niedrig | niedrig | mittel |

**Akzeptanzregel:** „kritisch" wird nicht ausgeliefert. „hoch" wird nur mit
schriftlicher Begründung und Wiedervorlagetermin getragen. Alles darunter
gilt als getragen, bleibt aber in der Akte.

Für „Auswirkung" ist stets die Sicht der pflegebedürftigen Person maßgeblich,
nicht die des Unternehmens.

## 2. Nutzungsrisiken

| Nr. | Risiko | Vorher | Maßnahme (Nachweis) | Nachher | Verantwortung |
|---|---|---|---|---|---|
| R1.1 | Produkt wird als medizinische Beratung missverstanden | G3 hoch | Zweckbestimmung + Negativabgrenzung beim Einstieg und in jeder Fußzeile; Notrufhinweis; Verbotsliste in `lib/coach/empfehlungen.ts`; E2E-Test prüft den ausgelieferten Text | S3 mittel | Produkt |
| R1.2 | Ärztliche Hilfe wird verzögert in Anspruch genommen | G3 hoch | Keine automatische Deutung von Messwerten; Rohantworten + Summe ohne Bewertung; ausdrücklicher Hinweis auf jeder Mess-Seite | S3 mittel | Produkt |
| R1.3 | Verletzung bei Bewegungsübungen | G2 mittel | Nur niedrigschwellige Alltagsübungen, je Übung ein eigener Sicherheitshinweis (`lib/coach/inhalte.ts`) | S2 niedrig | Fachlich |
| R1.4 | Fachlich unzutreffende Inhalte | **H3 kritisch** | Alle Inhalte tragen `pruefstatus: 'entwurf'`, im Produkt sichtbar als Entwurfs-Hinweis. **Die Freigabe fehlt** (QI-01) | **G3 hoch** | Fachlich — offen |
| R1.5 | Menschen mit Seh-/Motorikeinschränkung können nicht bedienen | G3 hoch | Drei Schriftgrade (serverseitig gespeichert), Kontrastmodus, Sprungmarke, Tastaturbedienung, Zielgrößen ≥ 44 px (E2E-geprüft), `prefers-reduced-motion` | G2 mittel | Technik — externer Test offen (BF-01) |

**R1.4 ist das höchste getragene Risiko des Produkts.** Es ist nicht technisch
lösbar. Die Minderung besteht heute allein aus Transparenz: Der Nutzer sieht,
dass der Inhalt ein Entwurf ist. Vollständig gemindert ist es erst mit der
pflegefachlichen Freigabe.

## 3. Datenschutzrisiken

| Nr. | Risiko | Vorher | Maßnahme (Nachweis) | Nachher | Verantwortung |
|---|---|---|---|---|---|
| R2.1 | Fremdzugriff auf Gesundheitsdaten | H3 kritisch | Zeilenfilter auf allen `coach_*`-Tabellen; ausschließlich Session-Client; 68 Zugriffstests (`supabase/shadow/50_pflegecoach_tests.sql`, alle bestanden am 14.08.2026) | S3 mittel | Technik |
| R2.2 | Einsicht durch eigene Administration | G3 hoch | Für `coach_*` existiert **keine** Admin-Policy; kein `service_role` im Produktpfad; Test P3 belegt es | S3 mittel | Technik |
| R2.3 | Verarbeitung ohne wirksame Einwilligung | G3 hoch | Einwilligung im Onboarding erzwungen, versioniert, widerrufbar; Schreibsperre bei Widerruf, fail-closed bei Prüffehler | S3 mittel | Technik |
| R2.4 | Auswertung ohne Einwilligung | G3 hoch | Doppelte Sperre: Schalter **und** individuelle Einwilligung | S3 mittel | Technik |
| R2.5 | Re-Identifikation aus Auswertungsdaten | G3 hoch | HMAC-Pseudonym aus unlesbarem Schlüsselbestand; kein Zeitstempel, keine Inhalte, kein Fremdschlüssel; Test P9 belegt: Schlüssel unlesbar, Pseudonym-Funktion für Nutzer gesperrt | S3 mittel | Technik |
| R2.6 | Zweitkopie der Daten im Protokoll | G2 mittel | `coach_audit_log` speichert nur Metadaten; Test P7 prüft die Abwesenheit von Wertespalten | S1 niedrig | Technik |
| R2.7 | Daten bleiben nach Widerspruch bestehen | G3 hoch | Produktbezogene Löschung ohne Kontoverlust; Kaskade ab `coach_users`. **Offen:** Regelaufbewahrungsfristen | S3 mittel | Technik — Frist offen (DS-03) |
| R2.8 | Ungewollte Weitergabe an Angehörige | G2 mittel | Freigabe nur auf aktive Veranlassung, jederzeit widerrufbar; Test P5 prüft: nur lesend, Widerruf wirkt sofort | S2 niedrig | Technik |
| R2.9 | Auftragsverarbeiter-Kette unbekannt | **G3 hoch** | Gerüst und Prüfliste liegen vor (`audit/dipa/avv_dossier_pflegecoach.md`), **die Verträge und Unterauftragnehmerlisten fehlen** | **G3 hoch** | Geschäftsführung — offen (DS-04) |

## 4. Technische Sicherheitsrisiken

| Nr. | Risiko | Vorher | Maßnahme (Nachweis) | Nachher | Verantwortung |
|---|---|---|---|---|---|
| R3.1 | Kontoübernahme über gestohlenes Passwort | H3 kritisch | **Neu am 14.08.2026:** zweiter Faktor (TOTP) einrichtbar unter `/pflegecoach/einstellungen/sicherheit`; serverseitig durchgesetzt — wer einen Faktor hat, schreibt ohne bestätigten Code nicht (`lib/coach/mfa.ts`, `lib/coach/api-auth.ts`) | G3 hoch | Technik |
| R3.2 | Unentdeckte Schwachstelle | G3 hoch | Interne Sicherheitsprüfung; Secret-Guard vor jedem Push; automatische Zugriffstests. **Offen:** kein externer Penetrationstest | G3 hoch | extern — offen (SEC-04) |
| R3.3 | Freischaltcodes werden entwendet oder erraten | S2 niedrig | Codes nie im Klartext gespeichert (SHA-256 mit Pfeffer); Klartext erscheint einmalig bei der Ausgabe | S2 niedrig | Technik |
| R3.4 | Datenverlust | S3 mittel | Sicherung durch die Datenbankplattform. **Offen:** Rücksicherung nie erprobt, kein produktbezogenes Wiederanlaufkonzept | S3 mittel | Technik — offen |
| R3.5 | Fehlerhafte Migration bricht das Produkt | G2 mittel | Zu jeder Migration ein Rollback-Skript; Code-Rollback über `scripts/rollback.sh`; Shadow-Datenbank baut das Schema aus dem Repository nach | S2 niedrig | Technik |

**Zu R3.1:** Das Restrisiko bleibt „hoch", obwohl der zweite Faktor gebaut
ist — denn er ist freiwillig. Wer ihn nicht einrichtet, ist genauso
geschützt wie zuvor. Die Bewertung ändert sich erst, wenn
`COACH_MFA_PFLICHT` aktiv ist; diese Entscheidung ist bewusst offen
(Begründung in `lib/coach/mfa.ts`: die Zielgruppe darf nicht ausgesperrt
werden).

## 5. Regulatorische Risiken

| Nr. | Risiko | Vorher | Maßnahme (Nachweis) | Nachher | Verantwortung |
|---|---|---|---|---|---|
| R4.1 | Produkt erweckt den Eindruck einer Erstattung | H3 kritisch | `COACH_DIPA_MODUS` aus; Anspruchsseite und -API antworten ohne Schalter nicht (E2E-Test prüft 404); keine Preis- oder Erstattungsaussage im Produkt; Strukturtest sperrt Regressionen | S3 mittel | Produkt |
| R4.2 | Abrechnung ohne Vergütungsvereinbarung | G3 hoch | `istAbrechnungsbereit()` fail-closed über `verguetung_geklaert`; keine Beträge im Code | S3 mittel | Technik |
| R4.3 | Funktionserweiterung überschreitet die Zweckbestimmung | G3 hoch | Eigene Produktversionierung; Änderungen an der Zweckbestimmung sind als MAJOR definiert und vor der Umsetzung zu bewerten | G2 mittel | Produkt |
| R4.4 | Werbung oder Cross-Selling im Produktbereich | G2 mittel | Tracker unter `/pflegecoach` technisch abgeschaltet; E2E-Test prüft die tatsächlich geladenen Hosts | S2 niedrig | Technik |
| R4.5 | Arbeitsfassungen werden für Verordnungstext gehalten | **H2 hoch** | `anforderungstextGeprueft` je Katalogeintrag; ungeprüfte Einträge zählen nicht als erfüllt; Vorbehalt im Kopf jeder Matrix | **G2 mittel** | Produkt — offen (REG-01) |
| R4.6 | Falscher Statusbericht: Migration gilt als live, ist es aber nicht | G2 mittel | **Neu:** Live-Apply-Bestätigung ist verpflichtender Schritt im Änderungsverfahren (QM-Handbuch §3); Shadow-Datenbank als Gegenprobe | S2 niedrig | Technik |

## 6. Zusammenfassung des Restrisikos

| Stufe | Anzahl | Welche |
|---|---|---|
| kritisch | 0 | — |
| hoch | 3 | R1.4 (Inhaltsfreigabe), R2.9 (AVV-Kette), R3.2 (Penetrationstest) |
| mittel | 11 | überwiegend Sockelrisiken mit greifender Maßnahme |
| niedrig | 5 | — |

**Alle drei „hoch"-Risiken sind nicht intern schließbar.** Sie brauchen eine
Pflegefachkraft, eine juristische Beauftragung und eine Sicherheitsprüfstelle.
Sie sind damit auch die drei Punkte, die den Zeitplan bestimmen — nicht die
Software.

**Getragen wird:** der aktuelle Betrieb als privat zu zahlendes Angebot
(Produkt A) mit sichtbarem Entwurfs-Hinweis auf allen Inhalten.
**Nicht getragen wird:** ein DiPA-Antrag im heutigen Stand — R1.4 und R2.9
müssen davor geschlossen sein.

## 7. Wiedervorlage

| Anlass | Was zu prüfen ist |
|---|---|
| Jede MINOR- oder MAJOR-Version | Sind neue Risiken entstanden? Gilt jede Bewertung noch? |
| Nach jedem P0/P1-Vorfall | Vorfall aufnehmen, Bewertung des betroffenen Risikos neu ansetzen |
| Nach jeder externen Prüfung | Befunde übernehmen, Restrisiken neu bewerten |
| Spätestens halbjährlich | Vollständige Durchsicht |

Es ist noch keine Wiedervorlage durchlaufen worden; diese Akte ist die
Erstfassung.
