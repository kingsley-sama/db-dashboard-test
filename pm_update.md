# PM Dashboard — Import Map & Column Instructions

> These instructions define which database columns are required for the PM dashboard, their source tables, display positions, null handling rules, and any naming/UI notes agreed upon during review.

---

## ✅ Required Columns (`Needed = true`)

These are the columns that **must** be included in the dashboard. They are listed in their intended display order (position on dashboard).

| # | DB Column Name | Source Table | Description | Null Handling | Notes |
|---|---------------|-------------|-------------|--------------|-------|
| 1 | `order_id` | `orders` | ID of the product/order (e.g. `17830-05-er` for exterior view) | — | — |
| 2 | `client_rating` | `projects` | Customer ranking — indicates importance of the customer | — | Display label: **"Ranking"** or **"Rating"** (shorten for column width) |
| 3 | `company_name` | `projects` | Name of the company | — | Display label: **"Company Name"** |
| 4 | `product_name` | `orders` | Type of product (exterior, interior, floorplans) | — | — |
| 5 | `quantity` | `orders` | Number of items ordered per product type | — | — |
| 6 | `PM` | `projects` | Project manager responsible (e.g. Sonia, Aliyu, Vivien) | — | — |
| 7 | `PM type` | `orders` | Whether the project is dedicated or general | — | Column belongs in the `orders` table |
| 8 | `supplier` | `orders` | Supplier contact responsible (e.g. Nhaat, Chuong) | — | — |
| 9 | `cost` | `orders` | Cost charged to the supplier | — | — |
| 10 | `profit_margin` | `projects` | Profit margin percentage | — | Calculated as: if `cost = 0` → 100%, otherwise `db_1 / net_sum`. Distinct from `db_1` (see notes below) |
| 11 | `net_sum` | `orders` | Amount the customer pays — **excluding tax** | — | Gross sum = with tax (not needed on dashboard) |
| 12 | `supplier payment` | `orders` | Whether the supplier has been paid (invoicing status) | Default: see comment | Implement as **dropdown or checkbox** |
| 13 | `deposit` | `orders` | Amount paid upfront by the customer to start the project | Can remain empty | — |
| 14 | `date_information_complete` | `orders` | Date all documents/info were received from customer | — | — |
| 15 | `due_delivery_date` | `orders` | Date by which products must be delivered | — | — |
| 16 | `delivery_1_date` | `orders` | Date products were first sent to the customer | — | Display as **`delivery_1`** |
| 17 | `delivery_2_date` | `orders` | Second delivery date | Can remain empty | Display as **`delivery_2`** |
| 18 | `delivery_3_date` | `orders` | Third delivery date | Can remain empty | Display as **`delivery_3`** |
| 19 | `delivery_4_date` | `orders` | Fourth delivery date | Can remain empty | Display as **`delivery_4`** |
| 20 | `date_first_delivery_complete` | `orders` | Date all products in the first delivery were sent | — | — |
| 21 | `date_project_end` | `orders` | Date customer confirmed receipt/completion | — | To be added — represents **project completion date** |
| 22 | `delay_first_delivery` | `orders` | Whether supplier was late on the first delivery | Can remain empty | — |
| 23 | `delay_first_revision` | `orders` | Delay on first revision | Can remain empty | — |
| 24 | `delay_second_revision` | `orders` | Delay on second revision | Can remain empty | — |
| 25 | `customer_name` | `projects` | Name of the customer contact person | — | To be added |
| 26 | `customer_email` | `projects` | Email of the customer contact person | — | To be added |
| 27 | `customer_type` | `projects` | Role/function of the customer contact person | — | To be implemented (source: Column AG in spreadsheet) |
| 28 | `comments` | `projects` | General project comments | Can remain empty | — |
| 29 | `date_order_entry` | `orders` | Timestamp for when the order was created | — | — |

---

## ❌ Excluded Columns (`Needed = false`)

These columns exist in the database but are **not required** on the dashboard. Do not display them.

| DB Column Name | Source Table | Reason / Notes |
|---------------|-------------|---------------|
| `date_project_entry` | `projects` | Not needed on dashboard |
| `gross_sum` | `orders` | Not needed — `net_sum` is sufficient |
| `roi` | `projects` | Not needed |
| `ap_epcs_invoicing` | `projects` | Purpose unclear — flagged for Lidia |
| `created_at` | — | Equivalent to `date_order_entry` |
| `updated_at` | — | Not needed |
| `order_type` | `orders` | Internal use only — differentiates free/internal orders from paid ones |
| `product_type` | `orders` | Internal use — identifies additional variation/revision orders |
| `sale_type` | `orders` | Purpose unclear |
| `db_1` | `projects` | Internal calc only — formula: `net_sum - cost`. Not displayed directly; used to derive `profit_margin` |
| `product` | `orders` | Purpose unclear |
| `unit_price` | `orders` | Price per single product unit — not needed |
| `order_number` | `orders` | Distinction from `order_id` not clarified — excluded |
| `person_id` | — | Purpose unclear |
| `questionnaire_received` | `projects` | No longer needed |
| `id` | — | Not needed |
| `project_id` | `projects` | Integrated into `order_id` — redundant |

---

## 📝 Key Business Logic Notes

### `profit_margin` vs `db_1`
- **`db_1`** (not displayed): `net_sum - cost` → the raw euro margin after paying the supplier.
- **`profit_margin`** (displayed): `db_1 / net_sum` expressed as a percentage. Special case: if `cost = 0`, then `profit_margin = 100%`.

### `net_sum` vs `gross_sum`
- **`net_sum`**: Amount the customer pays **without tax** — this is the column to display.
- **`gross_sum`**: Amount **with tax** — excluded from dashboard.

### `supplier payment`
- Should render as a **dropdown or checkbox** UI element to mark whether the supplier has been paid.
- Currently marked as *"To be implemented"*.

### Delivery date columns
- `delivery_1_date` through `delivery_4_date` should be displayed with **shortened labels**: `delivery_1`, `delivery_2`, `delivery_3`, `delivery_4`.
- Columns 2–4 may be empty and should be nullable.

### `customer_type` / `custmer type`
- Note: the source spreadsheet has a typo (`custmer`). Use `customer_type` as the canonical db column name.
- Currently marked as *"To be implemented"*.

---

## 🗂️ Source Table Summary

| Table | Columns sourced from it |
|-------|------------------------|
| `orders` | `order_id`, `product_name`, `quantity`, `PM type`, `supplier`, `cost`, `net_sum`, `supplier payment`, `deposit`, `date_information_complete`, `due_delivery_date`, `delivery_1–4_date`, `date_first_delivery_complete`, `date_project_end`, `delay_first_delivery`, `delay_first_revision`, `delay_second_revision`, `date_order_entry` |
| `projects` | `client_rating`, `company_name`, `PM`, `profit_margin`, `customer_name`, `customer_email`, `customer_type`, `comments` |