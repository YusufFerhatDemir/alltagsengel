# Go-Live-Phase — Konsolidierter Abschlussbericht

**Stand:** 14.08.2026 · **Commit:** `848dcf2` · **Grundlage:** Konsolidierung von 6 parallelen
Entwicklungs-Streams (112 Dateien), gemessen gegen die Produktionsdatenbank

---

## Lesart: fünf Stufen, die nicht dasselbe sind

Dieser Bericht unterscheidet konsequent zwischen fünf Zuständen. Der häufigste Irrtum in
Statusberichten ist, A für E zu halten — „ist gebaut" heißt nicht „bringt Geld".

| Stufe | Bedeutung |
|---|---|
| **A — technisch implementiert** | Der Code existiert und ist vollständig. |
| **B — intern getestet** | Automatisierte Tests laufen grün; Verhalten intern geprüft. |
| **C — Production deployed** | Auf `alltagsengel.care` ausgeliefert und erreichbar. |
| **D — extern zertifiziert/genehmigt** | Ein Dritter (ITSG, GKV-SV, BfArM, gematik, Bundesbank) hat etwas erteilt. |
| **E — tatsächlich abrechnungsfähig** | Eine echte Forderung kann gestellt und bezahlt werden. |

**A + B + C ohne D ergibt niemals E.** Kein Deploy der Welt ersetzt eine externe Freigabe.

---

## 1. Pflege-Software: Status

**A ✅ · B ✅ · C ✅ · E ✅ (für den Selbstzahler-Weg)**

Der operative Kern ist vollständig und produktiv: Kundenverwaltung, Einsatzplanung,
Tourenplanung, Dienstplan, Leistungsnachweise mit Signatur, Pflegedokumentation (SIS,
Wunddoku, Vitalwerte, Medikamentenmanagement), Rechnungsstellung, OPOS, Mahnwesen und
DATEV-Übergabe.

Gemessen an der Produktionsdatenbank am 14.08.2026:

| Prüfung | Wert |
|---|---|
| Verifizierte Privattarife | 10 von 10 |
| Klienten angelegt | 4 |
| Einsätze dokumentiert | 30 |
| Rechnungen erzeugt | 5 |
| Gesetzliche Budgetwerte 2026 | hinterlegt (ab 01.01.2025, offenes Ende) |

**Neu in dieser Phase:** Dienstübergabe-Modul (`/admin/uebergaben`) mit Schichtprotokollen,
Übergabepunkten und Kenntnisnahme-Nachweis — die Lücke, die der MD unter
Informationsweitergabe (§ 113 SGB XI) prüft. **Einschränkung: Stufe C ist für dieses Modul
noch nicht erreicht** — siehe Punkt 8, die Tabellen fehlen in Production.

Die zentrale Statusansicht ist neu: **`/admin/go-live`** misst 11 Bereiche mit über 20
Live-Abfragen gegen die echte Datenbank plus Env-Prüfungen. Nichts daran ist hartkodiert;
nicht ausführbare Prüfungen zählen als *nicht erfüllt*, nie als erfüllt.

Aktueller Gesamtstand: **READY 3 · EXTERNAL 4 · BLOCKED 4** (von 11 Bereichen).

---

## 2. Echtbetrieb mit realem Kunden möglich: **JA** — für Selbstzahler

**Begründung.** Die vollständige Kette vom Kunden bis zur bezahlten Rechnung ist implementiert,
getestet und deployed. Die Betriebs-Checkliste unter `/admin/pilot` prüft 13 Schritte je Kunde:

`Kunde → Pflegegrad → Budget → Betreuungskraft → Termin → Leistungsnachweis → Signaturen →
Freigabe → Rechnung → PDF → Zahlungseingang → OPOS → DATEV`

**Was einschränkend gesagt werden muss:** Die Kette ist noch nie mit einem echten Kunden bis
zum Ende durchlaufen worden. Der am weitesten fortgeschrittene Datensatz in der
Produktionsdatenbank (*Ingrid Bauer*) steht bei **6 von 13 Schritten**; die übrigen drei bei 3
bis 4. Der Pilot-Voraussetzungscheck steht auf **rot**, `echtbetriebFreigegeben: false` — im
Wesentlichen wegen der Datenhygiene-Punkte aus Punkt 9.

Das ist kein technischer Blocker, sondern ein **Nutzungsblocker**: Es fehlt der erste reale
Durchlauf, nicht die Funktion. Der Weg ist ohne Codeänderung begehbar; `/admin/pilot` benennt
je Kunde den konkret nächsten Schritt.

**Nicht möglich im Echtbetrieb:** SEPA-Lastschrifteinzug (Punkt 12), Kassenabrechnung
(Punkte 4 und 5).

---

## 3. Privatabrechnung möglich: **JA**

**A ✅ · B ✅ · C ✅ · E ✅**

Rechnung an Selbstzahler ist der einzige Abrechnungsweg, der heute vollständig funktioniert.

| Prüfung | Ergebnis |
|---|---|
| Verifizierte Privattarife | 10 verifiziert |
| Rechnungen mit Fälligkeitsdatum | 0 ohne `due_date` |
| Absenderdaten Briefkopf | Alltagsengel UG · IK 460629986 |
| Bankverbindung | gesetzt |

PDF-Erzeugung nutzt DejaVuSans (Umlaute korrekt). Fortlaufende Rechnungsnummern, OPOS-Führung,
Mahnlauf und DATEV-Export hängen daran und funktionieren.

**Einschränkung:** Bezahlt wird per Überweisung. **Lastschrift ist gesperrt** — die
SEPA-Gläubiger-ID ist ein Platzhalter (`DE98ZZZ09999999999`). Die Sperre sitzt bewusst tief:
`pruefeGlaeubigerIdOderWerfe()` wirft direkt in `pain008.ts`, der einzigen Stelle, an der eine
einziehbare Datei entsteht. Ein künftiger Aufrufer kann sie nicht versehentlich umgehen.

**§ 45b Entlastungsbetrag** (131 €/Monat, 1.572 €/Jahr) ist als gesetzlicher Wert korrekt
hinterlegt, aber **nur 1 von 9 Tarifen ist verifiziert; 8 sind fail-closed gesperrt** — darunter
die 35 €/h-Sätze. Diese Sperre ist gewollt und bleibt bestehen, bis ein Primärbeleg vorliegt
(Anerkennungsbescheid nach § 45a SGB XI bzw. Vergütungsvereinbarung). Preise werden nicht
geraten und nicht automatisch gesetzt.

**VP/KZP (§§ 39, 42 SGB XI):** gesetzliche Werte hinterlegt (VP 1.685 € · KZP 1.854 € ·
kombiniert 3.539 € ab PG 2), aber **0 von 4 Tarifen verifiziert** — ebenfalls gesperrt.

---

## 4. Pflegekassenabrechnung möglich: **NEIN**

**A ✅ · B ✅ · C ✅ · D ❌ · E ❌**

Die technische Kette ist gebaut und deployed: Abrechnungslauf, Datensatzerzeugung,
SECON-Verschlüsselung, SFTP-Transport mit Wiederhollogik, Versandprotokoll, Rückläufer-Verarbeitung,
Wiedervorlage-Dashboard und Dead-Letter-Queue. Neu in dieser Phase: **Betriebsmodus-Umschalter**
(Test-/Echtdatei-Indikator), **Zugangsmittel-Inventar** und **Dead-Letter-Sichtbarkeit**.

**Es fehlt ausschließlich, was Dritte erteilen müssen:**

| Externer Blocker | Zuständig | Stand |
|---|---|---|
| ITSG-Zertifikat (SECON-Absenderzertifikat) | ITSG Trust Center | keines hinterlegt |
| Zertifikatspasswort `SECON_ZERT_PASSWORT` | selbst zu vergeben beim Antrag | nicht gesetzt |
| Freigabe-Gate `ITSG_ZERTIFIZIERT` | wir, nach bestandener Testübertragung | nicht gesetzt |
| SFTP-Zugang bei einer Datenannahmestelle | Datenannahmestelle | 0 von 0 registriert |
| Bundesland für Kassenabrechnung freigeschaltet | wir, nach Vertragslage | 0 von 16 |
| Leistungskomplex-Preise verifiziert | Vergütungsvereinbarung | 0 von 24 |
| Aktive Kostenträger-Stammdaten | intern zu pflegen | 0 |

Solange `ITSG_ZERTIFIZIERT` nicht gesetzt ist, sendet der Kanal nichts — unabhängig davon, was
im Betriebsmodus steht. Der Dateiindikator steht ohne ausdrückliche Umschaltung auf `0`
(Testdatei); die Umschaltung auf Echtbetrieb verlangt zusätzlich einen belegten Testlauf mit
Datum und Referenz der Annahmestelle sowie die getippte Bestätigung `ECHTBETRIEB`.

**Ablaufbeschreibung:** `docs/KASSENABRECHNUNG_FREISCHALTUNG.md`

### § 302 SGB V (häusliche Krankenpflege): **NEIN**

Gerüst vorhanden, **Datensatz-Erzeugung absichtlich gesperrt**: Der Generator wirft
grundsätzlich, solange die Technische Anlage 1 nicht vorliegt. Segmentaufbau wird nicht aus
Sekundärquellen rekonstruiert — eine geratene Segmentstruktur produziert Ablehnungen und im
schlimmsten Fall falsche Forderungen. 3 Formatversionen hinterlegt, **keine bestätigt**;
Krankenkassen-Routing: 0 Einträge. Kein ITSG-Zertifikat, kein GKV-SV-Verfahren.

### KIM / Telematikinfrastruktur: **NEIN**

`KIM_AKTIV` nicht gesetzt, 0 Postfächer, 0 einsatzbereite SMC-B, Technische Anlage 5 nicht
bestätigt. Der Versand läuft auf einem **NULL_ADAPTER — jede Operation wirft**. Es gibt keinen
KIM-Provider-Vertrag, folglich ist bewusst kein Ablageort für Provider-Zugangsdaten vorgegeben.

---

## 5. DiPA technisch vorbereitet: **JA**

**A ✅ · B ✅ · C ✅**

Der PflegeCoach ist als Produkt vollständig: Assessment, Ziele, Aktivitäten, Wochenplan,
Mobilität, Belastung (Angehörige), Verlauf, Bericht, Anspruchsprüfung, Einstellungen,
Datenschutz und Löschung. In dieser Phase ergänzt: Einwilligungslogik (`lib/coach/consent.ts`),
Zustandsverwaltung, Seitentitel je Route, `error.tsx` und `not-found.tsx`.

Die DiPA-Dokumentation für ein BfArM-Verfahren liegt vor — 10 neue Dokumente unter `audit/dipa/`:
Produkt- und Funktionsbeschreibung, Datenflüsse, Datenschutzarchitektur, Sicherheitsarchitektur,
Rollen-/Rechtekonzept, Einwilligungslogik, Logging-/Auditkonzept, Exportfunktionen,
Pflegeprobleme/Pflegeziele, technische Dokumentation und Changelog.

Produktversion: **0.4.0**.

**Produktgrenze ist technisch durchgesetzt:** kein Admin-Zugriff auf `coach_*`-Tabellen, die
Brücke zur elektronischen Unterschrift ist einbahnig, `COACH_DIPA_MODUS` steht auf **`false`
(Default)** und der Produktbereich macht **keine Erstattungs- oder Preisaussage** — beides
maschinell geprüft.

---

## 6. DiPA BfArM-gelistet: **NEIN**

**D ❌ · E ❌ — es liegt keine BfArM-Listung vor.**

Ohne Listung ist der PflegeCoach **nicht kassenerstattungsfähig**. Es existiert kein Nachweis im
System, keine Vergütungsvereinbarung mit einer Pflegekasse, und `COACH_DIPA_MODUS` bleibt
ausgeschaltet. Diese Reihenfolge ist bindend: erst Listung, dann Erstattungsaussage — nicht
umgekehrt.

Extern zu beschaffen (Gap-Liste in `docs/DIPA_BFARM_READINESS.md`): DSFA-Freigabe, AV-Kette,
Penetrationstest, Sicherheitszertifikat, Barrierefreiheits-Audit, Nutzennachweis/Erprobung,
Software-QMS, FHIR-Mapping.

---

## 7. PflegeCoach normal verkaufbar: **JA**

**A ✅ · B ✅ · C ✅ · E ✅ (als Selbstzahler-Produkt)**

Als normaler, selbst bezahlter Service ist der PflegeCoach verkaufbar — genau deshalb, weil er
keine Erstattung behauptet. `/pflegecoach/start` antwortet in Production mit **HTTP 200**.

Die Grenze ist maschinell gesichert: Solange `COACH_DIPA_MODUS=false` gilt, ist der
DiPA-/Erstattungsbereich **nicht erreichbar**. Wer das Produkt kauft, kauft ein
Selbstzahler-Angebot ohne Kassenversprechen.

---

## 8. Noch offene P0-Fehler

**Ein P0, und er ist nicht durch Code lösbar.**

### P0-1 — Zwei Migrationen sind nicht auf Production angewendet

Der Code für **Dienstübergabe**, **Betriebsmodus**, **Zugangsmittel-Inventar** und
**Dead-Letter-Queue** ist deployed (Stufe C), aber die zugehörigen Tabellen existieren in der
Produktionsdatenbank **nicht**. Per PostgREST am 14.08.2026 verifiziert:

| Tabelle | Stand |
|---|---|
| `uebergabe_protokolle`, `uebergabe_punkte`, `uebergabe_kenntnisnahmen` | **fehlt (404)** |
| `abrechnung_betriebsmodus`, `abrechnung_betriebsmodus_historie` | **fehlt (404)** |
| `abrechnung_credential_rotationen`, `dta_dead_letter` | **fehlt (404)** |

**Auswirkung:** `/admin/uebergaben`, `/admin/kassenabrechnung/betrieb` und die
Dead-Letter-Ansicht zeigen einen Fehlerhinweis statt Daten. Die Seiten stürzen **nicht** ab —
alle sind Client-Komponenten mit Fehlerbanner, `/admin/go-live` behandelt nicht ausführbare
Prüfungen als „nicht prüfbar". Der übrige Betrieb ist nicht betroffen.

**Anzuwenden (in dieser Reihenfolge):**

1. `supabase/migrations/20260903000000_uebergabeprotokolle.sql`
2. `supabase/migrations/20260903010000_kassenabrechnung_betrieb.sql`

**Sicherheitsprüfung beider Migrationen: bestanden.** Beide sind idempotent
(`IF NOT EXISTS` durchgängig), laufen in einer Transaktion, aktivieren RLS auf **allen** neuen
Tabellen, setzen den RESTRICTIVE Org-Fence, sperren `anon` per `REVOKE` aus und setzen bei allen
Trigger-Funktionen `search_path` explizit. Rollback-Skripte liegen bei
(`…000001`, `…010001`). Die Audit-Constraint-Erweiterung in 20260903010000 ist idempotent und
deckungsgleich mit `AUDIT_ENTITY_TYPES` in `lib/billing/core/audit.ts` — geprüft durch
`__tests__/abrechnung/schema-konsistenz.test.ts`.

**Ein Befund wurde vor dem Apply korrigiert** (Commit dieses Berichts): In
20260903000000 waren zwei Lese-Policies als `auth.uid() IS NOT NULL` formuliert. Weil
`current_org_id()` für Nutzer ohne `organization_members`-Zeile auf die Stamm-Organisation
zurückfällt, hätte **jeder angemeldete Kunde** direkt gegen PostgREST die Protokollköpfe samt
Freitext-Zusammenfassung und die Kenntnisnahmen lesen können. Die API sperrt Kunden bereits über
die Rolle aus (`lib/uebergabe/api-auth.ts`) — die Policy war die einzige Sperre am direkten
REST-Weg. Sie ist jetzt auf Betreuungskräfte (`eigene_caregiver_ids()`) bzw. den Übergeber des
Protokolls eingegrenzt. **Die Datei muss in der korrigierten Fassung angewendet werden.**

*Keine weiteren P0: Typecheck, Testsuite, Vercel-Build und alle produktiven Routen sind grün.*

---

## 9. Noch offene P1-Fehler

| # | Befund | Auswirkung | Zuständig |
|---|---|---|---|
| P1-1 | **8 von 9 § 45b-Tarifen blockiert**, 1 verifiziert | Entlastungsbetrag nicht abrechenbar. Fail-closed und gewollt — es fehlt der Primärbeleg, nicht der Code. Die 35 €/h-Sätze bleiben gesperrt. | extern (Bescheid/Vereinbarung) |
| P1-2 | **VP/KZP: 0 von 4 Tarifen verifiziert**, 4 unverifiziert | Verhinderungs-/Kurzzeitpflege nicht abrechenbar | extern |
| P1-3 | **2 Testmandanten in der Produktionsdatenbank** | Verfälscht Auswertungen; Pilot-Voraussetzung steht deswegen auf rot | intern |
| P1-4 | **1 Seed-/Demo-Bewertung in Production** | Produktivdaten mit Testdaten vermischt | intern |
| P1-5 | **Pilotkette nie vollständig durchlaufen** — Bestwert 6 von 13 Schritten | Der erste echte Ende-zu-Ende-Durchlauf steht aus | intern |
| P1-6 | **Keine Mehr-Faktor-Authentisierung** für Admin-Zugänge | Ein kompromittiertes Passwort genügt für Vollzugriff | intern |
| P1-7 | **Kein Penetrationstest durch Dritte** | Auch DiPA-Voraussetzung | extern |
| P1-8 | **12 aktive Tarife insgesamt ohne Verifizierung** | Erzeugen fail-closed keine Rechnungspositionen | extern |

**Aus früheren Sitzungen offen, in dieser Sitzung nicht erneut geprüft:** 8 Policies mit
`profiles`-Subquery (Rekursionsrisiko), fail-open `current_org_id()` bei fehlender
Org-Mitgliedschaft, 12 Routen ohne `safeDbError`-Sanitizer. Diese Punkte gelten unverändert.

**Korrektur zu einem älteren Befund:** `auth.admin.listUsers()` wurde am 14.08.2026 erneut
geprüft und funktioniert (`OK — 1 Nutzer`). Der frühere Fehler „Database error finding users"
tritt nicht mehr auf.

---

## 10. Tests / Build / CI

| Prüfung | Ergebnis |
|---|---|
| `npx tsc --noEmit` | **Exit 0** — keine Fehler |
| `npx vitest run` | **2507 bestanden**, 38 übersprungen (2545) · 115 Dateien, 1 übersprungen · 6,3 s |
| `npm run lint:forbidden` (Vollscan) | **0 verbotene Strings** bei 23.678 Dateien |
| `precommit-guard` | clean — keine Secrets, keine `.env`, keine `node_modules` |
| Vercel Production-Build `848dcf2` | **success** |
| `verify-push` | synchron (`848dcf26`) |

Die 6 Streams haben sich **nicht gegenseitig überschrieben**. Geprüft wurden gezielt die
Dateien mit Mehrfachzugriff:

- `app/admin/layout.tsx` — drei Streams haben Nav-Einträge ergänzt, alle additiv, **keine
  doppelten `href`-Werte**, alle vier neuen Ziele existieren.
- `lib/billing/core/audit.ts` — drei Entity-Typen ergänzt, deckungsgleich mit der Migration.
- `lib/coach/version.ts` — eine einzige Bumps-Zeile, 0.3.0 → **0.4.0**, kein Konflikt.
- `docs/KASSENABRECHNUNG_FREISCHALTUNG.md` — 95 Zeilen ergänzt (Betriebsabschnitt), 6 ersetzt
  (Stand-Datum), keine widersprüchlichen Aussagen.
- Keine Konfliktmarker im gesamten Baum; keine `route.ts` mit unerlaubtem Nicht-Handler-Export
  (die bekannte Vercel-Build-Falle).

**Neue Tests in dieser Phase:** Betriebsmodus, Credentials und Dead-Letter, Versand-Retry,
Pilot-Kundenkette, SEPA-Gläubiger-ID, PflegeCoach-Consent/Config/Produktgrenze, Go-Live-Status,
Übergabeprotokolle und -punkte.

---

## 11. Production-Deployment + Commit

| | |
|---|---|
| **Commit** | `848dcf2` — „Konsolidierung: 6 Streams — Pilot, Kasse Ready-to-Connect, DiPA Fast Track, PflegeCoach, PDL-Ausbau, Go-Live Dashboard" |
| **Umfang** | 112 Dateien: 51 geändert, 61 neu, davon 4 Migrationsdateien (2 + 2 Rollbacks) |
| **Vercel** | Production-Build **success** |
| **Remote** | `origin/main` synchron, per `verify-push` bestätigt |

**Live verifiziert am 14.08.2026:**

| Route | HTTP |
|---|---|
| `/` | 200 |
| `/pflegecoach` | 200 |
| `/pflegecoach/start` | 200 |
| `/admin/go-live` | 307 → Login (Admin-Guard greift) |
| `/admin/pilot` | 307 → Login |
| `/admin/uebergaben` | 307 → Login |
| `/admin/kassenabrechnung/betrieb` | 307 → Login |

**Beim Deploy behoben:** Eine verwaiste `.git/HEAD.lock` vom Vortag blockierte den Commit. Kein
git-Prozess lief; der Lock wurde nach Prüfung entfernt.

### Sicherheitsprüfung der neuen Funktionen

| Prüfpunkt | Ergebnis |
|---|---|
| Auth-Guard auf allen neuen API-Routen | **Ja** — 6 Admin-Routen über `requireAdminMitOrg()`, 7 Übergabe-Routen über `requireUebergabeUser()`; Kunden und Angehörige werden per Rolle mit 403 abgewiesen |
| RLS auf allen neuen Tabellen | **Ja** — 7 von 7, jeweils mit RESTRICTIVE Org-Fence; `anon` per `REVOKE` ausgesperrt (ein Policy-Befund vorab korrigiert, siehe P0-1) |
| Secrets in Code oder Datenbank | **Keine** — Vollscan über 23.678 Dateien ohne Treffer |
| Credential-Management | **Sicher** — Schlüsselmaterial liegt ausschließlich im privaten Bucket `abrechnung` oder in Env-Variablen. In der Datenbank stehen nur Metadaten (Fingerprint, Ablaufdatum, Ablageort). Zwei unabhängige Sperren: `pruefeKeinSchluesselmaterial()` im Code und CHECK-Constraints, die PEM-Header, PKCS#12-Kopfbytes und überlange Werte abweisen — bewusst über **alle** Freitextfelder, weil der wahrscheinliche Fehlgriff ein Dateiinhalt im Notizfeld ist |
| Fehlerausgaben | Alle neuen Routen über `safeErrorResponse` / sanitisierte 500er |

---

## 12. Externe To-dos — nur Yusuf persönlich

Diese Punkte kann **kein Agent und kein Deploy** erledigen. Jeder verlangt eine Person mit
Ausweis, Unterschrift oder Vertragsvollmacht.

### Sofort und kostenfrei

1. **SEPA-Gläubiger-Identifikationsnummer** bei der Deutschen Bundesbank beantragen
   (Online-Antrag, kostenfrei). Danach den Platzhalter `DE98ZZZ09999999999` in den
   Organisationsstammdaten ersetzen. Bis dahin kein Lastschrifteinzug — die Software verweigert
   ihn ohnehin. Ablauf: `docs/ANLEITUNG_SEPA_CREDITOR_ID.md`
2. **Zwei Migrationen im Supabase-SQL-Editor anwenden** (siehe P0-1). Nur du hast DDL-Rechte.

### Belege beschaffen (schaltet Umsatz frei)

3. **Anerkennungsbescheid nach § 45a SGB XI** bzw. **Vergütungsvereinbarung** vorlegen und die
   Tarife unter `/admin/kassenabrechnung/tarife` verifizieren — schaltet 8 gesperrte § 45b-Tarife
   und 4 VP/KZP-Tarife frei. **Preise nicht erfinden**: Die Software setzt sie nicht automatisch
   und rät sie nicht.

### Kassenabrechnung (langer Vorlauf)

4. **ITSG-Zertifikat** beim Trust Center beantragen; Passwort selbst vergeben und als
   `SECON_ZERT_PASSWORT` hinterlegen.
5. **SFTP-Zugang bei einer Datenannahmestelle** registrieren (Schlüsselpaar erzeugen,
   öffentlichen Teil dort hinterlegen).
6. **Testübertragung durchführen**, Datum und Referenz der Annahmestelle notieren — erst danach
   `ITSG_ZERTIFIZIERT=true` und Umschaltung auf Echtbetrieb.
7. **Technische Anlage 1** zur § 302-Vereinbarung inkl. Schlüsselverzeichnisse beim
   GKV-Spitzenverband beschaffen (gkv-datenaustausch.de).
8. **KIM:** gematik-Zulassung, Provider-Vertrag, Konnektor-Anbindung, SMC-B beantragen.

### DiPA (längster Vorlauf)

9. **BfArM-Verfahren** eröffnen. Extern zu beschaffen: DSFA-Freigabe, AV-Kette,
   Penetrationstest, Sicherheitszertifikat, Barrierefreiheits-Audit, Nutzennachweis/Erprobung,
   Software-QMS, FHIR-Mapping. Bis zur Listung bleibt der PflegeCoach ein Selbstzahler-Produkt.

---

## Die drei nächsten Schritte mit höchster Priorität

### 1. Die zwei Migrationen anwenden — heute, 10 Minuten

`20260903000000_uebergabeprotokolle.sql` (in der **korrigierten** Fassung) und
`20260903010000_kassenabrechnung_betrieb.sql` im Supabase-SQL-Editor ausführen. Beide sind
geprüft, idempotent, transaktional und haben Rollback-Skripte.

*Warum zuerst:* Vier fertige, bereits ausgelieferte Module sind ohne diesen Schritt
funktionslos. Es ist der einzige P0 — und der billigste.

### 2. Den ersten echten Kunden vollständig durch die Kette führen

`/admin/pilot` öffnen, einen realen Kunden auswählen und die 13 Schritte bis „OPOS ausgeglichen"
abarbeiten. Vorher die 2 Testmandanten und die Demo-Bewertung aus der Produktionsdatenbank
entfernen (P1-3, P1-4).

*Warum an zweiter Stelle:* Alles ist gebaut und getestet, aber nichts ist im Feld bewiesen. Der
erste vollständige Durchlauf verwandelt „müsste funktionieren" in „funktioniert" — und findet
erfahrungsgemäß die Reibungspunkte, die keine Testsuite zeigt.

### 3. Gläubiger-ID beantragen und Tarifbelege vorlegen

Der Bundesbank-Antrag ist kostenfrei und dauert Minuten; er schaltet den Lastschrifteinzug frei.
Parallel den § 45a-Bescheid bzw. die Vergütungsvereinbarung heraussuchen und die 12 gesperrten
Tarife verifizieren.

*Warum an dritter Stelle:* Beides sind reine Papiervorgänge ohne Entwicklungsaufwand, die
unmittelbar Umsatz freischalten — der Entlastungsbetrag von 131 €/Monat je Kunde ist heute
technisch abrechenbar und scheitert nur am fehlenden Beleg.

---

*Alle Zahlen in diesem Bericht wurden am 14.08.2026 gegen die Produktionsdatenbank gemessen,
nicht geschätzt. Reproduzierbar mit `npx tsx scripts/go-live-check.ts` oder unter
`/admin/go-live`.*
