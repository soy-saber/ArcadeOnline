'use strict';
const path=require('node:path'),Module=require('node:module');
const filename=path.resolve(__dirname,'../../src/expanded/boxhead-ai.ts');
const source=require('esbuild').buildSync({entryPoints:[filename],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const mod=new Module(filename,module);mod.paths=module.paths;mod._compile(source,filename);
module.exports=(s,z,entering=false)=>{
 z.ai=mod.exports.enemyBrain(s,z,entering);
 if(!entering){const world=require('../../src/expanded/boxhead-data.json').maps.find(m=>m.id===s.mapId),index=Math.floor(z.y/32)*world.columns+Math.floor(z.x/32);z.ai.reserved=index;s.enemyCells[index]=true;}
 return z;
};
