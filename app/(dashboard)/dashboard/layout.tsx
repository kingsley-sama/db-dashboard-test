'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Users, Settings, Shield, Activity, Menu, ChevronLeft, ChevronRight, Package } from 'lucide-react';

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { href: '/dashboard/orders', icon: Package, label: 'Orders' },
    { href: '/dashboard', icon: Users, label: 'Team' },
    { href: '/dashboard/general', icon: Settings, label: 'General' },
    { href: '/dashboard/activity', icon: Activity, label: 'Activity' },
    { href: '/dashboard/security', icon: Shield, label: 'Security' }
  ];

  return (
    <div className="flex flex-col w-[85%] mx-auto">
      {/* Mobile header */}
      <div className="lg:hidden flex items-center justify-between bg-white border-b border-gray-200 p-4">
        <div className="flex items-center">
          <span className="font-medium">Settings</span>
        </div>
        <Button
          className="-mr-3"
          variant="ghost"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        >
          <Menu className="h-6 w-6" />
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      </div>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside
          className={`${isCollapsed ? 'w-20' : 'w-64'} bg-white lg:bg-gray-50 border-r border-gray-200 lg:block ${
            isSidebarOpen ? 'block' : 'hidden'
          } lg:sticky lg:top-[68px] lg:h-[calc(100dvh-68px)] absolute inset-y-0 left-0 z-40 transform transition-all duration-300 ease-in-out lg:translate-x-0 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Collapse toggle button - desktop only */}
          <div className="hidden lg:flex justify-end p-2 border-b border-gray-200">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="h-8 w-8 p-0"
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>
          <nav className="h-full overflow-y-auto p-4">
            {navItems.map((item) => (
              <Link 
                key={item.href} 
                href={item.href}
                prefetch={true}
                className={`flex items-center gap-3 shadow-none my-1 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  pathname === item.href 
                    ? 'bg-gray-100 text-gray-900' 
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                } ${isCollapsed ? 'justify-center px-2' : 'justify-start'}`}
                onClick={() => setIsSidebarOpen(false)}
                title={isCollapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 p-0 lg:p-4">{children}</main>
      </div>
    </div>
  );
}
