# MFA-Dokumentation (Zweiter Faktor) — Digitaler PflegeCoach

**Stand:** 2026-08-14
**Zweck:** Beschreibung des TOTP-Verfahrens, seiner Einrichtung und seiner serverseitigen Durchsetzung — deckt DiPA-Matrix SEC-03 ab.

---

## 1. Status

**ERLEDIGT (seit 14.08.2026)** — DiPA-Matrix, Klasse **B** (technisch
umsetzbar, lag in eigener Hand), Status ERLEDIGT. Umsetzung:
`lib/coach/mfa.ts` (9 Tests in `lib/coach/mfa.test.ts`),
`/pflegecoach/einstellungen/sicherheit` (Einrichten/Entfernen), Code-Abfrage
im Login, serverseitige Durchsetzung in `lib/coach/api-auth.ts`.

## 2. Verfahren

TOTP (RFC 6238) über die Auth-Schicht von Supabase. **Kein SMS-Faktor** —
bewusste Entscheidung: SMS ist nachweislich angreifbar (SIM-Swap) und würde
zusätzlich eine Telefonnummer als personenbezogenes Datum erzeugen
(Datenminimierung, Art. 5 Abs. 1 lit. c DSGVO).

## 3. Wo einrichtbar

`/pflegecoach/einstellungen/sicherheit` — Einrichten und Entfernen eines
Faktors. Die Seite ist Teil des durch Anmeldung geschützten Produktbereichs
(bestätigt in `e2e/pflegecoach.spec.ts`, Liste `GESCHUETZT`). Beim Login wird
bei Bedarf zusätzlich ein Code aus der Authenticator-App abgefragt.

## 4. Voreinstellung: freiwillig, nicht verpflichtend

Default: `COACH_MFA_PFLICHT` (Umgebungsvariable) = **nicht gesetzt / `false`**
→ Einrichtung ist freiwillig. Begründung aus `lib/coach/mfa.ts` (Kommentar im
Quelltext, wörtlich übernommen):

> Die Zielgruppe umfasst hochaltrige und technisch wenig geübte Menschen; eine
> erzwungene Authenticator-App würde einen Teil von ihnen vom eigenen
> Pflegetagebuch aussperren. Der Faktor ist vorhanden, einrichtbar und wird —
> sobald eingerichtet — technisch durchgesetzt.

Der Schalter wirkt **nur auf schreibende Zugriffe**. Lesen, Export und
Löschung bleiben immer offen — sonst würde eine spätere Umstellung Nutzer von
ihren eigenen Daten aussperren.

## 5. Serverseitige Durchsetzung (fail-closed für Nutzer mit Faktor)

Kernregel aus `lib/coach/api-auth.ts` (`pruefeSchreibzugriff()`), Prüfreihenfolge:

1. **Zweiter Faktor zuerst.** Wer einen verifizierten Faktor eingerichtet hat,
   dessen Sitzung aber nur auf AAL1 steht, darf **nicht schreiben** —
   unabhängig vom `COACH_MFA_PFLICHT`-Schalter. Ohne diese Durchsetzung wäre
   der eingerichtete Faktor wirkungslos: Ein gestohlenes Passwort käme
   weiterhin an die Gesundheitsdaten.
2. **Pflicht-Prüfung erst danach**, und nur für Nutzer **ohne** eingerichteten
   Faktor: greift nur, wenn `COACH_MFA_PFLICHT=true`.

Die Kernfunktion `mfaSperre()` (`lib/coach/mfa.ts`):

```
mfaSperre(stand):
  wenn stand.eingerichtet UND NICHT stand.niveauErfuellt
    → MFA_ZWEITER_FAKTOR_NOETIG (403)
  sonst wenn stand.pflicht UND NICHT stand.eingerichtet
    → MFA_EINRICHTUNG_NOETIG (403)
  sonst → erlaubt
```

Ohne eingerichteten Faktor gilt AAL1 als ausreichend — die Sperre trifft nur
Nutzer, die bereits einen Faktor besitzen, aber sich (noch) nicht mit AAL2
angemeldet haben. Bei unbekanntem Sitzungsniveau (z. B. Fehler bei der
Abfrage) gilt für Nutzer **mit** Faktor: nicht erfüllt — fail-closed, kein
Durchschlüpfen bei technischem Fehler.

## 6. Nur bestätigte Faktoren zählen

Ein angefangener, nie bestätigter Einrichtungsversuch (`status: 'unverified'`)
zählt nicht als eingerichteter Faktor — weder für die Sperre noch für die
Pflicht-Prüfung. Verhindert, dass ein abgebrochener QR-Code-Scan versehentlich
den Zugriff blockiert oder eine Scheinsicherheit erzeugt.

## 7. Test-Nachweis (`lib/coach/mfa.test.ts`, 9 Tests)

| Test | Geprüftes Verhalten |
|---|---|
| nur bestätigte Faktoren zählen | unverifizierte Einrichtungen werden ignoriert |
| ohne Faktor ist AAL1 ausreichend | kein Nutzer wird ohne eingerichteten Faktor ausgesperrt |
| mit Faktor sperrt eine AAL1-Sitzung das Schreiben | Kernregel der Durchsetzung |
| mit Faktor und AAL2 ist das Schreiben erlaubt | positiver Gegenfall |
| unbekanntes Niveau gilt bei eingerichtetem Faktor als nicht erfüllt | fail-closed bei Fehlern |
| Pflichtmodus verlangt die Einrichtung, sperrt aber mit anderem Code | Unterscheidung `MFA_EINRICHTUNG_NOETIG` vs. `MFA_ZWEITER_FAKTOR_NOETIG` |
| Pflichtmodus: angefangene Einrichtung genügt nicht | siehe §6 |
| Code-Abfrage beim Anmelden nur, wenn ein höheres Niveau erreichbar ist | Login-Flow |
| Faktoren ohne Namen bekommen eine verständliche Bezeichnung | UI-Detail (`faktorName()`) |

## 8. Offene Frage

**Ob `COACH_MFA_PFLICHT` verbindlich (statt optional) gesetzt werden muss,
ist offen und hängt an der BfArM-Beratung** (DiPA-Matrix, Nächste Aktion zu
SEC-03: „Entscheidung über `COACH_MFA_PFLICHT` mit dem BfArM klären", Teil des
Fragenkatalogs `audit/dipa/bfarm_fragenkatalog.md`). Bis zur Klärung bleibt
der Schalter auf freiwillig — eine Umstellung ist eine Deployment-, keine
Code-Entscheidung.

## 9. Bezug zu älteren Konzeptdokumenten

`audit/dipa/dsfa_pflegecoach.md`, `verschluesselungskonzept.md` und
`rollen_rechtekonzept.md` (Stand 12./13.08.2026) führen einen fehlenden
zweiten Faktor noch als offenes Risiko (GAP-MFA, dort als „hoch" bewertet).
Dieser Stand ist durch die Umsetzung vom 14.08.2026 überholt — die DSFA selbst
(siehe `docs/dipa/02_DATENSCHUTZ_TOM_DSFA_VORBEREITUNG.md`) ist aber weiterhin
nicht abgeschlossen und müsste die Risikobewertung entsprechend nachziehen.

---

## Quellen

* `lib/coach/mfa.ts`
* `lib/coach/mfa.test.ts`
* `lib/coach/api-auth.ts`
* `e2e/pflegecoach.spec.ts` (Nachweis, dass `/pflegecoach/einstellungen/sicherheit` geschützter Bereich ist)
* `docs/DIPA_MATRIX_FINAL.md` (SEC-03)
* `audit/dipa/bfarm_fragenkatalog.md`
