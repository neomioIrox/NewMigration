import{useQuery,useMutation,useQueryClient}from"@tanstack/react-query";
import{api}from"../api/client";

export default function Dashboard(){
  const queryClient=useQueryClient();
  const{data,isLoading,error}=useQuery({queryKey:["dashboard"],queryFn:api.getDashboard,refetchInterval:5000});
  const clearMut=useMutation({mutationFn:api.clearHistory,onSuccess:()=>{queryClient.invalidateQueries({queryKey:["dashboard"]});queryClient.invalidateQueries({queryKey:["errors"]});}});

  function handleClear(){
    if(window.confirm("האם אתה בטוח שברצונך למחוק את כל ההיסטוריה? פעולה זו בלתי הפיכה.")){
      clearMut.mutate();
    }
  }

  if(isLoading) return <div className="text-center p-8">Loading...</div>;
  if(error) return <div className="text-red-600 p-4">Error: {error.message}</div>;
  const{runs,totalIdMappings,totalErrors}=data||{};
  return(
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Migration Dashboard</h2>
        <button onClick={handleClear} disabled={clearMut.isPending}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50 text-sm">
          {clearMut.isPending?"מוחק...":"נקה את כל ההיסטוריה"}
        </button>
      </div>
      {clearMut.isSuccess&&<div className="bg-green-50 border border-green-200 rounded p-3 mb-4 text-green-800 text-sm">ההיסטוריה נמחקה בהצלחה</div>}
      {clearMut.isError&&<div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-red-800 text-sm">שגיאה: {clearMut.error.message}</div>}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Total ID Mappings</div>
          <div className="text-3xl font-bold text-blue-600">{totalIdMappings||0}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Total Errors</div>
          <div className="text-3xl font-bold text-red-600">{totalErrors||0}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Migration Runs</div>
          <div className="text-3xl font-bold text-green-600">{runs?runs.length:0}</div>
        </div>
      </div>
      <h3 className="text-lg font-semibold mb-4">Migration Runs</h3>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr><th className="p-3 text-right">Mapping</th><th className="p-3">Status</th><th className="p-3">Total</th><th className="p-3">Inserted</th><th className="p-3">Errors</th></tr>
          </thead>
          <tbody>
            {(runs||[]).map(r=><tr key={r.id} className="border-t">
              <td className="p-3 font-medium">{r.mapping_name}</td>
              <td className="p-3"><span className={"px-2 py-1 rounded text-xs "+(r.status==="completed"?"bg-green-100 text-green-800":r.status==="failed"?"bg-red-100 text-red-800":r.status==="paused"?"bg-yellow-100 text-yellow-800":"bg-gray-100")}>{r.status}</span></td>
              <td className="p-3">{r.total_source_rows}</td>
              <td className="p-3">{r.inserted_rows}</td>
              <td className="p-3 text-red-600">{r.error_rows}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>);
}
