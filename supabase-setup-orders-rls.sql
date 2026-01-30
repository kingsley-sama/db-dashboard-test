-- Enable Row Level Security on the orders table
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "orders_select_policy" ON orders;
DROP POLICY IF EXISTS "orders_insert_policy" ON orders;
DROP POLICY IF EXISTS "orders_update_policy" ON orders;
DROP POLICY IF EXISTS "orders_delete_policy" ON orders;

-- 1. SELECT Policy: Allow authenticated users to read all orders
CREATE POLICY "orders_select_policy"
ON "public"."orders"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

-- 2. INSERT Policy: Allow authenticated users to insert orders
CREATE POLICY "orders_insert_policy"
ON "public"."orders"
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 3. UPDATE Policy: Allow authenticated users to update orders
CREATE POLICY "orders_update_policy"
ON "public"."orders"
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. DELETE Policy: Allow authenticated users to delete orders
CREATE POLICY "orders_delete_policy"
ON "public"."orders"
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (true);

-- Grant necessary permissions to authenticated role
GRANT ALL ON orders TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
