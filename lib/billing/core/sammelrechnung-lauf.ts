/**
 * Sammelrechnungslauf — Betriebsschicht (Batch-ID, Sperre, Wiederaufnahme)
 *
 * ── Warum diese Schicht getrennt von der Engine liegt ───────────────────
 * `fuehreSammelrechnungslaufAus()` in sammelrechnung.ts beantwortet EINE
 * Frage: welche Gruppe wird abgerechnet und welche nicht. Das ist die
 * fachliche Entscheidung, und sie soll ohne Datenbank-Zustand pruefbar
 * bleiben — die Tests dazu fahren gegen eine Attrappe.
 *
 * Dieses Modul beantwortet die betrieblichen Fragen daneben:
 *   • Laeuft schon einer?          → Beanspruchung ueber die DB-Zeile
 *   • Wie heisst dieser Lauf?      → Batch-ID (sammelrechnungslaeufe.id)
 *   • Wo war der abgebrochene?     → Gruppentabelle
 *   • Was ist dabei herausgekommen? → Zaehler im Kopfsatz
 *
 * Die Engine kennt davon nur das schmale Interface `LaufProtokoll`.
 *
 * ── Warum die Sperre in der Datenbank sitzt ─────────────────────────────
 * Der Lauf laeuft in einer Serverless-Funktion und spricht ueber
 * PostgREST. Jede Anweisung ist eine eigene Transaktion auf einer
 * beliebigen Poolverbindung. Ein `pg_advisory_lock` waere nach der ersten
 * Anweisung wieder weg. Die Dauersperre ist deshalb die Zeile mit
 * status='laeuft', gehalten von einem partiellen UNIQUE-Index; der
 * Advisory-Lock sichert in der Migration nur die Beanspruchung selbst ab.
 * Ein Herzschlag verhindert, dass ein abgestuerzter Lauf den Monat fuer
 * immer blockiert.
 *
 * ── Was hier NICHT entschieden wird ─────────────────────────────────────
 * Kein Preis, kein Tarif, keine Freigabe. Die Rechnung entsteht
 * unveraendert ueber `create_invoice_draft_atomic` mit allen Sperren
 * (Tarif-Fail-Closed, Unterschriftspflicht, Budgetdeckel § 45b / § 42a).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { billingLogger as log } from '@/lib/logger';
import { logBillingAction } from './audit';
import {
  fuehreSammelrechnungslaufAus,
  gruppenSchluessel,
  type LaufProtokoll,
  type GruppenErgebnis,
  type SammelrechnungErgebnis,
  type SammelrechnungGruppe,
  type SammelrechnungParams,
} from './sammelrechnung';

// ---------------------------------------------------------------------------
// Fehler
// ---------------------------------------------------------------------------

/**
 * Ein anderer Lauf haelt den Monat gerade.
 *
 * Bewusst ein eigener Fehlertyp und keine leere Antwort: der zweite
 * Aufrufer hat einen Lauf angefordert und bekommt eine klare Absage samt
 * der Batch-ID, unter der er nachsehen kann — statt einer Ergebnisliste
 * mit null Rechnungen, die wie ein leerer Monat aussieht.
 */
export class SammelrechnungLaeuftBereitsError extends Error {
  readonly name = 'SammelrechnungLaeuftBereitsError';
  constructor(message: string, readonly periodMonth: string) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LaufStartParams extends Omit<SammelrechnungParams, 'dryRun'> {
  /**
   * Minuten ohne Herzschlag, nach denen eine Sperre als verwaist gilt.
   * Muss ueber der laengsten erwarteten Gruppenverarbeitung liegen —
   * sonst uebernimmt ein zweiter Lauf einen noch lebenden.
   */
  staleMinuten?: number;
  /** Herzschlag alle N Gruppen (Standard 10). */
  heartbeatAlle?: number;
}

export interface LaufKopf {
  id: string;
  organizationId: string;
  periodMonth: string;
  status: 'laeuft' | 'abgeschlossen' | 'abgebrochen' | 'fehlgeschlagen';
  versuch: number;
  gestartetAm: string;
  beendetAm: string | null;
  laufzeitMs: number | null;
  gruppenGesamt: number;
  gruppenErstellt: number;
  gruppenUebersprungen: number;
  gruppenFehlgeschlagen: number;
  gruppenOffen: number;
  summeCent: number;
  abbruchgrund: string | null;
  festschreiben: boolean;
  autoVersand: boolean;
  actorId: string | null;
}

export interface LaufErgebnis extends SammelrechnungErgebnis {
  /** Batch-ID: unter dieser Kennung ist der Lauf nachvollziehbar. */
  batchId: string;
  /** true = dieser Lauf hat einen abgebrochenen fortgesetzt. */
  wiederaufnahme: boolean;
  /** Gruppen, die ein frueherer Versuch bereits erledigt hatte. */
  uebernommen: number;
  kopf: LaufKopf;
}

// ---------------------------------------------------------------------------
// Kopfsatz lesen
// ---------------------------------------------------------------------------

interface KopfZeile {
  id: string;
  organization_id: string;
  period_month: string;
  status: LaufKopf['status'];
  versuch: number;
  gestartet_am: string;
  beendet_am: string | null;
  laufzeit_ms: number | null;
  gruppen_gesamt: number;
  gruppen_erstellt: number;
  gruppen_uebersprungen: number;
  gruppen_fehlgeschlagen: number;
  gruppen_offen: number;
  summe_cent: number | string;
  abbruchgrund: string | null;
  festschreiben: boolean;
  auto_versand: boolean;
  actor_id: string | null;
}

const KOPF_SPALTEN =
  'id, organization_id, period_month, status, versuch, gestartet_am, beendet_am, laufzeit_ms, '
  + 'gruppen_gesamt, gruppen_erstellt, gruppen_uebersprungen, gruppen_fehlgeschlagen, gruppen_offen, '
  + 'summe_cent, abbruchgrund, festschreiben, auto_versand, actor_id';

export function kopfAusZeile(z: KopfZeile): LaufKopf {
  return {
    id: z.id,
    organizationId: z.organization_id,
    periodMonth: z.period_month,
    status: z.status,
    versuch: z.versuch,
    gestartetAm: z.gestartet_am,
    beendetAm: z.beendet_am,
    laufzeitMs: z.laufzeit_ms,
    gruppenGesamt: z.gruppen_gesamt,
    gruppenErstellt: z.gruppen_erstellt,
    gruppenUebersprungen: z.gruppen_uebersprungen,
    gruppenFehlgeschlagen: z.gruppen_fehlgeschlagen,
    gruppenOffen: z.gruppen_offen,
    summeCent: Number(z.summe_cent ?? 0),
    abbruchgrund: z.abbruchgrund,
    festschreiben: z.festschreiben,
    autoVersand: z.auto_versand,
    actorId: z.actor_id,
  };
}

/** Laeufe eines Mandanten, neueste zuerst. Fuer die Admin-Oberflaeche. */
export async function ladeLaeufe(
  supabase: SupabaseClient,
  params: { organizationId: string; periodMonth?: string; limit?: number }
): Promise<LaufKopf[]> {
  let query = supabase
    .from('sammelrechnungslaeufe')
    .select(KOPF_SPALTEN)
    .eq('organization_id', params.organizationId)
    .order('gestartet_am', { ascending: false })
    .limit(Math.min(Math.max(params.limit ?? 20, 1), 200));

  if (params.periodMonth) query = query.eq('period_month', params.periodMonth);

  const { data, error } = await query.returns<KopfZeile[]>();
  if (error) throw new Error(`Sammelrechnungslaeufe nicht ladbar — ${error.message}`);
  return (data || []).map(kopfAusZeile);
}

export interface LaufGruppenZeile {
  clientId: string;
  budgetType: string;
  status: 'offen' | 'erstellt' | 'uebersprungen' | 'fehlgeschlagen';
  code: string | null;
  grund: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  betragCent: number | null;
  bestand: boolean;
  festgeschrieben: boolean;
  versandStatus: string | null;
  verarbeitetAm: string | null;
}

/** Ein einzelner Lauf mit seinen Gruppen. */
export async function ladeLauf(
  supabase: SupabaseClient,
  params: { organizationId: string; batchId: string }
): Promise<{ kopf: LaufKopf; gruppen: LaufGruppenZeile[] } | null> {
  const { data: kopfZeile, error } = await supabase
    .from('sammelrechnungslaeufe')
    .select(KOPF_SPALTEN)
    // Der Mandantenfilter steht hier, obwohl der Lauf ueber die Batch-ID
    // gesucht wird: der service-role-Client umgeht RLS, also darf die
    // Grenze nicht allein an der Datenbank haengen.
    .eq('organization_id', params.organizationId)
    .eq('id', params.batchId)
    .maybeSingle<KopfZeile>();

  if (error) throw new Error(`Sammelrechnungslauf nicht ladbar — ${error.message}`);
  if (!kopfZeile) return null;

  const { data: gruppen, error: gruppenFehler } = await supabase
    .from('sammelrechnungslauf_gruppen')
    .select('client_id, budget_type, status, code, grund, invoice_id, invoice_number, betrag_cent, bestand, festgeschrieben, versand_status, verarbeitet_am')
    .eq('organization_id', params.organizationId)
    .eq('lauf_id', params.batchId)
    .order('client_id', { ascending: true })
    .limit(5000);

  if (gruppenFehler) throw new Error(`Laufgruppen nicht ladbar — ${gruppenFehler.message}`);

  return {
    kopf: kopfAusZeile(kopfZeile),
    gruppen: (gruppen || []).map(g => ({
      clientId: g.client_id as string,
      budgetType: g.budget_type as string,
      status: g.status as LaufGruppenZeile['status'],
      code: (g.code as string | null) ?? null,
      grund: (g.grund as string | null) ?? null,
      invoiceId: (g.invoice_id as string | null) ?? null,
      invoiceNumber: (g.invoice_number as string | null) ?? null,
      betragCent: g.betrag_cent == null ? null : Number(g.betrag_cent),
      bestand: g.bestand === true,
      festgeschrieben: g.festgeschrieben === true,
      versandStatus: (g.versand_status as string | null) ?? null,
      verarbeitetAm: (g.verarbeitet_am as string | null) ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Protokoll gegen die Datenbank
// ---------------------------------------------------------------------------

class DbProtokoll implements LaufProtokoll {
  private seitHeartbeat = 0;

  constructor(
    private readonly supabase: SupabaseClient,
    readonly laufId: string,
    private readonly organizationId: string,
    readonly erledigt: Set<string>,
    private readonly heartbeatAlle: number,
  ) {}

  async vorbereiten(gruppen: SammelrechnungGruppe[]): Promise<void> {
    if (gruppen.length === 0) return;
    // ON CONFLICT DO NOTHING ueber den UNIQUE (lauf_id, client_id,
    // budget_type): bei einer Wiederaufnahme sind die meisten Zeilen
    // schon da und duerfen NICHT auf 'offen' zurueckgesetzt werden.
    const { error } = await this.supabase
      .from('sammelrechnungslauf_gruppen')
      .upsert(
        gruppen.map(g => ({
          lauf_id: this.laufId,
          organization_id: this.organizationId,
          client_id: g.clientId,
          budget_type: g.budgetType,
          status: 'offen',
          service_record_ids: g.recordIds,
        })),
        { onConflict: 'lauf_id,client_id,budget_type', ignoreDuplicates: true },
      );
    if (error) {
      // Ohne Gruppentabelle gibt es keine Wiederaufnahme — aber der Lauf
      // selbst kann weiterrechnen. Sichtbar machen statt abbrechen.
      log.errorWithException(
        'Sammelrechnungslauf: Gruppen konnten nicht vorgemerkt werden',
        new Error(error.message),
        { laufId: this.laufId, gruppen: gruppen.length },
      );
    }
  }

  async notiere(e: GruppenErgebnis): Promise<void> {
    const { error } = await this.supabase
      .from('sammelrechnungslauf_gruppen')
      .update({
        status: e.status,
        code: e.code ?? null,
        grund: e.grund ?? null,
        invoice_id: e.invoiceId ?? null,
        invoice_number: e.invoiceNumber ?? null,
        betrag_cent: e.betragCent ?? null,
        bestand: e.bestand === true,
        festgeschrieben: e.festgeschrieben === true,
        versand_status: e.versandStatus ?? null,
        verarbeitet_am: new Date().toISOString(),
      })
      .eq('lauf_id', this.laufId)
      .eq('client_id', e.clientId)
      .eq('budget_type', e.budgetType);

    if (error) {
      log.errorWithException(
        'Sammelrechnungslauf: Gruppenergebnis nicht schreibbar',
        new Error(error.message),
        { laufId: this.laufId, clientId: e.clientId },
      );
    }

    this.seitHeartbeat += 1;
    if (this.seitHeartbeat >= this.heartbeatAlle) {
      this.seitHeartbeat = 0;
      await this.heartbeat();
    }
  }

  /**
   * Lebenszeichen. Privat: aufgerufen wird er aus notiere(), im Takt der
   * verarbeiteten Gruppen. Ein Lauf, der arbeitet, meldet sich damit von
   * selbst; einer, der steht, hoert auf sich zu melden und gibt nach
   * `staleMinuten` die Sperre frei.
   */
  private async heartbeat(): Promise<void> {
    const { error } = await this.supabase.rpc('sammelrechnung_lauf_heartbeat', {
      p_lauf_id: this.laufId,
    });
    if (error) {
      log.warn('Sammelrechnungslauf: Herzschlag fehlgeschlagen', {
        laufId: this.laufId, fehler: error.message,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Beanspruchen
// ---------------------------------------------------------------------------

interface BeanspruchtZeile {
  lauf_id: string;
  wiederaufnahme: boolean;
  offene_gruppen: number;
}

async function beanspruche(
  supabase: SupabaseClient,
  params: LaufStartParams
): Promise<{ laufId: string; wiederaufnahme: boolean; offeneGruppen: number }> {
  const { data, error } = await supabase.rpc('sammelrechnung_lauf_beanspruchen', {
    p_organization_id: params.organizationId,
    p_period_month: params.periodMonth,
    p_actor_id: params.actorId,
    p_parameter: {
      client_ids: params.clientIds ?? null,
      max_gruppen: params.maxGruppen ?? null,
    },
    p_festschreiben: params.festschreiben === true,
    p_auto_versand: params.autoVersand === true,
    p_stale_minuten: params.staleMinuten ?? 15,
  });

  if (error) {
    const text = error.message || '';
    // SAMMELRECHNUNG_LAEUFT kommt aus der RPC; 23505 kommt vom partiellen
    // UNIQUE-Index, wenn zwei Aufrufe sich exakt gleichzeitig durch den
    // Advisory-Lock schieben. Beides ist derselbe Fall.
    if (text.includes('SAMMELRECHNUNG_LAEUFT') || error.code === '23505') {
      throw new SammelrechnungLaeuftBereitsError(
        `Für ${params.periodMonth} läuft bereits ein Sammelrechnungslauf. `
        + 'Bitte dessen Ende abwarten — ein zweiter Lauf würde dieselben Rechnungen erneut anfassen.',
        params.periodMonth,
      );
    }
    throw new Error(`Sammelrechnungslauf nicht beanspruchbar — ${text}`);
  }

  const zeile = (Array.isArray(data) ? data[0] : data) as BeanspruchtZeile | null;
  if (!zeile?.lauf_id) {
    throw new Error('Sammelrechnungslauf nicht beanspruchbar — die Datenbank lieferte keine Batch-ID.');
  }
  return {
    laufId: zeile.lauf_id,
    wiederaufnahme: zeile.wiederaufnahme === true,
    offeneGruppen: Number(zeile.offene_gruppen ?? 0),
  };
}

/** Gruppen, die ein frueherer Versuch dieses Laufs schon erledigt hat. */
async function ladeErledigte(
  supabase: SupabaseClient,
  laufId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('sammelrechnungslauf_gruppen')
    .select('client_id, budget_type, status')
    .eq('lauf_id', laufId)
    .neq('status', 'offen')
    .limit(20000);

  if (error) {
    // Fail-closed waere hier falsch herum: ohne diese Liste wuerde der
    // Lauf Gruppen erneut anfassen. Doppelte Rechnungen verhindert
    // create_invoice_draft_atomic weiterhin (alreadyExists), es kostet
    // nur Zeit. Deshalb: melden und weiterlaufen.
    log.warn('Sammelrechnungslauf: erledigte Gruppen nicht ladbar', { laufId, fehler: error.message });
    return new Set();
  }

  return new Set(
    (data || []).map(z => gruppenSchluessel(z.client_id as string, (z.budget_type as string) ?? '')),
  );
}

async function schliesseAb(
  supabase: SupabaseClient,
  laufId: string,
  status: 'abgeschlossen' | 'abgebrochen' | 'fehlgeschlagen',
  abbruchgrund?: string
): Promise<LaufKopf | null> {
  const { data, error } = await supabase.rpc('sammelrechnung_lauf_abschliessen', {
    p_lauf_id: laufId,
    p_status: status,
    p_abbruchgrund: abbruchgrund ?? null,
  });
  if (error) {
    log.errorWithException('Sammelrechnungslauf: Abschluss fehlgeschlagen', new Error(error.message), { laufId });
    return null;
  }
  const zeile = (Array.isArray(data) ? data[0] : data) as KopfZeile | null;
  return zeile ? kopfAusZeile(zeile) : null;
}

// ---------------------------------------------------------------------------
// Der Lauf
// ---------------------------------------------------------------------------

/**
 * Fuehrt einen Sammelrechnungslauf unter Batch-ID und Sperre aus.
 *
 * Ablauf:
 *   1. beanspruchen — wirft SammelrechnungLaeuftBereitsError, wenn ein
 *      lebender Lauf denselben Monat haelt
 *   2. erledigte Gruppen des Vorlaufs laden (Wiederaufnahme)
 *   3. Engine laufen lassen, jede Gruppe einzeln protokollieren
 *   4. abschliessen — die Zaehler kommen aus der Gruppentabelle, nicht
 *      aus dem Speicher dieses Prozesses
 *
 * Ein Fehler in der Engine laesst den Lauf NICHT auf 'laeuft' stehen: er
 * wird auf 'fehlgeschlagen' gesetzt und damit fuer die Wiederaufnahme
 * freigegeben. Sonst blockierte ein einziger Absturz den Monat bis zum
 * Ablauf der Stale-Frist.
 */
export async function starteSammelrechnungslauf(
  supabase: SupabaseClient,
  params: LaufStartParams
): Promise<LaufErgebnis> {
  const { laufId, wiederaufnahme } = await beanspruche(supabase, params);

  const erledigt = wiederaufnahme ? await ladeErledigte(supabase, laufId) : new Set<string>();
  const protokoll = new DbProtokoll(
    supabase,
    laufId,
    params.organizationId,
    erledigt,
    Math.max(1, params.heartbeatAlle ?? 10),
  );

  await auditOderWarnen(supabase, {
    entityType: 'sammelrechnungslauf',
    entityId: laufId,
    organizationId: params.organizationId,
    action: wiederaufnahme ? 'sammelrechnung_wiederaufgenommen' : 'sammelrechnung_gestartet',
    newState: {
      period_month: params.periodMonth,
      festschreiben: params.festschreiben === true,
      auto_versand: params.autoVersand === true,
      client_ids: params.clientIds ?? null,
      uebernommene_gruppen: erledigt.size,
    },
    reason: wiederaufnahme
      ? `Wiederaufnahme für ${params.periodMonth}: ${erledigt.size} Gruppe(n) waren bereits erledigt.`
      : `Sammelrechnungslauf für ${params.periodMonth} gestartet.`,
    actorId: params.actorId,
    batchId: laufId,
  });

  let ergebnis: SammelrechnungErgebnis;
  try {
    ergebnis = await fuehreSammelrechnungslaufAus(supabase, {
      ...params,
      dryRun: false,
      protokoll,
    });
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    await schliesseAb(supabase, laufId, 'fehlgeschlagen', grund);
    await auditOderWarnen(supabase, {
      entityType: 'sammelrechnungslauf',
      entityId: laufId,
      organizationId: params.organizationId,
      action: 'sammelrechnung_fehlgeschlagen',
      newState: { period_month: params.periodMonth },
      reason: grund,
      actorId: params.actorId,
      batchId: laufId,
    });
    throw err;
  }

  let kopf = await schliesseAb(supabase, laufId, 'abgeschlossen');

  // Ein Lauf, der noch offene Gruppen hinterlaesst (Obergrenze
  // `maxGruppen` erreicht, oder eine Gruppe konnte ihr Ergebnis nicht
  // schreiben), ist NICHT abgeschlossen. Er wird auf 'abgebrochen'
  // gesetzt — nicht als Fehlermeldung, sondern damit der naechste Lauf
  // ihn fortsetzt statt einen zweiten halben Lauf desselben Monats
  // anzulegen. 'abgeschlossen' zu melden waere die gefaehrlichere
  // Unwahrheit: der Monat saehe fertig aus.
  if (kopf && kopf.gruppenOffen > 0) {
    kopf = await schliesseAb(
      supabase,
      laufId,
      'abgebrochen',
      `${kopf.gruppenOffen} Gruppe(n) offen — der nächste Lauf setzt hier fort.`,
    ) ?? kopf;
  }

  await auditOderWarnen(supabase, {
    entityType: 'sammelrechnungslauf',
    entityId: laufId,
    organizationId: params.organizationId,
    action: 'sammelrechnung_abgeschlossen',
    newState: {
      period_month: params.periodMonth,
      gruppen: kopf?.gruppenGesamt ?? ergebnis.gruppen,
      erstellt: kopf?.gruppenErstellt ?? ergebnis.erstellt.length,
      uebersprungen: kopf?.gruppenUebersprungen ?? ergebnis.uebersprungen.length,
      fehlgeschlagen: kopf?.gruppenFehlgeschlagen ?? 0,
      offen: kopf?.gruppenOffen ?? 0,
      summe_cent: kopf?.summeCent ?? ergebnis.summeCent,
      laufzeit_ms: kopf?.laufzeitMs ?? null,
    },
    reason: `Sammelrechnungslauf ${params.periodMonth} abgeschlossen.`,
    actorId: params.actorId,
    batchId: laufId,
  });

  return {
    ...ergebnis,
    batchId: laufId,
    wiederaufnahme,
    uebernommen: erledigt.size,
    kopf: kopf ?? {
      id: laufId,
      organizationId: params.organizationId,
      periodMonth: params.periodMonth,
      status: 'abgeschlossen',
      versuch: 1,
      gestartetAm: new Date().toISOString(),
      beendetAm: new Date().toISOString(),
      laufzeitMs: null,
      gruppenGesamt: ergebnis.gruppen,
      gruppenErstellt: ergebnis.erstellt.length,
      gruppenUebersprungen: ergebnis.uebersprungen.length,
      gruppenFehlgeschlagen: 0,
      gruppenOffen: 0,
      summeCent: ergebnis.summeCent,
      abbruchgrund: null,
      festschreiben: params.festschreiben === true,
      autoVersand: params.autoVersand === true,
      actorId: params.actorId,
    },
  };
}

/**
 * Gibt eine verwaiste Sperre frei.
 *
 * Fuer den Fall, dass ein Lauf sichtbar haengt und nicht bis zum Ablauf
 * der Stale-Frist gewartet werden soll. Setzt den Lauf auf 'abgebrochen'
 * — damit ist er wiederaufnehmbar, und die bereits erledigten Gruppen
 * bleiben erhalten.
 */
export async function brichLaufAb(
  supabase: SupabaseClient,
  params: { organizationId: string; batchId: string; actorId: string; grund: string }
): Promise<LaufKopf | null> {
  const vorhanden = await ladeLauf(supabase, params);
  if (!vorhanden) return null;

  const kopf = await schliesseAb(supabase, params.batchId, 'abgebrochen', params.grund);

  await auditOderWarnen(supabase, {
    entityType: 'sammelrechnungslauf',
    entityId: params.batchId,
    organizationId: params.organizationId,
    action: 'sammelrechnung_abgebrochen',
    previousState: { status: vorhanden.kopf.status },
    newState: { status: 'abgebrochen' },
    reason: params.grund,
    actorId: params.actorId,
    batchId: params.batchId,
  });

  return kopf;
}

/** logBillingAction, das den Lauf nicht kippen darf. */
async function auditOderWarnen(
  supabase: SupabaseClient,
  params: Parameters<typeof logBillingAction>[1]
): Promise<void> {
  try {
    await logBillingAction(supabase, params);
  } catch (err) {
    log.errorWithException('Sammelrechnungslauf: Audit-Eintrag fehlgeschlagen', err, {
      entityId: params.entityId,
      action: params.action,
    });
  }
}
