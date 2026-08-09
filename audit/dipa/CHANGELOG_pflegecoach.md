# Changelog — Digitaler PflegeCoach (Produktversion)

Separater Versionsstrang des DiPA-Produkts (unabhängig von Plattform-Deployments).
Jede MINOR-/MAJOR-Änderung ist vor Release regulatorisch zu bewerten
(Änderungsanzeige? — BfArM-Frage 20, `bfarm_fragenkatalog.md`).

## 0.1.0 — 2026-08-09 (MVP, nicht veröffentlicht)

Erster Stand des Produkts. Nicht produktiv (Migration `20260819010000` nicht angewendet,
Push-/Deploy-Sperre aktiv).

- Datenmodell `coach_*` (10 Tabellen inkl. `coach_audit_log`), RLS nutzer-eigen +
  widerrufliche Freigaben, kein Betriebs-/Admin-Zugriff, anon vollständig entzogen.
- Append-only-Audit aller Schreibzugriffe (Metadaten ohne Datenwerte).
- API `/api/coach/*` (12 Routen, Session-Client/RLS, Whitelisting).
- UI `/pflegecoach` (13 Seiten): Onboarding mit versionierten Art.-9-Einwilligungen,
  Assessment, SMART-Ziele, Wochenplan, Mobilität, Alltag, Angehörige, Belastungs-Check,
  Verlauf, unveränderliche Berichte (Druck/PDF), Einstellungen, Datenschutz (Entwurf).
- Barrierefreiheit: Schriftskalierung (3 Stufen), Kontrastmodus, Fokus-Stile,
  Touch-Ziele ≥ 48 px, Skip-Link, `prefers-reduced-motion`.
- Werbe-/Trackerfreiheit im Produktpfad technisch erzwungen.
- Datenexport `de.alltagsengel.pflegecoach.export` v1.0 (JSON, Art. 20 DSGVO).
- Regelbasierte, rein organisatorische Anpassungs-Hinweise (MDR-Verbotsliste im Code).
- Inhalte mit `pruefstatus: 'entwurf'` (fachliche Freigabe ausstehend).
