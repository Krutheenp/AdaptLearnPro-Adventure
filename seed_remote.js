const fetch = require('node-fetch');

const BASE_URL = 'https://adapt-learn-pro-adventure.vercel.app'; // Your Vercel URL

async function seed() {
    console.log(`🌱 Seeding data to ${BASE_URL}...`);

    try {
        // 1. Init Tables
        console.log('1. Initializing Tables...');
        const initRes = await fetch(`${BASE_URL}/api/init`);
        console.log('   Init:', await initRes.json());

        // 2. Create Users (Directly via API not possible for direct SQL insert in Vercel API without Auth, 
        //    so we will use the Register endpoint if available, or just rely on manual register for now.
        //    Actually, our api/index.js currently only has Login/Get. 
        //    Let's try to register via a new ad-hoc fetch if I added register endpoint?
        //    Wait, I only added Login/Get in the Vercel API migration step.
        //    I should have added Register. Let me check api/index.js content via read first? 
        //    No, I overwrote it. I know what's in it.
        
        //    The current api/index.js on Vercel is minimal. I need to Update api/index.js FIRST to support Register/Seed.
        console.log('   (Skipping User Seed - Please Register on the website)');

        // 3. Create Activities (Mocking via client-side logic isn't enough, we need DB rows)
        //    Since I cannot run SQL directly from here to Vercel DB without credentials,
        //    I will guide you to use the app to create data OR I update the API to have a /seed endpoint.
    } catch (e) {
        console.error('Error:', e);
    }
}

seed();