import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Icone } from '@/components/Icone';
import { CabecalhoPagina, EstadoVazio, Pagina } from '@/components/ui';
import { rotuloForma } from '@/lib/config';
import * as dados from '@/lib/dados';
import { brl, diaBr, diaDe, ehDia, horaDe, somarDias } from '@/lib/formato';
import { BotaoCancelarVenda } from './cancelar';

export const metadata: Metadata = { title: 'Vendas à vista' };

/** Vendas à vista de um dia (para conferir e cancelar). */
export default function Vendas({ searchParams }: PageProps<'/vendas'>) {
    return (
        <Pagina>
            <CabecalhoPagina titulo="Vendas à vista" />
            <Suspense fallback={<div className="vazio">Carregando…</div>}>
                <Conteudo searchParams={searchParams} />
            </Suspense>
        </Pagina>
    );
}

async function Conteudo({ searchParams }: Pick<PageProps<'/vendas'>, 'searchParams'>) {
    const pedido = (await searchParams).dia;
    await connection();
    const hoje = diaDe(new Date());
    const dia = ehDia(pedido) ? pedido : hoje;
    const vendas = await dados.avistaDoDia(dia);
    const validas = vendas.filter((v) => !v.cancelada_em);
    const total = validas.reduce((s, v) => s + v.total, 0);
    const anterior = somarDias(dia, -1);
    const seguinte = dia < hoje ? somarDias(dia, 1) : null;

    return (
        <>
            <nav className="mb-4 flex items-center gap-2" aria-label="Dia">
                <Link href={`/vendas?dia=${anterior}`} className="btn-icone h-[50px] w-[50px] rounded-xl" aria-label="Dia anterior">
                    <Icone nome="chevron-left" tamanho={22} />
                </Link>
                <form method="get" action="/vendas" className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                        key={dia}
                        type="date"
                        name="dia"
                        defaultValue={dia}
                        max={hoje}
                        aria-label="Escolher dia"
                        className="campo mt-0 h-[50px] min-w-0 flex-1 px-2.5 text-base"
                    />
                    <button type="submit" className="btn btn-m btn-claro">
                        Ver
                    </button>
                </form>
                {seguinte ? (
                    <Link href={`/vendas?dia=${seguinte}`} className="btn-icone h-[50px] w-[50px] rounded-xl" aria-label="Dia seguinte">
                        <Icone nome="chevron-right" tamanho={22} />
                    </Link>
                ) : null}
            </nav>

            <div className="mb-4 flex items-center justify-between rounded-2xl border-2 border-verde-borda bg-verde-fundo px-[18px] py-4">
                <div>
                    <div className="sobretitulo">{dia === hoje ? 'Vendido à vista hoje' : `Vendido à vista em ${diaBr(dia)}`}</div>
                    <div className="titulo text-[32px] leading-tight text-verde">{brl(total)}</div>
                </div>
                <div className="text-right text-sm text-suave">{validas.length} venda(s)</div>
            </div>

            {vendas.length === 0 ? (
                <EstadoVazio titulo="Nenhuma venda à vista nesse dia." />
            ) : (
                <div className="flex flex-col gap-2">
                    {vendas.map((v) => {
                        const cancelada = v.cancelada_em !== null;
                        const hora = horaDe(v.em);
                        return (
                            <article key={v.id} className={`cartao px-4 py-3 ${cancelada ? 'opacity-70' : ''}`}>
                                <div className="mb-1.5 flex items-center gap-2">
                                    <span className="flex items-center gap-1 text-sm text-suave">
                                        <Icone nome="clock" tamanho={14} /> {hora}
                                    </span>
                                    <span className="text-sm text-suave">· {rotuloForma(v.forma)}</span>
                                    <span className={`titulo ml-auto text-xl ${cancelada ? 'text-suave line-through' : ''}`}>{brl(v.total)}</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {v.itens.map((i) => (
                                        <span key={i.id} className="rounded-full border border-linha bg-fundo px-2.5 py-1 text-[13px] font-semibold">
                                            {i.qtd}× {i.nome}
                                        </span>
                                    ))}
                                </div>
                                {cancelada ? (
                                    <div className="mt-2 text-sm font-semibold text-vermelho">Cancelada · {v.motivo_cancelamento}</div>
                                ) : (
                                    <div className="mt-2 text-right">
                                        <BotaoCancelarVenda vendaId={v.id} descricao={`${hora} · ${brl(v.total)} · ${rotuloForma(v.forma)}`} />
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </div>
            )}
        </>
    );
}
