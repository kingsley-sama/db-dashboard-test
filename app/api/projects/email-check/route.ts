import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { client } from '@/lib/db/drizzle';

// GET /api/projects/email-check?email_id=123
// Verifies an Email ID exists and resolves the company + (if unambiguous) the linked person.
// The project's person_id auto-fills from this email via a DB trigger when exactly one
// person is linked, so the form mirrors that here for preview/derivation.
// Returns {
//   exists, email?: { email_id, company_email, company_name, client_id },
//   person?: { person_id, person_addressing } | null, personCount
// }
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = request.nextUrl.searchParams.get('email_id')?.trim();
    if (!raw) {
      return NextResponse.json({ error: 'email_id is required' }, { status: 400 });
    }
    const emailId = Number(raw);
    if (!Number.isInteger(emailId)) {
      return NextResponse.json({ error: 'email_id must be a number' }, { status: 400 });
    }

    const emailRows = await client`
      select e.email_id, e.company_email, c.company_name, c.client_id
      from public.emails e
      left join public.companies c on c.company_id = e.company_id
      where e.email_id = ${emailId}
      limit 1
    `;

    if (!emailRows[0]) {
      return NextResponse.json(
        { exists: false, email: null, person: null, personCount: 0 },
        { status: 200 }
      );
    }

    const personRows = await client`
      select p.person_id, p.person_addressing
      from public.person_emails pe
      join public.persons p on p.person_id = pe.person_id
      where pe.email_id = ${emailId}
    `;

    // Mirror the trigger: only auto-resolve a person when exactly one is linked.
    const person =
      personRows.length === 1
        ? {
            person_id: Number(personRows[0].person_id),
            person_addressing: personRows[0].person_addressing as string,
          }
        : null;

    const email = {
      email_id: Number(emailRows[0].email_id),
      company_email: emailRows[0].company_email as string,
      company_name: (emailRows[0].company_name as string) ?? null,
      client_id: emailRows[0].client_id != null ? Number(emailRows[0].client_id) : null,
    };

    return NextResponse.json(
      { exists: true, email, person, personCount: personRows.length },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
