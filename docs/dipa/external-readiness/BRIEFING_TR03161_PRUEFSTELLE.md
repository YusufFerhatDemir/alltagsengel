# Briefing für eine BSI-akkreditierte IT-Sicherheitsprüfstelle — Zertifizierung nach BSI TR-03161

**Produkt:** Digitaler PflegeCoach
**Hersteller:** Alltagsengel UG (haftungsbeschränkt), Frankfurt am Main
**Version:** siehe `lib/coach/version.ts` (Einzelquelle der Wahrheit; aktuell `0.5.0`, Stand 2026-08-14 — wird in UI-Fußzeile, Datenexport und jedem Bericht ausgewiesen)
**Stand dieses Briefings:** 2026-08-15
**Status:** Briefing für Auftragsvergabe — **noch nicht beauftragt**

---

## Zweck und Leseanleitung

Dieses Dokument fasst zusammen, was eine BSI-akkreditierte Prüfstelle braucht, um ein
Angebot für eine Zertifizierung nach **BSI TR-03161** (einschließlich des darin i. d. R.
enthaltenen Penetrationstests) für den Digitalen PflegeCoach abzugeben. Es ersetzt keine
Beauftragungsunterlage im engeren Sinn — für den Penetrationstest-Teil existiert bereits
eine eigenständige, versandfertige Unterlage: `audit/dipa/pentest_beauftragung_scope.md`.
Dieses Briefing bündelt Systembeschreibung, Scope, vorhandene Maßnahmen und offene Punkte
für das Erstgespräch bzw. die Angebotsanfrage.

**Ausdrücklich klarzustellen:**

- Es liegt **keine DiPA-Zulassung** vor. Es ist **keine** beantragt. Dieses Briefing dient
  ausschließlich der Vorbereitung einer möglichen künftigen Antragstellung.
- Der Digitale PflegeCoach ist für Endnutzer **dauerhaft kostenlos**. Eine Monetarisierung
  ist ausschließlich über eine mögliche künftige Pflegekassen-Erstattung nach tatsächlicher
  DiPA-Zulassung vorgesehen — nicht über den Nutzer selbst.
- Alle Angaben stammen aus den unten genannten internen Audit-Dokumenten. Wo eine Angabe
  fehlt, wird das als offener Punkt benannt statt geschätzt.

---

## 1. Systembeschreibung

### 1.1 Was das Produkt ist

Der Digitale PflegeCoach ist eine im Browser nutzbare Anwendung für Menschen mit
Pflegebedarf in häuslicher Versorgung und für die Menschen, die sie pflegen. Er bildet
einen wiederkehrenden Ablauf ab: Selbsteinschätzung erheben → Ziele setzen → Alltag
strukturieren → Erledigung festhalten → Verlauf sichtbar machen → Ziele und Maßnahmen
anpassen. Alle Inhalte sind allgemeine Anleitungen und organisatorische Hilfen; das
Produkt trifft keine diagnostischen oder therapeutischen Entscheidungen, bewertet keine
Messwerte und ersetzt keine ärztliche oder pflegefachliche Beratung.
(Quelle: `audit/dipa/produktbeschreibung_pflegecoach.md` §1)

Drei Nutzerrollen: `pflegebeduerftig` (voller Funktionsumfang), `angehoerig` (zusätzlich
Belastungs-Selbsteinschätzung), `pflegedienst` (ausschließlich lesende Sicht auf
freigegebene Daten). Die Rolle steuert Inhalte und Empfehlungen, nicht die Rechte an
fremden Daten — dafür ist ausschließlich die ausdrückliche, widerrufliche Freigabe
(`coach_shares`) maßgeblich.

### 1.2 Architektur

```
Browser (React/Next.js App Router)
  │  HTTPS
  ├─ app/pflegecoach/**          Produktoberfläche (14 Bereiche, eigenes Layout, werbefrei)
  │   └─ _lib/client.ts          einheitlicher Fetch + Profil-Guard
  │
  ├─ app/api/coach/**            Produkt-API, 16 Routen (Node-Runtime)
  │   └─ lib/coach/api-auth.ts   Session-Client, ohne service_role
  ├─ app/api/dipa/**             Betriebs-API, 4 Routen (nicht Teil der Produktoberfläche)
  │
  ├─ lib/coach/**                fachliche Logik, reine/testbare Funktionen
  │
  └─ PostgreSQL (Supabase)
      ├─ coach_*                 Datenhaltung, Row Level Security als Zugriffswahrheit
      ├─ coach_audit_trigger()   Append-only-Protokoll (SECURITY DEFINER)
      └─ coach_mein_pseudonym()  Pseudonym-Auflösung für Nutzungsereignisse
```

Grundsatz: **Die Datenbank ist die Zugriffswahrheit.** Die API-Schicht setzt keine eigenen
Rechte durch, sondern reicht die Nutzersession an die Datenbank durch; was Row Level
Security nicht erlaubt, kommt nicht heraus. Eine dokumentierte Ausnahme:
`app/api/dipa/nachweise/route.ts` liest Nutzungsereignisse im Systemkontext und
aggregiert sie sofort — Einzelzeilen und Pseudonyme verlassen die Route nie.
(Quelle: `audit/dipa/technische_dokumentation_pflegecoach.md` §2, `audit/dipa/sicherheitsarchitektur_pflegecoach.md` §2)

18 Tabellen in zwei nicht verknüpften Gruppen: Nutzerdaten (Gesundheits-/Pflegedaten,
Art. 9 DSGVO — nur die betroffene Person sowie von ihr freigegebene Personen, kein
administrativer Zugriff) und Betriebsdaten (Berechtigungs-/Leistungsnachweise,
Administration mit Mandantengrenze). Zwischen beiden Gruppen existiert keine
Fremdschlüsselbeziehung; die einzige Brücke ist ein HMAC-Pseudonym, das ohne den — für
niemanden lesbaren — Schlüssel nicht auflösbar ist.
(Quelle: `audit/dipa/produktbeschreibung_pflegecoach.md` §3.3)

### 1.3 Technologie-Stack

| Ebene | Technologie |
|---|---|
| Oberfläche | Next.js App Router (React), serverseitig gerendert |
| Produkt-API | Next.js Route Handler, Node.js-Laufzeit |
| Fachlogik | TypeScript, reine Funktionen (`lib/coach/**`), unit-getestet |
| Datenbank | PostgreSQL (Supabase) mit aktiviertem Row Level Security, `pgcrypto` |
| Client-Speicher | ausschließlich Darstellungseinstellungen (Schriftgröße, Kontrast) in `localStorage` — keine Gesundheitsdaten |

Keine weiteren Dienste; der PflegeCoach ruft keine externen Schnittstellen auf.
(Quelle: `audit/dipa/technische_dokumentation_pflegecoach.md` §6)

### 1.4 Betriebsumgebung

Webanwendung ohne Installation, kein nativer App-Store-Weg. Produktiv erreichbar unter
`https://alltagsengel.care/pflegecoach/**` (Oberfläche) und
`https://alltagsengel.care/api/coach/**` (API, 17 Routen laut Scope-Dokument). Der
PflegeCoach ist ein eigenständig versioniertes Produkt innerhalb der Alltagsengel-
Plattform und teilt mit ihr ausschließlich die Anmeldung — Datenhaltung, Zugriffsschicht,
Layout, Werbe-/Tracking-Freiheit und Versionierung sind eigenständig.
(Quelle: `audit/dipa/technische_dokumentation_pflegecoach.md` §1, `audit/dipa/pentest_beauftragung_scope.md` §1)

---

## 2. Scope der Prüfung

Die Prüfung soll sich **ausschließlich auf das Produkt Digitaler PflegeCoach** beziehen,
nicht auf die übrige Alltagsengel-Plattform. Grund: Der PflegeCoach ist als eigenständiges
Produkt abgegrenzt; ein gemischter Prüfumfang würde den Bericht für die DiPA-Unterlagen
unbrauchbar machen.
(Quelle: `audit/dipa/pentest_beauftragung_scope.md` §1)

| Einschluss | Umfang |
|---|---|
| Oberfläche | `https://alltagsengel.care/pflegecoach/**` — alle Produktseiten |
| Schnittstellen | `https://alltagsengel.care/api/coach/**` — 17 Routen |
| Datenzugriff | Row Level Security auf allen `coach_*`-Tabellen |
| Anmeldung | Passwortanmeldung und zweiter Faktor (TOTP), einschließlich Niveau-Durchsetzung |
| Datenexport | JSON-Vollexport und FHIR-Bundle |

| Ausdrücklicher Ausschluss (getrennt zu beauftragen) | Begründung |
|---|---|
| Betriebsbereich der Plattform (`/mis`, `/admin`) | eigener Vertrauensbereich, nicht Teil des DiPA-Produkts |
| Buchungs- und Abrechnungsstrecke der Plattform | nicht Teil des DiPA-Produkts |
| Mobile Anwendungen | nicht Teil des DiPA-Produkts |

**Offen:** Der genaue Anwendungsbereich der TR-03161 für dieses Produkt (welche Teile der
dreiteiligen Richtlinie einschlägig sind — der PflegeCoach ist eine Webanwendung ohne
native App) ist **mit der Prüfstelle zu klären**, nicht vorab festgelegt.
(Quelle: `audit/dipa/tr03161_checkliste.md` Abschnitt 0)

Empfohlenes Vorgehen laut interner Vorbereitung: **Grey-Box-Test.** Die Prüfstelle erhält
Zugangsdaten für mehrere Testkonten sowie die Architekturdokumente, aber keinen
Quellcode-Zugang. Fünf Testkonten sind vorgesehen (zwei betroffene Personen zur Prüfung
der Datentrennung, ein Angehörigen-Konto zur Prüfung der Freigabegrenzen, ein
Betriebs-Administrator-Konto zur Prüfung der Produktgrenze, ein Konto mit aktiviertem
zweitem Faktor). Details, Schwerpunkte (u. a. Datentrennung zwischen Nutzern, Produktgrenze
zur Betriebsplattform, Durchsetzung des zweiten Faktors, Wirkung von
Einwilligungswiderruf, Pseudonymisierung der Nachweisdaten) und Durchführungsregeln stehen
vollständig in `audit/dipa/pentest_beauftragung_scope.md` (Abschnitte 2–4).

---

## 3. Vorhandene Sicherheitsmaßnahmen (Zusammenfassung)

Diese Übersicht ist komprimiert und referenziert die Originaldokumente — für die
Prüfstelle sind die Originale maßgeblich, nicht diese Zusammenfassung.

| Bereich | Ist-Zustand (Kurzfassung) | Quelle |
|---|---|---|
| Transportverschlüsselung | TLS Browser↔Anwendung und Anwendung↔Datenbank, HTTP wird umgeleitet | `audit/dipa/verschluesselungskonzept.md` §2 |
| Verschlüsselung im Ruhezustand | konfigurationsabhängig durch die Datenbankplattform — Zusicherung ist im AVV nachzuweisen, **nicht** eigenständig belegt | `audit/dipa/verschluesselungskonzept.md` §3 |
| Pseudonymisierung | HMAC-SHA256 (32-Byte-Schlüssel) über die Auth-User-ID für Nutzungsereignisse; Schlüssel ohne Policy/Grants, nur für eine `SECURITY DEFINER`-Funktion erreichbar | `audit/dipa/verschluesselungskonzept.md` §4, `audit/dipa/sicherheitsarchitektur_pflegecoach.md` §4 |
| Freischaltcodes | SHA-256 über normalisierten Code + serverseitigen Pfeffer; Klartext erscheint genau einmal | `audit/dipa/verschluesselungskonzept.md` §4 |
| Ende-zu-Ende-Verschlüsselung | **bewusst nicht umgesetzt** — begründete Produktentscheidung (Zielgruppe teils hochbetagt; Schlüsselverlust dürfte nicht zu Totalverlust der Pflegedokumentation führen); stattdessen Verteidigung in der Tiefe über RLS, Produkttrennung, Pseudonymisierung | `audit/dipa/verschluesselungskonzept.md` §5 |
| Zweiter Faktor (MFA) | TOTP (RFC 6238) implementiert, einrichtbar unter `/pflegecoach/einstellungen/sicherheit`; sobald ein Faktor eingerichtet ist, wird er serverseitig fail-closed erzwungen (`lib/coach/api-auth.ts`); Einrichtung selbst ist standardmäßig freiwillig (`COACH_MFA_PFLICHT`, Default aus) — bewusste Entscheidung wegen der Zielgruppe | `docs/dipa/11_MFA_DOKUMENTATION.md`, `docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md` (SEC-03) |
| Zugriffskontrolle / Rechtetrennung | Row Level Security als alleinige Zugriffswahrheit; keine Admin-Policy auf `coach_*`; `anon` auf Grant-Ebene vollständig entzogen; 39–68 Shadow-Datenbanktests grün, je nach Migrationsstand | `audit/dipa/sicherheitsarchitektur_pflegecoach.md` §2–3.1, `audit/dipa/security_review_pflegecoach.md` §2 |
| Produktgrenze zur Betriebsplattform | Für Gesundheitsdaten existiert keine Verwaltungs-Policy; `service_role` wird im Produktcode nur in zwei eng begrenzten Ausnahmen für Bestell-/Zahlungs-/Freischaltungstabellen verwendet, nie für `coach_*`-Gesundheitsdaten | `audit/dipa/security_review_pflegecoach.md` §4, `audit/dipa/pentest_beauftragung_scope.md` §3.2 |
| Einwilligung als technisches Tor | Jede schreibende Route prüft eine aktive Pflicht-Einwilligung, fail-closed (Antwort 503 statt stillem Schreiben bei Unklarheit); Lesen/Export/Löschung bleiben nach Widerruf offen | `audit/dipa/sicherheitsarchitektur_pflegecoach.md` §3.5 |
| Eingabevalidierung / Injection-Schutz | ausschließlich Datenbank-Query-Builder, kein zusammengesetztes SQL; Feld-Whitelisting in allen Routen; kein `dangerouslySetInnerHTML` im Produktpfad | `audit/dipa/security_review_pflegecoach.md` §2, `audit/dipa/sicherheitsarchitektur_pflegecoach.md` §3.3 |
| Protokollierung / Auditierbarkeit | append-only, ausschließlich per Datenbank-Trigger geschrieben, ohne Datenwerte, für alle Beteiligten unveränderlich | `audit/dipa/sicherheitsarchitektur_pflegecoach.md` §5 |
| Sicherheit im Entwicklungsprozess | Secret-Scan vor jedem Ausbringen (`precommit-guard`), Typprüfung bei jedem Build, Unit- und Datenbanktests, Barrierefreiheitsregeln als Build-Fehler, dokumentierte Rückrollwege je Migration | `audit/dipa/sicherheitsarchitektur_pflegecoach.md` §6 |

---

## 4. Bekannte offene Punkte (ohne Beschönigung)

Diese Punkte werden der Prüfstelle transparent genannt, nicht verschwiegen.

### 4.1 Zertifizierung selbst

| Punkt | Stand |
|---|---|
| Prüfstelle beauftragt | **nein** — genau dafür dient dieses Briefing |
| Anwendungsbereich der TR-03161 für dieses Produkt festgelegt | **nein** — mit der Prüfstelle zu klären |
| Zertifikat | **nein** |

(Quelle: `audit/dipa/tr03161_checkliste.md` Abschnitt 0)

### 4.2 Anforderungspunkte, die laut internem Reverify (Stand 14.08.2026) an dieser Zertifizierung hängen

Die folgenden Punkte der internen 48-Punkte-Anforderungsmatrix sind als
**NOT_VERIFIED** eingestuft — nicht weil die technische Umsetzung fehlt, sondern weil der
genaue Anforderungstext der TR-03161 intern nicht im Volltext vorliegt und daher nicht
gegen das Original geprüft werden konnte. Alle fünf hängen laut interner Bewertung an
SEC-01 (dieser Zertifizierung):

| ID | Anforderung | Interne Umsetzung (vorhanden) | Status | Grund |
|---|---|---|---|---|
| SEC-02 | Verschlüsselung Transport/Ruhezustand | TLS + At-Rest (konfigurationsabhängig) | NOT_VERIFIED | Anforderungstext nicht gegen TR-03161-Original geprüft |
| SEC-03 | Zweiter Faktor | TOTP implementiert, 9 Tests, serverseitig durchgesetzt | NOT_VERIFIED | Anforderungstext nicht gegen TR-03161-Original geprüft |
| SEC-06 | Rollen/Rechte technisch durchgesetzt | RLS-Policies, Shadow-Tests grün | NOT_VERIFIED | Anforderungstext nicht gegen TR-03161-Original geprüft |
| SEC-07 | Auditierbarkeit | `coach_audit_log`, append-only | NOT_VERIFIED | Anforderungstext nicht gegen TR-03161-Original geprüft |
| SEC-08 | Trennung von Betriebsplattform | eigene Tabellen/Policies | NOT_VERIFIED | Anforderungstext nicht gegen TR-03161-Original geprüft; Trennungstiefe ist mit dem BfArM zu klären |

Zwei weitere Punkte derselben Tabelle betreffen die Beauftragung selbst:

| ID | Anforderung | Status | Anmerkung |
|---|---|---|---|
| SEC-01 | TR-03161-Zertifikat | PARTIAL / EXTERNAL_REQUIRED | Selbsteinschätzung liegt vor (`audit/dipa/tr03161_checkliste.md`), Zertifikat nicht — kritischer Pfad |
| SEC-04 | Externer Penetrationstest | PARTIAL / EXTERNAL_REQUIRED | **Nicht separat beauftragen** — das TR-03161-Zertifikat deckt den Pentest nach BfArM-Leitfaden i. d. R. mit ab; ob das im konkreten Angebot der Fall ist, ist bei der Anfrage zu klären |

(Quelle: `docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md`, Tabelle „3. Datensicherheit"; `docs/DIPA_EXTERNE_TODO_2026-08-14.md` Punkt 1)

**Hinweis zu SEC-05 (ISMS):** Ein ISMS nach ISO 27001 ist laut BfArM-Leitfaden bei
Antragstellung zwingend, wird aber über eine **DAkkS**-akkreditierte Zertifizierungsstelle
und **nicht** über diese TR-03161-Prüfung erbracht — separates Mandat, hier nur der
Vollständigkeit halber erwähnt.
(Quelle: `docs/DIPA_EXTERNE_TODO_2026-08-14.md` Punkt 4)

### 4.3 Weitere bekannte Schwächen aus der Sicherheitsarchitektur

| # | Schwäche | Einordnung |
|---|---|---|
| S9 | Keine Laufzeitprüfung der Zugriffsregeln gegen die Produktionsdatenbank — geprüft ist gegen eine aus dem Repository aufgebaute Testdatenbank | Restrisiko einer Abweichung zwischen Repository und Produktion |
| S10 | Datenbanktests fehlen für sieben Tabellen der zweiten Migration | Lücke im Nachweis, nicht notwendigerweise im Schutz |
| S5 | Kein geprüftes Wiederanlaufkonzept — Sicherung liegt bei der Plattform, eine Rücksicherung wurde nie erprobt | Verfügbarkeitsrisiko, kein Vertraulichkeitsrisiko |
| S6 | Datenbankadministration kann bauartbedingt alles lesen; organisatorische Begrenzung ist nicht dokumentiert | Restrisiko |
| S7 | Keine Begrenzung der Anfragehäufigkeit in den Produktrouten | eingeschränkt relevant, da jede Route ohnehin nur eigene Daten liefert; für die Code-Einlösung dennoch prüfenswert |
| S8 | Gemeinsame Infrastruktur mit der Plattform (Anmeldung, Hosting) | für Pilotbetrieb als tragbar bewertet, vor Antragstellung erneut zu bewerten |

(Quelle: `audit/dipa/sicherheitsarchitektur_pflegecoach.md` §7)

### 4.4 Klarstellung zur Selbsteinschätzung

`audit/dipa/security_review_pflegecoach.md` und `audit/dipa/sicherheitsarchitektur_pflegecoach.md`
sind **interne Selbst-Reviews desselben Autors wie der Code** — ausdrücklich als solche
gekennzeichnet, nicht als unabhängige Prüfung zu verstehen. Genau das ist der Grund, warum
eine externe, akkreditierte Prüfung angefragt wird.

---

## 5. Ansprechpartner

Ansprechpartner: **[wird von Alltagsengel benannt]**

---

## 6. Zeitrahmen

Aus den vorliegenden internen Unterlagen geht ausschließlich hervor, dass diese
Zertifizierung als **P0-Punkt mit der längsten Vorlaufzeit (Monate)** eingestuft ist und
deshalb parallel zu anderen P0-Punkten (pflegefachliche Inhaltsfreigabe,
Datenschutzpaket) so früh wie möglich beauftragt werden soll. Konkrete Wochen- oder
Monatsangaben zur Dauer der Prüfung selbst liegen intern nicht vor und werden hier nicht
geschätzt — das ist Teil der einzuholenden Angebotsauskunft.
(Quelle: `docs/DIPA_EXTERNE_TODO_2026-08-14.md` Punkt 1, „Empfohlene Reihenfolge")

---

## 7. Bereitzustellende Unterlagen

Diese Dokumente können der Prüfstelle vorab bereitgestellt werden:

| Dokument | Inhalt |
|---|---|
| `audit/dipa/sicherheitsarchitektur_pflegecoach.md` | Architektur, Schutzziele, Vertrauensgrenzen, bekannte Schwächen |
| `audit/dipa/technische_dokumentation_pflegecoach.md` | Architektur, Betrieb, Systemanforderungen |
| `audit/dipa/produktbeschreibung_pflegecoach.md` | Produkt- und Systembeschreibung |
| `audit/dipa/rollen_rechtekonzept.md` | Rollen und Rechte |
| `audit/dipa/datenfluesse_pflegecoach.md` | Datenflüsse |
| `audit/dipa/verschluesselungskonzept.md` | Transport- und Ruhezustandsverschlüsselung |
| `audit/dipa/security_review_pflegecoach.md` | interne Selbstprüfung — ausdrücklich als solche gekennzeichnet |
| `audit/dipa/tr03161_checkliste.md` | interne Vorbereitungs-Checkliste (Selbsteinschätzung, kein Zertifikat) |
| `audit/dipa/pentest_beauftragung_scope.md` | vollständige Beauftragungsunterlage für den Penetrationstest-Teil (Umfang, Testkonten, Schwerpunkte, Durchführungsregeln) |
| `docs/dipa/11_MFA_DOKUMENTATION.md` | Verfahren und Durchsetzung des zweiten Faktors (TOTP) |
| dieses Dokument | Systembeschreibung, Scope, vorhandene Maßnahmen, offene Punkte im Überblick |

(Quelle: `audit/dipa/pentest_beauftragung_scope.md` §6, ergänzt)

---

## 8. Status dieses Briefings

Nicht beauftragt. Es liegt kein Angebot vor, keine Prüfstelle ist ausgewählt, kein Termin
steht. Nächster Schritt: dieses Briefing zusammen mit
`audit/dipa/pentest_beauftragung_scope.md` an eine oder mehrere BSI-akkreditierte
Prüfstellen zur Angebotseinholung geben und dabei ausdrücklich klären, ob das Angebot den
Penetrationstest (SEC-04) als Teilleistung mitabdeckt.
