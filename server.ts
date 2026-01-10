import { join } from "path";
import { Database } from "bun:sqlite";
import { config } from "dotenv";

// Load .env from the same directory as this script
config({ path: join(import.meta.dir, ".env") });

const PORT = 8080;
const BASE_DIR = import.meta.dir;
const UPLOAD_DIR = join(BASE_DIR, "uploads");
const DB_PATH = join(BASE_DIR, "production.sqlite");

const db = new Database(DB_PATH);
// Enable Foreign Keys for SQLite
db.run("PRAGMA foreign_keys = ON;");

// --- 1. USERS & AUTH ---
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    username TEXT UNIQUE NOT NULL, 
    password TEXT NOT NULL, 
    role TEXT DEFAULT 'student', 
    name TEXT, 
    email TEXT,
    phone TEXT,
    bio TEXT,
    school TEXT,
    level INTEGER DEFAULT 1, 
    xp INTEGER DEFAULT 0, 
    avatar TEXT,
    cover_image TEXT,
    address TEXT,
    birthdate TEXT,
    social_links TEXT,
    coins INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    last_login TEXT
);
`);
db.run("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);");

// Migrations for existing DB (ensure columns exist)
const userCols = ['email', 'phone', 'bio', 'school', 'address', 'birthdate', 'social_links', 'cover_image', 'coins', 'streak', 'last_login'];
userCols.forEach(col => { try { db.run(`ALTER TABLE users ADD COLUMN ${col} TEXT;`); } catch(e) {} });

// --- 2. LEARNING CONTENT ---
db.run(`CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    title TEXT, 
    type TEXT, 
    difficulty TEXT, 
    duration TEXT, 
    content TEXT, 
    category TEXT DEFAULT 'General', 
    credits INTEGER DEFAULT 1, 
    course_code TEXT,
    creator_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);
`);
db.run("CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(category);");
db.run("CREATE INDEX IF NOT EXISTS idx_activities_creator ON activities(creator_id);");

try { db.run("ALTER TABLE activities ADD COLUMN category TEXT DEFAULT 'General';"); } catch(e) {}
try { db.run("ALTER TABLE activities ADD COLUMN credits INTEGER DEFAULT 1;"); } catch(e) {}
try { db.run("ALTER TABLE activities ADD COLUMN course_code TEXT;"); } catch(e) {}
try { db.run("ALTER TABLE activities ADD COLUMN creator_id INTEGER DEFAULT 1;"); } catch(e) {}

// --- 3. PROGRESS & REVIEWS ---
db.run(`CREATE TABLE IF NOT EXISTS user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    status TEXT, -- 'completed', 'failed'
    completed_at TEXT
);
`);
db.run("CREATE INDEX IF NOT EXISTS idx_progress_user ON user_progress(user_id);");
db.run("CREATE INDEX IF NOT EXISTS idx_progress_activity ON user_progress(activity_id);");

db.run(`CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
    rating INTEGER,
    comment TEXT,
    created_at TEXT
);
`);
db.run("CREATE INDEX IF NOT EXISTS idx_reviews_activity ON reviews(activity_id);");

// --- 4. SHOP & INVENTORY ---
db.run(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    price INTEGER,
    type TEXT,
    icon TEXT
);
`);

db.run(`CREATE TABLE IF NOT EXISTS user_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
    acquired_at TEXT
);
`);
db.run("CREATE INDEX IF NOT EXISTS idx_user_items_user ON user_items(user_id);");

// --- 5. SOCIAL & PROFILE ---
db.run(`CREATE TABLE IF NOT EXISTS portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title TEXT,
    description TEXT,
    media_url TEXT,
    type TEXT, -- 'project', 'research', 'artwork', 'other'
    created_at TEXT
);
`);

db.run(`CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, 
    user_name TEXT, 
    course_title TEXT, 
    issue_date TEXT, 
    code TEXT
);
`);

db.run(`CREATE TABLE IF NOT EXISTS teacher_skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    skill_name TEXT,
    proficiency INTEGER -- 1-100 or 1-5
);
`);

// --- 6. ANALYTICS ---
db.run(`CREATE TABLE IF NOT EXISTS site_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT,
    user_agent TEXT,
    visit_time TEXT
);
`);

db.run(`CREATE TABLE IF NOT EXISTS login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    login_time TEXT,
    ip_address TEXT,
    device_info TEXT
);
`);
db.run("CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id);");

// Categorize Demo Data (Migration)
db.run("UPDATE activities SET category = 'Mathematics', credits = 3 WHERE title LIKE '%คณิต%' OR title LIKE '%Math%' OR title LIKE '%สมการ%'");
db.run("UPDATE activities SET category = 'Science', credits = 3 WHERE title LIKE '%วิทย์%' OR title LIKE '%Science%' OR title LIKE '%ระบบสุริยะ%'");
db.run("UPDATE activities SET category = 'English', credits = 2 WHERE title LIKE '%อังกฤษ%' OR title LIKE '%English%' OR title LIKE '%Grammar%'");
db.run("UPDATE activities SET category = 'Technology', credits = 4 WHERE title LIKE '%Python%' OR title LIKE '%Progr%' OR title LIKE '%Com%'");

// Seed Items if empty


// Default Admin
if (!db.query("SELECT * FROM users WHERE role = 'admin'").get()) {
    db.run("INSERT INTO users (username, password, role, name, level, xp, avatar) VALUES (?, ?, ?, ?, ?, ?, ?)", ["admin", "password123", "admin", "Super Admin", 99, 99999, "👑"]);
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;

    // --- API: VISITOR STATS & HISTORY (New) ---

    // 1. Visitor Counter (Index Page)
    if (url.pathname === "/api/visit" && method === "GET") {
        const ip = server.requestIP(req)?.address || "unknown";
        const ua = req.headers.get("User-Agent") || "";
        const now = new Date().toISOString();

        db.run("INSERT INTO site_visits (ip_address, user_agent, visit_time) VALUES (?, ?, ?)", [ip, ua, now]);
        
        const count = db.query("SELECT COUNT(*) as total FROM site_visits").get().total;
        return Response.json({ total_visits: count });
    }

    // 2. User Login History
    if (url.pathname === "/api/history" && method === "GET") {
        const userId = url.searchParams.get("userId");
        if (!userId) return Response.json([]);
        
        const history = db.query("SELECT * FROM login_history WHERE user_id = ? ORDER BY login_time DESC LIMIT 20").all(userId);
        return Response.json(history);
    }

    // --- API: SHOP & LEADERBOARD (New) ---
    if (url.pathname === "/api/shop") {
        if (method === "GET") {
            return Response.json(db.query("SELECT * FROM items ORDER BY price ASC").all());
        }
    }

    if (url.pathname === "/api/shop/buy" && method === "POST") {
        const body = await req.json();
        const { userId, itemId } = body;
        
        const user = db.query("SELECT coins FROM users WHERE id = ?").get(userId);
        const item = db.query("SELECT price FROM items WHERE id = ?").get(itemId);

        if (user && item) {
            if (user.coins >= item.price) {
                db.run("UPDATE users SET coins = coins - ? WHERE id = ?", [item.price, userId]);
                db.run("INSERT INTO user_items (user_id, item_id, acquired_at) VALUES (?, ?, ?)", [userId, itemId, new Date().toISOString()]);
                return Response.json({ success: true, new_balance: user.coins - item.price });
            } else {
                return Response.json({ error: "Not enough coins" }, { status: 400 });
            }
        }
        return Response.json({ error: "User or Item not found" }, { status: 404 });
    }

    if (url.pathname === "/api/inventory" && method === "GET") {
        const userId = url.searchParams.get("userId");
        const items = db.query(`
            SELECT i.*, ui.acquired_at 
            FROM user_items ui 
            JOIN items i ON ui.item_id = i.id 
            WHERE ui.user_id = ? 
            ORDER BY ui.acquired_at DESC
        `).all(userId);
        return Response.json(items);
    }

    if (url.pathname === "/api/leaderboard" && method === "GET") {
        const leaders = db.query("SELECT id, name, avatar, level, xp FROM users ORDER BY xp DESC LIMIT 10").all();
        return Response.json(leaders);
    }

    // --- API: PROGRESS & ANALYTICS (New) ---
    
    // Save Progress (เมื่อเรียนจบ/สอบเสร็จ)
    if (url.pathname === "/api/progress" && method === "POST") {
        const body = await req.json();
        const date = new Date().toISOString();
        const userId = body.userId || 1; // Use provided userId or default to 1
        
        // Update or Insert progress
        const existing = db.query("SELECT * FROM user_progress WHERE user_id = ? AND activity_id = ?").get(userId, body.activityId);
        
        if (existing) {
            // Keep the highest score
            if (body.score > existing.score) {
                db.run("UPDATE user_progress SET score = ?, status = ?, completed_at = ? WHERE id = ?", [body.score, body.status, date, existing.id]);
            }
        } else {
            db.run("INSERT INTO user_progress (user_id, activity_id, score, status, completed_at) VALUES (?, ?, ?, ?, ?)", 
                [userId, body.activityId, body.score, body.status, date]);
        }
        
        // Add XP to User
        if (body.status === 'completed') {
            db.run("UPDATE users SET xp = xp + ?, level = level + 1 WHERE id = ?", [50, userId]); // Simple Level up logic
        }

        return Response.json({ success: true });
    }

    // Get Analytics Report (สำหรับหน้า Progress และ Dashboard)
    if (url.pathname === "/api/analytics" && method === "GET") {
        const userId = url.searchParams.get("userId");
        if (!userId) return Response.json({ error: "Missing User ID" }, { status: 400 });

        // Fetch latest user profile data
        const user = db.query("SELECT id, name, username, email, phone, bio, school, address, birthdate, social_links, role, level, xp, avatar, cover_image, coins, streak FROM users WHERE id = ?").get(userId);

        const progress = db.query(`
            SELECT p.*, a.title, a.type, a.difficulty 
            FROM user_progress p 
            JOIN activities a ON p.activity_id = a.id 
            WHERE p.user_id = ? 
            ORDER BY p.completed_at DESC
        `).all(userId);

        // Fetch Certificates (by user_id preferred, fallback to name)
        let certificates = db.query("SELECT * FROM certificates WHERE user_id = ? ORDER BY id DESC").all(userId);
        if (certificates.length === 0) {
             certificates = db.query("SELECT * FROM certificates WHERE user_name = ? ORDER BY id DESC").all(user.name);
        }

        // Fetch Portfolio
        const portfolios = db.query("SELECT * FROM portfolios WHERE user_id = ? ORDER BY created_at DESC").all(userId);

        // Fetch Skills (if teacher)
        let skills = [];
        if (user.role === 'teacher' || user.role === 'admin') {
            skills = db.query("SELECT * FROM teacher_skills WHERE user_id = ?").all(userId);
        }

        // Rank Calculation
        const allUsers = db.query("SELECT id, xp FROM users ORDER BY xp DESC").all();
        const rank = allUsers.findIndex(u => u.id == userId) + 1;

        const stats = {
            user: user || {}, // Return fresh user data
            total_score: progress.reduce((sum, p) => sum + (p.score || 0), 0),
            completed_count: progress.filter(p => p.status === 'completed').length,
            activities: progress,
            certificates: certificates,
            portfolios: portfolios,
            skills: skills,
            rank: rank,
            total_users: allUsers.length
        };
        
        return Response.json(stats);
    }

    // --- API: AI TUTOR (Gemini) ---
    if (url.pathname === "/api/chat" && method === "POST") {
        const body = await req.json();
        const userMessage = body.message;
        const history = body.history || []; 
        const user = body.userContext || {};
        const progress = body.learningContext || { activities: [] };

        const apiKey = process.env.GEMINI_API_KEY; 
        
        if (!apiKey) {
            // Simulation Mode
            return Response.json({ 
                success: true, 
                reply: "ระบบจำลอง: กรุณาใส่ API Key เพื่อใช้งาน AI จริง (Simulation Mode)",
                isSimulated: true
            });
        }

        try {
            // Build Contextual System Instruction
            let contextPrompt = `You are an intelligent AI Tutor for a student named "${user.name || 'Student'}". `;
            contextPrompt += `User Role: ${user.role}. Level: ${user.level}. XP: ${user.xp}. `;
            
            if (progress.activities && progress.activities.length > 0) {
                const completed = progress.activities.filter(a => a.status === 'completed').map(a => a.title).join(", ");
                const failed = progress.activities.filter(a => a.status === 'failed').map(a => a.title).join(", ");
                contextPrompt += `Learning History - Completed: [${completed}]. Needs Improvement: [${failed}]. `;
            } else {
                contextPrompt += `The user has not started any courses yet. Encourage them to start. `;
            }
            
            contextPrompt += `Answer in Thai. Be encouraging, concise, and helpful. Use the context provided to give personalized advice.`;

            // Call Gemini API
            const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [
                        { role: "user", parts: [{ text: contextPrompt }] }, // System instruction as first user message for context
                        ...history,
                        { role: "user", parts: [{ text: userMessage }] }
                    ]
                })
            });
            const data = await apiRes.json();
            
            if (data.error) throw new Error(data.error.message);
            
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "ขออภัย หนูไม่เข้าใจคำถามค่ะ";
            return Response.json({ success: true, reply: reply });

        } catch (e) {
            return Response.json({ success: false, error: e.message });
        }
    }

    // --- EXISTING APIs ---
    if (url.pathname === "/api/register" && method === "POST") {
        try {
            const body = await req.json();
            if (!body.username || !body.password || !body.name || !body.email) {
                return Response.json({ success: false, message: "Missing fields" }, { status: 400 });
            }
            db.run("INSERT INTO users (username, password, name, email, phone, school, role, level, xp, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", 
                [body.username, body.password, body.name, body.email, body.phone, body.school, 'student', 1, 0, '🙂']);
            return Response.json({ success: true });
        } catch (e) {
            return Response.json({ success: false, message: "Username or Email already exists" }, { status: 400 });
        }
    }

    if (url.pathname === "/api/login" && method === "POST") {
        const body = await req.json();
        const user = db.query("SELECT * FROM users WHERE username = ? AND password = ?").get(body.username, body.password);
        
        if (user) {
            // Gamification: Streak Logic
            const today = new Date().toISOString().split('T')[0];
            const lastLogin = user.last_login ? user.last_login.split('T')[0] : null;
            
            let newStreak = user.streak;
            let streakBonus = 0;

            if (lastLogin !== today) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];

                if (lastLogin === yesterdayStr) {
                    newStreak++;
                } else {
                    newStreak = 1; // Reset if broken (unless we implement streak freeze later)
                }
                
                // Login Bonus
                streakBonus = 10 + (newStreak * 5); // 10 coins base + 5 per streak day
                db.run("UPDATE users SET last_login = ?, streak = ?, coins = coins + ? WHERE id = ?", [new Date().toISOString(), newStreak, streakBonus, user.id]);
                user.streak = newStreak;
                user.coins = (user.coins || 0) + streakBonus;
            }

            // Log Login History
            const ip = server.requestIP(req)?.address || "unknown";
            const ua = req.headers.get("User-Agent") || "unknown";
            db.run("INSERT INTO login_history (user_id, login_time, ip_address, device_info) VALUES (?, ?, ?, ?)", 
                [user.id, new Date().toISOString(), ip, ua]);

            return Response.json({ 
                success: true, 
                id: user.id, 
                role: user.role, 
                name: user.name, 
                level: user.level, 
                xp: user.xp,
                coins: user.coins,
                streak: user.streak,
                login_bonus: streakBonus
            });
        }
        return Response.json({ success: false, message: "Invalid credentials" }, { status: 401 });
    }

    if (url.pathname === "/api/upload" && method === "POST") {
        const formdata = await req.formData();
        const file = formdata.get('file');
        if (!file) return Response.json({ success: false, error: "No file" });
        const fileName = `${Date.now()}_${file.name}`;
        await Bun.write(join(UPLOAD_DIR, fileName), file);
        return Response.json({ success: true, url: `/uploads/${fileName}`, name: file.name });
    }

    if (url.pathname === "/api/users") {
        if (method === "GET") return Response.json(db.query("SELECT id, name, username, email, phone, bio, school, address, birthdate, social_links, role, level, xp, avatar FROM users ORDER BY id DESC").all());
        if (method === "POST") {
            const body = await req.json();
            // Use provided credentials or generate defaults
            const username = body.username || "user" + Date.now();
            const password = body.password || "password123";
            
            try {
                db.run("INSERT INTO users (username, password, name, role, email, phone, school, level, xp, avatar, cover_image, address, bio, social_links, birthdate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", 
                    [username, password, body.name, body.role || 'student', body.email || '', body.phone || '', body.school || '', 1, 0, '🙂', '', body.address || '', body.bio || '', body.social_links || '', body.birthdate || '']);
                return Response.json({ success: true, username: username, password: password });
            } catch (e) {
                return Response.json({ success: false, message: "Username already exists" }, { status: 400 });
            }
        }
        if (method === "PUT") {
            const body = await req.json();
            // Check if it's a profile update (has id) or admin edit
            if (body.id) {
                // Construct Update Query dynamically based on fields provided
                let updateFields = [];
                let params = [];
                
                if (body.name) { updateFields.push("name = ?"); params.push(body.name); }
                if (body.email) { updateFields.push("email = ?"); params.push(body.email); }
                if (body.phone) { updateFields.push("phone = ?"); params.push(body.phone); }
                if (body.bio) { updateFields.push("bio = ?"); params.push(body.bio); }
                if (body.school) { updateFields.push("school = ?"); params.push(body.school); }
                if (body.address) { updateFields.push("address = ?"); params.push(body.address); }
                if (body.birthdate) { updateFields.push("birthdate = ?"); params.push(body.birthdate); }
                if (body.social_links) { updateFields.push("social_links = ?"); params.push(body.social_links); }
                if (body.avatar) { updateFields.push("avatar = ?"); params.push(body.avatar); }
                if (body.cover_image) { updateFields.push("cover_image = ?"); params.push(body.cover_image); }
                if (body.role) { updateFields.push("role = ?"); params.push(body.role); }
                
                // Allow Username/Password update (Admin or Self)
                if (body.username) { updateFields.push("username = ?"); params.push(body.username); }
                if (body.password) { updateFields.push("password = ?"); params.push(body.password); }

                if (updateFields.length > 0) {
                    params.push(body.id);
                    db.run(`UPDATE users SET ${updateFields.join(", ")} WHERE id = ?`, params);
                }
            }
            return Response.json({ success: true });
        }
        if (method === "DELETE") {
            db.run("DELETE FROM users WHERE id = ?", [url.searchParams.get("id")]);
            return Response.json({ success: true });
        }
    }

    // --- NEW: PORTFOLIO API ---
    if (url.pathname === "/api/portfolios") {
        if (method === "POST") {
            const body = await req.json();
            const created = new Date().toISOString();
            db.run("INSERT INTO portfolios (user_id, title, description, media_url, type, created_at) VALUES (?, ?, ?, ?, ?, ?)", 
                [body.user_id, body.title, body.description, body.media_url, body.type, created]);
            return Response.json({ success: true });
        }
        if (method === "DELETE") {
            db.run("DELETE FROM portfolios WHERE id = ?", [url.searchParams.get("id")]);
            return Response.json({ success: true });
        }
    }

    // --- NEW: SKILLS API ---
    if (url.pathname === "/api/skills") {
        if (method === "POST") {
            const body = await req.json();
            db.run("INSERT INTO teacher_skills (user_id, skill_name, proficiency) VALUES (?, ?, ?)", 
                [body.user_id, body.skill_name, body.proficiency]);
            return Response.json({ success: true });
        }
        if (method === "DELETE") {
            db.run("DELETE FROM teacher_skills WHERE id = ?", [url.searchParams.get("id")]);
            return Response.json({ success: true });
        }
    }

    // --- API: REVIEWS ---
    if (url.pathname === "/api/reviews" && method === "POST") {
        const body = await req.json();
        const date = new Date().toISOString();
        db.run("INSERT INTO reviews (user_id, activity_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)", 
            [body.user_id, body.activity_id, body.rating, body.comment, date]);
        return Response.json({ success: true });
    }

    if (url.pathname === "/api/activities") {
        if (method === "GET") {
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
                query += " WHERE a.creator_id = ? ";
                params.push(instructorId);
            }
            
            query += " GROUP BY a.id ORDER BY a.id DESC";
            
            return Response.json(db.query(query).all(...params));
        }
        if (method === "POST") {
            const body = await req.json();
            db.run("INSERT INTO activities (title, type, difficulty, duration, content, category, course_code, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
                [body.title, body.type, body.difficulty, body.duration, JSON.stringify(body.content || []), body.category || 'General', body.course_code || '', body.creator_id || 1]);
            return Response.json({ success: true });
        }
        if (method === "PUT") {
            const body = await req.json();
            
            // Server-side Permission Check
            const activity = db.query("SELECT creator_id FROM activities WHERE id = ?").get(body.id);
            if (!activity) return Response.json({ error: "Activity not found" }, { status: 404 });

            // Allow if Admin OR Creator
            if (body.requester_role !== 'admin' && String(activity.creator_id) !== String(body.requester_id)) {
                return Response.json({ error: "Permission Denied" }, { status: 403 });
            }

            db.run("UPDATE activities SET title = ?, type = ?, difficulty = ?, duration = ?, content = ?, category = ?, course_code = ? WHERE id = ?", 
                [body.title, body.type, body.difficulty, body.duration, JSON.stringify(body.content || []), body.category || 'General', body.course_code || '', body.id]);
            return Response.json({ success: true });
        }
        if (method === "DELETE") {
            const id = url.searchParams.get("id");
            const reqId = url.searchParams.get("requester_id");
            const reqRole = url.searchParams.get("requester_role");

            const activity = db.query("SELECT creator_id FROM activities WHERE id = ?").get(id);
            if (!activity) return Response.json({ error: "Activity not found" }, { status: 404 });

            if (reqRole !== 'admin' && String(activity.creator_id) !== String(reqId)) {
                return Response.json({ error: "Permission Denied" }, { status: 403 });
            }

            db.run("DELETE FROM activities WHERE id = ?", [id]);
            return Response.json({ success: true });
        }
    }

    if (url.pathname === "/api/certificate" && method === "POST") {
        const body = await req.json();
        const code = "CERT-" + Math.random().toString(36).substr(2, 9).toUpperCase();
        const date = new Date().toLocaleDateString('th-TH');
        
        // Find user_id if not provided
        let userId = body.userId;
        if (!userId && body.userName) {
            const user = db.query("SELECT id FROM users WHERE name = ?").get(body.userName);
            if (user) userId = user.id;
        }

        db.run("INSERT INTO certificates (user_id, user_name, course_title, issue_date, code) VALUES (?, ?, ?, ?, ?)", 
            [userId, body.userName, body.courseTitle, date, code]);
        return Response.json({ success: true, code: code, date: date });
    }

    let path = url.pathname;
    
    // Serve Uploads
    if (path.startsWith("/uploads/")) {
        const file = Bun.file(join(BASE_DIR, path));
        return (await file.exists()) ? new Response(file) : new Response("Not Found", { status: 404 });
    }

    // Serve Static Files from 'public'
    if (path === "/") path = "/index.html";
    if (path === "/admin") path = "/admin.html";
    if (path === "/login") path = "/login.html";
    if (path === "/register") path = "/register.html";
    if (path === "/profile") path = "/profile.html";

    const publicFile = Bun.file(join(BASE_DIR, "public", path));
    if (await publicFile.exists()) return new Response(publicFile);
    
    // Fallback to root (for backward compatibility if any)
    const rootFile = Bun.file(join(BASE_DIR, path));
    return (await rootFile.exists()) ? new Response(rootFile) : new Response("Not Found", { status: 404 });
  },
});

console.log(`\n🚀 LMS Server Running at http://localhost:${PORT}`);