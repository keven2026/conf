import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

// ─── STORAGE — localStorage ────────────────────────────────────
const SK = { C:'all_cli_v2', E:'all_em_v2', CONF:'all_conf_v2', AN:'all_an_v2', COM:'all_com_v2' };
const sGet = async k => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):null; } catch { return null; } };
const sSet = async (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };

// ─── ÍNDICES FIXOS — ANALÍTICO (col A=0, B=1, ..., AJ=35) ──────
const AN = { DATA:0, CTE:1, REMETENTE:2, PESO:12, PESO_TAX:13, NF:14, FRETE:15, VOL:24,
             CONTA:30, CFOP:31, CNPJ:32, OPERADOR:35, UNIDADE:36 };
// ─── ÍNDICES FIXOS — COMISSÃO (header linha 3, dados linha 4+) ──
const COM = { CTE:0, MODAL:1, DATA:2, TIPO_FRETE:4, PESO:5, CNPJ:6, COLETA:8, EMBALAGEM:10 };

// ─── HELPERS ───────────────────────────────────────────────────
function normalizeNF(v) {
  if (!v) return '';
  const parts = String(v).match(/\d+/g) || [];
  return parts.reduce((a,b) => b.length > a.length ? b : a, '');
}
function fmtMoeda(v) { return `R$${Number(v||0).toFixed(2)}`; }
function fmtData(d) { if (!d) return ''; return String(d).substring(0,10); }
function parseF(v) { return parseFloat(String(v||'').replace(',','.')) || 0; }
function parseI(v) { const n=parseInt(String(v||'').replace(/\D/g,'')); return isNaN(n)?1:n; }

function readFileExcel(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type:'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve({ all: XLSX.utils.sheet_to_json(ws, { header:1, defval:'' }), sheetName: wb.SheetNames[0] });
      } catch(err) { reject(err); }
    };
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

// ─── IMPORTAÇÃO EM MASSA ───────────────────────────────────────
// Clientes: nome | cnpjs (separados por ;) | contas_correntes (;) | taxa | taxa_embalagem | taxa_coleta | modalidades (.PACKAGE;.COM)
// Emissores: id | nome

function parseCsvLike(text) {
  // Aceita CSV com ; ou , e também linhas simples (um item por linha)
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  return lines.map(l => l.split(/[;,\t]/).map(c => c.trim()));
}

async function importarClientes(file) {
  let rows = [];
  if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
    const { all } = await readFileExcel(file);
    // Detecta se primeira linha é header
    const headerRow = String(all[0]?.[0]||'').toLowerCase();
    const startIdx = /nome|client|razao/i.test(headerRow) ? 1 : 0;
    rows = all.slice(startIdx).filter(r => r[0]);
  } else {
    // CSV / TXT
    const text = await file.text();
    const parsed = parseCsvLike(text);
    const headerRow = String(parsed[0]?.[0]||'').toLowerCase();
    const startIdx = /nome|client|razao/i.test(headerRow) ? 1 : 0;
    rows = parsed.slice(startIdx).filter(r => r[0]);
  }

  return rows.map(r => ({
    id: Date.now() + Math.random(),
    nome:          String(r[0]||'').trim(),
    cnpjs:         String(r[1]||'').split(';').map(x=>x.replace(/\D/g,'')).filter(x=>x.length>=11),
    contasCorrente:String(r[2]||'').split(';').map(x=>normalizaCC(x.trim())).filter(Boolean),
    taxa:          String(r[3]||'').trim(),
    taxaEmbalagem: String(r[4]||'').trim(),
    taxaColeta:    String(r[5]||'').trim(),
    modalidades:   String(r[6]||'').split(';').map(x=>x.trim()).filter(x=>['.PACKAGE','.COM'].includes(x)),
  })).filter(c => c.nome);
}

async function importarEmissores(file) {
  let rows = [];
  if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
    const { all } = await readFileExcel(file);
    const startIdx = /id|operador/i.test(String(all[0]?.[0]||'')) ? 1 : 0;
    rows = all.slice(startIdx).filter(r => r[0]);
  } else {
    const text = await file.text();
    const parsed = parseCsvLike(text);
    const startIdx = /id|operador/i.test(String(parsed[0]?.[0]||'')) ? 1 : 0;
    rows = parsed.slice(startIdx).filter(r => r[0]);
  }
  return rows.map(r => ({ id: String(r[0]||'').trim(), nome: String(r[1]||'').trim() })).filter(e=>e.id&&e.nome);
}

function downloadTemplate(tipo) {
  const wb = XLSX.utils.book_new();
  if (tipo === 'clientes') {
    const ws = XLSX.utils.aoa_to_sheet([
      ['nome','cnpjs (sep. por ;)','contas_correntes (sep. por ;)','taxa_cte','taxa_embalagem','taxa_coleta','modalidades (sep. por ;)'],
      ['Arezzo','13444949000305;13444949000801','C015643;C015644','0.85','0.75','4.50','.PACKAGE;.COM'],
      ['Evino','60476884000159','C098765','1.20','','1.50','.COM'],
      ['Atomy','18717579000144','C001122','0.90','0.75','','.PACKAGE'],
    ]);
    ws['!cols'] = [20,30,25,12,15,12,20].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
  } else {
    const ws = XLSX.utils.aoa_to_sheet([
      ['id_operador','nome'],
      ['131451','Felipe'],
      ['131452','João'],
      ['131453','Maria'],
    ]);
    ws['!cols'] = [15,20].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws, 'Emissores');
  }
  XLSX.writeFile(wb, `template_${tipo}_ALL.xlsx`);
}

async function readAnalitico(file) {
  const { all, sheetName } = await readFileExcel(file);
  const rows = all.slice(1).filter(r => r[AN.CTE]);
  return { rows, sheetName, type:'analitico' };
}
async function readComissao(file) {
  const { all, sheetName } = await readFileExcel(file);
  const rows = all.slice(3).filter(r => r[COM.CTE]);
  return { rows, sheetName, type:'comissao' };
}
function fileToBase64(file) {
  return new Promise((res,rej) => { const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
}

// ─── UI ATOMS ──────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  if (!msg) return null;
  const c = { success:'bg-emerald-900 border-emerald-500', error:'bg-red-900 border-red-500', warning:'bg-amber-900 border-amber-500', info:'bg-slate-800 border-slate-500' };
  return <div className={`fixed top-4 right-4 z-50 border-l-4 px-4 py-3 rounded-lg shadow-2xl max-w-xs text-sm text-white ${c[type]||c.info}`}>
    <div className="flex gap-2"><span className="flex-1">{msg}</span><button onClick={onClose} className="text-white/60 hover:text-white">×</button></div>
  </div>;
}
function normalizaCC(v) {
  // Aceita: "016098-6", "C016098", "016098", "c016098" etc.
  // Sempre retorna formato Jadlog: "C016098"
  if (!v) return '';
  const s = v.trim().toUpperCase();
  // Remove traço e tudo depois dele
  const semTraco = s.split('-')[0];
  // Remove o C do início se já tiver, pega só os números
  const nums = semTraco.replace(/^C/, '').replace(/\D/g, '');
  if (!nums) return s; // fallback: retorna como veio
  return 'C' + nums;
}

function Card({ children, className='' }) { return <div className={`bg-slate-800 rounded-xl border border-slate-700 ${className}`}>{children}</div>; }

function CH({ title, sub, actions }) {
  return <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-700">
    <div><h3 className="font-semibold text-white text-sm">{title}</h3>{sub&&<p className="text-xs text-slate-400 mt-0.5">{sub}</p>}</div>
    {actions&&<div className="flex gap-2 items-center">{actions}</div>}
  </div>;
}
function Stat({ label, value, color='white', sub }) {
  const c={green:'text-emerald-400',red:'text-red-400',yellow:'text-amber-400',white:'text-white',blue:'text-blue-400',purple:'text-purple-400'};
  return <div className="bg-slate-700/50 rounded-lg p-3 text-center">
    <p className={`text-xl font-bold ${c[color]||c.white}`}>{value}</p>
    <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    {sub&&<p className="text-xs text-slate-500">{sub}</p>}
  </div>;
}
function Inp({ label, ...p }) { return <div>{label&&<label className="block text-xs text-slate-400 mb-1 font-medium">{label}</label>}<input className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none" {...p}/></div>; }
function Sel({ label, children, ...p }) { return <div>{label&&<label className="block text-xs text-slate-400 mb-1 font-medium">{label}</label>}<select className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none" {...p}>{children}</select></div>; }
function Btn({ children, variant='primary', size='md', disabled, className='', ...p }) {
  const V={primary:'bg-blue-600 hover:bg-blue-500 text-white',success:'bg-emerald-700 hover:bg-emerald-600 text-white',danger:'bg-red-700 hover:bg-red-600 text-white',warning:'bg-amber-700 hover:bg-amber-600 text-white',ghost:'bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600'};
  const S={sm:'px-3 py-1.5 text-xs',md:'px-4 py-2 text-sm',lg:'px-5 py-2.5 text-sm'};
  return <button disabled={disabled} className={`rounded-lg font-medium transition-all focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${V[variant]} ${S[size]} ${className}`} {...p}>{children}</button>;
}
function FileZone({ label, accept, multiple, onChange }) {
  return <label className="flex flex-col items-center justify-center w-full border-2 border-dashed border-slate-600 hover:border-blue-500 rounded-xl p-4 cursor-pointer transition-colors bg-slate-700/30">
    <span className="text-2xl mb-1">📁</span><span className="text-sm text-slate-300 font-medium">{label}</span>
    <span className="text-xs text-slate-500 mt-0.5">{accept}</span>
    <input type="file" className="hidden" accept={accept} multiple={multiple} onChange={onChange} />
  </label>;
}
function Badge({ children, color='slate' }) {
  const C={green:'bg-emerald-900/60 text-emerald-300 border-emerald-700',red:'bg-red-900/60 text-red-300 border-red-700',yellow:'bg-amber-900/60 text-amber-300 border-amber-700',blue:'bg-blue-900/60 text-blue-300 border-blue-700',slate:'bg-slate-700 text-slate-300 border-slate-600'};
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${C[color]||C.slate}`}>{children}</span>;
}
const UNIDS=['ES','BH','EX'];
const UL={ES:'Espírito Santo',BH:'Belo Horizonte',EX:'Extrema'};
const MODALIDADES=['.PACKAGE','.COM'];

// ═══════════════════════════════════════════════════════════════
// TAB CADASTRO
// ═══════════════════════════════════════════════════════════════
const emCli = { nome:'', cnpjs:[], contasCorrente:[], taxa:'', taxaEmbalagem:'', taxaColeta:'', modalidades:[] };

function TabCadastro({ clientes, setClientes, emissores, setEmissores, notify }) {
  const [cf, setCf] = useState(emCli);
  const [cnpjTmp, setCnpjTmp] = useState('');
  const [ccTmp, setCcTmp] = useState('');
  const [editIdx, setEditIdx] = useState(null);
  const [ef, setEf] = useState({ id:'', nome:'' });

  async function saveCliente(e) {
    e.preventDefault();
    if (!cf.nome.trim()) return notify('Nome obrigatório','error');
    const u = editIdx!==null ? clientes.map((c,i)=>i===editIdx?{...cf}:c) : [...clientes,{...cf,id:Date.now()}];
    setClientes(u); await sSet(SK.C,u); setEditIdx(null); setCf(emCli); setCnpjTmp(''); setCcTmp('');
    notify('Cliente salvo','success');
  }
  async function delCli(i) { const u=clientes.filter((_,x)=>x!==i); setClientes(u); await sSet(SK.C,u); }
  async function saveEm(e) {
    e.preventDefault();
    if (!ef.id||!ef.nome) return notify('ID e Nome obrigatórios','error');
    const u=[...emissores.filter(x=>x.id!==ef.id),{...ef}];
    setEmissores(u); await sSet(SK.E,u); setEf({id:'',nome:''}); notify('Emissor salvo','success');
  }
  async function delEm(id) { const u=emissores.filter(e=>e.id!==id); setEmissores(u); await sSet(SK.E,u); }
  function addCnpj() { const c=cnpjTmp.replace(/\D/g,''); if(c.length<11) return notify('CNPJ inválido','warning'); if((cf.cnpjs||[]).includes(c)) return; setCf(p=>({...p,cnpjs:[...(p.cnpjs||[]),c]})); setCnpjTmp(''); }
  function addCC() {
    const raw = ccTmp.trim();
    if (!raw) return;
    const c = normalizaCC(raw);
    if ((cf.contasCorrente||[]).includes(c)) return notify('CC já cadastrada','warning');
    setCf(p=>({...p,contasCorrente:[...(p.contasCorrente||[]),c]}));
    setCcTmp('');
  }
  function togMod(m) { const ms=cf.modalidades||[]; setCf(p=>({...p,modalidades:ms.includes(m)?ms.filter(x=>x!==m):[...ms,m]})); }

  const [importando, setImportando] = useState(false);
  const [importPreview, setImportPreview] = useState(null); // {tipo, items, file}

  async function handleImportFile(e, tipo) {
    const f = e.target.files[0]; if (!f) return;
    setImportando(true);
    try {
      const items = tipo==='clientes' ? await importarClientes(f) : await importarEmissores(f);
      if (!items.length) return notify('Nenhum registro encontrado no arquivo','warning');
      setImportPreview({tipo, items, file:f.name});
    } catch(err) { notify('Erro ao ler arquivo: '+err.message,'error'); }
    finally { setImportando(false); }
  }

  async function confirmarImport() {
    if (!importPreview) return;
    const {tipo, items} = importPreview;
    if (tipo==='clientes') {
      // Mescla: não duplica por nome
      const existentes = new Set(clientes.map(c=>c.nome.toLowerCase()));
      const novos = items.filter(c=>!existentes.has(c.nome.toLowerCase()));
      const merged = [...clientes, ...novos];
      setClientes(merged); await sSet(SK.C, merged);
      notify(`✅ ${novos.length} clientes importados (${items.length-novos.length} duplicados ignorados)`,'success');
    } else {
      const existentes = new Set(emissores.map(e=>e.id));
      const novos = items.filter(e=>!existentes.has(e.id));
      const merged = [...emissores, ...novos];
      setEmissores(merged); await sSet(SK.E, merged);
      notify(`✅ ${novos.length} emissores importados`,'success');
    }
    setImportPreview(null);
  }

  return (
    <div className="space-y-5">
      {/* IMPORTAÇÃO EM MASSA */}
      <Card>
        <CH title="Importação em Massa" sub="Excel ou CSV — clientes e emissores de uma vez" />
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Clientes */}
            <div className="border border-slate-600 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-white">📋 Clientes</p>
              <p className="text-xs text-slate-400">Colunas: nome · CNPJs (sep. ;) · CCs (sep. ;) · taxa · embalagem · coleta · modalidades</p>
              <div className="flex gap-2">
                <label className="flex-1 text-center text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 py-2 cursor-pointer transition-colors font-medium">
                  {importando ? '⏳ Lendo...' : '📂 Importar clientes'}
                  <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={e=>handleImportFile(e,'clientes')} />
                </label>
                <button onClick={()=>downloadTemplate('clientes')} className="text-xs bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 rounded-lg px-3 py-2 transition-colors" title="Baixar template">⬇ Template</button>
              </div>
            </div>
            {/* Emissores */}
            <div className="border border-slate-600 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-white">👤 Emissores</p>
              <p className="text-xs text-slate-400">Colunas: id_operador · nome</p>
              <div className="flex gap-2">
                <label className="flex-1 text-center text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 py-2 cursor-pointer transition-colors font-medium">
                  {importando ? '⏳ Lendo...' : '📂 Importar emissores'}
                  <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={e=>handleImportFile(e,'emissores')} />
                </label>
                <button onClick={()=>downloadTemplate('emissores')} className="text-xs bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 rounded-lg px-3 py-2 transition-colors" title="Baixar template">⬇ Template</button>
              </div>
            </div>
          </div>

          {/* Preview antes de confirmar */}
          {importPreview && (
            <div className="border border-blue-700 bg-blue-900/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-blue-300">
                  Preview — {importPreview.items.length} {importPreview.tipo} de "{importPreview.file}"
                </p>
                <button onClick={()=>setImportPreview(null)} className="text-slate-500 hover:text-red-400 text-sm">✕</button>
              </div>
              <div className="max-h-52 overflow-y-auto space-y-1">
                {importPreview.items.map((item,i) => (
                  <div key={i} className="bg-slate-800 rounded-lg px-3 py-2 text-xs">
                    {importPreview.tipo==='clientes' ? (
                      <div>
                        <span className="font-medium text-white">{item.nome}</span>
                        <span className="text-slate-400 ml-2">{item.cnpjs.length} CNPJ(s) · {item.contasCorrente.length} CC(s) · R${item.taxa||'—'}</span>
                        {item.modalidades.length>0&&<span className="text-blue-400 ml-2">{item.modalidades.join('/')}</span>}
                      </div>
                    ) : (
                      <div><span className="font-medium text-white">{item.nome}</span><span className="text-slate-400 ml-2">ID: {item.id}</span></div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Btn variant="success" className="flex-1" onClick={confirmarImport}>✅ Confirmar importação</Btn>
                <Btn variant="ghost" onClick={()=>setImportPreview(null)}>Cancelar</Btn>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <Card>
        <CH title="Clientes / Contas" sub="Multi-CNPJ, multi-CC, taxas e modalidades" />
        <div className="p-5 space-y-3">
          <form onSubmit={saveCliente} className="space-y-3">
            <Inp label="Nome do Cliente" placeholder="ex: Arezzo" value={cf.nome} onChange={e=>setCf(p=>({...p,nome:e.target.value}))} />
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-medium">CNPJs cadastrados (múltiplos)</label>
              <div className="flex gap-2">
                <input value={cnpjTmp} onChange={e=>setCnpjTmp(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),addCnpj())} placeholder="00.000.000/0000-00"
                  className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500" />
                <Btn type="button" size="sm" variant="ghost" onClick={addCnpj}>+</Btn>
              </div>
              {(cf.cnpjs||[]).length>0&&<div className="flex flex-wrap gap-1 mt-1">
                {cf.cnpjs.map((c,i)=><span key={i} className="bg-blue-900/50 text-blue-300 border border-blue-700 text-xs rounded-full px-2 py-0.5 flex items-center gap-1">
                  {c}<button type="button" onClick={()=>setCf(p=>({...p,cnpjs:p.cnpjs.filter((_,ii)=>ii!==i)}))} className="hover:text-red-400">×</button>
                </span>)}
              </div>}
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-medium">Contas Correntes — col AE (múltiplas)</label>
              <div className="flex gap-2">
                <input value={ccTmp} onChange={e=>setCcTmp(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),addCC())} placeholder="ex: C015643 ou 015643-6"
                  className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500" />
                <Btn type="button" size="sm" variant="ghost" onClick={addCC}>+</Btn>
              </div>
              {ccTmp.trim() && (
                <p className="text-xs mt-1">
                  <span className="text-slate-500">Será salvo como: </span>
                  <span className="text-blue-400 font-mono font-semibold">{normalizaCC(ccTmp)}</span>
                  <span className="text-slate-500"> (formato Jadlog)</span>
                </p>
              )}
              {(cf.contasCorrente||[]).length>0&&<div className="flex flex-wrap gap-1 mt-1">
                {cf.contasCorrente.map((c,i)=><span key={i} className={`text-xs rounded-full px-2 py-0.5 flex items-center gap-1 border ${c.startsWith('F')?'bg-red-900/50 text-red-300 border-red-700':'bg-slate-700 text-slate-300 border-slate-600'}`}>
                  {c}<button type="button" onClick={()=>setCf(p=>({...p,contasCorrente:p.contasCorrente.filter((_,ii)=>ii!==i)}))} className="hover:text-red-400">×</button>
                </span>)}
              </div>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Inp label="Taxa CTE (R$)" placeholder="0.85" value={cf.taxa} onChange={e=>setCf(p=>({...p,taxa:e.target.value}))} />
              <Inp label="Taxa Embalagem" placeholder="0.75" value={cf.taxaEmbalagem||''} onChange={e=>setCf(p=>({...p,taxaEmbalagem:e.target.value}))} />
              <Inp label="Taxa Coleta" placeholder="4.50" value={cf.taxaColeta||''} onChange={e=>setCf(p=>({...p,taxaColeta:e.target.value}))} />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1 font-medium">Modalidades permitidas</p>
              <div className="flex gap-2">
                {MODALIDADES.map(m=><button key={m} type="button" onClick={()=>togMod(m)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-all ${(cf.modalidades||[]).includes(m)?'bg-blue-600 border-blue-600 text-white':'bg-slate-700 border-slate-600 text-slate-400 hover:border-blue-500'}`}>{m}</button>)}
              </div>
            </div>
            <Btn type="submit" variant="primary" className="w-full">{editIdx!==null?'Atualizar':'+ Adicionar Cliente'}</Btn>
          </form>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {clientes.length===0&&<p className="text-xs text-slate-500 text-center py-3">Nenhum cliente</p>}
            {clientes.map((c,i)=><div key={i} className="flex items-start justify-between bg-slate-700/50 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-medium text-white">{c.nome}</p>
                <p className="text-xs text-slate-400">{(c.cnpjs||[]).length} CNPJ(s) · {(c.contasCorrente||[]).length} CC(s) · R${c.taxa||'—'}{c.taxaEmbalagem?` · Emb:${c.taxaEmbalagem}`:''}{c.taxaColeta?` · Col:${c.taxaColeta}`:''}</p>
                <p className="text-xs text-slate-500">{(c.modalidades||[]).join(' / ')||'sem modalidade'}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={()=>{setCf({...c});setEditIdx(i);}} className="text-blue-400 text-xs px-1">✏️</button>
                <button onClick={()=>delCli(i)} className="text-red-400 text-xs px-1">🗑️</button>
              </div>
            </div>)}
          </div>
        </div>
      </Card>
      <Card>
        <CH title="Emissores / Operadores" sub="ID col AJ do analítico" />
        <div className="p-5 space-y-3">
          <form onSubmit={saveEm} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Inp label="ID Operador" placeholder="ex: 131451" value={ef.id} onChange={e=>setEf(p=>({...p,id:e.target.value}))} />
              <Inp label="Nome" placeholder="ex: Felipe" value={ef.nome} onChange={e=>setEf(p=>({...p,nome:e.target.value}))} />
            </div>
            <Btn type="submit" variant="primary" className="w-full">+ Adicionar Emissor</Btn>
          </form>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {emissores.length===0&&<p className="text-xs text-slate-500 text-center py-3">Nenhum emissor</p>}
            {emissores.map((e,i)=><div key={i} className="flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2">
              <div><p className="text-sm font-medium text-white">{e.nome}</p><p className="text-xs text-slate-400">ID: {e.id}</p></div>
              <button onClick={()=>delEm(e.id)} className="text-red-400 text-xs">🗑️</button>
            </div>)}
          </div>
        </div>
      </Card>
    </div>
  </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB CONFERÊNCIA
// ═══════════════════════════════════════════════════════════════
function ConferenciaDetalhe({ conf, onBack }) {
  function exportar() {
    const L = [
      `CONFERÊNCIA — ${conf.cliente} | ${conf.data} | ${UL[conf.unidade]||conf.unidade}`,
      `NFs: ${conf.nfsRomaneio.length} | Com CTE: ${conf.resultado.comCTE.length} | Sem emissão: ${conf.resultado.semCTE.length} | Fora romaneio: ${conf.resultado.emitidaSemRomaneio.length}`,
      '','=== SEM EMISSÃO ===', ...conf.resultado.semCTE.map(x=>`NF: ${x.nf}`),
      '','=== FORA DO ROMANEIO ===', ...conf.resultado.emitidaSemRomaneio.map(x=>`NF: ${x.nf} | CTE: ${x.cte}`),
    ];
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([L.join('\n')],{type:'text/plain'}));
    a.download=`conf_${conf.cliente}_${conf.data}.txt`; a.click();
  }
  return <div className="space-y-4">
    <div className="flex gap-3">
      <button onClick={onBack} className="text-blue-400 hover:text-blue-300 text-sm">← Voltar</button>
      <Btn size="sm" variant="ghost" onClick={exportar}>⬇ Exportar</Btn>
    </div>
    <Card>
      <CH title={conf.cliente} sub={`${conf.data} · ${UL[conf.unidade]||conf.unidade}`} />
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Com CTE" value={conf.resultado.comCTE.length} color="green" />
          <Stat label="Sem emissão" value={conf.resultado.semCTE.length} color="red" />
          <Stat label="Fora romaneio" value={conf.resultado.emitidaSemRomaneio.length} color="yellow" />
        </div>
        {conf.resultado.semCTE.length>0&&<div className="bg-red-900/30 border border-red-800 rounded-lg p-3">
          <p className="text-xs text-red-400 font-semibold mb-2">❌ Sem emissão:</p>
          <div className="flex flex-wrap gap-1">{conf.resultado.semCTE.map((x,i)=><span key={i} className="bg-red-900/60 text-red-300 border border-red-700 text-xs rounded px-2 py-0.5">{x.nf}</span>)}</div>
        </div>}
        {conf.resultado.emitidaSemRomaneio.length>0&&<div className="bg-amber-900/30 border border-amber-800 rounded-lg p-3">
          <p className="text-xs text-amber-400 font-semibold mb-2">⚠️ Emitidas fora do romaneio:</p>
          <div className="space-y-0.5 max-h-40 overflow-y-auto">{conf.resultado.emitidaSemRomaneio.map((x,i)=><div key={i} className="text-xs text-amber-300">NF {x.nf} · CTE {x.cte}</div>)}</div>
        </div>}
      </div>
    </Card>
  </div>;
}

function TabConferencia({ clientes, conferencias, setConferencias, notify }) {
  const [cli, setCli] = useState('');
  const [data, setData] = useState(new Date().toISOString().split('T')[0]);
  const [unid, setUnid] = useState('ES');
  const [nfTxt, setNfTxt] = useState('');
  const [nfsRom, setNfsRom] = useState([]);
  const [analitico, setAnalitico] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [step, setStep] = useState(1);
  const [viewConf, setViewConf] = useState(null);
  const [filtCli, setFiltCli] = useState('');
  const [filtDt, setFiltDt] = useState('');

  if (viewConf) return <ConferenciaDetalhe conf={viewConf} onBack={()=>setViewConf(null)} />;

  function confirmarNFs() {
    if (!cli) return notify('Selecione o cliente','warning');
    if (!nfTxt.trim()) return notify('Cole os números de NF','warning');
    const nums=(nfTxt.match(/\b\d{4,12}\b/g)||[]).map(normalizeNF);
    const unique=[...new Set(nums.filter(n=>n.length>=4))];
    if (!unique.length) return notify('Nenhum número encontrado','error');
    setNfsRom(unique); notify(`✅ ${unique.length} NFs confirmadas`,'success'); setStep(2);
  }
  async function handleAn(e) {
    const f=e.target.files[0]; if(!f) return;
    try { const d=await readAnalitico(f); setAnalitico(d); notify(`Analítico: ${d.rows.length} linhas`,'success'); }
    catch(err) { notify('Erro: '+err.message,'error'); }
  }
  function cruzar() {
    if (!nfsRom.length) return notify('Confirme as NFs','warning');
    if (!analitico) return notify('Carregue o analítico','warning');
    const mapNFtoCTE={};
    analitico.rows.forEach(row => {
      const nf=normalizeNF(row[AN.NF]), cte=String(row[AN.CTE]||'').trim();
      if(nf) mapNFtoCTE[nf]=cte||null;
    });
    const romSet=new Set(nfsRom);
    const comCTE=[],semCTE=[];
    nfsRom.forEach(nf=>{
      if(mapNFtoCTE.hasOwnProperty(nf)) mapNFtoCTE[nf]?comCTE.push({nf,cte:mapNFtoCTE[nf]}):semCTE.push({nf});
      else semCTE.push({nf});
    });
    const emitidaSemRomaneio=Object.entries(mapNFtoCTE).filter(([nf,cte])=>cte&&!romSet.has(nf)).map(([nf,cte])=>({nf,cte}));
    setResultado({comCTE,semCTE,emitidaSemRomaneio}); setStep(3);
  }
  async function salvar() {
    if(!resultado||!cli) return;
    const c={id:Date.now(),cliente:cli,data,unidade:unid,nfsRomaneio:nfsRom,resultado};
    const u=[...conferencias,c]; setConferencias(u); await sSet(SK.CONF,u);
    notify('Conferência salva!','success');
    setNfTxt(''); setNfsRom([]); setAnalitico(null); setResultado(null); setStep(1); setCli('');
  }
  const confFilt=conferencias.filter(c=>(!filtCli||c.cliente===filtCli)&&(!filtDt||c.data===filtDt));
  const nfCount=[...new Set((nfTxt.match(/\b\d{4,12}\b/g)||[]))].length;

  return <div className="space-y-5">
    <Card>
      <CH title="Nova Conferência" />
      <div className="p-5 grid grid-cols-3 gap-3">
        <Sel label="Cliente" value={cli} onChange={e=>setCli(e.target.value)}>
          <option value="">Selecionar...</option>
          {clientes.map((c,i)=><option key={i} value={c.nome}>{c.nome}</option>)}
        </Sel>
        <Inp label="Data" type="date" value={data} onChange={e=>setData(e.target.value)} />
        <Sel label="Unidade" value={unid} onChange={e=>setUnid(e.target.value)}>
          {UNIDS.map(u=><option key={u} value={u}>{UL[u]}</option>)}
        </Sel>
      </div>
    </Card>
    <div className="flex gap-2">
      {['NFs','Analítico','Resultado'].map((s,i)=><div key={i} className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${step===i+1?'bg-blue-600 border-blue-600 text-white':step>i+1?'bg-emerald-900/60 border-emerald-700 text-emerald-300':'bg-slate-800 border-slate-600 text-slate-500'}`}>{step>i+1?'✓':i+1}. {s}</div>)}
    </div>
    <Card>
      <CH title="Passo 1 — Números de NF" sub="Cole os números retornados pelo Claude" />
      <div className="p-5 space-y-3">
        <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-3 text-xs text-blue-300">
          <p className="font-semibold mb-1">Como extrair das fotos:</p>
          <p>1. Nova conversa no Claude · 2. Envie as fotos + mensagem abaixo · 3. Copie os números · 4. Cole aqui</p>
          <div className="bg-slate-900 rounded p-2 flex justify-between mt-2">
            <span className="font-mono text-xs">Liste os nºs de NF das fotos, um por linha, só dígitos. "1-016659626"→"016659626"</span>
            <button onClick={()=>navigator.clipboard?.writeText('Liste todos os números de Nota Fiscal visíveis nestas fotos de romaneio. Um por linha, somente dígitos. Para "NF n°: 1-016659626" escreva "016659626". Para "002592596" escreva "002592596".').then(()=>notify('Copiado!','success'))} className="text-blue-400 hover:text-blue-300 ml-2">📋</button>
          </div>
        </div>
        <textarea value={nfTxt} onChange={e=>setNfTxt(e.target.value)} placeholder={"016659626\n016660131\n..."} rows={7}
          className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:ring-2 focus:ring-blue-500 outline-none resize-none font-mono" />
        {nfTxt&&<p className="text-xs text-slate-400">{nfCount} NFs detectadas</p>}
        <Btn variant="primary" className="w-full py-3" onClick={confirmarNFs}>✅ Confirmar NFs ({nfCount})</Btn>
        {nfsRom.length>0&&<div className="bg-emerald-900/40 border border-emerald-700 rounded-lg p-3"><p className="text-sm font-semibold text-emerald-300">✅ {nfsRom.length} NFs confirmadas</p></div>}
      </div>
    </Card>
    {step>=2&&<Card>
      <CH title="Passo 2 — Analítico" />
      <div className="p-5 space-y-3">
        <FileZone label="Analítico (.xlsx)" accept=".xlsx,.xls" onChange={handleAn} />
        {analitico&&<div className="bg-emerald-900/40 border border-emerald-700 rounded-lg p-3"><p className="text-sm text-emerald-300">✅ {analitico.rows.length} registros</p></div>}
        {analitico&&<Btn variant="success" className="w-full" onClick={cruzar}>⚡ Cruzar NFs × CTEs</Btn>}
      </div>
    </Card>}
    {step>=3&&resultado&&<Card>
      <CH title="Resultado" />
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Com CTE" value={resultado.comCTE.length} color="green" />
          <Stat label="Sem emissão" value={resultado.semCTE.length} color="red" />
          <Stat label="Fora romaneio" value={resultado.emitidaSemRomaneio.length} color="yellow" />
        </div>
        {resultado.semCTE.length>0&&<div className="bg-red-900/30 border border-red-800 rounded-lg p-3">
          <p className="text-xs text-red-400 font-semibold mb-2">❌ Sem emissão:</p>
          <div className="flex flex-wrap gap-1">{resultado.semCTE.map((x,i)=><span key={i} className="bg-red-900/60 text-red-300 border border-red-700 text-xs rounded px-2 py-0.5">{x.nf}</span>)}</div>
        </div>}
        {resultado.emitidaSemRomaneio.length>0&&<div className="bg-amber-900/30 border border-amber-800 rounded-lg p-3">
          <p className="text-xs text-amber-400 font-semibold mb-2">⚠️ Fora do romaneio:</p>
          <div className="space-y-0.5">{resultado.emitidaSemRomaneio.slice(0,20).map((x,i)=><div key={i} className="text-xs text-amber-300">NF {x.nf} · CTE {x.cte}</div>)}</div>
        </div>}
        <Btn variant="primary" className="w-full" onClick={salvar}>💾 Salvar Conferência</Btn>
      </div>
    </Card>}
    {conferencias.length>0&&<Card>
      <CH title="Histórico" actions={<div className="flex gap-2">
        <select className="bg-slate-700 border border-slate-600 text-xs text-slate-300 rounded px-2 py-1" value={filtCli} onChange={e=>setFiltCli(e.target.value)}>
          <option value="">Todos</option>{[...new Set(conferencias.map(c=>c.cliente))].map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" className="bg-slate-700 border border-slate-600 text-xs text-slate-300 rounded px-2 py-1" value={filtDt} onChange={e=>setFiltDt(e.target.value)} />
      </div>} />
      <div className="p-3 space-y-1.5 max-h-64 overflow-y-auto">
        {[...confFilt].reverse().map(c=><div key={c.id} onClick={()=>setViewConf(c)} className="flex items-center justify-between bg-slate-700/50 hover:bg-slate-700 rounded-lg px-3 py-2.5 cursor-pointer transition-colors">
          <div>
            <p className="text-sm font-medium text-white">{c.cliente} <span className="text-slate-400 font-normal">— {c.data}</span></p>
            <p className="text-xs text-slate-400">{UL[c.unidade]||c.unidade} · {c.nfsRomaneio.length} NFs · <span className="text-emerald-400">{c.resultado.comCTE.length} ok</span> · <span className="text-red-400">{c.resultado.semCTE.length} pend</span></p>
          </div>
          <span className="text-slate-500">›</span>
        </div>)}
      </div>
    </Card>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// TAB AUDITORIA
// ═══════════════════════════════════════════════════════════════
function TabAuditoria({ clientes, emissores, analiticoUnid, setAnaliticoUnid, comissaoUnid, setComissaoUnid, notify }) {
  const [alertas, setAlertas] = useState([]);
  const [filtU, setFiltU] = useState('');
  const [filtC, setFiltC] = useState('');
  const [filtT, setFiltT] = useState('');
  const [thFrete, setThFrete] = useState(60);
  const [thPV, setThPV] = useState(10);

  async function handleUpAn(e,u) {
    const f=e.target.files[0]; if(!f) return;
    try { const d=await readAnalitico(f); const up={...analiticoUnid,[u]:{...d,updatedAt:new Date().toISOString()}}; setAnaliticoUnid(up); await sSet(SK.AN,up); notify(`Analítico ${UL[u]}: ${d.rows.length} reg`,'success'); }
    catch(err) { notify('Erro: '+err.message,'error'); }
  }
  async function handleUpCom(e,u) {
    const f=e.target.files[0]; if(!f) return;
    try { const d=await readComissao(f); const up={...comissaoUnid,[u]:{...d,updatedAt:new Date().toISOString()}}; setComissaoUnid(up); await sSet(SK.COM,up); notify(`Comissão ${UL[u]}: ${d.rows.length} reg`,'success'); }
    catch(err) { notify('Erro: '+err.message,'error'); }
  }

  function auditar() {
    if (!clientes.length) return notify('Cadastre clientes primeiro','warning');
    const all=[];
    function addAlerta(obj) { all.push(obj); }

    // ── ANALÍTICO ──────────────────────────────────────────────
    UNIDS.forEach(u => {
      const an=analiticoUnid[u]; if(!an) return;
      an.rows.forEach(row => {
        const cte=String(row[AN.CTE]||'').trim(); if(!cte) return;
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

        // 1. Conta tipo F
        if (conta.toUpperCase().startsWith('F'))
          addAlerta({...ctx,tipo:'CONTA TIPO F',cliente:cli?.nome||cnpj,detalhe:`Conta ${conta} — tipo F requer atenção`,sev:'error'});

        // 2. CC não cadastrada
        if (cli&&(cli.contasCorrente||[]).length>0&&conta&&!(cli.contasCorrente||[]).includes(conta))
          addAlerta({...ctx,tipo:'CC NÃO CADASTRADA',cliente:cli.nome,detalhe:`CC "${conta}" não cadastrada. Cadastradas: ${cli.contasCorrente.join(', ')}`,sev:'error'});

        // 3. CNPJ não cadastrado
        if (cli&&(cli.cnpjs||[]).length>0&&cnpj&&!(cli.cnpjs||[]).some(x=>x===cnpj))
          addAlerta({...ctx,tipo:'CNPJ NÃO CADASTRADO',cliente:cli.nome,detalhe:`CNPJ ${cnpj} não cadastrado para ${cli.nome}`,sev:'warning'});

        // 4. Frete alto
        if (frete>thFrete)
          addAlerta({...ctx,tipo:'FRETE ALTO',cliente:cli?.nome||remetente,detalhe:`Frete ${fmtMoeda(frete)} — limite ${fmtMoeda(thFrete)}`,sev:'warning'});

        // 5. Peso/Volume alto
        const pv=peso/vol;
        if (pv>thPV)
          addAlerta({...ctx,tipo:'PESO/VOL ALTO',cliente:cli?.nome||remetente,detalhe:`${peso.toFixed(1)}kg/${vol}vol = ${pv.toFixed(1)}kg/vol — limite ${thPV}`,sev:'warning'});
      });
    });

    // ── COMISSÃO ───────────────────────────────────────────────
    UNIDS.forEach(u => {
      const co=comissaoUnid[u]; if(!co) return;
      co.rows.forEach(row => {
        const cte=String(row[COM.CTE]||'').trim(); if(!cte) return;
        const modal=String(row[COM.MODAL]||'').trim();
        const cnpj=String(row[COM.CNPJ]||'').replace(/\D/g,'');
        const coleta=parseF(row[COM.COLETA]);
        const embal=parseF(row[COM.EMBALAGEM]);
        const tipoFrete=String(row[COM.TIPO_FRETE]||'').trim();
        const ctx={unidade:u,cte,operador:'—',emNome:'—'};
        const cli=clientes.find(c=>(c.cnpjs||[]).some(x=>x===cnpj));

        // 6. Modalidade inválida
        if (cli&&(cli.modalidades||[]).length>0&&modal&&!(cli.modalidades||[]).includes(modal))
          addAlerta({...ctx,tipo:'MODALIDADE INVÁLIDA',cliente:cli.nome,detalhe:`${modal} não permitida. Permitidas: ${cli.modalidades.join(', ')}`,sev:'error'});

        // 7. Embalagem não cobrada
        if (cli&&parseF(cli.taxaEmbalagem)>0&&embal===0)
          addAlerta({...ctx,tipo:'EMBALAGEM NÃO COBRADA',cliente:cli.nome,detalhe:`Taxa R$${cli.taxaEmbalagem} cadastrada mas EMBALAGEM=0 na comissão`,sev:'error'});

        // 8. Coleta não cobrada
        if (cli&&parseF(cli.taxaColeta)>0&&coleta===0)
          addAlerta({...ctx,tipo:'COLETA NÃO COBRADA',cliente:cli.nome,detalhe:`Taxa R$${cli.taxaColeta} cadastrada mas COLETA=0 na comissão`,sev:'error'});

        // 9. Tipo frete F na comissão
        if (tipoFrete==='F'||tipoFrete.toUpperCase().startsWith('F'))
          addAlerta({...ctx,tipo:'TIPO FRETE F',cliente:cli?.nome||cnpj,detalhe:`Tipo de frete "${tipoFrete}" na comissão`,sev:'error'});
      });
    });

    setAlertas(all);
    all.length===0 ? notify('✅ Nenhuma divergência!','success') : notify(`⚠️ ${all.length} alerta(s)`,'warning');
  }

  const tipos=[...new Set(alertas.map(a=>a.tipo))];
  const cliAl=[...new Set(alertas.map(a=>a.cliente))];
  const filt=alertas.filter(a=>(!filtU||a.unidade===filtU)&&(!filtC||a.cliente===filtC)&&(!filtT||a.tipo===filtT));
  const erros=alertas.filter(a=>a.sev==='error').length;

  return <div className="space-y-5">
    <Card>
      <CH title="Parâmetros de Alerta" />
      <div className="p-5 grid grid-cols-2 gap-4">
        <div><label className="block text-xs text-slate-400 mb-1">Limite frete alto (R$)</label>
          <input type="number" value={thFrete} onChange={e=>setThFrete(Number(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500" /></div>
        <div><label className="block text-xs text-slate-400 mb-1">Limite peso/volume (kg)</label>
          <input type="number" value={thPV} onChange={e=>setThPV(Number(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500" /></div>
      </div>
    </Card>
    <Card>
      <CH title="Arquivos por Unidade" sub="Analítico (col-based) + Comissão (header linha 3)" />
      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        {UNIDS.map(u=><div key={u} className="border border-slate-600 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-white">{UL[u]}</p>
          <label className="flex items-center gap-2 text-xs text-slate-400 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-3 py-2 cursor-pointer">
            📊 Analítico<input type="file" accept=".xlsx,.xls" className="hidden" onChange={e=>handleUpAn(e,u)} />
          </label>
          {analiticoUnid[u]&&<p className="text-xs text-emerald-400">✅ {analiticoUnid[u].rows.length} reg</p>}
          <label className="flex items-center gap-2 text-xs text-slate-400 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-3 py-2 cursor-pointer">
            💰 Comissão<input type="file" accept=".xlsx,.xls" className="hidden" onChange={e=>handleUpCom(e,u)} />
          </label>
          {comissaoUnid[u]&&<p className="text-xs text-emerald-400">✅ {comissaoUnid[u].rows.length} reg</p>}
        </div>)}
      </div>
      <div className="px-5 pb-5"><Btn variant="warning" className="w-full" onClick={auditar}>🔍 Auditar Tudo Agora</Btn></div>
    </Card>
    {alertas.length>0&&<>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total" value={alertas.length} color="yellow" />
        <Stat label="Críticos" value={erros} color="red" />
        <Stat label="Avisos" value={alertas.length-erros} color="yellow" />
      </div>
      <Card>
        <CH title={`Alertas (${filt.length})`} actions={<div className="flex gap-2 flex-wrap">
          <select className="bg-slate-700 border border-slate-600 text-xs text-slate-300 rounded px-2 py-1" value={filtU} onChange={e=>setFiltU(e.target.value)}>
            <option value="">Todas unid</option>{UNIDS.map(u=><option key={u} value={u}>{UL[u]}</option>)}
          </select>
          <select className="bg-slate-700 border border-slate-600 text-xs text-slate-300 rounded px-2 py-1" value={filtC} onChange={e=>setFiltC(e.target.value)}>
            <option value="">Todos clientes</option>{cliAl.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <select className="bg-slate-700 border border-slate-600 text-xs text-slate-300 rounded px-2 py-1" value={filtT} onChange={e=>setFiltT(e.target.value)}>
            <option value="">Todos tipos</option>{tipos.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>} />
        <div className="p-3 space-y-2 max-h-[480px] overflow-y-auto">
          {filt.length===0&&<p className="text-xs text-slate-500 text-center py-4">Nenhum alerta com esses filtros</p>}
          {filt.map((a,i)=><div key={i} className={`rounded-lg px-3 py-2.5 border-l-4 ${a.sev==='error'?'bg-red-900/30 border-red-500':'bg-amber-900/30 border-amber-500'}`}>
            <div className="flex items-start gap-2">
              <Badge color={a.sev==='error'?'red':'yellow'}>{a.tipo}</Badge>
              <div className="flex-1">
                <span className="text-sm font-medium text-white">{a.cliente}</span>
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
function TabDashboard({ emissores, analiticoUnid, conferencias }) {
  const [periodo, setPeriodo] = useState('30d');
  const [thFD, setThFD] = useState(60);
  const [thPD, setThPD] = useState(10);
  const eName = id => emissores.find(e=>e.id===id)?.nome||id||'—';

  const dados = useMemo(() => {
    const rows=[];
    UNIDS.forEach(u=>{ const an=analiticoUnid[u]; if(!an) return;
      an.rows.forEach(row=>{ const cte=String(row[AN.CTE]||'').trim(); if(!cte) return;
        rows.push({ cte, data:fmtData(row[AN.DATA]), remetente:String(row[AN.REMETENTE]||'').trim(), operador:String(row[AN.OPERADOR]||'').trim(), frete:parseF(row[AN.FRETE]), peso:parseF(row[AN.PESO]), vol:Math.max(1,parseI(row[AN.VOL])), unidade:u });
      });
    });

    // Filtrar por período
    const hoje=new Date();
    const cutoff=new Date(hoje);
    if (periodo==='7d') cutoff.setDate(hoje.getDate()-7);
    else if (periodo==='30d') cutoff.setDate(hoje.getDate()-30);
    else if (periodo==='90d') cutoff.setDate(hoje.getDate()-90);
    const rowsF = periodo==='all' ? rows : rows.filter(r=>{
      if (!r.data) return false;
      const pts=r.data.split('/'); if(pts.length<3) return true;
      return new Date(pts[2],pts[1]-1,pts[0])>=cutoff;
    });

    // Volumetria por dia
    const byDay={};
    rowsF.forEach(r=>{ if(!r.data) return; if(!byDay[r.data]) byDay[r.data]={data:r.data,ctes:0,vol:0,frete:0}; byDay[r.data].ctes++; byDay[r.data].vol+=r.vol; byDay[r.data].frete+=r.frete; });
    const dias=Object.values(byDay).sort((a,b)=>a.data.localeCompare(b.data));

    // Semanas
    const byWeek={};
    rows.forEach(r=>{ if(!r.data) return;
      const pts=r.data.split('/'); if(pts.length<3) return;
      const d=new Date(pts[2],pts[1]-1,pts[0]);
      const wk=`${d.getFullYear()}-W${String(Math.ceil(((d-new Date(d.getFullYear(),0,1))/86400000+1)/7)).padStart(2,'0')}`;
      if(!byWeek[wk]) byWeek[wk]={week:wk,ctes:0,vol:0}; byWeek[wk].ctes++; byWeek[wk].vol+=r.vol;
    });
    const semanas=Object.values(byWeek).sort((a,b)=>a.week.localeCompare(b.week)).slice(-12);

    // Por emissor
    const byOp={};
    rowsF.forEach(r=>{ const k=r.operador||'?'; if(!byOp[k]) byOp[k]={id:k,nome:eName(k),ctes:0,vol:0,frete:0}; byOp[k].ctes++; byOp[k].vol+=r.vol; byOp[k].frete+=r.frete; });
    const topOp=Object.values(byOp).sort((a,b)=>b.ctes-a.ctes).slice(0,10);

    // Por cliente
    const byCli={};
    rowsF.forEach(r=>{ const k=r.remetente||'?'; if(!byCli[k]) byCli[k]={nome:k,ctes:0,vol:0,frete:0,peso:0}; byCli[k].ctes++; byCli[k].vol+=r.vol; byCli[k].frete+=r.frete; byCli[k].peso+=r.peso; });
    const topCli=Object.values(byCli).sort((a,b)=>b.ctes-a.ctes).slice(0,15);

    // Pesos / fretes altos
    const pesosA=rowsF.filter(r=>r.peso/r.vol>thPD).sort((a,b)=>(b.peso/b.vol)-(a.peso/a.vol)).slice(0,50);
    const fretesA=rowsF.filter(r=>r.frete>thFD).sort((a,b)=>b.frete-a.frete).slice(0,50);

    // Conferências por dia
    const confD={};
    conferencias.forEach(c=>{ if(!confD[c.data]) confD[c.data]={data:c.data,total:0,semCTE:0}; confD[c.data].total+=c.nfsRomaneio.length; confD[c.data].semCTE+=c.resultado.semCTE.length; });
    const confDias=Object.values(confD).sort((a,b)=>a.data.localeCompare(b.data)).slice(-14);

    const totalCTEs=rowsF.length, totalVol=rowsF.reduce((s,r)=>s+r.vol,0), totalFrete=rowsF.reduce((s,r)=>s+r.frete,0);
    const allDias=Object.values(byDay).sort((a,b)=>a.data.localeCompare(b.data));
    const ctesH=allDias[allDias.length-1]?.ctes||0, ctesO=allDias[allDias.length-2]?.ctes||0;
    const varDia=ctesO>0?((ctesH-ctesO)/ctesO*100).toFixed(1):0;
    return {dias,semanas,topOp,topCli,pesosA,fretesA,confDias,totalCTEs,totalVol,totalFrete,ctesH,ctesO,varDia};
  },[analiticoUnid,periodo,thFD,thPD,emissores,conferencias]);

  if (!UNIDS.some(u=>analiticoUnid[u])) return <Card><div className="p-12 text-center"><p className="text-4xl mb-3">📊</p><p className="text-slate-400 text-sm">Carregue analíticos na aba Auditoria para ver o dashboard</p></div></Card>;

  const maxOp=dados.topOp[0]?.ctes||1;
  const TOOLTIP_STYLE={contentStyle:{background:'#1e293b',border:'1px solid #475569',borderRadius:'8px',color:'#fff'},itemStyle:{color:'#cbd5e1'}};

  return <div className="space-y-5">
    {/* KPIs */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat label="CTEs" value={dados.totalCTEs.toLocaleString('pt-BR')} color="blue" />
      <Stat label="Volumes" value={dados.totalVol.toLocaleString('pt-BR')} color="white" />
      <Stat label="Faturamento" value={`R$${(dados.totalFrete/1000).toFixed(1)}k`} color="green" />
      <Stat label="Var. dia" value={`${dados.varDia>0?'+':''}${dados.varDia}%`} color={dados.varDia>=0?'green':'red'} sub={`${dados.ctesH} hoje vs ${dados.ctesO} ontem`} />
    </div>

    {/* Período */}
    <div className="flex gap-2">
      {[['7d','7 dias'],['30d','30 dias'],['90d','90 dias'],['all','Tudo']].map(([v,l])=>(
        <button key={v} onClick={()=>setPeriodo(v)} className={`px-3 py-1.5 text-xs rounded-full border transition-all ${periodo===v?'bg-blue-600 border-blue-600 text-white':'bg-slate-800 border-slate-600 text-slate-400 hover:border-blue-500'}`}>{l}</button>
      ))}
    </div>

    {/* Curva diária */}
    {dados.dias.length>0&&<Card>
      <CH title="Volumetria Diária" />
      <div className="p-5">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={dados.dias}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="data" tick={{fill:'#94a3b8',fontSize:10}} interval="preserveStartEnd" />
            <YAxis tick={{fill:'#94a3b8',fontSize:10}} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend wrapperStyle={{color:'#94a3b8',fontSize:12}} />
            <Line type="monotone" dataKey="ctes" stroke="#3b82f6" strokeWidth={2} dot={false} name="CTEs" />
            <Line type="monotone" dataKey="vol" stroke="#10b981" strokeWidth={2} dot={false} name="Volumes" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>}

    {/* Variação semanal */}
    {dados.semanas.length>1&&<Card>
      <CH title="Variação Semanal" />
      <div className="p-5">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dados.semanas}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="week" tick={{fill:'#94a3b8',fontSize:9}} />
            <YAxis tick={{fill:'#94a3b8',fontSize:10}} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Bar dataKey="ctes" fill="#8b5cf6" name="CTEs" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>}

    {/* Conferências */}
    {dados.confDias.length>0&&<Card>
      <CH title="NFs sem emissão por dia (Conferências)" />
      <div className="p-5">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={dados.confDias}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="data" tick={{fill:'#94a3b8',fontSize:10}} />
            <YAxis tick={{fill:'#94a3b8',fontSize:10}} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Bar dataKey="semCTE" fill="#ef4444" name="Sem emissão" radius={[3,3,0,0]} />
            <Bar dataKey="total" fill="#334155" name="Total NFs" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>}

    {/* Rank Emissores */}
    <Card>
      <CH title="Ranking Emissores" />
      <div className="p-5 space-y-3">
        {dados.topOp.length===0&&<p className="text-xs text-slate-500">ID operador (col AJ) não detectado</p>}
        {dados.topOp.map((e,i)=><div key={i} className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-4 text-right">{i+1}</span>
          <span className="text-sm text-slate-300 w-28 truncate">{e.nome}</span>
          <div className="flex-1 bg-slate-700 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full" style={{width:`${(e.ctes/maxOp)*100}%`}} />
          </div>
          <span className="text-xs text-slate-400 w-36 text-right">{e.ctes} CTEs · {e.vol} vol</span>
        </div>)}
      </div>
    </Card>

    {/* Rank Clientes */}
    <Card>
      <CH title="Ranking Clientes" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-700">
            {['#','Cliente','CTEs','Vol','Frete','Peso'].map(h=><th key={h} className={`py-3 px-4 text-xs text-slate-500 font-medium ${['#','Cliente'].includes(h)?'text-left':'text-right'}`}>{h}</th>)}
          </tr></thead>
          <tbody>
            {dados.topCli.map((c,i)=><tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
              <td className="py-2 px-4 text-slate-500 text-xs">{i+1}</td>
              <td className="py-2 px-4 font-medium text-white text-xs">{c.nome}</td>
              <td className="py-2 px-4 text-right text-slate-300 text-xs">{c.ctes}</td>
              <td className="py-2 px-4 text-right text-slate-300 text-xs">{c.vol}</td>
              <td className="py-2 px-4 text-right text-slate-300 text-xs">{c.frete>0?fmtMoeda(c.frete):'—'}</td>
              <td className="py-2 px-4 text-right text-slate-300 text-xs">{c.peso>0?c.peso.toFixed(1)+'kg':'—'}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </Card>

    {/* Pesos altos */}
    <Card>
      <CH title={`Pesos/Vol Altos (${dados.pesosA.length})`} actions={<div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">Limite kg/vol:</span>
        <input type="number" value={thPD} onChange={e=>setThPD(Number(e.target.value))} className="w-14 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
      </div>} />
      {dados.pesosA.length===0?<div className="p-4"><p className="text-xs text-slate-500">Nenhum acima de {thPD}kg/vol</p></div>:
      <div className="overflow-x-auto max-h-52 overflow-y-auto">
        <table className="w-full text-xs"><thead className="sticky top-0 bg-slate-800"><tr className="border-b border-slate-700">
          {['CTE','Remetente','Peso','Vol','kg/vol'].map(h=><th key={h} className={`py-2 px-3 text-slate-500 font-medium ${['Peso','Vol','kg/vol'].includes(h)?'text-right':'text-left'}`}>{h}</th>)}
        </tr></thead><tbody>
          {dados.pesosA.map((r,i)=><tr key={i} className="border-b border-slate-700/30 hover:bg-amber-900/10">
            <td className="py-1.5 px-3 text-slate-300">{r.cte}</td>
            <td className="py-1.5 px-3 text-white">{r.remetente}</td>
            <td className="py-1.5 px-3 text-right text-slate-300">{r.peso.toFixed(1)}</td>
            <td className="py-1.5 px-3 text-right text-slate-300">{r.vol}</td>
            <td className="py-1.5 px-3 text-right font-semibold text-amber-400">{(r.peso/r.vol).toFixed(1)}</td>
          </tr>)}
        </tbody></table>
      </div>}
    </Card>

    {/* Fretes altos */}
    <Card>
      <CH title={`Fretes Altos (${dados.fretesA.length})`} actions={<div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">Limite R$:</span>
        <input type="number" value={thFD} onChange={e=>setThFD(Number(e.target.value))} className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
      </div>} />
      {dados.fretesA.length===0?<div className="p-4"><p className="text-xs text-slate-500">Nenhum acima de R${thFD}</p></div>:
      <div className="overflow-x-auto max-h-52 overflow-y-auto">
        <table className="w-full text-xs"><thead className="sticky top-0 bg-slate-800"><tr className="border-b border-slate-700">
          {['CTE','Remetente','Frete','Peso'].map(h=><th key={h} className={`py-2 px-3 text-slate-500 font-medium ${['Frete','Peso'].includes(h)?'text-right':'text-left'}`}>{h}</th>)}
        </tr></thead><tbody>
          {dados.fretesA.map((r,i)=><tr key={i} className="border-b border-slate-700/30 hover:bg-red-900/10">
            <td className="py-1.5 px-3 text-slate-300">{r.cte}</td>
            <td className="py-1.5 px-3 text-white">{r.remetente}</td>
            <td className="py-1.5 px-3 text-right font-semibold text-red-400">{fmtMoeda(r.frete)}</td>
            <td className="py-1.5 px-3 text-right text-slate-300">{r.peso.toFixed(1)}kg</td>
          </tr>)}
        </tbody></table>
      </div>}
    </Card>
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState('conferencia');
  const [clientes, setClientes] = useState([]);
  const [emissores, setEmissores] = useState([]);
  const [conferencias, setConferencias] = useState([]);
  const [analiticoUnid, setAnaliticoUnid] = useState({});
  const [comissaoUnid, setComissaoUnid] = useState({});
  const [toast, setToast] = useState(null);

  useEffect(()=>{
    (async()=>{
      const [c,e,conf,an,co]=await Promise.all([sGet(SK.C),sGet(SK.E),sGet(SK.CONF),sGet(SK.AN),sGet(SK.COM)]);
      if(c) setClientes(c); if(e) setEmissores(e); if(conf) setConferencias(conf);
      if(an) setAnaliticoUnid(an); if(co) setComissaoUnid(co);
    })();
  },[]);

  const notify=(msg,type='info')=>{ setToast({msg,type}); setTimeout(()=>setToast(null),5000); };

  const TABS=[{id:'conferencia',label:'Conferência',icon:'📋'},{id:'auditoria',label:'Auditoria',icon:'🔍'},{id:'dashboard',label:'Dashboard',icon:'📊'},{id:'cadastro',label:'Cadastro',icon:'⚙️'}];

  return <div className="min-h-screen bg-slate-900" style={{fontFamily:"system-ui,sans-serif"}}>
    <Toast msg={toast?.msg} type={toast?.type} onClose={()=>setToast(null)} />
    <header className="bg-slate-950 border-b border-slate-800 px-4 py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">AL</div>
          <div><p className="text-white font-bold text-sm">ALL LOGÍSTICA</p><p className="text-slate-500 text-xs">Controle Operacional</p></div>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{clientes.length} clientes</span><span>·</span><span>{emissores.length} emissores</span><span>·</span><span>{conferencias.length} conf.</span>
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
      {tab==='conferencia'&&<TabConferencia clientes={clientes} conferencias={conferencias} setConferencias={setConferencias} notify={notify} />}
      {tab==='auditoria'&&<TabAuditoria clientes={clientes} emissores={emissores} analiticoUnid={analiticoUnid} setAnaliticoUnid={setAnaliticoUnid} comissaoUnid={comissaoUnid} setComissaoUnid={setComissaoUnid} notify={notify} />}
      {tab==='dashboard'&&<TabDashboard emissores={emissores} analiticoUnid={analiticoUnid} conferencias={conferencias} />}
      {tab==='cadastro'&&<TabCadastro clientes={clientes} setClientes={setClientes} emissores={emissores} setEmissores={setEmissores} notify={notify} />}
    </main>
  </div>;
}
