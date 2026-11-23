/*
# Add quiz max score, exam max score, and student enrollment date

## Changes
1. `session_reports` — add `quiz_max_score` (integer, default 100): lets teachers set
   a custom maximum score for the quiz column per session (e.g. out of 10, 20, 50).
2. `exams` — add `max_score` (integer, default 100): custom maximum score for exams.
3. `students` — add `enrollment_date` (date, default CURRENT_DATE): tracks when a
   student was enrolled in the academy.

## Security
- No RLS policy changes needed; existing policies cover the new columns.
- New columns are safe defaults, no data loss.
*/

ALTER TABLE public.session_reports
  ADD COLUMN IF NOT EXISTS quiz_max_score integer NOT NULL DEFAULT 100;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS max_score integer NOT NULL DEFAULT 100;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS enrollment_date date NOT NULL DEFAULT CURRENT_DATE;
