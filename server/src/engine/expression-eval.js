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

// "Now" for target-DB writes. The target convention is UTC (see ./tz.js) — this used to
// return Israel-local time, which shifted every GETDATE() const by the IL offset.
function processGetDate(offsetYears){
  return require('./tz').utcNowString(offsetYears);
}

// Resolve date placeholder tokens used in mapping const/default values.
// GETDATE() = now; GETDATE_MINUS_1Y() = one year ago (fallback for missing CreatedAt).
function resolveDateToken(value){
  if(value==="GETDATE()") return processGetDate();
  if(value==="GETDATE_MINUS_1Y()") return processGetDate(1);
  return value;
}

function clearCache(){fnCache.clear();}

module.exports={evaluateExpression,evaluateCondition,processGetDate,resolveDateToken,clearCache};
