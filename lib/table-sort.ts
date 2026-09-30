// ---------------------------------------------------------------------------
// Column sorting, shared between the client tables and the API routes.
//
// Server-safe for the same reason as lib/column-filters.ts: the route handlers
// import it. The tables are paged on the server (500 rows at a time), so a sort
// has to run in the query — sorting the loaded rows in the browser would only
// order the page on screen, and page 2 would start over from somewhere else.
//
// The sort travels as two query params, `sort` (a column key, as the table
// names it) and `dir` (asc | desc). The key is looked up in a per-route map,
// which is the whitelist: the order target is never taken from the client.
// ---------------------------------------------------------------------------

import {
  ALL_ORDERS_FILTER_COLUMNS,
  ORDERS_FILTER_COLUMNS,
  PROJECT_ORDERS_FILTER_COLUMNS,
  PROJECTS_FILTER_COLUMNS,
  type ColumnFilterMap,
} from "./column-filters.ts"

export type SortDir = "asc" | "desc"

export type TableSort = { key: string; dir: SortDir }

/** Column key → what PostgREST orders by (`name`, or `embed(name)` for a join). */
export type SortColumnMap = Record<string, string>

/**
 * Every column a table can filter on can also be sorted on, with one exception:
 * a column on a to-many embed. PostgREST can only order parent rows by a
 * to-one relation, and a project has many orders — there is no single value to
 * sort the project by.
 */
const sortColumnsFrom = (
  filters: ColumnFilterMap,
  { toOne = [], extra = {} }: { toOne?: string[]; extra?: SortColumnMap } = {}
): SortColumnMap => {
  const result: SortColumnMap = {}
  for (const [key, meta] of Object.entries(filters)) {
    if (!meta.embed) {
      result[key] = meta.column
    } else if (toOne.includes(meta.embed)) {
      const column = meta.column.slice(meta.embed.length + 1)
      result[key] = `${meta.embed}(${column})`
    }
  }
  return { ...result, ...extra }
}

/** /api/orders — customer name/email and project name come from `projects`. */
export const ORDERS_SORT_COLUMNS = sortColumnsFrom(ORDERS_FILTER_COLUMNS, {
  toOne: ["projects"],
})

export const ALL_ORDERS_SORT_COLUMNS = sortColumnsFrom(ALL_ORDERS_FILTER_COLUMNS)

/**
 * /api/project-orders. The column the table can't filter on (its type is
 * unconfirmed, and ilike fails on an enum) can still be ordered: ORDER BY works
 * on any type.
 */
export const PROJECT_ORDERS_SORT_COLUMNS = sortColumnsFrom(PROJECT_ORDERS_FILTER_COLUMNS, {
  extra: { click_up_task_link: "click_up_task_link" },
})

/**
 * /api/projects. "Date Project End" is the latest date across a project's
 * orders, worked out after the query, so it has nothing to sort on here.
 */
export const PROJECTS_SORT_COLUMNS = sortColumnsFrom(PROJECTS_FILTER_COLUMNS)

/** Reads `sort` / `dir` off a request. Unknown columns are ignored. */
export const parseSort = (
  searchParams: URLSearchParams,
  columns: SortColumnMap
): TableSort | null => {
  const key = searchParams.get("sort")
  if (!key || !Object.prototype.hasOwnProperty.call(columns, key)) return null
  return { key, dir: searchParams.get("dir") === "desc" ? "desc" : "asc" }
}

/** Writes a sort onto request params (nothing when there is no sort). */
export const appendSortParams = (params: URLSearchParams, sort: TableSort | null) => {
  if (!sort) return
  params.append("sort", sort.key)
  params.append("dir", sort.dir)
}

/**
 * Orders a list query: the chosen column first, then the table's default order,
 * then its unique key, so rows that tie on the chosen column still come back
 * in one fixed order and never trade places between pages.
 *
 * Empty values go last in both directions. They say nothing about where a row
 * belongs, and a descending sort that opened on a screen of "-" would look like
 * it hadn't worked.
 */
export const applySort = (
  query: any,
  sort: TableSort | null,
  columns: SortColumnMap,
  fallback: (query: any) => any
): any => {
  const column = sort ? columns[sort.key] : undefined
  if (!sort || !column) return fallback(query)
  return fallback(query.order(column, { ascending: sort.dir === "asc", nullsFirst: false }))
}

/** A saved sort from localStorage, or null if it isn't one. */
export const validateSort = (value: unknown): TableSort | null => {
  if (!value || typeof value !== "object") return null
  const { key, dir } = value as Record<string, unknown>
  if (typeof key !== "string" || key === "") return null
  if (dir !== "asc" && dir !== "desc") return null
  return { key, dir }
}
