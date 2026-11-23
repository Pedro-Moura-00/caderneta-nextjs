'use client';

import { useState } from 'react';
import { ModalCliente, ModalVenda } from '@/components/formularios';
import { Icone } from '@/components/Icone';
import { Modal, SeletorFormas, novoToken, useAcao, useModal } from '@/components/interativos';
import { Campo, CampoMoeda } from '@/components/ui';
import { alterarItem, estornarPagamento, receberPagamento } from '@/lib/acoes';
import { QTD_MAXIMA, rotuloForma, type Forma } from '@/lib/config';
import type { Categoria, Cliente, Produto } from '@/lib/dados';
import { brl, corCss, parseMoeda } from '@/lib/formato';

type Css = React.CSSProperties & Record<'--cor', string>;

export type ItemHistorico =
    | { tipo: 'item'; id: number; nome: string; cor: string | null; qtd: number; preco: number; quando: string }
    | { tipo: 'pagamento'; id: number; valor: number; forma: Forma; estornado: boolean; motivo: string | null; quando: string };

export function BotaoEditarCliente({ cliente }: { cliente: Cliente }) {
    const m = useModal();
    return (
        <>
            <button
                type="button"
                onClick={() => m.abrir(true)}
                className="toque flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border-2 border-linha bg-painel text-suave"
                aria-label="Editar dados"
            >
                <Icone nome="pencil" tamanho={20} />
            </button>
            <ModalCliente aberto={m.aberto} aoFechar={m.fechar} titulo="Dados do cliente" botao="Salvar dados" cliente={cliente} />
        </>
    );
}

/** Botões "Anotar consumo" e "Receber" com seus modais. */
export function AcoesConta({
    cliente,
    arquivado,
    deve,
    categorias,
    produtos,
}: {
    cliente: Cliente;
    arquivado: boolean;
    deve: boolean;
    categorias: Categoria[];
    produtos: Produto[];
}) {
    const consumo = useModal();
    const pagamento = useModal();
    return (
        <>
            <div className="mb-6 grid grid-cols-2 gap-3">
                <button type="button" disabled={arquivado} onClick={() => consumo.abrir(true)} className="btn btn-ambar min-h-[78px] flex-col gap-1 text-[17px]">
                    <Icone nome="plus" tamanho={26} /> Anotar consumo
                </button>
                <button
                    type="button"
                    disabled={!deve}
                    onClick={() => pagamento.abrir(true)}
                    className={`btn min-h-[78px] flex-col gap-1 text-[17px] text-white ${deve ? 'btn-verde' : 'bg-desabilitado'}`}
                >
                    <Icone nome="banknote" tamanho={26} /> Receber
                </button>
            </div>
            <ModalVenda
                aberto={consumo.aberto}
                aoFechar={consumo.fechar}
                titulo={`Anotar consumo · ${cliente.nome}`}
                modo="fiado"
                clienteId={cliente.id}
                categorias={categorias}
                produtos={produtos}
            />
            <ModalPagamento aberto={pagamento.aberto} aoFechar={pagamento.fechar} clienteId={cliente.id} saldo={Math.max(0, cliente.saldo)} />
        </>
    );
}

function ModalPagamento({ aberto, aoFechar, clienteId, saldo }: { aberto: boolean; aoFechar: () => void; clienteId: number; saldo: number }) {
    const [valor, setValor] = useState('');
    const [forma, setForma] = useState<Forma>('dinheiro');
    const [token, setToken] = useState(novoToken);
    const [executar, pendente] = useAcao();

    const v = Math.min(parseMoeda(valor) ?? 0, saldo);
    const resta = saldo - v;

    function enviar(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if ((parseMoeda(valor) ?? 0) <= 0) return;
        const fd = new FormData(e.currentTarget);
        executar(
            () => receberPagamento(fd),
            () => {
                setValor('');
                setToken(novoToken());
                aoFechar();
            },
        );
    }

    return (
        <Modal aberto={aberto} aoFechar={aoFechar} titulo="Receber pagamento">
            <form onSubmit={enviar} className="modal-corpo">
                <input type="hidden" name="operacao" value={token} />
                <input type="hidden" name="cliente_id" value={clienteId} />
                <div className="mb-4 rounded-2xl border-2 border-linha bg-fundo p-3 text-center">
                    <div className="sobretitulo">Deve no total</div>
                    <div className="titulo text-[34px] leading-none text-vermelho">{brl(saldo)}</div>
                </div>
                <button
                    type="button"
                    onClick={() => setValor(saldo.toFixed(2).replace('.', ','))}
                    className="btn btn-m mb-3 w-full border-2 border-verde-borda bg-verde-claro text-verde-escuro"
                >
                    Pagar tudo ({brl(saldo)})
                </button>
                <CampoMoeda rotulo="Ou digite o valor" name="valor" value={valor} onChange={(e) => setValor(e.target.value)} />
                <div className="rotulo mb-1.5">Forma de pagamento</div>
                <SeletorFormas valor={forma} aoMudar={setForma} />
                <div className={`mb-3 min-h-[1.5em] text-center text-[15px] ${v > 0 && resta <= 0.001 ? 'font-bold text-verde' : 'text-suave'}`} aria-live="polite">
                    {v <= 0 ? null : resta <= 0.001 ? (
                        'Vai quitar a conta'
                    ) : (
                        <>
                            Vai sobrar <b className="text-tinta">{brl(resta)}</b> devendo
                        </>
                    )}
                </div>
                <button type="submit" disabled={pendente} aria-busy={pendente || undefined} className="btn btn-g btn-verde w-full">
                    <Icone nome="check" tamanho={24} /> Confirmar pagamento
                </button>
            </form>
        </Modal>
    );
}

/** Lista do histórico, com editar item e estornar pagamento. */
export function Historico({ itens }: { itens: ItemHistorico[] }) {
    const editar = useModal<Extract<ItemHistorico, { tipo: 'item' }>>();
    const estornar = useModal<Extract<ItemHistorico, { tipo: 'pagamento' }>>();

    return (
        <>
            <div className="flex flex-col gap-2">
                {itens.map((h) =>
                    h.tipo === 'item' ? (
                        <div key={'i' + h.id} className="item-lista" style={{ '--cor': corCss(h.cor) } as Css}>
                            <span className="icone-quadrado bg-[color-mix(in_srgb,var(--cor)_14%,white)]">
                                <span className="titulo text-lg text-[var(--cor)]">{h.qtd}×</span>
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="text-base font-semibold">{h.nome}</div>
                                <div className="flex items-center gap-1 text-xs text-suave">
                                    <Icone nome="clock" tamanho={12} /> {h.quando} · {brl(h.preco)} cada
                                </div>
                            </div>
                            <div className="titulo text-xl">{brl(h.qtd * h.preco)}</div>
                            <button type="button" className="btn-icone" aria-label={`Editar ${h.nome}`} onClick={() => editar.abrir(h)}>
                                <Icone nome="pencil" tamanho={18} />
                            </button>
                        </div>
                    ) : !h.estornado ? (
                        <div key={'p' + h.id} className="item-lista">
                            <span className="icone-quadrado bg-verde-claro text-verde">
                                <Icone nome="check" tamanho={22} />
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="text-base font-semibold text-verde">Pagamento · {rotuloForma(h.forma)}</div>
                                <div className="flex items-center gap-1 text-xs text-suave">
                                    <Icone nome="clock" tamanho={12} /> {h.quando}
                                </div>
                            </div>
                            <div className="titulo text-xl text-verde">− {brl(h.valor)}</div>
                            <button type="button" className="btn-icone" aria-label={`Estornar pagamento de ${brl(h.valor)}`} onClick={() => estornar.abrir(h)}>
                                <Icone nome="rotate-ccw" tamanho={18} />
                            </button>
                        </div>
                    ) : (
                        <div key={'p' + h.id} className="item-lista opacity-70">
                            <span className="icone-quadrado bg-fundo text-suave">
                                <Icone nome="rotate-ccw" tamanho={20} />
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="text-base font-semibold text-suave">Pagamento estornado · {rotuloForma(h.forma)}</div>
                                <div className="text-xs text-suave">
                                    {h.quando} · {h.motivo}
                                </div>
                            </div>
                            <div className="titulo text-xl text-suave line-through">{brl(h.valor)}</div>
                        </div>
                    ),
                )}
            </div>
            {editar.dados ? <ModalEditarItem key={editar.dados.id} item={editar.dados} aoFechar={editar.fechar} /> : null}
            <ModalEstornar pagamento={estornar.dados} aoFechar={estornar.fechar} />
        </>
    );
}

function ModalEditarItem({ item, aoFechar }: { item: Extract<ItemHistorico, { tipo: 'item' }>; aoFechar: () => void }) {
    const [qtd, setQtd] = useState(item.qtd);
    const [executar, pendente] = useAcao();
    return (
        <Modal aberto aoFechar={aoFechar} titulo="Editar consumo" largura="max-w-[480px]">
            <div className="modal-corpo">
                <div
                    className="mb-5 flex items-center gap-3 rounded-2xl bg-[color-mix(in_srgb,var(--cor)_14%,white)] px-4 py-3.5"
                    style={{ '--cor': corCss(item.cor) } as Css}
                >
                    <div className="titulo text-xl text-[var(--cor)]">{item.nome}</div>
                    <div className="ml-auto text-right text-sm text-suave">
                        {brl(item.preco)} cada
                        <br />
                        {item.quando}
                    </div>
                </div>
                <div className="rotulo mb-2">Quantidade</div>
                <div className="mb-5 flex items-center justify-center gap-5">
                    <button
                        type="button"
                        onClick={() => setQtd((q) => Math.max(0, q - 1))}
                        className="toque flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-vermelho-suave text-vermelho"
                        aria-label="Diminuir"
                    >
                        <Icone nome="minus" tamanho={32} />
                    </button>
                    <div className="titulo min-w-20 text-center text-[56px]" aria-live="polite">
                        {qtd}
                    </div>
                    <button
                        type="button"
                        onClick={() => setQtd((q) => Math.min(QTD_MAXIMA, q + 1))}
                        className="toque flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-verde-claro text-verde"
                        aria-label="Aumentar"
                    >
                        <Icone nome="plus" tamanho={32} />
                    </button>
                </div>
                <div className="mb-5 rounded-2xl border-2 border-linha bg-fundo p-3 text-center">
                    <div className="sobretitulo">Subtotal</div>
                    <div className="titulo text-[34px] leading-none">{brl(qtd * item.preco)}</div>
                </div>
                <button
                    type="button"
                    disabled={pendente}
                    aria-busy={pendente || undefined}
                    onClick={() => executar(() => alterarItem(item.id, qtd), aoFechar)}
                    className="btn btn-g btn-verde mb-3 w-full"
                >
                    <Icone nome="check" tamanho={24} /> Salvar alteração
                </button>
                <button
                    type="button"
                    disabled={pendente}
                    onClick={() => executar(() => alterarItem(item.id, 0), aoFechar)}
                    className="btn btn-contorno-vermelho h-[54px] w-full"
                >
                    <Icone nome="trash-2" tamanho={20} /> Remover item da conta
                </button>
            </div>
        </Modal>
    );
}

function ModalEstornar({ pagamento, aoFechar }: { pagamento: Extract<ItemHistorico, { tipo: 'pagamento' }> | null; aoFechar: () => void }) {
    const [executar, pendente] = useAcao();
    return (
        <Modal aberto={pagamento !== null} aoFechar={aoFechar} titulo="Estornar pagamento" largura="max-w-[480px]">
            {pagamento ? (
                <form
                    className="modal-corpo"
                    onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        executar(() => estornarPagamento(pagamento.id, fd), aoFechar);
                    }}
                >
                    <p className="mb-3 rounded-2xl border-2 border-linha bg-fundo p-3 text-center text-[15px] font-semibold">
                        Pagamento de {brl(pagamento.valor)} · {rotuloForma(pagamento.forma)} · {pagamento.quando}
                    </p>
                    <p className="mb-4 text-sm text-suave">O valor volta para a conta do cliente. O pagamento continua no histórico, marcado como estornado.</p>
                    <Campo rotulo="Motivo (opcional)" name="motivo" placeholder="Ex.: lançado no cliente errado" maxLength={200} />
                    <button type="submit" disabled={pendente} aria-busy={pendente || undefined} className="btn btn-g btn-contorno-vermelho w-full">
                        <Icone nome="rotate-ccw" tamanho={22} /> Estornar pagamento
                    </button>
                </form>
            ) : null}
        </Modal>
    );
}
