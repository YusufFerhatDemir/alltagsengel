-- ═══════════════════════════════════════════════════════════════════════════
-- email_campaign_logs.provider_id — Index und Eindeutigkeit
--
-- WARUM DIESE MIGRATION NOETIG WURDE
--
-- Mit /api/marketing/resend-webhook gibt es seit dem 31.08.2026 zum ersten
-- Mal einen Leser, der eine Zeile UEBER provider_id sucht:
--
--     select ... from email_campaign_logs where provider_id = '<resend-id>'
--
-- Die Tabelle hatte fuer diese Spalte keinen Index. Die vorhandenen drei
-- decken (campaign_id, empfaenger), (campaign_id, status) und
-- (organization_id, empfaenger) ab — keiner davon hilft hier. Jedes
-- eintreffende Ereignis loeste damit einen Sequential Scan aus, und der
-- Zustellweg erzeugt je Empfaenger bis zu fuenf Ereignisse (sent,
-- delivered, opened, clicked, bounced). Bei einer Kampagne an 2.000
-- Adressen sind das bis zu 10.000 Scans ueber eine Tabelle, die genau
-- durch dieselbe Kampagne um 2.000 Zeilen gewachsen ist.
--
-- ── WARUM UNIQUE UND NICHT NUR EIN INDEX ──────────────────────────────────
--
-- Die Route liest mit `.maybeSingle()`. Gaebe es zwei Zeilen mit derselben
-- provider_id, wuerde PostgREST das als Fehler melden, die Route
-- antwortete mit 500 — und Resend wiederholte die Nachricht, mit demselben
-- Ergebnis, tagelang. Die Eindeutigkeit macht diesen Zustand unmoeglich,
-- statt ihn nur unwahrscheinlich zu lassen.
--
-- Fachlich ist sie ohnehin richtig: provider_id ist die Kennung EINER
-- Sendung beim Versanddienst. Zwei Logzeilen mit derselben Kennung waeren
-- ein Fehler im Versandweg, kein zulaessiger Zustand.
--
-- ── WARUM PARTIELL (WHERE provider_id IS NOT NULL) ────────────────────────
--
-- Der Vor-Eintrag in lib/marketing/versand.ts entsteht VOR dem
-- Provider-Aufruf und traegt deshalb provider_id = NULL; erst nach dem
-- Versand wird sie nachgetragen. Ein UNIQUE ueber die ganze Spalte waere
-- in Postgres zwar zulaessig (NULL kollidiert nicht mit NULL), der
-- partielle Index ist aber kleiner und sagt die Absicht deutlicher: er
-- gilt fuer versendete Zeilen.
--
-- ── VORSICHT BEIM ANWENDEN ────────────────────────────────────────────────
--
-- CREATE UNIQUE INDEX scheitert, wenn im Bestand bereits Doppel stehen.
-- Der Block darunter prueft das VORHER und bricht mit einer verstaendlichen
-- Meldung ab, statt eine rohe Indexverletzung zu werfen. Live sind zum
-- Zeitpunkt dieser Migration 0 Zeilen in der Tabelle.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  doppelte integer;
BEGIN
  SELECT count(*) INTO doppelte
  FROM (
    SELECT provider_id
    FROM public.email_campaign_logs
    WHERE provider_id IS NOT NULL
    GROUP BY provider_id
    HAVING count(*) > 1
  ) t;

  IF doppelte > 0 THEN
    RAISE EXCEPTION
      'email_campaign_logs: % provider_id-Werte kommen mehrfach vor. Der eindeutige '
      'Index kann nicht angelegt werden, ohne dass vorher entschieden ist, welche '
      'Zeile gilt. Abfrage: select provider_id, count(*) from email_campaign_logs '
      'where provider_id is not null group by 1 having count(*) > 1;', doppelte;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS email_campaign_logs_provider_id
  ON public.email_campaign_logs (provider_id)
  WHERE provider_id IS NOT NULL;

COMMENT ON INDEX public.email_campaign_logs_provider_id IS
  'Zugriffsweg des Resend-Webhooks (/api/marketing/resend-webhook) und zugleich die '
  'Zusicherung, dass eine Provider-Kennung hoechstens eine Logzeile trifft — '
  '.maybeSingle() dort wuerde sonst 500 liefern und Resend endlos wiederholen lassen.';
