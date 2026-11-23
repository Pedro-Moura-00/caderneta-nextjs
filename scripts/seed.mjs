// Dados de exemplo: npm run db:seed
// APAGA tudo. Só roda com o banco sem clientes, a menos que BAR_SEED_FORCAR=1.
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('Defina DATABASE_URL (veja .env.example).');
    process.exit(1);
}
const db = new pg.Client({ connectionString: url, options: '-c timezone=America/Sao_Paulo' });
await db.connect();

try {
    const { rows } = await db.query('SELECT count(*)::int AS n FROM clientes');
    if (rows[0].n > 0 && process.env.BAR_SEED_FORCAR !== '1') {
        throw new Error('O banco já tem clientes; o seed apagaria tudo. Use BAR_SEED_FORCAR=1 para forçar.');
    }

    await db.query('BEGIN');
    await db.query('TRUNCATE pagamentos, venda_itens, vendas, operacoes, produtos, clientes, categorias RESTART IDENTITY CASCADE');

    const agora = Date.now();
    const H = 3600_000;
    const D = 24 * H;
    const ts = (ms) => new Date(ms);

    const categorias = {
        cerveja: { nome: 'Cervejas', cor: '#C9821A' },
        refri: { nome: 'Sem álcool', cor: '#1C7ED6' },
        dose: { nome: 'Doses', cor: '#9B2C5A' },
        salgado: { nome: 'Salgados', cor: '#2F9E44' },
    };
    const catId = {};
    for (const [slug, c] of Object.entries(categorias)) {
        const r = await db.query('INSERT INTO categorias (nome, cor) VALUES ($1, $2) RETURNING id', [c.nome, c.cor]);
        catId[slug] = r.rows[0].id;
    }

    const produtos = {
        brahma: ['Brahma 600ml', 12, 'cerveja'],
        skol: ['Skol lata', 6, 'cerveja'],
        heineken: ['Heineken long neck', 10, 'cerveja'],
        original: ['Original 600ml', 14, 'cerveja'],
        budweiser: ['Budweiser lata', 7, 'cerveja'],
        coca: ['Coca-Cola', 6, 'refri'],
        guarana: ['Guaraná', 5.5, 'refri'],
        agua: ['Água', 4, 'refri'],
        suco: ['Suco', 8, 'refri'],
        cachaca: ['Dose de cachaça', 6, 'dose'],
        whisky: ['Dose de whisky', 18, 'dose'],
        caipirinha: ['Caipirinha', 15, 'dose'],
        batida: ['Batida', 12, 'dose'],
        pastel: ['Pastel', 10, 'salgado'],
        coxinha: ['Coxinha', 7, 'salgado'],
        amendoim: ['Amendoim', 8, 'salgado'],
        batata: ['Batata frita', 25, 'salgado'],
        torresmo: ['Torresmo', 28, 'salgado'],
    };
    const prod = {};
    for (const [slug, [nome, preco, cat]] of Object.entries(produtos)) {
        const r = await db.query('INSERT INTO produtos (nome, preco, categoria_id) VALUES ($1, $2, $3) RETURNING id', [nome, preco, catId[cat]]);
        prod[slug] = { id: r.rows[0].id, nome, preco, cat };
    }

    const clientes = {
        c1: { nome: 'Antônio', sobrenome: 'Ferreira', telefone: '(12) 99123-4567', aniversario: '14/03' },
        c2: { nome: 'Marlene', sobrenome: 'Souza', telefone: '(12) 98876-1020' },
        c3: { nome: 'João', sobrenome: 'Lima', telefone: '(12) 99777-3311', endereco: 'Rua das Palmeiras, 88' },
        c4: { nome: 'Rita', sobrenome: 'Barbosa', telefone: '(12) 99444-5566' },
        c5: { nome: 'José', sobrenome: 'Carlos', telefone: '(12) 98123-9090' },
        c6: { nome: 'Cleiton', sobrenome: 'Rocha', telefone: '(12) 99001-2233' },
    };
    const cli = {};
    for (const [slug, c] of Object.entries(clientes)) {
        const r = await db.query(
            'INSERT INTO clientes (nome, sobrenome, telefone, endereco, aniversario) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [c.nome, c.sobrenome, c.telefone, c.endereco ?? null, c.aniversario ?? null],
        );
        cli[slug] = r.rows[0].id;
    }

    async function venda(cliSlug, itens, ms, forma) {
        const r = await db.query(
            'INSERT INTO vendas (cliente_id, tipo, em, created_at, updated_at) VALUES ($1, $2, $3, $3, $3) RETURNING id',
            [cliSlug ? cli[cliSlug] : null, cliSlug ? 'fiado' : 'avista', ts(ms)],
        );
        const vendaId = r.rows[0].id;
        let total = 0;
        for (const [slug, qtd] of itens) {
            const p = prod[slug];
            const c = categorias[p.cat];
            await db.query(
                'INSERT INTO venda_itens (venda_id, produto_id, nome, cat_nome, cor, qtd, preco) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [vendaId, p.id, p.nome, c.nome, c.cor, qtd, p.preco],
            );
            total += qtd * p.preco;
        }
        if (!cliSlug) {
            await db.query('INSERT INTO pagamentos (venda_id, valor, forma, em, created_at) VALUES ($1, $2, $3, $4, $4)', [vendaId, total, forma, ts(ms)]);
        }
    }
    async function pagamento(cliSlug, valor, forma, ms) {
        await db.query('INSERT INTO pagamentos (cliente_id, valor, forma, em, created_at) VALUES ($1, $2, $3, $4, $4)', [cli[cliSlug], valor, forma, ts(ms)]);
    }

    await venda('c1', [['brahma', 4], ['amendoim', 1]], agora - 2 * D - 3 * H);
    await venda('c1', [['brahma', 2]], agora - 4 * H);
    await pagamento('c1', 30, 'pix', agora - 1 * D);
    await venda('c2', [['coca', 2], ['coxinha', 1]], agora - 6 * H);
    await venda('c3', [['brahma', 6]], agora - 5 * D);
    await venda('c3', [['whisky', 3], ['torresmo', 1]], agora - 3 * D);
    await pagamento('c3', 50, 'dinheiro', agora - 1 * D);
    await venda('c4', [['caipirinha', 2]], agora - 2 * H);
    await venda('c5', [['skol', 3], ['pastel', 2]], agora - 1 * D - 2 * H);
    await venda('c6', [['brahma', 2]], agora - 3 * D);
    await pagamento('c6', 24, 'pix', agora - 2 * H);

    await venda(null, [['brahma', 2]], agora - 3 * H, 'dinheiro');
    await venda(null, [['coxinha', 3]], agora - 5 * H, 'pix');
    await venda(null, [['caipirinha', 1]], agora - 1 * D - 4 * H, 'cartao');
    await venda(null, [['batata', 1]], agora - 8 * D, 'dinheiro');

    // mesmo cálculo de recalcularCliente() em lib/servicos.ts, para todos
    await db.query(`UPDATE clientes c SET
        saldo = (SELECT COALESCE(SUM(i.qtd * i.preco), 0) FROM vendas v JOIN venda_itens i ON i.venda_id = v.id
                 WHERE v.cliente_id = c.id AND v.cancelada_em IS NULL)
              - (SELECT COALESCE(SUM(p.valor), 0) FROM pagamentos p WHERE p.cliente_id = c.id AND p.estornado_em IS NULL),
        ultimo_movimento_em = (SELECT MAX(em) FROM (
                 SELECT v.em FROM vendas v WHERE v.cliente_id = c.id AND v.cancelada_em IS NULL
                 UNION ALL
                 SELECT p.em FROM pagamentos p WHERE p.cliente_id = c.id AND p.estornado_em IS NULL) m)`);

    await db.query('COMMIT');
    console.log('Dados de exemplo criados.');
} catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    console.error(e.message);
    process.exitCode = 1;
} finally {
    await db.end();
}
