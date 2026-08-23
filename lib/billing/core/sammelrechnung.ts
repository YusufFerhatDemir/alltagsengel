/**
 * Sammelrechnungslauf — Batch-Invoicing ueber alle Klienten eines Monats
 *
 * ── Wo das Modul in der Kette sitzt ─────────────────────────────────────
 *   BUCHUNG → EINSATZ → LEISTUNGSNACHWEIS → FREIGABE → **RECHNUNG** →
 *   VERSAND → ZAHLUNG → MAHNUNG
 *
 * Bisher war der Schritt "Rechnung" nur einzeln erreichbar: ueber
 * /admin/rechnungserstellung je Klient und Monat, oder ueber
 * POST /api/billing/auto-invoice fuer genau EINEN Klienten. Wer 40 Klienten
 * abrechnet, klickt 40-mal — und sieht dabei nirgends, welche Faelle
 * stillschweigend liegen bleiben.
 *
 * Dieses Modul buendelt denselben Weg zu einem Lauf und macht vor allem das
 * Liegenbleiben sichtbar: jede uebersprungene Gruppe traegt einen Code, einen
 * Klartextgrund und die betroffenen Leistungsnachweis-IDs.
 *
 * ── Was der Lauf NICHT tut ──────────────────────────────────────────────
 * Er erfindet keine Preise und lockert keine Sperre. Die Rechnung entsteht
 * unveraendert ueber `createInvoiceDraft()` → `create_invoice_draft_atomic()`.
 * Damit gelten weiterhin:
 *
 *   • Tarif-Fail-Closed: Kassenleistungen nur mit tarif_status='verified',
 *     Privatleistungen nur mit tarif_status <> 'blocked', beides nur bei
 *     ist_aktiv=TRUE und gueltigem Zeitraum. Ein blockierter oder nicht
 *     verifizierter Tarif (z. B. die §45b-Saetze) fuehrt NIE zu einer
 *     Rechnung — die Gruppe wird uebersprungen und protokolliert.
 *   • Unterschriftspflicht: ohne Unterschriftsnachweis keine Rechnung.
 *   • Budgetdeckel § 45b / § 42a inklusive der Jahres-/Monatslage.
 *
 * Die Vorpruefung in diesem Modul ist bewusst NUR eine Vorpruefung: sie
 * spiegelt die Sperre der RPC, entscheidet aber nichts. Fuehrend bleibt die
 * Datenbank. Deshalb ist die Vorpruefung auch absichtlich weniger streng als
 * die Tarifaufloesung der RPC (kein Kostentraeger-/Bundesland-Scoring) — sie
 * darf abrechenbare Faelle nicht faelschlich aussortieren. Alles, was sie
 * durchlaesst und die RPC dann doch ablehnt, wird ueber die Fehlerabbildung
 * zum selben Ueberspringen-Eintrag.
 *
 * ── Warum Gruppen und nicht einzelne Nachweise ──────────────────────────
 * `create_invoice_draft_atomic()` erzeugt genau EINE Rechnung je
 * (Klient, Budget-Typ, Monat) und nimmt dabei alle Nachweise dieses Rasters
 * mit. Ein einziger nicht abrechenbarer Nachweis laesst die ganze RPC
 * scheitern. Der Lauf gruppiert deshalb genauso und ueberspringt immer die
 * ganze Gruppe — eine halb erzeugte Rechnung gibt es nicht.
 *
 * ── Festschreiben und Versand ───────────────────────────────────────────
 * Standardmaessig endet der Lauf beim Entwurf. Festschreiben (und erst recht
 * der Versand) sind die Schritte, die nach draussen gehen und sich nicht
 * zurueckholen lassen; sie sind deshalb OPT-IN. Das ENV-Flag
 * RECHNUNGSVERSAND_AUTOMATISCH liest bewusst die Route, nicht dieses Modul —
 * eine Engine, die ihr Verhalten aus der Umgebung zieht, laesst sich nicht
 * testen und nicht erklaeren.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { billingLogger as log } from '@/lib/logger';
import { createInvoiceDraft, freezeInvoice, parseTariffError } from './invoice-engine';
import { budgetTypeToRechtsgrundlage, TarifNichtVerifiziertError, type TarifStatus } from './price-resolver';
import { tarifLeistungsart } from '../leistungsarten';
import { logBillingAction } from './audit';
import { validateTransition, isValidInvoiceStatus, type InvoiceStatus } from './status-machine';

// ---------------------------------------------------------------------------
// Vokabular
// ---------------------------------------------------------------------------

/**
 * Gruende, aus denen eine Gruppe nicht abgerechnet wird.
 *
 * Jeder Code steht fuer eine Sperre, die bewusst gesetzt ist. Keiner davon
 * ist ein "Fehler, den man wegkonfigurieren kann" — sie benennen, was fehlt,
 * damit es behoben werden kann.
 */
export const UEBERSPRING_CODES = [
  /** Erfasste Leistungsart hat keinen Tarif-Schluessel (lib/billing/leistungsarten.ts). */
  'LEISTUNGSART_UNBEKANNT',
  /** budget_type ist keiner Rechtsgrundlage zugeordnet. */
  'BUDGETTYP_UNBEKANNT',
  /** Kein aktiver, zum Leistungsdatum gueltiger Tarif vorhanden. */
  'TARIF_FEHLT',
  /** Tarif vorhanden, aber blocked bzw. (bei Kasse) nicht verified. */
  'TARIF_NICHT_VERIFIZIERT',
  /** Mehrere gleich spezifische Tarife — die RPC verweigert die Auswahl. */
  'TARIF_MEHRDEUTIG',
  /** Mindestens ein Nachweis der Gruppe traegt keinen Unterschriftsnachweis. */
  'UNTERSCHRIFT_FEHLT',
  /** Budgetlage (§ 45b / § 42a) nicht ermittelbar — Aufteilung waere geraten. */
  'BUDGETLAGE_UNBEKANNT',
  /** Alles andere, mit Originaltext im Grund. */
  'FEHLER',
] as const;

export type UeberspringCode = (typeof UEBERSPRING_CODES)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Ergebnis EINER Gruppe, wie es der Betriebsschicht gemeldet wird.
 *
 * Absichtlich flach und ohne Objektverweise: es geht so in eine
 * Datenbankzeile, und ein abgebrochener Lauf muss aus genau diesen
 * Feldern wieder aufsetzen koennen.
 */
export interface GruppenErgebnis {
  clientId: string;
  budgetType: string;
  status: 'erstellt' | 'uebersprungen' | 'fehlgeschlagen';
  code?: string | null;
  grund?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  betragCent?: number | null;
  /** Die Rechnung gab es schon (Idempotenz der RPC). */
  bestand?: boolean;
  festgeschrieben?: boolean;
  versandStatus?: string | null;
}

/**
 * Mitschrift des Laufs — implementiert in
 * lib/billing/core/sammelrechnung-lauf.ts gegen die Datenbank.
 *
 * Die Engine kennt bewusst nur dieses schmale Interface. Sie soll ohne
 * Batch-Tabellen testbar bleiben: welche Gruppe abgerechnet wird, ist
 * eine fachliche Frage und darf nicht davon abhaengen, ob ein Kopfsatz
 * geschrieben werden konnte.
 */
export interface LaufProtokoll {
  laufId: string;
  /**
   * Schluessel (`gruppenSchluessel()`) der Gruppen, die ein frueherer
   * Versuch dieses Laufs bereits erledigt hat. Sie werden uebersprungen
   * — das IST die Wiederaufnahme.
   */
  erledigt: ReadonlySet<string>;
  /** Alle Gruppen des Laufs vormerken, bevor die erste bearbeitet wird. */
  vorbereiten(gruppen: SammelrechnungGruppe[]): Promise<void>;
  notiere(ergebnis: GruppenErgebnis): Promise<void>;
}

// Der Herzschlag steht bewusst NICHT in diesem Interface. Er ist eine
// Eigenschaft der Sperre, nicht der Abrechnung: die Betriebsschicht
// setzt ihn selbst, waehrend sie die Gruppenergebnisse wegschreibt
// (lib/billing/core/sammelrechnung-lauf.ts, DbProtokoll.notiere).
// Haenge er hier, muesste die Engine etwas ueber Sperren wissen.

/**
 * Schluessel einer Gruppe. Eine Stelle, damit Gruppenbildung,
 * Wiederaufnahme und Datenbankzeile nie auseinanderlaufen.
 */
export function gruppenSchluessel(clientId: string, budgetType: string): string {
  return `${clientId}::${budgetType || ''}`;
}

export interface SammelrechnungParams {
  organizationId: string;
  /** Abrechnungsmonat im Format YYYY-MM. */
  periodMonth: string;
  actorId: string;
  /** Nur pruefen und melden, nichts schreiben. */
  dryRun?: boolean;
  /** Auf einzelne Klienten einschraenken (leer/weggelassen = alle). */
  clientIds?: string[];
  /**
   * Entwurf → geprueft → festgeschrieben in einem Zug.
   * OPT-IN: die Festschreibung ist der Punkt, ab dem die Rechnung als Beleg
   * gilt und nur noch per Storno korrigierbar ist.
   */
  festschreiben?: boolean;
  /**
   * Nach der Festschreibung per E-Mail an den Klienten senden.
   * Setzt `festschreiben` voraus — eine nicht festgeschriebene Rechnung darf
   * das Haus nicht verlassen (siehe lib/billing/versand/rechnung-versand.ts).
   */
  autoVersand?: boolean;
  /** Obergrenze der bearbeiteten Gruppen je Lauf (Standard 500). */
  maxGruppen?: number;
  /**
   * Mitschrift gegen die Batch-Tabellen. Ohne sie laeuft die Engine
   * genau wie vorher — nur eben ohne Batch-ID und Wiederaufnahme.
   */
  protokoll?: LaufProtokoll;
}

export interface SammelrechnungGruppe {
  clientId: string;
  budgetType: string;
  /** Aus dem budget_type abgeleitet; null, wenn der Typ unbekannt ist. */
  rechtsgrundlage: string | null;
  recordIds: string[];
  /** Nachweise im Status 'signed'. */
  signiert: number;
  /** Nachweise im Status 'complete' — die RPC nimmt sie mit. */
  abgeschlossen: number;
  /** Summe der bei der Erfassung notierten Betraege (NICHT der Rechnungsbetrag). */
  erfassterBetragEuro: number;
}

export interface SammelrechnungErstellt {
  clientId: string;
  budgetType: string;
  invoiceId: string;
  invoiceNumber: string;
  totalAmountCents: number;
  lineCount: number;
  /** true = die Rechnung gab es schon (Idempotenz), es wurde nichts neu erzeugt. */
  alreadyExists: boolean;
  recordCount: number;
  /** Wurde der Budgetdeckel § 45b / § 42a wirksam? */
  budgetGedeckelt: boolean;
  festgeschrieben: boolean;
  /** 'versendet' | 'uebersprungen' | 'fehlgeschlagen' — nur mit autoVersand. */
  versandStatus?: string | null;
}

export interface SammelrechnungUebersprungen {
  clientId: string;
  budgetType: string;
  code: UeberspringCode;
  grund: string;
  recordIds: string[];
  details?: Record<string, unknown>;
}

export interface SammelrechnungErgebnis {
  organizationId: string;
  periodMonth: string;
  zeitraum: { von: string; bis: string };
  dryRun: boolean;
  festschreiben: boolean;
  autoVersand: boolean;
  /** Anzahl gebildeter (Klient, Budget-Typ)-Gruppen. */
  gruppen: number;
  erstellt: SammelrechnungErstellt[];
  uebersprungen: SammelrechnungUebersprungen[];
  /** Nur im dryRun gefuellt: Gruppen, die der Lauf abrechnen wuerde. */
  vorschau: SammelrechnungGruppe[];
  /** Summe der neu erzeugten Rechnungen in Cent (ohne `alreadyExists`). */
  summeCent: number;
  /** Gruppen, die wegen `maxGruppen` gar nicht erst betrachtet wurden. */
  nichtBetrachtet: number;
  /**
   * Gruppen, die ein frueherer Versuch desselben Laufs schon erledigt
   * hatte und die dieser Versuch deshalb nicht erneut angefasst hat.
   */
  uebernommen: number;
}

// ---------------------------------------------------------------------------
// Hilfsstrukturen
// ---------------------------------------------------------------------------

/** Nur die Spalten, die der Lauf wirklich braucht. */
export interface SammelrechnungNachweis {
  id: string;
  client_id: string;
  budget_type: string | null;
  service_type: string | null;
  date: string;
  status: string;
  amount: number | null;
  proof_status: string | null;
  signature_hash: string | null;
}

interface TarifRow {
  id: string;
  leistungsart: string;
  rechtsgrundlage: string;
  gueltig_ab: string;
  gueltig_bis: string | null;
  tarif_status: TarifStatus;
}

/** Ein Nachweis gilt als unterschrieben — identisch zur Pruefung in der RPC. */
function istUnterschrieben(r: SammelrechnungNachweis): boolean {
  return r.proof_status === 'UNTERSCHRIEBEN' || r.signature_hash != null;
}

export function monatsZeitraum(periodMonth: string): { von: string; bis: string } {
  if (!/^\d{4}-\d{2}$/.test(periodMonth)) {
    throw new Error(`periodMonth "${periodMonth}" ist kein Monat im Format YYYY-MM.`);
  }
  const [jahr, monat] = periodMonth.split('-').map(Number);
  if (monat < 1 || monat > 12) {
    throw new Error(`periodMonth "${periodMonth}" enthaelt keinen gueltigen Monat.`);
  }
  const letzterTag = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  return {
    von: `${periodMonth}-01`,
    bis: `${periodMonth}-${String(letzterTag).padStart(2, '0')}`,
  };
}

// ---------------------------------------------------------------------------
// Fehlerabbildung
// ---------------------------------------------------------------------------

/**
 * Bildet einen Fehler aus `createInvoiceDraft()` auf einen Ueberspring-Code ab.
 *
 * Fuehrend bleibt die Datenbank: was hier ankommt, hat die RPC bereits
 * abgelehnt. Die Abbildung macht daraus nur eine auswertbare Meldung.
 */
export function ueberspringCodeFuerFehler(err: unknown): { code: UeberspringCode; grund: string } {
  const grund = err instanceof Error ? err.message : String(err);

  if (err instanceof TarifNichtVerifiziertError) {
    return { code: 'TARIF_NICHT_VERIFIZIERT', grund };
  }

  const tarifCode = parseTariffError(grund);
  if (tarifCode === 'MISSING_VALID_TARIFF') return { code: 'TARIF_FEHLT', grund };
  if (tarifCode === 'AMBIGUOUS_TARIFF') return { code: 'TARIF_MEHRDEUTIG', grund };

  if (grund.includes('MISSING_SIGNATURE')) return { code: 'UNTERSCHRIFT_FEHLT', grund };
  if (grund.includes('Unbekannter budget_type')) return { code: 'BUDGETTYP_UNBEKANNT', grund };
  // budget-cap.ts: BudgetLageNichtErmittelbarError traegt diesen Namen.
  if (err instanceof Error && err.name === 'BudgetLageNichtErmittelbarError') {
    return { code: 'BUDGETLAGE_UNBEKANNT', grund };
  }
  if (grund.includes('Budgetlage')) return { code: 'BUDGETLAGE_UNBEKANNT', grund };

  return { code: 'FEHLER', grund };
}

// ---------------------------------------------------------------------------
// Gruppenbildung
// ---------------------------------------------------------------------------

/**
 * Sammelt alle abrechenbaren Leistungsnachweise des Monats und gruppiert sie
 * nach (Klient, Budget-Typ) — dem Raster, in dem die RPC Rechnungen erzeugt.
 *
 * Beruecksichtigt werden Nachweise im Status 'signed' UND 'complete': die RPC
 * nimmt beide mit. Eine Gruppe entsteht aber nur, wenn mindestens ein
 * 'signed'-Nachweis darin liegt — allein 'complete' heisst, dass die Freigabe
 * noch aussteht, und dann ist der Monat fuer diesen Klienten noch nicht dran.
 *
 * Kein deleted_at-Filter: `service_records` fuehrt die Spalte nicht, und die
 * RPC filtert ebenfalls nicht danach. Ein Filter waere hier ein 42703 und
 * damit ein still leerer Lauf.
 */
export async function ermittleGruppen(
  supabase: SupabaseClient,
  params: { organizationId: string; periodMonth: string; clientIds?: string[] }
): Promise<{ gruppen: SammelrechnungGruppe[]; records: Map<string, SammelrechnungNachweis[]> }> {
  const { von, bis } = monatsZeitraum(params.periodMonth);

  let query = supabase
    .from('service_records')
    .select('id, client_id, budget_type, service_type, date, status, amount, proof_status, signature_hash')
    .eq('organization_id', params.organizationId)
    .in('status', ['signed', 'complete'])
    .gte('date', von)
    .lte('date', bis)
    .order('date', { ascending: true })
    .limit(20000);

  if (params.clientIds && params.clientIds.length > 0) {
    query = query.in('client_id', params.clientIds);
  }

  const { data, error } = await query.returns<SammelrechnungNachweis[]>();
  if (error) {
    throw new Error(`Sammelrechnungslauf: Leistungsnachweise nicht ladbar — ${error.message}`);
  }

  const nachSchluessel = new Map<string, SammelrechnungNachweis[]>();
  for (const r of data || []) {
    // budget_type ist der zweite Teil des Rasters. Fehlt er, kann die Zeile
    // keiner Rechnung zugeordnet werden — sie taucht als eigene Gruppe mit
    // unbekanntem Budget-Typ auf, statt still zu verschwinden.
    const budgetType = r.budget_type || '';
    const key = gruppenSchluessel(r.client_id, budgetType);
    const liste = nachSchluessel.get(key);
    if (liste) liste.push(r);
    else nachSchluessel.set(key, [r]);
  }

  const gruppen: SammelrechnungGruppe[] = [];
  for (const [key, rows] of nachSchluessel) {
    const signiert = rows.filter(r => r.status === 'signed').length;
    if (signiert === 0) continue; // nur 'complete' → Freigabe steht noch aus

    const [clientId, budgetType] = key.split('::');
    let rechtsgrundlage: string | null = null;
    try {
      rechtsgrundlage = budgetTypeToRechtsgrundlage(budgetType);
    } catch {
      rechtsgrundlage = null;
    }

    gruppen.push({
      clientId,
      budgetType,
      rechtsgrundlage,
      recordIds: rows.map(r => r.id),
      signiert,
      abgeschlossen: rows.length - signiert,
      erfassterBetragEuro:
        Math.round(rows.reduce((s, r) => s + Number(r.amount || 0), 0) * 100) / 100,
    });
  }

  // Stabile Reihenfolge: gleiche Eingabe → gleiche Abarbeitung, damit ein
  // abgebrochener Lauf beim Wiederholen dieselben Gruppen zuerst nimmt.
  gruppen.sort((a, b) =>
    a.clientId === b.clientId
      ? a.budgetType.localeCompare(b.budgetType)
      : a.clientId.localeCompare(b.clientId)
  );

  return { gruppen, records: nachSchluessel };
}

// ---------------------------------------------------------------------------
// Tarif-Vorpruefung
// ---------------------------------------------------------------------------

/**
 * Laedt die aktiven Tarife des Mandanten.
 *
 * Ohne `.in('leistungsart', …)`-Filter, weil die RPC ueber
 * `LOWER(bt.leistungsart)` vergleicht — ein Gleichheitsfilter auf der
 * ungenormten Spalte wuerde abweichend geschriebene Tarife uebersehen und
 * damit abrechenbare Faelle faelschlich als TARIF_FEHLT melden.
 */
async function ladeTarife(
  supabase: SupabaseClient,
  organizationId: string
): Promise<TarifRow[]> {
  const { data, error } = await supabase
    .from('billing_tariffs')
    .select('id, leistungsart, rechtsgrundlage, gueltig_ab, gueltig_bis, tarif_status')
    .eq('organization_id', organizationId)
    .eq('ist_aktiv', true)
    .is('deleted_at', null)
    .limit(5000)
    .returns<TarifRow[]>();

  if (error) {
    throw new Error(`Sammelrechnungslauf: Tarife nicht ladbar — ${error.message}`);
  }
  return data || [];
}

/**
 * Spiegelt die Fail-Closed-Regel der RPC:
 *   Kasse   → nur tarif_status = 'verified'
 *   Privat  → alles ausser 'blocked'
 */
function tarifIstAbrechenbar(status: TarifStatus, istKasse: boolean): boolean {
  return istKasse ? status === 'verified' : status !== 'blocked';
}

/**
 * Prueft eine Gruppe VOR dem Schreiben.
 *
 * Liefert `null`, wenn nichts dagegen spricht. Die Pruefung ist bewusst
 * grosszuegiger als die Tarifaufloesung der RPC (kein Kostentraeger-/
 * Bundesland-Scoring): sie soll Klarheit schaffen, aber keinen abrechenbaren
 * Fall aussortieren. Die endgueltige Entscheidung faellt in der Datenbank.
 */
export function pruefeGruppe(
  gruppe: SammelrechnungGruppe,
  rows: SammelrechnungNachweis[],
  tarife: TarifRow[]
): SammelrechnungUebersprungen | null {
  const basis = { clientId: gruppe.clientId, budgetType: gruppe.budgetType, recordIds: gruppe.recordIds };

  // ── 1. Budget-Typ ──
  if (!gruppe.rechtsgrundlage) {
    return {
      ...basis,
      code: 'BUDGETTYP_UNBEKANNT',
      grund: gruppe.budgetType
        ? `Budget-Typ "${gruppe.budgetType}" ist keiner Rechtsgrundlage zugeordnet.`
        : 'Leistungsnachweise ohne Budget-Typ können keiner Rechnung zugeordnet werden.',
    };
  }
  const istKasse = gruppe.rechtsgrundlage !== 'privat';

  // ── 2. Unterschriftsnachweis ──
  // Vor der Tarifpruefung: eine fehlende Unterschrift laesst die RPC ohnehin
  // scheitern, und der Hinweis "unterschreiben lassen" ist der konkretere.
  const ohneUnterschrift = rows.filter(r => !istUnterschrieben(r));
  if (ohneUnterschrift.length > 0) {
    return {
      ...basis,
      code: 'UNTERSCHRIFT_FEHLT',
      grund:
        `${ohneUnterschrift.length} von ${rows.length} Leistungsnachweis(en) tragen keinen `
        + 'Unterschriftsnachweis. Ohne Unterschrift wird keine Rechnung erstellt.',
      details: {
        ohne_unterschrift: ohneUnterschrift.slice(0, 20).map(r => ({ id: r.id, datum: r.date })),
      },
    };
  }

  // ── 3. Leistungsart → Tarif-Schluessel ──
  const unbekannteArten = new Set<string>();
  const arten = new Map<string, SammelrechnungNachweis[]>();
  for (const r of rows) {
    const art = tarifLeistungsart(r.service_type);
    if (!art) {
      unbekannteArten.add(r.service_type || '(leer)');
      continue;
    }
    const liste = arten.get(art);
    if (liste) liste.push(r);
    else arten.set(art, [r]);
  }
  if (unbekannteArten.size > 0) {
    return {
      ...basis,
      code: 'LEISTUNGSART_UNBEKANNT',
      grund:
        `Für ${[...unbekannteArten].map(a => `"${a}"`).join(', ')} gibt es keinen Tarif-Schlüssel. `
        + 'Diese Leistung ist über billing_tariffs nicht abrechenbar.',
      details: { leistungsarten: [...unbekannteArten] },
    };
  }

  // ── 4. Tarifbestand und Tarifstatus ──
  for (const [art, artRows] of arten) {
    for (const r of artRows) {
      const kandidaten = tarife.filter(
        t =>
          t.leistungsart.toLowerCase() === art
          && t.rechtsgrundlage === gruppe.rechtsgrundlage
          && t.gueltig_ab <= r.date
          && (t.gueltig_bis === null || t.gueltig_bis >= r.date)
      );

      if (kandidaten.length === 0) {
        return {
          ...basis,
          code: 'TARIF_FEHLT',
          grund:
            `Kein aktiver Tarif für "${art}" / ${gruppe.rechtsgrundlage} zum ${r.date}. `
            + 'Ohne hinterlegten Satz wird nicht abgerechnet.',
          details: { leistungsart: art, datum: r.date, service_record_id: r.id },
        };
      }

      const abrechenbar = kandidaten.filter(t => tarifIstAbrechenbar(t.tarif_status, istKasse));
      if (abrechenbar.length === 0) {
        const blockiert = kandidaten.some(t => t.tarif_status === 'blocked');
        return {
          ...basis,
          code: 'TARIF_NICHT_VERIFIZIERT',
          grund: blockiert
            ? `Tarif "${art}" (${gruppe.rechtsgrundlage}) ist gesperrt. Abrechnung blockiert.`
            : `Tarif "${art}" (${gruppe.rechtsgrundlage}) ist nicht verifiziert. `
              + 'Ohne belegten Satz wird nicht abgerechnet.',
          details: {
            leistungsart: art,
            datum: r.date,
            service_record_id: r.id,
            tarif_status: [...new Set(kandidaten.map(t => t.tarif_status))],
          },
        };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Festschreibung
// ---------------------------------------------------------------------------

/**
 * Entwurf → geprueft → festgeschrieben.
 *
 * `freezeInvoice()` verlangt den Status 'geprueft'; der Zwischenschritt ist
 * in der Oberflaeche die sachliche Pruefung. Im Lauf ist er ein eigener,
 * protokollierter Statuswechsel — nicht ein stilles Ueberspringen der
 * Statusmaschine.
 */
async function schreibeFest(
  supabase: SupabaseClient,
  params: {
    invoiceId: string;
    organizationId: string;
    actorId: string;
    autoVersand: boolean;
  }
): Promise<{ festgeschrieben: boolean; versandStatus?: string | null; grund?: string }> {
  const { invoiceId, organizationId, actorId, autoVersand } = params;

  const { data: inv, error } = await supabase
    .from('invoices')
    .select('id, status, frozen_at')
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !inv) {
    return { festgeschrieben: false, grund: `Rechnung nach der Erstellung nicht lesbar: ${error?.message ?? 'keine Zeile'}` };
  }
  if (inv.frozen_at) {
    return { festgeschrieben: true, grund: 'War bereits festgeschrieben.' };
  }

  const aktuell = String(inv.status);
  if (aktuell === 'entwurf') {
    if (isValidInvoiceStatus(aktuell)) {
      validateTransition(aktuell as InvoiceStatus, 'geprueft');
    }
    const { error: updError } = await supabase
      .from('invoices')
      .update({ status: 'geprueft' })
      .eq('id', invoiceId)
      .eq('status', 'entwurf'); // Race-Schutz: nur vom erwarteten Ausgangsstatus
    if (updError) {
      return { festgeschrieben: false, grund: `Statuswechsel auf "geprueft" fehlgeschlagen: ${updError.message}` };
    }
    await auditOderWarnen(supabase, {
      entityType: 'invoice',
      entityId: invoiceId,
      organizationId,
      action: 'status_geprueft',
      previousState: { status: 'entwurf' },
      newState: { status: 'geprueft' },
      reason: 'Sachliche Prüfung im Sammelrechnungslauf',
      actorId,
    });
  }

  const ergebnis = await freezeInvoice(supabase, invoiceId, actorId, organizationId, { autoVersand });
  return { festgeschrieben: true, versandStatus: ergebnis.versandStatus ?? null };
}

/**
 * Gruppenergebnis in die Mitschrift — ohne den Lauf zu gefaehrden.
 *
 * Die Mitschrift ist eine Betriebsspur, keine fachliche Entscheidung.
 * Faellt sie aus, entstehen trotzdem die richtigen Rechnungen; es fehlt
 * dann nur die Wiederaufnahmefaehigkeit. Ein Abbruch waere hier der
 * teurere Fehler.
 */
async function notiereOderWarnen(
  protokoll: LaufProtokoll | undefined,
  ergebnis: GruppenErgebnis
): Promise<void> {
  if (!protokoll) return;
  try {
    await protokoll.notiere(ergebnis);
  } catch (err) {
    log.errorWithException('Sammelrechnungslauf: Gruppenergebnis nicht protokollierbar', err, {
      clientId: ergebnis.clientId,
      budgetType: ergebnis.budgetType,
    });
  }
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

// ---------------------------------------------------------------------------
// Lauf
// ---------------------------------------------------------------------------

export async function fuehreSammelrechnungslaufAus(
  supabase: SupabaseClient,
  params: SammelrechnungParams
): Promise<SammelrechnungErgebnis> {
  const {
    organizationId,
    periodMonth,
    actorId,
    dryRun = false,
    clientIds,
    festschreiben = false,
    autoVersand = false,
    maxGruppen = 500,
    protokoll,
  } = params;

  if (!organizationId) {
    throw new Error('Sammelrechnungslauf ohne organizationId: der Lauf würde Mandanten vermischen.');
  }
  if (autoVersand && !festschreiben) {
    // Fail-closed statt still nichts tun: der Aufrufer erwartet Versand, der
    // Versand setzt aber eine festgeschriebene Rechnung voraus.
    throw new Error(
      'autoVersand ohne festschreiben ist nicht möglich: eine nicht festgeschriebene '
      + 'Rechnung darf nicht versendet werden.'
    );
  }

  const zeitraum = monatsZeitraum(periodMonth);

  const ergebnis: SammelrechnungErgebnis = {
    organizationId,
    periodMonth,
    zeitraum,
    dryRun,
    festschreiben,
    autoVersand,
    gruppen: 0,
    erstellt: [],
    uebersprungen: [],
    vorschau: [],
    summeCent: 0,
    nichtBetrachtet: 0,
    uebernommen: 0,
  };

  const { gruppen, records } = await ermittleGruppen(supabase, { organizationId, periodMonth, clientIds });
  ergebnis.gruppen = gruppen.length;

  if (gruppen.length === 0) return ergebnis;

  // Alle Gruppen vormerken — auch die, die wegen `maxGruppen` in diesem
  // Versuch nicht drankommen. Nur so weiss ein spaeterer Versuch, dass da
  // noch etwas offen ist; ohne den Eintrag saehe der Monat abgerechnet aus.
  if (protokoll && !dryRun) {
    await protokoll.vorbereiten(gruppen);
  }

  const tarife = await ladeTarife(supabase, organizationId);

  // WIEDERAUFNAHME: was ein frueherer Versuch dieses Laufs schon erledigt
  // hat, wird nicht erneut angefasst. Das spart nicht nur Zeit — ein
  // erneuter Durchlauf wuerde fuer jede uebersprungene Gruppe einen
  // zweiten Audit-Eintrag schreiben und die Spur verdoppeln.
  const offeneGruppen = protokoll
    ? gruppen.filter(g => !protokoll.erledigt.has(gruppenSchluessel(g.clientId, g.budgetType)))
    : gruppen;
  ergebnis.uebernommen = gruppen.length - offeneGruppen.length;

  const zuBearbeiten = offeneGruppen.slice(0, maxGruppen);
  ergebnis.nichtBetrachtet = offeneGruppen.length - zuBearbeiten.length;
  if (ergebnis.nichtBetrachtet > 0) {
    // Nie still abschneiden: eine gekappte Liste sieht sonst aus wie ein
    // vollstaendiger Lauf.
    log.warn('Sammelrechnungslauf: Obergrenze erreicht', {
      organizationId, periodMonth, maxGruppen, nichtBetrachtet: ergebnis.nichtBetrachtet,
    });
  }

  // TEILFEHLER: jede Gruppe steht fuer sich. Was hier drin scheitert,
  // beendet diese eine Gruppe — nie den Lauf. Die aeussere Klammer faengt
  // auch das, was ausserhalb der inneren try-Bloecke passieren kann
  // (Vorpruefung, Protokollschreiben, Programmierfehler): ohne sie
  // koennte eine einzige unerwartete Ausnahme in Gruppe 3 die
  // verbleibenden sieben um ihre Rechnung bringen.
  for (const gruppe of zuBearbeiten) {
    try {
      await verarbeiteGruppe(gruppe);
    } catch (unerwartet) {
      const grund = unerwartet instanceof Error ? unerwartet.message : String(unerwartet);
      log.errorWithException('Sammelrechnungslauf: Gruppe unerwartet abgebrochen', unerwartet, {
        organizationId, periodMonth, clientId: gruppe.clientId, budgetType: gruppe.budgetType,
      });
      ergebnis.uebersprungen.push({
        clientId: gruppe.clientId,
        budgetType: gruppe.budgetType,
        code: 'FEHLER',
        grund,
        recordIds: gruppe.recordIds,
      });
      await notiereOderWarnen(protokoll, {
        clientId: gruppe.clientId,
        budgetType: gruppe.budgetType,
        status: 'fehlgeschlagen',
        code: 'FEHLER',
        grund,
      });
    }
  }

  async function verarbeiteGruppe(gruppe: SammelrechnungGruppe): Promise<void> {
    const rows = records.get(gruppenSchluessel(gruppe.clientId, gruppe.budgetType)) || [];

    const befund = pruefeGruppe(gruppe, rows, tarife);
    if (befund) {
      ergebnis.uebersprungen.push(befund);
      if (!dryRun) {
        // Das Ueberspringen ist der forensisch interessante Fall: hier wurde
        // eine erbrachte Leistung NICHT in Rechnung gestellt. entity_type
        // 'invoice_draft' traegt bewusst die client_id — eine Rechnung
        // existiert an dieser Stelle nicht.
        await auditOderWarnen(supabase, {
          entityType: 'invoice_draft',
          entityId: gruppe.clientId,
          organizationId,
          action: 'sammelrechnung_uebersprungen',
          newState: {
            code: befund.code,
            period_month: periodMonth,
            budget_type: gruppe.budgetType,
            rechtsgrundlage: gruppe.rechtsgrundlage,
            service_record_ids: befund.recordIds.slice(0, 50),
            details: befund.details ?? null,
          },
          reason: befund.grund,
          actorId,
          batchId: protokoll?.laufId,
        });
        await notiereOderWarnen(protokoll, {
          clientId: gruppe.clientId,
          budgetType: gruppe.budgetType,
          status: 'uebersprungen',
          code: befund.code,
          grund: befund.grund,
        });
      }
      return;
    }

    if (dryRun) {
      ergebnis.vorschau.push(gruppe);
      return;
    }

    try {
      const entwurf = await createInvoiceDraft(supabase, {
        clientId: gruppe.clientId,
        periodMonth,
        budgetType: gruppe.budgetType,
        actorId,
      });

      const treffer: SammelrechnungErstellt = {
        clientId: gruppe.clientId,
        budgetType: gruppe.budgetType,
        invoiceId: entwurf.invoiceId,
        invoiceNumber: entwurf.invoiceNumber,
        totalAmountCents: entwurf.totalAmountCents,
        lineCount: entwurf.lineCount,
        alreadyExists: entwurf.alreadyExists,
        recordCount: rows.length,
        budgetGedeckelt: entwurf.budgetDeckel?.gedeckelt === true,
        festgeschrieben: false,
      };

      // Bestandsrechnungen zaehlen nicht in die Summe: sie waren schon da,
      // sonst meldete jeder Wiederholungslauf denselben Umsatz erneut.
      if (!entwurf.alreadyExists) ergebnis.summeCent += entwurf.totalAmountCents;

      if (festschreiben) {
        try {
          const fest = await schreibeFest(supabase, {
            invoiceId: entwurf.invoiceId,
            organizationId,
            actorId,
            autoVersand,
          });
          treffer.festgeschrieben = fest.festgeschrieben;
          treffer.versandStatus = fest.versandStatus ?? null;
          if (!fest.festgeschrieben && fest.grund) {
            log.warn('Sammelrechnungslauf: Festschreibung nicht möglich', {
              invoiceId: entwurf.invoiceId, grund: fest.grund,
            });
          }
        } catch (freezeErr) {
          // Die Rechnung existiert bereits — ein Fehlschlag beim
          // Festschreiben macht daraus keinen fehlgeschlagenen Entwurf.
          // Sie bleibt als Entwurf stehen und ist manuell festschreibbar.
          log.errorWithException('Sammelrechnungslauf: Festschreibung fehlgeschlagen', freezeErr, {
            invoiceId: entwurf.invoiceId,
          });
        }
      }

      ergebnis.erstellt.push(treffer);
      await notiereOderWarnen(protokoll, {
        clientId: gruppe.clientId,
        budgetType: gruppe.budgetType,
        status: 'erstellt',
        invoiceId: treffer.invoiceId,
        invoiceNumber: treffer.invoiceNumber,
        betragCent: treffer.totalAmountCents,
        bestand: treffer.alreadyExists,
        festgeschrieben: treffer.festgeschrieben,
        versandStatus: treffer.versandStatus ?? null,
      });
    } catch (err) {
      const { code, grund } = ueberspringCodeFuerFehler(err);
      ergebnis.uebersprungen.push({
        clientId: gruppe.clientId,
        budgetType: gruppe.budgetType,
        code,
        grund,
        recordIds: gruppe.recordIds,
      });
      await auditOderWarnen(supabase, {
        entityType: 'invoice_draft',
        entityId: gruppe.clientId,
        organizationId,
        action: 'sammelrechnung_uebersprungen',
        newState: {
          code,
          period_month: periodMonth,
          budget_type: gruppe.budgetType,
          rechtsgrundlage: gruppe.rechtsgrundlage,
          service_record_ids: gruppe.recordIds.slice(0, 50),
          quelle: 'create_invoice_draft_atomic',
        },
        reason: grund,
        actorId,
        batchId: protokoll?.laufId,
      });
      // 'FEHLER' ist der Sammelcode fuer alles, was die RPC nicht selbst
      // benennt — technisches Scheitern. Die uebrigen Codes sind bewusste
      // Sperren. Beides im Lauf zu unterscheiden ist der Unterschied
      // zwischen „muss jemand ansehen" und „ist so gewollt".
      await notiereOderWarnen(protokoll, {
        clientId: gruppe.clientId,
        budgetType: gruppe.budgetType,
        status: code === 'FEHLER' ? 'fehlgeschlagen' : 'uebersprungen',
        code,
        grund,
      });
    }
  }

  log.info('Sammelrechnungslauf abgeschlossen', {
    organizationId,
    periodMonth,
    dryRun,
    gruppen: ergebnis.gruppen,
    erstellt: ergebnis.erstellt.length,
    uebersprungen: ergebnis.uebersprungen.length,
    summeCent: ergebnis.summeCent,
  });

  return ergebnis;
}
