const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Initialize DB (In-Memory for Vercel demo - Data will reset!)
const db = new sqlite3.Database(':memory:');

// Helper to init tables
function initDB() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            username TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'student', 
            name TEXT, email TEXT, phone TEXT, bio TEXT, school TEXT, 
            level INTEGER DEFAULT 1, xp INTEGER DEFAULT 0, avatar TEXT, 
            cover_image TEXT, address TEXT, birthdate TEXT, social_links TEXT, 
            coins INTEGER DEFAULT 0, streak INTEGER DEFAULT 0, last_login TEXT
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, type TEXT, difficulty TEXT, 
            duration TEXT, content TEXT, category TEXT DEFAULT 'General', credits INTEGER DEFAULT 1, 
            course_code TEXT, creator_id INTEGER DEFAULT 1
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS user_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, activity_id INTEGER, 
            score INTEGER DEFAULT 0, status TEXT, completed_at TEXT
        )`);

        // Seed Data
        db.run("INSERT OR IGNORE INTO users (username, password, role, name, level, coins) VALUES ('admin', 'password123', 'admin', 'Super Admin', 99, 9999)");
        db.run("INSERT OR IGNORE INTO users (username, password, role, name, level, coins) VALUES ('teacher', '1234', 'teacher', 'Teacher Demo', 50, 5000)");
        db.run("INSERT OR IGNORE INTO users (username, password, role, name, level, coins) VALUES ('student', '1234', 'student', 'Student Demo', 1, 100)");
        
        // Seed Course
        const content = JSON.stringify([{type:'text', content:'Welcome to the demo course!'}]);
        db.run("INSERT INTO activities (title, type, difficulty, duration, content, category, credits) VALUES ('Demo Math', 'game', 'Easy', '30m', ?, 'Mathematics', 3)", [content]);
    });
}

initDB();

module.exports = async (req, res) => {
    const { method } = req;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname.replace('/api', ''); // Strip /api prefix logic if needed

    res.setHeader('Content-Type', 'application/json');

    // --- ROUTER ---

    if (pathname === '/login' && method === 'POST') {
        const { username, password } = req.body;
        db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
            if (row) res.status(200).json({ success: true, ...row });
            else res.status(401).json({ success: false });
        });
        return;
    }

    if (pathname === '/users' && method === 'GET') {
        db.all("SELECT * FROM users", (err, rows) => res.status(200).json(rows));
        return;
    }

    if (pathname === '/activities' && method === 'GET') {
        db.all("SELECT * FROM activities", (err, rows) => res.status(200).json(rows));
        return;
    }

    // Default Fallback
    res.status(200).json({ message: "Vercel API is running (ReadOnly Demo)" });
};