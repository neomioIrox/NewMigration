const trackerDb=require("../db/mysql-tracker");
const logger=require("../logger");
const fkCache=new Map();

async function preloadFKCache(entityType){
  const [rows]=await trackerDb.query(
    "SELECT source_id,target_id FROM id_mappings WHERE entity_type=?",
    [entityType]);
  const map=new Map();
  rows.forEach(r=>map.set(String(r.source_id),String(r.target_id)));
  fkCache.set(entityType,map);
  logger.info("FK cache loaded: "+entityType+" "+rows.length+" entries");
  return map;
}

async function resolveFK(entityType,sourceId){
  if(sourceId===null||sourceId===undefined) return null;
  var sid=String(sourceId);
  var cache=fkCache.get(entityType);
  if(!cache) cache=await preloadFKCache(entityType);
  var tid=cache.get(sid);
  if(tid!==undefined) return tid;
  try{
    const [rows]=await trackerDb.query("SELECT target_id FROM id_mappings WHERE entity_type=? AND source_id=?",[entityType,sid]);
    if(rows.length>0){cache.set(sid,String(rows[0].target_id));return String(rows[0].target_id);}
  }catch(err){logger.error("FK resolve failed",{entityType,sourceId:sid,error:err.message});}
  return null;
}

function resolveStaticFK(staticMap,sourceValue){
  if(sourceValue===null||sourceValue===undefined) return null;
  var key=String(sourceValue);
  return staticMap[key]!==undefined?staticMap[key]:null;
}

function clearFKCache(){fkCache.clear();}

module.exports={preloadFKCache,resolveFK,resolveStaticFK,clearFKCache};
