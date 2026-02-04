const BASE="/api";

async function fetchJson(url,options){
  var res=await fetch(BASE+url,{headers:{"Content-Type":"application/json"},...options});
  if(!res.ok) throw new Error("API error: "+res.status);
  return res.json();
}

export const api={
  testConnections:()=>fetchJson("/connections/test"),
  getMappings:()=>fetchJson("/mappings"),
  getMapping:(name)=>fetchJson("/mappings/"+name),
  getRuns:()=>fetchJson("/migrations"),
  startMigration:(mappingName,batchSize)=>fetchJson("/migrations/start",{method:"POST",body:JSON.stringify({mappingName,batchSize})}),
  pauseMigration:(id)=>fetchJson("/migrations/"+id+"/pause",{method:"POST"}),
  resumeMigration:(id)=>fetchJson("/migrations/"+id+"/resume",{method:"POST"}),
  restartMigration:(id)=>fetchJson("/migrations/"+id+"/restart",{method:"POST"}),
  getProgress:(id)=>fetchJson("/migrations/"+id+"/progress"),
  getDashboard:()=>fetchJson("/status/dashboard"),
  getIdMappings:(params)=>fetchJson("/id-mappings?"+new URLSearchParams(params)),
  getEntityTypes:()=>fetchJson("/id-mappings/entity-types"),
  lookupId:(entity,sourceId)=>fetchJson("/id-mappings/"+entity+"/"+sourceId),
  getErrors:(params)=>fetchJson("/errors?"+new URLSearchParams(params)),
  getHealth:()=>fetchJson("/health"),
  clearHistory:()=>fetchJson("/migrations/history",{method:"DELETE"}),
};
