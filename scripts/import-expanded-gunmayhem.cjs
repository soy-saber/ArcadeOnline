'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),evidence=path.join(root,'artifacts/swf-analysis/97734');fs.mkdirSync(evidence,{recursive:true});
const fd=fs.openSync(path.join(evidence,'preview.log'),'w');try{const r=spawnSync('java',['-jar',path.join(root,'artifacts/tools/ffdec/ffdec.jar'),'-selectid','373,434,484,515,609,784,823,1838,1872,1875','-export','sprite',path.join(evidence,'preview'),path.join(root,'games/97734/yy1-1.swf')],{cwd:root,stdio:['ignore',fd,fd]});if(r.status!==0)throw new Error('FFDec Gun Mayhem sprite export failed');}finally{fs.closeSync(fd);}
const result=spawnSync('python',[path.join(__dirname,'import-expanded-gunmayhem.py')],{cwd:root,stdio:'inherit'});process.exitCode=result.status??1;
