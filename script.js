const STORAGE_KEY="meal-records-v1";
const PERIODS=["朝","昼","晩","弁当"],ORDER=Object.fromEntries(PERIODS.map((x,i)=>[x,i])),WEEKDAYS=["日","月","火","水","木","金","土"];
let records=[],selectedPeriod=null,activeFilterPeriods=new Set(),showAll=false,editingId=null,historyDish=null,pendingAction=null,pendingDeleteId=null,pendingRestoreRecords=null,storageAvailable=true,toastTimer;
const $=id=>document.getElementById(id);
const dateInput=$("dateInput"),recordListEl=$("recordList"),errorMsg=$("errorMsg"),toast=$("toast"),storageWarn=$("storageWarn"),saveBtn=$("saveBtn"),cancelEditBtn=$("cancelEditBtn"),toggleGohan=$("toggleGohan"),toggleMiso=$("toggleMiso"),deleteModal=$("deleteModal"),modalText=$("modalText"),modalCancelBtn=$("modalCancelBtn"),modalDeleteBtn=$("modalDeleteBtn"),historyPanel=$("historyPanel"),historyTitle=$("historyTitle"),filterLabel=$("filterLabel"),filterRow=$("filterRow"),restoreFileInput=$("restoreFileInput");

function todayStr(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")}
function parseDate(s){const [y,m,d]=String(s).split("-").map(Number);return new Date(y,m-1,d)}
function formatDateJP(s){const d=parseDate(s);return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

/* 比較専用。表記ゆれを増やす場合は、誤判定を避けて完全一致する別名だけを追加する。 */
const ALIAS_GROUPS=[
 ["玉子焼き","卵焼き","たまご焼き","玉子やき","卵やき","たまごやき"],
 ["唐揚げ","から揚げ","からあげ"],
 ["ご飯","ごはん"],
 ["味噌汁","みそ汁"]
];
function baseName(v){return String(v).normalize("NFKC").toLowerCase().replace(/[\s　・･]/g,"").replace(/[〜～]/g,"ー")}
const ALIASES=new Map();ALIAS_GROUPS.forEach((g,i)=>g.forEach(x=>ALIASES.set(baseName(x),`alias:${i}`)));
function normalizeDish(v){const n=baseName(v);return ALIASES.get(n)||`text:${n}`}
function isMatch(a,b){const x=normalizeDish(a),y=normalizeDish(b);return x!=="text:"&&x===y}

function createId(){let id=Date.now();while(records.some(r=>String(r.id)===String(id)))id++;return id}
function migrateRecord(r){
 if(!r||typeof r!=="object"||!/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))||!PERIODS.includes(r.period)||!Array.isArray(r.items))return null;
 return {id:["number","string"].includes(typeof r.id)?r.id:createId(),date:r.date,period:r.period,items:Array.from({length:7},(_,i)=>typeof r.items[i]==="string"?r.items[i]:""),comment:typeof r.comment==="string"?r.comment:""};
}
function validateRecords(v){if(!Array.isArray(v))throw new Error("invalid records");return v.map(migrateRecord).filter(Boolean)}
function persist(){if(!storageAvailable)return true;try{localStorage.setItem(STORAGE_KEY,JSON.stringify(records));return true}catch(e){console.warn(e);storageAvailable=false;storageWarn.classList.remove("hidden");return true}}
function load(){try{const raw=localStorage.getItem(STORAGE_KEY);records=raw?validateRecords(JSON.parse(raw)):[]}catch(e){console.warn(e);records=[];storageAvailable=false;storageWarn.classList.remove("hidden")}renderList()}
function showToast(msg){clearTimeout(toastTimer);toast.textContent=msg;toast.classList.add("show");toastTimer=setTimeout(()=>toast.classList.remove("show"),1800)}
function beep(){try{const C=window.AudioContext||window.webkitAudioContext,c=new C(),o=c.createOscillator(),g=c.createGain();o.frequency.value=880;g.gain.setValueAtTime(.15,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.35);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.35)}catch(_){}}
function range(){const today=parseDate(todayStr()),cutoff=new Date(today);cutoff.setDate(cutoff.getDate()-29);return{today,cutoff}}

function highlightKeys(){
 const {today,cutoff}=range(),pool=[];
 records.forEach(r=>{const d=parseDate(r.date);if(!activeFilterPeriods.has(r.period)||d<cutoff||d>today)return;for(let i=2;i<=6;i++)if(r.items[i]?.trim())pool.push({key:`${r.id}-${i}`,name:r.items[i]})});
 const counts=new Map();pool.forEach(x=>counts.set(normalizeDish(x.name),(counts.get(normalizeDish(x.name))||0)+1));
 return new Set(pool.filter(x=>counts.get(normalizeDish(x.name))>1).map(x=>x.key));
}
function historyMatches(r,dish){return r.items.slice(2,7).some(x=>x&&isMatch(x,dish))}
function card(r,highlights){
 const chips=r.items.map((text,i)=>{if(!text?.trim())return"";const dup=highlights.has(`${r.id}-${i}`),cls=`chip${dup?" dup":""}`,badge=dup?'<span class="dup-badge">重複</span>':"",label=`${esc(text)}${badge}`;return i>=2?`<button type="button" class="${cls}" data-dish="${esc(text)}" aria-label="${esc(text)}の履歴を見る">${label}</button>`:`<span class="${cls}">${label}</span>`}).join("");
 return `<article class="record-card"><div class="record-head"><div class="record-date">${formatDateJP(r.date)}</div><div style="display:flex;align-items:center;gap:8px;"><span class="period-tag ${r.period}">${r.period}</span><button type="button" class="edit-btn" data-id="${esc(r.id)}">編集</button><button type="button" class="del-btn" data-id="${esc(r.id)}">削除</button></div></div><div class="item-chips">${chips}</div>${r.comment.trim()?`<div class="record-comment">💬 ${esc(r.comment)}</div>`:""}</article>`;
}
function renderHistory(){
 const list=records.filter(r=>historyMatches(r,historyDish)).sort((a,b)=>b.date.localeCompare(a.date)||ORDER[a.period]-ORDER[b.period]),keys=new Set();
 list.forEach(r=>r.items.forEach((x,i)=>{if(i>=2&&x&&isMatch(x,historyDish))keys.add(`${r.id}-${i}`)}));
 historyTitle.textContent=`「${historyDish}」の全期間の履歴（${list.length}件）`;
 recordListEl.innerHTML=list.length?list.map(r=>card(r,keys)).join(""):'<div class="empty-msg">この料理の履歴はありません</div>';
}
function renderNormal(){
 if(!records.length){recordListEl.innerHTML='<div class="empty-msg">まだ記録がありません</div>';return}
 if(!activeFilterPeriods.size){recordListEl.innerHTML='<div class="empty-msg">上の「朝・昼・晩・弁当」から見たい時間帯を選んでください</div>';return}
 const {today,cutoff}=range(),filtered=records.filter(r=>activeFilterPeriods.has(r.period)),dates=[...new Set(filtered.map(r=>r.date))].sort((a,b)=>b.localeCompare(a)),shown=showAll?dates:dates.filter(s=>{const d=parseDate(s);return d>=cutoff&&d<=today}),more=!showAll&&dates.some(s=>parseDate(s)<cutoff),keys=highlightKeys();
 let html=shown.length?shown.map(date=>`<div class="day-block">${filtered.filter(r=>r.date===date).sort((a,b)=>ORDER[a.period]-ORDER[b.period]).map(r=>card(r,keys)).join("")}</div>`).join(""):'<div class="empty-msg">選んだ時間帯の記録がありません</div>';
 if(more)html+='<button type="button" class="more-btn" id="showAllBtn">＋もっと見る（全部表示）</button>';recordListEl.innerHTML=html;
}
function renderList(){historyDish?renderHistory():renderNormal()}
function enterHistory(dish){historyDish=dish;historyPanel.classList.remove("hidden");filterLabel.classList.add("hidden");filterRow.classList.add("hidden");renderList();historyPanel.scrollIntoView({behavior:"smooth",block:"start"})}
function leaveHistory(){historyDish=null;historyPanel.classList.add("hidden");filterLabel.classList.remove("hidden");filterRow.classList.remove("hidden");renderList()}

document.querySelectorAll(".period-btn").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".period-btn").forEach(x=>x.classList.remove("active"));b.classList.add("active");selectedPeriod=b.dataset.period}));
[toggleGohan,toggleMiso].forEach(b=>b.addEventListener("click",()=>b.classList.toggle("active")));
document.querySelectorAll(".filter-btn").forEach(b=>b.addEventListener("click",()=>{const p=b.dataset.period;activeFilterPeriods.has(p)?(activeFilterPeriods.delete(p),b.classList.remove("active")):(activeFilterPeriods.add(p),b.classList.add("active"));showAll=false;renderList()}));
recordListEl.addEventListener("click",e=>{
 const del=e.target.closest(".del-btn");if(del){openModal("record",del.dataset.id);return}
 const edit=e.target.closest(".edit-btn");if(edit){const r=records.find(x=>String(x.id)===edit.dataset.id);if(r)startEdit(r);return}
 const dish=e.target.closest("button.chip[data-dish]");if(dish){enterHistory(dish.dataset.dish);return}
 if(e.target.closest("#showAllBtn")){showAll=true;renderList()}
});
$("backToListBtn").addEventListener("click",leaveHistory);

function startEdit(r){editingId=r.id;dateInput.value=r.date;document.querySelectorAll(".period-btn").forEach(b=>b.classList.remove("active"));const b=document.querySelector(`.period-btn[data-period="${r.period}"]`);if(b)b.classList.add("active");selectedPeriod=r.period;toggleGohan.classList.toggle("active",r.items[0]==="ごはん");toggleMiso.classList.toggle("active",r.items[1]==="みそ汁");for(let i=2;i<=6;i++)$("item"+i).value=r.items[i]||"";$("comment").value=r.comment||"";saveBtn.textContent="✔ 変更を保存";cancelEditBtn.classList.remove("hidden");errorMsg.textContent="";$("inputCard").scrollIntoView({behavior:"smooth",block:"start"})}
function endEdit(){editingId=null;saveBtn.textContent="✔ 記録する";cancelEditBtn.classList.add("hidden")}
function resetForm(){dateInput.value=todayStr();document.querySelectorAll(".period-btn").forEach(b=>b.classList.remove("active"));selectedPeriod=null;toggleGohan.classList.remove("active");toggleMiso.classList.remove("active");for(let i=2;i<=6;i++)$("item"+i).value="";$("comment").value=""}
cancelEditBtn.addEventListener("click",()=>{endEdit();resetForm();errorMsg.textContent=""});
saveBtn.addEventListener("click",()=>{
 errorMsg.textContent="";if(!dateInput.value){errorMsg.textContent="日付を選んでください";return}if(!selectedPeriod){errorMsg.textContent="「朝」「昼」「晩」「弁当」を選んでください";return}
 const items=[toggleGohan.classList.contains("active")?"ごはん":"",toggleMiso.classList.contains("active")?"みそ汁":"",...[2,3,4,5,6].map(i=>$("item"+i).value.trim())],comment=$("comment").value.trim();
 if(items.every(x=>!x)){errorMsg.textContent="「ごはん」「みそ汁」かおかずを1つ以上入力してください";return}
 const wasEditing=editingId!==null,r={id:wasEditing?editingId:createId(),date:dateInput.value,period:selectedPeriod,items,comment};
 if(wasEditing){const i=records.findIndex(x=>String(x.id)===String(editingId));if(i<0){errorMsg.textContent="編集対象の記録が見つかりませんでした";return}records[i]=r}else records.push(r);
 saveBtn.disabled=true;saveBtn.textContent="保存中…";persist();saveBtn.disabled=false;endEdit();resetForm();renderList();beep();showToast(wasEditing?"✔ 変更しました！":"✔ 記録しました！");
});

function openModal(action,id=null){pendingAction=action;pendingDeleteId=id;modalText.textContent=action==="clearAll"?"すべての記録を消去しますか？（元に戻せません）":action==="restore"?"現在の記録を、選んだバックアップの内容で置き換えますか？":"この記録を削除しますか？";modalDeleteBtn.textContent=action==="restore"?"復元する":"削除する";deleteModal.classList.remove("hidden");modalCancelBtn.focus()}
function closeModal(){pendingAction=null;pendingDeleteId=null;pendingRestoreRecords=null;deleteModal.classList.add("hidden");modalDeleteBtn.textContent="削除する"}
modalCancelBtn.addEventListener("click",closeModal);deleteModal.addEventListener("click",e=>{if(e.target===deleteModal)closeModal()});
modalDeleteBtn.addEventListener("click",()=>{
 let msg="";if(pendingAction==="clearAll"){records=[];endEdit();resetForm();historyDish=null;msg="記録をすべて消去しました"}else if(pendingAction==="record"){const id=pendingDeleteId;records=records.filter(r=>String(r.id)!==String(id));if(String(editingId)===String(id)){endEdit();resetForm()}msg="記録を削除しました"}else if(pendingAction==="restore"&&pendingRestoreRecords){records=pendingRestoreRecords;endEdit();resetForm();historyDish=null;msg="バックアップを復元しました"}
 pendingAction=null;pendingDeleteId=null;pendingRestoreRecords=null;deleteModal.classList.add("hidden");modalDeleteBtn.textContent="削除する";historyPanel.classList.add("hidden");filterLabel.classList.remove("hidden");filterRow.classList.remove("hidden");persist();renderList();if(msg)showToast(msg)
});
$("clearAllBtn").addEventListener("click",()=>openModal("clearAll"));
$("backupBtn").addEventListener("click",()=>{const data={app:"なにっくった",version:2,exportedAt:new Date().toISOString(),storageKey:STORAGE_KEY,records},blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`nanikutta-backup-${todayStr()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast("バックアップを書き出しました")});
$("restoreBtn").addEventListener("click",()=>{restoreFileInput.value="";restoreFileInput.click()});
restoreFileInput.addEventListener("change",async()=>{const file=restoreFileInput.files?.[0];if(!file)return;try{const parsed=JSON.parse(await file.text()),source=Array.isArray(parsed)?parsed:parsed.records;pendingRestoreRecords=validateRecords(source);openModal("restore")}catch(e){console.warn(e);pendingRestoreRecords=null;errorMsg.textContent="バックアップファイルを読み込めませんでした";$("inputCard").scrollIntoView({behavior:"smooth",block:"start"})}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!deleteModal.classList.contains("hidden"))closeModal()});

dateInput.value=todayStr();load();
window.NanikuttaV2=Object.freeze({normalizeDish,isMatch,validateRecords,getRecords:()=>records.map(r=>({...r,items:[...r.items]}))});

