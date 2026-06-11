const express=require("express");
const router=express.Router();
const manager=require("../services/migration-manager");

// Gallery mappings are hidden from the generic dropdown — they run via the
// dedicated gallery chain button (POST /migrations/start-gallery), which
// enforces stage order and skips already-completed stages.
var HIDDEN_FROM_DROPDOWN=["GalleryMapping_Images","GalleryMediaMapping_Images","VideoGalleryMediaMapping"];

router.get("/",function(req,res){
  try{
    var mappings=manager.listMappings().filter(function(m){return HIDDEN_FROM_DROPDOWN.indexOf(m)===-1;});
    res.json({mappings:mappings});
  }catch(err){res.status(500).json({error:err.message});}
});

router.get("/:name",function(req,res){
  try{
    var mapping=manager.loadMapping(req.params.name);
    res.json(mapping);
  }catch(err){res.status(404).json({error:err.message});}
});

module.exports=router;
