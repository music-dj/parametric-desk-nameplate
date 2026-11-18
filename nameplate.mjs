import {cad,solidPart} from './cad-core.mjs';
import {glyphContours} from './glyphs.mjs';
import {containsArabic,shapeArabic} from './arabic-text.mjs';
const {Manifold:M,CrossSection:CS}=cad;
export const nameplateDefaults={project:'nameplate',text:'OLIVER',baseColor:'#4388ba',topColor:'#4388ba',letterHeight:28,bendRadius:4,baseDepth:24,baseThickness:3,tilt:33,topChamfer:.8};

export async function generateNameplate(input={}){
  const s={...nameplateDefaults,...input,project:'nameplate',chamfer:0};
  if(typeof s.text!=='string')throw Error('اكتب الاسم بالعربية أو الإنكليزية.');
  s.text=s.text.normalize('NFKC').trim().toUpperCase().replace(/\s+/g,' ');
  const lettersCount=(s.text.match(/[\p{Letter}\p{Number}]/gu)||[]).length;
  if(!/^[\p{Script=Arabic}\p{Mark}A-Z0-9 \u0640]+$/u.test(s.text)||lettersCount<1||lettersCount>20||s.text.length>80)throw Error('اكتب حتى 20 حرفًا أو رقمًا، بالعربية أو الإنكليزية.');
  const arabic=containsArabic(s.text);
  for(const [key,min,max]of [['letterHeight',16,60],['bendRadius',1,12],['baseDepth',14,80],['baseThickness',2,8],['tilt',0,75],['topChamfer',0,2]]){
    s[key]=Number(s[key]);if(!Number.isFinite(s[key])||s[key]<min||s[key]>max)throw Error(`قيمة غير صحيحة: ${key}`);
  }
  if(s.topChamfer>s.baseThickness-.25)throw Error('قلّل الشطفة العلوية أو زد سماكة القاعدة.');
  for(const key of ['baseColor','topColor'])if(!/^#[0-9a-f]{6}$/i.test(s[key]))throw Error('لون غير صحيح.');
  const owned=[],own=x=>{owned.push(x);return x;};
  try{
    let glyphs;
    if(arabic){
      const shaped=shapeArabic(s.text),sections=shaped.glyphs.map(g=>own(new CS(g.loops,'NonZero'))),joined=own(CS.union(sections)),bounds=joined.bounds();
      // Shape the whole run before scaling: joining, dots, marks and the common baseline must stay intact.
      glyphs=[{ch:'arabic',loops:joined.toPolygons(),min:bounds.min,max:bounds.max}];
    }else glyphs=[...s.text].map(ch=>{
      if(ch===' ')return {ch};
      const loops=glyphContours(ch),points=loops.flat(),min=[0,1].map(k=>Math.min(...points.map(p=>p[k]))),max=[0,1].map(k=>Math.max(...points.map(p=>p[k])));
      return {ch,loops,min,max};
    });
    const factor=s.letterHeight/Math.max(...glyphs.filter(g=>g.loops).map(g=>g.max[1]-g.min[1]));
    const sweep=90-s.tilt,embedAngle=Math.asin(.4/(s.bendRadius+s.letterHeight))*180/Math.PI,letters=[];
    let pen=0;
    for(const glyph of glyphs){
      if(!glyph.loops){pen+=s.letterHeight*.3;continue;}
      // Revolve the glyph's height around X: its entire back, including counters, curls into the base.
      const loops=glyph.loops.map(l=>l.map(([x,y])=>[s.bendRadius+(y-glyph.min[1])*factor,(x-glyph.min[0])*factor]));
      let section=own(new CS(loops,'EvenOdd'));
      if(arabic)section=own(own(section.offset(.2,'Round',2,24)).simplify(.01));
      const revolved=own(section.revolve(256,sweep+embedAngle));
      const embedded=own(revolved.rotate([0,0,-embedAngle]));
      const oriented=own(own(embedded.rotate([90,0,0])).rotate([0,0,90]));
      const letter=own(oriented.translate([pen,0,s.baseThickness]));
      letters.push({ch:glyph.ch,solid:letter});
      pen+=(glyph.max[0]-glyph.min[0])*factor+.8;
    }
    const textBounds=letters.reduce((b,{solid})=>{const box=solid.boundingBox();for(let k=0;k<3;k++){b.min[k]=Math.min(b.min[k],box.min[k]);b.max[k]=Math.max(b.max[k],box.max[k]);}return b;},{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
    const width=textBounds.max[0]-textBounds.min[0]+8,depth=Math.max(s.baseDepth,textBounds.max[1]-textBounds.min[1]+6),radius=Math.min(2.5,depth/6);
    const rectangle=own(CS.square([width-2*radius,depth-2*radius],true)),footprint=own(rectangle.offset(radius,'Round',2,48));
    let base;
    if(s.topChamfer){
      const upper=own(footprint.offset(-s.topChamfer,'Round',2,48));
      // Keep the bottom full-width and flat; only the upper ring is inset for a 45-degree chamfer.
      const points=[...footprint.toPolygons().flatMap(l=>l.flatMap(([x,y])=>[[x,y,0],[x,y,s.baseThickness-s.topChamfer]])),...upper.toPolygons().flat().map(([x,y])=>[x,y,s.baseThickness])];
      base=own(M.hull(points));
    }else base=own(footprint.extrude(s.baseThickness));
    const shift=[-(textBounds.min[0]+textBounds.max[0])/2,-(textBounds.min[1]+textBounds.max[1])/2,0];
    const parts=[solidPart(base,'0-base','base',s.baseColor,[0,0,0])],whole=[base];
    for(let i=0;i<letters.length;i++){
      const moved=own(own(letters[i].solid.translate(shift)).trimByPlane([0,0,1],0));whole.push(moved);
      // Material regions share a face; the STL uses their full union instead of internal faces.
      const visible=own(moved.trimByPlane([0,0,1],s.baseThickness));
      parts.push(solidPart(visible,`${i+1}-${letters[i].ch}-top`,'top',s.topColor,[0,0,0]));
    }
    const solid=own(M.union(whole)),pieces=solid.decompose();pieces.forEach(own);
    if(pieces.filter(p=>p.volume()>.001).length!==1)throw Error('لم تتصل جميع الحروف بالقاعدة.');
    const box=solid.boundingBox();
    const warnings=depth>s.baseDepth+.01?['ازداد عمق القاعدة تلقائيًا ليحتوي ميل الحروف ويحافظ على ثباتها.']:[];
    return {kind:'nameplate',text:s.text,settings:s,parts,stlParts:[solidPart(solid,'nameplate','base',s.baseColor,[0,0,0])],dimensions:box.max.map((x,i)=>x-box.min[i]),warnings,actualBaseDepth:depth,bendOriginY:shift[1],fontName:arabic?'Amiri Bold':'Luckiest Guy'};
  }finally{for(const obj of owned.reverse())obj.delete();}
}
