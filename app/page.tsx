import Link from 'next/link';
import { Suspense } from 'react';
import { BotaoNovoCliente, BotaoSair, BotaoVendaAvista } from '@/components/botoes';
import { Icone } from '@/components/Icone';
import { EstadoVazio, Pagina } from '@/components/ui';
import { nomeBar } from '@/lib/bar';
import { CLIENTES_POR_PAGINA } from '@/lib/config';
import { exigirUsuario } from '@/lib/auth';
import * as dados from '@/lib/dados';
import { FILTROS, type Cliente, type Filtro } from '@/lib/dados';
import { brl, iniciais } from '@/lib/formato';

const ABAS: Record<Filtro, string> = { devendo: 'Devendo', todos: 'Todos', arquivados: 'Arquivados' };

/** Tela inicial: clientes + busca. */
export default function Inicio({ searchParams }: PageProps<'/'>) {
    return (
        <Pagina largura="max-w-[860px]">
            <Suspense fallback={<div className="vazio">Carregando…</div>}>
                <Conteudo searchParams={searchParams} />
            </Suspense>
        </Pagina>
    );
}

function primeiro(v: string | string[] | undefined): string {
    return (Array.isArray(v) ? v[0] : v) ?? '';
}

async function Conteudo({ searchParams }: Pick<PageProps<'/'>, 'searchParams'>) {
    const eu = await exigirUsuario();
    const sp = await searchParams;
    const busca = primeiro(sp.q).trim();
    const verParam = primeiro(sp.ver);
    const filtro: Filtro = (FILTROS as readonly string[]).includes(verParam) ? (verParam as Filtro) : busca !== '' ? 'todos' : 'devendo';
    const pagina = Math.max(1, Math.trunc(Number(primeiro(sp.pagina))) || 1);

    const [lista, totalAberto, recebidoHoje, categorias, produtos] = await Promise.all([
        dados.listaClientes(filtro, busca, pagina, CLIENTES_POR_PAGINA),
        dados.totalAReceber(),
        dados.recebidoHoje(),
        dados.categorias(),
        dados.produtos(),
    ]);
    const paginas = Math.max(1, Math.ceil(lista.total / CLIENTES_POR_PAGINA));
    const buscando = busca !== '';
    const url = (extra: Record<string, string | number>) => {
        const q = new URLSearchParams();
        if (busca) q.set('q', busca);
        q.set('ver', filtro);
        for (const [k, v] of Object.entries(extra)) if (v !== 1 && v !== '') q.set(k, String(v));
        return '/?' + q.toString();
    };

    return (
        <>
            <header className="mb-5 rounded-2xl bg-tinta px-5 py-5 text-white sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <h1 className="titulo text-[30px] leading-none">{nomeBar}</h1>
                    <nav className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
                        <Link href="/vendas" className="btn-topo">
                            <Icone nome="receipt" tamanho={16} /> Vendas
                        </Link>
                        <Link href="/relatorios" className="btn-topo">
                            <Icone nome="bar-chart-3" tamanho={16} /> Relatórios
                        </Link>
                        <Link href="/produtos" className="btn-topo">
                            <Icone nome="package" tamanho={16} /> Produtos
                        </Link>
                    </nav>
                </div>
                <div className="mt-3 flex items-center gap-3 text-[13px] text-[#C7D2CB]">
                    <span className="min-w-0 truncate">
                        Olá, <b className="text-white">{eu.nome}</b>
                    </span>
                    <Link href="/usuarios" className="toque ml-auto font-bold text-white underline decoration-white/30 underline-offset-4">
                        {eu.admin ? 'Usuários' : 'Minha senha'}
                    </Link>
                    <BotaoSair className="toque font-bold text-white underline decoration-white/30 underline-offset-4" />
                </div>
                <div className="mt-4 flex gap-3">
                    <div className="flex-1 rounded-xl bg-white/[.08] px-4 py-3">
                        <div className="text-[11px] font-semibold tracking-[1px] text-[#C7D2CB] uppercase">A receber (fiado)</div>
                        <div className="titulo text-[28px] leading-none text-ambar">{brl(totalAberto)}</div>
                    </div>
                    <Link href="/relatorios" className="flex-1 rounded-xl bg-white/[.08] px-4 py-3">
                        <div className="text-[11px] font-semibold tracking-[1px] text-[#C7D2CB] uppercase">Recebido hoje</div>
                        <div className="titulo text-[28px] leading-none text-verde-vivo">{brl(recebidoHoje)}</div>
                    </Link>
                </div>
            </header>

            <form method="get" action="/" role="search" className="cartao mb-3 flex h-[62px] items-center gap-2 px-4 focus-within:border-ambar">
                <Icone nome="search" tamanho={24} cor="#75817A" />
                {filtro === 'arquivados' ? <input type="hidden" name="ver" value="arquivados" /> : null}
                <input
                    key={busca}
                    type="search"
                    name="q"
                    defaultValue={busca}
                    placeholder="Nome ou telefone..."
                    autoComplete="off"
                    aria-label="Buscar cliente"
                    className="min-w-0 flex-1 border-none bg-transparent text-[19px] outline-none [&::-webkit-search-cancel-button]:hidden"
                />
                {buscando ? (
                    <Link href="/" className="toque flex items-center text-suave" aria-label="Limpar busca">
                        <Icone nome="x" tamanho={22} />
                    </Link>
                ) : (
                    <button type="submit" className="toque rounded-xl bg-fundo px-3 py-2 text-sm font-bold text-suave">
                        Buscar
                    </button>
                )}
            </form>

            <div className="mb-5 grid grid-cols-2 gap-3">
                <BotaoVendaAvista className="btn btn-g btn-ambar" categorias={categorias} produtos={produtos}>
                    <Icone nome="coins" tamanho={24} /> Venda à vista
                </BotaoVendaAvista>
                <BotaoNovoCliente className="btn btn-g btn-verde">
                    <Icone nome="user-plus" tamanho={24} /> Adicionar cliente
                </BotaoNovoCliente>
            </div>

            <nav className="mb-3 flex items-center gap-2" aria-label="Quais clientes mostrar">
                {FILTROS.map((id) => {
                    const q = new URLSearchParams();
                    if (busca) q.set('q', busca);
                    q.set('ver', id);
                    return (
                        <Link
                            key={id}
                            href={'/?' + q.toString()}
                            className="opcao min-h-10 px-3.5 text-sm"
                            aria-pressed={id === filtro}
                            aria-current={id === filtro ? 'page' : undefined}
                        >
                            {ABAS[id]}
                            {id === filtro ? ` (${lista.total})` : ''}
                        </Link>
                    );
                })}
            </nav>

            {lista.itens.length === 0 ? (
                buscando ? (
                    <EstadoVazio titulo="Ninguém encontrado">
                        <div className="mt-1 mb-3.5 text-sm">
                            Nenhum cliente com &ldquo;{busca}&rdquo;{filtro === 'devendo' ? ' devendo' : ''}.
                        </div>
                        <BotaoNovoCliente className="btn btn-m btn-verde" nomeInicial={busca}>
                            Cadastrar &ldquo;{busca}&rdquo;
                        </BotaoNovoCliente>
                    </EstadoVazio>
                ) : filtro === 'devendo' ? (
                    <EstadoVazio titulo="Ninguém devendo" texto="Tudo quitado por aqui." />
                ) : filtro === 'arquivados' ? (
                    <EstadoVazio titulo="Nenhum cliente arquivado" />
                ) : (
                    <EstadoVazio titulo="Nenhum cliente cadastrado" texto='Toque em "Adicionar cliente".' />
                )
            ) : (
                <>
                    <div className="flex flex-col gap-2">
                        {lista.itens.map((c) => (
                            <LinhaCliente key={c.id} c={c} />
                        ))}
                    </div>

                    {paginas > 1 ? (
                        <nav className="mt-4 flex items-center justify-between gap-2" aria-label="Páginas">
                            {pagina > 1 ? (
                                <Link href={url({ pagina: pagina - 1 })} className="btn btn-m btn-claro">
                                    <Icone nome="chevron-left" tamanho={20} /> Anteriores
                                </Link>
                            ) : (
                                <span />
                            )}
                            <span className="text-sm text-suave">
                                Página {pagina} de {paginas}
                            </span>
                            {pagina < paginas ? (
                                <Link href={url({ pagina: pagina + 1 })} className="btn btn-m btn-claro">
                                    Próximos <Icone nome="chevron-right" tamanho={20} />
                                </Link>
                            ) : (
                                <span />
                            )}
                        </nav>
                    ) : null}
                </>
            )}
        </>
    );
}

function LinhaCliente({ c }: { c: Cliente }) {
    const deve = c.saldo > 0.001;
    const credito = c.saldo < -0.001;
    return (
        <Link href={`/clientes/${c.id}`} className="toque cartao flex w-full items-center gap-3 px-[18px] py-[15px]">
            <span className={`avatar ${deve ? 'bg-ambar-claro text-ambar-escuro' : 'bg-verde-claro text-verde-escuro'}`}>{iniciais(c.nome, c.sobrenome)}</span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold">{`${c.nome} ${c.sobrenome}`.trim()}</span>
                <span className="block text-[13px] text-suave">{c.telefone}</span>
            </span>
            <span className="shrink-0 text-right">
                {deve ? (
                    <>
                        <span className="titulo block text-2xl leading-none text-vermelho">{brl(c.saldo)}</span>
                        <span className="block text-xs text-suave">deve</span>
                    </>
                ) : credito ? (
                    <>
                        <span className="titulo block text-xl leading-none text-azul">{brl(-c.saldo)}</span>
                        <span className="block text-xs text-suave">de crédito</span>
                    </>
                ) : (
                    <span className="titulo flex items-center gap-1 text-base text-verde">
                        Em dia <Icone nome="check" tamanho={16} />
                    </span>
                )}
            </span>
            <Icone nome="chevron-right" tamanho={22} cor="#EAE0CE" />
        </Link>
    );
}
