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

const START_MODES=[
  {value:"continue",label:"המשך מהנקודה האחרונה"},
  {value:"fresh",label:"התחל מאפס (איפוס נקודת ההמשך)"},
  {value:"gapfill",label:"השלמת חורים (gap-fill)"}
];

function StartModeSelect({value,onChange,disabled,allowGapfill}){
  const modes=allowGapfill?START_MODES:START_MODES.filter(m=>m.value!=="gapfill");
  return(
    <div>
      <label className="block text-sm font-medium mb-1">מצב התחלה</label>
      <select value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} className="border rounded p-2">
        {modes.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
    </div>
  );
}

function DonationRunner({migrationState,runId,setRunId,lastEvent,pauseMut,resumeMut}){
  const[batchSize,setBatchSize]=useState(1000);
  const[startMode,setStartMode]=useState("continue");
  const[donationResult,setDonationResult]=useState(null);
  const[startTime,setStartTime]=useState(null);

  const startMut=useMutation({mutationFn:(dryRun)=>api.startDonationMigration(batchSize,dryRun,startMode),
    onSuccess:(data)=>{setDonationResult(data);setStartTime(Date.now());setStartMode("continue");}});

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
        <StartModeSelect value={startMode} onChange={setStartMode} disabled={isDonationRunning} allowGapfill={false}/>
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

function PrayNameRunner({migrationState,runId,setRunId,lastEvent,pauseMut,resumeMut}){
  const[batchSize,setBatchSize]=useState(2000);
  const[startMode,setStartMode]=useState("continue");
  const[prayResult,setPrayResult]=useState(null);
  const[startTime,setStartTime]=useState(null);

  const startMut=useMutation({mutationFn:(dryRun)=>api.startPrayNameMigration(batchSize,dryRun,startMode),
    onSuccess:(data)=>{setPrayResult(data);setStartTime(Date.now());setStartMode("continue");}});

  const isPrayRunning=migrationState==="running"&&lastEvent&&lastEvent.mapping==="PrayNameMapping";
  const isPrayPaused=migrationState==="paused"&&lastEvent&&lastEvent.mapping==="PrayNameMapping";
  const isPrayCompleted=lastEvent&&lastEvent.type==="completed"&&lastEvent.mapping==="PrayNameMapping";

  const progress=lastEvent&&(lastEvent.type==="progress"||lastEvent.type==="paused"||lastEvent.type==="completed")&&lastEvent.mapping==="PrayNameMapping"?lastEvent:null;
  const pct=progress&&progress.totalRows>0?Math.round((progress.counters.processed/progress.totalRows)*100):0;
  const stats=progress&&progress.stats;

  const remaining=progress?progress.totalRows-progress.counters.processed:0;
  const elapsed=startTime?(Date.now()-startTime)/1000:0;
  const rate=elapsed>0&&progress?progress.counters.processed/elapsed:0;
  const etaSeconds=rate>0?remaining/rate:0;

  return(
    <div className="bg-white rounded-lg shadow p-6 mb-6 border-2 border-teal-200">
      <h3 className="font-semibold mb-1 text-lg text-teal-800">מיגרציית שמות לתפילה (PrayerNames → PrayName)</h3>
      <p className="text-sm text-gray-600 mb-4">PrayerNames (MSSQL) → PrayName (MySQL) | ~760,000 שורות | Bulk INSERT</p>

      <div className="flex items-end gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1">Batch Size</label>
          <input type="number" value={batchSize} onChange={e=>setBatchSize(Number(e.target.value))}
            min={500} max={5000} step={500} className="border rounded p-2 w-32"
            disabled={isPrayRunning}/>
        </div>
        <StartModeSelect value={startMode} onChange={setStartMode} disabled={isPrayRunning} allowGapfill={false}/>
        <button onClick={()=>startMut.mutate(true)} disabled={startMut.isPending||isPrayRunning}
          className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50 text-sm">
          {startMut.isPending?"...":"Dry Run"}
        </button>
        <button onClick={()=>{if(window.confirm("להתחיל מיגרציית שמות לתפילה? (~760K שורות)"))startMut.mutate(false);}}
          disabled={startMut.isPending||isPrayRunning}
          className="bg-teal-600 text-white px-5 py-2 rounded hover:bg-teal-700 disabled:opacity-50 font-medium">
          {startMut.isPending?"מתחיל...":"התחל מיגרציית שמות לתפילה"}
        </button>
        {isPrayRunning&&runId&&(
          <button onClick={()=>pauseMut.mutate(runId)} disabled={pauseMut.isPending}
            className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700 disabled:opacity-50">
            {pauseMut.isPending?"עוצר...":"עצור"}
          </button>
        )}
        {isPrayPaused&&runId&&(
          <button onClick={()=>resumeMut.mutate(runId)} disabled={resumeMut.isPending}
            className="bg-green-600 text-white px-5 py-2 rounded hover:bg-green-700 disabled:opacity-50">
            {resumeMut.isPending?"ממשיך...":"המשך"}
          </button>
        )}
      </div>

      {startMut.isError&&<p className="text-red-600 text-sm mb-3">{startMut.error.message}</p>}
      {prayResult&&!isPrayRunning&&!isPrayCompleted&&<p className="text-green-600 text-sm mb-3">{prayResult.message} (batchSize: {prayResult.batchSize})</p>}

      {progress&&(
        <div className="mt-3">
          <div className="grid grid-cols-4 gap-3 mb-3 text-center">
            <div className="bg-teal-50 rounded p-2">
              <div className="text-lg font-bold text-teal-700">{progress.counters.inserted?.toLocaleString()}</div>
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

          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>{pct}% ({progress.counters.processed?.toLocaleString()} / {progress.totalRows?.toLocaleString()})</span>
            <span>
              {progress.counters.skipped>0?"דולגו (FK חסר): "+progress.counters.skipped.toLocaleString()+" | ":""}
              {progress.counters.errors>0?"שגיאות: "+progress.counters.errors.toLocaleString():""}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 mb-3">
            <div className={"h-4 rounded-full transition-all "+(isPrayPaused?"bg-yellow-500":isPrayCompleted?"bg-green-500":"bg-teal-600")} style={{width:Math.max(pct,1)+"%"}}/>
          </div>

          {stats&&(
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 bg-gray-50 rounded p-3">
              <div>FK חסר (דולגו): {stats.fkMissing?.toLocaleString()}</div>
              <div>שם ריק (הוכנס כ-""): {stats.nullName?.toLocaleString()}</div>
            </div>
          )}
        </div>
      )}

      {isPrayPaused&&(
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-3">
          <p className="text-yellow-800 font-semibold text-sm">מיגרציה מושהית - ניתן להמשיך מאותו מקום ({progress?.counters?.processed?.toLocaleString()} שורות עובדו)</p>
        </div>
      )}

      {isPrayCompleted&&(
        <div className="bg-green-50 border border-green-200 rounded p-3 mt-3">
          <p className="text-green-800 font-semibold text-sm">מיגרציית שמות לתפילה הושלמה! {progress?.counters?.inserted?.toLocaleString()} שורות הוכנסו</p>
        </div>
      )}

      {lastEvent&&lastEvent.type==="error"&&lastEvent.mapping==="PrayNameMapping"&&(
        <div className="bg-red-50 border border-red-200 rounded p-3 mt-3">
          <p className="text-red-800 font-semibold text-sm">שגיאה: {lastEvent.error}</p>
        </div>
      )}
    </div>
  );
}

const GALLERY_STAGES=[
  {name:"GalleryMapping_Images",label:"גלריות תמונות",detail:"Galeries → Gallery + לוקליזציה (79)"},
  {name:"GalleryMediaMapping_Images",label:"תמונות הגלריות",detail:"GaleryPics → Media + GalleryMedia (1,230) + תמונת שער"},
  {name:"VideoGalleryMediaMapping",label:"גלריית וידאו",detail:"Videos → VideoGalleryMedia + LinkSetting (127)"}
];

function GalleryRunner({migrationState,runId,lastEvent,pauseMut,resumeMut}){
  const[result,setResult]=useState(null);
  const[stageResults,setStageResults]=useState({});

  const startMut=useMutation({mutationFn:()=>api.startGalleryMigration(500),
    onSuccess:(data)=>{setResult(data);setStageResults({});}});

  const stageIdx=lastEvent?GALLERY_STAGES.findIndex(s=>s.name===lastEvent.mapping):-1;
  const isGalleryEvent=stageIdx>-1;
  const isRunning=migrationState==="running"&&isGalleryEvent;
  const isPaused=migrationState==="paused"&&isGalleryEvent;
  const isError=lastEvent&&lastEvent.type==="error"&&isGalleryEvent;
  const chainDone=lastEvent&&lastEvent.type==="completed"&&lastEvent.mapping===GALLERY_STAGES[2].name;

  // Accumulate per-stage completion results
  useEffect(()=>{
    if(lastEvent&&lastEvent.type==="completed"&&GALLERY_STAGES.some(s=>s.name===lastEvent.mapping)){
      setStageResults(prev=>({...prev,[lastEvent.mapping]:{counters:lastEvent.counters,skippedStage:lastEvent.skippedStage}}));
    }
  },[lastEvent]);

  const progress=lastEvent&&isGalleryEvent&&(lastEvent.type==="progress"||lastEvent.type==="paused"||lastEvent.type==="completed")?lastEvent:null;
  const pct=progress&&progress.totalRows>0?Math.round((progress.counters.processed/progress.totalRows)*100):0;

  function stageStatus(i){
    const done=stageResults[GALLERY_STAGES[i].name];
    if(done) return done.skippedStage?"skipped":"done";
    if(i===stageIdx&&(isRunning)) return "running";
    if(i===stageIdx&&isPaused) return "paused";
    if(i===stageIdx&&isError) return "error";
    return "pending";
  }

  const STATUS_ICON={done:"✓",skipped:"↷",running:"⏳",paused:"⏸",error:"✗",pending:"○"};
  const STATUS_COLOR={done:"text-green-700",skipped:"text-blue-600",running:"text-pink-700 font-bold",paused:"text-yellow-700",error:"text-red-700",pending:"text-gray-400"};

  return(
    <div className="bg-white rounded-lg shadow p-6 mb-6 border-2 border-pink-200">
      <h3 className="font-semibold mb-1 text-lg text-pink-800">מיגרציית גלריות (תמונות + וידאו)</h3>
      <p className="text-sm text-gray-600 mb-4">שלושה שלבים ברצף אוטומטי. שלבים שכבר הושלמו מדולגים — הכפתור משמש גם כ"המשך".</p>

      <div className="flex items-end gap-4 mb-4">
        <button onClick={()=>{if(window.confirm("להתחיל מיגרציית גלריות? (תמונות + וידאו, ~1,440 שורות מקור)"))startMut.mutate();}}
          disabled={startMut.isPending||migrationState==="running"}
          className="bg-pink-600 text-white px-5 py-2 rounded hover:bg-pink-700 disabled:opacity-50 font-medium">
          {startMut.isPending?"מתחיל...":"התחל מיגרציית גלריות"}
        </button>
        {isRunning&&runId&&(
          <button onClick={()=>pauseMut.mutate(runId)} disabled={pauseMut.isPending}
            className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700 disabled:opacity-50">
            {pauseMut.isPending?"עוצר...":"עצור"}
          </button>
        )}
        {isPaused&&runId&&(
          <button onClick={()=>resumeMut.mutate(runId)} disabled={resumeMut.isPending}
            className="bg-green-600 text-white px-5 py-2 rounded hover:bg-green-700 disabled:opacity-50">
            {resumeMut.isPending?"ממשיך...":"המשך שלב נוכחי"}
          </button>
        )}
      </div>

      {startMut.isError&&<p className="text-red-600 text-sm mb-3">{startMut.error.message}</p>}
      {result&&!isRunning&&!chainDone&&!isGalleryEvent&&<p className="text-green-600 text-sm mb-3">{result.message}</p>}

      {/* Stage list */}
      <div className="bg-gray-50 rounded p-3 mb-3">
        {GALLERY_STAGES.map((s,i)=>{
          const st=stageStatus(i);
          const res=stageResults[s.name];
          return(
            <div key={s.name} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
              <div className="text-sm">
                <span className={"ml-2 "+STATUS_COLOR[st]}>{STATUS_ICON[st]}</span>
                <span className="font-medium">{i+1}. {s.label}</span>
                <span className="text-gray-500 text-xs mr-2"> — {s.detail}</span>
              </div>
              <div className="text-xs text-gray-600">
                {st==="skipped"&&"כבר הוגר ("+(res?.counters?.processed??"")+") — דולג"}
                {st==="done"&&"הושלם: "+(res?.counters?.inserted?.toLocaleString()??"")+" הוכנסו"+(res?.counters?.errors>0?", "+res.counters.errors+" שגיאות":"")}
                {st==="running"&&i===stageIdx&&progress&&progress.counters.processed?.toLocaleString()+" / "+progress.totalRows?.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Current stage progress bar */}
      {progress&&!chainDone&&(
        <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
          <div className={"h-3 rounded-full transition-all "+(isPaused?"bg-yellow-500":"bg-pink-600")} style={{width:Math.max(pct,1)+"%"}}/>
        </div>
      )}

      {isPaused&&(
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-2">
          <p className="text-yellow-800 text-sm font-semibold">השלב הנוכחי מושהה.</p>
          <p className="text-yellow-700 text-xs mt-1">"המשך שלב נוכחי" משלים את השלב הזה בלבד; בסיומו לחצי שוב על "התחל מיגרציית גלריות" — שלבים שהושלמו ידולגו אוטומטית.</p>
        </div>
      )}

      {chainDone&&(
        <div className="bg-green-50 border border-green-200 rounded p-3 mt-2">
          <p className="text-green-800 font-semibold text-sm">מיגרציית הגלריות הושלמה — כל שלושת השלבים בוצעו!</p>
        </div>
      )}

      {isError&&(
        <div className="bg-red-50 border border-red-200 rounded p-3 mt-2">
          <p className="text-red-800 font-semibold text-sm">שגיאה בשלב {stageIdx+1} ({GALLERY_STAGES[stageIdx]?.label}): {lastEvent.error}</p>
        </div>
      )}
    </div>
  );
}

function AsakimDonationRunner({migrationState,runId,setRunId,lastEvent,pauseMut,resumeMut}){
  const[batchSize,setBatchSize]=useState(2000);
  const[startMode,setStartMode]=useState("continue");
  const[asakimResult,setAsakimResult]=useState(null);
  const[startTime,setStartTime]=useState(null);

  const startMut=useMutation({mutationFn:(dryRun)=>api.startAsakimDonationMigration(batchSize,dryRun,startMode),
    onSuccess:(data)=>{setAsakimResult(data);setStartTime(Date.now());setStartMode("continue");}});

  const isRunning=migrationState==="running"&&lastEvent&&lastEvent.mapping==="AsakimDonationMapping";
  const isPaused=migrationState==="paused"&&lastEvent&&lastEvent.mapping==="AsakimDonationMapping";
  const isCompleted=lastEvent&&lastEvent.type==="completed"&&lastEvent.mapping==="AsakimDonationMapping";

  const progress=lastEvent&&(lastEvent.type==="progress"||lastEvent.type==="paused"||lastEvent.type==="completed")&&lastEvent.mapping==="AsakimDonationMapping"?lastEvent:null;
  const pct=progress&&progress.totalRows>0?Math.round((progress.counters.processed/progress.totalRows)*100):0;

  const remaining=progress?progress.totalRows-progress.counters.processed:0;
  const elapsed=startTime?(Date.now()-startTime)/1000:0;
  const rate=elapsed>0&&progress?progress.counters.processed/elapsed:0;
  const etaSeconds=rate>0?remaining/rate:0;

  return(
    <div className="bg-white rounded-lg shadow p-6 mb-6 border-2 border-amber-200">
      <h3 className="font-semibold mb-1 text-lg text-amber-800">מיגרציית תרומות עסקים (AsakimDonations)</h3>
      <p className="text-sm text-gray-600 mb-4">AsakimDonations (MSSQL) → AsakimDonation (MySQL) | ~106,069 שורות בתחום (מתוך 120,128) | Bulk INSERT</p>

      <div className="flex items-end gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1">Batch Size</label>
          <input type="number" value={batchSize} onChange={e=>setBatchSize(Number(e.target.value))}
            min={500} max={5000} step={500} className="border rounded p-2 w-32"
            disabled={isRunning}/>
        </div>
        <StartModeSelect value={startMode} onChange={setStartMode} disabled={isRunning} allowGapfill={false}/>
        <button onClick={()=>startMut.mutate(true)} disabled={startMut.isPending||isRunning}
          className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50 text-sm">
          {startMut.isPending?"...":"Dry Run"}
        </button>
        <button onClick={()=>{if(window.confirm("להתחיל מיגרציית תרומות עסקים? (~87K שורות)"))startMut.mutate(false);}}
          disabled={startMut.isPending||isRunning}
          className="bg-amber-600 text-white px-5 py-2 rounded hover:bg-amber-700 disabled:opacity-50 font-medium">
          {startMut.isPending?"מתחיל...":"התחל מיגרציית תרומות עסקים"}
        </button>
        {isRunning&&runId&&(
          <button onClick={()=>pauseMut.mutate(runId)} disabled={pauseMut.isPending}
            className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700 disabled:opacity-50">
            {pauseMut.isPending?"עוצר...":"עצור"}
          </button>
        )}
        {isPaused&&runId&&(
          <button onClick={()=>resumeMut.mutate(runId)} disabled={resumeMut.isPending}
            className="bg-green-600 text-white px-5 py-2 rounded hover:bg-green-700 disabled:opacity-50">
            {resumeMut.isPending?"ממשיך...":"המשך"}
          </button>
        )}
      </div>

      {startMut.isError&&<p className="text-red-600 text-sm mb-3">{startMut.error.message}</p>}
      {asakimResult&&!isRunning&&!isCompleted&&<p className="text-green-600 text-sm mb-3">{asakimResult.message} (batchSize: {asakimResult.batchSize})</p>}

      {progress&&(
        <div className="mt-3">
          <div className="grid grid-cols-4 gap-3 mb-3 text-center">
            <div className="bg-amber-50 rounded p-2">
              <div className="text-lg font-bold text-amber-700">{progress.counters.inserted?.toLocaleString()}</div>
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

          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>{pct}% ({progress.counters.processed?.toLocaleString()} / {progress.totalRows?.toLocaleString()})</span>
            <span>{progress.counters.errors>0?"שגיאות: "+progress.counters.errors.toLocaleString():""}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 mb-3">
            <div className={"h-4 rounded-full transition-all "+(isPaused?"bg-yellow-500":isCompleted?"bg-green-500":"bg-amber-600")} style={{width:Math.max(pct,1)+"%"}}/>
          </div>
        </div>
      )}

      {isPaused&&(
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-3">
          <p className="text-yellow-800 font-semibold text-sm">מיגרציה מושהית - ניתן להמשיך מאותו מקום ({progress?.counters?.processed?.toLocaleString()} שורות עובדו)</p>
        </div>
      )}

      {isCompleted&&(
        <div className="bg-green-50 border border-green-200 rounded p-3 mt-3">
          <p className="text-green-800 font-semibold text-sm">מיגרציית תרומות עסקים הושלמה! {progress?.counters?.inserted?.toLocaleString()} שורות הוכנסו</p>
        </div>
      )}

      {lastEvent&&lastEvent.type==="error"&&lastEvent.mapping==="AsakimDonationMapping"&&(
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
  const[startMode,setStartMode]=useState("continue");
  const[runId,setRunId]=useState(null);
  const{data:mappingsData}=useQuery({queryKey:["mappings"],queryFn:api.getMappings});
  const{data:runsData}=useQuery({queryKey:["runs"],queryFn:api.getRuns,refetchInterval:10000});
  const{lastEvent}=useWebSocket();
  const startMut=useMutation({mutationFn:(options)=>api.startMigration(options?.mappingName||selected,options?.batchSize||batchSize,options?.extra),
    onSuccess:()=>setStartMode("continue")});
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

      {/* PrayName migration */}
      <PrayNameRunner migrationState={migrationState} runId={runId} setRunId={setRunId} lastEvent={lastEvent} pauseMut={pauseMut} resumeMut={resumeMut}/>

      {/* AsakimDonation migration */}
      <AsakimDonationRunner migrationState={migrationState} runId={runId} setRunId={setRunId} lastEvent={lastEvent} pauseMut={pauseMut} resumeMut={resumeMut}/>

      {/* Gallery migration (images + videos chain) */}
      <GalleryRunner migrationState={migrationState} runId={runId} lastEvent={lastEvent} pauseMut={pauseMut} resumeMut={resumeMut}/>

      {/* Terminal updater */}
      <TerminalUpdater/>

      {/* Quick: last 20 funds */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 border border-teal-200 flex items-center justify-between">
        <div>
          <span className="font-semibold text-teal-800 text-sm">בדיקה מהירה: </span>
          <span className="text-sm text-gray-600">20 הקרנות האחרונות (ProjectMapping_Funds_Fixed)</span>
        </div>
        <button onClick={()=>startMut.mutate({mappingName:"ProjectMapping_Funds_Fixed",batchSize:20,extra:{totalLimit:20}})}
          disabled={startMut.isPending||migrationState==="running"}
          className="bg-teal-600 text-white px-4 py-1.5 rounded hover:bg-teal-700 disabled:opacity-50 text-sm">
          {startMut.isPending?"מריץ...":"הרץ 20 אחרונות"}
        </button>
      </div>

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
        <div className="grid grid-cols-3 gap-4 mb-4">
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
          <StartModeSelect value={startMode} onChange={setStartMode} disabled={migrationState==="running"} allowGapfill={true}/>
        </div>
        <div className="flex gap-3">
          <button onClick={()=>startMut.mutate({extra:{startMode}})} disabled={!selected||startMut.isPending||migrationState==="running"}
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
