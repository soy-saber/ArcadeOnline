"""Build an isolated AS2 reference from the original badminton functions and symbols."""
from pathlib import Path
import argparse, copy, hashlib, json, os, re, subprocess, xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--ffdec');parser.add_argument('--serve',type=int,choices=[0,1],default=0);args=parser.parse_args()
cache=ROOT/'artifacts/badminton-as2-reference';cache.mkdir(parents=True,exist_ok=True)
candidates=[Path(p) for p in [args.ffdec,os.environ.get('FFDEC_JAR')] if p]+[Path(os.environ.get('LOCALAPPDATA',''))/'Temp/opencode/4399/ffdec/ffdec.jar']
jar=next((p for p in candidates if p.is_file()),None)
if jar is None:raise SystemExit('Set --ffdec or FFDEC_JAR')
def ff(arguments,name):
    with (cache/(name+'.log')).open('w',encoding='utf-8') as log:subprocess.run(['java','-jar',str(jar),*map(str,arguments)],cwd=ROOT,check=True,stdout=log,stderr=subprocess.STDOUT)

xml=ROOT/'artifacts/swf-analysis/46923/game.xml';tree=ET.parse(xml);root=tree.getroot();tags=root.find('tags');original=list(tags);display={};frame=1
for e in original:
    kind=e.get('type','')
    if kind.startswith('PlaceObject'):
        assert e.get('placeFlagMove')!='true' or int(e.get('depth')) in display
        if e.get('placeFlagMove')=='true':
            old=copy.deepcopy(display[int(e.get('depth'))]);old.attrib.update(e.attrib)
            for child in e:
                existing=old.find(child.tag)
                if existing is not None:old.remove(existing)
                old.append(copy.deepcopy(child))
            display[int(e.get('depth'))]=old
        else:display[int(e.get('depth'))]=copy.deepcopy(e)
    elif kind.startswith('RemoveObject'):display.pop(int(e.get('depth')),None)
    elif kind=='ShowFrameTag':
        if frame==38:break
        frame+=1
tags.clear()
for e in original:
    if e.get('type','').startswith('Define') or e.get('type') in ['FileAttributesTag','SetBackgroundColorTag','ExportAssetsTag']:tags.append(copy.deepcopy(e))
for e in display.values():
    if e.get('name') in ['leftWall','rightWall','net','netLimit','bottomLimit','gunnerPoint','gunnerPoint2','netSprite']:
        e.set('placeFlagMove','false');tags.append(e)
ET.SubElement(tags,'item',{'type':'DoActionTag','actionBytes':'00','forceWriteAsLong':'true'})
ET.SubElement(tags,'item',{'type':'ShowFrameTag','forceWriteAsLong':'false'})
root.set('frameCount','1')
minimal=cache/'reference.xml';tree.write(minimal,encoding='utf-8',xml_declaration=True);ff(['-xml2swf',minimal,cache/'empty.swf'],'minimal-swf')
source_root=ROOT/'artifacts/swf-analysis/46923/deobfuscated/scripts';source=(source_root/'frame_38/DoAction.as').read_text('utf-8')
def function(name):
    text=source[source.index('function '+name+'('):];return text.split('\nfunction ',1)[0].strip()

cases=[]
for y in [310.4168915-0.01,310.4168915,310.4168915+0.01,376.25-0.05,376.25]:
    for x in [36.5,258.79674545,275,291.20325455,513.5]:
        for vx,vy in [(0,0),(5,1),(-5,1),(0,5)]:cases.append({'x':x,'y':y,'vx':vx,'vy':vy,'random':0.25})
cases.extend([
    {'x':270,'y':310.4168915,'vx':10,'vy':1,'bottomSide':True,'leftSide':True,'random':.75},
    {'x':280,'y':310.4168915,'vx':-10,'vy':1,'topSide':True,'rightSide':True,'random':.25},
    {'x':275,'y':350,'vx':0,'vy':2,'leftSide':True,'random':.25},
    {'x':275,'y':350,'vx':0,'vy':2,'rightSide':True,'random':.75},
    {'x':100,'y':376.25,'vx':0,'vy':5,'random':.25},
    {'x':100,'y':376.25,'vx':1,'vy':1,'random':.75},
    {'x':100,'y':376.25,'vx':-1,'vy':1,'random':.75},
])
hits=[{'seat':seat,'angle':angle,'priorHit':prior} for seat in [1,2] for angle in [-175,-90,0,45,90,175] for prior in [0,1,2]]
scripts=cache/'scripts';(scripts/'frame_1').mkdir(parents=True,exist_ok=True)
for name in ['DefineSprite_306_hero','DefineSprite_268_hero2','DefineSprite_283','DefineSprite_205','DefineSprite_285','DefineSprite_211','DefineSprite_305','DefineSprite_276','DefineSprite_259','DefineSprite_190']:
    for file in (source_root/name).rglob('*.as'):
        target=scripts/file.relative_to(source_root);target.parent.mkdir(parents=True,exist_ok=True)
        clean='\n'.join(file.read_text('utf-8').splitlines()[2:])
        if name=='DefineSprite_283' and file.parent.name in ['frame_2','frame_9','frame_15']:
            clean+='\ntrace("SCRIPT|"+_root.heroCallbacks+"|'+file.parent.name+'|"+_root.p1Swing+"|"+_root.p1RacketReady);'
        if name in ['DefineSprite_283','DefineSprite_205'] and file.parent.name=='frame_1':
            clean=clean.replace('Math.random()','_root.referenceRandom()').replace('\n};','\n   trace("GUNCALL|'+name+'|"+_root.heroCallbacks+"|"+this._currentframe+"|"+_root.p1RacketDir+"|"+_root.p2RacketDir);\n};')
        target.write_text(clean+'\n',encoding='utf-8')

root_script='''stop();
Stage.scaleMode="noScale";Stage.align="TL";
var gamePaused=false;var serve=1;var particleNum2=0;var pointOver=false;
var hitSound={start:function(){}};
var score1=0;var score2=0;var netHits=0;
function p1Scored(){score1++;pointOver=true;}
function p2Scored(){score2++;pointOver=true;}
var theHero={gun:{racket:{racket:{hitbox:{hitTest:function(){return false;}}}}}};
var theHero2={gun:{racket:{racket:{hitbox:{hitTest:function(){return false;}}}}}};
'''+function('turn')+'\n'+function('mothershipTrail')+'\n'+function('setupBirdie')+'''
var savedPlay=netSprite.play;netSprite.play=function(){netHits++;};
var randomValue=0.25;function referenceRandom(){return randomValue;}
var vectors=VECTORS;
trace("GEOMETRY|"+net._x+"|"+net._y+"|"+net._width+"|"+net._height+"|"+bottomLimit._y);
trace("NETLIMIT|"+netLimit._x+"|"+netLimit._y+"|"+netLimit._width+"|"+netLimit._height);
for(var j=0;j<vectors.length;j++){
 var v=vectors[j];score1=0;score2=0;pointOver=false;netHits=0;particleNum2=0;randomValue=v.random;
 setupBirdie({Point:{x:v.x,y:v.y}});theBirdie.dx=-v.vx;theBirdie.dy=-v.vy;
 if(v.leftSide!=undefined)theBirdie.leftSide=v.leftSide;
 if(v.rightSide!=undefined)theBirdie.rightSide=v.rightSide;
 if(v.topSide!=undefined)theBirdie.topSide=v.topSide;
 if(v.bottomSide!=undefined)theBirdie.bottomSide=v.bottomSide;
 theBirdie.onEnterFrame();
 trace("BALL|"+j+"|"+theBirdie._x+"|"+theBirdie._y+"|"+(-theBirdie.dx)+"|"+(-theBirdie.dy)+"|"+theBirdie.bird._rotation+"|"+theBirdie.hyp+"|"+theBirdie.leftSide+"|"+theBirdie.rightSide+"|"+theBirdie.topSide+"|"+theBirdie.bottomSide+"|"+score1+"|"+score2+"|"+netHits+"|"+particleNum2);
 theBirdie.removeMovieClip();for(var k=0;k<particleNum2;k++)_root["particle"+k].removeMovieClip();
}
var hitVectors=HIT_CASES;var forceHit=0;var hitCount=0;
hitSound.start=function(){hitCount++;};
theHero.gun.racket.racket.hitbox.hitTest=function(){return forceHit==1;};
theHero2.gun.racket.racket.hitbox.hitTest=function(){return forceHit==2;};
for(var hi=0;hi<hitVectors.length;hi++){
 var hv=hitVectors[hi];randomValue=0.25;setupBirdie({Point:{x:100,y:100}});
 theBirdie.dx=-3;theBirdie.dy=-2;hitCount=0;particleNum2=0;
 p1Swing=hv.seat==1;p2Swing=hv.seat==2;p1Hit=hv.priorHit==1;p2Hit=hv.priorHit==2;
 p1RacketDir=hv.angle;p2RacketDir=hv.angle;forceHit=hv.seat;theBirdie.onEnterFrame();
 trace("HIT|"+hi+"|"+theBirdie._x+"|"+theBirdie._y+"|"+(-theBirdie.dx)+"|"+(-theBirdie.dy)+"|"+theBirdie.bird._rotation+"|"+hitCount+"|"+p1Hit+"|"+p2Hit);
 theBirdie.removeMovieClip();for(var hk=0;hk<particleNum2;hk++)_root["particle"+hk].removeMovieClip();
}
forceHit=0;hitSound.start=function(){};
var p=attachMovie("particle3","probe",190001);p._alpha=100;
trace("PARTICLE_PRE|"+p._alpha+"|"+p._width+"|"+p.alphaRate);
p._alpha-=p.alphaRate;trace("PARTICLE_NAN|"+p._alpha+"|"+p._width);
p._rotation=45;trace("PARTICLE_ROT45|"+p._alpha+"|"+p._width);
for(var q=0;q<4;q++){p._x=[5.123,5.127,-5.123,-5.127][q];trace("TWIPS|"+q+"|"+p._x);}
p.removeMovieClip();particleNum2=0;randomValue=0.25;mothershipTrail(100,100);p=_root.particle0;
for(var z=0;z<50;z++){if(_root.particle0==undefined)break;trace("TRAIL|"+z+"|"+p._x+"|"+p._y+"|"+p._rotation+"|"+p._xscale+"|"+p._yscale+"|"+p._width+"|"+p.Width+"|"+p._alpha);p.onEnterFrame();}
trace("TRAIL_DEAD|"+z);netSprite.play=savedPlay;
for(var seat=1;seat<=2;seat++){
 var actor=attachMovie(seat==1?"hero":"hero2","probeHero",199000);actor._x=0;actor._y=0;
 var limit=seat==1?29:15;
 for(var nativeFrame=1;nativeFrame<=limit;nativeFrame++){
  actor.gun.gotoAndStop(nativeFrame);var box=actor.gun.racket.racket.hitbox;var bounds=box.getBounds(_root);
  trace("RACKET|"+seat+"|"+nativeFrame+"|"+actor.gun.racket._rotation+"|"+bounds.xMin+"|"+bounds.yMin+"|"+bounds.xMax+"|"+bounds.yMax+"|"+box.hitTest(bounds.xMin,bounds.yMin,false)+"|"+box.hitTest(bounds.xMax,bounds.yMax,false));
 }
 for(var nativeServe=1;nativeServe<=13;nativeServe++){
  actor.gunServe.gotoAndStop(nativeServe);var marker={x:0,y:0};actor.gunServe.mc.localToGlobal(marker);trace("SERVEPOINT|"+seat+"|"+nativeServe+"|"+marker.x+"|"+marker.y);
 }
 actor.removeMovieClip();
}
var mover=attachMovie("hero","probeMove",199001);mover._y=bottomLimit._y;mover._x=gunnerPoint._x;
for(var m=0;m<100;m++){if(!leftWall.hitTest(mover._x,mover._y,true))mover._x-=5.9;}
trace("MOVE_LEFT|"+mover._x);mover._x=gunnerPoint2._x;
for(var m2=0;m2<100;m2++){if(!rightWall.hitTest(mover._x,mover._y,false))mover._x+=5.9;}
trace("MOVE_RIGHT|"+mover._x);mover._x=215.45;
if(!netLimit.hitTest(mover._x,mover._y,false))mover._x+=5.9;
if(!leftWall.hitTest(mover._x,mover._y,true))mover._x-=5.9;
trace("MOVE_BOTH|"+mover._x);mover._x=netLimit._x-netLimit._width/2-65;trace("RESET_LEFT|"+mover._x);mover._x=netLimit._x+netLimit._width/2+65;trace("RESET_RIGHT|"+mover._x);mover.removeMovieClip();
trace("WALL_EDGE|"+leftWall.hitTest(46.5,bottomLimit._y,true)+"|"+leftWall.hitTest(26.5,bottomLimit._y,true));
var heroCallbacks=0;var held=true;serve=REFERENCE_SERVE;
'''
hero=function('setupHero1').replace('theHero.onEnterFrame = function()\n   {','theHero.onEnterFrame = function()\n   {\n      _root.heroCallbacks++;')
hero=hero.replace('_root.heroCallbacks++;','_root.heroCallbacks++;\n      trace("CONTROL|"+_root.heroCallbacks+"|"+Key.isDown(83)+"|"+_root.p1RacketReady+"|"+this.gun._currentframe+"|"+this.gunServe._currentframe+"|"+_root.serve);')
hero=hero.replace('this.gun.gotoAndPlay(2);','trace("STROKE|"+_root.heroCallbacks+"|"+this.gun._currentframe+"|"+_root.p1RacketReady);\n               this.gun.gotoAndPlay(2);')
hero2=function('setupHero2').replace('theHero2.onEnterFrame = function()\n   {','theHero2.onEnterFrame = function()\n   {\n      trace("CONTROL2|"+_root.heroCallbacks);')
root_script+=hero+'\n'+hero2+'''
setupHero1();setupHero2();
trace("HERO|"+theHero+"|"+theHero.gun+"|"+theHero.gunServe+"|"+p1RacketReady);
flash.external.ExternalInterface.addCallback("nativeSnapshot",_root,function(){return {heroCallbacks:heroCallbacks,serve:serve,gun:theHero.gun._currentframe,serveGun:theHero.gunServe._currentframe,ready:p1RacketReady,swing:p1Swing,body:theHero.hero._currentframe,birdX:theBirdie._x,birdY:theBirdie._y,birdVx:-theBirdie.dx,birdVy:-theBirdie.dy,netFrame:netSprite._currentframe};});
_root.onEnterFrame=function(){trace("ROOTCALL|"+heroCallbacks);if(heroCallbacks>=60){held=false;trace("DONE|"+heroCallbacks);delete _root.onEnterFrame;delete theHero.onEnterFrame;delete theHero2.onEnterFrame;delete theHero.gun.onEnterFrame;}};
'''
root_script=root_script.replace('VECTORS',re.sub(r'"([A-Za-z0-9_]+)":',r'\1:',json.dumps(cases,separators=(',',':'))))
root_script=root_script.replace('HIT_CASES',re.sub(r'"([A-Za-z0-9_]+)":',r'\1:',json.dumps(hits,separators=(',',':'))))
root_script=root_script.replace('REFERENCE_SERVE',str(args.serve)).replace('Math.random()','referenceRandom()')
root_script=root_script.replace('var _loc2_;\n      if(!gamePaused)','var _loc2_;\n      if(_root.heroCallbacks!=undefined)trace("BIRDCALL|"+_root.heroCallbacks+"|"+_root.theHero.gun._currentframe+"|"+this._x+"|"+this._y+"|"+_root.p1RacketDir);\n      if(!gamePaused)',1)
(scripts/'frame_1/DoAction.as').write_text(root_script,encoding='utf-8')
(cache/'vectors.json').write_text(json.dumps(cases,indent=2)+'\n',encoding='utf-8')
(cache/'hit-vectors.json').write_text(json.dumps(hits,indent=2)+'\n',encoding='utf-8')
ff(['-importScript',cache/'empty.swf',cache/'reference.swf',scripts],'compile')
(cache/'source.json').write_text(json.dumps({'source':'games/46923/game.swf','sourceSha256':hashlib.sha256((ROOT/'games/46923/game.swf').read_bytes()).hexdigest(),'method':'Original setupBirdie, mothershipTrail, turn, setupHero1/setupHero2 functions compiled by JPEXS with native symbols/markers. Score/audio test stubs; trace-only instrumentation; vectors isolated from production.','functions':['setupBirdie','mothershipTrail','turn','setupHero1','setupHero2'],'vectors':len(cases)},indent=2)+'\n',encoding='utf-8')
print('Prepared original-AS2 reference with',len(cases),'physics vectors, native property probes and held-stroke callback trace.')
