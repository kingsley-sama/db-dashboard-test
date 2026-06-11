import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { client } from '@/lib/db/drizzle';

// Enum types used by the projects table, keyed by the form field that uses them
const PROJECT_ENUM_TYPES = [
  'project_type_values',
  'construction_type_values',
  'property_type_values',
  'yes_no_values',
  'project_status_values',
  'first_next_project',
  'pm_type',
];

// GET /api/projects/enums - Postgres enum labels for projects dropdowns (owner only)
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rows = await client`
      select t.typname as enum_name, e.enumlabel as enum_value
      from pg_type t
      join pg_enum e on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname in ${client(PROJECT_ENUM_TYPES)}
      order by t.typname, e.enumsortorder
    `;

    const enums: Record<string, string[]> = {};
    for (const row of rows) {
      const name = row.enum_name as string;
      if (!enums[name]) enums[name] = [];
      enums[name].push(row.enum_value as string);
    }

    return NextResponse.json({ enums }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
