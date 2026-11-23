import 'server-only';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { query, um } from './db';

/*
 * Login: senhas com scrypt (sal aleatório), sessão em cookie httpOnly cujo token
 * só existe em hash no banco. A verificação de verdade acontece aqui, perto dos dados;
 * o proxy.ts só redireciona quem nem tem o cookie.
 */

export const COOKIE_SESSAO = 'caderneta_sessao';
const DIAS_SESSAO = 30;
const TENTATIVAS_MAX = 5;
const MINUTOS_BLOQUEIO = 10;
export const SENHA_MIN = 8;

export type Usuario = { id: number; nome: string; login: string; admin: boolean };

const scryptAsync = promisify(scrypt) as (senha: string, sal: Buffer, tamanho: number) => Promise<Buffer>;

export async function hashSenha(senha: string): Promise<string> {
    const sal = randomBytes(16);
    const hash = await scryptAsync(senha.normalize('NFC'), sal, 64);
    return `scrypt$${sal.toString('base64')}$${hash.toString('base64')}`;
}

async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
    const [tipo, sal, hash] = guardado.split('$');
    if (tipo !== 'scrypt' || !sal || !hash) return false;
    const esperado = Buffer.from(hash, 'base64');
    const calculado = await scryptAsync(senha.normalize('NFC'), Buffer.from(sal, 'base64'), esperado.length);
    return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

// usado quando o login não existe, para a resposta demorar o mesmo tanto
const HASH_FALSO = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Cookie "Secure" só quando o acesso é por https (no notebook, a rede local usa http). */
async function viaHttps(): Promise<boolean> {
    const h = await headers();
    return (h.get('x-forwarded-proto') ?? '').split(',')[0].trim() === 'https';
}

export type ResultadoEntrada = { ok: true; usuario: Usuario } | { ok: false; msg: string };

/** Confere login e senha, com bloqueio temporário depois de várias tentativas erradas. */
export async function autenticar(login: string, senha: string): Promise<ResultadoEntrada> {
    const u = await um<Usuario & { senha_hash: string; ativo: boolean; bloqueado: boolean }>(
        `SELECT id, nome, login, admin, senha_hash, ativo, COALESCE(bloqueado_ate > now(), false) AS bloqueado
         FROM usuarios WHERE login = $1`,
        [login.trim().toLowerCase()],
    );
    const certa = await conferirSenha(senha, u?.senha_hash ?? HASH_FALSO);
    const errado = { ok: false as const, msg: 'Login ou senha incorretos.' };
    if (!u || !u.ativo) return errado;
    if (u.bloqueado) return { ok: false, msg: `Muitas tentativas erradas. Espere ${MINUTOS_BLOQUEIO} minutos e tente de novo.` };
    if (!certa) {
        // depois que um bloqueio vence, a contagem recomeça
        await query(
            `UPDATE usuarios u SET tentativas = t.n,
                    bloqueado_ate = CASE WHEN t.n >= $2 THEN now() + make_interval(mins => $3) END
             FROM (SELECT CASE WHEN bloqueado_ate IS NOT NULL THEN 1 ELSE tentativas + 1 END AS n
                   FROM usuarios WHERE id = $1) t
             WHERE u.id = $1`,
            [u.id, TENTATIVAS_MAX, MINUTOS_BLOQUEIO],
        );
        return errado;
    }
    await query('UPDATE usuarios SET tentativas = 0, bloqueado_ate = NULL WHERE id = $1', [u.id]);
    return { ok: true, usuario: { id: u.id, nome: u.nome, login: u.login, admin: u.admin } };
}

/** Abre a sessão (grava o cookie). Só pode ser chamada numa Server Action. */
export async function abrirSessao(usuarioId: number): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    await query("DELETE FROM sessoes WHERE expira_em < now()");
    await query(`INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES ($1, $2, now() + make_interval(days => $3))`, [
        hashToken(token),
        usuarioId,
        DIAS_SESSAO,
    ]);
    (await cookies()).set(COOKIE_SESSAO, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: await viaHttps(),
        path: '/',
        maxAge: DIAS_SESSAO * 24 * 3600,
    });
}

/** Fecha a sessão atual. Só pode ser chamada numa Server Action. */
export async function fecharSessao(): Promise<void> {
    const jar = await cookies();
    const token = jar.get(COOKIE_SESSAO)?.value;
    if (token) await query('DELETE FROM sessoes WHERE token_hash = $1', [hashToken(token)]);
    jar.delete(COOKIE_SESSAO);
}

/** Usuário da sessão atual (ou null). Uma consulta por requisição. */
export const usuarioAtual = cache(async (): Promise<Usuario | null> => {
    const token = (await cookies()).get(COOKIE_SESSAO)?.value;
    if (!token) return null;
    return um<Usuario>(
        `SELECT u.id, u.nome, u.login, u.admin
         FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
         WHERE s.token_hash = $1 AND s.expira_em > now() AND u.ativo`,
        [hashToken(token)],
    );
});

/** Para as telas: sem sessão válida, vai para a entrada. */
export async function exigirUsuario(): Promise<Usuario> {
    const u = await usuarioAtual();
    if (!u) redirect('/entrar');
    return u;
}

export async function existeUsuario(): Promise<boolean> {
    return (await um('SELECT 1 FROM usuarios LIMIT 1')) !== null;
}
