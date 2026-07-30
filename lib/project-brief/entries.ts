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

export interface BriefEntry {
  job_id: string;
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

// Full entry for rendering, with the base64 attachment stripped out: the thread
// view only needs to know a file exists (to show the download button), and the
// bytes are fetched on demand from /api/project-brief/[jobId].
export function renderableEntry(entry: any) {
  const payload = unwrap(entry.result_payload);
  const file = payload.raw_thread_file;
  const result_payload =
    entry.result_payload == null
      ? null
      : {
          ...payload,
          raw_thread_file: file
            ? { filename: file.filename, mime_type: file.mime_type, content: null }
            : undefined
        };

  return {
    ...summarizeEntry(entry),
    result_payload,
    has_thread_file: Boolean(file?.content)
  };
}
