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

        // --- SEED DATABASE ---
        if (pathname === '/api/seed') {
            if (!db) return res.json({ success: true, message: "Mock Seed OK" });

            try {
                // 1. Seed Admin
                await db.query(`INSERT INTO users (username, password, role, name, level, xp, avatar) 
                    VALUES ('admin', 'password123', 'admin', 'Super Admin', 99, 99999, '👑') 
                    ON CONFLICT (username) DO NOTHING`);

                // 2. Seed Items
                const items = [
                    { name: 'Streak Freeze', price: 50, icon: '🧊', type: 'consumable', desc: 'Prevent streak reset' },
                    { name: 'Golden Frame', price: 500, icon: '🖼️', type: 'cosmetic', desc: 'Shiny profile frame' },
                    { name: 'XP Boost (1h)', price: 100, icon: '⚡', type: 'consumable', desc: 'Double XP for 1 hour' }
                ];
                for (const i of items) {
                    await db.query(`INSERT INTO items (name, price, icon, type, description) 
                        VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`, 
                        [i.name, i.price, i.icon, i.type, i.desc]);
                }

                // 3. Seed Activities (if empty)
                const actCount = await db.query("SELECT COUNT(*) FROM activities");
                if (parseInt(actCount.rows[0].count) === 0) {
                    const courses = [
                        { title: "คณิตศาสตร์: สมการเชิงเส้น", type: "video", difficulty: "Medium", duration: "45m", category: "Mathematics", credits: 3 },
                        { title: "วิทยาศาสตร์: ระบบสุริยะ", type: "game", difficulty: "Easy", duration: "30m", category: "Science", credits: 3 },
                        { title: "Python Programming 101", type: "simulation", difficulty: "Medium", duration: "2h", category: "Technology", credits: 4 }
                    ];
                    for (const c of courses) {
                        await db.query(`INSERT INTO activities (title, type, difficulty, duration, category, credits) VALUES ($1, $2, $3, $4, $5, $6)`, 
                            [c.title, c.type, c.difficulty, c.duration, c.category, c.credits]);
                    }
                }

                return res.json({ success: true, message: "Database Seeded Successfully" });
            } catch (e) {
                return res.status(500).json({ error: "Seed failed", details: e.message });
            }
        }

        // --- UPLOAD (Vercel Blob) ---
        if (pathname === '/api/upload' && method === 'POST') {
            try {
                const { put } = require('@vercel/blob');
                // Vercel handles multipart/form-data automatically in some cases, 
                // but for Serverless we often use simpler approaches or libraries.
                // Assuming client sends raw or handled by vercel.
                // For simplicity, let's assume we use the Vercel Blob token from Env.
                const filename = url.searchParams.get('filename') || `upload_${Date.now()}.png`;
                
                // Read body as buffer
                const chunks = [];
                for await (const chunk of req) { chunks.push(chunk); }
                const buffer = Buffer.concat(chunks);

                const blob = await put(filename, buffer, {
                    access: 'public',
                });
                return res.json({ success: true, url: blob.url });
            } catch (e) {
                return res.status(500).json({ error: "Upload failed", details: e.message });
            }
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

        // --- ANALYTICS (Profile Data) ---
        if (pathname === '/api/analytics') {
            const userId = url.searchParams.get("userId");
            if (!userId) return res.status(400).json({ error: "Missing User ID" });

            if (db) {
                // 1. User Info
                const userRes = await runQuery("SELECT id, name, username, email, phone, bio, school, address, birthdate, social_links, role, level, xp, avatar, cover_image, coins, streak FROM users WHERE id = $1", [userId]);
                const user = userRes?.[0] || {};

                // 2. Progress
                const progress = await runQuery(`
                    SELECT p.*, a.title, a.type, a.difficulty 
                    FROM user_progress p 
                    JOIN activities a ON p.activity_id = a.id 
                    WHERE p.user_id = $1 
                    ORDER BY p.completed_at DESC
                `, [userId]);

                // 3. Certificates
                let certs = await runQuery("SELECT * FROM certificates WHERE user_id = $1 ORDER BY id DESC", [userId]);
                if (!certs.length && user.name) {
                    certs = await runQuery("SELECT * FROM certificates WHERE user_name = $1 ORDER BY id DESC", [user.name]);
                }

                // 4. Portfolios
                const portfolios = await runQuery("SELECT * FROM portfolios WHERE user_id = $1 ORDER BY created_at DESC", [userId]);

                // 5. Teacher Skills
                let skills = [];
                if (user.role === 'teacher' || user.role === 'admin') {
                    skills = await runQuery("SELECT * FROM teacher_skills WHERE user_id = $1", [userId]);
                }

                // 6. Rank
                const allUsers = await runQuery("SELECT id, xp FROM users ORDER BY xp DESC");
                const rank = allUsers ? (allUsers.findIndex(u => String(u.id) === String(userId)) + 1) : 0;

                return res.json({
                    user,
                    total_score: progress?.reduce((sum, p) => sum + (p.score || 0), 0) || 0,
                    completed_count: progress?.filter(p => p.status === 'completed').length || 0,
                    activities: progress || [],
                    certificates: certs || [],
                    portfolios: portfolios || [],
                    skills: skills || [],
                    rank,
                    total_users: allUsers?.length || 0
                });
            }
            // Mock Fallback
            return res.json({ user: MOCK_DB.users[0], activities: [], rank: 1 });
        }

        // --- USER MANAGEMENT ---
        if (pathname === '/api/users') {
            // GET Users
            if (method === 'GET') {
                if (db) {
                    const users = await runQuery("SELECT id, name, username, email, phone, bio, school, address, birthdate, social_links, role, level, xp, avatar FROM users ORDER BY id DESC");
                    return res.json(users || []);
                }
                return res.json(MOCK_DB.users);
            }
            // PUT (Update Profile)
            if (method === 'PUT') {
                const body = req.body;
                if (!db) return res.json({ success: true, message: "Mock Update OK" });
                
                if (body.id) {
                    let fields = [];
                    let values = [];
                    let idx = 1;

                    const cols = ['name', 'email', 'phone', 'bio', 'school', 'address', 'birthdate', 'social_links', 'avatar', 'cover_image', 'role'];
                    cols.forEach(col => {
                        if (body[col] !== undefined) {
                            fields.push(`${col} = $${idx++}`);
                            values.push(body[col]);
                        }
                    });

                    if (fields.length > 0) {
                        values.push(body.id);
                        await runQuery(`UPDATE users SET ${fields.join(", ")} WHERE id = $${idx}`, values);
                        return res.json({ success: true });
                    }
                }
                return res.json({ success: true }); // No fields to update
            }
        }

        // --- SHOP & INVENTORY ---
        if (pathname === '/api/shop') {
            if (db) {
                const items = await runQuery("SELECT * FROM items ORDER BY price ASC");
                return res.json(items || []);
            }
            return res.json(MOCK_DB.items || []);
        }

        if (pathname === '/api/shop/buy' && method === 'POST') {
            const { userId, itemId } = req.body;
            if (!db) return res.json({ success: true, new_balance: 9999 });

            const uRes = await runQuery("SELECT coins FROM users WHERE id = $1", [userId]);
            const iRes = await runQuery("SELECT price FROM items WHERE id = $1", [itemId]);

            if (uRes?.[0] && iRes?.[0]) {
                const coins = uRes[0].coins;
                const price = iRes[0].price;

                if (coins >= price) {
                    await runQuery("UPDATE users SET coins = coins - $1 WHERE id = $2", [price, userId]);
                    await runQuery("INSERT INTO user_items (user_id, item_id, acquired_at) VALUES ($1, $2, $3)", [userId, itemId, new Date().toISOString()]);
                    return res.json({ success: true, new_balance: coins - price });
                }
                return res.status(400).json({ error: "Not enough coins" });
            }
            return res.status(404).json({ error: "User or Item not found" });
        }

        if (pathname === '/api/inventory') {
            const userId = url.searchParams.get("userId");
            if (db && userId) {
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

        // --- CERTIFICATES & PORTFOLIO ---
        if (pathname === '/api/certificate' && method === 'POST') {
            const body = req.body;
            const code = "CERT-" + Math.random().toString(36).substr(2, 9).toUpperCase();
            const date = new Date().toLocaleDateString('th-TH');
            
            if (db) {
                let userId = body.userId;
                if (!userId && body.userName) {
                    const u = await runQuery("SELECT id FROM users WHERE name = $1", [body.userName]);
                    if (u?.[0]) userId = u[0].id;
                }
                await runQuery("INSERT INTO certificates (user_id, user_name, course_title, issue_date, code) VALUES ($1, $2, $3, $4, $5)", 
                    [userId, body.userName, body.courseTitle, date, code]);
            }
            return res.json({ success: true, code, date });
        }

        if (pathname === '/api/portfolios') {
            if (method === 'POST') {
                const body = req.body;
                if(db) await runQuery("INSERT INTO portfolios (user_id, title, description, media_url, type, created_at) VALUES ($1, $2, $3, $4, $5, $6)", 
                    [body.user_id, body.title, body.description, body.media_url, body.type, new Date().toISOString()]);
                return res.json({ success: true });
            }
            if (method === 'DELETE') {
                if(db) await runQuery("DELETE FROM portfolios WHERE id = $1", [url.searchParams.get("id")]);
                return res.json({ success: true });
            }
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

        // --- ACTIVITIES / COURSES (CRUD) ---
        if (pathname === '/api/activities') {
            // GET: List All (Filtered by Instructor optional)
            if (method === 'GET') {
                const instructorId = url.searchParams.get("instructorId");
                let query = `
                    SELECT a.*, 
                    COALESCE(AVG(r.rating), 0) as rating, 
                    COUNT(r.id) as review_count 
                    FROM activities a 
                    LEFT JOIN reviews r ON a.id = r.activity_id 
                `;
                const params = [];
                if (instructorId) {
                    query += " WHERE a.creator_id = $1 ";
                    params.push(instructorId);
                }
                query += " GROUP BY a.id ORDER BY a.id DESC";
                
                if (db) {
                    const rows = await runQuery(query, params);
                    return res.json(rows || []);
                }
                return res.json(MOCK_DB.activities);
            }

            // POST: Create New Course
            if (method === 'POST') {
                const body = req.body;
                if (!db) return res.json({ success: true, id: Date.now(), message: "Mock Create OK" });

                try {
                    const contentJson = JSON.stringify(body.content || []);
                    await runQuery(`
                        INSERT INTO activities (title, type, difficulty, duration, content, category, credits, course_code, creator_id) 
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    `, [
                        body.title || 'Untitled Course', 
                        body.type || 'mixed', 
                        body.difficulty || 'Easy', 
                        body.duration || '1h', 
                        contentJson, 
                        body.category || 'General', 
                        body.credits || 1, 
                        body.course_code || '', 
                        body.creator_id
                    ]);
                    return res.json({ success: true });
                } catch(e) {
                    console.error("Create Course Error:", e);
                    return res.status(500).json({ error: "Database Insert Failed", details: e.message });
                }
            }

            // PUT: Update Course
            if (method === 'PUT') {
                const body = req.body;
                if (!db) return res.json({ success: true, message: "Mock Update OK" });

                try {
                    // Permission Check
                    const existing = await runQuery("SELECT creator_id FROM activities WHERE id = $1", [body.id]);
                    if (!existing?.[0]) return res.status(404).json({ error: "Course not found" });
                    
                    // Allow if Admin or Owner
                    const isOwner = String(existing[0].creator_id) === String(body.requester_id);
                    const isAdmin = body.requester_role === 'admin';
                    
                    if (!isOwner && !isAdmin) {
                        return res.status(403).json({ error: `Permission Denied. Owner: ${existing[0].creator_id}, You: ${body.requester_id}` });
                    }

                    const contentJson = JSON.stringify(body.content || []);
                    await runQuery(`
                        UPDATE activities SET title=$1, type=$2, difficulty=$3, duration=$4, content=$5, category=$6, credits=$7, course_code=$8 
                        WHERE id=$9
                    `, [
                        body.title, 
                        body.type, 
                        body.difficulty, 
                        body.duration, 
                        contentJson, 
                        body.category, 
                        body.credits, 
                        body.course_code,
                        body.id
                    ]);
                    return res.json({ success: true });
                } catch(e) {
                    console.error("Update Course Error:", e);
                    return res.status(500).json({ error: "Database Update Failed", details: e.message });
                }
            }

            // DELETE: Remove Course
            if (method === 'DELETE') {
                const id = url.searchParams.get("id");
                const reqId = url.searchParams.get("requester_id");
                
                if (!db) return res.json({ success: true });

                const existing = await runQuery("SELECT creator_id FROM activities WHERE id = $1", [id]);
                if (!existing?.[0]) return res.status(404).json({ error: "Not found" });

                // Check Owner (Admin check needs role from somewhere, assuming owner for simple delete via param)
                if (String(existing[0].creator_id) !== String(reqId)) {
                     // In real app, we'd fetch user role from DB using reqId to check if admin
                     const u = await runQuery("SELECT role FROM users WHERE id = $1", [reqId]);
                     if (u?.[0]?.role !== 'admin') return res.status(403).json({ error: "Permission Denied" });
                }

                await runQuery("DELETE FROM activities WHERE id = $1", [id]);
                return res.json({ success: true });
            }
        }

        // --- LEADERBOARD (Dual Ranking) ---
        if (pathname === '/api/leaderboard') {
            if (db) {
                // 1. Student Ranking (By XP)
                const students = await runQuery("SELECT id, name, avatar, level, xp, role FROM users WHERE role = 'student' ORDER BY xp DESC LIMIT 10");
                
                // 2. Instructor Ranking (By Course Ratings)
                // Score = AvgRating of all their courses * Log(TotalReviews + 1) -> Simple weighted score
                const instructors = await runQuery(`
                    SELECT u.id, u.name, u.avatar, u.role,
                    COALESCE(AVG(r.rating), 0) as avg_rating,
                    COUNT(r.id) as review_count
                    FROM users u
                    JOIN activities a ON u.id = a.creator_id
                    LEFT JOIN reviews r ON a.id = r.activity_id
                    WHERE u.role IN ('teacher', 'admin')
                    GROUP BY u.id
                    ORDER BY avg_rating DESC, review_count DESC
                    LIMIT 10
                `);

                return res.json({ students: students || [], instructors: instructors || [] });
            }
            return res.json({ students: MOCK_DB.users, instructors: [] });
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
