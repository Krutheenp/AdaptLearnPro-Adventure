import { join } from "path";
import { Database } from "bun:sqlite";
import { config } from "dotenv";
import { Pool } from "pg";

// Load .env
config({ path: join(import.meta.dir, ".env") });

const PORT = 8080;
const BASE_DIR = import.meta.dir;
const DB_MODE = process.env.POSTGRES_URL ? 'POSTGRES' : 'SQLITE';

console.log(`📡 Database Mode: ${DB_MODE}`);

let sqlite: Database;
let pgPool: Pool;

if (DB_MODE === 'POSTGRES') {
    pgPool = new Pool({
        connectionString: process.env.POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });
} else {
    sqlite = new Database(join(BASE_DIR, "production.sqlite"));
    sqlite.run("PRAGMA foreign_keys = ON;");
}

// Helper: Universal Query
async function query(text: string, params: any[] = []) {
    if (DB_MODE === 'POSTGRES') {
        const res = await pgPool.query(text, params);
        return res.rows;
    } else {
        const sql = text.replace(/\$\d+/g, '?');
        return sqlite.query(sql).all(...params);
    }
}

// Universal Exec
async function exec(text: string, params: any[] = []) {
    if (DB_MODE === 'POSTGRES') {
        await pgPool.query(text, params);
    } else {
        const sql = text.replace(/\$\d+/g, '?');
        sqlite.run(sql, params);
    }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;
    const pathname = url.pathname;

    // Helper to get body
    const getBody = async () => {
        try { return await req.json(); } catch(e) { return {}; }
    };

    try {
        // --- SYSTEM ---
        if (pathname === "/api/check-db") return Response.json({ status: "Connected ✅", mode: DB_MODE });

        if (pathname === "/api/init") {
            const schema = [
                `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'student', name TEXT, level INT DEFAULT 1, xp INT DEFAULT 0, coins INT DEFAULT 0, streak INT DEFAULT 0, avatar TEXT DEFAULT '🙂', status TEXT DEFAULT 'active', email TEXT, phone TEXT, bio TEXT, school TEXT, cover_image TEXT, birthdate TEXT)`,
                `CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, title TEXT, type TEXT, difficulty TEXT, duration TEXT, content TEXT, category TEXT DEFAULT 'General', credits INT DEFAULT 1, price INT DEFAULT 0, course_code TEXT, certificate_theme TEXT DEFAULT 'classic', description TEXT, thumbnail TEXT, creator_id INT)`,
                `CREATE TABLE IF NOT EXISTS enrollments (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, enrolled_at TEXT)`,
                `CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique ON enrollments(user_id, activity_id)`,
                `CREATE TABLE IF NOT EXISTS user_progress (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, score INT, status TEXT, completed_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT, price INT, type TEXT, icon TEXT)`,
                `CREATE TABLE IF NOT EXISTS user_items (id SERIAL PRIMARY KEY, user_id INT, item_id INT, acquired_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS certificates (id SERIAL PRIMARY KEY, user_id INT, user_name TEXT, course_title TEXT, issue_date TEXT, code TEXT UNIQUE)`,
                `CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT)`,
                `CREATE TABLE IF NOT EXISTS site_visits (id SERIAL PRIMARY KEY, ip_address TEXT, visit_time TEXT)`,
                `CREATE TABLE IF NOT EXISTS login_history (id SERIAL PRIMARY KEY, user_id INT, login_time TEXT, ip_address TEXT, device_info TEXT)`
            ];
            for (let q of schema) {
                if (DB_MODE === 'SQLITE') q = q.replace('SERIAL PRIMARY KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT').replace('INT', 'INTEGER').replace('CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique ON enrollments(user_id, activity_id)', 'CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique ON enrollments(user_id, activity_id)');
                await exec(q);
            }
            return Response.json({ success: true, status: "Initialized" });
        }

        if (pathname === "/api/seed") {
            await exec(`INSERT INTO users (username, password, role, name, level, xp, coins, avatar) VALUES ('admin', 'password123', 'admin', 'Super Admin', 99, 99999, 99999, '👑') ON CONFLICT (username) DO NOTHING`);
            const items = [
                ['Streak Freeze', 50, '🧊', 'consumable', 'Keep your streak alive'],
                ['Golden Frame', 500, '🖼️', 'cosmetic', 'Show off your wealth'],
                ['XP Booster', 150, '⚡', 'consumable', 'Double XP for 1 hour'],
                ['Mystery Box', 100, '🎁', 'box', 'Get a random item']
            ];
            for (const item of items) {
                await exec(`INSERT INTO items (name, price, icon, type, description) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO NOTHING`, item);
            }
            return Response.json({ success: true, message: "Seeded" });
        }

        if (pathname === "/api/stats") {
            const u = await query("SELECT COUNT(*) as count FROM users");
            const a = await query("SELECT COUNT(*) as count FROM activities");
            const c = await query("SELECT COUNT(*) as count FROM certificates");
            const v = await query("SELECT COUNT(*) as count FROM site_visits");
            return Response.json({ users: u[0].count, activities: a[0].count, certificates: c[0].count, visits: v[0].count });
        }

        // --- AUTH ---
        if (pathname === "/api/login" && method === "POST") {
            const { username, password } = await getBody();
            const rows = await query("SELECT * FROM users WHERE username = $1 AND password = $2", [username, password]);
            if (rows.length > 0) {
                const user = rows[0];
                const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
                const ua = req.headers.get('user-agent') || 'unknown';
                await exec("INSERT INTO login_history (user_id, login_time, ip_address, device_info) VALUES ($1, $2, $3, $4)", [user.id, new Date().toISOString(), ip, ua]);
                return Response.json({ success: true, ...user });
            }
            return Response.json({ success: false, message: "Invalid credentials" }, { status: 401 });
        }

        if (pathname === "/api/register" && method === "POST") {
            const { username, password, name, email, phone, school } = await getBody();
            await exec("INSERT INTO users (username, password, name, email, phone, school) VALUES ($1, $2, $3, $4, $5, $6)", [username, password, name, email, phone, school]);
            return Response.json({ success: true });
        }

        // --- USERS ---
        if (pathname === "/api/users") {
            if (method === "GET") {
                const id = url.searchParams.get("id");
                if (id) {
                    const rows = await query("SELECT * FROM users WHERE id = $1", [id]);
                    return Response.json(rows[0] || {});
                }
                return Response.json(await query("SELECT * FROM users ORDER BY id DESC"));
            }
            if (method === "PUT") {
                const b = await getBody();
                const fields = []; const vals = []; let i = 1;
                const allowed = ['name','role','level','xp','coins','status','password','avatar','email','phone','school','bio','cover_image','birthdate'];
                allowed.forEach(f => { if(b[f] !== undefined) { fields.push(`${f} = $${i++}`); vals.push(b[f]); } });
                if (fields.length > 0) {
                    vals.push(b.id);
                    await exec(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`, vals);
                }
                return Response.json({ success: true });
            }
            if (method === "DELETE") {
                await exec("DELETE FROM users WHERE id = $1", [url.searchParams.get("id")]);
                return Response.json({ success: true });
            }
        }

        if (pathname === "/api/analytics") {
            const userId = url.searchParams.get("userId");
            if (!userId) return Response.json({ error: "userId required" }, { status: 400 });
            const userRows = await query("SELECT * FROM users WHERE id = $1", [userId]);
            if (userRows.length === 0) return Response.json({ user: null });
            const progress = await query("SELECT p.*, a.title FROM user_progress p JOIN activities a ON p.activity_id = a.id WHERE p.user_id = $1", [userId]);
            const certs = await query("SELECT * FROM certificates WHERE user_id = $1", [userId]);
            const rankRes = await query("SELECT COUNT(*) as rank FROM users WHERE xp > (SELECT xp FROM users WHERE id = $1)", [userId]);
            const rank = (rankRes[0]?.rank || 0) + 1;
            return Response.json({ user: userRows[0], activities: progress, certificates: certs, rank });
        }

        if (pathname === "/api/leaderboard") {
            const students = await query("SELECT id, name, avatar, role, xp FROM users WHERE role != 'teacher' AND role != 'admin' ORDER BY xp DESC LIMIT 20");
            const instructors = await query("SELECT id, name, avatar, role, 5.0 as avg_rating FROM users WHERE role = 'teacher' OR role = 'admin' ORDER BY id ASC LIMIT 20");
            return Response.json({ students, instructors });
        }

        // --- ACTIVITIES ---
        if (pathname === "/api/activities") {
            if (method === "GET") {
                const studentId = url.searchParams.get("studentId") || "0";
                const instructorId = url.searchParams.get("instructorId");
                const id = url.searchParams.get("id");
                if (id) {
                    const rows = await query("SELECT * FROM activities WHERE id = $1", [id]);
                    return Response.json(rows[0] || {});
                }
                let q = `SELECT a.*, COALESCE(e.id, 0) as is_enrolled FROM activities a LEFT JOIN enrollments e ON a.id = e.activity_id AND e.user_id = $1`;
                const params: any[] = [studentId];
                if (instructorId && instructorId !== 'debug') { q += " WHERE a.creator_id = $2"; params.push(instructorId); }
                return Response.json(await query(q + " ORDER BY a.id DESC", params));
            }
            if (method === "POST") {
                const b = await getBody();
                const content = typeof b.content === 'object' ? JSON.stringify(b.content) : b.content;
                await exec("INSERT INTO activities (title, type, content, category, credits, price, creator_id) VALUES ($1, $2, $3, $4, $5, $6, $7)", 
                    [b.title, b.type, content, b.category, b.credits, b.price, b.creator_id]);
                return Response.json({ success: true });
            }
            if (method === "PUT") {
                const b = await getBody();
                const content = typeof b.content === 'object' ? JSON.stringify(b.content) : b.content;
                await exec("UPDATE activities SET title=$1, type=$2, content=$3, category=$4, credits=$5, price=$6 WHERE id=$7",
                    [b.title, b.type, content, b.category, b.credits, b.price, b.id]);
                return Response.json({ success: true });
            }
        }

        if (pathname === "/api/enroll" && method === "POST") {
            const { userId, activityId } = await getBody();
            const act = await query("SELECT price FROM activities WHERE id = $1", [activityId]);
            if (act[0]?.price > 0) {
                const user = await query("SELECT coins FROM users WHERE id = $1", [userId]);
                if (user[0]?.coins < act[0].price) return Response.json({ error: "Insufficient coins" }, { status: 400 });
                await exec("UPDATE users SET coins = coins - $1 WHERE id = $2", [act[0].price, userId]);
            }
            await exec("INSERT INTO enrollments (user_id, activity_id, enrolled_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [userId, activityId, new Date().toISOString()]);
            return Response.json({ success: true });
        }

        // --- SHOP ---
        if (pathname === "/api/shop") {
            if (method === "GET") return Response.json(await query("SELECT * FROM items ORDER BY price ASC"));
            if (method === "POST") {
                const b = await getBody();
                await exec("INSERT INTO items (name, price, icon, type, description) VALUES ($1, $2, $3, $4, $5)", [b.name, b.price, b.icon, b.type, b.description]);
                return Response.json({ success: true });
            }
            if (method === "DELETE") {
                await exec("DELETE FROM items WHERE id = $1", [url.searchParams.get("id")]);
                return Response.json({ success: true });
            }
        }

        if (pathname === "/api/shop/buy" && method === "POST") {
            const { userId, itemId } = await getBody();
            const item = await query("SELECT * FROM items WHERE id = $1", [itemId]);
            const user = await query("SELECT coins FROM users WHERE id = $1", [userId]);
            if (user[0]?.coins < item[0]?.price) return Response.json({ error: "Insufficient coins" }, { status: 400 });
            await exec("UPDATE users SET coins = coins - $1 WHERE id = $2", [item[0].price, userId]);
            await exec("INSERT INTO user_items (user_id, item_id, acquired_at) VALUES ($1, $2, $3)", [userId, itemId, new Date().toISOString()]);
            return Response.json({ success: true });
        }

        if (pathname === "/api/inventory") {
            const userId = url.searchParams.get("userId");
            return Response.json(await query("SELECT i.* FROM items i JOIN user_items ui ON i.id = ui.item_id WHERE ui.user_id = $1", [userId]));
        }

        // --- CERTS & CONFIG ---
        if (pathname === "/api/certificate") {
            if (method === "GET") return Response.json(await query("SELECT * FROM certificates ORDER BY id DESC"));
            if (method === "POST") {
                const { userId, userName, courseTitle } = await getBody();
                const code = 'CERT-' + Math.random().toString(36).substr(2, 9).toUpperCase();
                await exec("INSERT INTO certificates (user_id, user_name, course_title, issue_date, code) VALUES ($1, $2, $3, $4, $5)", [userId, userName, courseTitle, new Date().toISOString(), code]);
                return Response.json({ success: true, code });
            }
        }

        if (pathname === "/api/config") {
            if (method === "GET") {
                const rows = await query("SELECT * FROM system_config");
                const cf = {}; rows.forEach(r => { try { cf[r.key] = JSON.parse(r.value); } catch(e) { cf[r.key] = r.value; } });
                return Response.json(cf);
            }
            const { key, value } = await getBody();
            await exec("INSERT INTO system_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2", [key, JSON.stringify(value)]);
            return Response.json({ success: true });
        }

        if (pathname === "/api/visit") {
            await exec("INSERT INTO site_visits (ip_address, visit_time) VALUES ($1, $2)", [req.headers.get('x-forwarded-for') || '127.0.0.1', new Date().toISOString()]);
            const rows = await query("SELECT COUNT(*) as count FROM site_visits");
            return Response.json({ total_visits: rows[0]?.count || 0 });
        }

        if (pathname === "/api/history") {
            const userId = url.searchParams.get("userId");
            return Response.json(await query("SELECT * FROM login_history WHERE user_id = $1 ORDER BY id DESC LIMIT 20", [userId]));
        }

    } catch (e: any) {
        console.error("API ERROR:", e);
        return Response.json({ error: e.message }, { status: 500 });
    }

    // --- STATIC FILES ---
    let path = pathname;
    if (path === "/") path = "/index.html";
    const publicFile = Bun.file(join(BASE_DIR, "public", path));
    if (await publicFile.exists()) return new Response(publicFile);
    
    return new Response("Not Found", { status: 404 });
  }
});

console.log(`\n🚀 LMS Local Server Running at http://localhost:${PORT}`);