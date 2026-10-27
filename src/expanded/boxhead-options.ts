import type {State} from './types';
// Original CScreen_SelectWorld / CUpgrades.SetDifficulty, source indices0..3.
export const DIFFICULTIES=[
  {id:'beginner',label:'初学者',wave:1,multiplier:1},
  {id:'intermediate',label:'进阶',wave:10,multiplier:10},
  {id:'expert',label:'专家',wave:20,multiplier:30},
  {id:'nightmare',label:'噩梦',wave:35,multiplier:50}
] as const;
export const MODES=[
  {id:'coop',label:'多人合作',description:'2–4人共同生存；全队倒下后结束。',minPlayers:2,maxPlayers:4},
  {id:'single',label:'单人生存',description:'仅P1入座准备即可开始，倒下后结束。',minPlayers:1,maxPlayers:1},
  {id:'deathmatch',label:'死亡竞赛',description:'2–4人对战，全武器与升级开放，开局手枪、补给获取弹药；死亡达到上限即出局，最后留下者获胜。',minPlayers:2,maxPlayers:4}
] as const;
export const difficulty=(id:string)=>DIFFICULTIES.find(d=>d.id===id)??DIFFICULTIES[0];
export const SPEEDS=[.5,1,2],DEATH_LIMITS=[5,10,20,50];
export const frameRate=(state:State):number=>25*(state.options?.speed??1);
export interface Settings {characters?:number[];difficulty?:string;speed?:number;devils?:boolean;collisions?:boolean;damage?:boolean;deathLimit?:number}
