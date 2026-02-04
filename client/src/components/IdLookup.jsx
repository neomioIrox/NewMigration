import{useState}from"react";
import{useQuery}from"@tanstack/react-query";
import{api}from"../api/client";

export default function IdLookup(){
  const[entityType,setEntityType]=useState("");
  const[searchId,setSearchId]=useState("");
  const[lookupResult,setLookupResult]=useState(null);
  const{data:typesData}=useQuery({queryKey:["entityTypes"],queryFn:api.getEntityTypes});
  const{data:mappings}=useQuery({queryKey:["idMappings",entityType],queryFn:()=>api.getIdMappings({entityType,limit:50}),enabled:true});

  async function doLookup(){
    if(!entityType||!searchId) return;
    try{var r=await api.lookupId(entityType,searchId);setLookupResult(r);}catch(e){setLookupResult({error:e.message});}
  }

  return(
    <div>
      <h2 className="text-2xl font-bold mb-6">ID Mappings</h2>
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex gap-4 mb-4">
          <select value={entityType} onChange={e=>setEntityType(e.target.value)} className="border rounded p-2">
            <option value="">All Types</option>
            {(typesData?.entityTypes||[]).map(t=><option key={t.entity_type} value={t.entity_type}>{t.entity_type} ({t.cnt})</option>)}
          </select>
          <input value={searchId} onChange={e=>setSearchId(e.target.value)} placeholder="Source ID" className="border rounded p-2"/>
          <button onClick={doLookup} className="bg-blue-600 text-white px-4 py-2 rounded">Lookup</button>
        </div>
        {lookupResult&&!lookupResult.error&&<div className="bg-green-50 p-3 rounded">Source: {lookupResult.source_id} → Target: {lookupResult.target_id} ({lookupResult.entity_type})</div>}
        {lookupResult&&lookupResult.error&&<div className="bg-red-50 p-3 rounded text-red-700">{lookupResult.error}</div>}
      </div>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm"><thead className="bg-gray-50">
          <tr><th className="p-3 text-right">Entity</th><th className="p-3">Source ID</th><th className="p-3">Target ID</th><th className="p-3">Created</th></tr>
        </thead><tbody>
          {(mappings?.rows||[]).map(r=><tr key={r.id} className="border-t"><td className="p-3">{r.entity_type}</td><td className="p-3">{r.source_id}</td><td className="p-3 font-medium">{r.target_id}</td><td className="p-3 text-sm text-gray-500">{r.created_at}</td></tr>)}
        </tbody></table>
      </div>
    </div>
  );
}
