import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { SecuritySettings } from './security-settings';
import { UserManagement } from './user-management';
import { EnvironmentVariables } from './environment-variables';

export default async function SecurityPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium bold text-gray-900 mb-6">
        Security Settings
      </h1>
      {user.role === 'owner' && (
        <>
          <UserManagement currentUserId={user.id} />
          <EnvironmentVariables />
        </>
      )}
      <SecuritySettings />
    </section>
  );
}
