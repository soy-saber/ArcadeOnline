export interface Input { seq: number; left: boolean; right: boolean; up: boolean; down: boolean; attack: number; alt: number; direction?:number; weapon?: number; weaponStep?: number; trigger?: boolean; cancelledAttack?: number }
export interface State {
  round: number; tick: number; phase: "waiting" | "playing" | "finished";
  winner: number | null; ack: number[]; players: any[]; [key: string]: any;
}
export interface Adapter {
  id: string; title: string; seats: number; hz: number; width: number; height: number; controls: string;
  create(round: number, playing: boolean, seats: number[], seed: number, mapId?: string, mode?: string, settings?:{difficulty?:string;characters?:number[];speed?:number;devils?:boolean;collisions?:boolean;damage?:boolean;deathLimit?:number}): State;
  rate?(state:State):number;
  characters?:string[];
  characterIds?:string[];
  duplicateCharacters?:boolean;
  difficulties?:{id:string;label:string}[];
  step(state: State, inputs: Input[]): void;
  valid(state: unknown): state is State;
  render(canvas: HTMLCanvasElement, state: State | null, seat: number | null): void;
  confirm?(state: State): void;
  setSound?(enabled: boolean): void;
  setVolume?(volume: number): void;
  consumeInput?(state: State, seat: number, input: Input): void;
  maps?: { id: string; label: string }[];
  modes?: { id: string; label: string; description: string;minPlayers?:number;maxPlayers?:number }[];
  predict?(state: State, seat: number, input: Input, fraction: number): void;
}
export const EMPTY_INPUT: Input = { seq: 0, left: false, right: false, up: false, down: false, attack: 0, alt: 0 };
export function validInput(value: unknown): value is Input {
  if (!value || typeof value !== "object") return false;
  const input = value as Input;
  return [input.seq, input.attack, input.alt].every((n) => Number.isSafeInteger(n) && n >= 0 && n < 1e9) &&
    [input.left, input.right, input.up, input.down].every((n) => typeof n === "boolean") &&
    (input.direction===undefined||Number.isInteger(input.direction)&&input.direction>=-1&&input.direction<=3)&&
    (input.weapon === undefined || Number.isInteger(input.weapon) && input.weapon >= 0 && input.weapon < 10) &&
    (input.weaponStep === undefined || input.weaponStep === -1 || input.weaponStep === 1) &&
    (input.trigger === undefined || typeof input.trigger === 'boolean') &&
    (input.cancelledAttack === undefined || Number.isSafeInteger(input.cancelledAttack)&&input.cancelledAttack>=0&&input.cancelledAttack<1e9);
}
