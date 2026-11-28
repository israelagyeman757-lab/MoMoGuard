-- MoMoGuard Walo (ytukecpastecnvlikait): community reports + moderation.
-- Apply via Supabase connector (do not run from CI). Server-side access only:
-- the controller uses SUPABASE_SERVICE_ROLE_KEY; no anon/authenticated policies.
-- RLS is enabled so direct browser/client access is denied unless a policy is added later.

-- ---------------------------------------------------------------------------
-- community_reports — same shape as GlancePlug report rows + moderation state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ts timestamptz NOT NULL,
    report_day date NOT NULL,
    reporter_id_hash text NOT NULL,
    number text NOT NULL,
    trick text NOT NULL,
    description text NOT NULL DEFAULT '',
    community text NOT NULL DEFAULT '',
    incident_time text NOT NULL DEFAULT '',
    claimed_identity text NOT NULL DEFAULT '',
    request_type text NOT NULL DEFAULT '',
    lost_money boolean,
    channel text NOT NULL DEFAULT '',
    verification_state text NOT NULL DEFAULT 'unverified',
    moderation_status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT community_reports_dedupe
        UNIQUE (number, reporter_id_hash, report_day)
);

CREATE INDEX IF NOT EXISTS idx_community_reports_number
    ON public.community_reports (number);
CREATE INDEX IF NOT EXISTS idx_community_reports_moderation
    ON public.community_reports (moderation_status, ts DESC);

ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- community_warnings — published moderator-approved warnings (stretch UI)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_warnings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id uuid REFERENCES public.community_reports (id) ON DELETE SET NULL,
    number text NOT NULL,
    headline text NOT NULL,
    body_text text NOT NULL DEFAULT '',
    moderation_status text NOT NULL DEFAULT 'draft',
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT community_warnings_status_chk
        CHECK (moderation_status IN ('draft', 'published', 'withdrawn'))
);

CREATE INDEX IF NOT EXISTS idx_community_warnings_published_number
    ON public.community_warnings (number)
    WHERE moderation_status = 'published';

ALTER TABLE public.community_warnings ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: only service_role (bypasses RLS) may read/write.