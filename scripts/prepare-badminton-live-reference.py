"""Build live original solo callbacks with a shared external seeded random stream."""
from pathlib import Path
import argparse,copy,hashlib,json,os,subprocess,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--ffdec');args=parser.parse_args()
cache=ROOT/'artifacts/badminton-live-reference';cache.mkdir(parents=True,exist_ok=True)
candidates=[Path(p) for p in [args.ffdec,os.environ.get('FFDEC_JAR')] if p]+[Path(os.environ.get('LOCALAPPDATA',''))/'Temp/opencode/4399/ffdec/ffdec.jar']
jar=next((p for p in candidates if p.is_file()),None)
if jar is None:raise SystemExit('Set --ffdec or FFDEC_JAR')
def ff(a,name):
    with (cache/(name+'.log')).open('w',encoding='utf-8') as log:subprocess.run(['java','-jar',str(jar),*map(str,a)],cwd=ROOT,check=True,stdout=log,stderr=subprocess.STDOUT)
tree=ET.parse(ROOT/'artifacts/badminton-solo-reference/reference.xml');root=tree.getroot();tags=root.find('tags')
original=ET.parse(ROOT/'artifacts/swf-analysis/46923/game.xml').getroot();net=next(e for e in original.find('tags') if e.get('name')=='netSprite');tags.insert(len(tags)-2,copy.deepcopy(net))
xml=cache/'reference.xml';tree.write(xml,encoding='utf-8',xml_declaration=True);ff(['-xml2swf',xml,cache/'empty.swf'],'minimal')
scripts=cache/'scripts';scripts.mkdir(exist_ok=True)
for file in (ROOT/'artifacts/badminton-solo-reference/scripts').rglob('*.as'):
    if file.parent.name=='frame_1' and file.parent.parent.name=='scripts':continue
    target=scripts/file.relative_to(ROOT/'artifacts/badminton-solo-reference/scripts');target.parent.mkdir(parents=True,exist_ok=True)
    clean=file.read_text('utf-8').replace('Math.random()','_root.referenceRandom()')
    if file.parent.parent.name in ['DefineSprite_283','DefineSprite_270','DefineSprite_205','DefineSprite_254'] and file.parent.name=='frame_1':
        side='p1gun' if file.parent.parent.name in ['DefineSprite_283','DefineSprite_270'] else 'p2gun'
        clean=clean.replace('this.onEnterFrame = function()\n{','this.onEnterFrame = function()\n{\n   _root.nativeOrder.push("'+side+'");')
    target.write_text(clean,encoding='utf-8')
for file in (ROOT/'artifacts/swf-analysis/46923/deobfuscated/scripts/DefineSprite_425').rglob('*.as'):
    target=scripts/file.relative_to(ROOT/'artifacts/swf-analysis/46923/deobfuscated/scripts');target.parent.mkdir(parents=True,exist_ok=True);target.write_text('\n'.join(file.read_text('utf-8').splitlines()[2:])+'\n',encoding='utf-8')
source=(ROOT/'artifacts/swf-analysis/46923/deobfuscated/scripts/frame_38/DoAction.as').read_text('utf-8')
def function(name):return source[source.index('function '+name+'('):].split('\nfunction ',1)[0].strip()
cpu=function('setupCPU').replace('theHero2.serveTime = 1928','theHero2.serveTime = 0').replace('this.serveTime + this.serveCooldown < 4084','this.serveTime + this.serveCooldown < Math.floor(nativeCPUCalls*1000/30)')
cpu=cpu.replace('theHero2.onEnterFrame = function()\n   {','theHero2.onEnterFrame = function()\n   {\n      nativeCPUCalls++;nativeOrder.push("cpu");')
input_probe='nativeHeroCalls++;nativeOrder.push("p1");nativeInputHeld=Key.isDown(83);nativeMouseHeld=theMouseDown;nativePointerX=_root._xmouse;nativePointerY=_root._ymouse;'
human=function('setupHero').replace('theHero.onEnterFrame = function()\n   {','theHero.onEnterFrame = function()\n   {\n      '+input_probe)
robot=function('setupHero1p').replace('theHero.onEnterFrame = function()\n   {','theHero.onEnterFrame = function()\n   {\n      '+input_probe)
bird=function('setupBirdie').replace('theBirdie.onEnterFrame = function()\n   {','theBirdie.nativeBorn=nativeHeroCalls+1;\n   theBirdie.onEnterFrame = function()\n   {\n      nativeOrder.push("bird");').replace('hitSound.start(0,1);','_root.nativeHits++;hitSound.start(0,1);')
program='''stop();Stage.scaleMode="noScale";Stage.align="TL";
var gamePaused=false;var gameOver=false;var gameStart=true;var Mode="1p";var Type="human";var serve=1;var theMouseDown=false;
var nativeHeroCalls=0;var nativeCPUCalls=0;var nativeOrder=[];var referenceRng=42;var randomCalls=0;var nativeNetHits=0;var nativeHits=0;var referenceActions=[];var referenceService=false;
function referenceRandom(){referenceRng=(referenceRng*1664525+1013904223)%4294967296;randomCalls++;return referenceRng/4294967296;}
var whooshSound={start:function(){}};var hitSound={start:function(){}};
function p1Scored(){if(!pointOver){p1Score++;pointOver=true;}}
function p2Scored(){if(!pointOver){p2Score++;pointOver=true;}}
'''+function('turn')+'\n'+function('mothershipTrail')+'\n'+function('mothershipTrail2')+'\n'+bird+'\n'+cpu+'\n'+human+'\n'+robot+'''
var runs=[{type:"human",level:1},{type:"human",level:2},{type:"human",level:3},{type:"human",level:4},{type:"human",level:5},{type:"human",level:6},{type:"robot",level:1},{type:"robot",level:6}];
var runIndex=-1;var nextRun=true;
function createRun(){
 runIndex++;var run=runs[runIndex];Type=run.type;difficulty=run.level;
 nativeHeroCalls=0;nativeCPUCalls=0;nativeOrder=[];referenceRng=42;randomCalls=0;nativeNetHits=0;nativeHits=0;particleNum2=0;p1Score=0;p2Score=0;pointOver=false;
 p1Hit=false;p2Hit=false;p1Swing=false;p2Swing=false;p1RacketReady=true;p2RacketReady=true;p1RacketDir=0;p2RacketDir=0;serve=1;numGen3=100;
 delete _root.numGen1;delete _root.swingVar;delete _root.swingVar2;delete _root.theBirdie;
 servingSpotNum=Math.ceil(referenceRandom()*3);netSprite.gotoAndStop(1);
 if(difficulty==1){setupCPU();if(Type=="robot")setupHero1p();else setupHero();}
 else{if(Type=="robot")setupHero1p();else setupHero();setupCPU();}
 trace("RUN|"+runIndex+"|"+Type+"|"+difficulty);
}
function playerSnapshot(actor,seat){return {x:actor._x,y:actor._y,vy:-actor.dy,jumping:actor.jump,rootFrame:actor._currentframe,body:actor.hero==undefined?1:actor.hero._currentframe,gun:actor.gun._currentframe,service:actor.gunServe._currentframe,ready:seat==1?p1RacketReady:p2RacketReady,active:seat==1?p1Swing:p2Swing,angle:seat==1?p1RacketDir:p2RacketDir,robotPhase:actor.Var};}
function snapshot(){
 var particles=[];for(var i=0;i<particleNum2;i++){var p=_root["particle"+i];if(p!=undefined&&p._parent==_root)particles.push({id:i,kind:p.getDepth()>=180000?"ball":"robot",x:p._x,y:p._y,vx:p.dx,vy:p.dy,rotation:p._rotation,scale:p._xscale/100,width:p._width});}
 var b=theBirdie;var ball=b==undefined||b._parent!=_root?null:{x:b._x,y:b._y,vx:-b.dx,vy:-b.dy,rotation:b.bird._rotation,speed:b.hyp==undefined?0:b.hyp,contactBy:p1Hit?1:p2Hit?2:0,born:b.nativeBorn};
 return {run:runIndex,type:Type,level:difficulty,heroCalls:nativeHeroCalls,cpuCalls:nativeCPUCalls,p1:playerSnapshot(theHero,1),p2:playerSnapshot(theHero2,2),serve:serve,ball:ball,score:[p1Score,p2Score],pointOver:pointOver,chance1:numGen1,chance3:numGen3,numVar2:numVar2,swingVar:swingVar,swingVar2:swingVar2,serveReady:theHero2.serveReady,rng:referenceRng,randomCalls:randomCalls,nextParticle:particleNum2,particles:particles,netFrame:netSprite._currentframe,netHits:nativeNetHits,hits:nativeHits,held:nativeInputHeld,mouse:nativeMouseHeld,pointerX:nativePointerX,pointerY:nativePointerY};
}
var savedPlay=netSprite.play;netSprite.play=function(){nativeNetHits++;savedPlay.call(this);};
flash.external.ExternalInterface.addCallback("nativeSnapshot",_root,function(){return snapshot();});
onMouseDown=function(){theMouseDown=true;};onMouseUp=function(){theMouseDown=false;};
_root.onEnterFrame=function(){
 if(nextRun){nextRun=false;createRun();return;}
 trace("ORDER|"+runIndex+"|"+nativeHeroCalls+"|"+nativeOrder.join(","));nativeOrder=[];
 trace("INPUT|"+runIndex+"|"+nativeHeroCalls+"|"+nativeInputHeld+"|"+nativeMouseHeld+"|"+nativePointerX+"|"+nativePointerY);
 if(nativeHeroCalls>=60){
  trace("END_RUN|"+runIndex);theHero.gun.stop();theHero.gunServe.stop();theHero2.gun.stop();theHero2.gunServe.stop();theHero.hero.stop();theHero2.hero.stop();
  if(runIndex==runs.length-1){trace("DONE|"+runs.length);delete _root.onEnterFrame;delete theHero.onEnterFrame;delete theHero2.onEnterFrame;delete theHero.gun.onEnterFrame;delete theHero2.gun.onEnterFrame;}
  else{for(var i=0;i<particleNum2;i++)_root["particle"+i].removeMovieClip();theBirdie.removeMovieClip();theHero.removeMovieClip();theHero2.removeMovieClip();nextRun=true;}
 }
};
trace("READY");
'''
program=program.replace('Math.random()','referenceRandom()');(scripts/'frame_1').mkdir(exist_ok=True);(scripts/'frame_1/DoAction.as').write_text(program,encoding='utf-8')
ff(['-importScript',cache/'empty.swf',cache/'reference.swf',scripts],'compile');print('Built live original six human CPU stages plus robot stages1/6 with native frame callbacks.')
(cache/'source.json').write_text(json.dumps({'source':'games/46923/game.swf','sha256':hashlib.sha256((ROOT/'games/46923/game.swf').read_bytes()).hexdigest(),'method':'Live original setupCPU/setupHero/setupHero1p/setupBirdie/trails/turn and nested scripts. External random provider uses the same specified seeded sequence; CPU GetTime provider uses native callback count with verified strict500ms P-code semantics. Original real Key/Mouse events. Score callbacks record point-over without next-point timers so60-frame segments stop before reset. Initial CPU/P1 creation order and CPU replacement order modeled separately. Native timelines/callback queues execute in Ruffle; captures are after native frames through ExternalInterface. No independent Adobe Flash binary run.','runs':8,'callbacksPerRun':60},indent=2)+'\n',encoding='utf-8')
