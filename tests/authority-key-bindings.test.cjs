'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('module'),path=require('path');
const file=path.resolve(__dirname,'../src/authority/key-bindings.ts'),m=new Module(file,module);m.paths=module.paths;m._compile(require('esbuild').buildSync({entryPoints:[file],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,file);
const {directionKeys,directionState,heldDirectionAt}=m.exports;
test('all four WASD directions and their arrow alternatives generate identical movement',()=>{
 for(const [letter,arrow,name,dir]of [['KeyW','ArrowUp','up',1],['KeyA','ArrowLeft','left',0],['KeyS','ArrowDown','down',3],['KeyD','ArrowRight','right',2]]){
  assert.equal(directionKeys[letter],dir);assert.equal(directionKeys[arrow],dir);const a=directionState(new Map([[letter,1]])),b=directionState(new Map([[arrow,2]]));assert.deepEqual(a,b);assert.equal(a[name],true);assert.equal(Object.values(a).filter(Boolean).length,1);
 }
});
test('holding both alternatives and releasing either one retains movement; a second alias is not a new directional edge',()=>{
 for(const [letter,arrow]of [['KeyW','ArrowUp'],['KeyA','ArrowLeft'],['KeyS','ArrowDown'],['KeyD','ArrowRight']])for(const reverse of [false,true]){
  const [first,second]=reverse?[arrow,letter]:[letter,arrow],keys=new Map([[first,10]]);assert.equal(heldDirectionAt(keys,second),10);keys.set(second,heldDirectionAt(keys,second));keys.delete(first);assert(Object.values(directionState(keys)).some(Boolean));keys.delete(second);assert(Object.values(directionState(keys)).every(v=>!v));
 }
});
test('an alternative for an older held direction retains its priority and unrelated attack keys remain independent',()=>{
 const keys=new Map([['KeyW',10],['KeyD',20]]);assert.equal(heldDirectionAt(keys,'ArrowUp'),10);assert.equal(heldDirectionAt(keys,'ArrowRight'),20);assert.equal(heldDirectionAt(keys,'ArrowLeft'),undefined);assert.equal(heldDirectionAt(keys,'Space'),undefined);keys.set('ArrowUp',heldDirectionAt(keys,'ArrowUp'));
 assert.equal([...keys].sort((a,b)=>b[1]-a[1])[0][0],'KeyD');assert.deepEqual(directionState(keys),{left:false,up:true,right:true,down:false});
});
