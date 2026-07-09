import Link from 'next/link';
import { Suspense } from 'react';
import { getUser } from '@/lib/db/queries';
import { CircleIcon } from 'lucide-react';
import { UserMenuClient } from './user-menu-client';

async function Header() {
  const user = await getUser();
  const isSignedIn = !!user;

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 h-[68px]">
      <div className="w-[97%] mx-auto px-4 sm:px-6 lg:px-8 h-full flex justify-between items-center">
        <Link href="/" className="flex items-center">
          <span className="text-4xl font-semibold" style={{ color: '#012e64' }}>DASHB<span style={{ color: '#f05d5e' }}>O</span>ARD</span>
        </Link>
        <div className="flex items-center space-x-4">
          <UserMenuClient isSignedIn={isSignedIn} initialUser={user} />
        </div>
      </div>
    </header>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col min-h-screen">
      <Header />
      {children}
    </section>
  );
}
