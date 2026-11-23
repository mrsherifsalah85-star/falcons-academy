/*
# Convert Dictation from text ratings to numeric scores

## Changes
1. `session_reports` — add `dictation_max_score` (integer, NOT NULL, default 10):
   lets teachers set the maximum dictation score per session, mirroring
   `quiz_max_score`. Existing reports default to 10, so legacy data reads
   sensibly (e.g. a score of 9 displays as "9/10").
2. `evaluations` — convert the `dictation` column from text to integer:
   - Legacy text ratings are mapped to scores on the default 0–10 scale:
     'Super' -> 10, 'Some Mistakes' -> 5, 'Not Studied' -> 0.
   - Any value that is already numeric text (e.g. '9') is converted to that
     number. Unrecognized values become NULL rather than failing.
   - The old check constraint limiting dictation to the three text ratings
     ('Super', 'Some Mistakes', 'Not Studied') is replaced with a new check
     that allows any whole number between 0 and 1000, or NULL.

## Data Safety
- No rows or columns are dropped. Every legacy text value is mapped to a
  numeric equivalent so no evaluation history is lost.

## Security
- No RLS policy changes needed; existing policies cover the new column.
- Grants are unchanged; the new column is covered by the table grants.
*/

ALTER TABLE public.session_reports
  ADD COLUMN IF NOT EXISTS dictation_max_score integer NOT NULL DEFAULT 10;

ALTER TABLE public.evaluations
  DROP CONSTRAINT IF EXISTS evaluations_dictation_check;

UPDATE public.evaluations
SET dictation = CASE dictation
  WHEN 'Super' THEN '10'
  WHEN 'Some Mistakes' THEN '5'
  WHEN 'Not Studied' THEN '0'
  ELSE dictation
END
WHERE dictation IS NOT NULL;

ALTER TABLE public.evaluations
  ALTER COLUMN dictation TYPE integer
  USING CASE
    WHEN dictation IS NULL THEN NULL
    WHEN dictation ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' THEN round(dictation::numeric)::int
    ELSE NULL
  END;

ALTER TABLE public.evaluations
  ADD CONSTRAINT evaluations_dictation_check
  CHECK (dictation IS NULL OR (dictation >= 0 AND dictation <= 1000));
