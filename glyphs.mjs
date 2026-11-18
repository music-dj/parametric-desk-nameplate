import fs from 'node:fs';import opentype from 'opentype.js';const bytes=fs.readFileSync(new URL('./assets/LuckiestGuy-Regular.ttf',import.meta.url));const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));const {originals,profiles}=JSON.parse(fs.readFileSync(new URL('./assets/glyph-profiles.json',import.meta.url)));const FONT_SCALE=.00983146;
function contours(char){
  const g=font.charToGlyph(char),b=g.getBoundingBox();
  if(profiles[char])return profiles[char];
  if(originals[char])return originals[char].loops.map(l=>l.map(([x,y])=>[x+b.x1*FONT_SCALE,y+b.y1*FONT_SCALE]));
  const cmds=g.getPath(0,0,font.unitsPerEm*FONT_SCALE).commands;
  let loops=[],loop=[],point=[0,0],start;
  for(const c of cmds){
    if(c.type==='M'){if(loop.length)loops.push(loop);loop=[];point=[c.x,-c.y];start=point;loop.push(point);}
    else if(c.type==='L'){point=[c.x,-c.y];loop.push(point);}
    else if(c.type==='Q'||c.type==='C'){
      const p=point,end=[c.x,-c.y],q=[c.x1,-c.y1],r=c.type==='C'?[c.x2,-c.y2]:end;
      const n=Math.max(8,Math.ceil((Math.hypot(q[0]-p[0],q[1]-p[1])+Math.hypot(end[0]-q[0],end[1]-q[1]))/0.15));
      for(let i=1;i<=n;i++){let t=i/n,u=1-t;loop.push(c.type==='Q'?[u*u*p[0]+2*u*t*q[0]+t*t*end[0],u*u*p[1]+2*u*t*q[1]+t*t*end[1]]:[u*u*u*p[0]+3*u*u*t*q[0]+3*u*t*t*r[0]+t*t*t*end[0],u*u*u*p[1]+3*u*u*t*q[1]+3*u*t*t*r[1]+t*t*t*end[1]]);}
      point=end;
    }else if(c.type==='Z'){if(loop.length)loops.push(loop);loop=[];point=start;}
  }
  if(loop.length)loops.push(loop);return loops;
}


export {contours as glyphContours};
