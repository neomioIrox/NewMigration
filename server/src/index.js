const express=require("express");
const cors=require("cors");
const http=require("http");
const {setupWebSocket}=require("./websocket");
const {initTrackerDb}=require("./db/init-tracker");
const logger=require("./logger");

// Routes
const connectionsRouter=require("./routes/connections");
const mappingsRouter=require("./routes/mappings");
const migrationsRouter=require("./routes/migrations");
const statusRouter=require("./routes/status");
const idLookupsRouter=require("./routes/id-lookups");
const errorsRouter=require("./routes/errors");
const validationRouter=require("./routes/validation");
const pipelineRouter=require("./routes/pipeline");

const app=express();
const server=http.createServer(app);

// Middleware
app.use(cors({origin:["http://localhost:5173","http://localhost:5174","http://localhost:3000","http://localhost:4173"]}));
app.use(express.json());

// Setup WebSocket
var io=setupWebSocket(server);
app.set("io",io);

// API Routes
app.use("/api/connections",connectionsRouter);
app.use("/api/mappings",mappingsRouter);
app.use("/api/migrations",migrationsRouter);
app.use("/api/status",statusRouter);
app.use("/api/id-mappings",idLookupsRouter);
app.use("/api/errors",errorsRouter);
app.use("/api/validation",validationRouter);
app.use("/api/pipeline",pipelineRouter);

// Health check
app.get("/api/health",function(req,res){res.json({status:"ok",uptime:process.uptime()});});

var PORT=process.env.PORT||3001;

async function start(){
  try{
    // Initialize tracker database
    await initTrackerDb();
    logger.info("Tracker DB initialized");
    var staleCount=await require("./services/pipeline-orchestrator").recoverStaleRuns();
    if(staleCount>0) logger.warn("Recovered "+staleCount+" stale pipeline run(s) from previous server crash");

    server.listen(PORT,function(){
      logger.info("Migration server running on port "+PORT);
      console.log("Migration server running on http://localhost:"+PORT);
      console.log("API docs: GET /api/health, /api/connections/test, /api/mappings, /api/migrations, /api/status/dashboard");
    });
  }catch(err){
    logger.error("Failed to start server: "+err.message);
    console.error("Failed to start:",err);
    process.exit(1);
  }
}

start();
