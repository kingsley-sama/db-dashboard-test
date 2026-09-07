// ---------------------------------------------------------------------------
// The bookkeeping behind editing a cell in place.
//
// A saved cell has to show its new value straight away, without re-querying:
// the active filters, the page and the scroll position are the context the user
// built up to find the row, and re-running the query would move it under them.
// So the row is patched locally, and put back exactly as it was if the write
// fails — a failed save must never be left looking like a saved one.
//
// Server-safe and free of React on purpose, so the rules are testable on their
// own; components/orders-table.tsx wires them to the request.
// ---------------------------------------------------------------------------

export type Row = Record<string, any>

/** Decides which loaded rows an edit of `edited` applies to. */
export type RowMatcher = (edited: Row, candidate: Row) => boolean

/** The default: an edit touches the row it was made on. */
export const sameRow: RowMatcher = (edited, candidate) => candidate.id === edited.id

/**
 * What a typed cell stores. Empty means "no value" — a NULL, the same as a
 * field cleared in the create/edit dialogs — so a cleared cell is found by the
 * "is blank" filter rather than sitting in the table as an empty string.
 */
export const normalizeEditValue = (value: string): string | null => {
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

/**
 * The current value of `key` on every row the edit applies to, keyed by row id.
 *
 * Taken before the optimistic patch: it is both the list of rows to change and
 * the way back if the write fails.
 */
export const snapshotField = (
  rows: Row[],
  edited: Row,
  key: string,
  matches: RowMatcher = sameRow
): Map<any, any> =>
  new Map(rows.filter((row) => matches(edited, row)).map((row) => [row.id, row[key]]))

/** Writes `value` into `key` on the snapshotted rows, leaving the rest alone. */
export const patchRows = (
  rows: Row[],
  key: string,
  value: string | null,
  affected: Map<any, any>
): Row[] => rows.map((row) => (affected.has(row.id) ? { ...row, [key]: value } : row))

/** Puts the snapshotted values back, undoing a patch whose write failed. */
export const revertRows = (rows: Row[], key: string, affected: Map<any, any>): Row[] =>
  rows.map((row) => (affected.has(row.id) ? { ...row, [key]: affected.get(row.id) } : row))
