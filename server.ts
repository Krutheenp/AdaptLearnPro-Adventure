import { join } from "path";
import { config } from "dotenv";
import { Pool } from "pg";

// Load environment variables
config({ path: join(import.meta.dir, ".env") });

const PORT = 8080;
const BASE_DIR = import.meta.dir;

// Database Connection
const pgPool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
});

async function query(text: string, params: any[] = []) {
    const res = await pgPool.query(text, params);
    return res.rows;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;
    const pathname = url.pathname;

    // Helper: Parse JSON Body
    let body: any = {};
    if (method === "POST" || method === "PUT") {
        try { body = await req.json(); } catch (e) { body = {}; }
    }

    try {
        // --- API ROUTES (Mirrored from api/index.js) ---
        if (pathname === "/api/check-db") return Response.json({ status: "Connected ✅", mode: "LOCAL-POSTGRES" });

        if (pathname === "/api/init") {
            const schema = [
                `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'student', name TEXT, level INT DEFAULT 1, xp INT DEFAULT 0, coins INT DEFAULT 0, streak INT DEFAULT 0, avatar TEXT DEFAULT '🙂', status TEXT DEFAULT 'active', email TEXT, phone TEXT, bio TEXT, school TEXT, cover_image TEXT, birthdate TEXT)`,
                `CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, title TEXT UNIQUE NOT NULL, type TEXT, difficulty TEXT DEFAULT 'Medium', duration TEXT DEFAULT '30m', content TEXT, category TEXT DEFAULT 'General', credits INT DEFAULT 100, price INT DEFAULT 0, creator_id INT, certificate_theme TEXT DEFAULT 'classic')`,
                `CREATE TABLE IF NOT EXISTS enrollments (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, enrolled_at TEXT)`,
                `CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique ON enrollments(user_id, activity_id)`,
                `CREATE TABLE IF NOT EXISTS user_progress (id SERIAL PRIMARY KEY, user_id INT, activity_id INT, score INT, status TEXT, completed_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT, price INT DEFAULT 0, type TEXT, icon TEXT)`,
                `CREATE TABLE IF NOT EXISTS user_items (id SERIAL PRIMARY KEY, user_id INT, item_id INT, acquired_at TEXT)`,
                `CREATE TABLE IF NOT EXISTS certificates (id SERIAL PRIMARY KEY, user_id INT, user_name TEXT, course_title TEXT, issue_date TEXT, code TEXT UNIQUE)`,
                `CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT)`,
                `CREATE TABLE IF NOT EXISTS site_visits (id SERIAL PRIMARY KEY, ip_address TEXT, visit_time TEXT)`,
                `CREATE TABLE IF NOT EXISTS login_history (id SERIAL PRIMARY KEY, user_id INT, login_time TEXT, ip_address TEXT, device_info TEXT)`
            ];
            for (const q of schema) await pgPool.query(q);
            return Response.json({ success: true });
        }

        if (pathname === "/api/seed") {
            await pgPool.query(`INSERT INTO users (username, password, role, name, level, xp, coins, avatar) VALUES ('admin', 'password123', 'admin', 'Super Admin', 99, 99999, 99999, '👑') ON CONFLICT (username) DO NOTHING`);
            return Response.json({ success: true });
        }

        if (pathname === "/api/stats") {
            const u = await query("SELECT COUNT(*) FROM users");
            const a = await query("SELECT COUNT(*) FROM activities");
            const c = await query("SELECT COUNT(*) FROM certificates");
            return Response.json({ users: u[0].count, activities: a[0].count, certificates: c[0].count, visits: 0 });
        }

        if (pathname === "/api/login" && method === "POST") {
            const rows = await query("SELECT * FROM users WHERE username = $1 AND password = $2", [body.username, body.password]);
            if (rows.length > 0) return Response.json({ success: true, ...rows[0] });
            return Response.json({ success: false }, { status: 401 });
        }

        if (pathname === "/api/analytics") {
            const uid = url.searchParams.get("userId");
            if (!uid || uid === "0") return Response.json({ user: { name: 'Guest', role: 'guest', level: 1, xp: 0, coins: 0 }, certificates: [], activities: [] });
            const user = await query("SELECT * FROM users WHERE id = $1", [uid]);
            const certs = await query("SELECT * FROM certificates WHERE user_id = $1", [uid]);
            const rankRes = await query("SELECT COUNT(*) as rank FROM users WHERE xp > (SELECT xp FROM users WHERE id = $1)", [uid]);
            return Response.json({ user: user[0], certificates: certs, rank: (rankRes[0]?.rank || 0) + 1 });
        }

        if (pathname === "/api/activities") {
            const sid = url.searchParams.get("studentId") || "0";
            return Response.json(await query(`SELECT a.*, COALESCE(e.id, 0) as is_enrolled FROM activities a LEFT JOIN enrollments e ON a.id = e.activity_id AND e.user_id = $1 ORDER BY a.id DESC`, [sid]));
        }

        if (pathname === "/api/shop") return Response.json(await query("SELECT * FROM items ORDER BY price ASC"));

        if (pathname === "/api/users" && method === "GET") return Response.json(await query("SELECT * FROM users ORDER BY id DESC"));

        // --- STATIC FILE SERVING ---
        let path = pathname;
        if (path === "/") path = "/index.html";
        const file = Bun.file(join(BASE_DIR, "public", path));
        if (await file.exists()) return new Response(file);

        return new Response("Not Found", { status: 404 });

    } catch (e: any) {
        console.error("Local Server Error:", e.message);
        return Response.json({ error: e.message }, { status: 500 });
    }
  }
});

console.log(`
🚀 [LOCAL DEV] AdaptLearn Pro Running!
🔗 URL: http://localhost:${PORT}
📂 Root: ${BASE_DIR}
📡 DB: Connecting to Neon Postgres...
`);
