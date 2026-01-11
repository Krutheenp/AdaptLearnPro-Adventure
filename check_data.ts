import { Pool } from 'pg';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(process.cwd(), 'AdaptLearnPro', '.env') });

async function checkData() {
    const pool = new Pool({
        connectionString: process.env.POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const acts = await pool.query("SELECT * FROM activities");
        console.log('Activities in DB:', JSON.stringify(acts.rows, null, 2));
        
        const items = await pool.query("SELECT * FROM items");
        console.log('Items in DB:', JSON.stringify(items.rows, null, 2));
    } catch (err: any) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

checkData();
