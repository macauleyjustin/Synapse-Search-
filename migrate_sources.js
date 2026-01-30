const database = require('./database');
const fs = require('fs');
const path = require('path');

const userList = `https://michiganadvance.com/
https://www.michigannewssource.com/
https://www.michiganfarmnews.com/categories/technology
https://www.datacenterwatch.org
https://dgtlinfra.com/
https://upnorthlive.com/
https://nomegasite.com/
https://www.crawfordcountyavalanche.com/
https://www.freep.com/
https://upnorthlive.com/
https://www.cityofeastlansing.com
https://news.jrn.msu.edu
https://www.thechroniclenews.com
https://bridgemi.com
https://michiganadvance.com
https://eastlansinginfo.news
https://statesnewsroom.com/
https://www.mi-water.org/news/community
https://planetdetroit.com 
https://economictimes.indiatimes.com
https://outliermedia.org/
https://gongwer.com/
https://michiganpublic.org
https://therapidian.org
https://heraldpalladium.com
https://a2independent.com/
https://motorcitymuckraker.com
https://therapidian.org
https://tncpnews.com
https://www.michigancapitolconfidential.com
https://watershedvoice.com
https://www.record-eagle.com/
https://detroitisdifferent.com
https://theledgeledger.substack.com
https://elbertaalert.substack.com
https://sentinelleach.substack.com
https://historyofmichiganpolitics.substack.com
https://www.detroitonemillion.com/
https://eastinsider.substack.com
https://boynecitizen.com
https://www.uppermichiganssource.com/video-gallery/news/
https://mynewberrynews.com/
https://flowwateradvocates.org
https://www.michiganlcv.org/`;

async function seed() {
    await database.init();

    // 1. Try to read from sources.txt (legacy)
    let sources = [];
    try {
        const fileContent = fs.readFileSync(path.join(__dirname, 'sources.txt'), 'utf-8');
        sources = fileContent.split('\n').map(l => l.trim()).filter(l => l);
    } catch (e) {
        console.log('sources.txt not found or empty, using default list.');
    }

    // 2. Add user provided list
    const defaults = userList.split('\n').map(l => l.trim()).filter(l => l);
    sources = [...new Set([...sources, ...defaults])]; // unique

    console.log(`Seeding ${sources.length} sources...`);

    for (const url of sources) {
        let cleanUrl = url;
        if (!cleanUrl.startsWith('http')) cleanUrl = 'https://' + cleanUrl;
        await database.addSource(cleanUrl);
    }

    console.log('Seeding complete.');
}

seed();
