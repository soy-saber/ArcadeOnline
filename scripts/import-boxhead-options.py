"""Extract functional character/difficulty constants from the original AS2."""
from pathlib import Path
import hashlib,json,re
root=Path(__file__).resolve().parents[1];base=root/'artifacts/swf-analysis/50737/clean/scripts/__Packages'
paths=[base/'World/CUpgrades.as',base/'Screen/CScreen_SelectWorld.as',base/'Thing/Creature/CThing_Creature_Player.as']
paths.extend([base/'World/CWorld.as',base/'CMain.as',base/'World/Map/CMap_Collide.as',base/'Thing/Creature/CThing_Creature.as'])
text=paths[0].read_text('utf8');method=text[text.index('   function SetDifficulty('):text.index('   function AddUpgrade(')]
tiers=[{'sourceIndex':int(index),'firstWave':int(wave),'multiplier':int(multiplier)} for index,wave,multiplier in re.findall(r'case ([0-3]):\s+_loc3_ = (\d+);\s+_loc2_ = (\d+);',method)]
assert len(tiers)==4
characters=[{'sourceIndex':int(index),'name':name} for index,name in re.findall(r'case ([0-3]):\s+DrawPrimitive\.XSI\.CDrawPrimitive_XSI_StyleSheet\.SS_([A-Z]+)\(\);',paths[2].read_text('utf8'))]
assert len(characters)==4
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
record={'source':'games/50737/game.swf','sourceSha256':sha(root/'games/50737/game.swf'),'as2':[{'file':p.relative_to(root).as_posix(),'sha256':sha(p)} for p in paths],'method':'Literal original SetDifficulty switch constants and GetCollection stylesheet choices, extracted without executing the game. No claim of complete original progression/collection timing. SetDifficulty increments original level/multiplier with upgrade callbacks and silent messages.','difficultyMethod':method.strip(),'tiers':tiers,'characters':characters,'originalModes':['Single','Coop','DeathMatch']}
record['deathLimits']=json.loads(re.search(r'mNumberOfGameKills = (\[[^;]+\]);',paths[3].read_text('utf8'))[1]);record['speeds']=[.5,1,2]
record['speedMethod']=paths[4].read_text('utf8').split('   function State_InitWorld()',1)[1].split('   function State_RunWorld',1)[0].strip()
record['deathmatchMultiplier']=int(re.search(r'if\(World.CWorld.mGameMode == "DeathMatch"\)\s+\{\s+_loc2_ = (\d+);',method)[1]);record['damageForcedInDeathmatch']='mDamageActive = this.mMode != "DeathMatch" ? CMain.mSaveData.mDamageActive : true' in paths[1].read_text('utf8')
(root/'tests/fixtures/boxhead-options-source.json').write_text(json.dumps(record,indent=2)+'\n','utf8')
print('Extracted4 original difficulty presets and4 character styles.')
