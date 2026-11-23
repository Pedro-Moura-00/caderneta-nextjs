'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import type { Resultado } from '@/lib/acoes';
import { FORMAS, IDS_FORMAS, type Forma } from '@/lib/config';
import { Icone } from './Icone';

/* ── Aviso (toast) ─────────────────────────────────────────── */

type Aviso = { msg: string; cor: Resultado['cor']; n: number };
const AvisoCtx = createContext<(msg: string, cor?: Resultado['cor']) => void>(() => {});

const CORES_AVISO = { green: 'bg-verde', red: 'bg-vermelho', amber: 'bg-ambar text-ambar-texto' } as const;

export function AvisoProvider({ children }: { children: ReactNode }) {
    const [aviso, setAviso] = useState<Aviso | null>(null);
    const mostrar = useCallback((msg: string, cor: Resultado['cor'] = 'green') => setAviso({ msg, cor, n: Date.now() }), []);
    useEffect(() => {
        if (!aviso) return;
        const t = setTimeout(() => setAviso(null), 2600);
        return () => clearTimeout(t);
    }, [aviso]);
    return (
        <AvisoCtx.Provider value={mostrar}>
            {children}
            {aviso ? (
                <div key={aviso.n} className={`toast ${CORES_AVISO[aviso.cor]}`} role="status">
                    {aviso.msg}
                </div>
            ) : null}
        </AvisoCtx.Provider>
    );
}

export const useAviso = () => useContext(AvisoCtx);

/** Token único por envio de formulário (o servidor ignora envios repetidos). */
export function novoToken(): string {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Executa uma ação do servidor: mostra o aviso, navega se for o caso e
 * chama `aoConcluir` quando deu certo (ex.: fechar o modal).
 */
export function useAcao() {
    const router = useRouter();
    const avisar = useAviso();
    const [pendente, iniciar] = useTransition();
    const executar = useCallback(
        (acao: () => Promise<Resultado>, aoConcluir?: () => void) => {
            iniciar(async () => {
                try {
                    const r = await acao();
                    avisar(r.msg, r.cor);
                    if (r.ok) aoConcluir?.();
                    if (r.destino) router.push(r.destino);
                } catch {
                    avisar('Não deu certo. Tente de novo.', 'red');
                }
            });
        },
        [avisar, router],
    );
    return [executar, pendente] as const;
}

/* ── Modal ─────────────────────────────────────────────────── */

export function Modal({
    aberto,
    aoFechar,
    titulo,
    largura = 'max-w-lg',
    children,
}: {
    aberto: boolean;
    aoFechar: () => void;
    titulo: ReactNode;
    largura?: string;
    children: ReactNode;
}) {
    const caixa = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!aberto) return;
        const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
        document.addEventListener('keydown', tecla);
        // foco no primeiro campo só com mouse (no celular abriria o teclado)
        if (window.matchMedia('(pointer: fine)').matches) {
            caixa.current?.querySelector<HTMLInputElement>('[autofocus], input:not([type=hidden])')?.focus();
        }
        return () => document.removeEventListener('keydown', tecla);
    }, [aberto, aoFechar]);
    if (!aberto) return null;
    return (
        <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={typeof titulo === 'string' ? titulo : undefined}
            onClick={(e) => e.target === e.currentTarget && aoFechar()}
        >
            <div ref={caixa} className={`modal-caixa ${largura}`}>
                <div className="modal-cabeca">
                    <h2 className="titulo text-2xl">{titulo}</h2>
                    <button
                        type="button"
                        onClick={aoFechar}
                        className="toque flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-fundo"
                        aria-label="Fechar"
                    >
                        <Icone nome="x" tamanho={22} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

/** Estado aberto/fechado de um modal. */
export function useModal<T = true>() {
    const [dados, setDados] = useState<T | null>(null);
    const fechar = useCallback(() => setDados(null), []);
    return { aberto: dados !== null, dados, abrir: setDados as (d: T) => void, fechar };
}

/* ── Seletor de forma de pagamento ─────────────────────────── */

export function SeletorFormas({
    valor,
    aoMudar,
    tamanho = 'min-h-[68px] flex-col text-sm',
}: {
    valor: Forma;
    aoMudar: (f: Forma) => void;
    tamanho?: string;
}) {
    return (
        <div className="mb-4 grid grid-cols-3 gap-2">
            <input type="hidden" name="forma" value={valor} />
            {IDS_FORMAS.map((id) => (
                <button key={id} type="button" className={`opcao ${tamanho}`} aria-pressed={id === valor} onClick={() => aoMudar(id)}>
                    <Icone nome={FORMAS[id].icone} tamanho={22} /> {FORMAS[id].rotulo}
                </button>
            ))}
        </div>
    );
}

/* ── Formulário que pede confirmação ───────────────────────── */

/** Botão que confirma (window.confirm) e executa uma ação. */
export function BotaoConfirmar({
    pergunta,
    acao,
    className,
    rotulo,
    children,
}: {
    pergunta: string;
    acao: () => Promise<Resultado>;
    className?: string;
    rotulo?: string;
    children: ReactNode;
}) {
    const [executar, pendente] = useAcao();
    return (
        <button
            type="button"
            className={className}
            aria-label={rotulo}
            disabled={pendente}
            aria-busy={pendente || undefined}
            onClick={() => window.confirm(pergunta) && executar(acao)}
        >
            {children}
        </button>
    );
}

/** Botão que executa uma ação direto (sem confirmar). */
export function BotaoAcao({ acao, className, children }: { acao: () => Promise<Resultado>; className?: string; children: ReactNode }) {
    const [executar, pendente] = useAcao();
    return (
        <button type="button" className={className} disabled={pendente} aria-busy={pendente || undefined} onClick={() => executar(acao)}>
            {children}
        </button>
    );
}
