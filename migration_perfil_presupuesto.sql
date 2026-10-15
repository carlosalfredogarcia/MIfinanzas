-- ─────────────────────────────────────────────────────────────────────────
-- Migración: columna perfil_presupuesto en perfil
-- Ejecutar en el SQL Editor de Supabase (https://supabase.com/dashboard)
-- ─────────────────────────────────────────────────────────────────────────

-- Añade el perfil de presupuesto seleccionado por el usuario.
-- Valores: 'basico' | 'equilibrado' | 'ahorrador' | 'personalizado'
ALTER TABLE perfil
  ADD COLUMN IF NOT EXISTS perfil_presupuesto TEXT NOT NULL DEFAULT 'personalizado';
