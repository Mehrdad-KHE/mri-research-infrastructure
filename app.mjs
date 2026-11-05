import { inspectFiles } from './intake.mjs';

const $ = id => document.getElementById(id);
const fa = value => new Intl.NumberFormat('fa-IR', {maximumFractionDigits: 1}).format(value);
const scenarioNames = {healthy:'نمونهٔ سالم',missing:'فایل مفقود',corrupt:'فایل خراب',unsupported:'قالب پشتیبانی‌نشده',duplicates:'فایل تکراری',local:'فایل‌های انتخاب‌شده'};
const categoryNames = {referral_related:'مرتبط با سؤال ارجاع',incidental:'اتفاقی یا خارج از سؤال',unspecified:'دسته‌بندی نامشخص'};
const defaultSummary = 'این یادداشت فقط بازبینی دستیِ ورودی و پیوند به الگوهای هندسیِ ساختگی را ثبت می‌کند. تحلیل تصویری یا استنتاج بالینی انجام نشده است.';
const state = {fixtures:null,result:null,caseId:null,selectedSeries:null,sliceIndex:0,point:null,windowCenter:0,windowWidth:1,notes:[],reportText:'',dirty:false,busy:false,activeTab:'series',loadedInputs:null,revision:0};
let pendingDiscard = false;
let nextNoteId = 1;
let loadToken = 0;

function node(tag, text, className) {const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function message(text, error=false) {$('statusMessage').textContent=text;$('statusMessage').classList.toggle('error',error);}
function seriesLabel(id) {return id===state.fixtures?.expected.series[0]?.id?'سری ۱ • الگوی هندسی الف':id===state.fixtures?.expected.series[1]?.id?'سری ۲ • الگوی هندسی ب':'سری ساختگی';}
function selectedStack() {return state.result?.series.find(s=>s.id===state.selectedSeries)?.files.filter(f=>f.status==='read'&&f.kind==='dicom')||[];}
function currentFile() {return selectedStack()[state.sliceIndex]||null;}
function markDirty() {state.dirty=true;state.revision++;updateEditStatus();}
function updateEditStatus() {$('editStatus').textContent=state.dirty?'ویرایش محلی؛ برای نگه‌داشتن، خروجی JSON بگیرید.':'فقط در حافظهٔ این صفحه؛ بدون ذخیرهٔ خودکار';$('editStatus').classList.toggle('dirty',state.dirty);}
function setBusy(busy) {state.busy=busy;for(const id of ['scenarioSelect','loadButton','resetButton','fileInput'])$(id).disabled=busy; document.querySelector('.file-button').setAttribute('aria-disabled',String(busy));$('exportButton').disabled=busy||!state.result;for(const panel of document.querySelectorAll('.workspace > .panel')){panel.inert=busy;panel.setAttribute('aria-busy',String(busy));}}
function freeze(value) {if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function snapshot() {const f=currentFile();return freeze({caseId:state.caseId,busy:state.busy,dirty:state.dirty,revision:state.revision,coverage:state.result?{...state.result.coverage,analyzed:0}:{received:0,read:0,decodedImages:0,readReports:0,analyzed:0},selectedSeries:state.selectedSeries,sliceIndex:state.sliceIndex,selectedFile:f?{id:f.id,uid:f.uid,sha256:f.sha256,series:f.series,rows:f.rows,columns:f.columns,frameNumber:1,frameOfReferenceUID:f.frame}:null,point:state.point?{...state.point}:null,window:{center:state.windowCenter,width:state.windowWidth},notes:JSON.parse(JSON.stringify(state.notes)),reportText:state.reportText,issues:[...(state.result?.issues||[])]});}
Object.defineProperty(window,'__MRI_REVIEW__',{value:Object.freeze({get state(){return snapshot();}}),writable:false,configurable:false});

async function allowDiscard() {
 if(!state.dirty)return true;
 if(pendingDiscard)return false;
 pendingDiscard=true;const d=$('discardDialog');d.returnValue='cancel';
 return new Promise(resolve=>{d.addEventListener('close',()=>{pendingDiscard=false;resolve(d.returnValue==='discard');},{once:true});d.showModal();});
}
function decodeFixture(item) {const binary=atob(item.base64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return {name:item.name,bytes};}
async function loadScenario(id,{force=false}={}) {
 if(state.busy||!state.fixtures)return;
 if(!force&&!await allowDiscard()){$('scenarioSelect').value=state.caseId in scenarioNames&&state.caseId!=='local'?state.caseId:'healthy';return;}
 const entries=state.fixtures.scenarios[id];if(!entries){message('سناریوی انتخاب‌شده وجود ندارد.',true);return;}
 $('scenarioSelect').value=id;
 await inspectCase(entries.map(decodeFixture),id);
}
async function inspectCase(inputs,caseId) {
 const token=++loadToken;setBusy(true);message('در حال بررسی هش و خواندن فایل‌های مجازِ ساختگی…');
 state.caseId=caseId;state.loadedInputs=inputs;state.result=null;state.notes=[];state.reportText='';state.dirty=false;state.point=null;state.selectedSeries=null;state.sliceIndex=0;state.revision++;renderAll();
 try {
  const result=await inspectFiles(inputs);
  if(token!==loadToken)return;
  state.result=result;state.selectedSeries=result.series.find(s=>s.files.some(f=>f.status==='read'))?.id||result.series[0]?.id||null;
  state.reportText=defaultSummary;state.sliceIndex=0;state.point=null;
  const f=currentFile();if(f){state.point={x:Math.floor(f.columns/2),y:Math.floor(f.rows/2)};resetDisplayWindow();state.notes=[makeNote(f,'نقطهٔ نمونه روی الگوی هندسی؛ فقط برای آزمون بازگشت به شاهد، بدون ادعای بیماری.')];}
  renderAll();
  const rejected=result.files.filter(f=>f.status!=='read').length;
  message(`${scenarioNames[caseId]||'نمونه'} بارگذاری شد؛ ${fa(result.coverage.read)} فایل خوانده شد${rejected?` و ${fa(rejected)} فایل خوانده نشد`:''}. تحلیل تصویری انجام نشده است.`);
 } catch(error) {if(token!==loadToken)return;state.result=null;state.loadedInputs=null;renderAll();message('خواندن نمونه متوقف شد. داده‌ای تحلیل نشده است. دوباره سناریو را بارگذاری کنید.',true);}
 finally {if(token===loadToken){setBusy(false);renderViewer();}}
}
function makeNote(f,text='') {return {id:`note-${nextNoteId++}`,category:'referral_related',text,source:'manual_synthetic_example',reference:{seriesUID:f.series,sopInstanceUID:f.uid,frameNumber:1,frameOfReferenceUID:f.frame,fileSha256:f.sha256,pixel:{...state.point},pixelIndexOrigin:0,rows:f.rows,columns:f.columns}};}
function resetDisplayWindow() {const f=currentFile();if(!f)return;let min=Infinity,max=-Infinity;for(const v of f.pixels){min=Math.min(min,v);max=Math.max(max,v);}state.windowCenter=(min+max)/2;state.windowWidth=Math.max(1,max-min);}
function selectImage(seriesId,index,{point=null,keepWindow=false}={}) {if(state.busy)return;state.selectedSeries=seriesId;state.sliceIndex=index;const f=currentFile();state.point=f?(point||{x:Math.floor(f.columns/2),y:Math.floor(f.rows/2)}):null;if(!keepWindow)resetDisplayWindow();renderManifest();renderViewer();}
function changeSlice(delta) {const stack=selectedStack();if(!stack.length)return;const n=Math.max(0,Math.min(stack.length-1,state.sliceIndex+delta));if(n!==state.sliceIndex)selectImage(state.selectedSeries,n,{keepWindow:true});}
function showEvidence(note) {
 if(state.busy)return;
 const s=state.result?.series.find(s=>s.id===note.reference.seriesUID);const stack=s?.files.filter(f=>f.status==='read'&&f.kind==='dicom')||[];
 const index=stack.findIndex(f=>f.uid===note.reference.sopInstanceUID&&f.sha256===note.reference.fileSha256);
 if(index<0){message('تصویرِ دقیق این شاهد در ورودی فعلی قابل دسترسی نیست.',true);return;}
 selectImage(s.id,index,{point:{...note.reference.pixel}});
 $('viewerPanel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});
 $('imageCanvas').focus({preventScroll:true});message('همان تصویر و مختصاتِ ثبت‌شده در یادداشت نمایش داده شد.');
}
function issueText(code) {
 const map={not_in_synthetic_allowlist:'هش فایل در مجموعهٔ ساختگی مجاز نیست؛ محتوا پارس نشده است.',synthetic_size_limit:'بیش از سقف اندازهٔ نمونه؛ محتوا پارس نشده است.',invalid_byte_input:'ورودی دریافت نشد یا از سقف اندازهٔ نمونه بزرگ‌تر بود.',truncated_header:'سربرگ ناقص است.',truncated_value:'دادهٔ فایل قطع شده است.',pixel_length_mismatch:'طول دادهٔ پیکسل با ابعاد سازگار نیست.',unsupported_transfer_syntax:'شیوهٔ رمزگذاری پشتیبانی نمی‌شود.',unsupported_sequence_or_undefined_length:'عنصر تو‌در‌توی SQ یا طول نامعین پشتیبانی نمی‌شود.',unsupported_multiframe:'قالب چندفریمی پشتیبانی نمی‌شود.',duplicate_sop_instance:'شناسهٔ تصویر تکراری است.',count_does_not_match_synthetic_manifest:'تعداد فایل با فهرست ساختگی برابر نیست.',gap_does_not_match_synthetic_manifest:'فاصله با فهرست ساختگی برابر نیست.',overlapping_positions:'موقعیت تصاویر تکراری یا هم‌پوشان است.',mixed_stack:'مشخصات تصاویر سری یکسان نیست.',inconsistent_geometry:'هندسهٔ سری سازگار نیست.',in_plane_origin_drift:'مبدأ درون‌صفحه‌ای جابه‌جا شده است.',missing_synthetic_provenance_note:'متن همراهِ موردانتظار موجود نیست.'};
 if(code.includes('missing_expected_uid:'))return 'یک شناسهٔ تصویرِ موردانتظار موجود نیست.';
 for(const [key,label] of Object.entries(map))if(code===key||code.endsWith(':'+key))return label;
 return 'محدودیت ساختاری: '+code;
}
function renderCoverage() {
 const c=state.result?.coverage||{received:0,read:0,decodedImages:0,readReports:0};
 $('receivedCount').textContent=fa(c.received);$('readCount').textContent=fa(c.read);$('analyzedCount').textContent='۰';
 $('readDetail').textContent=`${fa(c.decodedImages||0)} تصویر و ${fa(c.readReports||0)} متن همراه`;
 $('caseTitle').textContent=scenarioNames[state.caseId]||'بدون پرونده';$('fileCountBadge').textContent=fa(c.received);
 $('inventorySummary').textContent=state.result?'فقط تطبیق با فهرست همین مجموعهٔ ساختگی':state.busy?'در حال خواندن…':'در انتظار ورودی';
}
function renderManifest() {
 const seriesRoot=$('seriesList'),filesRoot=$('fileList');seriesRoot.replaceChildren();filesRoot.replaceChildren();
 for(const s of state.result?.series||[]){
  const readable=s.files.filter(f=>f.status==='read'&&f.kind==='dicom');const b=node('button',undefined,'series-card'+(s.id===state.selectedSeries?' active':''));b.type='button';b.setAttribute('aria-pressed',String(s.id===state.selectedSeries));
  b.append(node('strong',seriesLabel(s.id)),node('span',`${fa(readable.length)} تصویر قابل نمایش`,'series-subtitle'),node('span',s.id,'code'));
  const tail=node('div',undefined,'series-tail');tail.append(node('span',`${fa(readable.length)} / ${fa(s.expectedCount)} موردانتظار`),node('span',s.issues.length?'نیازمند بررسی':'تطبیقِ نمونه',`status-pill${s.issues.length?' warning':''}`));b.append(tail);
  b.addEventListener('click',()=>selectImage(s.id,0));seriesRoot.append(b);
 }
 for(const f of state.result?.files||[]){const row=node('div',undefined,'file-row');if(f.status==='read'&&f.kind==='dicom'){const b=node('button',f.name,currentFile()?.id===f.id?'current':'');b.type='button';b.addEventListener('click',()=>{const stack=state.result.series.find(s=>s.id===f.series).files.filter(a=>a.status==='read'&&a.kind==='dicom');selectImage(f.series,stack.findIndex(a=>a.id===f.id));});row.append(b);}else row.append(node('span',f.name,'file-name'));
  const detail=node('div',undefined,'file-detail');detail.append(node('span',f.kind==='dicom'?'DICOM':f.kind==='report'?'متن همراه':'ورودی ناشناخته'),node('span',f.status==='read'?'خوانده‌شده':f.status==='error'?'خطای خواندن':'پذیرفته نشد',`status-pill${f.status==='error'?' error':f.status==='notaccepted'?' warning':''}`));row.append(detail);if(f.error)row.append(node('small',issueText(f.error)));filesRoot.append(row);
 }
 if(!state.result){seriesRoot.append(node('p',state.busy?'در حال خواندن ورودی…':'ورودی بارگذاری نشده است.','notes-empty'));}
 const ex=$('expectedInventory');ex.replaceChildren();
 for(const expected of state.fixtures?.expected.series||[]){const s=state.result?.series.find(x=>x.id===expected.id);const present=new Set((s?.files||[]).filter(f=>f.status==='read').map(f=>f.uid));const count=expected.uids.filter(uid=>present.has(uid)).length;const row=node('div',undefined,'expected-row');row.append(node('span',seriesLabel(expected.id).split(' • ')[0]),node('span',`${fa(count)} از ${fa(expected.count)} شناسه`));ex.append(row);}
 if(state.fixtures){const r=node('div',undefined,'expected-row');r.append(node('span','متن همراه'),node('span',`${fa(state.result?.coverage.readReports||0)} از ${fa(state.fixtures.expected.reportCount)}`));ex.append(r);}
 const issues=state.result?.issues||[];$('issueCount').textContent=fa(issues.length);$('issueList').replaceChildren(...(issues.length?issues.map(code=>node('li',issueText(code))):[node('li',state.result?'در کنترل‌های محدود این نمونه خطایی ثبت نشد.':'هنوز بررسی نشده است.')]));
}
function drawImage() {
 const f=currentFile();if(!f)return;const canvas=$('imageCanvas');canvas.width=f.columns;canvas.height=f.rows;
 const ctx=canvas.getContext('2d');const image=ctx.createImageData(f.columns,f.rows);const low=state.windowCenter-state.windowWidth/2;
 for(let i=0;i<f.pixels.length;i++){const value=Math.round(Math.max(0,Math.min(255,(f.pixels[i]-low)/state.windowWidth*255)));const offset=i*4;image.data[offset]=image.data[offset+1]=image.data[offset+2]=value;image.data[offset+3]=255;}
 ctx.putImageData(image,0,0);
 if(state.point){const {x,y}=state.point;ctx.save();ctx.strokeStyle='#5ee7c3';ctx.lineWidth=.45;const xx=x+.5,yy=y+.5;ctx.beginPath();ctx.moveTo(Math.max(0,xx-6),yy);ctx.lineTo(Math.min(f.columns,xx+6),yy);ctx.moveTo(xx,Math.max(0,yy-6));ctx.lineTo(xx,Math.min(f.rows,yy+6));ctx.stroke();ctx.strokeStyle='#172e43';ctx.lineWidth=.3;ctx.strokeRect(x-1.5,y-1.5,4,4);ctx.restore();}
}
function renderViewer() {
 const f=currentFile(),stack=selectedStack(),has=!!f;
 $('imageCanvas').hidden=!has;$('viewerEmpty').hidden=has;$('viewportLabel').hidden=!has;$('pointOverlay').hidden=!has;
 $('imageBadge').textContent=has?`${fa(f.columns)} × ${fa(f.rows)} پیکسل`:'بدون تصویر';
 $('sliceSlider').disabled=!has||state.busy;$('sliceSlider').max=String(Math.max(0,stack.length-1));$('sliceSlider').value=String(state.sliceIndex);
 $('slicePosition').textContent=`${fa(has?state.sliceIndex+1:0)} / ${fa(stack.length)}`;
 $('previousSlice').disabled=!has||state.sliceIndex===0||state.busy;$('nextSlice').disabled=!has||state.sliceIndex>=stack.length-1||state.busy;
 for(const id of ['windowCenter','windowWidth','resetWindow','pointX','pointY','addNoteButton'])$(id).disabled=!has||state.busy;
 const geom=$('geometryDetails');geom.replaceChildren();
 if(!has){$('centerValue').textContent=$('widthValue').textContent='—';$('pointX').value=$('pointY').value='';return;}
 let min=Infinity,max=-Infinity;for(const v of f.pixels){min=Math.min(min,v);max=Math.max(max,v);}const span=Math.max(1,max-min);
 $('windowCenter').min=String(min-span);$('windowCenter').max=String(max+span);$('windowCenter').step='0.1';$('windowCenter').value=String(state.windowCenter);
 $('windowWidth').max=String(span*4);$('windowWidth').step='0.1';$('windowWidth').value=String(state.windowWidth);
 $('centerValue').textContent=fa(state.windowCenter);$('widthValue').textContent=fa(state.windowWidth);
 $('pointX').max=String(f.columns-1);$('pointY').max=String(f.rows-1);$('pointX').value=String(state.point?.x??0);$('pointY').value=String(state.point?.y??0);
 $('pointOverlay').textContent=`x ${state.point?.x??0} · y ${state.point?.y??0} · frame 1`;
 for(const [label,value] of [['Series Instance UID',f.series],['SOP Instance UID',f.uid],['Frame of Reference UID',f.frame],['شمارهٔ فریم در فایل تک‌فریمی','1'],['فاصلهٔ پیکسل ردیف و ستون بر حسب mm',f.spacing.join(' × ')],['موقعیت تصویر',f.position.join(', ')],['تبدیل شدت',`slope ${f.slope} | intercept ${f.intercept}`]])geom.append(node('dt',label),node('dd',String(value)));
 drawImage();
}
function renderNotes() {
 $('noteCount').textContent=fa(state.notes.length);const root=$('notesList');root.replaceChildren();
 for(const [i,n] of state.notes.entries()){
  const card=node('article',undefined,'note-card');card.dataset.noteId=n.id;const head=node('header');head.append(node('strong',`یادداشت دستی ${fa(i+1)}`));const del=node('button','حذف');del.type='button';del.setAttribute('aria-label',`حذف یادداشت ${fa(i+1)}`);del.addEventListener('click',()=>{if(state.busy)return;state.notes=state.notes.filter(x=>x.id!==n.id);markDirty();renderNotes();});head.append(del);card.append(head);
  const body=node('div',undefined,'note-body');const label=node('label','ارتباط با سؤال ارجاع');label.htmlFor=`category-${n.id}`;const select=node('select');select.id=label.htmlFor;
  for(const [value,title] of Object.entries(categoryNames)){const option=node('option',title);option.value=value;select.append(option);}select.value=n.category;select.addEventListener('change',()=>{if(state.busy)return;n.category=select.value;markDirty();});body.append(label,select);
  const textLabel=node('label','مشاهده یا توضیح دستی');textLabel.htmlFor=`text-${n.id}`;const text=node('textarea');text.id=textLabel.htmlFor;text.rows=3;text.value=n.text;text.maxLength=4000;text.addEventListener('input',()=>{if(state.busy)return;n.text=text.value;markDirty();});body.append(textLabel,text);
  const ref=node('div',undefined,'note-reference');ref.append(node('span',`${seriesLabel(n.reference.seriesUID).split(' • ')[0]} · فریم ۱ · پیکسل x=${n.reference.pixel.x}، y=${n.reference.pixel.y}`),node('span',`SOP ${n.reference.sopInstanceUID}`,'code'));body.append(ref);
  const show=node('button','نمایش شاهد ↗','evidence-button');show.type='button';show.addEventListener('click',()=>showEvidence(n));body.append(show);card.append(body);root.append(card);
 }
 if(!state.notes.length)root.append(node('p','برای ثبت یک یادداشت، تصویر و نقطهٔ آن را انتخاب کنید.','notes-empty'));
 $('reportText').disabled=!state.result;$('reportText').value=state.reportText;updateEditStatus();
 const reports=(state.result?.files||[]).filter(f=>f.status==='read'&&f.kind==='report');$('reportCount').textContent=fa(reports.length);$('sourceReports').replaceChildren(...reports.map(f=>node('pre',f.text)));
 if(!reports.length)$('sourceReports').append(node('p','متن همراهِ قابل خواندن موجود نیست.'));
}
function renderAll() {renderCoverage();renderManifest();renderViewer();renderNotes();$('exportButton').disabled=state.busy||!state.result;}
function exportNotes() {
 if(!state.result||state.busy)return;
 const output={schema:'synthetic-mri-case-review/1',researchOnly:true,clinicalAnalysisPerformed:false,caseId:state.caseId,exportedAt:new Date().toISOString(),coverage:{...state.result.coverage,analyzed:0},expectedInventoryScope:'Only this known synthetic fixture set; not a clinical completeness assertion.',files:state.result.files.filter(f=>f.kind!=='unknown').map(f=>({name:f.name,sha256:f.sha256,status:f.status,error:f.error,kind:f.kind,seriesUID:f.series||null,sopInstanceUID:f.uid||null})),rejectedUnknownFileCount:state.result.files.filter(f=>f.kind==='unknown').length,notes:state.notes,summary:state.reportText};
 const blob=new Blob([JSON.stringify(output,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=`synthetic-review-${state.caseId}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);updateEditStatus();message('دریافت خروجی JSON درخواست شد؛ هیچ داده‌ای ارسال نشده است.');
}
function setTab(tab) {state.activeTab=tab;for(const name of ['series','files']){const on=name===tab;$(name+'Tab').setAttribute('aria-selected',String(on));$(name+'Tab').tabIndex=on?0:-1;} $('seriesList').hidden=tab!=='series';$('fileList').hidden=tab!=='files';}
$('seriesTab').addEventListener('click',()=>setTab('series'));$('filesTab').addEventListener('click',()=>setTab('files'));
for(const id of ['seriesTab','filesTab'])$(id).addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const tab=state.activeTab==='series'?'files':'series';setTab(tab);$(tab+'Tab').focus();}});
$('scenarioSelect').addEventListener('change',()=>loadScenario($('scenarioSelect').value));$('loadButton').addEventListener('click',()=>loadScenario($('scenarioSelect').value));
$('resetButton').addEventListener('click',async()=>{if(state.busy||!await allowDiscard())return;if(state.loadedInputs)await inspectCase(state.loadedInputs,state.caseId);else await loadScenario('healthy',{force:true});});
$('fileInput').addEventListener('change',async event=>{const chosen=Array.from(event.target.files||[]);event.target.value='';if(!chosen.length||state.busy)return;if(chosen.length>32){message('حداکثر ۳۲ فایل نمونه را هم‌زمان انتخاب کنید؛ این دسته بررسی نشد.',true);return;}if(chosen.reduce((sum,f)=>sum+f.size,0)>8*1024*1024){message('حجم کل نمونه‌ها باید حداکثر ۸ مگابایت باشد؛ این دسته بررسی نشد.',true);return;}if(!await allowDiscard())return;setBusy(true);try{const inputs=[];for(const f of chosen)inputs.push({name:f.name,bytes:f.size>4*1024*1024?null:new Uint8Array(await f.arrayBuffer())});await inspectCase(inputs,'local');}catch(error){setBusy(false);message('دریافت فایل‌های محلی انجام نشد؛ پروندهٔ دیگری بارگذاری نشده است.',true);}});
$('sliceSlider').addEventListener('input',()=>selectImage(state.selectedSeries,Number($('sliceSlider').value),{keepWindow:true}));$('previousSlice').addEventListener('click',()=>changeSlice(-1));$('nextSlice').addEventListener('click',()=>changeSlice(1));
$('windowCenter').addEventListener('input',()=>{state.windowCenter=Number($('windowCenter').value);$('centerValue').textContent=fa(state.windowCenter);drawImage();});$('windowWidth').addEventListener('input',()=>{state.windowWidth=Math.max(1,Number($('windowWidth').value));$('widthValue').textContent=fa(state.windowWidth);drawImage();});$('resetWindow').addEventListener('click',()=>{resetDisplayWindow();renderViewer();});
function updatePoint(x,y) {if(state.busy)return;const f=currentFile();if(!f)return;state.point={x:Math.max(0,Math.min(f.columns-1,Math.round(x))),y:Math.max(0,Math.min(f.rows-1,Math.round(y)))};renderViewer();}
function syncPointInputs({normalize=false,report=false}={}) {
 if(state.busy||!currentFile())return false;
 const x=$('pointX').valueAsNumber,y=$('pointY').valueAsNumber;
 if(!Number.isFinite(x)||!Number.isFinite(y)) {if(report)message('برای ثبت شاهد، هر دو مختصات عددی را وارد کنید.',true);return false;}
 const f=currentFile();state.point={x:Math.max(0,Math.min(f.columns-1,Math.round(x))),y:Math.max(0,Math.min(f.rows-1,Math.round(y)))};
 if(normalize)renderViewer();else{drawImage();$('pointOverlay').textContent=`x ${state.point.x} · y ${state.point.y} · frame 1`;}
 return true;
}
for(const id of ['pointX','pointY']){ $(id).addEventListener('input',()=>syncPointInputs());$(id).addEventListener('change',()=>syncPointInputs({normalize:true})); }
$('imageCanvas').addEventListener('click',event=>{const f=currentFile();if(!f)return;const rect=event.currentTarget.getBoundingClientRect(),scale=Math.min(rect.width/f.columns,rect.height/f.rows),left=rect.left+(rect.width-f.columns*scale)/2,top=rect.top+(rect.height-f.rows*scale)/2;const x=(event.clientX-left)/scale,y=(event.clientY-top)/scale;if(x<0||y<0||x>=f.columns||y>=f.rows)return;updatePoint(Math.floor(x),Math.floor(y));});
$('imageCanvas').addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();changeSlice(event.key==='ArrowLeft'?1:-1);}else if(event.key==='Enter'||event.key===' '){event.preventDefault();const f=currentFile();if(f)updatePoint(Math.floor(f.columns/2),Math.floor(f.rows/2));}});
$('addNoteButton').addEventListener('click',()=>{const f=currentFile();if(state.busy||!f||!syncPointInputs({normalize:true,report:true}))return;state.notes.push(makeNote(f));markDirty();renderNotes();$(`text-${state.notes.at(-1).id}`).focus();});
$('reportText').maxLength=12000;$('reportText').addEventListener('input',()=>{if(state.busy)return;state.reportText=$('reportText').value;markDirty();});$('exportButton').addEventListener('click',exportNotes);
window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
async function initialize() {try{state.fixtures=window.MRI_FIXTURES||await fetch('./fixtures.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('fixture_unavailable');return r.json();});await loadScenario('healthy',{force:true});}catch(error){setBusy(false);message('نمونه‌های ساختگی بارگذاری نشدند. این نسخه به fixtures.json محلی یا بستهٔ مستقل نیاز دارد.',true);renderAll();}}
initialize();
