const logger=require('../logger');
const fnCache=new Map();

function evaluateExpression(expression,value,row){
  try{
    let fn=fnCache.get(expression);
    if(!fn){fn=new Function('value','row','"use strict"; return ('+expression+');');fnCache.set(expression,fn);}
    return fn(value,row);
  }catch(err){
    logger.error('Expression eval failed: '+expression,{error:err.message});
    return undefined;
  }
}

function evaluateCondition(condition,row){
  try{
    let fn=fnCache.get('cond:'+condition);
    if(!fn){fn=new Function('row','"use strict"; return !!('+condition+');');fnCache.set('cond:'+condition,fn);}
    return fn(row);
  }catch(err){
    logger.error('Condition eval failed: '+condition,{error:err.message});
    return false;
  }
}

function processGetDate(){
  var n=new Date();
  var pad=function(x){return String(x).padStart(2,'0');};
  return n.getFullYear()+'-'+pad(n.getMonth()+1)+'-'+pad(n.getDate())+' '+pad(n.getHours())+':'+pad(n.getMinutes())+':'+pad(n.getSeconds());
}

function clearCache(){fnCache.clear();}

module.exports={evaluateExpression,evaluateCondition,processGetDate,clearCache};
