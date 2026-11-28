ALTER TABLE public.holds
    ADD COLUMN IF NOT EXISTS sandbox_ticket text;