// Vercel API Handler - Ultimate Production Version
const { Pool } = require('pg');

let pool = null;
function getPool() {
    if (!pool && process.env.POSTGRES_URL) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 15,
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
        try {
            const result = await db.query(text, params);
            return result.rows;
        } catch (e) {
            console.error("DB Query Error:", text, e.message);
            throw e;
        }
    };

    try {
        // --- 1. SYSTEM & INIT ---
        if (pathname === '/api/init') {
            const schema = [
                `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'student', name TEXT, level INT DEFAULT 1, xp INT DEFAULT 0, coins INT DEFAULT 0, streak INT DEFAULT 0, avatar TEXT DEFAULT '🙂', status TEXT DEFAULT 'active', email TEXT, phone TEXT, bio TEXT, school TEXT, address TEXT, last_login TEXT)`,
                `CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, title TEXT, type TEXT, difficulty TEXT, duration TEXT, content TEXT, category TEXT DEFAULT 'General', credits INT DEFAULT 1, price INT DEFAULT 0, course_code TEXT, certificate_theme TEXT DEFAULT 'classic', description TEXT, thumbnail TEXT, creator_id INT)`,
                `CREATE TABLE IF NOT EXISTS enrollments (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, enrolled_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS user_progress (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, score INT, status TEXT, completed_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT, description TEXT, price INT, type TEXT, icon TEXT)`,
                `CREATE TABLE IF NOT EXISTS user_items (id SERIAL PRIMARY KEY, user_id INT, item_id INT, acquired_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS certificates (id SERIAL PRIMARY KEY, user_id INT, user_name TEXT, course_title TEXT, issue_date TEXT, code TEXT)`,
                `CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT)`,
                `CREATE TABLE IF NOT EXISTS site_visits (id SERIAL PRIMARY KEY, ip_address TEXT, visit_time TEXT)`,
                `CREATE TABLE IF NOT EXISTS login_history (id SERIAL PRIMARY KEY, user_id INT, login_time TEXT, ip_address TEXT, device_info TEXT)`
            ];
            for (const q of schema) await db.query(q);
            return res.json({ success: true, message: "System Initialized" });
        }

        if (pathname === '/api/seed') {
            await db.query(`INSERT INTO users (username, password, role, name, level, xp, coins, avatar) VALUES ('admin', 'password123', 'admin', 'Super Admin', 99, 99999, 99999, '👑') ON CONFLICT (username) DO NOTHING`);
            // Add some items
            await db.query(`INSERT INTO items (name, price, icon, type) VALUES ('Streak Freeze', 50, '🧊', 'consumable'), ('Golden Frame', 500, '🖼️', 'cosmetic') ON CONFLICT DO NOTHING`);
            return res.json({ success: true, message: "Admin and initial items seeded" });
        }

        // --- 2. AUTHENTICATION ---
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

        // --- 3. ANALYTICS ---
        if (pathname === '/api/analytics') {
            const userId = url.searchParams.get("userId");
            const user = await runQuery("SELECT * FROM users WHERE id = $1", [userId]);
            const progress = await runQuery("SELECT p.*, a.title FROM user_progress p JOIN activities a ON p.activity_id = a.id WHERE p.user_id = $1", [userId]);
            const certs = await runQuery("SELECT * FROM certificates WHERE user_id = $1", [userId]);
            return res.json({ user: user?.[0] || {}, activities: progress || [], certificates: certs || [] });
        }

        // --- 4. USERS (Admin) ---
        if (pathname === '/api/users') {
            if (method === 'GET') return res.json(await runQuery("SELECT * FROM users ORDER BY id DESC") || []);
            if (method === 'POST') {
                const b = req.body;
                await runQuery("INSERT INTO users (username, password, name, role, coins, xp, level) VALUES ($1, $2, $3, $4, $5, $6, $7)", 
                    [b.username, b.password || '1234', b.name, b.role || 'student', b.coins || 0, b.xp || 0, b.level || 1]);
                return res.json({ success: true });
            }
            if (method === 'PUT') {
                const b = req.body; const fields = []; const vals = []; let i = 1;
                ['name','role','level','xp','coins','status','password','avatar','username'].forEach(f => { if(b[f] !== undefined) { fields.push(`${f} = $${i++}`); vals.push(b[f]); } });
                vals.push(b.id); await runQuery(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`, vals);
                return res.json({ success: true });
            }
            if (method === 'DELETE') { await runQuery("DELETE FROM users WHERE id = $1", [url.searchParams.get("id")]); return res.json({ success: true }); }
        }

        // --- 5. ACTIVITIES (Courses) ---
        if (pathname === '/api/activities') {
            if (method === 'GET') {
                const instructorId = url.searchParams.get("instructorId");
                const studentId = url.searchParams.get("studentId") || 0;
                let q = "SELECT a.*, COALESCE(e.id, 0) as is_enrolled FROM activities a LEFT JOIN enrollments e ON a.id = e.activity_id AND e.user_id = $1";
                const params = [studentId];
                if (instructorId && instructorId !== 'debug') { q += " WHERE a.creator_id = $2"; params.push(instructorId); }
                return res.json(await runQuery(q + " ORDER BY id DESC", params));
            }
            if (method === 'POST') {
                const b = req.body; const content = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || []);
                await runQuery("INSERT INTO activities (title, type, difficulty, duration, content, category, credits, price, course_code, certificate_theme, creator_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)", 
                    [b.title, b.type, b.difficulty, b.duration, content, b.category, b.credits, b.price, b.course_code, b.certificate_theme, b.creator_id]);
                return res.json({ success: true });
            }
            if (method === 'PUT') {
                const b = req.body; const content = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || []);
                await runQuery("UPDATE activities SET title=$1, type=$2, difficulty=$3, duration=$4, content=$5, category=$6, credits=$7, price=$8, course_code=$9, certificate_theme=$10 WHERE id=$11",
                    [b.title, b.type, b.difficulty, b.duration, content, b.category, b.credits, b.price, b.course_code, b.certificate_theme, b.id]);
                return res.json({ success: true });
            }
            if (method === 'DELETE') { await runQuery("DELETE FROM activities WHERE id = $1", [url.searchParams.get("id")]); return res.json({ success: true }); }
        }

        // --- 6. SHOP ---
        if (pathname === '/api/shop') {
            if (method === 'GET') return res.json(await runQuery("SELECT * FROM items ORDER BY price ASC"));
            if (method === 'POST') {
                const b = req.body;
                await runQuery("INSERT INTO items (name, price, icon, type, description) VALUES ($1, $2, $3, $4, $5)", [b.name, b.price, b.icon, b.type, b.description]);
                return res.json({ success: true });
            }
            if (method === 'PUT') {
                const b = req.body;
                await runQuery("UPDATE items SET name=$1, price=$2, icon=$3, type=$4, description=$5 WHERE id=$6", [b.name, b.price, b.icon, b.type, b.description, b.id]);
                return res.json({ success: true });
            }
            if (method === 'DELETE') { await runQuery("DELETE FROM items WHERE id = $1", [url.searchParams.get("id")]); return res.json({ success: true }); }
        }

        // --- 7. CERTIFICATES ---
        if (pathname === '/api/certificate') {
            if (method === 'GET') return res.json(await runQuery("SELECT * FROM certificates ORDER BY id DESC"));
            if (method === 'POST') {
                const b = req.body; const code = "CERT-" + Math.random().toString(36).substr(2,9).toUpperCase();
                await runQuery("INSERT INTO certificates (user_id, user_name, course_title, issue_date, code) VALUES ($1, $2, $3, $4, $5)", [b.userId, b.userName, b.courseTitle, new Date().toLocaleDateString('th-TH'), code]);
                return res.json({ success: true, code });
            }
            if (method === 'DELETE') { await runQuery("DELETE FROM certificates WHERE id = $1", [url.searchParams.get("id")]); return res.json({ success: true }); }
        }

        // --- 8. CONFIG & LOGS ---
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
            if (method === 'POST') {
                const ip = req.headers['x-forwarded-for'] || 'unknown';
                await runQuery("INSERT INTO site_visits (ip_address, visit_time) VALUES ($1, $2)", [ip, new Date().toISOString()]);
                return res.json({ success: true });
            }
            const rows = await runQuery("SELECT COUNT(*) as total FROM site_visits");
            return res.json({ total_visits: rows[0].total });
        }

        return res.status(404).json({ error: "Route not found" });
    } catch (err) {
        console.error("Critical API Error:", err);
        return res.status(500).json({ error: err.message });
    }
};