import 'server-only';
import { COR_SEM_COR, QTD_MAXIMA, ehForma } from './config';
import { RegraNegocio, transacao, type Db } from './db';

/*
 * Regras de negócio. Toda operação que mexe na conta de um cliente trava a linha dele
 * e recalcula o saldo na mesma transação (o valor nunca é somado "por cima").
 */

/** Trava a linha do cliente até o fim da transação (lançamentos simultâneos esperam). */
async function travarCliente(db: Db, id: number) {
    const r = await db.query<{ id: number; saldo: number; arquivado_em: Date | null }>(
        'SELECT id, saldo::float8 AS saldo, arquivado_em FROM clientes WHERE id = $1 FOR UPDATE',
        [id],
    );
    return r.rows[0] ?? null;
}

/** Recalcula saldo e último movimento a partir das vendas e pagamentos válidos. */
async function recalcularCliente(db: Db, id: number) {
    await db.query(
        `UPDATE clientes c SET
            saldo = (SELECT COALESCE(SUM(i.qtd * i.preco), 0) FROM vendas v JOIN venda_itens i ON i.venda_id = v.id
                     WHERE v.cliente_id = c.id AND v.cancelada_em IS NULL)
                  - (SELECT COALESCE(SUM(p.valor), 0) FROM pagamentos p WHERE p.cliente_id = c.id AND p.estornado_em IS NULL),
            ultimo_movimento_em = (SELECT MAX(em) FROM (
                     SELECT v.em FROM vendas v WHERE v.cliente_id = c.id AND v.cancelada_em IS NULL
                     UNION ALL
                     SELECT p.em FROM pagamentos p WHERE p.cliente_id = c.id AND p.estornado_em IS NULL) m)
         WHERE c.id = $1`,
        [id],
    );
}

/** Motivo de cancelamento/estorno: opcional, até 200 caracteres. */
export function motivo(m: unknown): string {
    const s = String(m ?? '').trim();
    return s === '' ? 'Sem motivo informado' : Array.from(s).slice(0, 200).join('');
}

/* ── Vendas ────────────────────────────────────────────────── */

export type Carrinho = Map<number, number>;

/** Lê o carrinho enviado pelo formulário: JSON {"produtoId": quantidade}. */
export function lerCarrinho(json: unknown): Carrinho {
    let bruto: unknown;
    try {
        bruto = JSON.parse(String(json ?? ''));
    } catch {
        throw new RegraNegocio('Carrinho inválido');
    }
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto) || Object.keys(bruto).length === 0) {
        throw new RegraNegocio('Carrinho vazio');
    }
    const carrinho: Carrinho = new Map();
    for (const [produtoId, qtd] of Object.entries(bruto)) {
        if (!/^\d+$/.test(produtoId) || !Number.isInteger(qtd)) throw new RegraNegocio('Carrinho inválido');
        if ((qtd as number) < 1 || (qtd as number) > QTD_MAXIMA) throw new RegraNegocio(`Quantidade deve ser de 1 a ${QTD_MAXIMA}`);
        carrinho.set(Number(produtoId), qtd as number);
    }
    return carrinho;
}

type ItemNovo = { produto_id: number; nome: string; cat_nome: string; cor: string; qtd: number; preco: number };

/** Busca os produtos do carrinho e monta os itens com nome, categoria, cor e preço do momento. */
async function montarItens(db: Db, carrinho: Carrinho): Promise<ItemNovo[]> {
    if (carrinho.size === 0) throw new RegraNegocio('Carrinho vazio');
    const r = await db.query<{ id: number; nome: string; preco: number; cat_nome: string | null; cor: string | null }>(
        `SELECT p.id, p.nome, p.preco::float8 AS preco, c.nome AS cat_nome, c.cor
         FROM produtos p LEFT JOIN categorias c ON c.id = p.categoria_id WHERE p.id = ANY($1::int[])`,
        [[...carrinho.keys()]],
    );
    if (r.rows.length !== carrinho.size) throw new RegraNegocio('Algum produto não existe mais. Recarregue a tela.');
    return r.rows.map((p) => ({
        produto_id: p.id,
        nome: p.nome,
        cat_nome: p.cat_nome ?? 'Sem categoria',
        cor: p.cor ?? COR_SEM_COR,
        qtd: carrinho.get(p.id)!,
        preco: p.preco,
    }));
}

async function gravarVenda(db: Db, tipo: 'fiado' | 'avista', clienteId: number | null, itens: ItemNovo[], usuarioId: number): Promise<number> {
    const v = await db.query<{ id: number }>('INSERT INTO vendas (cliente_id, tipo, usuario_id) VALUES ($1, $2, $3) RETURNING id', [clienteId, tipo, usuarioId]);
    const vendaId = v.rows[0].id;
    for (const i of itens) {
        await db.query(
            'INSERT INTO venda_itens (venda_id, produto_id, nome, cat_nome, cor, qtd, preco) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [vendaId, i.produto_id, i.nome, i.cat_nome, i.cor, i.qtd, i.preco],
        );
    }
    return vendaId;
}

/** Lança o carrinho na conta do cliente. */
export async function lancarFiado(db: Db, clienteId: number, carrinho: Carrinho, usuarioId: number): Promise<number> {
    const cliente = await travarCliente(db, clienteId);
    if (!cliente) throw new RegraNegocio('Cliente não encontrado');
    if (cliente.arquivado_em !== null) throw new RegraNegocio('Cliente arquivado: reative a conta para lançar');
    const itens = await montarItens(db, carrinho);
    const vendaId = await gravarVenda(db, 'fiado', clienteId, itens, usuarioId);
    await recalcularCliente(db, clienteId);
    return vendaId;
}

/** Venda paga na hora: itens + pagamento ligado à venda. */
export async function vendaAvista(db: Db, carrinho: Carrinho, forma: unknown, usuarioId: number) {
    if (!ehForma(forma)) throw new RegraNegocio('Forma de pagamento inválida');
    const itens = await montarItens(db, carrinho);
    const total = Math.round(itens.reduce((s, i) => s + i.qtd * i.preco, 0) * 100) / 100;
    const vendaId = await gravarVenda(db, 'avista', null, itens, usuarioId);
    await db.query('INSERT INTO pagamentos (venda_id, valor, forma, usuario_id) VALUES ($1, $2, $3, $4)', [vendaId, total, forma, usuarioId]);
    return { id: vendaId, total };
}

/** Muda a quantidade de um item da conta (0 remove). Retorna o id do cliente. */
export async function alterarItem(itemId: number, qtd: number, usuarioId: number): Promise<number> {
    if (!Number.isInteger(qtd) || qtd < 0 || qtd > QTD_MAXIMA) throw new RegraNegocio(`Quantidade deve ser de 1 a ${QTD_MAXIMA}`);

    return transacao(async (db) => {
        const r = await db.query<{ venda_id: number; tipo: string; cliente_id: number; cancelada_em: Date | null }>(
            `SELECT i.venda_id, v.tipo, v.cliente_id, v.cancelada_em
             FROM venda_itens i JOIN vendas v ON v.id = i.venda_id WHERE i.id = $1`,
            [itemId],
        );
        const item = r.rows[0];
        if (!item) throw new RegraNegocio('Item não encontrado');
        if (item.tipo !== 'fiado') throw new RegraNegocio('Itens de venda à vista não podem ser alterados; cancele a venda');
        if (item.cancelada_em !== null) throw new RegraNegocio('Essa venda foi cancelada');
        await travarCliente(db, item.cliente_id);

        if (qtd === 0) {
            await db.query('DELETE FROM venda_itens WHERE id = $1', [itemId]);
            // venda sem itens deixa de valer (fica registrada como cancelada)
            const resto = await db.query('SELECT 1 FROM venda_itens WHERE venda_id = $1 LIMIT 1', [item.venda_id]);
            if (resto.rowCount === 0) {
                await db.query(
                    "UPDATE vendas SET cancelada_em = now(), cancelada_por = $2, motivo_cancelamento = 'Todos os itens foram removidos', updated_at = now() WHERE id = $1",
                    [item.venda_id, usuarioId],
                );
            }
        } else {
            await db.query('UPDATE venda_itens SET qtd = $2 WHERE id = $1', [itemId, qtd]);
        }
        await recalcularCliente(db, item.cliente_id);
        return item.cliente_id;
    });
}

/** Cancela uma venda inteira. Na venda à vista, o pagamento dela é estornado junto. */
export async function cancelarVenda(vendaId: number, m: unknown, usuarioId: number) {
    return transacao(async (db) => {
        const r = await db.query<{ id: number; cliente_id: number | null; cancelada_em: Date | null; em: Date }>(
            'SELECT id, cliente_id, cancelada_em, em FROM vendas WHERE id = $1',
            [vendaId],
        );
        const venda = r.rows[0];
        if (!venda) throw new RegraNegocio('Venda não encontrada');
        if (venda.cancelada_em !== null) throw new RegraNegocio('Essa venda já estava cancelada');
        if (venda.cliente_id !== null) await travarCliente(db, venda.cliente_id);
        const mot = motivo(m);
        await db.query('UPDATE vendas SET cancelada_em = now(), cancelada_por = $3, motivo_cancelamento = $2, updated_at = now() WHERE id = $1', [vendaId, mot, usuarioId]);
        await db.query('UPDATE pagamentos SET estornado_em = now(), estornado_por = $3, motivo_estorno = $2 WHERE venda_id = $1 AND estornado_em IS NULL', [
            vendaId,
            'Venda cancelada: ' + mot,
            usuarioId,
        ]);
        if (venda.cliente_id !== null) await recalcularCliente(db, venda.cliente_id);
        return venda;
    });
}

/* ── Pagamentos ────────────────────────────────────────────── */

/**
 * Recebe um pagamento de fiado. O valor é limitado ao saldo devedor; a linha do cliente
 * fica travada durante a operação, então dois recebimentos simultâneos não pagam duas vezes.
 */
export async function receber(db: Db, clienteId: number, valor: number | null, forma: unknown, usuarioId: number) {
    if (!ehForma(forma)) throw new RegraNegocio('Forma de pagamento inválida');
    if (valor === null || valor <= 0) throw new RegraNegocio('Valor inválido');
    const cliente = await travarCliente(db, clienteId);
    if (!cliente) throw new RegraNegocio('Cliente não encontrado');
    if (cliente.saldo <= 0.004) throw new RegraNegocio('Esse cliente não tem saldo a pagar');
    const pago = Math.round(Math.min(valor, cliente.saldo) * 100) / 100;
    await db.query('INSERT INTO pagamentos (cliente_id, valor, forma, usuario_id) VALUES ($1, $2, $3, $4)', [clienteId, pago, forma, usuarioId]);
    await recalcularCliente(db, clienteId);
    return { pago, falta: Math.round((cliente.saldo - pago) * 100) / 100 };
}

/** Estorna um pagamento de fiado (o valor volta para a conta); ele fica no histórico, riscado. */
export async function estornar(pagamentoId: number, m: unknown, usuarioId: number) {
    return transacao(async (db) => {
        const r = await db.query<{ cliente_id: number | null; estornado_em: Date | null }>(
            'SELECT cliente_id, estornado_em FROM pagamentos WHERE id = $1',
            [pagamentoId],
        );
        const pagamento = r.rows[0];
        if (!pagamento || pagamento.cliente_id === null) throw new RegraNegocio('Pagamento não encontrado');
        if (pagamento.estornado_em !== null) throw new RegraNegocio('Esse pagamento já estava estornado');
        await travarCliente(db, pagamento.cliente_id);
        await db.query('UPDATE pagamentos SET estornado_em = now(), estornado_por = $3, motivo_estorno = $2 WHERE id = $1', [pagamentoId, motivo(m), usuarioId]);
        await recalcularCliente(db, pagamento.cliente_id);
        return { cliente_id: pagamento.cliente_id };
    });
}
