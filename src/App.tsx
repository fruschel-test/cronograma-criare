import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarClock, LogIn, LogOut, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type { Client, Project } from "./types/database";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [clientId, setClientId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [contractNumber, setContractNumber] = useState("");

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
    }
    // loadData reads current authenticated session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function loadData() {
    if (!supabase) return;
    setLoading(true);
    setError("");
    const [clientResult, projectResult] = await Promise.all([
      supabase.from("clients").select("id,name,email,phone,created_at").order("name"),
      supabase.from("projects")
        .select("*, clients(id,name)")
        .order("created_at", { ascending: false })
    ]);
    if (clientResult.error) setError(clientResult.error.message);
    else setClients((clientResult.data ?? []) as Client[]);
    if (projectResult.error) setError(projectResult.error.message);
    else setProjects((projectResult.data ?? []) as Project[]);
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

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !clientId || !projectName.trim()) return;
    setError("");
    const { error: insertError } = await supabase.from("projects").insert({
      client_id: clientId,
      name: projectName.trim(),
      contract_number: contractNumber.trim() || null,
      status: "ativo"
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setShowNewProject(false);
    setProjectName("");
    setContractNumber("");
    await loadData();
  }

  const filteredProjects = projects.filter((project) => {
    const haystack = `${project.name} ${project.contract_number ?? ""} ${project.clients?.name ?? ""}`.toLocaleLowerCase("pt-BR");
    return haystack.includes(search.toLocaleLowerCase("pt-BR"));
  });

  if (!isSupabaseConfigured) {
    return (
      <main className="setup-page">
        <section className="setup-card">
          <div className="brand-mark"><CalendarClock size={28} /></div>
          <p className="eyebrow">CRIARE · CONFIGURAÇÃO INICIAL</p>
          <h1>Vamos conectar seu cronograma</h1>
          <p>O frontend está pronto para receber as credenciais públicas do seu projeto Supabase.</p>
          <ol>
            <li>Crie um projeto no Supabase.</li>
            <li>Execute o SQL em <code>supabase/migrations/001_initial_schema.sql</code>.</li>
            <li>Copie <code>.env.example</code> para <code>.env.local</code> e preencha URL e chave pública.</li>
            <li>Execute <code>npm run dev</code> para abrir localmente.</li>
          </ol>
          <div className="notice"><ShieldCheck size={18} /> Nunca adicione a chave <code>service_role</code> a este frontend.</div>
        </section>
      </main>
    );
  }

  if (authLoading) return <main className="center-screen">Carregando…</main>;

  if (!session) {
    return (
      <main className="login-page">
        <section className="login-panel">
          <div className="brand-mark"><CalendarClock size={28} /></div>
          <p className="eyebrow">GESTÃO DE PROJETOS</p>
          <h1>Cronograma Criare</h1>
          <p className="muted">Entre com o usuário que recebeu convite do administrador.</p>
          <form onSubmit={signIn} className="stack-form">
            <label>E-mail<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            <button className="primary-button" type="submit"><LogIn size={17} /> Entrar</button>
          </form>
          {authMessage && <p className="error-message">{authMessage}</p>}
          <p className="footnote">Cadastro público desativado. Para obter acesso, solicite um convite ao administrador.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark small"><CalendarClock size={21} /></div><span>Cronograma <b>Criare</b></span></div>
        <div className="user-actions"><span className="user-email">{session.user.email}</span><button className="icon-button" onClick={signOut} title="Sair"><LogOut size={18} /></button></div>
      </header>

      <section className="content">
        <div className="page-heading">
          <div><p className="eyebrow">VISÃO GERAL</p><h1>Cronogramas de projetos</h1><p className="muted">Acompanhe clientes, contratos e prazos em um só lugar.</p></div>
          <button className="primary-button" onClick={() => setShowNewProject((v) => !v)}><Plus size={18} /> Novo projeto</button>
        </div>

        <div className="stats-grid">
          <article className="stat-card"><span>Projetos cadastrados</span><strong>{projects.length}</strong></article>
          <article className="stat-card"><span>Projetos ativos</span><strong>{projects.filter((p) => p.status === "ativo").length}</strong></article>
          <article className="stat-card"><span>Prazos vencidos</span><strong className="danger-text">{projects.filter((p) => p.status === "ativo" && p.delivery_date && (daysUntil(p.delivery_date) ?? 0) < 0).length}</strong></article>
        </div>

        {showNewProject && <form className="new-project-form" onSubmit={createProject}>
          <h2>Cadastrar projeto</h2>
          <div className="form-grid">
            <label>Cliente<select value={clientId} onChange={(e) => setClientId(e.target.value)} required><option value="">Selecione um cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
            <label>Nome do projeto<input value={projectName} onChange={(e) => setProjectName(e.target.value)} required placeholder="Ex.: Cozinha e área gourmet" /></label>
            <label>Número do contrato<input value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} placeholder="Opcional" /></label>
          </div>
          {clients.length === 0 && <p className="muted">Cadastre primeiro um cliente no banco de dados. O cadastro de clientes pela interface será incluído na próxima etapa.</p>}
          <div className="form-actions"><button className="secondary-button" type="button" onClick={() => setShowNewProject(false)}>Cancelar</button><button className="primary-button" type="submit" disabled={!clients.length}>Salvar projeto</button></div>
        </form>}

        {error && <div className="error-banner">{error}</div>}

        <section className="table-card">
          <div className="table-heading"><div><h2>Todos os projetos</h2><p className="muted">{filteredProjects.length} registro(s)</p></div><div className="table-tools"><label className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, projeto ou contrato" /></label><button className="icon-button" onClick={() => void loadData()} title="Atualizar"><RefreshCw size={17} /></button></div></div>
          {loading ? <div className="empty-state">Carregando projetos…</div> : filteredProjects.length === 0 ? <div className="empty-state"><CalendarClock size={28} /><strong>Nenhum projeto encontrado</strong><span>Quando os projetos forem cadastrados, eles aparecerão aqui.</span></div> : (
            <div className="table-scroll"><table><thead><tr><th>Projeto</th><th>Cliente</th><th>Contrato</th><th>Entrega prevista</th><th>Status</th></tr></thead><tbody>{filteredProjects.map((project) => {
              const days = daysUntil(project.delivery_date);
              const dueClass = days !== null && days < 0 ? "due-overdue" : days !== null && days <= 7 ? "due-soon" : "";
              return <tr key={project.id}><td className="project-name">{project.name}</td><td>{project.clients?.name ?? "—"}</td><td>{project.contract_number ?? "—"}</td><td><span className={dueClass}>{formatDate(project.delivery_date)}</span></td><td><span className={`status-pill status-${project.status}`}>{project.status}</span></td></tr>;
            })}</tbody></table></div>
          )}
        </section>
        <p className="security-note"><ShieldCheck size={15} /> Dados acessíveis somente a usuários autenticados autorizados pelas políticas do banco.</p>
      </section>
    </main>
  );
}

export default App;
