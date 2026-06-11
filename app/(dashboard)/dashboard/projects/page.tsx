import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { ProjectsPageClient } from './projects-page-client';

// Projects are restricted to team owners — enforce server-side before rendering
export default async function ProjectsPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }
  if (user.role !== 'owner') {
    redirect('/dashboard');
  }

  return <ProjectsPageClient />;
}
