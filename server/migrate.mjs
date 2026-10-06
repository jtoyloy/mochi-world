import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {ITEMS} from '../web/js/traders/economy.js';
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL before migrating');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{await pool.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));for(const item of ITEMS)await pool.query('INSERT INTO items(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=$2',[item.id,item]);console.log('Schema applied and shop seeded');}finally{await pool.end();}
