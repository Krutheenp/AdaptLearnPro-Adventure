
const BASE_URL = "http://localhost:8080";

async function runTests() {
    console.log("Starting System Tests...");
    
    // Check if server is up
    try {
        await fetch(BASE_URL);
    } catch(e) {
        console.error("Server is not running at " + BASE_URL);
        process.exit(1);
    }

    // 1. Register
    const testUser = { name: "Test User", username: "testuser_" + Date.now(), password: "password123" };
    console.log("1. Testing Registration...");
    const regRes = await fetch(`${BASE_URL}/api/register`, {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testUser)
    });
    const regData = await regRes.json();
    console.log("   Register:", regData.success ? "PASS" : "FAIL");

    // 2. Login
    console.log("2. Testing Login...");
    const loginRes = await fetch(`${BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testUser)
    });
    const loginData = await loginRes.json();
    console.log("   Login:", loginData.success ? "PASS" : "FAIL");
    
    if (!loginData.success) {
        console.error("Login failed, aborting tests.");
        return;
    }
    const userId = loginData.id;
    console.log("   Logged in as User ID:", userId);

    // 3. Admin Login
    console.log("3. Testing Admin Login...");
    const adminRes = await fetch(`${BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "password123" })
    });
    const adminData = await adminRes.json();
    console.log("   Admin Login:", adminData.success ? "PASS" : "FAIL");

    // 4. Create Activity (Admin)
    console.log("4. Testing Create Activity...");
    const newAct = { title: "Test Course " + Date.now(), type: "video", difficulty: "Easy", duration: "10m", content: [] };
    const createActRes = await fetch(`${BASE_URL}/api/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAct)
    });
    const createActData = await createActRes.json();
    console.log("   Create Activity:", createActData.success ? "PASS" : "FAIL");

    // 5. Get Activities and find the new one
    console.log("5. Verifying Course Creation...");
    const actsRes = await fetch(`${BASE_URL}/api/activities`);
    const acts = await actsRes.json();
    const createdCourse = acts.find((a: any) => a.title === newAct.title);
    console.log("   Found Course:", createdCourse ? "PASS" : "FAIL");

    if (createdCourse) {
        // 6. Record Progress
        console.log("6. Testing Progress Recording...");
        const progRes = await fetch(`${BASE_URL}/api/progress`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: userId, activityId: createdCourse.id, score: 100, status: 'completed' })
        });
        const progData = await progRes.json();
        console.log("   Save Progress:", progData.success ? "PASS" : "FAIL");

        // 7. Check Analytics
        console.log("7. Testing Analytics...");
        const anaRes = await fetch(`${BASE_URL}/api/analytics?userId=${userId}`);
        const anaData = await anaRes.json();
        const hasRecord = anaData.activities.some((p: any) => p.activity_id === createdCourse.id && p.status === 'completed');
        console.log("   Verify Analytics:", hasRecord ? "PASS" : "FAIL");
        console.log("   Total Score:", anaData.total_score);
    }

    console.log("\nTests Completed.");
}

runTests();
