# Vitalwerte-Modul — Regulatorische Einordnung (MDR)

**Status: OFFEN — Grenzwert-Alarmfunktion NICHT produktiv freigegeben.**
Stand: 2026-08-09

## Kurzfassung

Das Vitalwerte-Modul erfasst und dokumentiert Vitalparameter und stellt sie als
Verlauf dar. Diese **Dokumentations- und Verlaufsfunktion ist freigegeben** und
gilt nicht als Medizinprodukt.

Die **automatische Bewertung von Messwerten gegen Grenzwerte** (Ausgabe von
„Warnung"/„kritisch", Alarm-Ampel, farbliche Bewertung) ist eine potenzielle
Medizinprodukt-Funktion. Solange die untenstehenden Punkte nicht geklärt und
dokumentiert sind, bleibt sie **fail-closed deaktiviert** über den Kill-Switch
`VITALS_GRENZWERT_ALARME_AKTIV` (Default: aus; siehe `lib/vitals/config.ts`).

## Was ist AUS, solange nicht freigegeben

Bei deaktivierter Alarmfunktion (Default):

- Keine automatische Klassifizierung ok/Warnung/kritisch in der UI.
- Keine Alarm-Ampel auf der Übersicht, keine kritisch-Banner bei Erfassung.
- Keine Grenzwert-Bänder und keine alarmfarbige Punktdarstellung im Chart —
  nur die neutrale Verlaufskurve.
- `/api/vitals` (POST) liefert `bewertung: null`; `/api/vitals/alarme` liefert
  eine leere Liste.
- Grenzwerte können vorbereitend hinterlegt werden, werden aber nicht ausgewertet.

## Was ist ERLAUBT (nicht betroffen)

- Erfassung/Speicherung aller Vitalparameter.
- Anzeige der Messwerte als Liste und als Zeitreihen-Verlauf.
- Manuelle Notizen an Messungen.

## Vor Produktiv-Aktivierung zu klären und zu dokumentieren

Diese Punkte MÜSSEN vor dem Setzen von `VITALS_GRENZWERT_ALARME_AKTIV=true`
geklärt, dokumentiert und fachlich/juristisch abgenommen sein:

1. **Zweckbestimmung** — Wozu dient die Alarmfunktion konkret? Reine
   Erinnerung/Organisationshilfe oder klinische Entscheidungsunterstützung?
   Wortlaut der Zweckbestimmung festlegen.
2. **Medizinproduktstatus** — Ist die Funktion mit dieser Zweckbestimmung ein
   Medizinprodukt nach MDR (Art. 2, Regel 11 Software)? Falls ja: Klasse.
   Abgrenzung dokumentieren (ggf. mit benannter Stelle / Regulatory-Beratung).
3. **Risiko** — Risikoanalyse: Was passiert bei falsch-positiven/-negativen
   Alarmen, fehlender Übermittlung, veralteten Messwerten? Wer reagiert auf
   Alarme, in welcher Zeit? Restrisiko bewerten.
4. **Konformitätsanforderungen** — Falls Medizinprodukt: notwendige Schritte
   (technische Dokumentation, QMS/ISO 13485, klinische Bewertung, CE) benennen
   und Zuständigkeit/Termin festhalten.

## Freigabe-Prozess (technisch)

1. Punkte 1–4 oben geklärt und in diesem Dokument (oder Verweis) dokumentiert.
2. Fachliche + regulatorische Abnahme durch verantwortliche Person schriftlich.
3. Erst dann `VITALS_GRENZWERT_ALARME_AKTIV=true` in der Zielumgebung setzen.
4. End-to-End-, Rollen/Rechte-, Security- und Production-Verifikation mit
   aktivierter Funktion wiederholen (die Alarm-Pfade sind bei Default-aus nicht
   produktiv testbar).

Bis dahin: Modul bleibt technisch vorbereitet, Alarme bleiben aus.
