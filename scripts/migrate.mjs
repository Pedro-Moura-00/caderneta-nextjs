// Cria/atualiza as tabelas: npm run db:migrate
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('Defina DATABASE_URL (veja .env.example).');
    process.exit(1);
}

const sql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
    await client.query(sql);
    console.log('Banco atualizado.');
} finally {
    await client.end();
}
