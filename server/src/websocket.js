const {Server}=require("socket.io");
const logger=require("./logger");

function setupWebSocket(httpServer){
  var io=new Server(httpServer,{
    cors:{origin:["http://localhost:5173","http://localhost:5174","http://localhost:3000","http://localhost:4173"],methods:["GET","POST"]}
  });
  io.on("connection",function(socket){
    logger.info("WebSocket client connected: "+socket.id);
    socket.on("disconnect",function(){logger.info("WebSocket client disconnected: "+socket.id);});
  });
  logger.info("WebSocket server initialized");
  return io;
}

module.exports={setupWebSocket};
