// Vercel API Handler - Production Build v3.4 (Resilient Data Sync)
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
    // 1. Setup Headers
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
        return res.status(500).json({ error: "Database not configured. POSTGRES_URL is missing." });
    }

    // 2. Helper for Queries
    const runQuery = async (text, params = []) => {
        try {
            const result = await db.query(text, params);
            return result.rows;
        } catch (e) {
            console.error(`DB Query Error [${text}]:`, e.message);
            throw e;
        }
    };

    // 3. Body Parsing
    let body = {};
    if (method === 'POST' || method === 'PUT') {
        try {
            if (typeof req.body === 'string') body = JSON.parse(req.body);
            else body = req.body || {};
        } catch (e) { body = {}; }
    }

    try {
        // --- ROUTING ---

        // A. SYSTEM & STATS
        if (pathname === '/api/stats') {
            const u = await runQuery("SELECT COUNT(*) as count FROM users");
            const a = await runQuery("SELECT COUNT(*) as count FROM activities");
            const c = await runQuery("SELECT COUNT(*) as count FROM certificates");
            const v = await runQuery("SELECT COUNT(*) as count FROM site_visits");
            return res.json({ 
                users: parseInt(u[0]?.count || 0), 
                activities: parseInt(a[0]?.count || 0), 
                certificates: parseInt(c[0]?.count || 0), 
                visits: parseInt(v[0]?.count || 0) 
            });
        }

        if (pathname === '/api/visit' && method === 'POST') {
            const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
            await runQuery("INSERT INTO site_visits (ip_address, visit_time) VALUES ($1, $2)", [ip, new Date().toISOString()]);
            return res.json({ success: true });
        }

        // B. AUTH & ANALYTICS
        if (pathname === '/api/login' && method === 'POST') {
            const { username, password } = body;
            const rows = await runQuery("SELECT * FROM users WHERE username = $1 AND password = $2", [username, password]);
            if (rows.length > 0) {
                return res.json({ success: true, ...rows[0] });
            }
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        if (pathname === '/api/analytics') {
            const uid = parseInt(url.searchParams.get("userId")) || 0;
            if (uid === 0) {
                return res.json({ 
                    user: { name: 'Guest Explorer', role: 'guest', level: 1, xp: 0, coins: 0, avatar: '🕵️' }, 
                    certificates: [], 
                    rank: '-' 
                });
            }
            
            const userRows = await runQuery("SELECT * FROM users WHERE id = $1", [uid]);
            if (userRows.length === 0) return res.json({ error: "User not found" });
            
            const certs = await runQuery("SELECT * FROM certificates WHERE user_id = $1", [uid]);
            const rankRes = await runQuery("SELECT COUNT(*) as rank FROM users WHERE xp > (SELECT xp FROM users WHERE id = $1)", [uid]);
            
            return res.json({ 
                user: userRows[0], 
                certificates: certs || [], 
                rank: parseInt(rankRes[0]?.rank || 0) + 1 
            });
        }

        // C. ACTIVITIES & STORE
        if (pathname === '/api/activities') {
            const sid = parseInt(url.searchParams.get("studentId")) || 0;
            const q = `
                SELECT a.*, 
                (CASE WHEN e.id IS NOT NULL THEN 1 ELSE 0 END) as is_enrolled 
                FROM activities a 
                LEFT JOIN enrollments e ON a.id = e.activity_id AND e.user_id = $1 
                ORDER BY a.id DESC`;
            const rows = await runQuery(q, [sid]);
            return res.json(rows || []);
        }

        if (pathname === '/api/shop' && method === 'GET') {
            const rows = await runQuery("SELECT * FROM items ORDER BY price ASC");
            return res.json(rows || []);
        }

        if (pathname === '/api/enroll' && method === 'POST') {
            const { userId, activityId } = body;
            const actRows = await runQuery("SELECT price FROM activities WHERE id = $1", [activityId]);
            const userRows = await runQuery("SELECT coins FROM users WHERE id = $1", [userId]);
            
            if (!actRows[0] || !userRows[0]) return res.status(404).json({ error: "Data not found" });
            
            const price = parseInt(actRows[0].price || 0);
            if (price > parseInt(userRows[0].coins || 0)) return res.status(400).json({ error: "Insufficient coins" });
            
            if (price > 0) {
                await runQuery("UPDATE users SET coins = coins - $1 WHERE id = $2", [price, userId]);
            }
            await runQuery("INSERT INTO enrollments (user_id, activity_id, enrolled_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [userId, activityId, new Date().toISOString()]);
            return res.json({ success: true });
        }

        if (pathname === '/api/shop/buy' && method === 'POST') {
            const { userId, itemId } = body;
            const itemRows = await runQuery("SELECT * FROM items WHERE id = $1", [itemId]);
            const userRows = await runQuery("SELECT coins FROM users WHERE id = $1", [userId]);
            
            if (!itemRows[0] || !userRows[0]) return res.status(404).json({ error: "Asset not found" });
            
            if (itemRows[0].price > userRows[0].coins) return res.status(400).json({ error: "Insufficient balance" });
            
            await runQuery("UPDATE users SET coins = coins - $1 WHERE id = $2", [itemRows[0].price, userId]);
            await runQuery("INSERT INTO user_items (user_id, item_id, acquired_at) VALUES ($1, $2, $3)", [userId, itemId, new Date().toISOString()]);
            return res.json({ success: true });
        }

        if (pathname === '/api/inventory' && method === 'GET') {
            const uid = parseInt(url.searchParams.get("userId")) || 0;
            const rows = await runQuery("SELECT i.* FROM items i JOIN user_items ui ON i.id = ui.item_id WHERE ui.user_id = $1", [uid]);
            return res.json(rows || []);
        }

        // D. USER MANAGEMENT (PUT/DELETE)
        if (pathname === '/api/users') {
            if (method === 'GET') return res.json(await runQuery("SELECT * FROM users ORDER BY id DESC"));
            if (method === 'PUT') {
                const b = body; const f = []; const v = []; let i = 1;
                ['name','role','level','xp','coins','status','avatar','bio','school','cover_image'].forEach(k => { if(b[k] !== undefined) { f.push(`${k} = $${i++}`); v.push(b[k]); } });
                if (f.length > 0) { v.push(b.id); await runQuery(`UPDATE users SET ${f.join(', ')} WHERE id = $${i}`, v); }
                return res.json({ success: true });
            }
            if (method === 'DELETE') { await runQuery("DELETE FROM users WHERE id = $1", [url.searchParams.get("id")]); return res.json({ success: true }); }
        }

        return res.status(404).json({ error: `Route ${pathname} not found` });

    } catch (err) {
        console.error("API RUNTIME ERROR:", err.message);
        return res.status(500).json({ error: "Critical Server Error", details: err.message });
    }
};