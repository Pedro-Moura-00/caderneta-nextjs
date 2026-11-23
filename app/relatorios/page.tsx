import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Icone, type NomeIcone } from '@/components/Icone';
import { CabecalhoPagina, EstadoVazio, Pagina } from '@/components/ui';
import { FORMAS } from '@/lib/config';
import * as dados from '@/lib/dados';
import { brl, corCss, diaDe } from '@/lib/formato';
import { lerPeriodo, rotuloPeriodo } from './periodo';

export const metadata: Metadata = { title: 'Relatórios' };

type Css = React.CSSProperties & Record<'--cor', string>;
type Linha = { rotulo: string; valor: number; cor: string | null; icone: NomeIcone | null; sub: string | null };

const ABAS = [
    ['dia', 'Dia'],
    ['semana', 'Semana'],
    ['mes', 'Mês'],
    ['ano', 'Ano'],
] as const;

export default function Relatorios({ searchParams }: PageProps<'/relatorios'>) {
    return (
        <Pagina>
            <CabecalhoPagina titulo="Relatórios" />
            <Suspense fallback={<div className="vazio">Carregando…</div>}>
                <Conteudo searchParams={searchParams} />
            </Suspense>
        </Pagina>
    );
}

/** Barra horizontal proporcional ao maior valor do grupo. */
const barra = (valor: number, maximo: number) => Math.max(3, maximo > 0 ? (valor / maximo) * 100 : 0);

async function Conteudo({ searchParams }: Pick<PageProps<'/relatorios'>, 'searchParams'>) {
    const sp = await searchParams;
    await connection();
    const hoje = diaDe(new Date());
    const { periodo, de, ate } = lerPeriodo(sp, hoje);
    const r = await dados.resumo(de, ate);

    const secoes: [string, Linha[], string][] = [
        [
            'Por forma de pagamento',
            r.porForma.map((f) => ({ rotulo: f.rotulo, valor: f.valor, cor: '#2F9E44', icone: FORMAS[f.id].icone, sub: null })),
            '',
        ],
        [
            `Mais vendidos · ${r.itensQtd} itens`,
            r.topProd.map((x) => ({ rotulo: x.nome, valor: x.valor, cor: x.cor, icone: null, sub: `${x.qtd} un` })),
            'Nenhum consumo no período.',
        ],
        ['Por categoria', r.porCat.map((x) => ({ rotulo: x.nome, valor: x.valor, cor: x.cor, icone: null, sub: null })), 'Nenhum consumo no período.'],
    ];

    return (
        <>
            <nav className="mb-3 grid grid-cols-4 gap-2" aria-label="Período">
                {ABAS.map(([pid, rot]) => (
                    <Link
                        key={pid}
                        href={`/relatorios?p=${pid}`}
                        className="opcao min-h-[50px] text-[15px]"
                        aria-pressed={pid === periodo}
                        aria-current={pid === periodo ? 'page' : undefined}
                    >
                        {rot}
                    </Link>
                ))}
            </nav>
            <form method="get" action="/relatorios" className="mb-3 flex flex-wrap items-end gap-2" aria-label="Período personalizado" key={`${de}-${ate}`}>
                <input type="hidden" name="p" value="personalizado" />
                <label className="min-w-[130px] flex-1">
                    <span className="rotulo">De</span>
                    <input type="date" name="de" defaultValue={de} max={hoje} className="campo h-[46px] text-base" />
                </label>
                <label className="min-w-[130px] flex-1">
                    <span className="rotulo">Até</span>
                    <input type="date" name="ate" defaultValue={ate} max={hoje} className="campo h-[46px] text-base" />
                </label>
                <button type="submit" className="opcao h-[46px] px-4 text-[15px]" aria-pressed={periodo === 'personalizado'}>
                    Ver período
                </button>
            </form>
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-suave capitalize">{rotuloPeriodo(periodo, de, ate)}</span>
                <a
                    href={`/relatorios/exportar?${new URLSearchParams({ de, ate })}`}
                    className="toque inline-flex items-center gap-1 text-sm font-bold text-ambar-escuro"
                >
                    <Icone nome="download" tamanho={16} /> Exportar planilha (CSV)
                </a>
            </div>

            {r.vazio ? (
                <EstadoVazio titulo="Nenhum movimento nesse período." />
            ) : (
                <>
                    <div className="mb-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border-2 border-verde-borda bg-verde-fundo px-[18px] py-4">
                            <div className="sobretitulo">Recebido (caixa)</div>
                            <div className="titulo text-[32px] leading-tight text-verde">{brl(r.recebido)}</div>
                        </div>
                        <div className="rounded-2xl border-2 border-ambar-borda bg-ambar-claro px-[18px] py-4">
                            <div className="sobretitulo">Consumido (vendido)</div>
                            <div className="titulo text-[32px] leading-tight text-ambar-escuro">{brl(r.consumido)}</div>
                        </div>
                    </div>

                    <section className="cartao mb-3 px-[18px] py-4">
                        <h2 className="titulo mb-3 text-lg">Entrada de dinheiro</h2>
                        <Link href="/vendas" className="flex items-center justify-between py-1">
                            <span className="text-[15px] font-medium text-suave underline decoration-linha underline-offset-4">Vendas à vista</span>
                            <span className="titulo text-lg">{brl(r.avista)}</span>
                        </Link>
                        <div className="flex items-center justify-between py-1">
                            <span className="text-[15px] font-medium text-suave">Recebido de fiado</span>
                            <span className="titulo text-lg">{brl(r.fiadoRecebido)}</span>
                        </div>
                        <div className="my-2 h-px bg-linha" />
                        <div className="flex items-center justify-between py-1">
                            <span className="text-[15px] font-bold">Total recebido</span>
                            <span className="titulo text-[22px] text-verde">{brl(r.recebido)}</span>
                        </div>
                    </section>

                    {secoes.map(([titulo, linhas, vazio]) => {
                        const maximo = Math.max(1, ...linhas.map((l) => l.valor));
                        return (
                            <section key={titulo} className="cartao mb-3 px-[18px] py-4">
                                <h2 className="titulo mb-3 text-lg">{titulo}</h2>
                                {linhas.length === 0 ? <div className="text-sm text-suave">{vazio}</div> : null}
                                {linhas.map((l) => (
                                    <div key={l.rotulo} className="mb-3" style={{ '--cor': corCss(l.cor) } as Css}>
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                            <span className="flex min-w-0 items-center gap-2 text-[15px] font-semibold">
                                                {l.icone ? <Icone nome={l.icone} tamanho={16} cor="#75817A" /> : null}
                                                <span className="truncate">{l.rotulo}</span>
                                                {l.sub ? <span className="shrink-0 text-xs font-medium text-suave">· {l.sub}</span> : null}
                                            </span>
                                            <span className="titulo shrink-0 text-base">{brl(l.valor)}</span>
                                        </div>
                                        <div className="h-2.5 overflow-hidden rounded-full bg-fundo">
                                            <div className="h-full rounded-full bg-[var(--cor)]" style={{ width: `${barra(l.valor, maximo).toFixed(1)}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </section>
                        );
                    })}
                </>
            )}
        </>
    );
}
