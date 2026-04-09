-- ============================================================
-- Fix after DROP TABLE projects CASCADE + recreate
-- Run this in your Supabase SQL Editor (production)
-- ============================================================

-- STEP 1: Check which constraints currently exist on orders
-- (run this first to see what's missing)
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.orders'::regclass
ORDER BY contype;

-- STEP 2: Re-add the FK from orders → projects if it's missing
-- (safe to run even if it already exists due to the IF NOT EXISTS guard)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_project_id_fkey'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_project_id_fkey
        FOREIGN KEY (project_id)
        REFERENCES public.projects (project_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE;
    RAISE NOTICE 'FK orders_project_id_fkey was MISSING and has been re-added.';
  ELSE
    RAISE NOTICE 'FK orders_project_id_fkey already exists — no action needed.';
  END IF;
END;
$$;

-- STEP 3: Re-create the autofill trigger function (correct column name: person_id)
CREATE OR REPLACE FUNCTION autofill_order_fields_from_project()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT p.person_id
    INTO NEW.person_id
    FROM projects p
    WHERE p.project_id = NEW.project_id;
    -- If project not found, person_id stays NULL (no exception raised)
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 4: Ensure the autofill trigger exists on orders
DROP TRIGGER IF EXISTS trg_autofill_person_id ON public.orders;
CREATE TRIGGER trg_autofill_person_id
  BEFORE INSERT OR UPDATE OF project_id
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION autofill_order_fields_from_project();

-- STEP 5: Re-create orders_set_pm_from_project trigger function
-- This replaces any old version that may have been doing RAISE EXCEPTION
CREATE OR REPLACE FUNCTION orders_set_pm_from_project()
RETURNS TRIGGER AS $$
DECLARE
  v_pm text;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT p.project_manager
    INTO v_pm
    FROM projects p
    WHERE p.project_id = NEW.project_id;
    -- Only set PM if a matching project was found
    IF FOUND THEN
      NEW."PM" := v_pm::public.project_manager;
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block an order insert due to a PM lookup failure
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 6: Confirm triggers still exist on orders
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.orders'::regclass
ORDER BY tgname;

-- STEP 7: Quick sanity check — verify a known project_id is visible
-- Replace 'YOUR-PROJECT-ID-HERE' with the one the PM tried to use
-- SELECT project_id, project_name FROM public.projects WHERE project_id = 'YOUR-PROJECT-ID-HERE';
