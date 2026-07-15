const fs=require("fs");
const path=require("path");

const CONFIG_PATH=path.join(__dirname,"../../config/pipeline.json");
const VALID_KINDS=["standard","donation","prayname","asakim"];

// Validates the declared list order satisfies every dependency (a dep must
// appear EARLIER in the array). This also rules out cycles, so no separate
// topological sort is needed — the file order IS the execution order.
function validatePipeline(steps){
  if(!Array.isArray(steps)||steps.length===0) throw new Error("pipeline.json: steps must be a non-empty array");
  var seen=new Set();
  steps.forEach(function(s,i){
    if(!s.name) throw new Error("pipeline.json: step at index "+i+" missing name");
    if(seen.has(s.name)) throw new Error("pipeline.json: duplicate step name "+s.name);
    if(VALID_KINDS.indexOf(s.kind)===-1) throw new Error("pipeline.json: step "+s.name+" has invalid kind '"+s.kind+"'");
    if(!Array.isArray(s.dependsOn)) throw new Error("pipeline.json: step "+s.name+" dependsOn must be an array");
    for(var d of s.dependsOn){
      if(!seen.has(d)){
        var existsLater=steps.some(function(x){return x.name===d;});
        throw new Error("pipeline.json: step "+s.name+" depends on "+d+" which "+
          (existsLater?"appears later in the list (order violation or cycle)":"does not exist"));
      }
    }
    seen.add(s.name);
  });
  return steps;
}

function loadPipelineConfig(){
  var raw=JSON.parse(fs.readFileSync(CONFIG_PATH,"utf8"));
  return validatePipeline(raw.steps);
}

module.exports={loadPipelineConfig,validatePipeline};
