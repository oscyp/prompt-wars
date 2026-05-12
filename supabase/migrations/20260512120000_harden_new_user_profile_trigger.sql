-- Harden auth signup profile creation.
-- Supabase Auth surfaces trigger failures as "Database error saving new user",
-- so keep this trigger deterministic and independent of caller search_path.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  generated_username TEXT;
  generated_display_name TEXT;
BEGIN
  generated_username := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 15);
  generated_display_name := left(
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'display_name'), ''), 'Player'),
    40
  );

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, generated_username, generated_display_name)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();