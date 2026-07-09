import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import { getUser, getTeamForUser } from '@/lib/db/queries';
import { SWRConfig } from 'swr';
import { Toaster } from '@/components/ui/sonner';

const title = 'Supabase Dashboard Tool';
const description =
  'A cleaner, more intuitive way to manage your Supabase databases — projects, orders, and delivery tracking in one place.';

// A malformed BASE_URL (typo, missing protocol, stray whitespace in the host's
// env settings) must not crash every page — new URL() throws on bad input.
function safeMetadataBase(): URL | undefined {
  try {
    return process.env.BASE_URL ? new URL(process.env.BASE_URL.trim()) : undefined;
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: safeMetadataBase(),
  title: {
    default: title,
    template: `%s · ${title}`,
  },
  description,
  applicationName: title,
  manifest: '/favicon_io/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon_io/favicon.ico', sizes: 'any' },
      { url: '/favicon_io/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon_io/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/favicon_io/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    title,
    description,
    siteName: title,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export const viewport: Viewport = {
  maximumScale: 1
};

const manrope = Manrope({ subsets: ['latin'] });

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`bg-white dark:bg-gray-950 text-black dark:text-white ${manrope.className}`}
    >
      <body className="min-h-[100dvh] bg-gray-50">
        <SWRConfig
          value={{
            fallback: {
              '/api/user': getUser(),
              '/api/team': getTeamForUser()
            }
          }}
        >
          {children}
        </SWRConfig>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
