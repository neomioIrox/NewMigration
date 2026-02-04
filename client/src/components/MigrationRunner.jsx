import{useState,useEffect,useMemo}from"react";
import{useQuery,useMutation}from"@tanstack/react-query";
import{api}from"../api/client";
import{useWebSocket}from"../hooks/useWebSocket";

export default function MigrationRunner(){
  const[selected,setSelected]=useState("");
  const[batchSize,setBatchSize]=useState(500);
  const[runId,setRunId]=useState(null);
  const{data:mappingsData}=useQuery({queryKey:["mappings"],queryFn:api.getMappings});
  const{data:runsData}=useQuery({queryKey:["runs"],queryFn:api.getRuns,refetchInterval:10000});
  const{lastEvent}=useWebSocket();
  const startMut=useMutation({mutationFn:()=>api.startMigration(selected,batchSize)});
  const pauseMut=useMutation({mutationFn:(id)=>api.pauseMigration(id)});
  const resumeMut=useMutation({mutationFn:(id)=>api.resumeMigration(id)});

  // Track runId from WebSocket events
  useEffect(()=>{
    if(lastEvent&&lastEvent.runId){
      setRunId(lastEvent.runId);
    }
  },[lastEvent]);

  // Derive migration state from lastEvent
  const migrationState=useMemo(()=>{
    if(!lastEvent) return "idle";
    if(lastEvent.type==="started"||lastEvent.type==="progress") return "running";
    if(lastEvent.type==="paused") return "paused";
    if(lastEvent.type==="completed") return "completed";
    if(lastEvent.type==="error") return "failed";
    return "idle";
  },[lastEvent]);

  // Find paused runs from previous sessions (for resume after page refresh)
  const pausedRuns=useMemo(()=>{
    if(!runsData?.runs) return [];
    return runsData.runs.filter(r=>r.status==="paused");
  },[runsData]);

  const progress=lastEvent&&lastEvent.type==="progress"?lastEvent:null;
  const pct=progress&&progress.totalRows>0?Math.round((progress.counters.processed/progress.totalRows)*100):0;

  function handleResumePaused(id){
    setRunId(id);
    resumeMut.mutate(id);
  }

  return(
    <div>
      <h2 className="text-2xl font-bold mb-6">Migration Runner</h2>

      {/* Paused runs from previous sessions */}
      {migrationState!=="running"&&pausedRuns.length>0&&(
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-yellow-800 mb-2">מיגרציות מושהות</h3>
          {pausedRuns.map(r=>(
            <div key={r.id} className="flex items-center justify-between py-2 border-b border-yellow-100 last:border-0">
              <div className="text-sm">
                <span className="font-medium">{r.mapping_name}</span>
                <span className="text-yellow-700 mr-3"> - {r.processed_rows}/{r.total_source_rows} processed, {r.inserted_rows} inserted, {r.error_rows} errors</span>
              </div>
              <button onClick={()=>handleResumePaused(r.id)} disabled={resumeMut.isPending||migrationState==="running"}
                className="bg-green-600 text-white px-4 py-1.5 rounded hover:bg-green-700 disabled:opacity-50 text-sm">
                {resumeMut.isPending&&runId===r.id?"ממשיך...":"המשך"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Select Mapping</label>
            <select value={selected} onChange={e=>setSelected(e.target.value)} className="w-full border rounded p-2">
              <option value="">-- Select --</option>
              {(mappingsData?.mappings||[]).map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Batch Size</label>
            <input type="number" value={batchSize} onChange={e=>setBatchSize(Number(e.target.value))} min={50} max={2000} step={50} className="w-full border rounded p-2"/>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={()=>startMut.mutate()} disabled={!selected||startMut.isPending||migrationState==="running"}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
            {startMut.isPending?"מתחיל...":"התחל מיגרציה"}
          </button>
          {migrationState==="running"&&runId&&(
            <button onClick={()=>pauseMut.mutate(runId)} disabled={pauseMut.isPending}
              className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 disabled:opacity-50">
              {pauseMut.isPending?"עוצר...":"עצור"}
            </button>
          )}
          {migrationState==="paused"&&runId&&(
            <button onClick={()=>resumeMut.mutate(runId)} disabled={resumeMut.isPending}
              className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50">
              {resumeMut.isPending?"ממשיך...":"המשך"}
            </button>
          )}
        </div>
        {startMut.isError&&<p className="text-red-600 mt-2">{startMut.error.message}</p>}
        {startMut.isSuccess&&migrationState!=="running"&&<p className="text-green-600 mt-2">Migration started!</p>}
      </div>

      {/* Progress bar */}
      {progress&&<div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-semibold mb-2">Progress</h3>
        <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
          <div className="bg-blue-600 h-4 rounded-full transition-all" style={{width:pct+"%"}}/>
        </div>
        <div className="text-sm text-gray-600">{pct}% - Processed: {progress.counters.processed} / Inserted: {progress.counters.inserted} / Errors: {progress.counters.errors}</div>
      </div>}

      {/* Paused state */}
      {lastEvent&&lastEvent.type==="paused"&&<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
        <p className="text-yellow-800 font-semibold">המיגרציה הושהתה</p>
        <p className="text-sm text-yellow-700">Processed: {lastEvent.counters?.processed} | Inserted: {lastEvent.counters?.inserted} | Errors: {lastEvent.counters?.errors}</p>
        <p className="text-xs text-yellow-600 mt-1">לחץ "המשך" כדי להמשיך מהמקום שהפסקת</p>
      </div>}

      {/* Completed state */}
      {lastEvent&&lastEvent.type==="completed"&&<div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
        <p className="text-green-800 font-semibold">Migration Completed!</p>
        <p className="text-sm">Inserted: {lastEvent.counters.inserted} | Errors: {lastEvent.counters.errors}</p>
      </div>}

      {/* Error state */}
      {lastEvent&&lastEvent.type==="error"&&<div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
        <p className="text-red-800 font-semibold">Migration Failed</p>
        <p className="text-sm text-red-700">{lastEvent.error||"An error occurred"}</p>
      </div>}
    </div>
  );
}
