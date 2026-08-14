'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProjectIntakePanel } from '@/components/project-intake-panel';
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

type EntryStatus = 'processing' | 'success' | 'error' | 'stopped';

// One request + its response inside a project's conversation.
interface BriefEntry {
  job_id: string;
  status: EntryStatus;
  error_code: string | null;
  request: {
    project_id: string;
    project_name: string | null;
    text: string | null;
  } | null;
  created_at: string | null;
  completed_at: string | null;
  has_result: boolean;
  result_payload?: any;
  has_thread_file?: boolean;
}

// A project's full brief history — one row in brief_conversations.
interface Conversation {
  project_id: string;
  project_name: string | null;
  created_at: string;
  updated_at: string;
  entry_count: number;
  entries: BriefEntry[];
}

interface BriefSummary {
  quick_facts?: string;
  key_undocumented_context?: string;
  open_questions?: string;
  notable_moments?: string;
}

interface BriefResult {
  project_id?: string;
  project_name?: string;
  pm?: { mailbox_email?: string };
  summary?: BriefSummary | string;
  raw_thread_file?: {
    filename: string;
    mime_type: string;
    content: string | null; // base64; null in thread responses, fetched on demand
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

// n8n sometimes delivers the summary wrapped in a one-element items array —
// e.g. [{ summary: {...} }] — or as a JSON string. Normalize every stored shape
// so historical briefs render instead of falling through to "no summary".
const normalizeResult = (raw: any): BriefResult => {
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
      summary = normalizeResult([{ summary: JSON.parse(summary) }]).summary;
    } catch {
      // plain-text summary that happens to start with a bracket — keep as is
    }
  }
  return { ...result, summary };
};

const projectLabel = (id: string, name?: string | null) =>
  name ? `${id} — ${name}` : id;

export function AiBriefClient() {
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<ProjectHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ProjectHit | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Desktop-only: collapses the docked panel entirely (mobile uses historyOpen)
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // The project whose conversation is open, and its entries
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [thread, setThread] = useState<Conversation | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [deleteEntry, setDeleteEntry] = useState<BriefEntry | null>(null);
  const [deleteThread, setDeleteThread] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

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
  // the dashboard shell), so this page only keeps itself fresh.
  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/project-brief/conversations');
      const json = await res.json();
      if (!res.ok) return;
      setConversations(json.data || []);
      setConversationsLoaded(true);
    } catch {
      // transient — next poll will retry
    }
  }, []);

  const loadThread = useCallback(
    async (projectId: string, { silent = false } = {}) => {
      if (!silent) setThreadLoading(true);
      try {
        const res = await fetch(
          `/api/project-brief/conversations/${encodeURIComponent(projectId)}`
        );
        const json = await res.json();
        if (!res.ok) {
          if (!silent) {
            toast.error('Could not open this conversation', {
              description: json.error
            });
          }
          return;
        }
        setThread(json.data);
      } catch (err: any) {
        if (!silent) {
          toast.error('Could not open this conversation', {
            description: err.message
          });
        }
      } finally {
        if (!silent) setThreadLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // Poll while anything in the open conversation is still being generated, so
  // the response lands under its request without a reload.
  const threadProcessing = thread?.entries.some((e) => e.status === 'processing');
  useEffect(() => {
    if (!threadProcessing || !activeProjectId) return;
    const interval = setInterval(() => {
      loadThread(activeProjectId, { silent: true });
      refreshConversations();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [threadProcessing, activeProjectId, loadThread, refreshConversations]);

  // Keep the newest exchange in view, like a chat window
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread?.project_id, thread?.entries.length]);

  const openConversation = (projectId: string) => {
    setActiveProjectId(projectId);
    setThread(null);
    setHistoryOpen(false);
    setSelected(null);
    setSearch('');
    loadThread(projectId);
  };

  const startNewBrief = () => {
    setActiveProjectId(null);
    setThread(null);
    setSelected(null);
    setSearch('');
    setHistoryOpen(false);
  };

  // The project the composer will queue for: an explicitly picked one, else the
  // conversation currently open (so a follow-up brief continues the thread).
  const targetProjectId = selected?.project_id ?? activeProjectId;

  const queueBrief = async () => {
    if (!targetProjectId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/project-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: targetProjectId })
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error('Could not queue the brief', { description: json.error });
        return;
      }
      setActiveProjectId(targetProjectId);
      setSelected(null);
      setSearch('');
      await Promise.all([
        loadThread(targetProjectId, { silent: thread?.project_id === targetProjectId }),
        refreshConversations()
      ]);
    } catch (err: any) {
      toast.error('Could not queue the brief', { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const stopEntry = async (entry: BriefEntry) => {
    setStoppingId(entry.job_id);
    try {
      const res = await fetch(`/api/project-brief/${entry.job_id}`, {
        method: 'PATCH'
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error('Could not stop the brief', { description: json.error });
        return;
      }
      if (activeProjectId) await loadThread(activeProjectId, { silent: true });
      await refreshConversations();
    } catch (err: any) {
      toast.error('Could not stop the brief', { description: err.message });
    } finally {
      setStoppingId(null);
    }
  };

  const removeEntry = async (entry: BriefEntry) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/project-brief/${entry.job_id}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error('Could not delete this brief', { description: json.error });
        return;
      }
      const remaining = (thread?.entries.length ?? 0) - 1;
      if (activeProjectId) {
        // Deleting the last entry removes the conversation itself
        if (remaining <= 0) startNewBrief();
        else await loadThread(activeProjectId, { silent: true });
      }
      await refreshConversations();
    } catch (err: any) {
      toast.error('Could not delete this brief', { description: err.message });
    } finally {
      setDeleting(false);
      setDeleteEntry(null);
    }
  };

  const removeConversation = async (conversation: Conversation) => {
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/project-brief/conversations/${encodeURIComponent(conversation.project_id)}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error('Could not delete this conversation', { description: json.error });
        return;
      }
      setConversations((prev) =>
        prev.filter((c) => c.project_id !== conversation.project_id)
      );
      if (activeProjectId === conversation.project_id) startNewBrief();
    } catch (err: any) {
      toast.error('Could not delete this conversation', { description: err.message });
    } finally {
      setDeleting(false);
      setDeleteThread(null);
    }
  };

  // The thread response omits the base64 attachment — fetch the full entry only
  // when the user actually asks for the file.
  const downloadThreadFile = async (entry: BriefEntry, result: BriefResult) => {
    setDownloadingId(entry.job_id);
    try {
      const res = await fetch(`/api/project-brief/${entry.job_id}`);
      const json = await res.json();
      const file = normalizeResult(json.data?.result_payload).raw_thread_file;
      if (!res.ok || !file?.content) {
        toast.error('Could not download the email thread');
        return;
      }
      const bytes = Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: file.mime_type || 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename || `${result.project_id}_email_thread.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error('Could not download the email thread', { description: err.message });
    } finally {
      setDownloadingId(null);
    }
  };

  const copySummary = async (result: BriefResult, projectId: string) => {
    let text = '';
    if (result.summary && typeof result.summary === 'object') {
      text = SUMMARY_SECTIONS.filter(({ key }) => (result.summary as BriefSummary)[key])
        .map(({ key, title }) => `${title}\n${(result.summary as BriefSummary)[key]}`)
        .join('\n\n');
    } else if (typeof result.summary === 'string') {
      text = result.summary;
    }
    if (!text) return;
    try {
      await navigator.clipboard.writeText(`Project brief — ${projectId}\n\n${text}`);
      toast.success('Summary copied to clipboard');
    } catch {
      toast.error('Could not copy the summary');
    }
  };

  const statusDot = (status: EntryStatus) => {
    if (status === 'processing')
      return <Loader2 className="h-4 w-4 animate-spin text-gray-400" />;
    if (status === 'success')
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    if (status === 'stopped') return <CircleStop className="h-4 w-4 text-gray-400" />;
    return <AlertCircle className="h-4 w-4 text-red-500" />;
  };

  const conversationSubtitle = (conversation: Conversation) => {
    const last = conversation.entries[conversation.entries.length - 1];
    if (!last) return '';
    if (last.status === 'processing') return 'Generating…';
    const count = `${conversation.entry_count} brief${
      conversation.entry_count === 1 ? '' : 's'
    }`;
    return `${count} · ${new Date(conversation.updated_at).toLocaleDateString()}`;
  };

  const showConversation = activeProjectId !== null;

  // ── One request + response pair ───────────────────────────────────────────
  const renderEntry = (entry: BriefEntry) => {
    const result = entry.result_payload ? normalizeResult(entry.result_payload) : null;
    const structured = result?.summary && typeof result.summary === 'object';
    const plainText =
      result?.summary && typeof result.summary === 'string' ? result.summary : null;
    const label = projectLabel(
      entry.request?.project_id ?? thread?.project_id ?? '',
      entry.request?.project_name ?? result?.project_name ?? thread?.project_name
    );

    return (
      <div key={entry.job_id} className="space-y-5 group/entry">
        {/* User request */}
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-gray-500" />
          </div>
          <div className="rounded-2xl rounded-tl-md border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm text-gray-800">
              Generate a <span className="font-semibold">project brief</span> for{' '}
              <span className="font-semibold">{label}</span>
            </p>
            {entry.created_at && (
              <p className="text-[11px] text-gray-400 mt-1">
                {new Date(entry.created_at).toLocaleString()}
              </p>
            )}
          </div>
          <button
            onClick={() => setDeleteEntry(entry)}
            className="mt-2 text-gray-300 hover:text-red-500 opacity-0 group-hover/entry:opacity-100 focus:opacity-100 transition-opacity"
            aria-label="Delete this brief from the conversation"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* Response */}
        <div className="flex items-start gap-3">
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: BRAND }}
          >
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0 rounded-2xl rounded-tl-md bg-gray-50 border border-gray-100 px-5 py-4">
            {entry.status === 'processing' && (
              <div className="flex items-center gap-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400 shrink-0" />
                <p className="text-sm text-gray-500 flex-1">
                  Reading the email history and writing the brief… this can take a
                  few minutes. You can keep working — it'll appear here when it's
                  done.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-gray-600 rounded-full"
                  disabled={stoppingId === entry.job_id}
                  onClick={() => stopEntry(entry)}
                >
                  {stoppingId === entry.job_id ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <CircleStop className="h-4 w-4 mr-1.5" />
                  )}
                  Stop
                </Button>
              </div>
            )}

            {entry.status === 'stopped' && (
              <div className="flex items-center gap-3 py-2">
                <CircleStop className="h-4 w-4 text-gray-400 shrink-0" />
                <p className="text-sm text-gray-500">
                  This brief was stopped. Ask for another one below if you still
                  need it.
                </p>
              </div>
            )}

            {entry.status === 'error' && (
              <div className="flex items-start gap-3 py-2">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    This brief failed ({entry.error_code || 'unknown error'})
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Ask for another brief below to try again.
                  </p>
                </div>
              </div>
            )}

            {entry.status === 'success' && !result && (
              <div className="flex items-start gap-3 py-2">
                <FileText className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <p className="text-sm text-gray-500">
                  The workflow completed but its result was delivered to a different
                  callback URL. Ask for another brief below.
                </p>
              </div>
            )}

            {entry.status === 'success' && result && (
              <div>
                <p className="text-sm text-gray-800 mb-1">
                  Here's the brief for <span className="font-semibold">{label}</span>:
                </p>
                <p className="text-xs text-gray-400 mb-4">
                  {result.metadata?.email_count != null &&
                    `${result.metadata.email_count} emails analyzed`}
                  {result.pm?.mailbox_email && ` · mailbox: ${result.pm.mailbox_email}`}
                </p>

                {structured && (
                  <div className="space-y-4">
                    {SUMMARY_SECTIONS.map(({ key, title }) => {
                      const content = (result.summary as BriefSummary)[key];
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

                {plainText && (
                  <div className="rounded-xl bg-white border border-gray-200 p-4">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {plainText}
                    </p>
                  </div>
                )}

                {!structured && !plainText && (
                  <div className="flex items-start gap-3">
                    <FileText className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-gray-500">
                      No summary was included with this brief — the full email thread
                      is available via the download button below
                      {result.raw_thread_file?.filename
                        ? ` (${result.raw_thread_file.filename})`
                        : ''}
                      .
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-1 mt-4 pt-3 border-t border-gray-200">
                  {(structured || plainText) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-500"
                      onClick={() =>
                        copySummary(result, entry.request?.project_id ?? '')
                      }
                    >
                      <Copy className="h-4 w-4 mr-1.5" /> Copy
                    </Button>
                  )}
                  {entry.has_thread_file && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-500"
                      disabled={downloadingId === entry.job_id}
                      onClick={() => downloadThreadFile(entry, result)}
                    >
                      {downloadingId === entry.job_id ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <FileDown className="h-4 w-4 mr-1.5" />
                      )}
                      Download thread
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

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
                {thread
                  ? projectLabel(thread.project_id, thread.project_name)
                  : 'Project Brief'}
              </h1>
              <p className="text-xs text-gray-400 leading-tight">
                {thread
                  ? `${thread.entry_count} brief${thread.entry_count === 1 ? '' : 's'} in this conversation`
                  : "AI summary of a project's email history"}
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
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {!showConversation ? (
            /* Welcome state */
            <div className="h-full flex flex-col items-center justify-center px-6 text-center">
              <h2 className="text-3xl lg:text-4xl font-extrabold text-gray-900 tracking-tight">
                Welcome to Project Brief
              </h2>
              <p className="text-gray-500 mt-3 max-w-md">
                Search for a project below and generate a brief of its full email
                history. It runs in the background — you'll be notified when it's
                ready, and every brief you run for a project is kept together in one
                conversation.
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
          ) : threadLoading && !thread ? (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-10">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6 space-y-8">
              {thread?.entries.map(renderEntry)}
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

            {/* The brief page is the one project surface PMs can reach, so the
                questionnaire handover lives here too: the PM records that the
                questionnaire arrived, which starts the project intake. */}
            {(selected?.project_id ?? activeProjectId) && (
              <ProjectIntakePanel
                key={selected?.project_id ?? activeProjectId}
                projectId={(selected?.project_id ?? activeProjectId) as string}
              />
            )}

            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm focus-within:border-gray-300 p-2 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={
                    selected
                      ? projectLabel(selected.project_id, selected.project_name)
                      : search
                  }
                  onChange={(e) => {
                    setSelected(null);
                    setSearch(e.target.value);
                  }}
                  placeholder={
                    activeProjectId
                      ? `Ask for another brief for ${activeProjectId}, or search another project…`
                      : 'Search by project ID, name or PM…'
                  }
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
                disabled={!targetProjectId || submitting}
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
          <h2 className="text-xs font-medium text-gray-400">Projects</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {!conversationsLoaded ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-gray-400 px-3 py-2">
              No briefs yet. Search a project below to generate your first one.
            </p>
          ) : (
            conversations.map((conversation) => {
              const last = conversation.entries[conversation.entries.length - 1];
              return (
                <div key={conversation.project_id} className="group relative">
                  <button
                    onClick={() => openConversation(conversation.project_id)}
                    className={`w-full text-left rounded-lg pl-3 pr-9 py-2 transition-colors ${
                      activeProjectId === conversation.project_id
                        ? 'bg-gray-200/80'
                        : 'hover:bg-gray-200/50'
                    }`}
                  >
                    <span className="block text-sm text-gray-900 truncate">
                      {conversation.project_name || conversation.project_id}
                    </span>
                    <span className="block text-xs text-gray-400 truncate mt-0.5">
                      {conversationSubtitle(conversation)}
                    </span>
                  </button>

                  {/* Status of the latest brief, swapped for the ⋯ menu on hover */}
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none group-hover:opacity-0 group-focus-within:opacity-0 transition-opacity">
                    {last && statusDot(last.status)}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-300/50 opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                        aria-label={`Options for ${conversation.project_id}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 rounded-xl">
                      {last?.status === 'processing' && (
                        <DropdownMenuItem
                          disabled={stoppingId === last.job_id}
                          onClick={() => stopEntry(last)}
                        >
                          <CircleStop className="h-4 w-4 mr-2" /> Stop latest
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onClick={() => setDeleteThread(conversation)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete conversation
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Delete a single exchange */}
      <AlertDialog
        open={deleteEntry !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteEntry(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this brief?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes one request and its response from the conversation for{' '}
              <span className="font-semibold text-gray-700">
                {deleteEntry?.request?.project_id ?? thread?.project_id}
              </span>
              . The rest of the history stays.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={(e) => {
                e.preventDefault();
                if (deleteEntry) removeEntry(deleteEntry);
              }}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete a whole conversation */}
      <AlertDialog
        open={deleteThread !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteThread(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes all{' '}
              <span className="font-semibold text-gray-700">
                {deleteThread?.entry_count}
              </span>{' '}
              brief{deleteThread?.entry_count === 1 ? '' : 's'} for{' '}
              <span className="font-semibold text-gray-700">
                {deleteThread?.project_id}
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
                if (deleteThread) removeConversation(deleteThread);
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
