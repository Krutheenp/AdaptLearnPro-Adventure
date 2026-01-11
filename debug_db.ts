import { Pool } from 'pg';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(process.cwd(), 'AdaptLearnPro', '.env') });

async function debugDB() {
    const pool = new Pool({
        connectionString: process.env.POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔍 Debugging Items Table...');
        
        // Drop and recreate to be 100% sure
        console.log('⚠️ Recreating items table...');
        await pool.query(`DROP TABLE IF EXISTS user_items`); // Dependent table
        await pool.query(`DROP TABLE IF EXISTS items`);
        
        await pool.query(`
            CREATE TABLE items (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                price INT DEFAULT 0,
                type TEXT,
                icon TEXT
            )
        `);
        console.log('✅ Created items table with UNIQUE name');

        await pool.query(`
            CREATE TABLE user_items (
                id SERIAL PRIMARY KEY,
                user_id INT,
                item_id INT REFERENCES items(id),
                acquired_at TEXT
            )
        `);
        console.log('✅ Created user_items table');

        console.log('🌱 Seeding Items...');
        const items = [
            ['Streak Freeze', 50, '🧊', 'consumable', 'Keep your streak alive'],
            ['Golden Frame', 500, '🖼️', 'cosmetic', 'Show off your wealth'],
            ['XP Booster', 150, '⚡', 'consumable', 'Double XP for 1 hour'],
            ['Mystery Box', 100, '🎁', 'box', 'Get a random item']
        ];
        
        for (const item of items) {
            await pool.query(`INSERT INTO items (name, price, icon, type, description) VALUES ($1, $2, $3, $4, $5)`, item);
            console.log(`🎁 Seeded item: ${item[0]}`);
        }

        console.log('✨ All Good!');

    } catch (err: any) {
        console.error('❌ Debug Failed:', err.message);
    } finally {
        await pool.end();
    }
}

debugDB();
