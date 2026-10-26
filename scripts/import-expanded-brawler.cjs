const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const fs = require('node:fs');
const jar = [process.env.FFDEC_JAR,path.join(root,'artifacts/tools/ffdec/ffdec.jar'),path.join(process.env.LOCALAPPDATA||'', 'Temp/opencode/4399/ffdec/ffdec.jar')].find(p=>p&&fs.existsSync(p));
if(!jar)throw Error('Set FFDEC_JAR to the JPEXS ffdec.jar file.');
const swf = path.join(root, 'games/6232/game.swf');
function run(command,args) { const result=spawnSync(command,args,{cwd:root,windowsHide:true,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1); }
run('java',['-jar',jar,'-export','script,symbolClass','artifacts/brawler-original',swf]);
run('java',['-jar',jar,'-swf2xml',swf,'artifacts/brawler-original/game.xml']);
run('python',['scripts/prepare-brawler-visible.py']);
run('java',['-jar',jar,'-selectid','115,208,302,409,544,685,726,732,832,838,873,875,886,901','-select','115:1-4,208:1-4,302:1-4,409:1-4,544:1-4,685:1-4,726:1,732:1,832:1,838:1,873:1,875:1,886:1,901:1','-export','sprite','artifacts/brawler-visible-art','artifacts/brawler-visible/game.swf']);
run('python',['scripts/import-expanded-brawler.py',...(process.argv.includes('--all')?[]:['--stages-only'])]);
