import Link from 'next/link';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/my-app-auth';
import { CircleIcon } from 'lucide-react';
import { UserMenuClient } from './user-menu-client';

async function Header() {
  const session = await getCurrentUser();
  const isSignedIn = !!session;
  
  return (
    <header className="border-b border-gray-200">
      <div className="w-[85%] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center">
          <span className="text-4xl font-semibold" style={{ color: '#012e64' }}>DASHB<span style={{ color: '#f05d5e' }}>O</span>ARD</span>
        </Link>
        <div className="flex items-center space-x-4">
          <UserMenuClient isSignedIn={isSignedIn} />
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
