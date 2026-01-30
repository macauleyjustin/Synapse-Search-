const axios = require('axios');
const cheerio = require('cheerio');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const database = require('./database');


const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
};

// Helper to clean URL
function cleanUrl(url) {
    if (!url.startsWith('http')) return 'https://' + url;
    return url;
}



// Superior content extractor using Mozilla Readability
async function fetchPageContent(url) {
    try {
        const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
        const dom = new JSDOM(res.data, { url: url });

        let article = new Readability(dom.window.document).parse();
        if (article && article.textContent) {
            // Clean whitespace
            let content = article.textContent.replace(/\s+/g, ' ').trim();
            return content.substring(0, 15000); // 15k chars limit
        }

        return '';
    } catch (e) {
        return '';
    }
}

const MAX_DEPTH_DEFAULT = 12;

function categorizeUrl(url) {
    const domain = new URL(url).hostname.toLowerCase();

    if (domain.includes('youtube') || domain.includes('vimeo') || domain.includes('twitch') || domain.includes('tiktok')) return 'Video';
    if (domain.includes('twitter') || domain.includes('x.com') || domain.includes('facebook') || domain.includes('instagram') || domain.includes('reddit') || domain.includes('linkedin') || domain.includes('bluesky') || domain.includes('mastodon')) return 'Social';
    if (domain.includes('github') || domain.includes('gitlab') || domain.includes('stackoverflow') || domain.includes('npm') || domain.includes('developer')) return 'Tech/Code';
    if (domain.includes('wikipedia') || domain.includes('fandom') || domain.includes('wiki')) return 'Wiki';
    if (domain.includes('google') || domain.includes('bing') || domain.includes('duckduckgo') || domain.includes('search')) return 'Search Engine';
    if (domain.includes('nytimes') || domain.includes('bbc') || domain.includes('cnn') || domain.includes('reuters') || domain.includes('apnews')) return 'Mainstream News';
    if (url.includes('/blog') || domain.includes('medium') || domain.includes('substack') || domain.includes('wordpress')) return 'Blog';

    return 'General';
}
const MAX_PAGES_PER_SOURCE = 5000; // Deep crawl limit
const CONCURRENCY = 25; // "Very fast"

async function processSource(sourceRecord, onEvent) {
    const startUrl = cleanUrl(sourceRecord.url);
    const maxDepth = sourceRecord.depth || MAX_DEPTH_DEFAULT;

    if (onEvent) onEvent({ type: 'start', source: startUrl });
    console.log(`[Crawler] Starting recursive crawl for ${startUrl} (Depth: ${maxDepth})`);

    let hostname;
    try {
        hostname = new URL(startUrl).hostname;
    } catch {
        return { success: false, error: 'Invalid URL' };
    }

    // Queue items: { url, depth }
    const queue = [{ url: startUrl, depth: 0 }];
    const visited = new Set();
    let pagesCrawled = 0;



    let activeRequests = 0;

    // Simple concurrent processor using a promise loop
    // Since we need to dynamically add to queue, a strict pool is hard.
    // We'll use a loop that fills slots.

    return new Promise((resolve) => {
        const processQueue = async () => {
            // While we have capacity and items
            while (activeRequests < CONCURRENCY && queue.length > 0 && pagesCrawled < MAX_PAGES_PER_SOURCE) {
                const item = queue.shift();

                // Normalize URL before checking visited
                let currentObj;
                try {
                    currentObj = new URL(item.url);
                } catch { continue; }

                // 1. Check Constraint: Must be same domain (or subdomain) for initial crawl,
                // but we allow external links to be added to the queue.
                // The instruction says "Allow external domains but maybe limit their recursion."
                // For now, we'll allow all links to be processed, and the depth limit will handle recursion.
                // The `visited` set will prevent re-processing.

                if (visited.has(item.url)) continue;
                visited.add(item.url);

                activeRequests++;
                // pagesCrawled++; // pagesCrawled is incremented only when an article is saved

                // Process in background
                crawlPage(item).then(() => {
                    activeRequests--;
                    processQueue(); // checking again after finish
                }).catch(() => {
                    activeRequests--; // Ensure activeRequests is decremented even on error
                    processQueue();
                });
            }

            // Completion check: if queue empty and no active requests
            if (queue.length === 0 && activeRequests === 0) {
                await database.updateSourceTimestamp(sourceRecord.id);
                if (onEvent) onEvent({ type: 'finish', source: startUrl, count: pagesCrawled });
                resolve({ success: true, count: pagesCrawled });
            }
        };

        const crawlPage = async ({ url, depth }) => {
            if (onEvent) onEvent({ type: 'visit', url: url, source: startUrl });

            try {
                const res = await axios.get(url, { headers: HEADERS, timeout: 6000 });
                const contentType = res.headers['content-type'] || '';

                // RSS Handling


                // HTML Handling
                const dom = new JSDOM(res.data, { url: url });
                const doc = dom.window.document;

                // Extract
                const article = new Readability(doc).parse();
                let content = '', title = '', snippet = '';

                if (article) {
                    title = article.title;
                    content = article.textContent.replace(/\s+/g, ' ').trim();
                    snippet = article.excerpt || content.substring(0, 200);
                } else {
                    title = doc.querySelector('title')?.textContent || '';
                    // Fallback content extraction, limit to body text
                    content = doc.body?.textContent?.replace(/\s+/g, ' ').trim().substring(0, 500) || '';
                    snippet = content.substring(0, 200);
                }

                if (content.length > 100 && title) {
                    await database.insertArticle({
                        title: title,
                        url: url,
                        source: startUrl,
                        snippet: snippet,
                        content: content,
                        published_at: null
                    });
                    pagesCrawled++;
                    if (onEvent) onEvent({ type: 'indexed', url: url, title: title });
                }

                // Recurse / Links
                if (depth < maxDepth) {
                    const links = doc.querySelectorAll('a[href]');
                    links.forEach(async (link) => {
                        let href = link.href;
                        try {
                            href = new URL(href, url).href;
                        } catch (e) { return; }

                        // basic filter
                        if (href.startsWith('http')) {
                            const linkHostname = new URL(href).hostname;
                            const currentHostname = new URL(url).hostname;



                            // Optimization: Don't re-add if we have 20000 items in queue
                            if (queue.length < 20000 && !visited.has(href)) { // Add queue size limit and visited check
                                queue.push({ url: href, depth: depth + 1 });
                            }
                        }
                    });
                }
            } catch (e) {
                // console.log(`  Failed ${url}: ${e.message}`);
            }
        };

        // Kickoff
        processQueue();
    });
}

module.exports = { processSource };
