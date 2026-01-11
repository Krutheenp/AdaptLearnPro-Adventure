import { Pool } from 'pg';
import { config } from 'dotenv';
import { join } from 'path';

// Load .env from AdaptLearnPro directory
config({ path: join(process.cwd(), 'AdaptLearnPro', '.env') });

async function testConnection() {
    const connectionString = process.env.POSTGRES_URL;
    
    if (!connectionString) {
        console.error('❌ POSTGRES_URL not found in .env file.');
        process.exit(1);
    }

    console.log('📡 Attempting to connect to Postgres...');
    console.log(`🔗 Target: ${connectionString.split('@')[1]}`); // Mask credentials

    const pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const client = await pool.connect();
        console.log('✅ Connection Successful!');
        
        const res = await client.query('SELECT current_database(), now(), version()');
        console.log('📊 Database Info:');
        console.log(`   - Database: ${res.rows[0].current_database}`);
        console.log(`   - Time: ${res.rows[0].now}`);
        console.log(`   - Version: ${res.rows[0].version.split(',')[0]}`);
        
        client.release();
    } catch (err: any) {
        console.error('❌ Connection Failed!');
        console.error(`📁 Error: ${err.message}`);
    } finally {
        await pool.end();
    }
}

testConnection();
