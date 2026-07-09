'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Search,
  FileDown,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye
} from 'lucide-react';

interface ProjectHit {
  project_id: string;
  project_name: string | null;
  project_manager: string | null;
  project_status: string | null;
}

interface BriefJob {
  job_id: string;
  project_id: string | null;
  status: 'processing' | 'success' | 'error';
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
  has_result: boolean;
}

interface BriefSummary {
  quick_facts?: string;
  key_undocumented_context?: string;
  open_questions?: string;
  notable_moments?: string;
}

interface BriefResult {
  status: 'success' | 'error';
  job_id: string;
  project_id: string;
  project_name?: string;
  pm?: { mailbox_email?: string };
  summary?: BriefSummary | string;
  raw_thread_file?: {
    filename: string;
    mime_type: string;
    content: string; // base64
  };
  metadata?: {
    email_count?: number;
    date_range?: { earliest?: string; latest?: string };
  };
  error?: string;
  message?: string;
}

const POLL_INTERVAL_MS = 5000;

const SUMMARY_SECTIONS: { key: keyof BriefSummary; title: string }[] = [
  { key: 'quick_facts', title: 'Quick Facts' },
  { key: 'key_undocumented_context', title: 'Key Undocumented Context' },
  { key: 'open_questions', title: 'Open Questions / Loose Ends' },
  { key: 'notable_moments', title: 'Notable Quotes or Moments' }
];

export function AiBriefClient() {
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<ProjectHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ProjectHit | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [jobs, setJobs] = useState<BriefJob[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);

  const [viewedResult, setViewedResult] = useState<BriefResult | null>(null);
  const [loadingResultId, setLoadingResultId] = useState<string | null>(null);

  // Debounced project search
  useEffect(() => {
    if (selected || !search.trim()) {
      setHits([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/project-brief?search=${encodeURIComponent(search.trim())}`
        );
        const json = await res.json();
        setHits(res.ok ? json.data : []);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, selected]);

  // Completion toasts are handled globally by useBriefNotifications (mounted in
  // the dashboard shell), so this list only keeps itself fresh.
  const refreshJobs = async () => {
    try {
      const res = await fetch('/api/project-brief/jobs');
      const json = await res.json();
      if (!res.ok) return;
      setJobs(json.data || []);
      setJobsLoaded(true);
    } catch {
      // transient — next poll will retry
    }
  };

  // Load the queue on mount, then poll while any job is still processing
  useEffect(() => {
    refreshJobs();
  }, []);

  const hasProcessing = jobs.some((j) => j.status === 'processing');
  useEffect(() => {
    if (!hasProcessing) return;
    const interval = setInterval(refreshJobs, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasProcessing]);

  const queueBrief = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/project-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: selected.project_id })
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error('Could not queue the brief', { description: json.error });
        return;
      }
      toast.info(`Brief queued for ${selected.project_id}`, {
        description: "You'll be notified here when it's ready — feel free to keep working."
      });
      setSelected(null);
      setSearch('');
      await refreshJobs();
    } catch (err: any) {
      toast.error('Could not queue the brief', { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const viewResult = async (job: BriefJob) => {
    setLoadingResultId(job.job_id);
    try {
      const res = await fetch(`/api/project-brief/${job.job_id}`);
      const json = await res.json();
      if (!res.ok || !json.data?.result_payload) {
        toast.error('No result stored for this brief', {
          description:
            'The workflow finished but its result was never delivered to this app (e.g. it was sent to a test callback URL). Queue a new brief for this project.'
        });
        return;
      }
      setViewedResult(json.data.result_payload);
    } catch (err: any) {
      toast.error('Could not load the brief result', { description: err.message });
    } finally {
      setLoadingResultId(null);
    }
  };

  const downloadThreadFile = (result: BriefResult) => {
    const file = result.raw_thread_file;
    if (!file) return;
    const bytes = Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: file.mime_type || 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename || `${result.project_id}_email_thread.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summaryIsStructured =
    viewedResult?.summary && typeof viewedResult.summary === 'object';
  const summaryText =
    viewedResult?.summary && typeof viewedResult.summary === 'string'
      ? viewedResult.summary
      : null;

  const statusBadge = (job: BriefJob) => {
    if (job.status === 'processing') {
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Processing
        </Badge>
      );
    }
    if (job.status === 'success') {
      return (
        <Badge className="gap-1 text-white" style={{ backgroundColor: '#047857' }}>
          <CheckCircle2 className="h-3 w-3" /> Ready
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" /> {job.error_code || 'Failed'}
      </Badge>
    );
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Logo header */}
      <div className="flex flex-col items-center text-center pt-8 pb-2">
        <div
          className="h-16 w-16 rounded-2xl flex items-center justify-center shadow-lg mb-4"
          style={{ backgroundColor: '#012e64' }}
        >
          <Sparkles className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Project Brief</h1>
        <p className="text-gray-500 mt-2 max-w-lg">
          Search a project and queue a brief of its full email history. The heavy lifting
          runs in the background — you'll get a notification here when it's ready.
        </p>
      </div>

      {/* Project search + queue */}
      <Card className="p-4 relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={selected ? `${selected.project_id} — ${selected.project_name ?? ''}` : search}
              onChange={(e) => {
                setSelected(null);
                setSearch(e.target.value);
              }}
              placeholder="Search by project ID, name or PM…"
              className="pl-9"
            />
          </div>
          <Button
            onClick={queueBrief}
            disabled={!selected || submitting}
            className="text-white"
            style={{ backgroundColor: '#012e64' }}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Generate Brief
          </Button>
        </div>

        {/* Search results dropdown */}
        {!selected && search.trim() && (
          <div className="absolute left-4 right-4 top-full -mt-2 z-30 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden">
            {searching ? (
              <div className="p-3 text-sm text-gray-500 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </div>
            ) : hits.length === 0 ? (
              <div className="p-3 text-sm text-gray-500">No projects match “{search}”.</div>
            ) : (
              hits.map((hit) => (
                <button
                  key={hit.project_id}
                  onClick={() => {
                    setSelected(hit);
                    setHits([]);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between gap-3"
                >
                  <span>
                    <span className="font-medium text-gray-900">{hit.project_id}</span>
                    {hit.project_name && (
                      <span className="text-gray-500"> — {hit.project_name}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {hit.project_manager && (
                      <span className="text-xs text-gray-400">{hit.project_manager}</span>
                    )}
                    {hit.project_status && (
                      <Badge variant="secondary" className="text-xs">
                        {hit.project_status}
                      </Badge>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </Card>

      {/* Job queue */}
      {jobsLoaded && jobs.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Your briefs</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {jobs.map((job) => (
              <li key={job.job_id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{job.project_id}</p>
                  <p className="text-xs text-gray-400">
                    Requested {new Date(job.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusBadge(job)}
                  {job.status === 'success' && job.has_result && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => viewResult(job)}
                      disabled={loadingResultId === job.job_id}
                    >
                      {loadingResultId === job.job_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Eye className="h-4 w-4 mr-1" /> View
                        </>
                      )}
                    </Button>
                  )}
                  {job.status === 'success' && !job.has_result && (
                    <span
                      className="text-xs text-gray-400"
                      title="The workflow completed but its result was delivered to a different callback URL. Queue a new brief for this project."
                    >
                      No result stored
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Result viewer */}
      {viewedResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {viewedResult.project_id}
                {viewedResult.project_name ? ` — ${viewedResult.project_name}` : ''}
              </h2>
              <p className="text-sm text-gray-500">
                {viewedResult.metadata?.email_count != null &&
                  `${viewedResult.metadata.email_count} emails analyzed`}
                {viewedResult.pm?.mailbox_email &&
                  ` · mailbox: ${viewedResult.pm.mailbox_email}`}
              </p>
            </div>
            {viewedResult.raw_thread_file && (
              <Button variant="outline" onClick={() => downloadThreadFile(viewedResult)}>
                <FileDown className="h-4 w-4 mr-2" />
                Download thread (.md)
              </Button>
            )}
          </div>

          {/* AI summary — rendered when the workflow provides one */}
          {summaryIsStructured &&
            SUMMARY_SECTIONS.map(({ key, title }) => {
              const content = (viewedResult.summary as BriefSummary)[key];
              if (!content) return null;
              return (
                <Card key={key} className="p-6">
                  <h3
                    className="text-sm font-semibold uppercase tracking-wide mb-3"
                    style={{ color: '#012e64' }}
                  >
                    {title}
                  </h3>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{content}</p>
                </Card>
              );
            })}
          {summaryText && (
            <Card className="p-6">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{summaryText}</p>
            </Card>
          )}

          {/* The raw email thread is download-only — the UI shows the summary.
              If no summary was delivered, point the user at the file. */}
          {!summaryIsStructured && !summaryText && (
            <Card className="p-6 flex items-start gap-3">
              <FileText className="h-5 w-5 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  No summary was included with this brief
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  The full email thread is available via the download button above
                  {viewedResult.raw_thread_file?.filename
                    ? ` (${viewedResult.raw_thread_file.filename})`
                    : ''}
                  .
                </p>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
