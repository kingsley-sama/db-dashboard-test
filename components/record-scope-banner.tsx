"use client"

import { Building2, Package } from "lucide-react"

// ---------------------------------------------------------------------------
// "What am I editing?" — the banner at the top of an edit dialog opened from a
// view that mixes two records.
//
// A Project Orders row is one order *and* one project, and the two edit dialogs
// look alike once they are open. This names the record being edited, the one it
// belongs to, and where the other one's fields are edited instead — so a change
// meant for a single order never gets typed into a form that will save it
// across the whole project, or the other way round.
// ---------------------------------------------------------------------------

export type RecordScope = "order" | "project"

const SCOPES = {
  order: {
    label: "Order details",
    Icon: Package,
    accent: "#012e64",
    background: "#f0f7ff",
    border: "#d0e7ff",
    text: "#012e64",
  },
  project: {
    label: "Project details",
    Icon: Building2,
    accent: "#5d6b88",
    background: "#f4f6fa",
    border: "#dbe2ec",
    text: "#3c4a63",
  },
} as const

export function RecordScopeBanner({
  scope,
  name,
  facts = [],
  note,
  related,
}: {
  scope: RecordScope
  /** The record's own identity — "ORD-1042", "P-7". */
  name: string
  /** Supporting identity, shown as a dotted list. Empty entries are dropped. */
  facts?: (string | null | undefined)[]
  /** What saving this form reaches — the scope of the change, in one line. */
  note?: string
  /** The other record on the same row, and where its fields are edited. */
  related?: { scope: RecordScope; name: string; hint: string }
}) {
  const style = SCOPES[scope]
  const { Icon } = style
  const shown = facts.filter((fact): fact is string => Boolean(fact && fact.trim()))
  const relatedStyle = related ? SCOPES[related.scope] : null

  return (
    <div
      className="mb-4 rounded-lg px-4 py-3"
      style={{
        backgroundColor: style.background,
        border: `1px solid ${style.border}`,
        borderLeft: `4px solid ${style.accent}`,
      }}
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 shrink-0" style={{ color: style.accent }} />
        <span
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: style.accent }}
        >
          {style.label}
        </span>
      </div>

      <div className="mt-1 text-base font-semibold" style={{ color: style.text }}>
        {name}
      </div>

      {shown.length > 0 && (
        <div className="mt-0.5 text-sm" style={{ color: "#5d6b88" }}>
          {shown.join("  ·  ")}
        </div>
      )}

      {note && (
        <p className="mt-2 text-xs" style={{ color: "#5d6b88" }}>
          {note}
        </p>
      )}

      {related && relatedStyle && (
        <div
          className="mt-3 pt-2 flex items-start gap-2 text-xs"
          style={{ borderTop: `1px solid ${style.border}`, color: "#5d6b88" }}
        >
          <relatedStyle.Icon
            className="w-3.5 h-3.5 shrink-0 mt-0.5"
            style={{ color: relatedStyle.accent }}
          />
          <span>
            <span className="font-semibold" style={{ color: relatedStyle.text }}>
              {related.name}
            </span>{" "}
            — {related.hint}
          </span>
        </div>
      )}
    </div>
  )
}
