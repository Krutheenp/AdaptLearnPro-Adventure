// Vercel API Handler - Bulletproof Version
// 1. Define Mock Data globally so it's always available
const MOCK_DB = {
    users: [
        { id: 99, username: 'demo', password: 'demo', name: 'Demo Hero', role: 'student', level: 5, xp: 5000, coins: 500, streak: 7, avatar: '🧙‍♂️' },
        { id: 1, username: 'admin', password: '123', name: 'Super Admin', role: 'admin', level: 99, xp: 99999, coins: 9999, avatar: '👑' },
        { id: 2, username: 'teacher', password: '123', name: 'Prof. Albus', role: 'teacher', level: 50, coins: 5000, xp: 25000, avatar: '🧙‍♂️' },
        { id: 3, username: 'student', password: '123', name: 'Novice Hero', role: 'student', level: 5, coins: 500, xp: 1200, avatar: '🙂' }
    ],
    activities: [
        { id: 1, title: 'Math Adventure', type: 'game', difficulty: 'Easy', duration: '15m', category: 'Mathematics', credits: 3, rating: 4.5 },
        { id: 2, title: 'Science Lab', type: 'simulation', difficulty: 'Medium', duration: '30m', category: 'Science', credits: 5, rating: 4.8 },
        { id: 3, title: 'English Quest', type: 'video', category: 'English', credits: 2, rating: 4.2 }
    ],
    items: [
        { id: 1, name: 'Streak Freeze', price: 50, icon: '🧊', type: 'consumable' },
        { id: 2, name: 'Golden Frame', price: 500, icon: '🖼️', type: 'cosmetic' }
    ]
};

// 2. Global Pool variable (lazy init)
let pool = null;

module.exports = async (req, res) => {
    // 3. Set Headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { method } = req;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // --- WELCOME (EDGE CONFIG) ---
    if (pathname === '/api/welcome') {
        try {
            const { get } = require('@vercel/edge-config');
            const greeting = await get('greeting');
            return res.status(200).json({ greeting: greeting || "Welcome to AdaptLearn Adventure!" });
        } catch (e) {
            console.error("Edge Config Error:", e);
            return res.status(200).json({ greeting: "Welcome, Brave Traveler! (Default)" });
        }
    }

    // 4. Try to connect DB (Safe Mode)
    let dbConnected = false;
    try {
        if (process.env.POSTGRES_URL) {
            if (!pool) {
                const { Pool } = require('pg');
                pool = new Pool({
                    connectionString: process.env.POSTGRES_URL,
                    ssl: { rejectUnauthorized: false }
                });
            }
            dbConnected = true;
        }
    } catch (e) {
        console.error("DB Init Failed:", e);
        dbConnected = false;
    }

    // 5. HELPER: Query Wrapper (Falls back to null if failed)
    const runQuery = async (text, params) => {
        if (!dbConnected || !pool) return null;
        try {
            const result = await pool.query(text, params);
            return result.rows;
        } catch (e) {
            console.error("Query Failed:", e);
            return null;
        }
    };

    // --- ENDPOINTS LOGIC ---

    // CHECK DB
    if (pathname === '/api/check-db') {
        if (!dbConnected) return res.json({ status: "Mock Mode", reason: "No Connection" });
        try {
            await pool.query('SELECT 1');
            return res.json({ status: "Connected ✅", type: "Postgres" });
        } catch (e) {
            return res.json({ status: "Connection Error ❌", error: e.message });
        }
    }

    // VISITOR COUNT
    if (pathname === '/api/visit') {
        if (dbConnected) {
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const ua = req.headers['user-agent'];
            await runQuery('INSERT INTO site_visits (ip_address, user_agent, visit_time) VALUES ($1, $2, $3)', [ip, ua, new Date().toISOString()]);
            const rows = await runQuery('SELECT COUNT(*) as total FROM site_visits');
            return res.json({ total_visits: rows[0]?.total || 0 });
        }
        return res.json({ total_visits: 999 }); // Mock
    }

    // LOGIN HISTORY
    if (pathname === '/api/history') {
        const userId = url.searchParams.get("userId");
        if (dbConnected && userId) {
            const history = await runQuery('SELECT * FROM login_history WHERE user_id = $1 ORDER BY login_time DESC LIMIT 20', [userId]);
            return res.json(history || []);
        }
        return res.json([]);
    }

    // INIT (Robust Schema)
    if (pathname === '/api/init') {
        if (!dbConnected) return res.json({ success: true, message: "Mock Init OK" });

        const schema = [
            // 1. Users
            `CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY, 
                username TEXT UNIQUE NOT NULL, 
                password TEXT NOT NULL, 
                role TEXT DEFAULT 'student', 
                name TEXT, 
                level INT DEFAULT 1, 
                xp INT DEFAULT 0, 
                coins INT DEFAULT 0, 
                streak INT DEFAULT 0, 
                avatar TEXT DEFAULT '🙂', 
                cover_image TEXT, 
                email TEXT, 
                phone TEXT, 
                bio TEXT, 
                school TEXT, 
                address TEXT, 
                birthdate TEXT, 
                social_links TEXT, 
                last_login TEXT
            )`,
            `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,

            // 2. Activities (Courses)
            `CREATE TABLE IF NOT EXISTS activities (
                id SERIAL PRIMARY KEY, 
                title TEXT, 
                type TEXT, 
                difficulty TEXT, 
                duration TEXT, 
                content TEXT, 
                category TEXT DEFAULT 'General', 
                credits INT DEFAULT 1, 
                course_code TEXT, 
                creator_id INT REFERENCES users(id) ON DELETE SET NULL
            )`,
            `CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(category)`,

            // 3. Progress
            `CREATE TABLE IF NOT EXISTS user_progress (
                id SERIAL PRIMARY KEY, 
                user_id INT REFERENCES users(id) ON DELETE CASCADE, 
                activity_id INT REFERENCES activities(id) ON DELETE CASCADE, 
                score INT DEFAULT 0, 
                status TEXT, 
                completed_at TEXT
            )`,
            `CREATE INDEX IF NOT EXISTS idx_progress_user ON user_progress(user_id)`,

            // 4. Reviews
            `CREATE TABLE IF NOT EXISTS reviews (
                id SERIAL PRIMARY KEY, 
                user_id INT REFERENCES users(id) ON DELETE CASCADE, 
                activity_id INT REFERENCES activities(id) ON DELETE CASCADE, 
                rating INT, 
                comment TEXT, 
                created_at TEXT
            )`,

            // 5. Shop
            `CREATE TABLE IF NOT EXISTS items (
                id SERIAL PRIMARY KEY, 
                name TEXT, 
                description TEXT, 
                price INT, 
                type TEXT, 
                icon TEXT
            )`,
            `CREATE TABLE IF NOT EXISTS user_items (
                id SERIAL PRIMARY KEY, 
                user_id INT REFERENCES users(id) ON DELETE CASCADE, 
                item_id INT REFERENCES items(id) ON DELETE CASCADE, 
                acquired_at TEXT
            )`,

            // 6. Profile Extras
            `CREATE TABLE IF NOT EXISTS portfolios (
                id SERIAL PRIMARY KEY, 
                user_id INT REFERENCES users(id) ON DELETE CASCADE, 
                title TEXT, 
                description TEXT, 
                media_url TEXT, 
                type TEXT, 
                created_at TEXT
            )`,
            `CREATE TABLE IF NOT EXISTS certificates (
                id SERIAL PRIMARY KEY, 
                user_id INT REFERENCES users(id) ON DELETE CASCADE, 
                user_name TEXT, 
                course_title TEXT, 
                issue_date TEXT, 
                code TEXT
            )`,
            `CREATE TABLE IF NOT EXISTS teacher_skills (
                id SERIAL PRIMARY KEY, 
                user_id INT REFERENCES users(id) ON DELETE CASCADE, 
                skill_name TEXT, 
                proficiency INT
            )`,

            // 7. Analytics
            `CREATE TABLE IF NOT EXISTS site_visits (
                id SERIAL PRIMARY KEY, 
                ip_address TEXT, 
                user_agent TEXT, 
                visit_time TEXT
            )`,
            `CREATE TABLE IF NOT EXISTS login_history (
                id SERIAL PRIMARY KEY, 
                user_id INT REFERENCES users(id) ON DELETE CASCADE, 
                login_time TEXT, 
                ip_address TEXT, 
                device_info TEXT
            )`
        ];

        try {
            for (const query of schema) {
                await runQuery(query);
            }
            return res.json({ success: true, message: "Database Schema Optimized & Synced" });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    // SEED
    if (pathname === '/api/seed') {
        if (!dbConnected) return res.json({ success: true, message: "Mock Seed OK" });
        await runQuery(`INSERT INTO users (username, password, role, name, level, coins, xp, streak, avatar) VALUES ('admin', 'password123', 'admin', 'Gamemaster', 99, 99999, 50000, 100, '👑'), ('teacher', '1234', 'teacher', 'Prof. Albus', 50, 5000, 25000, 30, '🧙‍♂️'), ('student', '1234', 'student', 'Novice Hero', 5, 500, 1200, 3, '🙂') ON CONFLICT (username) DO NOTHING`);
        await runQuery(`INSERT INTO items (name, description, price, type, icon) VALUES ('Streak Freeze', 'Freeze', 50, 'consumable', '🧊'), ('Golden Frame', 'Frame', 500, 'cosmetic', '🖼️') ON CONFLICT DO NOTHING`);
        
        // Check activity
        const acts = await runQuery('SELECT id FROM activities LIMIT 1');
        if (acts && acts.length === 0) {
            const content = JSON.stringify([{type:'text',content:'Welcome'}]);
            await runQuery(`INSERT INTO activities (title, type, difficulty, duration, content, category, credits, course_code) VALUES ('Math: Algebra', 'game', 'Easy', '15m', $1, 'Mathematics', 3, 'MAT101')`, [content]);
        }
        return res.json({ success: true, message: "Seeded" });
    }

    // --- API: AI TUTOR (Gemini) ---
    if (pathname === '/api/chat' && method === 'POST') {
        const { message, history, userContext, learningContext } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.json({ 
                success: true, 
                reply: "ระบบจำลอง (Vercel): กรุณาใส่ GEMINI_API_KEY ใน Environment Variables",
                isSimulated: true
            });
        }

        try {
            // Build Context
            let contextPrompt = `You are an intelligent AI Tutor for "${userContext?.name || 'Student'}". `;
            contextPrompt += `Role: ${userContext?.role || 'student'}. `;
            
            const fetch = require('node-fetch'); // Ensure node-fetch is available or use native global fetch in Node 18+
            
            const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [
                        { role: "user", parts: [{ text: contextPrompt }] },
                        ...(history || []),
                        { role: "user", parts: [{ text: message }] }
                    ]
                })
            });
            const data = await apiRes.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "ขออภัย ระบบขัดข้อง";
            return res.json({ success: true, reply });

        } catch (e) {
            console.error("Gemini Error:", e);
            return res.json({ success: false, error: e.message });
        }
    }

    // --- EXISTING APIs ---
    if (pathname === '/api/register' && method === 'POST') {
        const { username, password, name, email, role } = req.body;
        if (!username || !password || !name) return res.status(400).json({ error: "Missing fields" });

        // 1. Try DB
        const existing = await runQuery('SELECT id FROM users WHERE username = $1', [username]);
        if (existing && existing.length > 0) return res.status(400).json({ error: "Username taken" });

        if (dbConnected) {
            await runQuery(
                `INSERT INTO users (username, password, name, email, role, level, xp, coins, streak, avatar) 
                 VALUES ($1, $2, $3, $4, $5, 1, 0, 0, 0, '🙂')`,
                [username, password, name, email || '', role || 'student']
            );
            return res.json({ success: true });
        }

        // 2. Mock (Ephemeral)
        MOCK_DB.users.push({ 
            id: MOCK_DB.users.length + 1, 
            username, password, name, role: role || 'student', level: 1, xp: 0, coins: 0, avatar: '🙂' 
        });
        return res.json({ success: true, message: "Registered (Mock)" });
    }

    // LOGIN
    if (pathname === '/api/login' && method === 'POST') {
        const { username, password } = req.body;
        
        // 1. Try DB
        const rows = await runQuery('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (rows && rows.length > 0) {
            const user = rows[0];
            // Log History
            if (dbConnected) {
                const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
                const ua = req.headers['user-agent'];
                await runQuery('INSERT INTO login_history (user_id, login_time, ip_address, device_info) VALUES ($1, $2, $3, $4)', 
                    [user.id, new Date().toISOString(), ip, ua]);
            }
            return res.json({ success: true, ...user });
        }

        // 2. Try Mock (Fallback)
        const mockUser = MOCK_DB.users.find(u => u.username === username && u.password === password);
        if (mockUser) return res.json({ success: true, ...mockUser });

        return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // ANALYTICS
    if (pathname === '/api/analytics') {
        const userId = url.searchParams.get('userId');
        
        // 1. Try DB
        const uRows = await runQuery('SELECT * FROM users WHERE id = $1', [userId]);
        if (uRows && uRows.length > 0) {
            const pRows = await runQuery(`SELECT p.*, a.title, a.category, a.credits FROM user_progress p JOIN activities a ON p.activity_id = a.id WHERE p.user_id = $1`, [userId]);
            return res.json({ user: uRows[0], activities: pRows || [], total_score: 0 });
        }

        // 2. Mock
        const mUser = MOCK_DB.users.find(u => String(u.id) === String(userId)) || MOCK_DB.users[0];
        return res.json({ user: mUser, activities: [], total_score: 0 });
    }

    // GENERIC GETs
    if (pathname === '/api/activities') {
        const rows = await runQuery('SELECT * FROM activities ORDER BY id DESC');
        return res.json(rows || MOCK_DB.activities);
    }
    if (pathname === '/api/shop') {
        const rows = await runQuery('SELECT * FROM items ORDER BY price ASC');
        return res.json(rows || MOCK_DB.items);
    }
    if (pathname === '/api/leaderboard') {
        const rows = await runQuery('SELECT id, name, avatar, level, xp FROM users ORDER BY xp DESC LIMIT 10');
        return res.json(rows || MOCK_DB.users);
    }
    if (pathname === '/api/users') {
        return res.json(MOCK_DB.users); // Just return mock users list for safety
    }

    // SHOP BUY
    if (pathname === '/api/shop/buy' && method === 'POST') {
        const { userId, itemId } = req.body;
        const uRows = await runQuery('SELECT coins FROM users WHERE id = $1', [userId]);
        const iRows = await runQuery('SELECT price FROM items WHERE id = $1', [itemId]);

        if (uRows && iRows && uRows.length && iRows.length) {
            const price = iRows[0].price;
            if (uRows[0].coins >= price) {
                await runQuery('UPDATE users SET coins = coins - $1 WHERE id = $2', [price, userId]);
                await runQuery('INSERT INTO user_items (user_id, item_id, acquired_at) VALUES ($1, $2, $3)', [userId, itemId, new Date().toISOString()]);
                return res.json({ success: true, new_balance: uRows[0].coins - price });
            }
            return res.status(400).json({ error: "Not enough coins" });
        }
        // Mock Buy
        return res.json({ success: true, new_balance: 9999 });
    }

    if (pathname === '/api/inventory') {
        const userId = url.searchParams.get("userId");
        if (dbConnected && userId) {
            const items = await runQuery(`
                SELECT i.*, ui.acquired_at 
                FROM user_items ui 
                JOIN items i ON ui.item_id = i.id 
                WHERE ui.user_id = $1 
                ORDER BY ui.acquired_at DESC
            `, [userId]);
            return res.json(items || []);
        }
        return res.json([]);
    }

    return res.status(404).json({ error: "Not found" });
};/ /   D a t a b a s e   L i n k   T r i g g e r  
 