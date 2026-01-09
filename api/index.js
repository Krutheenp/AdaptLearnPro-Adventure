const { sql } = require('@vercel/postgres');

module.exports = async (req, res) => {
    const { method } = req;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    res.setHeader('Content-Type', 'application/json');

    // --- MOCK DATA FALLBACK (If DB fails) ---
    const mockUser = { id: 99, username: 'demo', name: 'Demo User (No DB)', role: 'student', level: 5, coins: 100, streak: 3 };
    const mockActs = [
        { id: 1, title: 'Math Demo', type: 'game', difficulty: 'Easy', duration: '10m', category: 'Mathematics', credits: 1 },
        { id: 2, title: 'Science Demo', type: 'video', difficulty: 'Medium', duration: '20m', category: 'Science', credits: 2 }
    ];

    try {
        // --- 1. INITIALIZE DATABASE TABLES ---
        if (pathname === '/api/init') {
            try {
                await sql`CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY, 
                    username TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'student', 
                    name TEXT, email TEXT, phone TEXT, bio TEXT, school TEXT, 
                    level INTEGER DEFAULT 1, xp INTEGER DEFAULT 0, avatar TEXT, 
                    cover_image TEXT, address TEXT, birthdate TEXT, social_links TEXT, 
                    coins INTEGER DEFAULT 0, streak INTEGER DEFAULT 0, last_login TEXT
                )`;
                
                await sql`CREATE TABLE IF NOT EXISTS activities (
                    id SERIAL PRIMARY KEY, title TEXT, type TEXT, difficulty TEXT, 
                    duration TEXT, content TEXT, category TEXT DEFAULT 'General', credits INTEGER DEFAULT 1, 
                    course_code TEXT, creator_id INTEGER DEFAULT 1
                )`;

                await sql`CREATE TABLE IF NOT EXISTS user_progress (
                    id SERIAL PRIMARY KEY, user_id INTEGER, activity_id INTEGER, 
                    score INTEGER DEFAULT 0, status TEXT, completed_at TEXT
                )`;

                await sql`CREATE TABLE IF NOT EXISTS reviews (
                    id SERIAL PRIMARY KEY, user_id INTEGER, activity_id INTEGER, 
                    rating INTEGER, comment TEXT, created_at TEXT
                )`;
                return res.status(200).json({ success: true, message: "Tables initialized" });
            } catch (dbErr) {
                console.error("DB Init Error:", dbErr);
                return res.status(500).json({ error: "Database Connection Failed. Check Vercel Storage settings.", details: dbErr.message });
            }
        }

        // --- 5. SEED DATA ---
        if (pathname === '/api/seed') {
            try {
                await sql`INSERT INTO users (username, password, role, name, level, coins) VALUES 
                    ('admin', 'password123', 'admin', 'Super Admin', 99, 9999) ON CONFLICT DO NOTHING`;
                await sql`INSERT INTO users (username, password, role, name, level, coins) VALUES 
                    ('teacher', '1234', 'teacher', 'Teacher Demo', 50, 5000) ON CONFLICT DO NOTHING`;
                await sql`INSERT INTO users (username, password, role, name, level, coins) VALUES 
                    ('student', '1234', 'student', 'Student Demo', 1, 100) ON CONFLICT DO NOTHING`;
                
                const content = JSON.stringify([{ type: 'text', content: 'Welcome to the demo course!' }]);
                await sql`INSERT INTO activities (title, type, difficulty, duration, content, category, credits) VALUES 
                    ('Math 101: Algebra', 'game', 'Easy', '30m', ${content}, 'Mathematics', 3)`;
                
                return res.status(200).json({ success: true, message: "Data seeded!" });
            } catch (dbErr) {
                return res.status(500).json({ error: "Seed Failed", details: dbErr.message });
            }
        }

        // --- 2. AUTH: LOGIN ---
        if (pathname === '/api/login' && method === 'POST') {
            const { username, password } = req.body;
            try {
                const { rows } = await sql`SELECT * FROM users WHERE username = ${username} AND password = ${password}`;
                if (rows.length > 0) return res.status(200).json({ success: true, ...rows[0] });
                return res.status(401).json({ success: false, message: "Invalid credentials" });
            } catch (dbErr) {
                console.warn("DB Login Failed, using Mock:", dbErr.message);
                // Fallback for Demo
                if (username === 'demo' && password === 'demo') return res.status(200).json({ success: true, ...mockUser });
                return res.status(500).json({ error: "DB Error (Try user: demo / pass: demo)" });
            }
        }

        // --- 3. ANALYTICS ---
        if (pathname === '/api/analytics' && method === 'GET') {
            const userId = url.searchParams.get('userId');
            try {
                const userRes = await sql`SELECT * FROM users WHERE id = ${userId}`;
                const progRes = await sql`
                    SELECT p.*, a.title, a.category, a.credits 
                    FROM user_progress p 
                    JOIN activities a ON p.activity_id = a.id 
                    WHERE p.user_id = ${userId}
                `;
                return res.status(200).json({
                    user: userRes.rows[0],
                    activities: progRes.rows,
                    total_score: progRes.rows.reduce((s, p) => s + (p.score || 0), 0)
                });
            } catch (dbErr) {
                return res.status(200).json({ user: mockUser, activities: [], total_score: 0 });
            }
        }

        // --- 4. ACTIVITIES ---
        if (pathname === '/api/activities' && method === 'GET') {
            try {
                const { rows } = await sql`
                    SELECT a.*, COALESCE(AVG(r.rating), 0) as rating 
                    FROM activities a 
                    LEFT JOIN reviews r ON a.id = r.activity_id 
                    GROUP BY a.id ORDER BY a.id DESC
                `;
                return res.status(200).json(rows);
            } catch (dbErr) {
                return res.status(200).json(mockActs);
            }
        }

        // Fallback
        res.status(404).json({ error: "Route not found" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};