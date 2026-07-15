import{useState,useEffect}from"react";
import{useQuery,useMutation,useQueryClient}from"@tanstack/react-query";
import{api}from"../api/client";
import{useWebSocket}from"../hooks/useWebSocket";

const STEP_LABELS={
  AffiliateMapping:"עמותות (Affiliate)",
  SourceMapping:"מקורות (Source)",
  CustomerUserMapping:"משתמשים (CustomerUser)",
  LutFundCategoryMapping:"קטגוריות קרנות (Lut)",
  ProjectMapping_Funds_Fixed:"פרויקטים — קרנות",
  ProjectMapping_Collections_Fixed:"פרויקטים — מגביות",
  ProjectMapping_Collections_Type2:"פרויקטים — מגביות Type2",
  ProjectMapping_Type3_Parents:"פרויקטים — Type3 אבות",
  ProjectMapping_Type3_Subs:"פרויקטים — Type3 בנים",
  PrayerMapping:"תפילות (Prayer)",
  FundCategoryMapping:"שיוך קרנות לקטגוריות",
  ProjectItemLocalizationMapping:"לוקליזציית פריטי פרויקט",
  RecruitersGroupMapping:"קבוצות מגייסים",
  RecruiterMapping:"מגייסים",
  GalleryMapping_Images:"גלריות תמונות",
  GalleryMediaMapping_Images:"מדיה — תמונות גלריה",
  VideoGalleryMediaMapping:"גלריית וידאו",
  DonationMapping:"תרומות (Donation)",
  PrayNameMapping:"שמות לתפילה (PrayName)",
  AsakimDonationMapping:"תרומות עסקים (Asakim)"
};

const STATUS_ICONS={completed:"✓",running:"⟳",pending:"○",failed:"✗"};
const STATUS_COLORS={completed:"text-green-600",running:"text-blue-600 animate-pulse",pending:"text-gray-400",failed:"text-red-600"};

function StepRow({step,liveProgress}){
  var isRunning=step.status==="running";
  var progress=isRunning&&liveProgress&&liveProgress.mapping===step.step_name?liveProgress:null;
  var pct=progress&&progress.totalRows>0?Math.round((progress.counters.processed/progress.totalRows)*100):null;
  var counters=progress?progress.counters:(step.migration_run_id?{
    processed:step.processed_rows,inserted:step.inserted_rows,skipped:step.skipped_rows,errors:step.error_rows
  }:null);
  return(
    <div className={"flex flex-col border rounded p-3 "+(isRunning?"border-blue-300 bg-blue-50":step.status==="failed"?"border-red-300 bg-red-50":"border-gray-200")}>
      <div className="flex items-center gap-3">
        <span className={"text-lg font-bold w-6 text-center "+STATUS_COLORS[step.status]}>{STATUS_ICONS[step.status]}</span>
        <span className="text-sm text-gray-400 w-8">{step.order_index+1}.</span>
        <span className="font-medium flex-1">{STEP_LABELS[step.step_name]||step.step_name}</span>
        {counters&&(
          <span className="text-xs text-gray-600">
            עובדו: {counters.processed??0} | הוכנסו: {counters.inserted??0} | דולגו: {counters.skipped??0} | שגיאות: {counters.errors??0}
          </span>
        )}
      </div>
      {pct!==null&&(
        <div className="mt-2 mr-14">
          <div className="w-full bg-gray-200 rounded h-2">
            <div className="bg-blue-600 h-2 rounded" style={{width:pct+"%"}}/>
          </div>
          <span className="text-xs text-gray-600">{pct}% ({progress.counters.processed}/{progress.totalRows})</span>
        </div>
      )}
      {step.status==="failed"&&step.error_message&&(
        <p className="text-red-700 text-sm mt-2 mr-14 break-all">{step.error_message}</p>
      )}
    </div>
  );
}

function CheckpointMap({refreshKey}){
  const{data,isLoading,isError,refetch}=useQuery({
    queryKey:["checkpoints"],
    queryFn:api.getCheckpoints,
    refetchInterval:15000
  });
  useEffect(()=>{refetch();},[refreshKey,refetch]);
  const rows=data?.checkpoints||[];
  function fmt(d){return d?new Date(d).toLocaleString("he-IL"):"—";}
  return(
    <div className="bg-white rounded-lg shadow p-6 mt-6">
      <h3 className="font-semibold mb-3">מפת נקודות המשך (MigrationCheckpoint)</h3>
      {isLoading&&<p className="text-gray-500 text-sm">טוען...</p>}
      {!isLoading&&isError&&<p className="text-red-600 text-sm">שגיאה בטעינת נקודות ההמשך</p>}
      {!isLoading&&!isError&&rows.length===0&&<p className="text-gray-500 text-sm">אין עדיין נקודות המשך — ירשמו אוטומטית בריצה הבאה.</p>}
      {rows.length>0&&(
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right border-b text-gray-500">
                <th className="py-1 pl-3">Mapping</th>
                <th className="py-1 pl-3">ID אחרון</th>
                <th className="py-1 pl-3">סטטוס</th>
                <th className="py-1 pl-3">עדכון אחרון</th>
                <th className="py-1 pl-3">הושלם</th>
                <th className="py-1 pl-3">שורות (מצטבר)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.MappingName} className="border-b last:border-0">
                  <td className="py-1 pl-3 font-medium">{STEP_LABELS[r.MappingName]||r.MappingName}</td>
                  <td className="py-1 pl-3 font-mono" dir="ltr">{r.LastSourceId??"—"}</td>
                  <td className={"py-1 pl-3 "+(r.Status==="completed"?"text-green-700":"text-blue-700")}>
                    {r.Status==="completed"?"הושלם ✓":"בתהליך ⟳"}
                  </td>
                  <td className="py-1 pl-3" dir="ltr">{fmt(r.LastRunAt)}</td>
                  <td className="py-1 pl-3" dir="ltr">{fmt(r.CompletedAt)}</td>
                  <td className="py-1 pl-3">{(r.RowsMigrated??0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PipelineRunner(){
  const[fresh,setFresh]=useState(false);
  const queryClient=useQueryClient();
  const{lastEvent,lastPipelineEvent}=useWebSocket();

  const{data,isLoading}=useQuery({
    queryKey:["pipelineCurrent"],
    queryFn:api.getPipelineCurrent,
    refetchInterval:5000
  });

  // Any pipeline event = state changed on the server -> refetch immediately
  useEffect(()=>{
    if(lastPipelineEvent) queryClient.invalidateQueries({queryKey:["pipelineCurrent"]});
  },[lastPipelineEvent,queryClient]);

  const startMut=useMutation({
    mutationFn:()=>api.startPipeline(fresh?"fresh":"continue"),
    onSuccess:()=>queryClient.invalidateQueries({queryKey:["pipelineCurrent"]})
  });
  const stopMut=useMutation({
    mutationFn:api.stopPipeline,
    onSuccess:()=>queryClient.invalidateQueries({queryKey:["pipelineCurrent"]})
  });

  const run=data?.run;
  const steps=data?.steps||[];
  const isRunning=run?.status==="running";
  const canContinue=!fresh&&run&&(run.status==="failed"||run.status==="stopped");
  const completedCount=steps.filter(s=>s.status==="completed").length;
  const overallPct=steps.length>0?Math.round((completedCount/steps.length)*100):0;

  // Live progress of the currently-running step, from the existing migration:progress stream
  const liveProgress=lastEvent&&lastEvent.type==="progress"?lastEvent:null;

  function onStart(){
    if(fresh&&!window.confirm("להתחיל מאפס? כל 20 השלבים ירוצו מההתחלה (ללא ניקוי טבלאות יעד).")) return;
    startMut.mutate();
  }

  return(
    <div>
      <h2 className="text-2xl font-bold mb-4">הרצה מלאה</h2>
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={fresh} onChange={e=>setFresh(e.target.checked)} disabled={isRunning}/>
            התחל מאפס (אחרת: המשך מהנקודה האחרונה)
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onStart} disabled={isRunning||startMut.isPending}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 font-medium">
            {startMut.isPending?"מתחיל...":isRunning?"רץ...":canContinue?"המשך מהנקודה שנעצרה":"הרץ את כל התהליך"}
          </button>
          {isRunning&&(
            <button onClick={()=>stopMut.mutate()} disabled={stopMut.isPending}
              className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700 disabled:opacity-50">
              {stopMut.isPending?"עוצר...":"עצור"}
            </button>
          )}
        </div>
        {startMut.isError&&<p className="text-red-600 text-sm mt-3">{startMut.error.message}</p>}
        {run&&(
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span>
                {run.status==="running"&&"רץ — שלב "+(completedCount+1)+" מתוך "+steps.length}
                {run.status==="completed"&&"הושלם — כל "+steps.length+" השלבים"}
                {run.status==="failed"&&"נכשל בשלב: "+(STEP_LABELS[run.current_step]||run.current_step)}
                {run.status==="stopped"&&"נעצר ידנית"}
              </span>
              <span>{overallPct}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded h-3">
              <div className={"h-3 rounded "+(run.status==="failed"?"bg-red-500":run.status==="completed"?"bg-green-500":"bg-blue-600")}
                style={{width:overallPct+"%"}}/>
            </div>
            {run.status==="failed"&&run.error_message&&(
              <p className="text-red-700 text-sm mt-2 break-all">{run.error_message}</p>
            )}
          </div>
        )}
      </div>

      {isLoading&&<p className="text-gray-500">טוען...</p>}
      {!isLoading&&steps.length===0&&<p className="text-gray-500">עדיין לא הופעלה הרצה מלאה. לחיצה על הכפתור תריץ את כל 20 השלבים לפי סדר התלויות.</p>}
      <div className="space-y-2">
        {steps.map(s=><StepRow key={s.step_name} step={s} liveProgress={liveProgress}/>)}
      </div>

      <CheckpointMap refreshKey={lastPipelineEvent}/>
    </div>
  );
}
