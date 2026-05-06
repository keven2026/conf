import { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

// ─── STORAGE ───────────────────────────────────────────────────
const SK = { C:'all_cli_v2', E:'all_em_v2', CONF:'all_conf_v2', AN:'all_an_v2', COM:'all_com_v2', USERS:'all_users_v1', FECH:'all_fech_v1' };

const sGet = async k => {
  try {
    if (typeof window.storage !== 'undefined' && window.storage?.get) {
      const r = await window.storage.get(k);
      return r ? JSON.parse(r.value) : null;
    }
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
};
const sSet = async (k, v) => {
  try {
    if (typeof window.storage !== 'undefined' && window.storage?.set) {
      await window.storage.set(k, JSON.stringify(v));
    } else {
      localStorage.setItem(k, JSON.stringify(v));
    }
  } catch {}
};

// ─── ÍNDICES — ANALÍTICO ───────────────────────────────────────
const AN = { DATA:0, CTE:1, REMETENTE:2, PESO:12, PESO_TAX:13, NF:14, FRETE:15, VOL:24, CONTA:30, CFOP:31, CNPJ:32, OPERADOR:35, UNIDADE:36 };
const COM = { CTE:0, MODAL:1, DATA:2, TIPO_FRETE:4, PESO:5, CNPJ:6, COLETA:8, EMBALAGEM:10 };

// ─── PERMISSÕES ────────────────────────────────────────────────
const ROLES = {
  admin:   { label:'Administrador', tabs:['conferencia','auditoria','dashboard','cadastro'], canDelete:true, canManageUsers:true, canEditCadastro:true },
  gestor:  { label:'Gestor',        tabs:['conferencia','auditoria','dashboard'],            canDelete:true, canManageUsers:false, canEditCadastro:false },
  emissor: { label:'Emissor',       tabs:['conferencia'],                                    canDelete:false,canManageUsers:false, canEditCadastro:false },
};
const hasTab  = (role,tab) => (ROLES[role]?.tabs||[]).includes(tab);
const canDo   = (role,perm) => ROLES[role]?.[perm]===true;

const DEFAULT_USERS = [{ id:'1', nome:'Administrador', login:'admin', senha:'all2024', role:'admin' }];

// ─── HELPERS ───────────────────────────────────────────────────
function normalizeNF(v) { if (!v) return ''; const p=String(v).match(/\d+/g)||[]; return p.reduce((a,b)=>b.length>a.length?b:a,''); }
function normalizaCC(v) { if (!v) return ''; const s=v.trim().toUpperCase().split('-')[0]; const n=s.replace(/^C/,'').replace(/\D/g,''); return n?'C'+n:s; }
function fmtMoeda(v) { return `R$${Number(v||0).toFixed(2)}`; }
function fmtData(d) { return d?String(d).substring(0,10):''; }
function parseF(v) { return parseFloat(String(v||'').replace(',','.')) || 0; }
function parseI(v) { const n=parseInt(String(v||'').replace(/\D/g,'')); return isNaN(n)?1:n; }
function uid() { return Date.now()+Math.random().toString(36).slice(2); }

function readFileExcel(file) {
  return new Promise((res,rej) => {
    const r=new FileReader();
    r.onload=e=>{try{const wb=XLSX.read(e.target.result,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];res({all:XLSX.utils.sheet_to_json(ws,{header:1,defval:''}),sheetName:wb.SheetNames[0]});}catch(err){rej(err);}};
    r.onerror=rej; r.readAsArrayBuffer(file);
  });
}
async function readAnalitico(file) { const {all,sheetName}=await readFileExcel(file); return {rows:all.slice(1).filter(r=>r[AN.CTE]),sheetName,type:'analitico'}; }
async function readComissao(file)  { const {all,sheetName}=await readFileExcel(file); return {rows:all.slice(3).filter(r=>r[COM.CTE]),sheetName,type:'comissao'}; }

// ─── PDF ───────────────────────────────────────────────────────
function gerarPDF(conf) {
  const semCTE   = conf.resultado.semCTE;
  const comCTE   = conf.resultado.comCTE;
  const fora     = conf.resultado.emitidaSemRomaneio;
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Conferência ${conf.cliente} ${conf.data}</title>
<style>
  body{font-family:Arial,sans-serif;padding:24px;color:#111;font-size:12px}
  h1{font-size:16px;margin-bottom:4px}
  .sub{color:#555;margin-bottom:16px;font-size:11px}
  .stats{display:flex;gap:16px;margin-bottom:20px}
  .stat{border:1px solid #ddd;border-radius:6px;padding:10px 16px;text-align:center}
  .stat b{display:block;font-size:18px}
  .ok{color:#16a34a}.err{color:#dc2626}.warn{color:#d97706}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  th{background:#1e3a5f;color:#fff;padding:6px 8px;text-align:left;font-size:11px}
  td{padding:5px 8px;border-bottom:1px solid #eee;font-size:11px}
  tr:nth-child(even){background:#f9f9f9}
  h2{font-size:13px;margin:16px 0 8px;border-left:3px solid #1e3a5f;padding-left:8px}
  @media print{button{display:none}}
</style></head><body>
<button onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;background:#1e3a5f;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">🖨️ Imprimir / Salvar PDF</button>
<h1>Relatório de Conferência — ${conf.cliente}</h1>
<div class="sub">${conf.data} · ${conf.unidade} · Gerado em ${new Date().toLocaleString('pt-BR')}</div>
<div class="stats">
  <div class="stat"><b class="ok">${comCTE.length}</b>com CTE</div>
  <div class="stat"><b class="err">${semCTE.length}</b>sem emissão</div>
  <div class="stat"><b class="warn">${fora.length}</b>fora romaneio</div>
  <div class="stat"><b>${conf.nfsRomaneio.length}</b>total NFs</div>
</div>
${semCTE.length>0?`<h2>❌ NFs sem emissão (${semCTE.length})</h2>
<table><thead><tr><th>Nº Nota Fiscal</th><th>Status</th></tr></thead><tbody>
${semCTE.map(x=>`<tr><td>${x.nf}</td><td>Pendente de emissão</td></tr>`).join('')}
</tbody></table>`:''}
${fora.length>0?`<h2>⚠️ Emitidas fora do romaneio (${fora.length})</h2>
<table><thead><tr><th>Nº NF</th><th>CTE emitido</th></tr></thead><tbody>
${fora.map(x=>`<tr><td>${x.nf}</td><td>${x.cte}</td></tr>`).join('')}
</tbody></table>`:''}
${comCTE.length>0?`<h2>✅ NFs com CTE (${comCTE.length})</h2>
<table><thead><tr><th>Nº NF</th><th>CTE</th></tr></thead><tbody>
${comCTE.map(x=>`<tr><td>${x.nf}</td><td>${x.cte}</td></tr>`).join('')}
</tbody></table>`:''}
</body></html>`;
  const w=window.open('','_blank');
  if(w){w.document.write(html);w.document.close();}
}

// ─── IMPORTAÇÃO EM MASSA ───────────────────────────────────────
function parseCsvLike(text) {
  return text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')).map(l=>l.split(/[;,\t]/).map(c=>c.trim()));
}
async function importarClientes(file) {
  let rows=[];
  if (file.name.match(/\.xlsx?$/i)) {
    const {all}=await readFileExcel(file);
    const si=/nome|client|razao/i.test(String(all[0]?.[0]||''))?1:0;
    rows=all.slice(si).filter(r=>r[0]);
  } else {
    const text=await file.text();
    const parsed=parseCsvLike(text);
    const si=/nome|client/i.test(String(parsed[0]?.[0]||''))?1:0;
    rows=parsed.slice(si).filter(r=>r[0]);
  }
  return rows.map(r=>({
    id:uid(), nome:String(r[0]||'').trim(),
    cnpjs:String(r[1]||'').split(';').map(x=>x.replace(/\D/g,'')).filter(x=>x.length>=11),
    contasCorrente:String(r[2]||'').split(';').map(x=>normalizaCC(x.trim())).filter(Boolean),
    taxa:String(r[3]||'').trim(), taxaEmbalagem:String(r[4]||'').trim(), taxaColeta:String(r[5]||'').trim(),
    modalidades:String(r[6]||'').split(';').map(x=>x.trim()).filter(x=>['.PACKAGE','.COM'].includes(x)),
  })).filter(c=>c.nome);
}
async function importarEmissores(file) {
  let rows=[];
  if (file.name.match(/\.xlsx?$/i)) { const {all}=await readFileExcel(file); rows=all.slice(/id|operador/i.test(String(all[0]?.[0]||''))?1:0).filter(r=>r[0]); }
  else { const t=await file.text();const p=parseCsvLike(t);rows=p.slice(/id/i.test(String(p[0]?.[0]||''))?1:0).filter(r=>r[0]); }
  return rows.map(r=>({id:String(r[0]||'').trim(),nome:String(r[1]||'').trim()})).filter(e=>e.id&&e.nome);
}
function downloadTemplate(tipo) {
  const wb=XLSX.utils.book_new();
  if (tipo==='clientes') {
    const ws=XLSX.utils.aoa_to_sheet([['nome','cnpjs (sep. por ;)','contas_correntes (sep. por ;)','taxa_cte','taxa_embalagem','taxa_coleta','modalidades (sep. por ;)'],['Arezzo','13444949000305','C015643','0.85','0.75','4.50','.PACKAGE;.COM']]);
    XLSX.utils.book_append_sheet(wb,ws,'Clientes');
  } else {
    const ws=XLSX.utils.aoa_to_sheet([['id_operador','nome'],['131451','Felipe'],['131452','João']]);
    XLSX.utils.book_append_sheet(wb,ws,'Emissores');
  }
  XLSX.writeFile(wb,`template_${tipo}_ALL.xlsx`);
}

const UNIDS=['ES','BH','EX'];
const UL={ES:'Espírito Santo',BH:'Belo Horizonte',EX:'Extrema'};
const MODALIDADES=['.PACKAGE','.COM'];

// ─── UI ATOMS ──────────────────────────────────────────────────
function Toast({msg,type,onClose}) {
  if (!msg) return null;
  const c={success:'bg-emerald-900 border-emerald-500',error:'bg-red-900 border-red-500',warning:'bg-amber-900 border-amber-500',info:'bg-slate-800 border-slate-500'};
  return <div className={`fixed top-4 right-4 z-50 border-l-4 px-4 py-3 rounded-lg shadow-2xl max-w-sm text-sm text-white ${c[type]||c.info}`}>
    <div className="flex gap-2"><span className="flex-1">{msg}</span><button onClick={onClose} className="text-white/60 hover:text-white">×</button></div>
  </div>;
}
function Card({children,className=''}) { return <div className={`bg-slate-800 rounded-xl border border-slate-700 ${className}`}>{children}</div>; }
function CH({title,sub,actions}) {
  return <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-700">
    <div><h3 className="font-semibold text-white text-sm">{title}</h3>{sub&&<p className="text-xs text-slate-400 mt-0.5">{sub}</p>}</div>
    {actions&&<div className="flex gap-2 items-center flex-wrap">{actions}</div>}
  </div>;
}
function Stat({label,value,color='white',sub}) {
  const c={green:'text-emerald-400',red:'text-red-400',yellow:'text-amber-400',white:'text-white',blue:'text-blue-400'};
  return <div className="bg-slate-700/50 rounded-lg p-3 text-center">
    <p className={`text-xl font-bold ${c[color]||c.white}`}>{value}</p>
    <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    {sub&&<p className="text-xs text-slate-500">{sub}</p>}
  </div>;
}
function Inp({label,...p}) { return <div>{label&&<label className="block text-xs text-slate-400 mb-1 font-medium">{label}</label>}<input className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none" {...p}/></div>; }
function Sel({label,children,...p}) { return <div>{label&&<label className="block text-xs text-slate-400 mb-1 font-medium">{label}</label>}<select className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none" {...p}>{children}</select></div>; }
function Btn({children,variant='primary',size='md',disabled,className='',...p}) {
  const V={primary:'bg-blue-600 hover:bg-blue-500 text-white',success:'bg-emerald-700 hover:bg-emerald-600 text-white',danger:'bg-red-700 hover:bg-red-600 text-white',warning:'bg-amber-700 hover:bg-amber-600 text-white',ghost:'bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600'};
  const S={sm:'px-3 py-1.5 text-xs',md:'px-4 py-2 text-sm',lg:'px-5 py-2.5 text-sm'};
  return <button disabled={disabled} className={`rounded-lg font-medium transition-all focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${V[variant]} ${S[size]} ${className}`} {...p}>{children}</button>;
}
function FileZone({label,accept,multiple,onChange}) {
  return <label className="flex flex-col items-center justify-center w-full border-2 border-dashed border-slate-600 hover:border-blue-500 rounded-xl p-4 cursor-pointer transition-colors bg-slate-700/30">
    <span className="text-2xl mb-1">📁</span><span className="text-sm text-slate-300 font-medium">{label}</span>
    <span className="text-xs text-slate-500 mt-0.5">{accept}</span>
    <input type="file" className="hidden" accept={accept} multiple={multiple} onChange={onChange}/>
  </label>;
}
function Badge({children,color='slate'}) {
  const C={green:'bg-emerald-900/60 text-emerald-300 border-emerald-700',red:'bg-red-900/60 text-red-300 border-red-700',yellow:'bg-amber-900/60 text-amber-300 border-amber-700',blue:'bg-blue-900/60 text-blue-300 border-blue-700',slate:'bg-slate-700 text-slate-300 border-slate-600'};
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${C[color]||C.slate}`}>{children}</span>;
}
function SearchBox({value,onChange,placeholder='Pesquisar...'}) {
  return <div className="relative">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
    <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"/>
  </div>;
}
function Modal({title,children,onClose}) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
      </div>
      {children}
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// LOGIN SCREEN
// ═══════════════════════════════════════════════════════════════
function LoginScreen({onLogin}) {
  const [login,setLogin]=useState('');
  const [senha,setSenha]=useState('');
  const [erro,setErro]=useState('');
  const [users,setUsers]=useState([]);
  useEffect(()=>{ sGet(SK.USERS).then(u=>{ if(!u||!u.length){sSet(SK.USERS,DEFAULT_USERS);setUsers(DEFAULT_USERS);}else setUsers(u); }); },[]);
  function tentar(e) {
    e.preventDefault();
    const u=users.find(u=>u.login.toLowerCase()===login.toLowerCase()&&u.senha===senha);
    if (u) onLogin(u);
    else setErro('Login ou senha incorretos');
  }
  return <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4" style={{fontFamily:'system-ui,sans-serif'}}>
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">AL</div>
        <h1 className="text-white text-2xl font-bold">ALL LOGÍSTICA</h1>
        <p className="text-slate-400 text-sm mt-1">Controle Operacional</p>
      </div>
      <Card>
        <div className="p-6">
          <form onSubmit={tentar} className="space-y-4">
            <Inp label="Login" placeholder="seu login" value={login} onChange={e=>setLogin(e.target.value)} autoFocus/>
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-medium">Senha</label>
              <input type="password" value={senha} onChange={e=>setSenha(e.target.value)} placeholder="••••••••"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"/>
            </div>
            {erro&&<p className="text-red-400 text-xs">{erro}</p>}
            <Btn type="submit" variant="primary" className="w-full py-2.5">Entrar</Btn>
          </form>
        </div>
      </Card>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// TAB USUÁRIOS
// ═══════════════════════════════════════════════════════════════
function TabUsuarios({users,setUsers,notify}) {
  const emU={id:'',nome:'',login:'',senha:'',role:'emissor'};
  const [form,setForm]=useState(emU);
  const [editId,setEditId]=useState(null);
  async function save(e) {
    e.preventDefault();
    if (!form.login||!form.senha||!form.nome) return notify('Preencha todos os campos','error');
    if (users.find(u=>u.login===form.login&&u.id!==editId)) return notify('Login já existe','error');
    const u=editId?users.map(u=>u.id===editId?{...form,id:editId}:u):[...users,{...form,id:uid()}];
    setUsers(u);await sSet(SK.USERS,u);setForm(emU);setEditId(null);notify('Usuário salvo','success');
  }
  async function del(id) {
    if (id==='1') return notify('Não é possível excluir o admin padrão','error');
    const u=users.filter(u=>u.id!==id);setUsers(u);await sSet(SK.USERS,u);
  }
  return <div className="space-y-5">
    <Card>
      <CH title="Usuários e Permissões"/>
      <div className="p-5 space-y-3">
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Inp label="Nome" placeholder="Nome completo" value={form.nome} onChange={e=>setForm(p=>({...p,nome:e.target.value}))}/>
            <Inp label="Login" placeholder="login" value={form.login} onChange={e=>setForm(p=>({...p,login:e.target.value}))}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-medium">Senha</label>
              <input type="password" value={form.senha} onChange={e=>setForm(p=>({...p,senha:e.target.value}))} placeholder="••••••••"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"/>
            </div>
            <Sel label="Perfil" value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}>
              <option value="admin">Administrador — acesso total</option>
              <option value="gestor">Gestor — sem cadastro</option>
              <option value="emissor">Emissor — só conferência</option>
            </Sel>
          </div>
          <Btn type="submit" variant="primary" className="w-full">{editId?'Atualizar':'+ Adicionar Usuário'}</Btn>
        </form>
        <div className="border-t border-slate-700 pt-3 space-y-1.5">
          {users.map(u=><div key={u.id} className="flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-white">{u.nome}</p>
              <p className="text-xs text-slate-400">@{u.login} · <span className="text-blue-400">{ROLES[u.role]?.label}</span></p>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>{setForm({...u,senha:''});setEditId(u.id);}} className="text-blue-400 text-xs px-1">✏️</button>
              <button onClick={()=>del(u.id)} className="text-red-400 text-xs px-1">🗑️</button>
            </div>
          </div>)}
        </div>
      </div>
    </Card>
    <Card>
      <CH title="Permissões por Perfil"/>
      <div className="p-5">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-slate-700">
            {['Perfil','Conferência','Auditoria','Dashboard','Cadastro','Excluir','Usuários'].map(h=><th key={h} className="py-2 px-3 text-slate-400 text-left">{h}</th>)}
          </tr></thead>
          <tbody>
            {Object.entries(ROLES).map(([k,r])=><tr key={k} className="border-b border-slate-700/50">
              <td className="py-2 px-3 text-white font-medium">{r.label}</td>
              {['conferencia','auditoria','dashboard','cadastro'].map(t=><td key={t} className="py-2 px-3 text-center">{r.tabs.includes(t)?'✅':'—'}</td>)}
              <td className="py-2 px-3 text-center">{r.canDelete?'✅':'—'}</td>
              <td className="py-2 px-3 text-center">{r.canManageUsers?'✅':'—'}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </Card>
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// TAB CADASTRO
// ═══════════════════════════════════════════════════════════════
const emCli={nome:'',cnpjs:[],contasCorrente:[],taxa:'',taxaEmbalagem:'',taxaColeta:'',modalidades:[]};

function TabCadastro({clientes,setClientes,emissores,setEmissores,notify,userRole}) {
  const [cf,setCf]=useState(emCli);
  const [cnpjTmp,setCnpjTmp]=useState('');
  const [ccTmp,setCcTmp]=useState('');
  const [editIdx,setEditIdx]=useState(null);
  const [ef,setEf]=useState({id:'',nome:''});
  const [busca,setBusca]=useState('');
  const [selecionados,setSelecionados]=useState(new Set());
  const [importando,setImportando]=useState(false);
  const [importPreview,setImportPreview]=useState(null);
  const podeEditar=canDo(userRole,'canEditCadastro');

  const cliFiltrados=useMemo(()=>clientes.filter(c=>!busca||c.nome.toLowerCase().includes(busca.toLowerCase())||c.cnpjs?.some(x=>x.includes(busca.replace(/\D/g,'')))),[clientes,busca]);

  async function saveCliente(e) {
    e.preventDefault();
    if (!cf.nome.trim()) return notify('Nome obrigatório','error');
    const u=editIdx!==null?clientes.map((c,i)=>i===editIdx?{...cf}:c):[...clientes,{...cf,id:uid()}];
    setClientes(u);await sSet(SK.C,u);setEditIdx(null);setCf(emCli);setCnpjTmp('');setCcTmp('');notify('Cliente salvo','success');
  }
  async function delCliente(i) { const u=clientes.filter((_,x)=>x!==i);setClientes(u);await sSet(SK.C,u); }
  async function delSelecionados() {
    const u=clientes.filter((_,i)=>!selecionados.has(i));
    setClientes(u);await sSet(SK.C,u);setSelecionados(new Set());notify(`${selecionados.size} cliente(s) excluído(s)`,'success');
  }
  async function saveEm(e) {
    e.preventDefault();
    if (!ef.id||!ef.nome) return notify('ID e Nome obrigatórios','error');
    const u=[...emissores.filter(x=>x.id!==ef.id),{...ef}];
    setEmissores(u);await sSet(SK.E,u);setEf({id:'',nome:''});notify('Emissor salvo','success');
  }
  async function delEm(id) { const u=emissores.filter(e=>e.id!==id);setEmissores(u);await sSet(SK.E,u); }
  function addCnpj() { const c=cnpjTmp.replace(/\D/g,''); if(c.length<11) return notify('CNPJ inválido','warning'); if((cf.cnpjs||[]).includes(c)) return; setCf(p=>({...p,cnpjs:[...(p.cnpjs||[]),c]}));setCnpjTmp(''); }
  function addCC() { const raw=ccTmp.trim();if(!raw) return;const c=normalizaCC(raw);if((cf.contasCorrente||[]).includes(c)) return notify('CC já cadastrada','warning');setCf(p=>({...p,contasCorrente:[...(p.contasCorrente||[]),c]}));setCcTmp(''); }
  function togMod(m) { const ms=cf.modalidades||[];setCf(p=>({...p,modalidades:ms.includes(m)?ms.filter(x=>x!==m):[...ms,m]})); }
  function togSel(i) { const s=new Set(selecionados);s.has(i)?s.delete(i):s.add(i);setSelecionados(s); }
  function togTodos() { setSelecionados(selecionados.size===cliFiltrados.length?new Set():new Set(cliFiltrados.map((_,i)=>clientes.indexOf(cliFiltrados[i])))); }

  async function handleImportFile(e,tipo) {
    const f=e.target.files[0];if(!f) return;setImportando(true);
    try { const items=tipo==='clientes'?await importarClientes(f):await importarEmissores(f); if(!items.length) return notify('Nenhum registro','warning'); setImportPreview({tipo,items,file:f.name}); }
    catch(err){notify('Erro: '+err.message,'error');}finally{setImportando(false);}
  }
  async function confirmarImport() {
    if (!importPreview) return;
    const {tipo,items}=importPreview;
    if (tipo==='clientes') {
      const ex=new Set(clientes.map(c=>c.nome.toLowerCase()));
      const novos=items.filter(c=>!ex.has(c.nome.toLowerCase()));
      const m=[...clientes,...novos];setClientes(m);await sSet(SK.C,m);
      notify(`✅ ${novos.length} importados (${items.length-novos.length} duplicados ignorados)`,'success');
    } else {
      const ex=new Set(emissores.map(e=>e.id));
      const novos=items.filter(e=>!ex.has(e.id));
      const m=[...emissores,...novos];setEmissores(m);await sSet(SK.E,m);
      notify(`✅ ${novos.length} emissores importados`,'success');
    }
    setImportPreview(null);
  }

  return <div className="space-y-5">
    {/* Importação */}
    <Card>
      <CH title="Importação em Massa"/>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-slate-600 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-white">📋 Clientes</p>
            <p className="text-xs text-slate-400">nome · CNPJs · CCs · taxa · embalagem · coleta · modalidades</p>
            <div className="flex gap-2">
              <label className="flex-1 text-center text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 py-2 cursor-pointer font-medium">
                {importando?'⏳...':'📂 Importar'}<input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={e=>handleImportFile(e,'clientes')}/>
              </label>
              <button onClick={()=>downloadTemplate('clientes')} className="text-xs bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 rounded-lg px-3 py-2">⬇ Template</button>
            </div>
          </div>
          <div className="border border-slate-600 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-white">👤 Emissores</p>
            <p className="text-xs text-slate-400">id_operador · nome</p>
            <div className="flex gap-2">
              <label className="flex-1 text-center text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 py-2 cursor-pointer font-medium">
                {importando?'⏳...':'📂 Importar'}<input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={e=>handleImportFile(e,'emissores')}/>
              </label>
              <button onClick={()=>downloadTemplate('emissores')} className="text-xs bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 rounded-lg px-3 py-2">⬇ Template</button>
            </div>
          </div>
        </div>
        {importPreview&&<div className="border border-blue-700 bg-blue-900/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-blue-300">Preview — {importPreview.items.length} {importPreview.tipo}</p>
            <button onClick={()=>setImportPreview(null)} className="text-slate-500 hover:text-red-400">✕</button>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {importPreview.items.slice(0,50).map((item,i)=><div key={i} className="bg-slate-800 rounded-lg px-3 py-1.5 text-xs">
              {importPreview.tipo==='clientes'?<span><span className="font-medium text-white">{item.nome}</span><span className="text-slate-400 ml-2">{item.cnpjs.length} CNPJ · CC: {item.contasCorrente.join(';')||'—'} · R${item.taxa||'—'}</span></span>
              :<span className="text-white">{item.nome} <span className="text-slate-400">ID: {item.id}</span></span>}
            </div>)}
            {importPreview.items.length>50&&<p className="text-xs text-slate-500 text-center">+{importPreview.items.length-50} mais...</p>}
          </div>
          <div className="flex gap-2"><Btn variant="success" className="flex-1" onClick={confirmarImport}>✅ Confirmar</Btn><Btn variant="ghost" onClick={()=>setImportPreview(null)}>Cancelar</Btn></div>
        </div>}
      </div>
    </Card>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* Clientes */}
      <Card>
        <CH title="Clientes / Contas" sub={`${clientes.length} cadastrados`} actions={selecionados.size>0&&canDo(userRole,'canDelete')&&<Btn size="sm" variant="danger" onClick={delSelecionados}>🗑 Excluir {selecionados.size}</Btn>}/>
        <div className="p-5 space-y-3">
          {podeEditar&&<form onSubmit={saveCliente} className="space-y-3">
            <Inp label="Nome do Cliente" placeholder="ex: Arezzo" value={cf.nome} onChange={e=>setCf(p=>({...p,nome:e.target.value}))}/>
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-medium">CNPJs (múltiplos)</label>
              <div className="flex gap-2">
                <input value={cnpjTmp} onChange={e=>setCnpjTmp(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),addCnpj())} placeholder="00.000.000/0000-00"
                  className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500"/>
                <Btn type="button" size="sm" variant="ghost" onClick={addCnpj}>+</Btn>
              </div>
              {(cf.cnpjs||[]).length>0&&<div className="flex flex-wrap gap-1 mt-1">
                {cf.cnpjs.map((c,i)=><span key={i} className="bg-blue-900/50 text-blue-300 border border-blue-700 text-xs rounded-full px-2 py-0.5 flex items-center gap-1">
                  {c}<button type="button" onClick={()=>setCf(p=>({...p,cnpjs:p.cnpjs.filter((_,ii)=>ii!==i)}))} className="hover:text-red-400">×</button>
                </span>)}
              </div>}
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-medium">Contas Correntes (col AE)</label>
              <div className="flex gap-2">
                <input value={ccTmp} onChange={e=>setCcTmp(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),addCC())} placeholder="ex: C015643 ou 015643-6"
                  className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500"/>
                <Btn type="button" size="sm" variant="ghost" onClick={addCC}>+</Btn>
              </div>
              {ccTmp.trim()&&<p className="text-xs mt-1 text-slate-500">Salvo como: <span className="text-blue-400 font-mono font-semibold">{normalizaCC(ccTmp)}</span></p>}
              {(cf.contasCorrente||[]).length>0&&<div className="flex flex-wrap gap-1 mt-1">
                {cf.contasCorrente.map((c,i)=><span key={i} className={`text-xs rounded-full px-2 py-0.5 flex items-center gap-1 border ${c.startsWith('F')?'bg-red-900/50 text-red-300 border-red-700':'bg-slate-700 text-slate-300 border-slate-600'}`}>
                  {c}<button type="button" onClick={()=>setCf(p=>({...p,contasCorrente:p.contasCorrente.filter((_,ii)=>ii!==i)}))} className="hover:text-red-400">×</button>
                </span>)}
              </div>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Inp label="Taxa CTE" placeholder="0.85" value={cf.taxa} onChange={e=>setCf(p=>({...p,taxa:e.target.value}))}/>
              <Inp label="Taxa Embal." placeholder="0.75" value={cf.taxaEmbalagem||''} onChange={e=>setCf(p=>({...p,taxaEmbalagem:e.target.value}))}/>
              <Inp label="Taxa Coleta" placeholder="4.50" value={cf.taxaColeta||''} onChange={e=>setCf(p=>({...p,taxaColeta:e.target.value}))}/>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1 font-medium">Modalidades</p>
              <div className="flex gap-2">
                {MODALIDADES.map(m=><button key={m} type="button" onClick={()=>togMod(m)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-all ${(cf.modalidades||[]).includes(m)?'bg-blue-600 border-blue-600 text-white':'bg-slate-700 border-slate-600 text-slate-400'}`}>{m}</button>)}
              </div>
            </div>
            <Btn type="submit" variant="primary" className="w-full">{editIdx!==null?'Atualizar':'+ Adicionar'}</Btn>
          </form>}
          <div className="flex items-center justify-between">
            <SearchBox value={busca} onChange={setBusca} placeholder="Pesquisar por nome ou CNPJ..."/>
          </div>
          {clientes.length>0&&canDo(userRole,'canDelete')&&<div className="flex gap-2 flex-wrap">
            <button onClick={togTodos} className="text-xs text-blue-400 hover:text-blue-300 underline">
              {selecionados.size===clientes.length?'Desmarcar todos':'Selecionar todos'}
            </button>
            {selecionados.size>0&&<Btn size="sm" variant="danger" onClick={delSelecionados}>🗑 Excluir {selecionados.size} selecionado(s)</Btn>}
            {selecionados.size===0&&<span className="text-xs text-slate-500">{clientes.length} clientes cadastrados</span>}
          </div>}
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {cliFiltrados.length===0&&<p className="text-xs text-slate-500 text-center py-3">{busca?'Nenhum resultado':'Nenhum cliente'}</p>}
            {cliFiltrados.map((c,fi)=>{
              const i=clientes.indexOf(c);
              return <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 transition-colors ${selecionados.has(i)?'bg-blue-900/30 border border-blue-700':'bg-slate-700/50'}`}>
                {canDo(userRole,'canDelete')&&<input type="checkbox" checked={selecionados.has(i)} onChange={()=>togSel(i)} className="mt-1 accent-blue-500"/>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{c.nome}</p>
                  <p className="text-xs text-slate-400">{(c.cnpjs||[]).length} CNPJ · {(c.contasCorrente||[]).length} CC · R${c.taxa||'—'}</p>
                  <p className="text-xs text-slate-500">{(c.modalidades||[]).join('/')}</p>
                </div>
                {podeEditar&&<div className="flex gap-1 shrink-0">
                  <button onClick={()=>{setCf({...c});setEditIdx(i);}} className="text-blue-400 text-xs">✏️</button>
                  {canDo(userRole,'canDelete')&&<button onClick={()=>delCliente(i)} className="text-red-400 text-xs">🗑️</button>}
                </div>}
              </div>;
            })}
          </div>
          {cliFiltrados.length>1&&canDo(userRole,'canDelete')&&<button onClick={togTodos} className="text-xs text-slate-500 hover:text-blue-400">
            {selecionados.size===cliFiltrados.length?'Desmarcar todos':'Selecionar todos'}
          </button>}
        </div>
      </Card>

      {/* Emissores */}
      <Card>
        <CH title="Emissores" sub={`${emissores.length} cadastrados`}/>
        <div className="p-5 space-y-3">
          {podeEditar&&<form onSubmit={saveEm} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Inp label="ID Operador" placeholder="ex: 131451" value={ef.id} onChange={e=>setEf(p=>({...p,id:e.target.value}))}/>
              <Inp label="Nome" placeholder="ex: Felipe" value={ef.nome} onChange={e=>setEf(p=>({...p,nome:e.target.value}))}/>
            </div>
            <Btn type="submit" variant="primary" className="w-full">+ Adicionar Emissor</Btn>
          </form>}
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {emissores.length===0&&<p className="text-xs text-slate-500 text-center py-3">Nenhum emissor</p>}
            {emissores.map((e,i)=><div key={i} className="flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2">
              <div><p className="text-sm font-medium text-white">{e.nome}</p><p className="text-xs text-slate-400">ID: {e.id}</p></div>
              {canDo(userRole,'canDelete')&&<button onClick={()=>delEm(e.id)} className="text-red-400 text-xs">🗑️</button>}
            </div>)}
          </div>
        </div>
      </Card>
    </div>
  </div>;
}


// ─── CRUZAMENTO NFs (reutilizável) ────────────────────────────
function cruzarNFs(todasNFs, analitico, clientes, clienteNome) {
  if (!analitico || !todasNFs.length) return null;
  const clienteSel = clientes.find(c=>c.nome===clienteNome);
  const cnpjsCli = new Set((clienteSel?.cnpjs||[]).map(x=>x.replace(/\D/g,'')));
  const mapCTE={}, mapCNPJ={};
  analitico.rows.forEach(row=>{
    const nf=normalizeNF(row[AN.NF]), cte=String(row[AN.CTE]||'').trim(), cnpj=String(row[AN.CNPJ]||'').replace(/\D/g,'');
    if(nf){mapCTE[nf]=cte||null; mapCNPJ[nf]=cnpj;}
  });
  const romSet=new Set(todasNFs); const comCTE=[], semCTE=[];
  todasNFs.forEach(nf=>{ if(mapCTE.hasOwnProperty(nf)) mapCTE[nf]?comCTE.push({nf,cte:mapCTE[nf]}):semCTE.push({nf}); else semCTE.push({nf}); });
  const emitidaSemRomaneio=Object.entries(mapCTE).filter(([nf,cte])=>{ if(!cte||romSet.has(nf)) return false; return cnpjsCli.size>0?cnpjsCli.has(mapCNPJ[nf]||''):true; }).map(([nf,cte])=>({nf,cte}));
  return {comCTE, semCTE, emitidaSemRomaneio};
}

// ═══════════════════════════════════════════════════════════════
// TAB CONFERÊNCIA — SESSÃO DIÁRIA
// ═══════════════════════════════════════════════════════════════
function ConferenciaDetalhe({conf,onBack,onDelete,userRole}) {
  return <div className="space-y-4">
    <div className="flex gap-3 flex-wrap">
      <button onClick={onBack} className="text-blue-400 hover:text-blue-300 text-sm">← Voltar</button>
      <Btn size="sm" variant="ghost" onClick={()=>gerarPDF(conf)}>📄 PDF</Btn>
      {canDo(userRole,'canDelete')&&<Btn size="sm" variant="danger" onClick={onDelete}>🗑 Excluir</Btn>}
    </div>
    <Card>
      <CH title={conf.cliente} sub={`${conf.data} · ${UL[conf.unidade]||conf.unidade}`}/>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Com CTE" value={conf.resultado?.comCTE?.length||0} color="green"/>
          <Stat label="Sem emissão" value={conf.resultado?.semCTE?.length||0} color="red"/>
          <Stat label="Fora romaneio" value={conf.resultado?.emitidaSemRomaneio?.length||0} color="yellow"/>
        </div>
        {conf.lotes?.length>0&&<div>
          <p className="text-xs text-slate-400 font-medium mb-2">Lotes ({conf.lotes.length}):</p>
          <div className="space-y-1">{conf.lotes.map((l,i)=><div key={i} className="bg-slate-700/50 rounded-lg px-3 py-1.5 flex justify-between text-xs"><span className="text-slate-300">Lote {i+1} — {l.nfs.length} NFs</span><span className="text-slate-500">{l.hora}</span></div>)}</div>
        </div>}
        {conf.resultado?.semCTE?.length>0&&<div className="bg-red-900/30 border border-red-800 rounded-lg p-3">
          <p className="text-xs text-red-400 font-semibold mb-2">❌ Sem emissão:</p>
          <div className="flex flex-wrap gap-1">{conf.resultado.semCTE.map((x,i)=><span key={i} className="bg-red-900/60 text-red-300 border border-red-700 text-xs rounded px-2 py-0.5">{x.nf}</span>)}</div>
        </div>}
        {conf.resultado?.emitidaSemRomaneio?.length>0&&<div className="bg-amber-900/30 border border-amber-800 rounded-lg p-3">
          <p className="text-xs text-amber-400 font-semibold mb-2">⚠️ Fora do romaneio:</p>
          <div className="max-h-40 overflow-y-auto space-y-0.5">{conf.resultado.emitidaSemRomaneio.map((x,i)=><div key={i} className="text-xs text-amber-300">NF {x.nf} · CTE {x.cte}</div>)}</div>
        </div>}
      </div>
    </Card>
  </div>;
}

function TabConferencia({clientes,conferencias,setConferencias,notify,userRole}) {
  const [sessao, setSessao] = useState(null);
  const [nfTxt, setNfTxt] = useState('');
  const [editLoteId, setEditLoteId] = useState(null);
  const [analiticoSessao, setAnaliticoSessao] = useState(null);
  const [buscaCli, setBuscaCli] = useState('');
  const [newCli, setNewCli] = useState('');
  const [newData, setNewData] = useState(new Date().toISOString().split('T')[0]);
  const [newUnid, setNewUnid] = useState('ES');
  const [viewConf, setViewConf] = useState(null);
  const [filtCli, setFiltCli] = useState('');
  const [filtDt, setFiltDt] = useState('');

  const cliFilt = useMemo(()=>clientes.filter(c=>!buscaCli||c.nome.toLowerCase().includes(buscaCli.toLowerCase())),[clientes,buscaCli]);
  const nfCount = [...new Set((nfTxt.match(/\b\d{4,12}\b/g)||[]))].length;

  const todasNFs = useMemo(()=>{
    if (!sessao) return [];
    const all=new Set(); sessao.lotes.forEach(l=>l.nfs.forEach(n=>all.add(n))); return [...all];
  },[sessao]);

  const resultadoAtual = useMemo(()=>(!sessao||!analiticoSessao||!todasNFs.length)?null:cruzarNFs(todasNFs,analiticoSessao,clientes,sessao.cliente),[sessao,analiticoSessao,todasNFs,clientes]);

  if (viewConf) return <ConferenciaDetalhe conf={viewConf} onBack={()=>setViewConf(null)} userRole={userRole}
    onDelete={async()=>{const u=conferencias.filter(c=>c.id!==viewConf.id);setConferencias(u);await sSet(SK.CONF,u);setViewConf(null);notify('Excluída','success');}}/>;

  function abrirSessao() {
    if (!newCli) return notify('Selecione o cliente','warning');
    const existente=conferencias.find(c=>c.cliente===newCli&&c.data===newData&&c.status==='aberta');
    if (existente){setSessao(existente);notify(`Sessão de ${newCli} reaberta`,'info');return;}
    setSessao({id:uid(),cliente:newCli,data:newData,unidade:newUnid,lotes:[],status:'aberta',criadaEm:new Date().toISOString()});
    notify(`Sessão aberta — ${newCli}`,'success');
  }

  function adicionarLote() {
    if (!nfTxt.trim()) return notify('Cole as NFs','warning');
    const nfs=[...new Set((nfTxt.match(/\b\d{4,12}\b/g)||[]).map(normalizeNF).filter(n=>n.length>=4))];
    if (!nfs.length) return notify('Nenhum número encontrado','error');
    const hora=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const novaSessao=editLoteId
      ?{...sessao,lotes:sessao.lotes.map(l=>l.id===editLoteId?{...l,nfs,hora:hora+' (ed)'}:l)}
      :{...sessao,lotes:[...sessao.lotes,{id:uid(),nfs,hora}]};
    setSessao(novaSessao); setNfTxt(''); setEditLoteId(null);
    notify(`${editLoteId?'Lote editado':'Lote adicionado'} — ${nfs.length} NFs`,'success');
  }

  async function handleAn(e) {
    const f=e.target.files[0];if(!f) return;
    try{const d=await readAnalitico(f);setAnaliticoSessao(d);notify(`Analítico: ${d.rows.length} linhas`,'success');}
    catch(err){notify('Erro: '+err.message,'error');}
  }

  async function salvarSessao(fechar=false) {
    if (!sessao) return;
    const s={...sessao,nfsRomaneio:todasNFs,resultado:resultadoAtual||{comCTE:[],semCTE:[],emitidaSemRomaneio:[]},status:fechar?'fechada':'aberta',atualizadaEm:new Date().toISOString()};
    const u=conferencias.find(c=>c.id===sessao.id)?conferencias.map(c=>c.id===sessao.id?s:c):[...conferencias,s];
    setConferencias(u);await sSet(SK.CONF,u);
    if(fechar){setSessao(null);setAnaliticoSessao(null);setNfTxt('');notify('Sessão fechada!','success');}
    else notify('Salvo','success');
  }

  // ── PAINEL SESSÃO ATIVA ──────────────────────────────────────
  if (sessao) return <div className="space-y-4">
    <div className="flex items-start justify-between flex-wrap gap-2">
      <div>
        <p className="text-white font-bold text-base">{sessao.cliente}</p>
        <p className="text-slate-400 text-xs">{sessao.data} · {UL[sessao.unidade]||sessao.unidade} · {todasNFs.length} NFs acumuladas · {sessao.lotes.length} lotes</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Btn size="sm" variant="ghost" onClick={()=>{setSessao(null);setAnaliticoSessao(null);setNfTxt('');}}>← Sair</Btn>
        <Btn size="sm" variant="ghost" onClick={()=>salvarSessao(false)}>💾 Salvar</Btn>
        {resultadoAtual&&<Btn size="sm" variant="ghost" onClick={()=>gerarPDF({...sessao,nfsRomaneio:todasNFs,resultado:resultadoAtual})}>📄 PDF</Btn>}
        <Btn size="sm" variant="success" onClick={()=>salvarSessao(true)}>✅ Fechar dia</Btn>
      </div>
    </div>

    {resultadoAtual&&<div className="grid grid-cols-3 gap-3">
      <Stat label="Com CTE ✅" value={resultadoAtual.comCTE.length} color="green"/>
      <Stat label="Sem emissão ❌" value={resultadoAtual.semCTE.length} color="red"/>
      <Stat label="Fora romaneio ⚠️" value={resultadoAtual.emitidaSemRomaneio.length} color="yellow"/>
    </div>}
    {!resultadoAtual&&todasNFs.length>0&&<div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3 text-xs text-blue-300">ℹ️ {todasNFs.length} NFs acumuladas — carregue o analítico para recruzar.</div>}

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Lotes */}
      <Card>
        <CH title={`Lotes do dia (${sessao.lotes.length})`} sub="Cada romaneio é um lote — edite ou remova"/>
        <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
          {sessao.lotes.length===0&&<p className="text-xs text-slate-500 text-center py-4">Nenhum lote ainda</p>}
          {sessao.lotes.map((l,i)=><div key={l.id} className={`rounded-xl p-3 space-y-1 border ${editLoteId===l.id?'bg-blue-900/30 border-blue-700':'bg-slate-700/50 border-transparent'}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Lote {i+1} — {l.nfs.length} NFs</span>
              <div className="flex gap-2">
                <span className="text-xs text-slate-500">{l.hora}</span>
                <button onClick={()=>{setEditLoteId(l.id);setNfTxt(l.nfs.join('\n'));}} className="text-blue-400 text-xs">✏️</button>
                <button onClick={()=>setSessao(p=>({...p,lotes:p.lotes.filter(x=>x.id!==l.id)}))} className="text-red-400 text-xs">🗑</button>
              </div>
            </div>
            <p className="text-xs text-slate-500 font-mono truncate">{l.nfs.slice(0,6).join(' · ')}{l.nfs.length>6?` +${l.nfs.length-6}`:''}</p>
          </div>)}
        </div>
      </Card>

      {/* Painel lançamento */}
      <div className="space-y-3">
        <Card>
          <CH title={editLoteId?'✏️ Editando Lote':'➕ Novo Lote'} sub="Cole os NFs do romaneio"/>
          <div className="p-4 space-y-3">
            <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-2 text-xs text-blue-300 flex justify-between">
              <span>Fotos → Claude → cole os números aqui</span>
              <button onClick={()=>navigator.clipboard?.writeText('Liste os números de NF das fotos, um por linha, só dígitos. "1-016659626"→"016659626"').then(()=>notify('Copiado!','success'))} className="text-blue-400 ml-2">📋</button>
            </div>
            <textarea value={nfTxt} onChange={e=>setNfTxt(e.target.value)} placeholder={"016659626\n016660131\n..."} rows={6}
              className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:ring-2 focus:ring-blue-500 outline-none resize-none font-mono"/>
            {nfTxt&&<p className="text-xs text-slate-400">{nfCount} NFs</p>}
            <div className="flex gap-2">
              <Btn variant="primary" className="flex-1" onClick={adicionarLote}>{editLoteId?'💾 Salvar edição':'+ Adicionar lote'}</Btn>
              {editLoteId&&<Btn variant="ghost" onClick={()=>{setEditLoteId(null);setNfTxt('');}}>Cancelar</Btn>}
            </div>
          </div>
        </Card>
        <Card>
          <CH title="Analítico" sub="Recruza todas as NFs automaticamente"/>
          <div className="p-4 space-y-2">
            <FileZone label="Analítico (.xlsx)" accept=".xlsx,.xls" onChange={handleAn}/>
            {analiticoSessao&&<p className="text-xs text-emerald-400">✅ {analiticoSessao.rows.length} registros</p>}
          </div>
        </Card>
      </div>
    </div>

    {resultadoAtual?.semCTE?.length>0&&<Card><CH title={`❌ Sem emissão (${resultadoAtual.semCTE.length})`}/><div className="p-4"><div className="flex flex-wrap gap-1">{resultadoAtual.semCTE.map((x,i)=><span key={i} className="bg-red-900/60 text-red-300 border border-red-700 text-xs rounded px-2 py-0.5">{x.nf}</span>)}</div></div></Card>}
    {resultadoAtual?.emitidaSemRomaneio?.length>0&&<Card><CH title={`⚠️ Emitidas fora do romaneio (${resultadoAtual.emitidaSemRomaneio.length})`}/><div className="p-4 max-h-48 overflow-y-auto space-y-0.5">{resultadoAtual.emitidaSemRomaneio.map((x,i)=><div key={i} className="text-xs text-amber-300">NF {x.nf} · CTE {x.cte}</div>)}</div></Card>}
  </div>;

  // ── TELA INICIAL ─────────────────────────────────────────────
  return <div className="space-y-5">
    {conferencias.filter(c=>c.status==='aberta').length>0&&<Card>
      <CH title="🔴 Sessões em Aberto"/>
      <div className="p-3 space-y-1.5">
        {conferencias.filter(c=>c.status==='aberta').map(c=><div key={c.id} onClick={()=>setSessao(c)}
          className="flex items-center justify-between bg-amber-900/20 border border-amber-800 hover:bg-amber-900/30 rounded-lg px-3 py-2.5 cursor-pointer transition-colors">
          <div>
            <p className="text-sm font-medium text-white">{c.cliente} <span className="text-slate-400 font-normal">— {c.data}</span></p>
            <p className="text-xs text-slate-400">{(c.lotes||[]).length} lotes · {(c.nfsRomaneio||[]).length} NFs</p>
          </div>
          <span className="text-amber-400 text-xs font-medium">Continuar →</span>
        </div>)}
      </div>
    </Card>}

    <Card>
      <CH title="Abrir Sessão" sub="Uma sessão por cliente/dia — acumula romaneios durante o dia"/>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Inp label="Data" type="date" value={newData} onChange={e=>setNewData(e.target.value)}/>
          <Sel label="Unidade" value={newUnid} onChange={e=>setNewUnid(e.target.value)}>{UNIDS.map(u=><option key={u} value={u}>{UL[u]}</option>)}</Sel>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1 font-medium">Cliente</label>
          <SearchBox value={buscaCli} onChange={v=>{setBuscaCli(v);if(v!==newCli)setNewCli('');}} placeholder="Pesquisar cliente..."/>
          {buscaCli&&!newCli&&cliFilt.length>0&&<div className="mt-1 bg-slate-700 border border-slate-600 rounded-lg max-h-40 overflow-y-auto">
            {cliFilt.slice(0,10).map((c,i)=><button key={i} onClick={()=>{setNewCli(c.nome);setBuscaCli(c.nome);}} className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-600 hover:text-white">{c.nome}</button>)}
          </div>}
          {newCli&&<p className="text-xs text-emerald-400 mt-1">✅ <span className="font-semibold">{newCli}</span></p>}
        </div>
        <Btn variant="primary" className="w-full py-3 text-base" onClick={abrirSessao}>📋 Abrir Painel de Conferência</Btn>
      </div>
    </Card>

    {conferencias.length>0&&<Card>
      <CH title="Histórico" actions={<div className="flex gap-2">
        <select className="bg-slate-700 border border-slate-600 text-xs text-slate-300 rounded px-2 py-1" value={filtCli} onChange={e=>setFiltCli(e.target.value)}>
          <option value="">Todos</option>{[...new Set(conferencias.map(c=>c.cliente))].map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" className="bg-slate-700 border border-slate-600 text-xs text-slate-300 rounded px-2 py-1" value={filtDt} onChange={e=>setFiltDt(e.target.value)}/>
      </div>}/>
      <div className="p-3 space-y-1.5 max-h-64 overflow-y-auto">
        {[...conferencias.filter(c=>(!filtCli||c.cliente===filtCli)&&(!filtDt||c.data===filtDt))].reverse().map(c=><div key={c.id} className="flex items-center gap-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg px-3 py-2.5 transition-colors">
          <div className="flex-1 cursor-pointer" onClick={()=>c.status==='aberta'?setSessao(c):setViewConf(c)}>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-white">{c.cliente} <span className="text-slate-400 font-normal">— {c.data}</span></p>
              {c.status==='aberta'&&<span className="text-xs bg-amber-900/60 text-amber-300 border border-amber-700 rounded-full px-2 py-0.5">aberta</span>}
            </div>
            <p className="text-xs text-slate-400">{(c.lotes||[]).length} lotes · {(c.nfsRomaneio||[]).length} NFs
              {c.resultado&&<> · <span className="text-emerald-400">{c.resultado.comCTE?.length||0} ok</span> · <span className="text-red-400">{c.resultado.semCTE?.length||0} pend</span></>}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            {c.resultado&&<button onClick={()=>gerarPDF(c)} className="text-slate-400 hover:text-white text-xs">📄</button>}
            {canDo(userRole,'canDelete')&&<button onClick={async()=>{const u=conferencias.filter(x=>x.id!==c.id);setConferencias(u);await sSet(SK.CONF,u);notify('Excluída','success');}} className="text-red-400 hover:text-red-300 text-xs">🗑</button>}
          </div>
        </div>)}
      </div>
    </Card>}
  </div>;
}


// ═══════════════════════════════════════════════════════════════
// TAB FECHAMENTO DIÁRIO
// ═══════════════════════════════════════════════════════════════
function TabFechamento({emissores,fechamentos,setFechamentos,notify}) {
  const [data,setData]=useState(new Date().toISOString().split('T')[0]);
  const [unid,setUnid]=useState('ES');
  const [loading,setLoading]=useState(false);

  async function handleUp(e) {
    const f=e.target.files[0]; if(!f) return;
    setLoading(true);
    try {
      const d=await readAnalitico(f);
      // Processa resumo do dia
      const resumo={ctes:0,vol:0,frete:0,peso:0,porOp:{},porCli:{}};
      d.rows.forEach(row=>{
        const cte=String(row[AN.CTE]||'').trim(); if(!cte) return;
        const vol=Math.max(1,parseI(row[AN.VOL]));
        const frete=parseF(row[AN.FRETE]);
        const peso=parseF(row[AN.PESO]);
        const op=String(row[AN.OPERADOR]||'').trim();
        const cli=String(row[AN.REMETENTE]||'').trim();
        resumo.ctes++; resumo.vol+=vol; resumo.frete+=frete; resumo.peso+=peso;
        if(op){if(!resumo.porOp[op]) resumo.porOp[op]={nome:emissores.find(e=>e.id===op)?.nome||op,ctes:0,vol:0};resumo.porOp[op].ctes++;resumo.porOp[op].vol+=vol;}
        if(cli){if(!resumo.porCli[cli]) resumo.porCli[cli]={ctes:0,vol:0,frete:0};resumo.porCli[cli].ctes++;resumo.porCli[cli].vol+=vol;resumo.porCli[cli].frete+=frete;}
      });
      const fech={id:uid(),data,unidade:unid,arquivo:f.name,resumo,criadoEm:new Date().toISOString()};
      // Substitui se já existe fechamento para o mesmo dia+unidade
      const u=[...fechamentos.filter(x=>!(x.data===data&&x.unidade===unid)),fech];
      setFechamentos(u); await sSet(SK.FECH,u);
      notify(`✅ Fechamento ${data} ${UL[unid]}: ${resumo.ctes} CTEs · ${resumo.vol} vol · R$${resumo.frete.toFixed(0)}`,'success');
    } catch(err){notify('Erro: '+err.message,'error');}
    finally{setLoading(false);}
  }

  async function delFech(id){const u=fechamentos.filter(x=>x.id!==id);setFechamentos(u);await sSet(SK.FECH,u);}

  return <div className="space-y-5">
    <Card>
      <CH title="Lançar Fechamento do Dia" sub="Analítico final do dia — alimenta o Dashboard histórico"/>
      <div className="p-5 space-y-4">
        <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-3 text-xs text-blue-300">
          <p className="font-semibold mb-1">Como funciona:</p>
          <p>No final do dia, o gestor sobe o analítico consolidado aqui. Os dados são salvos com a data e alimentam os gráficos do Dashboard permanentemente — mesmo quando o analítico for trocado na Auditoria.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Inp label="Data do fechamento" type="date" value={data} onChange={e=>setData(e.target.value)}/>
          <Sel label="Unidade" value={unid} onChange={e=>setUnid(e.target.value)}>{UNIDS.map(u=><option key={u} value={u}>{UL[u]}</option>)}</Sel>
        </div>
        <FileZone label={loading?'Processando...':'Analítico do fechamento (.xlsx)'} accept=".xlsx,.xls" onChange={handleUp}/>
      </div>
    </Card>

    {fechamentos.length>0&&<Card>
      <CH title={`Fechamentos salvos (${fechamentos.length})`} sub="Dados históricos do Dashboard"/>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-700">
            {['Data','Unidade','CTEs','Volumes','Faturamento','Peso','Arquivo',''].map(h=><th key={h} className={`py-3 px-4 text-xs text-slate-500 font-medium ${['CTEs','Volumes','Faturamento','Peso'].includes(h)?'text-right':'text-left'}`}>{h}</th>)}
          </tr></thead>
          <tbody>
            {[...fechamentos].sort((a,b)=>b.data.localeCompare(a.data)).map(f=><tr key={f.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
              <td className="py-2 px-4 text-white text-xs font-medium">{f.data}</td>
              <td className="py-2 px-4 text-slate-300 text-xs">{UL[f.unidade]||f.unidade}</td>
              <td className="py-2 px-4 text-right text-blue-400 text-xs font-semibold">{f.resumo.ctes}</td>
              <td className="py-2 px-4 text-right text-slate-300 text-xs">{f.resumo.vol}</td>
              <td className="py-2 px-4 text-right text-emerald-400 text-xs">{fmtMoeda(f.resumo.frete)}</td>
              <td className="py-2 px-4 text-right text-slate-300 text-xs">{f.resumo.peso.toFixed(1)}kg</td>
              <td className="py-2 px-4 text-slate-500 text-xs truncate max-w-[120px]">{f.arquivo}</td>
              <td className="py-2 px-4"><button onClick={()=>delFech(f.id)} className="text-red-400 hover:text-red-300 text-xs">🗑</button></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </Card>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// TAB AUDITORIA
// ═══════════════════════════════════════════════════════════════
function TabAuditoria({clientes,emissores,analiticoUnid,setAnaliticoUnid,comissaoUnid,setComissaoUnid,notify}) {
  const [alertas,setAlertas]=useState([]);
  const [filtU,setFiltU]=useState('');
  const [filtC,setFiltC]=useState('');
  const [filtT,setFiltT]=useState('');
  const [thFrete,setThFrete]=useState(60);
  const [thPV,setThPV]=useState(10);

  async function handleUpAn(e,u) {
    const f=e.target.files[0];if(!f) return;
    try{const d=await readAnalitico(f);const up={...analiticoUnid,[u]:{...d,updatedAt:new Date().toISOString()}};setAnaliticoUnid(up);await sSet(SK.AN,up);notify(`Analítico ${UL[u]}: ${d.rows.length} reg`,'success');}
    catch(err){notify('Erro: '+err.message,'error');}
  }
  async function handleUpCom(e,u) {
    const f=e.target.files[0];if(!f) return;
    try{const d=await readComissao(f);const up={...comissaoUnid,[u]:{...d,updatedAt:new Date().toISOString()}};setComissaoUnid(up);await sSet(SK.COM,up);notify(`Comissão ${UL[u]}: ${d.rows.length} reg`,'success');}
    catch(err){notify('Erro: '+err.message,'error');}
  }

  function auditar() {
    if (!clientes.length) return notify('Cadastre clientes primeiro','warning');
    const all=[];
    function add(obj){all.push(obj);}
    UNIDS.forEach(u=>{
      const an=analiticoUnid[u];if(!an) return;
      an.rows.forEach(row=>{
        const cte=String(row[AN.CTE]||'').trim();if(!cte) return;
        const cnpj=String(row[AN.CNPJ]||'').replace(/\D/g,'');
        const conta=String(row[AN.CONTA]||'').trim();
        const frete=parseF(row[AN.FRETE]);
        const peso=parseF(row[AN.PESO]);
        const vol=Math.max(1,parseI(row[AN.VOL]));
        const operador=String(row[AN.OPERADOR]||'').trim();
        const remetente=String(row[AN.REMETENTE]||'').toLowerCase();
        const emNome=emissores.find(e=>e.id===operador)?.nome||operador;
        const ctx={unidade:u,cte,operador,emNome};
        const cli=clientes.find(c=>(c.cnpjs||[]).some(x=>x===cnpj)||remetente.includes(c.nome.toLowerCase())||c.nome.toLowerCase().includes(remetente.split(' ')[0]||'XXXXX'));
        // Normaliza conta dos dois lados para comparar igual
        const contaNorm = normalizaCC(conta);
        if (conta.toUpperCase().startsWith('F')) add({...ctx,tipo:'CONTA TIPO F',cliente:cli?.nome||cnpj,detalhe:`Conta ${conta}`,sev:'error'});
        if (cli&&(cli.contasCorrente||[]).length>0&&conta&&!(cli.contasCorrente||[]).map(normalizaCC).includes(contaNorm)) add({...ctx,tipo:'CC NÃO CADASTRADA',cliente:cli.nome,detalhe:`CC "${conta}" (${contaNorm}) não cadastrada. Cadastradas: ${(cli.contasCorrente||[]).map(normalizaCC).join(', ')}`,sev:'error'});
        if (cli&&(cli.cnpjs||[]).length>0&&cnpj&&!(cli.cnpjs||[]).some(x=>x===cnpj)) add({...ctx,tipo:'CNPJ NÃO CADASTRADO',cliente:cli.nome,detalhe:`CNPJ ${cnpj}`,sev:'warning'});
        if (frete>thFrete) add({...ctx,tipo:'FRETE ALTO',cliente:cli?.nome||remetente,detalhe:`${fmtMoeda(frete)} (limite ${fmtMoeda(thFrete)})`,sev:'warning'});
        if (peso/vol>thPV) add({...ctx,tipo:'PESO/VOL ALTO',cliente:cli?.nome||remetente,detalhe:`${peso.toFixed(1)}kg/${vol}vol=${(peso/vol).toFixed(1)} (limite ${thPV})`,sev:'warning'});
      });
    });
    UNIDS.forEach(u=>{
      const co=comissaoUnid[u];if(!co) return;
      co.rows.forEach(row=>{
        const cte=String(row[COM.CTE]||'').trim();if(!cte) return;
        const modal=String(row[COM.MODAL]||'').trim();
        const cnpj=String(row[COM.CNPJ]||'').replace(/\D/g,'');
        const coleta=parseF(row[COM.COLETA]);
        const embal=parseF(row[COM.EMBALAGEM]);
        const tipoFrete=String(row[COM.TIPO_FRETE]||'').trim();
        const ctx={unidade:u,cte,operador:'—',emNome:'—'};
        const cli=clientes.find(c=>(c.cnpjs||[]).some(x=>x===cnpj));
        if (cli&&(cli.modalidades||[]).length>0&&modal&&!(cli.modalidades||[]).includes(modal)) add({...ctx,tipo:'MODALIDADE INVÁLIDA',cliente:cli.nome,detalhe:`${modal} não permitida. Permitidas: ${cli.modalidades.join(', ')}`,sev:'error'});
        if (cli&&parseF(cli.taxaEmbalagem)>0&&embal===0) add({...ctx,tipo:'EMBALAGEM NÃO COBRADA',cliente:cli.nome,detalhe:`Taxa R$${cli.taxaEmbalagem} mas EMBALAGEM=0`,sev:'error'});
        if (cli&&parseF(cli.taxaColeta)>0&&coleta===0) add({...ctx,tipo:'COLETA NÃO COBRADA',cliente:cli.nome,detalhe:`Taxa R$${cli.taxaColeta} mas COLETA=0`,sev:'error'});
        if (tipoFrete.toUpperCase().startsWith('F')) add({...ctx,tipo:'TIPO FRETE F',cliente:cli?.nome||cnpj,detalhe:`Tipo "${tipoFrete}"`,sev:'error'});
      });
    });

    // ── DUPLICIDADES — mesma NF em mais de um CTE ──────────────
    UNIDS.forEach(u=>{
      const an=analiticoUnid[u];if(!an) return;
      const mapNFtoCTEs={};
      an.rows.forEach(row=>{
        const nf=normalizeNF(row[AN.NF]);
        const cte=String(row[AN.CTE]||'').trim();
        const remetente=String(row[AN.REMETENTE]||'').trim();
        if(!nf||!cte) return;
        if(!mapNFtoCTEs[nf]) mapNFtoCTEs[nf]={ctes:[],remetente};
        if(!mapNFtoCTEs[nf].ctes.includes(cte)) mapNFtoCTEs[nf].ctes.push(cte);
      });
      Object.entries(mapNFtoCTEs).forEach(([nf,{ctes,remetente}])=>{
        if(ctes.length>1){
          const cli=clientes.find(c=>remetente.toLowerCase().includes(c.nome.toLowerCase())||c.nome.toLowerCase().includes(remetente.split(' ')[0]||'XXXXX'));
          add({unidade:u,cte:ctes.join(' / '),operador:'—',emNome:'—',tipo:'NF DUPLICADA',cliente:cli?.nome||remetente,detalhe:`NF ${nf} aparece em ${ctes.length} CTEs: ${ctes.join(', ')}`,sev:'error'});
        }
      });
    });
    setAlertas(all);
    all.length===0?notify('✅ Nenhuma divergência!','success'):notify(`⚠️ ${all.length} alerta(s)`,'warning');
  }

  function exportarAlertas() {
    if (!alertas.length) return;
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet([['Tipo','Cliente','Detalhe','CTE','Emissor','Unidade','Severidade'],...alertas.map(a=>[a.tipo,a.cliente,a.detalhe,a.cte,a.emNome,UL[a.unidade]||a.unidade,a.sev])]);
    XLSX.utils.book_append_sheet(wb,ws,'Alertas');
    XLSX.writeFile(wb,`auditoria_ALL_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  const tipos=[...new Set(alertas.map(a=>a.tipo))];
  const cliAl=[...new Set(alertas.map(a=>a.cliente))];
  const filt=alertas.filter(a=>(!filtU||a.unidade===filtU)&&(!filtC||a.cliente===filtC)&&(!filtT||a.tipo===filtT));
  const erros=alertas.filter(a=>a.sev==='error').length;

  return <div className="space-y-5">
    <Card>
      <CH title="Parâmetros"/>
      <div className="p-5 grid grid-cols-2 gap-4">
        <div><label className="block text-xs text-slate-400 mb-1">Limite frete alto (R$)</label><input type="number" value={thFrete} onChange={e=>setThFrete(Number(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500"/></div>
        <div><label className="block text-xs text-slate-400 mb-1">Limite peso/vol (kg)</label><input type="number" value={thPV} onChange={e=>setThPV(Number(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500"/></div>
      </div>
    </Card>
    <Card>
      <CH title="Arquivos por Unidade" sub="Analítico + Comissão — substituição automática"/>
      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        {UNIDS.map(u=><div key={u} className="border border-slate-600 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-white">{UL[u]}</p>
          <label className="flex items-center gap-2 text-xs text-slate-400 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-3 py-2 cursor-pointer">📊 Analítico<input type="file" accept=".xlsx,.xls" className="hidden" onChange={e=>handleUpAn(e,u)}/></label>
          {analiticoUnid[u]&&<p className="text-xs text-emerald-400">✅ {analiticoUnid[u].rows.length} reg</p>}
          <label className="flex items-center gap-2 text-xs text-slate-400 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-3 py-2 cursor-pointer">💰 Comissão<input type="file" accept=".xlsx,.xls" className="hidden" onChange={e=>handleUpCom(e,u)}/></label>
          {comissaoUnid[u]&&<p className="text-xs text-emerald-400">✅ {comissaoUnid[u].rows.length} reg</p>}
        </div>)}
      </div>
      <div className="px-5 pb-5"><Btn variant="warning" className="w-full" onClick={auditar}>🔍 Auditar Tudo Agora</Btn></div>
    </Card>
    {alertas.length>0&&<>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total" value={alertas.length} color="yellow"/>
        <Stat label="Críticos" value={erros} color="red"/>
        <Stat label="Avisos" value={alertas.length-erros} color="yellow"/>
      </div>
      <Card>
        <CH title={`Alertas (${filt.length})`} actions={<>
          <button onClick={exportarAlertas} className="text-xs bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 rounded-lg px-3 py-1.5">⬇ Excel</button>
          <div className="flex gap-2 flex-wrap">
            <select className="bg-slate-700 border border-slate-600 text-xs text-slate-300 rounded px-2 py-1" value={filtU} onChange={e=>setFiltU(e.target.value)}>
              <option value="">Todas unid</option>{UNIDS.map(u=><option key={u} value={u}>{UL[u]}</option>)}
            </select>
            <select className="bg-slate-700 border border-slate-600 text-xs text-slate-300 rounded px-2 py-1" value={filtC} onChange={e=>setFiltC(e.target.value)}>
              <option value="">Todos clientes</option>{cliAl.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <select className="bg-slate-700 border border-slate-600 text-xs text-slate-300 rounded px-2 py-1" value={filtT} onChange={e=>setFiltT(e.target.value)}>
              <option value="">Todos tipos</option>{tipos.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </>}/>
        <div className="p-3 space-y-2 max-h-[480px] overflow-y-auto">
          {filt.length===0&&<p className="text-xs text-slate-500 text-center py-4">Nenhum alerta com esses filtros</p>}
          {filt.map((a,i)=><div key={i} className={`rounded-lg px-3 py-2.5 border-l-4 ${a.sev==='error'?'bg-red-900/30 border-red-500':'bg-amber-900/30 border-amber-500'}`}>
            <div className="flex items-start gap-2">
              <Badge color={a.sev==='error'?'red':'yellow'}>{a.tipo}</Badge>
              <div className="flex-1"><span className="text-sm font-medium text-white">{a.cliente}</span>
                <p className="text-xs text-slate-400 mt-0.5">{a.detalhe}</p>
                <p className="text-xs text-slate-500 mt-0.5">CTE: {a.cte}{a.emNome!=='—'?` · Op: ${a.emNome}`:''} · {UL[a.unidade]||a.unidade}</p>
              </div>
            </div>
          </div>)}
        </div>
      </Card>
    </>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// TAB DASHBOARD
// ═══════════════════════════════════════════════════════════════
function TabDashboard({emissores,analiticoUnid,conferencias,fechamentos}) {
  const [periodo,setPeriodo]=useState('30d');
  const [thFD,setThFD]=useState(60);
  const [thPD,setThPD]=useState(10);
  const [filtConfCli,setFiltConfCli]=useState('');
  const [filtConfDt,setFiltConfDt]=useState('');
  const eName=id=>emissores.find(e=>e.id===id)?.nome||id||'—';
  const TOOLTIP={contentStyle:{background:'#1e293b',border:'1px solid #475569',borderRadius:'8px',color:'#fff'},itemStyle:{color:'#cbd5e1'}};

  const dados=useMemo(()=>{
    const rows=[];
    UNIDS.forEach(u=>{const an=analiticoUnid[u];if(!an) return;an.rows.forEach(row=>{const cte=String(row[AN.CTE]||'').trim();if(!cte) return;rows.push({cte,data:fmtData(row[AN.DATA]),remetente:String(row[AN.REMETENTE]||'').trim(),operador:String(row[AN.OPERADOR]||'').trim(),frete:parseF(row[AN.FRETE]),peso:parseF(row[AN.PESO]),vol:Math.max(1,parseI(row[AN.VOL])),unidade:u});});});
    const hoje=new Date();const cutoff=new Date(hoje);
    if(periodo==='7d') cutoff.setDate(hoje.getDate()-7);else if(periodo==='30d') cutoff.setDate(hoje.getDate()-30);else if(periodo==='90d') cutoff.setDate(hoje.getDate()-90);
    const rowsF=periodo==='all'?rows:rows.filter(r=>{if(!r.data) return false;const p=r.data.split('/');if(p.length<3) return true;return new Date(p[2],p[1]-1,p[0])>=cutoff;});
    const byDay={};rowsF.forEach(r=>{if(!r.data) return;if(!byDay[r.data]) byDay[r.data]={data:r.data,ctes:0,vol:0,frete:0};byDay[r.data].ctes++;byDay[r.data].vol+=r.vol;byDay[r.data].frete+=r.frete;});
    const dias=Object.values(byDay).sort((a,b)=>a.data.localeCompare(b.data));
    const byWeek={};rows.forEach(r=>{if(!r.data) return;const p=r.data.split('/');if(p.length<3) return;const d=new Date(p[2],p[1]-1,p[0]);const w=`${d.getFullYear()}-W${String(Math.ceil(((d-new Date(d.getFullYear(),0,1))/86400000+1)/7)).padStart(2,'0')}`;if(!byWeek[w]) byWeek[w]={week:w,ctes:0,vol:0};byWeek[w].ctes++;byWeek[w].vol+=r.vol;});
    const semanas=Object.values(byWeek).sort((a,b)=>a.week.localeCompare(b.week)).slice(-12);
    const byOp={};rowsF.forEach(r=>{const k=r.operador||'?';if(!byOp[k]) byOp[k]={id:k,nome:eName(k),ctes:0,vol:0,frete:0};byOp[k].ctes++;byOp[k].vol+=r.vol;byOp[k].frete+=r.frete;});
    const topOp=Object.values(byOp).sort((a,b)=>b.ctes-a.ctes).slice(0,10);
    const byCli={};rowsF.forEach(r=>{const k=r.remetente||'?';if(!byCli[k]) byCli[k]={nome:k,ctes:0,vol:0,frete:0,peso:0};byCli[k].ctes++;byCli[k].vol+=r.vol;byCli[k].frete+=r.frete;byCli[k].peso+=r.peso;});
    const topCli=Object.values(byCli).sort((a,b)=>b.ctes-a.ctes).slice(0,15);
    const pesosA=rowsF.filter(r=>r.peso/r.vol>thPD).sort((a,b)=>(b.peso/b.vol)-(a.peso/a.vol)).slice(0,50);
    const fretesA=rowsF.filter(r=>r.frete>thFD).sort((a,b)=>b.frete-a.frete).slice(0,50);
    const totalCTEs=rowsF.length,totalVol=rowsF.reduce((s,r)=>s+r.vol,0),totalFrete=rowsF.reduce((s,r)=>s+r.frete,0);
    const allD=Object.values(byDay).sort((a,b)=>a.data.localeCompare(b.data));
    const ctesH=allD[allD.length-1]?.ctes||0,ctesO=allD[allD.length-2]?.ctes||0;
    const varDia=ctesO>0?((ctesH-ctesO)/ctesO*100).toFixed(1):0;
    // Conferências agrupadas por dia
    const confD={};conferencias.forEach(c=>{const k=c.data;if(!confD[k]) confD[k]={data:k,lancamentos:0,totalNFs:0,semCTE:0,foraRom:0,clientes:new Set()};confD[k].lancamentos++;confD[k].totalNFs+=c.nfsRomaneio.length;confD[k].semCTE+=c.resultado.semCTE.length;confD[k].foraRom+=c.resultado.emitidaSemRomaneio.length;confD[k].clientes.add(c.cliente);});
    const confDias=Object.values(confD).map(d=>({...d,clientes:[...d.clientes]})).sort((a,b)=>b.data.localeCompare(a.data));
    // Stats de conferências
    const totalConfs=conferencias.length;
    const totalPend=conferencias.reduce((s,c)=>s+c.resultado.semCTE.length,0);
    const totalFora=conferencias.reduce((s,c)=>s+c.resultado.emitidaSemRomaneio.length,0);
    return {dias,semanas,topOp,topCli,pesosA,fretesA,confDias,totalCTEs,totalVol,totalFrete,ctesH,ctesO,varDia,totalConfs,totalPend,totalFora};
  },[analiticoUnid,periodo,thFD,thPD,emissores,conferencias]);

  // Conferências filtradas
  const confFilt=useMemo(()=>conferencias.filter(c=>(!filtConfCli||c.cliente===filtConfCli)&&(!filtConfDt||c.data===filtConfDt)),[conferencias,filtConfCli,filtConfDt]);
  const hasAn=UNIDS.some(u=>analiticoUnid[u]);
  const maxOp=dados.topOp[0]?.ctes||1;

  return <div className="space-y-5">
    {/* KPIs conferência sempre visíveis */}
    {conferencias.length>0&&<>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Conferências" value={dados.totalConfs} color="blue"/>
        <Stat label="NFs pendentes" value={dados.totalPend} color="red" sub="sem emissão"/>
        <Stat label="Fora romaneio" value={dados.totalFora} color="yellow"/>
      </div>

      {/* Conferências salvas — painel permanente */}
      <Card>
        <CH title="Conferências Salvas" sub="Ficam aqui até você atualizar os dados" actions={
          <div className="flex gap-2">
            <select className="bg-slate-700 border border-slate-600 text-xs text-slate-300 rounded px-2 py-1" value={filtConfCli} onChange={e=>setFiltConfCli(e.target.value)}>
              <option value="">Todos clientes</option>
              {[...new Set(conferencias.map(c=>c.cliente))].map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <input type="date" className="bg-slate-700 border border-slate-600 text-xs text-slate-300 rounded px-2 py-1" value={filtConfDt} onChange={e=>setFiltConfDt(e.target.value)}/>
          </div>
        }/>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-700">
              {['Data','Cliente','Unidade','NFs','✅ CTE','❌ Pendentes','⚠️ Fora Rom.',''].map(h=><th key={h} className="py-3 px-3 text-xs text-slate-500 font-medium text-left">{h}</th>)}
            </tr></thead>
            <tbody>
              {[...confFilt].reverse().map(c=><tr key={c.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                <td className="py-2 px-3 text-slate-300 text-xs">{c.data}</td>
                <td className="py-2 px-3 text-white text-xs font-medium">{c.cliente}</td>
                <td className="py-2 px-3 text-slate-400 text-xs">{UL[c.unidade]||c.unidade}</td>
                <td className="py-2 px-3 text-slate-300 text-xs">{c.nfsRomaneio.length}</td>
                <td className="py-2 px-3 text-emerald-400 text-xs font-semibold">{c.resultado.comCTE.length}</td>
                <td className="py-2 px-3 text-xs">
                  {c.resultado.semCTE.length>0
                    ?<span className="bg-red-900/60 text-red-300 border border-red-700 rounded-full px-2 py-0.5 font-semibold">{c.resultado.semCTE.length}</span>
                    :<span className="text-slate-500">—</span>}
                </td>
                <td className="py-2 px-3 text-xs">
                  {c.resultado.emitidaSemRomaneio.length>0
                    ?<span className="bg-amber-900/60 text-amber-300 border border-amber-700 rounded-full px-2 py-0.5">{c.resultado.emitidaSemRomaneio.length}</span>
                    :<span className="text-slate-500">—</span>}
                </td>
                <td className="py-2 px-3">
                  <button onClick={()=>gerarPDF(c)} className="text-slate-400 hover:text-white text-xs" title="PDF">📄</button>
                </td>
              </tr>)}
              {confFilt.length===0&&<tr><td colSpan={8} className="py-6 text-center text-xs text-slate-500">Nenhuma conferência encontrada</td></tr>}
            </tbody>
          </table>
        </div>
        {/* Resumo por dia */}
        {dados.confDias.length>0&&<div className="border-t border-slate-700 p-4">
          <p className="text-xs text-slate-400 font-medium mb-3">Resumo por dia</p>
          <div className="space-y-2">
            {dados.confDias.slice(0,7).map((d,i)=><div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-400 w-24 shrink-0">{d.data}</span>
              <span className="text-slate-300 w-20 shrink-0">{d.lancamentos} lançamento{d.lancamentos>1?'s':''}</span>
              <span className="text-slate-400">{d.totalNFs} NFs</span>
              {d.semCTE>0&&<span className="text-red-400 ml-auto">{d.semCTE} pendentes</span>}
              {d.semCTE===0&&<span className="text-emerald-400 ml-auto">✅ ok</span>}
            </div>)}
          </div>
        </div>}
      </Card>
    </>}

    {!hasAn&&conferencias.length===0&&<Card><div className="p-12 text-center"><p className="text-4xl mb-3">📊</p><p className="text-slate-400 text-sm">Carregue analíticos na Auditoria ou salve conferências para ver dados aqui</p></div></Card>}

    {hasAn&&<>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="CTEs" value={dados.totalCTEs.toLocaleString('pt-BR')} color="blue"/>
        <Stat label="Volumes" value={dados.totalVol.toLocaleString('pt-BR')} color="white"/>
        <Stat label="Faturamento" value={`R$${(dados.totalFrete/1000).toFixed(1)}k`} color="green"/>
        <Stat label="Var. dia" value={`${dados.varDia>0?'+':''}${dados.varDia}%`} color={dados.varDia>=0?'green':'red'} sub={`${dados.ctesH} hoje vs ${dados.ctesO} ontem`}/>
      </div>
      <div className="flex gap-2">
        {[['7d','7d'],['30d','30d'],['90d','90d'],['all','Tudo']].map(([v,l])=><button key={v} onClick={()=>setPeriodo(v)} className={`px-3 py-1.5 text-xs rounded-full border transition-all ${periodo===v?'bg-blue-600 border-blue-600 text-white':'bg-slate-800 border-slate-600 text-slate-400 hover:border-blue-500'}`}>{l}</button>)}
      </div>
      {dados.dias.length>0&&<Card><CH title="Volumetria Diária"/><div className="p-5"><ResponsiveContainer width="100%" height={200}><LineChart data={dados.dias}><CartesianGrid strokeDasharray="3 3" stroke="#334155"/><XAxis dataKey="data" tick={{fill:'#94a3b8',fontSize:10}} interval="preserveStartEnd"/><YAxis tick={{fill:'#94a3b8',fontSize:10}}/><Tooltip {...TOOLTIP}/><Legend wrapperStyle={{color:'#94a3b8',fontSize:12}}/><Line type="monotone" dataKey="ctes" stroke="#3b82f6" strokeWidth={2} dot={false} name="CTEs"/><Line type="monotone" dataKey="vol" stroke="#10b981" strokeWidth={2} dot={false} name="Volumes"/></LineChart></ResponsiveContainer></div></Card>}
      {dados.semanas.length>1&&<Card><CH title="Variação Semanal"/><div className="p-5"><ResponsiveContainer width="100%" height={180}><BarChart data={dados.semanas}><CartesianGrid strokeDasharray="3 3" stroke="#334155"/><XAxis dataKey="week" tick={{fill:'#94a3b8',fontSize:9}}/><YAxis tick={{fill:'#94a3b8',fontSize:10}}/><Tooltip {...TOOLTIP}/><Bar dataKey="ctes" fill="#8b5cf6" name="CTEs" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div></Card>}
      <Card><CH title="Ranking Emissores"/><div className="p-5 space-y-3">
        {dados.topOp.map((e,i)=><div key={i} className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-4 text-right">{i+1}</span>
          <span className="text-sm text-slate-300 w-28 truncate">{e.nome}</span>
          <div className="flex-1 bg-slate-700 rounded-full h-2"><div className="bg-blue-500 h-2 rounded-full" style={{width:`${(e.ctes/maxOp)*100}%`}}/></div>
          <span className="text-xs text-slate-400 w-32 text-right">{e.ctes} CTEs · {e.vol} vol</span>
        </div>)}
      </div></Card>
      <Card><CH title="Ranking Clientes"/><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-700">{['#','Cliente','CTEs','Vol','Frete','Peso'].map(h=><th key={h} className={`py-3 px-4 text-xs text-slate-500 font-medium ${['#','Cliente'].includes(h)?'text-left':'text-right'}`}>{h}</th>)}</tr></thead>
      <tbody>{dados.topCli.map((c,i)=><tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30"><td className="py-2 px-4 text-slate-500 text-xs">{i+1}</td><td className="py-2 px-4 font-medium text-white text-xs">{c.nome}</td><td className="py-2 px-4 text-right text-slate-300 text-xs">{c.ctes}</td><td className="py-2 px-4 text-right text-slate-300 text-xs">{c.vol}</td><td className="py-2 px-4 text-right text-slate-300 text-xs">{c.frete>0?fmtMoeda(c.frete):'—'}</td><td className="py-2 px-4 text-right text-slate-300 text-xs">{c.peso>0?c.peso.toFixed(1)+'kg':'—'}</td></tr>)}</tbody>
      </table></div></Card>
      <Card><CH title={`Pesos/Vol Altos (${dados.pesosA.length})`} actions={<div className="flex items-center gap-2"><span className="text-xs text-slate-400">Limite:</span><input type="number" value={thPD} onChange={e=>setThPD(Number(e.target.value))} className="w-14 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"/><span className="text-xs text-slate-400">kg/vol</span></div>}/>
      {dados.pesosA.length===0?<div className="p-4"><p className="text-xs text-slate-500">Nenhum acima de {thPD}kg/vol</p></div>:
      <div className="overflow-x-auto max-h-52 overflow-y-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-slate-800"><tr className="border-b border-slate-700">{['CTE','Remetente','Peso','Vol','kg/vol'].map(h=><th key={h} className={`py-2 px-3 text-slate-500 font-medium ${['Peso','Vol','kg/vol'].includes(h)?'text-right':'text-left'}`}>{h}</th>)}</tr></thead>
      <tbody>{dados.pesosA.map((r,i)=><tr key={i} className="border-b border-slate-700/30 hover:bg-amber-900/10"><td className="py-1.5 px-3 text-slate-300">{r.cte}</td><td className="py-1.5 px-3 text-white">{r.remetente}</td><td className="py-1.5 px-3 text-right text-slate-300">{r.peso.toFixed(1)}</td><td className="py-1.5 px-3 text-right text-slate-300">{r.vol}</td><td className="py-1.5 px-3 text-right font-semibold text-amber-400">{(r.peso/r.vol).toFixed(1)}</td></tr>)}</tbody>
      </table></div>}</Card>
    </>}
  </div>;
}
// ═══════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [user,setUser]=useState(null);
  const [tab,setTab]=useState('conferencia');
  const [clientes,setClientes]=useState([]);
  const [emissores,setEmissores]=useState([]);
  const [conferencias,setConferencias]=useState([]);
  const [analiticoUnid,setAnaliticoUnid]=useState({});
  const [comissaoUnid,setComissaoUnid]=useState({});
  const [users,setUsers]=useState([]);
  const [toast,setToast]=useState(null);

  useEffect(()=>{
    const saved=sessionStorage.getItem('all_user');
    if (saved) try{setUser(JSON.parse(saved));}catch{}
    (async()=>{
      const [c,e,conf,an,co,u]=await Promise.all([sGet(SK.C),sGet(SK.E),sGet(SK.CONF),sGet(SK.AN),sGet(SK.COM),sGet(SK.USERS)]);
      if(c) setClientes(c);if(e) setEmissores(e);if(conf) setConferencias(conf);
      if(an) setAnaliticoUnid(an);if(co) setComissaoUnid(co);
      const finalUsers=u&&u.length?u:DEFAULT_USERS;
      setUsers(finalUsers);if(!u||!u.length) sSet(SK.USERS,DEFAULT_USERS);
    })();
  },[]);

  function handleLogin(u) { setUser(u);sessionStorage.setItem('all_user',JSON.stringify(u)); setTab(ROLES[u.role]?.tabs[0]||'conferencia'); }
  function handleLogout() { setUser(null);sessionStorage.removeItem('all_user'); }
  const notify=(msg,type='info')=>{setToast({msg,type});setTimeout(()=>setToast(null),5000);};

  if (!user) return <LoginScreen onLogin={handleLogin}/>;

  const role=user.role||'emissor';
  const TABS=[
    {id:'conferencia',label:'Conferência',icon:'📋'},
    {id:'auditoria',label:'Auditoria',icon:'🔍'},
    {id:'dashboard',label:'Dashboard',icon:'📊'},
    {id:'cadastro',label:'Cadastro',icon:'⚙️'},
    ...(canDo(role,'canManageUsers')?[{id:'usuarios',label:'Usuários',icon:'👥'}]:[]),
  ].filter(t=>hasTab(role,t.id)||t.id==='usuarios'&&canDo(role,'canManageUsers'));

  return <div className="min-h-screen bg-slate-900" style={{fontFamily:'system-ui,sans-serif'}}>
    <Toast msg={toast?.msg} type={toast?.type} onClose={()=>setToast(null)}/>
    <header className="bg-slate-950 border-b border-slate-800 px-4 py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">AL</div>
          <div><p className="text-white font-bold text-sm">ALL LOGÍSTICA</p><p className="text-slate-500 text-xs">Controle Operacional</p></div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-white text-xs font-medium">{user.nome}</p>
            <p className="text-slate-500 text-xs">{ROLES[role]?.label}</p>
          </div>
          <button onClick={handleLogout} className="text-xs bg-slate-800 hover:bg-red-900/40 border border-slate-700 hover:border-red-700 text-slate-400 hover:text-red-300 rounded-lg px-3 py-1.5 transition-colors">Sair</button>
        </div>
      </div>
    </header>
    <nav className="bg-slate-900 border-b border-slate-700 sticky top-0 z-40">
      <div className="max-w-5xl mx-auto flex overflow-x-auto">
        {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)}
          className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-all ${tab===t.id?'border-blue-500 text-white':'border-transparent text-slate-500 hover:text-slate-300'}`}>
          <span className="mr-1.5">{t.icon}</span>{t.label}
        </button>)}
      </div>
    </nav>
    <main className="max-w-5xl mx-auto px-4 py-6">
      {tab==='conferencia'&&<TabConferencia clientes={clientes} conferencias={conferencias} setConferencias={setConferencias} notify={notify} userRole={role}/>}
      {tab==='auditoria'&&<TabAuditoria clientes={clientes} emissores={emissores} analiticoUnid={analiticoUnid} setAnaliticoUnid={setAnaliticoUnid} comissaoUnid={comissaoUnid} setComissaoUnid={setComissaoUnid} notify={notify}/>}
      {tab==='dashboard'&&<TabDashboard emissores={emissores} analiticoUnid={analiticoUnid} conferencias={conferencias}/>}
      {tab==='cadastro'&&<TabCadastro clientes={clientes} setClientes={setClientes} emissores={emissores} setEmissores={setEmissores} notify={notify} userRole={role}/>}
      {tab==='usuarios'&&<TabUsuarios users={users} setUsers={setUsers} notify={notify}/>}
    </main>
  </div>;
}
