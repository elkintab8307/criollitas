# print-bridge

> **Sin uso desde CLAUDE.md §10 (impresión por USB local):** la app ahora imprime
> abriendo el diálogo nativo del navegador contra una impresora USB instalada en
> Windows (`PRINTER_CRIOLLITAS`, puerto `USB001`) -- no necesita este servicio.
> Se conserva por si el local llega a usar una impresora de red en el futuro.

Servicio local que recibe tickets desde Criollitas OS y los envía a la impresora térmica de red del local. Corre en el PC de caja, no en la nube — ver `docs/superpowers/specs/2026-07-15-print-bridge-red-design.md` para el diseño completo.

## Uso en el PC de caja (sin instalar nada técnico)

1. Copia `print-bridge.exe` y `config.example.env` a una carpeta en el PC de caja.
2. Renombra `config.example.env` a `.env` y edítalo con Bloc de notas:
   - `PRINT_BRIDGE_TOKEN`: cualquier texto secreto, debe ser igual al que se configure en `NEXT_PUBLIC_PRINT_BRIDGE_TOKEN` de la app.
   - `PRINTER_IP`: la IP de la impresora en la red del local (fija o reservada en el router, para que no cambie).
   - `PRINTER_PORT`: `9100` salvo que el manual de la impresora diga otro.
   - `PUERTO`: déjalo en `7070` salvo que ya esté ocupado por otra cosa.
3. Doble clic en `print-bridge.exe`. Debe mostrar "print-bridge escuchando en http://localhost:7070".
4. Para probar que funciona, abre esa misma dirección (`http://localhost:7070/salud`) en el navegador del PC de caja — debe mostrar `{"ok":true}`.

**Para que arranque solo al encender el PC** (opcional): crea un acceso directo a `print-bridge.exe` y ponlo en la carpeta de inicio de Windows (`Win+R`, escribe `shell:startup`, Enter, pega el acceso directo ahí).

## Desarrollo

```bash
pnpm install
cp config.example.env .env   # y edítalo
pnpm dev                     # corre con recarga automática
pnpm test                    # unitarios
pnpm build                   # compila a dist/
pnpm package                 # genera print-bridge.exe
```
