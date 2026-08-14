/**
 * Fake-DB fuer Go-Live-Pilot-E2E-Tests
 *
 * Ein minimaler In-Memory-Nachbau des PostgREST-Query-Builders, den
 * @supabase/supabase-js erzeugt. Anders als die Ad-hoc-mockChain-Stubs in
 * __tests__/e2e/billing-e2e.test.ts (die jede Funktion isoliert mit
 * kanonischen Antworten fuettern) haelt DIESER Stub echten, gemeinsamen
 * Zustand ueber mehrere Tabellen — damit createInvoiceDraft, freezeInvoice,
 * createPayment, allocatePayment, getOposListe und der Mahnlauf in EINEM
 * Testlauf auf derselben Datenbasis operieren koennen, so wie es im echten
 * Betrieb der Fall ist.
 *
 * Bewusst NICHT nachgebaut: RLS, echte SQL-Trigger (is_locked-Sperre,
 * wf_audit_log-Immutability), Server-seitige RPC-Logik ausser den hier
 * per setRpcHandler() registrierten Simulationen. Diese Grenzen werden in
 * den Tests, die sie betreffen, explizit benannt statt stillschweigend
 * ignoriert.
 */

type Row = Record<string, unknown>
type Filter =
  | { col: string; op: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'; val: unknown }
  | { col: string; op: 'is'; val: unknown }
  | { col: string; op: 'in' | 'notIn'; val: unknown[] }
  | { col: string; op: 'notNull' }

function parsePgList(literal: unknown): string[] {
  const s = String(literal ?? '')
  const inner = s.replace(/^\(/, '').replace(/\)$/, '')
  if (!inner) return []
  return inner.split(',').map(t => t.trim().replace(/^"(.*)"$/, '$1'))
}

function rowMatches(row: Row, filters: Filter[]): boolean {
  return filters.every(f => {
    const v = row[f.col]
    switch (f.op) {
      case 'eq': return v === f.val
      case 'neq': return v !== f.val
      case 'is': return f.val === null ? (v === null || v === undefined) : v === f.val
      case 'in': return f.val.includes(v as never)
      case 'notIn': return !f.val.includes(v as never)
      case 'lt': return (v as any) < (f.val as any)
      case 'lte': return (v as any) <= (f.val as any)
      case 'gt': return (v as any) > (f.val as any)
      case 'gte': return (v as any) >= (f.val as any)
      case 'notNull': return v !== null && v !== undefined
      default: return true
    }
  })
}

export interface FakeBillingDb {
  from(table: string): any
  rpc(name: string, params?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>
  seed(table: string, rows: Row[]): void
  setRpcHandler(name: string, handler: (params: any, db: FakeBillingDb) => { data?: unknown; error?: { message: string } | null }): void
  table(name: string): Row[]
}

/**
 * NOT-NULL-DEFAULT-Spalten, die im echten Schema existieren, aber von den
 * getesteten Funktionen beim INSERT nicht explizit mitgeschrieben werden
 * (die echte Datenbank füllt sie über den Spalten-Default). Ohne diese Liste
 * bliebe das Feld hier `undefined`, und ein `.eq('spalte', 0)`-Filter (z. B.
 * die OCC-Prüfung in allocatePayment) würde fälschlich 0 Zeilen treffen.
 */
const TABLE_DEFAULTS: Record<string, Row> = {
  // supabase/migrations/20260808210000_..._monatsabschluss.sql:67
  payments: { allocated_cents: 0 },
}

export function makeFakeBillingDb(): FakeBillingDb {
  const store: Record<string, Row[]> = {}
  const rpcHandlers: Record<string, (params: any, db: FakeBillingDb) => { data?: unknown; error?: { message: string } | null }> = {}
  let idCounter = 1

  function ensureTable(t: string): Row[] {
    if (!store[t]) store[t] = []
    return store[t]
  }

  function builder(table: string) {
    const filters: Filter[] = []
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let insertRows: Row[] | null = null
    let updateData: Row | null = null
    let orderCol: string | null = null
    let orderAsc = true
    let limitN: number | null = null

    async function resolveArray(): Promise<{ data: Row[]; error: null }> {
      const rows = ensureTable(table)

      if (mode === 'insert') {
        const defaults = TABLE_DEFAULTS[table] ?? {}
        const inserted = (insertRows ?? []).map(r => ({ id: r.id ?? `fake-${idCounter++}`, ...defaults, ...r }))
        rows.push(...inserted)
        return { data: inserted, error: null }
      }
      if (mode === 'update') {
        const matched = rows.filter(r => rowMatches(r, filters))
        for (const r of matched) Object.assign(r, updateData)
        return { data: matched, error: null }
      }
      if (mode === 'delete') {
        const matched = rows.filter(r => rowMatches(r, filters))
        store[table] = rows.filter(r => !rowMatches(r, filters))
        return { data: matched, error: null }
      }

      let result = rows.filter(r => rowMatches(r, filters))
      if (orderCol) {
        const col = orderCol
        result = [...result].sort((a, b) => {
          const av = a[col] as any
          const bv = b[col] as any
          if (av < bv) return orderAsc ? -1 : 1
          if (av > bv) return orderAsc ? 1 : -1
          return 0
        })
      }
      if (limitN != null) result = result.slice(0, limitN)
      return { data: result, error: null }
    }

    const b: any = {
      select() { return b },
      eq(col: string, val: unknown) { filters.push({ col, op: 'eq', val }); return b },
      neq(col: string, val: unknown) { filters.push({ col, op: 'neq', val }); return b },
      is(col: string, val: unknown) { filters.push({ col, op: 'is', val }); return b },
      in(col: string, arr: unknown[]) { filters.push({ col, op: 'in', val: arr }); return b },
      not(col: string, op: string, val: unknown) {
        if (op === 'in') filters.push({ col, op: 'notIn', val: parsePgList(val) })
        else if (op === 'is') filters.push({ col, op: 'notNull' })
        return b
      },
      lt(col: string, val: unknown) { filters.push({ col, op: 'lt', val }); return b },
      lte(col: string, val: unknown) { filters.push({ col, op: 'lte', val }); return b },
      gt(col: string, val: unknown) { filters.push({ col, op: 'gt', val }); return b },
      gte(col: string, val: unknown) { filters.push({ col, op: 'gte', val }); return b },
      order(col: string, opts?: { ascending?: boolean }) { orderCol = col; orderAsc = opts?.ascending !== false; return b },
      limit(n: number) { limitN = n; return b },
      insert(rows: Row | Row[]) { mode = 'insert'; insertRows = Array.isArray(rows) ? rows : [rows]; return b },
      update(data: Row) { mode = 'update'; updateData = data; return b },
      delete() { mode = 'delete'; return b },
      async single() {
        const r = await resolveArray()
        if (r.data.length !== 1) {
          return { data: null, error: { message: `Zeile nicht gefunden (${table})`, code: 'PGRST116' } }
        }
        return { data: r.data[0], error: null }
      },
      async maybeSingle() {
        const r = await resolveArray()
        return { data: r.data[0] ?? null, error: null }
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return resolveArray().then(resolve, reject)
      },
    }
    return b
  }

  const db: FakeBillingDb = {
    from(table: string) { return builder(table) },
    async rpc(name: string, params: Record<string, unknown> = {}) {
      const handler = rpcHandlers[name]
      if (!handler) throw new Error(`Fake-DB: RPC "${name}" wurde nicht registriert (setRpcHandler fehlt).`)
      try {
        const result = handler(params, db)
        return { data: result.data ?? null, error: result.error ?? null }
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : String(e) } }
      }
    },
    seed(table: string, rows: Row[]) {
      ensureTable(table).push(...rows.map(r => ({ ...r })))
    },
    setRpcHandler(name, handler) { rpcHandlers[name] = handler },
    table(name: string) { return ensureTable(name) },
  }

  return db
}

// ---------------------------------------------------------------------------
// Standard-RPC-Simulationen
// ---------------------------------------------------------------------------

function nextSeqNumber(db: FakeBillingDb, orgId: string, prefix: string, year: number): string {
  const seq = db.table('_seq')
  let row = seq.find(r => r.organization_id === orgId && r.prefix === prefix && r.year === year)
  if (!row) {
    row = { organization_id: orgId, prefix, year, last_number: 0 }
    seq.push(row)
  }
  row.last_number = (row.last_number as number) + 1
  return `${prefix}-${year}-${String(row.last_number).padStart(5, '0')}`
}

/**
 * Registriert vereinfachte, aber verhaltenstreue Simulationen der vier RPCs,
 * die lib/billing/core/invoice-engine.ts serverseitig aufruft:
 *
 *  - next_billing_number         (fortlaufende Nummernsequenz je Org+Prefix+Jahr)
 *  - validate_correction_atomic  (FOR-UPDATE-Sperre — hier: immer "ok", der
 *                                  eigentliche Org-Fence-Check laeuft danach
 *                                  ohnehin nochmal in TS)
 *  - create_credit_note_atomic   (dito, plus Betragsermittlung)
 *  - create_invoice_draft_atomic (Tarifaufloesung + Idempotenz + Entwurf)
 *
 * BEWUSSTE VEREINFACHUNG von create_invoice_draft_atomic: die echte
 * Postgres-Funktion matcht Tarife zusaetzlich ueber rechtsgrundlage/
 * kostentraeger_ik/bundesland (Spezifitaets-Scoring, siehe price-resolver.ts).
 * Diese Simulation matcht nur ueber organization_id + leistungsart + Gueltig-
 * keitszeitraum + tarif_status, das reicht fuer die Kettenlogik dieser Tests.
 */
export function installBillingRpcSimulation(db: FakeBillingDb): void {
  db.setRpcHandler('next_billing_number', (params) => {
    const orgId = params.p_org_id as string
    const prefix = params.p_prefix as string
    const year = params.p_year as number
    return { data: nextSeqNumber(db, orgId, prefix, year) }
  })

  db.setRpcHandler('validate_correction_atomic', () => ({ data: { validated: true } }))

  db.setRpcHandler('create_credit_note_atomic', (params) => {
    const inv = db.table('invoices').find(r => r.id === params.p_invoice_id)
    if (!inv) return { error: { message: 'Could not find the function public.create_credit_note_atomic' } }
    const originalCents = Math.round(Number(inv.total_amount) * 100)
    return { data: { original_amount_cents: originalCents, remaining_cents: originalCents, validated: true } }
  })

  db.setRpcHandler('create_invoice_draft_atomic', (params) => {
    const clientId = params.p_client_id as string
    const orgId = params.p_org_id as string
    const periodMonth = params.p_period_month as string
    const budgetType = params.p_budget_type as string

    // Der TS-Wrapper (createInvoiceDraft) hat noch keinen Idempotency-Key-
    // Aufruf verdrahtet (siehe lib/billing/core/idempotency.ts-Kommentar) —
    // die Idempotenz laeuft ausschliesslich hier server-seitig, mit dem
    // _v2-Suffix der tarifbasierten RPC-Generation.
    const idempotencyKey = `inv_${clientId}_${periodMonth}_${budgetType}_v2`
    const existing = db.table('invoices').find(
      r => r.idempotency_key === idempotencyKey && !r.deleted_at,
    )
    if (existing) {
      const lineCount = db.table('invoice_items').filter(i => i.invoice_id === existing.id).length
      return {
        data: {
          invoice_id: existing.id,
          invoice_number: existing.invoice_number_formatted ?? existing.invoice_number,
          total_amount: existing.total_amount,
          line_count: lineCount,
          already_exists: true,
        },
      }
    }

    const records = db.table('service_records').filter(
      r => r.client_id === clientId && r.organization_id === orgId
        && ['signed', 'complete'].includes(String(r.status))
        && String(r.date).slice(0, 7) === periodMonth,
    )
    if (records.length === 0) {
      return { error: { message: `MISSING_VALID_TARIFF: keine abrechenbaren Leistungsnachweise fuer ${clientId}/${periodMonth}` } }
    }

    let totalCents = 0
    const itemsToInsert: Row[] = []
    for (const rec of records) {
      const leistungsart = (rec.leistungsart as string) || 'Alltagsbegleitung'
      const datum = String(rec.date)
      const tarife = db.table('billing_tariffs').filter(t =>
        t.organization_id === orgId
        && t.leistungsart === leistungsart
        && !t.deleted_at
        && (t.gueltig_ab as string) <= datum
        && (t.gueltig_bis == null || (t.gueltig_bis as string) >= datum),
      )
      if (tarife.length === 0) {
        return { error: { message: `MISSING_VALID_TARIFF: kein Tarif fuer "${leistungsart}" hinterlegt` } }
      }
      const usable = tarife.filter(t =>
        t.tarif_status !== 'blocked' && (budgetType === 'private' || t.tarif_status === 'verified'),
      )
      if (usable.length === 0) {
        return { error: { message: `MISSING_VALID_TARIFF: Tarif fuer "${leistungsart}" nicht verifiziert oder gesperrt` } }
      }
      const tarif = usable[0]
      const preisCent = tarif.preis_cent as number
      totalCents += preisCent
      itemsToInsert.push({
        service_record_id: rec.id,
        description: leistungsart,
        date: rec.date,
        duration_minutes: null,
        amount: preisCent / 100,
        budget_type: budgetType,
        organization_id: orgId,
      })
    }

    const year = new Date(String(records[0].date)).getUTCFullYear() || new Date().getUTCFullYear()
    const invoiceNumber = nextSeqNumber(db, orgId, 'RE', year)
    const invoiceId = `invoice-${Math.random().toString(36).slice(2, 10)}`
    const nowIso = `${periodMonth}-15T10:00:00Z`

    db.table('invoices').push({
      id: invoiceId,
      client_id: clientId,
      organization_id: orgId,
      status: 'entwurf',
      total_amount: totalCents / 100,
      budget_amount: budgetType === 'private' ? 0 : totalCents / 100,
      private_amount: budgetType === 'private' ? totalCents / 100 : 0,
      invoice_number: invoiceNumber,
      invoice_number_formatted: invoiceNumber,
      idempotency_key: idempotencyKey,
      insurance_name: params.p_insurance_name ?? null,
      insurance_number: params.p_insurance_number ?? null,
      period_start: `${periodMonth}-01`,
      period_end: `${periodMonth}-28`,
      created_at: nowIso,
      due_date: null,
      // supabase/migrations/20260901020000_invoice_due_date_default.sql
      // hebt den Spalten-Default von 30 auf 14 Tage an (aktueller Stand,
      // siehe lib/billing/core/zahlungsziel.ts). Die RPC selbst schreibt
      // die Spalte nicht — setzeFaelligkeitFallsLeer zieht due_date danach
      // aus genau diesem Wert nach.
      payment_terms_days: 14,
      version: 1,
      deleted_at: null,
      paid_amount: 0,
    })

    for (const item of itemsToInsert) {
      db.table('invoice_items').push({
        id: `item-${Math.random().toString(36).slice(2, 10)}`,
        invoice_id: invoiceId,
        ...item,
      })
    }

    for (const rec of records) rec.status = 'invoiced'

    return {
      data: {
        invoice_id: invoiceId,
        invoice_number: invoiceNumber,
        total_amount: totalCents / 100,
        line_count: itemsToInsert.length,
        already_exists: false,
      },
    }
  })
}
