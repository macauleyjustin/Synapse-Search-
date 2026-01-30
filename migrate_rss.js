const database = require('./database');
const { tryFindFeed } = require('./crawler');

async function migrate() {
    await database.init();
    const sources = await database.getSources();
    console.log(`Scanning ${sources.length} sources for RSS feeds...`);

    let updated = 0;

    for (const source of sources) {
        // Skip if already looks like an RSS feed? 
        // Or just re-scan to be sure (maybe they switched to a better feed)
        // But for safety, let's just scan everything.

        console.log(`Checking ${source.url}...`);
        try {
            const feedUrl = await tryFindFeed(source.url);

            if (feedUrl && feedUrl !== source.url) {
                console.log(`  FOUND FEED: ${feedUrl}`);
                // Update DB
                // We don't have a specific updateSourceURL function, so we might need to add one or do raw query
                // database.js doesn't export the db object directly, so let's import sqlite3 here to do it manually or add a method.
                // Actually, let's add a method to database.js first or just use raw SQL if I can access db.
                // database.js does NOT export db. I'll add a helper to database.js first.

                await database.updateSourceUrl(source.id, feedUrl);
                console.log(`  Updated ${source.url} -> ${feedUrl}`);
                updated++;
            } else {
                console.log(`  No new feed found.`);
            }
        } catch (e) {
            console.error(`  Error checking ${source.url}: ${e.message}`);
        }
    }

    console.log(`Migration complete. Updated ${updated} sources.`);
}

// We need to add updateSourceUrl to database.js first!
// But I'll write this script now.

migrate().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
