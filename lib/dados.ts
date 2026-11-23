import 'server-only';
import { FORMAS, type Forma } from './config';
import { query, um } from './db';

/* Consultas das telas. Valores numeric do Postgres chegam como texto: convertidos aqui. */

export type Categoria = { id: number; nome: string; cor: string };
export type Produto = { id: number; nome: string; preco: number; categoria_id: number | null };
export type Cliente = {
    id: number;
    nome: string;
    sobrenome: string;
    telefone: string;
    endereco: string | null;
    telefone2: string | null;
    aniversario: string | null;
    saldo: number;
    arquivado_em: Date | null;
};

export const FILTROS = ['devendo', 'todos', 'arquivados'] as const;
export type Filtro = (typeof FILTROS)[number];

const colsCliente = 'id, nome, sobrenome, telefone, endereco, telefone2, aniversario, saldo::float8 AS saldo, arquivado_em';

export async function categorias(): Promise<Categoria[]> {
    return query<Categoria>('SELECT id, nome, cor FROM categorias ORDER BY nome, id');
}

/** Produtos ordenados por categoria e nome. */
export async function produtos(): Promise<Produto[]> {
    return query<Produto>('SELECT id, nome, preco::float8 AS preco, categoria_id FROM produtos ORDER BY categoria_id NULLS LAST, nome, id');
}

export async function cliente(id: number): Promise<Cliente | null> {
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return um<Cliente>(`SELECT ${colsCliente} FROM clientes WHERE id = $1`, [id]);
}

/** Escapa curingas do LIKE (o escape padrão do Postgres é a barra invertida). */
function like(s: string): string {
    return '%' + s.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}

/** Lista paginada para a tela inicial. */
export async function listaClientes(filtro: Filtro, busca: string, pagina: number, porPagina: number) {
    const conds: string[] = [filtro === 'arquivados' ? 'arquivado_em IS NOT NULL' : 'arquivado_em IS NULL'];
    const params: unknown[] = [];
    if (filtro === 'devendo') conds.push('saldo > 0.004');

    // cada palavra precisa aparecer no nome, sobrenome ou telefone (sem diferenciar acento/maiúscula)
    for (const palavra of busca.trim().split(/\s+/).filter(Boolean)) {
        params.push(like(palavra));
        let cond = `unaccent(concat_ws(' ', nome, sobrenome, telefone, telefone2)) ILIKE unaccent($${params.length})`;
        const digitos = palavra.replace(/\D/g, '');
        if (digitos.length >= 3) {
            params.push(like(digitos));
            cond += ` OR regexp_replace(concat_ws(' ', telefone, telefone2), '[^0-9]', '', 'g') LIKE $${params.length}`;
        }
        conds.push(`(${cond})`);
    }
    const where = conds.join(' AND ');

    const total = (await um<{ n: number }>(`SELECT count(*)::int AS n FROM clientes WHERE ${where}`, params))?.n ?? 0;
    const ordem = (filtro === 'devendo' ? 'ultimo_movimento_em DESC NULLS LAST, ' : '') + 'nome, sobrenome, id';
    const itens = await query<Cliente>(
        `SELECT ${colsCliente} FROM clientes WHERE ${where} ORDER BY ${ordem} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, porPagina, Math.max(0, pagina - 1) * porPagina],
    );
    return { itens, total };
}

/** Soma do que os clientes devem (créditos não entram). */
export async function totalAReceber(): Promise<number> {
    return (await um<{ v: number }>('SELECT COALESCE(SUM(saldo), 0)::float8 AS v FROM clientes WHERE saldo > 0'))?.v ?? 0;
}

/** Total recebido (sem estornos) hoje. */
export async function recebidoHoje(): Promise<number> {
    return (
        (await um<{ v: number }>(
            'SELECT COALESCE(SUM(valor), 0)::float8 AS v FROM pagamentos WHERE estornado_em IS NULL AND em >= current_date AND em < current_date + 1',
        ))?.v ?? 0
    );
}

export type LinhaHistorico =
    | { tipo: 'item'; id: number; nome: string; cor: string | null; qtd: number; preco: number; em: Date }
    | { tipo: 'pagamento'; id: number; valor: number; forma: Forma; estornado_em: Date | null; motivo_estorno: string | null; em: Date };

/** Histórico da conta: itens das vendas fiado válidas e pagamentos (inclusive estornados). */
export async function historico(id: number, limite: number | null) {
    const sql = `SELECT 'item' AS tipo, i.id, i.nome, i.cor, i.qtd, i.preco::float8 AS preco, NULL::float8 AS valor, NULL AS forma,
                        NULL::timestamptz AS estornado_em, NULL AS motivo_estorno, v.em
                 FROM venda_itens i JOIN vendas v ON v.id = i.venda_id
                 WHERE v.cliente_id = $1 AND v.cancelada_em IS NULL
                 UNION ALL
                 SELECT 'pagamento', p.id, NULL, NULL, NULL, NULL, p.valor::float8, p.forma, p.estornado_em, p.motivo_estorno, p.em
                 FROM pagamentos p WHERE p.cliente_id = $1`;
    const total = (await um<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) h`, [id]))?.n ?? 0;
    const itens = await query<LinhaHistorico>(`${sql} ORDER BY em DESC, tipo ASC, id DESC${limite ? ' LIMIT ' + Math.trunc(limite) : ''}`, [id]);
    return { itens, total };
}

export type VendaAvista = {
    id: number;
    em: Date;
    cancelada_em: Date | null;
    motivo_cancelamento: string | null;
    forma: Forma | null;
    total: number;
    itens: { id: number; nome: string; qtd: number }[];
};

/** Vendas à vista de um dia (AAAA-MM-DD), com itens e pagamento. */
export async function avistaDoDia(dia: string): Promise<VendaAvista[]> {
    const vendas = await query<Omit<VendaAvista, 'itens'>>(
        `SELECT v.id, v.em, v.cancelada_em, v.motivo_cancelamento, p.forma, SUM(i.qtd * i.preco)::float8 AS total
         FROM vendas v
         JOIN venda_itens i ON i.venda_id = v.id
         LEFT JOIN pagamentos p ON p.venda_id = v.id
         WHERE v.tipo = 'avista' AND v.em >= $1::date AND v.em < $1::date + 1
         GROUP BY v.id, p.id
         ORDER BY v.em DESC, v.id DESC`,
        [dia],
    );
    if (vendas.length === 0) return [];
    const itens = await query<{ id: number; venda_id: number; nome: string; qtd: number }>(
        'SELECT id, venda_id, nome, qtd FROM venda_itens WHERE venda_id = ANY($1::int[]) ORDER BY id',
        [vendas.map((v) => v.id)],
    );
    return vendas.map((v) => ({ ...v, itens: itens.filter((i) => i.venda_id === v.id) }));
}

/* ── Relatório ─────────────────────────────────────────────── */

export type Resumo = {
    vazio: boolean;
    recebido: number;
    avista: number;
    fiadoRecebido: number;
    consumido: number;
    itensQtd: number;
    porForma: { id: Forma; rotulo: string; valor: number }[];
    topProd: { nome: string; cor: string | null; qtd: number; valor: number }[];
    porCat: { nome: string; cor: string | null; valor: number }[];
};

/**
 * Números do período [de, ate] (dias AAAA-MM-DD, inclusive), somados no banco.
 * Vendas canceladas e pagamentos estornados ficam de fora.
 */
export async function resumo(de: string, ate: string): Promise<Resumo> {
    const p = [de, ate];
    const pag = (await um<{ recebido: number; avista: number; n: number }>(
        `SELECT COALESCE(SUM(valor), 0)::float8 AS recebido,
                COALESCE(SUM(CASE WHEN venda_id IS NOT NULL THEN valor END), 0)::float8 AS avista,
                count(*)::int AS n
         FROM pagamentos WHERE estornado_em IS NULL AND em >= $1::date AND em < $2::date + 1`,
        p,
    ))!;
    const formas = await query<{ forma: Forma; valor: number }>(
        `SELECT forma, SUM(valor)::float8 AS valor FROM pagamentos
         WHERE estornado_em IS NULL AND em >= $1::date AND em < $2::date + 1 GROUP BY forma`,
        p,
    );
    // uma passada só pelos itens: soma por produto e categoria
    const grupos = await query<{ nome: string; cat: string; cor: string | null; qtd: number; valor: number }>(
        `SELECT i.nome, COALESCE(i.cat_nome, 'Sem categoria') AS cat, MAX(i.cor) AS cor,
                SUM(i.qtd)::int AS qtd, SUM(i.qtd * i.preco)::float8 AS valor
         FROM vendas v JOIN venda_itens i ON i.venda_id = v.id
         WHERE v.cancelada_em IS NULL AND v.em >= $1::date AND v.em < $2::date + 1
         GROUP BY i.nome, COALESCE(i.cat_nome, 'Sem categoria')`,
        p,
    );

    const porProduto = new Map<string, Resumo['topProd'][number]>();
    const porCat = new Map<string, Resumo['porCat'][number]>();
    for (const g of grupos) {
        const pr = porProduto.get(g.nome) ?? { nome: g.nome, cor: g.cor, qtd: 0, valor: 0 };
        pr.qtd += g.qtd;
        pr.valor += g.valor;
        porProduto.set(g.nome, pr);
        const c = porCat.get(g.cat) ?? { nome: g.cat, cor: g.cor, valor: 0 };
        c.valor += g.valor;
        porCat.set(g.cat, c);
    }
    const porValor = (a: { valor: number; nome: string }, b: { valor: number; nome: string }) =>
        b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR');
    const prods = [...porProduto.values()].sort(porValor);
    const cats = [...porCat.values()].sort(porValor);
    const r2 = (n: number) => Math.round(n * 100) / 100;

    return {
        vazio: pag.n === 0 && grupos.length === 0,
        recebido: pag.recebido,
        avista: pag.avista,
        fiadoRecebido: r2(pag.recebido - pag.avista),
        consumido: r2(cats.reduce((s, c) => s + c.valor, 0)),
        itensQtd: prods.reduce((s, x) => s + x.qtd, 0),
        porForma: (Object.keys(FORMAS) as Forma[]).map((id) => ({
            id,
            rotulo: FORMAS[id].rotulo,
            valor: formas.find((f) => f.forma === id)?.valor ?? 0,
        })),
        topProd: prods.slice(0, 6),
        porCat: cats,
    };
}

export type LinhaExportacao = {
    data_hora: Date;
    tipo: string;
    cliente: string | null;
    descricao: string;
    categoria: string | null;
    quantidade: number | null;
    preco_unitario: number | null;
    valor: number | null;
    forma: string | null;
    situacao: string;
};

/** Cada item vendido e cada pagamento do período, para a planilha. */
export async function linhasExportacao(de: string, ate: string): Promise<LinhaExportacao[]> {
    return query<LinhaExportacao>(
        `SELECT * FROM (
            SELECT v.em AS data_hora, CASE WHEN v.tipo = 'avista' THEN 'Venda à vista' ELSE 'Fiado' END AS tipo,
                   NULLIF(TRIM(concat_ws(' ', c.nome, c.sobrenome)), '') AS cliente,
                   i.nome AS descricao, i.cat_nome AS categoria, i.qtd AS quantidade, i.preco::float8 AS preco_unitario,
                   (i.qtd * i.preco)::float8 AS valor, NULL AS forma,
                   CASE WHEN v.cancelada_em IS NULL THEN '' ELSE 'cancelada' END AS situacao
            FROM vendas v JOIN venda_itens i ON i.venda_id = v.id LEFT JOIN clientes c ON c.id = v.cliente_id
            WHERE v.em >= $1::date AND v.em < $2::date + 1
            UNION ALL
            SELECT p.em, CASE WHEN p.venda_id IS NULL THEN 'Pagamento de fiado' ELSE 'Pagamento à vista' END,
                   NULLIF(TRIM(concat_ws(' ', c.nome, c.sobrenome)), ''), 'Pagamento', NULL, NULL, NULL,
                   p.valor::float8, p.forma, CASE WHEN p.estornado_em IS NULL THEN '' ELSE 'estornado' END
            FROM pagamentos p LEFT JOIN clientes c ON c.id = p.cliente_id
            WHERE p.em >= $1::date AND p.em < $2::date + 1
        ) x ORDER BY data_hora, tipo`,
        [de, ate],
    );
}
