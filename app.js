(async function initializeSealSystem(){

const cacheName =
localStorage.getItem(
"userName"
);

const cacheEmail =
localStorage.getItem(
"userEmail"
);

if(cacheName && cacheEmail){

const nameEl =
document.getElementById(
"sidebarUserName"
);

const emailEl =
document.getElementById(
"sidebarUserEmail"
);

if(nameEl)
nameEl.textContent = cacheName;

if(emailEl)
emailEl.textContent = cacheEmail;


}

const { initializeApp } =
await import(
"https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js"
);

const {
getFirestore,
collection,
addDoc,
getDocs,
getDoc,
setDoc,
updateDoc,
deleteDoc,
doc,
query,
where,
orderBy,
limit,
startAfter,
Timestamp,
writeBatch,
deleteField
} = await import(
"https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js"
);

const {
getAuth,
GoogleAuthProvider,
signInWithPopup,
signOut,
onAuthStateChanged
} = await import(
"https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js"
);

const firebaseConfig = {

apiKey: "AIzaSyCzvPwTbxc_Lg7peKRgP0zUrlmI6kkE0b4",
authDomain: "seal-management-68465.firebaseapp.com",
projectId: "seal-management-68465",
storageBucket: "seal-management-68465.firebasestorage.app",
messagingSenderId: "933578260928",
appId: "1:933578260928:web:4c5f41252fd786e1bf0825",
measurementId: "G-7RKPNF7BK9"

};

const app = initializeApp(firebaseConfig, "seal-management");
const db = getFirestore(app);

const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let currentRole = "";
let currentIsSystemAdmin = false;

function normalizeRole(role){
return String(role || "").trim().toLowerCase();
}

function normalizeEmail(email){
return String(email || "").trim().toLowerCase();
}

function permissionRoleLabel(role){
const normalized = normalizeRole(role);
if(normalized === "admin") return "系統管理員";
if(normalized === "viewer") return "檢視者";
return "一般使用者";
}

function permissionRoleDescription(role){
const normalized = normalizeRole(role);
if(normalized === "admin") return "可管理借用作業、系統設定、人員與權限。";
if(normalized === "viewer") return "僅可瀏覽待借用管理與借用紀錄。";
return "可辦理印鑑借用與歸還。";
}

function enabledSealAdminCount(){
return userList.filter(user=>normalizeRole(user.role) === "admin" && user.enabled !== false).length;
}

function isLastEnabledSealAdmin(user){
return normalizeRole(user?.role) === "admin" && user?.enabled !== false && enabledSealAdminCount() <= 1;
}

function isAdminRole(){
return normalizeRole(currentRole) === "admin";
}

function isViewerRole(){
return normalizeRole(currentRole) === "viewer";
}

function blockViewerAction(){

if(!isViewerRole()) return false;

alert("Viewer 僅能瀏覽待借用管理與借用紀錄");
return true;

}

function applyRoleAccess(){

const isViewer = isViewerRole();

document.body.classList.toggle(
"viewer-mode",
isViewer
);

document
.querySelectorAll(".menu-item")
.forEach(item=>{
item.style.display = "";
});

const memberMenu = document.getElementById("memberMenu");
if(memberMenu){
memberMenu.style.display = currentIsSystemAdmin ? "" : "none";
}

const exportButton =
document.querySelector('[onclick="exportExcel()"]');

const addPendingButton =
document.getElementById("addPendingButton");

const systemMenuTitle =
document.getElementById("systemMenuTitle");

if(exportButton){
exportButton.style.display = "";
}

if(addPendingButton){
addPendingButton.style.display = "";
}

if(systemMenuTitle){
systemMenuTitle.style.display = "";
}

if(!isViewer) return;

document
.querySelectorAll(".menu-item")
.forEach(item=>{
const action =
item.getAttribute("onclick") || "";

item.style.display =
action.includes("pendingPage") ||
action.includes("historyPage")
? ""
: "none";
});

if(exportButton){
exportButton.style.display = "none";
}

if(addPendingButton){
addPendingButton.style.display = "none";
}

if(systemMenuTitle){
systemMenuTitle.style.display = "none";
}

document
.querySelectorAll(
".record-action-column,.pending-action-column"
)
.forEach(el=>el.style.display = "none");

}
let currentUserEmail = "";

let currentUser = "系統使用者";
let isAdmin = true;

let records = [];
let sealList = [];
let departmentList = [];
let pendingRecords = [];
let userList = [];
let memberList = [];
let memberAccountList = [];
let legacyUserList = [];
let sharedPeopleLoaded = false;
let memberEditorMode = "view";
let editingSharedMemberId = null;
let pendingMemberImport = null;
let memberImportMode = "partial";
let currentPendingIndex = null;
let pendingTransferDraft = null;
let borrowEntryDraft = null;
let selectedBorrowSeal = "";
let selectedBorrowRecordId = null;
let borrowPanelMode = "new";
let concurrentBorrowMode = false;
let editingPendingId = null;

let loginLogs = [];
let loginLastDoc = null;
let loginHasMore = false;
let loginLoading = false;

let loginCurrentPage = 1;
let loginPageSize = 20;

let auditLogs = [];
let auditLastDoc = null;
let auditHasMore = false;
let auditLoading = false;
let auditCurrentPage = 1;
let auditPageSize = 25;

const LOG_BATCH_SIZE = 100;
const HISTORY_BATCH_SIZE = 100;
let historyRecords = [];
let historyLastDoc = null;
let historyHasMore = false;
let historyLoading = false;
let historyLoaded = false;

const auditActionLabels = {
borrow:"借用",
return:"歸還",
update:"修改",
delete:"刪除",
create:"新增",
permission:"權限異動"
};

const auditCategoryLabels = {
sealRecord:"借用紀錄",
pendingRecord:"待借用案件",
seal:"印鑑",
department:"部門",
user:"使用者權限"
};

const systemRoleLabels = {
admin:"系統管理員",
manager:"印鑑管理員",
user:"一般使用者",
viewer:"檢視者"
};

function getSystemRoleLabel(role){
return systemRoleLabels[String(role || "").toLowerCase()] || role || "未設定";
}

function renderCompactPagination(areaId,currentPage,totalPages,onChange){
const area = document.getElementById(areaId);
if(!area) return;
area.innerHTML = "";
if(totalPages <= 1) return;

const pages = new Set([1,totalPages,currentPage-1,currentPage,currentPage+1]);
let previous = 0;
[...pages].filter(page=>page >= 1 && page <= totalPages).sort((a,b)=>a-b).forEach(page=>{
if(previous && page - previous > 1){
const ellipsis = document.createElement("span");
ellipsis.className = "pagination-ellipsis";
ellipsis.textContent = "…";
area.appendChild(ellipsis);
}
const button = document.createElement("button");
button.type = "button";
button.className = `pagination-button${page === currentPage ? " active" : ""}`;
button.textContent = page;
button.setAttribute("aria-label",`第 ${page} 頁`);
button.onclick = ()=>onChange(page);
area.appendChild(button);
previous = page;
});
}

function compactAuditData(data){

if(!data) return null;

const result = {};

Object.entries(data).forEach(([key,value])=>{

if(key === "id") return;

if(
value === null ||
["string","number","boolean"].includes(typeof value)
){
result[key] = value;
}

});

return result;

}

async function writeAuditLog({
action,
category,
targetId = "",
targetLabel = "",
before = null,
after = null
}){

try{

await addDoc(
collection(db,"auditLogs"),
{
actorName:currentUser || "系統使用者",
actorEmail:normalizeEmail(currentUserEmail),
actorRole:currentRole || "",
action,
category,
targetId,
targetLabel,
before:compactAuditData(before),
after:compactAuditData(after),
createdAt:new Date()
}
);

}catch(error){

console.error("操作紀錄寫入失敗",error);

}

}

function escapeAuditText(value){

return String(value ?? "")
.replaceAll("&","&amp;")
.replaceAll("<","&lt;")
.replaceAll(">","&gt;")
.replaceAll('"',"&quot;")
.replaceAll("'","&#039;");

}

function getAuditSummary(log){

const source =
log.after || log.before || {};

const labels = {
seal:"印鑑",
borrower:"借用人",
department:"部門",
projectNo:"計畫編號",
formNo:"表單編號",
purpose:"用途",
email:"Email",
departmentName:"部門名稱",
employeeName:"員工姓名",
role:"角色",
enabled:"啟用狀態",
status:"狀態",
name:"名稱",
sortOrder:"排序",
returnTime:"歸還時間"
};

const categoryFieldOrders = {
sealRecord:[
"seal",
"borrower",
"department",
"projectNo",
"formNo",
"purpose",
"status",
"returnTime"
],
pendingRecord:[
"borrower",
"department",
"projectNo",
"formNo",
"purpose",
"status"
],
user:[
"email",
"departmentName",
"employeeName",
"role",
"enabled",
"name"
],
seal:[
"name",
"sortOrder",
"status"
],
department:[
"name",
"sortOrder",
"status"
]
};

const fallbackOrder = [
"seal",
"borrower",
"department",
"projectNo",
"formNo",
"purpose",
"email",
"departmentName",
"employeeName",
"role",
"enabled",
"status",
"name",
"sortOrder",
"returnTime"
];

const primaryOrder =
categoryFieldOrders[log.category] || fallbackOrder;

const extraKeys =
Object.keys(source)
.filter(key=>labels[key] && !primaryOrder.includes(key))
.sort((a,b)=>labels[a].localeCompare(labels[b],"zh-Hant"));

const orderedKeys = [
...primaryOrder,
...extraKeys
];

const parts = orderedKeys
.filter(key => Object.prototype.hasOwnProperty.call(source,key))
.map(key=>{

const value = source[key];

return `${labels[key]}：${
value === true ? "是" :
value === false ? "否" :
value ?? "-"
}`;

});

return parts.join("；") || "-";

}

function buildAuditLogQuery(){

const constraints = [];
const startDate = document.getElementById("auditDateStart")?.value || "";
const endDate = document.getElementById("auditDateEnd")?.value || "";

if(startDate){
constraints.push(where("createdAt",">=",Timestamp.fromDate(new Date(`${startDate}T00:00:00`))));
}

if(endDate){
const exclusiveEnd = new Date(`${endDate}T00:00:00`);
exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
constraints.push(where("createdAt","<",Timestamp.fromDate(exclusiveEnd)));
}

constraints.push(orderBy("createdAt","desc"));
if(auditLastDoc) constraints.push(startAfter(auditLastDoc));
constraints.push(limit(LOG_BATCH_SIZE));

return query(collection(db,"auditLogs"),...constraints);

}

async function loadAuditLogs(reset = true){

const table =
document.getElementById("auditLogTable");

if(!isAdminRole()){

if(auditLoading) return;

if(reset){
auditLogs = [];
auditLastDoc = null;
auditHasMore = false;
auditCurrentPage = 1;
}

if(table && reset){
table.innerHTML = `
<tr>
<td colspan="7">
目前角色無法讀取操作紀錄（角色：${escapeAuditText(currentRole || "未設定")}）
</td>
</tr>
`;
}

return;

}

if(reset){
auditLogs = [];
auditLastDoc = null;
auditHasMore = false;
auditCurrentPage = 1;
}

if(table && reset){
table.innerHTML = `
<tr>
<td colspan="7">操作紀錄載入中...</td>
</tr>
`;
}

try{

auditLoading = true;
const snapshot = await getDocs(buildAuditLogQuery());

snapshot.forEach(docSnap=>{
auditLogs.push({
id:docSnap.id,
...docSnap.data()
});
});

auditLastDoc = snapshot.docs[snapshot.docs.length - 1] || auditLastDoc;
auditHasMore = snapshot.size === LOG_BATCH_SIZE;

auditLogs.sort((a,b)=>{

const timeDiff =
getRecordTime(b.createdAt) -
getRecordTime(a.createdAt);

if(timeDiff !== 0) return timeDiff;

return String(b.id || "").localeCompare(String(a.id || ""));

});

renderAuditLogs();

}catch(error){

console.error("讀取操作紀錄失敗",error);

if(table){
table.innerHTML = `
<tr>
<td colspan="7">
操作紀錄讀取失敗：${escapeAuditText(error.message || "未知錯誤")}
</td>
</tr>
`;
}

}finally{
auditLoading = false;
renderAuditLoadMore();
}

}

async function loadMoreAuditLogs(){
await loadAuditLogs(false);
}

function renderAuditLoadMore(){
const button = document.getElementById("auditLoadMoreButton");
if(!button) return;
button.hidden = !auditHasMore;
button.disabled = auditLoading;
button.textContent = auditLoading ? "載入中..." : "再載入 100 筆";
}

async function openAuditLogPage(el){

if(!isAdminRole()){
alert(
`目前帳號角色為「${currentRole || "未設定"}」，只有 Admin 可以查看操作紀錄`
);
return;
}

showPage("auditLogPage",el);
await loadAuditLogs();

}

function getFilteredAuditLogs(){

const keyword =
(document.getElementById("auditSearch")?.value || "")
.trim()
.toLowerCase();

const action =
document.getElementById("auditActionFilter")?.value || "";

const startDate =
document.getElementById("auditDateStart")?.value || "";

const endDate =
document.getElementById("auditDateEnd")?.value || "";

return auditLogs.filter(log=>{

const keywordMatch =
!keyword ||
[
log.actorName,
log.actorEmail,
log.targetLabel,
getAuditSummary(log)
]
.some(value=>
String(value || "").toLowerCase().includes(keyword)
);

const actionMatch =
!action || log.action === action;

const dateMatch =
matchesDateRange(
log.createdAt,
startDate,
endDate
);

return keywordMatch && actionMatch && dateMatch;

});

}

function renderAuditLogs(){

const table =
document.getElementById("auditLogTable");

if(!table) return;

const filtered = getFilteredAuditLogs();

document.getElementById("auditCount").textContent =
`(${filtered.length}筆)`;

const totalPages =
Math.ceil(filtered.length / auditPageSize);

if(auditCurrentPage > totalPages){
auditCurrentPage = 1;
}

const start =
(auditCurrentPage - 1) * auditPageSize;

const pageRows =
filtered.slice(start,start + auditPageSize);

if(pageRows.length === 0){

table.innerHTML = `
<tr>
<td colspan="7">目前沒有符合條件的操作紀錄</td>
</tr>
`;

renderAuditPagination(totalPages);
return;

}

table.innerHTML =
pageRows.map(log=>`
<tr>
<td>${escapeAuditText(formatDate(log.createdAt))}</td>
<td class="identity-cell">
<strong>${escapeAuditText(log.actorName || "-")}</strong>
<small>${escapeAuditText(log.actorEmail || "")}</small>
<span class="role-badge">${escapeAuditText(getSystemRoleLabel(log.actorRole))}</span>
</td>
<td>
<span class="badge badge-blue audit-action-${escapeAuditText(log.action || "other")}">
${escapeAuditText(auditActionLabels[log.action] || log.action || "-")}
</span>
</td>
<td>${escapeAuditText(auditCategoryLabels[log.category] || log.category || "-")}</td>
<td>${escapeAuditText(log.targetLabel || log.targetId || "-")}</td>
<td class="audit-summary-cell">${escapeAuditText(getAuditSummary(log))}</td>
<td><button type="button" class="btn btn-gray btn-sm" onclick="openAuditDetail('${escapeAuditText(log.id)}')"><i data-lucide="eye"></i><span>查看詳情</span></button></td>
</tr>
`).join("");

renderAuditPagination(totalPages);
lucide.createIcons();

}

function renderAuditPagination(totalPages){

renderCompactPagination("auditPagination",auditCurrentPage,totalPages,page=>{
auditCurrentPage = page;
renderAuditLogs();
});

}

function formatAuditDetailValue(value){
if(value === true) return "是";
if(value === false) return "否";
if(value === null || value === undefined || value === "") return "-";
if(typeof value === "object") return JSON.stringify(value,null,2);
return String(value);
}

function renderAuditDataBlock(title,data){
if(!data || !Object.keys(data).length){
return `<section class="audit-data-block"><h3>${title}</h3><div class="audit-no-data">無資料</div></section>`;
}
return `<section class="audit-data-block"><h3>${title}</h3><dl>${Object.entries(data).map(([key,value])=>`<div class="audit-data-row"><dt>${escapeAuditText(key)}</dt><dd>${escapeAuditText(formatAuditDetailValue(value))}</dd></div>`).join("")}</dl></section>`;
}

function openAuditDetail(id){
const log = auditLogs.find(item=>item.id === id);
const overlay = document.getElementById("auditDetailOverlay");
const body = document.getElementById("auditDetailBody");
if(!log || !overlay || !body) return;

document.getElementById("auditDetailCaption").textContent = `${formatDate(log.createdAt)}｜${log.actorName || "未記錄操作者"}`;
body.innerHTML = `
<div class="audit-detail-summary">
<div><span>操作</span><strong>${escapeAuditText(auditActionLabels[log.action] || log.action || "-")}</strong></div>
<div><span>類別</span><strong>${escapeAuditText(auditCategoryLabels[log.category] || log.category || "-")}</strong></div>
<div><span>對象</span><strong>${escapeAuditText(log.targetLabel || log.targetId || "-")}</strong></div>
<div><span>角色</span><strong>${escapeAuditText(getSystemRoleLabel(log.actorRole))}</strong></div>
</div>
<div class="audit-data-grid">${renderAuditDataBlock("異動前",log.before)}${renderAuditDataBlock("異動後",log.after)}</div>`;
overlay.classList.add("open");
overlay.setAttribute("aria-hidden","false");
document.body.classList.add("modal-open");
lucide.createIcons();
}

function closeAuditDetail(){
const overlay = document.getElementById("auditDetailOverlay");
if(!overlay) return;
overlay.classList.remove("open");
overlay.setAttribute("aria-hidden","true");
document.body.classList.remove("modal-open");
}

function changeAuditPageSize(){

auditPageSize =
parseInt(
document.getElementById("auditPageSize").value
);

auditCurrentPage = 1;
renderAuditLogs();

}

function resetAuditFilter(){

document.getElementById("auditSearch").value = "";
document.getElementById("auditActionFilter").value = "";
document.getElementById("auditDateStart").value = "";
document.getElementById("auditDateEnd").value = "";

auditCurrentPage = 1;
loadAuditLogs(true);

}

function buildLoginLogQuery(){

const constraints = [orderBy("loginTime","desc")];
if(loginLastDoc) constraints.push(startAfter(loginLastDoc));
constraints.push(limit(LOG_BATCH_SIZE));

return query(collection(db,"loginLogs"),...constraints);

}

async function loadLoginLogs(reset = true){

if(!isAdminRole() || loginLoading) return;

const table = document.getElementById("loginLogTable");

if(reset){
loginLogs = [];
loginLastDoc = null;
loginHasMore = false;
loginCurrentPage = 1;
}

if(table && reset){
table.innerHTML = '<tr><td colspan="3">登入紀錄載入中...</td></tr>';
}

try{

loginLoading = true;
const snapshot = await getDocs(buildLoginLogQuery());

snapshot.forEach(docSnap=>{
loginLogs.push({id:docSnap.id,...docSnap.data()});
});

loginLastDoc = snapshot.docs[snapshot.docs.length - 1] || loginLastDoc;
loginHasMore = snapshot.size === LOG_BATCH_SIZE;
renderLoginLogs();

}catch(error){

console.error("讀取登入紀錄失敗",error);
if(table){
table.innerHTML = `<tr><td colspan="3">登入紀錄讀取失敗：${escapeHtml(error.message || "未知錯誤")}</td></tr>`;
}

}finally{
loginLoading = false;
renderLoginLoadMore();
}

}

async function loadMoreLoginLogs(){
await loadLoginLogs(false);
}

function renderLoginLoadMore(){
const button = document.getElementById("loginLoadMoreButton");
if(!button) return;
button.hidden = !loginHasMore;
button.disabled = loginLoading;
button.textContent = loginLoading ? "載入中..." : "再載入 100 筆";
}

function renderLoginLogs(){

const table =
document.getElementById(
"loginLogTable"
);

if(!table) return;

const sortedLogs =
getFilteredLoginLogs()
.sort((a,b)=>
getRecordTime(b.loginTime) - getRecordTime(a.loginTime)
);

document.getElementById(
"loginCount"
).innerText =
`(${sortedLogs.length}筆)`;

const totalPages =
Math.ceil(
sortedLogs.length /
loginPageSize
);

const start =
(loginCurrentPage - 1)
* loginPageSize;

const pageLogs =
sortedLogs.slice(
start,
start + loginPageSize
);

if(!pageLogs.length){
table.innerHTML = '<tr><td colspan="3" class="table-empty-cell">目前沒有符合條件的登入紀錄</td></tr>';
renderLoginPagination(totalPages);
return;
}

table.innerHTML = pageLogs.map(log=>{
const email = normalizeEmail(log.email || "");
const member = memberList.find(item=>memberGoogleEmail(item) === email);
const department = memberDepartmentName(member);
const employeeNo = memberEmployeeNo(member);
const primaryName = member?.name || log.name || email || "未記錄";
const identity = [department,primaryName].filter(Boolean).join(" ");
return `
<tr>
<td>${escapeHtml(formatDate(log.loginTime))}</td>
<td class="identity-cell"><strong>${escapeHtml(identity)}</strong><small>${escapeHtml([employeeNo,email].filter(Boolean).join("｜"))}</small></td>
<td><span class="role-badge">${escapeHtml(getSystemRoleLabel(log.role))}</span></td>
</tr>`;
}).join("");

renderLoginPagination(totalPages);
lucide.createIcons();
}

function getFilteredLoginLogs(){
const keyword = (document.getElementById("loginSearch")?.value || "").trim().toLowerCase();
const startDate = document.getElementById("loginDateStart")?.value || "";
const endDate = document.getElementById("loginDateEnd")?.value || "";
return [...loginLogs].filter(log=>{
const email = normalizeEmail(log.email || "");
const member = memberList.find(item=>memberGoogleEmail(item) === email);
const keywordMatch = !keyword || [
log.name,email,log.role,getSystemRoleLabel(log.role),member?.name,memberDepartmentName(member),memberEmployeeNo(member)
].some(value=>String(value || "").toLowerCase().includes(keyword));
return keywordMatch && matchesDateRange(log.loginTime,startDate,endDate);
});
}

function filterLoginLogs(){
loginCurrentPage = 1;
renderLoginLogs();
}

function resetLoginFilter(){
document.getElementById("loginSearch").value = "";
document.getElementById("loginDateStart").value = "";
document.getElementById("loginDateEnd").value = "";
loginCurrentPage = 1;
renderLoginLogs();
}

function changeLoginPageSize(){

loginPageSize =
parseInt(
document.getElementById(
"loginPageSize"
).value
);

loginCurrentPage = 1;

renderLoginLogs();

}

window.changeLoginPageSize =
changeLoginPageSize;

function renderLoginPagination(
totalPages
){

renderCompactPagination("loginPagination",loginCurrentPage,totalPages,page=>{
loginCurrentPage = page;
renderLoginLogs();
});

}

function memberEmployeeNo(member){
return String(member?.employeeNo || member?.empNo || "").trim();
}

function memberDepartmentName(member){
return String(member?.department || member?.departmentName || member?.departmentId || "").trim();
}

function memberAccountFor(memberId){
return memberAccountList.find(account=>(account.memberId || account.id) === memberId);
}

function memberGoogleEmail(member){
const account = memberAccountFor(member?.id);
return normalizeEmail(
account?.email ||
member?.googleEmail ||
member?.googleAccount ||
member?.email ||
member?.gmail ||
""
);
}

function sortSharedPeople(){
memberList.sort((a,b)=>{
const departmentCompare = memberDepartmentName(a)
.localeCompare(memberDepartmentName(b),"zh-Hant");
if(departmentCompare) return departmentCompare;
return memberEmployeeNo(a)
.localeCompare(memberEmployeeNo(b),"zh-Hant",{numeric:true});
});
}

async function loadSharedPeople(force=false){
if(sharedPeopleLoaded && !force) return;

const [memberSnapshot,accountSnapshot] = await Promise.all([
getDocs(collection(db,"members")),
getDocs(collection(db,"memberAccounts"))
]);

memberList = memberSnapshot.docs.map(docSnap=>({id:docSnap.id,...docSnap.data()}));
memberAccountList = accountSnapshot.docs.map(docSnap=>({id:docSnap.id,...docSnap.data()}));
sortSharedPeople();
sharedPeopleLoaded = true;
}

async function loadUsers(force=false){

if(!isAdminRole()) return;

const area = document.getElementById("userListArea");
if(area) area.innerHTML = '<div class="table-empty-cell">權限與共用人員資料載入中...</div>';

try{

await loadSharedPeople(force);
const permissionSnapshot = await getDocs(collection(db,"sealPermissions"));

userList = permissionSnapshot.docs.map(docSnap=>{
const permission = {id:docSnap.id,...docSnap.data()};
const email = normalizeEmail(permission.email || docSnap.id);
const member = memberList.find(item=>
item.id === permission.memberId ||
memberGoogleEmail(item) === email
);

return {
...permission,
id:docSnap.id,
email,
memberId:permission.memberId || member?.id || "",
departmentName:member?.department || member?.departmentName || permission.departmentName || "",
employeeName:member?.name || permission.employeeName || permission.name || "",
employeeNo:member?.employeeNo || member?.empNo || "",
memberActive:member ? member.active !== false : null
};
});

userList.sort((a,b)=>{
const departmentCompare = String(a.departmentName || "").localeCompare(String(b.departmentName || ""),"zh-Hant");
if(departmentCompare) return departmentCompare;
return String(a.employeeNo || "").localeCompare(String(b.employeeNo || ""),"zh-Hant",{numeric:true});
});

renderPermissionMemberOptions();
renderUserList();

}catch(error){
console.error("讀取共用人員與印鑑權限失敗",error);
if(area) area.innerHTML = `<div class="table-empty-cell">權限資料讀取失敗：${escapeHtml(error.message || "未知錯誤")}</div>`;
}

}

function renderPermissionMemberOptions(){
const select = document.getElementById("newUserMember");
if(!select) return;

const assignedEmails = new Set(userList.map(user=>normalizeEmail(user.email)));
const options = memberList
.filter(member=>member.active !== false)
.map(member=>({member,email:memberGoogleEmail(member)}));

select.innerHTML = '<option value="">請選擇共用人員</option>' + options.map(({member,email})=>{
const department = memberDepartmentName(member) || "未設定部門";
const employeeNo = memberEmployeeNo(member);
const assigned = Boolean(email && assignedEmails.has(email));
const unavailableReason = !email ? "（未設定 Google 帳號）" : assigned ? "（目前已有權限，可更新）" : "";
const label = [`${department} ${member.name || "未設定姓名"}`,employeeNo ? `員編 ${employeeNo}` : "",unavailableReason].filter(Boolean).join("｜");
return `<option value="${escapeHtml(member.id)}" data-email="${escapeHtml(email)}" ${!email ? "disabled" : ""}>${escapeHtml(label)}</option>`;
}).join("");
}

function updateNewPermissionRoleHelp(role){
const help = document.getElementById("newUserRoleHelp");
if(help) help.textContent = permissionRoleDescription(role);
}

window.updateNewPermissionRoleHelp = updateNewPermissionRoleHelp;

function populateMemberDepartmentOptions(){
const select = document.getElementById("memberDepartment");
if(!select) return;
const current = select.value;
select.innerHTML = '<option value="">請選擇部門</option>' + departmentList.map(department=>{
const name = department.name || department.departmentName || department.department || "";
return `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
}).join("");
if(current && [...select.options].some(option=>option.value === current)) select.value = current;
}

async function loadMemberManagement(force=false){
if(!currentIsSystemAdmin) return;
const area = document.getElementById("memberTableArea");
if(area) area.innerHTML = '<div class="table-empty-cell">共用人員資料載入中...</div>';
try{
await loadSharedPeople(force);
populateMemberDepartmentOptions();
renderSharedMemberTable();
}catch(error){
console.error("讀取共用人員失敗",error);
if(area) area.innerHTML = `<div class="table-empty-cell">人員資料讀取失敗：${escapeHtml(error.message || "未知錯誤")}</div>`;
}
}

function renderSharedMemberTable(){
const area = document.getElementById("memberTableArea");
const summary = document.getElementById("memberSummary");
if(!area || !summary) return;

const search = normalizeEmail(document.getElementById("memberSearch")?.value || "");
const status = document.getElementById("memberStatusFilter")?.value || "all";
const filtered = memberList.filter(member=>{
const active = member.active !== false;
if(status === "active" && !active) return false;
if(status === "inactive" && active) return false;
if(!search) return true;
return [memberDepartmentName(member),member.name,memberEmployeeNo(member),memberGoogleEmail(member)]
.some(value=>String(value || "").toLowerCase().includes(search));
});

const activeCount = memberList.filter(member=>member.active !== false).length;
const departmentCount = new Set(memberList.map(memberDepartmentName).filter(Boolean)).size;
summary.innerHTML = `
<div class="member-summary-item"><span>主檔人數</span><strong>${memberList.length}</strong></div>
<div class="member-summary-item"><span>啟用</span><strong>${activeCount}</strong></div>
<div class="member-summary-item"><span>停用</span><strong>${memberList.length-activeCount}</strong></div>
<div class="member-summary-item"><span>部門數</span><strong>${departmentCount}</strong></div>`;

if(!filtered.length){
area.innerHTML = '<div class="table-empty-cell">查無符合條件的人員</div>';
return;
}

area.innerHTML = `<div class="table-wrap"><table class="management-table"><thead><tr><th>部門</th><th>姓名</th><th>員工編號</th><th>Google 帳號</th><th>狀態</th><th>操作</th></tr></thead><tbody>${filtered.map(member=>{
const active = member.active !== false;
const email = memberGoogleEmail(member);
return `<tr><td>${escapeHtml(memberDepartmentName(member) || "未設定")}</td><td><b>${escapeHtml(member.name || "")}</b></td><td>${escapeHtml(memberEmployeeNo(member))}</td><td>${email ? escapeHtml(email) : '<span class="muted-text">未設定</span>'}</td><td><span class="status-badge ${active ? 'status-active' : 'status-inactive'}">${active ? '啟用' : '停用'}</span></td><td class="operation-cell"><button class="btn btn-gray btn-sm" type="button" onclick="editSharedMember('${member.id}')">修改</button><button class="btn ${active ? 'btn-gray' : 'btn-primary'} btn-sm btn-inline" type="button" onclick="toggleSharedMember('${member.id}',${active ? 'false' : 'true'})">${active ? '停用' : '啟用'}</button><button class="btn btn-danger-outline btn-sm" type="button" onclick="deleteSharedMember('${member.id}')">刪除</button></td></tr>`;
}).join("")}</tbody></table></div>`;
}

function fillSharedMemberForm(member){
populateMemberDepartmentOptions();
document.getElementById("memberDepartment").value = memberDepartmentName(member);
document.getElementById("memberName").value = member?.name || "";
document.getElementById("memberEmployeeNo").value = memberEmployeeNo(member);
document.getElementById("memberGoogleEmail").value = memberGoogleEmail(member);
document.getElementById("memberStatus").value = String(member?.active !== false);
}

function startNewSharedMember(){
if(!currentIsSystemAdmin) return alert("此功能僅限系統管理員");
memberEditorMode = "new";
editingSharedMemberId = null;
document.getElementById("memberEditorTitle").textContent = "新增人員";
document.getElementById("memberEditorBadge").textContent = "新增模式";
document.getElementById("memberSaveButton").textContent = "新增人員";
fillSharedMemberForm(null);
document.getElementById("memberEditor").classList.remove("hidden");
document.getElementById("memberName").focus();
}

function editSharedMember(id){
if(!currentIsSystemAdmin) return alert("此功能僅限系統管理員");
const member = memberList.find(item=>item.id === id);
if(!member) return alert("找不到這筆人員資料");
memberEditorMode = "edit";
editingSharedMemberId = id;
document.getElementById("memberEditorTitle").textContent = `修改人員：${member.name || ""}`;
document.getElementById("memberEditorBadge").textContent = "編輯模式";
document.getElementById("memberSaveButton").textContent = "儲存變更";
fillSharedMemberForm(member);
const editor = document.getElementById("memberEditor");
editor.classList.remove("hidden");
editor.scrollIntoView({behavior:"smooth",block:"start"});
}

function cancelSharedMemberEdit(){
memberEditorMode = "view";
editingSharedMemberId = null;
document.getElementById("memberEditor")?.classList.add("hidden");
}

async function migrateSealPermissionEmail(memberId,oldEmail,newEmail){
if(!oldEmail || oldEmail === newEmail) return;
const oldRef = doc(db,"sealPermissions",oldEmail);
const oldSnapshot = await getDoc(oldRef);
if(!oldSnapshot.exists()) return;
if(newEmail){
await setDoc(doc(db,"sealPermissions",newEmail),{
...oldSnapshot.data(),email:newEmail,memberId,updatedAt:Timestamp.now(),updatedByEmail:normalizeEmail(currentUserEmail)
},{merge:true});
}
await deleteDoc(oldRef);
}

async function saveSharedMember(){
if(!currentIsSystemAdmin || memberEditorMode === "view") return;
const wasNew = memberEditorMode === "new";
const department = document.getElementById("memberDepartment").value;
const name = document.getElementById("memberName").value.trim();
const employeeNo = document.getElementById("memberEmployeeNo").value.trim();
const email = normalizeEmail(document.getElementById("memberGoogleEmail").value);
const active = document.getElementById("memberStatus").value === "true";
if(!department || !name || !employeeNo) return alert("請完整填寫部門、姓名與員工編號");
if(email && !/^\S+@\S+\.\S+$/.test(email)) return alert("請輸入有效的 Google 帳號");
const duplicateNo = memberList.find(member=>memberEmployeeNo(member) === employeeNo && member.id !== editingSharedMemberId);
if(duplicateNo) return alert(`員工編號 ${employeeNo} 已由 ${duplicateNo.name || "其他人員"} 使用`);
const duplicateEmail = memberList.find(member=>memberGoogleEmail(member) === email && member.id !== editingSharedMemberId);
if(email && duplicateEmail) return alert(`此 Google 帳號已由 ${duplicateEmail.name || "其他人員"} 使用`);

const saveButton = document.getElementById("memberSaveButton");
saveButton.disabled = true;
saveButton.textContent = "儲存中...";
try{
const existing = memberList.find(member=>member.id === editingSharedMemberId);
const oldEmail = memberGoogleEmail(existing);
let memberId = editingSharedMemberId;
const data = {department,name,employeeNo,active,updatedAt:Timestamp.now(),updatedByEmail:normalizeEmail(currentUserEmail)};
if(memberEditorMode === "new"){
data.createdAt = Timestamp.now();
data.createdByEmail = normalizeEmail(currentUserEmail);
memberId = (await addDoc(collection(db,"members"),data)).id;
}else{
await setDoc(doc(db,"members",memberId),{
...data,googleEmail:deleteField(),googleAccount:deleteField(),email:deleteField(),gmail:deleteField()
},{merge:true});
}

const existingAccount = memberAccountFor(memberId);
if(email){
if(existingAccount && existingAccount.id !== memberId) await deleteDoc(doc(db,"memberAccounts",existingAccount.id));
await setDoc(doc(db,"memberAccounts",memberId),{memberId,email,updatedAt:Timestamp.now()},{merge:true});
}else if(existingAccount){
await deleteDoc(doc(db,"memberAccounts",existingAccount.id));
}
await migrateSealPermissionEmail(memberId,oldEmail,email);
await writeAuditLog({action:wasNew ? "create" : "update",category:"member",targetId:memberId,targetLabel:`${department} ${name}`,before:existing || null,after:{...data,email}});
cancelSharedMemberEdit();
sharedPeopleLoaded = false;
await loadMemberManagement(true);
if(isAdminRole()) await loadUsers(true);
alert(wasNew ? "人員已新增" : "人員資料已更新");
}catch(error){
console.error("儲存共用人員失敗",error);
alert(`人員資料儲存失敗：${error.message || "請檢查 Firestore 規則與網路"}`);
}finally{
saveButton.disabled = false;
if(memberEditorMode !== "view") saveButton.textContent = memberEditorMode === "new" ? "新增人員" : "儲存變更";
}
}

async function toggleSharedMember(id,active){
if(!currentIsSystemAdmin) return alert("此功能僅限系統管理員");
const member = memberList.find(item=>item.id === id);
if(!member) return;
if(!active && !confirm(`確定停用 ${member.name || "這位人員"}？\n停用後不會再出現在各系統啟用名單，但歷史資料會保留。`)) return;
await setDoc(doc(db,"members",id),{active,updatedAt:Timestamp.now(),updatedByEmail:normalizeEmail(currentUserEmail)},{merge:true});
sharedPeopleLoaded = false;
await loadMemberManagement(true);
if(isAdminRole()) await loadUsers(true);
}

async function deleteSharedMember(id){
if(!currentIsSystemAdmin) return alert("此功能僅限系統管理員");
const member = memberList.find(item=>item.id === id);
if(!member) return;
if(!confirm(`確定永久刪除 ${memberDepartmentName(member)} ${member.name || "這位人員"}？\n建議離職人員優先使用「停用」，永久刪除不會清除歷史借用資料。`)) return;
if(!confirm("此動作會刪除共用人員主檔、登入帳號及其印鑑系統權限，確定繼續？")) return;
const batch = writeBatch(db);
batch.delete(doc(db,"members",id));
memberAccountList.filter(account=>(account.memberId || account.id) === id).forEach(account=>batch.delete(doc(db,"memberAccounts",account.id)));
const email = memberGoogleEmail(member);
if(email) batch.delete(doc(db,"sealPermissions",email));
await batch.commit();
sharedPeopleLoaded = false;
await loadMemberManagement(true);
if(isAdminRole()) await loadUsers(true);
}

const externalScriptLoads = new Map();

function loadExternalScript(src,isReady){
if(isReady()) return Promise.resolve();
if(externalScriptLoads.has(src)) return externalScriptLoads.get(src);
const promise = new Promise((resolve,reject)=>{
const script = document.createElement("script");
script.src = src;
script.async = true;
script.onload = ()=>isReady() ? resolve() : reject(new Error(`元件載入後仍無法使用：${src}`));
script.onerror = ()=>reject(new Error(`無法載入外部元件：${src}`));
document.head.appendChild(script);
}).catch(error=>{
externalScriptLoads.delete(src);
throw error;
});
externalScriptLoads.set(src,promise);
return promise;
}

function xlsxReady(){
return typeof XLSX !== "undefined" && XLSX?.utils && typeof XLSX.writeFile === "function";
}

async function ensureXlsx(){
await loadExternalScript("https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js",xlsxReady);
}

function memberWorkbook(rows,sheetName="人員名單"){
const workbook = XLSX.utils.book_new();
const sheet = XLSX.utils.json_to_sheet(rows,{header:["部門","姓名","員工編號","Google帳號","狀態"]});
sheet["!cols"] = [{wch:16},{wch:14},{wch:14},{wch:28},{wch:10}];
XLSX.utils.book_append_sheet(workbook,sheet,sheetName);
return workbook;
}

async function downloadMemberTemplate(){
try{await ensureXlsx();}catch(error){console.error(error);return alert("Excel 元件載入失敗，請確認網路後再試");}
XLSX.writeFile(memberWorkbook([{"部門":"行政部","姓名":"王小明","員工編號":"7901","Google帳號":"example@gmail.com","狀態":"啟用"}],"匯入範本"),"人員匯入標準範本.xlsx");
}

async function exportSharedMembers(){
try{await ensureXlsx();}catch(error){console.error(error);return alert("Excel 元件載入失敗，請確認網路後再試");}
const rows = memberList.map(member=>({"部門":memberDepartmentName(member),"姓名":member.name || "","員工編號":memberEmployeeNo(member),"Google帳號":memberGoogleEmail(member),"狀態":member.active === false ? "停用" : "啟用"}));
XLSX.writeFile(memberWorkbook(rows),"共用人員名單.xlsx");
}

function chooseMemberImport(){
if(!currentIsSystemAdmin) return alert("此功能僅限系統管理員");
pendingMemberImport = null;
document.querySelectorAll('input[name="memberImportMode"]').forEach(input=>input.checked = input.value === "partial");
document.getElementById("memberImportModeMask").style.display = "flex";
}

function closeMemberImportMode(){document.getElementById("memberImportModeMask").style.display = "none";}
function continueMemberImport(){
memberImportMode = document.querySelector('input[name="memberImportMode"]:checked')?.value === "full" ? "full" : "partial";
closeMemberImportMode();
document.getElementById("memberImportInput").click();
}
function closeMemberImportReview(){document.getElementById("memberImportReviewMask").style.display = "none";pendingMemberImport = null;}
function setMissingMemberSelection(checked){document.querySelectorAll(".missing-member-import-check").forEach(input=>input.checked = checked);updateMemberImportConfirmLabel();}
function selectedMissingMemberIds(){return [...document.querySelectorAll(".missing-member-import-check:checked")].map(input=>input.value);}
function updateMemberImportConfirmLabel(){const count=selectedMissingMemberIds().length;const button=document.getElementById("confirmMemberImportButton");if(button) button.textContent=count?`匯入並停用 ${count} 人`:"匯入名單";}

function memberCell(row,names){
const keys = Object.keys(row);
for(const name of names){
const key = keys.find(item=>String(item).replace(/^\uFEFF/,"").trim() === name);
if(key !== undefined) return row[key];
}
return "";
}

function buildMemberImportReview(rows,mode){
const googleHeaders = ["Google帳號","Google 帳號","Google Email","Email","電子郵件"];
const hasGoogleColumn = Object.keys(rows[0] || {}).some(key=>googleHeaders.includes(String(key).replace(/^\uFEFF/,"").trim()));
const validDepartments = new Set(departmentList.map(item=>String(item.name || item.departmentName || item.department || "").trim()).filter(Boolean));
const existingByNo = new Map(memberList.map(member=>[memberEmployeeNo(member),member]).filter(entry=>entry[0]));
const seen = new Set(), uploadedEmployeeNos = new Set(), seenEmails = new Set(), errors = [], items = [];
rows.forEach((row,index)=>{
const line = index + 2;
const department = String(memberCell(row,["部門"])).trim();
const name = String(memberCell(row,["姓名"])).trim();
const employeeNo = String(memberCell(row,["員工編號","員編"])).trim();
const googleEmail = normalizeEmail(memberCell(row,googleHeaders));
const status = String(memberCell(row,["狀態"])).trim();
if(employeeNo) uploadedEmployeeNos.add(employeeNo);
if(!department || !name || !employeeNo){errors.push(`第 ${line} 列：部門、姓名與員工編號為必填`);return;}
if(!validDepartments.has(department)){errors.push(`第 ${line} 列：找不到部門「${department}」`);return;}
if(seen.has(employeeNo)){errors.push(`第 ${line} 列：員工編號 ${employeeNo} 在檔案中重複`);return;}
seen.add(employeeNo);
if(googleEmail && !/^\S+@\S+\.\S+$/.test(googleEmail)){errors.push(`第 ${line} 列：Google 帳號格式不正確`);return;}
if(googleEmail && seenEmails.has(googleEmail)){errors.push(`第 ${line} 列：Google 帳號 ${googleEmail} 在檔案中重複`);return;}
if(googleEmail) seenEmails.add(googleEmail);
const existing = existingByNo.get(employeeNo) || null;
const owner = memberList.find(member=>memberGoogleEmail(member) === googleEmail && member.id !== existing?.id);
if(googleEmail && owner){errors.push(`第 ${line} 列：Google 帳號已由 ${owner.name || "其他人員"} 使用`);return;}
const active = !["停用","否","false","0","no"].includes(status.toLowerCase());
items.push({existing,googleEmail,hasGoogleColumn,data:{department,name,employeeNo,active}});
});
const addCount = items.filter(item=>!item.existing).length;
const missing = mode === "full" ? memberList.filter(member=>member.active !== false && !uploadedEmployeeNos.has(memberEmployeeNo(member))) : [];
return {mode,items,errors,missing,addCount,updateCount:items.length-addCount,hasGoogleColumn};
}

function renderMemberImportReview(review){
document.getElementById("memberImportReviewCaption").textContent = `${review.fileName}・${review.mode === "full" ? "完整名單核對" : "部分名單更新"}`;
const summary = `<div class="member-import-summary"><span>可匯入<b>${review.items.length}</b></span><span>新增<b>${review.addCount}</b></span><span>更新<b>${review.updateCount}</b></span><span>錯誤<b>${review.errors.length}</b></span></div>`;
const errors = review.errors.length ? `<details class="member-import-errors"><summary>${review.errors.length} 筆資料有誤，將略過</summary><ul>${review.errors.map(error=>`<li>${escapeHtml(error)}</li>`).join("")}</ul></details>` : "";
let missing = "";
if(review.mode === "full"){
missing = review.missing.length ? `<section class="member-import-missing"><div class="member-import-missing-head"><div><h3>本次名單未出現的啟用人員</h3><p>可能為離職、調職或名單遺漏。系統不會自動停用，請確認後自行勾選。</p></div><div class="member-import-missing-actions"><button type="button" class="btn btn-gray" onclick="setMissingMemberSelection(true)">全選</button><button type="button" class="btn btn-gray" onclick="setMissingMemberSelection(false)">取消全選</button></div></div><div class="member-import-missing-table"><table><thead><tr><th>停用</th><th>部門</th><th>姓名</th><th>員工編號</th><th>Google 帳號</th></tr></thead><tbody>${review.missing.map(member=>`<tr><td><input class="missing-member-import-check" type="checkbox" value="${escapeHtml(member.id)}" onchange="updateMemberImportConfirmLabel()" aria-label="停用 ${escapeHtml(member.name || "此人員")}"></td><td>${escapeHtml(memberDepartmentName(member))}</td><td><b>${escapeHtml(member.name || "")}</b></td><td>${escapeHtml(memberEmployeeNo(member))}</td><td>${escapeHtml(memberGoogleEmail(member) || "未設定")}</td></tr>`).join("")}</tbody></table></div></section>` : '<div class="member-import-no-missing">完整名單核對完成，沒有發現本次缺少的啟用人員。</div>';
}
document.getElementById("memberImportReviewBody").innerHTML = summary + errors + missing;
document.getElementById("memberImportReviewMask").style.display = "flex";
updateMemberImportConfirmLabel();
}

async function importSharedMembers(file){
if(!file) return;
try{await ensureXlsx();}catch(error){console.error(error);return alert("Excel 元件載入失敗，請確認網路後再試");}
const result = document.getElementById("memberImportResult");
result.className = "member-import-result";
result.textContent = `正在讀取 ${file.name}...`;
try{
const workbook = XLSX.read(await file.arrayBuffer(),{type:"array"});
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet,{defval:"",raw:false});
if(!rows.length) throw new Error("檔案內沒有可匯入的資料");
const review = buildMemberImportReview(rows,memberImportMode);
if(!review.items.length) throw new Error(`沒有可匯入的資料${review.errors.length ? `，共 ${review.errors.length} 筆錯誤` : ""}`);
pendingMemberImport = {...review,fileName:file.name};
result.textContent = `已讀取 ${review.items.length} 筆，請在差異核對視窗確認。`;
renderMemberImportReview(pendingMemberImport);
}catch(error){
console.error("匯入人員 Excel 失敗",error);
result.className = "member-import-result error";
result.textContent = `匯入失敗：${error.message || error}`;
}
}

async function confirmSharedMemberImport(){
const review = pendingMemberImport;
if(!review || !currentIsSystemAdmin) return;
const disableIds = review.mode === "full" ? selectedMissingMemberIds() : [];
const button = document.getElementById("confirmMemberImportButton");
button.disabled = true;
button.textContent = "處理中...";
try{
for(const item of review.items){
let memberId = item.existing?.id || "";
const oldEmail = memberGoogleEmail(item.existing);
const data = {...item.data,updatedAt:Timestamp.now(),updatedByEmail:normalizeEmail(currentUserEmail)};
if(memberId){
await setDoc(doc(db,"members",memberId),data,{merge:true});
}else{
data.createdAt = Timestamp.now();
data.createdByEmail = normalizeEmail(currentUserEmail);
memberId = (await addDoc(collection(db,"members"),data)).id;
}
if(item.hasGoogleColumn){
await setDoc(doc(db,"members",memberId),{googleEmail:deleteField(),googleAccount:deleteField(),email:deleteField(),gmail:deleteField()},{merge:true});
const oldAccount = memberAccountFor(memberId);
if(item.googleEmail){
if(oldAccount && oldAccount.id !== memberId) await deleteDoc(doc(db,"memberAccounts",oldAccount.id));
await setDoc(doc(db,"memberAccounts",memberId),{memberId,email:item.googleEmail,updatedAt:Timestamp.now()},{merge:true});
}else if(oldAccount){
await deleteDoc(doc(db,"memberAccounts",oldAccount.id));
}
await migrateSealPermissionEmail(memberId,oldEmail,item.googleEmail);
}
}
for(const memberId of disableIds){
await setDoc(doc(db,"members",memberId),{active:false,updatedAt:Timestamp.now(),deactivatedAt:Timestamp.now(),deactivatedByEmail:normalizeEmail(currentUserEmail),deactivationReason:"full-roster-import-missing"},{merge:true});
}
const message = `匯入完成：新增 ${review.addCount} 筆、更新 ${review.updateCount} 筆${disableIds.length ? `、停用 ${disableIds.length} 人` : ""}${review.errors.length ? `，略過 ${review.errors.length} 筆錯誤` : ""}`;
closeMemberImportReview();
sharedPeopleLoaded = false;
await loadMemberManagement(true);
if(isAdminRole()) await loadUsers(true);
const result = document.getElementById("memberImportResult");
result.className = "member-import-result success";
result.textContent = message;
}catch(error){
console.error("寫入人員匯入資料失敗",error);
document.getElementById("memberImportResult").className = "member-import-result error";
document.getElementById("memberImportResult").textContent = `寫入失敗：${error.message || error}`;
}finally{
button.disabled = false;
updateMemberImportConfirmLabel();
}
}

Object.assign(window,{loadMemberManagement,renderSharedMemberTable,startNewSharedMember,editSharedMember,cancelSharedMemberEdit,saveSharedMember,toggleSharedMember,deleteSharedMember,downloadMemberTemplate,exportSharedMembers,chooseMemberImport,closeMemberImportMode,continueMemberImport,closeMemberImportReview,setMissingMemberSelection,updateMemberImportConfirmLabel,importSharedMembers,confirmSharedMemberImport});

async function loadPendingRecords(){

const querySnapshot =
await getDocs(collection(db,"pendingRecords"));

pendingRecords = [];

querySnapshot.forEach((docSnap)=>{

pendingRecords.push({

id:docSnap.id,
...docSnap.data()

});

});

renderPendingTable();
if(typeof loadCalendarEvents === 'function') loadCalendarEvents();

}

let currentPage = 1;
let pageSize = 10;

function showPage(pageId,el){

const adminPages = [
"permissionPage",
"loginLogPage",
"auditLogPage"
];

if(pageId === "memberPage" && !currentIsSystemAdmin){
pageId = "borrowPage";
el = document.querySelector('[onclick*="borrowPage"]');
}

if(
!isAdminRole() &&
adminPages.includes(pageId)
){
pageId = "borrowPage";
el = document.querySelector(
'[onclick*="borrowPage"]'
);
}

if(
isViewerRole() &&
pageId !== "pendingPage" &&
pageId !== "historyPage"
){
pageId = "historyPage";
el = document.querySelector('[onclick*="historyPage"]');
}

const targetPage =
document.getElementById(pageId);

if(!targetPage || !el){

pageId = "borrowPage";
el = document.querySelector(
'[onclick*="borrowPage"]'
);

}

document
.querySelectorAll(
"#borrowPage,#pendingPage,#returnPage,#historyPage,#sealPage,#deptPage,#memberPage,#permissionPage,#loginLogPage,#auditLogPage,#calendarPage"
)
.forEach(page=>page.classList.add("hidden"));

document
.getElementById(pageId)
.classList.remove("hidden");

document
.querySelectorAll(".menu-item")
.forEach(item=>item.classList.remove("active"));

el.classList.add("active");

localStorage.setItem(
    "lastPage",
    pageId
);

if(pageId === "historyPage" && !historyLoaded){
loadHistoryRecords(true);
}
if(pageId === "permissionPage" && isAdminRole()){
loadUsers();
}

if(pageId === "memberPage" && currentIsSystemAdmin){
loadMemberManagement();
}

if(pageId === "loginLogPage" && isAdminRole()){
loadLoginLogs(true);
}

}

window.showPage = showPage;
window.loadAuditLogs = loadAuditLogs;
window.openAuditLogPage = openAuditLogPage;
window.changeAuditPageSize = changeAuditPageSize;
window.resetAuditFilter = resetAuditFilter;
window.loadMoreAuditLogs = loadMoreAuditLogs;
window.loadLoginLogs = loadLoginLogs;
window.loadMoreLoginLogs = loadMoreLoginLogs;
window.loadMoreHistoryRecords = loadMoreHistoryRecords;

function restoreLastPage(){

    if(isViewerRole()){

        const viewerPage =
        localStorage.getItem("lastPage") === "pendingPage"
        ? "pendingPage"
        : "historyPage";

        const viewerMenu =
        document.querySelector(
            `[onclick*="${viewerPage}"]`
        );

        showPage(
            viewerPage,
            viewerMenu
        );

        return;

    }

    const lastPage =
    localStorage.getItem(
        "lastPage"
    );

    if(!lastPage){

    showPage(
        "borrowPage",
        document.querySelector(".menu-item")
    );

    return;

}

    const targetMenu =
    lastPage === "auditLogPage"
    ? document.getElementById("auditLogMenu")
    : document.querySelector(
        `[onclick*="${lastPage}"]`
    );

    if(targetMenu){

        showPage(
            lastPage,
            targetMenu
        );

        if(
        lastPage === "auditLogPage" &&
        isAdminRole()
        ){
        loadAuditLogs();
        }

        return;

    }

    localStorage.removeItem("lastPage");

    showPage(
        "borrowPage",
        document.querySelector(
            '[onclick*="borrowPage"]'
        )
    );

}

function toggleAdvancedFilter(){

const panel =
document.getElementById("advancedFilter");

const text =
document.getElementById("filterToggleText");

panel.classList.toggle("show");

if(panel.classList.contains("show")){

text.innerHTML = "收合篩選";

}else{

text.innerHTML = "進階篩選";

}

}

window.toggleAdvancedFilter =
toggleAdvancedFilter;

function resetHistoryFilter(){

document.getElementById("searchInput").value = "";
document.getElementById("sealFilter").value = "";
document.getElementById("statusFilter").value = "";

document.getElementById("projectFilter").value = "";
document.getElementById("formFilter").value = "";

document.getElementById("borrowDateStart").value = "";
document.getElementById("borrowDateEnd").value = "";
document.getElementById("returnDateStart").value = "";
document.getElementById("returnDateEnd").value = "";

currentPage = 1;

renderTable();

}

window.resetHistoryFilter =
resetHistoryFilter;

async function deletePending(id){

if(blockViewerAction()) return;

const pendingItem =
pendingRecords.find(item=>item.id===id);

if(!confirm("確定刪除？"))
return;

await deleteDoc(
doc(
db,
"pendingRecords",
id
)
);

await writeAuditLog({
action:"delete",
category:"pendingRecord",
targetId:id,
targetLabel:pendingItem?.formNo || pendingItem?.borrower || id,
before:pendingItem
});

await loadPendingRecords();

}

window.deletePending = deletePending;

function openPendingModal(){

if(blockViewerAction()) return;

const deptSelect =
document.getElementById("pendingDepartment");

deptSelect.innerHTML =
'<option value="">請選擇部門</option>';

departmentList.forEach(dept=>{

deptSelect.innerHTML += `
<option value="${dept.name}">
${dept.name}
</option>
`;

});

document.getElementById("pendingBorrower").value = "";
document.getElementById("pendingExpectedBorrowTime").value = "";
document.getElementById("pendingExpectedReturnTime").value = "";
document.getElementById("pendingDepartment").value = "";
document.getElementById("pendingProjectNo").value = "";
document.getElementById("pendingFormNo").value = "";
document.getElementById("pendingPurpose").value = "";
editingPendingId = null;

document.querySelector(
"#pendingOverlay h2"
).innerHTML = `

<i
data-lucide="clock-3"
class="detail-title-icon">
</i>

新增待借用案件

`;

lucide.createIcons();

document.getElementById("pendingOverlay").style.display =
"flex";

}

function closePendingModal(){

document.getElementById("pendingOverlay").style.display =
"none";

}

window.openPendingModal = openPendingModal;
window.closePendingModal = closePendingModal;

async function savePendingRecord(){

if(blockViewerAction()) return;

const borrower =
document.getElementById("pendingBorrower")
.value.trim();

const department =
document.getElementById("pendingDepartment")
.value;

const projectNo =
document.getElementById("pendingProjectNo")
.value.trim();

const formNo =
document.getElementById("pendingFormNo")
.value.trim();

const purpose =
document.getElementById("pendingPurpose")
.value.trim();

if(
!borrower ||
!department ||
!projectNo ||
!formNo ||
!purpose
){

alert("請完整填寫資料");
return;

}

if(editingPendingId){

const before =
pendingRecords.find(
item=>item.id===editingPendingId
);

const expectedBorrowTime = parseDateTimeLocal(document.getElementById("pendingExpectedBorrowTime")?.value);
const expectedReturnTime = parseDateTimeLocal(document.getElementById("pendingExpectedReturnTime")?.value);
const updateData = { borrower, department, projectNo, formNo, purpose };
if(expectedBorrowTime) updateData.expectedBorrowTime = expectedBorrowTime; else updateData.expectedBorrowTime = deleteField();
if(expectedReturnTime) updateData.expectedReturnTime = expectedReturnTime; else updateData.expectedReturnTime = deleteField();
await updateDoc(doc(db,"pendingRecords",editingPendingId), updateData);

await writeAuditLog({
action:"update",
category:"pendingRecord",
targetId:editingPendingId,
targetLabel:formNo || borrower,
before,
after:{
borrower,
department,
projectNo,
formNo,
purpose,
expectedBorrowTime:expectedBorrowTime || null,
expectedReturnTime:expectedReturnTime || null,
status:before?.status || "待借用"
}
});

}else{

const createData = { borrower, department, projectNo, formNo, purpose, status:"待借用", createTime:new Date() };
const expectedBorrowTime = parseDateTimeLocal(document.getElementById("pendingExpectedBorrowTime")?.value);
const expectedReturnTime = parseDateTimeLocal(document.getElementById("pendingExpectedReturnTime")?.value);
if(expectedBorrowTime) createData.expectedBorrowTime = expectedBorrowTime;
if(expectedReturnTime) createData.expectedReturnTime = expectedReturnTime;
const newPendingRef = await addDoc(collection(db,"pendingRecords"), createData);

await writeAuditLog({
action:"create",
category:"pendingRecord",
targetId:newPendingRef.id,
targetLabel:formNo || borrower,
after:{
borrower,
department,
projectNo,
formNo,
purpose,
expectedBorrowTime:expectedBorrowTime || null,
expectedReturnTime:expectedReturnTime || null,
status:"待借用"
}
});

}

closePendingModal();

await loadPendingRecords();

alert("新增成功");

}

window.savePendingRecord =
savePendingRecord;

async function addWhitelistUser(){

if(blockViewerAction()) return;

const memberId = document.getElementById("newUserMember")?.value || "";
const role = normalizeRole(document.getElementById("newUserRole")?.value || "user");
const member = memberList.find(item=>item.id === memberId);
const email = memberGoogleEmail(member);
const existing = userList.find(item=>normalizeEmail(item.email) === email);

if(!member || !email){

alert("請選擇已有 Google 帳號的共用人員");
return;

}

const newUserData = {
email,
memberId,
role:["admin","viewer"].includes(role) ? role : "user",
enabled:true,
updatedAt:new Date(),
updatedByEmail:normalizeEmail(currentUserEmail)
};

if(!existing){
newUserData.createdAt = new Date();
newUserData.createdByEmail = normalizeEmail(currentUserEmail);
}

const permissionId = existing?.id || email;

await setDoc(doc(db,"sealPermissions",permissionId),newUserData,{merge:true});

await writeAuditLog({
action:"permission",
category:"user",
targetId:permissionId,
targetLabel:getUserDisplayName({
departmentName:member.department || member.departmentName,
employeeName:member.name,
email
}),
after:newUserData
});

document.getElementById("newUserMember").value = "";

alert(existing ? "印鑑系統權限已更新並啟用" : "印鑑系統權限已新增");

await loadUsers();

}

window.addWhitelistUser =
addWhitelistUser;

async function deleteUser(id){

if(blockViewerAction()) return;

const user =
userList.find(u=>u.id===id);

if(isLastEnabledSealAdmin(user)){

alert("至少必須保留一位啟用中的系統管理員，無法移除此權限");
return;

}

if(!confirm("確定刪除？"))
return;

await deleteDoc(
doc(db,"sealPermissions",id)
);

await writeAuditLog({
action:"permission",
category:"user",
targetId:id,
targetLabel:user?.email || id,
before:user,
after:{deleted:true}
});

await loadUsers();

}

window.deleteUser =
deleteUser;

async function toggleUser(
id,
enabled
){

if(blockViewerAction()) return;

const user =
userList.find(item=>item.id===id);

if(enabled && isLastEnabledSealAdmin(user)){
alert("至少必須保留一位啟用中的系統管理員，無法停用此帳號");
return;
}

await updateDoc(
doc(db,"sealPermissions",id),
{
enabled:!enabled,
updatedAt:new Date(),
updatedByEmail:normalizeEmail(currentUserEmail)
}
);

await writeAuditLog({
action:"permission",
category:"user",
targetId:id,
targetLabel:user?.email || id,
before:user,
after:{
...user,
enabled:!enabled
}
});

await loadUsers();

}

window.toggleUser =
toggleUser;

async function changeRole(
id,
role
){

if(blockViewerAction()) return;

const user =
userList.find(item=>item.id===id);

const nextRole = ["admin","viewer"].includes(normalizeRole(role))
? normalizeRole(role)
: "user";

if(isLastEnabledSealAdmin(user) && nextRole !== "admin"){
alert("至少必須保留一位啟用中的系統管理員，無法變更此帳號的角色");
await loadUsers();
return;
}

await updateDoc(
doc(db,"sealPermissions",id),
{
role:nextRole,
updatedAt:new Date(),
updatedByEmail:normalizeEmail(currentUserEmail)
}
);

await writeAuditLog({
action:"permission",
category:"user",
targetId:id,
targetLabel:user?.email || id,
before:user,
after:{
...user,
role:nextRole
}
});

await loadUsers();

}

window.changeRole =
changeRole;

async function updatePermissionRole(id,selectId){
const select = document.getElementById(selectId);
if(!select) return;
await changeRole(id,select.value);
}

window.updatePermissionRole = updatePermissionRole;

async function editPending(id){

if(blockViewerAction()) return;

const item =
pendingRecords.find(
x => x.id === id
);

const deptSelect =
document.getElementById(
"pendingDepartment"
);

deptSelect.innerHTML =
'<option value="">請選擇部門</option>';

departmentList.forEach(dept=>{

deptSelect.innerHTML += `
<option value="${dept.name}">
${dept.name}
</option>
`;

});

editingPendingId = item.id;

document.getElementById("pendingBorrower").value =
item.borrower || "";

document.getElementById("pendingDepartment").value =
item.department || "";

document.getElementById("pendingProjectNo").value =
item.projectNo || "";

document.getElementById("pendingFormNo").value =
item.formNo || "";

document.getElementById("pendingPurpose").value = item.purpose || "";
document.getElementById("pendingExpectedBorrowTime").value = formatDateTimeLocal(item.expectedBorrowTime);
document.getElementById("pendingExpectedReturnTime").value = formatDateTimeLocal(item.expectedReturnTime);

document.querySelector(
"#pendingOverlay h2"
).innerHTML = `

<i
data-lucide="pencil"
class="detail-title-icon">
</i>

編輯待借用案件

`;

lucide.createIcons();

document.getElementById("pendingOverlay").style.display =
"flex";

}

window.editPending = editPending;

function convertPending(id){

if(blockViewerAction()) return;

const item =
pendingRecords.find(
x => x.id === id
);

currentPendingIndex = id;

pendingTransferDraft = {
borrower:item.borrower || "",
department:item.department || "",
projectNo:item.projectNo || "",
formNo:item.formNo || "",
purpose:item.purpose || "",
expectedReturnTime: item.expectedReturnTime || null
};

selectedBorrowSeal = "";
selectedBorrowRecordId = null;
borrowPanelMode = "new";
concurrentBorrowMode = false;

const borrowMenu =
document.querySelectorAll(".menu-item")[0];

showPage(
"borrowPage",
borrowMenu
);

showPendingTransferDraft();
renderStatus();

}

window.convertPending = convertPending;

function getUserDisplayName(user){

const departmentName = String(user?.departmentName || "").trim();
const employeeName = String(user?.employeeName || user?.name || "").trim();

return [departmentName,employeeName]
.filter(Boolean)
.join(" ") || user?.email || "使用者";

}

function escapeHtml(value){

return String(value ?? "")
.replaceAll("&","&amp;")
.replaceAll("<","&lt;")
.replaceAll(">","&gt;")
.replaceAll('"',"&quot;")
.replaceAll("'","&#039;");

}

async function updateUserProfile(id){

if(blockViewerAction()) return;

const user =
userList.find(item=>item.id===id);

const departmentName =
(document.getElementById(`userDepartment_${id}`)?.value || "")
.trim();

const employeeName =
(document.getElementById(`userName_${id}`)?.value || "")
.trim();

await updateDoc(
doc(db,"users",id),
{
departmentName,
employeeName
}
);

await writeAuditLog({
action:"permission",
category:"user",
targetId:id,
targetLabel:user?.email || id,
before:user,
after:{
...user,
departmentName,
employeeName
}
});

alert("使用者資料已更新");
loadUsers();

}

window.updateUserProfile = updateUserProfile;

async function migrateLegacySealPermissions(){

if(!isAdminRole()) return;

const legacySnapshot = await getDocs(collection(db,"users"));
legacyUserList = legacySnapshot.docs.map(docSnap=>({id:docSnap.id,...docSnap.data()}));

const existing = new Set(userList.map(user=>normalizeEmail(user.email)));
const membersByEmail = new Map(
memberList.map(member=>[memberGoogleEmail(member),member]).filter(entry=>entry[0])
);
const candidates = legacyUserList.filter(user=>{
const email = normalizeEmail(user.email);
return email && user.enabled !== false && membersByEmail.has(email) && !existing.has(email);
});

if(!candidates.length){
alert("沒有可匯入的舊權限；未對應共用人員的帳號不會自動授權");
return;
}

if(!confirm(`找到 ${candidates.length} 筆可對應共用人員的舊權限，確定匯入印鑑系統權限嗎？`)) return;

for(const legacy of candidates){
const email = normalizeEmail(legacy.email);
const member = membersByEmail.get(email);
const role = ["admin","viewer"].includes(normalizeRole(legacy.role))
? normalizeRole(legacy.role)
: "user";

await setDoc(doc(db,"sealPermissions",email),{
email,
memberId:member.id,
role,
enabled:true,
migratedFromLegacyUsers:true,
createdAt:new Date(),
createdByEmail:normalizeEmail(currentUserEmail),
updatedAt:new Date(),
updatedByEmail:normalizeEmail(currentUserEmail)
},{merge:true});
}

alert(`已匯入 ${candidates.length} 筆印鑑系統權限`);
await loadUsers();

}

window.migrateLegacySealPermissions = migrateLegacySealPermissions;

function renderUserList(){

const area =
document.getElementById(
"userListArea"
);

if(!area) return;

area.innerHTML = "";

if(!userList.length){
area.innerHTML = '<div class="permission-empty-state"><i data-lucide="user-round-plus"></i><strong>尚未設定印鑑系統權限</strong><span>請從上方共用人員名單選擇成員並設定角色。</span></div>';
lucide.createIcons();
return;
}

const rows = userList.map((user,index)=>{
const role = normalizeRole(user.role);
const department = escapeHtml(user.departmentName || "未設定部門");
const name = escapeHtml(user.employeeName || "未對應共用人員");
const employeeNo = escapeHtml(user.employeeNo || "未設定");
const email = escapeHtml(user.email || "");
const selectId = `permissionRole_${index}`;
const memberNotice = user.memberActive === false
? '<small class="permission-member-warning">共用人員已停用</small>'
: user.memberActive === null
? `<small class="permission-member-warning">未對應共用人員${email ? `｜${email}` : ""}</small>`
: "";

return `<tr>
<td>${department}</td>
<td><div class="identity-cell"><strong>${name}</strong>${memberNotice}</div></td>
<td>${employeeNo}</td>
<td>
<div class="permission-role-cell">
<select id="${selectId}" aria-label="${department} ${name} 的印鑑系統角色">
<option value="user" ${role === "user" ? "selected" : ""}>一般使用者</option>
<option value="viewer" ${role === "viewer" ? "selected" : ""}>檢視者</option>
<option value="admin" ${role === "admin" ? "selected" : ""}>系統管理員</option>
</select>
</div>
</td>
<td>
<div class="permission-status-stack">
<span class="status-badge ${user.enabled !== false ? "status-active" : "status-inactive"}">${user.enabled !== false ? "啟用" : "停用"}</span>
${isLastEnabledSealAdmin(user) ? '<small>唯一啟用管理員</small>' : ""}
</div>
</td>
<td>
<div class="operation-cell permission-operation-cell">
<button type="button" class="btn btn-gray btn-sm" onclick="updatePermissionRole('${user.id}','${selectId}')">更新</button>
<button type="button" class="btn btn-gray btn-sm" onclick="toggleUser('${user.id}',${user.enabled !== false})">${user.enabled !== false ? "停用" : "啟用"}</button>
<button type="button" class="btn btn-danger-outline btn-sm" onclick="deleteUser('${user.id}')">移除</button>
</div>
</td>
</tr>`;
}).join("");

area.innerHTML = `<div class="table-wrap permission-table-wrap">
<table class="management-table permission-table">
<thead><tr><th>部門</th><th>姓名</th><th>員工編號</th><th>角色</th><th>狀態</th><th>操作</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</div>`;

lucide.createIcons();

}

function renderPendingTable(){

const table =
document.getElementById("pendingTable");

table.innerHTML = "";

if(pendingRecords.length===0){

table.innerHTML=`
<tr>
<td class="table-empty-cell" colspan="${currentRole === "viewer" ? 6 : 7}">
目前無待借用案件
</td>
</tr>
`;

return;

}

const visiblePendingRecords =
pendingRecords
.filter(item=>item.status!=="已借出")
.sort((a,b)=>
String(a.projectNo || "").localeCompare(
String(b.projectNo || ""),
"zh-Hant",
{numeric:true,sensitivity:"base"}
)
);

if(visiblePendingRecords.length===0){

table.innerHTML=`
<tr>
<td class="table-empty-cell" colspan="${currentRole === "viewer" ? 6 : 7}">
目前無待借用案件
</td>
</tr>
`;

return;

}

visiblePendingRecords
.forEach(item=>{

table.innerHTML += `
<tr>
<td>${item.borrower}</td>
<td>${item.department}</td>
<td>${item.projectNo}</td>
<td>${item.formNo}</td>
<td>${item.purpose}</td>
<td>

${item.status==="已轉正式借用"

? '<span class="badge badge-blue">已轉借用</span>'

: '<span class="badge badge-yellow">待借用</span>'
}

</td>

<td class="pending-action-column">

${currentRole === "viewer"

? ""

: `
<button
class="action-btn edit-btn tooltip"
data-tip="修改"
onclick="editPending('${item.id}')">

<i data-lucide="pencil"></i>

</button>

<button
class="action-btn delete-btn tooltip"
data-tip="刪除"
onclick="deletePending('${item.id}')">

<i data-lucide="trash-2"></i>

</button>

<button
class="action-btn convert-btn tooltip"
data-tip="轉正式借用"
onclick="convertPending('${item.id}')">

<i data-lucide="arrow-right-circle"></i>

</button>
`
}

</td>
</tr>
`;

});

lucide.createIcons();

}


function formatDateTimeLocal(date){
if(!date) return "";
let d = date;
if(date.seconds) d = new Date(date.seconds * 1000);
else if(!(date instanceof Date)) d = new Date(date);
if(isNaN(d.getTime())) return "";
const pad = n => String(n).padStart(2, '0');
return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function parseDateTimeLocal(value){
if(!value) return null;
// Ensure value has seconds if it's from datetime-local
let safeValue = value;
if (safeValue.length === 16 && safeValue.includes('T')) {
    safeValue += ':00';
}
const d = new Date(safeValue);
if(isNaN(d.getTime())) return null;
return Timestamp.fromDate(d);
}

function formatDate(date){

if(!date) return "-";

if(date.seconds){

return new Date(date.seconds * 1000)
.toLocaleString("zh-TW");

}

return new Date(date)
.toLocaleString("zh-TW");

}

function formatTableDate(date){

if(!date) return "-";

const d = date.seconds
? new Date(date.seconds * 1000)
: new Date(date);

const y = d.getFullYear();

const m = String(
d.getMonth() + 1
).padStart(2,"0");

const day = String(
d.getDate()
).padStart(2,"0");

const hh = String(
d.getHours()
).padStart(2,"0");

const mm = String(
d.getMinutes()
).padStart(2,"0");

return `
<div class="table-date">
    <div>${y}/${m}/${day}</div>
    <div class="table-time">${hh}:${mm}</div>
</div>
`;

}

function sameDate(firebaseDate,selectedDate){

if(!firebaseDate || !selectedDate)
return false;

const d1 = firebaseDate.seconds
? new Date(firebaseDate.seconds * 1000)
: new Date(firebaseDate);

const d2 = new Date(selectedDate);

return (

d1.getFullYear() === d2.getFullYear() &&
d1.getMonth() === d2.getMonth() &&
d1.getDate() === d2.getDate()

);

}

/* 部門 */

async function loadDepartments(){

const querySnapshot =
await getDocs(collection(db,"departments"));

departmentList = [];

querySnapshot.forEach((docSnap)=>{

const data = docSnap.data();

departmentList.push({

id:docSnap.id,
name:data.name,
sortOrder:Number(data.sortOrder || 999)

});

});

departmentList.sort((a,b)=>
a.sortOrder - b.sortOrder
);

renderDepartmentDropdown();
renderDepartmentMaintenance();

}

function renderDepartmentDropdown(){

const select =
document.getElementById("department");

select.innerHTML =
`<option value="">請選擇部門</option>`;

departmentList.forEach(dept=>{

select.innerHTML += `
<option value="${dept.name}">
${dept.name}
</option>
`;

});

}

function renderDepartmentMaintenance(){

const area =
document.getElementById("deptListArea");

if(!area) return;
if(!departmentList.length){
area.innerHTML = '<div class="table-empty-cell">尚未建立部門</div>';
return;
}

area.innerHTML = `<div class="table-wrap"><table class="management-table master-table"><thead><tr><th>部門名稱</th><th>顯示順序</th><th>操作</th></tr></thead><tbody>${departmentList.map((dept,index)=>`
<tr>
<td class="master-name-cell"><strong>${escapeHtml(dept.name || "未命名部門")}</strong></td>
<td><span class="master-order-badge">${escapeHtml(dept.sortOrder ?? index + 1)}</span></td>
<td class="operation-cell master-actions">
<button type="button" class="icon-button" title="上移" aria-label="上移 ${escapeHtml(dept.name || "部門")}" onclick="moveDeptUp('${dept.id}')" ${index === 0 ? "disabled" : ""}><i data-lucide="arrow-up"></i></button>
<button type="button" class="icon-button" title="下移" aria-label="下移 ${escapeHtml(dept.name || "部門")}" onclick="moveDeptDown('${dept.id}')" ${index === departmentList.length - 1 ? "disabled" : ""}><i data-lucide="arrow-down"></i></button>
<button type="button" class="btn btn-danger-outline btn-sm" onclick="deleteDepartment('${dept.id}')">刪除</button>
</td>
</tr>`).join("")}</tbody></table></div>`;
lucide.createIcons();

}

async function moveDeptUp(id){

if(blockViewerAction()) return;

const index =
departmentList.findIndex(d=>d.id===id);

if(index <= 0) return;

const movedDepartment =
{...departmentList[index]};

[departmentList[index - 1],
departmentList[index]] =

[departmentList[index],
departmentList[index - 1]];

for(let i=0;i<departmentList.length;i++){

await updateDoc(
doc(db,"departments",departmentList[i].id),
{
sortOrder:i + 1
}
);

}

await writeAuditLog({
action:"update",
category:"department",
targetId:id,
targetLabel:movedDepartment.name,
before:movedDepartment,
after:{
...movedDepartment,
sortOrder:index
}
});

await loadDepartments();

}

async function moveDeptDown(id){

if(blockViewerAction()) return;

const index =
departmentList.findIndex(d=>d.id===id);

if(index >= departmentList.length - 1)
return;

const movedDepartment =
{...departmentList[index]};

[departmentList[index],
departmentList[index + 1]] =

[departmentList[index + 1],
departmentList[index]];

for(let i=0;i<departmentList.length;i++){

await updateDoc(
doc(db,"departments",departmentList[i].id),
{
sortOrder:i + 1
}
);

}

await writeAuditLog({
action:"update",
category:"department",
targetId:id,
targetLabel:movedDepartment.name,
before:movedDepartment,
after:{
...movedDepartment,
sortOrder:index + 2
}
});

await loadDepartments();

}

async function addDepartment(){

if(blockViewerAction()) return;

const name =
document.getElementById("newDept")
.value.trim();

const order =
parseInt(
document.getElementById("newDeptOrder").value
);

if(!name || isNaN(order)){

alert("請完整填寫");
return;

}

const newDepartmentRef =
await addDoc(collection(db,"departments"),{

name:name,
sortOrder:order

});

await writeAuditLog({
action:"create",
category:"department",
targetId:newDepartmentRef.id,
targetLabel:name,
after:{
name,
sortOrder:order
}
});

document.getElementById("newDept").value = "";
document.getElementById("newDeptOrder").value = "";

alert("新增成功");

await loadDepartments();

}

async function deleteDepartment(id){

if(blockViewerAction()) return;

const department =
departmentList.find(item=>item.id===id);

if(!confirm(`確定刪除部門「${department?.name || id}」？\n若仍有人員使用此部門，建議先確認人員資料後再刪除。`)) return;

await deleteDoc(doc(db,"departments",id));

await writeAuditLog({
action:"delete",
category:"department",
targetId:id,
targetLabel:department?.name || id,
before:department
});

alert("已刪除");

await loadDepartments();

}

/* 印鑑 */

async function loadSeals(){

const querySnapshot =
await getDocs(collection(db,"seals"));

sealList = [];

querySnapshot.forEach((docSnap)=>{

const data = docSnap.data();

sealList.push({

id:docSnap.id,
name:data.name,
sortOrder:Number(data.sortOrder || 999)

});

});

sealList.sort((a,b)=>
a.sortOrder - b.sortOrder
);

renderSealDropdown();
renderSealFilter();
renderSealMaintenance();
renderStatus();

}

function renderSealDropdown(){

const select =
document.getElementById("seal");

select.innerHTML =
`<option value="">請選擇</option>`;

sealList.forEach(seal=>{

select.innerHTML += `
<option value="${seal.name}">
${seal.name}
</option>
`;

});

}

function renderSealFilter(){

const select =
document.getElementById("sealFilter");

select.innerHTML =
`<option value="">全部印鑑</option>`;

sealList.forEach(seal=>{

select.innerHTML += `
<option value="${seal.name}">
${seal.name}
</option>
`;

});

}

function renderSealMaintenance(){

const area =
document.getElementById("sealListArea");

if(!area) return;
if(!sealList.length){
area.innerHTML = '<div class="table-empty-cell">尚未建立印鑑</div>';
return;
}

area.innerHTML = `<div class="table-wrap"><table class="management-table master-table"><thead><tr><th>印鑑名稱</th><th>顯示順序</th><th>操作</th></tr></thead><tbody>${sealList.map((seal,index)=>`
<tr>
<td class="master-name-cell"><strong>${escapeHtml(seal.name || "未命名印鑑")}</strong></td>
<td><span class="master-order-badge">${escapeHtml(seal.sortOrder ?? index + 1)}</span></td>
<td class="operation-cell master-actions">
<button type="button" class="icon-button" title="上移" aria-label="上移 ${escapeHtml(seal.name || "印鑑")}" onclick="moveUp('${seal.id}')" ${index === 0 ? "disabled" : ""}><i data-lucide="arrow-up"></i></button>
<button type="button" class="icon-button" title="下移" aria-label="下移 ${escapeHtml(seal.name || "印鑑")}" onclick="moveDown('${seal.id}')" ${index === sealList.length - 1 ? "disabled" : ""}><i data-lucide="arrow-down"></i></button>
<button type="button" class="btn btn-danger-outline btn-sm" onclick="deleteSeal('${seal.id}')">刪除</button>
</td>
</tr>`).join("")}</tbody></table></div>`;
lucide.createIcons();

}

async function moveUp(id){

if(blockViewerAction()) return;

const index =
sealList.findIndex(s=>s.id===id);

if(index <= 0) return;

const movedSeal =
{...sealList[index]};

[sealList[index - 1],
sealList[index]] =

[sealList[index],
sealList[index - 1]];

for(let i=0;i<sealList.length;i++){

await updateDoc(
doc(db,"seals",sealList[i].id),
{
sortOrder:i + 1
}
);

}

await writeAuditLog({
action:"update",
category:"seal",
targetId:id,
targetLabel:movedSeal.name,
before:movedSeal,
after:{
...movedSeal,
sortOrder:index
}
});

await loadSeals();

}

async function moveDown(id){

if(blockViewerAction()) return;

const index =
sealList.findIndex(s=>s.id===id);

if(index >= sealList.length - 1)
return;

const movedSeal =
{...sealList[index]};

[sealList[index],
sealList[index + 1]] =

[sealList[index + 1],
sealList[index]];

for(let i=0;i<sealList.length;i++){

await updateDoc(
doc(db,"seals",sealList[i].id),
{
sortOrder:i + 1
}
);

}

await writeAuditLog({
action:"update",
category:"seal",
targetId:id,
targetLabel:movedSeal.name,
before:movedSeal,
after:{
...movedSeal,
sortOrder:index + 2
}
});

await loadSeals();

}

async function addSeal(){

if(blockViewerAction()) return;

const name =
document.getElementById("newSeal")
.value.trim();

const order =
parseInt(
document.getElementById("newOrder").value
);

if(!name || isNaN(order)){

alert("請完整填寫");
return;

}

const newSealRef =
await addDoc(collection(db,"seals"),{

name:name,
sortOrder:order

});

await writeAuditLog({
action:"create",
category:"seal",
targetId:newSealRef.id,
targetLabel:name,
after:{
name,
sortOrder:order
}
});

document.getElementById("newSeal").value = "";
document.getElementById("newOrder").value = "";

alert("新增成功");

await loadSeals();

}

async function deleteSeal(id){

if(blockViewerAction()) return;

const seal =
sealList.find(item=>item.id===id);

if(!confirm(`確定刪除印鑑「${seal?.name || id}」？\n歷史借用紀錄會保留，但後續將無法再選擇此印鑑。`)) return;

await deleteDoc(doc(db,"seals",id));

await writeAuditLog({
action:"delete",
category:"seal",
targetId:id,
targetLabel:seal?.name || id,
before:seal
});

alert("已刪除");

await loadSeals();

}

/* 借用 */

function resetBorrowForm(){

currentPendingIndex = null;
pendingTransferDraft = null;
borrowEntryDraft = null;
selectedBorrowRecordId = null;
borrowPanelMode = "new";
concurrentBorrowMode = false;

const firstAvailable = sealList.find(seal=>
!records.some(record=>record.seal===seal.name && !record.returnTime)
);

selectedBorrowSeal = firstAvailable?.name || "";

populateBorrowForm({
borrower:"",
department:"",
projectNo:"",
formNo:"",
purpose:""
});

document.getElementById("seal").value = selectedBorrowSeal;
document.getElementById("pendingTransferBanner").classList.add("hidden");
renderBorrowPanelState();
renderStatus();

}

function getBorrowFormData(){
const ert = parseDateTimeLocal(document.getElementById("expectedReturnTime")?.value);
return {
borrower:document.getElementById("borrower").value.trim(),
department:document.getElementById("department").value,
projectNo:document.getElementById("projectNo").value.trim(),
formNo:document.getElementById("formNo").value.trim(),
purpose:document.getElementById("purpose").value.trim(),
expectedReturnTime:ert
};
}

function populateBorrowForm(data={}){
document.getElementById("borrower").value = data.borrower || "";
document.getElementById("department").value = data.department || "";
document.getElementById("projectNo").value = data.projectNo || "";
document.getElementById("formNo").value = data.formNo || "";
document.getElementById("purpose").value = data.purpose || "";
document.getElementById("expectedReturnTime").value = formatDateTimeLocal(data.expectedReturnTime);
}

function setBorrowFormDisabled(disabled){
[
"borrower",
"department",
"projectNo",
"formNo",
"purpose",
"expectedReturnTime"
].forEach(id=>{
const element = document.getElementById(id);
if(element) element.disabled = disabled;
});
}

function showPendingTransferDraft(){
const item = pendingRecords.find(record=>record.id===currentPendingIndex);

if(!item){
cancelPendingTransfer();
return;
}

selectedBorrowRecordId = null;
borrowPanelMode = "new";
selectedBorrowSeal = "";
document.getElementById("seal").value = "";
populateBorrowForm(pendingTransferDraft || item);

const banner = document.getElementById("pendingTransferBanner");
banner.classList.remove("hidden");
document.getElementById("pendingTransferLabel").textContent =
`｜${item.formNo || item.borrower || "未命名案件"}`;

renderBorrowPanelState();
}

function cancelPendingTransfer(){
currentPendingIndex = null;
pendingTransferDraft = null;
document.getElementById("pendingTransferBanner").classList.add("hidden");
resetBorrowForm();
}

function selectBorrowSeal(sealName){
const activeRecords = records.filter(record=>
record.seal===sealName && !record.returnTime
);

selectedBorrowSeal = sealName;
concurrentBorrowMode = false;

if(currentPendingIndex){
selectedBorrowRecordId = null;
borrowPanelMode = "new";
populateBorrowForm(pendingTransferDraft || {});
document.getElementById("seal").value = sealName;
}else if(activeRecords.length){
selectedBorrowRecordId = activeRecords[0].id;
borrowPanelMode = "read";
populateBorrowForm(activeRecords[0]);
}else{
selectedBorrowRecordId = null;
borrowPanelMode = "new";
populateBorrowForm(borrowEntryDraft || {});
document.getElementById("seal").value = sealName;
}

renderBorrowPanelState();
renderStatus();
}

function startConcurrentBorrow(){
if(blockViewerAction()) return;
if(!selectedBorrowSeal) return;

selectedBorrowRecordId = null;
borrowPanelMode = "new";
concurrentBorrowMode = true;
populateBorrowForm({});
document.getElementById("seal").value = selectedBorrowSeal;
renderBorrowPanelState();
renderStatus();
}

function renderBorrowPanelState(){
const title = document.getElementById("borrowPanelTitle");
const description = document.getElementById("borrowPanelDescription");
const badge = document.getElementById("borrowModeBadge");
const meta = document.getElementById("borrowedMeta");
const summary = document.getElementById("borrowSelectionSummary");
const confirmButton = document.getElementById("confirmBorrowMainButton");
const editButton = document.getElementById("editBorrowedButton");
const saveButton = document.getElementById("saveBorrowedButton");
const cancelButton = document.getElementById("cancelBorrowEditButton");

const concurrentButton = document.getElementById("concurrentBorrowButton");
[confirmButton,editButton,saveButton,cancelButton,concurrentButton].filter(Boolean)
.forEach(button=>button.classList.add("hidden"));

if(selectedBorrowRecordId){
const active = records.find(record=>record.id===selectedBorrowRecordId);

if(!active || active.returnTime){
selectedBorrowRecordId = null;
borrowPanelMode = "new";
renderBorrowPanelState();
return;
}

const activeRecords = records.filter(record=>record.seal===active.seal && !record.returnTime);

title.textContent = borrowPanelMode === "edit" ? "編輯借用資料" : "目前借用資料";
description.textContent = borrowPanelMode === "edit"
? "修改完成後請儲存變更"
: "此印鑑目前借出中；如需登記另一位借用人，請使用新增同印鑑借用";
badge.className = "badge badge-red";
badge.textContent = "借出中";
badge.classList.remove("hidden");

let switcherHtml = '';
if (activeRecords.length > 1) {
    switcherHtml = `<div class="active-record-switcher">
        <i data-lucide="layers"></i> 同印鑑有 ${activeRecords.length} 筆借出中：
        <select onchange="switchActiveRecord(this.value)">
            ${activeRecords.map((r, idx) => `<option value="${r.id}" ${r.id === selectedBorrowRecordId ? 'selected' : ''}>[${idx+1}] ${escapeHtml(r.borrower)}</option>`).join('')}
        </select>
    </div>`;
}

meta.classList.remove("hidden");
meta.innerHTML = switcherHtml + `
<div class="borrowed-meta-item">
<span>印鑑</span>
<b>${escapeHtml(active.seal || "-")}</b>
</div>
<div class="borrowed-meta-item">
<span>借用時間</span>
<b>${formatDate(active.borrowTime)}</b>
</div>
<div class="borrowed-meta-item">
<span>預計歸還</span>
<b>${active.expectedReturnTime ? formatDate(active.expectedReturnTime) : "未設定"}</b>
</div>
<div class="borrowed-meta-item">
<span>已借用時間</span>
<b>${getBorrowDuration(active.borrowTime)}</b>
</div>`;

setBorrowFormDisabled(borrowPanelMode !== "edit");
summary.innerHTML = `<strong>印鑑：${active.seal}</strong> ・ 借出中`;

if(borrowPanelMode === "edit"){
saveButton.classList.remove("hidden");
cancelButton.textContent = "取消";
cancelButton.classList.remove("hidden");
}else if(currentPendingIndex){
cancelButton.textContent = "返回待借用案件";
cancelButton.classList.remove("hidden");
}else if(!isViewerRole()){
editButton.classList.remove("hidden");
if(concurrentButton) concurrentButton.classList.remove("hidden");
}

lucide.createIcons();
return;
}

title.textContent = currentPendingIndex
? "待借用轉正式借用"
: concurrentBorrowMode
? "新增同印鑑借用"
: "借用資料";
description.textContent = currentPendingIndex
? "資料已帶入，請從左側手動選擇一組可借用印鑑"
: concurrentBorrowMode
? `正在為「${selectedBorrowSeal}」新增另一筆借用資料`
: selectedBorrowSeal
? "請填寫借用資訊後送出"
: "請先從左側選擇一組可借用印鑑";

meta.classList.add("hidden");
setBorrowFormDisabled(false);
confirmButton.classList.remove("hidden");
confirmButton.disabled = !selectedBorrowSeal;

if(selectedBorrowSeal){
badge.textContent = "可借用";
badge.className = "badge badge-green";
summary.innerHTML = `<strong>印鑑：${selectedBorrowSeal}</strong> ・ 可借用`;
document.getElementById("seal").value = selectedBorrowSeal;
}else{
badge.className = "badge badge-green hidden";
summary.textContent = currentPendingIndex
? "請從左側選擇本次實際借用的印鑑"
: "尚未選擇印鑑";
document.getElementById("seal").value = "";
}

lucide.createIcons();
}

function startInlineBorrowEdit(){
if(blockViewerAction()) return;
if(!selectedBorrowRecordId) return;
borrowPanelMode = "edit";
renderBorrowPanelState();
}

function cancelInlineBorrowEdit(){
if(currentPendingIndex && borrowPanelMode !== "edit"){
showPendingTransferDraft();
renderStatus();
return;
}

const active = records.find(record=>record.id===selectedBorrowRecordId);
if(!active) return;
borrowPanelMode = "read";
populateBorrowForm(active);
renderBorrowPanelState();
}

async function saveInlineBorrowEdit(){
if(blockViewerAction()) return;

const before = records.find(record=>
record.id===selectedBorrowRecordId && !record.returnTime
);

if(!before){
alert("找不到可編輯的借用資料");
return;
}

const after = getBorrowFormData();

if(!after.borrower || !after.department || !after.projectNo || !after.formNo || !after.purpose){
alert("請填寫必要欄位");
return;
}

const updateData = {
...after,
expectedReturnTime:after.expectedReturnTime || deleteField()
};
await updateDoc(doc(db,"sealRecords",before.id),updateData);

await writeAuditLog({
action:"update",
category:"sealRecord",
targetId:before.id,
targetLabel:`${before.seal} / ${after.borrower}`,
before,
after:{...before,...after}
});

alert("修改成功");
borrowPanelMode = "read";
await loadRecords();
}

let pendingBorrowData = null;
let isBorrowing = false;

function borrowSeal(){

if(blockViewerAction()) return;

const borrower =
document.getElementById("borrower")
.value.trim();

const department =
document.getElementById("department")
.value;

const seal =
document.getElementById("seal")
.value;

const purpose =
document.getElementById("purpose")
.value.trim();

const projectNo =
document.getElementById("projectNo")
.value.trim();

const formNo =
document.getElementById("formNo")
.value.trim();

if(!borrower || !department || !seal || !projectNo || !formNo || !purpose){

alert("請填寫必要欄位");
return;

}

/* 防止重複借用 */

const exists =
records.find(r=>

r.seal === seal &&
!r.returnTime

);

if(exists && !concurrentBorrowMode){

alert(`印鑑 ${seal} 目前借出中，無法重複借用`);

return;

}

pendingBorrowData = {
seal,
borrower,
department,
projectNo,
formNo,
purpose,
expectedReturnTime: parseDateTimeLocal(document.getElementById("expectedReturnTime")?.value),
allowConcurrent:concurrentBorrowMode,
pendingId:currentPendingIndex
};
document.getElementById("borrowConfirmExpectedReturnTime").textContent = document.getElementById("expectedReturnTime")?.value ? formatDate(parseDateTimeLocal(document.getElementById("expectedReturnTime")?.value)) : "-";
document.getElementById("borrowConfirmSeal").textContent =
seal;

document.getElementById("borrowConfirmBorrower").textContent =
borrower;

document.getElementById("borrowConfirmDepartment").textContent =
department;

document.getElementById("borrowConfirmProjectNo").textContent =
projectNo;

document.getElementById("borrowConfirmFormNo").textContent =
formNo;

document.getElementById("borrowConfirmPurpose").textContent =
purpose;

document.getElementById("borrowConfirmOverlay").style.display =
"flex";

}

function closeBorrowConfirmModal(){

if(isBorrowing) return;

pendingBorrowData = null;

document.getElementById("borrowConfirmOverlay").style.display =
"none";

}

async function confirmBorrowSeal(){

if(blockViewerAction()) return;
if(isBorrowing || !pendingBorrowData) return;

const data = {...pendingBorrowData};

const exists =
records.find(r=>
r.seal === data.seal &&
!r.returnTime
);

if(exists && !data.allowConcurrent){
alert(`印鑑 ${data.seal} 目前借出中，無法重複借用`);
closeBorrowConfirmModal();
await loadRecords();
return;
}

const confirmButton =
document.getElementById("confirmBorrowButton");

isBorrowing = true;
confirmButton.disabled = true;
confirmButton.textContent = "處理中...";

try{

const borrowRecordRef =
await addDoc(collection(db,"sealRecords"),{

seal:data.seal,
borrower:data.borrower,
department:data.department,
projectNo:data.projectNo,
formNo:data.formNo,
purpose:data.purpose,
expectedReturnTime: data.expectedReturnTime || null,
borrowTime:new Date(),
returnTime:null

});

await writeAuditLog({
action:"borrow",
category:"sealRecord",
targetId:borrowRecordRef.id,
targetLabel:`${data.seal} / ${data.borrower}`,
after:{
seal:data.seal,
borrower:data.borrower,
department:data.department,
projectNo:data.projectNo,
formNo:data.formNo,
purpose:data.purpose,
expectedReturnTime:data.expectedReturnTime || null,
status:"借出中"
}
});

if(data.pendingId){

const pendingItem =
pendingRecords.find(
x => x.id === data.pendingId
);

if(pendingItem){

await updateDoc(
doc(
db,
"pendingRecords",
pendingItem.id
),
{
status:"已借出"
}
);

await writeAuditLog({
action:"update",
category:"pendingRecord",
targetId:pendingItem.id,
targetLabel:pendingItem.formNo || pendingItem.borrower,
before:pendingItem,
after:{
...pendingItem,
status:"已借出"
}
});

await loadPendingRecords();

currentPendingIndex = null;

}

}

document.getElementById("borrowConfirmOverlay").style.display =
"none";

pendingBorrowData = null;

alert("借用成功");

await loadRecords();
resetBorrowForm();

}catch(error){

alert(`借用失敗：${error.message}`);

}finally{

isBorrowing = false;
confirmButton.disabled = false;
confirmButton.textContent = "確認借用";

}

}

let currentReturningId = null;
let isReturning = false;

function openReturnModal(id){

if(blockViewerAction()) return;

const record =
records.find(r=>r.id===id && !r.returnTime);

if(!record){
alert("找不到可歸還的借用資料");
return;
}

currentReturningId = id;

document.getElementById("returnConfirmSeal").textContent =
record.seal || "-";

document.getElementById("returnConfirmBorrower").textContent =
record.borrower || "-";

document.getElementById("returnConfirmDepartment").textContent =
record.department || "-";

document.getElementById("returnConfirmTime").textContent =
formatDate(record.borrowTime);

document.getElementById("returnConfirmPurpose").textContent =
record.purpose || "-";

document.getElementById("returnConfirmOverlay").style.display =
"flex";

}

function closeReturnModal(){

if(isReturning) return;

currentReturningId = null;

document.getElementById("returnConfirmOverlay").style.display =
"none";

}

async function confirmReturnSeal(){

if(blockViewerAction()) return;
if(isReturning || !currentReturningId) return;

const record =
records.find(
r=>r.id===currentReturningId && !r.returnTime
);

if(!record){
alert("此筆資料可能已完成歸還，請重新整理");
closeReturnModal();
loadRecords();
return;
}

const confirmButton =
document.getElementById("confirmReturnButton");

isReturning = true;
confirmButton.disabled = true;
confirmButton.textContent = "處理中...";

try{

const returningId =
currentReturningId;

const returnTime =
new Date();

await updateDoc(
doc(db,"sealRecords",returningId),
{
returnTime
}
);

await writeAuditLog({
action:"return",
category:"sealRecord",
targetId:returningId,
targetLabel:`${record.seal} / ${record.borrower}`,
before:record,
after:{
...record,
returnTime:returnTime.toISOString(),
status:"已歸還"
}
});

document.getElementById("returnConfirmOverlay").style.display =
"none";

currentReturningId = null;

alert("已歸還");

await loadRecords();
if(historyLoaded) await loadHistoryRecords(true);

}catch(error){

alert(`歸還失敗：${error.message}`);

}finally{

isReturning = false;
confirmButton.disabled = false;
confirmButton.textContent = "確認歸還";

}

}

async function loadRecords(){

const querySnapshot =
await getDocs(
query(
collection(db,"sealRecords"),
where("returnTime","==",null)
)
);

const activeRecords = [];

querySnapshot.forEach((docSnap)=>{

activeRecords.push({

id:docSnap.id,
...docSnap.data()

});

});

const combined = new Map();
historyRecords.forEach(record=>combined.set(record.id,record));
activeRecords.forEach(record=>combined.set(record.id,record));
records = [...combined.values()];

renderTable();
renderReturnTable();
renderStatus();
updateKPI();
if(typeof loadCalendarEvents === 'function') loadCalendarEvents();

}

function buildHistoryQuery(){

const constraints = [
where("returnTime","!=",null),
orderBy("returnTime","desc")
];

if(historyLastDoc) constraints.push(startAfter(historyLastDoc));
constraints.push(limit(HISTORY_BATCH_SIZE));

return query(collection(db,"sealRecords"),...constraints);

}

async function loadHistoryRecords(reset = true){

if(historyLoading) return;

if(reset){
historyRecords = [];
historyLastDoc = null;
historyHasMore = false;
historyLoaded = false;
currentPage = 1;
}

try{

historyLoading = true;
renderHistoryLoadMore();

const snapshot = await getDocs(buildHistoryQuery());
const known = new Map(historyRecords.map(record=>[record.id,record]));

snapshot.forEach(docSnap=>{
known.set(docSnap.id,{id:docSnap.id,...docSnap.data()});
});

historyRecords = [...known.values()];
historyLastDoc = snapshot.docs[snapshot.docs.length - 1] || historyLastDoc;
historyHasMore = snapshot.size === HISTORY_BATCH_SIZE;
historyLoaded = true;

const activeRecords = records.filter(record=>!record.returnTime);
records = [...historyRecords,...activeRecords];
renderTable();
if(typeof loadCalendarEvents === 'function') loadCalendarEvents();
}catch(error){

console.error("讀取歷史借用紀錄失敗",error);
alert(`歷史借用紀錄讀取失敗：${error.message || "未知錯誤"}`);

}finally{
historyLoading = false;
renderHistoryLoadMore();
}

}

async function loadMoreHistoryRecords(){
await loadHistoryRecords(false);
}

function renderHistoryLoadMore(){
const button = document.getElementById("historyLoadMoreButton");
if(!button) return;
button.hidden = !historyHasMore && !historyLoading;
button.disabled = historyLoading;
button.textContent = historyLoading ? "載入中..." : "再載入 100 筆歷史紀錄";
}

function updateKPI(){

const borrowed =
records.filter(
r=>!r.returnTime
).length;

const available =
sealList.length - borrowed;

const borrowedElement =
document.getElementById('borrowBorrowedCount');

const availableElement =
document.getElementById('borrowAvailableCount');

if(borrowedElement) borrowedElement.innerText = borrowed;
if(availableElement) availableElement.innerText = available;

}




function getBorrowDuration(borrowTime){
if(!borrowTime) return "-";
const start = borrowTime.seconds ? borrowTime.seconds*1000 : new Date(borrowTime).getTime();
const diff = Date.now() - start;
const days = Math.floor(diff/86400000);
const hours = Math.floor((diff%86400000)/3600000);
const mins = Math.floor((diff%3600000)/60000);
return `${days}天${hours}小時${mins}分`;
}

function legacyShowSealDetail(sealName){
document.querySelectorAll('#statusGrid .card').forEach(c=>c.classList.remove('selected'));
const target=document.querySelector(`[data-seal="${sealName}"]`);
if(target) target.classList.add('selected');

const active = records.find(r=>r.seal===sealName && !r.returnTime);
const el=document.getElementById('sealDetailContent');

if(!active){
const sealSelect =
document.getElementById("seal");

if(sealSelect){
sealSelect.value = sealName;
}

el.innerHTML=`
<div class="detail-card">
<div class="detail-grid">
<div class="detail-item">
<div class="detail-label">印鑑名稱</div>
<div class="detail-value">${sealName}</div>
</div>
<div class="detail-item">
<div class="detail-label">狀態</div>
<div class="detail-value">
<span class="badge badge-green">
可借用
</span>
</div>
</div>
</div>
<div style="margin-top:15px;padding:12px;background:#ecfdf5;border-radius:12px;">
目前無借用案件
</div>
</div>`;
return;
}

el.innerHTML=`
<div class="detail-card">
<div class="detail-grid">
<div class="detail-item"><div class="detail-label">印鑑名稱</div><div class="detail-value">${sealName}</div></div>
<div class="detail-item"><div class="detail-label">狀態</div><div class="detail-value">
<span class="badge badge-red">
借出中
</span>
</div></div>
<div class="detail-item"><div class="detail-label">借用人</div><div class="detail-value">${active.borrower}</div></div>
<div class="detail-item"><div class="detail-label">部門</div><div class="detail-value">${active.department}</div></div>
<div class="detail-item"><div class="detail-label">計畫編號</div><div class="detail-value">${active.projectNo||''}</div></div>
<div class="detail-item"><div class="detail-label">表單編號</div><div class="detail-value">${active.formNo||''}</div></div>
<div class="detail-item"><div class="detail-label">借用時間</div><div class="detail-value">${formatDate(active.borrowTime)}</div></div>
<div class="detail-item"><div class="detail-label">已借用時間</div><div class="detail-value">${getBorrowDuration(active.borrowTime)}</div></div>
</div>
<div class="purpose-card">
<div class="purpose-title">用途</div>
<div class="purpose-content">${active.purpose||''}</div>
</div>
</div>`;
}

function legacyRenderStatus(){

const grid =
document.getElementById("statusGrid");

grid.innerHTML = "";

sealList.forEach(seal=>{

const active =
records.find(r=>

r.seal===seal.name &&
!r.returnTime

);

const card =
document.createElement("div");

card.className =
active ? "card borrowed" : "card available";

card.setAttribute('data-seal',seal.name); card.onclick=()=>showSealDetail(seal.name);
card.innerHTML = `

<div style="
font-size:13px;
color:#64748b;
margin-bottom:8px;
">
印鑑
</div>

<div style="
font-size:20px;
font-weight:700;
margin-bottom:12px;
">
${seal.name}
</div>

<div style="
font-size:14px;
font-weight:600;
color:${active ? '#dc2626' : '#16a34a'};
">
${active
? `借出中｜${active.borrower}`
: '目前可借用'}
</div>

`;

grid.appendChild(card);

});

if(sealList.length){
showSealDetail(sealList[0].name);
}

}

/* 借用登記新版：緊湊狀態清單與左右工作台 */
function showSealDetail(sealName){
selectBorrowSeal(sealName);
}

function renderStatus(){
const list = document.getElementById("statusGrid");
if(!list) return;

const keyword = (
document.getElementById("borrowSealSearch")?.value || ""
).trim().toLowerCase();

const activeForSelected = records.find(record=>
record.seal===selectedBorrowSeal && !record.returnTime
);

if(
!currentPendingIndex &&
borrowPanelMode === "new" &&
!concurrentBorrowMode &&
activeForSelected
){
selectedBorrowSeal = "";
document.getElementById("seal").value = "";
}

if(!currentPendingIndex && !selectedBorrowSeal){
const firstAvailable = sealList.find(seal=>
!records.some(record=>record.seal===seal.name && !record.returnTime)
);

if(firstAvailable){
selectedBorrowSeal = firstAvailable.name;
document.getElementById("seal").value = firstAvailable.name;

}
}

const visibleSeals = sealList.filter(seal=>
!keyword || seal.name.toLowerCase().includes(keyword)
);

list.innerHTML = "";

visibleSeals.forEach(seal=>{
  const activeRecords = records.filter(record=>
  record.seal===seal.name && !record.returnTime
  );
  const active = activeRecords.length > 0;

  const row = document.createElement("button");
  row.type = "button";
  row.className = [
  "seal-status-row",
  active ? "is-borrowed" : "is-available",
  selectedBorrowSeal===seal.name ? "selected" : ""
  ].filter(Boolean).join(" ");
  row.setAttribute("data-seal",seal.name);
  row.onclick = ()=>selectBorrowSeal(seal.name);

  row.innerHTML = `
  <div class="seal-row-main">
  <div class="seal-row-name">${seal.name}</div>
  ${active
  ? `<div class="seal-row-person">借用人：${escapeHtml(activeRecords.map(r=>r.borrower).join(', '))}</div>`
  : ""}
  </div>
  <div class="seal-row-status-wrap">
  <div class="seal-row-status">
  ${active ? "借出中" : "可借用"}
  </div>
  ${selectedBorrowSeal===seal.name && !active
  ? `<span class="seal-row-check"><i data-lucide="check"></i></span>`
  : `<i data-lucide="chevron-right"></i>`}
  </div>`;

  list.appendChild(row);
});

if(!visibleSeals.length){
list.innerHTML = `<div class="seal-empty-state">找不到符合的印鑑</div>`;
}

if(selectedBorrowRecordId){
const active = records.find(record=>
record.id===selectedBorrowRecordId && !record.returnTime
);

if(active && borrowPanelMode !== "edit"){
populateBorrowForm(active);
}
}

renderBorrowPanelState();
lucide.createIcons();
}



function renderReturnTable(){

const table =
document.getElementById("returnTable");

if(!table) return;

table.innerHTML = "";

const activeReturnRecords =
records
.filter(r=>!r.returnTime);

if(activeReturnRecords.length===0){

table.innerHTML = `
<tr>
<td class="table-empty-cell" colspan="8">目前無待歸還印鑑</td>
</tr>
`;

return;

}

activeReturnRecords
.forEach(r=>{

const tr =
document.createElement("tr");

tr.innerHTML = `

<td>${r.seal}</td>
<td>${r.borrower}</td>
<td>${r.department}</td>
<td>${r.projectNo || ""}</td>
<td>${r.formNo || ""}</td>
<td>${r.purpose}</td>
<td>${formatDate(r.borrowTime)}</td>

<td>
<button
class="action-btn convert-btn tooltip"
data-tip="歸還"
onclick="openReturnModal('${r.id}')">

<i data-lucide="rotate-ccw"></i>

</button>
</td>
`;

table.appendChild(tr);

});

lucide.createIcons();

}


function getLocalDateKey(value){

if(!value) return "";

const date =
value.seconds
? new Date(value.seconds * 1000)
: value.toDate
? value.toDate()
: new Date(value);

if(Number.isNaN(date.getTime())) return "";

const year = date.getFullYear();
const month = String(date.getMonth() + 1).padStart(2,"0");
const day = String(date.getDate()).padStart(2,"0");

return `${year}-${month}-${day}`;

}

function matchesDateRange(value,startDate,endDate){

if(!startDate && !endDate) return true;

const dateKey = getLocalDateKey(value);

if(!dateKey) return false;
if(startDate && dateKey < startDate) return false;
if(endDate && dateKey > endDate) return false;

return true;

}

function getRecordTime(value){

if(!value) return 0;

if(value.seconds){

const seconds = Number(value.seconds || 0) * 1000;
const nanos = Number(value.nanoseconds || 0) / 1000000;

return seconds + nanos;

}

if(value.toDate) return value.toDate().getTime();

const date = new Date(value);
return Number.isNaN(date.getTime()) ? 0 : date.getTime();

}

function getFilteredRecords(){

const keyword =
document.getElementById("searchInput")
.value.toLowerCase();

const sealFilter =
document.getElementById("sealFilter")
.value;

const statusFilter =
document.getElementById("statusFilter")
?.value || "";

const projectFilter =
(document.getElementById("projectFilter")?.value || "").toLowerCase();

const formFilter =
(document.getElementById("formFilter")?.value || "").toLowerCase();

const borrowDateStart =
document.getElementById("borrowDateStart")
.value;

const borrowDateEnd =
document.getElementById("borrowDateEnd")
.value;

const returnDateStart =
document.getElementById("returnDateStart")
.value;

const returnDateEnd =
document.getElementById("returnDateEnd")
.value;

return records
.filter(r=>{

const keywordMatch =

(r.borrower || "")
.toLowerCase()
.includes(keyword)

||

(r.department || "")
.toLowerCase()
.includes(keyword)

||

(r.purpose || "")
.toLowerCase()
.includes(keyword)

||

(r.projectNo || "")
.toLowerCase()
.includes(keyword)

||

(r.formNo || "")
.toLowerCase()
.includes(keyword);

const sealMatch =

!sealFilter ||

r.seal === sealFilter;

const projectMatch =
!projectFilter ||
((r.projectNo || "").toLowerCase().includes(projectFilter));

const formMatch =
!formFilter ||
((r.formNo || "").toLowerCase().includes(formFilter));

const borrowMatch =
matchesDateRange(
r.borrowTime,
borrowDateStart,
borrowDateEnd
);

const returnMatch =
matchesDateRange(
r.returnTime,
returnDateStart,
returnDateEnd
);

const statusMatch =

!statusFilter ||

(statusFilter==="borrowed" && !r.returnTime) ||

(statusFilter==="returned" && r.returnTime);

return (

keywordMatch &&
sealMatch &&
projectMatch &&
formMatch &&
borrowMatch &&
returnMatch &&
statusMatch

);

})
.sort((a,b)=>{

const t1 = getRecordTime(a.borrowTime);
const t2 = getRecordTime(b.borrowTime);

return t2 - t1;

});

}

function renderTable(){

const table =
document.getElementById("recordTable");

table.innerHTML = "";

const filteredRecords =
getFilteredRecords();

const countEl =
document.getElementById("recordCount");

if(countEl){

countEl.textContent =
filteredRecords.length;

}

const totalPages =
Math.ceil(filteredRecords.length / pageSize);

if(currentPage > totalPages){
currentPage = 1;
}

const start =
(currentPage - 1) * pageSize;

const end =
start + pageSize;

const pageRecords =
filteredRecords.slice(start,end);

if(pageRecords.length===0){

table.innerHTML = `
<tr>
<td class="table-empty-cell" colspan="${currentRole === "viewer" ? 9 : 10}">
${records.length === 0 ? "目前無借用紀錄" : "查無借用紀錄"}
</td>
</tr>
`;

renderPagination(totalPages);
return;

}

pageRecords.forEach(r=>{

const tr =
document.createElement("tr");

tr.innerHTML = `

<td>${r.seal}</td>

<td>${r.borrower}</td>

<td>${r.department}</td>

<td>${r.projectNo || ""}</td>

<td>${r.formNo || ""}</td>

<td>${r.purpose}</td>

<td>${formatTableDate(r.borrowTime)}</td>

<td>${formatTableDate(r.returnTime)}</td>

<td>

${r.returnTime

? '<span class="badge badge-green">已歸還</span>'

: '<span class="badge badge-red">借出中</span>'

}

</td>

<td class="record-action-column">

${currentRole === "viewer"

? ""

: r.returnTime

? `
<span style="
color:#94a3b8;
font-weight:600;
font-size:16px;
">
—
</span>
`

: `

<button
class="action-btn edit-btn tooltip"
data-tip="修改"
onclick="editRecord('${r.id}')">

<i data-lucide="pencil"></i>

</button>

<button
class="action-btn delete-btn tooltip"
data-tip="刪除"
onclick="deleteRecord('${r.id}')">

<i data-lucide="trash-2"></i>

</button>

`

}

</td>

`;

table.appendChild(tr);

});

renderPagination(totalPages);

lucide.createIcons();

}


function renderPagination(totalPages){

const area =
document.getElementById("paginationArea");

area.innerHTML = "";

if(totalPages <= 1) return;

function createPageButton(label,page,disabled=false,active=false){

const btn =
document.createElement("button");

btn.className = "btn";

btn.innerText = label;

btn.disabled = disabled;

btn.style.background =
active
? "#2563eb"
: disabled
? "#f1f5f9"
: "#e2e8f0";

btn.style.color =
active
? "white"
: disabled
? "#94a3b8"
: "black";

btn.style.cursor =
disabled
? "not-allowed"
: "pointer";

btn.onclick = ()=>{

if(disabled) return;

currentPage = page;
renderTable();

};

return btn;

}

area.appendChild(
createPageButton("上一頁",currentPage - 1,currentPage === 1)
);

for(let i=1;i<=totalPages;i++){

area.appendChild(
createPageButton(i,i,false,i === currentPage)
);

}

area.appendChild(
createPageButton("下一頁",currentPage + 1,currentPage === totalPages)
);

}

function changePageSize(){

pageSize = parseInt(
document.getElementById("pageSizeSelect").value
);

currentPage = 1;

renderTable();

}




function closeEditModal(){
document.getElementById('editOverlay').style.display='none';
}

async function editRecord(id){
if(blockViewerAction()) return;

const r = records.find(x=>x.id===id);
if(!r || r.returnTime){ alert('已歸還資料不可編輯'); return; }

document.getElementById('editId').value=id;
document.getElementById('editBorrower').value=r.borrower||'';
document.getElementById('editDepartment').value=r.department||'';
document.getElementById('editProjectNo').value=r.projectNo||'';
document.getElementById('editFormNo').value=r.formNo||'';
document.getElementById('editExpectedReturnTime').value=formatDateTimeLocal(r.expectedReturnTime);
document.getElementById('editPurpose').value=r.purpose||'';

document.getElementById('editOverlay').style.display='flex';
}

async function saveEditRecord(){
if(blockViewerAction()) return;

const id=document.getElementById('editId').value;

const before =
records.find(item=>item.id===id);

const after = {
borrower:document.getElementById('editBorrower').value,
department:document.getElementById('editDepartment').value,
projectNo:document.getElementById('editProjectNo').value,
formNo:document.getElementById('editFormNo').value,
purpose:document.getElementById('editPurpose').value,
expectedReturnTime:parseDateTimeLocal(document.getElementById('editExpectedReturnTime').value)
};

await updateDoc(
doc(db,"sealRecords",id),
{
...after,
expectedReturnTime:after.expectedReturnTime || deleteField()
}
);

await writeAuditLog({
action:"update",
category:"sealRecord",
targetId:id,
targetLabel:`${before?.seal || "印鑑"} / ${after.borrower}`,
before,
after:{
...before,
...after
}
});

closeEditModal();
alert('修改成功');
loadRecords();
}

async function deleteRecord(id){

if(blockViewerAction()) return;

const r = records.find(x=>x.id===id);

if(r && r.returnTime){
alert("已歸還資料不可刪除");
return;
}

if(!confirm("確定刪除此借用紀錄？")) return;

await deleteDoc(doc(db,"sealRecords",id));

await writeAuditLog({
action:"delete",
category:"sealRecord",
targetId:id,
targetLabel:`${r?.seal || "印鑑"} / ${r?.borrower || id}`,
before:r
});

alert("刪除成功");
loadRecords();
}


async function exportExcel(){

if(blockViewerAction()) return;

try{await ensureXlsx();}catch(error){console.error(error);return alert("Excel 元件載入失敗，請確認網路後再試");}

const borrowStart =
document.getElementById("borrowDateStart").value;

const borrowEnd =
document.getElementById("borrowDateEnd").value;

const returnStart =
document.getElementById("returnDateStart").value;

const returnEnd =
document.getElementById("returnDateEnd").value;

if(
(borrowStart && borrowEnd && borrowStart > borrowEnd) ||
(returnStart && returnEnd && returnStart > returnEnd)
){
alert("日期區間的起日不可晚於迄日");
return;
}

const filteredRecords =
getFilteredRecords();

if(filteredRecords.length===0){
alert("目前篩選條件沒有可匯出的資料");
return;
}

const data =
filteredRecords.map(r=>({

印鑑:r.seal,
借用人:r.borrower,
部門:r.department,
計畫編號:r.projectNo || "",
表單編號:r.formNo || "",
借用時間:formatDate(r.borrowTime),
歸還時間:formatDate(r.returnTime),
用途:r.purpose,
狀態:r.returnTime ? "已歸還" : "借出中"

}));

const ws =
XLSX.utils.json_to_sheet(data);

ws["!cols"] = [
{wch:16},
{wch:14},
{wch:16},
{wch:18},
{wch:18},
{wch:20},
{wch:20},
{wch:36},
{wch:12}
];

if(ws["!ref"]){
ws["!autofilter"] = {ref:ws["!ref"]};
}

const wb =
XLSX.utils.book_new();

XLSX.utils.book_append_sheet(
wb,
ws,
"印鑑借用紀錄"
);

XLSX.writeFile(
wb,
`印鑑借用紀錄_${getLocalDateKey(new Date())}.xlsx`
);

}

window.borrowSeal = borrowSeal;
window.closeBorrowConfirmModal = closeBorrowConfirmModal;
window.confirmBorrowSeal = confirmBorrowSeal;
window.cancelPendingTransfer = cancelPendingTransfer;
window.startInlineBorrowEdit = startInlineBorrowEdit;
window.cancelInlineBorrowEdit = cancelInlineBorrowEdit;
window.saveInlineBorrowEdit = saveInlineBorrowEdit;
window.openReturnModal = openReturnModal;
window.closeReturnModal = closeReturnModal;
window.confirmReturnSeal = confirmReturnSeal;
window.exportExcel = exportExcel;
window.editRecord = editRecord;
window.deleteRecord = deleteRecord;
window.closeEditModal=closeEditModal;
window.saveEditRecord=saveEditRecord;

window.addSeal = addSeal;
window.deleteSeal = deleteSeal;
window.moveUp = moveUp;
window.moveDown = moveDown;

window.addDepartment = addDepartment;
window.deleteDepartment = deleteDepartment;
window.moveDeptUp = moveDeptUp;
window.moveDeptDown = moveDeptDown;

document.getElementById("borrowSealSearch")
.addEventListener("input",renderStatus);

document.getElementById("searchInput")
.addEventListener("input",renderTable);

document.getElementById("sealFilter")
.addEventListener("change",renderTable);

document.getElementById("statusFilter")
.addEventListener("change",renderTable);

document.getElementById("projectFilter")
.addEventListener("input",renderTable);

document.getElementById("formFilter")
.addEventListener("input",renderTable);

[
"borrowDateStart",
"borrowDateEnd",
"returnDateStart",
"returnDateEnd"
].forEach(id=>{

document.getElementById(id)
.addEventListener("change",()=>{
currentPage = 1;
renderTable();
});

});

document.getElementById("auditSearch")
.addEventListener("input",()=>{
auditCurrentPage = 1;
renderAuditLogs();
});

[
"auditActionFilter",
"auditDateStart",
"auditDateEnd"
].forEach(id=>{

document.getElementById(id)
.addEventListener("change",()=>{
auditCurrentPage = 1;
if(id === "auditDateStart" || id === "auditDateEnd"){
loadAuditLogs(true);
}else{
renderAuditLogs();
}
});

});

async function googleLogin(){

try{

await signInWithPopup(
auth,
provider
);

}catch(error){

alert(error.message);

}

}

window.googleLogin = googleLogin;

async function logout(){

sessionStorage.removeItem(
"loginLogged"
);

localStorage.removeItem(
"userRole"
);

localStorage.removeItem(
"userEmail"
);

localStorage.removeItem(
"userName"
);

await signOut(auth);

}


window.logout = logout;

onAuthStateChanged(auth, async(user)=>{

currentIsSystemAdmin = false;


if(!user){

document.getElementById("loginPage").style.display="flex";
document.getElementById("systemArea").style.display="none";

return;

}

const email = normalizeEmail(user.email);
const [sealPermissionSnapshot,globalUserSnapshot] = await Promise.all([
getDoc(doc(db,"sealPermissions",email)),
getDoc(doc(db,"users",user.uid))
]);

let allow = false;
let loginUserData = null;
let memberData = null;

if(
globalUserSnapshot.exists() &&
normalizeRole(globalUserSnapshot.data().role) === "admin" &&
globalUserSnapshot.data().enabled !== false
){
allow = true;
currentIsSystemAdmin = true;
currentRole = "admin";
loginUserData = {id:globalUserSnapshot.id,...globalUserSnapshot.data()};
}

if(
!allow &&
sealPermissionSnapshot.exists() &&
sealPermissionSnapshot.data().enabled !== false
){
allow = true;
loginUserData = {id:sealPermissionSnapshot.id,...sealPermissionSnapshot.data()};
currentRole = normalizeRole(loginUserData.role) || "user";
}

if(!allow){
const legacySnapshot = await getDocs(
query(
collection(db,"users"),
where("email","==",user.email),
limit(1)
)
);

if(!legacySnapshot.empty && legacySnapshot.docs[0].data().enabled === true){
allow = true;
loginUserData = {id:legacySnapshot.docs[0].id,...legacySnapshot.docs[0].data()};
currentRole = normalizeRole(loginUserData.role) || "user";
}
}

if(!allow){

alert("此帳號未開通");

await signOut(auth);

return;

}

let memberId = loginUserData?.memberId || "";

if(!memberId){
const accountSnapshot = await getDocs(
query(
collection(db,"memberAccounts"),
where("email","==",email),
limit(1)
)
);
if(!accountSnapshot.empty){
memberId = accountSnapshot.docs[0].data().memberId || accountSnapshot.docs[0].id;
}
}

if(memberId){
const memberSnapshot = await getDoc(doc(db,"members",memberId));
if(memberSnapshot.exists()) memberData = {id:memberSnapshot.id,...memberSnapshot.data()};
}

if(!currentIsSystemAdmin && memberData?.active === false){
alert("此共用人員帳號已停用，請洽系統管理員");
await signOut(auth);
return;
}

currentUser = getUserDisplayName({
departmentName:memberData?.department || memberData?.departmentName || loginUserData?.departmentName,
employeeName:memberData?.name || loginUserData?.employeeName || loginUserData?.name || user.displayName,
email:user.email
});

currentUserEmail =
user.email;

localStorage.setItem(
"userRole",
currentRole
);

localStorage.setItem(
"userEmail",
user.email
);

localStorage.setItem(
"userName",
currentUser
);

if(!sessionStorage.getItem("loginLogged")){

sessionStorage.setItem(
"loginLogged",
"true"
);

addDoc(
collection(db,"loginLogs"),
{
name:currentUser,
email:normalizeEmail(user.email),
role:currentRole,
loginTime:new Date()
}).catch(error=>console.warn("登入紀錄寫入失敗",error));

}

document.getElementById(
"sidebarUserName"
).textContent =
currentUser;

document.getElementById(
"sidebarUserEmail"
).textContent =
user.email;

document.getElementById(
"loginPage"
).style.display="none";

applyRoleAccess();
restoreLastPage();

if(!isAdminRole()){

document.getElementById(
"permissionMenu"
).style.display = "none";

document.getElementById(
"loginLogMenu"
).style.display = "none";

document.getElementById(
"auditLogMenu"
).style.display = "none";

}

if(!currentIsSystemAdmin){
document.getElementById("memberMenu").style.display = "none";
}

const systemArea = document.getElementById("systemArea");
systemArea.style.display="block";

requestAnimationFrame(()=>{
systemArea.style.opacity="1";
});

const initialDataLoads = isViewerRole()
? [loadSeals(),loadRecords(),loadPendingRecords()]
: [loadDepartments(),loadSeals(),loadRecords(),loadPendingRecords()];

Promise.allSettled(initialDataLoads).then(results=>{
results.forEach(result=>{
if(result.status === "rejected") console.error("初始資料載入失敗",result.reason);
});
});


});



/* Page-level UI initialization */

document.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('keydown', function(e){
    const k = (e.key || '').toLowerCase();

 
    if(e.ctrlKey && k === 'u') { e.preventDefault(); return false; }
    if(e.ctrlKey && k === 's') { e.preventDefault(); return false; }

    if(e.ctrlKey && e.shiftKey &&
       (k === 'i' || k === 'j' || k === 'c')) {
        e.preventDefault();
        return false;
    }
});

lucide.createIcons();

const sidebar =
document.querySelector(".sidebar");

const toggle =
document.getElementById("sidebarToggle");

/* v13 TopNav 版沒有左側 sidebar；保留相容舊版的切換程式 */
if(sidebar && toggle){

/* 還原上次狀態 */
if(
localStorage.getItem("sidebarState")
==="collapsed"
){
sidebar.classList.add("collapsed");
}

/* 切換 */
toggle.addEventListener("click",()=>{
sidebar.classList.toggle("collapsed");
localStorage.setItem(
"sidebarState",
sidebar.classList.contains("collapsed")
? "collapsed"
: "expanded"
);
});

}


let sealCalendar = null;

window.showCalendarPage = async function(element) {
    if(typeof showPage === 'function') {
        showPage('calendarPage', element);
    } else {
        // Fallback manually toggling classes if showPage is not globally accessible here
        document.querySelectorAll('.main > div').forEach(el => el.classList.add('hidden'));
        document.getElementById('calendarPage').classList.remove('hidden');
        document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
        if(element) element.classList.add('active');
    }

    if (!historyLoaded) {
        await loadHistoryRecords(true);
    }
    try{
        await loadExternalScript(
            "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js",
            ()=>typeof FullCalendar !== "undefined"
        );
    }catch(error){
        console.error(error);
        alert("行事曆元件載入失敗，請確認網路後再試。");
        return;
    }
    if (!sealCalendar) {
        initSealCalendar();
    }
    loadCalendarEvents();
};

function initSealCalendar() {
    const calendarEl = document.getElementById('sealCalendar');
    if (!calendarEl) return;
    if (typeof FullCalendar === 'undefined') {
        alert("FullCalendar 套件載入中或載入失敗，請稍後再試。");
        return;
    }
    sealCalendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'zh-tw',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,dayGridWeek,listWeek'
        },
        displayEventTime: false,
        buttonText: {
            today: '今天',
            month: '月視表',
            week: '週視表',
            list: '列表'
        },
        height: 'auto',
        events: [],
        eventClick: function(info) {
            const props = info.event.extendedProps;
            alert(`借用詳情：\n印鑑：${props.seal}\n借用人：${props.borrower}\n狀態：${props.status}\n借出時間：${props.borrowTime || '無'}\n歸還時間：${props.returnTime || '無'}`);
        }
    });
    sealCalendar.render();
}

function loadCalendarEvents() {
    if (!sealCalendar) return;
    const events = [];
    
    function toSafeDateString(val) {
        if(!val) return null;
        let d;
        if(val.seconds) d = new Date(val.seconds * 1000);
        else if (val instanceof Date) d = val;
        else d = new Date(val);
        if(isNaN(d.getTime())) return null;
        const pad = n => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00';
    }

    (typeof records !== 'undefined' ? records : []).forEach(r => {
        const isReturned = !!r.returnTime;

        let startStr = toSafeDateString(r.borrowTime || r.createdAt);
        let endStr = isReturned ? toSafeDateString(r.returnTime) : toSafeDateString(r.expectedReturnTime);
        
        if (startStr) {
            if(!endStr) {
                let d = new Date(startStr);
                d.setHours(d.getHours() + 1);
                endStr = toSafeDateString(d);
            }
            events.push({
                id: 'record_' + r.id,
                title: '[' + (isReturned ? '已歸還' : '借出中') + '] ' + r.seal + ' - ' + r.borrower,
                start: startStr,
                end: endStr,
                backgroundColor: isReturned ? '#e0e7ff' : '#ef4444',
                borderColor: isReturned ? '#a5b4fc' : '#ef4444',
                textColor: isReturned ? '#3730a3' : '#ffffff',
                classNames: isReturned ? ['fc-event-past'] : [],
                extendedProps: {
                    seal: r.seal,
                    borrower: r.borrower,
                    status: isReturned ? '已歸還' : '借出中',
                    borrowTime: formatDate(r.borrowTime || r.createdAt),
                    returnTime: r.returnTime ? formatDate(r.returnTime) : (r.expectedReturnTime ? formatDate(r.expectedReturnTime) + " (預計)" : "未定")
                }
            });
        }
    });

    (typeof pendingRecords !== 'undefined' ? pendingRecords : []).forEach(p => {
        if(p.status === '已借出' || p.status === '已取消' || p.status === '已拒絕') return;

        let startStr = toSafeDateString(p.expectedBorrowTime);
        let endStr = toSafeDateString(p.expectedReturnTime);
        
        if (!startStr && endStr) {
             let d = new Date(endStr);
             d.setHours(d.getHours() - 1);
             startStr = toSafeDateString(d);
        }
        
        if (startStr) {
            if(!endStr) {
                let d = new Date(startStr);
                d.setHours(d.getHours() + 1);
                endStr = toSafeDateString(d);
            }
            events.push({
                id: 'pending_' + p.id,
                title: '[預約待借用] ' + p.borrower,
                start: startStr,
                end: endStr,
                color: '#3b82f6',
                extendedProps: {
                    seal: '尚未選擇 (預約中)',
                    borrower: p.borrower,
                    status: '待借用'
                }
            });
        }
    });
    
    sealCalendar.getEventSources().forEach(source => source.remove());
    sealCalendar.addEventSource(events);
}

window.switchActiveRecord = function(recordId) {
selectedBorrowRecordId = recordId;
const active = records.find(record=>record.id===selectedBorrowRecordId);
if(active) {
borrowPanelMode = "read";
concurrentBorrowMode = false;
populateBorrowForm(active);
}
renderBorrowPanelState();
};
window.startConcurrentBorrow = startConcurrentBorrow;
})().catch(error=>{

console.error("系統初始化失敗",error);
alert(`系統初始化失敗：${error.message}`);

});
