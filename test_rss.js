const { tryFindFeed } = require('./crawler');

const sites = [
    'https://techcrunch.com', // standard
    'https://news.ycombinator.com', // usually has one
    'https://michiganadvance.com', // user example
    'https://www.lansingstatejournal.com', // messy corporate site
    'https://lansingcitypulse.com'
];

async function test() {
    for (const site of sites) {
        console.log(`Checking ${site}...`);
        const feed = await tryFindFeed(site);
        console.log(`  -> Found: ${feed}`);
    }
}

test();
