/** Restricted synthetic-only intake, not a general or clinical DICOM reader.
 * Hash authorization happens BEFORE parsing. No network calls or storage.
 */
/* ALLOWLIST_START */
const ALLOWED = {"f1d6b66466ac05a46999b1a10e1d169e18926c908f06883b92532378edd59d00": "dicom", "f2dbf7f56fda9eb73956da45da314a7393e00db1eb8208e1ae82d7a439b95d33": "dicom", "0676f1ecf722dc05cadeeb59554dc44930b1ad8ac2e78afcfd232720f7ed3f54": "dicom", "ed85c3be78e013e95092a8308eff27082ef29cb317e39a94c80c472e179e8085": "dicom", "49570b87e2f73006cf10452e4cb4baa409e8d95992418d53dd08132d8c74d208": "dicom", "2f88aee50cb69948997acb1c039515f0a0f4f6533365be5fa446f06baea79368": "dicom", "61eab029f6075a7d099d3437c15e3a4eb8777c16cf9d2c3653465e3635bdeca6": "dicom", "23df6545e6c92b803ade636684589d77ff0e176b511c4b3990a7310efb2c55d2": "dicom", "a55326f8a2bb3477bd5fe7e1334667ea17a6c692d26972c8ae47285971c95d51": "dicom", "252e8b027db56cbbf427101c0d1fcb7f8ae9b45b6aabb337a63c9e2f95cbb6c5": "dicom", "b07588f66d8a44f52b224cc78649835b18c4d4f4e461d5a8385e8a76a0e6c741": "report", "a375c1fc0afe5d197a81682b36c630898eb4bf33ff73c7900d5bc54a1fddc605": "dicom", "c852047be359f7a939414f72bcfcdc5c04a142d858fe0ec09d3c828d0e75fe16": "dicom", "3de43c2c105bf29137617b21d390ddd43f854465e6355a3cef77ab14612b323e": "dicom", "bcae1b41a881aaa7820a8373a6ff665b886b9c974e23f2558ad076633ee2a9b2": "dicom", "1e8ddc0301e99e3e2475c7e94c334f78673c5acf71926ed51a3e4ca06be5377d": "dicom", "1edef31c58a1f7072281faa63f7881a291aea3f187b0b77d34aaaebe4804c7a9": "dicom", "0f36333e2962b9f3b9e38d96725af0dece7365189c3d5165231357c3263d1d51": "dicom", "b29745ab008ca605a505a54b8eacb32af4561642935b7b9807fcd0943dd2d3a7": "dicom", "aa1a6f4491d9fc6389933c33bf2be59882d5761ba18f7c25fd1d7c3afd8952c3": "dicom", "6204e8b653cb2aa0bcaa861711e722b1b8f12db62ae81d783b66789bcdc2858d": "dicom", "de530d589e5cd1b13b57b832d668499d17f0427e10c3b8531b1cb676ec109c9d": "dicom"};
/* ALLOWLIST_END */
const TS='1.2.840.10008.1.2.1', MR='1.2.840.10008.5.1.4.1.1.4';
const textDecoder=new TextDecoder('ascii');
const fail=code=>{throw new Error(code)};
const key=(g,e)=>`${g},${e}`;
const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const norm=a=>Math.sqrt(dot(a,a));
const near=(a,b)=>a.length===b.length&&a.every((x,i)=>Math.abs(x-b[i])<1e-5);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function parse(bytes){
 if(bytes.length<132||textDecoder.decode(bytes.subarray(128,132))!=='DICM')fail('unsupported_file_envelope');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),d=new Map();let p=132;
 const long=new Set(['OB','OW','OF','OD','OL','OV','SQ','UC','UR','UT','UN']);
 const valid=new Set(['AE','AS','AT','CS','DA','DS','DT','FL','FD','IS','LO','LT','OB','OD','OF','OL','OV','OW','PN','SH','SL','SQ','SS','ST','SV','TM','UC','UI','UL','UN','UR','US','UT','UV']);
 while(p<bytes.length){
  if(p+8>bytes.length)fail('truncated_header');
  const tag=key(view.getUint16(p,true),view.getUint16(p+2,true)),vr=textDecoder.decode(bytes.subarray(p+4,p+6));
  if(!valid.has(vr))fail('invalid_vr');
  let start=p+8,n=view.getUint16(p+6,true);
  if(long.has(vr)){if(p+12>bytes.length)fail('truncated_header');if(view.getUint16(p+6,true)!==0)fail('invalid_reserved_bytes');start=p+12;n=view.getUint32(p+8,true);}
  if(n===0xffffffff||vr==='SQ')fail('unsupported_sequence_or_undefined_length');
  if(n%2)fail('invalid_odd_value_length');
  if(start+n>bytes.length)fail('truncated_value');
  if(d.has(tag))fail('duplicate_element');
  d.set(tag,{vr,b:bytes.subarray(start,start+n)});p=start+n;
  if(tag==='2,16'&&textDecoder.decode(d.get(tag).b).replace(/[\0 ]+$/g,'')!==TS)fail('unsupported_transfer_syntax');
 }
 const get=(g,e)=>{const v=d.get(key(g,e));if(!v)fail(`missing_required_${g}_${e}`);return v;};
 const txt=(g,e)=>textDecoder.decode(get(g,e).b).replace(/[\0 ]+$/g,'');
 const us=(g,e)=>{const v=get(g,e);if(v.vr!=='US'||v.b.length!==2)fail('invalid_us_value');return new DataView(v.b.buffer,v.b.byteOffset,2).getUint16(0,true);};
 const nums=(g,e,count,code)=>{const t=txt(g,e).split('\\');if(t.length!==count||t.some(x=>!x.trim()||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(x.trim())))fail(code);const a=t.map(Number);if(!a.every(Number.isFinite))fail(code);return a;};
 if(txt(2,16)!==TS)fail('unsupported_transfer_syntax');
 if(txt(2,2)!==txt(8,22)||txt(2,3)!==txt(8,24))fail('file_meta_dataset_mismatch');
 if(txt(8,22)!==MR)fail('unsupported_sop_class');
 if(d.has('40,8')&&txt(40,8)!=='1')fail('unsupported_multiframe');
 if(txt(40,4)!=='MONOCHROME2')fail('unsupported_photometric_interpretation');
 if(!near([us(40,2),us(40,256),us(40,257),us(40,258),us(40,259)],[1,16,16,15,0]))fail('unsupported_pixel_layout');
 const rows=us(40,16),columns=us(40,17);if(!rows||!columns||rows*columns>1024*1024)fail('invalid_dimensions');
 const pixel=get(32736,16);if(pixel.vr!=='OW'||pixel.b.length!==rows*columns*2)fail('pixel_length_mismatch');
 const orientation=nums(32,55,6,'invalid_geometry'),position=nums(32,50,3,'invalid_geometry'),spacing=nums(40,48,2,'invalid_geometry');
 const a=orientation.slice(0,3),b=orientation.slice(3);
 if(!near([norm(a),norm(b),dot(a,b)],[1,1,0])||spacing.some(x=>x<=0))fail('invalid_orientation_or_spacing');
 // This deliberately restricted contract requires explicit scaling; no guessed defaults.
 const slope=nums(40,4179,1,'invalid_scaling')[0],intercept=nums(40,4178,1,'invalid_scaling')[0];
 if(slope===0)fail('invalid_scaling');
 const pv=new DataView(pixel.b.buffer,pixel.b.byteOffset,pixel.b.byteLength),pixels=new Float64Array(rows*columns);
 for(let i=0;i<pixels.length;i++){pixels[i]=pv.getUint16(i*2,true)*slope+intercept;if(!Number.isFinite(pixels[i]))fail('invalid_scaling');}
 return {study:txt(32,13),series:txt(32,14),uid:txt(8,24),frame:txt(32,52),position,orientation,spacing,rows,columns,pixels,slope,intercept};
}
export async function inspectFiles(inputs=[]){
 if(!Array.isArray(inputs))throw new TypeError("inputs_must_be_array");
 const files=[],issues=[];
 const batchError=inputs.length>32 ? "batch_file_count_limit" : inputs.reduce((n,x)=>n+(x?.bytes instanceof Uint8Array?x.bytes.length:0),0)>8*1024*1024 ? "batch_byte_limit" : null;
 for(let i=0;i<inputs.length;i++){
  const input=inputs[i],f={id:`file-${i}`,name:String(input?.name||'unnamed'),status:'notaccepted',kind:'unknown',error:null};files.push(f);
  if(!input||typeof input!=='object'){f.error='invalid_file_entry';continue;}
  if(batchError){f.error=batchError;continue;}
  if(!(input.bytes instanceof Uint8Array)){f.error='invalid_byte_input';continue;}
  if(input.bytes.length>4*1024*1024){f.error='synthetic_size_limit';continue;}
  const hash=await globalThis.crypto.subtle.digest('SHA-256',input.bytes);f.sha256=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
  const kind=ALLOWED[f.sha256];if(!kind){f.error='not_in_synthetic_allowlist';continue;}
  f.kind=kind;
  if(kind==='report'){f.status='read';f.text=textDecoder.decode(input.bytes);continue;}
  try{Object.assign(f,parse(input.bytes));f.status='read';}catch(e){f.status='error';f.error=e.message;}
 }
 const groups=new Map(),seen=new Set(),duplicateSeries=new Set();
 for(const f of files.filter(x=>x.status==='read'&&x.kind==='dicom')){
  if(seen.has(f.uid)){f.status='error';f.error='duplicate_sop_instance';delete f.pixels;duplicateSeries.add(f.series);issues.push('duplicate_sop_instance');continue;}
  seen.add(f.uid);if(!groups.has(f.series))groups.set(f.series,[]);groups.get(f.series).push(f);
 }
 const series=[];
 // Expected manifests are ONLY for this synthetic fixture set, not a clinical completeness claim.
 for(const id of ['2.25.700.1','2.25.700.2']){
  const members=groups.get(id)||[],si=[];const first=members[0];
  if(members.length!==5)si.push('count_does_not_match_synthetic_manifest');
  const actual=new Set(members.map(x=>x.uid));for(let j=1;j<=5;j++)if(!actual.has(`${id}.${j}`))si.push(`missing_expected_uid:${id}.${j}`);
  if(duplicateSeries.has(id))si.push('duplicate_sop_instance');
  if(first){
   if(members.some(f=>f.study!==first.study||f.frame!==first.frame||f.rows!==first.rows||f.columns!==first.columns))si.push('mixed_stack');
   if(members.some(f=>!near(f.orientation,first.orientation)||!near(f.spacing,first.spacing)))si.push('inconsistent_geometry');
   const n=cross(first.orientation.slice(0,3),first.orientation.slice(3));members.sort((a,b)=>dot(a.position,n)-dot(b.position,n));
   const origin=members[0].position;
   if(members.some(f=>{const v=sub(f.position,origin),projection=dot(v,n);return norm(v.map((x,i)=>x-projection*n[i]))>1e-5;}))si.push('in_plane_origin_drift');
   for(let j=1;j<members.length;j++){const gap=dot(sub(members[j].position,members[j-1].position),n);if(gap<=1e-6)si.push('overlapping_positions');if(Math.abs(gap-2)>1e-5)si.push('gap_does_not_match_synthetic_manifest');}
  }
  series.push({id,files:members,issues:[...new Set(si)],expectedCount:5});
 }
 if(!files.some(f=>f.status==='read'&&f.kind==='report'))issues.push('missing_synthetic_provenance_note');
 for(const f of files)if(f.error)issues.push(`${f.id}:${f.error}`);
 for(const s of series)for(const code of s.issues)issues.push(`${s.id}:${code}`);
 return {files,series,coverage:{received:files.length,read:files.filter(x=>x.status==='read').length,decodedImages:files.filter(x=>x.status==='read'&&x.kind==='dicom').length,readReports:files.filter(x=>x.status==='read'&&x.kind==='report').length,analyzed:0},issues:[...new Set(issues)],provenance:'Synthetic hash-allowlisted abstract geometry only; no medical analysis.'};
}
