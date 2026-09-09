'use client'

import { OrdersTable, type InlineEditConfig, type RowEditor } from '@/components/orders-table'
import { EditOrderDialog } from '@/components/edit-order-dialog'
import { EditProjectDialog } from '@/components/edit-project-dialog'
import { projectOrdersFields } from '@/components/project-orders-columns'
import { readJsonResponse } from '@/lib/table-utils'
import { INLINE_EDITABLE_FIELDS } from '@/lib/project-order-edits'
import { RecordScopeBanner } from '@/components/record-scope-banner'
import { Building2, Info, Package, Pencil } from 'lucide-react'

// ---------------------------------------------------------------------------
// A row of project_orders_view is two records: one project, one order. So the
// row carries two identities — `project_pk` and `order_pk` — and edits address
// whichever half they belong to. Both go through /api/project-orders, which is
// gated to the roles allowed to write from this view and accepts only the
// fields listed in lib/project-order-edits.ts.
// ---------------------------------------------------------------------------

const rowId = (row: any) =>
  row.order_pk == null ? `${row.project_pk}` : `${row.project_pk}-${row.order_pk}`

/** PUTs one half of a row and reports the server's message on failure. */
const saveRow = async (row: any, body: Record<string, unknown>) => {
  if (!row?.project_pk) {
    throw new Error('This row has no project to save against')
  }
  const response = await fetch(`/api/project-orders/${rowId(row)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await readJsonResponse(response)
  if (!response.ok) {
    throw new Error(result.error || 'Failed to save')
  }
}

/**
 * Fields the edit dialogs submit that this view does not write.
 *
 * `id` and `project_id` are identity — the URL says which row is being edited.
 * `questionnaire_received` is the intake trigger, deliberately left to the
 * Projects module (the order dialog's own input for it is hidden here), and
 * `first_or_next_project` is rendered by the project dialog but has never been
 * part of its payload.
 */
const IDENTITY_AND_AUTOMATION = new Set(['id', 'project_id', 'questionnaire_received'])

const editableHalf = (payload: Record<string, any>) =>
  Object.fromEntries(
    Object.entries(payload).filter(([key]) => !IDENTITY_AND_AUTOMATION.has(key))
  )

/** How each record is named in the dialog banners. */
const orderName = (row: any) =>
  row.order_id || (row.order_number ? `Order #${row.order_number}` : 'This order')

const projectName = (row: any) =>
  [row.project_id, row.project_name].filter(Boolean).join(' — ') || 'This project'

const invoiceNumberHint =
  'Stored on the project, so it applies to every order row of that project'

export function ProjectOrdersClient({ canEdit = false }: { canEdit?: boolean }) {
  const inlineEdit: InlineEditConfig | undefined = canEdit
    ? {
        fields: [...INLINE_EDITABLE_FIELDS],
        save: (row, key, value) => saveRow(row, { project: { [key]: value } }),
        // One invoice number is stored per project and shown on each of its
        // order rows, so an edit has to land on all of them at once.
        appliesTo: (edited, candidate) => candidate.project_pk === edited.project_pk,
        hints: { invoice_number: invoiceNumberHint },
      }
    : undefined

  const rowEditors: RowEditor[] | undefined = canEdit
    ? [
        {
          key: 'order',
          title: 'Edit this order — supplier, quantity, cost, delivery dates',
          label: 'Order',
          icon: <Package className="w-4 h-4" />,
          // A project with no orders has an empty order half to edit.
          available: (row) => row.order_pk != null,
          save: (row, payload) =>
            saveRow(row, {
              order: editableHalf(payload),
              // The view's order side comes from all_orders while the write
              // goes to orders, so the server re-reads the row and checks it
              // against the keys shown here before overwriting anything.
              expect: { order_id: row.order_id ?? null, project_id: row.project_id },
            }),
          render: ({ row, onClose, onUpdate }) => (
            <EditOrderDialog
              // The view's `id` is a composite of both records; the dialog
              // wants the order's own key.
              order={{ ...row, id: row.order_pk }}
              onClose={onClose}
              onUpdate={onUpdate}
              showQuestionnaire={false}
              contextBanner={
                <RecordScopeBanner
                  scope="order"
                  name={orderName(row)}
                  facts={[
                    row.product_name || row.product,
                    row.quantity != null ? `Qty ${row.quantity}` : null,
                    row.supplier,
                  ]}
                  note="Saved on this order alone — the project's other orders are untouched."
                  related={{
                    scope: 'project',
                    name: projectName(row),
                    hint: 'invoice number, invoice dates and contacts live here — edit them with the Project button on the row',
                  }}
                />
              }
            />
          ),
        },
        {
          key: 'project',
          title: 'Edit this row’s project — invoice number, invoice dates, contacts',
          label: 'Project',
          icon: <Building2 className="w-4 h-4" />,
          save: (row, payload) => saveRow(row, { project: editableHalf(payload) }),
          render: ({ row, onClose, onUpdate }) => (
            <EditProjectDialog
              project={{ ...row, id: row.project_pk }}
              onClose={onClose}
              onUpdate={onUpdate}
              showIntakePanel={false}
              contextBanner={
                <RecordScopeBanner
                  scope="project"
                  name={projectName(row)}
                  facts={[row.company_name, row.client_contact_name, row.project_status]}
                  note="Saved on the project, so it applies to every order row of this project."
                  related={
                    row.order_pk == null
                      ? undefined
                      : {
                          scope: 'order',
                          name: orderName(row),
                          hint: 'supplier, quantity, cost and delivery dates live here — edit them with the Order button on the row',
                        }
                  }
                />
              }
            />
          ),
        },
      ]
    : undefined

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Project Orders</h1>
        <p className="text-gray-500 mt-1">
          Every order with its project context, from the <code>project_orders_view</code> database
          view. Filter it down to the orders you need, then edit them here.
        </p>
      </div>

      <div
        className="flex items-start gap-2 text-sm px-4 py-3 rounded-lg"
        style={{ backgroundColor: '#f0f7ff', border: '1px solid #d0e7ff', color: '#5d6b88' }}
      >
        <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#012e64' }} />
        <span>
          One row per order. Projects with several orders repeat their project details on each row;
          a project with no orders shows empty order columns. Every column header carries an
          operator — <strong>contains</strong>, <strong>is</strong>, <strong>is not</strong>,{' '}
          <strong>is populated</strong>, <strong>is blank</strong>, and before/after/between on
          dates. Stack as many as you need; each active condition appears as a chip above the table
          and can be removed on its own.
        </span>
      </div>

      {canEdit && (
        <div
          className="flex items-start gap-2 text-sm px-4 py-3 rounded-lg"
          style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', color: '#5d6b88' }}
        >
          <Pencil className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#012e64' }} />
          <span>
            <strong>Invoice Number</strong> is editable straight in the table — click the cell, type,
            press Enter. For anything else, the Actions column has two buttons: <strong>Order</strong>{' '}
            edits that one order (supplier, quantity, cost, delivery dates), and{' '}
            <strong>Project</strong> edits the project it belongs to (invoice number, invoice dates,
            contacts). Project fields are stored once per project, so they apply to every order row
            of that project — each dialog says which record it is saving. Questionnaire and intake
            stay under Projects.
          </span>
        </div>
      )}

      <div className="min-h-[500px]">
        <OrdersTable
          apiPath="/api/project-orders"
          fields={projectOrdersFields}
          enableCreate={false}
          enableActions={false}
          noun="project orders"
          searchPlaceholder="Search by project, project name, order ID, product, supplier, company, invoice, PM, or sales person..."
          inlineEdit={inlineEdit}
          rowEditors={rowEditors}
        />
      </div>
    </div>
  )
}
