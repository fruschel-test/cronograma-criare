import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  CalendarClock, Check, LogIn, LogOut, Plus, RefreshCw, Search, ShieldCheck,
  Users, CalendarDays, LayoutDashboard, Pencil, X, Save
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type { Client, Project } from "./types/database";
import criareLogo from "./assets/logo-criare.png";

type Page = "dashboard" | "clients" | "projects" | "admin";
type ManualTimeline = { firstContact?: string; briefing?: string; contractSigned?: string; conferenceScheduled?: string; technicalBookletSigned?: string; orderPlaced?: string };

function isoDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function easterSunday(year: number) {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(year,month-1,day);
}
function holidaySet(year: number) {
  const fixed = [`${year}-01-01`,`${year}-04-21`,`${year}-05-01`,`${year}-09-07`,`${year}-09-20`,`${year}-10-12`,`${year}-11-02`,`${year}-11-15`,`${year}-11-20`,`${year}-12-25`];
  const easter=easterSunday(year); const goodFriday=new Date(easter); goodFriday.setDate(easter.getDate()-2);
  return new Set([...fixed,isoDate(goodFriday)]);
}
function isBusinessDay(date: Date) {
  if (date.getDay()===0 || date.getDay()===6) return false;
  return !holidaySet(date.getFullYear()).has(isoDate(date));
}
function addBusinessDays(value: string | undefined, days: number): string {
  if (!value) return "";
  const [y,m,d]=value.slice(0,10).split('-').map(Number); const date=new Date(y,m-1,d); let added=0;
  while(added<days){ date.setDate(date.getDate()+1); if(isBusinessDay(date)) added++; }
  return isoDate(date);
}
function workdaysBetween(from: string, to: string) {
  if(!from || !to) return null;
  const [fy,fm,fd]=from.split('-').map(Number), [ty,tm,td]=to.split('-').map(Number);
  const start=new Date(fy,fm-1,fd), end=new Date(ty,tm-1,td); const sign=end>=start?1:-1;
  let count=0, cur=new Date(start); while(cur.getTime()!==end.getTime()){cur.setDate(cur.getDate()+sign); if(isBusinessDay(cur)) count+=sign; if(Math.abs(count)>10000) break;}
  return count;
}
function formatCountdown(date: string) {
  if(!date) return "—";
  const today=isoDate(new Date()); const n=workdaysBetween(today,date);
  if(n===null) return "—"; if(n<0) return `${Math.abs(n)} dia(s) útil(eis) em atraso`; if(n===0) return "Vence hoje"; return `${n} dia(s) útil(eis)`;
}
function countdownClass(date: string) { if(!date) return ""; const n=workdaysBetween(isoDate(new Date()),date); return n!==null&&n<0?"timeline-overdue":n!==null&&n<=7?"timeline-soon":"timeline-ok"; }
function readTimeline(project: Project): ManualTimeline { return ((project as Project & {timeline?: ManualTimeline}).timeline ?? {}); }
type TimelineStage = { key: string; label: string; date: string | undefined; kind: "manual" | "auto"; rule?: string };
function calculatedStages(manual: ManualTimeline): TimelineStage[] {
  const anteprojeto=addBusinessDays(manual.briefing,7);
  const envelope=addBusinessDays(manual.contractSigned,2);
  const cadernoApproval=addBusinessDays(manual.conferenceScheduled,10);
  const cadernoChanges=addBusinessDays(cadernoApproval,2);
  const delivery=addBusinessDays(manual.contractSigned,40);
  const assembly=addBusinessDays(delivery,1);
  return [
    {key:"firstContact",label:"1º contato do cliente",date:manual.firstContact,kind:"manual"},
    {key:"briefing",label:"Briefing + medidas iniciais",date:manual.briefing,kind:"manual"},
    {key:"anteproject",label:"Apresentação do anteprojeto",date:anteprojeto,kind:"auto",rule:"7 dias úteis após o briefing"},
    {key:"contractSigned",label:"Assinatura do contrato",date:manual.contractSigned,kind:"manual"},
    {key:"envelope",label:"Entrega do envelope + e-mail de venda ao setor técnico",date:envelope,kind:"auto",rule:"2 dias úteis após a assinatura do contrato"},
    {key:"conferenceScheduled",label:"Agendamento da medição de conferência",date:manual.conferenceScheduled,kind:"manual"},
    {key:"cadernoApproval",label:"Entrega do caderno técnico para aprovação",date:cadernoApproval,kind:"auto",rule:"10 dias úteis após o agendamento da conferência"},
    {key:"cadernoChanges",label:"Entrega do caderno técnico com alterações",date:cadernoChanges,kind:"auto",rule:"2 dias úteis após a entrega para aprovação"},
    {key:"technicalBookletSigned",label:"Assinatura do caderno técnico final",date:manual.technicalBookletSigned,kind:"manual"},
    {key:"orderPlaced",label:"Pedido implantado (fábrica + extras)",date:manual.orderPlaced,kind:"manual"},
    {key:"delivery",label:"Entrega prevista",date:delivery,kind:"auto",rule:"40 dias úteis após a assinatura do contrato"},
    {key:"assembly",label:"Montagem prevista",date:assembly,kind:"auto",rule:"1 dia útil após a entrega prevista"},
  ];
}

function stageSectorClass(index: number) {
  if (index <= 3 || index === 8) return "sector-comercial";
  if (index >= 4 && index <= 7) return "sector-conferencia";
  return "sector-logistica";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}
function daysUntil(value: string | null | undefined) {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [role, setRole] = useState("viewer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState<Page>("dashboard");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectModalMode, setProjectModalMode] = useState<"details" | "timeline" | null>(null);
  const [projectFilterId, setProjectFilterId] = useState<string>("all");
  const [timelineDraft, setTimelineDraft] = useState<ManualTimeline>({});
  const [timelineSaving, setTimelineSaving] = useState(false);
  const [auditEntries, setAuditEntries] = useState<Array<{id:string; action:string; changed_at:string; actor_email:string|null; summary:string}>>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [userProfiles, setUserProfiles] = useState<Array<{id:string; role:string; email:string|null}>>([]);

  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectClientId, setProjectClientId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [contractNumber, setContractNumber] = useState("");

  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  const canEdit = role === "admin" || role === "editor";

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) void loadData();
    else {
      setProjects([]);
      setClients([]);
      setRole("viewer");
    }
    // loadData reads current authenticated session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function loadData() {
    if (!supabase) return;
    setLoading(true);
    setError("");
    const [clientResult, projectResult, profileResult] = await Promise.all([
      supabase.from("clients").select("id,name,email,phone,created_at").order("name"),
      supabase.from("projects").select("*, clients(id,name)").order("created_at", { ascending: false }),
      supabase.from("profiles").select("role").eq("id", session?.user.id ?? "").maybeSingle()
    ]);
    if (clientResult.error) setError(`Clientes: ${clientResult.error.message}`);
    else setClients((clientResult.data ?? []) as Client[]);
    if (projectResult.error) setError(`Projetos: ${projectResult.error.message}`);
    else setProjects((projectResult.data ?? []) as Project[]);
    if (profileResult.error) setError(`Perfil: ${profileResult.error.message}`);
    else setRole(profileResult.data?.role ?? "viewer");
    setLoading(false);
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setAuthMessage("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setAuthMessage("Não foi possível entrar. Confira suas credenciais ou peça um convite ao administrador.");
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
  }

  async function saveClient(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !canEdit || !clientName.trim()) return;
    setError("");
    setNotice("");
    const payload = {
      name: clientName.trim(),
      email: clientEmail.trim() || null,
      phone: clientPhone.trim() || null
    };
    const result = editingClientId
      ? await supabase.from("clients").update(payload).eq("id", editingClientId)
      : await supabase.from("clients").insert(payload);
    if (result.error) {
      setError(`Não foi possível salvar o cliente: ${result.error.message}`);
      return;
    }
    setNotice(editingClientId ? "Cliente atualizado com sucesso." : "Cliente cadastrado com sucesso.");
    resetClientForm();
    await loadData();
  }

  function resetClientForm() {
    setShowClientForm(false);
    setEditingClientId(null);
    setClientName("");
    setClientEmail("");
    setClientPhone("");
  }

  function startEditClient(client: Client) {
    setEditingClientId(client.id);
    setClientName(client.name);
    setClientEmail(client.email ?? "");
    setClientPhone(client.phone ?? "");
    setShowClientForm(true);
    setNotice("");
    setError("");
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !canEdit || !projectClientId || !projectName.trim()) return;
    setError("");
    setNotice("");
    const { error: insertError } = await supabase.from("projects").insert({
      client_id: projectClientId,
      name: projectName.trim(),
      contract_number: contractNumber.trim() || null,
      status: "ativo"
    });
    if (insertError) {
      setError(`Não foi possível criar o projeto: ${insertError.message}`);
      return;
    }
    setShowProjectForm(false);
    setProjectName("");
    setContractNumber("");
    setProjectClientId("");
    setNotice("Projeto cadastrado com sucesso.");
    setPage("projects");
    await loadData();
  }

  async function openTimeline(project: Project, mode: "details" | "timeline" = "timeline") {
    setPage("projects");
    setSelectedProjectId(project.id);
    setProjectModalMode(mode);
    setTimelineDraft({ ...readTimeline(project) });
    setAuditEntries([]);
    setAuditLoading(true);
    setError(""); setNotice("");
    // O histórico de auditoria é opcional. Não consultar project_audit_log
    // até que a tabela seja criada no Supabase; abrir um projeto não deve falhar.
    setAuditEntries([]);
    setAuditLoading(false);
  }
  async function saveTimeline() {
    if (!supabase || !canEdit || !selectedProjectId) return;
    setTimelineSaving(true); setError(""); setNotice("");
    const calculated=calculatedStages(timelineDraft).find(s=>s.key==="delivery")?.date || null;
    const { error: saveError } = await supabase.from("projects").update({ timeline: timelineDraft, delivery_date: calculated || null }).eq("id", selectedProjectId);
    setTimelineSaving(false);
    if (saveError) { setError(`Não foi possível salvar o cronograma: ${saveError.message}`); return; }
    setNotice("Cronograma salvo com sucesso.");
    await loadData();
    const updated=projects.find(p=>p.id===selectedProjectId);
    if(updated) setTimelineDraft({...timelineDraft});
  }

  async function loadUserProfiles() {
    if (!supabase || role !== "admin") return;
    setError("");
    const { data, error: listError } = await supabase.from("profiles").select("id,role,email").order("role");
    if (listError) setError(`Não foi possível carregar usuários: ${listError.message}`);
    else setUserProfiles((data ?? []) as typeof userProfiles);
  }



  useEffect(() => {
    if (session && role === "admin" && page === "admin") void loadUserProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, role, page]);

  const filteredProjects = projects.filter((project) => {
    const haystack = `${project.name} ${project.contract_number ?? ""} ${project.clients?.name ?? ""}`.toLocaleLowerCase("pt-BR");
    return haystack.includes(search.toLocaleLowerCase("pt-BR")) && (projectFilterId === "all" || project.id === projectFilterId);
  });
  const filteredClients = clients.filter((client) =>
    `${client.name} ${client.email ?? ""} ${client.phone ?? ""}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))
  );

  if (!isSupabaseConfigured) {
    return <main className="setup-page"><section className="setup-card">
      <div className="brand-mark"><CalendarClock size={28} /></div>
      <p className="eyebrow">CRIARE · CONFIGURAÇÃO INICIAL</p>
      <h1>Vamos conectar seu cronograma</h1>
      <p>O frontend precisa das credenciais públicas do seu projeto Supabase.</p>
      <div className="notice"><ShieldCheck size={18} /> Nunca adicione a chave <code>service_role</code> a este frontend.</div>
    </section></main>;
  }
  if (authLoading) return <main className="center-screen">Carregando…</main>;
  if (!session) {
    return <main className="login-page"><section className="login-panel">
      <div className="brand-mark"><CalendarClock size={28} /></div>
      <p className="eyebrow">GESTÃO DE PROJETOS</p><h1>Cronograma Criare</h1>
      <p className="muted">Entre com o usuário que recebeu convite do administrador.</p>
      <form onSubmit={signIn} className="stack-form">
        <label>E-mail<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button className="primary-button" type="submit"><LogIn size={17} /> Entrar</button>
      </form>
      {authMessage && <p className="error-message">{authMessage}</p>}
      <p className="footnote">Cadastro público desativado. Para obter acesso, solicite um convite ao administrador.</p>
    </section></main>;
  }

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><img className="brand-logo" src={criareLogo} alt="Criare Moinhos" /></div>
      <div className="user-actions"><span className="user-email">{session.user.email} · {role}</span><button className="icon-button" onClick={signOut} title="Sair"><LogOut size={18} /></button></div>
    </header>
    <div className="layout">
      <aside className="sidebar">
        <p className="sidebar-label">MENU PRINCIPAL</p>
        <button className={page === "dashboard" ? "nav-item active" : "nav-item"} onClick={() => { setPage("dashboard"); setSearch(""); }}><LayoutDashboard size={18} /> Dashboard</button>
        <button className={page === "clients" ? "nav-item active" : "nav-item"} onClick={() => { setPage("clients"); setSearch(""); }}><Users size={18} /> Clientes <span className="nav-count">{clients.length}</span></button>
        <button className={page === "projects" ? "nav-item active" : "nav-item"} onClick={() => { setPage("projects"); setSearch(""); }}><CalendarDays size={18} /> Cronogramas <span className="nav-count">{projects.length}</span></button>
        {role === "admin" && <button className={page === "admin" ? "nav-item active" : "nav-item"} onClick={() => { setPage("admin"); setSearch(""); }}><ShieldCheck size={18} /> Administração</button>}
        <div className="sidebar-bottom"><ShieldCheck size={16} /><span>Permissões protegidas pelo Supabase</span></div>
      </aside>
      <section className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">{page === "dashboard" ? "VISÃO GERAL" : page === "clients" ? "RELACIONAMENTO" : page === "admin" ? "CONTROLE DE ACESSO" : "ACOMPANHAMENTO"}</p>
            <h1>{page === "dashboard" ? "Dashboard" : page === "clients" ? "Clientes" : page === "admin" ? "Administração de usuários" : "Cronogramas de projetos"}</h1>
            <p className="muted">{page === "dashboard" ? "Resumo dos projetos, clientes e prazos." : page === "clients" ? "Cadastre e mantenha os dados dos clientes." : page === "admin" ? "Convide usuários e gerencie seus papéis de acesso." : "Abra um projeto para editar datas e acompanhar os prazos úteis."}</p>
          </div>
          <div className="heading-actions">
            {page === "clients" && canEdit && <button className="primary-button" onClick={() => { resetClientForm(); setShowClientForm(true); setNotice(""); setError(""); }}><Plus size={18} /> Novo cliente</button>}
            {page === "projects" && canEdit && <button className="primary-button" onClick={() => { setShowProjectForm((v) => !v); setNotice(""); setError(""); }}><Plus size={18} /> Novo projeto</button>}
            <button className="icon-button" onClick={() => void loadData()} title="Atualizar"><RefreshCw size={17} /></button>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {notice && <div className="success-banner">{notice}</div>}

        {page === "dashboard" && (() => {
          const today = isoDate(new Date());
          const activeProjects = projects.filter(project => project.status === "ativo");
          const completedProjects = projects.filter(project => { const stages = calculatedStages(readTimeline(project)); return stages.length > 0 && stages.every(stage => Boolean(stage.date) && (stage.date || "") < today); });
          const overdueProjectsList = activeProjects.filter(project => project.delivery_date && (daysUntil(project.delivery_date) ?? 0) < 0);
          const allStages = projects.flatMap(project => calculatedStages(readTimeline(project)).map((stage,index) => ({...stage, project, index})));
          const completedStages = allStages.filter(stage => stage.date && stage.date < today).length;
          const datedUpcoming = allStages.filter(stage => stage.date && stage.date >= today).sort((a,b) => (a.date || "").localeCompare(b.date || "")).slice(0,5);
          const byClient = clients.map(client => ({name:client.name,count:projects.filter(p=>p.client_id===client.id).length})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count).slice(0,5);
          const sectorCounts = [
            {name:"Comercial",count:allStages.filter(s=>[0,1,2,3,8].includes(s.index)).length},
            {name:"Conferência",count:allStages.filter(s=>[4,5,6,7].includes(s.index)).length},
            {name:"Logística",count:allStages.filter(s=>[9,10,11].includes(s.index)).length}
          ];
          const statusCount = [
            {name:"Ativos",count:activeProjects.length,cls:"green"},
            {name:"Concluídos",count:completedProjects.length,cls:"blue"},
            {name:"Em atraso",count:overdueProjectsList.length,cls:"red"}
          ];
          return <>
            <div className="dashboard-kpis dashboard-kpis-analytics">
              <article className="dashboard-kpi"><span className="kpi-icon kpi-blue"><CalendarDays size={24}/></span><div><span>Projetos totais</span><strong>{projects.length}</strong><small>{activeProjects.length} ativos · {completedProjects.length} concluídos</small></div></article>
              <article className="dashboard-kpi"><span className="kpi-icon kpi-green"><Check size={24}/></span><div><span>Etapas concluídas</span><strong>{completedStages}/{allStages.length}</strong><small>{allStages.length ? Math.round(completedStages/allStages.length*100) : 0}% por datas informadas</small><div className="kpi-progress"><i style={{width:`${allStages.length?Math.round(completedStages/allStages.length*100):0}%`}}/></div></div></article>
              <article className="dashboard-kpi"><span className="kpi-icon kpi-orange"><CalendarClock size={24}/></span><div><span>Próximas etapas</span><strong>{datedUpcoming.length}</strong><small>com data futura ou de hoje</small></div></article>
              <article className="dashboard-kpi"><span className="kpi-icon kpi-red"><span className="warning-mark">!</span></span><div><span>Projetos em atraso</span><strong className="kpi-red-text">{overdueProjectsList.length}</strong><small>com entrega prevista vencida</small></div></article>
            </div>
            <div className="dashboard-analytics-grid">
              <section className="analytics-card"><h2>Status dos projetos</h2><div className="analytics-status-list">{statusCount.map(item=><div className="analytics-status-row" key={item.name}><i className={`analytics-dot ${item.cls}`}/><span>{item.name}</span><strong>{item.count}</strong><small>{projects.length?Math.round(item.count/projects.length*100):0}%</small></div>)}</div><div className="analytics-stacked-bar">{statusCount.map(item=><i key={item.name} className={item.cls} style={{width:`${projects.length?item.count/projects.length*100:0}%`}}/>)}</div></section>
              <section className="analytics-card"><h2>Etapas por setor</h2>{sectorCounts.map(item=><div className="analytics-bar-row" key={item.name}><span>{item.name}</span><div className="analytics-bar-track"><i style={{width:`${allStages.length?item.count/allStages.length*100:0}%`}}/></div><strong>{item.count}</strong></div>)}<p className="muted analytics-footnote">Distribuição das {allStages.length} etapas dos projetos cadastrados.</p></section>
              <section className="analytics-card"><div className="analytics-card-heading"><h2>Próximas etapas</h2><button className="text-button" onClick={()=>setPage("projects")}>Ver cronogramas →</button></div>{datedUpcoming.length===0?<p className="muted">Nenhuma etapa com data futura cadastrada.</p>:<div className="upcoming-list">{datedUpcoming.map((item,i)=><button key={`${item.project.id}-${item.key}`} className="upcoming-row" onClick={()=>void openTimeline(item.project)}><i className={`analytics-dot ${i===0?"green":i===1?"orange":"blue"}`}/><span className="upcoming-date">{formatDate(item.date)}</span><span className="upcoming-description"><strong>{item.label}</strong><small>{item.project.name} · {item.project.clients?.name ?? "Cliente"}</small></span></button>)}</div>}</section>
              <section className="analytics-card"><h2>Projetos por cliente</h2>{byClient.length===0?<p className="muted">Nenhum projeto vinculado a clientes.</p>:byClient.map(item=><div className="analytics-bar-row" key={item.name}><span title={item.name}>{item.name}</span><div className="analytics-bar-track"><i style={{width:`${Math.max(5,item.count/Math.max(...byClient.map(x=>x.count))*100)}%`}}/></div><strong>{item.count}</strong></div>)}</section>
              <section className="analytics-card analytics-wide"><div className="analytics-card-heading"><h2>Projetos em destaque</h2><button className="text-button" onClick={()=>setPage("projects")}>Ver todos →</button></div><div className="analytics-project-table-wrap"><table className="analytics-project-table"><thead><tr><th>Projeto / Cliente</th><th>Contrato</th><th>Etapas com data</th><th>Progresso</th><th>Entrega prevista</th><th>Status</th></tr></thead><tbody>{projects.slice(0,8).map(project=>{const stages=calculatedStages(readTimeline(project));const done=stages.filter(s=>s.date&&s.date<today).length;const pct=Math.round(done/Math.max(1,stages.length)*100);return <tr key={project.id}><td><strong>{project.name}</strong><small>{project.clients?.name??"Cliente não identificado"}</small></td><td>{project.contract_number??"—"}</td><td>{stages.filter(s=>s.date).length}/{stages.length}</td><td><div className="table-progress"><i style={{width:`${pct}%`}}/></div><small>{pct}%</small></td><td>{formatDate(project.delivery_date??"")}</td><td><span className={`status-pill status-${project.status}`}>{project.status}</span></td></tr>})}</tbody></table></div></section>
            </div>
          </>;
        })()}

        {page === "clients" && <>
          {showClientForm && <form className="new-project-form" onSubmit={saveClient}>
            <div className="form-title-row"><h2>{editingClientId ? "Editar cliente" : "Cadastrar cliente"}</h2><button type="button" className="icon-button" onClick={resetClientForm} title="Fechar"><X size={17} /></button></div>
            <div className="form-grid">
              <label>Nome do cliente *<input value={clientName} onChange={(e) => setClientName(e.target.value)} required maxLength={160} placeholder="Nome ou razão social" /></label>
              <label>E-mail<input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="contato@cliente.com" /></label>
              <label>Telefone<input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="(00) 00000-0000" /></label>
            </div>
            <div className="form-actions"><button className="secondary-button" type="button" onClick={resetClientForm}>Cancelar</button><button className="primary-button" type="submit">{editingClientId ? "Salvar alterações" : "Cadastrar cliente"}</button></div>
          </form>}
          <section className="table-card">
            <div className="table-heading"><div><h2>Todos os clientes</h2><p className="muted">{filteredClients.length} cliente(s)</p></div><div className="table-tools"><label className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome, e-mail ou telefone" /></label></div></div>
            {loading ? <div className="empty-state">Carregando clientes…</div> : filteredClients.length === 0 ? <div className="empty-state"><Users size={28} /><strong>Nenhum cliente encontrado</strong><span>{clients.length === 0 ? "Cadastre o primeiro cliente para começar." : "Tente alterar os termos da pesquisa."}</span>{canEdit && !showClientForm && <button className="primary-button" onClick={() => setShowClientForm(true)}><Plus size={17} /> Novo cliente</button>}</div> :
              <div className="table-scroll"><table><thead><tr><th>Cliente</th><th>E-mail</th><th>Telefone</th><th>Projetos</th><th>Ações</th></tr></thead><tbody>{filteredClients.map((client) => <tr key={client.id}><td className="project-name">{client.name}</td><td>{client.email ?? "—"}</td><td>{client.phone ?? "—"}</td><td>{projects.filter((p) => p.client_id === client.id).length}</td><td>{canEdit ? <button className="secondary-button compact-button" onClick={() => startEditClient(client)}><Pencil size={14} /> Editar</button> : "—"}</td></tr>)}</tbody></table></div>}
          </section>
        </>}

        {page === "projects" && <>
          {showProjectForm && <form className="new-project-form" onSubmit={createProject}>
            <div className="form-title-row"><h2>Cadastrar projeto</h2><button type="button" className="icon-button" onClick={() => setShowProjectForm(false)} title="Fechar"><X size={17} /></button></div>
            {clients.length === 0 ? <div className="empty-inline">Cadastre um cliente antes de criar um projeto. <button type="button" className="secondary-button" onClick={() => { setPage("clients"); setShowProjectForm(false); }}>Ir para Clientes</button></div> : <>
              <div className="form-grid">
                <label>Cliente *<select value={projectClientId} onChange={(e) => setProjectClientId(e.target.value)} required><option value="">Selecione um cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
                <label>Nome do projeto *<input value={projectName} onChange={(e) => setProjectName(e.target.value)} required placeholder="Ex.: Cozinha e área gourmet" /></label>
                <label>Número do contrato<input value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} placeholder="Opcional" /></label>
              </div>
              <div className="form-actions"><button className="secondary-button" type="button" onClick={() => setShowProjectForm(false)}>Cancelar</button><button className="primary-button" type="submit">Salvar projeto</button></div>
            </>}
          </form>}
          <section className="projects-timeline-list">
            <div className="table-heading"><div><h2>Todos os projetos</h2><p className="muted">{filteredProjects.length} projeto(s)</p></div><div className="table-tools"><label className="project-filter-label">Projeto <select value={projectFilterId} onChange={e=>setProjectFilterId(e.target.value)}><option value="all">Todos os projetos</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, projeto ou contrato" /></label></div></div>
            {loading ? <div className="empty-state">Carregando projetos…</div> : filteredProjects.length === 0 ? <div className="empty-state"><CalendarClock size={28}/><strong>Nenhum projeto encontrado</strong><span>Os projetos cadastrados aparecerão aqui.</span></div> : filteredProjects.map(project => {
              const stages = calculatedStages(readTimeline(project));
              const today = isoDate(new Date());
              const nextIndex = stages.findIndex(stage => stage.date && stage.date >= today);
              return <article className="dashboard-project-card project-timeline-card" key={project.id}>
                <div className="dashboard-project-title"><div><h2>{project.name}</h2><p>{project.clients?.name ?? "Cliente não identificado"}</p><div className="project-meta"><span><CalendarDays size={15}/> Contrato {project.contract_number ?? "—"}</span><span><Users size={15}/>{project.clients?.name ?? "Cliente"}</span></div></div><div className="project-card-actions"><span className={`status-pill status-${project.status}`}>{project.status}</span><button className="secondary-button compact-button" onClick={() => void openTimeline(project, "details")}><Pencil size={14}/> Abrir projeto</button></div></div>
                <div className="project-stage-scroll"><div className="dashboard-sector-groups"><span className="sector-band band-commercial" style={{gridColumn:"span 4"}}>COMERCIAL</span><span className="sector-band band-conference" style={{gridColumn:"span 4"}}>CONFERÊNCIA</span><span className="sector-band band-commercial" style={{gridColumn:"span 1"}}>COMERCIAL</span><span className="sector-band band-logistics" style={{gridColumn:"span 3"}}>LOGÍSTICA</span></div>
                <div className="dashboard-stage-arrows">{stages.map((stage,index)=>{const done=Boolean(stage.date && stage.date < today);const current=index===nextIndex;return <button key={stage.key} className={`dashboard-stage ${stageSectorClass(index)} ${done?"stage-complete":""} ${current?"stage-current":""}`} onClick={()=>void openTimeline(project)} title={`${index+1}. ${stage.label}${stage.date?` — ${formatDate(stage.date)}`:""}`}><span className="dashboard-arrow-number">{index+1}</span><span className="dashboard-stage-label">{stage.label}</span><span className="project-stage-date">{formatDate(stage.date)}</span><small className="project-stage-countdown">{stage.date?formatCountdown(stage.date):"Sem data"}</small></button>})}</div></div>
                <div className="project-card-footer"><span className="muted">Clique em uma etapa para abrir e editar as datas.</span><button className="primary-button" onClick={() => void openTimeline(project)}>Abrir cronograma</button></div>
              </article>;
            })}
          </section>
          {selectedProjectId && projectModalMode === "details" && (() => {
            const selected=projects.find(p=>p.id===selectedProjectId);
            if(!selected) return null;
            const stages=calculatedStages(readTimeline(selected));
            const dated=stages.filter(stage=>Boolean(stage.date)).length;
            const today=isoDate(new Date());
            const next=stages.find(stage=>stage.date && stage.date >= today);
            return <div className="project-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget){setProjectModalMode(null);setSelectedProjectId(null);}}}>
              <section className="project-info-modal" role="dialog" aria-modal="true" aria-label="Detalhes do projeto">
                <div className="project-modal-heading"><div><span className="eyebrow">RESUMO DO PROJETO</span><h2>{selected.name}</h2><p>{selected.clients?.name ?? "Cliente não identificado"}</p></div><button className="icon-button" onClick={()=>{setProjectModalMode(null);setSelectedProjectId(null);}} aria-label="Fechar">×</button></div>
                <div className="project-info-grid">
                  <div><span>Cliente</span><strong>{selected.clients?.name ?? "—"}</strong></div>
                  <div><span>Contrato</span><strong>{selected.contract_number ?? "Não informado"}</strong></div>
                  <div><span>Status</span><strong><span className={`status-pill status-${selected.status}`}>{selected.status}</span></strong></div>
                  <div><span>Etapas com data</span><strong>{dated} de {stages.length}</strong></div>
                </div>
                <div className="project-modal-next"><span className="eyebrow">PRÓXIMA ETAPA</span><strong>{next?.label ?? "Nenhuma etapa com data futura"}</strong><span>{next?.date ? `${formatDate(next.date)} · ${formatCountdown(next.date)}` : "Defina as datas no cronograma para acompanhar os prazos."}</span></div>
                <div className="project-modal-actions"><button className="secondary-button" onClick={()=>{setProjectModalMode(null);setSelectedProjectId(null);}}>Fechar</button><button className="primary-button" onClick={()=>{setTimelineDraft({...readTimeline(selected)});setProjectModalMode("timeline");}}>Abrir cronograma <CalendarDays size={16}/></button></div>
              </section>
            </div>;
          })()}
          {selectedProjectId && projectModalMode === "timeline" && (() => {
            const selected=projects.find(p=>p.id===selectedProjectId);
            if(!selected) return null;
            const stages=calculatedStages(timelineDraft);
            const groupFor=(index:number)=>index<4 || index===8 ? "Comercial" : index<8 ? "Conferência" : "Logística";
            const groupClass=(index:number)=>index<4 || index===8 ? "commercial" : index<8 ? "conference" : "logistics";
            const dated=stages.filter(stage=>Boolean(stage.date)).length;
            return <div className="project-modal-backdrop timeline-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget){setProjectModalMode(null);setSelectedProjectId(null);}}}>
              <section className="timeline-editor-page" role="dialog" aria-modal="true" aria-label="Editar cronograma">
                <header className="editor-page-header">
                  <div><div className="editor-breadcrumb">Projetos <span>/</span> {selected.name} <span>/</span> Editar cronograma</div><h2>Editar cronograma</h2><p>Configure etapas, datas e responsáveis do projeto</p></div>
                  <div className="editor-header-actions"><button className="secondary-button" onClick={()=>{setProjectModalMode(null);setSelectedProjectId(null);}}>Cancelar</button>{canEdit && <button className="primary-button" disabled={timelineSaving} onClick={()=>void saveTimeline()}><Save size={16}/>{timelineSaving?"Salvando…":"Salvar alterações"}</button>}</div>
                </header>
                <div className="timeline-editor-layout">
                  <main className="timeline-editor-main">
                    <section className="editor-panel project-data-panel">
                      <h3>Dados do projeto</h3>
                      <div className="project-data-fields">
                        <label>Projeto <b>*</b><input value={selected.name} readOnly /></label>
                        <label>Cliente <b>*</b><input value={selected.clients?.name ?? ""} readOnly /></label>
                        <label>Contrato<input value={selected.contract_number ?? ""} readOnly placeholder="Não informado" /></label>
                        <label>Responsável<input value="—" readOnly /></label>
                        <label>Status <b>*</b><input value={selected.status === "ativo" ? "Ativo" : selected.status} readOnly className="status-input" /></label>
                      </div>
                    </section>
                    <section className="editor-panel editor-stages-panel">
                      <div className="editor-panel-title"><h3>Etapas do cronograma</h3><span>As datas automáticas são calculadas a partir das etapas-base.</span></div>
                      <div className="editor-stage-table-wrap">
                        <div className="editor-stage-table">
                          <div className="editor-stage-head"><span>#</span><span>Descrição da etapa</span><span>Grupo</span><span>Data prevista</span><span>Responsável</span><span>Ações</span></div>
                          {stages.map((stage,index)=>{
                            const editable=stage.kind==="manual"; const value=stage.date || "";
                            return <div className="editor-stage-row" key={stage.key}>
                              <span className="editor-grip">⠿</span>
                              <span className="editor-stage-title"><b className={`editor-stage-number ${groupClass(index)}`}>{index+1}</b><span>{stage.label}</span></span>
                              <span className="editor-stage-group"><i className={groupClass(index)} />{groupFor(index)}</span>
                              <span className="editor-stage-date">{editable && canEdit ? <input aria-label={stage.label} type="date" value={value} onChange={e=>setTimelineDraft(prev=>({...prev,[stage.key]:e.target.value}))}/> : <span>{formatDate(value)}</span>}</span>
                              <span className="editor-stage-owner">—</span>
                              <span className="editor-stage-actions"><button type="button" title="Duplicar etapa" disabled aria-label="Duplicar etapa">▢</button><button type="button" title="Remover etapa" disabled aria-label="Remover etapa">×</button></span>
                            </div>;
                          })}
                        </div>
                      </div>
                      <p className="editor-stage-footnote">As 12 etapas padrão estão configuradas. A ordem e os grupos seguem o modelo atual do cronograma.</p>
                    </section>
                  </main>
                  <aside className="timeline-editor-sidebar">
                    <section className="editor-panel preview-panel">
                      <h3>Prévia do cronograma</h3>
                      <div className="editor-sector-bands"><span className="commercial" style={{gridColumn:"span 4"}}>COMERCIAL</span><span className="conference" style={{gridColumn:"span 4"}}>CONFERÊNCIA</span><span className="commercial"> </span><span className="logistics" style={{gridColumn:"span 3"}}>LOGÍSTICA</span></div>
                      <div className="editor-mini-arrows">{stages.map((stage,index)=><span key={stage.key} className={`editor-mini-arrow ${groupClass(index)}`}>{index+1}</span>)}</div>
                      <div className="editor-legend"><span><i className="commercial"/>Comercial</span><span><i className="conference"/>Conferência</span><span><i className="logistics"/>Logística</span></div>
                    </section>
                    <section className="editor-panel editor-validation-panel">
                      <h3>Validações</h3>
                      <div className="editor-validation-item"><span className="validation-icon good">✓</span><div><strong>12 etapas cadastradas</strong><p>O cronograma possui {stages.length} etapas.</p></div></div>
                      <div className="editor-validation-item"><span className="validation-icon warn">!</span><div><strong>{dated===stages.length?"Todas as datas definidas":"Datas ainda não definidas"}</strong><p>{dated===stages.length?"Todas as etapas possuem uma data.":`Defina as datas previstas para as etapas (${dated} de ${stages.length} preenchidas).`}</p></div></div>
                      <div className="editor-validation-item"><span className="validation-icon info">i</span><div><strong>Verifique a sequência das etapas</strong><p>Confirme se as datas e dependências estão corretas.</p></div></div>
                    </section>
                    <section className="editor-panel editor-settings-panel"><h3>Configurações</h3><label><input type="checkbox" checked readOnly/> Contar apenas dias úteis</label><p>Os prazos são calculados considerando dias úteis, fins de semana e feriados configurados no aplicativo.</p><label className="holiday-label">Feriados / calendário</label><select value="rs" disabled><option value="rs">Feriados nacionais e locais (Rio Grande do Sul)</option></select><small>Utilizado para o cálculo de prazos e dias decorridos.</small></section>
                  </aside>
                </div>
                {!canEdit && <p className="muted">Seu perfil é somente leitura; solicite acesso de editor para alterar datas.</p>}
              </section>
            </div>;
          })()}
        </>}

        <p className="security-note"><ShieldCheck size={15} /> Dados protegidos pelas políticas de acesso do Supabase. Perfil atual: {role}.</p>
      </section>
    </div>
  </main>;
}
export default App;