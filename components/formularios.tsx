'use client';

import { useState } from 'react';
import { criarCliente, editarCliente, lancarFiado, vendaAvista } from '@/lib/acoes';
import { COR_SEM_COR, QTD_MAXIMA, type Forma } from '@/lib/config';
import type { Categoria, Cliente, Produto } from '@/lib/dados';
import { brl, corCss } from '@/lib/formato';
import { Icone } from './Icone';
import { Modal, SeletorFormas, novoToken, useAcao } from './interativos';
import { Campo, EstadoVazio } from './ui';

type Css = React.CSSProperties & Record<'--cor', string>;

/* ── Venda (carrinho): anotar consumo ou venda à vista ─────── */

export function ModalVenda({
    aberto,
    aoFechar,
    titulo,
    modo,
    clienteId,
    categorias,
    produtos,
}: {
    aberto: boolean;
    aoFechar: () => void;
    titulo: string;
    modo: 'fiado' | 'avista';
    clienteId?: number;
    categorias: Categoria[];
    produtos: Produto[];
}) {
    const avista = modo === 'avista';
    const corDe = new Map(categorias.map((c) => [c.id, c.cor]));
    // produto cuja categoria foi apagada aparece na aba "Sem categoria"
    const catDe = (p: Produto) => (p.categoria_id !== null && corDe.has(p.categoria_id) ? p.categoria_id : 0);
    const abas = produtos.some((p) => catDe(p) === 0) ? [...categorias, { id: 0, nome: 'Sem categoria', cor: COR_SEM_COR }] : categorias;

    const [aba, setAba] = useState<number>(abas[0]?.id ?? 0);
    const [carrinho, setCarrinho] = useState<Record<number, number>>({});
    const [forma, setForma] = useState<Forma>('dinheiro');
    const [token, setToken] = useState(novoToken);
    const [executar, pendente] = useAcao();

    const porId = new Map(produtos.map((p) => [p.id, p]));
    const linhas = Object.entries(carrinho).map(([id, q]) => ({ p: porId.get(Number(id))!, q })).filter((l) => l.p);
    const total = linhas.reduce((s, l) => s + l.p.preco * l.q, 0);

    const mudar = (id: number, delta: number) =>
        setCarrinho((c) => {
            const q = Math.min(QTD_MAXIMA, (c[id] ?? 0) + delta);
            const novo = { ...c };
            if (q <= 0) delete novo[id];
            else novo[id] = q;
            return novo;
        });

    function enviar(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (linhas.length === 0) return;
        const fd = new FormData(e.currentTarget);
        executar(
            () => (avista ? vendaAvista(fd) : lancarFiado(fd)),
            () => {
                setCarrinho({});
                setToken(novoToken());
                aoFechar();
            },
        );
    }

    return (
        <Modal aberto={aberto} aoFechar={aoFechar} titulo={titulo} largura="max-w-3xl">
            {produtos.length === 0 ? (
                <div className="modal-corpo">
                    <EstadoVazio titulo="Nenhum produto cadastrado" texto='Cadastre os produtos na tela "Produtos" primeiro.' />
                </div>
            ) : (
                <form onSubmit={enviar} className="flex min-h-0 flex-col">
                    <input type="hidden" name="operacao" value={token} />
                    {!avista ? <input type="hidden" name="cliente_id" value={clienteId} /> : null}
                    <input type="hidden" name="carrinho" value={JSON.stringify(carrinho)} />

                    <div className="modal-corpo">
                        <div className="mb-4 flex flex-wrap gap-2">
                            {abas.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    className="opcao opcao-cor min-h-12 px-4 text-[15px]"
                                    style={{ '--cor': corCss(c.cor) } as Css}
                                    aria-pressed={c.id === aba}
                                    onClick={() => setAba(c.id)}
                                >
                                    <span className="bolinha" />
                                    {c.nome}
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {produtos
                                .filter((p) => catDe(p) === aba)
                                .map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        className="produto"
                                        style={{ '--cor': corCss(p.categoria_id !== null ? corDe.get(p.categoria_id) : null) } as Css}
                                        data-qtd={carrinho[p.id] ?? 0}
                                        onClick={() => mudar(p.id, 1)}
                                    >
                                        <span className="selo">{carrinho[p.id] || ''}</span>
                                        <span className="text-base leading-tight font-bold">{p.nome}</span>
                                        <span className="titulo text-xl">{brl(p.preco)}</span>
                                    </button>
                                ))}
                        </div>
                    </div>

                    {linhas.length > 0 ? (
                        <div className="shrink-0 border-t border-linha bg-painel px-5 pt-3 pb-[18px] sm:px-[22px]">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                {linhas.map(({ p, q }) => (
                                    <span key={p.id} className="chip">
                                        {q}× {p.nome}
                                        <button
                                            type="button"
                                            className="toque flex h-[26px] w-[26px] items-center justify-center rounded-full bg-vermelho-suave text-vermelho"
                                            aria-label={`Tirar um ${p.nome}`}
                                            onClick={() => mudar(p.id, -1)}
                                        >
                                            −
                                        </button>
                                    </span>
                                ))}
                            </div>
                            {avista ? <SeletorFormas valor={forma} aoMudar={setForma} tamanho="min-h-12 text-sm" /> : null}
                            <button
                                type="submit"
                                disabled={pendente}
                                aria-busy={pendente || undefined}
                                className={`btn btn-g w-full justify-between ${avista ? 'btn-verde' : 'btn-ambar'}`}
                            >
                                <span className="text-[17px]">{avista ? 'Cobrar à vista' : 'Lançar na conta'}</span>
                                <span className="titulo text-2xl">{brl(total)}</span>
                            </button>
                        </div>
                    ) : null}
                </form>
            )}
        </Modal>
    );
}

/* ── Cliente (novo / editar) ───────────────────────────────── */

export function ModalCliente({
    aberto,
    aoFechar,
    titulo,
    botao,
    cliente,
    nomeInicial,
}: {
    aberto: boolean;
    aoFechar: () => void;
    titulo: string;
    botao: string;
    cliente?: Cliente;
    nomeInicial?: string;
}) {
    const [token, setToken] = useState(novoToken);
    const [executar, pendente] = useAcao();
    const temMais = Boolean(cliente?.endereco || cliente?.telefone2 || cliente?.aniversario);
    const [mais, setMais] = useState(temMais);

    function enviar(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        executar(
            () => (cliente ? editarCliente(cliente.id, fd) : criarCliente(fd)),
            () => {
                setToken(novoToken());
                aoFechar();
            },
        );
    }

    return (
        <Modal aberto={aberto} aoFechar={aoFechar} titulo={titulo} largura="max-w-xl">
            {/* key: ao reabrir, os campos voltam para os dados atuais */}
            <form onSubmit={enviar} className="modal-corpo" key={cliente ? `${cliente.id}-${aberto}` : String(aberto)}>
                <input type="hidden" name="operacao" value={token} />
                <div className="grid grid-cols-2 gap-3">
                    <Campo rotulo="Nome" name="nome" defaultValue={cliente?.nome ?? nomeInicial ?? ''} placeholder="Ex.: Antônio" required maxLength={80} />
                    <Campo rotulo="Sobrenome" name="sobrenome" defaultValue={cliente?.sobrenome ?? ''} placeholder="Ex.: Ferreira" maxLength={80} />
                </div>
                <Campo rotulo="Telefone" name="telefone" defaultValue={cliente?.telefone ?? ''} placeholder="(12) 9....." inputMode="tel" maxLength={40} />

                <div className={mais ? '' : 'hidden'}>
                    <Campo rotulo="Endereço" name="endereco" defaultValue={cliente?.endereco ?? ''} placeholder="Rua, número, bairro" maxLength={200} />
                    <div className="grid grid-cols-2 gap-3">
                        <Campo rotulo="Outro telefone" name="telefone2" defaultValue={cliente?.telefone2 ?? ''} inputMode="tel" maxLength={40} />
                        <Campo rotulo="Aniversário" name="aniversario" defaultValue={cliente?.aniversario ?? ''} placeholder="dia/mês" inputMode="numeric" maxLength={5} />
                    </div>
                </div>
                {!mais ? (
                    <button type="button" onClick={() => setMais(true)} className="toque mb-2 py-1 text-[15px] font-bold text-ambar-escuro">
                        + Endereço, outro telefone, aniversário (opcional)
                    </button>
                ) : null}

                <button type="submit" disabled={pendente} aria-busy={pendente || undefined} className="btn btn-g btn-verde mt-2 w-full">
                    <Icone nome="check" tamanho={24} /> {botao}
                </button>
            </form>
        </Modal>
    );
}
