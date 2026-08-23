/**
 * VP/KZP — Bestandsdaten laden
 *
 * Die einzige Stelle dieses Moduls mit Datenbankzugriff. Alles darunter
 * (zeitraum.ts, berechnung.ts, pruefprotokoll.ts) rechnet ohne Datenbank
 * und ist damit vollstaendig ohne Fixtures testbar.
 *
 * ── Fail-Closed ─────────────────────────────────────────────────────────
 * Jeder Lesefehler wirft. Ein leeres Ergebnis nach einem Fehler saehe aus
 * wie "dieser Klient hat noch nichts verbraucht" — und wuerde ein bereits
 * ausgeschoepftes Kontingent erneut freigeben. Das ist der Grund, warum
 * hier nirgends `data ?? []` nach einem unbehandelten `error` steht.
 *
 * Zur Erinnerung an die Audit-Methodik dieses Repos: bei PostgREST ist ein
 * leeres Ergebnis mehrdeutig (kein Datensatz ODER durch RLS ausgeblendet).
 * Deshalb wird organization_id hier IMMER explizit gefiltert, statt sich
 * auf den org_fence zu verlassen — die RLS-Policy ist die Sperre, der
 * Filter ist die Aussage.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { pflegegradVon, PFLEGEGRAD_SPALTEN } from '@/lib/clients/pflegegrad'
import { teileNachKalenderjahr, type Zeitraum } from './zeitraum'
import { leererStand, type JahresStand } from './berechnung'
import { istVpKzpArt } from './konstanten'
import type { BestandsBuchung } from './pruefprotokoll'

export class VpKzpLageNichtErmittelbarError extends Error {
  constructor(grund: string) {
    super(
      `VP/KZP-Lage nicht ermittelbar: ${grund}. `
      + `Es wurde NICHTS gebucht — eine Leistung ohne pruefbares Kontingent waere `
      + `schlimmer als eine ausbleibende Buchung.`
    )
    this.name = 'VpKzpLageNichtErmittelbarError'
  }
}

export interface VpKzpBestand {
  clientId: string
  organizationId: string
  /** null, wenn beim Klienten kein Pflegegrad hinterlegt ist. */
  pflegegrad: number | null
  /** Ein Eintrag je betroffenem Kalenderjahr — auch ohne Vorverbrauch. */
  staende: JahresStand[]
  /** Aktive Buchungen der betroffenen Jahre (ohne stornierte). */
  bestand: BestandsBuchung[]
}

interface UsageZeile {
  calendar_year: number
  vp_days_used: number | null
  kzp_days_used: number | null
  vp_amount_used: number | null
  kzp_amount_used: number | null
  combined_budget_total: number | null
}

interface BuchungsZeile {
  id: string
  art: string
  zeitraum_von: string
  zeitraum_bis: string
  status: string | null
}

/**
 * Laedt alles, was pruefeBuchung() an Bestandsdaten braucht.
 *
 * `jahre` ergibt sich aus dem geplanten Zeitraum: bei einem Zeitraum ueber
 * den Jahreswechsel werden BEIDE Jahresstaende geladen, weil jedes Jahr
 * sein eigenes Kontingent und sein eigenes Budget hat.
 */
export async function ladeBestand(
  supabase: SupabaseClient,
  params: { clientId: string; organizationId: string; zeitraum: Zeitraum },
): Promise<VpKzpBestand> {
  const { clientId, organizationId, zeitraum } = params

  if (!clientId || !organizationId) {
    throw new VpKzpLageNichtErmittelbarError('Klient oder Mandant fehlt')
  }

  const jahre = teileNachKalenderjahr(zeitraum).map(s => s.jahr)

  // ── 1. Pflegegrad ─────────────────────────────────────────────────
  const { data: klient, error: klientError } = await supabase
    .from('clients')
    .select(`id, ${PFLEGEGRAD_SPALTEN}`)
    .eq('id', clientId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (klientError) {
    throw new VpKzpLageNichtErmittelbarError(`clients nicht lesbar (${klientError.message})`)
  }
  if (!klient) {
    throw new VpKzpLageNichtErmittelbarError(
      'Klient nicht gefunden oder gehoert zu einem anderen Mandanten',
    )
  }

  // ── 2. Jahresstaende ──────────────────────────────────────────────
  const { data: usage, error: usageError } = await supabase
    .from('client_vpkzp_usage')
    .select('calendar_year, vp_days_used, kzp_days_used, vp_amount_used, kzp_amount_used, combined_budget_total')
    .eq('client_id', clientId)
    .eq('organization_id', organizationId)
    .in('calendar_year', jahre)

  if (usageError) {
    throw new VpKzpLageNichtErmittelbarError(
      `client_vpkzp_usage nicht lesbar (${usageError.message})`,
    )
  }

  // ── 3. Abweichende Bewilligung aus client_budgets ─────────────────
  // Fuer Jahre ohne eigene Standzeile ist combined_annual_amount die
  // naechstbeste Quelle; sie traegt die Bewilligung der Kasse. Nur wenn
  // auch dort nichts steht, greift der gesetzliche Wert.
  const { data: budgets, error: budgetError } = await supabase
    .from('client_budgets')
    .select('year, combined_annual_amount')
    .eq('client_id', clientId)
    .eq('organization_id', organizationId)
    .in('year', jahre)

  if (budgetError) {
    throw new VpKzpLageNichtErmittelbarError(
      `client_budgets nicht lesbar (${budgetError.message})`,
    )
  }

  const usageNachJahr = new Map<number, UsageZeile>(
    ((usage ?? []) as UsageZeile[]).map(z => [Number(z.calendar_year), z]),
  )
  const budgetNachJahr = new Map<number, number>(
    ((budgets ?? []) as { year: number; combined_annual_amount: number | null }[])
      .map(z => [Number(z.year), Number(z.combined_annual_amount ?? 0)]),
  )

  const staende: JahresStand[] = jahre.map(jahr => {
    const z = usageNachJahr.get(jahr)
    if (!z) {
      const ausBudget = budgetNachJahr.get(jahr) ?? 0
      return { ...leererStand(jahr), kombiniertesBudgetEuro: ausBudget > 0 ? ausBudget : null }
    }
    const bewilligt = Number(z.combined_budget_total ?? 0)
    return {
      jahr,
      vpTageVerbraucht: Number(z.vp_days_used ?? 0),
      kzpTageVerbraucht: Number(z.kzp_days_used ?? 0),
      vpBetragVerbrauchtEuro: Number(z.vp_amount_used ?? 0),
      kzpBetragVerbrauchtEuro: Number(z.kzp_amount_used ?? 0),
      kombiniertesBudgetEuro: bewilligt > 0 ? bewilligt : (budgetNachJahr.get(jahr) || null),
    }
  })

  // ── 4. Bestehende Buchungen (Ueberschneidungspruefung) ────────────
  const { data: buchungen, error: buchungenError } = await supabase
    .from('vpkzp_buchungen')
    .select('id, art, zeitraum_von, zeitraum_bis, status')
    .eq('client_id', clientId)
    .eq('organization_id', organizationId)
    .in('calendar_year', jahre)
    .neq('status', 'storniert')

  if (buchungenError) {
    throw new VpKzpLageNichtErmittelbarError(
      `vpkzp_buchungen nicht lesbar (${buchungenError.message})`,
    )
  }

  const bestand: BestandsBuchung[] = ((buchungen ?? []) as BuchungsZeile[])
    .filter(b => istVpKzpArt(b.art))
    .map(b => ({
      id: String(b.id),
      art: b.art as BestandsBuchung['art'],
      von: String(b.zeitraum_von).slice(0, 10),
      bis: String(b.zeitraum_bis).slice(0, 10),
      status: b.status ?? undefined,
    }))

  return {
    clientId,
    organizationId,
    pflegegrad: pflegegradVon(klient as Parameters<typeof pflegegradVon>[0]),
    staende,
    bestand,
  }
}

export interface JahresUebersichtZeile {
  clientId: string
  name: string
  jahr: number
  vpTageVerbraucht: number
  kzpTageVerbraucht: number
  vpBetragVerbrauchtEuro: number
  kzpBetragVerbrauchtEuro: number
  kombiniertesBudgetEuro: number
  kombiniertRestEuro: number
}

/**
 * Jahresuebersicht aller Klienten eines Mandanten — Datengrundlage der
 * Verwaltungsansicht. Fail-closed wie oben: Lesefehler werfen.
 */
export async function ladeJahresUebersicht(
  supabase: SupabaseClient,
  params: { organizationId: string; jahr: number },
): Promise<JahresUebersichtZeile[]> {
  const { organizationId, jahr } = params

  const { data, error } = await supabase
    .from('client_vpkzp_usage')
    .select(
      'client_id, calendar_year, vp_days_used, kzp_days_used, vp_amount_used, '
      + 'kzp_amount_used, combined_budget_total, combined_budget_remaining, '
      + 'client:clients(first_name, last_name)',
    )
    .eq('organization_id', organizationId)
    .eq('calendar_year', jahr)

  if (error) {
    throw new VpKzpLageNichtErmittelbarError(
      `Jahresuebersicht nicht lesbar (${error.message})`,
    )
  }

  // Der eingebettete clients-Join macht aus dem Zeilentyp bei Supabase eine
  // Union mit GenericStringError; die Felder werden unten einzeln und
  // defensiv gelesen, deshalb hier eine einfache Zeilenform.
  const zeilen = (data ?? []) as unknown as Record<string, unknown>[]

  return zeilen.map(z => {
    const klient = z.client as { first_name?: string; last_name?: string } | null
    const name = [klient?.first_name, klient?.last_name].filter(Boolean).join(' ').trim()
    return {
      clientId: String(z.client_id),
      name: name || 'Unbekannt',
      jahr: Number(z.calendar_year),
      vpTageVerbraucht: Number(z.vp_days_used ?? 0),
      kzpTageVerbraucht: Number(z.kzp_days_used ?? 0),
      vpBetragVerbrauchtEuro: Number(z.vp_amount_used ?? 0),
      kzpBetragVerbrauchtEuro: Number(z.kzp_amount_used ?? 0),
      kombiniertesBudgetEuro: Number(z.combined_budget_total ?? 0),
      kombiniertRestEuro: Number(z.combined_budget_remaining ?? 0),
    }
  })
}
