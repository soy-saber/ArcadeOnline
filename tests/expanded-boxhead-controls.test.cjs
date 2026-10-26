'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
const name=path.resolve(__dirname,'../src/expanded/boxhead-controls.ts'),m=new Module(name,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[name],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,name);const c=m.exports;
test('saved personal aliases accept letters/numpad/symbols while preserving mandatory keys and rejecting conflicting or damaged settings',()=>{
 assert.deepEqual(c.readBindings('{"left":"KeyJ","up":"KeyI","right":"KeyL","down":"KeyK","attack":"Numpad0","previous":"Comma","next":"Period"}'),{left:'KeyJ',up:'KeyI',right:'KeyL',down:'KeyK',attack:'Numpad0',previous:'Comma',next:'Period'});
 for(const key of ['KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowUp','ArrowRight','ArrowDown','Space','Enter','KeyP','Digit1','Digit0']){assert(c.bindingError({},'attack',key));assert.deepEqual(c.readBindings(JSON.stringify({attack:key})),{});}
 assert(c.bindingError({left:'KeyI'},'attack','KeyI'));assert.deepEqual(c.readBindings('{"left":"KeyI","up":"KeyI","attack":null,"next":"MetaLeft"}'),{left:'KeyI'});for(const raw of ['invalid','null','[]','7'])assert.deepEqual(c.readBindings(raw),{});
});
test('touch weapon cycling keeps its independent role even when the physical K/J keys have custom meanings',()=>{
 const saved=c.readBindings('{"left":"KeyJ","down":"KeyK","attack":"KeyI"}');assert.equal(c.extraControl(saved,'KeyJ'),'left');assert.equal(c.extraControl(saved,'KeyK'),'down');assert.equal(c.extraControl(saved,'KeyI'),'attack');assert.equal(c.extraControl(saved,'TouchNext'),'next');assert.equal(c.extraControl(saved,'Space'),undefined);
});
