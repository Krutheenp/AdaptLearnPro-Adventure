// Vercel API Handler - Production Postgres (Pool)
const { createPool } = require('@vercel/postgres');

// --- MOCK DATA FALLBACK (For resilience) ---
const MOCK_DB = {
    users: [
        { id: 99, username: 'demo', password: 'demo', name: 'Demo Hero', role: 'student', level: 5, xp: 5000, coins: 500, streak: 7, avatar: '🧙‍♂️' },
        { id: 1, username: 'admin', password: '123', name: 'Super Admin', role: 'admin', level: 99, xp: 99999, coins: 9999, avatar: '👑' }
    ],
    activities: [
        { id: 1, title: 'Math Adventure', type: 'game', category: 'Mathematics', credits: 3 },
        { id: 2, title: 'Science Lab', type: 'video', category: 'Science', credits: 2 }
    ]
};

module.exports = async (req, res) => {
    const { method } = req;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    res.setHeader('Content-Type', 'application/json');
    
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') return res.status(200).end();

    // 1. Check DB Config
    if (!process.env.POSTGRES_URL) {
        console.warn("⚠️ No POSTGRES_URL. Using Mock Mode.");
        if (pathname === '/api/login') return res.status(200).json({ success: true, ...MOCK_DB.users[0] });
        if (pathname === '/api/activities') return res.status(200).json(MOCK_DB.activities);
        if (pathname === '/api/users') return res.status(200).json(MOCK_DB.users);
        return res.status(200).json({ message: "Demo Mode Active" });
    }

    // 2. Real DB Connection (Pool)
    const pool = createPool({ connectionString: process.env.POSTGRES_URL });

    try {
        // --- AUTH ---
        if (pathname === '/api/login' && method === 'POST') {
            const { username, password } = req.body;
            const { rows } = await pool.sql`SELECT * FROM users WHERE username = ${username} AND password = ${password}`;
            if (rows.length > 0) return res.status(200).json({ success: true, ...rows[0] });
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        // --- INIT ---
        if (pathname === '/api/init') {
            await pool.sql`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE, password TEXT, role TEXT, name TEXT, level INT DEFAULT 1, coins INT DEFAULT 0, streak INT DEFAULT 0, xp INT DEFAULT 0, avatar TEXT, cover_image TEXT, address TEXT, birthdate TEXT, social_links TEXT, email TEXT, phone TEXT, bio TEXT, school TEXT, last_login TEXT)`;
            await pool.sql`CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, title TEXT, type TEXT, difficulty TEXT, duration TEXT, content TEXT, category TEXT, credits INT, course_code TEXT, creator_id INT)`;
            await pool.sql`CREATE TABLE IF NOT EXISTS user_progress (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, score INT, status TEXT, completed_at TEXT)`;
            await pool.sql`CREATE TABLE IF NOT EXISTS reviews (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, rating INT, comment TEXT, created_at TEXT)`;
            await pool.sql`CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT, description TEXT, price INT, type TEXT, icon TEXT)`;
            await pool.sql`CREATE TABLE IF NOT EXISTS user_items (id SERIAL PRIMARY KEY, user_id INT, item_id INT, acquired_at TEXT)`;
            return res.status(200).json({ success: true, message: "Tables initialized" });
        }

        // --- SEED ---
        if (pathname === '/api/seed') {
            await pool.sql`INSERT INTO users (username, password, role, name, level, coins, xp, streak, avatar) VALUES ('admin', 'password123', 'admin', 'Gamemaster', 99, 99999, 50000, 100, '👑') ON CONFLICT (username) DO NOTHING`;
            await pool.sql`INSERT INTO users (username, password, role, name, level, coins, xp, streak, avatar) VALUES ('teacher', '1234', 'teacher', 'Prof. Albus', 50, 5000, 25000, 30, '🧙‍♂️') ON CONFLICT (username) DO NOTHING`;
            await pool.sql`INSERT INTO users (username, password, role, name, level, coins, xp, streak, avatar) VALUES ('student', '1234', 'student', 'Novice Hero', 5, 500, 1200, 3, '🙂') ON CONFLICT (username) DO NOTHING`;
            
            const content = JSON.stringify([{ type: 'text', content: 'Welcome!' }]);
            await pool.sql`INSERT INTO activities (title, type, difficulty, duration, content, category, credits, course_code) VALUES ('Math: Algebra I', 'game', 'Easy', '15m', ${content}, 'Mathematics', 3, 'MAT101')`;
            await pool.sql`INSERT INTO items (name, description, price, type, icon) VALUES ('Streak Freeze', 'Freeze streak', 50, 'consumable', '🧊'), ('Golden Frame', 'Shiny border', 500, 'cosmetic', '🖼️')`;

            return res.status(200).json({ success: true, message: "Seeded!" });
        }

        // --- FETCH DATA ---
        if (pathname === '/api/users' && method === 'GET') {
            const { rows } = await pool.sql`SELECT * FROM users`;
            return res.status(200).json(rows);
        }
        if (pathname === '/api/activities' && method === 'GET') {
            const { rows } = await pool.sql`SELECT * FROM activities ORDER BY id DESC`;
            return res.status(200).json(rows);
        }
        if (pathname === '/api/shop' && method === 'GET') {
            const { rows } = await pool.sql`SELECT * FROM items ORDER BY price ASC`;
            return res.status(200).json(rows);
        }
        if (pathname === '/api/leaderboard' && method === 'GET') {
            const { rows } = await pool.sql`SELECT id, name, avatar, level, xp, role FROM users ORDER BY xp DESC LIMIT 20`;
            return res.status(200).json(rows);
        }

        // --- ANALYTICS ---
        if (pathname === '/api/analytics' && method === 'GET') {
            const userId = url.searchParams.get('userId');
            const userRes = await pool.sql`SELECT * FROM users WHERE id = ${userId}`;
            if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
            
            const progRes = await pool.sql`SELECT p.*, a.title, a.category, a.credits FROM user_progress p JOIN activities a ON p.activity_id = a.id WHERE p.user_id = ${userId}`;
            
            return res.status(200).json({
                user: userRes.rows[0],
                activities: progRes.rows,
                total_score: 0
            });
        }

        // --- BUY ---
        if (pathname === '/api/shop/buy' && method === 'POST') {
            const { userId, itemId } = req.body;
            const userRes = await pool.sql`SELECT coins FROM users WHERE id = ${userId}`;
            const itemRes = await pool.sql`SELECT price FROM items WHERE id = ${itemId}`;
            
            if (userRes.rows.length === 0 || itemRes.rows.length === 0) return res.status(404).json({ error: "Not found" });
            const price = itemRes.rows[0].price;
            
            if (userRes.rows[0].coins < price) return res.status(400).json({ error: "Insufficient funds" });

            await pool.sql`UPDATE users SET coins = coins - ${price} WHERE id = ${userId}`;
            await pool.sql`INSERT INTO user_items (user_id, item_id, acquired_at) VALUES (${userId}, ${itemId}, ${new Date().toISOString()})`;
            
            return res.status(200).json({ success: true, new_balance: userRes.rows[0].coins - price });
        }

        if (pathname === '/api/inventory' && method === 'GET') {
            const userId = url.searchParams.get('userId');
            const { rows } = await pool.sql`SELECT i.*, ui.acquired_at FROM user_items ui JOIN items i ON ui.item_id = i.id WHERE ui.user_id = ${userId}`;
            return res.status(200).json(rows);
        }

        // Fallback
        res.status(404).json({ error: "API Route not found" });

    } catch (e) {
        console.error("DB Error:", e);
        res.status(500).json({ error: e.message });
    }
};