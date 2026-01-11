// Vercel API Handler - Production Grade
const { Pool } = require('pg');

// 1. Mock Data (Fallback if DB is unavailable)
const MOCK_DB = {
    users: [{ id: 1, name: 'Admin', role: 'admin', coins: 9999, level: 99, avatar: '👑' }],
    activities: [{ id: 1, title: 'Welcome Course', category: 'General', price: 0 }]
};

// 2. Global Pool for Connection Reuse
let pool = null;
function getPool() {
    if (!pool && process.env.POSTGRES_URL) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 10, // Limit connections in serverless
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
    }
    return pool;
}

module.exports = async (req, res) => {
    // Standard Headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { method } = req;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const db = getPool();

    // Helper: Safe Query
    const runQuery = async (text, params) => {
        if (!db) return null;
        try {
            const result = await db.query(text, params);
            return result.rows;
        } catch (e) {
            console.error("DB Query Error:", e.message);
            throw e;
        }
    };

    try {
        // --- DATABASE INITIALIZATION ---
        if (pathname === '/api/init') {
            if (!db) return res.json({ success: false, error: "Missing POSTGRES_URL" });
            const schema = [
                `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'student', name TEXT, level INT DEFAULT 1, xp INT DEFAULT 0, coins INT DEFAULT 0, streak INT DEFAULT 0, avatar TEXT DEFAULT '🙂', status TEXT DEFAULT 'active', email TEXT, phone TEXT, bio TEXT, school TEXT, address TEXT, birthdate TEXT, social_links TEXT, last_login TEXT)`,
                `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
                `CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, title TEXT, type TEXT, difficulty TEXT, duration TEXT, content TEXT, category TEXT DEFAULT 'General', credits INT DEFAULT 1, price INT DEFAULT 0, course_code TEXT, certificate_theme TEXT DEFAULT 'classic', description TEXT, thumbnail TEXT, creator_id INT REFERENCES users(id) ON DELETE SET NULL)`,
                `CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(category)`,
                `CREATE TABLE IF NOT EXISTS enrollments (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, activity_id INT REFERENCES activities(id) ON DELETE CASCADE, enrolled_at TEXT)`,
                `CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique ON enrollments(user_id, activity_id)`,
                `CREATE TABLE IF NOT EXISTS user_progress (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, activity_id INT REFERENCES activities(id) ON DELETE CASCADE, score INT DEFAULT 0, status TEXT, completed_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT, description TEXT, price INT, type TEXT, icon TEXT)`,
                `CREATE TABLE IF NOT EXISTS user_items (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, item_id INT REFERENCES items(id) ON DELETE CASCADE, acquired_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS certificates (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, user_name TEXT, course_title TEXT, issue_date TEXT, code TEXT)`,
                `CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT)`,
                `CREATE TABLE IF NOT EXISTS site_visits (id SERIAL PRIMARY KEY, ip_address TEXT, user_agent TEXT, visit_time TEXT)`,
                `CREATE TABLE IF NOT EXISTS login_history (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, login_time TEXT, ip_address TEXT, device_info TEXT)`,
                `CREATE TABLE IF NOT EXISTS reviews (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, rating INT, comment TEXT, created_at TEXT)`
            ];
            for (const q of schema) { await db.query(q); }
            return res.json({ success: true, message: "Schema initialized successfully" });
        }

        if (pathname === '/api/seed') {
            if (!db) return res.json({ success: false, error: "No DB" });
            const logs = [];
            try {
                // 1. Seed Admins
                const admins = [
                    ['admin', 'password123', 'admin', 'Super Admin', 99, 99999, 99999, '👑'],
                    ['master', '1234', 'admin', 'Game Master', 80, 50000, 50000, '🧙‍♂️']
                ];
                for (const a of admins) { 
                    await db.query(`INSERT INTO users (username, password, role, name, level, xp, coins, avatar) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (username) DO NOTHING`, a); 
                }
                logs.push("Admins Seeded");

                // 2. Seed Teachers
                const teachers = [
                    ['teacher1', '1234', 'teacher', 'ครูสมศรี ใจดี', 50, 15000, 10000, '👩‍🏫'],
                    ['prof_oak', '1234', 'teacher', 'Prof. Oak', 65, 25000, 20000, '👨‍🔬'],
                    ['art_sensei', '1234', 'teacher', 'ครูศิลป์', 40, 8000, 5000, '🎨']
                ];
                for (const t of teachers) { 
                    await db.query(`INSERT INTO users (username, password, role, name, level, xp, coins, avatar) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (username) DO NOTHING`, t); 
                }
                logs.push("Teachers Seeded");

                // 3. Seed Students (For Leaderboard & Charts)
                const students = [
                    ['student1', '1234', 'student', 'สมชาย ขยันเรียน', 15, 2500, 500, '👦'],
                    ['araya', '1234', 'student', 'อารยา สมใจ', 22, 4800, 1200, '👩‍🎓'],
                    ['mana', '1234', 'student', 'มานะ มานี', 10, 1200, 300, '👦'],
                    ['winner', '1234', 'student', 'The Champion', 45, 12000, 8500, '🏆'],
                    ['novice', '1234', 'student', 'ผู้เล่นใหม่', 2, 150, 50, '👶'],
                    ['gamer', '1234', 'student', 'Pro Player', 30, 7500, 3400, '🕹️'],
                    ['scholar', '1234', 'student', 'นักปราชญ์', 38, 9200, 4100, '📖']
                ];
                for (const s of students) { 
                    await db.query(`INSERT INTO users (username, password, role, name, level, xp, coins, avatar) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (username) DO NOTHING`, s); 
                }
                logs.push("Students Seeded");

                // 4. Seed Items
                const items = [
                    ['Streak Freeze', 'Protect your daily streak', 50, 'consumable', '🧊'],
                    ['Golden Frame', 'Shining border for your profile', 500, 'cosmetic', '🖼️'],
                    ['XP Potion', 'Instantly gain 500 XP', 200, 'consumable', '🧪'],
                    ['Diamond Trophy', 'Rare decoration', 2000, 'cosmetic', '💎']
                ];
                for (const i of items) { 
                    await db.query(`INSERT INTO items (name, description, price, type, icon) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`, i); 
                }
                logs.push("Items Seeded");

                return res.json({ success: true, message: "Database Seeded with Diverse Users", logs });
            } catch (e) {
                return res.status(500).json({ success: false, error: e.message, logs });
            }
        }

        // --- AUTH & SYSTEM ---
        if (pathname === '/api/check-db') {
            if (!db) return res.json({ status: "Offline", reason: "Missing POSTGRES_URL" });
            await db.query('SELECT 1');
            return res.json({ status: "Connected ✅", environment: "Production" });
        }

        if (pathname === '/api/config') {
            if (method === 'GET') {
                const rows = await runQuery("SELECT * FROM system_config");
                const config = {};
                rows?.forEach(r => {
                    try { config[r.key] = JSON.parse(r.value); } catch(e) { config[r.key] = r.value; }
                });
                return res.json(config);
            }
            if (method === 'POST') {
                const { key, value } = req.body;
                await runQuery("INSERT INTO system_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2", [key, JSON.stringify(value)]);
                return res.json({ success: true });
            }
        }

        // --- USERS ---
        if (pathname === '/api/users') {
            if (method === 'GET') {
                const rows = await runQuery("SELECT id, username, name, role, level, xp, coins, avatar, status FROM users ORDER BY id DESC");
                return res.json(rows || MOCK_DB.users);
            }
            if (method === 'POST' || method === 'PUT') {
                const b = req.body;
                if (method === 'POST') {
                    await runQuery("INSERT INTO users (username, password, name, role, email) VALUES ($1, $2, $3, $4, $5)", [b.username, b.password, b.name, b.role || 'student', b.email]);
                } else {
                    const fields = []; const vals = []; let i = 1;
                    const allowed = ['name', 'role', 'level', 'xp', 'coins', 'avatar', 'status', 'password'];
                    allowed.forEach(f => { if(b[f] !== undefined) { fields.push(`${f} = $${i++}`); vals.push(b[f]); } });
                    if(fields.length > 0) { vals.push(b.id); await runQuery(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`, vals); }
                }
                return res.json({ success: true });
            }
            if (method === 'DELETE') {
                await runQuery("DELETE FROM users WHERE id = $1", [url.searchParams.get("id")]);
                return res.json({ success: true });
            }
        }

        // --- ACTIVITIES ---
        if (pathname === '/api/activities') {
            const studentId = url.searchParams.get("studentId") || 0;
            const instructorId = url.searchParams.get("instructorId");
            
            let query = `
                SELECT a.*, COALESCE(e.id, 0) as is_enrolled 
                FROM activities a 
                LEFT JOIN enrollments e ON a.id = e.activity_id AND e.user_id = $1
            `;
            const params = [studentId];

            if (instructorId && instructorId !== 'debug') {
                query += " WHERE a.creator_id = $2";
                params.push(instructorId);
            }
            query += " ORDER BY a.id DESC";

            const rows = await runQuery(query, params);
            return res.json(rows || []);
        }

        // --- ACTIONS ---
        if (pathname === '/api/enroll' && method === 'POST') {
            const { userId, activityId } = req.body;
            const course = await runQuery("SELECT price FROM activities WHERE id = $1", [activityId]);
            const user = await runQuery("SELECT coins FROM users WHERE id = $1", [userId]);
            
            if (course?.[0] && user?.[0]) {
                if (user[0].coins >= course[0].price) {
                    await runQuery("UPDATE users SET coins = coins - $1 WHERE id = $2", [course[0].price, userId]);
                    await runQuery("INSERT INTO enrollments (user_id, activity_id, enrolled_at) VALUES ($1, $2, $3)", [userId, activityId, new Date().toISOString()]);
                    return res.json({ success: true });
                }
                return res.status(400).json({ error: "Insufficient coins" });
            }
            return res.status(404).json({ error: "Not found" });
        }

        // Catch-all for other basic routes
        if (pathname === '/api/visit') {
            const ip = req.headers['x-forwarded-for'] || 'unknown';
            await runQuery("INSERT INTO site_visits (ip_address, visit_time) VALUES ($1, $2)", [ip, new Date().toISOString()]);
            const count = await runQuery("SELECT COUNT(*) FROM site_visits");
            return res.json({ total_visits: count[0].count });
        }

        return res.status(404).json({ error: "Route not found" });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};