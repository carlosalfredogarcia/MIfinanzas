-- ─────────────────────────────────────────────────────────────────────────
-- Migración: el límite de importación lo controla el servidor
-- Ejecutar UNA vez en el SQL Editor de Supabase (https://supabase.com/dashboard)
-- No borra ni cambia datos existentes.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Columna del límite base (si ya existe, no hace nada)
ALTER TABLE perfil ADD COLUMN IF NOT EXISTS limite_importacion INTEGER;

-- 2. Los usuarios no pueden darse premium, códigos ni más límite desde la app.
--    Solo el servidor (clave service_role) o tú desde el panel de Supabase.
CREATE OR REPLACE FUNCTION public.proteger_perfil_premium() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  rol text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '');
BEGIN
  IF rol NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.premium, false)
       OR coalesce(NEW.codigos_usados::text, '') NOT IN ('', '{}', '[]')
       OR coalesce(NEW.limite_importacion, 200) > 200 THEN
      RAISE EXCEPTION 'No permitido';
    END IF;
  ELSIF NEW.premium IS DISTINCT FROM OLD.premium
     OR NEW.codigos_usados IS DISTINCT FROM OLD.codigos_usados
     OR NEW.limite_importacion IS DISTINCT FROM OLD.limite_importacion THEN
    RAISE EXCEPTION 'No permitido';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS proteger_perfil_premium ON perfil;
CREATE TRIGGER proteger_perfil_premium
  BEFORE INSERT OR UPDATE ON perfil
  FOR EACH ROW EXECUTE FUNCTION public.proteger_perfil_premium();

-- 3. Registro de análisis con IA (máximo 20 al día por usuario).
--    Con RLS y sin políticas: los usuarios no pueden leerla ni escribirla.
CREATE TABLE IF NOT EXISTS public.import_uso (
  id         BIGSERIAL PRIMARY KEY,
  usuario_id UUID NOT NULL,
  filas      INTEGER NOT NULL DEFAULT 0,
  creado     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.import_uso ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_import_uso ON public.import_uso (usuario_id, creado);

-- ─────────────────────────────────────────────────────────────────────────
-- Comprobación: todas estas tablas deben salir con rowsecurity = true.
-- Si alguna sale false, cualquier usuario podría leer los datos de otro.
-- ─────────────────────────────────────────────────────────────────────────
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
