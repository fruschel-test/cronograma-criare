# Cronograma Criare

Aplicação web estática React + TypeScript + Vite, preparada para GitHub Pages e Supabase.

## Requisitos

- Node.js 20+
- npm
- Conta GitHub
- Projeto Supabase

## 1. Criar o repositório

1. No GitHub, crie um repositório chamado `cronograma-criare`.
2. Marque o repositório como **Private**.
3. Crie-o vazio (não adicione README, licença ou `.gitignore`, pois estes arquivos já estão no projeto).
4. Descompacte o pacote do projeto e abra um terminal na pasta `cronograma-criare`.

```bash
git init
git add .
git commit -m "chore: initial Cronograma Criare scaffold"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/cronograma-criare.git
git push -u origin main
```

Substitua `SEU-USUARIO` pelo seu usuário ou organização GitHub.

## 2. Configurar o Supabase

1. Crie um projeto no Supabase.
2. No SQL Editor, execute o arquivo `supabase/migrations/001_initial_schema.sql`.
3. Em Authentication, mantenha o cadastro público desabilitado e convide os usuários pelo painel.
4. Copie a Project URL e a chave pública (publishable/anon) do Supabase.
5. Para promover o primeiro administrador, obtenha o UUID da conta convidada em Authentication/Users e execute no SQL Editor:

```sql
update public.profiles
set role = 'admin'
where id = 'UUID_DO_USUARIO';
```

O usuário padrão recebe a função `viewer`. `admin` e `editor` podem criar/editar clientes e projetos; apenas `admin` pode excluir. Convites devem ser enviados pelo painel Supabase; nunca use a chave `service_role` no frontend.

### Desenvolvimento local

```bash
cp .env.example .env.local
```

No Windows PowerShell, você também pode copiar manualmente `.env.example` para `.env.local`. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, depois:

```bash
npm install
npm run dev
```

## 3. Configurar variáveis no GitHub

No repositório, acesse **Settings → Secrets and variables → Actions → Variables** e crie:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

São variáveis públicas usadas para compilar o frontend. A segurança dos dados depende das políticas RLS no Supabase, não de ocultar essas duas configurações. Nunca crie uma variável `service_role` para o build do frontend.

## 4. Habilitar GitHub Pages

1. Abra **Settings → Pages**.
2. Em Build and deployment, selecione **GitHub Actions**.
3. Confirme que o workflow `.github/workflows/deploy.yml` está na branch `main`.
4. Faça push. O workflow executará o build e publicará `dist`.
5. A URL será semelhante a `https://SEU-USUARIO.github.io/cronograma-criare/`.

O `base` do Vite está definido como `/cronograma-criare/`. Se o repositório tiver outro nome, ajuste `vite.config.ts`.

### Observação importante sobre repositório privado

A visibilidade privada do código não garante que o site publicado pelo GitHub Pages seja privado. A disponibilidade de Pages privados depende do plano e das políticas da conta/organização. Verifique isso antes de publicar dados sensíveis. Mesmo com site público, os dados do Supabase permanecem protegidos pelas políticas RLS, mas a tela de login e os arquivos estáticos podem ser acessíveis publicamente.

## 5. Comandos de validação

```bash
npm install
npm run build
npm test
```

## Escopo desta estrutura inicial

- Tela de login por e-mail e senha.
- Listagem e pesquisa de projetos.
- Criação básica de projetos para clientes já cadastrados.
- Esquema SQL com clientes, projetos, perfis, histórico e políticas RLS.
- Workflow de build/deploy para GitHub Pages.

## Próximas etapas recomendadas

1. Implementar cadastro/edição de clientes na interface.
2. Implementar edição completa do projeto e os nove marcos da planilha Excel.
3. Reproduzir e testar as regras de dias corridos/úteis e feriados.
4. Implementar gestão de usuários e convites por um fluxo administrativo seguro.
5. Adicionar testes de regras de prazo e permissões.
6. Importar somente registros reais, após validar a planilha de origem.

Este pacote é uma base inicial de desenvolvimento, não um sistema pronto para produção. Valide o SQL e as políticas de acesso em um projeto de teste antes de inserir dados reais.
