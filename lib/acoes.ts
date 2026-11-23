'use server';

import { revalidatePath } from 'next/cache';
import { COR_PADRAO } from './config';
import { RegraNegocio, query, transacao, um, umaVez } from './db';
import { brl, parseMoeda } from './formato';
import * as s from './servicos';
import { usuarioAtual } from './auth';

/*
 * Ações dos formulários. Cada uma devolve a mensagem do aviso (toast) e, quando for o caso,
 * para onde a tela deve ir. Erro de validação: ok = false e o modal continua aberto.
 */

export type Cor = 'green' | 'red' | 'amber';
export type Resultado = { ok: boolean; msg: string; cor: Cor; destino?: string };

const sucesso = (msg: string, destino?: string, cor: Cor = 'green'): Resultado => ({ ok: true, msg, cor, destino });
const falha = (msg: string, destino?: string): Resultado => ({ ok: false, msg, cor: 'red', destino });
const SEM_SESSAO: Resultado = { ok: false, msg: 'Sua sessão terminou. Entre de novo.', cor: 'red', destino: '/entrar' };

function texto(fd: FormData, campo: string): string {
    const v = fd.get(campo);
    return typeof v === 'string' ? v.trim() : '';
}
function id(v: unknown): number {
    const n = Number(v);
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
}
const tamanho = (s: string) => Array.from(s).length;

/** Executa, atualiza as telas e transforma RegraNegocio em aviso vermelho. */
async function executar(fn: () => Promise<Resultado>, destinoErro?: (msg: string) => string | undefined): Promise<Resultado> {
    try {
        const r = await fn();
        revalidatePath('/', 'layout');
        return r;
    } catch (e) {
        if (e instanceof RegraNegocio) {
            revalidatePath('/', 'layout');
            return falha(e.message, destinoErro?.(e.message));
        }
        throw e;
    }
}

/* ── Clientes ──────────────────────────────────────────────── */

function camposCliente(fd: FormData) {
    const opcional = (c: string) => texto(fd, c) || null;
    let aniversario = opcional('aniversario');
    // "1/3" ou "01-03" viram "01/03"; o resto segue como digitado para a validação recusar
    const m = aniversario?.match(/^(\d{1,2})[/\-.](\d{1,2})$/);
    if (m) aniversario = `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}`;
    return {
        nome: texto(fd, 'nome'),
        sobrenome: texto(fd, 'sobrenome'),
        telefone: texto(fd, 'telefone'),
        endereco: opcional('endereco'),
        telefone2: opcional('telefone2'),
        aniversario,
    };
}

function validarCliente(c: ReturnType<typeof camposCliente>): string | null {
    if (c.nome === '') return 'Digite o nome do cliente.';
    if (tamanho(c.nome) > 80) return 'Nome muito longo (máx. 80).';
    if (tamanho(c.sobrenome) > 80) return 'Sobrenome muito longo (máx. 80).';
    if (tamanho(c.telefone) > 40) return 'Telefone muito longo (máx. 40).';
    if (c.endereco && tamanho(c.endereco) > 200) return 'Endereço muito longo (máx. 200).';
    if (c.telefone2 && tamanho(c.telefone2) > 40) return 'Outro telefone muito longo (máx. 40).';
    if (c.aniversario && !/^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])$/.test(c.aniversario)) return 'Aniversário deve ser dia/mês, ex.: 14/03.';
    return null;
}

export async function criarCliente(fd: FormData): Promise<Resultado> {
    if (!(await usuarioAtual())) return SEM_SESSAO;
    const c = camposCliente(fd);
    const erro = validarCliente(c);
    if (erro) return falha(erro);
    return executar(async () => {
        const novo = await umaVez(fd.get('operacao'), async (db) => {
            const r = await db.query<{ id: number }>(
                'INSERT INTO clientes (nome, sobrenome, telefone, endereco, telefone2, aniversario) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                [c.nome, c.sobrenome, c.telefone, c.endereco, c.telefone2, c.aniversario],
            );
            return r.rows[0].id;
        });
        if (novo === null) return sucesso('Esse cliente já tinha sido cadastrado', '/', 'amber');
        return sucesso('Cliente adicionado', `/clientes/${novo}`);
    });
}

export async function editarCliente(clienteId: number, fd: FormData): Promise<Resultado> {
    if (!(await usuarioAtual())) return SEM_SESSAO;
    const c = camposCliente(fd);
    const erro = validarCliente(c);
    if (erro) return falha(erro);
    return executar(async () => {
        const r = await query<{ id: number }>(
            `UPDATE clientes SET nome = $2, sobrenome = $3, telefone = $4, endereco = $5, telefone2 = $6, aniversario = $7, updated_at = now()
             WHERE id = $1 RETURNING id`,
            [id(clienteId), c.nome, c.sobrenome, c.telefone, c.endereco, c.telefone2, c.aniversario],
        );
        if (r.length === 0) return falha('Cliente não encontrado', '/');
        return sucesso('Dados atualizados');
    });
}

/** Arquiva (esconde da lista) um cliente sem saldo. O histórico continua guardado. */
export async function arquivarCliente(clienteId: number): Promise<Resultado> {
    if (!(await usuarioAtual())) return SEM_SESSAO;
    return executar(async () => {
        const c = await um<{ saldo: number }>('SELECT saldo::float8 AS saldo FROM clientes WHERE id = $1', [id(clienteId)]);
        if (!c) return falha('Cliente não encontrado', '/');
        if (Math.abs(c.saldo) > 0.004) return falha('Só dá para arquivar com a conta zerada');
        await query('UPDATE clientes SET arquivado_em = now(), updated_at = now() WHERE id = $1', [id(clienteId)]);
        return sucesso('Cliente arquivado', '/', 'amber');
    });
}

export async function reativarCliente(clienteId: number): Promise<Resultado> {
    if (!(await usuarioAtual())) return SEM_SESSAO;
    return executar(async () => {
        const r = await query('UPDATE clientes SET arquivado_em = NULL, updated_at = now() WHERE id = $1 RETURNING id', [id(clienteId)]);
        if (r.length === 0) return falha('Cliente não encontrado', '/');
        return sucesso('Cliente reativado');
    });
}

/**
 * Exclui um cliente que nunca teve lançamento (ex.: cadastrado em dobro).
 * Com qualquer venda ou pagamento (mesmo cancelado/estornado), só dá para arquivar.
 */
export async function excluirCliente(clienteId: number): Promise<Resultado> {
    if (!(await usuarioAtual())) return SEM_SESSAO;
    return executar(() =>
        transacao(async (db) => {
            const c = await db.query<{ nome: string }>(
                "SELECT TRIM(nome || ' ' || sobrenome) AS nome FROM clientes WHERE id = $1 FOR UPDATE",
                [id(clienteId)],
            );
            if (c.rowCount === 0) return falha('Cliente não encontrado', '/');
            const usado = await db.query(
                'SELECT 1 FROM vendas WHERE cliente_id = $1 UNION ALL SELECT 1 FROM pagamentos WHERE cliente_id = $1 LIMIT 1',
                [id(clienteId)],
            );
            if (usado.rowCount) return falha('Esse cliente já tem lançamentos e não pode ser excluído. Use "Arquivar cliente".');
            await db.query('DELETE FROM clientes WHERE id = $1', [id(clienteId)]);
            return sucesso(`${c.rows[0].nome} foi excluído`, '/', 'amber');
        }),
    );
}

/* ── Vendas e itens ────────────────────────────────────────── */

/** Lança consumo na conta do cliente. */
export async function lancarFiado(fd: FormData): Promise<Resultado> {
    const eu = await usuarioAtual();
    if (!eu) return SEM_SESSAO;
    const clienteId = id(fd.get('cliente_id'));
    return executar(
        async () => {
            const carrinho = s.lerCarrinho(fd.get('carrinho'));
            const feito = await umaVez(fd.get('operacao'), (db) => s.lancarFiado(db, clienteId, carrinho, eu.id));
            return feito === null ? sucesso('Esse consumo já tinha sido anotado', undefined, 'amber') : sucesso('Consumo anotado na conta');
        },
        (msg) => (msg === 'Cliente não encontrado' ? '/' : undefined),
    );
}

/** Venda paga na hora. */
export async function vendaAvista(fd: FormData): Promise<Resultado> {
    const eu = await usuarioAtual();
    if (!eu) return SEM_SESSAO;
    return executar(async () => {
        const carrinho = s.lerCarrinho(fd.get('carrinho'));
        const venda = await umaVez(fd.get('operacao'), (db) => s.vendaAvista(db, carrinho, fd.get('forma'), eu.id));
        return venda === null ? sucesso('Essa venda já tinha sido registrada', undefined, 'amber') : sucesso('Venda à vista · ' + brl(venda.total));
    });
}

/** Cancela uma venda (na venda à vista, o pagamento é estornado junto). */
export async function cancelarVenda(vendaId: number, fd: FormData): Promise<Resultado> {
    const eu = await usuarioAtual();
    if (!eu) return SEM_SESSAO;
    return executar(async () => {
        await s.cancelarVenda(id(vendaId), fd.get('motivo'), eu.id);
        return sucesso('Venda cancelada', undefined, 'amber');
    });
}

/** Muda a quantidade de um item da conta (0 remove). */
export async function alterarItem(itemId: number, qtd: number): Promise<Resultado> {
    const eu = await usuarioAtual();
    if (!eu) return SEM_SESSAO;
    return executar(async () => {
        await s.alterarItem(id(itemId), Math.trunc(Number(qtd)), eu.id);
        return sucesso(qtd === 0 ? 'Item removido da conta' : 'Consumo atualizado');
    });
}

/* ── Pagamentos ────────────────────────────────────────────── */

/** Recebe pagamento de fiado. */
export async function receberPagamento(fd: FormData): Promise<Resultado> {
    const eu = await usuarioAtual();
    if (!eu) return SEM_SESSAO;
    const clienteId = id(fd.get('cliente_id'));
    return executar(
        async () => {
            const r = await umaVez(fd.get('operacao'), (db) => s.receber(db, clienteId, parseMoeda(fd.get('valor')), fd.get('forma'), eu.id));
            if (r === null) return sucesso('Esse pagamento já tinha sido registrado', undefined, 'amber');
            return sucesso(r.falta <= 0.004 ? 'Conta quitada!' : `Pago ${brl(r.pago)}. Falta ${brl(r.falta)}`);
        },
        (msg) => (msg === 'Cliente não encontrado' ? '/' : undefined),
    );
}

/** Estorna (desfaz) um pagamento de fiado; ele continua no histórico, riscado. */
export async function estornarPagamento(pagamentoId: number, fd: FormData): Promise<Resultado> {
    const eu = await usuarioAtual();
    if (!eu) return SEM_SESSAO;
    return executar(async () => {
        await s.estornar(id(pagamentoId), fd.get('motivo'), eu.id);
        return sucesso('Pagamento estornado: o valor voltou para a conta', undefined, 'amber');
    });
}

/* ── Produtos e categorias ─────────────────────────────────── */

function camposProduto(fd: FormData) {
    return {
        nome: texto(fd, 'nome'),
        precoDigitado: texto(fd, 'preco'),
        preco: parseMoeda(fd.get('preco')),
        categoria_id: id(fd.get('categoria_id')),
    };
}

async function validarProduto(p: ReturnType<typeof camposProduto>): Promise<string | null> {
    if (p.nome === '') return 'Digite o nome do produto.';
    if (tamanho(p.nome) > 120) return 'Nome muito longo (máx. 120).';
    if (p.precoDigitado === '') return 'Digite o preço.';
    if (p.preco === null) return 'Preço inválido.';
    if (p.preco <= 0) return 'O preço precisa ser maior que zero.';
    if (p.preco >= 100000) return 'Preço alto demais.';
    if (!p.categoria_id) return 'Escolha a categoria (crie uma em "Categorias" se ainda não houver).';
    if (!(await um('SELECT 1 FROM categorias WHERE id = $1', [p.categoria_id]))) return 'Categoria não encontrada.';
    return null;
}

export async function salvarProduto(produtoId: number | null, fd: FormData): Promise<Resultado> {
    if (!(await usuarioAtual())) return SEM_SESSAO;
    const p = camposProduto(fd);
    const erro = await validarProduto(p);
    if (erro) return falha(erro);
    return executar(async () => {
        if (produtoId === null) {
            await query('INSERT INTO produtos (nome, preco, categoria_id) VALUES ($1, $2, $3)', [p.nome, p.preco, p.categoria_id]);
            return sucesso('Produto adicionado');
        }
        const r = await query('UPDATE produtos SET nome = $2, preco = $3, categoria_id = $4, updated_at = now() WHERE id = $1 RETURNING id', [
            id(produtoId),
            p.nome,
            p.preco,
            p.categoria_id,
        ]);
        return r.length ? sucesso('Produto atualizado') : falha('Produto não encontrado');
    });
}

/** Remove um produto (os consumos já lançados guardam nome e preço próprios). */
export async function removerProduto(produtoId: number): Promise<Resultado> {
    if (!(await usuarioAtual())) return SEM_SESSAO;
    return executar(async () => {
        const r = await query('DELETE FROM produtos WHERE id = $1 RETURNING id', [id(produtoId)]);
        return r.length ? sucesso('Produto removido') : falha('Produto não encontrado');
    });
}

function camposCategoria(fd: FormData) {
    return { nome: texto(fd, 'nome'), cor: texto(fd, 'cor') || COR_PADRAO };
}

function validarCategoria(c: ReturnType<typeof camposCategoria>): string | null {
    if (c.nome === '') return 'Digite o nome da categoria.';
    if (tamanho(c.nome) > 80) return 'Nome da categoria muito longo (máx. 80).';
    if (!/^#[0-9A-Fa-f]{6}$/.test(c.cor)) return 'Cor inválida.';
    return null;
}

export async function salvarCategoria(categoriaId: number | null, fd: FormData): Promise<Resultado> {
    if (!(await usuarioAtual())) return SEM_SESSAO;
    const c = camposCategoria(fd);
    const erro = validarCategoria(c);
    if (erro) return falha(erro);
    return executar(async () => {
        if (categoriaId === null) {
            await query('INSERT INTO categorias (nome, cor) VALUES ($1, $2)', [c.nome, c.cor]);
            return sucesso('Categoria criada');
        }
        const r = await query('UPDATE categorias SET nome = $2, cor = $3, updated_at = now() WHERE id = $1 RETURNING id', [id(categoriaId), c.nome, c.cor]);
        return r.length ? sucesso('Categoria atualizada') : falha('Categoria não encontrada');
    });
}

/** Remove uma categoria (só se estiver vazia). */
export async function removerCategoria(categoriaId: number): Promise<Resultado> {
    if (!(await usuarioAtual())) return SEM_SESSAO;
    return executar(() =>
        transacao(async (db) => {
            const cat = await db.query('SELECT 1 FROM categorias WHERE id = $1 FOR UPDATE', [id(categoriaId)]);
            if (cat.rowCount === 0) return falha('Categoria não encontrada');
            const usados = await db.query('SELECT 1 FROM produtos WHERE categoria_id = $1 LIMIT 1', [id(categoriaId)]);
            if (usados.rowCount) return falha('Tem produtos nessa categoria');
            await db.query('DELETE FROM categorias WHERE id = $1', [id(categoriaId)]);
            return sucesso('Categoria removida');
        }),
    );
}
