const database = require('./database');

const rawList = `https://michiganadvance.com/
https://www.michigannewssource.com/
https://www.michiganfarmnews.com/categories/technology
https://www.datacenterwatch.org
https://dgtlinfra.com/
upnorthlive.com
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
michiganpublic.org
therapidian.org
heraldpalladium.com
a2independent.com
motorcitymuckraker.com
therapidian.org
https://tncpnews.com
https://www.michigancapitolconfidential.com
https://watershedvoice.com
https://www.record-eagle.com/
https://detroitisdifferent.com
https://theledgeledger.substack.com
https://elbertaalert.substack.com
sentinelleach.substack.com
historyofmichiganpolitics.substack.com
https://www.detroitonemillion.com/
eastinsider.substack.com
boynecitizen.com
https://www.uppermichiganssource.com/video-gallery/news/
https://mynewberrynews.com/
https://flowwateradvocates.org
https://www.michiganlcv.org/`;

async function reset() {
    await database.init();

    console.log('Clearing old sources...');
    // We access the DB object directly or add a clear method, 
    // but for now let's just use raw SQL via the exposed wrapper if possible 
    // or just iterate and delete.
    // Ideally we should add a clearSources() to database.js but accessing the file directly is easier for a one-off.
    // Let's modify database.js to export the db object or add a clear function?
    // Actually, let's just use the fact that we can interact with the DB file.
    // Or simpler: just use the `sqlite3` lib here directly since we have the path.

    // Better: let's add `clearSources` to database.js
}
// Wait, I will modify database.js first to add clearSources.
