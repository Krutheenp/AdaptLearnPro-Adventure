// Vercel API Handler - Robust Production Build v2.5
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

    if (!db) {
        return res.status(500).json({ error: "Database connection failed. POSTGRES_URL missing." });
    }

    // Body Parsing helper
    let body = req.body || {};
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) { body = {}; }
    }

    const runQuery = async (text, params) => {
        const result = await db.query(text, params);
        return result.rows;
    };

    try {
        // --- 1. SYSTEM CONTROL ---
        if (pathname === '/api/init') {
            const schema = [
                `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'student', name TEXT, level INT DEFAULT 1, xp INT DEFAULT 0, coins INT DEFAULT 0, streak INT DEFAULT 0, avatar TEXT DEFAULT '🙂', status TEXT DEFAULT 'active', email TEXT, phone TEXT, bio TEXT, school TEXT, address TEXT, last_login TEXT, cover_image TEXT, birthdate TEXT)`,
                `CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, title TEXT, type TEXT, difficulty TEXT, duration TEXT, content TEXT, category TEXT DEFAULT 'General', credits INT DEFAULT 1, price INT DEFAULT 0, course_code TEXT, certificate_theme TEXT DEFAULT 'classic', description TEXT, thumbnail TEXT, creator_id INT)`,
                `CREATE TABLE IF NOT EXISTS enrollments (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, enrolled_at TEXT)`,
                `CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique ON enrollments(user_id, activity_id)`,
                `CREATE TABLE IF NOT EXISTS user_progress (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, score INT, status TEXT, completed_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT, price INT, type TEXT, icon TEXT)`,
                `CREATE TABLE IF NOT EXISTS user_items (id SERIAL PRIMARY KEY, user_id INT, item_id INT, acquired_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS certificates (id SERIAL PRIMARY KEY, user_id INT, user_name TEXT, course_title TEXT, issue_date TEXT, code TEXT UNIQUE)`,
                `CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT)`,
                `CREATE TABLE IF NOT EXISTS site_visits (id SERIAL PRIMARY KEY, ip_address TEXT, visit_time TEXT)`,
                `CREATE TABLE IF NOT EXISTS login_history (id SERIAL PRIMARY KEY, user_id INT, login_time TEXT, ip_address TEXT, device_info TEXT)`
            ];
            for (const q of schema) await db.query(q);
            return res.json({ success: true, status: "Schema Ready" });
        }

        if (pathname === '/api/seed') {
            await db.query(`INSERT INTO users (username, password, role, name, level, xp, coins, avatar) VALUES ('admin', 'password123', 'admin', 'Super Admin', 99, 99999, 99999, '👑') ON CONFLICT (username) DO NOTHING`);
            await db.query(`INSERT INTO items (name, price, icon, type, description) VALUES 
                ('Streak Freeze', 50, '🧊', 'consumable', 'Keep your streak alive'), 
                ('Golden Frame', 500, '🖼️', 'cosmetic', 'Show off your wealth'),
                ('XP Booster', 150, '⚡', 'consumable', 'Double XP for 1 hour'),
                ('Mystery Box', 100, '🎁', 'box', 'Get a random item')
                ON CONFLICT (name) DO NOTHING`);
            return res.json({ success: true, message: "Base Data Seeded" });
        }

        if (pathname === '/api/check-db') {
            const result = await db.query('SELECT current_database(), now()');
            return res.json({ status: "Connected ✅", db: result.rows[0].current_database, time: result.rows[0].now });
        }

        // --- 2. ANALYTICS & STATS ---
        if (pathname === '/api/stats') {
            const u = await runQuery("SELECT COUNT(*) as count FROM users");
            const a = await runQuery("SELECT COUNT(*) as count FROM activities");
            const c = await runQuery("SELECT COUNT(*) as count FROM certificates");
            const v = await runQuery("SELECT COUNT(*) as count FROM site_visits");
            return res.json({ users: u[0].count, activities: a[0].count, certificates: c[0].count, visits: v[0].count });
        }

        if (pathname === '/api/visit') {
            if (method === 'GET') {
                const rows = await runQuery("SELECT COUNT(*) as count FROM site_visits");
                return res.json({ total_visits: rows[0].count });
            }
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
            await runQuery("INSERT INTO site_visits (ip_address, visit_time) VALUES ($1, $2)", [ip, new Date().toISOString()]);
            return res.json({ success: true });
        }

        // --- 3. USERS & AUTH ---
        if (pathname === '/api/login' && method === 'POST') {
            const { username, password } = body;
            const rows = await runQuery("SELECT * FROM users WHERE username = $1 AND password = $2", [username, password]);
            if (rows?.length > 0) {
                const user = rows[0];
                const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
                const ua = req.headers['user-agent'] || 'unknown';
                await runQuery("INSERT INTO login_history (user_id, login_time, ip_address, device_info) VALUES ($1, $2, $3, $4)", [user.id, new Date().toISOString(), ip, ua]);
                return res.json({ success: true, ...user });
            }
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        if (pathname === '/api/register' && method === 'POST') {
            const { username, password, name, email, phone, school } = body;
            await runQuery("INSERT INTO users (username, password, name, email, phone, school) VALUES ($1, $2, $3, $4, $5, $6)", 
                [username, password, name, email, phone || '', school || '']);
            return res.json({ success: true });
        }

        if (pathname === '/api/users') {
            if (method === 'GET') {
                const id = url.searchParams.get("id");
                if (id) {
                    const rows = await runQuery("SELECT * FROM users WHERE id = $1", [id]);
                    return res.json(rows[0] || {});
                }
                return res.json(await runQuery("SELECT * FROM users ORDER BY id DESC"));
            }
            if (method === 'PUT') {
                const b = body; const fields = []; const vals = []; let i = 1;
                const allowed = ['name','role','level','xp','coins','status','password','avatar','email','phone','school','bio','cover_image','birthdate'];
                allowed.forEach(f => { 
                    if(b[f] !== undefined) { fields.push(`${f} = $${i++}`); vals.push(b[f]); } 
                });
                if (fields.length === 0) return res.json({ success: false, message: "No fields to update" });
                vals.push(b.id); 
                await runQuery(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`, vals);
                return res.json({ success: true });
            }
            if (method === 'DELETE') { 
                await runQuery("DELETE FROM users WHERE id = $1", [url.searchParams.get("id")]); 
                return res.json({ success: true }); 
            }
        }

        if (pathname === '/api/history') {
            const userId = url.searchParams.get("userId");
            const rows = await runQuery("SELECT * FROM login_history WHERE user_id = $1 ORDER BY id DESC LIMIT 20", [userId]);
            return res.json(rows || []);
        }

        if (pathname === '/api/leaderboard') {
            const students = await runQuery("SELECT id, name, avatar, role, xp FROM users WHERE role != 'teacher' AND role != 'admin' ORDER BY xp DESC LIMIT 20");
            const instructors = await runQuery("SELECT id, name, avatar, role, 5.0 as avg_rating FROM users WHERE role = 'teacher' OR role = 'admin' ORDER BY id ASC LIMIT 20");
            return res.json({ students, instructors });
        }

        if (pathname === '/api/analytics') {
            const userId = url.searchParams.get("userId");
            if (!userId) return res.status(400).json({ error: "userId required" });
            
            const userRows = await runQuery("SELECT * FROM users WHERE id = $1", [userId]);
            if (userRows.length === 0) return res.json({ user: null, activities: [], certificates: [], rank: '-' });

            const progress = await runQuery("SELECT p.*, a.title FROM user_progress p JOIN activities a ON p.activity_id = a.id WHERE p.user_id = $1", [userId]);
            const certs = await runQuery("SELECT * FROM certificates WHERE user_id = $1", [userId]);
            
            // Calculate Rank
            const rankRes = await runQuery("SELECT COUNT(*) as rank FROM users WHERE xp > (SELECT xp FROM users WHERE id = $1)", [userId]);
            const rank = parseInt(rankRes[0].rank) + 1;

            return res.json({ 
                user: userRows[0], 
                activities: progress || [], 
                certificates: certs || [],
                rank: rank
            });
        }

        // --- 4. ACTIVITIES & ENROLLMENT ---
        if (pathname === '/api/activities') {
            if (method === 'GET') {
                const instructorId = url.searchParams.get("instructorId");
                const studentId = parseInt(url.searchParams.get("studentId")) || 0;
                const id = url.searchParams.get("id");

                if (id) {
                    const rows = await runQuery("SELECT * FROM activities WHERE id = $1", [id]);
                    return res.json(rows[0] || {});
                }

                let q = `
                    SELECT a.*, COALESCE(e.id, 0) as is_enrolled 
                    FROM activities a 
                    LEFT JOIN enrollments e ON a.id = e.activity_id AND e.user_id = $1
                `;
                const params = [studentId];
                
                if (instructorId && instructorId !== 'debug') { 
                    q += " WHERE a.creator_id = $2"; 
                    params.push(parseInt(instructorId)); 
                }
                
                return res.json(await runQuery(q + " ORDER BY a.id DESC", params));
            }
            if (method === 'POST') {
                const b = body; 
                const content = typeof b.content === 'object' ? JSON.stringify(b.content) : b.content;
                await runQuery("INSERT INTO activities (title, type, difficulty, duration, content, category, credits, price, creator_id, certificate_theme) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)", 
                    [b.title, b.type, b.difficulty || 'Medium', b.duration || '30m', content, b.category, b.credits || 0, b.price || 0, b.creator_id, b.certificate_theme || 'classic']);
                return res.json({ success: true });
            }
            if (method === 'PUT') {
                const b = body;
                const content = typeof b.content === 'object' ? JSON.stringify(b.content) : b.content;
                await runQuery("UPDATE activities SET title=$1, type=$2, content=$3, category=$4, credits=$5, price=$6, certificate_theme=$7 WHERE id=$8",
                    [b.title, b.type, content, b.category, b.credits, b.price, b.certificate_theme, b.id]);
                return res.json({ success: true });
            }
            if (method === 'DELETE') {
                await runQuery("DELETE FROM activities WHERE id = $1", [url.searchParams.get("id")]);
                return res.json({ success: true });
            }
        }

        if (pathname === '/api/enroll' && method === 'POST') {
            const { userId, activityId } = body;
            const act = await runQuery("SELECT price FROM activities WHERE id = $1", [activityId]);
            if (!act?.[0]) return res.status(404).json({ error: "Activity not found" });
            
            const price = act[0].price;
            if (price > 0) {
                const user = await runQuery("SELECT coins FROM users WHERE id = $1", [userId]);
                if (!user?.[0] || user[0].coins < price) return res.status(400).json({ error: "Insufficient coins" });
                await runQuery("UPDATE users SET coins = coins - $1 WHERE id = $2", [price, userId]);
            }
            
            await runQuery("INSERT INTO enrollments (user_id, activity_id, enrolled_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [userId, activityId, new Date().toISOString()]);
            return res.json({ success: true });
        }

        // --- 5. SHOP & INVENTORY ---
        if (pathname === '/api/shop') {
            if (method === 'GET') return res.json(await runQuery("SELECT * FROM items ORDER BY price ASC"));
            if (method === 'POST') {
                const b = body;
                await runQuery("INSERT INTO items (name, price, icon, type, description) VALUES ($1, $2, $3, $4, $5)", [b.name, b.price, b.icon, b.type, b.description]);
                return res.json({ success: true });
            }
            if (method === 'DELETE') { await runQuery("DELETE FROM items WHERE id = $1", [url.searchParams.get("id")]); return res.json({ success: true }); }
        }

        if (pathname === '/api/shop/buy' && method === 'POST') {
            const { userId, itemId } = body;
            const item = await runQuery("SELECT * FROM items WHERE id = $1", [itemId]);
            if (!item?.[0]) return res.status(404).json({ error: "Item not found" });
            
            const user = await runQuery("SELECT coins FROM users WHERE id = $1", [userId]);
            if (!user?.[0] || user[0].coins < item[0].price) return res.status(400).json({ error: "Insufficient coins" });
            
            await runQuery("UPDATE users SET coins = coins - $1 WHERE id = $2", [item[0].price, userId]);
            await runQuery("INSERT INTO user_items (user_id, item_id, acquired_at) VALUES ($1, $2, $3)", [userId, itemId, new Date().toISOString()]);
            return res.json({ success: true });
        }

        if (pathname === '/api/inventory') {
            const userId = url.searchParams.get("userId");
            const rows = await runQuery("SELECT i.* FROM items i JOIN user_items ui ON i.id = ui.item_id WHERE ui.user_id = $1", [userId]);
            return res.json(rows || []);
        }

        // --- 6. CERTIFICATES & CONFIG ---
        if (pathname === '/api/certificate') {
            if (method === 'GET') return res.json(await runQuery("SELECT * FROM certificates ORDER BY id DESC"));
            if (method === 'POST') {
                const { userId, userName, courseTitle } = body;
                const code = 'CERT-' + Math.random().toString(36).substr(2, 9).toUpperCase();
                const date = new Date().toISOString();
                await runQuery("INSERT INTO certificates (user_id, user_name, course_title, issue_date, code) VALUES ($1, $2, $3, $4, $5)", [userId, userName, courseTitle, date, code]);
                return res.json({ success: true, code });
            }
        }

        if (pathname === '/api/config') {
            if (method === 'GET') {
                const rows = await runQuery("SELECT * FROM system_config");
                const config = {}; rows?.forEach(r => { try { config[r.key] = JSON.parse(r.value); } catch(e) { config[r.key] = r.value; } });
                return res.json(config);
            }
            const { key, value } = body;
            await runQuery("INSERT INTO system_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2", [key, JSON.stringify(value)]);
            return res.json({ success: true });
        }

        return res.status(404).json({ error: "Route not found" });
    } catch (err) {
        console.error("API Error:", err);
        return res.status(500).json({ error: err.message });
    }
};