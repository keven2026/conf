# ALL LOGÍSTICA — Controle Operacional

## Setup (primeira vez)

### 1. Supabase (banco de dados compartilhado)
1. Criar conta em https://supabase.com → New Project
2. SQL Editor → colar conteúdo do `supabase_setup.sql` → Run
3. Settings → API → copiar URL e Anon Key

### 2. Deploy no Vercel
```bash
npm install -g vercel
vercel login

cd all-logistica
vercel --prod --yes \
  --env VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co \
  --env VITE_SUPABASE_ANON_KEY=sb_publishable_XXXXXXXX
```

## Atualização (quando Claude gerar novo App.jsx)

```
1. Baixar all-operacional.jsx do chat
2. Salvar em: all-logistica/src/App.jsx  (substituindo)
3. No Claude Code:

Copia ~/Downloads/all-operacional.jsx para 
~/all-logistica/src/App.jsx substituindo o existente, depois:
git add .
git commit -m "update"
git push
vercel --prod --yes
```

## Sem Supabase (só localStorage)
Funciona normalmente — cada máquina tem seus dados locais.
