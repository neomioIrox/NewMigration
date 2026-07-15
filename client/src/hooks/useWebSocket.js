import{useEffect,useState,useRef}from"react";
import{io}from"socket.io-client";

export function useWebSocket(){
  const[connected,setConnected]=useState(false);
  const[lastEvent,setLastEvent]=useState(null);
  const[lastPipelineEvent,setLastPipelineEvent]=useState(null);
  const socketRef=useRef(null);

  useEffect(()=>{
    const socket=io("http://localhost:3001");
    socketRef.current=socket;
    socket.on("connect",()=>setConnected(true));
    socket.on("disconnect",()=>setConnected(false));
    socket.on("migration:started",(d)=>setLastEvent({type:"started",...d}));
    socket.on("migration:progress",(d)=>setLastEvent({type:"progress",...d}));
    socket.on("migration:paused",(d)=>setLastEvent({type:"paused",...d}));
    socket.on("migration:completed",(d)=>setLastEvent({type:"completed",...d}));
    socket.on("migration:error",(d)=>setLastEvent({type:"error",...d}));
    socket.on("pipeline:started",(d)=>setLastPipelineEvent({type:"pipeline:started",...d}));
    socket.on("pipeline:step-started",(d)=>setLastPipelineEvent({type:"pipeline:step-started",...d}));
    socket.on("pipeline:step-completed",(d)=>setLastPipelineEvent({type:"pipeline:step-completed",...d}));
    socket.on("pipeline:completed",(d)=>setLastPipelineEvent({type:"pipeline:completed",...d}));
    socket.on("pipeline:error",(d)=>setLastPipelineEvent({type:"pipeline:error",...d}));
    socket.on("pipeline:stopped",(d)=>setLastPipelineEvent({type:"pipeline:stopped",...d}));
    return()=>{socket.disconnect();};
  },[]);

  return{connected,lastEvent,lastPipelineEvent,socket:socketRef.current};
}
