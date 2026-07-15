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
  startMigration:(mappingName,batchSize,options)=>fetchJson("/migrations/start",{method:"POST",body:JSON.stringify({mappingName,batchSize,...options})}),
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
  updateTerminals:(dryRun)=>fetchJson("/migrations/update-terminals",{method:"POST",body:JSON.stringify({dryRun})}),
  startDonationMigration:(batchSize,dryRun)=>fetchJson("/migrations/start-donations",{method:"POST",body:JSON.stringify({batchSize,dryRun})}),
  startPrayNameMigration:(batchSize,dryRun)=>fetchJson("/migrations/start-praynames",{method:"POST",body:JSON.stringify({batchSize,dryRun})}),
  startAsakimDonationMigration:(batchSize,dryRun)=>fetchJson("/migrations/start-asakim-donations",{method:"POST",body:JSON.stringify({batchSize,dryRun})}),
  startGalleryMigration:(batchSize)=>fetchJson("/migrations/start-gallery",{method:"POST",body:JSON.stringify({batchSize})}),
  startPipeline:(mode)=>fetchJson("/pipeline/start",{method:"POST",body:JSON.stringify({mode})}),
  stopPipeline:()=>fetchJson("/pipeline/stop",{method:"POST"}),
  getPipelineCurrent:()=>fetchJson("/pipeline/current"),
  getPipelineRuns:()=>fetchJson("/pipeline/runs"),
};
