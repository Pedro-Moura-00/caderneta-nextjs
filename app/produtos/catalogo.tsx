'use client';

import { useState } from 'react';
import { Icone } from '@/components/Icone';
import { Modal, useAcao, useModal } from '@/components/interativos';
import { Campo, CampoMoeda, EstadoVazio } from '@/components/ui';
import { removerCategoria, removerProduto, salvarCategoria, salvarProduto } from '@/lib/acoes';
import { COR_PADRAO, COR_SEM_COR, CORES_CATEGORIA } from '@/lib/config';
import type { Categoria, Produto } from '@/lib/dados';
import { brl, corCss } from '@/lib/formato';

type Css = React.CSSProperties & Record<'--cor', string>;

export function Catalogo({ categorias, produtos }: { categorias: Categoria[]; produtos: Produto[] }) {
    const modalProduto = useModal<Produto | 'novo'>();
    const modalCategorias = useModal();
    const [executar, pendente] = useAcao();

    // produtos por categoria; os de categoria apagada vão para "Sem categoria"
    const ids = new Set(categorias.map((c) => c.id));
    const porCategoria = new Map<number, Produto[]>();
    for (const p of produtos) {
        const cat = p.categoria_id !== null && ids.has(p.categoria_id) ? p.categoria_id : 0;
        porCategoria.set(cat, [...(porCategoria.get(cat) ?? []), p]);
    }
    const secoes = porCategoria.has(0) ? [...categorias, { id: 0, nome: 'Sem categoria', cor: COR_SEM_COR }] : categorias;

    return (
        <>
            <div className="mb-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => modalProduto.abrir('novo')} className="btn btn-verde h-[58px] text-[17px]">
                    <Icone nome="plus" tamanho={22} /> Novo produto
                </button>
                <button type="button" onClick={() => modalCategorias.abrir(true)} className="btn btn-claro h-[58px] text-[17px]">
                    <Icone nome="package" tamanho={22} cor="#75817A" /> Categorias
                </button>
            </div>

            {categorias.length === 0 ? (
                <EstadoVazio titulo="Comece pelas categorias" texto='Crie uma categoria (ex.: Cervejas) em "Categorias" e depois cadastre os produtos.' />
            ) : produtos.length === 0 ? (
                <EstadoVazio titulo="Nenhum produto ainda" texto='Toque em "Novo produto".' />
            ) : null}

            {secoes.map((cat) => {
                const itens = porCategoria.get(cat.id) ?? [];
                if (itens.length === 0) return null;
                return (
                    <section key={cat.id} className="mb-5" style={{ '--cor': corCss(cat.cor) } as Css}>
                        <h2 className="mb-2 flex items-center gap-2">
                            <span className="bolinha h-3.5 w-3.5" />
                            <span className="titulo text-[19px]">{cat.nome}</span>
                            <span className="text-[13px] text-suave">({itens.length})</span>
                        </h2>
                        <div className="flex flex-col gap-2">
                            {itens.map((p) => (
                                <div key={p.id} className="cartao flex items-center gap-3 px-4 py-3">
                                    <div className="min-w-0 flex-1 text-[17px] font-semibold">{p.nome}</div>
                                    <div className="titulo text-xl text-[var(--cor)]">{brl(p.preco)}</div>
                                    <button type="button" className="btn-icone" aria-label={`Editar ${p.nome}`} onClick={() => modalProduto.abrir(p)}>
                                        <Icone nome="pencil" tamanho={18} />
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-icone-perigo"
                                        aria-label={`Remover ${p.nome}`}
                                        disabled={pendente}
                                        onClick={() => window.confirm(`Remover ${p.nome}?`) && executar(() => removerProduto(p.id))}
                                    >
                                        <Icone nome="trash-2" tamanho={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>
                );
            })}

            {modalProduto.dados ? (
                <ModalProduto
                    key={modalProduto.dados === 'novo' ? 'novo' : modalProduto.dados.id}
                    produto={modalProduto.dados === 'novo' ? null : modalProduto.dados}
                    categorias={categorias}
                    aoFechar={modalProduto.fechar}
                />
            ) : null}
            <ModalCategorias aberto={modalCategorias.aberto} aoFechar={modalCategorias.fechar} categorias={categorias} porCategoria={porCategoria} />
        </>
    );
}

function ModalProduto({ produto, categorias, aoFechar }: { produto: Produto | null; categorias: Categoria[]; aoFechar: () => void }) {
    const [cat, setCat] = useState<number | null>(produto?.categoria_id ?? categorias[0]?.id ?? null);
    const [executar, pendente] = useAcao();
    return (
        <Modal aberto aoFechar={aoFechar} titulo={produto ? 'Editar produto' : 'Novo produto'}>
            {categorias.length === 0 ? (
                <div className="modal-corpo">
                    <EstadoVazio titulo="Crie uma categoria primeiro" texto='Os produtos ficam organizados por categoria. Use o botão "Categorias".' />
                </div>
            ) : (
                <form
                    className="modal-corpo"
                    onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        executar(() => salvarProduto(produto?.id ?? null, fd), aoFechar);
                    }}
                >
                    <Campo rotulo="Nome do produto" name="nome" defaultValue={produto?.nome ?? ''} placeholder="Ex.: Heineken long neck" required maxLength={120} />
                    <CampoMoeda rotulo="Preço" name="preco" defaultValue={produto ? String(produto.preco).replace('.', ',') : ''} />
                    <div className="rotulo mb-1.5">Categoria</div>
                    <div className="mb-5 flex flex-wrap gap-2">
                        <input type="hidden" name="categoria_id" value={cat ?? ''} />
                        {categorias.map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                className="opcao opcao-cor min-h-[46px] px-3.5 text-sm"
                                style={{ '--cor': corCss(c.cor) } as Css}
                                aria-pressed={c.id === cat}
                                onClick={() => setCat(c.id)}
                            >
                                <span className="bolinha" />
                                {c.nome}
                            </button>
                        ))}
                    </div>
                    <button type="submit" disabled={pendente} aria-busy={pendente || undefined} className="btn btn-g btn-verde w-full">
                        <Icone nome="check" tamanho={24} /> {produto ? 'Salvar produto' : 'Adicionar produto'}
                    </button>
                </form>
            )}
        </Modal>
    );
}

function ModalCategorias({
    aberto,
    aoFechar,
    categorias,
    porCategoria,
}: {
    aberto: boolean;
    aoFechar: () => void;
    categorias: Categoria[];
    porCategoria: Map<number, Produto[]>;
}) {
    const [editando, setEditando] = useState<Categoria | null>(null);
    const [nome, setNome] = useState('');
    const [cor, setCor] = useState(COR_PADRAO);
    const [executar, pendente] = useAcao();

    function modoNovo() {
        setEditando(null);
        setNome('');
        setCor(CORES_CATEGORIA[0]);
    }

    return (
        <Modal aberto={aberto} aoFechar={aoFechar} titulo="Categorias" largura="max-w-xl">
            <div className="modal-corpo">
                <form
                    className="mb-5 rounded-2xl border-2 border-linha bg-fundo p-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        executar(() => salvarCategoria(editando?.id ?? null, fd), modoNovo);
                    }}
                >
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-bold">{editando ? 'Editar categoria' : 'Nova categoria'}</span>
                        {editando ? (
                            <button type="button" onClick={modoNovo} className="toque text-sm font-bold text-suave">
                                Cancelar edição
                            </button>
                        ) : null}
                    </div>
                    <input
                        name="nome"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        placeholder="Ex.: Sem álcool, Doses, Salgados..."
                        required
                        maxLength={80}
                        aria-label="Nome da categoria"
                        className="campo mt-0 mb-3 h-[50px] bg-painel"
                    />
                    <div className="mb-3 flex flex-wrap gap-2">
                        <input type="hidden" name="cor" value={cor} />
                        {CORES_CATEGORIA.map((c) => (
                            <button
                                key={c}
                                type="button"
                                className="toque h-10 w-10 rounded-xl border-[3px] border-transparent aria-pressed:border-tinta"
                                style={{ background: c }}
                                aria-pressed={c === cor}
                                aria-label={`Cor ${c}`}
                                onClick={() => setCor(c)}
                            />
                        ))}
                    </div>
                    <button type="submit" disabled={pendente} aria-busy={pendente || undefined} className="btn btn-m w-full bg-ambar-escuro text-white">
                        <Icone nome="check" tamanho={20} /> {editando ? 'Salvar' : 'Adicionar'}
                    </button>
                </form>

                <div className="flex flex-col gap-2">
                    {categorias.map((c) => {
                        const n = porCategoria.get(c.id)?.length ?? 0;
                        return (
                            <div key={c.id} className="item-lista" style={{ '--cor': corCss(c.cor) } as Css}>
                                <span className="bolinha h-[18px] w-[18px]" />
                                <div className="min-w-0 flex-1">
                                    <div className="text-base font-bold">{c.nome}</div>
                                    <div className="text-xs text-suave">
                                        {n} produto{n === 1 ? '' : 's'}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="btn-icone h-10 w-10"
                                    aria-label={`Editar ${c.nome}`}
                                    onClick={() => {
                                        setEditando(c);
                                        setNome(c.nome);
                                        setCor(corCss(c.cor));
                                    }}
                                >
                                    <Icone nome="pencil" tamanho={17} />
                                </button>
                                {n === 0 ? (
                                    <button
                                        type="button"
                                        className="btn-icone-perigo h-10 w-10"
                                        aria-label={`Remover ${c.nome}`}
                                        disabled={pendente}
                                        onClick={() => window.confirm(`Remover ${c.nome}?`) && executar(() => removerCategoria(c.id))}
                                    >
                                        <Icone nome="trash-2" tamanho={17} />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="btn-icone h-10 w-10 opacity-50"
                                        title="Esvazie a categoria primeiro"
                                        aria-label="Esvazie a categoria para remover"
                                        disabled
                                    >
                                        <Icone nome="trash-2" tamanho={17} />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </Modal>
    );
}
