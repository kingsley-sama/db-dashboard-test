import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';

// Curated allowlist of the environment variables this backend actually reads.
// We never iterate process.env blindly — that would risk leaking host/system
// secrets (PATH, cloud credentials, etc.). Only the keys listed here are ever
// returned, and only to an authenticated owner.
const ENV_CATALOG: { key: string; sensitive: boolean; description: string }[] = [
  { key: 'NODE_ENV', sensitive: false, description: 'Runtime environment' },
  { key: 'BASE_URL', sensitive: false, description: 'Server base URL' },
  { key: 'NEXT_PUBLIC_BASE_URL', sensitive: false, description: 'Public base URL (shipped to the browser)' },
  { key: 'NEXT_PUBLIC_APP_NAME', sensitive: false, description: 'Public app name (shipped to the browser)' },
  { key: 'NEXT_PUBLIC_SUPABASE_URL', sensitive: false, description: 'Supabase project URL (shipped to the browser)' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', sensitive: false, description: 'Supabase anon key — public by design, guarded by RLS' },
  { key: 'POSTGRES_URL', sensitive: true, description: 'Postgres connection string — contains database credentials' },
  { key: 'AUTH_SECRET', sensitive: true, description: 'JWT signing secret — can forge sessions' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', sensitive: true, description: 'Supabase service role key — bypasses RLS' },
];

// GET /api/env - Inspect backend environment variables (owner only).
// Per the owner's request, full values (including secrets such as the Postgres
// password and service-role key) are returned unmasked. Access is restricted to
// the owner role; the `sensitive` flag is kept only to label rows in the UI.
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const data = ENV_CATALOG.map(({ key, sensitive, description }) => {
      const raw = process.env[key];
      const isSet = raw !== undefined && raw !== '';
      return {
        key,
        sensitive,
        description,
        isSet,
        length: isSet ? raw!.length : 0,
        // Full, unmasked value (null when unset).
        value: isSet ? raw! : null,
      };
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
