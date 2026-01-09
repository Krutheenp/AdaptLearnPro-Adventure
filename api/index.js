// Vercel API Handler - Robust Demo Mode
const { sql } = require('@vercel/postgres');

// --- CENTRALIZED MOCK DATA ---
const MOCK_DB = {
    users: [
        { id: 99, username: 'demo', password: 'demo', name: 'Demo Hero', role: 'student', level: 5, xp: 5000, coins: 500, streak: 7, avatar: '🧙‍♂️' },
        { id: 1, username: 'admin', password: '123', name: 'Super Admin', role: 'admin', level: 99, xp: 99999, coins: 9999, avatar: '👑' },
        { id: 2, name: 'DragonSlayer', avatar: '🐉', level: 15, xp: 15400, role: 'student' },
        { id: 3, name: 'PixelWizard', avatar: '🧙‍♂️', level: 12, xp: 12300, role: 'student' },
        { id: 4, name: 'CodeNinja', avatar: '🥷', level: 10, xp: 10500, role: 'student' }
    ],
    activities: [
        { id: 1, title: 'Math Adventure', type: 'game', difficulty: 'Easy', duration: '15m', category: 'Mathematics', credits: 3, rating: 4.5 },
        { id: 2, title: 'Science Lab', type: 'simulation', difficulty: 'Medium', duration: '30m', category: 'Science', credits: 5, rating: 4.8 }
    ],
    items: [
        { id: 1, name: 'Streak Freeze', description: 'Prevent streak loss', price: 50, icon: '🧊', type: 'consumable' },
        { id: 2, name: 'Golden Frame', description: 'Show off your wealth', price: 500, icon: '🖼️', type: 'cosmetic' }
    ]
};

module.exports = async (req, res) => {
    const { method } = req;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    res.setHeader('Content-Type', 'application/json');

    // --- MODE CHECK: IF NO DB, USE MOCK ---
    const isDemo = !process.env.POSTGRES_URL;

    if (isDemo) {
        console.warn(`⚠️ [DEMO MODE] Serving Mock Data for ${pathname}`);
        
        if (pathname === '/api/login' && method === 'POST') {
            const { username, password } = req.body;
            const user = MOCK_DB.users.find(u => u.username === username && u.password === password);
            if (user) return res.status(200).json({ success: true, ...user });
            return res.status(401).json({ success: false, message: "Invalid credentials (Try: demo/demo)" });
        }

        if (pathname === '/api/users' && method === 'GET') return res.status(200).json(MOCK_DB.users);
        
        if (pathname === '/api/activities' && method === 'GET') return res.status(200).json(MOCK_DB.activities);
        
        if (pathname === '/api/leaderboard' && method === 'GET') return res.status(200).json(MOCK_DB.users.sort((a,b) => b.xp - a.xp));
        
        if (pathname === '/api/shop' && method === 'GET') return res.status(200).json(MOCK_DB.items);
        
        if (pathname === '/api/analytics') {
            return res.status(200).json({
                user: MOCK_DB.users[0],
                activities: [],
                total_score: 0,
                rank: 1, total_users: MOCK_DB.users.length
            });
        }
        
        if (pathname === '/api/inventory') return res.status(200).json([]);

        // Default success for writes in demo
        if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
            return res.status(200).json({ success: true, message: "Operation simulated in Demo Mode" });
        }

        return res.status(404).json({ error: "Route not found (Demo)" });
    }

    // --- REAL DATABASE MODE ---
    try {
        // --- 1. INITIALIZE ---
        if (pathname === '/api/init') {
            await sql`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE, password TEXT, role TEXT, name TEXT, level INT DEFAULT 1, coins INT DEFAULT 0, streak INT DEFAULT 0, xp INT DEFAULT 0, avatar TEXT, cover_image TEXT, address TEXT, birthdate TEXT, social_links TEXT, email TEXT, phone TEXT, bio TEXT, school TEXT, last_login TEXT)`;
            await sql`CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, title TEXT, type TEXT, difficulty TEXT, duration TEXT, content TEXT, category TEXT, credits INT, course_code TEXT, creator_id INT)`;
            await sql`CREATE TABLE IF NOT EXISTS user_progress (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, score INT, status TEXT, completed_at TEXT)`;
            await sql`CREATE TABLE IF NOT EXISTS reviews (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, rating INT, comment TEXT, created_at TEXT)`;
            await sql`CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT, description TEXT, price INT, type TEXT, icon TEXT)`;
            await sql`CREATE TABLE IF NOT EXISTS user_items (id SERIAL PRIMARY KEY, user_id INT, item_id INT, acquired_at TEXT)`;
            return res.status(200).json({ success: true, message: "Tables initialized" });
        }

        // --- SEED DATA (FULL POPULATE) ---
        if (pathname === '/api/seed') {
            // 1. Users
            await sql`INSERT INTO users (username, password, role, name, level, coins, xp, streak, avatar) VALUES 
                ('admin', 'password123', 'admin', 'Gamemaster', 99, 99999, 50000, 100, '👑') ON CONFLICT (username) DO NOTHING`;
            await sql`INSERT INTO users (username, password, role, name, level, coins, xp, streak, avatar) VALUES 
                ('teacher', '1234', 'teacher', 'Prof. Albus', 50, 5000, 25000, 30, '🧙‍♂️') ON CONFLICT (username) DO NOTHING`;
            await sql`INSERT INTO users (username, password, role, name, level, coins, xp, streak, avatar) VALUES 
                ('student', '1234', 'student', 'Novice Hero', 5, 500, 1200, 3, '🙂') ON CONFLICT (username) DO NOTHING`;
            
            // 2. Shop Items
            await sql`INSERT INTO items (name, description, price, type, icon) VALUES 
                ('Streak Freeze', 'Freeze your streak for 1 day', 50, 'consumable', '🧊'),
                ('XP Potion (x2)', 'Double XP for next mission', 100, 'consumable', '🧪'),
                ('Golden Frame', 'Exclusive golden avatar border', 500, 'cosmetic', '🖼️'),
                ('Wizard Hat', 'Unlock the Wizard avatar', 300, 'cosmetic', '🧙'),
                ('Knight Helmet', 'Unlock the Knight avatar', 300, 'cosmetic', '⛑️')`;

            // 3. Activities
            const content = JSON.stringify([{ type: 'text', content: 'Welcome to the world of numbers!' }]);
            await sql`INSERT INTO activities (title, type, difficulty, duration, content, category, credits, course_code) VALUES 
                ('Math: The Beginning', 'game', 'Easy', '10m', ${content}, 'Mathematics', 1, 'MAT101')`;
            
            return res.status(200).json({ success: true, message: "Database seeded with Users, Items, and Activities!" });
        }

        // --- 2. AUTH ---
        if (pathname === '/api/login' && method === 'POST') {
            const { username, password } = req.body;
            const { rows } = await sql`SELECT * FROM users WHERE username = ${username} AND password = ${password}`;
            if (rows.length > 0) return res.status(200).json({ success: true, ...rows[0] });
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        // --- 3. ANALYTICS ---
        if (pathname === '/api/analytics' && method === 'GET') {
            const userId = url.searchParams.get('userId');
            const userRes = await sql`SELECT * FROM users WHERE id = ${userId}`;
            const progRes = await sql`SELECT p.*, a.title, a.category, a.credits FROM user_progress p JOIN activities a ON p.activity_id = a.id WHERE p.user_id = ${userId}`;
            return res.status(200).json({ user: userRes.rows[0], activities: progRes.rows, total_score: 0 });
        }

        // --- 4. ACTIVITIES ---
        if (pathname === '/api/activities' && method === 'GET') {
            const { rows } = await sql`SELECT * FROM activities ORDER BY id DESC`;
            return res.status(200).json(rows);
        }

        // --- 5. LEADERBOARD ---
        if (pathname === '/api/leaderboard' && method === 'GET') {
            const { rows } = await sql`SELECT id, name, avatar, level, xp, role FROM users ORDER BY xp DESC LIMIT 20`;
            return res.status(200).json(rows);
        }

        // --- 6. SHOP ---
        if (pathname === '/api/shop' && method === 'GET') {
            const { rows } = await sql`SELECT * FROM items ORDER BY price ASC`;
            return res.status(200).json(rows);
        }

        // --- 7. USERS ---
        if (pathname === '/api/users' && method === 'GET') {
            const { rows } = await sql`SELECT * FROM users`;
            return res.status(200).json(rows);
        }

        // --- 8. BUY ITEM ---
        if (pathname === '/api/shop/buy' && method === 'POST') {
            const { userId, itemId } = req.body;
            // 1. Check User Coins
            const userRes = await sql`SELECT coins FROM users WHERE id = ${userId}`;
            if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
            const userCoins = userRes.rows[0].coins;

            // 2. Check Item Price
            const itemRes = await sql`SELECT price FROM items WHERE id = ${itemId}`;
            if (itemRes.rows.length === 0) return res.status(404).json({ error: "Item not found" });
            const price = itemRes.rows[0].price;

            // 3. Transaction
            if (userCoins < price) return res.status(400).json({ error: "Not enough coins!" });

            await sql`UPDATE users SET coins = coins - ${price} WHERE id = ${userId}`;
            await sql`INSERT INTO user_items (user_id, item_id, acquired_at) VALUES (${userId}, ${itemId}, ${new Date().toISOString()})`;

            return res.status(200).json({ success: true, new_balance: userCoins - price });
        }

        // --- 9. INVENTORY ---
        if (pathname === '/api/inventory' && method === 'GET') {
            const userId = url.searchParams.get('userId');
            const { rows } = await sql`SELECT i.*, ui.acquired_at FROM user_items ui JOIN items i ON ui.item_id = i.id WHERE ui.user_id = ${userId}`;
            return res.status(200).json(rows);
        }

        // Fallback for others
        return res.status(200).json({ success: true });

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: error.message });
    }
};