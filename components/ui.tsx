import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icone } from './Icone';

/* Componentes de interface sem estado (servidor ou cliente). */

export function EstadoVazio({ titulo, texto, children }: { titulo: string; texto?: string; children?: ReactNode }) {
    return (
        <div className="vazio">
            <div className="text-base font-semibold text-tinta">{titulo}</div>
            {texto ? <div className="mt-1 text-sm">{texto}</div> : null}
            {children}
        </div>
    );
}

/** Cabeçalho das telas internas: voltar + título (+ algo à direita). */
export function CabecalhoPagina({
    titulo,
    voltarPara = '/',
    direita,
    subtitulo,
}: {
    titulo: string;
    voltarPara?: string;
    direita?: ReactNode;
    subtitulo?: ReactNode;
}) {
    return (
        <div className="mb-4 flex items-center gap-3">
            <Link
                href={voltarPara}
                className="toque flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border-2 border-linha bg-painel"
                aria-label="Voltar"
            >
                <Icone nome="arrow-left" tamanho={24} />
            </Link>
            <div className="min-w-0 flex-1">
                <h1 className="titulo truncate text-[28px] leading-none">{titulo}</h1>
                {subtitulo ? <div className="mt-1 flex items-center gap-1 text-sm text-suave">{subtitulo}</div> : null}
            </div>
            {direita}
        </div>
    );
}

/** Campo de texto com rótulo. */
export function Campo({
    rotulo,
    className = 'mb-3 block',
    ...input
}: { rotulo: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <label className={className}>
            <span className="rotulo">{rotulo}</span>
            <input className="campo" {...input} />
        </label>
    );
}

/** Campo de valor em reais (aceita só dígitos, vírgula e ponto). */
export function CampoMoeda({
    rotulo,
    ...input
}: { rotulo: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onInput'>) {
    return (
        <label className="mb-4 block">
            <span className="rotulo">{rotulo}</span>
            <span className="campo-moeda">
                <span className="titulo text-2xl text-suave">R$</span>
                <input
                    inputMode="decimal"
                    placeholder="0,00"
                    autoComplete="off"
                    {...input}
                    onInput={(e) => {
                        e.currentTarget.value = e.currentTarget.value.replace(/[^0-9.,]/g, '');
                    }}
                />
            </span>
        </label>
    );
}

/** Página centralizada padrão. */
export function Pagina({ children, largura = 'max-w-[820px]' }: { children: ReactNode; largura?: string }) {
    return <main className={`mx-auto ${largura} px-4 pt-5 pb-12 sm:px-5`}>{children}</main>;
}
