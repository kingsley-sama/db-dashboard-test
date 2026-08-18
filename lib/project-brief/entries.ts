// Shared shapes and helpers for project-brief conversation entries.
//
// A conversation is one row of brief_conversations — a single user's full brief
// history for one project — and `entries` is the chronological array of
// request/response pairs on that row.

export interface BriefEntryRequest {
  project_id: string;
  project_name: string | null;
  text: string | null;
}

export type BriefSource = 'email' | 'teams' | 'both';

export interface BriefEntry {
  job_id: string;
  // Absent on entries written before the source discriminator existed; readers
  // treat a missing value as 'email'.
  source?: BriefSource;
  status: 'processing' | 'success' | 'error' | 'stopped';
  error_code: string | null;
  request: BriefEntryRequest;
  result_payload: any;
  created_at: string;
  completed_at: string | null;
}

// Metadata-only view of an entry: everything the UI needs to render the thread
// except the payload itself, which can carry a base64 copy of the whole email
// thread and would make listing conversations expensive.
export function summarizeEntry(entry: any) {
  return {
    job_id: entry.job_id,
    source: entry.source ?? 'email',
    status: entry.status,
    error_code: entry.error_code ?? null,
    request: entry.request ?? null,
    created_at: entry.created_at ?? null,
    completed_at: entry.completed_at ?? null,
    has_result: entry.result_payload != null
  };
}

// n8n delivers the payload either bare or wrapped in a one-element array.
function unwrap(payload: any) {
  return (Array.isArray(payload) ? payload[0] : payload) ?? {};
}

export interface ThreadFile {
  source: BriefSource;
  filename: string | null;
  mime_type: string;
  content: string | null; // base64; null once stripped for listing
}

// A brief can come back with more than one transcript: the PM's email thread,
// and — when the project has activity in the Teams channel — the Teams threads.
// Three payload shapes exist in the wild and all have to keep rendering:
//   1. a bare object            { filename, mime_type, content }      (original)
//   2. an array using content_email                                   (current n8n)
//   3. an array using content                                         (from now on)
export function normalizeThreadFiles(rawPayload: any): ThreadFile[] {
  const payload = unwrap(rawPayload);
  const raw = payload?.raw_thread_file;
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map((f: any) => ({
    source: (f.source ?? 'email') as BriefSource,
    filename: f.filename ?? null,
    mime_type: f.mime_type ?? 'text/markdown',
    content: f.content ?? f.content_email ?? null
  }));
}

// Full entry for rendering, with the base64 attachments stripped out: the thread
// view only needs to know which files exist (to show the download buttons), and
// the bytes are fetched on demand from /api/project-brief/[jobId].
export function renderableEntry(entry: any) {
  const payload = unwrap(entry.result_payload);
  const files = normalizeThreadFiles(entry.result_payload);
  const stripped = files.map((f) => ({ ...f, content: null }));

  return {
    ...summarizeEntry(entry),
    result_payload:
      entry.result_payload == null
        ? null
        : { ...payload, raw_thread_file: stripped.length ? stripped : undefined },
    has_thread_file: files.some((f) => Boolean(f.content)),
    thread_files: stripped
  };
}
