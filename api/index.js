// Vercel API Handler - Complete Production Version
const { Pool } = require('pg');

// 1. Mock Data (Fallback if DB is unavailable)
const MOCK_DB = {
    users: [{ id: 1, name: 'Admin', role: 'admin', coins: 9999, level: 99, avatar: '👑' }],
    activities: [{ id: 1, title: 'Welcome Course', category: 'General', price: 0 }]
};

// 2. Global Pool
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
        // --- DB INIT & SEED ---
        if (pathname === '/api/init') {
            const schema = [
                `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'student', name TEXT, level INT DEFAULT 1, xp INT DEFAULT 0, coins INT DEFAULT 0, streak INT DEFAULT 0, avatar TEXT DEFAULT '🙂', status TEXT DEFAULT 'active', email TEXT, phone TEXT, bio TEXT, school TEXT, address TEXT, birthdate TEXT, social_links TEXT, last_login TEXT)`,
                `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
                `CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, title TEXT, type TEXT, difficulty TEXT, duration TEXT, content TEXT, category TEXT DEFAULT 'General', credits INT DEFAULT 1, price INT DEFAULT 0, course_code TEXT, certificate_theme TEXT DEFAULT 'classic', description TEXT, thumbnail TEXT, creator_id INT REFERENCES users(id) ON DELETE SET NULL)`,
                `CREATE TABLE IF NOT EXISTS enrollments (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, activity_id INT REFERENCES activities(id) ON DELETE CASCADE, enrolled_at TEXT)`,
                `CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique ON enrollments(user_id, activity_id)`,
                `CREATE TABLE IF NOT EXISTS user_progress (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, activity_id INT REFERENCES activities(id) ON DELETE CASCADE, score INT DEFAULT 0, status TEXT, completed_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT, description TEXT, price INT, type TEXT, icon TEXT)`,
                `CREATE TABLE IF NOT EXISTS user_items (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, item_id INT REFERENCES items(id) ON DELETE CASCADE, acquired_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS certificates (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, user_name TEXT, course_title TEXT, issue_date TEXT, code TEXT)`,
                `CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT)`,
                `CREATE TABLE IF NOT EXISTS site_visits (id SERIAL PRIMARY KEY, ip_address TEXT, user_agent TEXT, visit_time TEXT)`,
                `CREATE TABLE IF NOT EXISTS login_history (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, login_time TEXT, ip_address TEXT, device_info TEXT)`,
                `CREATE TABLE IF NOT EXISTS portfolios (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, title TEXT, description TEXT, media_url TEXT, type TEXT, created_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS reviews (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, rating INT, comment TEXT, created_at TEXT)`
            ];
            for (const q of schema) await db.query(q);
            return res.json({ success: true });
        }

        if (pathname === '/api/seed') {
            await db.query(`INSERT INTO users (username, password, role, name, level, xp, coins, avatar) VALUES ('admin', 'password123', 'admin', 'Super Admin', 99, 99999, 99999, '👑') ON CONFLICT (username) DO NOTHING`);
            return res.json({ success: true, message: "Admin seeded" });
        }

        // --- AUTH ---
        if (pathname === '/api/login' && method === 'POST') {
            const { username, password } = req.body;
            const rows = await runQuery("SELECT * FROM users WHERE username = $1 AND password = $2", [username, password]);
            if (rows?.length > 0) return res.json({ success: true, ...rows[0] });
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        if (pathname === '/api/register' && method === 'POST') {
            const { username, password, name, email } = req.body;
            await runQuery("INSERT INTO users (username, password, name, email) VALUES ($1, $2, $3, $4)", [username, password, name, email]);
            return res.json({ success: true });
        }

        // --- ANALYTICS & PROFILE ---
        if (pathname === '/api/analytics') {
            const userId = url.searchParams.get("userId");
            const user = await runQuery("SELECT * FROM users WHERE id = $1", [userId]);
            const progress = await runQuery("SELECT p.*, a.title FROM user_progress p JOIN activities a ON p.activity_id = a.id WHERE p.user_id = $1", [userId]);
            const certs = await runQuery("SELECT * FROM certificates WHERE user_id = $1", [userId]);
            return res.json({ user: user?.[0] || {}, activities: progress || [], certificates: certs || [] });
        }

        // --- USERS ---
        if (pathname === '/api/users') {
            if (method === 'GET') return res.json(await runQuery("SELECT * FROM users ORDER BY id DESC") || []);
            if (method === 'PUT') {
                const b = req.body; const fields = []; const vals = []; let i = 1;
                ['name','role','level','xp','coins','avatar','status','password'].forEach(f => { if(b[f] !== undefined) { fields.push(`${f} = $${i++}`); vals.push(b[f]); } });
                vals.push(b.id); await runQuery(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`, vals);
                return res.json({ success: true });
            }
            if (method === 'DELETE') { await runQuery("DELETE FROM users WHERE id = $1", [url.searchParams.get("id")]); return res.json({ success: true }); }
        }

        // --- ACTIVITIES ---
        if (pathname === '/api/activities') {
            const studentId = url.searchParams.get("studentId") || 0;
            const instructorId = url.searchParams.get("instructorId");
            let query = "SELECT a.*, COALESCE(e.id, 0) as is_enrolled FROM activities a LEFT JOIN enrollments e ON a.id = e.activity_id AND e.user_id = $1";
            const params = [studentId];
            if (instructorId && instructorId !== 'debug') { query += " WHERE a.creator_id = $2"; params.push(instructorId); }
            return res.json(await runQuery(query + " ORDER BY a.id DESC", params) || []);
        }

        if (pathname === '/api/activities' && (method === 'POST' || method === 'PUT')) {
            const b = req.body;
            const content = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || []);
            if (method === 'POST') {
                await runQuery("INSERT INTO activities (title, type, difficulty, duration, content, category, credits, price, course_code, certificate_theme, creator_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)", 
                    [b.title, b.type, b.difficulty, b.duration, content, b.category, b.credits, b.price, b.course_code, b.certificate_theme, b.creator_id]);
            } else {
                await runQuery("UPDATE activities SET title=$1, type=$2, difficulty=$3, duration=$4, content=$5, category=$6, credits=$7, price=$8, course_code=$9, certificate_theme=$10 WHERE id=$11",
                    [b.title, b.type, b.difficulty, b.duration, content, b.category, b.credits, b.price, b.course_code, b.certificate_theme, b.id]);
            }
            return res.json({ success: true });
        }

        // --- SHOP & ITEMS ---
        if (pathname === '/api/shop') {
            if (method === 'GET') return res.json(await runQuery("SELECT * FROM items ORDER BY price ASC") || []);
            if (method === 'POST') {
                const b = req.body;
                await runQuery("INSERT INTO items (name, price, icon, type, description) VALUES ($1, $2, $3, $4, $5)", [b.name, b.price, b.icon, b.type, b.description]);
                return res.json({ success: true });
            }
            if (method === 'DELETE') { await runQuery("DELETE FROM items WHERE id = $1", [url.searchParams.get("id")]); return res.json({ success: true }); }
        }

        // --- OTHERS ---
        if (pathname === '/api/certificate' && method === 'POST') {
            const b = req.body; const code = "CERT-" + Math.random().toString(36).substr(2,9).toUpperCase();
            await runQuery("INSERT INTO certificates (user_id, user_name, course_title, issue_date, code) VALUES ($1, $2, $3, $4, $5)", [b.userId, b.userName, b.courseTitle, new Date().toLocaleDateString('th-TH'), code]);
            return res.json({ success: true, code });
        }
        if (pathname === '/api/certificate' && method === 'GET') return res.json(await runQuery("SELECT * FROM certificates ORDER BY id DESC") || []);
        if (pathname === '/api/certificate' && method === 'DELETE') { await runQuery("DELETE FROM certificates WHERE id = $1", [url.searchParams.get("id")]); return res.json({ success: true }); }

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
            const ip = req.headers['x-forwarded-for'] || 'unknown';
            await runQuery("INSERT INTO site_visits (ip_address, visit_time) VALUES ($1, $2)", [ip, new Date().toISOString()]);
            return res.json({ success: true });
        }

        return res.status(404).json({ error: "Not found" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
};
