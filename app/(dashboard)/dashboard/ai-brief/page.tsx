import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { AiBriefClient } from './ai-brief-client';

export default async function AiBriefPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  return <AiBriefClient />;
}
