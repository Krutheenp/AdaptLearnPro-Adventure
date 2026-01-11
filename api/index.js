// Vercel API Handler - Final Production Build
const { Pool } = require('pg');

let pool = null;
function getPool() {
    if (!pool && process.env.POSTGRES_URL) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
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
        // --- 1. SYSTEM CONTROL ---
        if (pathname === '/api/init') {
            const schema = [
                `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'student', name TEXT, level INT DEFAULT 1, xp INT DEFAULT 0, coins INT DEFAULT 0, streak INT DEFAULT 0, avatar TEXT DEFAULT '🙂', status TEXT DEFAULT 'active', email TEXT, phone TEXT, bio TEXT, school TEXT, address TEXT, last_login TEXT)`,
                `CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, title TEXT, type TEXT, difficulty TEXT, duration TEXT, content TEXT, category TEXT DEFAULT 'General', credits INT DEFAULT 1, price INT DEFAULT 0, course_code TEXT, certificate_theme TEXT DEFAULT 'classic', description TEXT, thumbnail TEXT, creator_id INT)`,
                `CREATE TABLE IF NOT EXISTS enrollments (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, enrolled_at TEXT)`,
                `CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique ON enrollments(user_id, activity_id)`,
                `CREATE TABLE IF NOT EXISTS user_progress (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, score INT, status TEXT, completed_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT, description TEXT, price INT, type TEXT, icon TEXT)`,
                `CREATE TABLE IF NOT EXISTS user_items (id SERIAL PRIMARY KEY, user_id INT, item_id INT, acquired_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS certificates (id SERIAL PRIMARY KEY, user_id INT, user_name TEXT, course_title TEXT, issue_date TEXT, code TEXT)`,
                `CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT)`,
                `CREATE TABLE IF NOT EXISTS site_visits (id SERIAL PRIMARY KEY, ip_address TEXT, visit_time TEXT)`,
                `CREATE TABLE IF NOT EXISTS login_history (id SERIAL PRIMARY KEY, user_id INT, login_time TEXT, ip_address TEXT, device_info TEXT)`
            ];
            for (const q of schema) await db.query(q);
            return res.json({ success: true, status: "Schema Ready" });
        }

        if (pathname === '/api/seed') {
            await db.query(`INSERT INTO users (username, password, role, name, level, xp, coins, avatar) VALUES ('admin', 'password123', 'admin', 'Super Admin', 99, 99999, 99999, '👑') ON CONFLICT (username) DO NOTHING`);
            await db.query(`INSERT INTO items (name, price, icon, type) VALUES ('Streak Freeze', 50, '🧊', 'consumable'), ('Golden Frame', 500, '🖼️', 'cosmetic') ON CONFLICT DO NOTHING`);
            return res.json({ success: true, message: "Base Data Seeded" });
        }

        if (pathname === '/api/check-db') {
            if (!db) return res.json({ status: "Error", message: "POSTGRES_URL missing" });
            const result = await db.query('SELECT current_database(), now()');
            return res.json({ status: "Connected ✅", db: result.rows[0].current_database, time: result.rows[0].now });
        }

        // --- 2. USERS & AUTH ---
        if (pathname === '/api/login' && method === 'POST') {
            const { username, password } = req.body;
            const rows = await runQuery("SELECT * FROM users WHERE username = $1 AND password = $2", [username, password]);
            if (rows?.length > 0) return res.json({ success: true, ...rows[0] });
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        if (pathname === '/api/analytics') {
            const userId = url.searchParams.get("userId");
            const user = await runQuery("SELECT * FROM users WHERE id = $1", [userId]);
            const progress = await runQuery("SELECT p.*, a.title FROM user_progress p JOIN activities a ON p.activity_id = a.id WHERE p.user_id = $1", [userId]);
            const certs = await runQuery("SELECT * FROM certificates WHERE user_id = $1", [userId]);
            return res.json({ user: user?.[0] || {}, activities: progress || [], certificates: certs || [] });
        }

        if (pathname === '/api/users') {
            if (method === 'GET') return res.json(await runQuery("SELECT * FROM users ORDER BY id DESC"));
            if (method === 'PUT') {
                const b = req.body; const fields = []; const vals = []; let i = 1;
                ['name','role','level','xp','coins','status','password','avatar'].forEach(f => { if(b[f] !== undefined) { fields.push(`${f} = $${i++}`); vals.push(b[f]); } });
                vals.push(b.id); await runQuery(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`, vals);
                return res.json({ success: true });
            }
            if (method === 'DELETE') { await runQuery("DELETE FROM users WHERE id = $1", [url.searchParams.get("id")]); return res.json({ success: true }); }
        }

        // --- 3. ACTIVITIES ---
        if (pathname === '/api/activities') {
            if (method === 'GET') {
                const instructorId = url.searchParams.get("instructorId");
                let q = "SELECT * FROM activities";
                const params = [];
                if (instructorId && instructorId !== 'debug') { q += " WHERE creator_id = $1"; params.push(instructorId); }
                return res.json(await runQuery(q + " ORDER BY id DESC", params));
            }
            if (method === 'POST') {
                const b = req.body; const content = typeof b.content === 'object' ? JSON.stringify(b.content) : b.content;
                await runQuery("INSERT INTO activities (title, type, difficulty, duration, content, category, credits, price, creator_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", 
                    [b.title, b.type, b.difficulty, b.duration, content, b.category, b.credits, b.price, b.creator_id]);
                return res.json({ success: true });
            }
        }

        // --- 4. SHOP & OTHERS ---
        if (pathname === '/api/shop') {
            if (method === 'GET') return res.json(await runQuery("SELECT * FROM items ORDER BY price ASC"));
            if (method === 'POST') {
                const b = req.body;
                await runQuery("INSERT INTO items (name, price, icon, type, description) VALUES ($1, $2, $3, $4, $5)", [b.name, b.price, b.icon, b.type, b.description]);
                return res.json({ success: true });
            }
            if (method === 'DELETE') { await runQuery("DELETE FROM items WHERE id = $1", [url.searchParams.get("id")]); return res.json({ success: true }); }
        }

        if (pathname === '/api/certificate' && method === 'GET') return res.json(await runQuery("SELECT * FROM certificates ORDER BY id DESC"));

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

        if (pathname === '/api/visit') {
            if (method === 'GET') {
                const rows = await runQuery("SELECT COUNT(*) as count FROM site_visits");
                return res.json({ total_visits: rows[0].count });
            }
            const ip = req.headers['x-forwarded-for'] || 'unknown';
            await runQuery("INSERT INTO site_visits (ip_address, visit_time) VALUES ($1, $2)", [ip, new Date().toISOString()]);
            return res.json({ success: true });
        }

        return res.status(404).json({ error: "Route not found" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
};
