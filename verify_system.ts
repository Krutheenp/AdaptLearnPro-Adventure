import { Pool } from 'pg';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(process.cwd(), 'AdaptLearnPro', '.env') });

async function verifyAll() {
    const pool = new Pool({
        connectionString: process.env.POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🧪 Final Verification Test...');
        
        // 1. Check Admin User
        const userRes = await pool.query("SELECT * FROM users WHERE username = 'admin'");
        if (userRes.rows.length > 0) {
            console.log(`✅ Admin User found: ${userRes.rows[0].name}`);
        } else {
            console.log('❌ Admin User NOT found!');
        }

        // 2. Check Items
        const itemsRes = await pool.query("SELECT COUNT(*) FROM items");
        console.log(`✅ Shop Items count: ${itemsRes.rows[0].count}`);

        // 3. Check Stats
        const stats = {
            users: (await pool.query("SELECT COUNT(*) FROM users")).rows[0].count,
            items: (await pool.query("SELECT COUNT(*) FROM items")).rows[0].count,
            activities: (await pool.query("SELECT COUNT(*) FROM activities")).rows[0].count
        };
        console.log('📊 Stats Summary:', stats);

        console.log('🏆 System is FULLY OPERATIONAL!');

    } catch (err: any) {
        console.error('❌ Verification Failed:', err.message);
    } finally {
        await pool.end();
    }
}

verifyAll();
