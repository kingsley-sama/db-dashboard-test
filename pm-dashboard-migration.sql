-- PM Dashboard migration: add missing columns to orders table
-- Run this in the Supabase SQL editor

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pm_type TEXT,
  ADD COLUMN IF NOT EXISTS supplier_payment TEXT,
  ADD COLUMN IF NOT EXISTS date_project_end DATE,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS customer_type TEXT;
