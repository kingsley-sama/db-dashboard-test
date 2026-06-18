import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { client } from '@/lib/db/drizzle';

// GET /api/projects/client-check?client_id=12345
// Verifies a Client ID exists on a company and previews the derived client_rating.
// Returns { exists: boolean, company?: { client_id, company_name, client_rating } }
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = request.nextUrl.searchParams.get('client_id')?.trim();
    if (!raw) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }
    const clientId = Number(raw);
    if (!Number.isInteger(clientId)) {
      return NextResponse.json({ error: 'client_id must be a number' }, { status: 400 });
    }

    const rows = await client`
      select client_id, company_name, client_rating
      from public.companies
      where client_id = ${clientId}
      limit 1
    `;

    const company = rows[0]
      ? {
          client_id: Number(rows[0].client_id),
          company_name: rows[0].company_name as string,
          client_rating: (rows[0].client_rating as string) ?? null,
        }
      : null;

    return NextResponse.json({ exists: !!company, company }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
