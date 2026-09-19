
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS video_url text;

CREATE TABLE IF NOT EXISTS public.report_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, user_id)
);

CREATE INDEX IF NOT EXISTS report_votes_report_id_idx ON public.report_votes(report_id);

ALTER TABLE public.report_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "votes_select_authenticated" ON public.report_votes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "votes_insert_self" ON public.report_votes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "votes_delete_self" ON public.report_votes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
