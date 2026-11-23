import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const root=new URL('../../main/resources/static/',import.meta.url);
const css=readFileSync(new URL('css/app.css',root),'utf8');
const vars=rule=>Object.fromEntries([...rule.matchAll(/--([a-z0-9-]+):\s*(#[\da-f]{6})/gi)].map(m=>[m[1],m[2]]));
const base=vars(css.match(/:root\s*\{([^}]+)\}/)[1]);
const dark=vars(css.match(/:root\[data-theme="dark"\]\s*\{([^}]+)\}/)[1]);
const wbi=vars(css.match(/:root\[data-company="wbi"\]\s*\{([^}]+)\}/)[1]);
const wbiDark=vars(css.match(/:root\[data-company="wbi"\]\[data-theme="dark"\]\s*\{([^}]+)\}/)[1]);
const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
export const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const pairs=[['text','surface'],['text','bg'],['text-2','surface'],['muted','surface'],['on-accent','accent'],['accent-strong','accent-soft'],['ok','ok-soft'],['warn','warn-soft'],['danger','danger-soft'],['info','info-soft'],['text','ok-soft'],['text','warn-soft'],['text','danger-soft'],['muted','warn-soft'],['muted','danger-soft'],['on-danger','danger']];
for(const [name,palette]of Object.entries({'CV light':base,'WBI light':{...base,...wbi},'CV dark':{...base,...dark},'WBI dark':{...base,...dark,...wbiDark}})) {
  test(`WCAG AA main text/button/badge/Setup row pairs: ${name}`,()=>{
    for(const [fg,bg]of pairs) assert.ok(contrast(palette[fg],palette[bg])>=4.5,`${name}: ${fg}/${bg} = ${contrast(palette[fg],palette[bg]).toFixed(2)}:1`);
  });
}
test('inline page styles use central color tokens',()=>{
  for(const file of readdirSync(root).filter(f=>f.endsWith('.html'))) {
    const html=readFileSync(new URL(file,root),'utf8');
    for(const style of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) assert.equal(/#[\da-f]{3,8}\b|rgba?\(/i.test(style[1]),false,file);
  }
});
