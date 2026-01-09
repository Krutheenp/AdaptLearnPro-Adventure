import { config } from "dotenv";
import { join } from "path";

config({ path: join(import.meta.dir, ".env") });

const apiKey = process.env.GEMINI_API_KEY;
console.log("Checking models for key:", apiKey ? "Found" : "Missing");

try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
} catch (e) {
    console.error(e);
}