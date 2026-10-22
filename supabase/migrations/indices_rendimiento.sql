-- ─────────────────────────────────────────────────────────────────────────
-- Índices para que la app siga rápida con muchos usuarios y movimientos.
-- Solo añaden índices (no cambian tablas ni datos). Se pueden ejecutar varias veces.
-- Ejecutar en el SQL Editor de Supabase (https://supabase.com/dashboard)
-- ─────────────────────────────────────────────────────────────────────────

-- Casi todas las pantallas piden «los movimientos de este usuario entre estas fechas»
CREATE INDEX IF NOT EXISTS idx_gastos_usuario_fecha   ON gastos   (usuario_id, fecha);
CREATE INDEX IF NOT EXISTS idx_ingresos_usuario_fecha ON ingresos (usuario_id, fecha);

-- Gastos fijos activos en un rango de meses
CREATE INDEX IF NOT EXISTS idx_fijos_usuario_inicio ON gastos_fijos (usuario_id, fecha_inicio);

-- Búsquedas por usuario en el resto de tablas
CREATE INDEX IF NOT EXISTS idx_perfil_usuario    ON perfil    (usuario_id);
CREATE INDEX IF NOT EXISTS idx_metas_usuario     ON metas     (usuario_id);
CREATE INDEX IF NOT EXISTS idx_prestamos_usuario ON prestamos (usuario_id);
