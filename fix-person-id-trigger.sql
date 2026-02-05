-- Fix the trigger function that references persons_id instead of person_id
-- Run this in your Supabase SQL Editor

-- Drop and recreate the function with correct column name
CREATE OR REPLACE FUNCTION autofill_order_fields_from_project()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if project_id is provided
  IF NEW.project_id IS NOT NULL THEN
    -- Fetch person_id from projects table (NOTE: changed from persons_id to person_id)
    SELECT p.person_id
    INTO NEW.person_id
    FROM projects p
    WHERE p.project_id = NEW.project_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trg_autofill_person_id ON orders;
CREATE TRIGGER trg_autofill_person_id
  BEFORE INSERT OR UPDATE OF project_id
  ON orders
  FOR EACH ROW
  EXECUTE FUNCTION autofill_order_fields_from_project();
