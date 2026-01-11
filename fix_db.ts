import { Pool } from 'pg';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(process.cwd(), 'AdaptLearnPro', '.env') });

async function fixAndSeed() {
    const pool = new Pool({
        connectionString: process.env.POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔧 Fixing Constraints and Seeding...');
        
        // Ensure name is UNIQUE in items table
        try {
            await pool.query(`ALTER TABLE items ADD CONSTRAINT items_name_unique UNIQUE (name)`);
            console.log('✅ Added UNIQUE constraint to items(name)');
        } catch (e: any) {
            console.log('ℹ️ items(name) already unique or table needs check.');
        }

        // Ensure username is UNIQUE in users table (it should be, but just in case)
        try {
            await pool.query(`ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username)`);
            console.log('✅ Added UNIQUE constraint to users(username)');
        } catch (e: any) {
            console.log('ℹ️ users(username) already unique.');
        }

        console.log('🌱 Seeding Base Data...');
        await pool.query(`INSERT INTO users (username, password, role, name, level, xp, coins, avatar) VALUES ('admin', 'password123', 'admin', 'Super Admin', 99, 99999, 99999, '👑') ON CONFLICT (username) DO NOTHING`);
        
        const items = [
            ['Streak Freeze', 50, '🧊', 'consumable', 'Keep your streak alive'],
            ['Golden Frame', 500, '🖼️', 'cosmetic', 'Show off your wealth'],
            ['XP Booster', 150, '⚡', 'consumable', 'Double XP for 1 hour'],
            ['Mystery Box', 100, '🎁', 'box', 'Get a random item']
        ];
        
        for (const item of items) {
            await pool.query(`INSERT INTO items (name, price, icon, type, description) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO NOTHING`, item);
            console.log(`🎁 Seeded item: ${item[0]}`);
        }

        // Seed some sample activities if empty
        const actsCount = await pool.query('SELECT COUNT(*) FROM activities');
        if (parseInt(actsCount.rows[0].count) === 0) {
            console.log('📚 Seeding Sample Courses...');
            const sampleContent = JSON.stringify([{
                title: 'Introduction to Galactic Learning',
                lessons: [{ title: 'Welcome to the Universe', type: 'article', body: 'Welcome student! Your journey begins here.' }]
            }]);
            await pool.query(`INSERT INTO activities (title, type, content, category, credits, price, creator_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                ['Cosmic Foundations', 'article', sampleContent, 'Science', 100, 0, 1]);
        }

        console.log('✨ Fix and Seed Completed!');

    } catch (err: any) {
        console.error('❌ Operation Failed:', err.message);
    } finally {
        await pool.end();
    }
}

fixAndSeed();
