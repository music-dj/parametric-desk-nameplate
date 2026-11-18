import fs from 'node:fs';
import * as hb from 'harfbuzzjs';
import bidiFactory from 'bidi-js';
const bidi=bidiFactory();
const blob=new hb.Blob(fs.readFileSync(new URL('./assets/Amiri-Bold.ttf',import.meta.url))),face=new hb.Face(blob),font=new hb.Font(face);
export const containsArabic=text=>/\p{Script=Arabic}/u.test(text);

export function flatten(commands){
  const loops=[];let loop=[],p=[0,0];
  const close=()=>{if(loop.length>2){if(loop.at(-1)[0]===loop[0][0]&&loop.at(-1)[1]===loop[0][1])loop.pop();loops.push(loop);}loop=[];};
  for(const {type,values:v}of commands){
    if(type==='M'){close();p=v.slice();loop.push(p);}
    else if(type==='L'){p=v.slice();loop.push(p);}
    else if(type==='Q'||type==='C'){
      const a=p,q=v.slice(0,2),r=type==='C'?v.slice(2,4):q,b=v.slice(-2),n=Math.max(4,Math.ceil((Math.hypot(q[0]-a[0],q[1]-a[1])+Math.hypot(r[0]-b[0],r[1]-b[1]))/20));
      for(let i=1;i<=n;i++){const t=i/n,u=1-t;loop.push(type==='Q'?[u*u*a[0]+2*u*t*q[0]+t*t*b[0],u*u*a[1]+2*u*t*q[1]+t*t*b[1]]:[u*u*u*a[0]+3*u*u*t*q[0]+3*u*t*t*r[0]+t*t*t*b[0],u*u*u*a[1]+3*u*u*t*q[1]+3*u*t*t*r[1]+t*t*t*b[1]]);}p=b;
    }else if(type==='Z')close();
  }
  close();return loops;
}

export function shapeArabic(text){
  const embedding=bidi.getEmbeddingLevels(text,'rtl'),runs=[],runAt=[];
  for(let i=0;i<text.length;i++){
    const level=embedding.levels[i];let run=runs.at(-1);
    if(!run||run.level!==level){run={start:i,end:i,level};runs.push(run);}else run.end=i;
    runAt[i]=runs.length-1;
  }
  const visualRuns=[];
  for(const i of bidi.getReorderedIndices(text,embedding)){const run=runAt[i];if(!visualRuns.includes(run))visualRuns.push(run);}
  let pen=0;const glyphs=[],shapedRuns=[];
  for(const index of visualRuns){
    const run=runs[index],value=text.slice(run.start,run.end+1),buffer=new hb.Buffer();
    buffer.addText(value);buffer.guessSegmentProperties();buffer.setDirection(run.level%2?hb.Direction.RTL:hb.Direction.LTR);
    if(run.level%2)buffer.setLanguage('ar');
    hb.shape(font,buffer);
    const infos=buffer.getGlyphInfosAndPositions();
    for(const item of infos){
      if(item.codepoint===0)throw Error('الخط العربي لا يدعم أحد الرموز في الاسم.');
      const x=pen+item.xOffset,y=item.yOffset,loops=flatten(font.glyphToJson(item.codepoint)).map(l=>l.map(([px,py])=>[px+x,py+y]));
      if(loops.length)glyphs.push({id:item.codepoint,cluster:run.start+item.cluster,loops});
      pen+=item.xAdvance;
    }
    shapedRuns.push({text:value,direction:run.level%2?'rtl':'ltr',glyphIds:infos.map(g=>g.codepoint),clusters:infos.map(g=>g.cluster+run.start)});
  }
  return {glyphs,runs:shapedRuns,width:pen,font:'Amiri Bold'};
}
