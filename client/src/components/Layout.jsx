import{NavLink,Outlet}from"react-router-dom";
import{useWebSocket}from"../hooks/useWebSocket";

const navItems=[
  {to:"/",label:"Dashboard"},
  {to:"/migrate",label:"Migration Runner"},
  {to:"/id-mappings",label:"ID Mappings"},
  {to:"/errors",label:"Errors"},
  {to:"/connections",label:"Connections"},
];

export default function Layout(){
  const{connected}=useWebSocket();
  return(
    <div className="flex min-h-screen" dir="rtl">
      <aside className="w-64 bg-gray-800 text-white p-4">
        <h1 className="text-xl font-bold mb-6">Migration System</h1>
        <div className="mb-4 flex items-center gap-2">
          <span className={"w-3 h-3 rounded-full "+(connected?"bg-green-400":"bg-red-400")}/>
          <span className="text-sm">{connected?"WebSocket Connected":"Disconnected"}</span>
        </div>
        <nav className="space-y-2">
{navItems.map(i=><NavLink key={i.to} to={i.to} end={i.to==="/"} className={({isActive})=>"block px-4 py-2 rounded "+(isActive?"bg-blue-600":"hover:bg-gray-700")}>{i.label}</NavLink>)}</nav></aside><main className="flex-1 p-6"><Outlet/></main></div>);}
