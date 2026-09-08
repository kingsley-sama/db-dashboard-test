import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';
import {
  PROJECT_ORDER_ORDER_FIELDS,
  PROJECT_ORDER_PROJECT_FIELDS,
  buildProjectOrderUpdate,
  canEditProjectOrders,
  orderMatchesExpectation,
  parseExpectedOrder,
  parseProjectOrderRowId,
} from '@/lib/project-order-edits';

// PUT /api/project-orders/[id] — edit one row of the Project Orders shared view
// without leaving it.
//
// [id] is the row id the view hands the client: "<projectPk>" for the project
// alone, or "<projectPk>-<orderPk>" for the row's project and order together.
// A row of this view is two records, so the payload says which half each field
// belongs to rather than letting a name that exists on both tables (pm_type,
// deposit) land wherever it happens to match:
//
//   { "project": { "invoice_number": "RE-1024" },
//     "order":   { "supplier": "Acme" },
//     "expect":  { "order_id": "ORD-1", "project_id": "P-7" } }
//
// The accepted fields and the roles allowed to send them are in
// lib/project-order-edits.ts. Anything else is rejected: this is the shared
// view's narrow write path, not a second way to update a project or an order.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canEditProjectOrders(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    // The ids are interpolated into the queries, so only plain positive
    // integers get through.
    const row = parseProjectOrderRowId(id);
    if (!row) {
      return NextResponse.json({ error: 'Invalid row id' }, { status: 400 });
    }

    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Expected an object' }, { status: 400 });
    }
    const { project, order, expect } = body as Record<string, unknown>;
    if (project === undefined && order === undefined) {
      return NextResponse.json(
        { error: 'Supply a "project" and/or an "order" object of fields to update' },
        { status: 400 }
      );
    }

    const projectUpdate =
      project === undefined
        ? null
        : buildProjectOrderUpdate(project, PROJECT_ORDER_PROJECT_FIELDS);
    if (projectUpdate && !projectUpdate.ok) {
      return NextResponse.json({ error: projectUpdate.error }, { status: 400 });
    }

    const orderUpdate =
      order === undefined ? null : buildProjectOrderUpdate(order, PROJECT_ORDER_ORDER_FIELDS);
    if (orderUpdate && !orderUpdate.ok) {
      return NextResponse.json({ error: orderUpdate.error }, { status: 400 });
    }

    const result: Record<string, unknown> = {};

    // --- the order half ----------------------------------------------------
    //
    // Done first, and only after re-reading the row: the view's order side
    // comes from `all_orders` while the write goes to `orders`, so the record
    // about to be overwritten is checked against the business keys the client
    // was looking at. If those two never shared a key space, or the row has
    // been replaced since the page loaded, this refuses rather than writing
    // over a different order.
    if (orderUpdate) {
      if (row.orderPk === null) {
        return NextResponse.json(
          { error: 'This row has no order to update' },
          { status: 400 }
        );
      }
      const expected = parseExpectedOrder(expect);
      if (!expected) {
        return NextResponse.json(
          { error: 'An order update must say which order it expects to change' },
          { status: 400 }
        );
      }

      const { data: existing, error: lookupError } = await supabaseAdmin
        .from('orders')
        .select('id, order_id, project_id')
        .eq('id', row.orderPk)
        .maybeSingle();

      if (lookupError) {
        return NextResponse.json({ error: lookupError.message }, { status: 500 });
      }
      if (!existing) {
        return NextResponse.json(
          {
            error:
              'This order could not be found in the orders table, so it cannot be edited here. Edit it under Orders.',
          },
          { status: 404 }
        );
      }
      if (!orderMatchesExpectation(existing, expected)) {
        return NextResponse.json(
          {
            error:
              'This order no longer matches the row you were editing — reload the page and try again.',
          },
          { status: 409 }
        );
      }

      const { data, error } = await supabaseAdmin
        .from('orders')
        .update(orderUpdate.update)
        .eq('id', row.orderPk)
        .select();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      result.order = data?.[0] ?? null;
    }

    // --- the project half --------------------------------------------------
    if (projectUpdate) {
      const { data, error } = await supabaseAdmin
        .from('projects')
        .update(projectUpdate.update)
        .eq('id', row.projectPk)
        .select();

      if (error) {
        // The order half, if there was one, is already written. Say so rather
        // than reporting a clean failure for a half-applied save.
        const prefix = result.order ? 'The order was saved but the project was not: ' : '';
        return NextResponse.json({ error: `${prefix}${error.message}` }, { status: 500 });
      }
      if (!data || data.length === 0) {
        const prefix = result.order ? 'The order was saved but the project was not: ' : '';
        return NextResponse.json({ error: `${prefix}Project not found` }, { status: 404 });
      }
      result.project = data[0];
    }

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
