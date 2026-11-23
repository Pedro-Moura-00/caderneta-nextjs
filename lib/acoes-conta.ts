'use server';

import { revalidatePath } from 'next/cache';
import type { Resultado } from './acoes';
import { SENHA_MIN, abrirSessao, autenticar, fecharSessao, hashSenha, usuarioAtual, type Usuario } from './auth';
import { query, transacao, um } from './db';

/* Entrar, sair e cadastro de usuários. */

const falha = (msg: string, destino?: string): Resultado => ({ ok: false, msg, cor: 'red', destino });
const sucesso = (msg: string, destino?: string): Resultado => ({ ok: true, msg, cor: 'green', destino });

function texto(fd: FormData, campo: string): string {
    const v = fd.get(campo);
    return typeof v === 'string' ? v.trim() : '';
}
function senhaDe(fd: FormData, campo = 'senha'): string {
    const v = fd.get(campo);
    return typeof v === 'string' ? v : '';
}

/** Só aceita destino interno (evita redirecionar para outro site depois do login). */
function destinoSeguro(v: string): string {
    return v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') && !v.startsWith('/entrar') ? v : '/';
}

function validarDados(nome: string, login: string): string | null {
    if (nome === '') return 'Digite o nome.';
    if (Array.from(nome).length > 80) return 'Nome muito longo (máx. 80).';
    if (!/^[a-z0-9._@-]{3,40}$/.test(login)) return 'Login: de 3 a 40 letras sem acento, números, ponto, hífen, sublinhado ou @ (pode ser um e-mail).';
    return null;
}
function validarSenha(senha: string, confirmacao: string): string | null {
    if (Array.from(senha).length < SENHA_MIN) return `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
    if (senha.length > 200) return 'Senha longa demais.';
    if (senha !== confirmacao) return 'As duas senhas não são iguais.';
    return null;
}

/* ── Entrar / sair ─────────────────────────────────────────── */

export async function entrar(fd: FormData): Promise<Resultado> {
    const r = await autenticar(texto(fd, 'login'), senhaDe(fd));
    if (!r.ok) return falha(r.msg);
    await abrirSessao(r.usuario.id);
    return sucesso(`Olá, ${r.usuario.nome}!`, destinoSeguro(texto(fd, 'de')));
}

/** Fecha a sessão. A tela recarrega inteira em seguida (BotaoSair), sem sobrar nada guardado. */
export async function sair(): Promise<void> {
    await fecharSessao();
}

/**
 * Primeiro acesso: cria o administrador. Só funciona com o banco sem usuários e com o
 * código de instalação (CODIGO_INSTALACAO), para ninguém de fora se cadastrar antes.
 */
export async function criarPrimeiroAdmin(fd: FormData): Promise<Resultado> {
    const codigo = process.env.CODIGO_INSTALACAO?.trim();
    if (!codigo) return falha('Defina CODIGO_INSTALACAO no servidor para criar o primeiro usuário.');
    if (texto(fd, 'codigo') !== codigo) return falha('Código de instalação incorreto.');

    const nome = texto(fd, 'nome');
    const login = texto(fd, 'login').toLowerCase();
    const senha = senhaDe(fd);
    const erro = validarDados(nome, login) ?? validarSenha(senha, senhaDe(fd, 'confirmacao'));
    if (erro) return falha(erro);
    const hash = await hashSenha(senha);

    const id = await transacao(async (db) => {
        // trava a tabela: dois pedidos ao mesmo tempo não criam dois "primeiros"
        await db.query('LOCK TABLE usuarios IN EXCLUSIVE MODE');
        const existe = await db.query('SELECT 1 FROM usuarios LIMIT 1');
        if (existe.rowCount) return null;
        const r = await db.query<{ id: number }>(
            'INSERT INTO usuarios (nome, login, senha_hash, admin) VALUES ($1, $2, $3, true) RETURNING id',
            [nome, login, hash],
        );
        return r.rows[0].id;
    });
    if (id === null) return falha('O administrador já foi criado. Entre com login e senha.');
    await abrirSessao(id);
    return sucesso('Administrador criado. Bem-vindo!', '/');
}

/* ── Usuários (só administrador) ───────────────────────────── */

async function comAdmin(fn: (eu: Usuario) => Promise<Resultado>): Promise<Resultado> {
    const eu = await usuarioAtual();
    if (!eu) return falha('Sua sessão terminou. Entre de novo.', '/entrar');
    if (!eu.admin) return falha('Só o administrador pode mexer nos usuários.');
    const r = await fn(eu);
    revalidatePath('/usuarios');
    return r;
}

export async function criarUsuario(fd: FormData): Promise<Resultado> {
    return comAdmin(async () => {
        const nome = texto(fd, 'nome');
        const login = texto(fd, 'login').toLowerCase();
        const senha = senhaDe(fd);
        const erro = validarDados(nome, login) ?? validarSenha(senha, senhaDe(fd, 'confirmacao'));
        if (erro) return falha(erro);
        if (await um('SELECT 1 FROM usuarios WHERE login = $1', [login])) return falha('Já existe alguém com esse login.');
        await query('INSERT INTO usuarios (nome, login, senha_hash, admin) VALUES ($1, $2, $3, $4)', [
            nome,
            login,
            await hashSenha(senha),
            fd.get('admin') === 'on',
        ]);
        return sucesso(`${nome} pode entrar com o login "${login}"`);
    });
}

/** Muda nome, administrador e ativo. Não deixa a Caderneta sem administrador ativo. */
export async function alterarUsuario(usuarioId: number, fd: FormData): Promise<Resultado> {
    return comAdmin(async (eu) => {
        const nome = texto(fd, 'nome');
        if (nome === '' || Array.from(nome).length > 80) return falha('Digite um nome de até 80 caracteres.');
        const admin = fd.get('admin') === 'on';
        const ativo = fd.get('ativo') === 'on';
        if (usuarioId === eu.id && (!admin || !ativo)) return falha('Você não pode tirar o próprio acesso de administrador.');
        return transacao(async (db) => {
            await db.query('LOCK TABLE usuarios IN EXCLUSIVE MODE');
            const r = await db.query('UPDATE usuarios SET nome = $2, admin = $3, ativo = $4, updated_at = now() WHERE id = $1', [
                usuarioId,
                nome,
                admin,
                ativo,
            ]);
            if (r.rowCount === 0) return falha('Usuário não encontrado.');
            const admins = await db.query('SELECT 1 FROM usuarios WHERE admin AND ativo LIMIT 1');
            if (admins.rowCount === 0) throw new Error('sem administrador');
            if (!ativo) await db.query('DELETE FROM sessoes WHERE usuario_id = $1', [usuarioId]);
            return sucesso('Usuário atualizado');
        }).catch((e: Error) => {
            if (e.message === 'sem administrador') return falha('Precisa ficar pelo menos um administrador ativo.');
            throw e;
        });
    });
}

/** Administrador define uma senha nova para alguém (que perdeu a dele). */
export async function redefinirSenha(usuarioId: number, fd: FormData): Promise<Resultado> {
    return comAdmin(async () => {
        const senha = senhaDe(fd);
        const erro = validarSenha(senha, senhaDe(fd, 'confirmacao'));
        if (erro) return falha(erro);
        const r = await query<{ nome: string }>(
            'UPDATE usuarios SET senha_hash = $2, tentativas = 0, bloqueado_ate = NULL, updated_at = now() WHERE id = $1 RETURNING nome',
            [usuarioId, await hashSenha(senha)],
        );
        if (r.length === 0) return falha('Usuário não encontrado.');
        // quem estava logado com a senha antiga precisa entrar de novo
        await query('DELETE FROM sessoes WHERE usuario_id = $1', [usuarioId]);
        return sucesso(`Senha de ${r[0].nome} trocada`);
    });
}

/** Qualquer usuário troca a própria senha (precisa da atual). */
export async function trocarMinhaSenha(fd: FormData): Promise<Resultado> {
    const eu = await usuarioAtual();
    if (!eu) return falha('Sua sessão terminou. Entre de novo.', '/entrar');
    const atual = await autenticar(eu.login, senhaDe(fd, 'atual'));
    if (!atual.ok) return falha('A senha atual está errada.');
    const senha = senhaDe(fd);
    const erro = validarSenha(senha, senhaDe(fd, 'confirmacao'));
    if (erro) return falha(erro);
    await query('UPDATE usuarios SET senha_hash = $2, updated_at = now() WHERE id = $1', [eu.id, await hashSenha(senha)]);
    // derruba as outras sessões e abre uma nova aqui
    await query('DELETE FROM sessoes WHERE usuario_id = $1', [eu.id]);
    await abrirSessao(eu.id);
    return sucesso('Senha trocada');
}
