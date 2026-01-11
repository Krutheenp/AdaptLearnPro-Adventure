import { Pool } from 'pg';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(process.cwd(), 'AdaptLearnPro', '.env') });

async function initDB() {
    const pool = new Pool({
        connectionString: process.env.POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🚀 Starting Database Initialization...');
        
        const schema = [
            `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'student', name TEXT, level INT DEFAULT 1, xp INT DEFAULT 0, coins INT DEFAULT 0, streak INT DEFAULT 0, avatar TEXT DEFAULT '🙂', status TEXT DEFAULT 'active', email TEXT, phone TEXT, bio TEXT, school TEXT, address TEXT, last_login TEXT, cover_image TEXT, birthdate TEXT)`,
            `CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, title TEXT, type TEXT, difficulty TEXT, duration TEXT, content TEXT, category TEXT DEFAULT 'General', credits INT DEFAULT 1, price INT DEFAULT 0, course_code TEXT, certificate_theme TEXT DEFAULT 'classic', description TEXT, thumbnail TEXT, creator_id INT)`,
            `CREATE TABLE IF NOT EXISTS enrollments (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, enrolled_at TEXT)`,
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique ON enrollments(user_id, activity_id)`,
            `CREATE TABLE IF NOT EXISTS user_progress (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, score INT, status TEXT, completed_at TEXT)`,
            `CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT, price INT, type TEXT, icon TEXT)`,
            `CREATE TABLE IF NOT EXISTS user_items (id SERIAL PRIMARY KEY, user_id INT, item_id INT, acquired_at TEXT)`,
            `CREATE TABLE IF NOT EXISTS certificates (id SERIAL PRIMARY KEY, user_id INT, user_name TEXT, course_title TEXT, issue_date TEXT, code TEXT UNIQUE)`,
            `CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT)`,
            `CREATE TABLE IF NOT EXISTS site_visits (id SERIAL PRIMARY KEY, ip_address TEXT, visit_time TEXT)`,
            `CREATE TABLE IF NOT EXISTS login_history (id SERIAL PRIMARY KEY, user_id INT, login_time TEXT, ip_address TEXT, device_info TEXT)`
        ];

        for (const q of schema) {
            await pool.query(q);
            console.log(`✅ Executed: ${q.substring(0, 50)}...`);
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
        }

        console.log('✨ Database is now ready for production!');

    } catch (err: any) {
        console.error('❌ Initialization Failed:', err.message);
    } finally {
        await pool.end();
    }
}

initDB();
