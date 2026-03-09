import{useState,useEffect,useMemo}from"react";
import{useQuery,useMutation}from"@tanstack/react-query";
import{api}from"../api/client";
import{useWebSocket}from"../hooks/useWebSocket";

function TerminalUpdater(){
  const[result,setResult]=useState(null);
  const dryRunMut=useMutation({mutationFn:()=>api.updateTerminals(true),onSuccess:setResult});
  const runMut=useMutation({mutationFn:()=>api.updateTerminals(false),onSuccess:setResult});
  return(
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h3 className="font-semibold mb-3">עדכון TerminalId ב-MSSQL</h3>
      <p className="text-sm text-gray-600 mb-3">מעדכן את עמודת TerminalId בטבלת products לפי קובץ TerminalProducts.xlsx</p>
      <div className="flex gap-3 mb-3">
        <button onClick={()=>dryRunMut.mutate()} disabled={dryRunMut.isPending||runMut.isPending}
          className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50 text-sm">
          {dryRunMut.isPending?"בודק...":"Dry Run (בדיקה)"}
        </button>
        <button onClick={()=>{if(window.confirm("לעדכן את TerminalId ב-DB?"))runMut.mutate();}} disabled={dryRunMut.isPending||runMut.isPending}
          className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 disabled:opacity-50 text-sm">
          {runMut.isPending?"מעדכן...":"עדכן בפועל"}
        </button>
      </div>
      {(dryRunMut.isError||runMut.isError)&&<p className="text-red-600 text-sm">{(dryRunMut.error||runMut.error)?.message}</p>}
      {result&&(
        <div className={"text-sm rounded p-3 "+(result.dryRun?"bg-blue-50 border border-blue-200":"bg-green-50 border border-green-200")}>
          {result.dryRun?(
            <div>
              <p className="font-medium">{result.dryRun?"תוצאת Dry Run:":"עודכן בהצלחה:"}</p>
              <p>סה"כ שורות באקסל: {result.totalRows} | תקינות: {result.validRows} | דולגו: {result.skipped}</p>
              <p>התפלגות: {Object.entries(result.distribution||{}).map(([k,v])=>`Terminal ${k}: ${v}`).join(", ")}</p>
            </div>
          ):(
            <div>
              <p className="font-medium text-green-800">עודכן בהצלחה!</p>
              <p>עודכנו: {result.updated} | שגיאות: {result.errors}</p>
              {result.errorDetails?.length>0&&<p className="text-red-600 mt-1">שגיאות: {result.errorDetails.map(e=>e.productsid).join(", ")}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatETA(seconds){
  if(!seconds||seconds<=0) return"--";
  var h=Math.floor(seconds/3600);
  var m=Math.floor((seconds%3600)/60);
  if(h>0) return h+"h "+m+"m";
  if(m>0) return m+"m";
  return"< 1m";
}

function DonationRunner({migrationState,runId,setRunId,lastEvent,pauseMut,resumeMut}){
  const[batchSize,setBatchSize]=useState(1000);
  const[donationResult,setDonationResult]=useState(null);
  const[startTime,setStartTime]=useState(null);

  const startMut=useMutation({mutationFn:(dryRun)=>api.startDonationMigration(batchSize,dryRun),
    onSuccess:(data)=>{setDonationResult(data);setStartTime(Date.now());}});

  // Check if current run is a donation run
  const isDonationRunning=migrationState==="running"&&lastEvent&&lastEvent.mapping==="DonationMapping";
  const isDonationPaused=migrationState==="paused"&&lastEvent&&lastEvent.mapping==="DonationMapping";
  const isDonationCompleted=lastEvent&&lastEvent.type==="completed"&&lastEvent.mapping==="DonationMapping";

  const progress=lastEvent&&(lastEvent.type==="progress"||lastEvent.type==="paused"||lastEvent.type==="completed")&&lastEvent.mapping==="DonationMapping"?lastEvent:null;
  const pct=progress&&progress.totalRows>0?Math.round((progress.counters.processed/progress.totalRows)*100):0;
  const stats=progress&&progress.stats;

  // Calculate ETA
  const remaining=progress?progress.totalRows-progress.counters.processed:0;
  const elapsed=startTime?(Date.now()-startTime)/1000:0;
  const rate=elapsed>0&&progress?progress.counters.processed/elapsed:0;
  const etaSeconds=rate>0?remaining/rate:0;

  return(
    <div className="bg-white rounded-lg shadow p-6 mb-6 border-2 border-purple-200">
      <h3 className="font-semibold mb-1 text-lg text-purple-800">מיגרציית תרומות (Donations)</h3>
      <p className="text-sm text-gray-600 mb-4">Orders (MSSQL) → donation + donationcurrencyvalue + address (MySQL) | ~1,000,000+ שורות</p>

      <div className="flex items-end gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1">Batch Size</label>
          <input type="number" value={batchSize} onChange={e=>setBatchSize(Number(e.target.value))}
            min={100} max={5000} step={100} className="border rounded p-2 w-32"
            disabled={isDonationRunning}/>
        </div>
        <button onClick={()=>startMut.mutate(true)} disabled={startMut.isPending||isDonationRunning}
          className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50 text-sm">
          {startMut.isPending?"...":"Dry Run"}
        </button>
        <button onClick={()=>{if(window.confirm("להתחיל מיגרציית תרומות? (מעל מיליון שורות, עלול לקחת שעות)"))startMut.mutate(false);}}
          disabled={startMut.isPending||isDonationRunning}
          className="bg-purple-600 text-white px-5 py-2 rounded hover:bg-purple-700 disabled:opacity-50 font-medium">
          {startMut.isPending?"מתחיל...":"התחל מיגרציית תרומות"}
        </button>
        {isDonationRunning&&runId&&(
          <button onClick={()=>pauseMut.mutate(runId)} disabled={pauseMut.isPending}
            className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700 disabled:opacity-50">
            {pauseMut.isPending?"עוצר...":"עצור"}
          </button>
        )}
        {isDonationPaused&&runId&&(
          <button onClick={()=>resumeMut.mutate(runId)} disabled={resumeMut.isPending}
            className="bg-green-600 text-white px-5 py-2 rounded hover:bg-green-700 disabled:opacity-50">
            {resumeMut.isPending?"ממשיך...":"המשך"}
          </button>
        )}
      </div>

      {startMut.isError&&<p className="text-red-600 text-sm mb-3">{startMut.error.message}</p>}
      {donationResult&&!isDonationRunning&&!isDonationCompleted&&<p className="text-green-600 text-sm mb-3">{donationResult.message} (batchSize: {donationResult.batchSize})</p>}

      {/* Progress */}
      {progress&&(
        <div className="mt-3">
          {/* Main stats row */}
          <div className="grid grid-cols-4 gap-3 mb-3 text-center">
            <div className="bg-purple-50 rounded p-2">
              <div className="text-lg font-bold text-purple-700">{progress.counters.inserted?.toLocaleString()}</div>
              <div className="text-xs text-gray-500">הוכנסו</div>
            </div>
            <div className="bg-blue-50 rounded p-2">
              <div className="text-lg font-bold text-blue-700">{remaining.toLocaleString()}</div>
              <div className="text-xs text-gray-500">נותרו</div>
            </div>
            <div className="bg-orange-50 rounded p-2">
              <div className="text-lg font-bold text-orange-700">{rate>0?Math.round(rate).toLocaleString():"--"}</div>
              <div className="text-xs text-gray-500">שורות/שנייה</div>
            </div>
            <div className="bg-green-50 rounded p-2">
              <div className="text-lg font-bold text-green-700">{formatETA(etaSeconds)}</div>
              <div className="text-xs text-gray-500">זמן משוער</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>{pct}% ({progress.counters.processed?.toLocaleString()} / {progress.totalRows?.toLocaleString()})</span>
            <span>{progress.counters.errors>0?"שגיאות: "+progress.counters.errors.toLocaleString():""}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 mb-3">
            <div className={"h-4 rounded-full transition-all "+(isDonationPaused?"bg-yellow-500":isDonationCompleted?"bg-green-500":"bg-purple-600")} style={{width:Math.max(pct,1)+"%"}}/>
          </div>

          {/* Detailed stats */}
          {stats&&(
            <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 bg-gray-50 rounded p-3">
              <div>כתובות נוצרו: {stats.addressesCreated?.toLocaleString()}</div>
              <div>ערכי מטבע: {stats.currencyValuesInserted?.toLocaleString()}</div>
              <div>ItemId מתפילה: {stats.itemIdStats?.fromPrayer?.toLocaleString()}</div>
              <div>ItemId ממוצר: {stats.itemIdStats?.fromProduct?.toLocaleString()}</div>
              <div>ItemId ברירת מחדל: {stats.itemIdStats?.orphaned?.toLocaleString()}</div>
              <div>דילוגים: {progress.counters.skipped?.toLocaleString()}</div>
            </div>
          )}
        </div>
      )}

      {isDonationPaused&&(
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-3">
          <p className="text-yellow-800 font-semibold text-sm">מיגרציה מושהית - ניתן להמשיך מאותו מקום ({progress?.counters?.processed?.toLocaleString()} שורות עובדו)</p>
        </div>
      )}

      {isDonationCompleted&&(
        <div className="bg-green-50 border border-green-200 rounded p-3 mt-3">
          <p className="text-green-800 font-semibold text-sm">מיגרציית תרומות הושלמה! {progress?.counters?.inserted?.toLocaleString()} תרומות הוכנסו</p>
        </div>
      )}

      {lastEvent&&lastEvent.type==="error"&&lastEvent.mapping==="DonationMapping"&&(
        <div className="bg-red-50 border border-red-200 rounded p-3 mt-3">
          <p className="text-red-800 font-semibold text-sm">שגיאה: {lastEvent.error}</p>
        </div>
      )}
    </div>
  );
}

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

      {/* Donation migration */}
      <DonationRunner migrationState={migrationState} runId={runId} setRunId={setRunId} lastEvent={lastEvent} pauseMut={pauseMut} resumeMut={resumeMut}/>

      {/* Terminal updater */}
      <TerminalUpdater/>

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
