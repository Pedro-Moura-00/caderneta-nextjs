import { diaBr, diaDaSemana, ehDia } from '@/lib/formato';

export const PERIODOS = ['dia', 'semana', 'mes', 'ano', 'personalizado'] as const;
export type Periodo = (typeof PERIODOS)[number];

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const um = (v: string | string[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Período pedido na URL: p=dia|semana|mes|ano, ou de/ate (AAAA-MM-DD) para personalizado.
 * `hoje` é o dia atual no fuso do bar.
 */
export function lerPeriodo(
    q: { p?: string | string[] | null; de?: string | string[] | null; ate?: string | string[] | null },
    hoje: string,
): { periodo: Periodo; de: string; ate: string } {
    const p = um(q.p);
    const de = ehDia(um(q.de)) ? um(q.de) : null;
    const ate = ehDia(um(q.ate)) ? um(q.ate) : null;

    if (p === 'personalizado' || (p === '' && de)) {
        let a = de ?? hoje;
        let b = ate ?? hoje;
        if (b < a) [a, b] = [b, a];
        return { periodo: 'personalizado', de: a, ate: b };
    }
    switch (p) {
        case 'semana': {
            // segunda-feira desta semana
            const volta = (diaDaSemana(hoje) + 6) % 7;
            const d = new Date(hoje + 'T12:00:00Z');
            d.setUTCDate(d.getUTCDate() - volta);
            return { periodo: 'semana', de: d.toISOString().slice(0, 10), ate: hoje };
        }
        case 'mes':
            return { periodo: 'mes', de: hoje.slice(0, 8) + '01', ate: hoje };
        case 'ano':
            return { periodo: 'ano', de: hoje.slice(0, 5) + '01-01', ate: hoje };
        default:
            return { periodo: 'dia', de: hoje, ate: hoje };
    }
}

export function rotuloPeriodo(periodo: Periodo, de: string, ate: string): string {
    const dm = (d: string) => diaBr(d).slice(0, 5);
    switch (periodo) {
        case 'dia':
            return `Hoje · ${dm(de)}`;
        case 'semana':
            return `Semana · ${dm(de)} a ${dm(ate)}`;
        case 'mes':
            return `${MESES[Number(de.slice(5, 7)) - 1]} de ${de.slice(0, 4)}`;
        case 'ano':
            return de.slice(0, 4);
        default:
            return de === ate ? diaBr(de) : `${diaBr(de)} a ${diaBr(ate)}`;
    }
}
