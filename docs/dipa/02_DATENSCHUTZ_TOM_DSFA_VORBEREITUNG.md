# Technische und organisatorische Maßnahmen (TOM) & DSFA-Vorbereitungsstand — Digitaler PflegeCoach

**Stand:** 2026-08-14
**Zweck:** Konsolidierter Nachweis der technisch-organisatorischen Maßnahmen des DiPA-Moduls (Verschlüsselung, Zugriffskontrolle, Löschung, Audit) sowie ehrlicher Stand der Datenschutz-Folgenabschätzung (DSFA) — als Grundlage für eine externe Prüfung, nicht als deren Ersatz.

---

## 1. Einordnung

Dieses Dokument fasst vier Einzelkonzepte zu einem TOM-Überblick zusammen und
hält getrennt fest, was davon **umgesetzt und im Code nachweisbar** ist und was
**eine externe Bewertung voraussetzt**. Es erfindet keine neuen Maßnahmen und
keine neuen Fristen — jede Aussage stammt aus den verlinkten Quellen.

Betroffen ist ausschließlich das DiPA-Produkt (`coach_*`-Tabellen), nicht der
Betriebsteil der Plattform.

---

## 2. TOM-Übersicht

### 2.1 Verschlüsselung (Quelle: `audit/dipa/verschluesselungskonzept.md`)

| Bereich | Zustand | Beleg |
|---|---|---|
| Transport Browser ↔ Anwendung | **umgesetzt** | HTTPS/TLS über die Hosting-Plattform, HTTP wird umgeleitet |
| Transport Anwendung ↔ Datenbank | **umgesetzt** | TLS-gesicherte Verbindung |
| HSTS / sichere Cookie-Attribute | **zu verifizieren** | plattform-/konfigurationsabhängig, vor Antrag im Original prüfen |
| Ruhezustand (Datenbank, Backups) | **konfigurationsabhängig** | Zusicherung des Datenbankbetreibers, im AVV nachzuweisen (DS-04, offen) |
| Dateiablage | nicht genutzt | PflegeCoach speichert keine Dateien |
| Client-Speicher (Browser) | nur Darstellungseinstellungen | `localStorage`: Schriftgrad/Kontrast, **keine** Gesundheitsdaten |
| Pseudonymisierung der Auswertungsdaten | **umgesetzt** | HMAC-SHA256 über die auth-User-ID; Schlüssel `coach_pseudonym_key` ohne jede Policy und ohne Grants — für niemanden lesbar, nur über `SECURITY DEFINER`-Funktionen |
| Freischaltcodes | **umgesetzt** | nie im Klartext, SHA-256 mit serverseitigem Pfeffer `COACH_CODE_PEPPER` |

**Echte Ende-zu-Ende-Verschlüsselung ist bewusst nicht umgesetzt.** Begründung
(vollständig in `audit/dipa/verschluesselungskonzept.md` §5): Sie würde die
Freigabefunktion an Angehörige, serverseitige Auswertung, Passwort-Reset ohne
Datenverlust und Mehrgeräte-Zugang für eine teils hochbetagte Zielgruppe
brechen. Stattdessen: Verteidigung in der Tiefe über RLS, Produkttrennung
(keine Admin-Policies), Grant-Entzug für `anon`, Pseudonymisierung und
append-only-Audit. Ob eine Zulassung ausdrücklich E2E fordert, ist offen
(gehört zu SEC-01/TR-03161).

### 2.2 Zugriffskontrolle / RLS (Quelle: `audit/dipa/rollen_rechtekonzept.md`)

* **Grundsatz:** Die Datenbank ist die Zugriffswahrheit, nicht die Anwendung.
  Jede Produktroute nutzt den Session-Client (`lib/coach/api-auth.ts`) — nie
  `service_role`. Was Row Level Security nicht erlaubt, kommt auch bei einem
  Programmierfehler in der Anwendung nicht heraus.
* **Es gibt keine Rolle, die alles sehen darf.** Kein Administrator, kein
  Support, kein Betriebskonto hat Lesezugriff auf Gesundheitsdaten — durch das
  Fehlen jeder entsprechenden Policy, nicht durch eine Vereinbarung. Details
  und die vollständige Rechtematrix je Tabelle: `docs/dipa/04_ROLLEN_RECHTE_MATRIX.md`.
* `anon` ist auf Grant-Ebene vollständig von `coach_*` entzogen (`REVOKE ALL … FROM anon`) — nicht nur über Policies.
* Nachweis: `supabase/shadow/50_pflegecoach_tests.sql`, **68/68 Prüfungen bestanden (Stand 14.08.2026)**.

### 2.3 Löschkonzept (Quelle: `audit/dipa/loeschkonzept.md`)

| Weg | Auslöser | Umfang |
|---|---|---|
| A — Produktlöschung | Nutzer löscht PflegeCoach-Daten | alle `coach_*`-Daten via `ON DELETE CASCADE` ab `coach_users`; Konto bleibt |
| B — Kontolöschung | Nutzer löscht Alltagsengel-Konto | zusätzlich der auth-Account, `coach_users` fällt über `ON DELETE CASCADE` auf `auth.users` |
| C — Einwilligungswiderruf | Widerruf `wissenschaftliche_auswertung` | Erfassung neuer Nachweisdaten endet sofort |

Löschung erfolgt **sofort, synchron**, ohne Warteschlange. Bleibt bewusst
bestehen: `coach_audit_log`-Metadaten (keine Werte), Status „eingelöst" von
Freischaltcodes (Missbrauchsschutz, nur HMAC-Pseudonym), `eul_erbringungen`
(Betriebsdaten). Der Pseudonym-Schlüssel (`coach_pseudonym_key`) ist zugleich
das schärfste Anonymisierungswerkzeug: seine Löschung macht alle bestehenden
Pseudonyme dauerhaft nicht mehr zuordenbar.

**Aufbewahrungsfristen:** Für die DiPA-Gesundheitsdaten selbst ist **keine**
gesetzliche Aufbewahrungsfrist bekannt, die eine Löschung hindern würde — der
PflegeCoach ist keine Pflegedokumentation eines Leistungserbringers und keine
Buchführung. Die Dauer der Backup-Aufbewahrung beim Betreiber ist **zu
verifizieren** und gehört ins AVV-Dossier (DS-04, offen).

### 2.4 Audit-Log (Quelle: `coach_audit_log`, siehe `docs/dipa/10_LOGGING_AUDIT_KONZEPT.md`)

Append-only-Protokoll über Datenbank-Trigger (`coach_audit_trigger()`,
`SECURITY DEFINER`) auf allen elf nutzer-eigenen Tabellen. Protokolliert wird
**wer, wann, welche Zeile, welche Tabelle, welche Aktion, welche Feldnamen** —
ausdrücklich **keine Datenwerte**, um keine Zweitkopie der Gesundheitsdaten zu
erzeugen. Nur die betroffene Person selbst kann ihre eigenen Einträge lesen;
Schreiben ist ausschließlich dem Trigger vorbehalten (Policy fehlt **und**
Grants sind entzogen). Details: `docs/dipa/10_LOGGING_AUDIT_KONZEPT.md`.

### 2.5 Zweiter Faktor (Ergänzung, Quelle: `lib/coach/mfa.ts`)

Seit 14.08.2026 als weitere TOM umgesetzt: TOTP-basierter zweiter Faktor,
serverseitig durchgesetzt für Schreibzugriffe bei Nutzern mit eingerichtetem
Faktor. Details: `docs/dipa/11_MFA_DOKUMENTATION.md`. Zum Stand der oben
zitierten Konzeptdokumente (12./13.08.2026) war dies noch als GAP-MFA offen —
der Punkt ist seither geschlossen (DiPA-Matrix SEC-03).

---

## 3. DSFA-Vorbereitungsstand

**Quelle:** `audit/dipa/dsfa_pflegecoach.md`, Stand 2026-08-12, Status
**VORBEREITUNG, nicht abgeschlossen**.

> **Explizite Feststellung dieses Dokuments:** Es liegt **keine** durchgeführte
> oder abgenommene Datenschutz-Folgenabschätzung nach Art. 35 DSGVO vor. Die
> DiPA-Matrix führt DS-02 als Klasse **D**, Status **EXTERN**. Das ist eine
> **EXTERN_BENÖTIGT**-Position: Eine DSFA ist vom Verantwortlichen unter
> Einbeziehung einer Datenschutzberatung/eines Datenschutzbeauftragten
> durchzuführen; die Bewertung von Eintrittswahrscheinlichkeit und Schwere ist
> eine rechtliche Entscheidung, keine technische Ableitung.

### 3.1 Was das Vorbereitungsdokument bereits belastbar feststellt

* Rechtsgrundlage: ausdrückliche Einwilligung, Art. 9 Abs. 2 lit. a i. V. m.
  Art. 6 Abs. 1 lit. a DSGVO.
* Verarbeitete Datenkategorien vollständig aufgeführt (Stammdaten,
  Selbsteinschätzungen, Ziele/Alltag, Fragebogenergebnisse, Berichte,
  Berechtigung, Auswertung, Protokoll) — siehe auch
  `docs/dipa/03_VERZEICHNIS_VERARBEITUNGSTAETIGKEITEN.md`.
* Ausdrücklich **nicht** verarbeitet: Vitalparameter, Sensordaten, Diagnosen,
  Medikationspläne mit Dosierlogik, Standortdaten, Kommunikationsinhalte mit
  Ärzten.
* Neun benannte Risiken (R1–R9) mit jeweils umgesetzter Maßnahme und
  Restrisiko-Einschätzung (siehe 3.3).

### 3.2 Was ausdrücklich **[zu bewerten]** bleibt (Feldbezeichnung aus der Quelle übernommen)

* Ob die Pflicht zur DSFA nach Art. 35 Abs. 3 lit. b DSGVO tatsächlich greift.
* Drittlandtransfer — abhängig von der Regionswahl der eingesetzten Dienste.
* Kopplungsverbot — Zulässigkeit der Art.-9-Einwilligung als
  Nutzungsvoraussetzung ohne andere Rechtsgrundlage.
* Bewertung von Eintrittswahrscheinlichkeit × Schwere für alle Risiken.
* Ob der technisch weiterhin mögliche Zugriff eines Datenbank-Superusers
  akzeptabel ist (R2).

### 3.3 Risikotabelle (unverändert aus der Quelle übernommen)

| # | Risiko | Umgesetzte Maßnahme | Restrisiko |
|---|---|---|---|
| R1 | Unbefugter Zugriff durch andere Nutzer | RLS als einzige Zugriffswahrheit, mit Rollen-/Rechte-Tests belegt | gering |
| R2 | Einsichtnahme durch eigene Administratoren | Keine Admin-Policies auf `coach_*` | gering, aber: Datenbank-Superuser bleibt technisch möglich — **[zu bewerten]** |
| R3 | Re-Identifikation aus Auswertungsdaten | HMAC-Pseudonym mit nicht lesbarem Schlüssel, keine Zeitstempel, Unterdrückung kleiner Gruppen | gering |
| R4 | Kompromittierte Zugangsdaten | Zum Zeitpunkt der DSFA-Vorbereitung (12.08.) als „hoch, MFA fehlt" geführt | **inzwischen adressiert** — TOTP seit 14.08.2026 umgesetzt (siehe 2.5); Neubewertung durch DSFA steht noch aus |
| R5 | Zweckentfremdung für Vermittlung/Werbung | Keine Tracker im Produktpfad, kein Buchungsweg aus dem Produkt heraus | gering |
| R6 | Unbeabsichtigte Weitergabe über Freigaben | Freigabe nur lesend, jederzeit widerruflich | gering; Verwaltungs-UI für Freigaben fehlt noch (GAP-SHARES-UI) |
| R7 | Datenverlust durch Löschung | Export vor Löschung angeboten, Bestätigungswort erforderlich | gering |
| R8 | Fehlgebrauch der Inhalte als medizinischer Rat | Statische Hinweise, Verbotsliste, Notfallhinweis | **[zu bewerten]** — hängt an der pflegefachlichen Freigabe (QI-01, größtes Produktrisiko lt. DiPA-Matrix) |
| R9 | Gemeinsame Infrastruktur mit dem Betriebsteil | Tabellen-, RLS- und Pfadtrennung | mittel (GAP-TRENNUNG) |

### 3.4 Was zum Abschluss der DSFA fehlt (unverändert aus der Quelle)

1. Beteiligung und Stellungnahme der Datenschutzberatung.
2. Bewertung aller **[zu bewerten]**-Felder.
3. Juristische Prüfung der Einwilligungstexte und Datenschutzhinweise (aktuell Entwurf).
4. AVV-Dossier der eingesetzten Auftragsverarbeiter, produktbezogen (`audit/dipa/avv_dossier_pflegecoach.md`).
5. Entscheidung zur Infrastrukturtrennung (GAP-TRENNUNG).
6. Datum, Unterschrift, Festlegung des Überprüfungsintervalls.

> Solange Punkt 1–3 offen sind, ist die DSFA-Vorbereitung **keine** abgeschlossene
> DSFA und darf nicht als solche gegenüber Dritten (BfArM, Prüfstellen) verwendet
> werden.

---

## 4. Zusammenfassung: Status je Punkt

| Punkt | Status | Klasse (DiPA-Matrix) |
|---|---|---|
| Verschlüsselung Transport | ERLEDIGT | A (SEC-02) |
| Verschlüsselung Ruhezustand | konfigurationsabhängig, zu verifizieren | A (SEC-02, verifizieren im Rahmen SEC-01) |
| RLS/Zugriffskontrolle | ERLEDIGT, 68/68 Tests | A (SEC-06) |
| Löschkonzept technisch umgesetzt | ERLEDIGT | A (DS-03) |
| Audit-Log | ERLEDIGT | A (SEC-07); Auswertung/Alarmierung offen |
| Zweiter Faktor | ERLEDIGT (14.08.2026) | B (SEC-03) |
| **DSFA (Art. 35)** | **NICHT durchgeführt/abgenommen — Vorbereitung nur** | **D, EXTERN_BENÖTIGT (DS-02)** |
| AVV-Kette | Kette erhoben, Verträge fehlen | D, EXTERN_BENÖTIGT (DS-04) |
| TR-03161-Zertifikat | kein Zertifikat, keine Prüfstelle beauftragt | D, EXTERN_BENÖTIGT (SEC-01) |

---

## Quellen

* `audit/dipa/verschluesselungskonzept.md`
* `audit/dipa/rollen_rechtekonzept.md`
* `audit/dipa/loeschkonzept.md`
* `audit/dipa/dsfa_pflegecoach.md`
* `audit/dipa/avv_dossier_pflegecoach.md`
* `lib/coach/mfa.ts`, `lib/coach/api-auth.ts`
* `supabase/migrations/20260819010000_pflegecoach_dipa_modul.sql`, `20260826010000_dipa_freischaltung_nachweise_eul.sql`
* `supabase/shadow/50_pflegecoach_tests.sql`
* `docs/DIPA_MATRIX_FINAL.md` (DS-01 bis DS-07, SEC-01 bis SEC-08)
* `docs/dipa/04_ROLLEN_RECHTE_MATRIX.md`, `docs/dipa/10_LOGGING_AUDIT_KONZEPT.md`, `docs/dipa/11_MFA_DOKUMENTATION.md`
