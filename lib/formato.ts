/** Funções utilitárias (servidor e navegador). */
import { COR_SEM_COR, FUSO } from './config';

/** 12 -> "R$ 12,00" */
export function brl(n: number | string | null | undefined): string {
    return 'R$ ' + Number(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Converte um valor digitado em reais para número.
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 12", "1.000" (mil). Retorna null se inválido.
 */
export function parseMoeda(valor: unknown): number | null {
    let s = String(valor ?? '').trim().replace(/[^\d,.-]/g, '');
    if (s === '' || s === '-') return null;
    if (s.includes(',')) {
        // vírgula é o decimal; pontos são separador de milhar
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
        // só pontos, em grupos de 3: separador de milhar ("1.000", "12.500")
        s = s.replace(/\./g, '');
    }
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    return Math.round(parseFloat(s) * 100) / 100;
}

/** Iniciais para o avatar: "Antônio Ferreira" -> "AF". */
export function iniciais(nome: string, sobrenome = ''): string {
    return ((Array.from(nome.trim())[0] ?? '') + (Array.from(sobrenome.trim())[0] ?? '')).toUpperCase();
}

/** Valor seguro para a variável CSS --cor (só #RRGGBB). */
export function corCss(cor: string | null | undefined): string {
    return cor && /^#[0-9A-Fa-f]{6}$/.test(cor) ? cor : COR_SEM_COR;
}

/* ── Datas (sempre no fuso do bar) ───────────────────────── */

const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Dia (AAAA-MM-DD) de um instante no fuso do bar. */
export function diaDe(d: Date): string {
    return fmtDia.format(d);
}

/** "14:30" */
export function horaDe(d: Date): string {
    return fmtHora.format(d);
}

/** Soma dias a um AAAA-MM-DD. */
export function somarDias(dia: string, n: number): string {
    const d = new Date(dia + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/** Dia da semana (0 = domingo) de um AAAA-MM-DD. */
export function diaDaSemana(dia: string): number {
    return new Date(dia + 'T12:00:00Z').getUTCDay();
}

/** AAAA-MM-DD válido? */
export function ehDia(v: unknown): v is string {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(v + 'T12:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** "AAAA-MM-DD" -> "DD/MM/AAAA" */
export function diaBr(dia: string): string {
    const [a, m, d] = dia.split('-');
    return `${d}/${m}/${a}`;
}

/** Data amigável: "Hoje, 14:30", "Ontem, 09:12" ou "03/09, 20:05". */
export function quando(em: Date, agora: Date): string {
    const hora = horaDe(em);
    const dia = diaDe(em);
    const hoje = diaDe(agora);
    if (dia === hoje) return `Hoje, ${hora}`;
    if (dia === somarDias(hoje, -1)) return `Ontem, ${hora}`;
    return `${dia.slice(8, 10)}/${dia.slice(5, 7)}, ${hora}`;
}
