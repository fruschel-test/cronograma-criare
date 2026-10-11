import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  CalendarClock, LogIn, LogOut, Plus, RefreshCw, Search, ShieldCheck,
  Users, CalendarDays, LayoutDashboard, Pencil, X
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type { Client, Project } from "./types/database";

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
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("viewer");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [userProfiles, setUserProfiles] = useState<Array<{id:string; role:string; email:string|null}>>([]);
  const [usersLoading, setUsersLoading] = useState(false);

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
      if (auditError) setError(`Histórico: ${auditError.message}`);
      else setAuditEntries((data ?? []) as typeof auditEntries);
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
    setUsersLoading(true); setError("");
    const { data, error: listError } = await supabase.from("profiles").select("id,role,email").order("role");
    if (listError) setError(`Não foi possível carregar usuários: ${listError.message}`);
    else setUserProfiles((data ?? []) as typeof userProfiles);
    setUsersLoading(false);
  }

  async function inviteUser(event: FormEvent) {
    event.preventDefault();
    if (!supabase || role !== "admin" || !inviteEmail.trim()) return;
    setInviteLoading(true); setError(""); setNotice("");
    const { data, error: inviteError } = await supabase.functions.invoke("admin-invite-user", {
      body: { email: inviteEmail.trim().toLowerCase(), role: inviteRole }
    });
    setInviteLoading(false);
    if (inviteError) { setError(`Falha ao enviar convite: ${inviteError.message}. Confira se a Edge Function foi publicada e se os secrets estão configurados.`); return; }
    if (data?.error) { setError(`Falha ao enviar convite: ${data.error}`); return; }
    setNotice(`Convite enviado para ${inviteEmail.trim()}. O usuário deverá aceitar o convite e definir o acesso.`);
    setInviteEmail("");
    await loadUserProfiles();
  }

  async function changeUserRole(userId: string, nextRole: "admin" | "editor" | "viewer") {
    if (!supabase || role !== "admin") return;
    if (userId === session?.user.id && nextRole !== "admin") {
      setError("Para evitar bloqueio administrativo, não é possível rebaixar seu próprio perfil nesta tela.");
      return;
    }
    setError(""); setNotice("");
    const { data, error: roleError } = await supabase.functions.invoke("admin-set-user-role", {
      body: { user_id: userId, role: nextRole }
    });
    if (roleError || data?.error) { setError(`Não foi possível alterar o papel: ${roleError?.message ?? data?.error}`); return; }
    setNotice("Papel atualizado.");
    await loadUserProfiles();
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
      <div className="brand"><div className="brand-mark small"><CalendarClock size={21} /></div><span>Cronograma <b>Criare</b></span></div>
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

        {page === "dashboard" && <>
          <div className="stats-grid">
            <article className="stat-card"><span>Projetos cadastrados</span><strong>{projects.length}</strong></article>
            <article className="stat-card"><span>Projetos ativos</span><strong>{projects.filter((p) => p.status === "ativo").length}</strong></article>
            <article className="stat-card"><span>Prazos vencidos</span><strong className="danger-text">{projects.filter((p) => p.status === "ativo" && p.delivery_date && (daysUntil(p.delivery_date) ?? 0) < 0).length}</strong></article>
            <article className="stat-card"><span>Clientes</span><strong>{clients.length}</strong></article>
          </div>
          <section className="table-card">
            <div className="table-heading"><div><h2>Projetos recentes</h2><p className="muted">{projects.slice(0, 5).length} registro(s)</p></div><button className="secondary-button" onClick={() => setPage("projects")}>Ver cronogramas</button></div>
            {projects.length === 0 ? <div className="empty-state"><CalendarClock size={28} /><strong>Nenhum projeto cadastrado</strong><span>Cadastre um cliente e depois crie o primeiro projeto.</span><button className="secondary-button" onClick={() => setPage("clients")}>Ir para Clientes</button></div> :
              <div className="table-scroll"><table><thead><tr><th>Projeto</th><th>Cliente</th><th>Contrato</th><th>Entrega prevista</th><th>Status</th></tr></thead><tbody>{projects.slice(0, 5).map((p) => <tr key={p.id}><td className="project-name">{p.name}</td><td>{p.clients?.name ?? "—"}</td><td>{p.contract_number ?? "—"}</td><td>{formatDate(p.delivery_date)}</td><td><span className={`status-pill status-${p.status}`}>{p.status}</span></td></tr>)}</tbody></table></div>}
          </section>
        </>}

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
              <div className="table-scroll"><table><thead><tr><th>Projeto</th><th>Cliente</th><th>Contrato</th><th>Entrega prevista</th><th>Status</th><th>Ação</th></tr></thead><tbody>{filteredProjects.map((project) => { const days = daysUntil(project.delivery_date); const dueClass = days !== null && days < 0 ? "due-overdue" : days !== null && days <= 7 ? "due-soon" : ""; return <tr key={project.id}><td className="project-name">{project.name}</td><td>{project.clients?.name ?? "—"}</td><td>{project.contract_number ?? "—"}</td><td><span className={dueClass}>{formatDate(project.delivery_date)}</span></td><td><span className={`status-pill status-${project.status}`}>{project.status}</span></td><td><button className="secondary-button compact-button" onClick={()=>openTimeline(project)}>Abrir cronograma</button></td></tr>; })}</tbody></table></div>}
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
                return <article className="timeline-row" key={stage.key}><div className="timeline-number">{index+1}</div><div className="timeline-stage"><strong>{stage.label}</strong><span>{editable?"Data informada manualmente":stage.rule}</span></div><div className="timeline-date">{editable && canEdit ? <input aria-label={stage.label} type="date" value={value} onChange={e=>setTimelineDraft(prev=>({...prev,[stage.key]:e.target.value}))}/> : <span>{formatDate(value)}</span>}</div><div className={`timeline-countdown ${countdownClass(value)}`}>{value?formatCountdown(value):"Aguardando data base"}</div><span className={`timeline-kind ${editable?"manual":"automatic"}`}>{editable?"Manual":"Automática"}</span></article>;
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
