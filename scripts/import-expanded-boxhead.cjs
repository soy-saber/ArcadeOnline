'use strict';
// Rebuild from the preserved local SWF with the portable FFDec and Pillow.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),evidence=path.join(root,'artifacts/swf-analysis/50737');fs.mkdirSync(evidence,{recursive:true});
function ff(args,name){const fd=fs.openSync(path.join(evidence,name+'.log'),'w');try{const r=spawnSync('java',['-jar',path.join(root,'artifacts/tools/ffdec/ffdec.jar'),...args],{cwd:root,stdio:['ignore',fd,fd]});if(r.status!==0)throw new Error('FFDec failed: '+name);}finally{fs.closeSync(fd);}}
ff(['-export','script',evidence,path.join(root,'games/50737/game.swf')],'scripts');
ff(['-selectid','631,645,660','-export','sprite',path.join(evidence,'preview'),path.join(root,'games/50737/game.swf')],'preview');
const result=spawnSync('python',[path.join(__dirname,'import-expanded-boxhead.py')],{cwd:root,stdio:'inherit'});process.exitCode=result.status??1;
