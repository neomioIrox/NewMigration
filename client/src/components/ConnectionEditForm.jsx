import{useState}from"react";
import{api}from"../api/client";

const FIELD_DEFS={
  mssql:[
    {name:"connectionString",label:"Connection String",type:"textarea"},
    {name:"database",label:"Database",type:"text"},
    {name:"requestTimeout",label:"Request Timeout (ms)",type:"number"}
  ],
  mysqlTarget:[
    {name:"host",label:"Host",type:"text"},
    {name:"user",label:"User",type:"text"},
    {name:"password",label:"Password",type:"password",placeholder:"Leave empty to keep current"},
    {name:"database",label:"Database",type:"text"}
  ],
  mysqlTracker:[
    {name:"host",label:"Host",type:"text"},
    {name:"user",label:"User",type:"text"},
    {name:"password",label:"Password",type:"password",placeholder:"Leave empty to keep current"},
    {name:"database",label:"Database",type:"text"}
  ]
};

// Save & Apply is enabled only after a successful Test of the CURRENT form
// values — any edit clears the test result and disables it again (the server
// enforces the same rule; this is the matching UX).
export default function ConnectionEditForm({connKey,initial,onApplied}){
  const defs=FIELD_DEFS[connKey];
  const[values,setValues]=useState(function(){
    var v={};defs.forEach(function(f){v[f.name]=f.type==="password"?"":(initial[f.name]??"");});return v;
  });
  const[test,setTest]=useState(null);
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState(null);

  function setField(name,val){setValues(function(v){return {...v,[name]:val};});setTest(null);setError(null);}

  async function runTest(){
    setBusy(true);setError(null);
    try{setTest(await api.testConnectionConfig(connKey,values));}
    catch(e){setTest({success:false,message:e.message});}
    finally{setBusy(false);}
  }

  async function save(){
    setBusy(true);setError(null);
    try{await api.saveConnectionConfig(connKey,values);onApplied();}
    catch(e){setError(e.message);setTest(null);}
    finally{setBusy(false);}
  }

  return(
    <div className="mt-4 border-t pt-4 space-y-3" dir="ltr">
      {defs.map(f=>(
        <div key={f.name}>
          <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
          {f.type==="textarea"
            ?<textarea className="w-full border rounded p-2 text-sm font-mono" rows={3} disabled={busy} value={values[f.name]} onChange={e=>setField(f.name,e.target.value)}/>
            :<input className="w-full border rounded p-2 text-sm" type={f.type} disabled={busy} autoComplete={f.type==="password"?"new-password":undefined} placeholder={f.placeholder||""} value={values[f.name]} onChange={e=>setField(f.name,e.target.value)}/>}
        </div>
      ))}
      {connKey!=="mssql"&&initial.hasPassword&&<div className="text-xs text-gray-400">A password is currently set.</div>}
      {test&&<div className={"text-sm "+(test.success?"text-green-600":"text-red-600")}>{test.message}</div>}
      {error&&<div className="text-sm text-red-600">{error}</div>}
      <div className="flex gap-2">
        <button onClick={runTest} disabled={busy} className="bg-gray-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50">{busy?"Working...":"Test"}</button>
        <button onClick={save} disabled={busy||!test||!test.success} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50">Save &amp; Apply</button>
      </div>
    </div>
  );
}
