import type { NextRequest } from 'next/server';
import { rotuloForma } from '@/lib/config';
import { linhasExportacao } from '@/lib/dados';
import { diaDe, horaDe } from '@/lib/formato';
import { lerPeriodo } from '../periodo';

/** Campo CSV: entre aspas quando tem separador, aspas, espaço ou quebra de linha. */
function campo(v: string): string {
    return /[;"\s]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

const num = (v: number | null) => (v === null ? '' : v.toFixed(2).replace('.', ','));

/** Planilha CSV do período (separador ";", decimais com vírgula, BOM para o Excel ler acentos). */
export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams;
    const { de, ate } = lerPeriodo({ p: q.get('p'), de: q.get('de'), ate: q.get('ate') }, diaDe(new Date()));

    const linhas = [['Data', 'Hora', 'Tipo', 'Cliente', 'Descrição', 'Categoria', 'Qtd', 'Preço unitário', 'Valor', 'Forma', 'Situação']];
    for (const l of await linhasExportacao(de, ate)) {
        const dia = diaDe(l.data_hora);
        linhas.push([
            `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`,
            horaDe(l.data_hora),
            l.tipo,
            l.cliente ?? '',
            l.descricao,
            l.categoria ?? '',
            l.quantidade === null ? '' : String(l.quantidade),
            num(l.preco_unitario),
            num(l.valor),
            l.forma ? rotuloForma(l.forma) : '',
            l.situacao,
        ]);
    }
    const csv = '﻿' + linhas.map((l) => l.map(campo).join(';')).join('\n') + '\n';

    return new Response(csv, {
        headers: {
            'Content-Type': 'text/csv; charset=UTF-8',
            'Content-Disposition': `attachment; filename="caderneta_${de}_a_${ate}.csv"`,
        },
    });
}
