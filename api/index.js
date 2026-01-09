const { sql } = require('@vercel/postgres');

module.exports = async (req, res) => {
    const { method } = req;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    res.setHeader('Content-Type', 'application/json');

    try {
        // --- 1. INITIALIZE DATABASE TABLES (Run on every hit for safety in demo, or use a dedicated init route) ---
        if (pathname === '/api/init') {
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
        }

        // --- 2. AUTH: LOGIN ---
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
        }

        // --- 4. ACTIVITIES ---
        if (pathname === '/api/activities' && method === 'GET') {
            const { rows } = await sql`
                SELECT a.*, COALESCE(AVG(r.rating), 0) as rating 
                FROM activities a 
                LEFT JOIN reviews r ON a.id = r.activity_id 
                GROUP BY a.id ORDER BY a.id DESC
            `;
            return res.status(200).json(rows);
        }

        // Fallback
        res.status(404).json({ error: "Route not found" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};