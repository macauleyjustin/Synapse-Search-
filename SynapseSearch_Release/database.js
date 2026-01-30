const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'news.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database.');
        db.run('PRAGMA journal_mode = WAL;'); // Enable Write-Ahead Logging for concurrency
    }
});

function init() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS articles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT,
                    url TEXT UNIQUE,
                    source TEXT,
                    snippet TEXT,
                    content TEXT,
                    published_at TIMESTAMP,
                    crawled_at TIMESTAMP
                )
            `);
            // Attempt to add content column if table existed but column didn't (migration)
            db.run(`ALTER TABLE articles ADD COLUMN content TEXT`, (err) => {
                // Ignore error if column exists
            });

            db.run(`
                CREATE TABLE IF NOT EXISTS sources (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    url TEXT UNIQUE,
                    name TEXT,
                    interval_minutes INTEGER DEFAULT 60,
                    depth INTEGER DEFAULT 7,
                    last_crawled_at TIMESTAMP,
                    active INTEGER DEFAULT 1
                )
            `, (err) => {
                // Migration: try to add depth column if it doesn't exist
                if (!err) {
                    db.run(`ALTER TABLE sources ADD COLUMN depth INTEGER DEFAULT 7`, () => { });
                    db.run(`ALTER TABLE sources ADD COLUMN scrape_outbound INTEGER DEFAULT 1`, () => { });
                }

                // OUTBOUND LINKS TABLE
                db.run(`
                    CREATE TABLE IF NOT EXISTS outbound_links (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        from_url TEXT,
                        to_url TEXT,
                        domain TEXT,
                        category TEXT,
                        created_at TIMESTAMP,
                        UNIQUE(from_url, to_url)
                    )
                `, (e) => {
                    if (e) console.log("Outbound table error:", e);
                });

                if (err) reject(err);
                else {
                    // SETUP FTS5
                    db.run(`
                        CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(title, content, snippet, url);
                    `, (err) => {
                        if (err) {
                            console.error("FTS5 Creation Error (Ignorable if built without FTS):", err);
                            resolve();
                        } else {
                            // TRIGGERS TO SYNC
                            db.run(`
                                CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
                                  INSERT INTO articles_fts(rowid, title, content, snippet, url) VALUES (new.id, new.title, new.content, new.snippet, new.url);
                                END;
                            `);
                            db.run(`
                                CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
                                  INSERT INTO articles_fts(articles_fts, rowid, title, content, snippet, url) VALUES('delete', old.id, old.title, old.content, old.snippet, old.url);
                                END;
                            `);
                            db.run(`
                                CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
                                  INSERT INTO articles_fts(articles_fts, rowid, title, content, snippet, url) VALUES('delete', old.id, old.title, old.content, old.snippet, old.url);
                                  INSERT INTO articles_fts(rowid, title, content, snippet, url) VALUES (new.id, new.title, new.content, new.snippet, new.url);
                                END;
                            `);
                            resolve();

                            // Backfill FTS if empty (simple check)
                            db.get("SELECT count(*) as count FROM articles_fts", (e, r) => {
                                if (!e && r.count === 0) {
                                    console.log("Backfilling FTS index...");
                                    db.run("INSERT INTO articles_fts(rowid, title, content, snippet, url) SELECT id, title, content, snippet, url FROM articles");
                                }
                            });
                        }
                    });
                }
            });
        });
    });
}

function insertArticle(article) {
    return new Promise((resolve, reject) => {
        const { title, url, source, snippet, content, published_at } = article;
        const crawled_at = new Date().toISOString();

        const stmt = db.prepare(`
            INSERT OR IGNORE INTO articles (title, url, source, snippet, content, published_at, crawled_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(title, url, source, snippet, content, published_at, crawled_at, function (err) {
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
        stmt.finalize();
    });
}

function search(query) {
    return new Promise((resolve, reject) => {
        // Use FTS5
        // Escape quotes in query
        const safeQuery = query.replace(/"/g, '""');

        // Simple query parsing: treat spaces as AND implicitly or OR depending on preference.
        // FTS5 standard parser: "hello world" finds phrases. hello world finds both.
        // Let's wrap in quotes for phrase if user didn't, or just pass raw?
        // Raw is usually okay, but "stars *" is better for prefix.
        // Let's try simple match first.

        // Improve MATCH query: append * to last word for prefix search
        const terms = safeQuery.trim().split(/\s+/).map(t => `${t}*`).join(' OR ');
        const matchQuery = `"${safeQuery}" OR (${terms})`;

        db.all(`
            SELECT articles.* FROM articles 
            JOIN articles_fts ON articles.id = articles_fts.rowid 
            WHERE articles_fts MATCH ? 
            ORDER BY rank 
            LIMIT 100
        `, [matchQuery], (err, rows) => {
            if (err) {
                // Fallback to LIKE if FTS fails (or weird syntax)
                console.log("FTS Match failed, falling back to LIKE:", err.message);
                const searchTerm = `%${query}%`;
                db.all(`
                    SELECT * FROM articles 
                    WHERE title LIKE ? OR snippet LIKE ? OR content LIKE ?
                    ORDER BY crawled_at DESC LIMIT 100
                `, [searchTerm, searchTerm, searchTerm], (e, r) => {
                    if (e) reject(e);
                    else resolve(r);
                });
            } else {
                resolve(rows);
            }
        });
    });
}

function getAll(limit = 50) {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT * FROM articles 
            ORDER BY crawled_at DESC
            LIMIT ?
        `, [limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// SOURCE MANAGEMENT

function addSource(url, interval = 60, depth = 7) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`INSERT OR IGNORE INTO sources (url, interval_minutes, depth) VALUES (?, ?, ?)`);
        stmt.run(url, interval, depth, function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
        stmt.finalize();
    });
}

function getSources() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM sources ORDER BY id DESC`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getDueSources() {
    return new Promise((resolve, reject) => {
        // Find sources where (last_crawled + interval) < now OR last_crawled IS NULL
        // SQLite doesn't have easy date math in standard SQL without extensions sometimes, 
        // but we can just pull all active sources and filter in JS or use datetime modifiers.
        // Let's rely on JS filtering for simplicity and robustness across sqlite versions.
        db.all(`SELECT * FROM sources WHERE active = 1`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function updateSourceTimestamp(id) {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        db.run(`UPDATE sources SET last_crawled_at = ? WHERE id = ?`, [now, id], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function deleteSource(id) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM sources WHERE id = ?`, [id], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function updateSourceInterval(id, interval) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE sources SET interval_minutes = ? WHERE id = ?`, [interval, id], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function updateSourceUrl(id, url) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE sources SET url = ? WHERE id = ?`, [url, id], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function updateSourceDepth(id, depth) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE sources SET depth = ? WHERE id = ?`, [depth, id], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function updateSourceScrapeOutbound(id, val) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE sources SET scrape_outbound = ? WHERE id = ?`, [val, id], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function getNewsFeed(limit = 100) {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT * FROM articles 
            ORDER BY crawled_at DESC 
            LIMIT ?
        `, [limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function clearSources() {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM sources`, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function clearArticles() {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM articles`, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function insertOutboundLink(link) {
    return new Promise((resolve, reject) => {
        const { from_url, to_url, domain, category } = link;
        const created_at = new Date().toISOString();

        const stmt = db.prepare(`
            INSERT OR IGNORE INTO outbound_links (from_url, to_url, domain, category, created_at)
            VALUES (?, ?, ?, ?, ?)
        `);

        stmt.run(from_url, to_url, domain, category, created_at, function (err) {
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
        stmt.finalize();
    });
}

function getOutboundDomains() {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT domain, category, COUNT(*) as count 
            FROM outbound_links 
            GROUP BY domain 
            ORDER BY count DESC 
            LIMIT 200
        `, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getOutboundBySource() {
    return new Promise((resolve, reject) => {
        // Group by the base domain of the 'from_url' to show which sites have what links
        // Or simpler: just list distinct from_url pages? User asked "click on website and see outbound links"
        // Let's return just the domains for now or grouped by from_url
        // Let's do distinct from_urls
        db.all(`
            SELECT DISTINCT from_url FROM outbound_links ORDER BY created_at DESC LIMIT 100
        `, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getOutboundLinksForPage(url) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM outbound_links WHERE from_url = ?`, [url], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getAllOutboundLinks() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM outbound_links ORDER BY created_at DESC LIMIT 500`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

module.exports = {
    init,
    insertArticle,
    search,
    getAll,
    getNewsFeed,
    addSource,
    getSources,
    getDueSources,
    updateSourceTimestamp,
    deleteSource,
    updateSourceInterval,
    updateSourceDepth,
    updateSourceUrl,
    clearSources,
    clearArticles
};
