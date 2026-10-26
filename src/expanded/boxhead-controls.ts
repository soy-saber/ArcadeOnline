export const CONTROL_LABELS={left:'向左',up:'向上',right:'向右',down:'向下',attack:'射击',previous:'上一武器',next:'下一武器'} as const;
export type Control=keyof typeof CONTROL_LABELS;
export type Bindings=Partial<Record<Control,string>>;
const mandatory=/^(Key[WASDP]|Arrow(Left|Right|Up|Down)|Space|Enter|Digit[0-9])$/;
const usable=/^(Key[A-Z]|Numpad([0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter)|Bracket(Left|Right)|Semicolon|Quote|Backslash|IntlBackslash|Comma|Period|Slash|Backquote|Minus|Equal|Shift(Left|Right))$/;
export function bindingError(bindings:Bindings,control:Control,code:string):string|null {
  if(mandatory.test(code))return 'WASD、方向键、空格、回车、数字和P始终保留，请选其他键。';
  if(!usable.test(code))return '请选择字母、符号、小键盘或Shift键。';
  const conflict=Object.entries(bindings).find(([role,value])=>role!==control&&value===code);return conflict?`该键已用于${CONTROL_LABELS[conflict[0]as Control]}。`:null;
}
export function readBindings(raw:string|null):Bindings {
  try{const parsed=JSON.parse(raw??'{}');if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return {};const result:Bindings={};for(const control of Object.keys(CONTROL_LABELS)as Control[]){const code=parsed[control];if(typeof code==='string'&&!bindingError(result,control,code))result[control]=code;}return result;}catch{return {};}
}
export function extraControl(bindings:Bindings,code:string):Control|undefined {
  if(code==='TouchNext')return 'next';return (Object.entries(bindings).find(([,key])=>key===code)?.[0])as Control|undefined;
}
export function keyLabel(code:string):string {return code.replace(/^Key/,'').replace(/^Numpad/,'小键盘 ').replace(/^ShiftLeft$/,'左Shift').replace(/^ShiftRight$/,'右Shift');}
