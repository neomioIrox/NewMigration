import{useQuery}from"@tanstack/react-query";
import{api}from"../api/client";

export default function ErrorViewer(){
  const{data,isLoading}=useQuery({queryKey:["errors"],queryFn:()=>api.getErrors({limit:100}),refetchInterval:10000});
  if(isLoading) return <div className="p-8 text-center">Loading...</div>;
  return(
    <div>
      <h2 className="text-2xl font-bold mb-6">Error Log</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm"><thead className="bg-gray-50">
          <tr><th className="p-3">Run</th><th className="p-3">Source ID</th><th className="p-3">Type</th><th className="p-3 text-right">Message</th><th className="p-3">Time</th></tr>
        </thead><tbody>
          {(data?.rows||[]).map(e=><tr key={e.id} className="border-t"><td className="p-3">{e.run_id}</td><td className="p-3">{e.source_id}</td><td className="p-3"><span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">{e.error_type}</span></td><td className="p-3 text-right text-xs max-w-xs truncate">{e.error_message}</td><td className="p-3 text-xs text-gray-500">{e.created_at}</td></tr>)}
        </tbody></table>
        {data?.total>0&&<div className="p-3 text-sm text-gray-500">Showing {data.rows.length} of {data.total} errors</div>}
      </div>
    </div>
  );
}
