/** Configurações da Caderneta (vale para servidor e navegador). */

export const FORMAS = {
    dinheiro: { rotulo: 'Dinheiro', icone: 'banknote' },
    pix: { rotulo: 'Pix', icone: 'qr-code' },
    cartao: { rotulo: 'Cartão', icone: 'credit-card' },
} as const;

export type Forma = keyof typeof FORMAS;

export const IDS_FORMAS = Object.keys(FORMAS) as Forma[];

export function ehForma(v: unknown): v is Forma {
    return typeof v === 'string' && v in FORMAS;
}

export function rotuloForma(id: string | null | undefined): string {
    return id && ehForma(id) ? FORMAS[id].rotulo : String(id ?? '');
}

/** Cores oferecidas para as categorias. */
export const CORES_CATEGORIA = ['#C9821A', '#1C7ED6', '#9B2C5A', '#2F9E44', '#E8590C', '#7048E8', '#0CA678', '#E03131', '#495057'];

/** Cor de nova categoria e cor usada quando o item não tem categoria. */
export const COR_PADRAO = '#C9821A';
export const COR_SEM_COR = '#75817A';

/** Quantidade máxima de um produto num lançamento. */
export const QTD_MAXIMA = 999;

/** Clientes por página na tela inicial. */
export const CLIENTES_POR_PAGINA = 30;

/** Itens do histórico exibidos antes de "ver tudo". */
export const HISTORICO_POR_PAGINA = 60;

/** Fuso do bar: todas as datas são mostradas e agrupadas nele. */
export const FUSO = 'America/Sao_Paulo';
