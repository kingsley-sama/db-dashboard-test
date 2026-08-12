// Labels of the Postgres `order_status` enum, in the order the PM team wants
// them shown. Kept in one place so the table badges, the create/edit dropdowns
// and the dashboard tiles can never drift apart.
export const ORDER_STATUSES = ["Normal", "Challenging", "Problematic"] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

// `bg`/`fg` are hex because the table colours badges with inline styles;
// `accent`/`iconBg` are Tailwind classes because the dashboard tiles use classes.
export const ORDER_STATUS_STYLES: Record<
  OrderStatus,
  { bg: string; fg: string; accent: string; iconBg: string }
> = {
  Normal: { bg: "#d1fae5", fg: "#047857", accent: "text-emerald-600", iconBg: "bg-emerald-100" },
  Challenging: { bg: "#fef3c7", fg: "#b45309", accent: "text-amber-600", iconBg: "bg-amber-100" },
  Problematic: { bg: "#fee2e2", fg: "#b91c1c", accent: "text-red-600", iconBg: "bg-red-100" },
}

// Rows created before the enum existed are null, and rows still holding a
// retired label ("In progress", "Blocked", …) fall back to a plain grey badge.
export const ORDER_STATUS_FALLBACK = { bg: "#e8ecf3", fg: "#5d6b88" }
