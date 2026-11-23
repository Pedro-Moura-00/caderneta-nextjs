'use client';

import { useState } from 'react';
import { Icone } from '@/components/Icone';
import { Modal, useAcao, useModal } from '@/components/interativos';
import { Campo } from '@/components/ui';
import { alterarUsuario, criarUsuario, excluirUsuario, redefinirSenha, trocarMinhaSenha } from '@/lib/acoes-conta';

export type LinhaUsuario = { id: number; nome: string; login: string; admin: boolean; ativo: boolean; bloqueado: boolean };

function CamposSenha({ rotulo = 'Senha nova (mínimo 8 caracteres)' }: { rotulo?: string }) {
    return (
        <>
            <Campo rotulo={rotulo} name="senha" type="password" autoComplete="new-password" required minLength={8} />
            <Campo rotulo="Repita a senha" name="confirmacao" type="password" autoComplete="new-password" required className="mb-5 block" />
        </>
    );
}

function Marcar({ nome, rotulo, marcado }: { nome: string; rotulo: string; marcado: boolean }) {
    return (
        <label className="mb-3 flex items-center gap-3 text-[15px] font-semibold">
            <input type="checkbox" name={nome} defaultChecked={marcado} className="h-5 w-5 accent-[#2F9E44]" />
            {rotulo}
        </label>
    );
}

/** Formulário em modal que fecha quando dá certo. */
function FormModal({
    titulo,
    aoFechar,
    acao,
    botao,
    rodape,
    children,
}: {
    titulo: string;
    aoFechar: () => void;
    acao: (fd: FormData) => Promise<import('@/lib/acoes').Resultado>;
    botao: string;
    rodape?: React.ReactNode;
    children: React.ReactNode;
}) {
    const [executar, pendente] = useAcao();
    return (
        <Modal aberto aoFechar={aoFechar} titulo={titulo} largura="max-w-[480px]">
            <form
                className="modal-corpo"
                onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    executar(() => acao(fd), aoFechar);
                }}
            >
                {children}
                <button type="submit" disabled={pendente} aria-busy={pendente || undefined} className="btn btn-g btn-verde w-full">
                    <Icone nome="check" tamanho={24} /> {botao}
                </button>
                {rodape}
            </form>
        </Modal>
    );
}

/** Exclui de vez (só quem nunca lançou nada; o servidor confere). */
function BotaoExcluir({ usuario, aoExcluir }: { usuario: LinhaUsuario; aoExcluir: () => void }) {
    const [executar, pendente] = useAcao();
    return (
        <button
            type="button"
            disabled={pendente}
            aria-busy={pendente || undefined}
            className="btn btn-contorno-vermelho mt-3 h-[50px] w-full"
            onClick={() =>
                window.confirm(`Excluir ${usuario.nome} (${usuario.login})? Isso não pode ser desfeito.`) &&
                executar(() => excluirUsuario(usuario.id), aoExcluir)
            }
        >
            <Icone nome="trash-2" tamanho={20} /> Excluir usuário
        </button>
    );
}

export function MinhaSenha({ nome, login }: { nome: string; login: string }) {
    const m = useModal();
    return (
        <section className="cartao mb-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
                <div className="text-base font-bold">{nome}</div>
                <div className="text-sm text-suave">login: {login}</div>
            </div>
            <button type="button" className="btn btn-m btn-claro" onClick={() => m.abrir(true)}>
                Trocar minha senha
            </button>
            {m.aberto ? (
                <FormModal titulo="Trocar minha senha" aoFechar={m.fechar} acao={trocarMinhaSenha} botao="Trocar senha">
                    <Campo rotulo="Senha atual" name="atual" type="password" autoComplete="current-password" required />
                    <CamposSenha />
                </FormModal>
            ) : null}
        </section>
    );
}

export function ListaUsuarios({ usuarios, euId }: { usuarios: LinhaUsuario[]; euId: number }) {
    const novo = useModal();
    const editar = useModal<LinhaUsuario>();
    const senha = useModal<LinhaUsuario>();
    const [mostrarInativos, setMostrarInativos] = useState(false);
    const visiveis = usuarios.filter((u) => u.ativo || mostrarInativos);
    const inativos = usuarios.length - usuarios.filter((u) => u.ativo).length;

    return (
        <>
            <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="titulo text-[21px]">Quem usa a Caderneta</h2>
                <button type="button" className="btn btn-m btn-verde" onClick={() => novo.abrir(true)}>
                    <Icone nome="user-plus" tamanho={20} /> Novo usuário
                </button>
            </div>
            <div className="flex flex-col gap-2">
                {visiveis.map((u) => (
                    <div key={u.id} className={`item-lista ${u.ativo ? '' : 'opacity-60'}`}>
                        <div className="min-w-0 flex-1">
                            <div className="text-base font-bold">
                                {u.nome}
                                {u.id === euId ? <span className="font-medium text-suave"> (você)</span> : null}
                            </div>
                            <div className="text-xs text-suave">
                                {u.login}
                                {u.admin ? ' · administrador' : ''}
                                {!u.ativo ? ' · sem acesso' : ''}
                                {u.bloqueado ? ' · bloqueado por tentativas erradas' : ''}
                            </div>
                        </div>
                        <button type="button" className="btn-icone" aria-label={`Editar ${u.nome}`} onClick={() => editar.abrir(u)}>
                            <Icone nome="pencil" tamanho={18} />
                        </button>
                        <button type="button" className="btn btn-m btn-claro h-[42px] px-3 text-sm" onClick={() => senha.abrir(u)}>
                            Nova senha
                        </button>
                    </div>
                ))}
            </div>
            {inativos > 0 ? (
                <button type="button" className="toque mt-3 text-sm font-bold text-suave" onClick={() => setMostrarInativos((v) => !v)}>
                    {mostrarInativos ? 'Esconder' : 'Mostrar'} quem está sem acesso ({inativos})
                </button>
            ) : null}

            {novo.aberto ? (
                <FormModal titulo="Novo usuário" aoFechar={novo.fechar} acao={criarUsuario} botao="Cadastrar">
                    <Campo rotulo="Nome" name="nome" placeholder="Ex.: Maria" required maxLength={80} />
                    <Campo rotulo="Login" name="login" placeholder="Ex.: maria" autoComplete="off" autoCapitalize="none" required maxLength={40} />
                    <CamposSenha rotulo="Senha (mínimo 8 caracteres)" />
                    <Marcar nome="admin" rotulo="Administrador (cadastra e bloqueia usuários)" marcado={false} />
                </FormModal>
            ) : null}
            {editar.dados ? (
                <FormModal
                    key={editar.dados.id}
                    titulo={`Editar ${editar.dados.login}`}
                    aoFechar={editar.fechar}
                    acao={alterarUsuario.bind(null, editar.dados.id)}
                    botao="Salvar"
                    rodape={editar.dados.id !== euId ? <BotaoExcluir usuario={editar.dados} aoExcluir={editar.fechar} /> : null}
                >
                    <Campo rotulo="Nome" name="nome" defaultValue={editar.dados.nome} required maxLength={80} />
                    <Marcar nome="admin" rotulo="Administrador" marcado={editar.dados.admin} />
                    <Marcar nome="ativo" rotulo="Pode entrar na Caderneta" marcado={editar.dados.ativo} />
                </FormModal>
            ) : null}
            {senha.dados ? (
                <FormModal
                    key={senha.dados.id}
                    titulo={`Nova senha para ${senha.dados.nome}`}
                    aoFechar={senha.fechar}
                    acao={redefinirSenha.bind(null, senha.dados.id)}
                    botao="Definir senha"
                >
                    <p className="mb-4 text-sm text-suave">Também desbloqueia o login e encerra as sessões abertas dessa pessoa.</p>
                    <CamposSenha />
                </FormModal>
            ) : null}
        </>
    );
}
