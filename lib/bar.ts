import 'server-only';

/** Nome exibido no título e no cabeçalho (BAR_NOME no .env.local). */
export const nomeBar = process.env.BAR_NOME?.trim() || 'Bar do Will';
