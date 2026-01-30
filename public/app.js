const searchInput = document.getElementById('query');
const searchResultsDiv = document.getElementById('search-results');
const sourcesListDiv = document.getElementById('sources-list');

// Tabs
function showTab(tabName) {
    // Legacy support or removal? Keeping for now just in case
}

// --- SEARCH ---
async function search(q) {
    const query = q || searchInput?.value || '';

    if (!query) {
        searchResultsDiv.innerHTML = '';
        return;
    }

    // 1. Show Transition
    const transitionOverlay = document.getElementById('search-transition');
    const transitionText = document.getElementById('transition-query');

    // Reset/Show
    transitionOverlay.style.display = 'flex';
    transitionText.innerText = `SEARCH_PROTOCOL: "${query.toUpperCase()}"`;

    // Glitch effect / Matrix decoding simulation
    let iterations = 0;
    const originalText = transitionText.innerText;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*";

    const interval = setInterval(() => {
        transitionText.innerText = originalText.split("")
            .map((letter, index) => {
                if (index < iterations) return originalText[index];
                return letters[Math.floor(Math.random() * letters.length)];
            })
            .join("");

        if (iterations >= originalText.length) clearInterval(interval);
        iterations += 1 / 2;
    }, 30);

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const articles = await res.json();

        // Artificial delay for "Techy" feel, wait for animation
        setTimeout(() => {
            transitionOverlay.style.display = 'none';
            renderResults(articles, searchResultsDiv);
        }, 1500);

    } catch (e) {
        console.error(e);
        transitionOverlay.style.display = 'none';
    }
}

// --- NEWS ---
async function loadNews() {
    newsResultsDiv.innerHTML = 'Loading news...';
    try {
        const res = await fetch(`/api/news`);
        const articles = await res.json();
        renderResults(articles, newsResultsDiv);
    } catch (e) {
        newsResultsDiv.innerHTML = 'Error loading news.';
        console.error(e);
    }
}

// --- CRAWL VISUALIZATION ---
const canvas = document.getElementById('networkMap');
const ctx = canvas.getContext('2d');
const nodes = []; // { x, y, vx, vy, color, label, life, id }
const links = []; // { source, target } (indices or objects)

async function initVisualizer() {
    const statsDiv = document.getElementById('crawl-stats');

    // 1. Load initial state
    try {
        const res = await fetch('/api/graph');
        const data = await res.json();

        if (data.nodes) {
            data.nodes.forEach(n => {
                spawnNode(n.id, n.title, 'indexed');
            });
            statsDiv.innerText = `Loaded ${data.nodes.length} nodes from database.`;
        }
    } catch (e) {
        console.error("Graph load error:", e);
    }

    // 2. Listen for live events
    const evtSource = new EventSource('/api/events');

    evtSource.onmessage = (e) => {
        const data = JSON.parse(e.data);

        if (data.type === 'visit' || data.type === 'indexed') {
            spawnNode(data.url, data.title || data.url, data.type);
            statsDiv.innerText = `Crawling: ${data.url}`;
        }
    };

    animate();
}

function spawnNode(id, label, type) {
    // Avoid dupes visual clutter if we want, or just let them pile up for "building" effect
    // Let's check simply
    // if (nodes.some(n => n.id === id)) return;

    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const color = type === 'indexed' ? '#a855f7' : '#444'; // Purple vs Grey

    nodes.push({
        id,
        x, y,
        vx: (Math.random() - 0.5) * 1.5, // Slower 
        vy: (Math.random() - 0.5) * 1.5,
        color,
        label: label,
        life: 2.0, // Longer life,
        createdAt: Date.now()
    });

    // Cap nodes
    if (nodes.length > 200) nodes.shift();
}

function animate() {
    // Trail effect
    ctx.fillStyle = 'rgba(5, 5, 5, 0.2)'; // Fade out slowly
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw connections
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[i].x - nodes[j].x;
            const dy = nodes[i].y - nodes[j].y;
            const dist = dx * dx + dy * dy;
            if (dist < 10000) { // < 100px distance
                ctx.moveTo(nodes[i].x, nodes[i].y);
                ctx.lineTo(nodes[j].x, nodes[j].y);
            }
        }
    }
    ctx.stroke();

    // Draw Nodes
    for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];

        // Move
        n.x += n.vx;
        n.y += n.vy;

        // Bounce
        if (n.x < 0 || n.x > canvas.width) n.vx *= -1;
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1;

        // Render
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 3, 0, Math.PI * 2);
        ctx.fill();

        // Fade out label
        // n.life -= 0.005; 
        // Keep them alive longer or forever? User said "run all the time"
        // Let's just keep them but fade text

        if (Math.random() < 0.01) {
            // Occasional spark
            ctx.fillStyle = '#fff';
            ctx.fillRect(n.x, n.y, 2, 2);
        }
    }

    requestAnimationFrame(animate);
}

// Start visualizer on load
initVisualizer();

const apiUrl = 'http://localhost:3000/api';

// --- VIEW NAVIGATION ---
// --- VIEW NAVIGATION ---
function showSearch() {
    document.getElementById('search-view').style.display = 'block';
    document.getElementById('news-view').style.display = 'none';
    document.getElementById('sources-view').style.display = 'none';
}

function showNews() {
    document.getElementById('search-view').style.display = 'none';
    document.getElementById('news-view').style.display = 'block';
    document.getElementById('sources-view').style.display = 'none';
    loadNews();
}

function showSources() {
    document.getElementById('search-view').style.display = 'none';
    document.getElementById('news-view').style.display = 'none';
    document.getElementById('sources-view').style.display = 'block';
    loadSources();
}

async function renderResults(articles, container) {
    container.innerHTML = '';
    if (articles.length === 0) {
        container.innerHTML = '<div class="no-results">No results found.</div>';
        return;
    }

    // Add result count
    const meta = document.createElement('div');
    meta.style.marginBottom = '20px';
    meta.style.color = '#666';
    meta.innerText = `${articles.length} results found`;
    container.appendChild(meta);

    articles.forEach(art => {
        const card = document.createElement('div');
        card.className = 'article-card';
        const dateStr = art.published_at ? new Date(art.published_at).toLocaleDateString() : '';

        card.innerHTML = `
            <div class="article-source">
                ${art.source} ${dateStr ? '• ' + dateStr : ''}
            </div>
            <h2 class="article-title"><a href="${art.url}" target="_blank">${art.title}</a></h2>
            <div class="article-snippet">${art.snippet}</div>
        `;
        container.appendChild(card);
    });
}

// --- SETTINGS ---
async function loadSources() {
    sourcesListDiv.innerHTML = 'Loading sources...';
    try {
        const res = await fetch('/api/sources');
        const sources = await res.json();
        renderSources(sources);
    } catch (e) {
        sourcesListDiv.innerHTML = 'Error loading sources.';
    }
}

function renderSources(sources) {
    sourcesListDiv.innerHTML = '';
    if (sources.length === 0) {
        sourcesListDiv.innerHTML = 'No sources configured.';
        return;
    }

    const table = document.createElement('table');
    table.className = 'sources-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>URL</th>
                <th>Interval</th>
                <th>Depth</th>
                <th>Last Crawl</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');
    sources.forEach(src => {
        const tr = document.createElement('tr');
        const lastCrawl = src.last_crawled_at ? new Date(src.last_crawled_at).toLocaleString() : 'Never';

        tr.innerHTML = `
            <td><a href="${src.url}" target="_blank">${src.url}</a></td>
            <td>
                <select onchange="updateInterval(${src.id}, this.value)">
                    <option value="15" ${src.interval_minutes == 15 ? 'selected' : ''}>15m</option>
                    <option value="60" ${src.interval_minutes == 60 ? 'selected' : ''}>1h</option>
                    <option value="360" ${src.interval_minutes == 360 ? 'selected' : ''}>6h</option>
                    <option value="1440" ${src.interval_minutes == 1440 ? 'selected' : ''}>24h</option>
                </select>
            </td>
            <td>
                <input type="number" value="${src.depth || 7}" min="1" max="20" style="width: 50px; background: #000; color: #fff; border: 1px solid #333; padding: 4px;" onchange="updateDepth(${src.id}, this.value)">
            </td>
            <td>${lastCrawl}</td>
            <td>
                <button onclick="crawlSource(${src.id})" class="btn-sm">Crawl</button>
                <button onclick="deleteSource(${src.id})" class="btn-sm btn-danger">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    sourcesListDiv.appendChild(table);
}

async function addSource() {
    const urlInput = document.getElementById('new-source-url');
    const intervalInput = document.getElementById('new-source-interval'); // If exists
    const depthInput = document.getElementById('new-source-depth');

    const url = urlInput.value;
    const interval = intervalInput ? parseInt(intervalInput.value) : 60;
    const depth = depthInput ? parseInt(depthInput.value) : 7;

    if (!url) return;

    const btn = document.querySelector('.add-source-form button');
    const originalText = btn.textContent;
    btn.textContent = 'Checking...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/sources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, interval, depth })
        });
        const data = await res.json();

        if (data.success) {
            urlInput.value = '';
            loadSources();

            let msg = 'Source added!';
            if (data.type === 'RSS') {
                msg += ` Auto-discovered RSS feed. Found ${data.count} items.`;
            } else {
                msg += ` No RSS found, using HTML ID scraping. Found ${data.count} items.`;
            }
            alert(msg);
        } else {
            alert('Error: ' + data.error);
        }
    } catch (e) {
        alert('Error adding source');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function deleteSource(id) {
    if (!confirm('Remove this source?')) return;
    await fetch(`/api/sources/${id}`, { method: 'DELETE' });
    loadSources();
}

async function updateInterval(id, val) {
    await fetch(`/api/sources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval: parseInt(val) })
    });
}

async function updateDepth(id, val) {
    await fetch(`/api/sources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depth: parseInt(val) })
    });
}

async function crawlSource(id) {
    await fetch(`/api/sources/${id}/crawl`, { method: 'POST' });
    alert('Crawl triggered. Refresh page in a moment to see update.');
}

// --- OUTBOUND LINKS LOGIC ---
async function loadOutboundData() {
    const listDiv = document.getElementById('outbound-sources-list');
    listDiv.innerHTML = 'Loading...';
    try {
        const res = await fetch('/api/outbound/by-source');
        const sources = await res.json();

        listDiv.innerHTML = '';
        if (sources.length === 0) {
            listDiv.innerText = 'No outbound links recorded yet.';
            return;
        }

        const ul = document.createElement('ul');
        ul.style.listStyle = 'none';
        ul.style.padding = '0';

        sources.forEach(src => {
            const li = document.createElement('li');
            li.style.padding = '8px';
            li.style.borderBottom = '1px solid #333';
            li.style.cursor = 'pointer';
            li.style.wordBreak = 'break-all';
            li.innerText = src;
            li.onmouseover = () => li.style.background = '#111';
            li.onmouseout = () => li.style.background = 'transparent';
            li.onclick = () => loadOutboundDetails(src);
            ul.appendChild(li);
        });
        listDiv.appendChild(ul);
    } catch (e) {
        listDiv.innerText = 'Error loading sources.';
    }
}

async function loadOutboundDetails(url) {
    const container = document.getElementById('outbound-links-list');
    const countSpan = document.getElementById('outbound-count');

    container.innerHTML = 'Loading links...';

    try {
        const res = await fetch(`/api/outbound/details?url=${encodeURIComponent(url)}`);
        const links = await res.json();

        countSpan.innerText = `(${links.length})`;

        // Group by category
        const byCat = {};
        links.forEach(l => {
            if (!byCat[l.category]) byCat[l.category] = [];
            byCat[l.category].push(l);
        });

        container.innerHTML = `<h4>Source: <a href="${url}" target="_blank">${url}</a></h4>`;

        for (const [cat, items] of Object.entries(byCat)) {
            const catDiv = document.createElement('div');
            catDiv.style.marginBottom = '20px';

            // Badge color
            let badgeColor = '#666';
            if (cat === 'Social') badgeColor = '#1da1f2';
            if (cat === 'Video') badgeColor = '#ff0000';
            if (cat === 'Tech/Code') badgeColor = '#2ebaae';

            catDiv.innerHTML = `<h5 style="border-bottom: 2px solid ${badgeColor}; display: inline-block; padding-bottom: 4px; margin-bottom: 10px;">${cat} (${items.length})</h5>`;

            const ul = document.createElement('ul');
            items.forEach(item => {
                const li = document.createElement('li');
                li.style.marginBottom = '4px';
                li.innerHTML = `<a href="${item.to_url}" target="_blank" style="color: #ccc; text-decoration: none;">${item.domain}</a> <span style="font-size: 0.8em; color: #666;">🔗</span>`;
                ul.appendChild(li);
            });
            catDiv.appendChild(ul);
            container.appendChild(catDiv);
        }
    } catch (e) {
        container.innerText = 'Error loading details.';
    }
}

// Listeners
const queryInput = document.getElementById('query');
if (queryInput) {
    queryInput.addEventListener('input', (e) => search(e.target.value));
    queryInput.addEventListener('keydown', (e) => {
        if (event.key === 'Enter') search();
    });
}

window.showNews = showNews;
window.showSearch = showSearch;
window.showSources = showSources; // Global exposure
window.updateInterval = updateInterval;
window.updateDepth = updateDepth;
window.deleteSource = deleteSource;
window.crawlSource = crawlSource;
window.addSource = addSource;
window.search = search; // Expose to HTML

// Init
// search(''); // Don't auto-search clear on load if using placeholder
// Start visualizer on load
initVisualizer();
// Start Globe
initGlobe();

// --- ASCII GLOBE ---
const globePre = document.getElementById('ascii-globe');
let globeAngle = 0;
const GlobeWidth = 60;
const GlobeHeight = 30;
const GlobeRadius = 14;

// ASCII Palette from dark to light
const density = " .-:;=+*#%@";

function initGlobe() {
    setInterval(renderGlobe, 100);
}

function renderGlobe() {
    const globePre = document.getElementById('ascii-globe'); // Get consistently
    if (!globePre) return;

    // Create buffer
    const zBuffer = new Array(GlobeWidth * GlobeHeight).fill(-Infinity);
    const chars = new Array(GlobeWidth * GlobeHeight).fill(' ');
    const colors = new Array(GlobeWidth * GlobeHeight).fill(null); // 'red' or null

    // Rotate
    globeAngle += 0.05;

    // 1. Draw Globe Sphere
    for (let lat = -Math.PI / 2; lat < Math.PI / 2; lat += 0.05) {
        for (let lon = 0; lon < 2 * Math.PI; lon += 0.05) {
            const x = GlobeRadius * Math.cos(lat) * Math.cos(lon + globeAngle);
            const y = GlobeRadius * Math.sin(lat);
            const z = GlobeRadius * Math.cos(lat) * Math.sin(lon + globeAngle);

            projectPoint(x, y, z, '.', false, zBuffer, chars, colors);
        }
    }

    // 2. Draw Active Nodes (Simulated Geo)
    const now = Date.now();
    nodes.forEach(node => {
        // Hash string to lat/lon
        let hash = 0;
        for (let i = 0; i < node.id.length; i++) hash = (hash << 5) - hash + node.id.charCodeAt(i);
        hash = Math.abs(hash); // Ensure positive

        const lat = ((hash % 180) - 90) * (Math.PI / 180);
        const lon = ((hash % 360) - 180) * (Math.PI / 180);

        const r = GlobeRadius + 1; // Slightly above surface
        const x = r * Math.cos(lat) * Math.cos(lon + globeAngle);
        const y = r * Math.sin(lat);
        const z = r * Math.cos(lat) * Math.sin(lon + globeAngle);

        // Use different chars for different types
        const isNew = (now - node.createdAt) < 2000; // Use createdAt (make sure spawnNode sets it)
        const char = isNew ? '■' : (node.color === '#a855f7' ? 'O' : '+'); // Square for new
        projectPoint(x, y, z, char, isNew, zBuffer, chars, colors);
    });

    // Render to HTML
    let htmlOutput = "";
    for (let y = 0; y < GlobeHeight; y++) {
        for (let x = 0; x < GlobeWidth; x++) {
            const idx = y * GlobeWidth + x;
            const char = chars[idx];
            if (colors[idx]) {
                htmlOutput += `<span class="ascii-red">${char}</span>`;
            } else {
                htmlOutput += char;
            }
        }
        htmlOutput += "\n";
    }
    globePre.innerHTML = htmlOutput;
}

function projectPoint(x, y, z, char, isRed, zBuffer, chars, colors) {
    // Project 3D to 2D
    // Simple ortho/perspective
    const scale = 1;
    // We center it:
    const projX = Math.floor(x * 1.5 + GlobeWidth / 2); // 1.5 aspect ratio correction for char width
    const projY = Math.floor(y + GlobeHeight / 2);

    if (projX >= 0 && projX < GlobeWidth && projY >= 0 && projY < GlobeHeight) {
        const idx = projY * GlobeWidth + projX;
        if (z > zBuffer[idx]) {
            zBuffer[idx] = z;
            chars[idx] = char;
            colors[idx] = isRed;
        }
    }
}

// Init
search('');
// Start visualizer on load
initVisualizer();
// Start Globe
initGlobe();
