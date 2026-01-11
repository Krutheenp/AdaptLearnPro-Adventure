// Vercel API Handler - Modern Gamified Build v3.1
const { Pool } = require('pg');

let pool = null;
function getPool() {
    if (!pool && process.env.POSTGRES_URL) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 25,
            idleTimeoutMillis: 30000,
        });
    }
    return pool;
}

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { method } = req;
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const db = getPool();

    if (!db) return res.status(500).json({ error: "Cloud DB Unavailable" });

    let body = {};
    if (method === 'POST' || method === 'PUT') {
        try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch(e) { body = {}; }
    }

    const runQuery = async (text, params) => {
        const result = await db.query(text, params);
        return result.rows;
    };

    try {
        // --- 1. CORE SYSTEM ---
        if (pathname === '/api/init') {
            const schema = [
                `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'student', name TEXT, level INT DEFAULT 1, xp INT DEFAULT 0, coins INT DEFAULT 0, streak INT DEFAULT 0, avatar TEXT DEFAULT '🙂', status TEXT DEFAULT 'active', email TEXT, phone TEXT, bio TEXT, school TEXT, cover_image TEXT, birthdate TEXT, last_active TEXT)`,
                `CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, title TEXT UNIQUE NOT NULL, type TEXT, content TEXT, category TEXT DEFAULT 'General', credits INT DEFAULT 100, price INT DEFAULT 0, creator_id INT, difficulty TEXT DEFAULT 'Novice')`,
                `CREATE TABLE IF NOT EXISTS enrollments (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, activity_id INT REFERENCES activities(id) ON DELETE CASCADE, enrolled_at TEXT, UNIQUE(user_id, activity_id))`,
                `CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT, price INT DEFAULT 0, type TEXT, icon TEXT)`,
                `CREATE TABLE IF NOT EXISTS user_items (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, item_id INT REFERENCES items(id) ON DELETE CASCADE, acquired_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS certificates (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, user_name TEXT, course_title TEXT, issue_date TEXT, code TEXT UNIQUE)`,
                `CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT)`
            ];
            for (const q of schema) await runQuery(q);
            return res.json({ success: true, version: "3.1" });
        }

        // --- 2. AUTH & PROFILE ---
        if (pathname === '/api/login' && method === 'POST') {
            const rows = await runQuery("SELECT * FROM users WHERE username = $1 AND password = $2", [body.username, body.password]);
            if (rows.length > 0) {
                await runQuery("UPDATE users SET last_active = $1 WHERE id = $2", [new Date().toISOString(), rows[0].id]);
                return res.json({ success: true, ...rows[0] });
            }
            return res.status(401).json({ success: false });
        }

        if (pathname === '/api/analytics') {
            const uid = url.searchParams.get("userId");
            if (!uid || uid === "0") return res.json({ user: { name: 'Guest', role: 'guest', xp: 0, coins: 0 }, certificates: [] });
            const user = (await runQuery("SELECT * FROM users WHERE id = $1", [uid]))[0];
            const certs = await runQuery("SELECT * FROM certificates WHERE user_id = $1", [uid]);
            const rank = (await runQuery("SELECT COUNT(*) as rank FROM users WHERE xp > $1", [user?.xp || 0]))[0].rank;
            return res.json({ user, certificates: certs, rank: parseInt(rank) + 1 });
        }

        // --- 3. STORE & MISSIONS ---
        if (pathname === '/api/activities') {
            const sid = url.searchParams.get("studentId") || "0";
            return res.json(await runQuery(`SELECT a.*, (SELECT id FROM enrollments WHERE user_id = $1 AND activity_id = a.id) as enrollment_id FROM activities a ORDER BY a.id DESC`, [sid]));
        }

        if (pathname === '/api/shop') return res.json(await runQuery("SELECT * FROM items ORDER BY price ASC"));

        if (pathname === '/api/enroll' && method === 'POST') {
            const { userId, activityId } = body;
            const act = (await runQuery("SELECT price FROM activities WHERE id = $1", [activityId]))[0];
            const user = (await runQuery("SELECT coins FROM users WHERE id = $1", [userId]))[0];
            if (act.price > user.coins) return res.status(400).json({ error: "Insufficient Coins" });
            await runQuery("UPDATE users SET coins = coins - $1 WHERE id = $2", [act.price, userId]);
            await runQuery("INSERT INTO enrollments (user_id, activity_id, enrolled_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [userId, activityId, new Date().toISOString()]);
            return res.json({ success: true });
        }

        if (pathname === '/api/users' && method === 'PUT') {
            const b = body; const f = []; const v = []; let i = 1;
            ['name','role','level','xp','coins','avatar','bio','school','cover_image'].forEach(k => { if(b[k] !== undefined) { f.push(`${k} = $${i++}`); v.push(b[k]); } });
            v.push(b.id); await runQuery(`UPDATE users SET ${f.join(', ')} WHERE id = $${i}`, v);
            return res.json({ success: true });
        }

        return res.status(404).json({ error: "Protocol Error" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};
