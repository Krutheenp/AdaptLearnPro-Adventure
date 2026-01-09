// Vercel API Handler
module.exports = async (req, res) => {
    const { method } = req;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    res.setHeader('Content-Type', 'application/json');

    // --- 1. CHECK DATABASE CONFIG ---
    // If no DB connection string, serve MOCK DATA immediately.
    if (!process.env.POSTGRES_URL) {
        console.warn("⚠️ No POSTGRES_URL found. Serving Mock Data.");
        
        if (pathname === '/api/login' && method === 'POST') {
            const { username, password } = req.body;
            // Demo credentials
            if ((username === 'demo' && password === 'demo') || (username === 'admin' && password === 'password123')) {
                return res.status(200).json({ 
                    success: true, id: 99, username: 'demo', name: 'Demo Hero', role: 'student', 
                    level: 5, coins: 500, streak: 7, avatar: '🧙‍♂️' 
                });
            }
            return res.status(401).json({ success: false, message: "Invalid credentials (Try: demo/demo)" });
        }

        if (pathname === '/api/activities' && method === 'GET') {
            return res.status(200).json([
                { id: 1, title: 'Math Adventure', type: 'game', difficulty: 'Easy', duration: '15m', category: 'Mathematics', credits: 3, rating: 4.5 },
                { id: 2, title: 'Science Lab', type: 'simulation', difficulty: 'Medium', duration: '30m', category: 'Science', credits: 5, rating: 4.8 }
            ]);
        }

        if (pathname === '/api/analytics') {
            return res.status(200).json({
                user: { id: 99, name: 'Demo Hero', level: 5, coins: 500, streak: 7 },
                activities: [],
                total_score: 0
            });
        }

        if (pathname === '/api/users' && method === 'GET') {
            return res.status(200).json([
                { id: 99, username: 'demo', name: 'Demo Hero', role: 'student', level: 5, coins: 500, streak: 7, avatar: '🧙‍♂️' },
                { id: 1, username: 'admin', name: 'Super Admin', role: 'admin', level: 99, coins: 9999, avatar: '👑' }
            ]);
        }

        return res.status(200).json({ message: "Running in Demo Mode (No DB Connected)" });
    }

    // --- 2. REAL DATABASE MODE ---
    try {
        const { sql } = require('@vercel/postgres'); // Lazy import

        // ... (Keep existing DB logic here, but wrapped) ...
        
        // --- AUTH: LOGIN ---
        if (pathname === '/api/login' && method === 'POST') {
            const { username, password } = req.body;
            try {
                const { rows } = await sql`SELECT * FROM users WHERE username = ${username} AND password = ${password}`;
                if (rows.length > 0) return res.status(200).json({ success: true, ...rows[0] });
                return res.status(401).json({ success: false, message: "Invalid credentials" });
            } catch (e) {
                // Fallback if SQL fails even with Env var present
                if (username === 'demo' && password === 'demo') return res.status(200).json({ success: true, id: 99, name: 'Fallback Demo', role: 'student' });
                throw e; 
            }
        }

        // --- INIT DB ---
        if (pathname === '/api/init') {
            await sql`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT, password TEXT, role TEXT, name TEXT, level INT DEFAULT 1, coins INT DEFAULT 0, streak INT DEFAULT 0, xp INT DEFAULT 0, avatar TEXT, cover_image TEXT, address TEXT, birthdate TEXT, social_links TEXT, email TEXT, phone TEXT, bio TEXT, school TEXT, last_login TEXT)`;
            await sql`CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, title TEXT, type TEXT, difficulty TEXT, duration TEXT, content TEXT, category TEXT, credits INT, course_code TEXT, creator_id INT)`;
            await sql`CREATE TABLE IF NOT EXISTS user_progress (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, score INT, status TEXT, completed_at TEXT)`;
            await sql`CREATE TABLE IF NOT EXISTS reviews (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, rating INT, comment TEXT, created_at TEXT)`;
            
            // New: Shop Tables
            await sql`CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT, description TEXT, price INT, type TEXT, icon TEXT)`;
            await sql`CREATE TABLE IF NOT EXISTS user_items (id SERIAL PRIMARY KEY, user_id INT, item_id INT, acquired_at TEXT)`;

            return res.status(200).json({ success: true, message: "Tables initialized" });
        }

        // --- 5. SEED DATA ---
        if (pathname === '/api/seed') {
            await sql`INSERT INTO users (username, password, role, name, level, coins) VALUES ('admin', 'password123', 'admin', 'Super Admin', 99, 9999) ON CONFLICT DO NOTHING`;
            await sql`INSERT INTO users (username, password, role, name, level, coins) VALUES ('teacher', '1234', 'teacher', 'Teacher Demo', 50, 5000) ON CONFLICT DO NOTHING`;
            await sql`INSERT INTO users (username, password, role, name, level, coins) VALUES ('student', '1234', 'student', 'Student Demo', 1, 100) ON CONFLICT DO NOTHING`;
            
            const content = JSON.stringify([{ type: 'text', content: 'Welcome to the demo course!' }]);
            await sql`INSERT INTO activities (title, type, difficulty, duration, content, category, credits) VALUES ('Math 101: Algebra', 'game', 'Easy', '30m', ${content}, 'Mathematics', 3)`;
            
            // Seed Items
            await sql`INSERT INTO items (name, description, price, type, icon) VALUES 
                ('Streak Freeze', 'Protect your streak for 1 day', 50, 'consumable', '🧊'),
                ('Double XP Potion', 'Gain 2x XP for 1 hour', 100, 'consumable', '🧪'),
                ('Golden Frame', 'Shiny profile avatar frame', 500, 'cosmetic', '🖼️'),
                ('Wizard Hat', 'Unlock Wizard role title', 300, 'cosmetic', '🧙)')`;

            return res.status(200).json({ success: true, message: "Data seeded!" });
        }

        // --- 7. SHOP & INVENTORY ---
        if (pathname === '/api/shop' && method === 'GET') {
            try {
                const { rows } = await sql`SELECT * FROM items ORDER BY price ASC`;
                return res.status(200).json(rows);
            } catch (e) {
                // Mock Items
                return res.status(200).json([
                    { id: 1, name: 'Streak Freeze', description: 'Prevent streak loss', price: 50, icon: '🧊' },
                    { id: 2, name: 'Golden Frame', description: 'Show off your wealth', price: 500, icon: '🖼️' }
                ]);
            }
        }

        if (pathname === '/api/shop/buy' && method === 'POST') {
            const { userId, itemId } = req.body;
            try {
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
            } catch (e) {
                return res.status(500).json({ error: e.message });
            }
        }

        if (pathname === '/api/inventory' && method === 'GET') {
            const userId = url.searchParams.get('userId');
            try {
                const { rows } = await sql`SELECT i.*, ui.acquired_at FROM user_items ui JOIN items i ON ui.item_id = i.id WHERE ui.user_id = ${userId}`;
                return res.status(200).json(rows);
            } catch(e) { return res.status(200).json([]); }
        }

        // --- ACTIVITIES ---
        if (pathname === '/api/activities' && method === 'GET') {
            const { rows } = await sql`SELECT a.*, COALESCE(AVG(r.rating), 0) as rating FROM activities a LEFT JOIN reviews r ON a.id = r.activity_id GROUP BY a.id ORDER BY a.id DESC`;
            return res.status(200).json(rows);
        }

        // --- ANALYTICS ---
        if (pathname === '/api/analytics' && method === 'GET') {
            const userId = url.searchParams.get('userId');
            const userRes = await sql`SELECT * FROM users WHERE id = ${userId}`;
            const progRes = await sql`SELECT p.*, a.title, a.category, a.credits FROM user_progress p JOIN activities a ON p.activity_id = a.id WHERE p.user_id = ${userId}`;
            return res.status(200).json({ user: userRes.rows[0], activities: progRes.rows, total_score: 0 });
        }

        // --- 6. LEADERBOARD ---
        if (pathname === '/api/leaderboard' && method === 'GET') {
            try {
                // Real DB Query
                const { rows } = await sql`SELECT id, name, avatar, level, xp, role FROM users ORDER BY xp DESC LIMIT 20`;
                return res.status(200).json(rows);
            } catch (dbErr) {
                // Mock Data for Demo
                const mockUsers = [
                    { id: 1, name: 'DragonSlayer', avatar: '🐉', level: 15, xp: 15400, role: 'student' },
                    { id: 2, name: 'PixelWizard', avatar: '🧙‍♂️', level: 12, xp: 12300, role: 'student' },
                    { id: 3, name: 'CodeNinja', avatar: '🥷', level: 10, xp: 10500, role: 'student' },
                    { id: 4, name: 'StarGazer', avatar: '👩‍🚀', level: 8, xp: 8200, role: 'student' },
                    { id: 99, name: 'Demo Hero', avatar: '🧙‍♂️', level: 5, xp: 5000, role: 'student' } // Current User
                ];
                // Generate more filler users
                for(let i=5; i<=15; i++) {
                    mockUsers.push({ id: i, name: `Player ${i}`, avatar: '👤', level: Math.floor(Math.random()*8)+1, xp: Math.floor(Math.random()*5000), role: 'student' });
                }
                mockUsers.sort((a,b) => b.xp - a.xp);
                return res.status(200).json(mockUsers);
            }
        }

        // Fallback
        res.status(404).json({ error: "Route not found" });

    } catch (error) {
        console.error("API Error:", error);
        // Final Safety Net: Return valid JSON error instead of crashing
        res.status(500).json({ error: "Server Error", details: error.message });
    }
};