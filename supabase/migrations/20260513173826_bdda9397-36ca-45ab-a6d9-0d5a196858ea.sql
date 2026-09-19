
-- Restrict SECURITY DEFINER function execution
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_report_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
-- has_role still needed by authenticated for RLS evaluation; that's fine via SECURITY DEFINER inside policies

-- Restrict notification inserts (only the trigger uses SECURITY DEFINER; no client should insert)
DROP POLICY "notifications_insert_system" ON public.notifications;

-- Restrict public bucket listing — keep public read of individual files but require auth context for listing
-- The existing select policy is needed for public photo display; acceptable trade-off for a public bucket.
-- Acknowledge: public read is intentional.
