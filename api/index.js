// Vercel API Handler - Ultimate Production Build v3.0
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

    // Robust Body Parser
    let body = {};
    if (method === 'POST' || method === 'PUT') {
        try {
            if (typeof req.body === 'string') body = JSON.parse(req.body);
            else if (typeof req.body === 'object') body = req.body;
        } catch(e) { body = {}; }
    }

    const runQuery = async (text, params) => {
        const result = await db.query(text, params);
        return result.rows;
    };

    try {
        // --- 1. SYSTEM & MAINTENANCE ---
        if (pathname === '/api/init') {
            const schema = [
                `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'student', name TEXT, level INT DEFAULT 1, xp INT DEFAULT 0, coins INT DEFAULT 0, streak INT DEFAULT 0, avatar TEXT DEFAULT '🙂', status TEXT DEFAULT 'active', email TEXT, phone TEXT, bio TEXT, school TEXT, cover_image TEXT, birthdate TEXT)`,
                `CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, title TEXT UNIQUE NOT NULL, type TEXT, difficulty TEXT DEFAULT 'Medium', duration TEXT DEFAULT '30m', content TEXT, category TEXT DEFAULT 'General', credits INT DEFAULT 100, price INT DEFAULT 0, creator_id INT, certificate_theme TEXT DEFAULT 'classic')`,
                `CREATE TABLE IF NOT EXISTS enrollments (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, enrolled_at TEXT)`,
                `CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique ON enrollments(user_id, activity_id)`,
                `CREATE TABLE IF NOT EXISTS user_progress (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, score INT, status TEXT, completed_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT, price INT DEFAULT 0, type TEXT, icon TEXT)`,
                `CREATE TABLE IF NOT EXISTS user_items (id SERIAL PRIMARY KEY, user_id INT, item_id INT, acquired_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS certificates (id SERIAL PRIMARY KEY, user_id INT, user_name TEXT, course_title TEXT, issue_date TEXT, code TEXT UNIQUE)`,
                `CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT)`,
                `CREATE TABLE IF NOT EXISTS site_visits (id SERIAL PRIMARY KEY, ip_address TEXT, visit_time TEXT)`,
                `CREATE TABLE IF NOT EXISTS login_history (id SERIAL PRIMARY KEY, user_id INT, login_time TEXT, ip_address TEXT, device_info TEXT)`
            ];
            for (const q of schema) await db.query(q);
            return res.json({ success: true, status: "Database Schema v3.0 Ready" });
        }

        if (pathname === '/api/seed') {
            // Admin
            await db.query(`INSERT INTO users (username, password, role, name, level, xp, coins, avatar) VALUES ('admin', 'password123', 'admin', 'Super Admin', 99, 99999, 99999, '👑') ON CONFLICT (username) DO NOTHING`);
            
            // Items
            const items = [
                ['Streak Freeze', 50, '🧊', 'consumable', 'Keep your streak alive'],
                ['Golden Frame', 500, '🖼️', 'cosmetic', 'Show off your wealth'],
                ['XP Booster', 150, '⚡', 'consumable', 'Double XP for 1 hour']
            ];
            for (const i of items) await db.query(`INSERT INTO items (name, price, icon, type, description) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO NOTHING`, i);

            // Activities
            const sample = JSON.stringify([{title:'Intro', lessons:[{title:'Welcome', type:'article', body:'Welcome to the platform.'}]}]);
            const courses = [
                ['Galactic Foundations', 'article', 'Science', 100, 0, sample],
                ['Nebula Navigation', 'video', 'Technology', 250, 50, sample],
                ['Starship Engineering', 'simulation', 'Technology', 500, 150, sample]
            ];
            for (const c of courses) await db.query(`INSERT INTO activities (title, type, category, credits, price, content, creator_id) VALUES ($1, $2, $3, $4, $5, $6, 1) ON CONFLICT (title) DO NOTHING`, c);

            return res.json({ success: true, message: "Production Environment Seeded" });
        }

        if (pathname === '/api/stats') {
            const u = await runQuery("SELECT COUNT(*) FROM users");
            const a = await runQuery("SELECT COUNT(*) FROM activities");
            const c = await runQuery("SELECT COUNT(*) FROM certificates");
            const v = await runQuery("SELECT COUNT(*) FROM site_visits");
            return res.json({ users: u[0].count, activities: a[0].count, certificates: c[0].count, visits: v[0].count });
        }

        // --- 2. USERS & AUTH ---
        if (pathname === '/api/login' && method === 'POST') {
            const { username, password } = body;
            const rows = await runQuery("SELECT * FROM users WHERE username = $1 AND password = $2", [username, password]);
            if (rows.length > 0) {
                const user = rows[0];
                const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
                await runQuery("INSERT INTO login_history (user_id, login_time, ip_address, device_info) VALUES ($1, $2, $3, $4)", [user.id, new Date().toISOString(), ip, req.headers['user-agent'] || 'unknown']);
                return res.json({ success: true, ...user });
            }
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        if (pathname === '/api/register' && method === 'POST') {
            const { username, password, name, email, phone, school } = body;
            await runQuery("INSERT INTO users (username, password, name, email, phone, school) VALUES ($1, $2, $3, $4, $5, $6)", [username, password, name, email, phone, school]);
            return res.json({ success: true });
        }

        if (pathname === '/api/users') {
            if (method === 'GET') {
                const id = url.searchParams.get("id");
                if (id) return res.json((await runQuery("SELECT * FROM users WHERE id = $1", [id]))[0] || {});
                return res.json(await runQuery("SELECT * FROM users ORDER BY id DESC"));
            }
            if (method === 'PUT') {
                const b = body; const f = []; const v = []; let i = 1;
                ['name','role','level','xp','coins','status','password','avatar','email','phone','school','bio','cover_image'].forEach(k => { if(b[k] !== undefined) { f.push(`${k} = $${i++}`); v.push(b[k]); } });
                if (f.length > 0) { v.push(b.id); await runQuery(`UPDATE users SET ${f.join(', ')} WHERE id = $${i}`, v); }
                return res.json({ success: true });
            }
            if (method === 'DELETE') { await runQuery("DELETE FROM users WHERE id = $1", [url.searchParams.get("id")]); return res.json({ success: true }); }
        }

        if (pathname === '/api/analytics') {
            const uid = url.searchParams.get("userId");
            if (!uid || uid === "0") return res.json({ user: { name: 'Guest Explorer', role: 'guest', level: 1, xp: 0, coins: 0, avatar: '🕵️' }, certificates: [], activities: [] });
            const user = await runQuery("SELECT * FROM users WHERE id = $1", [uid]);
            if (!user[0]) return res.status(404).json({ error: "User not found" });
            const certs = await runQuery("SELECT * FROM certificates WHERE user_id = $1", [uid]);
            const progress = await runQuery("SELECT p.*, a.title FROM user_progress p JOIN activities a ON p.activity_id = a.id WHERE p.user_id = $1", [uid]);
            const rankRes = await runQuery("SELECT COUNT(*) as rank FROM users WHERE xp > (SELECT xp FROM users WHERE id = $1)", [uid]);
            return res.json({ user: user[0], certificates: certs, activities: progress, rank: parseInt(rankRes[0].rank) + 1 });
        }

        // --- 3. ACTIVITIES ---
        if (pathname === '/api/activities') {
            if (method === 'GET') {
                const sid = url.searchParams.get("studentId") || "0";
                const iid = url.searchParams.get("instructorId");
                const id = url.searchParams.get("id");
                if (id) return res.json((await runQuery("SELECT * FROM activities WHERE id = $1", [id]))[0] || {});
                let q = `SELECT a.*, COALESCE(e.id, 0) as is_enrolled FROM activities a LEFT JOIN enrollments e ON a.id = e.activity_id AND e.user_id = $1`;
                const params = [sid];
                if (iid && iid !== 'debug') { q += " WHERE a.creator_id = $2"; params.push(iid); }
                return res.json(await runQuery(q + " ORDER BY a.id DESC", params));
            }
            if (method === 'POST') {
                const b = body; const content = typeof b.content === 'object' ? JSON.stringify(b.content) : b.content;
                await runQuery("INSERT INTO activities (title, type, content, category, credits, price, creator_id) VALUES ($1, $2, $3, $4, $5, $6, $7)", [b.title, b.type, content, b.category, b.credits, b.price, b.creator_id]);
                return res.json({ success: true });
            }
            if (method === 'PUT') {
                const b = body; const content = typeof b.content === 'object' ? JSON.stringify(b.content) : b.content;
                await runQuery("UPDATE activities SET title=$1, type=$2, content=$3, category=$4, credits=$5, price=$6 WHERE id=$7", [b.title, b.type, content, b.category, b.credits, b.price, b.id]);
                return res.json({ success: true });
            }
            if (method === 'DELETE') { await runQuery("DELETE FROM activities WHERE id = $1", [url.searchParams.get("id")]); return res.json({ success: true }); }
        }

        if (pathname === '/api/enroll' && method === 'POST') {
            const { userId, activityId } = body;
            const act = (await runQuery("SELECT price FROM activities WHERE id = $1", [activityId]))[0];
            if (act && act.price > 0) {
                const user = (await runQuery("SELECT coins FROM users WHERE id = $1", [userId]))[0];
                if (!user || user.coins < act.price) return res.status(400).json({ error: "Insufficient coins" });
                await runQuery("UPDATE users SET coins = coins - $1 WHERE id = $2", [act.price, userId]);
            }
            await runQuery("INSERT INTO enrollments (user_id, activity_id, enrolled_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [userId, activityId, new Date().toISOString()]);
            return res.json({ success: true });
        }

        // --- 4. SHOP & INVENTORY ---
        if (pathname === '/api/shop') {
            if (method === 'GET') return res.json(await runQuery("SELECT * FROM items ORDER BY price ASC"));
            if (method === 'POST') { await runQuery("INSERT INTO items (name, price, icon, type, description) VALUES ($1, $2, $3, $4, $5)", [body.name, body.price, body.icon, body.type, body.description]); return res.json({ success: true }); }
            if (method === 'DELETE') { await runQuery("DELETE FROM items WHERE id = $1", [url.searchParams.get("id")]); return res.json({ success: true }); }
        }

        if (pathname === '/api/shop/buy' && method === 'POST') {
            const { userId, itemId } = body;
            const item = (await runQuery("SELECT * FROM items WHERE id = $1", [itemId]))[0];
            const user = (await runQuery("SELECT coins FROM users WHERE id = $1", [userId]))[0];
            if (!item || !user || user.coins < item.price) return res.status(400).json({ error: "Purchase failed" });
            await runQuery("UPDATE users SET coins = coins - $1 WHERE id = $2", [item.price, userId]);
            await runQuery("INSERT INTO user_items (user_id, item_id, acquired_at) VALUES ($1, $2, $3)", [userId, itemId, new Date().toISOString()]);
            return res.json({ success: true });
        }

        if (pathname === '/api/inventory') {
            return res.json(await runQuery("SELECT i.* FROM items i JOIN user_items ui ON i.id = ui.item_id WHERE ui.user_id = $1", [url.searchParams.get("userId")]));
        }

        // --- 5. OTHERS ---
        if (pathname === '/api/certificate') {
            if (method === 'POST') {
                const code = 'CERT-' + Math.random().toString(36).substr(2, 9).toUpperCase();
                await runQuery("INSERT INTO certificates (user_id, user_name, course_title, issue_date, code) VALUES ($1, $2, $3, $4, $5)", [body.userId, body.userName, body.courseTitle, new Date().toISOString(), code]);
                return res.json({ success: true, code });
            }
            return res.json(await runQuery("SELECT * FROM certificates ORDER BY id DESC"));
        }

        if (pathname === '/api/config') {
            if (method === 'GET') {
                const rows = await runQuery("SELECT * FROM system_config");
                const config = {}; rows.forEach(r => { try { config[r.key] = JSON.parse(r.value); } catch(e) { config[r.key] = r.value; } });
                return res.json(config);
            }
            await runQuery("INSERT INTO system_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2", [body.key, JSON.stringify(body.value)]);
            return res.json({ success: true });
        }

        if (pathname === '/api/visit') {
            await runQuery("INSERT INTO site_visits (ip_address, visit_time) VALUES ($1, $2)", [req.headers['x-forwarded-for'] || '127.0.0.1', new Date().toISOString()]);
            return res.json({ success: true });
        }

        return res.status(404).json({ error: "Route not found" });
    } catch (err) {
        console.error("API ERROR:", err.message);
        return res.status(500).json({ error: err.message });
    }
};