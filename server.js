const express = require('express');
const path = require('path');
const database = require('./database');
const { processSource } = require('./crawler');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// SSE Clients
let clients = [];

app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const clientId = Date.now();
    const newClient = {
        id: clientId,
        res
    };
    clients.push(newClient);

    req.on('close', () => {
        clients = clients.filter(c => c.id !== clientId);
    });
});

function broadcastEvent(data) {
    clients.forEach(c => c.res.write(`data: ${JSON.stringify(data)}\n\n`));
}
database.init();

// --- SCHEDULER ---
const MAX_CONCURRENT_CRAWLS = 3;
let isCrawling = false;

async function runScheduler() {
    if (isCrawling) return;
    isCrawling = true;

    try {
        const sources = await database.getDueSources();
        const now = new Date();

        const due = sources.filter(s => {
            if (!s.last_crawled_at) return true;
            const last = new Date(s.last_crawled_at);
            const diffMinutes = (now - last) / (1000 * 60);
            return diffMinutes >= s.interval_minutes;
        });
        // The original scheduler had filtering logic here. Assuming getDueSources now returns only due sources.
        console.log(`[Scheduler] Found ${sources.length} sources due for crawling.`);

        // Parallel or Serial?
        // Let's do serial source processing but concurrent pages *within* source
        for (const source of sources) {
            if (!clients.length) {
                // If no UI connected, just log
                console.log(`Processing ${source.url}`);
            }
            await processSource(source, (event) => {
                broadcastEvent(event);
            });
        }
    } catch (e) {
        console.error('[Scheduler] Error:', e);
    }
}
setInterval(runScheduler, 30000); // Check every 30s for more "real time" feel

// --- API ---

app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    console.log(`[API] Search request for: ${query}`);
    try {
        let results;
        if (query) {
            results = await database.search(query);
        } else {
            results = [];
        }
        console.log(`[API] Found ${results.length} results`);
        res.json(results);
    } catch (err) {
        console.error('[API] Search error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/graph', async (req, res) => {
    try {
        // Return recent articles as nodes for the graph
        const limit = 500; // Cap for performance
        const rows = await database.getAll(limit);
        const nodes = rows.map(r => ({
            id: r.url,
            group: 'article',
            title: r.title,
            source: r.source
        }));
        // We implicitly know they link to their 'source'
        // For a better graph, we'd need a links table, but we can visualize: Source -> Article
        const sources = new Set(rows.map(r => r.source));
        const links = rows.map(r => ({
            source: r.source,
            target: r.url
        }));

        // Add source nodes if missing from articles (though they usually are urls too)
        // usage: { nodes: [...], links: [...] }
        res.json({ nodes, links });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/news', async (req, res) => {
    try {
        const results = await database.getNewsFeed();
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sources', async (req, res) => {
    try {
        const sources = await database.getSources();
        res.json(sources);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sources', async (req, res) => {
    const { url, interval, depth } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        const { processSource } = require('./crawler');

        // Clean url
        let clean = url.trim();
        if (!clean.startsWith('http')) clean = 'https://' + clean;

        // Auto-Discovery for RSS removed
        let finalUrl = clean;
        let foundRss = false;

        const id = await database.addSource(finalUrl, interval || 60, depth || 7);

        // Trigger immediate crawl for new source and wait for result to give feedback
        const sources = await database.getSources();
        const newSource = sources.find(s => s.id === id);

        if (newSource) {
            console.log(`Doing initial check for ${newSource.url}`);
            processSource(newSource, (event) => broadcastEvent(event)); // Async background
            res.json({ success: true, type: 'HTML', ...newSource });
        } else {
            res.json({ success: true, message: 'Source added' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/sources/:id', async (req, res) => {
    try {
        await database.deleteSource(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/sources/:id', async (req, res) => {
    const { interval, depth } = req.body;
    try {
        if (interval !== undefined) await database.updateSourceInterval(req.params.id, interval);
        if (depth !== undefined) await database.updateSourceDepth(req.params.id, depth);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sources/:id/crawl', async (req, res) => {
    const { id } = req.params;
    try {
        const sources = await database.getSources();
        const source = sources.find(s => s.id == id);
        if (source) {
            processSource(source, (event) => broadcastEvent(event)).then(res => console.log('Manual crawl done'));
            res.json({ success: true, message: 'Crawl started in background' });
        } else {
            res.status(404).json({ error: 'Source not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    // Bootup crawl check
    runScheduler();
});
