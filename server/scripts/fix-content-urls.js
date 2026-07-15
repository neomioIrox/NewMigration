// Repairs EntityContentItem rows already written with the broken urlReplace
// (href -> routerLink="/donate") and unrewritten legacy image paths.
// Regenerates the content text from the SOURCE products.Description via the
// same rewriter the engine now uses, then updates ItemDefinition in place.
//
// DRY-RUN by default (no writes). Usage:
//   node server/scripts/fix-content-urls.js            # dry-run, full report
//   node server/scripts/fix-content-urls.js --limit 20 # dry-run on first 20 mappings
//   node server/scripts/fix-content-urls.js --apply    # WRITE changes to target RDS
const mysql=require("mysql2/promise");
const config=require("../src/config/database");
const mssqlDb=require("../src/db/mssql");
const {rewriteContentUrls}=require("../src/engine/content-url-rewriter");

const APPLY=process.argv.includes("--apply");
const limitArg=process.argv.indexOf("--limit");
const LIMIT=limitArg>-1?parseInt(process.argv[limitArg+1],10):0;

const LANG_COL={hebrew:"Description",english:"Description_en",french:"Description_fr"};

async function main(){
  const tracker=await mysql.createConnection(config.mysqlTracker);
  const target=await mysql.createConnection(config.mysqlTarget);

  // Latest EntityContent mapping per (lang, source product): re-runs may have
  // recorded older rows whose content was since deleted; UPDATE just hits 0 rows.
  const [maps]=await tracker.query(
    "SELECT entity_type,source_id,target_id FROM id_mappings "+
    "WHERE entity_type IN ('EntityContent_hebrew','EntityContent_english','EntityContent_french') "+
    "ORDER BY id"+(LIMIT?" LIMIT "+LIMIT:""));
  console.log((APPLY?"APPLY":"DRY-RUN")+": "+maps.length+" EntityContent mappings to check");

  const stats={checked:0,changed:0,unchanged:0,srcMissing:0,rowMissing:0,updated:0,errors:0};
  const samples=[];

  for(const m of maps){
    stats.checked++;
    const lang=m.entity_type.replace("EntityContent_","");
    const col=LANG_COL[lang];
    try{
      const src=await mssqlDb.query(
        "SELECT CAST("+col+" AS NVARCHAR(MAX)) AS D FROM products WHERE ProductsID="+Number(m.source_id));
      const desc=src.recordset[0]&&src.recordset[0].D;
      if(!desc||!String(desc).trim()){stats.srcMissing++;continue;}

      const newText=rewriteContentUrls(String(desc));
      const [rows]=await target.query(
        "SELECT Id,ItemDefinition FROM EntityContentItem WHERE ContentId=? AND ItemType=11",[m.target_id]);
      if(!rows.length){stats.rowMissing++;continue;}

      for(const row of rows){
        let curText=null;
        try{curText=JSON.parse(row.ItemDefinition).Text;}catch(e){}
        if(curText===newText){stats.unchanged++;continue;}
        stats.changed++;
        if(samples.length<5) samples.push({contentId:m.target_id,sourceId:m.source_id,lang,
          before:String(curText).substring(0,200),after:newText.substring(0,200)});
        if(APPLY){
          const [res]=await target.query(
            "UPDATE EntityContentItem SET ItemDefinition=?,UpdatedAt=NOW(),UpdatedBy=1 WHERE Id=?",
            [JSON.stringify({Text:newText}),row.Id]);
          stats.updated+=res.affectedRows;
        }
      }
    }catch(err){
      stats.errors++;
      console.error("ERROR source_id="+m.source_id+" lang="+lang+": "+err.message);
    }
  }

  console.log("\n=== "+(APPLY?"APPLY":"DRY-RUN")+" summary ===");
  console.log(JSON.stringify(stats,null,2));
  if(samples.length){
    console.log("\n=== sample diffs ===");
    for(const s of samples){
      console.log("\n-- ContentId "+s.contentId+" (source "+s.sourceId+", "+s.lang+")");
      console.log("BEFORE: "+s.before);
      console.log("AFTER : "+s.after);
    }
  }
  if(!APPLY) console.log("\nDry-run only. Re-run with --apply to write changes.");

  await tracker.end();await target.end();await mssqlDb.close();
}

main().catch(e=>{console.error("FATAL:",e.message);process.exit(1);});
