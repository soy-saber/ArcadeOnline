import type {State} from './types';
import data from './boxhead-data.json';
import {WEAPONS,weaponStats} from './boxhead-world';

function upgrades(s:State,index:number){return data.upgrades.filter(u=>u.threshold<=s.peakCombo&&u.mClassID==='CThing_Weapon_'+WEAPONS[index].classId);}
export function weaponVersion(s:State,index:number):number {return Math.max(0,...upgrades(s,index).map(u=>u.threshold));}
/** AddWeapon replaces one registered weapon; it does not select another gun. */
export function rebuildWeapon(s:State,p:any,index:number):void {
  p.weaponCaps[index]=p.inventory[index]=weaponStats(s,index).ammo;
  p.weaponRevisions[index]=weaponVersion(s,index);
  if(p.weapon===index){p.ammo=p.inventory[index];p.cooldown=0;if(index===8)p.chargeDetonate=false;}
}
/** ApplyUpgrade_Weapon is called by the currently controlled weapon's Update.
 * Reapplying a class with an existing ammo flag refills it even when the newly
 * gained upgrade is range/damage. The same class revision applies only once. */
export function refreshCurrentWeapon(s:State,p:any):void {
  const index=p.weapon,version=weaponVersion(s,index);
  if(version===p.weaponRevisions[index])return;
  const props=upgrades(s,index).map(u=>u.mProp);
  if(props.includes('RapidFire'))p.cooldown=0;
  if(props.some(prop=>['InfinateAmmo','QuadAmmo','DoubleAmmo'].includes(prop)))p.weaponCaps[index]=p.inventory[index]=weaponStats(s,index).ammo;
  p.weaponRevisions[index]=version;p.ammo=p.inventory[index];
}
export function validWeaponInventory(s:State,p:any):boolean {
  return Array.isArray(p.weaponCaps)&&p.weaponCaps.length===10&&p.weaponCaps.every((n:unknown,i:number)=>Number.isSafeInteger(n)&&(i===0?n===-1:Number(n)>0))&&
    Array.isArray(p.weaponRevisions)&&p.weaponRevisions.length===10&&p.weaponRevisions.every((n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=s.peakCombo)&&
    p.inventory.every((n:number,i:number)=>i===0?n===-1:n>=0&&n<=p.weaponCaps[i]);
}
