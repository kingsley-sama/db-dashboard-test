-- Add an upsell sequence suffix (-up_N) to upsell orders, mirroring the
-- existing variation logic (orders_set_variation_number / -va_N).
-- Run this in your Supabase SQL Editor.
--
-- N is this order's position among the project's upsell orders for the SAME
-- product (1-based) -- i.e. the number of similar upsell orders. This keeps
-- the product abbreviation built by orders_set_order_id (e.g. PROJ-ABBR) and
-- only appends the -up_N suffix, so two identical upsells become
-- PROJ-ABBR-up_1 and PROJ-ABBR-up_2 instead of colliding on PROJ-ABBR.
--
-- Ordering note: BEFORE triggers fire alphabetically by trigger name.
--   trg_orders_set_order_id     -> builds the base order_id (project_id + product abbreviation)
--   trg_orders_set_upsell_number -> appends -up_N   (runs after, since "order_id" < "upsell_number")
-- This matches how trg_orders_set_variation_number already works.

CREATE OR REPLACE FUNCTION public.orders_set_upsell_number()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
  declare
    v_seq  integer;
    v_base text;
  begin
    -- Only act on upsell orders; everything else is left to orders_set_order_id()
    if NEW.product_type is distinct from 'Upsell'::public.product_type then
      return NEW;
    end if;

    -- Strip any existing -up_N so UPDATEs stay idempotent
    v_base := regexp_replace(coalesce(NEW.order_id, ''), '[-_ ]?up_[0-9]+$', '');

    -- This order's position among the project's upsell orders for the SAME
    -- product (1-based) -- "the number of similar orders"
    select count(*) + 1
      into v_seq
    from public.orders o
    where o.project_id   = NEW.project_id
      and o.product_type = 'Upsell'::public.product_type
      and o.product_name is not distinct from NEW.product_name
      and o.id           < NEW.id;          -- id exists in BEFORE INSERT (identity)

    NEW.order_id := v_base || '-up_' || v_seq;
    return NEW;
  end;
  $function$;

DROP TRIGGER IF EXISTS trg_orders_set_upsell_number ON public.orders;
CREATE TRIGGER trg_orders_set_upsell_number
  BEFORE INSERT OR UPDATE
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION orders_set_upsell_number();
