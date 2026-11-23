'use client';

import { Icone } from '@/components/Icone';
import { useAcao } from '@/components/interativos';
import { Campo } from '@/components/ui';
import { criarPrimeiroAdmin, entrar } from '@/lib/acoes-conta';

export function FormEntrar({ de }: { de: string }) {
    const [executar, pendente] = useAcao();
    return (
        <form
            className="cartao p-5"
            onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                executar(() => entrar(fd));
            }}
        >
            <input type="hidden" name="de" value={de} />
            <Campo rotulo="Login" name="login" autoComplete="username" autoCapitalize="none" autoFocus required maxLength={40} />
            <Campo rotulo="Senha" name="senha" type="password" autoComplete="current-password" required className="mb-5 block" />
            <button type="submit" disabled={pendente} aria-busy={pendente || undefined} className="btn btn-g btn-verde w-full">
                <Icone nome="check" tamanho={24} /> Entrar
            </button>
        </form>
    );
}

/** Primeiro acesso: ainda não há usuários. */
export function FormPrimeiroAdmin() {
    const [executar, pendente] = useAcao();
    return (
        <form
            className="cartao p-5"
            onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                executar(() => criarPrimeiroAdmin(fd));
            }}
        >
            <h2 className="titulo mb-1 text-xl">Primeiro acesso</h2>
            <p className="mb-4 text-sm text-suave">
                Crie o usuário administrador. Ele cadastra as outras pessoas depois. O código de instalação é o valor de CODIGO_INSTALACAO
                configurado no servidor.
            </p>
            <Campo rotulo="Código de instalação" name="codigo" type="password" autoComplete="off" required />
            <Campo rotulo="Seu nome" name="nome" placeholder="Ex.: Will" required maxLength={80} />
            <Campo rotulo="Login" name="login" placeholder="Ex.: will" autoComplete="username" autoCapitalize="none" required maxLength={40} />
            <Campo rotulo="Senha (mínimo 8 caracteres)" name="senha" type="password" autoComplete="new-password" required minLength={8} />
            <Campo rotulo="Repita a senha" name="confirmacao" type="password" autoComplete="new-password" required className="mb-5 block" />
            <button type="submit" disabled={pendente} aria-busy={pendente || undefined} className="btn btn-g btn-verde w-full">
                <Icone nome="user-plus" tamanho={24} /> Criar e entrar
            </button>
        </form>
    );
}
