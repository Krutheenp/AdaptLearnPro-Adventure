// Vercel API Handler - Bulletproof & Debuggable
const { Pool } = require('pg');

// 1. Mock Data (Fallback)
const MOCK_DB = {
    users: [
        { id: 99, username: 'demo', password: 'demo', name: 'Demo Hero', role: 'student', level: 5, xp: 5000, coins: 500, streak: 7, avatar: '🧙‍♂️' },
        { id: 1, username: 'admin', password: '123', name: 'Super Admin', role: 'admin', level: 99, xp: 99999, coins: 9999, avatar: '👑' }
    ],
    activities: [
        { id: 1, title: 'Math Adventure', type: 'game', difficulty: 'Easy', duration: '15m', category: 'Mathematics', credits: 3 },
        { id: 2, title: 'Science Lab', type: 'simulation', difficulty: 'Medium', duration: '30m', category: 'Science', credits: 5 }
    ]
};

// 2. Global Pool (Lazy Init)
let pool = null;

// Helper: Safe DB Connect
function getPool() {
    if (!pool && process.env.POSTGRES_URL) {
        console.log("Initializing DB Connection...");
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 5000 // Fail fast
        });
    }
    return pool;
}

module.exports = async (req, res) => {
    // Global Error Handler Wrapper
    try {
        // CORS Headers
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') return res.status(200).end();

        const { method } = req;
        const url = new URL(req.url, `http://${req.headers.host}`);
        const pathname = url.pathname;
        const db = getPool();

        // Helper: Run Query
        const runQuery = async (text, params) => {
            if (!db) return null;
            try {
                const result = await db.query(text, params);
                return result.rows;
            } catch (e) {
                console.error("SQL Error:", e.message);
                return null;
            }
        };

        // --- DEBUG ENDPOINT (Check Status) ---
        if (pathname === '/api/check-db') {
            if (!db) return res.json({ status: "Mock Mode", reason: "Missing POSTGRES_URL" });
            try {
                const start = Date.now();
                await db.query('SELECT 1');
                return res.json({ status: "Connected ✅", latency: `${Date.now() - start}ms` });
            } catch (e) {
                return res.json({ status: "Connection Error ❌", error: e.message, stack: e.stack });
            }
        }

        // --- INIT DATABASE ---
        if (pathname === '/api/init') {
            if (!db) return res.json({ success: true, message: "Mock Init OK (No DB Config)" });

            const schema = [
                `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'student', name TEXT, level INT DEFAULT 1, xp INT DEFAULT 0, coins INT DEFAULT 0, streak INT DEFAULT 0, avatar TEXT DEFAULT '🙂', cover_image TEXT, email TEXT, phone TEXT, bio TEXT, school TEXT, address TEXT, birthdate TEXT, social_links TEXT, last_login TEXT)`,
                `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
                `CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, title TEXT, type TEXT, difficulty TEXT, duration TEXT, content TEXT, category TEXT DEFAULT 'General', credits INT DEFAULT 1, course_code TEXT, creator_id INT REFERENCES users(id) ON DELETE SET NULL)`,
                `CREATE TABLE IF NOT EXISTS user_progress (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, activity_id INT REFERENCES activities(id) ON DELETE CASCADE, score INT DEFAULT 0, status TEXT, completed_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS site_visits (id SERIAL PRIMARY KEY, ip_address TEXT, user_agent TEXT, visit_time TEXT)`,
                `CREATE TABLE IF NOT EXISTS login_history (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, login_time TEXT, ip_address TEXT, device_info TEXT)`,
                `CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT, description TEXT, price INT, type TEXT, icon TEXT)`,
                `CREATE TABLE IF NOT EXISTS user_items (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, item_id INT REFERENCES items(id) ON DELETE CASCADE, acquired_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS certificates (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, user_name TEXT, course_title TEXT, issue_date TEXT, code TEXT)`
            ];

            let logs = [];
            for (const query of schema) {
                try {
                    await db.query(query);
                    logs.push("OK: " + query.substring(0, 30) + "...");
                } catch (e) {
                    logs.push("ERR: " + e.message);
                }
            }
            return res.json({ success: true, logs });
        }

        // --- VISITOR COUNT ---
        if (pathname === '/api/visit') {
            if (db) {
                const ip = req.headers['x-forwarded-for'] || 'unknown';
                const ua = req.headers['user-agent'] || 'unknown';
                await runQuery('INSERT INTO site_visits (ip_address, user_agent, visit_time) VALUES ($1, $2, $3)', [ip, ua, new Date().toISOString()]);
                const rows = await runQuery('SELECT COUNT(*) as total FROM site_visits');
                return res.json({ total_visits: rows?.[0]?.total || 0 });
            }
            return res.json({ total_visits: 999 });
        }

        // --- LOGIN ---
        if (pathname === '/api/login' && method === 'POST') {
            const { username, password } = req.body;
            // 1. DB Login
            const rows = await runQuery('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
            if (rows && rows.length > 0) {
                const user = rows[0];
                if (db) {
                    const ip = req.headers['x-forwarded-for'] || 'unknown';
                    const ua = req.headers['user-agent'] || 'unknown';
                    // Async Log (don't await to speed up login)
                    runQuery('INSERT INTO login_history (user_id, login_time, ip_address, device_info) VALUES ($1, $2, $3, $4)', [user.id, new Date().toISOString(), ip, ua]).catch(console.error);
                }
                return res.json({ success: true, ...user });
            }
            // 2. Mock Login
            const mockUser = MOCK_DB.users.find(u => u.username === username && u.password === password);
            if (mockUser) return res.json({ success: true, ...mockUser });
            
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        // --- REGISTER ---
        if (pathname === '/api/register' && method === 'POST') {
            const { username, password, name, email } = req.body;
            if (!db) return res.json({ success: true, message: "Mock Register OK" });
            
            const existing = await runQuery('SELECT id FROM users WHERE username = $1', [username]);
            if (existing && existing.length > 0) return res.status(400).json({ error: "Username taken" });

            await runQuery(
                `INSERT INTO users (username, password, name, email, role, level, xp, coins, streak, avatar) 
                 VALUES ($1, $2, $3, $4, 'student', 1, 0, 0, 0, '🙂')`,
                [username, password, name, email || '']
            );
            return res.json({ success: true });
        }

        // --- AI CHAT (Gemini) ---
        if (pathname === '/api/chat' && method === 'POST') {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) return res.json({ success: true, reply: "Simulation Mode: No API Key", isSimulated: true });

            const { message, history, userContext } = req.body;
            try {
                // Use Native Fetch (Node 18+)
                const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [
                            { role: "user", parts: [{ text: `You are a tutor for ${userContext?.name || 'Student'}. Reply in Thai.` }] },
                            ...(history || []),
                            { role: "user", parts: [{ text: message }] }
                        ]
                    })
                });
                const data = await apiRes.json();
                const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "AI Error";
                return res.json({ success: true, reply });
            } catch (e) {
                return res.json({ success: false, error: e.message });
            }
        }

        // --- GENERIC GETTERS ---
        if (pathname === '/api/activities') {
            const rows = await runQuery('SELECT * FROM activities ORDER BY id DESC');
            return res.json(rows || MOCK_DB.activities);
        }
        if (pathname === '/api/leaderboard') {
            const rows = await runQuery('SELECT id, name, avatar, level, xp FROM users ORDER BY xp DESC LIMIT 10');
            return res.json(rows || MOCK_DB.users);
        }
        if (pathname === '/api/history') {
            const userId = url.searchParams.get("userId");
            if (db && userId) {
                const rows = await runQuery('SELECT * FROM login_history WHERE user_id = $1 ORDER BY login_time DESC LIMIT 20', [userId]);
                return res.json(rows || []);
            }
            return res.json([]);
        }

        return res.status(404).json({ error: "Not found" });

    } catch (criticalError) {
        console.error("CRITICAL CRASH:", criticalError);
        // Return JSON even on crash, preventing 500 HTML page
        return res.status(500).json({ 
            error: "Internal Server Error", 
            message: criticalError.message, 
            stack: criticalError.stack 
        });
    }
};
