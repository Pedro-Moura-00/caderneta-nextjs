# Caderneta do Bar (Next.js + PostgreSQL)

Sistema de **fiado** para bar, portado da versão PHP/CodeIgniter (`C:\Bar_will`):

- **Clientes e contas**: anota o que cada cliente consumiu, recebe pagamentos (parciais ou totais) e mostra quem está devendo.
- **Vendas à vista**: registra o que foi pago na hora, com cancelamento.
- **Produtos e categorias**: cardápio com preços; mudar um preço não altera o que já foi lançado.
- **Relatórios**: caixa e vendas por dia, semana, mês, ano ou período, com exportação CSV.

Nada financeiro é apagado: pagamento errado é **estornado** e venda à vista é **cancelada**, com data e motivo.

## Login

Cada pessoa entra com login e senha próprios; vendas, pagamentos, cancelamentos e estornos
guardam quem fez. No primeiro acesso, a tela pede o **código de instalação** (variável
`CODIGO_INSTALACAO` no servidor) para criar o administrador, que depois cadastra os outros em
**Usuários**. Cinco senhas erradas seguidas bloqueiam o login por 10 minutos; o administrador
pode definir uma senha nova para quem esqueceu.

## Publicar na internet (Vercel + Neon)

1. Crie uma conta em <https://vercel.com> entrando com o GitHub.
2. **Add New → Project**, importe o repositório `caderneta-nextjs` e, antes de publicar, abra
   **Environment Variables** e adicione:
   - `CODIGO_INSTALACAO`: um código só seu (usado uma vez, para criar o administrador)
   - `BAR_NOME`: `Bar do Will`
3. Depois de criado o projeto: **Storage → Create Database → Neon** (Postgres gratuito), ligado
   ao projeto. Isso cria a variável `DATABASE_URL` sozinho.
4. **Deployments → Redeploy**. O build cria as tabelas (`vercel.json`) e o site fica no ar em
   `https://<projeto>.vercel.app`.
5. Abra o site, informe o código de instalação e crie o administrador.

A cada `git push` para o GitHub, a Vercel publica a versão nova sozinha.

## Rodar com Docker (recomendado)

Só precisa do Docker Desktop. Na pasta do projeto:

```bash
docker compose up -d --build
```

Abre em <http://localhost:8080>. O banco é criado/atualizado sozinho ao ligar.
Para desligar: `docker compose down` (os dados ficam no volume `pg_data`).

Ajustes da máquina ficam num arquivo `.env` na pasta do projeto (fora do git), por exemplo:

```ini
BAR_NOME=Bar do Will
PORTA=8080
BAR_SEED=1
CODIGO_INSTALACAO=um-codigo-so-seu
```

`BAR_SEED=1` cria dados de exemplo na primeira vez (só com o banco vazio).

## Notebook do bar: instalar uma vez e receber atualizações

As atualizações saem do computador de desenvolvimento pelo GitHub: lá você faz o commit e roda `git push`;
o notebook confere o GitHub a cada 15 minutos e, se houver versão nova, faz backup do banco,
baixa o código e reconstrói o container. Os dados nunca são apagados.

No notebook (uma vez só):

1. Instale o **Docker Desktop** (em Settings → General, marque *Start Docker Desktop when you sign in*)
   e o **Git** (<https://git-scm.com/download/win>).
2. No Prompt de Comando:

   ```bat
   cd C:\
   git clone https://github.com/Pedro-Moura-00/caderneta-nextjs.git caderneta
   cd C:\caderneta
   docker compose up -d --build
   ```

   O repositório é público: não precisa entrar na conta do GitHub no notebook.
3. Clique duas vezes em `windows\ativar-atualizacao-automatica.bat`.

Daí em diante:

- `windows\atualizar-caderneta.bat` atualiza na hora, sem esperar os 15 minutos.
- `windows\desativar-atualizacao-automatica.bat` desliga a atualização automática.
- O registro fica em `logs\atualizacao.log` e os backups (os 30 mais recentes) em `backups\`.
- Outros aparelhos na mesma rede abrem `http://IP-DO-NOTEBOOK:8080`.

Backup manual do banco:

```bat
docker compose exec -T db pg_dump -U bar_will -f /tmp/backup.sql bar_will
docker compose cp db:/tmp/backup.sql backup.sql
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
