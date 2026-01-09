import { Database } from "bun:sqlite";
import { join } from "path";

const DB_PATH = join(import.meta.dir, "production.sqlite");
const db = new Database(DB_PATH);

console.log("🔄 กำลังล้างข้อมูลเก่าและเติมข้อมูลจำลอง...");

// 1. Clear Tables
db.run("DELETE FROM users");
db.run("DELETE FROM activities");
db.run("DELETE FROM user_progress");
db.run("DELETE FROM sqlite_sequence"); // Reset ID counters

// 2. Create Users
const users = [
    // Username, Password, Role, Name, Level, XP, Avatar
    ['admin', 'password123', 'admin', 'Super Admin', 99, 99999, '👑'],
    ['teacher', '1234', 'teacher', 'ครูสมศรี ใจดี', 50, 5000, '👩‍🏫'],
    ['araya', '1234', 'student', 'อารยา สมใจ', 15, 2450, '👩‍🎓'],
    ['mana', '1234', 'student', 'เด็กชายมานะ', 5, 800, '👦'],
    ['manee', '1234', 'student', 'เด็กหญิงมานี', 8, 1200, '👧']
];

const insertUser = db.prepare("INSERT INTO users (username, password, role, name, level, xp, avatar) VALUES (?, ?, ?, ?, ?, ?, ?)");
users.forEach(u => insertUser.run(...u));
console.log(`✅ เพิ่มสมาชิก ${users.length} คน`);

// 3. Create Activities (Courses with Content)
const courses = [
    {
        title: "คณิตศาสตร์: สมการเชิงเส้น",
        type: "video",
        difficulty: "ปานกลาง",
        duration: "45 นาที",
        content: JSON.stringify([
            { type: 'text', title: 'บทนำ', body: 'สมการเชิงเส้นตัวแปรเดียว คือสมการที่มีตัวแปรเพียงตัวเดียว และเลขชี้กำลังของตัวแปรเป็น 1' },
            { type: 'video', title: 'การแก้สมการเบื้องต้น', url: 'https://www.youtube.com/watch?v=LwCNYtKEtYM' },
            { type: 'quiz', question: 'จงหาค่า x จากสมการ 2x + 4 = 10', options: ['2', '3', '4', '5'], correct: 1 }
        ])
    },
    {
        title: "วิทยาศาสตร์: ระบบสุริยะ",
        type: "game",
        difficulty: "ง่าย",
        duration: "30 นาที",
        content: JSON.stringify([
            { type: 'image', title: 'แผนผังระบบสุริยะ', url: 'https://cdn.pixabay.com/photo/2012/11/28/10/54/solar-system-67645_1280.jpg' },
            { type: 'text', title: 'ดาวเคราะห์', body: 'ระบบสุริยะประกอบด้วยดวงอาทิตย์และวัตถุอื่น ๆ ที่โคจรรอบดวงอาทิตย์...' },
            { type: 'quiz', question: 'ดาวเคราะห์ดวงใดอยู่ใกล้ดวงอาทิตย์ที่สุด?', options: ['โลก', 'ดาวศุกร์', 'ดาวพุธ', 'ดาวอังคาร'], correct: 2 }
        ])
    },
    {
        title: "ภาษาอังกฤษ: Basic Grammar",
        type: "video",
        difficulty: "ยาก",
        duration: "1 ชม.",
        content: JSON.stringify([
            { type: 'video', title: 'Verb to Be', url: 'https://www.youtube.com/watch?v=dtxLJAbY60E' },
            { type: 'quiz', question: 'She ___ a student.', options: ['is', 'am', 'are', 'be'], correct: 0 }
        ])
    },
    {
        title: "Python Programming 101",
        type: "simulation",
        difficulty: "ปานกลาง",
        duration: "2 ชม.",
        content: JSON.stringify([
            { type: 'text', title: 'รู้จักกับ Python', body: 'Python เป็นภาษาเขียนโปรแกรมระดับสูงที่ใช้กันอย่างกว้างขวาง...' },
            { type: 'quiz', question: 'คำสั่งใดใช้แสดงผลออกทางหน้าจอ?', options: ['scanf()', 'print()', 'echo', 'System.out'], correct: 1 }
        ])
    }
];

const insertAct = db.prepare("INSERT INTO activities (title, type, difficulty, duration, content) VALUES (?, ?, ?, ?, ?)");
courses.forEach(c => insertAct.run(c.title, c.type, c.difficulty, c.duration, c.content));
console.log(`✅ เพิ่มคอร์สเรียน ${courses.length} วิชา`);

// 4. Create History (User Progress for 'araya')
// ID 1=admin, 2=teacher, 3=araya
const progress = [
    { user_id: 3, activity_id: 1, score: 100, status: 'completed' }, // Math - Done
    { user_id: 3, activity_id: 2, score: 80, status: 'completed' },  // Science - Done
    { user_id: 3, activity_id: 3, score: 40, status: 'failed' }      // English - Failed
    // Python - Not started
];

const insertProg = db.prepare("INSERT INTO user_progress (user_id, activity_id, score, status, completed_at) VALUES (?, ?, ?, ?, ?)");
const date = new Date().toISOString();
progress.forEach(p => insertProg.run(p.user_id, p.activity_id, p.score, p.status, date));
console.log(`✅ เพิ่มประวัติการเรียนให้ 'อารยา'`);

console.log("\n🎉 สร้างข้อมูลจำลองเสร็จสมบูรณ์!");
console.log("------------------------------------------------");
console.log("🔑 Admin User:   admin / password123");
console.log("🔑 Teacher User: teacher / 1234");
console.log("🔑 Student User: araya / 1234");
console.log("------------------------------------------------");
