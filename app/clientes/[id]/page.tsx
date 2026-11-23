import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Icone } from '@/components/Icone';
import { BotaoAcao, BotaoConfirmar } from '@/components/interativos';
import { CabecalhoPagina, EstadoVazio, Pagina } from '@/components/ui';
import { arquivarCliente, reativarCliente } from '@/lib/acoes';
import { HISTORICO_POR_PAGINA } from '@/lib/config';
import * as dados from '@/lib/dados';
import { brl, quando } from '@/lib/formato';
import { AcoesConta, BotaoEditarCliente, Historico, type ItemHistorico } from './conta';

export async function generateMetadata({ params }: PageProps<'/clientes/[id]'>): Promise<Metadata> {
    const c = await dados.cliente(Number((await params).id));
    return { title: c ? `${c.nome} ${c.sobrenome}`.trim() : 'Cliente' };
}

/** Tela de um cliente: saldo + histórico. */
export default function PaginaCliente(props: PageProps<'/clientes/[id]'>) {
    return (
        <Pagina>
            <Suspense fallback={<div className="vazio">Carregando…</div>}>
                <Conteudo {...props} />
            </Suspense>
        </Pagina>
    );
}

async function Conteudo({ params, searchParams }: PageProps<'/clientes/[id]'>) {
    const id = Number((await params).id);
    const tudo = (await searchParams).tudo === '1';
    const cliente = await dados.cliente(id);
    if (!cliente) notFound();

    const [hist, categorias, produtos] = await Promise.all([
        dados.historico(id, tudo ? null : HISTORICO_POR_PAGINA),
        dados.categorias(),
        dados.produtos(),
    ]);
    await connection();
    const agora = new Date();
    const historico: ItemHistorico[] = hist.itens.map((h) =>
        h.tipo === 'item'
            ? { tipo: 'item', id: h.id, nome: h.nome, cor: h.cor, qtd: h.qtd, preco: h.preco, quando: quando(h.em, agora) }
            : {
                  tipo: 'pagamento',
                  id: h.id,
                  valor: h.valor,
                  forma: h.forma,
                  estornado: h.estornado_em !== null,
                  motivo: h.motivo_estorno,
                  quando: quando(h.em, agora),
              },
    );

    const saldo = cliente.saldo;
    const deve = saldo > 0.004;
    const credito = saldo < -0.004;
    const arquivado = cliente.arquivado_em !== null;
    const nome = `${cliente.nome} ${cliente.sobrenome}`.trim();
    const extras = [
        ['map-pin', cliente.endereco],
        ['phone', cliente.telefone2],
        ['calendar', cliente.aniversario ? `Aniversário ${cliente.aniversario}` : null],
    ] as const;

    return (
        <>
            <CabecalhoPagina
                titulo={nome}
                direita={<BotaoEditarCliente cliente={cliente} />}
                subtitulo={
                    cliente.telefone ? (
                        <>
                            <Icone nome="phone" tamanho={14} /> {cliente.telefone}
                        </>
                    ) : null
                }
            />

            {extras.some(([, t]) => t) ? (
                <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
                    {extras.map(([ic, txt]) =>
                        txt ? (
                            <span key={ic} className="flex items-center gap-1 rounded-full border border-linha bg-painel px-3 py-1.5">
                                <Icone nome={ic} tamanho={14} cor="#75817A" /> {txt}
                            </span>
                        ) : null,
                    )}
                </div>
            ) : null}

            {arquivado ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-linha bg-painel px-4 py-3">
                    <span className="flex items-center gap-2 text-[15px] font-semibold">
                        <Icone nome="archive" tamanho={18} cor="#75817A" /> Cliente arquivado
                    </span>
                    <BotaoAcao acao={reativarCliente.bind(null, cliente.id)} className="btn btn-m btn-verde">
                        Reativar conta
                    </BotaoAcao>
                </div>
            ) : null}

            <section
                className={`mb-4 rounded-2xl border-2 px-3 py-5 text-center ${
                    deve ? 'border-vermelho-borda bg-vermelho-fundo' : credito ? 'border-azul/30 bg-azul-claro' : 'border-verde-borda bg-verde-fundo'
                }`}
            >
                <div className="sobretitulo text-[13px]">{deve ? 'Saldo devedor' : credito ? 'Crédito do cliente' : 'Situação'}</div>
                {deve ? (
                    <div className="titulo text-5xl leading-tight text-vermelho">{brl(saldo)}</div>
                ) : credito ? (
                    <>
                        <div className="titulo text-5xl leading-tight text-azul">{brl(-saldo)}</div>
                        <div className="mt-1 text-[13px] text-suave">Pagou a mais; será abatido nos próximos consumos.</div>
                    </>
                ) : (
                    <div className="titulo flex items-center justify-center gap-2 text-5xl leading-tight text-verde">
                        Em dia <Icone nome="check" tamanho={40} />
                    </div>
                )}
            </section>

            <AcoesConta cliente={cliente} arquivado={arquivado} deve={deve} categorias={categorias} produtos={produtos} />

            <h2 className="titulo mb-2.5 text-[21px]">Histórico</h2>
            {historico.length === 0 ? (
                <EstadoVazio titulo="Nada lançado ainda" texto='Toque em "Anotar consumo" para começar a conta.' />
            ) : (
                <>
                    <Historico itens={historico} />
                    {hist.total > historico.length ? (
                        <Link href={`/clientes/${cliente.id}?tudo=1`} className="btn btn-m btn-claro mt-3 w-full">
                            Ver histórico completo ({hist.total})
                        </Link>
                    ) : null}
                </>
            )}

            {!arquivado && !deve && !credito ? (
                <div className="mt-8 text-center">
                    <BotaoConfirmar
                        pergunta={`Arquivar ${nome}? Ele sai da lista, mas o histórico fica guardado.`}
                        acao={arquivarCliente.bind(null, cliente.id)}
                        className="toque inline-flex items-center gap-2 text-sm font-bold text-suave"
                    >
                        <Icone nome="archive" tamanho={16} /> Arquivar cliente
                    </BotaoConfirmar>
                </div>
            ) : null}
        </>
    );
}
