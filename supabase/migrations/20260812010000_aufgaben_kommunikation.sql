-- ============================================================================
-- Migration: AUFGABENMANAGEMENT + KOMMUNIKATION + BENACHRICHTIGUNGEN
--            + WIEDERVORLAGEN + ESKALATIONEN
-- Datum:     2026-08-08
-- Projekt:   Alltagsengel UG (nnwyktkqibdjxgimjyuq)
-- ============================================================================
-- Bestehende Tabellen NICHT dupliziert:
--   profiles, clients, caregivers, assignments, service_records,
--   akten_dokumente, verordnungen, abrechnungslaeufe, pflege_aufnahmen,
--   dienstplan_eintraege, personal_arbeitszeiten, caregiver_qualifications,
--   absences, fcm_tokens, push_subscriptions
-- Bestehende notifications (153 Zeilen, booking-spezifisch) NICHT verändert.
-- Bestehende mis_tasks / mis_notifications (je 0 Zeilen) NICHT verändert.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════
-- TEIL 1: ops_aufgaben — Zentrale Aufgabenverwaltung
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ops_aufgaben (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL DEFAULT current_org_id(),

  -- Aufgaben-Kern
  titel                   text NOT NULL,
  beschreibung            text,
  kategorie               text NOT NULL DEFAULT 'allgemein',
  prioritaet              text NOT NULL DEFAULT 'mittel',
  status                  text NOT NULL DEFAULT 'offen',

  -- Zuordnung
  verantwortlich_id       uuid REFERENCES public.profiles(id),
  stellvertreter_id       uuid REFERENCES public.profiles(id),
  erstellt_von            uuid REFERENCES public.profiles(id),

  -- Fälligkeiten
  faellig_am              date,
  erledigt_am             timestamptz,
  erledigt_von            uuid REFERENCES public.profiles(id),

  -- Entity-Links (alle nullable — Aufgabe kann sich auf jede Entität beziehen)
  client_id               uuid REFERENCES public.clients(id),
  caregiver_id            uuid REFERENCES public.caregivers(id),
  assignment_id           uuid REFERENCES public.assignments(id),
  dokument_id             uuid REFERENCES public.akten_dokumente(id),
  verordnung_id           uuid REFERENCES public.verordnungen(id),
  abrechnungslauf_id      uuid REFERENCES public.abrechnungslaeufe(id),
  pflege_aufnahme_id      uuid REFERENCES public.pflege_aufnahmen(id),
  dienstplan_eintrag_id   uuid REFERENCES public.dienstplan_eintraege(id),

  -- Wiederkehrende Aufgaben
  ist_wiederkehrend        boolean NOT NULL DEFAULT false,
  wiederholung_intervall   text,
  wiederholung_naechstes   date,
  wiederholung_ende        date,
  wiederholung_vorlage_id  uuid REFERENCES public.ops_aufgaben(id),

  -- Eskalation
  eskalationsstufe        integer NOT NULL DEFAULT 0,
  eskaliert_am            timestamptz,
  eskaliert_an            uuid REFERENCES public.profiles(id),

  -- Meta
  tags                    text[] DEFAULT '{}',
  metadata                jsonb DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT ops_aufgaben_kategorie_check CHECK (kategorie IN (
    'allgemein', 'kunde', 'mitarbeiter', 'einsatz', 'dokument',
    'verordnung', 'abrechnung', 'pflege', 'qualifikation',
    'dienstplan', 'urlaub', 'kommunikation', 'system'
  )),
  CONSTRAINT ops_aufgaben_prioritaet_check CHECK (prioritaet IN (
    'niedrig', 'mittel', 'hoch', 'kritisch'
  )),
  CONSTRAINT ops_aufgaben_status_check CHECK (status IN (
    'offen', 'in_bearbeitung', 'warten', 'erledigt', 'storniert'
  )),
  CONSTRAINT ops_aufgaben_intervall_check CHECK (
    wiederholung_intervall IS NULL
    OR wiederholung_intervall IN ('taeglich', 'woechentlich', 'monatlich', 'quartalsweise', 'jaehrlich')
  )
);

-- Indizes
CREATE INDEX IF NOT EXISTS idx_ops_aufgaben_org ON public.ops_aufgaben(organization_id);
CREATE INDEX IF NOT EXISTS idx_ops_aufgaben_verantwortlich ON public.ops_aufgaben(verantwortlich_id);
CREATE INDEX IF NOT EXISTS idx_ops_aufgaben_status ON public.ops_aufgaben(status);
CREATE INDEX IF NOT EXISTS idx_ops_aufgaben_faellig ON public.ops_aufgaben(faellig_am) WHERE status NOT IN ('erledigt', 'storniert');
CREATE INDEX IF NOT EXISTS idx_ops_aufgaben_kategorie ON public.ops_aufgaben(kategorie);
CREATE INDEX IF NOT EXISTS idx_ops_aufgaben_client ON public.ops_aufgaben(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ops_aufgaben_caregiver ON public.ops_aufgaben(caregiver_id) WHERE caregiver_id IS NOT NULL;

-- RLS
ALTER TABLE public.ops_aufgaben ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_aufgaben_org_fence"
  ON public.ops_aufgaben AS RESTRICTIVE FOR ALL
  USING (organization_id = current_org_id());

CREATE POLICY "ops_aufgaben_admin_all"
  ON public.ops_aufgaben FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "ops_aufgaben_engel_select"
  ON public.ops_aufgaben FOR SELECT
  USING (
    verantwortlich_id = auth.uid()
    OR stellvertreter_id = auth.uid()
    OR erstellt_von = auth.uid()
    OR caregiver_id IN (SELECT cg.id FROM public.caregivers cg WHERE cg.user_id = auth.uid())
  );

CREATE POLICY "ops_aufgaben_engel_update"
  ON public.ops_aufgaben FOR UPDATE
  USING (
    verantwortlich_id = auth.uid()
    OR stellvertreter_id = auth.uid()
  );

-- updated_at trigger
CREATE TRIGGER trg_updated_at_ops_aufgaben
  BEFORE UPDATE ON public.ops_aufgaben
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ═══════════════════════════════════════════════════════════════
-- TEIL 2: ops_aufgaben_checklisten — Subtasks / Checklisten
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ops_aufgaben_checklisten (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id(),
  aufgabe_id       uuid NOT NULL REFERENCES public.ops_aufgaben(id) ON DELETE CASCADE,
  titel            text NOT NULL,
  position         integer NOT NULL DEFAULT 0,
  erledigt         boolean NOT NULL DEFAULT false,
  erledigt_von     uuid REFERENCES public.profiles(id),
  erledigt_am      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_checklisten_aufgabe ON public.ops_aufgaben_checklisten(aufgabe_id);

ALTER TABLE public.ops_aufgaben_checklisten ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_checklisten_org_fence"
  ON public.ops_aufgaben_checklisten AS RESTRICTIVE FOR ALL
  USING (organization_id = current_org_id());

CREATE POLICY "ops_checklisten_admin_all"
  ON public.ops_aufgaben_checklisten FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "ops_checklisten_engel_select"
  ON public.ops_aufgaben_checklisten FOR SELECT
  USING (aufgabe_id IN (
    SELECT a.id FROM public.ops_aufgaben a
    WHERE a.verantwortlich_id = auth.uid()
       OR a.stellvertreter_id = auth.uid()
       OR a.erstellt_von = auth.uid()
  ));

CREATE POLICY "ops_checklisten_engel_update"
  ON public.ops_aufgaben_checklisten FOR UPDATE
  USING (aufgabe_id IN (
    SELECT a.id FROM public.ops_aufgaben a
    WHERE a.verantwortlich_id = auth.uid()
       OR a.stellvertreter_id = auth.uid()
  ));


-- ═══════════════════════════════════════════════════════════════
-- TEIL 3: ops_aufgaben_kommentare — Interne Notizen / Kommentare
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ops_aufgaben_kommentare (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id(),
  aufgabe_id       uuid NOT NULL REFERENCES public.ops_aufgaben(id) ON DELETE CASCADE,
  inhalt           text NOT NULL,
  autor_id         uuid NOT NULL REFERENCES public.profiles(id),
  ist_intern       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_kommentare_aufgabe ON public.ops_aufgaben_kommentare(aufgabe_id);

ALTER TABLE public.ops_aufgaben_kommentare ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_kommentare_org_fence"
  ON public.ops_aufgaben_kommentare AS RESTRICTIVE FOR ALL
  USING (organization_id = current_org_id());

CREATE POLICY "ops_kommentare_admin_all"
  ON public.ops_aufgaben_kommentare FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "ops_kommentare_engel_select"
  ON public.ops_aufgaben_kommentare FOR SELECT
  USING (
    ist_intern = false
    AND aufgabe_id IN (
      SELECT a.id FROM public.ops_aufgaben a
      WHERE a.verantwortlich_id = auth.uid()
         OR a.stellvertreter_id = auth.uid()
         OR a.erstellt_von = auth.uid()
    )
  );

CREATE POLICY "ops_kommentare_engel_insert"
  ON public.ops_aufgaben_kommentare FOR INSERT
  WITH CHECK (
    autor_id = auth.uid()
    AND ist_intern = false
    AND aufgabe_id IN (
      SELECT a.id FROM public.ops_aufgaben a
      WHERE a.verantwortlich_id = auth.uid()
         OR a.stellvertreter_id = auth.uid()
    )
  );

CREATE TRIGGER trg_updated_at_ops_kommentare
  BEFORE UPDATE ON public.ops_aufgaben_kommentare
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ═══════════════════════════════════════════════════════════════
-- TEIL 4: ops_aufgaben_anhaenge — Dokumenten-Verknüpfung
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ops_aufgaben_anhaenge (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL DEFAULT current_org_id(),
  aufgabe_id        uuid NOT NULL REFERENCES public.ops_aufgaben(id) ON DELETE CASCADE,
  dokument_id       uuid NOT NULL REFERENCES public.akten_dokumente(id),
  hinzugefuegt_von  uuid REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_anhaenge_aufgabe ON public.ops_aufgaben_anhaenge(aufgabe_id);

ALTER TABLE public.ops_aufgaben_anhaenge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_anhaenge_org_fence"
  ON public.ops_aufgaben_anhaenge AS RESTRICTIVE FOR ALL
  USING (organization_id = current_org_id());

CREATE POLICY "ops_anhaenge_admin_all"
  ON public.ops_aufgaben_anhaenge FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "ops_anhaenge_engel_select"
  ON public.ops_aufgaben_anhaenge FOR SELECT
  USING (aufgabe_id IN (
    SELECT a.id FROM public.ops_aufgaben a
    WHERE a.verantwortlich_id = auth.uid()
       OR a.stellvertreter_id = auth.uid()
  ));


-- ═══════════════════════════════════════════════════════════════
-- TEIL 5: ops_wiedervorlagen — Erinnerungen / Follow-ups
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ops_wiedervorlagen (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id(),

  titel            text NOT NULL,
  beschreibung     text,

  -- Entitätsbezug (polymorph)
  entitaet_typ     text NOT NULL,
  entitaet_id      uuid NOT NULL,

  -- Fälligkeit
  faellig_am       timestamptz NOT NULL,
  empfaenger_id    uuid NOT NULL REFERENCES public.profiles(id),

  -- Status
  status           text NOT NULL DEFAULT 'aktiv',
  erledigt_am      timestamptz,
  erledigt_von     uuid REFERENCES public.profiles(id),
  erstellt_von     uuid NOT NULL REFERENCES public.profiles(id),

  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ops_wiedervorlagen_typ_check CHECK (entitaet_typ IN (
    'aufgabe', 'kunde', 'mitarbeiter', 'einsatz', 'dokument',
    'verordnung', 'abrechnung', 'pflege', 'qualifikation', 'allgemein'
  )),
  CONSTRAINT ops_wiedervorlagen_status_check CHECK (status IN (
    'aktiv', 'erledigt', 'storniert'
  ))
);

CREATE INDEX IF NOT EXISTS idx_ops_wiedervorlagen_org ON public.ops_wiedervorlagen(organization_id);
CREATE INDEX IF NOT EXISTS idx_ops_wiedervorlagen_faellig ON public.ops_wiedervorlagen(faellig_am) WHERE status = 'aktiv';
CREATE INDEX IF NOT EXISTS idx_ops_wiedervorlagen_empfaenger ON public.ops_wiedervorlagen(empfaenger_id);

ALTER TABLE public.ops_wiedervorlagen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_wiedervorlagen_org_fence"
  ON public.ops_wiedervorlagen AS RESTRICTIVE FOR ALL
  USING (organization_id = current_org_id());

CREATE POLICY "ops_wiedervorlagen_admin_all"
  ON public.ops_wiedervorlagen FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "ops_wiedervorlagen_engel_select"
  ON public.ops_wiedervorlagen FOR SELECT
  USING (empfaenger_id = auth.uid() OR erstellt_von = auth.uid());

CREATE POLICY "ops_wiedervorlagen_engel_update"
  ON public.ops_wiedervorlagen FOR UPDATE
  USING (empfaenger_id = auth.uid());


-- ═══════════════════════════════════════════════════════════════
-- TEIL 6: ops_eskalationsregeln — Konfigurierbare Eskalation
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ops_eskalationsregeln (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL DEFAULT current_org_id(),

  name                  text NOT NULL,
  beschreibung          text,

  -- Matching-Kriterien
  aufgaben_kategorie    text,
  aufgaben_prioritaet   text,

  -- Eskalationsschwelle
  ueberfaellig_stunden  integer NOT NULL DEFAULT 24,
  eskalationsstufe      integer NOT NULL DEFAULT 1,

  -- Eskalationsziel
  eskalation_an_rolle   text,
  eskalation_an_user_id uuid REFERENCES public.profiles(id),

  -- Verhalten
  benachrichtigung_senden boolean NOT NULL DEFAULT true,
  aktiv                   boolean NOT NULL DEFAULT true,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ops_eskalation_rolle_check CHECK (
    eskalation_an_rolle IS NULL
    OR eskalation_an_rolle IN ('admin', 'pdl', 'geschaeftsfuehrung')
  )
);

ALTER TABLE public.ops_eskalationsregeln ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_eskalationsregeln_org_fence"
  ON public.ops_eskalationsregeln AS RESTRICTIVE FOR ALL
  USING (organization_id = current_org_id());

CREATE POLICY "ops_eskalationsregeln_admin_all"
  ON public.ops_eskalationsregeln FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TRIGGER trg_updated_at_ops_eskalationsregeln
  BEFORE UPDATE ON public.ops_eskalationsregeln
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ═══════════════════════════════════════════════════════════════
-- TEIL 7: ops_eskalationshistorie — Eskalationsprotokoll (IMMUTABLE)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ops_eskalationshistorie (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL DEFAULT current_org_id(),
  aufgabe_id        uuid NOT NULL REFERENCES public.ops_aufgaben(id),
  regel_id          uuid REFERENCES public.ops_eskalationsregeln(id),
  eskalationsstufe  integer NOT NULL,
  eskaliert_an      uuid REFERENCES public.profiles(id),
  grund             text NOT NULL,
  erstellt_am       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_eskalation_aufgabe ON public.ops_eskalationshistorie(aufgabe_id);

ALTER TABLE public.ops_eskalationshistorie ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_eskalation_org_fence"
  ON public.ops_eskalationshistorie AS RESTRICTIVE FOR ALL
  USING (organization_id = current_org_id());

CREATE POLICY "ops_eskalation_admin_all"
  ON public.ops_eskalationshistorie FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Immutable: UPDATE blockieren
CREATE OR REPLACE FUNCTION public.prevent_ops_eskalation_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Eskalationshistorie ist unveränderlich — UPDATE nicht erlaubt';
END;
$$;

CREATE TRIGGER trg_ops_eskalation_immutable_update
  BEFORE UPDATE ON public.ops_eskalationshistorie
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ops_eskalation_update();

-- Immutable: DELETE blockieren
CREATE OR REPLACE FUNCTION public.prevent_ops_eskalation_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Eskalationshistorie ist unveränderlich — DELETE nicht erlaubt';
END;
$$;

CREATE TRIGGER trg_ops_eskalation_immutable_delete
  BEFORE DELETE ON public.ops_eskalationshistorie
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ops_eskalation_delete();


-- ═══════════════════════════════════════════════════════════════
-- TEIL 8: ops_nachrichten — Interne Kommunikation
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ops_nachrichten (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id(),

  betreff          text NOT NULL,
  inhalt           text NOT NULL,
  absender_id      uuid NOT NULL REFERENCES public.profiles(id),

  prioritaet       text NOT NULL DEFAULT 'normal',
  kategorie        text NOT NULL DEFAULT 'allgemein',

  -- Entitätsbezug
  bezug_typ        text,
  bezug_id         uuid,

  -- Threading
  eltern_id        uuid REFERENCES public.ops_nachrichten(id),

  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ops_nachrichten_prioritaet_check CHECK (prioritaet IN ('normal', 'dringend')),
  CONSTRAINT ops_nachrichten_kategorie_check CHECK (kategorie IN (
    'allgemein', 'einsatz', 'kunde', 'mitarbeiter', 'aufgabe',
    'dienstplan', 'abrechnung', 'pflege', 'system'
  )),
  CONSTRAINT ops_nachrichten_bezug_check CHECK (
    bezug_typ IS NULL
    OR bezug_typ IN ('aufgabe', 'kunde', 'einsatz', 'mitarbeiter', 'dokument', 'verordnung')
  )
);

CREATE INDEX IF NOT EXISTS idx_ops_nachrichten_org ON public.ops_nachrichten(organization_id);
CREATE INDEX IF NOT EXISTS idx_ops_nachrichten_absender ON public.ops_nachrichten(absender_id);
CREATE INDEX IF NOT EXISTS idx_ops_nachrichten_eltern ON public.ops_nachrichten(eltern_id) WHERE eltern_id IS NOT NULL;

ALTER TABLE public.ops_nachrichten ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_nachrichten_org_fence"
  ON public.ops_nachrichten AS RESTRICTIVE FOR ALL
  USING (organization_id = current_org_id());

CREATE POLICY "ops_nachrichten_admin_all"
  ON public.ops_nachrichten FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "ops_nachrichten_absender_select"
  ON public.ops_nachrichten FOR SELECT
  USING (absender_id = auth.uid());

CREATE POLICY "ops_nachrichten_insert_own"
  ON public.ops_nachrichten FOR INSERT
  WITH CHECK (absender_id = auth.uid());


-- ═══════════════════════════════════════════════════════════════
-- TEIL 9: ops_nachrichten_empfaenger — Empfänger mit Lesestatus
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ops_nachrichten_empfaenger (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id(),
  nachricht_id     uuid NOT NULL REFERENCES public.ops_nachrichten(id) ON DELETE CASCADE,
  empfaenger_id    uuid NOT NULL REFERENCES public.profiles(id),
  gelesen          boolean NOT NULL DEFAULT false,
  gelesen_am       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE(nachricht_id, empfaenger_id)
);

CREATE INDEX IF NOT EXISTS idx_ops_empfaenger_nachricht ON public.ops_nachrichten_empfaenger(nachricht_id);
CREATE INDEX IF NOT EXISTS idx_ops_empfaenger_user ON public.ops_nachrichten_empfaenger(empfaenger_id);
CREATE INDEX IF NOT EXISTS idx_ops_empfaenger_ungelesen ON public.ops_nachrichten_empfaenger(empfaenger_id) WHERE gelesen = false;

ALTER TABLE public.ops_nachrichten_empfaenger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_empfaenger_org_fence"
  ON public.ops_nachrichten_empfaenger AS RESTRICTIVE FOR ALL
  USING (organization_id = current_org_id());

CREATE POLICY "ops_empfaenger_admin_all"
  ON public.ops_nachrichten_empfaenger FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "ops_empfaenger_own_select"
  ON public.ops_nachrichten_empfaenger FOR SELECT
  USING (empfaenger_id = auth.uid());

CREATE POLICY "ops_empfaenger_own_update"
  ON public.ops_nachrichten_empfaenger FOR UPDATE
  USING (empfaenger_id = auth.uid());

-- Nachrichten-Empfänger-Policy (jetzt wo empfaenger-Tabelle existiert)
CREATE POLICY "ops_nachrichten_empfaenger_select"
  ON public.ops_nachrichten FOR SELECT
  USING (id IN (
    SELECT e.nachricht_id FROM public.ops_nachrichten_empfaenger e
    WHERE e.empfaenger_id = auth.uid()
  ));


-- ═══════════════════════════════════════════════════════════════
-- TEIL 10: ops_benachrichtigungen — Ereignis-basiert
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ops_benachrichtigungen (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id(),
  empfaenger_id    uuid NOT NULL REFERENCES public.profiles(id),

  titel            text NOT NULL,
  inhalt           text,

  typ              text NOT NULL DEFAULT 'info',
  kategorie        text NOT NULL DEFAULT 'system',

  -- Entitätsbezug
  bezug_typ        text,
  bezug_id         uuid,
  link             text,

  -- Status
  gelesen          boolean NOT NULL DEFAULT false,
  gelesen_am       timestamptz,

  -- Zustellstatus (Vorbereitung — kein tatsächlicher Versand ohne Provider)
  email_gesendet   boolean NOT NULL DEFAULT false,
  push_gesendet    boolean NOT NULL DEFAULT false,

  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ops_benachrichtigungen_typ_check CHECK (typ IN (
    'info', 'warnung', 'fehler', 'erfolg', 'erinnerung', 'eskalation'
  )),
  CONSTRAINT ops_benachrichtigungen_kategorie_check CHECK (kategorie IN (
    'dienstplan', 'einsatz', 'urlaub', 'qualifikation', 'dokument',
    'abrechnung', 'aufgabe', 'pflege', 'personal', 'system',
    'kommunikation', 'wiedervorlage', 'eskalation'
  )),
  CONSTRAINT ops_benachrichtigungen_bezug_check CHECK (
    bezug_typ IS NULL
    OR bezug_typ IN (
      'aufgabe', 'kunde', 'einsatz', 'mitarbeiter', 'dokument',
      'verordnung', 'dienstplan', 'urlaub', 'qualifikation',
      'abrechnung', 'nachricht', 'wiedervorlage'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_ops_benach_org ON public.ops_benachrichtigungen(organization_id);
CREATE INDEX IF NOT EXISTS idx_ops_benach_empfaenger ON public.ops_benachrichtigungen(empfaenger_id);
CREATE INDEX IF NOT EXISTS idx_ops_benach_ungelesen ON public.ops_benachrichtigungen(empfaenger_id) WHERE gelesen = false;
CREATE INDEX IF NOT EXISTS idx_ops_benach_kategorie ON public.ops_benachrichtigungen(kategorie);

ALTER TABLE public.ops_benachrichtigungen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_benach_org_fence"
  ON public.ops_benachrichtigungen AS RESTRICTIVE FOR ALL
  USING (organization_id = current_org_id());

CREATE POLICY "ops_benach_admin_all"
  ON public.ops_benachrichtigungen FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "ops_benach_own_select"
  ON public.ops_benachrichtigungen FOR SELECT
  USING (empfaenger_id = auth.uid());

CREATE POLICY "ops_benach_own_update"
  ON public.ops_benachrichtigungen FOR UPDATE
  USING (empfaenger_id = auth.uid());


-- ═══════════════════════════════════════════════════════════════
-- TEIL 11: ops_benachrichtigungs_praeferenzen — Benutzerpräferenzen
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ops_benachrichtigungs_praeferenzen (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id(),
  benutzer_id      uuid NOT NULL REFERENCES public.profiles(id),

  kategorie        text NOT NULL,

  in_app           boolean NOT NULL DEFAULT true,
  email            boolean NOT NULL DEFAULT true,
  push             boolean NOT NULL DEFAULT true,
  aktiv            boolean NOT NULL DEFAULT true,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE(organization_id, benutzer_id, kategorie),

  CONSTRAINT ops_praef_kategorie_check CHECK (kategorie IN (
    'dienstplan', 'einsatz', 'urlaub', 'qualifikation', 'dokument',
    'abrechnung', 'aufgabe', 'pflege', 'personal', 'system',
    'kommunikation', 'wiedervorlage', 'eskalation'
  ))
);

ALTER TABLE public.ops_benachrichtigungs_praeferenzen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_praef_org_fence"
  ON public.ops_benachrichtigungs_praeferenzen AS RESTRICTIVE FOR ALL
  USING (organization_id = current_org_id());

CREATE POLICY "ops_praef_admin_all"
  ON public.ops_benachrichtigungs_praeferenzen FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "ops_praef_own_select"
  ON public.ops_benachrichtigungs_praeferenzen FOR SELECT
  USING (benutzer_id = auth.uid());

CREATE POLICY "ops_praef_own_update"
  ON public.ops_benachrichtigungs_praeferenzen FOR UPDATE
  USING (benutzer_id = auth.uid());

CREATE POLICY "ops_praef_own_insert"
  ON public.ops_benachrichtigungs_praeferenzen FOR INSERT
  WITH CHECK (benutzer_id = auth.uid());

CREATE TRIGGER trg_updated_at_ops_praeferenzen
  BEFORE UPDATE ON public.ops_benachrichtigungs_praeferenzen
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ═══════════════════════════════════════════════════════════════
-- TEIL 12: ops_ereignis_regeln — Konfigurierbare Event→Notification
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ops_ereignis_regeln (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL DEFAULT current_org_id(),

  name                 text NOT NULL,
  beschreibung         text,

  ereignis_typ         text NOT NULL,

  -- Empfänger
  empfaenger_rolle     text,
  empfaenger_user_id   uuid REFERENCES public.profiles(id),

  -- Nachricht
  nachricht_vorlage    text NOT NULL,
  titel_vorlage        text NOT NULL,
  prioritaet           text NOT NULL DEFAULT 'normal',
  kategorie            text NOT NULL DEFAULT 'system',

  aktiv                boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ops_ereignis_typ_check CHECK (ereignis_typ IN (
    'qualifikation_abgelaufen', 'qualifikation_warnung',
    'dokument_abgelaufen', 'verordnung_abgelaufen',
    'dienstplan_aenderung', 'neuer_einsatz', 'einsatz_geaendert', 'einsatz_storniert',
    'urlaub_beantragt', 'urlaub_genehmigt', 'urlaub_abgelehnt',
    'aufgabe_zugewiesen', 'aufgabe_ueberfaellig', 'aufgabe_erledigt', 'aufgabe_eskaliert',
    'unterschrift_fehlend', 'pflege_doku_offen',
    'abrechnung_fehler', 'abrechnung_ruecklaefer',
    'wiedervorlage_faellig',
    'nachricht_empfangen',
    'system_kritisch'
  )),
  CONSTRAINT ops_ereignis_rolle_check CHECK (
    empfaenger_rolle IS NULL
    OR empfaenger_rolle IN ('admin', 'pdl', 'engel', 'verantwortlicher', 'alle')
  ),
  CONSTRAINT ops_ereignis_prioritaet_check CHECK (prioritaet IN ('normal', 'dringend')),
  CONSTRAINT ops_ereignis_kategorie_check CHECK (kategorie IN (
    'dienstplan', 'einsatz', 'urlaub', 'qualifikation', 'dokument',
    'abrechnung', 'aufgabe', 'pflege', 'personal', 'system',
    'kommunikation', 'wiedervorlage', 'eskalation'
  ))
);

ALTER TABLE public.ops_ereignis_regeln ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_ereignis_org_fence"
  ON public.ops_ereignis_regeln AS RESTRICTIVE FOR ALL
  USING (organization_id = current_org_id());

CREATE POLICY "ops_ereignis_admin_all"
  ON public.ops_ereignis_regeln FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TRIGGER trg_updated_at_ops_ereignis_regeln
  BEFORE UPDATE ON public.ops_ereignis_regeln
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ═══════════════════════════════════════════════════════════════
-- TEIL 13: ops_aktivitaetslog — Ops-Audit-Trail (IMMUTABLE)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ops_aktivitaetslog (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id(),

  entitaet_typ     text NOT NULL,
  entitaet_id      uuid NOT NULL,
  aktion           text NOT NULL,

  vorher           jsonb,
  nachher          jsonb,

  akteur_id        uuid REFERENCES public.profiles(id),
  ip_adresse       text,
  erstellt_am      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ops_log_typ_check CHECK (entitaet_typ IN (
    'aufgabe', 'wiedervorlage', 'eskalation', 'nachricht',
    'benachrichtigung', 'praeferenz', 'ereignis_regel', 'checkliste'
  )),
  CONSTRAINT ops_log_aktion_check CHECK (aktion IN (
    'erstellt', 'aktualisiert', 'geloescht', 'status_geaendert',
    'zugewiesen', 'eskaliert', 'erledigt', 'storniert',
    'gelesen', 'gesendet', 'genehmigt', 'abgelehnt'
  ))
);

CREATE INDEX IF NOT EXISTS idx_ops_log_org ON public.ops_aktivitaetslog(organization_id);
CREATE INDEX IF NOT EXISTS idx_ops_log_entitaet ON public.ops_aktivitaetslog(entitaet_typ, entitaet_id);
CREATE INDEX IF NOT EXISTS idx_ops_log_akteur ON public.ops_aktivitaetslog(akteur_id);

ALTER TABLE public.ops_aktivitaetslog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_log_org_fence"
  ON public.ops_aktivitaetslog AS RESTRICTIVE FOR ALL
  USING (organization_id = current_org_id());

CREATE POLICY "ops_log_admin_all"
  ON public.ops_aktivitaetslog FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Immutable: UPDATE/DELETE blockieren
CREATE OR REPLACE FUNCTION public.prevent_ops_log_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Aktivitätslog ist unveränderlich — UPDATE nicht erlaubt';
END;
$$;

CREATE TRIGGER trg_ops_log_immutable_update
  BEFORE UPDATE ON public.ops_aktivitaetslog
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ops_log_update();

CREATE OR REPLACE FUNCTION public.prevent_ops_log_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Aktivitätslog ist unveränderlich — DELETE nicht erlaubt';
END;
$$;

CREATE TRIGGER trg_ops_log_immutable_delete
  BEFORE DELETE ON public.ops_aktivitaetslog
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ops_log_delete();


-- ═══════════════════════════════════════════════════════════════
-- TEIL 14: Trigger — Auto-Eskalation bei Überfälligkeit
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_aufgabe_eskalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_regel RECORD;
  v_stunden_ueberfaellig numeric;
BEGIN
  -- Nur prüfen wenn Aufgabe offen/in_bearbeitung und überfällig
  IF NEW.status NOT IN ('offen', 'in_bearbeitung', 'warten') THEN
    RETURN NEW;
  END IF;

  IF NEW.faellig_am IS NULL OR NEW.faellig_am >= CURRENT_DATE THEN
    RETURN NEW;
  END IF;

  -- Stunden seit Fälligkeit
  v_stunden_ueberfaellig := EXTRACT(EPOCH FROM (now() - (NEW.faellig_am::timestamp + interval '23:59:59'))) / 3600;

  -- Passende Eskalationsregel suchen (höchste Stufe die zutrifft)
  SELECT * INTO v_regel
  FROM public.ops_eskalationsregeln
  WHERE organization_id = NEW.organization_id
    AND aktiv = true
    AND v_stunden_ueberfaellig >= ueberfaellig_stunden
    AND eskalationsstufe > NEW.eskalationsstufe
    AND (aufgaben_kategorie IS NULL OR aufgaben_kategorie = NEW.kategorie)
    AND (aufgaben_prioritaet IS NULL OR aufgaben_prioritaet = NEW.prioritaet)
  ORDER BY eskalationsstufe DESC
  LIMIT 1;

  IF v_regel IS NOT NULL THEN
    NEW.eskalationsstufe := v_regel.eskalationsstufe;
    NEW.eskaliert_am := now();
    NEW.eskaliert_an := v_regel.eskalation_an_user_id;

    -- Eskalationshistorie schreiben
    INSERT INTO public.ops_eskalationshistorie (
      organization_id, aufgabe_id, regel_id, eskalationsstufe,
      eskaliert_an, grund
    ) VALUES (
      NEW.organization_id, NEW.id, v_regel.id, v_regel.eskalationsstufe,
      v_regel.eskalation_an_user_id,
      'Automatische Eskalation: ' || v_stunden_ueberfaellig::integer || ' Stunden überfällig'
    );

    -- Benachrichtigung erzeugen wenn gewünscht
    IF v_regel.benachrichtigung_senden AND v_regel.eskalation_an_user_id IS NOT NULL THEN
      INSERT INTO public.ops_benachrichtigungen (
        organization_id, empfaenger_id, titel, inhalt, typ, kategorie,
        bezug_typ, bezug_id, link
      ) VALUES (
        NEW.organization_id, v_regel.eskalation_an_user_id,
        'Eskalation Stufe ' || v_regel.eskalationsstufe || ': ' || NEW.titel,
        'Aufgabe "' || NEW.titel || '" ist seit ' || v_stunden_ueberfaellig::integer || ' Stunden überfällig.',
        'eskalation', 'eskalation',
        'aufgabe', NEW.id,
        '/admin/aufgaben/' || NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_aufgabe_eskalation
  BEFORE UPDATE ON public.ops_aufgaben
  FOR EACH ROW EXECUTE FUNCTION public.check_aufgabe_eskalation();


-- ═══════════════════════════════════════════════════════════════
-- TEIL 15: Trigger — Recurring Task nach Erledigung
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_recurring_aufgabe()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_naechstes date;
BEGIN
  -- Nur wenn Status auf 'erledigt' wechselt
  IF NEW.status <> 'erledigt' OR OLD.status = 'erledigt' THEN
    RETURN NEW;
  END IF;

  -- Nur wiederkehrende Aufgaben
  IF NOT NEW.ist_wiederkehrend OR NEW.wiederholung_intervall IS NULL THEN
    RETURN NEW;
  END IF;

  -- Nächstes Fälligkeitsdatum berechnen
  v_naechstes := COALESCE(NEW.wiederholung_naechstes, NEW.faellig_am, CURRENT_DATE);

  CASE NEW.wiederholung_intervall
    WHEN 'taeglich' THEN v_naechstes := v_naechstes + interval '1 day';
    WHEN 'woechentlich' THEN v_naechstes := v_naechstes + interval '1 week';
    WHEN 'monatlich' THEN v_naechstes := v_naechstes + interval '1 month';
    WHEN 'quartalsweise' THEN v_naechstes := v_naechstes + interval '3 months';
    WHEN 'jaehrlich' THEN v_naechstes := v_naechstes + interval '1 year';
    ELSE RETURN NEW;
  END CASE;

  -- Prüfe Ende
  IF NEW.wiederholung_ende IS NOT NULL AND v_naechstes > NEW.wiederholung_ende THEN
    NEW.ist_wiederkehrend := false;
    RETURN NEW;
  END IF;

  -- Neue Aufgabe erstellen
  INSERT INTO public.ops_aufgaben (
    organization_id, titel, beschreibung, kategorie, prioritaet,
    verantwortlich_id, stellvertreter_id, erstellt_von,
    faellig_am, client_id, caregiver_id, assignment_id,
    ist_wiederkehrend, wiederholung_intervall, wiederholung_naechstes,
    wiederholung_ende, wiederholung_vorlage_id,
    tags, metadata
  ) VALUES (
    NEW.organization_id, NEW.titel, NEW.beschreibung, NEW.kategorie, NEW.prioritaet,
    NEW.verantwortlich_id, NEW.stellvertreter_id, NEW.erstellt_von,
    v_naechstes, NEW.client_id, NEW.caregiver_id, NEW.assignment_id,
    true, NEW.wiederholung_intervall, v_naechstes + (v_naechstes - COALESCE(NEW.faellig_am, CURRENT_DATE)),
    NEW.wiederholung_ende, COALESCE(NEW.wiederholung_vorlage_id, NEW.id),
    NEW.tags, NEW.metadata
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recurring_aufgabe
  BEFORE UPDATE ON public.ops_aufgaben
  FOR EACH ROW EXECUTE FUNCTION public.create_recurring_aufgabe();


-- ═══════════════════════════════════════════════════════════════
-- TEIL 16: Views
-- ═══════════════════════════════════════════════════════════════

-- Aufgabenübersicht mit Zuordnungen
CREATE OR REPLACE VIEW public.ops_aufgaben_uebersicht AS
SELECT
  a.*,
  COALESCE(pv.first_name || ' ' || pv.last_name, '') as verantwortlich_name,
  COALESCE(ps.first_name || ' ' || ps.last_name, '') as stellvertreter_name,
  COALESCE(pe.first_name || ' ' || pe.last_name, '') as erstellt_von_name,
  COALESCE(c.first_name || ' ' || c.last_name, '') as client_name,
  COALESCE(cg.first_name || ' ' || cg.last_name, '') as caregiver_name,
  CASE
    WHEN a.status IN ('erledigt', 'storniert') THEN 'abgeschlossen'
    WHEN a.faellig_am IS NULL THEN 'ohne_frist'
    WHEN a.faellig_am < CURRENT_DATE THEN 'ueberfaellig'
    WHEN a.faellig_am <= CURRENT_DATE + 3 THEN 'bald_faellig'
    ELSE 'im_plan'
  END as faelligkeits_status,
  (SELECT count(*) FROM public.ops_aufgaben_checklisten cl WHERE cl.aufgabe_id = a.id) as checkliste_gesamt,
  (SELECT count(*) FROM public.ops_aufgaben_checklisten cl WHERE cl.aufgabe_id = a.id AND cl.erledigt = true) as checkliste_erledigt,
  (SELECT count(*) FROM public.ops_aufgaben_kommentare k WHERE k.aufgabe_id = a.id) as kommentare_anzahl
FROM public.ops_aufgaben a
LEFT JOIN public.profiles pv ON pv.id = a.verantwortlich_id
LEFT JOIN public.profiles ps ON ps.id = a.stellvertreter_id
LEFT JOIN public.profiles pe ON pe.id = a.erstellt_von
LEFT JOIN public.clients c ON c.id = a.client_id
LEFT JOIN public.caregivers cg ON cg.id = a.caregiver_id;

-- Fällige Wiedervorlagen
CREATE OR REPLACE VIEW public.ops_wiedervorlagen_faellig AS
SELECT
  w.*,
  COALESCE(p.first_name || ' ' || p.last_name, '') as empfaenger_name,
  COALESCE(pe.first_name || ' ' || pe.last_name, '') as erstellt_von_name,
  CASE
    WHEN w.faellig_am <= now() THEN 'ueberfaellig'
    WHEN w.faellig_am <= now() + interval '24 hours' THEN 'heute'
    WHEN w.faellig_am <= now() + interval '7 days' THEN 'diese_woche'
    ELSE 'spaeter'
  END as dringlichkeit
FROM public.ops_wiedervorlagen w
JOIN public.profiles p ON p.id = w.empfaenger_id
LEFT JOIN public.profiles pe ON pe.id = w.erstellt_von
WHERE w.status = 'aktiv';

-- Ungelesene Benachrichtigungen pro User
CREATE OR REPLACE VIEW public.ops_benachrichtigungen_zaehler AS
SELECT
  b.empfaenger_id,
  b.organization_id,
  COUNT(*) FILTER (WHERE NOT b.gelesen) as ungelesen_gesamt,
  COUNT(*) FILTER (WHERE NOT b.gelesen AND b.typ = 'eskalation') as ungelesen_eskalationen,
  COUNT(*) FILTER (WHERE NOT b.gelesen AND b.typ = 'warnung') as ungelesen_warnungen,
  COUNT(*) FILTER (WHERE NOT b.gelesen AND b.kategorie = 'aufgabe') as ungelesen_aufgaben,
  MAX(b.created_at) FILTER (WHERE NOT b.gelesen) as letzte_ungelesene
FROM public.ops_benachrichtigungen b
GROUP BY b.empfaenger_id, b.organization_id;

-- Nachrichten-Posteingang
CREATE OR REPLACE VIEW public.ops_posteingang AS
SELECT
  n.id as nachricht_id,
  n.betreff,
  n.inhalt,
  n.absender_id,
  COALESCE(pa.first_name || ' ' || pa.last_name, '') as absender_name,
  n.prioritaet,
  n.kategorie,
  n.bezug_typ,
  n.bezug_id,
  n.eltern_id,
  n.created_at,
  e.empfaenger_id,
  e.gelesen,
  e.gelesen_am,
  (SELECT count(*) FROM public.ops_nachrichten r WHERE r.eltern_id = n.id) as antworten_anzahl
FROM public.ops_nachrichten n
JOIN public.ops_nachrichten_empfaenger e ON e.nachricht_id = n.id
JOIN public.profiles pa ON pa.id = n.absender_id;
