import { Pool } from 'pg';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(process.cwd(), 'AdaptLearnPro', '.env') });

async function diagnose() {
    const pool = new Pool({
        connectionString: process.env.POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔍 Database Diagnostics Starting...');
        const client = await pool.connect();
        console.log('✅ Connection to Neon Postgres: SUCCESSful');

        const tables = ['users', 'activities', 'items', 'enrollments', 'certificates'];
        console.log('\n📊 Table Integrity Check:');
        
        for (const table of tables) {
            try {
                const res = await client.query(`SELECT COUNT(*) FROM ${table}`);
                console.log(`   - Table [${table}]: EXISTS (Rows: ${res.rows[0].count})`);
            } catch (e: any) {
                console.log(`   - Table [${table}]: ❌ MISSING or ERROR (${e.message})`);
            }
        }

        const adminCheck = await client.query("SELECT id, username, role FROM users WHERE username = 'admin'");
        if (adminCheck.rows.length > 0) {
            console.log(`\n🔑 Admin User Check: FOUND (${adminCheck.rows[0].username})`);
        } else {
            console.log('\n🔑 Admin User Check: ❌ NOT FOUND');
        }

        client.release();
    } catch (err: any) {
        console.error('❌ Connection Failed:', err.message);
    } finally {
        await pool.end();
        console.log('\n🏁 Diagnostics Complete.');
    }
}

diagnose();
