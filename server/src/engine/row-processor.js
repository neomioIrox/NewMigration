const {evaluateExpression,processGetDate}=require("./expression-eval");
const {resolveFK,resolveStaticFK}=require("./fk-resolver");
const logger=require("../logger");

const LANG_IDS={hebrew:1,english:2,french:3};

async function processColumn(colName,colDef,row,fkMappings){
  var convertType=colDef.convertType||"direct";
  var value;
  if(convertType==="const"){
    value=colDef.value;
    if(value==="GETDATE()") value=processGetDate();
    // Don't convert strings with leading zeros (like "01") to numbers - preserve as string
    return value;
  }
  var oldCol=colDef.oldColumn||colDef.sourceColumn;
  if(oldCol) value=row[oldCol];
  if(convertType==="expression"&&colDef.expression){
    value=evaluateExpression(colDef.expression,value,row);
  }
  if(colDef.useFkMapping&&fkMappings){
    var fkDef=fkMappings[colName];
    if(fkDef&&typeof fkDef==="object"&&!Array.isArray(fkDef)){
      value=resolveStaticFK(fkDef,value);
    }else if(fkDef&&typeof fkDef==="string"){
      var entityType=fkDef.replace(".json","");
      value=await resolveFK(entityType,value);
    }
  }
  if((value===null||value===undefined)&&colDef.defaultValue!==undefined){
    value=colDef.defaultValue;
    if(value==="GETDATE()") value=processGetDate();
  }
  if(colDef.nullable&&(value===null||value===undefined)) return null;
  return value;
}

async function processRow(columnMappings,row,fkMappings){
  var result={};
  for(var colName of Object.keys(columnMappings)){
    result[colName]=await processColumn(colName,columnMappings[colName],row,fkMappings);
  }
  return result;
}

async function processLocalizationRow(langKey,locFields,row,fkMappings){
  var langColName=locFields.languageColumn||"Language";
  var result={};
  result[langColName]=LANG_IDS[langKey]||1;
  for(var fieldName of Object.keys(locFields)){
    if(fieldName==="targetTable"||fieldName==="parentFkColumn"||fieldName==="languageColumn") continue;
    var langDef=locFields[fieldName];
    if(!langDef) continue;
    var def=langDef[langKey]||langDef;
    if(def&&def.convertType){
      result[fieldName]=await processColumn(fieldName,def,row,fkMappings);
    }
  }
  return result;
}

async function processLocalizations(locMappings,row,parentNewId,fkMappings){
  if(!locMappings) return [];
  var targetTable=locMappings.targetTable;
  var parentFkColumn=locMappings.parentFkColumn;
  var results=[];
  for(var lang of ["hebrew","english","french"]){
    var locRow=await processLocalizationRow(lang,locMappings,row,fkMappings);
    locRow[parentFkColumn]=parentNewId;
    results.push({targetTable:targetTable,data:locRow});
  }
  return results;
}

module.exports={processColumn,processRow,processLocalizations,processLocalizationRow,LANG_IDS};
