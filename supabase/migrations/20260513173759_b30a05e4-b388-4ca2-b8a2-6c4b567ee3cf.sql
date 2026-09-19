
-- Roles enum + table (security best practice: separate from profiles)
CREATE TYPE public.app_role AS ENUM ('admin', 'student');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Security definer to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Categories enum
CREATE TYPE public.report_category AS ENUM ('wifi', 'plumbing', 'lights', 'furniture', 'hvac', 'other');
CREATE TYPE public.report_status AS ENUM ('pending', 'in_progress', 'fixed');

CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category public.report_category NOT NULL,
  status public.report_status NOT NULL DEFAULT 'pending',
  photo_url TEXT,
  location_name TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_user ON public.reports(user_id);
CREATE INDEX idx_reports_status ON public.reports(status);
CREATE INDEX idx_reports_created ON public.reports(created_at DESC);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, read);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: public read (for leaderboard), self update
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Roles: users see own, admins manage
CREATE POLICY "roles_select_self_or_admin" ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_all" ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Reports
CREATE POLICY "reports_select_authenticated" ON public.reports FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "reports_insert_self" ON public.reports FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reports_update_owner_or_admin" ON public.reports FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "reports_delete_owner_or_admin" ON public.reports FOR DELETE
  TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Notifications: own only
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "notifications_insert_system" ON public.notifications FOR INSERT WITH CHECK (true);

-- Auto-create profile + default student role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Notify on report status change
CREATE OR REPLACE FUNCTION public.notify_report_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (user_id, report_id, title, message)
    VALUES (
      NEW.user_id,
      NEW.id,
      'Report update: ' || NEW.title,
      'Your report is now ' || REPLACE(NEW.status::text, '_', ' ') || '.'
    );
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_report_update
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_report_status_change();

-- Storage bucket for photos
INSERT INTO storage.buckets (id, name, public) VALUES ('report-photos', 'report-photos', true);

CREATE POLICY "report_photos_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'report-photos');
CREATE POLICY "report_photos_auth_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'report-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "report_photos_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'report-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
