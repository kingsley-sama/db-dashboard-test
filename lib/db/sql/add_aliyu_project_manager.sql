-- Adds 'Aliyu' to the project_manager enum.
-- This enum backs both projects.project_manager and orders."PM".
-- Orders never set "PM" directly — trg_orders_set_pm_from_project copies it
-- from the parent project — so adding the label here is all that's needed.
ALTER TYPE public.project_manager ADD VALUE IF NOT EXISTS 'Aliyu';

-- Verify:
-- select enumlabel from pg_enum e
-- join pg_type t on t.oid = e.enumtypid
-- where t.typname = 'project_manager' order by e.enumsortorder;
