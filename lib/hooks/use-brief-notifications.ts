'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';

// Global project-brief notifications: polls the user's brief jobs from anywhere
// in the dashboard, fires a toast once per completed job, and reports how many
// finished briefs the user hasn't looked at yet (for a sidebar badge). Visiting
// the Project Brief page acknowledges everything.

const NOTIFIED_KEY = 'brief-notified-jobs'; // jobs we already toasted about
const ACKED_KEY = 'brief-acked-jobs'; // jobs the user has seen on the brief page
const POLL_INTERVAL_MS = 15000;
// Only toast for jobs completed recently; anything older (e.g. finished while
// logged out) is announced by the badge instead of a stale toast on login.
const TOAST_WINDOW_MS = 30 * 60 * 1000;

function getSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  } catch {
    return new Set();
  }
}

function saveSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set).slice(-200)));
  } catch {
    // storage unavailable — notifications just won't dedupe across reloads
  }
}

export function useBriefNotifications() {
  const pathname = usePathname();
  const router = useRouter();
  const [unseenCount, setUnseenCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch('/api/project-brief/jobs');
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const jobs: any[] = json.data || [];

        const notified = getSet(NOTIFIED_KEY);
        const acked = getSet(ACKED_KEY);

        for (const job of jobs) {
          if (job.status === 'processing' || notified.has(job.job_id)) continue;
          const completedAt = job.completed_at ? new Date(job.completed_at).getTime() : 0;
          // Stopped by the user — nothing to announce, just mark it notified.
          if (Date.now() - completedAt < TOAST_WINDOW_MS && job.status !== 'stopped') {
            if (job.status === 'success') {
              toast.success('Your project brief is ready', {
                description: `Project ${job.project_id} has been analyzed — open it on the Project Brief page.`,
                duration: 10000,
                action: {
                  label: 'View',
                  onClick: () => router.push('/dashboard/ai-brief')
                }
              });
            } else {
              toast.error(`Project brief failed for ${job.project_id}`, {
                description: job.error_code
                  ? `Error: ${job.error_code}. You can retry from the Project Brief page.`
                  : 'You can retry from the Project Brief page.'
              });
            }
          }
          notified.add(job.job_id);
        }
        saveSet(NOTIFIED_KEY, notified);

        const readyJobs = jobs.filter((j) => j.status === 'success');
        if (pathname === '/dashboard/ai-brief') {
          for (const job of readyJobs) acked.add(job.job_id);
          saveSet(ACKED_KEY, acked);
        }
        setUnseenCount(readyJobs.filter((j) => !acked.has(j.job_id)).length);
      } catch {
        // transient network error — next poll retries
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pathname, router]);

  return unseenCount;
}
