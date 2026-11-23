'use client';

import { Icone } from '@/components/Icone';
import { Modal, useAcao, useModal } from '@/components/interativos';
import { Campo } from '@/components/ui';
import { cancelarVenda } from '@/lib/acoes';

/** Botão "Cancelar venda" com o modal do motivo. */
export function BotaoCancelarVenda({ vendaId, descricao }: { vendaId: number; descricao: string }) {
    const m = useModal();
    const [executar, pendente] = useAcao();
    return (
        <>
            <button type="button" onClick={() => m.abrir(true)} className="toque inline-flex items-center gap-1 text-sm font-bold text-vermelho">
                <Icone nome="x" tamanho={16} /> Cancelar venda
            </button>
            <Modal aberto={m.aberto} aoFechar={m.fechar} titulo="Cancelar venda" largura="max-w-[480px]">
                <form
                    className="modal-corpo text-left"
                    onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        executar(() => cancelarVenda(vendaId, fd), m.fechar);
                    }}
                >
                    <p className="mb-3 rounded-2xl border-2 border-linha bg-fundo p-3 text-center text-[15px] font-semibold">{descricao}</p>
                    <p className="mb-4 text-sm text-suave">O valor sai do caixa e dos relatórios. A venda continua listada aqui, marcada como cancelada.</p>
                    <Campo rotulo="Motivo (opcional)" name="motivo" placeholder="Ex.: cobrado duas vezes" maxLength={200} />
                    <button type="submit" disabled={pendente} aria-busy={pendente || undefined} className="btn btn-g btn-contorno-vermelho w-full">
                        <Icone nome="x" tamanho={22} /> Cancelar venda
                    </button>
                </form>
            </Modal>
        </>
    );
}
