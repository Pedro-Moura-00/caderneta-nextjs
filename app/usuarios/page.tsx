import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CabecalhoPagina, Pagina } from '@/components/ui';
import { exigirUsuario } from '@/lib/auth';
import { query } from '@/lib/db';
import { ListaUsuarios, MinhaSenha, type LinhaUsuario } from './usuarios';

export const metadata: Metadata = { title: 'Usuários' };

export default function Usuarios() {
    return (
        <Pagina>
            <CabecalhoPagina titulo="Usuários e senha" />
            <Suspense fallback={<div className="vazio">Carregando…</div>}>
                <Conteudo />
            </Suspense>
        </Pagina>
    );
}

async function Conteudo() {
    const eu = await exigirUsuario();
    const usuarios = eu.admin
        ? await query<LinhaUsuario>(
              `SELECT id, nome, login, admin, ativo, COALESCE(bloqueado_ate > now(), false) AS bloqueado
               FROM usuarios ORDER BY ativo DESC, nome, id`,
          )
        : [];
    return (
        <>
            <MinhaSenha nome={eu.nome} login={eu.login} />
            {eu.admin ? <ListaUsuarios usuarios={usuarios} euId={eu.id} /> : null}
        </>
    );
}
