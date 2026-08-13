const STORAGE_KEY = "meal-records-v1";

let records = [];
let selectedPeriod = null;
let activeFilterPeriods = new Set();
let showAll = false;
let editingId = null;

let pendingAction = null;
let pendingDeleteId = null;

const dateInput = document.getElementById("dateInput");
const recordListEl = document.getElementById("recordList");
const errorMsg = document.getElementById("errorMsg");
const toast = document.getElementById("toast");
const storageWarn = document.getElementById("storageWarn");

const saveBtn = document.getElementById("saveBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");

const toggleGohan = document.getElementById("toggleGohan");
const toggleMiso = document.getElementById("toggleMiso");

const deleteModal = document.getElementById("deleteModal");
const modalText = document.getElementById("modalText");
const modalCancelBtn = document.getElementById("modalCancelBtn");
const modalDeleteBtn = document.getElementById("modalDeleteBtn");

let storageAvailable = true;

function todayStr(){
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2,"0"),
    String(d.getDate()).padStart(2,"0")
  ].join("-");
}

dateInput.value = todayStr();

function showStorageWarning(){
  storageWarn.classList.remove("hidden");
}

function persistRecords(){
  if(!storageAvailable) return true;

  try{
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(records)
    );
    return true;
  }catch(e){
    console.warn(e);
    storageAvailable = false;
    showStorageWarning();
    return true;
  }
}

function loadRecords(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    records = raw ? JSON.parse(raw) : [];
  }catch(e){
    records = [];
    storageAvailable = false;
    showStorageWarning();
  }

  renderList();
}

function escapeHtml(str){
  return String(str).replace(
    /[&<>"']/g,
    c => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#39;"
    }[c])
  );
}

function showToast(msg){
  toast.textContent = msg;
  toast.classList.add("show");

  setTimeout(()=>{
    toast.classList.remove("show");
  },1400);
}

function playBeep(){
  try{
    const ctx = new (
      window.AudioContext ||
      window.webkitAudioContext
    )();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 880;

    gain.gain.setValueAtTime(
      0.15,
      ctx.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + 0.35
    );

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  }catch(e){}
}


/* =========================
   時間帯
========================= */

document.querySelectorAll(".period-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document
      .querySelectorAll(".period-btn")
      .forEach(b=>b.classList.remove("active"));

    btn.classList.add("active");
    selectedPeriod = btn.dataset.period;
  });
});


/* =========================
   ごはん・みそ汁
========================= */

[toggleGohan,toggleMiso].forEach(btn=>{
  btn.addEventListener("click",()=>{
    btn.classList.toggle("active");
  });
});


/* =========================
   表示フィルター
========================= */

document.querySelectorAll(".filter-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    const period = btn.dataset.period;

    if(activeFilterPeriods.has(period)){
      activeFilterPeriods.delete(period);
      btn.classList.remove("active");
    }else{
      activeFilterPeriods.add(period);
      btn.classList.add("active");
    }

    renderList();
  });
});


/* =========================
   日付表示
========================= */

const WEEKDAYS = [
  "日","月","火","水","木","金","土"
];

function formatDateJP(dateStr){
  const d = new Date(dateStr);

  return `${d.getFullYear()}年${
    d.getMonth()+1
  }月${
    d.getDate()
  }日（${
    WEEKDAYS[d.getDay()]
  }）`;
}


/* =========================
   重複判定
========================= */

function isMatch(a,b){
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();

  if(!x || !y) return false;

  return (
    x === y ||
    x.includes(y) ||
    y.includes(x)
  );
}

function computeHighlightKeys(){

  const today = new Date(todayStr());

  const cutoff = new Date(today);
  cutoff.setDate(
    cutoff.getDate() - 29
  );

  const pool = [];

  records.forEach(r=>{

    if(!activeFilterPeriods.has(r.period)){
      return;
    }

    const d = new Date(r.date);

    if(d < cutoff || d > today){
      return;
    }

    for(let idx=2; idx<=6; idx++){

      const text = r.items[idx];

      if(text && text.trim()){
        pool.push({
          key:`${r.id}-${idx}`,
          text:text
        });
      }
    }
  });

  const result = new Set();

  for(let i=0;i<pool.length;i++){

    for(let j=i+1;j<pool.length;j++){

      if(isMatch(
        pool[i].text,
        pool[j].text
      )){
        result.add(pool[i].key);
        result.add(pool[j].key);
      }
    }
  }

  return result;
}


/* =========================
   記録カード
========================= */

function renderRecordCardHtml(
  record,
  highlightKeys
){

  const chips = record.items.map(
    (text,idx)=>{

      if(!text || !text.trim()){
        return "";
      }

      const duplicate =
        highlightKeys.has(
          `${record.id}-${idx}`
        );

      return `
        <span class="chip${
          duplicate ? " dup" : ""
        }">
          ${escapeHtml(text)}
          ${
            duplicate
            ? '<span class="dup-badge">重複</span>'
            : ""
          }
        </span>
      `;
    }
  ).join("");

  return `
    <div class="record-card">

      <div class="record-head">

        <div class="record-date">
          ${formatDateJP(record.date)}
        </div>

        <div style="
          display:flex;
          align-items:center;
          gap:8px;
        ">

          <span class="period-tag ${record.period}">
            ${record.period}
          </span>

          <button
            type="button"
            class="edit-btn"
            data-id="${record.id}"
          >
            編集
          </button>

          <button
            type="button"
            class="del-btn"
            data-id="${record.id}"
          >
            削除
          </button>

        </div>

      </div>

      <div class="item-chips">
        ${chips}
      </div>

      ${
        record.comment &&
        record.comment.trim()
        ? `
          <div class="record-comment">
            💬 ${escapeHtml(record.comment)}
          </div>
        `
        : ""
      }

    </div>
  `;
}


/* =========================
   一覧表示
========================= */

const PERIOD_ORDER = {
  "朝":0,
  "昼":1,
  "晩":2
};

function renderList(){

  if(records.length === 0){

    recordListEl.innerHTML =
      '<div class="empty-msg">まだ記録がありません</div>';

    return;
  }

  if(activeFilterPeriods.size === 0){

    recordListEl.innerHTML =
      '<div class="empty-msg">上の「朝・昼・晩」から見たい時間帯を選んでください</div>';

    return;
  }

  const today = new Date(todayStr());

  const cutoff = new Date(today);
  cutoff.setDate(
    cutoff.getDate() - 29
  );

  const filteredRecords =
    records.filter(r=>
      activeFilterPeriods.has(r.period)
    );

  const allDates = [
    ...new Set(
      filteredRecords.map(r=>r.date)
    )
  ].sort((a,b)=>
    b.localeCompare(a)
  );

  const displayedDates =
    showAll
    ? allDates
    : allDates.filter(date=>{
        const d = new Date(date);
        return d >= cutoff && d <= today;
      });

  const hasMore =
    !showAll &&
    allDates.some(date=>{
      const d = new Date(date);
      return d < cutoff;
    });

  const highlightKeys =
    computeHighlightKeys();

  let html = "";

  if(displayedDates.length === 0){

    html +=
      '<div class="empty-msg">選んだ時間帯の記録がありません</div>';

  }else{

    displayedDates.forEach(date=>{

      const dayRecords =
        filteredRecords
          .filter(r=>r.date === date)
          .sort(
            (a,b)=>
              PERIOD_ORDER[a.period] -
              PERIOD_ORDER[b.period]
          );

      html += `
        <div class="day-block">
          ${
            dayRecords
              .map(r=>
                renderRecordCardHtml(
                  r,
                  highlightKeys
                )
              )
              .join("")
          }
        </div>
      `;
    });
  }

  if(hasMore){

    html += `
      <button
        type="button"
        class="more-btn"
        id="showAllBtn"
      >
        ＋もっと見る（全部表示）
      </button>
    `;
  }

  recordListEl.innerHTML = html;


  /* 削除ボタン */

  recordListEl
    .querySelectorAll(".del-btn")
    .forEach(btn=>{

      btn.addEventListener("click",()=>{

        openConfirmModal(
          "record",
          Number(btn.dataset.id)
        );

      });

    });


  /* 編集ボタン */

  recordListEl
    .querySelectorAll(".edit-btn")
    .forEach(btn=>{

      btn.addEventListener("click",()=>{

        const id =
          Number(btn.dataset.id);

        const record =
          records.find(r=>r.id === id);

        if(record){
          startEdit(record);
        }

      });

    });


  /* もっと見る */

  const showAllBtn =
    document.getElementById("showAllBtn");

  if(showAllBtn){

    showAllBtn.addEventListener(
      "click",
      ()=>{
        showAll = true;
        renderList();
      }
    );

  }
}


/* =========================
   編集
========================= */

function startEdit(record){

  editingId = record.id;

  dateInput.value = record.date;

  document
    .querySelectorAll(".period-btn")
    .forEach(b=>
      b.classList.remove("active")
    );

  const periodBtn =
    document.querySelector(
      `.period-btn[data-period="${record.period}"]`
    );

  if(periodBtn){
    periodBtn.classList.add("active");
  }

  selectedPeriod = record.period;

  toggleGohan.classList.toggle(
    "active",
    record.items[0] === "ごはん"
  );

  toggleMiso.classList.toggle(
    "active",
    record.items[1] === "みそ汁"
  );

  for(let i=2;i<=6;i++){

    document.getElementById(
      "item"+i
    ).value =
      record.items[i] || "";
  }

  document.getElementById(
    "comment"
  ).value =
    record.comment || "";

  saveBtn.textContent =
    "✔ 変更を保存";

  cancelEditBtn.classList.remove(
    "hidden"
  );

  errorMsg.textContent = "";

  document
    .getElementById("inputCard")
    .scrollIntoView({
      behavior:"smooth",
      block:"start"
    });
}

function endEdit(){

  editingId = null;

  saveBtn.textContent =
    "✔ 記録する";

  cancelEditBtn.classList.add(
    "hidden"
  );
}

function resetInputForm(){

  dateInput.value = todayStr();

  document
    .querySelectorAll(".period-btn")
    .forEach(b=>
      b.classList.remove("active")
    );

  selectedPeriod = null;

  toggleGohan.classList.remove("active");
  toggleMiso.classList.remove("active");

  for(let i=2;i<=6;i++){

    document.getElementById(
      "item"+i
    ).value = "";
  }

  document.getElementById(
    "comment"
  ).value = "";
}

cancelEditBtn.addEventListener(
  "click",
  ()=>{
    endEdit();
    resetInputForm();
    errorMsg.textContent = "";
  }
);


/* =========================
   記録する
========================= */

saveBtn.addEventListener(
  "click",
  ()=>{

    errorMsg.textContent = "";

    if(!dateInput.value){

      errorMsg.textContent =
        "日付を選んでください";

      return;
    }

    if(!selectedPeriod){

      errorMsg.textContent =
        "「朝」「昼」「晩」を選んでください";

      return;
    }

    const items = [

      toggleGohan.classList.contains("active")
        ? "ごはん"
        : "",

      toggleMiso.classList.contains("active")
        ? "みそ汁"
        : "",

      document.getElementById("item2").value.trim(),
      document.getElementById("item3").value.trim(),
      document.getElementById("item4").value.trim(),
      document.getElementById("item5").value.trim(),
      document.getElementById("item6").value.trim()

    ];

    const comment =
      document
        .getElementById("comment")
        .value
        .trim();

    if(items.every(t=>!t)){

      errorMsg.textContent =
        "「ごはん」「みそ汁」かおかずを1つ以上入力してください";

      return;
    }

    const record = {
      id:
        editingId !== null
        ? editingId
        : Date.now(),

      date:dateInput.value,

      period:selectedPeriod,

      items:items,

      comment:comment
    };


    if(editingId !== null){

      const index =
        records.findIndex(
          r=>r.id === editingId
        );

      if(index === -1){

        errorMsg.textContent =
          "編集対象の記録が見つかりませんでした";

        return;
      }

      records[index] = record;

    }else{

      records.push(record);

    }


    saveBtn.disabled = true;

    saveBtn.textContent =
      "保存中…";


    const ok =
      persistRecords();


    saveBtn.disabled = false;


    if(!ok){

      errorMsg.textContent =
        "保存できませんでした。もう一度お試しください";

      return;
    }


    renderList();

    const wasEditing =
      editingId !== null;

    endEdit();

    resetInputForm();

    playBeep();

    showToast(
      wasEditing
      ? "✔ 変更しました！"
      : "✔ 記録しました！"
    );

  }
);


/* =========================
   削除確認
========================= */

function openConfirmModal(
  action,
  id=null
){

  pendingAction = action;
  pendingDeleteId = id;

  modalText.textContent =
    action === "clearAll"
    ? "すべての記録を消去しますか？（元に戻せません）"
    : "この記録を削除しますか？";

  deleteModal.classList.remove(
    "hidden"
  );
}

modalCancelBtn.addEventListener(
  "click",
  ()=>{
    pendingAction = null;
    pendingDeleteId = null;

    deleteModal.classList.add(
      "hidden"
    );
  }
);

modalDeleteBtn.addEventListener(
  "click",
  ()=>{

    if(pendingAction === "clearAll"){

      records = [];

      endEdit();
      resetInputForm();

    }else if(
      pendingAction === "record" &&
      pendingDeleteId !== null
    ){

      const id =
        pendingDeleteId;

      records =
        records.filter(
          r=>r.id !== id
        );

      if(editingId === id){

        endEdit();
        resetInputForm();

      }
    }

    pendingAction = null;
    pendingDeleteId = null;

    deleteModal.classList.add(
      "hidden"
    );

    persistRecords();

    renderList();

  }
);


/* =========================
   全削除
========================= */

document
  .getElementById("clearAllBtn")
  .addEventListener(
    "click",
    ()=>{
      openConfirmModal(
        "clearAll"
      );
    }
  );


/* =========================
   起動
========================= */

loadRecords();
