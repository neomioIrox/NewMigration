// Unit tests for the pure .env text editor. Run: node --test server/test/
const test=require("node:test");
const assert=require("node:assert");
const {updateEnvText}=require("../src/services/env-file");

test("replaces value of an existing key, preserves other lines verbatim",function(){
  var input="# MSSQL Source\nMSSQL_DATABASE=OldDb\nUNMANAGED=keep\n";
  var out=updateEnvText(input,{MSSQL_DATABASE:"NewDb"});
  assert.equal(out,"# MSSQL Source\nMSSQL_DATABASE=NewDb\nUNMANAGED=keep\n");
});

test("preserves CRLF line endings",function(){
  var input="A=1\r\nB=2\r\n";
  var out=updateEnvText(input,{B:"3"});
  assert.equal(out,"A=1\r\nB=3\r\n");
});

test("appends missing keys at the end, before trailing blank line",function(){
  var input="A=1\n";
  var out=updateEnvText(input,{NEW_KEY:"val"});
  assert.equal(out,"A=1\nNEW_KEY=val\n");
});

test("does not touch keys that merely share a prefix",function(){
  var input="MYSQL_TARGET_HOST=a\nMYSQL_TARGET_HOST_OLD=b\n";
  var out=updateEnvText(input,{MYSQL_TARGET_HOST:"c"});
  assert.equal(out,"MYSQL_TARGET_HOST=c\nMYSQL_TARGET_HOST_OLD=b\n");
});

test("values containing = and ; and spaces are written raw (connection strings)",function(){
  var cs="Driver={ODBC Driver 17 for SQL Server};Server=HOST;Database=Db;Trusted_Connection=yes;";
  var out=updateEnvText("MSSQL_CONNECTION_STRING=x\n",{MSSQL_CONNECTION_STRING:cs});
  assert.equal(out,"MSSQL_CONNECTION_STRING="+cs+"\n");
});

test("value containing # is double-quoted",function(){
  var out=updateEnvText("P=x\n",{P:"pa#ss"});
  assert.equal(out,'P="pa#ss"\n');
});

test("value containing double-quote is single-quoted",function(){
  var out=updateEnvText("P=x\n",{P:'pa"ss'});
  assert.equal(out,"P='pa\"ss'\n");
});

test("value with both quote kinds throws",function(){
  assert.throws(function(){updateEnvText("P=x\n",{P:"a'b\"c"});},/quote/);
});

test("value with newline throws",function(){
  assert.throws(function(){updateEnvText("P=x\n",{P:"a\nb"});},/newline/i);
});

test("updating an empty file produces just the keys",function(){
  var out=updateEnvText("",{A:"1"});
  assert.equal(out,"A=1\n");
});

test("append preserves genuine trailing blank lines",function(){
  assert.equal(updateEnvText("A=1\n\n",{NEW_KEY:"val"}),"A=1\n\nNEW_KEY=val\n");
});

test("append to file without trailing newline adds one",function(){
  assert.equal(updateEnvText("A=1",{NEW_KEY:"val"}),"A=1\nNEW_KEY=val\n");
});
