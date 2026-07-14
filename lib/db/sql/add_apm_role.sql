-- Adds the 'apm' role (associate PM — restricted access) to the user_role enum.
-- APMs cannot access the Security, Teams, All Orders or Projects modules,
-- completed projects (or their orders), or the CSV export feature.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'apm';
