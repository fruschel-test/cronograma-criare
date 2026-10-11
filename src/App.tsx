import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  CalendarClock, LogIn, LogOut, Plus, RefreshCw, Search, ShieldCheck,
  Users, CalendarDays, LayoutDashboard, Pencil, X
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type { Client, Project } from "./types/database";

type Page = "dashboard" | "clients" | "projects";

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
        <div className="sidebar-bottom"><ShieldCheck size={16} /><span>Permissões protegidas pelo Supabase</span></div>
      </aside>
      <section className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">{page === "dashboard" ? "VISÃO GERAL" : page === "clients" ? "RELACIONAMENTO" : "ACOMPANHAMENTO"}</p>
            <h1>{page === "dashboard" ? "Dashboard" : page === "clients" ? "Clientes" : "Cronogramas de projetos"}</h1>
            <p className="muted">{page === "dashboard" ? "Resumo dos projetos, clientes e prazos." : page === "clients" ? "Cadastre e mantenha os dados dos clientes." : "Consulte projetos, contratos e datas previstas."}</p>
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
              <div className="table-scroll"><table><thead><tr><th>Projeto</th><th>Cliente</th><th>Contrato</th><th>Entrega prevista</th><th>Status</th></tr></thead><tbody>{filteredProjects.map((project) => { const days = daysUntil(project.delivery_date); const dueClass = days !== null && days < 0 ? "due-overdue" : days !== null && days <= 7 ? "due-soon" : ""; return <tr key={project.id}><td className="project-name">{project.name}</td><td>{project.clients?.name ?? "—"}</td><td>{project.contract_number ?? "—"}</td><td><span className={dueClass}>{formatDate(project.delivery_date)}</span></td><td><span className={`status-pill status-${project.status}`}>{project.status}</span></td></tr>; })}</tbody></table></div>}
          </section>
        </>}

        <p className="security-note"><ShieldCheck size={15} /> Dados protegidos pelas políticas de acesso do Supabase. Perfil atual: {role}.</p>
      </section>
    </div>
  </main>;
}
export default App;
