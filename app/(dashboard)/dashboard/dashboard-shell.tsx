'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Users, Settings, Shield, Menu, ChevronLeft, ChevronRight, Package, FolderKanban, Layers, Sparkles } from 'lucide-react';
import { useBriefNotifications } from '@/lib/hooks/use-brief-notifications';

export function DashboardShell({
  children,
  isOwner = false
}: {
  children: React.ReactNode;
  isOwner?: boolean;
}) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  // Toasts when a queued brief finishes (anywhere in the dashboard) and counts
  // finished briefs the user hasn't opened yet
  const unseenBriefs = useBriefNotifications();

  const navItems = [
    { href: '/dashboard/orders', icon: Package, label: 'Orders' },
    // Projects are visible to owners only
    ...(isOwner ? [{ href: '/dashboard/projects', icon: FolderKanban, label: 'Projects' }] : []),
    { href: '/dashboard/ai-brief', icon: Sparkles, label: 'Project Brief' },
    { href: '/dashboard/all-orders', icon: Layers, label: 'All Orders' },
    { href: '/dashboard', icon: Users, label: 'Team' },
    { href: '/dashboard/general', icon: Settings, label: 'General' },
    { href: '/dashboard/security', icon: Shield, label: 'Security' }
  ];

  return (
    <div className="flex flex-col w-[97%] mx-auto">
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
          <TooltipProvider delayDuration={150}>
            <nav className="h-full overflow-y-auto p-4">
              {navItems.map((item) => {
                const link = (
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
                  >
                    <span className="relative flex-shrink-0">
                      <item.icon className="h-4 w-4" />
                      {/* Unread-briefs dot in collapsed mode */}
                      {item.href === '/dashboard/ai-brief' && unseenBriefs > 0 && isCollapsed && (
                        <span
                          className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border border-white"
                          style={{ backgroundColor: '#f05d5e' }}
                        />
                      )}
                    </span>
                    {!isCollapsed && <span>{item.label}</span>}
                    {/* Unread-briefs count in expanded mode */}
                    {item.href === '/dashboard/ai-brief' && unseenBriefs > 0 && !isCollapsed && (
                      <span
                        className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-xs font-semibold text-white"
                        style={{ backgroundColor: '#f05d5e' }}
                      >
                        {unseenBriefs}
                      </span>
                    )}
                  </Link>
                );

                if (!isCollapsed) return link;

                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent
                      side="right"
                      sideOffset={8}
                      className="text-sm font-medium px-3 py-2 shadow-lg rounded-md tracking-wide"
                    >
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </nav>
          </TooltipProvider>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 p-0 lg:px-4 lg:py-1">{children}</main>
      </div>
    </div>
  );
}
