'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
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
  CircleStop,
  Copy,
  History,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  SquarePen,
  Trash2,
  User,
  X
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';

interface ProjectHit {
  project_id: string;
  project_name: string | null;
  project_manager: string | null;
  project_status: string | null;
}

interface BriefJob {
  job_id: string;
  project_id: string | null;
  status: 'processing' | 'success' | 'error' | 'stopped';
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
const BRAND = '#012e64';

const SUMMARY_SECTIONS: { key: keyof BriefSummary; title: string }[] = [
  { key: 'quick_facts', title: 'Quick Facts' },
  { key: 'key_undocumented_context', title: 'Key Undocumented Context' },
  { key: 'open_questions', title: 'Open Questions / Loose Ends' },
  { key: 'notable_moments', title: 'Notable Quotes or Moments' }
];

// n8n sometimes delivers the result (or the summary inside it) wrapped in a
// one-element items array — e.g. [{ summary: {...} }] — or as a JSON string.
// Normalize every stored shape to a flat BriefResult so historical briefs
// render instead of falling through to "no summary was included".
const normalizeResult = (raw: any, job: BriefJob): BriefResult => {
  const result = (Array.isArray(raw) ? raw[0] : raw) ?? {};
  // Some workflow versions nest the summary inside raw_thread_file instead of
  // at the top level — fall back to it so those briefs still render.
  let summary = result.summary ?? result.raw_thread_file?.summary;
  if (Array.isArray(summary)) summary = summary[0];
  if (summary && typeof summary === 'object' && 'summary' in summary) {
    summary = summary.summary;
  }
  if (typeof summary === 'string' && /^\s*[[{]/.test(summary)) {
    try {
      summary = normalizeResult([{ summary: JSON.parse(summary) }], job).summary;
    } catch {
      // plain-text summary that happens to start with a bracket — keep as is
    }
  }
  return {
    ...result,
    summary,
    job_id: result.job_id ?? job.job_id,
    project_id: result.project_id ?? job.project_id ?? ''
  };
};

export function AiBriefClient() {
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<ProjectHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ProjectHit | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [jobs, setJobs] = useState<BriefJob[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Desktop-only: collapses the docked panel entirely (mobile uses historyOpen)
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // The brief currently shown in the conversation pane
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [viewedResult, setViewedResult] = useState<BriefResult | null>(null);
  const [loadingResultId, setLoadingResultId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BriefJob | null>(null);
  const [deleting, setDeleting] = useState(false);
  const autoLoadedRef = useRef<Set<string>>(new Set());

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
      setViewedResult(normalizeResult(json.data.result_payload, job));
    } catch (err: any) {
      toast.error('Could not load the brief result', { description: err.message });
    } finally {
      setLoadingResultId(null);
    }
  };

  const activeJob = activeJobId
    ? jobs.find((j) => j.job_id === activeJobId) ?? null
    : null;

  // When the active job finishes in the background, pull its result into the
  // conversation automatically (once per job).
  useEffect(() => {
    if (!activeJob || activeJob.status !== 'success' || !activeJob.has_result) return;
    if (viewedResult?.job_id === activeJob.job_id) return;
    if (loadingResultId || autoLoadedRef.current.has(activeJob.job_id)) return;
    autoLoadedRef.current.add(activeJob.job_id);
    viewResult(activeJob);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, activeJobId]);

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
      setActiveLabel(
        selected.project_name
          ? `${selected.project_id} — ${selected.project_name}`
          : selected.project_id
      );
      setViewedResult(null);
      setActiveJobId(json.job_id ?? null);
      setSelected(null);
      setSearch('');
      await refreshJobs();
    } catch (err: any) {
      toast.error('Could not queue the brief', { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const openJob = (job: BriefJob) => {
    setActiveJobId(job.job_id);
    setActiveLabel(job.project_id);
    setHistoryOpen(false);
    if (viewedResult?.job_id !== job.job_id) {
      setViewedResult(null);
      if (job.status === 'success' && job.has_result) viewResult(job);
    }
  };

  const startNewBrief = () => {
    setActiveJobId(null);
    setActiveLabel(null);
    setViewedResult(null);
    setSelected(null);
    setSearch('');
    setHistoryOpen(false);
  };

  const stopJob = async (job: BriefJob) => {
    setStoppingId(job.job_id);
    try {
      const res = await fetch(`/api/project-brief/${job.job_id}`, {
        method: 'PATCH'
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error('Could not stop the brief', { description: json.error });
        return;
      }
      setJobs((prev) =>
        prev.map((j) =>
          j.job_id === job.job_id ? { ...j, status: 'stopped' as const } : j
        )
      );
      await refreshJobs();
    } catch (err: any) {
      toast.error('Could not stop the brief', { description: err.message });
    } finally {
      setStoppingId(null);
    }
  };

  const deleteJob = async (job: BriefJob) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/project-brief/${job.job_id}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error('Could not delete the brief', { description: json.error });
        return;
      }
      setJobs((prev) => prev.filter((j) => j.job_id !== job.job_id));
      if (activeJobId === job.job_id) {
        setActiveJobId(null);
        setActiveLabel(null);
        setViewedResult(null);
      }
    } catch (err: any) {
      toast.error('Could not delete the brief', { description: err.message });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
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

  const copySummary = async (result: BriefResult) => {
    let text = '';
    if (result.summary && typeof result.summary === 'object') {
      text = SUMMARY_SECTIONS.filter(({ key }) => (result.summary as BriefSummary)[key])
        .map(
          ({ key, title }) =>
            `${title}\n${(result.summary as BriefSummary)[key]}`
        )
        .join('\n\n');
    } else if (typeof result.summary === 'string') {
      text = result.summary;
    }
    if (!text) return;
    try {
      await navigator.clipboard.writeText(
        `Project brief — ${result.project_id}\n\n${text}`
      );
      toast.success('Summary copied to clipboard');
    } catch {
      toast.error('Could not copy the summary');
    }
  };

  const summaryIsStructured =
    viewedResult?.summary && typeof viewedResult.summary === 'object';
  const summaryText =
    viewedResult?.summary && typeof viewedResult.summary === 'string'
      ? viewedResult.summary
      : null;

  const jobStatusDot = (job: BriefJob) => {
    if (job.status === 'processing')
      return <Loader2 className="h-4 w-4 animate-spin text-gray-400" />;
    if (job.status === 'success')
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    if (job.status === 'stopped')
      return <CircleStop className="h-4 w-4 text-gray-400" />;
    return <AlertCircle className="h-4 w-4 text-red-500" />;
  };

  const showConversation = activeJobId !== null || viewedResult !== null;

  return (
    <div className="flex h-[calc(100dvh-140px)] lg:h-[calc(100dvh-84px)] overflow-hidden">
      {/* ── Conversation column ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: BRAND }}
            >
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-gray-900 leading-tight">
                Project Brief
              </h1>
              <p className="text-xs text-gray-400 leading-tight">
                AI summary of a project's email history
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden text-gray-500"
              onClick={() => setHistoryOpen((open) => !open)}
            >
              <History className="h-4 w-4 mr-1.5" /> History
            </Button>
            {panelCollapsed && (
              <Button
                variant="ghost"
                size="sm"
                className="hidden lg:inline-flex text-gray-500"
                onClick={() => setPanelCollapsed(false)}
                aria-label="Open briefs panel"
              >
                <PanelRightOpen className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Scrolling chat area */}
        <div className="flex-1 overflow-y-auto">
          {!showConversation ? (
            /* Welcome state */
            <div className="h-full flex flex-col items-center justify-center px-6 text-center">
              <h2 className="text-3xl lg:text-4xl font-extrabold text-gray-900 tracking-tight">
                Welcome to Project Brief
              </h2>
              <p className="text-gray-500 mt-3 max-w-md">
                Search for a project below and generate a brief of its full email
                history. It runs in the background — you'll be notified when it's
                ready.
              </p>
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left">
                  <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <Search className="h-4 w-4 text-amber-700" />
                  </div>
                  <p className="text-sm font-medium text-gray-800">
                    Search by ID, name or PM
                  </p>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left">
                  <div className="h-9 w-9 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-sky-700" />
                  </div>
                  <p className="text-sm font-medium text-gray-800">
                    Get facts, context & open questions
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6 space-y-5">
              {/* User request bubble */}
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-gray-500" />
                </div>
                <div className="rounded-2xl rounded-tl-md border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-sm text-gray-800">
                    Generate a <span className="font-semibold">project brief</span> for{' '}
                    <span className="font-semibold">
                      {viewedResult
                        ? `${viewedResult.project_id}${
                            viewedResult.project_name
                              ? ` — ${viewedResult.project_name}`
                              : ''
                          }`
                        : activeLabel}
                    </span>
                  </p>
                </div>
              </div>

              {/* Assistant bubble */}
              <div className="flex items-start gap-3">
                <div
                  className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: BRAND }}
                >
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 min-w-0 rounded-2xl rounded-tl-md bg-gray-50 border border-gray-100 px-5 py-4">
                  {/* Still processing */}
                  {activeJob?.status === 'processing' && !viewedResult && (
                    <div className="flex items-center gap-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400 shrink-0" />
                      <p className="text-sm text-gray-500 flex-1">
                        Reading the email history and writing the brief… this can
                        take a few minutes. You can keep working — it'll appear
                        here when it's done.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-gray-600 rounded-full"
                        disabled={stoppingId === activeJob.job_id}
                        onClick={() => stopJob(activeJob)}
                      >
                        {stoppingId === activeJob.job_id ? (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                          <CircleStop className="h-4 w-4 mr-1.5" />
                        )}
                        Stop
                      </Button>
                    </div>
                  )}

                  {/* Stopped by the user */}
                  {activeJob?.status === 'stopped' && !viewedResult && (
                    <div className="flex items-center gap-3 py-2">
                      <CircleStop className="h-4 w-4 text-gray-400 shrink-0" />
                      <p className="text-sm text-gray-500">
                        This brief was stopped. Queue a new one for this project
                        if you still need it.
                      </p>
                    </div>
                  )}

                  {/* Failed */}
                  {activeJob?.status === 'error' && !viewedResult && (
                    <div className="flex items-start gap-3 py-2">
                      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          This brief failed ({activeJob.error_code || 'unknown error'})
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          Queue a new brief for this project to try again.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Fetching the stored result */}
                  {loadingResultId && !viewedResult && (
                    <div className="flex items-center gap-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      <p className="text-sm text-gray-500">Loading the brief…</p>
                    </div>
                  )}

                  {/* Completed but nothing stored */}
                  {activeJob?.status === 'success' &&
                    !activeJob.has_result &&
                    !viewedResult &&
                    !loadingResultId && (
                      <div className="flex items-start gap-3 py-2">
                        <FileText className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                        <p className="text-sm text-gray-500">
                          The workflow completed but its result was delivered to a
                          different callback URL. Queue a new brief for this
                          project.
                        </p>
                      </div>
                    )}

                  {/* The brief itself */}
                  {viewedResult && (
                    <div>
                      <p className="text-sm text-gray-800 mb-1">
                        Here's the brief for{' '}
                        <span className="font-semibold">
                          {viewedResult.project_id}
                          {viewedResult.project_name
                            ? ` — ${viewedResult.project_name}`
                            : ''}
                        </span>
                        :
                      </p>
                      <p className="text-xs text-gray-400 mb-4">
                        {viewedResult.metadata?.email_count != null &&
                          `${viewedResult.metadata.email_count} emails analyzed`}
                        {viewedResult.pm?.mailbox_email &&
                          ` · mailbox: ${viewedResult.pm.mailbox_email}`}
                      </p>

                      {summaryIsStructured && (
                        <div className="space-y-4">
                          {SUMMARY_SECTIONS.map(({ key, title }) => {
                            const content = (viewedResult.summary as BriefSummary)[key];
                            if (!content) return null;
                            return (
                              <div
                                key={key}
                                className="rounded-xl bg-white border border-gray-200 p-4"
                              >
                                <h3
                                  className="text-xs font-semibold uppercase tracking-wide mb-2"
                                  style={{ color: BRAND }}
                                >
                                  {title}
                                </h3>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                  {content}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {summaryText && (
                        <div className="rounded-xl bg-white border border-gray-200 p-4">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                            {summaryText}
                          </p>
                        </div>
                      )}

                      {!summaryIsStructured && !summaryText && (
                        <div className="flex items-start gap-3">
                          <FileText className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                          <p className="text-sm text-gray-500">
                            No summary was included with this brief — the full
                            email thread is available via the download button
                            below
                            {viewedResult.raw_thread_file?.filename
                              ? ` (${viewedResult.raw_thread_file.filename})`
                              : ''}
                            .
                          </p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center justify-end gap-1 mt-4 pt-3 border-t border-gray-200">
                        {(summaryIsStructured || summaryText) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-500"
                            onClick={() => copySummary(viewedResult)}
                          >
                            <Copy className="h-4 w-4 mr-1.5" /> Copy
                          </Button>
                        )}
                        {viewedResult.raw_thread_file && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-500"
                            onClick={() => downloadThreadFile(viewedResult)}
                          >
                            <FileDown className="h-4 w-4 mr-1.5" /> Download thread
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="px-4 lg:px-6 pb-4 pt-2">
          <div className="max-w-3xl mx-auto relative">
            {/* Search results open upward, above the composer */}
            {!selected && search.trim() && (
              <div className="absolute left-0 right-0 bottom-full mb-2 z-30 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                {searching ? (
                  <div className="p-3 text-sm text-gray-500 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                  </div>
                ) : hits.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500">
                    No projects match “{search}”.
                  </div>
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
                        <span className="font-medium text-gray-900">
                          {hit.project_id}
                        </span>
                        {hit.project_name && (
                          <span className="text-gray-500"> — {hit.project_name}</span>
                        )}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {hit.project_manager && (
                          <span className="text-xs text-gray-400">
                            {hit.project_manager}
                          </span>
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

            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm focus-within:border-gray-300 p-2 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={
                    selected
                      ? `${selected.project_id} — ${selected.project_name ?? ''}`
                      : search
                  }
                  onChange={(e) => {
                    setSelected(null);
                    setSearch(e.target.value);
                  }}
                  placeholder="Search by project ID, name or PM…"
                  className="pl-9 border-0 shadow-none focus-visible:ring-0"
                />
                {selected && (
                  <button
                    onClick={() => {
                      setSelected(null);
                      setSearch('');
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label="Clear selected project"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button
                onClick={queueBrief}
                disabled={!selected || submitting}
                className="text-white rounded-xl"
                style={{ backgroundColor: BRAND }}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Generate Brief
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── History side panel (docked right, ChatGPT-style) ────────── */}
      <aside
        className={`${historyOpen ? 'flex' : 'hidden'} ${
          panelCollapsed ? 'lg:hidden' : 'lg:flex'
        } w-72 shrink-0 border-l border-gray-200/70 bg-[#f9f9f9] flex-col`}
      >
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <button
            onClick={startNewBrief}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200/60 transition-colors"
          >
            <SquarePen className="h-4 w-4" /> New brief
          </button>
          <button
            className="hidden lg:flex text-gray-400 hover:text-gray-600 p-1.5 rounded-md hover:bg-gray-200/60 transition-colors"
            onClick={() => setPanelCollapsed(true)}
            aria-label="Collapse briefs panel"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
          <button
            className="lg:hidden text-gray-400 hover:text-gray-600 p-1.5"
            onClick={() => setHistoryOpen(false)}
            aria-label="Close history"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 pt-2 pb-1">
          <h2 className="text-xs font-medium text-gray-400">Briefs</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {!jobsLoaded ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-gray-400 px-3 py-2">
              No briefs yet. Search a project below to generate your first one.
            </p>
          ) : (
            jobs.map((job) => (
              <div key={job.job_id} className="group relative">
                <button
                  onClick={() => openJob(job)}
                  className={`w-full text-left rounded-lg pl-3 pr-9 py-2 transition-colors ${
                    activeJobId === job.job_id
                      ? 'bg-gray-200/80'
                      : 'hover:bg-gray-200/50'
                  }`}
                >
                  <span className="block text-sm text-gray-900 truncate">
                    {job.project_id}
                  </span>
                  <span className="block text-xs text-gray-400 truncate mt-0.5">
                    {job.status === 'processing'
                      ? 'Processing…'
                      : job.status === 'stopped'
                        ? 'Stopped'
                        : job.status === 'error'
                          ? job.error_code || 'Failed'
                          : !job.has_result
                            ? 'No result stored'
                            : new Date(job.created_at).toLocaleString()}
                  </span>
                </button>

                {/* Status icon, swapped for the ⋯ menu on hover */}
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none group-hover:opacity-0 group-focus-within:opacity-0 transition-opacity">
                  {jobStatusDot(job)}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-300/50 opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                      aria-label={`Options for ${job.project_id}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40 rounded-xl">
                    {job.status === 'processing' && (
                      <DropdownMenuItem
                        disabled={stoppingId === job.job_id}
                        onClick={() => stopJob(job)}
                      >
                        <CircleStop className="h-4 w-4 mr-2" /> Stop
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-600"
                      onClick={() => setDeleteTarget(job)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete brief?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the brief for{' '}
              <span className="font-semibold text-gray-700">
                {deleteTarget?.project_id}
              </span>{' '}
              from your history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteJob(deleteTarget);
              }}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
