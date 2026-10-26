"""Compile the original RandomPickup method with external input/weapon stubs."""
from pathlib import Path
import hashlib,json,os,re,subprocess,xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[1];cache=root/'artifacts/boxhead-pickup-reference';cache.mkdir(parents=True,exist_ok=True)
jar=Path(os.environ['LOCALAPPDATA'])/'Temp/opencode/4399/ffdec/ffdec.jar'
source=root/'artifacts/swf-analysis/50737/clean/scripts/__Packages/Thing/Creature/CThing_Creature_Player.as';text=source.read_text('utf8');method=text[text.index('   function RandomPickup()'):text.index('   function AddWeapon(')].strip().replace('function RandomPickup()','function nativePickup()')
tree=ET.parse(root/'artifacts/swf-analysis/46923/game.xml');r=tree.getroot();tags=r.find('tags');tags.clear();ET.SubElement(tags,'item',{'type':'DoActionTag','actionBytes':'00','forceWriteAsLong':'true'});ET.SubElement(tags,'item',{'type':'ShowFrameTag','forceWriteAsLong':'false'});r.set('frameCount','1');tree.write(cache/'empty.xml',encoding='utf8',xml_declaration=True)
def ff(args,name):
    with (cache/(name+'.log')).open('w',encoding='utf8') as log:subprocess.run(['java','-jar',str(jar),*map(str,args)],cwd=root,stdout=log,stderr=subprocess.STDOUT,check=True)
ff(['-xml2swf',cache/'empty.xml',cache/'empty.swf'],'empty')
names=['pistol','uzi','shotgun','barrel','grenade','fakewall','mine','rocket','chargepack','railgun'];cases=[]
for active in [[],[1],[1,2],[1,4,9],list(range(1,10))]:
    for hp in [200,100]:
        for random in [0,.2,.7,.999999]:cases.append({'active':active,'hp':hp,'random':random,'ammo':[100 if i%2 else 0 for i in range(10)],'total':[100]*10})
script='''stop();var chosen="none";var draws=0;var currentRandom=0;
function nativeRandom(){draws++;return currentRandom;}
'''+method.replace('Math.random()','nativeRandom()')+'''
var names=NAMES;var cases=CASES;
for(var i=0;i<cases.length;i++){
 var c=cases[i];var weapons={};chosen="none";draws=0;currentRandom=c.random;
 for(var j=0;j<names.length;j++){var active=j==0;for(var k=0;k<c.active.length;k++){if(c.active[k]==j){active=true;}}weapons[names[j]]={mActive:active,mNameID:names[j],mThing:{mAmmo:c.ammo[j],mTotalAmmo:c.total[j]}};}
 var actor={mWeapons:weapons,mLife:c.hp,mMaxLife:200,mWorld:{mHud:{AddMessage_Info:function(){}}},AddWeapon:function(name){chosen=name;return {mThing:{mName:name}};}};
 var result=nativePickup.call(actor);trace("PICKUP|"+i+"|"+chosen+"|"+actor.mLife+"|"+result+"|"+draws);
}
trace("DONE|"+cases.length);
'''.replace('NAMES',json.dumps(names)).replace('CASES',re.sub(r'"([A-Za-z]+)":',r'\1:',json.dumps(cases,separators=(',',':'))))
scripts=cache/'scripts/frame_1';scripts.mkdir(parents=True,exist_ok=True);(scripts/'DoAction.as').write_text(script,'utf8');ff(['-importScript',cache/'empty.swf',cache/'reference.swf',cache/'scripts'],'compile')
(cache/'inputs.json').write_text(json.dumps({'source':source.relative_to(root).as_posix(),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'originalSwfSha256':hashlib.sha256((root/'games/50737/game.swf').read_bytes()).hexdigest(),'method':'Original RandomPickup method executes with native AVM1 object enumeration and strict weighted thresholds. External RNG provider and AddWeapon/HUD stubs record selection; no full weapon/collection lifecycle equivalence claimed.','cases':cases},indent=2)+'\n','utf8')
print('Prepared',len(cases),'original weighted pickup cases.')
