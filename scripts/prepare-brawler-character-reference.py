"""Record static original character identities and constructor parameters."""
from pathlib import Path
import hashlib,json,re
root=Path(__file__).resolve().parents[1];base=root/'artifacts/all-games-audit/6232/scripts'
data=json.loads((root/'src/expanded/brawler-data.json').read_text('utf8'))
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
swf=root/'games/6232/game.swf';assert digest(swf)==data['sha256']
names=base/'frame_42/DoAction.as';select=base/'frame_46/DoAction.as'
order=re.search(r'var Fighters = new Array\(([^;]+)\);',names.read_text('utf8'))[1]
order=re.findall(r'"([^"]+)"',order);assert set(order)=={c['id'] for c in data['fighters']}
result={'kind':'Static AS2 extraction, not original runtime behavior. Duplicate fighter choice is permitted by SelectFighter; SetColor differentiates equal fighters by color.','swfSha256':digest(swf),'selectionSources':{str(p.relative_to(root)).replace('\\','/'):digest(p) for p in [names,select]},'sourceMenuOrder':order,'fighters':[]}
for character in data['fighters']:
 p=base/'__Packages'/(character['id']+'.as');s=p.read_text('utf8');numbers=re.search(r'super\(([\d.]+),([\d.]+),([\d.]+),this.CharacterName\)',s)
 result['fighters'].append({'id':character['id'],'characterName':re.search(r'CharacterName = "([^"]+)"',s)[1],'weight':float(numbers[1]),'speed':float(numbers[2]),'power':float(numbers[3]),'file':str(p.relative_to(root)).replace('\\','/'),'sha256':digest(p)})
(root/'tests/fixtures/brawler-characters-source.json').write_text(json.dumps(result,indent=2)+'\n','utf8')
print('Recorded six original fighter identities and constructor stats.')
