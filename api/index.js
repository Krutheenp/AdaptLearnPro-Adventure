// Vercel API Handler - Robust Production Version
const { Pool } = require('pg');

let pool = null;
function getPool() {
    if (!pool && process.env.POSTGRES_URL) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
    }
    return pool;
}

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { method } = req;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const db = getPool();

    const runQuery = async (text, params) => {
        if (!db) return null;
        const result = await db.query(text, params);
        return result.rows;
    };

    try {
        // --- DB INIT ---
        if (pathname === '/api/init') {
            const schema = [
                `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'student', name TEXT, level INT DEFAULT 1, xp INT DEFAULT 0, coins INT DEFAULT 0, streak INT DEFAULT 0, avatar TEXT DEFAULT '🙂', status TEXT DEFAULT 'active', email TEXT, phone TEXT, bio TEXT, school TEXT, address TEXT, last_login TEXT)`,
                `CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, title TEXT, type TEXT, difficulty TEXT, duration TEXT, content TEXT, category TEXT DEFAULT 'General', credits INT DEFAULT 1, price INT DEFAULT 0, course_code TEXT, certificate_theme TEXT DEFAULT 'classic', description TEXT, creator_id INT)`,
                `CREATE TABLE IF NOT EXISTS enrollments (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, enrolled_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS user_progress (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, score INT, status TEXT, completed_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT, description TEXT, price INT, type TEXT, icon TEXT)`,
                `CREATE TABLE IF NOT EXISTS certificates (id SERIAL PRIMARY KEY, user_id INT, user_name TEXT, course_title TEXT, issue_date TEXT, code TEXT)`,
                `CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT)`,
                `CREATE TABLE IF NOT EXISTS site_visits (id SERIAL PRIMARY KEY, ip_address TEXT, visit_time TEXT)`
            ];
            for (const q of schema) await db.query(q);
            return res.json({ success: true });
        }

        // --- SEED ---
        if (pathname === '/api/seed') {
            // Seed Admin
            await db.query(`INSERT INTO users (username, password, role, name, level, xp, coins, avatar) VALUES ('admin', 'password123', 'admin', 'Super Admin', 99, 99999, 99999, '👑') ON CONFLICT (username) DO NOTHING`);
            // Seed Course
            const actCheck = await runQuery("SELECT id FROM activities LIMIT 1");
            if (actCheck.length === 0) {
                await db.query(`INSERT INTO activities (title, category, difficulty, price, credits, type) VALUES ('Python 101', 'Technology', 'Easy', 0, 100, 'video'), ('คณิตศาสตร์พื้นฐาน', 'Mathematics', 'Easy', 50, 200, 'game')`);
            }
            // Seed Items
            const itemCheck = await runQuery("SELECT id FROM items LIMIT 1");
            if (itemCheck.length === 0) {
                await db.query(`INSERT INTO items (name, price, icon, type) VALUES ('Streak Freeze', 50, '🧊', 'consumable'), ('Golden Frame', 500, '🖼️', 'cosmetic')`);
            }
            return res.json({ success: true, message: "Production data seeded" });
        }

        // --- AUTH ---
        if (pathname === '/api/login' && method === 'POST') {
            const { username, password } = req.body;
            const rows = await runQuery("SELECT * FROM users WHERE username = $1 AND password = $2", [username, password]);
            if (rows?.length > 0) return res.json({ success: true, ...rows[0] });
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        // --- ADMIN DASHBOARD DATA ---
        if (pathname === '/api/users' && method === 'GET') return res.json(await runQuery("SELECT * FROM users ORDER BY id DESC") || []);
        
        if (pathname === '/api/activities' && method === 'GET') {
            const instructorId = url.searchParams.get("instructorId");
            let q = "SELECT * FROM activities";
            if (instructorId && instructorId !== 'debug') q += ` WHERE creator_id = ${parseInt(instructorId)}`;
            return res.json(await runQuery(q + " ORDER BY id DESC") || []);
        }

        if (pathname === '/api/shop' && method === 'GET') return res.json(await runQuery("SELECT * FROM items ORDER BY price ASC") || []);
        
        if (pathname === '/api/certificate' && method === 'GET') return res.json(await runQuery("SELECT * FROM certificates ORDER BY id DESC") || []);

        if (pathname === '/api/visit') {
            if (method === 'GET') {
                const rows = await runQuery("SELECT COUNT(*) as total FROM site_visits");
                return res.json({ total_visits: rows[0].total });
            }
            const ip = req.headers['x-forwarded-for'] || 'unknown';
            await runQuery("INSERT INTO site_visits (ip_address, visit_time) VALUES ($1, $2)", [ip, new Date().toISOString()]);
            return res.json({ success: true });
        }

        if (pathname === '/api/config') {
            if (method === 'GET') {
                const rows = await runQuery("SELECT * FROM system_config");
                const config = {}; rows?.forEach(r => { try { config[r.key] = JSON.parse(r.value); } catch(e) { config[r.key] = r.value; } });
                return res.json(config);
            }
            const { key, value } = req.body;
            await runQuery("INSERT INTO system_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2", [key, JSON.stringify(value)]);
            return res.json({ success: true });
        }

        // --- CRUD ACTIONS ---
        if (pathname === '/api/users' && method === 'PUT') {
            const b = req.body; const fields = []; const vals = []; let i = 1;
            ['name','role','level','xp','coins','status'].forEach(f => { if(b[f] !== undefined) { fields.push(`${f} = $${i++}`); vals.push(b[f]); } });
            vals.push(b.id); await runQuery(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`, vals);
            return res.json({ success: true });
        }

        if (pathname === '/api/users' && method === 'DELETE') {
            await runQuery("DELETE FROM users WHERE id = $1", [url.searchParams.get("id")]);
            return res.json({ success: true });
        }

        return res.status(404).json({ error: "Not found" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};