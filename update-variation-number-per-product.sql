-- Make the variation sequence suffix (-va_N) count per PRODUCT instead of
-- per project, matching the upsell logic (add-upsell-number-trigger.sql).
-- Run this in your Supabase SQL Editor.
--
-- N is this order's position among the project's variation orders for the SAME
-- product (1-based) -- i.e. the number of similar variation orders. The product
-- abbreviation built by orders_set_order_id (e.g. PROJ-ABBR) is preserved; only
-- the -va_N suffix is appended, so two identical variations become
-- PROJ-ABBR-va_1 and PROJ-ABBR-va_2 instead of colliding on PROJ-ABBR.
--
-- This only redefines the function; the existing trg_orders_set_variation_number
-- trigger keeps pointing at it.

CREATE OR REPLACE FUNCTION public.orders_set_variation_number()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
  declare
    v_seq  integer;
    v_base text;
  begin
    -- Only act on variation orders; non-variations are left to orders_set_order_id()
    if NEW.product_type is distinct from 'Variation'::public.product_type then
      return NEW;
    end if;

    -- Strip any existing -va_N so UPDATEs stay idempotent
    v_base := regexp_replace(coalesce(NEW.order_id, ''), '[-_ ]?va_[0-9]+$', '');

    -- This order's position among the project's variation orders for the SAME
    -- product (1-based) -- "the number of similar orders"
    select count(*) + 1
      into v_seq
    from public.orders o
    where o.project_id   = NEW.project_id
      and o.product_type = 'Variation'::public.product_type
      and o.product_name is not distinct from NEW.product_name
      and o.id           < NEW.id;          -- id exists in BEFORE INSERT (identity)

    NEW.order_id := v_base || '-va_' || v_seq;
    return NEW;
  end;
  $function$;
