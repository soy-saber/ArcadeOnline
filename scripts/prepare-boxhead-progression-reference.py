"""Execute original progression methods with explicit external world observers."""
from pathlib import Path
import hashlib,json,os,re,subprocess,xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[1];cache=root/'artifacts/boxhead-progression-reference';cache.mkdir(parents=True,exist_ok=True)
base=root/'artifacts/swf-analysis/50737/clean/scripts/__Packages'
paths={'upgrades':base/'World/CUpgrades.as','world':base/'World/CWorld.as','player':base/'Thing/Creature/CThing_Creature_Player.as','creature':base/'Thing/Creature/CThing_Creature.as'}
paths.update({k:base/('Thing/Object/CThing_Object_'+name+'.as') for k,name in [('mine','Mine'),('pack','ChargePack'),('pickup','Pickup')]})
sources={k:p.read_text('utf8') for k,p in paths.items()}
def methods(text):
 matches=list(re.finditer(r'^   function (?:(get|set) )?(\w+)\(([^\n]*)\)',text,re.M));result={}
 for i,m in enumerate(matches):
  block=text[m.start():matches[i+1].start() if i+1<len(matches) else text.rfind('\n}')].strip()
  key=(m[1]+'_' if m[1] else '')+m[2];result[key]=re.sub(r'^function (?:(?:get|set) )?\w+\(', 'function native_'+key+'(',block,count=1)
 return result
up=methods(sources['upgrades']);player=methods(sources['player']);creature=methods(sources['creature']);world=methods(sources['world'])
included={k:v for k,v in up.items() if k not in ['CUpgrades','Dispose','toString']}
script='stop();\n'+'\n'.join(included.values())+'\n'+world['LogKill'].replace('native_LogKill','native_WorldLogKill')+'\n'+player['NewWeapon'].replace('native_NewWeapon','native_PlayerNewWeapon')+'\n'
script+=creature['State_Dead_Init'].replace('native_State_Dead_Init','native_DeadInit')+'\n'+creature['State_Dead'].replace('native_State_Dead','native_EnemyDead')+'\n'+player['State_Dead'].replace('native_State_Dead','native_PlayerDead')+'\n'
script+=player['State_PlayerControl'].split('      this.mDelta',1)[0].replace('native_State_PlayerControl','native_Regen')+'}\n'
for key,names in [('mine',['Process_Normal','Process_Detonate']),('pack',['Process_Normal','Process_Detonate']),('pickup',['SetDeleteCounter','Process_DeleteCounter_Init','Process_DeleteCounter'])]:
 for name in names:script+=methods(sources[key])[name].replace('native_'+name,'native_'+key+'_'+name)+'\n'
assign=[];properties={}
for name in included:
 if name.startswith(('get_','set_')):properties.setdefault(name[4:],{})[name[:3]]='native_'+name
 else:assign.append('actor.'+name+'=native_'+name+';')
for name,fns in properties.items():assign.append('actor.addProperty('+json.dumps(name)+','+fns.get('get','null')+','+fns.get('set','null')+');')
script+='''
var World={CWorld:{mGameMode:"Coop"}};var CMain={mFPS:25,mSaveData:{mDevilsActive:true}};var samples=0;var CSound={mSamples:{Click:{PlaySound:function(){samples++;}}}};_root._quality="HIGH";
var actor;var tick=0;var events=[];
function setup(fps,devils,mode,tier){
 CMain.mFPS=fps;CMain.mSaveData.mDevilsActive=devils;World.CWorld.mGameMode=mode;samples=0;events=[];tick=0;
 var w={score:0,drops:0,mThing_Collection:{mThingCounters:{CThing_Creature_Zombie:0,CThing_Creature_Devil:0},mPlayerThings:{}},mHud:{mPlayer1_Deaths:0,mPlayer2_Deaths:0,AddMessage_Upgrade:function(name){events.push("upgrade:"+name);},AddMessage_Level:function(name){},AddScore:function(p,amount){w.score+=amount;}},GetScreenPosition:function(p){return p;},_CreatePickup:function(p){w.drops++;},LogKill:native_WorldLogKill,
 Spawn_Zombie:function(){events.push("z:"+tick);actor.mZombieCount++;w.mThing_Collection.mThingCounters.CThing_Creature_Zombie++;return true;},Spawn_Devil:function(){events.push("d:"+tick);actor.mDevilCount++;w.mThing_Collection.mThingCounters.CThing_Creature_Devil++;return true;}};
 actor={mWorld:w,mIDCount:0,mTick:0,_TotalPlayerCount:0};ASSIGN
 w.mUpgrades=actor;actor.InitLists();actor.SetDifficulty(tier);return actor;
}
function n(v){return v==undefined?0:v;}
function levelRow(label,index){var l=actor.Level;trace(label+"|"+index+"|"+[actor.mLevel,l.Zombie_SpawnRate,l.Zombie_Count,l.Zombie_TotalCount,n(l.Devil_SpawnRate),n(l.Devil_Count),n(l.Devil_TotalCount),actor.CThing_Creature_Zombie.SpeedUp,n(actor.CThing_Creature_Devil.SpeedUp)].join("|"));}
function stateRow(label,index){var l=actor.Level;trace(label+"|"+index+"|"+[actor.mTick,actor.mLevel,actor.mMultiplier,actor.mMultiplierTick,actor.mMultiplierTickTotal,actor.mMultipleKill,actor.mMultipleKillsTick,actor.mMultipleKillsTickTotal,l.mZombieCount,l.mDevilCount,l.Zombie_Count,l.Zombie_TotalCount,n(l.Devil_Count),n(l.Devil_TotalCount),l.mSpawnCount_Zombie,n(l.mSpawnCount_Devil),actor.mWorld.score,actor.mWorld.drops,samples].join("|"));}
var rates=[12.5,25,50];var id=0;
for(var f=0;f<rates.length;f++)for(var dev=0;dev<2;dev++){
 setup(rates[f],dev==1,"Coop",0);
 for(var wave=1;wave<=103;wave++){actor.mLevel=wave;levelRow("LEVEL",id++);}
}
var cases=[];id=0;
for(var f=0;f<rates.length;f++)for(var dev=0;dev<2;dev++)for(var tier=0;tier<5;tier++){
 var mode=tier==4?"DeathMatch":"Coop";setup(rates[f],dev==1,mode,tier==4?0:tier);stateRow("INIT",id++);
}
// Actual original counter setters, LogKills and LogKill. External fixtures
// register a creature immediately before its death; no movement/AI is claimed.
id=0;var actions={};var deathTicks=[1,2,3,4,5,30,31,100,101,102,103,104,150];var deathKinds=["z","z","z","z","z","z","d","z","z","z","z","z","p"];for(var a=0;a<deathTicks.length;a++)actions[deathTicks[a]]=deathKinds[a];
for(var f=0;f<rates.length;f++)for(var dm=0;dm<2;dm++){
 setup(rates[f],true,dm?"DeathMatch":"Coop",3);actor.mLevel=100;
 actor.mWorld.Spawn_Zombie=function(){return false;};actor.mWorld.Spawn_Devil=function(){return false;};
 for(tick=1;tick<=180;tick++){
  var action=actions[tick];if(action){var thing={_CLASSID_:action=="p"?"CThing_Creature_Player":action=="d"?"CThing_Creature_Devil":"CThing_Creature_Zombie",mPosition:{mX:1,mY:1},mScore:action=="d"?1000:100,mPlayerIndex:0};
   if(action=="p")actor.mPlayerCount++;else if(action=="d")actor.mDevilCount++;else actor.mZombieCount++;
   actor.mWorld.LogKill(thing);
  }
  actor.Process();stateRow("STEP",id++);
 }
}
// Spawn success, blocked attempts, native post/pre-decrement boundaries and
// corpse counters that postpone a wave change until the external collection empties.
id=0;
for(var f=0;f<rates.length;f++){
 setup(rates[f],true,"Coop",0);for(tick=1;tick<=100;tick++){actor.Process();if(tick<4||tick%5==0)stateRow("SPAWN",id++);}
 actor.Level.Zombie_Count=actor.Level.Zombie_TotalCount=0;actor.mWorld.mThing_Collection.mThingCounters.CThing_Creature_Zombie=1;actor.Process();stateRow("WAVE",id++);
 actor.mWorld.mThing_Collection.mThingCounters.CThing_Creature_Zombie=0;actor.Process();stateRow("WAVE",id++);
}
id=0;
for(var f=0;f<rates.length;f++)for(var human=0;human<2;human++){
 CMain.mFPS=rates[f];var ended=0;var notified=0;var body={_CLASSID_:human?"CThing_Creature_Player":"CThing_Creature_Zombie",mFlags:0,mPosition:{},ClearCollideCell:function(){},mXSI_Animation:{SetAnimation:function(){}},mWorld:{mMap:{mDecal:{Draw_BloodSplat:function(){}}},PlayerDead:function(){notified++;}},SetState:function(s){ended++;},Delete:function(){ended++;}};
 var Thing={CThing:{mFlag_SortFloor:1}};native_DeadInit.call(body);var initial=body.mStateCount;
 for(var frame=1;frame<300&&!ended;frame++){if(human)native_PlayerDead.call(body);else native_EnemyDead.call(body);}
 trace("DEAD|"+id+++"|"+[initial,frame-1,notified,body.mStateCount,body.mAlpha].join("|"));
}
id=0;
for(var f=0;f<rates.length;f++){CMain.mFPS=rates[f];var p={mLife:100,mMaxLife:200};for(var frame=0;frame<rates[f]*8;frame++)native_Regen.call(p);trace("REGEN|"+id+++"|"+p.mLife);}
var p={mWeapons:{uzi:{mActive:false}},mWeapon_Current:{mNameID:"pistol"},adds:0,AddWeapon:function(){this.adds++;}};native_PlayerNewWeapon.call(p,"uzi");trace("NEW|0|"+[p.mWeapons.uzi.mActive,p.mWeapon_Current.mNameID,p.adds].join("|"));
id=0;Thing.Effect={CThing_Effect_Explosion:function(){}};World.Map={CMap_Cell:{mCollide_Player:1}};
for(var f=0;f<rates.length;f++)for(var pack=0;pack<2;pack++){
 CMain.mFPS=rates[f];var ended=0;var sounds=0;var animation=0;var object={mDetonate:true,mTestFlags:1,mCurrentCell:{mCollide:1},mcDrawObject:{Animate_Cycle:function(a){animation=(animation+a)%2;}},PlaySound:function(){sounds++;},mWorld:{mUpgrades:{ApplyUpgrade_Object:function(){}}},mThing_Collection:{AddThing_Effect:function(e){return e;}},Delete:function(){ended++;}};
 object.Process=pack?native_pack_Process_Normal:native_mine_Process_Normal;object.Process_Detonate=pack?native_pack_Process_Detonate:native_mine_Process_Detonate;
 for(var frame=1;frame<200&&!ended;frame++)object.Process();trace("OBJECT|"+id+++"|"+[frame-1,sounds,animation,object.mDetonateCounter].join("|"));
}
id=0;
for(var f=0;f<rates.length;f++){
 CMain.mFPS=rates[f];var ended=0;var object={mAlpha:100,mPosition:{mX:1,mY:1},mWorld:{mMap:{mMapwho:{MoveThing:function(){}},GetCell:function(){return {mCollide:0};}}},Delete:function(){ended++;},Process_DeleteCounter_Init:native_pickup_Process_DeleteCounter_Init,Process_DeleteCounter:native_pickup_Process_DeleteCounter};
 native_pickup_SetDeleteCounter.call(object,CMain.mFPS*10);for(var frame=1;frame<600&&!ended;frame++)object.Process();trace("TTL|"+id+++"|"+[frame-1,object.mDeleteCounter,object.mAlpha].join("|"));
}
setup(25,true,"Coop",0);var weapon={_CLASSID_:"CThing_Weapon_UZI",mAuto:true,mFireRate:4,mAmmo:100,mTotalAmmo:100,mFireRateCount:0,mDamage:35,mRange:8,mWideShot:0,mBiggerBang:0};actor.Register_Weapon(weapon);id=0;
function weaponRow(){trace("WEAPON|"+id+++"|"+[weapon.mAmmo,weapon.mTotalAmmo,weapon.mFireRate,weapon.mAuto,weapon.mDamage,weapon.mRange,weapon.mFireRateCount].join("|"));}
function gain(target){while(actor.mMultiplier<target)actor.mMultiplier++;}
weaponRow();weapon.mAmmo=7;weapon.mFireRateCount=5;gain(13);weaponRow();actor.ApplyUpgrade_Weapon(weapon);weaponRow();gain(17);weaponRow();actor.ApplyUpgrade_Weapon(weapon);weaponRow();weapon.mAmmo=12;weapon.mFireRateCount=3;gain(23);weaponRow();actor.ApplyUpgrade_Weapon(weapon);weaponRow();weapon.mAmmo=11;weapon.mFireRateCount=2;actor.ApplyUpgrade_Weapon(weapon);weaponRow();
trace("DONE|progression");
'''.replace('ASSIGN','\n'.join(assign))
# Functions resolve the global variable dynamically; this is the native class
# constant referenced by State_Dead_Init, not a replacement timer branch.
script=script.replace('var actor;var tick=0;','var Thing={CThing:{mFlag_SortFloor:1}};var actor;var tick=0;')
(cache/'source.as').write_text(script,'utf8')
tree=ET.parse(root/'artifacts/swf-analysis/46923/game.xml');r=tree.getroot();tags=r.find('tags');tags.clear();ET.SubElement(tags,'item',{'type':'DoActionTag','actionBytes':'00','forceWriteAsLong':'true'});ET.SubElement(tags,'item',{'type':'ShowFrameTag','forceWriteAsLong':'false'});r.set('frameCount','1');tree.write(cache/'empty.xml',encoding='utf8',xml_declaration=True)
jar=Path(os.environ.get('FFDEC_JAR') or Path(os.environ['LOCALAPPDATA'])/'Temp/opencode/4399/ffdec/ffdec.jar')
def ff(args,label):
 with (cache/(label+'.log')).open('w',encoding='utf8') as log:subprocess.run(['java','-jar',str(jar),*map(str,args)],cwd=root,stdout=log,stderr=subprocess.STDOUT,check=True)
ff(['-xml2swf',cache/'empty.xml',cache/'empty.swf'],'empty');scripts=cache/'scripts/frame_1';scripts.mkdir(parents=True,exist_ok=True);(scripts/'DoAction.as').write_text(script,'utf8');ff(['-importScript',cache/'empty.swf',cache/'reference.swf',cache/'scripts'],'compile')
record={'sourceSwfSha256':hashlib.sha256((root/'games/50737/game.swf').read_bytes()).hexdigest(),'sources':{k:{'file':p.relative_to(root).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for k,p in paths.items()},'method':'Original CUpgrades methods/native AVM1 getter/setter properties, original World.LogKill and original NewWeapon/death callbacks/regen prefix. External world/spawn/HUD/collection stubs observe or supply fixtures. No full original collection, movement, AI, weapon lifecycle or Adobe Flash equivalence claim.','rates':[12.5,25,50],'stepActions':{str(t):k for t,k in zip([1,2,3,4,5,30,31,100,101,102,103,104,150],['z']*6+['d']+['z']*5+['p'])},'referenceSourceSha256':hashlib.sha256(script.encode()).hexdigest()}
(cache/'inputs.json').write_text(json.dumps(record,indent=2)+'\n','utf8');print('Prepared original progression/counter/death reference.')
