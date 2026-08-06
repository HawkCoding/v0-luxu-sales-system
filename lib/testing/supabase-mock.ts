/**
 * Minimal in-memory Supabase test double.
 *
 * Mirrors only the query-builder surface our route handlers and domain helpers
 * actually use (select/insert/update/delete + eq/in/gte/lte/ilike/not/order/limit
 * and the maybeSingle/single/thenable terminals). It is deliberately NOT a full
 * Postgres emulator — extend it when a handler needs a shape it doesn't support
 * rather than special-casing a test.
 */

export type MockRow = Record<string, unknown>
type Row = MockRow

type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "neq"; column: string; value: unknown }
  | { kind: "in"; column: string; values: unknown[] }
  | { kind: "gte"; column: string; value: unknown }
  | { kind: "lte"; column: string; value: unknown }
  | { kind: "lt"; column: string; value: unknown }
  | { kind: "ilike"; column: string; pattern: string }
  | { kind: "notNull"; column: string }
  | { kind: "isNull"; column: string }

export interface MockStore {
  tables: Record<string, Row[]>
  rpcCalls: Array<{ name: string; args: unknown }>
  rows(table: string): Row[]
}

interface OrderSpec {
  column: string
  ascending: boolean
}

const SUPABASE_NO_ROWS = { code: "PGRST116", message: "No rows found", details: null, hint: null }

function lessThan(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return a < b
  return String(a) < String(b)
}

function parseEmbeds(select: string): Array<{ alias: string; table: string }> {
  const embeds: Array<{ alias: string; table: string }> = []
  const re = /(\w+)\s*:\s*(\w+)\s*\(/g
  let match: RegExpExecArray | null
  while ((match = re.exec(select)) !== null) {
    embeds.push({ alias: match[1], table: match[2] })
  }
  return embeds
}

function ilikeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")
  return new RegExp(`^${escaped}$`, "i")
}

export class MockQueryBuilder implements PromiseLike<{ data: unknown; error: unknown }> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select"
  private selectColumns = "*"
  private payload: Row[] = []
  private patch: Row = {}
  private filters: Filter[] = []
  private orderSpec: OrderSpec | null = null
  private limitCount: number | null = null
  private selectAfterWrite = false
  private resolved = false
  private conflictColumns: string[] = []

  constructor(
    private readonly table: string,
    private readonly store: MockStore,
    private readonly nextId: (table: string) => string,
  ) {}

  // --- query configuration -------------------------------------------------

  select(columns = "*"): this {
    if (this.op !== "insert" && this.op !== "update") this.op = "select"
    this.selectColumns = columns
    this.selectAfterWrite = true
    return this
  }

  insert(values: Row | Row[]): this {
    this.op = "insert"
    this.payload = Array.isArray(values) ? values : [values]
    this.selectAfterWrite = false
    return this
  }

  update(values: Row): this {
    this.op = "update"
    this.patch = values
    this.selectAfterWrite = false
    return this
  }

  /** Upsert keyed on `onConflict` columns: matching row is merged, otherwise inserted. */
  upsert(values: Row | Row[], opts?: { onConflict?: string }): this {
    this.op = "upsert"
    this.payload = Array.isArray(values) ? values : [values]
    this.conflictColumns = opts?.onConflict
      ? opts.onConflict.split(",").map((column) => column.trim()).filter(Boolean)
      : ["id"]
    this.selectAfterWrite = false
    return this
  }

  delete(): this {
    this.op = "delete"
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ kind: "eq", column, value })
    return this
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ kind: "neq", column, value })
    return this
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ kind: "in", column, values })
    return this
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ kind: "gte", column, value })
    return this
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ kind: "lte", column, value })
    return this
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ kind: "lt", column, value })
    return this
  }

  ilike(column: string, pattern: string): this {
    this.filters.push({ kind: "ilike", column, pattern })
    return this
  }

  not(column: string, operator: string, value: unknown): this {
    if (operator === "is" && value === null) this.filters.push({ kind: "notNull", column })
    return this
  }

  is(column: string, value: unknown): this {
    if (value === null) this.filters.push({ kind: "isNull", column })
    return this
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderSpec = { column, ascending: opts?.ascending ?? true }
    return this
  }

  limit(count: number): this {
    this.limitCount = count
    return this
  }

  // --- terminals -----------------------------------------------------------

  async maybeSingle(): Promise<{ data: Row | null; error: unknown }> {
    const { rows, error } = this.run()
    if (error) return { data: null, error }
    return { data: rows[0] ?? null, error: null }
  }

  async single(): Promise<{ data: Row | null; error: unknown }> {
    const { rows, error } = this.run()
    if (error) return { data: null, error }
    if (rows.length === 0) return { data: null, error: SUPABASE_NO_ROWS }
    return { data: rows[0], error: null }
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const { rows, error } = this.run()
    const data = this.op === "select" || this.selectAfterWrite ? rows : null
    return Promise.resolve({ data, error }).then(onfulfilled, onrejected)
  }

  // --- execution -----------------------------------------------------------

  private table_(): Row[] {
    this.store.tables[this.table] ??= []
    return this.store.tables[this.table]
  }

  private matches(row: Row): boolean {
    return this.filters.every((filter) => {
      const value = row[filter.column]
      switch (filter.kind) {
        case "eq":
          return value === filter.value
        case "neq":
          return value !== filter.value
        case "in":
          return filter.values.includes(value)
        case "gte":
          return !lessThan(value, filter.value)
        case "lte":
          return !lessThan(filter.value, value)
        case "lt":
          return lessThan(value, filter.value)
        case "ilike":
          return typeof value === "string" && ilikeToRegExp(filter.pattern).test(value)
        case "notNull":
          return value !== null && value !== undefined
        case "isNull":
          return value === null || value === undefined
      }
    })
  }

  private applyEmbedsAndShape(rows: Row[]): Row[] {
    const embeds = parseEmbeds(this.selectColumns)
    if (embeds.length === 0) return rows.map((row) => ({ ...row }))

    return rows.map((row) => {
      const shaped: Row = { ...row }
      for (const { alias, table } of embeds) {
        const fk = row[`${alias}_id`]
        const related = (this.store.tables[table] ?? []).find((candidate) => candidate.id === fk) ?? null
        shaped[alias] = related ? { ...related } : null
      }
      return shaped
    })
  }

  private run(): { rows: Row[]; error: unknown } {
    if (this.resolved) return { rows: [], error: null }
    this.resolved = true

    if (this.op === "insert") {
      const inserted = this.payload.map((row) => {
        const nowIso = new Date().toISOString()
        const withDefaults: Row = {
          id: row.id ?? this.nextId(this.table),
          created_at: row.created_at ?? nowIso,
          updated_at: row.updated_at ?? nowIso,
          ...row,
        }
        this.table_().push(withDefaults)
        return withDefaults
      })
      return { rows: this.applyEmbedsAndShape(inserted), error: null }
    }

    if (this.op === "upsert") {
      const table = this.table_()
      const upserted = this.payload.map((row) => {
        const existing = table.find((candidate) =>
          this.conflictColumns.every((column) => candidate[column] === row[column]),
        )
        if (existing) {
          Object.assign(existing, row, { updated_at: new Date().toISOString() })
          return existing
        }
        const nowIso = new Date().toISOString()
        const withDefaults: Row = {
          id: row.id ?? this.nextId(this.table),
          created_at: row.created_at ?? nowIso,
          updated_at: row.updated_at ?? nowIso,
          ...row,
        }
        table.push(withDefaults)
        return withDefaults
      })
      return { rows: this.applyEmbedsAndShape(upserted), error: null }
    }

    if (this.op === "update") {
      const updated = this.table_()
        .filter((row) => this.matches(row))
        .map((row) => {
          Object.assign(row, this.patch)
          return row
        })
      return { rows: this.applyEmbedsAndShape(updated), error: null }
    }

    if (this.op === "delete") {
      const table = this.table_()
      const remaining = table.filter((row) => !this.matches(row))
      const removed = table.filter((row) => this.matches(row))
      this.store.tables[this.table] = remaining
      return { rows: this.applyEmbedsAndShape(removed), error: null }
    }

    // select
    let rows = this.table_().filter((row) => this.matches(row))
    if (this.orderSpec) {
      const { column, ascending } = this.orderSpec
      rows = [...rows].sort((a, b) => {
        if (a[column] === b[column]) return 0
        const isLess = lessThan(a[column], b[column])
        return (isLess ? -1 : 1) * (ascending ? 1 : -1)
      })
    }
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount)
    return { rows: this.applyEmbedsAndShape(rows), error: null }
  }
}

export interface MockFrom {
  select(columns?: string): MockQueryBuilder
  insert(values: Row | Row[]): MockQueryBuilder
  update(values: Row): MockQueryBuilder
  upsert(values: Row | Row[], opts?: { onConflict?: string }): MockQueryBuilder
  delete(): MockQueryBuilder
}

export interface MockSupabaseClient {
  from(table: string): MockFrom
  rpc(name: string, args?: unknown): Promise<{ data: null; error: null }>
  auth: { getUser(): Promise<{ data: { user: null }; error: null }> }
}

export interface SupabaseMock {
  supabase: MockSupabaseClient
  store: MockStore
}

/**
 * Builds an in-memory Supabase double seeded with the given tables.
 * `store.tables` / `store.rows(table)` expose seeded, inserted, and mutated rows
 * for assertions. Pass `supabase` to handlers/helpers via `as never`.
 */
export function createSupabaseMock(seed: Record<string, Row[]> = {}): SupabaseMock {
  const tables: Record<string, Row[]> = {}
  for (const [table, rows] of Object.entries(seed)) {
    tables[table] = rows.map((row) => ({ ...row }))
  }

  const counters: Record<string, number> = {}
  const nextId = (table: string): string => {
    counters[table] = (counters[table] ?? 0) + 1
    return `${table}-${counters[table]}`
  }

  const store: MockStore = {
    tables,
    rpcCalls: [],
    rows(table: string) {
      return this.tables[table] ?? []
    },
  }

  const supabase: MockSupabaseClient = {
    from(table: string): MockFrom {
      const builder = new MockQueryBuilder(table, store, nextId)
      return {
        select: (columns?: string) => builder.select(columns),
        insert: (values: Row | Row[]) => builder.insert(values),
        update: (values: Row) => builder.update(values),
        upsert: (values: Row | Row[], opts?: { onConflict?: string }) => builder.upsert(values, opts),
        delete: () => builder.delete(),
      }
    },
    rpc(name: string, args?: unknown) {
      store.rpcCalls.push({ name, args })
      return Promise.resolve({ data: null, error: null })
    },
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  }

  return { supabase, store }
}
