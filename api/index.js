// Vercel API Handler - Perfect Integration v3.2
const { Pool } = require('pg');

let pool = null;
function getPool() {
    if (!pool && process.env.POSTGRES_URL) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 20,
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

    if (!db) return res.status(500).json({ error: "Real-time DB Connection Failed" });

    let body = {};
    if (method === 'POST' || method === 'PUT') {
        try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch(e) { body = {}; }
    }

    const runQuery = async (text, params) => {
        const result = await db.query(text, params);
        return result.rows;
    };

    try {
        // --- SYSTEM ---
        if (pathname === '/api/init') {
            const schema = [
                `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'student', name TEXT, level INT DEFAULT 1, xp INT DEFAULT 0, coins INT DEFAULT 0, avatar TEXT DEFAULT '🙂', status TEXT DEFAULT 'active', email TEXT, phone TEXT, bio TEXT, school TEXT, cover_image TEXT, birthdate TEXT)`,
                `CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, title TEXT UNIQUE NOT NULL, type TEXT, content TEXT, category TEXT DEFAULT 'General', credits INT DEFAULT 100, price INT DEFAULT 0, creator_id INT, difficulty TEXT DEFAULT 'Novice')`,
                `CREATE TABLE IF NOT EXISTS enrollments (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, activity_id INT REFERENCES activities(id) ON DELETE CASCADE, enrolled_at TEXT, UNIQUE(user_id, activity_id))`,
                `CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT, price INT DEFAULT 0, type TEXT, icon TEXT)`,
                `CREATE TABLE IF NOT EXISTS user_items (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, item_id INT REFERENCES items(id) ON DELETE CASCADE, acquired_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS certificates (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, user_name TEXT, course_title TEXT, issue_date TEXT, code TEXT UNIQUE)`
            ];
            for (const q of schema) await db.query(q);
            return res.json({ success: true, status: "Initialized" });
        }

        if (pathname === '/api/seed') {
            await db.query(`INSERT INTO users (username, password, role, name, level, xp, coins, avatar) VALUES ('admin', 'password123', 'admin', 'Super Admin', 99, 99999, 99999, '👑') ON CONFLICT (username) DO NOTHING`);
            const items = [
                ['Streak Freeze', 50, '🧊', 'consumable', 'Protect your learning streak'],
                ['Golden Frame', 500, '🖼️', 'cosmetic', 'Ultimate profile decoration'],
                ['XP Booster', 150, '⚡', 'consumable', 'Double XP rewards']
            ];
            for (const i of items) await db.query(`INSERT INTO items (name, price, icon, type, description) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO NOTHING`, i);
            
            const sampleContent = JSON.stringify([{title:'Mission Start', lessons:[{title:'Welcome aboard', type:'article', body:'Your training begins here.'}]}]);
            const courses = [
                ['Galactic Fundamentals', 'article', 'Science', 100, 0, sampleContent],
                ['Nebula Navigation', 'video', 'Technology', 250, 50, sampleContent],
                ['Warp Drive Physics', 'simulation', 'Technology', 500, 150, sampleContent]
            ];
            for (const c of courses) await db.query(`INSERT INTO activities (title, type, category, credits, price, content, creator_id) VALUES ($1, $2, $3, $4, $5, $6, 1) ON CONFLICT (title) DO NOTHING`, c);
            
            return res.json({ success: true, message: "Data Synced with Cloud" });
        }

        // --- AUTH & DATA ---
        if (pathname === '/api/login' && method === 'POST') {
            const rows = await runQuery("SELECT * FROM users WHERE username = $1 AND password = $2", [body.username, body.password]);
            if (rows.length > 0) return res.json({ success: true, ...rows[0] });
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

        if (pathname === '/api/activities') {
            const sid = url.searchParams.get("studentId") || "0";
            const q = `
                SELECT a.*, 
                CASE WHEN e.id IS NOT NULL THEN 1 ELSE 0 END as is_enrolled 
                FROM activities a 
                LEFT JOIN enrollments e ON a.id = e.activity_id AND e.user_id = $1 
                ORDER BY a.id DESC`;
            return res.json(await runQuery(q, [sid]));
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

        if (pathname === '/api/inventory') {
            const uid = url.searchParams.get("userId");
            return res.json(await runQuery("SELECT i.* FROM items i JOIN user_items ui ON i.id = ui.item_id WHERE ui.user_id = $1", [uid]));
        }

        if (pathname === '/api/users' && method === 'PUT') {
            const b = body; const f = []; const v = []; let i = 1;
            ['name','role','level','xp','coins','avatar','bio','school','cover_image'].forEach(k => { if(b[k] !== undefined) { f.push(`${k} = $${i++}`); v.push(b[k]); } });
            v.push(b.id); await runQuery(`UPDATE users SET ${f.join(', ')} WHERE id = $${i}`, v);
            return res.json({ success: true });
        }

        return res.status(404).json({ error: "Not Found" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
};