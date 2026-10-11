import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  CalendarClock, LogIn, LogOut, Plus, RefreshCw, Search, ShieldCheck,
  Users, CalendarDays, LayoutDashboard, Pencil, X
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

  async function openTimeline(project: Project) {
    setSelectedProjectId(project.id);
    setTimelineDraft({ ...readTimeline(project) });
    setAuditEntries([]);
    setAuditLoading(true);
    setError(""); setNotice("");
    if (supabase) {
      const { data, error: auditError } = await supabase
        .from("project_audit_log")
        .select("id,action,changed_at,actor_email,summary")
        .eq("project_id", project.id)
        .order("changed_at", { ascending: false })
        .limit(20);
      if (auditError) {
        // O histórico é opcional. Se a tabela ainda não foi criada no Supabase,
        // não bloqueie a tela de Cronogramas nem mostre erro global.
        const missingAuditTable = auditError.message.includes("project_audit_log") || auditError.message.includes("schema cache");
        if (!missingAuditTable) console.warn("Não foi possível carregar o histórico:", auditError.message);
      } else {
        setAuditEntries((data ?? []) as typeof auditEntries);
      }
    }
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
    return haystack.includes(search.toLocaleLowerCase("pt-BR"));
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
          const focusProject = projects.find(project => project.id === selectedProjectId) ?? projects[0];
          const focusStages = focusProject ? calculatedStages(readTimeline(focusProject)) : [];
          const today = isoDate(new Date());
          const datedStages = focusStages.filter(stage => Boolean(stage.date));
          // A etapa só é considerada concluída quando sua data já passou.
          const completedStages = datedStages.filter(stage => (stage.date || "") < today).length;
          const nextDateIndex = focusStages.findIndex(stage => Boolean(stage.date) && (stage.date || "") >= today);
          const firstUndatedIndex = focusStages.findIndex(stage => !stage.date);
          const currentStageIndex = nextDateIndex >= 0 ? nextDateIndex : firstUndatedIndex >= 0 ? firstUndatedIndex : Math.max(0, focusStages.length - 1);
          const nextStageIndex = Math.min(focusStages.length - 1, currentStageIndex + 1);
          const nextStage = focusStages[currentStageIndex];
          const nextDateDays = nextStage?.date ? workdaysBetween(today, nextStage.date) : null;
          const overdueProjects = projects.filter(project => project.status === "ativo" && project.delivery_date && (daysUntil(project.delivery_date) ?? 0) < 0).length;
          const stageName = (stage: TimelineStage | undefined) => stage?.label ?? "Aguardando data";
          return <>
            <div className="dashboard-kpis">
              <article className="dashboard-kpi">
                <span className="kpi-icon kpi-blue"><CalendarDays size={24}/></span>
                <div><span>Projetos ativos</span><strong>{projects.filter(project => project.status === "ativo").length}</strong></div>
              </article>
              <article className="dashboard-kpi">
                <span className="kpi-icon kpi-green"><ShieldCheck size={24}/></span>
                <div><span>Etapas com data passada</span><strong>{completedStages}/{focusStages.length || 12}</strong><div className="kpi-progress"><i style={{width:`${Math.min(100, Math.round(completedStages / Math.max(1, focusStages.length) * 100))}%`}}/></div></div>
              </article>
              <article className="dashboard-kpi">
                <span className="kpi-icon kpi-orange"><CalendarClock size={24}/></span>
                <div><span>Próxima etapa</span><strong className="kpi-orange-text">{nextDateDays === null ? "—" : nextDateDays < 0 ? `${Math.abs(nextDateDays)} dias em atraso` : nextDateDays === 0 ? "Hoje" : `${nextDateDays} dias úteis`}</strong><small>{stageName(nextStage)}{nextStage?.date ? ` · ${formatDate(nextStage.date)}` : ""}</small></div>
              </article>
              <article className="dashboard-kpi">
                <span className="kpi-icon kpi-red"><span className="warning-mark">!</span></span>
                <div><span>Atrasos</span><strong className="kpi-red-text">{overdueProjects}</strong><small>projetos com entrega vencida</small></div>
              </article>
            </div>

            {!focusProject ? <section className="dashboard-project-card empty-dashboard">
              <div className="empty-state"><CalendarClock size={32}/><strong>Nenhum projeto cadastrado</strong><span>Cadastre um cliente e crie seu primeiro projeto para visualizar o acompanhamento de etapas.</span><button className="primary-button" onClick={() => setPage("projects")}>Abrir cronogramas</button></div>
            </section> : <div className="dashboard-detail-layout">
              <section className="dashboard-project-card">
                <div className="dashboard-project-title">
                  <div><h2>{focusProject.name}</h2><p>{focusProject.clients?.name ?? "Cliente não identificado"}</p><div className="project-meta"><span><CalendarDays size={15}/> Contrato {focusProject.contract_number ?? "—"}</span><span><Users size={15}/>{focusProject.clients?.name ?? "Cliente"}</span></div></div>
                  <span className={`status-pill status-${focusProject.status}`}>{focusProject.status}</span>
                </div>

                <div className="dashboard-sector-groups">
                  <div className="sector-band band-commercial" style={{gridColumn:"span 4"}}>COMERCIAL</div>
                  <div className="sector-band band-conference" style={{gridColumn:"span 4"}}>CONFERÊNCIA</div>
                  <div className="sector-band band-commercial" style={{gridColumn:"span 1"}}>COMERCIAL</div>
                  <div className="sector-band band-logistics" style={{gridColumn:"span 3"}}>LOGÍSTICA</div>
                </div>
                <div className="dashboard-stage-arrows">
                  {focusStages.map((stage,index) => {
                    const sector = stageSectorClass(index);
                    const stageDate = stage.date || "";
                    const isPast = Boolean(stageDate && stageDate < today);
                    const isCurrent = index === currentStageIndex;
                    return <button key={stage.key} className={`dashboard-stage ${sector} ${isPast ? "stage-complete" : ""} ${isCurrent ? "stage-current" : ""}`} onClick={() => { setPage("projects"); void openTimeline(focusProject); }} title={`${index+1}. ${stage.label}`}>
                      <span className="dashboard-arrow-number">{index+1}</span>
                      <span className="dashboard-stage-label">{stage.label}</span>
                    </button>;
                  })}
                </div>

                <div className="dashboard-legend"><span><i className="legend-dot done"/>Concluída por data</span><span><i className="legend-dot current"/>Etapa em foco</span><span><i className="legend-dot pending"/>Pendente</span></div>

                <div className="dashboard-stage-table-wrap">
                  <table className="dashboard-stage-table"><thead><tr><th>Etapa</th><th>Descrição</th><th>Data</th><th>Dias úteis (decorridos)</th><th>Status</th></tr></thead>
                    <tbody>{focusStages.map((stage,index) => {
                      const value = stage.date || "";
                      const elapsed = value ? workdaysBetween(value, today) : null;
                      const state = !value ? "Pendente" : value < today ? "Data passada" : value === today ? "Hoje" : "Próxima etapa";
                      return <tr key={stage.key} className={index === currentStageIndex ? "focused-stage-row" : ""}>
                        <td><span className={`mini-stage-number ${stageSectorClass(index)}`}>{index+1}</span></td>
                        <td>{stage.label}</td><td>{formatDate(value)}</td><td>{elapsed === null ? "—" : `${Math.abs(elapsed)} dias`}</td>
                        <td><span className={`stage-status status-${!value ? "pending" : value < today ? "done" : value === today ? "today" : "next"}`}>{state}</span></td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
              </section>

              <aside className="dashboard-stage-panel">
                <h3>Detalhes da etapa</h3>
                <p className="panel-label">Progresso por datas</p>
                <div className="panel-progress-line"><strong>{completedStages} de {focusStages.length} etapas</strong><b>{Math.round(completedStages / Math.max(1,focusStages.length) * 100)}%</b></div>
                <div className="kpi-progress panel-progress"><i style={{width:`${Math.min(100, Math.round(completedStages / Math.max(1,focusStages.length) * 100))}%`}}/></div>
                <div className="panel-divider"/>
                <p className="panel-label">Etapa em foco</p>
                <div className="panel-stage-item"><span className="panel-stage-icon panel-green">✓</span><div><strong>Etapa {currentStageIndex+1}</strong><p>{stageName(focusStages[currentStageIndex])}</p><small>{formatDate(focusStages[currentStageIndex]?.date)}</small><small>{focusStages[currentStageIndex]?.date ? formatCountdown(focusStages[currentStageIndex].date!) : "Aguardando data"}</small></div></div>
                <div className="panel-divider"/>
                <p className="panel-label">Próxima etapa</p>
                <div className="panel-stage-item"><span className="panel-stage-icon panel-blue">›</span><div><strong>Etapa {focusStages.length ? nextStageIndex + 1 : "—"}</strong><p>{stageName(focusStages[nextStageIndex])}</p><small>{formatDate(focusStages[nextStageIndex]?.date)}</small><small>{focusStages[nextStageIndex]?.date ? formatCountdown(focusStages[nextStageIndex].date!) : "Aguardando data"}</small></div></div>
                <div className="panel-divider"/>
                <p className="panel-label">Próxima seguinte</p>
                <div className="panel-stage-item"><span className="panel-stage-icon panel-gray">›</span><div><strong>Etapa {focusStages.length ? Math.min(focusStages.length, nextStageIndex + 2) : "—"}</strong><p>{stageName(focusStages[nextStageIndex + 1])}</p><small>{formatDate(focusStages[nextStageIndex + 1]?.date)}</small></div></div>
                <button className="dashboard-open-button" onClick={() => { setPage("projects"); void openTimeline(focusProject); }}><Pencil size={16}/> Abrir projeto</button>
              </aside>
            </div>}
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
          <section className="table-card">
            <div className="table-heading"><div><h2>Todos os projetos</h2><p className="muted">{filteredProjects.length} projeto(s)</p></div><div className="table-tools"><label className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, projeto ou contrato" /></label></div></div>
            {loading ? <div className="empty-state">Carregando projetos…</div> : filteredProjects.length === 0 ? <div className="empty-state"><CalendarClock size={28} /><strong>Nenhum projeto encontrado</strong><span>Os projetos cadastrados aparecerão aqui.</span></div> :
              <div className="spreadsheet-wrap"><table className="spreadsheet-table"><thead>
              <tr className="sector-group-row">
                <th className="sheet-sticky project-col meta-column" rowSpan={2}>Projeto / cliente</th>
                <th className="meta-column" rowSpan={2}>Contrato</th>
                <th className="sector-group sector-comercial" colSpan={4}>COMERCIAL</th>
                <th className="sector-group sector-conferencia" colSpan={4}>CONFERÊNCIA</th>
                <th className="sector-group sector-comercial" colSpan={1}>COMERCIAL</th>
                <th className="sector-group sector-logistica" colSpan={3}>LOGÍSTICA</th>
                <th className="meta-column" rowSpan={2}>Status</th>
                <th className="sheet-action-col meta-column" rowSpan={2}>Editar</th>
              </tr>
              <tr className="stage-heading-row">
                {calculatedStages({}).map((stage,index)=><th key={stage.key} className={stageSectorClass(index)} title={stage.label}><span className="stage-heading-number">{index+1}</span>{stage.label}</th>)}
              </tr>
              </thead><tbody>{filteredProjects.map(project => {
                const stages=calculatedStages(readTimeline(project));
                return <tr key={project.id}>
                  <td className="sheet-sticky project-col meta-column"><strong>{project.name}</strong><span className="sheet-subtitle">{project.clients?.name ?? "Cliente —"}</span></td>
                  <td className="meta-column">{project.contract_number ?? "—"}</td>
                  {stages.map((stage, index) => {
                    const value=stage.date || "";
                    const remaining=value?workdaysBetween(isoDate(new Date()),value):null;
                    const cls=!value?"sheet-empty":remaining!==null&&remaining<0?"sheet-overdue":remaining!==null&&remaining<=7?"sheet-soon":"sheet-ok";
                    return <td key={stage.key} className={`sheet-date-cell ${stageSectorClass(index)}`}><button type="button" className={`sheet-date ${cls} ${stageSectorClass(index)}`} onClick={()=>openTimeline(project)} title={`${stage.label}${stage.rule?` — ${stage.rule}`:""}; clique para abrir e editar`}>
                      <span>{formatDate(value)}</span>{value && <small>{formatCountdown(value)}</small>}
                    </button></td>;
                  })}
                  <td className="meta-column"><span className={`status-pill status-${project.status}`}>{project.status}</span></td>
                  <td className="sheet-action-col meta-column"><button className="secondary-button compact-button" onClick={()=>openTimeline(project)}>Editar</button></td>
                </tr>;
              })}</tbody></table></div>}
          </section>
          {selectedProjectId && (() => {
            const selected=projects.find(p=>p.id===selectedProjectId);
            if(!selected) return null;
            const stages=calculatedStages(timelineDraft);
            return <section className="timeline-card">
              <div className="timeline-header"><div><p className="eyebrow">CRONOGRAMA DETALHADO</p><h2>{selected.name}</h2><p className="muted">{selected.clients?.name ?? "Cliente não identificado"} · Contrato {selected.contract_number ?? "—"}</p></div><button className="secondary-button" onClick={()=>setSelectedProjectId(null)}>Fechar</button></div>
              <p className="timeline-note">As datas automáticas consideram dias úteis, excluindo sábados, domingos, feriados nacionais e o feriado estadual de 20 de setembro (RS). Feriados municipais não são considerados.</p>
              <div className="timeline-list">{stages.map((stage,index)=>{
                const editable=stage.kind==="manual"; const value=stage.date || "";
                return <article className={`timeline-row ${stageSectorClass(index)}`} key={stage.key}><div className="timeline-number">{index+1}</div><div className="timeline-stage"><strong>{stage.label}</strong><span>{editable?"Data informada manualmente":stage.rule}</span></div><div className="timeline-date">{editable && canEdit ? <input aria-label={stage.label} type="date" value={value} onChange={e=>setTimelineDraft(prev=>({...prev,[stage.key]:e.target.value}))}/> : <span>{formatDate(value)}</span>}</div><div className={`timeline-countdown ${countdownClass(value)}`}>{value?formatCountdown(value):"Aguardando data base"}</div><span className={`timeline-kind ${editable?"manual":"automatic"}`}>{editable?"Manual":"Automática"}</span></article>;
              })}</div>
              <div className="timeline-footer"><span className="muted">Datas automáticas são recalculadas quando uma data-base é alterada.</span>{canEdit && <button className="primary-button" disabled={timelineSaving} onClick={()=>void saveTimeline()}>{timelineSaving?"Salvando…":"Salvar cronograma"}</button>}</div>
              {!canEdit && <p className="muted">Seu perfil é somente leitura; solicite acesso de editor para alterar datas.</p>}
              <div className="audit-panel">
                <div className="audit-heading"><div><p className="eyebrow">AUDITORIA</p><h3>Histórico de alterações</h3></div><span className="muted">Últimos 20 eventos</span></div>
                {auditLoading ? <p className="muted">Carregando histórico…</p> : auditEntries.length === 0 ? <p className="muted">Nenhuma alteração registrada após a ativação do histórico.</p> :
                  <ol className="audit-list">{auditEntries.map(entry => <li key={entry.id}><div><strong>{entry.action === "INSERT" ? "Projeto criado" : entry.action === "DELETE" ? "Projeto removido" : "Projeto atualizado"}</strong><p>{entry.summary}</p><span>{entry.actor_email || "Usuário autenticado"} · {new Date(entry.changed_at).toLocaleString("pt-BR")}</span></div></li>)}</ol>}
              </div>
            </section>;
          })()}
        </>}

        <p className="security-note"><ShieldCheck size={15} /> Dados protegidos pelas políticas de acesso do Supabase. Perfil atual: {role}.</p>
      </section>
    </div>
  </main>;
}
export default App;