import { Pool } from 'pg';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(process.cwd(), 'AdaptLearnPro', '.env') });

async function resetAndSync() {
    const pool = new Pool({
        connectionString: process.env.POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔄 OVERHAULING DATABASE SYSTEM v3.0...');
        
        // Wipe existing tables to ensure clean state
        const tables = ['certificates', 'user_items', 'items', 'user_progress', 'enrollments', 'activities', 'login_history', 'site_visits', 'system_config', 'users'];
        for (const table of tables) {
            await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
            console.log(`🗑️ Dropped ${table}`);
        }

        const schema = [
            `CREATE TABLE users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'student', name TEXT, level INT DEFAULT 1, xp INT DEFAULT 0, coins INT DEFAULT 0, streak INT DEFAULT 0, avatar TEXT DEFAULT '🙂', status TEXT DEFAULT 'active', email TEXT, phone TEXT, bio TEXT, school TEXT, cover_image TEXT, birthdate TEXT)`,
            `CREATE TABLE activities (id SERIAL PRIMARY KEY, title TEXT UNIQUE NOT NULL, type TEXT, difficulty TEXT DEFAULT 'Medium', duration TEXT DEFAULT '30m', content TEXT, category TEXT DEFAULT 'General', credits INT DEFAULT 100, price INT DEFAULT 0, creator_id INT, certificate_theme TEXT DEFAULT 'classic')`,
            `CREATE TABLE enrollments (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, activity_id INT REFERENCES activities(id) ON DELETE CASCADE, enrolled_at TEXT)`,
            `CREATE UNIQUE INDEX idx_enrollments_unique ON enrollments(user_id, activity_id)`,
            `CREATE TABLE user_progress (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, activity_id INT REFERENCES activities(id) ON DELETE CASCADE, score INT DEFAULT 0, status TEXT, completed_at TEXT)`,
            `CREATE TABLE items (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT, price INT DEFAULT 0, type TEXT, icon TEXT)`,
            `CREATE TABLE user_items (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, item_id INT REFERENCES items(id) ON DELETE CASCADE, acquired_at TEXT)`,
            `CREATE TABLE certificates (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, user_name TEXT, course_title TEXT, issue_date TEXT, code TEXT UNIQUE)`,
            `CREATE TABLE system_config (key TEXT PRIMARY KEY, value TEXT)`,
            `CREATE TABLE site_visits (id SERIAL PRIMARY KEY, ip_address TEXT, visit_time TEXT)`,
            `CREATE TABLE login_history (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, login_time TEXT, ip_address TEXT, device_info TEXT)`
        ];

        for (const q of schema) {
            await pool.query(q);
            console.log(`✅ Created: ${q.split(' ')[2]}`);
        }

        console.log('🌱 Seeding Clean Production Data...');
        // Admin
        await pool.query(`INSERT INTO users (username, password, role, name, level, xp, coins, avatar) VALUES ('admin', 'password123', 'admin', 'Super Admin', 99, 99999, 99999, '👑')`);
        
        // Shop Items
        const items = [
            ['Streak Freeze', 50, '🧊', 'consumable', 'Keep your streak alive'],
            ['Golden Frame', 500, '🖼️', 'cosmetic', 'Show off your wealth'],
            ['XP Booster', 150, '⚡', 'consumable', 'Double XP for 1 hour'],
            ['Mystery Box', 100, '🎁', 'box', 'Get a random item']
        ];
        for (const i of items) await pool.query(`INSERT INTO items (name, price, icon, type, description) VALUES ($1, $2, $3, $4, $5)`, i);

        // Courses
        const sample = JSON.stringify([{title:'Unit 1: The Beginning', lessons:[{title:'Getting Started', type:'article', body:'Welcome to the platform. Explore the stars!'}]}]);
        const courses = [
            ['Galactic Fundamentals', 'article', 'Science', 100, 0, sample],
            ['Nebula Navigation', 'video', 'Technology', 250, 50, sample],
            ['Starship Engineering', 'simulation', 'Technology', 500, 150, sample]
        ];
        for (const c of courses) await pool.query(`INSERT INTO activities (title, type, category, credits, price, content, creator_id) VALUES ($1, $2, $3, $4, $5, $6, 1)`, c);

        console.log('🏆 DATABASE v3.0 OVERHAUL COMPLETE!');

    } catch (err: any) {
        console.error('❌ Overhaul Failed:', err.message);
    } finally {
        await pool.end();
    }
}

resetAndSync();
