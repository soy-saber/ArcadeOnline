'use strict';
const fs = require('node:fs'), path = require('node:path'), {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const candidates = [process.env.FFDEC_JAR, path.join(root,'artifacts/tools/ffdec/ffdec.jar'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA,'Temp/opencode/4399/ffdec/ffdec.jar')].filter(Boolean);
const jar = candidates.find(file => fs.existsSync(file));
if (!jar) throw new Error('Set FFDEC_JAR to the JPEXS ffdec.jar installation.');
const result = spawnSync('python',[path.join(__dirname,'import-boxhead-original.py'),'--ffdec',jar,...process.argv.slice(2)],
  {cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
process.exitCode = result.status ?? 1;
