-- ═══════════════════════════════════════════════════════════════════════════
-- MARKETING-/CRM-SCHICHT — Einwilligung, Sperrliste, Kampagnen, Zustellspur
--
-- WAS DIESE MIGRATION LOEST
-- Das System kann heute Mails verschicken (lib/notifications.ts, Resend,
-- Absender „Alltagsengel <info@alltagsengel.care>"), aber ausschliesslich
-- TRANSAKTIONSPOST: Rechnung, Mahnung, Terminerinnerung, Passwortreset.
-- Solche Mails brauchen keine Einwilligung — sie erfuellen einen Vertrag
-- (Art. 6 Abs. 1 lit. b DSGVO).
--
-- WERBUNG ist rechtlich etwas voellig anderes. Sie braucht nach § 7 Abs. 2
-- Nr. 2 UWG eine vorherige ausdrueckliche Einwilligung, und die muss
-- nachweisbar sein (Art. 7 Abs. 1 DSGVO — Rechenschaftspflicht). Ein
-- System, das beides ueber denselben Weg verschickt, kann diesen Nachweis
-- nicht fuehren: es weiss hinterher nicht, ob eine Mail Pflicht war oder
-- Werbung.
--
-- Deshalb sind Einwilligung und Sperrliste hier EIGENE Tabellen und keine
-- Spalten an profiles. Drei Gruende:
--
--   1. WIDERSPRUCH UEBERLEBT DAS KONTO. Wer der Werbung widerspricht und
--      spaeter sein Konto loescht, darf nicht dadurch wieder anschreibbar
--      werden, dass der Widerspruch mit dem Konto verschwand. Deshalb steht
--      die Sperrliste auf der ADRESSE, nicht auf der Kontokennung, und sie
--      wird von der Kontoloeschung ausdruecklich NICHT angefasst.
--
--   2. EINWILLIGUNG IST EIN VORGANG, KEIN ZUSTAND. „hat eingewilligt" als
--      Boolean beantwortet die Frage der Aufsichtsbehoerde nicht. Die
--      lautet: wann, wofuer, ueber welchen Weg, von welcher IP, gegen
--      welchen Text. Jede Erteilung und jeder Widerruf ist deshalb eine
--      eigene Zeile; die aktuelle Lage ergibt sich aus der juengsten.
--
--   3. NICHT JEDER EMPFAENGER HAT EIN KONTO. Newsletter-Anmeldungen von der
--      Website haben keine user_id. `user_id` ist deshalb nullable und die
--      Adresse ist der fuehrende Schluessel.
--
-- ── DER RIEGEL LIEGT NICHT NUR IM CODE ─────────────────────────────────────
-- `email_campaigns.versendet_am` traegt einen UNIQUE-Teilindex je Kampagne
-- (`email_campaigns_einmal_versendet`). Ein zweiter Massenversand derselben
-- Kampagne laesst sich damit nicht protokollieren, also findet er nicht
-- statt — dieselbe Bauart wie `pilot_send_gate_einmal_verbraucht` beim
-- Erstversand von Rechnungen (20261005000000).
--
-- `marketing_automations.aktiv` steht auf DEFAULT false und traegt einen
-- CHECK, der eine aktive Automation ohne Freigabevermerk verbietet. Die
-- Automationen sind ausdruecklich VORBEREITET und NICHT scharf.
--
-- ── ZUSTELLSPUR ────────────────────────────────────────────────────────────
-- `email_campaign_logs` ist die einzige Stelle, an der steht, ob eine
-- Werbemail tatsaechlich rausging. Ohne sie waere „gesendet" eine Behauptung
-- des Anwendungscodes — dieselbe Klasse Fehler wie beim Rechnungsversand,
-- wo `sent_at` ohne `frozen_at` einen Versand vortaeuschte.
--
-- Rollback: 20261019000001_rollback_marketing_crm.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══ 1) EINWILLIGUNGEN ═════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.marketing_consents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),

  -- Kontobezug, wenn es ein Konto gibt. SET NULL, damit eine
  -- Kontoloeschung nicht an dieser Zeile scheitert; die Zeile selbst
  -- raeumt der Loeschlauf ueber den Loeschkatalog ab.
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Der fuehrende Schluessel. Kleingeschrieben und getrimmt — die
  -- Normalisierung passiert im Code (normalisiereAdresse), der CHECK
  -- haelt nur fest, dass hier nichts Grossgeschriebenes ankommt.
  email           text NOT NULL CHECK (email = lower(email) AND email LIKE '%@%'),

  consent_type    text NOT NULL CHECK (consent_type IN (
                    'newsletter',        -- allgemeiner Verteiler
                    'produktinfo',       -- Neuigkeiten zum Leistungsangebot
                    'engel_einsaetze',   -- Einsatzangebote an Engel
                    'umfragen'           -- Zufriedenheits- und Marktbefragung
                  )),

  granted_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz,

  -- Woher die Einwilligung stammt. Fuer den Nachweis nach Art. 7 Abs. 1
  -- DSGVO ist das der wichtigste Teil: „Doppel-Opt-in ueber das Formular
  -- auf der Startseite" ist eine Aussage, „irgendwo eingetragen" nicht.
  source          text NOT NULL CHECK (source IN (
                    'website_formular', 'doppel_opt_in', 'registrierung',
                    'vertrag', 'telefonisch', 'schriftlich', 'import'
                  )),

  -- Die IP zum Zeitpunkt der Erteilung. inet, nicht text: so laesst sich
  -- spaeter nach Netz suchen, und ein Tippfehler faellt beim Schreiben auf.
  ip_address      inet,

  -- Gegen welchen Einwilligungstext eingewilligt wurde. Aendert sich der
  -- Text, ist die alte Einwilligung nicht automatisch die neue.
  text_version    text NOT NULL DEFAULT 'v1',

  notiz           text,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Ein Widerruf, der vor der Erteilung liegt, ist ein Tippfehler.
  CONSTRAINT marketing_consents_widerruf_nach_erteilung
    CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

-- Hoechstens EINE offene Einwilligung je Adresse und Art. Ohne diesen
-- Index waere „ist eingewilligt?" eine Frage mit mehreren gleichzeitigen
-- Antworten — und der Empfaenger bekaeme die Mail so oft, wie es Zeilen
-- gibt.
CREATE UNIQUE INDEX IF NOT EXISTS marketing_consents_offen_je_adresse
  ON public.marketing_consents (organization_id, email, consent_type)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_consents_user
  ON public.marketing_consents (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_consents_org
  ON public.marketing_consents (organization_id);

-- ═══ 2) SPERRLISTE ═════════════════════════════════════════════════════════
--
-- WARUM DIE ADRESSE HIER IM KLARTEXT STEHT
-- Ein Hash waere datensparsamer, macht die Liste aber unpruefbar: niemand
-- koennte einer Person auf Nachfrage sagen, ob sie gesperrt ist, und ein
-- Betreiber koennte einen fehlerhaften Eintrag nicht finden. Die
-- Rechtsgrundlage fuer das Aufbewahren ist Art. 6 Abs. 1 lit. c i. V. m.
-- Art. 21 Abs. 3 DSGVO: um dem Widerspruch dauerhaft zu entsprechen, MUSS
-- die Adresse gespeichert bleiben. Genau deshalb ist die Liste auch von der
-- Kontoloeschung ausgenommen.
CREATE TABLE IF NOT EXISTS public.email_suppression_list (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),

  email           text NOT NULL CHECK (email = lower(email) AND email LIKE '%@%'),

  reason          text NOT NULL CHECK (reason IN (
                    'abmeldung',        -- selbst abgemeldet (Art. 21 DSGVO)
                    'hard_bounce',      -- Adresse existiert nicht
                    'soft_bounce_dauerhaft',
                    'spam_beschwerde',  -- Empfaenger meldete als Spam
                    'manuell',          -- vom Betrieb gesetzt
                    'ungueltig'         -- Adresse formal unbrauchbar
                  )),

  added_at        timestamptz NOT NULL DEFAULT now(),
  notiz           text,
  -- Wer den Eintrag von Hand gesetzt hat. Bei Abmeldung und Bounce NULL,
  -- weil dort kein Mensch beteiligt war.
  gesetzt_von     uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Eine Adresse steht einmal auf der Liste. Ein zweiter Grund ueberschreibt
-- den ersten nicht — der Eintrag wird beim Anlegen zusammengefuehrt (Upsert
-- auf diesen Index), der aelteste Grund bleibt stehen.
CREATE UNIQUE INDEX IF NOT EXISTS email_suppression_list_adresse
  ON public.email_suppression_list (organization_id, email);

-- ═══ 3) VORLAGEN ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),

  -- Stabiler Schluessel, ueber den der Code die Vorlage findet.
  template_key    text NOT NULL,
  name            text NOT NULL,

  -- An wen sich die Vorlage richtet. Steuert, welche Segmente ueberhaupt
  -- zulaessig sind: eine Engel-Vorlage an Kundschaft waere ein Fehler,
  -- den man nach dem Versand nicht mehr korrigiert.
  zielgruppe      text NOT NULL CHECK (zielgruppe IN ('kunde', 'engel', 'bewerber', 'lead', 'alle')),

  -- Welche Einwilligung diese Vorlage voraussetzt. NULL ist ausdruecklich
  -- NICHT erlaubt: es gibt keine Werbevorlage ohne Einwilligungsart.
  consent_type    text NOT NULL CHECK (consent_type IN (
                    'newsletter', 'produktinfo', 'engel_einsaetze', 'umfragen'
                  )),

  betreff         text NOT NULL,
  html            text NOT NULL,
  -- Textteil fuer Empfaenger, die kein HTML anzeigen. Fehlt er, baut der
  -- Code ihn aus dem HTML — deshalb nullable.
  text_teil       text,

  aktiv           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_templates_key
  ON public.email_templates (organization_id, template_key);

-- ═══ 4) KAMPAGNEN ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),

  name            text NOT NULL,
  template_key    text NOT NULL,

  -- Der Segmentschluessel aus lib/marketing/segmente.ts. Als text und
  -- nicht als jsonb-Filter: ein frei zusammensetzbarer Filter waere eine
  -- Abfrage, die jemand ueber die Oberflaeche in die Datenbank schreibt.
  -- Die zulaessigen Segmente stehen im Code und werden dort geprueft.
  segment_key     text NOT NULL,

  status          text NOT NULL DEFAULT 'entwurf' CHECK (status IN (
                    'entwurf', 'geplant', 'pausiert', 'versendet', 'abgebrochen'
                  )),

  geplant_fuer    timestamptz,

  -- Ergebnis des letzten Trockenlaufs. `empfaenger_anzahl` ist die Zahl
  -- der Adressen, die NACH Einwilligung und Sperrliste uebrig blieben —
  -- nicht die Groesse des Segments. Der Unterschied ist der eigentliche
  -- Wert der Anzeige.
  dry_run_am      timestamptz,
  dry_run_ergebnis jsonb,
  empfaenger_anzahl integer,

  -- ── Freigaberiegel ───────────────────────────────────────────────────
  -- Ein Versand braucht eine Freigabe durch einen Menschen. Die Freigabe
  -- ist an die Kampagne UND an die beim Trockenlauf ermittelte
  -- Empfaengerzahl gebunden: waechst das Segment zwischen Freigabe und
  -- Versand, gilt die Freigabe nicht mehr.
  freigegeben_am  timestamptz,
  freigegeben_von uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  freigegeben_fuer_anzahl integer,

  versendet_am    timestamptz,
  versendet_von   uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  erstellt_von    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Freigabe ohne Trockenlauf gibt es nicht: niemand gibt eine Zahl frei,
  -- die er nicht gesehen hat.
  CONSTRAINT email_campaigns_freigabe_braucht_dry_run
    CHECK (freigegeben_am IS NULL OR (dry_run_am IS NOT NULL AND freigegeben_fuer_anzahl IS NOT NULL)),

  -- Versand ohne Freigabe gibt es nicht.
  CONSTRAINT email_campaigns_versand_braucht_freigabe
    CHECK (versendet_am IS NULL OR freigegeben_am IS NOT NULL),

  -- Geplant ohne Termin ist kein Plan.
  CONSTRAINT email_campaigns_geplant_braucht_termin
    CHECK (status <> 'geplant' OR geplant_fuer IS NOT NULL)
);

-- DER RIEGEL: eine Kampagne kann hoechstens EINMAL als versendet
-- eingetragen werden. Ein zweiter Massenversand ist damit nicht
-- protokollierbar und findet nicht statt.
CREATE UNIQUE INDEX IF NOT EXISTS email_campaigns_einmal_versendet
  ON public.email_campaigns (id)
  WHERE versendet_am IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_campaigns_org_status
  ON public.email_campaigns (organization_id, status);

-- ═══ 5) ZUSTELLSPUR ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_campaign_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  campaign_id     uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,

  recipient_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  empfaenger      text NOT NULL,

  -- Die Kennung, die der Versanddienst zurueckgibt. Ohne sie ist
  -- „gesendet" eine Behauptung des eigenen Codes — siehe
  -- lib/notifications.ts, wo genau dieser Fall schon einmal auftrat.
  provider_id     text,

  status          text NOT NULL DEFAULT 'geplant' CHECK (status IN (
                    'geplant', 'gesendet', 'zugestellt', 'geoeffnet',
                    'geklickt', 'unzustellbar', 'abgemeldet', 'fehler'
                  )),

  sent_at         timestamptz,
  delivered_at    timestamptz,
  opened_at       timestamptz,
  clicked_at      timestamptz,
  bounced_at      timestamptz,
  unsubscribed_at timestamptz,

  fehler_text     text,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Status 'gesendet' ohne Zeitstempel waere eine leere Aussage.
  CONSTRAINT email_campaign_logs_gesendet_braucht_zeit
    CHECK (status = 'geplant' OR status = 'fehler' OR sent_at IS NOT NULL)
);

-- Ein Empfaenger bekommt eine Kampagne genau einmal. Der Index ist die
-- Doppelversand-Sperre auf Empfaengerebene.
CREATE UNIQUE INDEX IF NOT EXISTS email_campaign_logs_je_empfaenger
  ON public.email_campaign_logs (campaign_id, empfaenger);

CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_kampagne
  ON public.email_campaign_logs (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_empfaenger
  ON public.email_campaign_logs (organization_id, empfaenger);

-- ═══ 6) AUTOMATIONEN — VORBEREITET, NICHT SCHARF ═══════════════════════════
CREATE TABLE IF NOT EXISTS public.marketing_automations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),

  automation_key  text NOT NULL,
  name            text NOT NULL,
  beschreibung    text,

  trigger_typ     text NOT NULL CHECK (trigger_typ IN (
                    'registrierung_unvollstaendig',
                    'engel_ohne_einsatz',
                    'kunde_ohne_buchung',
                    'lange_kein_einsatz',
                    'lange_keine_buchung'
                  )),

  -- Nach wie vielen Tagen der Trigger greift. Mehrere Stufen einer
  -- Automation sind mehrere Zeilen (3 / 7 / 14 Tage).
  verzoegerung_tage integer NOT NULL CHECK (verzoegerung_tage > 0 AND verzoegerung_tage <= 365),

  template_key    text NOT NULL,
  consent_type    text NOT NULL CHECK (consent_type IN (
                    'newsletter', 'produktinfo', 'engel_einsaetze', 'umfragen'
                  )),

  -- STANDARD IST AUS. Eine Automation, die beim Anlegen laeuft, ist eine
  -- Automation, die niemand bewusst eingeschaltet hat.
  aktiv           boolean NOT NULL DEFAULT false,
  aktiviert_am    timestamptz,
  aktiviert_von   uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Aktiv ohne Vermerk, wer wann eingeschaltet hat, gibt es nicht. Damit
  -- laesst sich ein stilles UPDATE aktiv=true nicht durchfuehren, ohne
  -- eine Spur zu hinterlassen.
  CONSTRAINT marketing_automations_aktiv_braucht_vermerk
    CHECK (aktiv = false OR (aktiviert_am IS NOT NULL AND aktiviert_von IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_automations_key
  ON public.marketing_automations (organization_id, automation_key);

-- ═══ 7) RLS ════════════════════════════════════════════════════════════════
--
-- Alle sechs Tabellen: nur Administration, plus RESTRICTIVE Mandantenzaun.
-- Kein Selbstlesen fuer Betroffene ueber RLS — die Auskunft ueber die
-- eigene Einwilligung laeuft ueber den Auskunftsweg (lib/dsgvo/auskunft.ts)
-- und nicht ueber eine eigene Policy, weil `email` der fuehrende Schluessel
-- ist und eine Policy auf auth.uid() genau die Zeilen NICHT faende, die
-- kein Konto haben.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'marketing_consents', 'email_suppression_list', 'email_templates',
    'email_campaigns', 'email_campaign_logs', 'marketing_automations'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public'
        AND tablename = t AND policyname = t || '_admin'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (public.is_admin())',
        t || '_admin', t);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public'
        AND tablename = t AND policyname = 'org_fence_' || t
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL '
        'USING (organization_id = current_org_id())',
        'org_fence_' || t, t);
    END IF;

    -- anon bekommt nichts. Der Verteiler ist eine Adressliste; eine
    -- offene Lesetuer darauf waere derselbe Befund wie bei
    -- lead_inquiries (20260828180000).
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END;
$$;

COMMENT ON TABLE public.marketing_consents IS
  'Nachweis der Werbeeinwilligung nach § 7 Abs. 2 Nr. 2 UWG und Art. 7 Abs. 1 DSGVO. '
  'Jede Erteilung und jeder Widerruf ist eine eigene Zeile; die aktuelle Lage ist die '
  'juengste Zeile je (email, consent_type). Fuehrender Schluessel ist die ADRESSE, nicht '
  'user_id — Newsletter-Anmeldungen von der Website haben kein Konto.';

COMMENT ON TABLE public.email_suppression_list IS
  'Dauerhafte Sperrliste. Wird von der Kontoloeschung ABSICHTLICH nicht angefasst: '
  'Art. 21 Abs. 3 DSGVO verlangt, dass dem Widerspruch dauerhaft entsprochen wird — '
  'das geht nur, wenn die Adresse gespeichert bleibt. Siehe lib/dsgvo/loeschkatalog.ts.';

COMMENT ON TABLE public.marketing_automations IS
  'Trigger-Automationen. aktiv steht auf DEFAULT false und laesst sich ohne '
  'Freigabevermerk (aktiviert_am/aktiviert_von) per CHECK nicht auf true setzen. '
  'Stand dieser Migration: alle Automationen vorbereitet, KEINE scharf.';

COMMIT;
