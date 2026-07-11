# Criollitas OS

POS interno de comandas y caja para **Criollitas — Arepas Rellenas, Sabores
de Tradición** (sede Armenia, Quindío). No es facturación electrónica DIAN:
gestiona toma de pedidos, cocina (KDS en tiempo real), cobro con impresión de
tirilla ESC/POS, turnos de caja y reportes, sobre una base de datos
multi-sede compartida por Vendedora, Cajera y Administrador.

## Requisitos

- Node ≥ 20 LTS
- `pnpm` como package manager

## Comandos básicos

```bash
pnpm install     # instalar dependencias
pnpm dev         # levantar Next.js en :3000
pnpm test        # unitarios (vitest)
pnpm build       # build de producción
pnpm lint        # eslint
```

## Documentación

La fuente única de verdad de este proyecto —negocio, stack, modelo de
datos, sistema de diseño, RLS y guardarraíles— es
[`CLAUDE.md`](./CLAUDE.md). Léelo antes de proponer cambios estructurales.
