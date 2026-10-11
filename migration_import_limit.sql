-- ─────────────────────────────────────────────────────────────────────────
-- Migración: sistema de límite de importación (versión gratuita)
-- Ejecutar en el SQL Editor de Supabase (https://supabase.com/dashboard)
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Columna 'origen' en gastos
--    Valor por defecto 'manual'; la importación CSV guarda 'importado'.
ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'manual';

-- 2. Columna 'origen' en ingresos (mismo criterio)
ALTER TABLE ingresos
  ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'manual';

-- 3. Columna 'premium' en perfil
--    false = versión gratuita (límite 200 importados)
--    true  = sin límite
ALTER TABLE perfil
  ADD COLUMN IF NOT EXISTS premium BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────
-- Opcional: índice para acelerar el conteo de importados por usuario
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gastos_origen   ON gastos   (usuario_id, origen);
CREATE INDEX IF NOT EXISTS idx_ingresos_origen ON ingresos (usuario_id, origen);
