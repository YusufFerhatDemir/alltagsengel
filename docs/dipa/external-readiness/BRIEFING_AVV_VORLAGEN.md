# Briefing — Auftragsverarbeitungsverträge (AVV) für den Digitalen PflegeCoach

**Produkt:** Digitaler PflegeCoach
**Hersteller:** Alltagsengel UG (haftungsbeschränkt), Neue Mainzer Straße 66-68, 60311 Frankfurt am Main
**Stand dieses Briefings:** 2026-08-15
**Status:** Briefing für Mandatsvergabe — **noch nicht beauftragt**
**DiPA-Matrix-Kennung:** DS-04 — EXTERNAL_EVIDENCE_REQUIRED

---

## Zweck und Einordnung

Dieses Briefing beschreibt die identifizierten Auftragsverarbeiter, den
aktuellen Vertragsstatus (keiner) und was für den Abschluss der AVVs benötigt
wird. Es ist ein **Teildokument** des umfassenderen Datenschutzpakets
(→ `BRIEFING_DATENSCHUTZ_KANZLEI.md`, Arbeitspaket 2 von 4).

**Rechtsgrundlage:** DSGVO Art. 28 (Auftragsverarbeiter). DiPAV § 5 Abs. 4
(Datenverarbeitung nur innerhalb EU/EWR oder mit Angemessenheitsbeschluss).

**Kernproblem:** Es liegt **kein einziger unterzeichneter AVV** vor. Solange
das so ist, bleibt die DSFA-Risikobewertung (R2.9) auf „hoch" und die
DiPA-Anforderung DS-04 unerfüllt.

---

## 1. Identifizierte Auftragsverarbeiter

Quelle: `audit/dipa/avv_dossier_pflegecoach.md` (Stand 2026-08-14)

### 1.1 Supabase Inc. — Kritikalität: HÖCHSTE

| Merkmal | Detail |
|---|---|
| Rolle | Auftragsverarbeiter (Art. 28 DSGVO) |
| Verarbeitete Daten | **Alle Produktdaten** inkl. Gesundheitsdaten (Art. 9), Anmeldedaten, MFA-Geheimnisse |
| Hosting-Region | Frankfurt (eu-central-1) — Supabase Pro-Projekt |
| Unterauftragnehmer | AWS (Frankfurt), unklar ob weitere |
| AVV-Status | **Nicht unterzeichnet** |
| Supabase-DPA | Supabase bietet eine Standard-DPA auf ihrer Website an — muss geprüft werden |

**Besondere Prüfpunkte:**
- Art.-9-Daten → erhöhter TOM-Anspruch
- Wer kann beim Anbieter technisch auf die Datenbank zugreifen?
- Wie wird das protokolliert?
- Wie lange bestehen Backups nach Nutzerlöschung fort? (→ Löschkonzept §6)
- Unterauftragnehmer-Regelung (Informationspflicht, Widerspruchsrecht)
- C5-Typ-2-Testat vorhanden? (→ TR-03161-3 O.Org_2)

### 1.2 Vercel Inc. — Kritikalität: MITTEL

| Merkmal | Detail |
|---|---|
| Rolle | Auftragsverarbeiter |
| Verarbeitete Daten | Verbindungsdaten (IP, Zeitpunkt, Pfad); Produktdaten fließen durch, werden nicht gespeichert |
| Hosting-Region | EU (iad1 / fra1 — konfigurierbar) |
| AVV-Status | **Nicht unterzeichnet** |
| Vercel-DPA | Standard-DPA verfügbar |

**Besondere Prüfpunkte:**
- Edge-Functions: werden Daten zwischengespeichert?
- Serverless-Functions: Logdaten, Aufbewahrung?
- Drittlandtransfer bei Edge-Network?

### 1.3 Resend Inc. — Kritikalität: NIEDRIG bis MITTEL

| Merkmal | Detail |
|---|---|
| Rolle | Auftragsverarbeiter |
| Verarbeitete Daten | E-Mail-Adresse, Betreff, Nachrichtentext (Systemnachrichten) |
| Gesundheitsdaten | Im Regelfall nein; Restrisiko über Freitextfeld `/pflegecoach/anfrage` |
| AVV-Status | **Nicht unterzeichnet** |

**Besondere Prüfpunkte:**
- E-Mail-Aufbewahrungsfristen
- Serverstandort (US? EU?)
- Drittlandtransfer → SCCs oder Angemessenheitsbeschluss?

### 1.4 Stripe Inc. — Sonderfall

| Merkmal | Detail |
|---|---|
| Rolle | **Juristisch zu klären** (eigenständig Verantwortlicher vs. Auftragsverarbeiter) |
| Verarbeitete Daten | Name, Rechnungsanschrift, E-Mail, Zahlungsmittel; **keine** Gesundheitsdaten |
| Aktuelle Betroffenheit | **Keine** — Bestellweg technisch abgeschaltet (`COACH_PREISE_FREIGEGEBEN` = aus) |
| AVV-Status | Stripe bietet eigene Vertragswerke an (Connected Account Agreement) |

**Besondere Prüfpunkte:**
- Eigenverantwortlich (dann kein AVV nötig) oder Auftragsverarbeiter?
- PCI-DSS-Compliance als TOM-Nachweis
- Kann vorerst zurückgestellt werden (kein aktiver Datenfluss)

---

## 2. Prüfcheckliste für jeden AVV

Aus `audit/dipa/avv_dossier_pflegecoach.md`, Abschnitt 2:

| Nr. | Prüfpunkt | Norm |
|---|---|---|
| 1 | Gegenstand, Dauer, Art und Zweck der Verarbeitung | Art. 28 Abs. 3 S. 1 |
| 2 | Art der personenbezogenen Daten | Art. 28 Abs. 3 S. 1 |
| 3 | Kategorien betroffener Personen | Art. 28 Abs. 3 S. 1 |
| 4 | Weisungsbindung | Art. 28 Abs. 3 lit. a |
| 5 | Vertraulichkeitsverpflichtung | Art. 28 Abs. 3 lit. b |
| 6 | Technisch-organisatorische Maßnahmen (TOMs) | Art. 28 Abs. 3 lit. c, Art. 32 |
| 7 | Unterauftragnehmer-Regelung | Art. 28 Abs. 2, Abs. 4 |
| 8 | Unterstützung bei Betroffenenrechten | Art. 28 Abs. 3 lit. e |
| 9 | Unterstützung bei Meldepflichten | Art. 28 Abs. 3 lit. f |
| 10 | Löschung/Rückgabe nach Vertragsende **mit Frist** | Art. 28 Abs. 3 lit. g |
| 11 | Nachweis- und Prüfrechte | Art. 28 Abs. 3 lit. h |
| 12 | Verarbeitungsort | DiPAV § 5 Abs. 4 |
| 13 | Drittlandtransfer: Übermittlungsgrundlage | Art. 44 ff. |

---

## 3. Vorgehensempfehlung

### 3.1 Option A: Im Gesamtpaket (empfohlen)

Die AVVs werden als Arbeitspaket 2 des Datenschutzpakets durch dieselbe
Kanzlei bearbeitet (→ `BRIEFING_DATENSCHUTZ_KANZLEI.md`). Vorteil:
Kohärenz mit DSFA, gleiche Datenkategorien, gleiche Kanzlei.

### 3.2 Option B: Standard-DPAs der Anbieter nutzen

Alle drei Hauptanbieter (Supabase, Vercel, Resend) bieten Standard-DPAs an.
Diese können von einer Kanzlei geprüft und ergänzt werden (schneller, günstiger).

**Risiko:** Standard-DPAs decken Art.-9-Spezifika oft nicht ab.

### 3.3 Option C: Eigene AVV-Vorlage

Eine Kanzlei erstellt eine AVV-Vorlage, die an alle drei Anbieter geschickt wird.

**Risiko:** US-Anbieter akzeptieren selten fremde Vorlagen.

**Empfehlung:** Option A oder B. Bei Supabase aufgrund der Art.-9-Daten
besonders sorgfältig prüfen, ob die Standard-DPA ausreicht.

---

## 4. Realistischer Kostenrahmen

| Leistung | Kostenrahmen | Dauer |
|---|---|---|
| 3 Standard-DPAs prüfen + Ergänzungsbedarf dokumentieren | 3.000–6.000 € | 2–4 Wochen |
| Eigene AVV-Vorlage erstellen + Verhandlung | 5.000–12.000 € | 4–8 Wochen |
| AVV als Teil des Gesamtpakets | Im Gesamtpreis 15.000–30.000 € | Im Gesamtzeitplan |
| Stripe-Rollenklärung (separat) | 1.500–3.000 € | 1–2 Wochen |

---

## 5. Intern vorbereitbare Schritte

| Schritt | Status | Aktion |
|---|---|---|
| Standard-DPAs der Anbieter herunterladen | Nicht erfolgt | Supabase, Vercel, Resend DPAs abrufen |
| Unterauftragnehmer-Listen anfragen | Nicht erfolgt | Bei allen drei Anbietern anfragen |
| C5-Testate anfragen | Nicht erfolgt | Supabase (für O.Org_2) |
| Backup-Aufbewahrungsfristen erfragen | Nicht erfolgt | Supabase (für Löschkonzept) |
| Serverstandorte bestätigen | Teilweise bekannt | Alle drei Anbieter bestätigen lassen |
| Datenflussdiagramm mit Anbietergrenzen | Vorhanden | `audit/dipa/datenfluesse_pflegecoach.md` aktualisieren |

---

## 6. Bereitzustellende Unterlagen

| Dokument | Inhalt |
|---|---|
| `audit/dipa/avv_dossier_pflegecoach.md` | AVV-Dossier mit Prüfliste und Anbieteranalyse |
| `audit/dipa/verarbeitungsverzeichnis_pflegecoach.md` | Art. 30 DSGVO |
| `audit/dipa/datenfluesse_pflegecoach.md` | Datenflüsse F1–F10 |
| `audit/dipa/loeschkonzept.md` | Löschfristen (für AVV-Klausel zu Löschung/Rückgabe) |
| Standard-DPAs der Anbieter | Noch zu beschaffen |

---

## 7. Klassifizierung

| Kriterium | Bewertung |
|---|---|
| MUSS EXTERN | **Ja** — Vertragsabschluss mit Dritten; juristische Prüfung intern nicht leistbar |
| KANN INTERN vorbereitet werden | **Ja** — Standard-DPAs beschaffen, Daten zusammentragen |
| Zusammenlegbar mit | DS-02 (DSFA), PROD-02 (MDR), VS-04 (Nutzungsbedingungen) → BRIEFING_DATENSCHUTZ_KANZLEI.md |
| Zeitklasse | Vor Antrag (Teil des Antragspakets) |
| Priorität | P0 |
| Besonderes Risiko | Supabase als Art.-9-Verarbeiter — Standard-DPA reicht möglicherweise nicht |
