# Caderneta do Bar (Next.js + PostgreSQL)

Sistema de **fiado** para bar, portado da versão PHP/CodeIgniter (`C:\Bar_will`):

- **Clientes e contas**: anota o que cada cliente consumiu, recebe pagamentos (parciais ou totais) e mostra quem está devendo.
- **Vendas à vista**: registra o que foi pago na hora, com cancelamento.
- **Produtos e categorias**: cardápio com preços; mudar um preço não altera o que já foi lançado.
- **Relatórios**: caixa e vendas por dia, semana, mês, ano ou período, com exportação CSV.

Nada financeiro é apagado: pagamento errado é **estornado** e venda à vista é **cancelada**, com data e motivo.

## Rodar com Docker (recomendado)

Só precisa do Docker Desktop. Na pasta do projeto:

```bash
docker compose up -d --build
```

Abre em <http://localhost:8080>. O banco é criado/atualizado sozinho ao ligar.
Para começar com dados de exemplo, troque `BAR_SEED: "0"` por `"1"` no `docker-compose.yml`
antes de subir pela primeira vez. Para desligar: `docker compose down` (os dados ficam no volume `pg_data`).

Backup do banco:

```bash
docker compose exec db pg_dump -U bar_will bar_will > backup.sql
```

## Rodar para desenvolver

Requisitos: Node 22+ e Docker Desktop (ou outro PostgreSQL 14+).

```bash
npm install
cp .env.example .env.local   # no Windows: copy .env.example .env.local
docker compose up -d db      # sobe só o Postgres
npm run db:migrate           # cria as tabelas (pode rodar de novo sem problema)
npm run db:seed              # opcional: dados de exemplo (só com o banco vazio)
npm run dev                  # http://localhost:3000
```

Produção: `npm run build` e `npm start`.

## Organização

| Onde | O quê |
|---|---|
| `app/` | telas (`page.tsx`) e a exportação CSV (`relatorios/exportar/route.ts`) |
| `lib/acoes.ts` | Server Actions chamadas pelos formulários (validação + aviso) |
| `lib/servicos.ts` | regras de negócio com transação (venda, pagamento, estorno, cancelamento) |
| `lib/dados.ts` | consultas das telas e do relatório |
| `lib/db.ts` | conexão (`pg`), transações e proteção contra envio duplicado |
| `lib/config.ts` | formas de pagamento, cores, limites |
| `components/` | ícones, modais, avisos e formulários |
| `db/schema.sql` | esquema do banco |

Datas são gravadas como `timestamptz` e sempre exibidas/agrupadas no fuso `America/Sao_Paulo`.
O nome no topo vem de `BAR_NOME` no `.env.local`.
