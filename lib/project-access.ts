// Who is allowed to act on a single project.
//
// Most of the API scopes by role alone (owner-only writes, no APM access to
// financials or completed projects). The questionnaire handover needs one step
// more: flipping questionnaire_received to 'Yes' starts the intake automation —
// briefs, ClickUp tasks and orders — so it must be limited to the PM who
// actually owns the project, not to any signed-in user.
//
// The link between a user and a project is `projects.project_manager`, a
// public.project_manager enum whose values are first names ('Aliyu', ...),
// matched against `users.name`. That is a heuristic, not a foreign key: it is
// the only association the schema currently carries. Everything depends on this
// one function, so replacing it with a firm mapping (e.g. a `pm_name` column on
// users holding the exact enum value) is a single-file change.

export type ProjectAccessUser = {
  role: string;
  name?: string | null;
};

export type ProjectAccessProject = {
  project_manager?: string | null;
  delivery_completion_date?: string | null;
};

// Roles that manage every project regardless of assignment.
const UNRESTRICTED_ROLES = new Set(['owner', 'admin']);

// Roles scoped to the projects they are named on.
const ASSIGNED_ROLES = new Set(['pm', 'apm']);

// 'Aliyu Bello' matches the enum value 'Aliyu'; 'aliyu' matches 'Aliyu'.
// Comparison is on the first whitespace-separated token, case-insensitively,
// so a surname added to the user record later does not revoke their access.
function namesMatch(userName: string | null | undefined, pmValue: string | null | undefined) {
  if (!userName || !pmValue) return false;

  const normalise = (value: string) => value.trim().toLowerCase();
  const firstToken = (value: string) => normalise(value).split(/\s+/)[0] ?? '';

  const user = normalise(userName);
  const pm = normalise(pmValue);

  return user === pm || firstToken(user) === firstToken(pm);
}

export type ProjectAccess = {
  /** May read the project's intake state. */
  canView: boolean;
  /** May set questionnaire_received and start/retry intake. */
  canManage: boolean;
  /** Why canManage is false — safe to show to the user. */
  reason: string | null;
};

export function getProjectAccess(
  user: ProjectAccessUser,
  project: ProjectAccessProject
): ProjectAccess {
  // Existing rule across the app: APMs have no access to completed projects.
  if (user.role === 'apm' && project.delivery_completion_date) {
    return { canView: false, canManage: false, reason: 'This project is already completed' };
  }

  if (UNRESTRICTED_ROLES.has(user.role)) {
    return { canView: true, canManage: true, reason: null };
  }

  if (!ASSIGNED_ROLES.has(user.role)) {
    // 'member' and anything added to the user_role enum later: read-only until
    // it is deliberately granted management rights here.
    return {
      canView: true,
      canManage: false,
      reason: 'Your role cannot start project intake',
    };
  }

  if (!project.project_manager) {
    return {
      canView: true,
      canManage: false,
      reason: 'This project has no project manager assigned',
    };
  }

  if (!namesMatch(user.name, project.project_manager)) {
    return {
      canView: true,
      canManage: false,
      reason: `Only ${project.project_manager} can start intake for this project`,
    };
  }

  return { canView: true, canManage: true, reason: null };
}
