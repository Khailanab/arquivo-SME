/* Arquivo & Prazos — frontend estático com Supabase + fallback demonstrativo local */
const CFG = window.APP_CONFIG || {};
const configured = CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes('SEU-PROJETO') && CFG.SUPABASE_ANON_KEY && !CFG.SUPABASE_ANON_KEY.includes('SUA-CHAVE');
const sb = configured ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage
  }
}) : null;

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const state = { user:null, profile:null, profiles:[], cases:[], holidays:[], files:[], filters:{my:'active',all:'active'}, searches:{my:'',all:'',archive:''} };

const demoProfiles = [
  {id:'u1',full_name:'Marina Costa',role:'admin'},
  {id:'u2',full_name:'João Ribeiro',role:'user'},
  {id:'u3',full_name:'Ana Martins',role:'user'},
  {id:'u4',full_name:'Carlos Lima',role:'user'}
];
const todayISO = () => new Date().toISOString().slice(0,10);
function offsetDate(days){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)}
const demoCases = [
  {id:'c1',process_number:'5012345-12.2026.8.24.0000',case_name:'Silva x Município',subject:'Contestação',owner_id:'u1',priority:'urgent',received_date:offsetDate(-10),deadline_date:offsetDate(0),deadline_mode:'business',deadline_days:8,status:'active',notes:'Revisar documentos antes do protocolo.',access_key:'ABC123DEMO',created_at:new Date().toISOString()},
  {id:'c2',process_number:'0304582-44.2026.8.24.0000',case_name:'Empresa Aurora',subject:'Resposta a ofício',owner_id:'u2',priority:'high',received_date:offsetDate(-4),deadline_date:offsetDate(2),deadline_mode:'calendar',deadline_days:6,status:'active',notes:'',created_at:new Date().toISOString()},
  {id:'c3',process_number:'5009842-09.2026.8.24.0000',case_name:'Souza',subject:'Recurso administrativo',owner_id:'u3',priority:'normal',received_date:offsetDate(-3),deadline_date:offsetDate(6),deadline_mode:'business',deadline_days:7,status:'active',notes:'',created_at:new Date().toISOString()},
  {id:'c4',process_number:'5001123-55.2026.8.24.0000',case_name:'Almeida',subject:'Manifestação',owner_id:'u1',priority:'urgent',received_date:offsetDate(-15),deadline_date:offsetDate(-1),deadline_mode:'business',deadline_days:10,status:'active',notes:'Prazo vencido em demonstração.',created_at:new Date().toISOString()},
  {id:'c5',process_number:'0201234-88.2026.8.24.0000',case_name:'Pereira',subject:'Informação técnica',office_number:'Ofício 142/2026-MP',office_date:offsetDate(-13),owner_id:'u4',priority:'normal',received_date:offsetDate(-12),deadline_date:offsetDate(-2),deadline_mode:'calendar',deadline_days:10,status:'done',completed_at:offsetDate(-2),notes:'',created_at:new Date().toISOString()}
];
const demoHolidays = [
  {id:'h1',date:'2026-09-07',name:'Independência do Brasil'},
  {id:'h2',date:'2026-10-12',name:'Nossa Senhora Aparecida'}
];

function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.classList.remove('show'),2600)}
function fmtDate(iso){if(!iso)return '—';return new Intl.DateTimeFormat('pt-BR').format(new Date(iso+'T12:00:00'))}
function fmtLong(iso){if(!iso)return '—';return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(iso+'T12:00:00')).replace('.','')}
function ownerName(id){return state.profiles.find(p=>p.id===id)?.full_name || 'Sem responsável'}
function daysDiff(iso){const a=new Date(todayISO()+'T12:00:00');const b=new Date(iso+'T12:00:00');return Math.round((b-a)/86400000)}
function deadlineState(c){const d=daysDiff(c.deadline_date);if(c.status==='done')return {label:'Concluído',cls:'done'};if(d<0)return {label:`${Math.abs(d)}d atrasado`,cls:'urgent'};if(d===0)return {label:'Vence hoje',cls:'high'};if(d<=3)return {label:`${d}d restantes`,cls:'high'};return {label:`${d}d restantes`,cls:''}}
function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}
function isHoliday(iso){return state.holidays.some(h=>h.date===iso)}
function addDays(start, amount, mode){
  let d=new Date(start+'T12:00:00'); let counted=0; amount=Number(amount||0);
  if(amount===0) return start;
  while(counted<amount){d.setDate(d.getDate()+1);const iso=d.toISOString().slice(0,10);const weekday=d.getDay();if(mode==='calendar'||(weekday!==0&&weekday!==6&&!isHoliday(iso)))counted++;}
  return d.toISOString().slice(0,10);
}

async function init(){
  bindEvents();
  setToday();

  if(!configured){
    // Demo: login screen is real-looking, any email/password enters local demo.
    showAuth();
    return;
  }

  // Não decide a tela antes de o Supabase restaurar a sessão persistida.
  const { data, error } = await sb.auth.getSession();
  if(error){
    console.error('Erro ao restaurar sessão:', error);
    state.user = null;
    state.profile = null;
    showAuth();
    return;
  }

  const session = data?.session || null;
  if(session?.user){
    state.user = session.user;
    await enterApp();
  } else {
    showAuth();
  }

  // Mantém a interface sincronizada com login, refresh de token e logout.
  sb.auth.onAuthStateChange(async (event, nextSession) => {
    if(nextSession?.user){
      const userChanged = state.user?.id !== nextSession.user.id;
      state.user = nextSession.user;
      if(userChanged || $('#app').classList.contains('hidden')){
        await enterApp();
      }
      return;
    }

    if(event === 'SIGNED_OUT'){
      state.user = null;
      state.profile = null;
      showAuth();
    }
  });
}

function showAuth(){$('#authScreen').classList.remove('hidden');$('#app').classList.add('hidden')}
async function enterApp(){
  $('#authScreen').classList.add('hidden');$('#app').classList.remove('hidden');
  if(configured) await loadRemote(); else loadDemo();
  renderAll();
}
function loadDemo(){
  state.user={id:'u1',email:'demo@setor.local'}; state.profile=demoProfiles[0];
  state.profiles=JSON.parse(localStorage.getItem('ap_profiles')||JSON.stringify(demoProfiles));
  state.cases=JSON.parse(localStorage.getItem('ap_cases')||JSON.stringify(demoCases));
  state.holidays=JSON.parse(localStorage.getItem('ap_holidays')||JSON.stringify(demoHolidays));
}
async function loadRemote(){
  const uid=state.user.id;
  let {data:profile}=await sb.from('profiles').select('*').eq('id',uid).maybeSingle();
  if(!profile){
    await sb.from('profiles').insert({id:uid,full_name:state.user.email?.split('@')[0]||'Usuário',role:'user'});
    ({data:profile}=await sb.from('profiles').select('*').eq('id',uid).single());
  }
  state.profile=profile;
  const [p,c,h]=await Promise.all([
    sb.from('profiles').select('*').eq('active',true).order('full_name'),
    sb.from('cases').select('*').order('deadline_date',{ascending:true}),
    sb.from('holidays').select('*').order('date')
  ]);
  if(p.error||c.error||h.error) toast('Há um problema de configuração no Supabase. Consulte o README.');
  state.profiles=p.data||[];state.cases=c.data||[];state.holidays=h.data||[];
}
function saveDemo(){localStorage.setItem('ap_cases',JSON.stringify(state.cases));localStorage.setItem('ap_holidays',JSON.stringify(state.holidays));}

function setToday(){
  const d=new Date();
  $('#todayWeekday').textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'long'}).format(d);
  $('#todayDate').textContent=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'}).format(d).replace('.','').toUpperCase();
  const hr=d.getHours();$('#greeting').textContent=`${hr<12?'Bom dia':hr<18?'Boa tarde':'Boa noite'}, ${state.profile?.full_name?.split(' ')[0]||''}`.trim()+'.';
  $('#receivedDate').value=todayISO();
}

function renderAll(){
  setToday();
  const p=state.profile||{full_name:'Usuário',role:'user'};
  $('#userName').textContent=p.full_name;$('#userRole').textContent=p.role==='admin'?'Administrador':'Servidor';$('#userAvatar').textContent=p.full_name?.[0]?.toUpperCase()||'U';
  $$('.admin-only').forEach(el=>el.classList.toggle('hidden-role',p.role!=='admin'));
  populateOwners();renderDashboard();renderTables();renderHolidays();renderUsers();updateDeadlinePreview();
}
function populateOwners(){
  $('#ownerId').innerHTML=state.profiles.map(p=>`<option value="${p.id}" ${p.id===state.profile?.id?'selected':''}>${escapeHtml(p.full_name)}</option>`).join('');
}
function activeCases(){return state.cases.filter(c=>c.status==='active')}
function renderDashboard(){
  const active=activeCases();const late=active.filter(c=>daysDiff(c.deadline_date)<0);const today=active.filter(c=>daysDiff(c.deadline_date)===0);const week=active.filter(c=>daysDiff(c.deadline_date)>=0&&daysDiff(c.deadline_date)<=7);const done=state.cases.filter(c=>c.status==='done');
  $('#statLate').textContent=late.length;$('#statToday').textContent=today.length;$('#statWeek').textContent=week.length;$('#statDone').textContent=done.length;
  const mine=active.filter(c=>c.owner_id===state.profile?.id);$('#myBadge').textContent=mine.length;
  const priorities=[...active].sort((a,b)=>a.deadline_date.localeCompare(b.deadline_date)).slice(0,6);
  $('#priorityList').innerHTML=priorities.length?priorities.map(c=>{const ds=deadlineState(c);return `<button class="deadline-item reset-button" data-open="${c.id}"><span class="priority-dot ${c.priority}"></span><span class="deadline-main"><strong>${escapeHtml(c.case_name)}</strong><small>${escapeHtml(c.process_number)} · ${escapeHtml(c.subject)}</small></span><span class="deadline-owner"><strong>${escapeHtml(ownerName(c.owner_id))}</strong><small>Responsável</small></span><span class="deadline-date"><strong>${fmtDate(c.deadline_date)}</strong><span class="status-${daysDiff(c.deadline_date)<0?'late':daysDiff(c.deadline_date)===0?'today':''}">${ds.label}</span></span></button>`}).join(''):`<div class="empty-state">Nenhum prazo ativo.</div>`;
  $('#priorityList').querySelectorAll('.reset-button').forEach(el=>{el.style.border='0';el.style.background='transparent';el.style.textAlign='left';el.style.width='100%';el.style.cursor='pointer'});
  const max=Math.max(1,...state.profiles.map(p=>active.filter(c=>c.owner_id===p.id).length));
  $('#teamLoad').innerHTML=state.profiles.map(p=>{const n=active.filter(c=>c.owner_id===p.id).length;return `<div class="team-row"><div class="avatar">${escapeHtml(p.full_name[0])}</div><div><strong>${escapeHtml(p.full_name)}</strong><div class="progress"><b style="width:${Math.round(n/max*100)}%"></b></div></div><strong>${n}</strong></div>`}).join('');
}
function matches(c,q){q=q.toLowerCase().trim();if(!q)return true;return [c.process_number,c.case_name,c.subject,c.office_number,c.office_date,c.access_key,c.notes,ownerName(c.owner_id)].join(' ').toLowerCase().includes(q)}
function filterCases(base,filter){return base.filter(c=>{const d=daysDiff(c.deadline_date);if(filter==='late')return d<0;if(filter==='week')return d>=0&&d<=7;return true})}
function tableHTML(rows,archive=false){
  if(!rows.length)return `<div class="empty-state">Nenhum registro encontrado.</div>`;
  return `<table class="data-table"><thead><tr><th>Processo / Caso</th><th>Assunto</th><th>Responsável</th><th>${archive?'Conclusão':'Vencimento'}</th><th>Prioridade</th><th></th></tr></thead><tbody>${rows.map(c=>{const ds=deadlineState(c);return `<tr><td class="process-cell"><strong>${escapeHtml(c.process_number)}</strong><small>${escapeHtml(c.case_name)}</small></td><td>${escapeHtml(c.subject)}</td><td>${escapeHtml(ownerName(c.owner_id))}</td><td><strong>${fmtDate(archive?c.completed_at:c.deadline_date)}</strong>${archive?'':`<br><span class="pill ${ds.cls}">${ds.label}</span>`}</td><td><span class="pill ${c.priority}">${c.priority==='urgent'?'Urgente':c.priority==='high'?'Alta':'Normal'}</span></td><td><button class="action-link" data-open="${c.id}">Abrir →</button></td></tr>`}).join('')}</tbody></table>`;
}
function renderTables(){
  let all=filterCases(activeCases(),state.filters.all).filter(c=>matches(c,state.searches.all));
  let mine=filterCases(activeCases().filter(c=>c.owner_id===state.profile?.id),state.filters.my).filter(c=>matches(c,state.searches.my));
  let archive=state.cases.filter(c=>c.status==='done').filter(c=>matches(c,state.searches.archive));
  $('#allTable').innerHTML=tableHTML(all);$('#myTable').innerHTML=tableHTML(mine);$('#archiveTable').innerHTML=tableHTML(archive,true);
}
function renderHolidays(){
  $('#holidayList').innerHTML=state.holidays.length?state.holidays.map(h=>`<div class="simple-row"><div><strong>${fmtDate(h.date)}</strong><small> · ${escapeHtml(h.name)}</small></div><button class="action-link" data-remove-holiday="${h.id}">Remover</button></div>`).join(''):`<div class="empty-state">Nenhum feriado cadastrado.</div>`;
}
function renderUsers(){
  $('#userList').innerHTML=state.profiles.map(p=>`<div class="simple-row"><div><strong>${escapeHtml(p.full_name)}</strong><small> · ${p.role==='admin'?'Administrador':'Servidor'}</small></div><span class="pill ${p.role==='admin'?'done':''}">${p.active===false?'Inativo':'Ativo'}</span></div>`).join('');
}

function switchView(name){
  $$('.view').forEach(v=>v.classList.remove('active'));$(`#view-${name}`)?.classList.add('active');$$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===name));
  const labels={dashboard:['PAINEL','Visão Geral'],myDeadlines:['PRAZOS','Meus Prazos'],allDeadlines:['PRAZOS','Todos os Prazos'],newCase:['CADASTRO','Novo Registro'],archive:['HISTÓRICO','Arquivo'],admin:['SISTEMA','Administração']};
  $('#sectionEyebrow').textContent=labels[name]?.[0]||'';$('#sectionTitle').textContent=labels[name]?.[1]||'';$('.sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});
}
function updateDeadlinePreview(){
  const start=$('#receivedDate').value;const mode=$('#deadlineMode').value;const days=$('#deadlineDays').value;const manual=$('#manualDeadline').value;
  $('#daysField').classList.toggle('hidden',mode==='manual');$('#manualField').classList.toggle('hidden',mode!=='manual');
  let end=mode==='manual'?manual:(start?addDays(start,days,mode):'');
  $('#deadlinePreview').textContent=end?fmtLong(end):'—';
  $('#deadlineExplanation').textContent=end?(mode==='manual'?'Data final informada manualmente.':`${days||0} ${mode==='business'?'dias úteis':'dias corridos'} a partir do recebimento.`):'Informe a data de recebimento e o prazo.';
  return end;
}

async function saveCase(e){
  e.preventDefault();const deadline=updateDeadlinePreview();if(!deadline)return toast('Informe um prazo válido.');
  const record={process_number:$('#processNumber').value.trim(),case_name:$('#caseName').value.trim(),subject:$('#subject').value.trim(),access_key:$('#caseAccessKey').value.trim()||null,office_number:$('#officeNumber').value.trim()||null,office_date:$('#officeDate').value||null,owner_id:$('#ownerId').value,priority:$('#priority').value,received_date:$('#receivedDate').value,deadline_date:deadline,deadline_mode:$('#deadlineMode').value,deadline_days:$('#deadlineMode').value==='manual'?null:Number($('#deadlineDays').value),status:'active',notes:$('#notes').value.trim()};
  let newCase;
  if(configured){
    const {data,error}=await sb.from('cases').insert(record).select().single();if(error)return toast('Não foi possível salvar: '+error.message);newCase=data;
    const files=[...$('#filesInput').files];
    for(const file of files){
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${newCase.id}/${crypto.randomUUID()}-${safeName}`;
      const up=await sb.storage.from('case-files').upload(path,file,{upsert:false});
      if(!up.error) await sb.from('case_files').insert({case_id:newCase.id,file_name:file.name,storage_path:path,size_bytes:file.size,mime_type:file.type,uploaded_by:state.user.id});
    }
    toast('Registro salvo com sucesso.');
    await loadRemote();
  } else {
    newCase={...record,id:'c'+Date.now(),created_at:new Date().toISOString()};state.cases.push(newCase);saveDemo();toast('Registro salvo no modo demonstrativo local.');
  }
  e.target.reset();state.files=[];$('#fileList').innerHTML='';$('#receivedDate').value=todayISO();$('#deadlineDays').value=15;renderAll();switchView('dashboard');
}
async function completeCase(id){
  const c=state.cases.find(x=>x.id===id);if(!c)return;
  if(configured){const {error}=await sb.from('cases').update({status:'done',completed_at:todayISO(),completed_by:state.user.id}).eq('id',id);if(error)return toast(error.message);await loadRemote();}
  else {c.status='done';c.completed_at=todayISO();c.completed_by=state.profile.id;saveDemo();}
  $('#caseDialog').close();renderAll();toast('Registro concluído e enviado ao arquivo.');
}
async function reopenCase(id){
  const c=state.cases.find(x=>x.id===id);if(!c)return;
  if(configured){const {error}=await sb.from('cases').update({status:'active',completed_at:null,completed_by:null}).eq('id',id);if(error)return toast(error.message);await loadRemote();}
  else {c.status='active';c.completed_at=null;c.completed_by=null;saveDemo();}
  $('#caseDialog').close();renderAll();toast('Registro reaberto.');
}
async function openCase(id){
  const c=state.cases.find(x=>x.id===id);if(!c)return;const ds=deadlineState(c);
  let files=[];if(configured){const r=await sb.from('case_files').select('*').eq('case_id',id).order('created_at');files=r.data||[];}
  $('#dialogCaseName').textContent=c.case_name;
  const keyBlock=c.access_key?`<div class="detail detail-key"><span>CHAVE EPROC</span><div class="key-line"><strong>${escapeHtml(c.access_key)}</strong><button class="action-link" data-copy-key="${escapeHtml(c.access_key)}">Copiar</button></div></div>`:`<div class="detail"><span>CHAVE EPROC</span><strong>—</strong></div>`;
  const notesBlock=`<div class="history"><p class="eyebrow dark">OBSERVAÇÕES</p><div class="history-row notes-display">${c.notes?escapeHtml(c.notes).replace(/\n/g,'<br>'):'Sem observações.'}</div></div>`;
  const filesBlock=`<div class="history"><p class="eyebrow dark">DOCUMENTOS</p>${files.length?files.map(f=>`<div class="simple-row"><strong>${escapeHtml(f.file_name)}</strong><button class="action-link" data-download="${f.id}">Abrir</button></div>`).join(''):'<div class="history-row muted">Nenhum documento anexado.</div>'}</div>`;
  const adminDelete=state.profile?.role==='admin'?`<button class="btn danger" data-delete-case="${c.id}">Excluir registro</button>`:'';
  $('#dialogBody').innerHTML=`<div class="dialog-content"><div class="detail-grid"><div class="detail"><span>PROCESSO</span><strong>${escapeHtml(c.process_number)}</strong></div><div class="detail"><span>ASSUNTO</span><strong>${escapeHtml(c.subject)}</strong></div><div class="detail"><span>Nº OFÍCIO / DOCUMENTO</span><strong>${escapeHtml(c.office_number||'—')}</strong></div><div class="detail"><span>DATA OFÍCIO / DOCUMENTO</span><strong>${fmtDate(c.office_date)}</strong></div><div class="detail"><span>RESPONSÁVEL</span><strong>${escapeHtml(ownerName(c.owner_id))}</strong></div><div class="detail"><span>STATUS</span><strong>${ds.label}</strong></div><div class="detail"><span>RECEBIMENTO</span><strong>${fmtDate(c.received_date)}</strong></div><div class="detail"><span>VENCIMENTO</span><strong>${fmtDate(c.deadline_date)}</strong></div>${keyBlock}<div class="detail"><span>TIPO DE PRAZO</span><strong>${c.deadline_mode==='business'?'Dias úteis':c.deadline_mode==='calendar'?'Dias corridos':'Data manual'}${c.deadline_days!=null?` · ${c.deadline_days} dias`:''}</strong></div></div>${notesBlock}${filesBlock}<div class="dialog-actions split-actions"><div>${adminDelete}</div><div><button class="btn ghost" onclick="document.getElementById('caseDialog').close()">Fechar</button><button class="btn secondary" data-edit-case="${c.id}">Editar registro</button><button class="btn primary" data-${c.status==='done'?'reopen':'complete'}="${c.id}">${c.status==='done'?'Reabrir registro':'Concluir e arquivar'}</button></div></div></div>`;
  $('#caseDialog').showModal();
}

function editDeadlinePreview(){
  const start=$('#editReceivedDate')?.value;const mode=$('#editDeadlineMode')?.value;const days=$('#editDeadlineDays')?.value;const manual=$('#editManualDeadline')?.value;
  $('#editDaysField')?.classList.toggle('hidden',mode==='manual');$('#editManualField')?.classList.toggle('hidden',mode!=='manual');
  const end=mode==='manual'?manual:(start?addDays(start,days,mode):'');
  if($('#editDeadlinePreview')) $('#editDeadlinePreview').textContent=end?fmtLong(end):'—';
  return end;
}

async function showEditCase(id){
  const c=state.cases.find(x=>x.id===id);if(!c)return;
  let files=[];if(configured){const r=await sb.from('case_files').select('*').eq('case_id',id).order('created_at');files=r.data||[];}
  $('#dialogCaseName').textContent='Editar · '+c.case_name;
  $('#dialogBody').innerHTML=`<form id="editCaseForm" class="dialog-content edit-form" data-case-id="${c.id}">
    <div class="form-grid two">
      <label><span>Número do processo *</span><input id="editProcessNumber" required value="${escapeHtml(c.process_number)}"></label>
      <label><span>Nome do caso *</span><input id="editCaseName" required value="${escapeHtml(c.case_name)}"></label>
      <label class="full"><span>Origem + Assunto *</span><input id="editSubject" required value="${escapeHtml(c.subject)}"></label>
      <label><span>Responsável *</span><select id="editOwnerId">${state.profiles.map(p=>`<option value="${p.id}" ${p.id===c.owner_id?'selected':''}>${escapeHtml(p.full_name)}</option>`).join('')}</select></label>
      <label><span>Prioridade</span><select id="editPriority"><option value="normal" ${c.priority==='normal'?'selected':''}>Normal</option><option value="high" ${c.priority==='high'?'selected':''}>Alta</option><option value="urgent" ${c.priority==='urgent'?'selected':''}>Urgente</option></select></label>
      <label class="full"><span>Chave do processo / Chave eproc</span><input id="editAccessKey" value="${escapeHtml(c.access_key||'')}" placeholder="Opcional"></label>
      <label><span>Nº Ofício / Despacho / Sentença</span><input id="editOfficeNumber" value="${escapeHtml(c.office_number||'')}" placeholder="Opcional"></label>
      <label><span>Data do Ofício / documento</span><input id="editOfficeDate" type="date" value="${c.office_date||''}"></label>
      <label><span>Data de recebimento *</span><input id="editReceivedDate" type="date" required value="${c.received_date}"></label>
      <label><span>Modo do prazo</span><select id="editDeadlineMode"><option value="business" ${c.deadline_mode==='business'?'selected':''}>Dias úteis</option><option value="calendar" ${c.deadline_mode==='calendar'?'selected':''}>Dias corridos</option><option value="manual" ${c.deadline_mode==='manual'?'selected':''}>Data manual</option></select></label>
      <label id="editDaysField"><span>Quantidade de dias *</span><input id="editDeadlineDays" type="number" min="0" value="${c.deadline_days??15}"></label>
      <label id="editManualField" class="${c.deadline_mode==='manual'?'':'hidden'}"><span>Data final *</span><input id="editManualDeadline" type="date" value="${c.deadline_mode==='manual'?c.deadline_date:''}"></label>
      <div class="deadline-preview full"><span>VENCIMENTO</span><strong id="editDeadlinePreview">${fmtLong(c.deadline_date)}</strong></div>
      <label class="full"><span>Observações</span><textarea id="editNotes" rows="5">${escapeHtml(c.notes||'')}</textarea></label>
    </div>
    <div class="history"><p class="eyebrow dark">DOCUMENTOS JÁ ANEXADOS</p>${files.length?files.map(f=>`<div class="simple-row"><strong>${escapeHtml(f.file_name)}</strong><button type="button" class="action-link" data-download="${f.id}">Abrir</button></div>`).join(''):'<div class="history-row muted">Nenhum documento anexado.</div>'}</div>
    <label class="upload-zone compact-upload" for="editFilesInput"><input id="editFilesInput" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"><span class="upload-icon">⇧</span><strong>Adicionar novos documentos</strong><small>Os anexos existentes serão preservados.</small></label>
    <div id="editFileList" class="file-list"></div>
    <div class="dialog-actions"><button type="button" class="btn ghost" data-cancel-edit="${c.id}">Cancelar</button><button class="btn primary" type="submit">Salvar alterações</button></div>
  </form>`;
  ['editReceivedDate','editDeadlineMode','editDeadlineDays','editManualDeadline'].forEach(x=>$('#'+x)?.addEventListener('input',editDeadlinePreview));
  $('#editFilesInput')?.addEventListener('change',e=>{$('#editFileList').innerHTML=[...e.target.files].map(f=>`<div class="file-chip"><span>${escapeHtml(f.name)}</span><span>${(f.size/1024/1024).toFixed(2)} MB</span></div>`).join('')});
  $('#editCaseForm').addEventListener('submit',saveEditedCase);
  editDeadlinePreview();
}

async function saveEditedCase(e){
  e.preventDefault();const id=e.currentTarget.dataset.caseId;const c=state.cases.find(x=>x.id===id);if(!c)return;
  const deadline=editDeadlinePreview();if(!deadline)return toast('Informe um prazo válido.');
  const patch={process_number:$('#editProcessNumber').value.trim(),case_name:$('#editCaseName').value.trim(),subject:$('#editSubject').value.trim(),access_key:$('#editAccessKey').value.trim()||null,office_number:$('#editOfficeNumber').value.trim()||null,office_date:$('#editOfficeDate').value||null,owner_id:$('#editOwnerId').value,priority:$('#editPriority').value,received_date:$('#editReceivedDate').value,deadline_date:deadline,deadline_mode:$('#editDeadlineMode').value,deadline_days:$('#editDeadlineMode').value==='manual'?null:Number($('#editDeadlineDays').value),notes:$('#editNotes').value.trim()};
  if(configured){
    const {error}=await sb.from('cases').update(patch).eq('id',id);if(error)return toast('Não foi possível editar: '+error.message);
    const files=[...($('#editFilesInput')?.files||[])];
    for(const file of files){const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${id}/${crypto.randomUUID()}-${safeName}`;const up=await sb.storage.from('case-files').upload(path,file,{upsert:false});if(!up.error)await sb.from('case_files').insert({case_id:id,file_name:file.name,storage_path:path,size_bytes:file.size,mime_type:file.type,uploaded_by:state.user.id});}
    await loadRemote();
  }else{Object.assign(c,patch);saveDemo();}
  renderAll();toast('Alterações salvas.');await openCase(id);
}

async function deleteCase(id){
  if(state.profile?.role!=='admin')return toast('Somente administradores podem excluir registros.');
  const c=state.cases.find(x=>x.id===id);if(!c)return;
  if(!confirm(`Excluir definitivamente o registro "${c.case_name}"? Esta ação não pode ser desfeita.`))return;
  if(configured){
    const fr=await sb.from('case_files').select('storage_path').eq('case_id',id);const paths=(fr.data||[]).map(f=>f.storage_path).filter(Boolean);
    if(paths.length){const rm=await sb.storage.from('case-files').remove(paths);if(rm.error)return toast('Não foi possível excluir os anexos: '+rm.error.message);}
    const {error}=await sb.from('cases').delete().eq('id',id);if(error)return toast('Não foi possível excluir: '+error.message);await loadRemote();
  }else{state.cases=state.cases.filter(x=>x.id!==id);saveDemo();}
  $('#caseDialog').close();renderAll();toast('Registro excluído.');
}

function exportArchiveSpreadsheet(){
  const archived=state.cases.filter(c=>c.status==='done').sort((a,b)=>(a.completed_at||'').localeCompare(b.completed_at||''));
  if(!archived.length)return toast('Não há registros arquivados para exportar.');
  if(!window.XLSX)return toast('Não foi possível carregar o gerador de planilhas.');

  const rows=[
    ['nº Ofício','nº inquérito / proc','Data Ofício','Recebido','em Assunto','Prazo'],
    ...archived.map(c=>[
      c.office_number||'',
      c.process_number||'',
      c.office_date?fmtDate(c.office_date):'',
      c.received_date?fmtDate(c.received_date):'',
      c.subject||'',
      c.deadline_date?fmtDate(c.deadline_date):''
    ])
  ];
  const ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:24},{wch:30},{wch:14},{wch:14},{wch:42},{wch:14}];
  ws['!autofilter']={ref:`A1:F${rows.length}`};
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Arquivados');
  XLSX.writeFile(wb,`arquivo-arquivados-${todayISO()}.xlsx`);
  toast('Planilha exportada.');
}

async function downloadFile(fileId){
  if(!configured)return;
  const {data:f}=await sb.from('case_files').select('*').eq('id',fileId).single();if(!f)return;
  const {data,error}=await sb.storage.from('case-files').createSignedUrl(f.storage_path,60);if(error)return toast(error.message);window.open(data.signedUrl,'_blank','noopener');
}
async function addHoliday(e){
  e.preventDefault();const h={date:$('#holidayDate').value,name:$('#holidayName').value.trim()};
  if(configured){const {error}=await sb.from('holidays').insert(h);if(error)return toast(error.message);await loadRemote();}
  else {state.holidays.push({...h,id:'h'+Date.now()});saveDemo();}
  e.target.reset();renderAll();toast('Dia não útil adicionado.');
}
async function removeHoliday(id){
  if(configured){const {error}=await sb.from('holidays').delete().eq('id',id);if(error)return toast(error.message);await loadRemote();}
  else {state.holidays=state.holidays.filter(h=>h.id!==id);saveDemo();}
  renderAll();
}

function bindEvents(){
  $('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const email=$('#loginEmail').value,password=$('#loginPassword').value;if(configured){const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)return toast('Acesso negado: '+error.message);state.user=data.user;await enterApp();}else{loadDemo();await enterApp();toast('Modo demonstrativo: dados ficam somente neste navegador.')}});
  $('#logoutBtn').addEventListener('click',async()=>{if(configured)await sb.auth.signOut();state.user=null;state.profile=null;showAuth()});
  $('#toggleLoginPassword').addEventListener('click',()=>{const i=$('#loginPassword');i.type=i.type==='password'?'text':'password'});
  document.addEventListener('click',e=>{
    const nav=e.target.closest('[data-view]');if(nav)switchView(nav.dataset.view);
    const go=e.target.closest('[data-go]');if(go)switchView(go.dataset.go);
    const open=e.target.closest('[data-open]');if(open)openCase(open.dataset.open);
    const comp=e.target.closest('[data-complete]');if(comp)completeCase(comp.dataset.complete);
    const reopen=e.target.closest('[data-reopen]');if(reopen)reopenCase(reopen.dataset.reopen);
    const edit=e.target.closest('[data-edit-case]');if(edit)showEditCase(edit.dataset.editCase);
    const cancelEdit=e.target.closest('[data-cancel-edit]');if(cancelEdit)openCase(cancelEdit.dataset.cancelEdit);
    const del=e.target.closest('[data-delete-case]');if(del)deleteCase(del.dataset.deleteCase);
    const copy=e.target.closest('[data-copy-key]');if(copy){navigator.clipboard?.writeText(copy.dataset.copyKey);toast('Chave copiada.');}
    const dl=e.target.closest('[data-download]');if(dl)downloadFile(dl.dataset.download);
    const rh=e.target.closest('[data-remove-holiday]');if(rh)removeHoliday(rh.dataset.removeHoliday);
    const seg=e.target.closest('.segment');if(seg){const view=seg.closest('.view');view.querySelectorAll('.segment').forEach(x=>x.classList.remove('active'));seg.classList.add('active');const target=view.id.includes('my')?'my':'all';state.filters[target]=seg.dataset.filter;renderTables();}
  });
  $('#mobileMenu').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));
  $('#caseForm').addEventListener('submit',saveCase);$('#holidayForm').addEventListener('submit',addHoliday);
  ['receivedDate','deadlineMode','deadlineDays','manualDeadline'].forEach(id=>$('#'+id).addEventListener('input',updateDeadlinePreview));
  $('#filesInput').addEventListener('change',e=>{$('#fileList').innerHTML=[...e.target.files].map(f=>`<div class="file-chip"><span>${escapeHtml(f.name)}</span><span>${(f.size/1024/1024).toFixed(2)} MB</span></div>`).join('')});
  $$('.table-search').forEach(i=>i.addEventListener('input',()=>{state.searches[i.dataset.target]=i.value;renderTables()}));
  $('#globalSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){state.searches.all=e.target.value;switchView('allDeadlines');renderTables()}});
  $('#closeDialog').addEventListener('click',()=>$('#caseDialog').close());
  $('#exportArchiveBtn')?.addEventListener('click',exportArchiveSpreadsheet);
}

init();
