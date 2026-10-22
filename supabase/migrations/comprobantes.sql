-- ─────────────────────────────────────────────────────────────────────────
-- Comprobantes de pago en Préstamos (fotos o PDF de transferencias, Bizum…).
-- Crea un espacio PRIVADO de archivos «comprobantes»: cada usuario solo puede ver,
-- subir y borrar los suyos (carpeta con su id). No cambia ninguna tabla.
-- Ejecutar en el SQL Editor de Supabase. Se puede ejecutar varias veces.
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('comprobantes', 'comprobantes', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "comprobantes: ver los míos" ON storage.objects;
DROP POLICY IF EXISTS "comprobantes: subir los míos" ON storage.objects;
DROP POLICY IF EXISTS "comprobantes: cambiar los míos" ON storage.objects;
DROP POLICY IF EXISTS "comprobantes: borrar los míos" ON storage.objects;

CREATE POLICY "comprobantes: ver los míos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "comprobantes: subir los míos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "comprobantes: cambiar los míos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "comprobantes: borrar los míos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = auth.uid()::text);
