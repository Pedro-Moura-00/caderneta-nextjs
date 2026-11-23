import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CabecalhoPagina, Pagina } from '@/components/ui';
import * as dados from '@/lib/dados';
import { Catalogo } from './catalogo';

export const metadata: Metadata = { title: 'Produtos' };

/** Catálogo: produtos e categorias. */
export default function Produtos() {
    return (
        <Pagina>
            <CabecalhoPagina titulo="Produtos e preços" />
            <Suspense fallback={<div className="vazio">Carregando…</div>}>
                <Conteudo />
            </Suspense>
        </Pagina>
    );
}

async function Conteudo() {
    const [categorias, produtos] = await Promise.all([dados.categorias(), dados.produtos()]);
    return <Catalogo categorias={categorias} produtos={produtos} />;
}
