// ---------------------------------------------------------------------------
// A stand-in for the supabase-js query builder.
//
// applyColumnFilters chains PostgREST conditions onto whatever it is handed, so
// the cheapest way to test what a filter actually asks the database for is to
// hand it a recorder. Every call is kept in order as a readable string —
// `ilike(company_name,%acme%)` — which is what the assertions compare against.
// ---------------------------------------------------------------------------

export type FakeQuery = {
  calls: string[]
  [method: string]: any
}

const METHODS = [
  "ilike",
  "like",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "is",
  "in",
  "not",
  "or",
  "filter",
  "select",
  "order",
  "range",
] as const

export const fakeQuery = (): FakeQuery => {
  const calls: string[] = []
  const query: FakeQuery = { calls }
  for (const method of METHODS) {
    query[method] = (...args: unknown[]) => {
      calls.push(`${method}(${args.map((a) => String(a)).join(",")})`)
      return query
    }
  }
  return query
}
