'use client';

import { useState, type ReactNode } from 'react';
import { sair } from '@/lib/acoes-conta';
import type { Categoria, Produto } from '@/lib/dados';
import { ModalCliente, ModalVenda } from './formularios';
import { useModal } from './interativos';

/** Botão que abre o modal de novo cliente. */
export function BotaoNovoCliente({ className, nomeInicial, children }: { className: string; nomeInicial?: string; children: ReactNode }) {
    const m = useModal();
    return (
        <>
            <button type="button" className={className} onClick={() => m.abrir(true)}>
                {children}
            </button>
            <ModalCliente aberto={m.aberto} aoFechar={m.fechar} titulo="Novo cliente" botao="Salvar e abrir conta" nomeInicial={nomeInicial} />
        </>
    );
}

/** Sai e recarrega a página inteira (o navegador não guarda as telas de antes). */
export function BotaoSair({ className }: { className: string }) {
    const [saindo, setSaindo] = useState(false);
    return (
        <button
            type="button"
            className={className}
            disabled={saindo}
            onClick={async () => {
                setSaindo(true);
                await sair().catch(() => {});
                window.location.replace('/entrar');
            }}
        >
            Sair
        </button>
    );
}

/** Botão que abre o carrinho de venda à vista. */
export function BotaoVendaAvista({
    className,
    categorias,
    produtos,
    children,
}: {
    className: string;
    categorias: Categoria[];
    produtos: Produto[];
    children: ReactNode;
}) {
    const m = useModal();
    return (
        <>
            <button type="button" className={className} onClick={() => m.abrir(true)}>
                {children}
            </button>
            <ModalVenda aberto={m.aberto} aoFechar={m.fechar} titulo="Venda à vista" modo="avista" categorias={categorias} produtos={produtos} />
        </>
    );
}
