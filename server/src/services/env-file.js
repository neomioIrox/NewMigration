// Pure .env text editor. Replaces values of managed keys ONLY; every other
// line (comments, blanks, unknown keys) is preserved verbatim, including the
// file's CRLF/LF style. Missing keys are appended at the end. Used by the
// connection-config service — the root .env stays the single source of truth
// for the server AND the standalone scripts.
const fs=require("fs");

function formatValue(v){
  v=String(v);
  if(/[\r\n]/.test(v)) throw new Error("Value may not contain newlines");
  if(!/[#'"]/.test(v)&&!/^\s|\s$/.test(v)) return v;
  if(v.indexOf('"')<0) return '"'+v+'"';
  if(v.indexOf("'")<0) return "'"+v+"'";
  throw new Error("Value may not contain both single and double quotes");
}

function updateEnvText(text,updates){
  var eol=text.indexOf("\r\n")>=0?"\r\n":"\n";
  var pending=new Set(Object.keys(updates));
  var lines=text.split(/\r?\n/);
  for(var i=0;i<lines.length;i++){
    var m=/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(lines[i]);
    if(m&&pending.has(m[1])){lines[i]=m[1]+"="+formatValue(updates[m[1]]);pending.delete(m[1]);}
  }
  if(pending.size>0){
    if(lines.length&&lines[lines.length-1]==="") lines.pop();
    pending.forEach(function(k){lines.push(k+"="+formatValue(updates[k]));});
    lines.push("");
  }
  return lines.join(eol);
}

function updateEnvFile(filePath,updates){
  var text=fs.existsSync(filePath)?fs.readFileSync(filePath,"utf8"):"";
  fs.writeFileSync(filePath,updateEnvText(text,updates),"utf8");
}

module.exports={updateEnvText,updateEnvFile,formatValue};
