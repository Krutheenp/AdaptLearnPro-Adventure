# AdaptLearn Pro Adventure 🚀
Modern Gamified Learning Platform v3.1

AdaptLearn Pro is a high-performance, gamified learning management system designed for immersive educational experiences. Built with a robust Postgres backend and a fluid, modern frontend.

## 🌟 Key Features
- **Mission Command Center**: Interactive world map for exploring courses (Missions).
- **Gamified Economy**: Earn XP and Coins to level up and unlock premium content.
- **Integrated Marketplace**: Unified shop for power-up items and mission unlocks.
- **Dynamic Profile**: Track your rank, certificates, and learning history in real-time.
- **Instructor Studio**: Built-in tools for creators to architect complex curricula.
- **Admin Control Center**: Full system management, analytics, and certificate verification.

## 🛠 Tech Stack
- **Backend**: Node.js (Vercel Functions)
- **Database**: Postgres (Neon Cloud DB)
- **Frontend**: Tailwind CSS, FontAwesome, Chart.js, Glassmorphism UI
- **Environment**: Vercel Platform

## 🚀 Getting Started (Production)
1. **Initialize System**: Access the `/admin.html` page and click **"Initialize System"** to set up database schemas.
2. **Seed Data**: Click **"Seed Base Data"** to populate initial shop items and core missions.
3. **Login**: Use the default administrator credentials:
   - **Username**: `admin`
   - **Password**: `password123`

## 💻 Local Development
Run the local Bun server for rapid prototyping:
```bash
bun --hot server.ts
```
Access the local instance at `http://localhost:8080`.

## 📁 Project Structure
- `/api`: Vercel Serverless Functions (Backend logic)
- `/public`: Frontend assets, HTML, and Client-side JS
- `server.ts`: Local development server (Bun)
- `overhaul_db.ts`: Database system maintenance script

---
© 2026 AdaptLearn Pro Team. Designed for the future of education.
