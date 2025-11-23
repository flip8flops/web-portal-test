-- Fix RLS for test.note_summaries table
-- Run this in your Supabase SQL Editor

-- Step 1: Enable RLS on the table
ALTER TABLE test.note_summaries ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing policies if they exist (to recreate them cleanly)
DROP POLICY IF EXISTS "Users can view own summaries" ON test.note_summaries;
DROP POLICY IF EXISTS "Users can insert own summaries" ON test.note_summaries;
DROP POLICY IF EXISTS "Users can update own summaries" ON test.note_summaries;

-- Step 3: Create RLS policies
CREATE POLICY "Users can view own summaries"
  ON test.note_summaries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own summaries"
  ON test.note_summaries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own summaries"
  ON test.note_summaries FOR UPDATE
  USING (auth.uid() = user_id);

-- Step 4: Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'test' AND tablename = 'note_summaries';

-- Step 5: Verify policies exist
SELECT policyname, cmd, qual, with_check
FROM pg_policies 
WHERE schemaname = 'test' AND tablename = 'note_summaries';

