import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Pagina } from '@/components/ui';
import { existeUsuario, usuarioAtual } from '@/lib/auth';
import { nomeBar } from '@/lib/bar';
import { FormEntrar, FormPrimeiroAdmin } from './formularios';

export const metadata: Metadata = { title: 'Entrar' };

export default function Entrar({ searchParams }: PageProps<'/entrar'>) {
    return (
        <Pagina largura="max-w-[440px]">
            <div className="mt-6 mb-5 rounded-2xl bg-tinta px-5 py-5 text-white">
                <h1 className="titulo text-[30px] leading-none">{nomeBar}</h1>
                <div className="mt-1 text-sm text-[#C7D2CB]">Caderneta</div>
            </div>
            <Suspense fallback={<div className="vazio">Carregando…</div>}>
                <Conteudo searchParams={searchParams} />
            </Suspense>
        </Pagina>
    );
}

async function Conteudo({ searchParams }: Pick<PageProps<'/entrar'>, 'searchParams'>) {
    const de = (await searchParams).de;
    if (await usuarioAtual()) redirect('/');
    if (!(await existeUsuario())) return <FormPrimeiroAdmin />;
    return <FormEntrar de={typeof de === 'string' ? de : '/'} />;
}
