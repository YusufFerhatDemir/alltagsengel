# Produktbeschreibung — Digitaler PflegeCoach

**Produkt:** Digitaler PflegeCoach
**Hersteller:** Alltagsengel UG (haftungsbeschränkt), Frankfurt am Main
**Version:** `lib/coach/version.ts` (Einzelquelle; im Produkt, im Export und in jedem Bericht ausgewiesen)
**Stand:** 2026-08-13
**Status:** ENTWURF — aus dem Quellcode abgeleitet, fachliche und juristische Freigabe steht aus

---

## Wie dieses Dokument zu lesen ist

Es beschreibt **das Produkt**, nicht die Anforderungen an das Produkt. Was
regulatorisch verlangt wird, steht in den Originaldokumenten und ist zum
Zeitpunkt der Antragstellung in der dann gültigen Fassung heranzuziehen.
Preise, Erstattungsbeträge, Abrechnungswege und Zulassungsvoraussetzungen
werden hier **nicht** behauptet.

Verwandte Unterlagen, die hier nicht wiederholt werden:

| Thema | Datei |
|-------|-------|
| Verbindlicher Wortlaut der Zweckbestimmung | `finale_zweckbestimmung.md` |
| Vollständige Funktionsliste mit Code-Bezug | `funktionsbeschreibung_pflegecoach.md` |
| Architektur, Betrieb, Systemanforderungen | `technische_dokumentation_pflegecoach.md` |
| Zielgruppen im Detail | `zielgruppendefinition.md` |
| Abgrenzung zum Medizinprodukt | `mdr_negativabgrenzung.md` |

---

## 1. Was das Produkt ist — in einem Absatz

Der Digitale PflegeCoach ist eine im Browser nutzbare Anwendung für Menschen mit
Pflegebedarf in häuslicher Versorgung und für die Menschen, die sie pflegen. Er
bildet einen wiederkehrenden Ablauf ab: **Selbsteinschätzung erheben → Ziele
setzen → Alltag strukturieren → Erledigung festhalten → Verlauf sichtbar machen →
Ziele und Maßnahmen anpassen.** Alle Inhalte sind allgemeine Anleitungen und
organisatorische Hilfen. Das Produkt trifft keine diagnostischen oder
therapeutischen Entscheidungen, bewertet keine Messwerte und ersetzt keine
ärztliche oder pflegefachliche Beratung.

## 2. Fachliche Beschreibung

### 2.1 Bearbeiteter Gegenstand

Der PflegeCoach bearbeitet nicht Krankheiten, sondern die **Organisation des
Alltags bei Pflegebedürftigkeit** in fünf Lebensbereichen:

| Bereich | Datenfeld | Bedeutung im Produkt |
|---------|-----------|----------------------|
| Mobilität | `coach_assessments.mobilitaet` | Fortbewegung in der Wohnung, Aufstehen, Gehen, Sicherheit im Wohnraum |
| Selbstversorgung | `coach_assessments.selbstversorgung` | Körperpflege, Ankleiden, Essen und Trinken, Energieeinteilung |
| Gestaltung des Alltags | `coach_assessments.alltagsgestaltung` | Tages- und Wochenstruktur, sinnvolle Beschäftigung |
| Soziale Teilhabe | `coach_assessments.soziale_teilhabe` | Kontakte, Beteiligung am sozialen Leben |
| Kognition | `coach_assessments.kognition` | Orientierung im Alltag als Selbsteinschätzung — **ohne** Testverfahren, ohne Auswertung |

Ein sechster Bereich betrifft ausschließlich die pflegende Person:
**Entlastung Angehöriger** (`coach_goals.bereich = 'entlastung_angehoerige'`,
`lib/coach/belastung.ts`).

Die Skala ist einheitlich `0` (selbständig) bis `4` (auf umfassende Unterstützung
angewiesen) und in der Datenbank per CHECK-Constraint erzwungen. Sie ist eine
**Selbsteinschätzung der nutzenden Person**, kein Begutachtungsinstrument und
keine Ableitung eines Pflegegrads.

### 2.2 Wirkprinzip

Das Produkt wirkt über vier Mechanismen — alle organisatorisch, keiner medizinisch:

1. **Sichtbarmachen.** Der eigene Verlauf über die Zeit wird als Zeitreihe
   dargestellt (`/pflegecoach/verlauf`). Ohne das Produkt bleibt eine schleichende
   Veränderung unbemerkt, bis sie auffällt.
2. **Verbindlichkeit.** Ziele mit Messgröße, Startwert, Zielwert und Termin
   (`coach_goals`) und ein Wochenplan mit wiederkehrenden Aktivitäten
   (`coach_activities`) machen aus einem Vorsatz einen Termin.
3. **Wissen an der richtigen Stelle.** Allgemeine Anleitungen und Wissensmodule
   (`lib/coach/inhalte.ts`) stehen dort, wo das Thema gerade bearbeitet wird.
4. **Anstoß zur Anpassung.** Regelbasierte Hinweise (`lib/coach/empfehlungen.ts`)
   melden, wenn ein Zieltermin verstrichen ist, eine Aktivität selten umgesetzt
   wurde oder eine neue Selbsteinschätzung ansteht — und verweisen bei Bedarf auf
   die zuständigen Stellen außerhalb des Produkts (Hausarztpraxis,
   Pflegeberatung nach § 7a SGB XI, Notruf 112).

Was das Produkt bewusst **nicht** tut: aus Daten auf Risiken schließen, Übungen
anhand von Gesundheitsdaten individualisieren, Messwerte deuten, Dosierungen
oder Therapien vorschlagen. Diese Grenze steht als bindende Verbotsliste im
Quellcode (`lib/coach/empfehlungen.ts`, Kopfkommentar) und ist der Kern der
Abgrenzung zum Medizinprodukt.

### 2.3 Rollen in der Anwendung

Drei Rollen, im Datenmodell per CHECK-Constraint auf `coach_users.rolle`
erzwungen:

| Rolle | Sicht auf das Produkt |
|-------|----------------------|
| `pflegebeduerftig` | vollständiger Funktionsumfang, Schwerpunkt Selbständigkeit und Alltag |
| `angehoerig` | zusätzlich Belastungs-Selbsteinschätzung und Wissensmodule zur Entlastung |
| `pflegedienst` | ausschließlich lesende Sicht auf freigegebene Daten — kein Betriebswerkzeug |

Die Rolle steuert die angezeigten Inhalte (`lib/coach/inhalte.ts` über das Feld
`zielgruppe`) und die Empfehlungen. Sie steuert **nicht** die Rechte an fremden
Daten — dafür ist ausschließlich die ausdrückliche Freigabe (`coach_shares`)
maßgeblich (`rollen_rechtekonzept.md`).

## 3. Technische Beschreibung

### 3.1 Art des Produkts

Webanwendung, im Browser nutzbar, ohne Installation. Kein nativer App-Store-Weg,
keine lokale Datenhaltung außer zwei Darstellungseinstellungen (Schriftgröße,
Kontrast) im `localStorage`. Serverseitig gerenderte Oberfläche (Next.js App
Router) mit einer eigenen HTTP-Schnittstelle und einer PostgreSQL-Datenbank.

### 3.2 Bausteine

```
Browser
  │  HTTPS
  ▼
app/pflegecoach/**        Oberfläche (14 Bereiche, eigenes Layout, werbefrei)
  │  fetch (JSON)
  ▼
app/api/coach/**          Produkt-API, 16 Routen
app/api/dipa/**           Betriebs-API, 4 Routen (nicht Teil der Produktoberfläche)
  │  Session-Client
  ▼
PostgreSQL (Supabase)     coach_* mit Row Level Security als Zugriffswahrheit
```

Fachliche Logik liegt vollständig in `lib/coach/**` als reine, testbare
Funktionen ohne Ein-/Ausgabe — dadurch ist jede Regel des Produkts als Unit-Test
belegbar (`lib/coach/*.test.ts`).

### 3.3 Datenhaltung

18 Tabellen in zwei Gruppen, die sich nicht berühren:

| Gruppe | Tabellen | Inhalt | Zugriff |
|--------|----------|--------|---------|
| Nutzerdaten | `coach_users`, `coach_consents`, `coach_shares`, `coach_assessments`, `coach_goals`, `coach_activities`, `coach_activity_log`, `coach_measurements`, `coach_reports`, `coach_freischaltungen`, `coach_anspruchspruefungen`, `coach_audit_log` | Gesundheits- und Pflegedaten (Art. 9 DSGVO) | nur die betroffene Person, dazu von ihr freigegebene Personen — **kein** administrativer Zugriff |
| Betriebsdaten | `coach_freischaltcodes`, `coach_abrechnungswege`, `eul_erbringungen`, `eul_qualifikationen` | Berechtigungs- und Leistungsnachweise des Betriebs | Administration mit Mandantengrenze |
| Sonderfälle | `coach_nutzungsereignisse`, `coach_pseudonym_key` | pseudonyme Auswertungsdaten bzw. der Schlüssel dazu | siehe `datenschutzarchitektur_pflegecoach.md` |

Zwischen beiden Gruppen existiert **keine** Fremdschlüsselbeziehung. Die einzige
Brücke ist ein HMAC-Pseudonym, das ohne den — für niemanden lesbaren — Schlüssel
nicht auflösbar ist.

### 3.4 Schnittstellen nach außen

Der PflegeCoach ruft **keine** externen Dienste auf: keine Auswertungsdienste,
keine Werbenetzwerke, keine Kartendienste, keine Sprachmodelle. Nach außen gibt
es genau zwei Wege, und beide gehen von der nutzenden Person aus:

* **Datenexport** als JSON in einem dokumentierten Schema
  (`lib/coach/export.schema.json`) — siehe `exportfunktionen.md`
* **Verlaufsbericht** als Druckansicht (`/pflegecoach/bericht`), z. B. als PDF für
  ein Gespräch in der Hausarztpraxis

Ein Austausch mit Systemen Dritter (Pflegesoftware, Praxissysteme) findet nicht
statt; der Stand dazu steht in `interoperabilitaet_pflegecoach.md`.

### 3.5 Produktschalter

Vier Umgebungsvariablen entscheiden über den Auslieferungszustand
(`lib/coach/config.ts`). Alle sind fail-safe voreingestellt:

| Schalter | Default | Wirkung, wenn gesetzt |
|----------|---------|----------------------|
| `COACH_DIPA_MODUS` | aus | Anspruchsprüfung und Kostenträgerbezug werden sichtbar |
| `COACH_FREISCHALTUNG_PFLICHT` | aus | Freischaltcode wird Zugangsvoraussetzung |
| `COACH_NUTZUNGSNACHWEIS_AKTIV` | aus | Nutzungsereignisse werden erfasst — zusätzlich immer einwilligungsabhängig |
| `COACH_CODE_PEPPER` | leer | Pfeffer für den Code-Hash |

**Auslieferungszustand:** Alle drei fachlichen Schalter sind aus. Der PflegeCoach
läuft damit als normaler digitaler Pflege- und Assistenzservice — ohne
Kostenträgerbezug, ohne Zugangscode, ohne Ereigniserfassung. Im gesamten
Produktbereich existiert keine Aussage zu Kostenübernahme, Erstattung oder Preisen.

## 4. Anwendungsumgebung

| Aspekt | Festlegung |
|--------|-----------|
| Ort der Nutzung | häusliche Umgebung der pflegebedürftigen Person |
| Gerät | Smartphone, Tablet oder Computer mit aktuellem Browser; keine Mindestausstattung darüber hinaus |
| Voraussetzung | Internetverbindung, Konto auf der Alltagsengel-Plattform |
| Sprache der Oberfläche | Deutsch |
| Nutzung durch Dritte | möglich und vorgesehen: gemeinsame Nutzung durch pflegebedürftige Person und Angehörige, ausdrücklich freigegeben |
| Nicht vorgesehen | Nutzung ohne Internetverbindung; Nutzung als Arbeitswerkzeug eines Pflegedienstes; Nutzung in stationärer Versorgung |

## 5. Was das Produkt voraussetzt und was nicht

**Setzt voraus:** die Fähigkeit, einfache Formulare zu lesen und auszufüllen —
allein oder mit Unterstützung. Für Unterstützung ist die geteilte Nutzung
vorgesehen.

**Setzt nicht voraus:** einen Pflegegrad (`coach_users.pflegegrad` ist ein
freiwilliges Feld ohne Zugangswirkung), einen Freischaltcode (im
Auslieferungszustand abgeschaltet), ein bestimmtes Gerät, Vorkenntnisse.

## 6. Bekannte Grenzen des Produkts

Diese Punkte werden hier benannt, nicht beschönigt:

* Die Inhalte in `lib/coach/inhalte.ts` tragen durchgehend den Prüfstatus
  `entwurf`; die pflegefachliche Freigabe steht aus und wird im Produkt sichtbar
  ausgewiesen (GAP-QS).
* Kein zweiter Faktor bei der Anmeldung (GAP-MFA).
* Kein externes Sicherheitszertifikat, kein Penetrationstest (GAP-TR03161,
  GAP-EXT-REVIEW).
* Kein verbindliches Austauschformat für die Coach-Daten (GAP-INTEROP).
* Die Freigabe an Angehörige und Pflegedienst ist im Datenmodell und in den
  Zugriffsregeln vollständig umgesetzt, hat aber noch keine Verwaltungsoberfläche
  (GAP-SHARES-UI).
* Erinnerungen sind geplante Einträge im Wochenplan, keine Push-Benachrichtigungen
  (GAP-PUSH).

Vollständige Liste: `dipav_gap_liste.md`. Was davon nur außerhalb des
Repositories erledigt werden kann: `docs/DIPA_EXTERNAL_ACTIONS.md`.
