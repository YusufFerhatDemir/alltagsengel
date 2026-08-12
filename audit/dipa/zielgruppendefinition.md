# Zielgruppendefinition — „Digitaler PflegeCoach"

**Stand:** 2026-08-09 · **Basis:** `audit/DIPA_REGULATORIK_2026-08-09.md` (Teil 2.1, 2.4)

---

## 1. Primäre Nutzergruppen (Doppelzielgruppe, ermöglicht durch die 1. DiPAV-ÄndV)

### 1.1 Pflegebedürftige (Produktrolle `pflegebeduerftig`)
- Pflegegrade 1–5 in **häuslicher Versorgung**; Schwerpunkt Pflegegrade 1–3
  (größte Selbständigkeitspotenziale).
- Kognitiv und sensorisch in der Lage, die Anwendung — ggf. mit Unterstützung — zu bedienen.
- Nutzenkategorie: Minderung von Beeinträchtigungen der Selbständigkeit, Entgegenwirken
  einer Verschlimmerung der Pflegebedürftigkeit (§ 40a SGB XI).
- **ORF-4 (offen):** vollständige Anspruchsberechtigung bei Pflegegrad 1 nach § 40b SGB XI
  ist vor Antragstellung zu verifizieren.

### 1.2 Pflegende Angehörige und sonstige ehrenamtlich Pflegende (Produktrolle `angehoerig`)
- Seit der 1. DiPAV-ÄndV (in Kraft 01.07.2026) eigenständig adressierbar.
- Nutzenkategorien: Stabilisierung der häuslichen Versorgung, Entlastung bei Pflegeaufgaben —
  ohne zwingenden direkten Effektnachweis beim Pflegebedürftigen.
- Produktfunktionen: Wissensmodule (Entlastungsleistungen, Selbstsorge, rückenschonendes
  Arbeiten), Belastungs-Selbsteinschätzung, gemeinsame Wochenstruktur.

### 1.3 Pflegedienst (Produktrolle `pflegedienst`)
- Rolle für die **Interaktion** gemäß § 40a SGB XI („in Interaktion von Pflegebedürftigen,
  Angehörigen und zugelassenen ambulanten Pflegeeinrichtungen"): Lesezugriff ausschließlich
  nach expliziter, widerruflicher Freigabe durch den Pflegebedürftigen (`coach_shares`).
- KEIN B2B-Werkzeug: keine Einsatzplanung, keine Abrechnung, keine Dokumentationspflege
  durch den Dienst im Produkt.

## 2. Nicht-Zielgruppen (Ausschlüsse)

- Personen ohne Pflegegrad (kein Leistungsanspruch nach § 40b SGB XI) — Nutzung im Pilot
  als freiwilliges Angebot bleibt davon unberührt.
- Stationär Versorgte.
- Professionelle Pflegefachkräfte als Endnutzer eines Arbeitswerkzeugs (B2B-Funktionalität
  von efy care ist ausdrücklich nicht Teil des Produkts).

## 3. Anforderungen aus der Zielgruppe an das Produkt (umgesetzt)

| Zielgruppen-Merkmal | Produktanforderung | Umsetzung |
|---|---|---|
| Hochaltrige Nutzer, Sehbeeinträchtigungen | Schrift skalierbar (bis „sehr groß"), Kontrastmodus, große Touch-Ziele ≥ 48 px, sichtbarer Tastatur-Fokus | `app/pflegecoach/pflegecoach.css`, `CoachShell.tsx` (serverseitig gespeicherte Präferenzen `coach_users.a11y_*`) |
| Geringe Technikvorerfahrung | Einfache Sprache, lineare Formulare, keine Fachbegriffe ohne Erklärung | alle `/pflegecoach`-Seiten |
| Schutzbedürftige Gesundheitsdaten | Ausdrückliche, versionierte, einzeln widerrufliche Einwilligungen | `coach_consents`, Onboarding + Einstellungen |
| Doppelzielgruppe in einem Haushalt | Einwilligungsbasierte Datenfreigabe Pflegebedürftige/r ↔ Angehörige/r | `coach_shares` (RLS: Lesezugriff nur bei aktiver Freigabe) |

## 4. Abgrenzung zum Alltagsengel-Bestandsgeschäft

Die Zielgruppen überschneiden sich mit dem Kundenstamm des Betreuungsdienstes. Daraus folgt
(DiPAV-Werbefreiheit, Interessenkonflikt-Vermeidung — ORF-5):
- Keine Bewerbung von Alltagsengel-Dienstleistungen im Produkt; keine Cross-Selling-Nutzung
  der PflegeCoach-Daten (technisch: kein Admin-/Betriebszugriff auf `coach_*`-Tabellen,
  keine Marketing-Tracker im `/pflegecoach`-Pfad).
- Pilot-Rekrutierung NICHT ausschließlich aus dem eigenen Kundenstamm (siehe `pilotdesign.md` §2).
- Klärung Herstellerrolle bei Mehrkanal-Vertrieb: ORF-11 / BfArM-Frage 15.
