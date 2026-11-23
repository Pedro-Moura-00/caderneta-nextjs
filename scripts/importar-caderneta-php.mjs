// Copia os dados da Caderneta antiga (PHP/MySQL) para o banco da Caderneta nova (Postgres).
//
//   MYSQL_URL     banco antigo, ex.: mysql://root:senha@127.0.0.1:3307/bar_will
//   DATABASE_URL  banco novo (Neon ou o Postgres local)
//
//   node --env-file=.env.neon scripts/importar-caderneta-php.mjs            confere e importa
//   node --env-file=.env.neon scripts/importar-caderneta-php.mjs --substituir
//        apaga antes categorias, produtos, clientes, vendas e pagamentos do banco novo
//        (os usuários e senhas ficam)
//
// Mantém os ids, horários, cancelamentos e estornos. Tudo numa transação: se algo
// falhar, o banco novo fica como estava. Os horários do MySQL estão no horário de
// Brasília (sem fuso) e são gravados como tal.

import mysql from 'mysql2/promise';
import pg from 'pg';

const FUSO = 'America/Sao_Paulo';
const substituir = process.argv.includes('--substituir');

if (!process.env.MYSQL_URL || !process.env.DATABASE_URL) {
    console.error('Defina MYSQL_URL (banco antigo) e DATABASE_URL (banco novo).');
    process.exit(1);
}

// cada tabela: colunas copiadas e quais delas são data/hora
const TABELAS = [
    { nome: 'categorias', colunas: ['id', 'nome', 'cor', 'created_at', 'updated_at'], datas: ['created_at', 'updated_at'] },
    { nome: 'produtos', colunas: ['id', 'nome', 'preco', 'categoria_id', 'created_at', 'updated_at'], datas: ['created_at', 'updated_at'] },
    {
        nome: 'clientes',
        colunas: ['id', 'nome', 'sobrenome', 'telefone', 'endereco', 'telefone2', 'aniversario', 'arquivado_em', 'created_at', 'updated_at'],
        datas: ['arquivado_em', 'created_at', 'updated_at'],
    },
    {
        nome: 'vendas',
        colunas: ['id', 'cliente_id', 'tipo', 'em', 'cancelada_em', 'motivo_cancelamento', 'created_at', 'updated_at'],
        datas: ['em', 'cancelada_em', 'created_at', 'updated_at'],
    },
    { nome: 'venda_itens', colunas: ['id', 'venda_id', 'produto_id', 'nome', 'cat_nome', 'cor', 'qtd', 'preco'], datas: [] },
    {
        nome: 'pagamentos',
        colunas: ['id', 'cliente_id', 'venda_id', 'valor', 'forma', 'em', 'estornado_em', 'motivo_estorno', 'created_at'],
        datas: ['em', 'estornado_em', 'created_at'],
    },
];
// colunas NOT NULL no Postgres: sem valor no MySQL, usa a hora da importação
const OBRIGATORIAS = new Set(['created_at', 'updated_at']);

const origem = await mysql.createConnection({ uri: process.env.MYSQL_URL, dateStrings: true, decimalNumbers: false });
const destino = new pg.Client({ connectionString: process.env.DATABASE_URL });
await destino.connect();

try {
    // ── confere o banco antigo ──
    const [tabelas] = await origem.query('SHOW TABLES');
    const existentes = new Set(tabelas.map((t) => Object.values(t)[0]));
    if (!existentes.has('vendas') && existentes.has('movimentos')) {
        throw new Error('O banco antigo está numa versão velha (tabela "movimentos"). Rode "php spark migrate" na Caderneta PHP antes.');
    }
    for (const t of TABELAS) if (!existentes.has(t.nome)) throw new Error(`O banco antigo não tem a tabela "${t.nome}".`);

    const dados = {};
    for (const t of TABELAS) {
        const [linhas] = await origem.query(`SELECT ${t.colunas.map((c) => '`' + c + '`').join(', ')} FROM \`${t.nome}\` ORDER BY id`);
        dados[t.nome] = linhas;
    }
    console.log('No banco antigo:');
    for (const t of TABELAS) console.log(`  ${t.nome.padEnd(12)} ${dados[t.nome].length}`);

    // aniversário no banco novo é só "dd/mm"
    let aniversariosDescartados = 0;
    for (const c of dados.clientes) {
        if (c.aniversario && !/^\d{2}\/\d{2}$/.test(c.aniversario)) {
            c.aniversario = null;
            aniversariosDescartados++;
        }
    }

    await destino.query('BEGIN');

    // ── o banco novo precisa estar sem esses dados (ou --substituir) ──
    const ocupadas = [];
    for (const t of TABELAS) {
        const r = await destino.query(`SELECT count(*)::int AS n FROM ${t.nome}`);
        if (r.rows[0].n > 0) ocupadas.push(`${t.nome} (${r.rows[0].n})`);
    }
    if (ocupadas.length && !substituir) {
        throw new Error(
            `O banco novo já tem dados em: ${ocupadas.join(', ')}.\n` +
                'Para apagar esses dados e importar por cima, rode de novo com --substituir (usuários e senhas ficam).',
        );
    }
    if (ocupadas.length) {
        await destino.query('TRUNCATE pagamentos, venda_itens, vendas, produtos, clientes, categorias, operacoes RESTART IDENTITY CASCADE');
        console.log('Dados antigos do banco novo apagados (--substituir).');
    }

    // ── copia em lotes ──
    for (const t of TABELAS) {
        const linhas = dados[t.nome];
        for (let i = 0; i < linhas.length; i += 500) {
            const lote = linhas.slice(i, i + 500);
            const params = [];
            const valores = lote.map((l) => {
                const marcas = t.colunas.map((c) => {
                    params.push(l[c] ?? null);
                    const p = `$${params.length}`;
                    if (!t.datas.includes(c)) return p;
                    const ts = `(${p}::timestamp AT TIME ZONE '${FUSO}')`;
                    return OBRIGATORIAS.has(c) ? `COALESCE(${ts}, now())` : ts;
                });
                return `(${marcas.join(', ')})`;
            });
            await destino.query(`INSERT INTO ${t.nome} (${t.colunas.join(', ')}) VALUES ${valores.join(', ')}`, params);
        }
        // próximos ids continuam depois dos importados
        await destino.query(`SELECT setval(pg_get_serial_sequence('${t.nome}', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${t.nome}), 1), (SELECT COUNT(*) > 0 FROM ${t.nome}))`);
    }

    // ── saldo e último movimento recalculados no banco novo (não confia no valor guardado) ──
    await destino.query(`UPDATE clientes c SET
        saldo = (SELECT COALESCE(SUM(i.qtd * i.preco), 0) FROM vendas v JOIN venda_itens i ON i.venda_id = v.id
                 WHERE v.cliente_id = c.id AND v.cancelada_em IS NULL)
              - (SELECT COALESCE(SUM(p.valor), 0) FROM pagamentos p WHERE p.cliente_id = c.id AND p.estornado_em IS NULL),
        ultimo_movimento_em = (SELECT MAX(em) FROM (
                 SELECT v.em FROM vendas v WHERE v.cliente_id = c.id AND v.cancelada_em IS NULL
                 UNION ALL
                 SELECT p.em FROM pagamentos p WHERE p.cliente_id = c.id AND p.estornado_em IS NULL) m)`);

    // ── confere: o total devido tem que bater com o do banco antigo ──
    const [[antigo]] = await origem.query('SELECT COALESCE(SUM(saldo), 0) AS total FROM clientes');
    const novo = (await destino.query('SELECT COALESCE(SUM(saldo), 0)::float8 AS total FROM clientes')).rows[0];
    const diferenca = Math.abs(Number(antigo.total) - novo.total);
    if (diferenca > 0.009) {
        console.warn(`Atenção: saldo total no antigo R$ ${Number(antigo.total).toFixed(2)} e no novo R$ ${novo.total.toFixed(2)}.`);
        console.warn('O novo é recalculado a partir das vendas e pagamentos; a diferença vem de saldo desatualizado no antigo.');
    }

    await destino.query('COMMIT');
    console.log(`Importação concluída. Saldo total dos clientes: R$ ${novo.total.toFixed(2)}.`);
    if (aniversariosDescartados) console.log(`${aniversariosDescartados} aniversário(s) fora do formato dd/mm ficaram em branco.`);
} catch (e) {
    await destino.query('ROLLBACK').catch(() => {});
    console.error('Nada foi importado: ' + e.message);
    process.exitCode = 1;
} finally {
    await origem.end();
    await destino.end();
}
