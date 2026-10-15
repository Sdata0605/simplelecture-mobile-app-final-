-- PYQ Questions: Allow public read access
-- Run this in the Supabase SQL Editor to enable anonymous reads on pyq_questions
-- Required because pyq_questions data is public study material (previous year questions)

CREATE POLICY "Anyone can read pyq_questions"
  ON pyq_questions
  FOR SELECT
  USING (true);
