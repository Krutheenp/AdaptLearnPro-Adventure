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
            return res.status(200).json({ success: true, message: "Tables initialized" });
        }

        // --- SEED ---
        if (pathname === '/api/seed') {
            await sql`INSERT INTO users (username, password, role, name, level, coins) VALUES ('admin', 'password123', 'admin', 'Super Admin', 99, 9999) ON CONFLICT DO NOTHING`;
            await sql`INSERT INTO users (username, password, role, name, level, coins) VALUES ('teacher', '1234', 'teacher', 'Teacher Demo', 50, 5000) ON CONFLICT DO NOTHING`;
            await sql`INSERT INTO users (username, password, role, name, level, coins) VALUES ('student', '1234', 'student', 'Student Demo', 1, 100) ON CONFLICT DO NOTHING`;
            
            const content = JSON.stringify([{ type: 'text', content: 'Welcome to the demo course!' }]);
            await sql`INSERT INTO activities (title, type, difficulty, duration, content, category, credits) VALUES ('Math 101: Algebra', 'game', 'Easy', '30m', ${content}, 'Mathematics', 3)`;
            
            return res.status(200).json({ success: true, message: "Data seeded!" });
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

        res.status(404).json({ error: "Route not found" });

    } catch (error) {
        console.error("API Error:", error);
        // Final Safety Net: Return valid JSON error instead of crashing
        res.status(500).json({ error: "Server Error", details: error.message });
    }
};