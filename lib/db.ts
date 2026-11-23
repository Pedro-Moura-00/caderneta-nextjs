import 'server-only';
import { connection } from 'next/server';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { FUSO } from './config';

/** Conexão (ou transação) com o banco. */
export type Db = Pick<PoolClient, 'query'>;

const global_ = globalThis as unknown as { __barPool?: Pool };

/** Um pool só por processo (o hot reload do dev não abre conexões novas). */
function pool(): Pool {
    if (!global_.__barPool) {
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL não definida. Copie .env.example para .env.local.');
        }
        global_.__barPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            // datas agrupadas e comparadas no horário do bar
            options: `-c timezone=${FUSO}`,
            max: 10,
        });
    }
    return global_.__barPool;
}

export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    // dados do banco são sempre lidos na hora da requisição (nunca no build)
    await connection();
    return (await pool().query<T>(sql, params)).rows;
}

export async function um<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
    return (await query<T>(sql, params))[0] ?? null;
}

/** Executa o bloco numa transação; qualquer exceção desfaz tudo. */
export async function transacao<T>(bloco: (db: Db) => Promise<T>): Promise<T> {
    await connection();
    const client = await pool().connect();
    try {
        await client.query('BEGIN');
        const r = await bloco(client);
        await client.query('COMMIT');
        return r;
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }
}

/** Operação recusada por uma regra do negócio. A mensagem vai direto para o aviso. */
export class RegraNegocio extends Error {}

/** Envio já processado (token repetido): a transação é desfeita sem erro. */
export class EnvioRepetido extends Error {}

/**
 * Executa a ação numa transação, uma única vez por token de formulário.
 * Retorna null se esse envio já tinha sido processado.
 */
export async function umaVez<T>(token: unknown, acao: (db: Db) => Promise<T>): Promise<T | null> {
    try {
        return await transacao(async (db) => {
            if (typeof token === 'string' && /^[a-f0-9]{32}$/.test(token)) {
                const r = await db.query('INSERT INTO operacoes (token) VALUES ($1) ON CONFLICT DO NOTHING', [token]);
                if (r.rowCount === 0) throw new EnvioRepetido();
                await db.query("DELETE FROM operacoes WHERE criado_em < now() - interval '7 days'");
            }
            return acao(db);
        });
    } catch (e) {
        if (e instanceof EnvioRepetido) return null;
        throw e;
    }
}
