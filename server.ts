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
    
    // SQLite Initial Schema
    sqlite.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'student', name TEXT, level INTEGER DEFAULT 1, xp INTEGER DEFAULT 0, coins INTEGER DEFAULT 0, avatar TEXT, status TEXT DEFAULT 'active')`);
    sqlite.run(`CREATE TABLE IF NOT EXISTS activities (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, type TEXT, difficulty TEXT, duration TEXT, content TEXT, category TEXT DEFAULT 'General', credits INTEGER DEFAULT 1, price INTEGER DEFAULT 0, creator_id INTEGER)`);
    sqlite.run(`CREATE TABLE IF NOT EXISTS enrollments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, activity_id INTEGER, enrolled_at TEXT)`);
    sqlite.run(`CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT)`);
    sqlite.run(`CREATE TABLE IF NOT EXISTS site_visits (id INTEGER PRIMARY KEY AUTOINCREMENT, ip_address TEXT, visit_time TEXT)`);
    sqlite.run(`CREATE TABLE IF NOT EXISTS certificates (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, user_name TEXT, course_title TEXT, issue_date TEXT, code TEXT)`);
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

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;
    const pathname = url.pathname;

    // --- API LAYER (Local implementation of production endpoints) ---
    if (pathname === "/api/check-db") return Response.json({ status: "Connected ✅", mode: DB_MODE });

    if (pathname === "/api/users") {
        if (method === "GET") return Response.json(await query("SELECT id, username, name, role, level, xp, coins, avatar, status FROM users ORDER BY id DESC"));
        if (method === "PUT") {
            const b = await req.json();
            const fields = []; const vals = []; let i = 1;
            ['name','role','level','xp','coins','avatar','status'].forEach(f => { if(b[f] !== undefined) { fields.push(`${f} = $${i++}`); vals.push(b[f]); } });
            if(fields.length > 0) {
                vals.push(b.id);
                if (DB_MODE === 'POSTGRES') {
                    await pgPool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`, vals);
                } else {
                    const sqliteSql = `UPDATE users SET ${fields.join(', ').replace(/\$\d+/g, '?')} WHERE id = ?`;
                    sqlite.run(sqliteSql, vals);
                }
            }
            return Response.json({ success: true });
        }
        if (method === "DELETE") {
            const id = url.searchParams.get("id");
            if (DB_MODE === 'POSTGRES') await pgPool.query("DELETE FROM users WHERE id = $1", [id]);
            else sqlite.run("DELETE FROM users WHERE id = ?", [id]);
            return Response.json({ success: true });
        }
    }

    if (pathname === "/api/activities") {
        const rows = await query("SELECT * FROM activities ORDER BY id DESC");
        return Response.json(rows);
    }

    if (pathname === "/api/config") {
        if (method === "GET") {
            const rows = await query("SELECT * FROM system_config");
            const cf = {}; rows.forEach(r => cf[r.key] = r.value);
            return Response.json(cf);
        }
        if (method === "POST") {
            const { key, value } = await req.json();
            if (DB_MODE === 'POSTGRES') await pgPool.query("INSERT INTO system_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2", [key, JSON.stringify(value)]);
            else sqlite.run("INSERT INTO system_config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = ?", [key, JSON.stringify(value), JSON.stringify(value)]);
            return Response.json({ success: true });
        }
    }

    if (pathname === "/api/visit") {
        const rows = await query("SELECT COUNT(*) as count FROM site_visits");
        return Response.json({ total_visits: rows[0]?.count || 0 });
    }

    if (pathname === "/api/certificate") {
        const rows = await query("SELECT * FROM certificates ORDER BY id DESC");
        return Response.json(rows);
    }

    // --- STATIC FILES ---
    let path = pathname;
    if (path === "/") path = "/index.html";
    
    const publicFile = Bun.file(join(BASE_DIR, "public", path));
    if (await publicFile.exists()) return new Response(publicFile);
    
    const rootFile = Bun.file(join(BASE_DIR, path));
    if (await rootFile.exists()) return new Response(rootFile);

    return new Response("Not Found", { status: 404 });
  }
});

console.log(`\n🚀 LMS Local Server Running at http://localhost:${PORT}`);