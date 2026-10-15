-- ─────────────────────────────────────────────────────────────────────────
-- Migración: columna es_fijo en categoria_tipo
-- Ejecutar en el SQL Editor de Supabase (https://supabase.com/dashboard)
-- ─────────────────────────────────────────────────────────────────────────

-- Añade es_fijo a categoria_tipo.
-- true  = gasto fijo/recurrente (alquiler, suscripciones…)
-- false = gasto variable (valor por defecto)
ALTER TABLE categoria_tipo
  ADD COLUMN IF NOT EXISTS es_fijo BOOLEAN NOT NULL DEFAULT false;
