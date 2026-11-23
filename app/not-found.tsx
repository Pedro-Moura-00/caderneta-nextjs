import Link from 'next/link';
import { EstadoVazio, Pagina } from '@/components/ui';

export default function NaoEncontrado() {
    return (
        <Pagina>
            <EstadoVazio titulo="Não encontrado" texto="Esse endereço não existe (ou o cliente foi removido).">
                <Link href="/" className="btn btn-m btn-verde mt-4">
                    Voltar ao início
                </Link>
            </EstadoVazio>
        </Pagina>
    );
}
