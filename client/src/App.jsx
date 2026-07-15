import{BrowserRouter,Routes,Route}from"react-router-dom";
import Layout from"./components/Layout";
import Dashboard from"./components/Dashboard";
import MigrationRunner from"./components/MigrationRunner";
import PipelineRunner from"./components/PipelineRunner";
import IdLookup from"./components/IdLookup";
import ErrorViewer from"./components/ErrorViewer";
import ConnectionStatus from"./components/ConnectionStatus";

export default function App(){
  return(
    <BrowserRouter>
      <Routes>
        <Route element={<Layout/>}>
          <Route index element={<Dashboard/>}/>
          <Route path="migrate" element={<MigrationRunner/>}/>
          <Route path="pipeline" element={<PipelineRunner/>}/>
          <Route path="id-mappings" element={<IdLookup/>}/>
          <Route path="errors" element={<ErrorViewer/>}/>
          <Route path="connections" element={<ConnectionStatus/>}/>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
