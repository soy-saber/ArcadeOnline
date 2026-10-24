// Physical alternatives share one logical direction but retain independent
// held keys, so releasing W does not cancel an Up arrow that is still held.
export const directionKeys:Record<string,0|1|2|3>={KeyA:0,ArrowLeft:0,KeyW:1,ArrowUp:1,KeyD:2,ArrowRight:2,KeyS:3,ArrowDown:3};
export function heldDirectionAt(keys:ReadonlyMap<string,number>,code:string):number|undefined {
  const direction=directionKeys[code];if(direction===undefined)return undefined;
  for(const [held,at]of keys)if(directionKeys[held]===direction)return at;
  return undefined;
}
export function directionState(keys:ReadonlyMap<string,number>){
  return {left:keys.has('KeyA')||keys.has('ArrowLeft'),up:keys.has('KeyW')||keys.has('ArrowUp'),right:keys.has('KeyD')||keys.has('ArrowRight'),down:keys.has('KeyS')||keys.has('ArrowDown')};
}
