// Vercel API Handler - Robust Production Build v2.6 (Auto-Healing)
const { Pool } = require('pg');

let pool = null;
function getPool() {
    if (!pool && process.env.POSTGRES_URL) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
        });
    }
    return pool;
}

module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { method } = req;
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const db = getPool();

    if (!db) return res.status(500).json({ error: "Database connection failed. POSTGRES_URL missing." });

    // Robust JSON Parser
    let body = {};
    if (method === 'POST' || method === 'PUT') {
        try {
            if (typeof req.body === 'string') body = JSON.parse(req.body);
            else if (typeof req.body === 'object') body = req.body;
        } catch(e) { body = {}; }
    }

    const runQuery = async (text, params) => {
        try {
            const result = await db.query(text, params);
            return result.rows;
        } catch(e) {
            console.error(`Query Error: ${text}`, e.message);
            throw e;
        }
    };

    try {
        // --- 1. SYSTEM CONTROL ---
        if (pathname === '/api/init') {
            const schema = [
                `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'student', name TEXT, level INT DEFAULT 1, xp INT DEFAULT 0, coins INT DEFAULT 0, avatar TEXT DEFAULT '🙂', status TEXT DEFAULT 'active', email TEXT, phone TEXT, bio TEXT, school TEXT, cover_image TEXT, birthdate TEXT)`,
                `CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, title TEXT, type TEXT, difficulty TEXT DEFAULT 'Medium', duration TEXT DEFAULT '30m', content TEXT, category TEXT DEFAULT 'General', credits INT DEFAULT 100, price INT DEFAULT 0, creator_id INT, certificate_theme TEXT DEFAULT 'classic')`,
                `CREATE TABLE IF NOT EXISTS enrollments (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, enrolled_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT, price INT DEFAULT 0, type TEXT, icon TEXT)`,
                `CREATE TABLE IF NOT EXISTS user_items (id SERIAL PRIMARY KEY, user_id INT, item_id INT, acquired_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS certificates (id SERIAL PRIMARY KEY, user_id INT, user_name TEXT, course_title TEXT, issue_date TEXT, code TEXT UNIQUE)`,
                `CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT)`,
                `CREATE TABLE IF NOT EXISTS site_visits (id SERIAL PRIMARY KEY, ip_address TEXT, visit_time TEXT)`,
                `CREATE TABLE IF NOT EXISTS login_history (id SERIAL PRIMARY KEY, user_id INT, login_time TEXT, ip_address TEXT, device_info TEXT)`,
                `CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique ON enrollments(user_id, activity_id)`
            ];
            for (const q of schema) await db.query(q);
            return res.json({ success: true, status: "System Ready" });
        }

        if (pathname === '/api/seed') {
            await runQuery(`INSERT INTO users (username, password, role, name, level, xp, coins, avatar) VALUES ('admin', 'password123', 'admin', 'Super Admin', 99, 99999, 99999, '👑') ON CONFLICT (username) DO NOTHING`);
            
            const items = [
                ['Streak Freeze', 50, '🧊', 'consumable', 'Keep your streak alive'],
                ['Golden Frame', 500, '🖼️', 'cosmetic', 'Show off your wealth'],
                ['XP Booster', 150, '⚡', 'consumable', 'Double XP for 1 hour'],
                ['Mystery Box', 100, '🎁', 'box', 'Get a random item']
            ];
            for (const i of items) {
                await runQuery(`INSERT INTO items (name, price, icon, type, description) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO NOTHING`, i);
            }

            const sampleContent = JSON.stringify([{ title: 'Introduction', lessons: [{ title: 'Welcome to Adventure', type: 'article', body: 'Welcome to your first mission. Your journey to mastery begins now.' }] }]);
            const courses = [
                ['Galactic Fundamentals', 'article', 'Science', 100, 0],
                ['Nebula Navigation', 'video', 'Technology', 250, 50],
                ['Starship Engineering', 'simulation', 'Technology', 500, 150]
            ];
            for (const c of courses) {
                await runQuery(`INSERT INTO activities (title, type, content, category, credits, price, creator_id) VALUES ($1, $2, $3, $4, $5, $6, 1) ON CONFLICT DO NOTHING`, [...c, sampleContent].slice(0, 6));
            }

            return res.json({ success: true, message: "Production Data Seeded" });
        }

        // --- 2. CORE DATA ---
        if (pathname === '/api/stats') {
            const u = await runQuery("SELECT COUNT(*) FROM users");
            const a = await runQuery("SELECT COUNT(*) FROM activities");
            const c = await runQuery("SELECT COUNT(*) FROM certificates");
            const v = await runQuery("SELECT COUNT(*) FROM site_visits");
            return res.json({ users: u[0].count, activities: a[0].count, certificates: c[0].count, visits: v[0].count });
        }

        if (pathname === '/api/login' && method === 'POST') {
            const { username, password } = body;
            const rows = await runQuery("SELECT * FROM users WHERE username = $1 AND password = $2", [username, password]);
            if (rows.length > 0) {
                const user = rows[0];
                const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
                await runQuery("INSERT INTO login_history (user_id, login_time, ip_address, device_info) VALUES ($1, $2, $3, $4)", [user.id, new Date().toISOString(), ip, req.headers['user-agent'] || 'unknown']);
                return res.json({ success: true, ...user });
            }
            return res.status(401).json({ success: false, message: "Authentication failed" });
        }

        if (pathname === '/api/analytics') {
            const uid = url.searchParams.get("userId");
            if (!uid || uid === "0") return res.json({ user: { name: 'Guest', role: 'guest', level: 1, xp: 0, coins: 0, avatar: '🕵️' }, certificates: [] });
            
            const user = await runQuery("SELECT * FROM users WHERE id = $1", [uid]);
            if (!user[0]) return res.json({ error: "User not found" });
            
            const certs = await runQuery("SELECT * FROM certificates WHERE user_id = $1", [uid]);
            const rankRes = await runQuery("SELECT COUNT(*) as rank FROM users WHERE xp > (SELECT xp FROM users WHERE id = $1)", [uid]);
            
            return res.json({ user: user[0], certificates: certs, rank: parseInt(rankRes[0].rank) + 1 });
        }

        if (pathname === '/api/activities') {
            const sid = url.searchParams.get("studentId") || "0";
            const q = `SELECT a.*, COALESCE(e.id, 0) as is_enrolled FROM activities a LEFT JOIN enrollments e ON a.id = e.activity_id AND e.user_id = $1 ORDER BY a.id DESC`;
            return res.json(await runQuery(q, [sid]));
        }

        if (pathname === '/api/shop') {
            return res.json(await runQuery("SELECT * FROM items ORDER BY price ASC"));
        }

        if (pathname === '/api/inventory') {
            const uid = url.searchParams.get("userId");
            return res.json(await runQuery("SELECT i.* FROM items i JOIN user_items ui ON i.id = ui.item_id WHERE ui.user_id = $1", [uid]));
        }

        if (pathname === '/api/users') {
            if (method === 'GET') return res.json(await runQuery("SELECT * FROM users ORDER BY id DESC"));
            if (method === 'PUT') {
                const b = body; const f = []; const v = []; let i = 1;
                ['name','role','level','xp','coins','status','avatar','email','phone','school','bio'].forEach(k => { if(b[k] !== undefined) { f.push(`${k} = $${i++}`); v.push(b[k]); } });
                if (f.length > 0) { v.push(b.id); await runQuery(`UPDATE users SET ${f.join(', ')} WHERE id = $${i}`, v); }
                return res.json({ success: true });
            }
        }

        if (pathname === '/api/config') {
            if (method === 'GET') {
                const rows = await runQuery("SELECT * FROM system_config");
                const config = {}; rows.forEach(r => { try { config[r.key] = JSON.parse(r.value); } catch(e) { config[r.key] = r.value; } });
                return res.json(config);
            }
            const { key, value } = body;
            await runQuery("INSERT INTO system_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2", [key, JSON.stringify(value)]);
            return res.json({ success: true });
        }

        return res.status(404).json({ error: "Endpoint not found" });
    } catch (err) {
        console.error("API ERROR:", err.message);
        return res.status(500).json({ error: err.message });
    }
};
