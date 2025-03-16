const axios=require('axios'),cheerio=require('cheerio'),sqlite3=require('sqlite3').verbose(),colors=require('colors');
const db=new sqlite3.Database('websites.db');

db.serialize(()=>{
    db.run(`CREATE TABLE IF NOT EXISTS articles(id INTEGER PRIMARY KEY AUTOINCREMENT,url TEXT UNIQUE,title TEXT,description TEXT,keywords TEXT,date TEXT,error TEXT,processed INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS queue(url TEXT UNIQUE)`);
    db.run(`CREATE TABLE IF NOT EXISTS processed(url TEXT UNIQUE,timestamp INTEGER)`);
});

let startTime=Date.now(),processedCount=0;

async function scrapeArticle(url){
    const isProcessed=await new Promise(r=>db.get('SELECT url FROM processed WHERE url=?',[url],(e,row)=>r(!!row)));
    if(isProcessed)return processNextUrl();
    try{
        const r=await axios.get(url),$=cheerio.load(r.data);
        const title=$('meta[property="og:title"]').attr('content')||$('title').text();
        const description=$('meta[property="og:description"]').attr('content')||$('meta[name="description"]').attr('content');
        const keywords=$('meta[name="keywords"]').attr('content');
        const date=$('meta[property="article:published_time"]').attr('content')||new Date().toISOString();
        $('a').each((i,l)=>{const h=$(l).attr('href');h&&h.startsWith('https://www.lemonde.fr')&&db.run('INSERT OR IGNORE INTO queue(url)VALUES(?)',[h])});
        db.run(`INSERT OR IGNORE INTO articles(url,title,description,keywords,date,error)VALUES(?,?,?,?,?,?)`,[url,title,description,keywords,date,null]);
        const[q,p]=await Promise.all([new Promise(r=>db.get('SELECT COUNT(*)as count FROM queue',(e,row)=>r(row?row.count:0))),new Promise(r=>db.get('SELECT COUNT(*)as count FROM processed',(e,row)=>r(row?row.count:0)))]);
        console.log(`✅ Page traitée: ${url}`.green);
        console.log(`📊 Stats: ${p} pages traitées, ${q} pages en attente, ${(++processedCount/((Date.now()-startTime)/60000)).toFixed(2)} pages/minute`.cyan);
        db.run('INSERT OR IGNORE INTO processed(url,timestamp)VALUES(?,?)',[url,Date.now()]);
        return processNextUrl();
    }catch(e){
        console.error(`❌ Erreur lors du traitement de ${url}:`.red,e.message);
        db.run(`INSERT OR IGNORE INTO articles(url,error)VALUES(?,?)`,[url,e.message]);
        db.run('INSERT OR IGNORE INTO processed(url,timestamp)VALUES(?,?)',[url,Date.now()]);
        return processNextUrl();
    }
}

async function processNextUrl(){
    const n=await new Promise(r=>db.get('SELECT url FROM queue LIMIT 1',(e,row)=>{row&&db.run('DELETE FROM queue WHERE url=?',[row.url]);r(row?row.url:null)}));
    if(n){console.log(`🔄 Passage à: ${n}`.yellow);return scrapeArticle(n)}
}

async function start(){
    console.log('🚀 Démarrage du scraping...'.blue);
    await scrapeArticle('https://fr.wikipedia.org/wiki/Wikip%C3%A9dia:Accueil_principal');
}

start().then(()=>{
    console.log('✨ Scraping terminé!'.green);
    db.close();
}).catch(console.error);