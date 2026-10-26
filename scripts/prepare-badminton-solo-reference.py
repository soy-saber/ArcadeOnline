"""Compile original CPU/human/robot functions into an isolated native reference."""
from pathlib import Path
import argparse,copy,hashlib,json,os,re,subprocess,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--ffdec');args=parser.parse_args()
cache=ROOT/'artifacts/badminton-solo-reference';cache.mkdir(parents=True,exist_ok=True)
candidates=[Path(p) for p in [args.ffdec,os.environ.get('FFDEC_JAR')] if p]+[Path(os.environ.get('LOCALAPPDATA',''))/'Temp/opencode/4399/ffdec/ffdec.jar']
jar=next((p for p in candidates if p.is_file()),None)
if jar is None:raise SystemExit('Set --ffdec or FFDEC_JAR')
def ff(a,name):
    with (cache/(name+'.log')).open('w',encoding='utf-8') as log:subprocess.run(['java','-jar',str(jar),*map(str,a)],cwd=ROOT,check=True,stdout=log,stderr=subprocess.STDOUT)
xml=ROOT/'artifacts/swf-analysis/46923/game.xml';tree=ET.parse(xml);root=tree.getroot();tags=root.find('tags');original=list(tags);display={};frame=1
for e in original:
    kind=e.get('type','');depth=int(e.get('depth','0'))
    if kind.startswith('PlaceObject'):
        old=copy.deepcopy(display[depth]) if e.get('placeFlagMove')=='true' else ET.Element('item');old.attrib.update(e.attrib)
        for c in e:
            prior=old.find(c.tag)
            if prior is not None:old.remove(prior)
            old.append(copy.deepcopy(c))
        old.set('placeFlagMove','false');display[depth]=old
    elif kind.startswith('RemoveObject'):display.pop(depth,None)
    elif kind=='ShowFrameTag':
        if frame==38:break
        frame+=1
tags.clear()
for e in original:
    if e.get('type','').startswith('Define') or e.get('type') in ['FileAttributesTag','SetBackgroundColorTag','ExportAssetsTag']:tags.append(copy.deepcopy(e))
for e in display.values():
    if e.get('name') in ['leftWall','rightWall','net','netLimit','bottomLimit','gunnerPoint','gunnerPoint2','servingSpot1','servingSpot2','servingSpot3']:tags.append(e)
ET.SubElement(tags,'item',{'type':'DoActionTag','actionBytes':'00','forceWriteAsLong':'true'});ET.SubElement(tags,'item',{'type':'ShowFrameTag','forceWriteAsLong':'false'});root.set('frameCount','1')
minimal=cache/'reference.xml';tree.write(minimal,encoding='utf-8',xml_declaration=True);ff(['-xml2swf',minimal,cache/'empty.swf'],'minimal')
source_root=ROOT/'artifacts/swf-analysis/46923/deobfuscated/scripts';source=(source_root/'frame_38/DoAction.as').read_text('utf-8')
def function(name):return source[source.index('function '+name+'('):].split('\nfunction ',1)[0].strip()
cpu=function('setupCPU')
assert 'this.serveTime + this.serveCooldown < 4084' in cpu and 'theHero2.serveTime = 1928' in cpu
cpu=cpu.replace('theHero2.serveTime = 1928','theHero2.serveTime = referenceNow').replace('this.serveTime + this.serveCooldown < 4084','this.serveTime + this.serveCooldown < referenceNow')
cpu=cpu.replace('this.gunServe.play();','referenceService=true;this.gunServe.play();')
for name in ['moveLeft','moveRight','noMove','swing','jumpIt']:
    cpu=cpu.replace('theHero2.'+name+' = function()\n   {','theHero2.'+name+' = function()\n   {\n      referenceActions.push("'+name+'");')
cpu=cpu.replace('this.swing();','referenceActions.push("beforeSwing:"+numGen3);this.swing();')
robot=function('setupHero1p').replace('_xmouse','referencePointerX').replace('_ymouse','referencePointerY')
human=function('setupHero')

symbols={int(e.get('spriteId')):e for e in root.iter() if e.get('type')=='DefineSpriteTag'};used=set()
def use(sid):
    if sid in used or sid not in symbols:return
    used.add(sid)
    for e in symbols[sid].find('subTags'):
        if e.get('characterId'):use(int(e.get('characterId')))
for sid in [306,268,267,261,255,248,242,271,13]:use(sid)
scripts=cache/'scripts';(scripts/'frame_1').mkdir(parents=True,exist_ok=True)
for directory in source_root.glob('DefineSprite_*'):
    sid=int(re.match(r'DefineSprite_(\d+)',directory.name)[1])
    if sid not in used:continue
    for file in directory.rglob('*.as'):
        target=scripts/file.relative_to(source_root);target.parent.mkdir(parents=True,exist_ok=True);target.write_text('\n'.join(file.read_text('utf-8').splitlines()[2:])+'\n',encoding='utf-8')

cases=[]
for level in range(1,7):
    for x in [380,405,440,480]:
        for chance in [None,0,75]:
            for bx,by,vx,direction in [(220,200,20,100),(440,300,20,100),(440,330,0,180),(455,281,10,90),(460,190,0,90)]:
                for sway in [None,0,40]:cases.append({'level':level,'x':x,'y':376.25,'vy':0,'serve':0,'chance1':chance,'chance3':100 if sway is None else 25,'swingVar':sway,'swingVar2':None if sway is None else 20 if sway else 0,'numVar2':5,'bx':bx,'by':by,'vx':vx,'direction':direction,'now':0,'spot':1,'paused':False,'pointOver':False,'ready':True,'active':False,'jump':False})
    for spot in [0,1,2,3]:
        for now in [499,500,501]:
            for x in [350,434.95,474.95,490]:cases.append({'level':level,'x':x,'y':376.25,'vy':0,'serve':2,'chance1':None,'chance3':100,'swingVar':None,'swingVar2':None,'numVar2':5,'bx':None,'by':None,'vx':0,'direction':0,'now':now,'spot':spot,'paused':False,'pointOver':False,'ready':True,'active':False,'jump':False})
for paused,point,ready,active in [(True,False,True,False),(False,True,True,False),(False,False,False,False),(False,False,False,True)]:
    for y,vy in [(290,-1),(376.25,12)]:
        v=copy.deepcopy(cases[200]);v.update({'paused':paused,'pointOver':point,'ready':ready,'active':active,'y':y,'vy':vy});cases.append(v)
robots=[]
for pointer in [[0,0],[100,200],[400,400],[-10,420],[500,-50]]:
    for paused,over in [(False,False),(True,False),(False,True)]:
        for serve in [0,1]:robots.append({'pointer':pointer,'paused':paused,'over':over,'serve':serve,'x':162.85,'y':356.25,'phase':0,'mouse':True,'space':False})
for space in [True,False]:robots.append({'pointer':[170,300],'paused':False,'over':False,'serve':0,'x':100,'y':250,'phase':.7,'mouse':False,'space':space})
as2=lambda value:re.sub(r'"([A-Za-z0-9_]+)":',r'\1:',json.dumps(value,separators=(',',':')))
script='''stop();Stage.scaleMode="noScale";Stage.align="TL";
var gamePaused=false;var gameOver=false;var gameStart=false;var serve=0;var Type="human";var Mode="1p";var referenceNow=0;
var referencePointerX=0;var referencePointerY=0;var referenceKeys={};var referenceService=false;var referenceActions=[];var randomCalls=0;
function referenceRandom(){randomCalls++;return 0.25;}
function referenceKey(code){return referenceKeys[code]==true;}
var whooshSound={start:function(){}};function setupBirdie(marker){}
'''+function('turn')+'\n'+function('mothershipTrail')+'\n'+function('mothershipTrail2')+'\n'+cpu+'\n'+robot+'\n'+human+'''
var cases=CPU_CASES;
for(var j=0;j<cases.length;j++){
 var v=cases[j];difficulty=v.level;referenceNow=0;setupCPU();referenceNow=v.now;
 theHero2._x=v.x;theHero2._y=v.y;theHero2.dy=-v.vy;theHero2.jump=v.jump;serve=v.serve;servingSpotNum=v.spot;
 gamePaused=v.paused;pointOver=v.pointOver;p2RacketReady=v.ready;p2Swing=v.active;numVar2=v.numVar2;numGen1=v.chance1;numGen3=v.chance3;
 if(v.swingVar==null){delete _root.swingVar;}else{_root.swingVar=v.swingVar;}
 if(v.swingVar2==null){delete _root.swingVar2;}else{_root.swingVar2=v.swingVar2;}
 theBirdie={_x:v.bx,_y:v.by,dx:-v.vx,dir:v.direction};referenceService=false;referenceActions=[];randomCalls=0;
 theHero2.onEnterFrame();
 trace("CPU|"+j+"|"+theHero2._x+"|"+theHero2._y+"|"+(-theHero2.dy)+"|"+theHero2.jump+"|"+theHero2._currentframe+"|"+theHero2.gun._currentframe+"|"+theHero2.gunServe._currentframe+"|"+p2RacketReady+"|"+p2Swing+"|"+theHero2.serveReady+"|"+numVar2+"|"+swingVar+"|"+swingVar2+"|"+numGen3+"|"+randomCalls+"|"+referenceService+"|"+referenceActions.join(","));
 theHero2.removeMovieClip();
}
var robots=ROBOT_CASES;
for(var k=0;k<robots.length;k++){
 var v=robots[k];gamePaused=v.paused;gameOver=v.over;gameStart=true;Type="robot";Mode="1p";serve=v.serve;referencePointerX=v.pointer[0];referencePointerY=v.pointer[1];theMouseDown=v.mouse;referenceKeys={};referenceKeys[32]=v.space;
 setupHero1p();theHero._x=v.x;theHero._y=v.y;theHero.Var=v.phase;p1Swing=false;p1RacketReady=true;particleNum2=0;randomCalls=0;
 theHero.onEnterFrame();
 trace("ROBOT|"+k+"|"+theHero._x+"|"+theHero._y+"|"+theHero.Var+"|"+theHero.jump+"|"+theHero.dy+"|"+theHero._currentframe+"|"+theHero.gun._currentframe+"|"+theHero.gunServe._currentframe+"|"+p1RacketReady+"|"+p1Swing+"|"+randomCalls+"|"+particleNum2);
 for(var z=0;z<particleNum2;z++){var p=_root["particle"+z];trace("ROBOT_TRAIL|"+k+"|"+z+"|"+p._x+"|"+p._y+"|"+p.dx+"|"+p.dy+"|"+p._rotation+"|"+p.Width+"|"+p._width);p.removeMovieClip();}
 theHero.removeMovieClip();
}
gamePaused=false;gameOver=false;
var names=["hero","hero2","hero3","hero4","hero5","hero6","hero7","hero1p"];
for(var a=0;a<names.length;a++){
 var actor=attachMovie(names[a],"actor",199001);actor._x=0;actor._y=0;
 var count=a==0?29:15;
 for(var frame=1;frame<=count;frame++){actor.gun.gotoAndStop(frame);var box=actor.gun.racket.racket.hitbox;var b=box.getBounds(_root);trace("SOLO_RACKET|"+names[a]+"|"+frame+"|"+actor.gun.racket._rotation+"|"+b.xMin+"|"+b.yMin+"|"+b.xMax+"|"+b.yMax);}
 for(var frame=1;frame<=13;frame++){actor.gunServe.gotoAndStop(frame);var p={x:0,y:0};actor.gunServe.mc.localToGlobal(p);trace("SOLO_SERVE|"+names[a]+"|"+frame+"|"+p.x+"|"+p.y);}
 actor.removeMovieClip();
}
for(var name in {leftWall:1,rightWall:1,netLimit:1}){
 var wall=_root[name];var b=wall.getBounds(_root);trace("SHAPE_BOUNDS|"+name+"|"+b.xMin+"|"+b.yMin+"|"+b.xMax+"|"+b.yMax);
 var points=[];
 for(var edge=0;edge<2;edge++)for(var d=-3;d<=3;d++){var x=(edge==0?b.xMin:b.xMax)+d*.05;points.push([x,wall._y]);}
 for(var edge=0;edge<2;edge++)for(var d=-3;d<=3;d++){var y=(edge==0?b.yMin:b.yMax)+d*.05;points.push([wall._x,y]);}
 for(var q=0;q<points.length;q++){var p=points[q];trace("SHAPE|"+name+"|"+p[0]+"|"+p[1]+"|"+wall.hitTest(p[0],p[1],true)+"|"+wall.hitTest(p[0],p[1],false));}
}
particleNum2=0;mothershipTrail(10,20);var ball0=theParticle;
particleNum2=0;mothershipTrail2(30,40);var robot0=getInstanceAtDepth(135000);var robot1=getInstanceAtDepth(135001);
// MovieClip equality compares instance paths, which collide across depths.
// Query primitive depth/position values to prove coexistence and replacement.
trace("PARTICLE_SLOTS|coexist|"+particleNum2+"|"+(getInstanceAtDepth(180000).getDepth()==180000)+"|"+(getInstanceAtDepth(135000).getDepth()==135000)+"|"+(getInstanceAtDepth(135001).getDepth()==135001)+"|"+(getInstanceAtDepth(180000)._x==7.5&&getInstanceAtDepth(135000)._x==28.5));
particleNum2=999;mothershipTrail(50,60);var ball999=theParticle;
trace("PARTICLE_SLOTS|ball-wrap|"+particleNum2+"|"+(getInstanceAtDepth(180999)._x==47.5)+"|"+(getInstanceAtDepth(180000)._x==7.5)+"|"+(getInstanceAtDepth(135000)._x==28.5));
particleNum2=999;mothershipTrail2(70,80);
trace("PARTICLE_SLOTS|robot-wrap|"+particleNum2+"|"+(getInstanceAtDepth(135000)._x==68.5)+"|"+(getInstanceAtDepth(135001)._x==28.5)+"|"+(getInstanceAtDepth(180000)._x==7.5)+"|"+(getInstanceAtDepth(180999)._x==47.5)+"|"+(getInstanceAtDepth(135999).getDepth()==135999));
trace("DONE|"+cases.length+"|"+robots.length);
'''
script=script.replace('CPU_CASES',as2(cases)).replace('ROBOT_CASES',as2(robots)).replace('Math.random()','referenceRandom()').replace('Key.isDown(','referenceKey(')
(scripts/'frame_1/DoAction.as').write_text(script,encoding='utf-8');(cache/'cases.json').write_text(json.dumps({'cpu':cases,'robots':robots},indent=2)+'\n',encoding='utf-8')
ff(['-importScript',cache/'empty.swf',cache/'reference.swf',scripts],'compile')
(cache/'source.json').write_text(json.dumps({'source':'games/46923/game.swf','sourceSha256':hashlib.sha256((ROOT/'games/46923/game.swf').read_bytes()).hexdigest(),'as2Sha256':hashlib.sha256((source_root/'frame_38/DoAction.as').read_bytes()).hexdigest(),'pcodeSha256':hashlib.sha256((ROOT/'artifacts/swf-analysis/46923/pcode/scripts/frame_38/DoAction.pcode').read_bytes()).hexdigest(),'cpuCases':len(cases),'robotCases':len(robots),'method':'Original setupCPU/setupHero/setupHero1p/mothershipTrail2/turn and native nested scripts/symbols. Key/mouse/random/time providers replace only external inputs. P-code GetTime verified for CPU serveTime and strict500ms comparison; decompiler constants replaced accordingly. Trace-only action observers; sound/unused release stubs. Isolated reference, not production.'},indent=2)+'\n',encoding='utf-8')
print('Prepared',len(cases),'CPU cases and',len(robots),'robot cases with all native actor geometry.')
