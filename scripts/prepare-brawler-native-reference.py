"""Keep original class/symbol bytes and replace only the root entry timeline."""
from pathlib import Path
import collections,hashlib,json,os,struct,subprocess,zlib
root=Path(__file__).resolve().parents[1];out=root/'artifacts/brawler-native-reference';out.mkdir(exist_ok=True)
raw=(root/'games/6232/game.swf').read_bytes();assert raw[:3] in [b'CWS',b'FWS']
body=zlib.decompress(raw[8:]) if raw[:3]==b'CWS' else raw[8:]
rect=(5+4*(body[0]>>3)+7)//8;offset=rect+4
def tags(data):
 at=0
 while at<len(data):
  start=at;head=struct.unpack_from('<H',data,at)[0];at+=2;code=head>>6;length=head&63
  if length==63:length=struct.unpack_from('<I',data,at)[0];at+=4
  payload=data[at:at+length];at+=length;assert at<=len(data)
  yield code,payload,data[start:at]
  if code==0:break
def tag(code,payload):return struct.pack('<HI',(code<<6)|63,len(payload))+payload
counts=collections.Counter();kept=[]
# Root execution/display flow is removed; original nested timelines, class
# initializers, export names, shapes, filters and media retain original bytes.
for code,payload,original in tags(body[offset:]):
 counts[code]+=1
 if code not in [0,1,4,5,9,12,15,19,26,28,43,45,70,82,86,89]:kept.append(original)
result=body[:rect+2]+struct.pack('<H',1)+b''.join(kept)+tag(12,b'\0')+b'\x40\x00\x00\x00'
(out/'base.swf').write_bytes(b'CWS'+raw[3:4]+struct.pack('<I',len(result)+8)+zlib.compress(result,9))
script=r'''
stop();Stage.scaleMode="noScale";Stage.align="TL";
var poseActors=[];var objectContainers=[];var objectCases=[];
function clearPoses(){for(var i=0;i<poseActors.length;i++)poseActors[i].removeMovieClip();for(var j=0;j<objectContainers.length;j++)objectContainers[j].removeMovieClip();poseActors=[];objectContainers=[];objectCases=[];}
function childOf(p){
 var child;
 for(var key in p)if(typeof(p[key])=="movieclip"&&p[key]._parent==p){child=p[key];break;}
 return child;
}
function poseRow(p){
 var child=childOf(p);
 var b=p.getBounds(p);var props={};var keys=["hand","bullet","poop","pencil","garbage","rocket","Body"];
 for(var i=0;i<7;i++){var key=keys[i];var m=child[key];if(m!=undefined)props[key]=[m._x,m._y,m._rotation,m._xscale,m._yscale,m._currentframe,m._totalframes,m._visible];}
 return [p.captureName,p.captureAction,p._currentframe,child._name,child._currentframe,child._totalframes,b.xMin,b.yMin,b.xMax,b.yMax,props,child._x,child._y,child._xscale,child._yscale];
}
function freezePose(p){
 p.gotoAndStop(p.captureAction);var child=childOf(p);if(child!=undefined)child.gotoAndStop(p.captureFrame);
 for(var i=0;i<p.captureHidden.length;i++)child[p.captureHidden[i]]._visible=false;
}
function addPose(name,action,frame,color,x,y,hidden){
 var p=_root.attachMovie(name,"pose"+poseActors.length,100+poseActors.length,{_x:x,_y:y,Colr:color,PlayNum:0});poseActors.push(p);
 p.captureName=name;p.captureAction=action;p.captureFrame=frame;p.captureHidden=hidden;
 freezePose(p);p.onEnterFrame=function(){freezePose(this);};return poseRow(p);
}
function ruleSnapshot(p){
 return {damage:p.DamageAmnt,combo:p.Combo,paralyzed:p.Paralized,controlLoss:p.CtrlLoss,vx:p.xInc,vy:p.yInc,state:p.State,hasControl:p.HasControl,attack:p.CurrentAttack,attackDone:p.AttckDne,specialUp:p.SpecUpOk,invincible:p.Invincible,dying:p.Dying,shielded:p.Shielded,shield:p.ShieldSize,spawning:p.Spawning,spawnProtection:p.SpInvTme,koTime:p.TimeKo,jumps:p.jumpstate,bulletShot:p.BulletShot,x:p._x,y:p._y,facing:p._xscale/100,rotation:p._rotation,pose:p._currentframe,lastSender:p.LastSender._name,electrocuted:p.Modifiers.Electrocuted};
}
function ruleActor(name,depth,x,y){
 var p=_root.attachMovie(name,"rule"+depth,depth,{_x:x,_y:y,Colr:"red",PlayNum:depth-100});poseActors.push(p);
 p.gotoAndStop("still");p.CurrentAttack="";p.Invincible=false;p.Dying=false;p.Shielded=false;p.onGround=true;p.SpecUpOk=true;p.Spawning=false;p.SpInvTme=0;p.TimeKo=0;p.BulletShot=false;p.Modifiers.Electrocuted=false;
 p.WorldObj={OSD:{UpdateDamage:function(){}},Bounds:{containsPoint:function(){return true;}}};return p;
}
var readyFrame=0;
this.onEnterFrame=function(){
 if(readyFrame++<2)return;
 delete this.onEnterFrame;
 _root.IntTime=25;_root.GameOn=true;
 Snd.PlaySound=function(name,loop){trace("SOUND|"+name);};
 Snd.StopSound=function(name){};
 _root.Game={LimitMode:"stock",Type:"test"};
 var actor=_root.attachMovie("DefaultPlayer","referenceFighter",100,{_x:250,_y:250,Colr:"red",PlayNum:0});
 actor.gotoAndStop("still");
 trace("READY|"+typeof(actor.Damage)+"|"+actor.FighterName+"|"+actor.Weight+"|"+actor.Speed+"|"+actor.Power+"|"+actor._totalframes);
 flash.external.ExternalInterface.addCallback("referencePose",this,function(name,action,frame,color){
  _root.referenceFighter.removeMovieClip();
  clearPoses();return addPose(name,action,frame,color,250,250,[]);
 });
 flash.external.ExternalInterface.addCallback("referenceBatch",this,function(cases){
  _root.referenceFighter.removeMovieClip();clearPoses();var results=[];
  for(var i=0;i<cases.length;i++){var c=cases[i];results.push(addPose(c[0],c[1],c[2],c[3],c[4],c[5],c[6]));}
  return results;
 });
 flash.external.ExternalInterface.addCallback("referenceRead",this,function(){var result=[];for(var i=0;i<poseActors.length;i++)result.push(poseRow(poseActors[i]));return result;});
 flash.external.ExternalInterface.addCallback("referencePlaybackBatch",this,function(cases){
  _root.referenceFighter.removeMovieClip();clearPoses();var results=[];
  for(var i=0;i<cases.length;i++){
   var c=cases[i];var p=_root.attachMovie(c[0],"pose"+poseActors.length,100+poseActors.length,{_x:c[4],_y:c[5],Colr:c[3],PlayNum:0});poseActors.push(p);
   p.captureName=c[0];p.captureAction=c[1];p.captureHidden=c[6];p.gotoAndStop(c[1]);var child=childOf(p);if(child!=undefined)child.gotoAndStop(1);
   p.onEnterFrame=function(){var clip=childOf(this);for(var j=0;j<this.captureHidden.length;j++)clip[this.captureHidden[j]]._visible=false;};results.push(poseRow(p));
  }
  return results;
 });
 flash.external.ExternalInterface.addCallback("referencePlayChildren",this,function(){for(var i=0;i<poseActors.length;i++)childOf(poseActors[i]).play();return true;});
 flash.external.ExternalInterface.addCallback("referenceRule",this,function(kind,c){
  _root.referenceFighter.removeMovieClip();clearPoses();var sounds=[];var launches=[];
  Snd.PlaySound=function(name,loop){sounds.push(["play",name]);};Snd.StopSound=function(name){sounds.push(["stop",name]);};
  var p=ruleActor(c.character,100,100,100);var q=ruleActor(c.targetCharacter==undefined?"DefaultPlayer":c.targetCharacter,101,130,100);
  for(var key in c.actor)p[key]=c.actor[key];for(var key in c.target)q[key]=c.target[key];
  if(c.targetPose!=undefined)q.gotoAndStop(c.targetPose);
  if(c.attack!=undefined){p.CurrentAttack=c.attack;p.gotoAndStop(c.attack);p[c.attack].gotoAndStop(c.frame==undefined?1:c.frame);}
  if(c.priorSender)q.LastSender=p;
  var child=childOf(p);var b=p.getBounds(p);var marks={};var keys=["hand","bullet","poop","pencil","garbage","rocket"];
  for(var i=0;i<keys.length;i++){var m=child[keys[i]];if(m!=undefined)marks[keys[i]]=[m._x,m._y,m._rotation,m._xscale,m._yscale,m._currentframe,m._totalframes,m._visible];}
  var context={bounds:[b.xMin,b.yMin,b.xMax,b.yMax],marks:marks,transform:[child._x,child._y,child._xscale,child._yscale]};
  var nativeAttach=_root.attachMovie;
  if(kind=="secondary"){
   p.ThrowVictim=q;
   _root.attachMovie=function(name,instance,depth,props){var o={name:name,properties:props,init:function(world,sender,extra){launches.push([this.name,this.properties,extra]);}};return o;};
   p.ParseSAttacks(c.withTarget?{object:q}:undefined);_root.attachMovie=nativeAttach;
  }else if(kind=="attack")p.Attack(c.type,c.extra);
  else if(kind=="contact")p.ParseAttacks({object:q,objType:"player"});
  else if(kind=="damageThrow"){
   var sender=c.noSender?undefined:p;q.Damage(c.amount,sender,c.force);q.Throw(c.power,c.angle,sender,c.force);
  }else if(kind=="quantize"){q._x=c.x;q._y=c.y;}
  return {actor:ruleSnapshot(p),target:ruleSnapshot(q),sounds:sounds,launches:launches,context:context};
 });
 flash.external.ExternalInterface.addCallback("referenceObjectBatch",this,function(cases){
  _root.referenceFighter.removeMovieClip();clearPoses();objectCases=cases;
  for(var i=0;i<cases.length;i++){
   var c=cases[i];var parent=_root.createEmptyMovieClip("objectContainer"+i,100+i);objectContainers.push(parent);parent._x=c[3];parent._y=c[4];parent.Game=_root.Game;parent.GameOn=true;
   var p=parent.attachMovie(c[0],"actor",1,{_x:0,_y:0,SType:c[5]});p.gotoAndStop(c[1]);
  }
  return true;
 });
 flash.external.ExternalInterface.addCallback("referenceObjectPlay",this,function(){for(var i=0;i<objectCases.length;i++)if(objectCases[i][2])objectContainers[i].actor.play();return true;});
 flash.external.ExternalInterface.addCallback("referenceObjectRead",this,function(){
  var rows=[];
  for(var i=0;i<objectContainers.length;i++){
   var parent=objectContainers[i];var p=parent.actor;
   if(p==undefined){rows.push({alive:false,frame:0,bounds:[0,0,0,0],position:[0,0]});continue;}
   var b=p.getBounds(parent);rows.push({alive:true,frame:p._currentframe,bounds:[b.xMin,b.yMin,b.xMax,b.yMax],position:[p._x,p._y],rotation:p._rotation,scale:[p._xscale,p._yscale],alpha:p._alpha,visible:p._visible});
  }
  return rows;
 });
 flash.external.ExternalInterface.addCallback("referenceStage",this,function(name){
  _root.referenceFighter.removeMovieClip();clearPoses();var stage=_root.attachMovie(name,"referenceStage",10,{_x:0,_y:0});stage.gotoAndStop(1);var results={};
  for(var key in stage)if(key.substr(0,5)=="Spawn")results[key]=[stage[key]._x,stage[key]._y,stage[key]._width,stage[key]._height];
  stage.removeMovieClip();return results;
 });
 var ticker=_root.createEmptyMovieClip("captureTicker",2);_root.captureFrame=0;
 ticker.onEnterFrame=function(){_root.captureFrame++;flash.external.ExternalInterface.call("nativeFrameReady",_root.captureFrame);};
 trace("DONE|native-setup");
};
'''
scripts=out/'scripts/frame_1';scripts.mkdir(parents=True,exist_ok=True);(scripts/'DoAction.as').write_text(script,'utf8')
jar=Path(os.environ.get('FFDEC_JAR') or Path(os.environ['LOCALAPPDATA'])/'Temp/opencode/4399/ffdec/ffdec.jar')
with (out/'compile.log').open('w',encoding='utf8') as log:subprocess.run(['java','-jar',str(jar),'-importScript',str(out/'base.swf'),str(out/'reference.swf'),str(out/'scripts')],cwd=root,stdout=log,stderr=subprocess.STDOUT,check=True)
record={'sourceSwfSha256':hashlib.sha256(raw).hexdigest(),'preservedTagsSha256':hashlib.sha256(b''.join(kept)).hexdigest(),'rootTagCounts':dict(counts),'harnessSha256':hashlib.sha256(script.encode()).hexdigest(),'method':'Original SWF class initializers, symbols, nested timelines and graphics retain original bytes; only root entry execution/display replaced with an isolated native MovieClip probe. No full-world or original Adobe Flash equivalence claim.'}
(out/'inputs.json').write_text(json.dumps(record,indent=2)+'\n','utf8');print('Prepared original brawler class/symbol reference.')
