-- Impresión por USB (CLAUDE.md §10): la tirilla ahora se imprime abriendo el
-- diálogo nativo del navegador sobre un documento HTML, no enviando bytes
-- ESC/POS a un print-bridge en la LAN. `contenido_escpos` se conserva para
-- no perder el historial de tirillas ya impresas antes de este cambio, pero
-- deja de ser obligatoria; las filas nuevas usan `contenido_html`.
alter table public.impresiones
  add column contenido_html text,
  alter column contenido_escpos drop not null;
