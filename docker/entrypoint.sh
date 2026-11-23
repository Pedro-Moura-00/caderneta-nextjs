#!/bin/sh
# Atualiza o banco (idempotente) e liga a Caderneta.
set -e

node scripts/migrate.mjs

# BAR_SEED=1 cria dados de exemplo (só se o banco ainda não tiver clientes)
if [ "$BAR_SEED" = "1" ]; then
    node scripts/seed.mjs || true
fi

exec node server.js
