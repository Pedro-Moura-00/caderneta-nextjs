-- Esquema da Caderneta (PostgreSQL). Idempotente: pode rodar de novo (npm run db:migrate).
-- Datas em timestamptz; dias são sempre calculados no fuso America/Sao_Paulo (ver lib/dados.ts).

CREATE EXTENSION IF NOT EXISTS unaccent;

-- quem usa a Caderneta (senha guardada só como hash scrypt)
CREATE TABLE IF NOT EXISTS usuarios (
    id             serial PRIMARY KEY,
    nome           varchar(80)  NOT NULL,
    login          varchar(40)  NOT NULL UNIQUE,
    senha_hash     text         NOT NULL,
    admin          boolean      NOT NULL DEFAULT false,
    ativo          boolean      NOT NULL DEFAULT true,
    -- tentativas erradas seguidas; ao chegar no limite, o login fica bloqueado por um tempo
    tentativas     integer      NOT NULL DEFAULT 0,
    bloqueado_ate  timestamptz,
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now()
);

-- sessões abertas (o cookie guarda o token; aqui fica só o hash dele)
CREATE TABLE IF NOT EXISTS sessoes (
    token_hash  char(64)    PRIMARY KEY,
    usuario_id  integer     NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    criada_em   timestamptz NOT NULL DEFAULT now(),
    expira_em   timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessoes_usuario ON sessoes (usuario_id);
CREATE INDEX IF NOT EXISTS sessoes_expira  ON sessoes (expira_em);

CREATE TABLE IF NOT EXISTS categorias (
    id          serial PRIMARY KEY,
    nome        varchar(80) NOT NULL,
    cor         varchar(9)  NOT NULL DEFAULT '#C9821A',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS produtos (
    id            serial PRIMARY KEY,
    nome          varchar(120)  NOT NULL,
    preco         numeric(10,2) NOT NULL DEFAULT 0,
    categoria_id  integer REFERENCES categorias (id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS produtos_categoria ON produtos (categoria_id);

CREATE TABLE IF NOT EXISTS clientes (
    id                   serial PRIMARY KEY,
    nome                 varchar(80)  NOT NULL,
    sobrenome            varchar(80)  NOT NULL DEFAULT '',
    telefone             varchar(40)  NOT NULL DEFAULT '',
    endereco             varchar(200),
    telefone2            varchar(40),
    aniversario          varchar(5),
    -- saldo e último movimento são recalculados a cada lançamento (lib/servicos.ts)
    saldo                numeric(10,2) NOT NULL DEFAULT 0,
    ultimo_movimento_em  timestamptz,
    arquivado_em         timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clientes_saldo     ON clientes (saldo);
CREATE INDEX IF NOT EXISTS clientes_ultimo    ON clientes (ultimo_movimento_em);
CREATE INDEX IF NOT EXISTS clientes_arquivado ON clientes (arquivado_em);

-- uma venda por lançamento: fiado (cliente) ou à vista (sem cliente, com pagamento ligado)
CREATE TABLE IF NOT EXISTS vendas (
    id                   serial PRIMARY KEY,
    cliente_id           integer REFERENCES clientes (id) ON DELETE RESTRICT ON UPDATE CASCADE,
    tipo                 varchar(6) NOT NULL CHECK (tipo IN ('fiado', 'avista')),
    em                   timestamptz NOT NULL DEFAULT now(),
    cancelada_em         timestamptz,
    motivo_cancelamento  varchar(200),
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendas_cliente  ON vendas (cliente_id, cancelada_em);
CREATE INDEX IF NOT EXISTS vendas_tipo_em  ON vendas (tipo, em);
CREATE INDEX IF NOT EXISTS vendas_em       ON vendas (em);

-- itens com nome, categoria, cor e preço do momento da venda
CREATE TABLE IF NOT EXISTS venda_itens (
    id          serial PRIMARY KEY,
    venda_id    integer NOT NULL REFERENCES vendas (id) ON DELETE CASCADE ON UPDATE CASCADE,
    produto_id  integer REFERENCES produtos (id) ON DELETE SET NULL ON UPDATE CASCADE,
    nome        varchar(120)  NOT NULL,
    cat_nome    varchar(80),
    cor         varchar(9),
    qtd         integer       NOT NULL CHECK (qtd > 0),
    preco       numeric(10,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS venda_itens_venda   ON venda_itens (venda_id);
CREATE INDEX IF NOT EXISTS venda_itens_produto ON venda_itens (produto_id);

-- recebimentos de fiado (cliente_id) ou da venda à vista (venda_id); estornáveis
CREATE TABLE IF NOT EXISTS pagamentos (
    id              serial PRIMARY KEY,
    cliente_id      integer REFERENCES clientes (id) ON DELETE RESTRICT ON UPDATE CASCADE,
    venda_id        integer REFERENCES vendas (id)   ON DELETE RESTRICT ON UPDATE CASCADE,
    valor           numeric(10,2) NOT NULL,
    forma           varchar(10)   NOT NULL CHECK (forma IN ('dinheiro', 'pix', 'cartao')),
    em              timestamptz   NOT NULL DEFAULT now(),
    estornado_em    timestamptz,
    motivo_estorno  varchar(200),
    created_at      timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pagamentos_cliente ON pagamentos (cliente_id, estornado_em);
CREATE INDEX IF NOT EXISTS pagamentos_venda   ON pagamentos (venda_id);
CREATE INDEX IF NOT EXISTS pagamentos_em      ON pagamentos (em);

-- quem lançou, cancelou ou estornou (NULL nos lançamentos de antes do login existir)
ALTER TABLE vendas     ADD COLUMN IF NOT EXISTS usuario_id    integer REFERENCES usuarios (id) ON DELETE SET NULL;
ALTER TABLE vendas     ADD COLUMN IF NOT EXISTS cancelada_por integer REFERENCES usuarios (id) ON DELETE SET NULL;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS usuario_id    integer REFERENCES usuarios (id) ON DELETE SET NULL;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS estornado_por integer REFERENCES usuarios (id) ON DELETE SET NULL;

-- tokens de formulário já processados (evita lançar duas vezes o mesmo envio)
CREATE TABLE IF NOT EXISTS operacoes (
    token      char(32)    PRIMARY KEY,
    criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operacoes_criado ON operacoes (criado_em);
