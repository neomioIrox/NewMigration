import{useState}from"react";
import{useQuery,useQueryClient}from"@tanstack/react-query";
import{api}from"../api/client";
import ConnectionEditForm from"./ConnectionEditForm";

export default function ConnectionStatus(){
  const qc=useQueryClient();
  const{data,isLoading,refetch}=useQuery({queryKey:["connections"],queryFn:api.testConnections});
  const{data:cfg}=useQuery({queryKey:["connectionsConfig"],queryFn:api.getConnectionsConfig});
  const[editing,setEditing]=useState(null);
  if(isLoading) return <div className="p-8 text-center">Testing connections...</div>;
  const conns=[{key:"mssql",label:"MSSQL (Source)"},{key:"mysqlTarget",label:"MySQL (Target)"},{key:"mysqlTracker",label:"MySQL (Tracker)"}];
  function onApplied(){
    setEditing(null);
    qc.invalidateQueries({queryKey:["connections"]});
    qc.invalidateQueries({queryKey:["connectionsConfig"]});
  }
  return(
    <div>
      <h2 className="text-2xl font-bold mb-6">Database Connections</h2>
      <div className="grid grid-cols-3 gap-4 mb-6 items-start">
        {conns.map(c=>{
          const info=data?.[c.key]||{};
          return <div key={c.key} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-2">
              <span className={"w-3 h-3 rounded-full "+(info.success?"bg-green-400":"bg-red-400")}/>
              <span className="font-semibold">{c.label}</span>
            </div>
            <div className="text-sm text-gray-600">{info.message||"Unknown"}</div>
            <div className="text-xs text-gray-400 mt-1">{info.database}</div>
            <button onClick={()=>setEditing(editing===c.key?null:c.key)} className="mt-3 text-sm text-blue-600 underline">
              {editing===c.key?"Close":"Edit"}
            </button>
            {editing===c.key&&cfg&&<ConnectionEditForm connKey={c.key} initial={cfg[c.key]} onApplied={onApplied}/>}
          </div>;
        })}
      </div>
      <button onClick={()=>refetch()} className="bg-blue-600 text-white px-4 py-2 rounded">Test Again</button>
    </div>
  );
}
