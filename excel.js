/* JetFor · v76 — Mapas em Excel: baixar (premium) e importar em massa (com prévia e detecção de duplicados).
   Usa ExcelJS (carregado do CDN só quando o usuário clica). Depende de app.js (STATE, cur, compute, BASE_LABEL,
   CAT_LABEL, DA_KEYS, daRowNormalize, saveAll, logAction, toast, esc, num, normName, buildMapaSubtabs, renderAll). */
(function(){
'use strict';
const XL_CDN='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
let _xlP=null;
function loadXL(){
  if(window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if(_xlP) return _xlP;
  _xlP=new Promise((ok,ko)=>{ const s=document.createElement('script'); s.src=XL_CDN; s.async=true;
    s.onload=()=>window.ExcelJS?ok(window.ExcelJS):ko(new Error('ExcelJS não carregou'));
    s.onerror=()=>{ _xlP=null; ko(new Error('Sem conexão para carregar o Excel')); }; document.head.appendChild(s); });
  return _xlP;
}

// ---------- estilo da marca ----------
const NAVY='FF14284B', NAVY2='FF22406E', GOLD='FFC79A3B', GREY='FF5A5A5A', FONT='Calibri';
const ST={ od:{t:'VENCIDO',bg:'FFFDE2E1',fg:'FFB42318',pill:'FFD92D20'}, wn:{t:'PRÓXIMO',bg:'FFFEF0C7',fg:'FF93370D',pill:'FFF79009'}, ok:{t:'EM DIA',bg:'FFFFFFFF',fg:'FF067647',pill:'FF12B76A'} };
const UNIT_TXT={h:'h',pou:'pousos',cic:'ciclos'};
const fill=c=>({type:'pattern',pattern:'solid',fgColor:{argb:c}});
const thin=c=>({style:'thin',color:{argb:c||'FFD0D5DD'}});
const box=c=>({top:thin(c),left:thin(c),bottom:thin(c),right:thin(c)});
const pad=n=>String(n).padStart(2,'0');
function agoraBR(){ const d=new Date(); return pad(d.getDate())+'/'+pad(d.getMonth()+1)+'/'+d.getFullYear()+' '+pad(d.getHours())+':'+pad(d.getMinutes()); }
function stamp(){ const d=new Date(); return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'_'+pad(d.getHours())+pad(d.getMinutes()); }
function quem(){ const u=window.CURRENT_USER; return (u&&(u.nome||u.email))||'JetFor'; }
function isoToDate(iso){ return iso? new Date(iso+'T12:00:00') : null; }
function d12(d){ return d? new Date(d.getFullYear(),d.getMonth(),d.getDate(),12) : null; }

function banner(wb, ws, titulo, sub, ncols, linha3){
  const logo=(window.JETFOR_SEED&&window.JETFOR_SEED.logo)||'';
  const mg=(a,b,c,d)=>{ if(a===c&&b===d) return; try{ ws.mergeCells(a,b,c,d); }catch(e){ console.warn('merge',a,b,c,d,e.message); } };
  mg(1,1,3,2); mg(1,3,1,ncols); mg(2,3,2,ncols); mg(3,3,3,ncols);
  for(let r=1;r<=3;r++) for(let c=1;c<=ncols;c++) ws.getCell(r,c).fill=fill(NAVY);
  ws.getRow(1).height=26; ws.getRow(2).height=20; ws.getRow(3).height=16;
  if(logo){ try{ const id=wb.addImage({base64:logo,extension:'png'}); ws.addImage(id,{tl:{col:0.15,row:0.2},ext:{width:120,height:48}}); }catch(e){} }
  const t=ws.getCell(1,3); t.value=titulo; t.font={name:FONT,size:18,bold:true,color:{argb:'FFFFFFFF'}}; t.alignment={vertical:'middle'};
  const s=ws.getCell(2,3); s.value=sub; s.font={name:FONT,size:12,bold:true,color:{argb:GOLD}}; s.alignment={vertical:'middle'};
  const e=ws.getCell(3,3); e.value=linha3; e.font={name:FONT,size:9,color:{argb:'FFC9D2E3'}};
  mg(4,1,4,ncols); ws.getCell(4,1).fill=fill(GOLD); ws.getRow(4).height=4;
}
function headerRow(ws, r, cols){
  const row=ws.getRow(r); row.height=30;
  cols.forEach((c,i)=>{ const cell=row.getCell(i+1); cell.value=c.h; cell.fill=fill(c.req?GOLD:NAVY2);
    cell.font={name:FONT,bold:true,size:10,color:{argb:'FFFFFFFF'}};
    cell.alignment={vertical:'middle',horizontal:c.num?'center':'left',wrapText:true}; cell.border=box(NAVY);
    if(c.note) cell.note=c.note; });
}
function printSetup(ws, ac, titulo, repeat, fitH){
  ws.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:fitH||0,
    margins:{left:0.3,right:0.3,top:0.5,bottom:0.5,header:0.2,footer:0.2}, printTitlesRow:repeat};
  ws.headerFooter={oddFooter:'&L&8JetFor · '+titulo+' · '+ac+'&C&8Documento controlado — confira sempre a versão no sistema&R&8Página &P de &N'};
}
async function baixar(wb, nome){
  const buf=await wb.xlsx.writeBuffer();
  const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=nome; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1500);
}

// ---------- colunas do Mapa (iguais na exportação e na importação) ----------
const MAPA_COLS=[
  {k:'n',h:'#',w:5,num:1},{k:'grupo',h:'Grupo',w:24},{k:'categoria',h:'Categoria',w:10},{k:'unidade',h:'Unidade',w:9},
  {k:'nome',h:'Nomenclatura',w:38},{k:'pn',h:'P/N',w:14},{k:'sn',h:'S/N',w:12},{k:'base',h:'Contador base',w:15},
  {k:'intervalo',h:'Intervalo',w:10,num:1},{k:'exec',h:'Últ. exec.',w:11,num:1},{k:'vfix',h:'Vence fixo (LLP)',w:11,num:1},
  {k:'venc',h:'Vence (VENC)',w:12,num:1},{k:'disp',h:'Restante (DISP)',w:12,num:1},{k:'unid',h:'Unid.',w:7},
  {k:'calm',h:'Cal. meses',w:7,num:1},{k:'cald',h:'Cal. últ. exec.',w:12,num:1},{k:'calv',h:'Cal. vence',w:12,num:1},{k:'cali',h:'Cal. restante (dias)',w:11,num:1},
  {k:'obs',h:'Observações',w:30},{k:'status',h:'Status',w:11},{k:'id',h:'ID (não alterar)',w:13}];

function unidadeTxt(t){
  if(t.categoria==='motor'||t.categoria==='helice'){
    const m=/^(motor|helice)(\d)/.exec(t.base||''); const n=m?m[2]:(t.unidade||'');
    return n? (t.categoria==='motor'?'Motor ':'Hélice ')+n : '';
  }
  return '';
}
function baseTxt(t){ if(!t.base) return t.tipoVenc==='oc'?'OC':'N/A'; return BASE_LABEL[t.base]||t.base; }

// =================== EXPORTAR ===================
function sheetMapa(wb, ac, m, sub, emit, itens, titulo, aba){
  const W=wb.addWorksheet(aba,{views:[{state:'frozen',ySplit:6,xSplit:5,showGridLines:false}],properties:{tabColor:{argb:NAVY}}});
  W.columns=MAPA_COLS.map(c=>({width:c.w}));
  banner(wb,W,titulo,sub,MAPA_COLS.length,emit); W.getRow(5).height=6; headerRow(W,6,MAPA_COLS);
  let lastG=null, band=false, n=0;
  const k={od:0,wn:0,ok:0};
  itens.forEach(({t,c})=>{
    n++; k[c.status]++; if(t.grupo!==lastG){ band=!band; lastG=t.grupo; }
    const u=c.num?UNIT_TXT[c.num.unit]:'';
    const vals={n, grupo:t.grupo||'', categoria:CAT_LABEL[t.categoria]||t.categoria||'', unidade:unidadeTxt(t), nome:t.nome||'', pn:t.pn||'', sn:t.sn||'',
      base:baseTxt(t), intervalo:t.intervalo!=null?num(t.intervalo):null, exec:t.exec!=null?num(t.exec):null, vfix:t.vencFixo!=null?num(t.vencFixo):null,
      venc:c.num?c.num.venc:null, disp:c.num?c.num.disp:null, unid:u,
      calm:t.cal&&t.cal.meses!=null?num(t.cal.meses):null, cald:t.cal&&t.cal.exec?isoToDate(t.cal.exec):null,
      calv:c.cal?d12(c.cal.venc):null, cali:c.cal?c.cal.disp:null, obs:t.obs||'', status:ST[c.status].t, id:t.id||''};
    const row=W.addRow(MAPA_COLS.map(col=>vals[col.k]));
    row.height=18;
    row.eachCell({includeEmpty:true},(cell,ci)=>{
      cell.font={name:FONT,size:9,color:{argb:'FF101828'}}; cell.border={bottom:thin('FFE4E7EC'),right:thin('FFF2F4F7')};
      cell.alignment={vertical:'middle',horizontal:MAPA_COLS[ci-1].num?'right':'left'};
      cell.fill=fill(c.status!=='ok'?ST[c.status].bg:(band?'FFF8F9FC':'FFFFFFFF'));
    });
    const col=key=>MAPA_COLS.findIndex(x=>x.k===key)+1;
    ['intervalo','exec','vfix','venc','disp'].forEach(key=>row.getCell(col(key)).numFmt='#,##0.0;[Red]-#,##0.0');
    ['cald','calv'].forEach(key=>row.getCell(col(key)).numFmt='dd/mm/yyyy');
    row.getCell(col('cali')).numFmt='0;[Red]-0';
    if(c.num&&c.num.disp<0) row.getCell(col('disp')).font={name:FONT,size:9,bold:true,color:{argb:ST.od.fg}};
    if(c.cal&&c.cal.disp<0) row.getCell(col('cali')).font={name:FONT,size:9,bold:true,color:{argb:ST.od.fg}};
    const s=row.getCell(col('status')); s.fill=fill(ST[c.status].pill); s.font={name:FONT,size:9,bold:true,color:{argb:'FFFFFFFF'}}; s.alignment={horizontal:'center',vertical:'middle'};
    row.getCell(col('id')).font={name:FONT,size:8,color:{argb:'FF98A2B3'}};
    row.getCell(col('nome')).font={name:FONT,size:9,bold:true,color:{argb:NAVY}};
  });
  if(itens.length) W.autoFilter={from:{row:6,column:1},to:{row:6+itens.length,column:MAPA_COLS.length}};
  W.addRow([]);
  const tr=W.addRow(['',`Total: ${itens.length} itens  ·  ${k.od} vencidos  ·  ${k.wn} próximos  ·  ${k.ok} em dia`]);
  W.mergeCells(tr.number,2,tr.number,10); tr.getCell(2).font={name:FONT,bold:true,size:10,color:{argb:NAVY}};
  printSetup(W,ac,titulo,'6:6');
  return k;
}

function sheetResumo(wb, ac, m, sub, emit, main){
  const R=wb.addWorksheet('Resumo',{views:[{showGridLines:false}],properties:{tabColor:{argb:GOLD}}});
  R.columns=[{width:13},{width:26},{width:34},{width:16},{width:16},{width:18},{width:16}];
  banner(wb,R,'MAPA DE MANUTENÇÃO — RESUMO',sub,7,emit);
  const k={od:0,wn:0,ok:0}; main.forEach(x=>k[x.c.status]++);
  [['Total de itens',main.length,NAVY],['Vencidos',k.od,ST.od.pill],['Próximos',k.wn,ST.wn.pill],['Em dia',k.ok,ST.ok.pill]].forEach((x,i)=>{
    const l=R.getCell(6,4+i), v=R.getCell(7,4+i); l.value=x[0]; v.value=x[1];
    [l,v].forEach(z=>{ z.fill=fill(x[2]); z.alignment={horizontal:'center',vertical:'middle'}; });
    l.font={name:FONT,size:9,bold:true,color:{argb:'FFFFFFFF'}}; v.font={name:FONT,size:22,bold:true,color:{argb:'FFFFFFFF'}};
  });
  R.getRow(7).height=36;
  R.getCell(6,1).value='SITUAÇÃO DA AERONAVE'; R.getCell(6,1).font={name:FONT,bold:true,color:{argb:NAVY},size:11};
  R.getCell(7,1).value=k.od?'ATENÇÃO: há itens vencidos':(k.wn?'Itens próximos do vencimento':'Todos os itens em dia');
  R.getCell(7,1).font={name:FONT,bold:true,size:11,color:{argb:k.od?ST.od.fg:k.wn?ST.wn.fg:ST.ok.fg}};
  // contadores por componente
  const CT=m.contadores||{}, a=m.aeronave||{};
  let r=9;
  R.getCell(r,1).value='CONTADORES ATUAIS'; R.getCell(r,1).font={name:FONT,bold:true,color:{argb:NAVY},size:12};
  R.getCell(r,4).value='valores lançados no app na data de emissão'; R.getCell(r,4).font={name:FONT,italic:true,size:9,color:{argb:'FF667085'}};
  for(let c=1;c<=7;c++) R.getCell(r,c).border={bottom:{style:'medium',color:{argb:GOLD}}};
  const CK=[['Horas (TSN)',['horas','tsn'],'#,##0.0'],['TSO',['tso'],'#,##0.0'],['Ciclos (CSN)',['ciclos','csn'],'#,##0'],['CSO',['cso'],'#,##0'],['Pousos',['pousos'],'#,##0']];
  const comps=[];
  const add=(id,nome,ic)=>{ const vals=CK.map(ck=>{ for(const s of ck[1]){ const v=CT[id+'_'+s]; if(v!=null&&v!=='') return v; } return null; }); if(vals.some(v=>v!=null)) comps.push({nome,ic,vals}); };
  add('celula','Célula','✈');
  for(let i=1;i<=(a.nMotores!=null?a.nMotores:2);i++) add('motor'+i,'Motor '+i,'⚙');
  for(let i=1;i<=(a.nHelices!=null?a.nHelices:0);i++) add('helice'+i,'Hélice '+i,'✣');
  const usadas=CK.map((ck,j)=>j).filter(j=>comps.some(c=>c.vals[j]!=null));
  r+=2; R.getRow(r).height=22; R.mergeCells(r,1,r,2);
  const hs=[R.getCell(r,1)]; R.getCell(r,1).value='Componente';
  usadas.forEach((j,x)=>{ const c=R.getCell(r,3+x); c.value=CK[j][0]; hs.push(c); });
  hs.forEach((c,x)=>{ c.fill=fill(NAVY); c.font={name:FONT,bold:true,size:10,color:{argb:'FFFFFFFF'}}; c.alignment={vertical:'middle',horizontal:x?'center':'left',indent:x?0:1}; });
  comps.forEach((cp,i)=>{
    r++; R.getRow(r).height=24; R.mergeCells(r,1,r,2); const bg=i%2?'FFF5F7FB':'FFFFFFFF';
    const l=R.getCell(r,1); l.value=cp.ic+'  '+cp.nome; l.font={name:FONT,bold:true,size:11,color:{argb:NAVY}}; l.alignment={vertical:'middle',indent:1}; l.fill=fill(bg);
    l.border={left:{style:'thick',color:{argb:GOLD}},bottom:thin('FFE4E7EC')};
    usadas.forEach((j,x)=>{ const c=R.getCell(r,3+x), v=cp.vals[j];
      if(v==null){ c.value='—'; c.font={name:FONT,size:11,color:{argb:'FFD0D5DD'}}; }
      else if(typeof v==='string'&&v.trim().toUpperCase()==='NEW'){ c.value='NEW'; c.font={name:FONT,size:10,bold:true,color:{argb:ST.ok.fg}}; }
      else { c.value=num(v); c.numFmt=CK[j][2]; c.font={name:FONT,size:12,bold:true,color:{argb:'FF101828'}}; }
      c.alignment={horizontal:'center',vertical:'middle'}; c.fill=fill(bg); c.border={bottom:thin('FFE4E7EC')}; });
  });
  // itens críticos
  r+=2; R.getCell(r,1).value='ITENS CRÍTICOS (vencidos e próximos, do mais urgente)'; R.getCell(r,1).font={name:FONT,bold:true,color:{argb:NAVY},size:11};
  r++; ['Status','Grupo','Nomenclatura','Vence','Restante','Calendário','Obs.'].forEach((h,i)=>{ const c=R.getCell(r,1+i); c.value=h; c.fill=fill(NAVY2); c.font={name:FONT,bold:true,color:{argb:'FFFFFFFF'},size:10}; });
  const crit=main.filter(x=>x.c.status!=='ok').sort((p,q)=>p.c.status===q.c.status?0:(p.c.status==='od'?-1:1)).slice(0,30);
  if(!crit.length){ r++; R.getCell(r,1).value='Nenhum item vencido ou próximo.'; R.getCell(r,1).font={name:FONT,italic:true,size:10,color:{argb:ST.ok.fg}}; }
  crit.forEach(x=>{ r++; const u=x.c.num?UNIT_TXT[x.c.num.unit]:'';
    const vals=[ST[x.c.status].t, x.t.grupo||'', x.t.nome||'',
      x.c.num&&x.c.num.venc!=null?fmtN(x.c.num.venc,1)+' '+u:'—', x.c.num&&x.c.num.disp!=null?fmtN(x.c.num.disp,1)+' '+u:'—',
      x.c.cal&&x.c.cal.venc?fmtDate(x.c.cal.venc)+' ('+x.c.cal.disp+' d)':'—', x.t.obs||''];
    vals.forEach((v,i)=>{ const c=R.getCell(r,1+i); c.value=v; c.border=box(); c.font={name:FONT,size:9,bold:i===0,color:{argb:i===0?'FFFFFFFF':'FF101828'}};
      c.fill=fill(i===0?ST[x.c.status].pill:ST[x.c.status].bg); c.alignment={vertical:'middle',wrapText:i===2,horizontal:i===0?'center':'left'}; }); });
  printSetup(R,ac,'Mapa de Manutenção — Resumo',undefined,1);
}

function sheetDA(wb, ac, m, sub, emit){
  const DA=m.da||{}; const cols=DA.cols||[];
  if(!cols.length) return;
  Object.keys(DA.sheets||{}).forEach(key=>{
    const sh=DA.sheets[key];
    const nome=String(sh.title||key).replace(/[\\\/?*\[\]:]/g,'').replace('—','-').slice(0,31);
    if(wb.getWorksheet(nome)) return;
    const D=wb.addWorksheet(nome,{views:[{state:'frozen',ySplit:6,showGridLines:false}],properties:{tabColor:{argb:GREY}}});
    const W=[14,40,12,6,9,11,9,9,12,9,9,11,28,12,16];
    const dc=[{h:'#',w:5,num:1}].concat(cols.map((h,i)=>({h,w:W[i]||12})));
    D.columns=dc.map(c=>({width:c.w})); banner(wb,D,String(sh.title||key).toUpperCase(),sub,dc.length,emit); headerRow(D,6,dc);
    let nn=0;
    (sh.rows||[]).forEach(rw=>{
      if(!rw) return;
      if(rw.sec!==undefined){ const row=D.addRow([rw.sec]); D.mergeCells(row.number,1,row.number,dc.length); row.getCell(1).fill=fill('FFE9EEF6'); row.getCell(1).font={name:FONT,bold:true,size:10,color:{argb:NAVY}}; return; }
      nn++; const vals=rw.c?rw.c:DA_KEYS.map(k=>rw[k]!=null?rw[k]:'');
      const row=D.addRow([nn].concat(vals));
      row.eachCell({includeEmpty:true},c=>{ c.font={name:FONT,size:9}; c.border={bottom:thin('FFE4E7EC')}; c.alignment={vertical:'middle'}; });
      row.getCell(2).font={name:FONT,size:9,bold:true,color:{argb:NAVY}};
    });
    D.autoFilter={from:{row:6,column:1},to:{row:6,column:dc.length}};
    printSetup(D,ac,sh.title||key,'6:6');
  });
}

async function buildMapaWorkbook(ac){
  const ExcelJS=await loadXL();
  const m=STATE.acmaps[ac]; const a=m.aeronave||{};
  const CT=m.contadores||{}, hoje=STATE.hoje||todayISO();
  const itens=(m.tarefas||[]).filter(Boolean).map(t=>({t,c:computeWith(t,CT,hoje)}));
  const main=itens.filter(x=>x.t.categoria!=='ica'), ica=itens.filter(x=>x.t.categoria==='ica');
  const sub=`${a.matricula||ac}  ·  ${a.modelo||''}${a.sn?'  ·  S/N '+a.sn:''}${a.ano?'  ·  '+a.ano:''}`;
  const emit=`Emitido em ${agoraBR()} por ${quem()}  ·  jetfor.vercel.app`;
  const wb=new ExcelJS.Workbook(); wb.creator='JetFor'; wb.created=new Date();
  sheetResumo(wb,ac,m,sub,emit,main);
  sheetMapa(wb,ac,m,sub,emit,main,'MAPA DE MANUTENÇÃO','Mapa');
  if(ica.length) sheetMapa(wb,ac,m,sub,emit,ica,'ICA / GRANDES MODIFICAÇÕES','ICA');
  sheetDA(wb,ac,m,sub,emit);
  return wb;
}
async function exportarMapaExcel(){
  const ac=STATE.currentAC;
  try{ toast('Gerando Excel…'); const wb=await buildMapaWorkbook(ac); await baixar(wb,'Mapa_'+ac+'_'+stamp()+'.xlsx'); toast('✔ Excel baixado');
    logAction('Baixou o mapa em Excel', ac); }
  catch(e){ console.error(e); toast('⚠ '+(e.message||'Falha ao gerar o Excel')); }
}

// =================== MODELO DE IMPORTAÇÃO ===================
const BASE_LISTA=['Célula · h','Célula · pousos','Célula · ciclos','Motor · TSN','Motor · TSO','Motor · CSN','Motor · CSO','Hélice · TSN','Hélice · TSO','Calendário','N/A'];
async function baixarModelo(){
  try{
    const ExcelJS=await loadXL(); const ac=STATE.currentAC; const a=(STATE.acmaps[ac]||{}).aeronave||{};
    const wb=new ExcelJS.Workbook(); wb.creator='JetFor';
    const I=wb.addWorksheet('Como preencher',{views:[{showGridLines:false}],properties:{tabColor:{argb:GOLD}}});
    I.columns=[{width:4},{width:26},{width:92}];
    banner(wb,I,'MODELO DE IMPORTAÇÃO — MAPA DE MANUTENÇÃO','Serve para qualquer aeronave: o app importa na aeronave aberta no Mapa',3,'Preencha a aba "Tarefas" (e, se quiser, "DA e Boletins") e suba em Mapa › Importar planilha');
    const passos=[
      ['1','Uma linha = um item','Cada linha da aba "Tarefas" é um item do mapa. Motor/Hélice: escolha a unidade (Motor 1, Motor 2…) ou "Todas" para criar um item por unidade.'],
      ['2','ID','Deixe em BRANCO para item novo. Linhas que vieram do Excel baixado do app têm ID: o app atualiza aquele item.'],
      ['3','Obrigatórios','Nomenclatura e Contador base. Se o contador não for "Calendário"/"N/A", informe Intervalo e Últ. exec. (ou Vence fixo para LLP).'],
      ['4','Células vazias','Ao ATUALIZAR um item, célula vazia não apaga o valor que já está no app.'],
      ['5','Números e datas','Números com vírgula ou ponto (ex.: 4307,1). Datas dd/mm/aaaa.'],
      ['6','Duplicados','O app compara cada linha com o mapa atual e com a própria planilha: mesmo nome, nomes parecidos e linhas repetidas aparecem na prévia, e você escolhe atualizar, criar novo ou ignorar.'],
      ['7','Prévia e segurança','Nada é gravado antes de você confirmar. Antes de gravar o app baixa uma cópia do mapa como estava. Nada é apagado pela importação.']];
    let r=6; passos.forEach(p=>{ const row=I.getRow(r++); row.values=p; row.height=34;
      row.getCell(1).fill=fill(NAVY); row.getCell(1).font={name:FONT,bold:true,color:{argb:'FFFFFFFF'}}; row.getCell(1).alignment={horizontal:'center',vertical:'middle'};
      row.getCell(2).font={name:FONT,bold:true,color:{argb:NAVY}}; row.getCell(2).alignment={vertical:'middle'};
      row.getCell(3).alignment={wrapText:true,vertical:'middle'}; [2,3].forEach(c=>row.getCell(c).border={bottom:thin()}); });
    printSetup(I,'modelo','Como preencher'); I.pageSetup.orientation='portrait';

    const L=wb.addWorksheet('Listas',{state:'veryHidden'});
    ['Célula','Motor','Hélice','ICA'].forEach((v,i)=>L.getCell(i+1,1).value=v);
    ['Motor 1','Motor 2','Hélice 1','Hélice 2','Todas'].forEach((v,i)=>L.getCell(i+1,2).value=v);
    BASE_LISTA.forEach((v,i)=>L.getCell(i+1,3).value=v);
    const DA=(STATE.acmaps[ac]||{}).da||{}; const abas=Object.keys(DA.sheets||{}).map(k=>DA.sheets[k].title||k);
    (abas.length?abas:['DA — Célula (Aeronave)','DA — Motor 1','DA — Motor 2']).forEach((v,i)=>L.getCell(i+1,4).value=v);

    const cols=[
      {h:'ID (vazio = novo)',w:14,note:'Deixe vazio para item novo. Não altere IDs vindos do app.'},
      {h:'Grupo',w:26,note:'Ex.: INSPEÇÕES PROGRAMADAS, TREM DE POUSO, LLP…'},
      {h:'Categoria',w:11,note:'Célula, Motor, Hélice ou ICA. Se vazio, o app deduz pelo contador.',list:'Listas!$A$1:$A$4'},
      {h:'Unidade',w:10,note:'Só para Motor/Hélice. "Todas" cria um item por unidade.',list:'Listas!$B$1:$B$5'},
      {h:'Nomenclatura *',w:38,req:1},{h:'P/N',w:14},{h:'S/N',w:12},
      {h:'Contador base *',w:15,req:1,note:'Qual contador vence o item',list:'Listas!$C$1:$C$11'},
      {h:'Intervalo',w:10,num:1,dec:1,note:'Em h, ciclos ou pousos, conforme o contador'},
      {h:'Últ. exec.',w:11,num:1,dec:1,note:'Valor do contador na última execução'},
      {h:'Vence fixo (LLP)',w:12,num:1,dec:1,note:'Use no lugar de Intervalo + Últ. exec. para limite de vida'},
      {h:'Cal. meses',w:9,num:1,int:1,note:'Limite em meses (co-limite ou só calendário)'},
      {h:'Cal. últ. exec.',w:13,num:1,date:1,note:'Data da última execução (dd/mm/aaaa)'},
      {h:'Observações',w:30}];
    const T=wb.addWorksheet('Tarefas',{views:[{state:'frozen',ySplit:6,showGridLines:false}],properties:{tabColor:{argb:NAVY}}});
    T.columns=cols.map(c=>({width:c.w}));
    banner(wb,T,'TAREFAS DO MAPA — IMPORTAÇÃO EM MASSA','Campos em dourado são obrigatórios',cols.length,'A linha 7 é um exemplo: apague ou substitua');
    headerRow(T,6,cols);
    const ex=T.addRow(['','INSPEÇÕES PERIÓDICAS','Célula','','PHASE 1/2 (exemplo)','','','Célula · h',150,4307.1,null,24,new Date(2026,5,5,12),'AXIAL']);
    ex.eachCell({includeEmpty:true},c=>{ c.font={name:FONT,italic:true,size:9,color:{argb:'FF667085'}}; c.fill=fill('FFF2F4F7'); });
    ex.getCell(13).numFmt='dd/mm/yyyy';
    for(let rr=7;rr<=1006;rr++) cols.forEach((c,i)=>{ const cell=T.getCell(rr,i+1);
      if(c.list) cell.dataValidation={type:'list',allowBlank:true,formulae:[c.list],showErrorMessage:true,errorTitle:'Valor inválido',error:'Escolha um valor da lista.'};
      else if(c.dec) cell.dataValidation={type:'decimal',operator:'greaterThanOrEqual',allowBlank:true,formulae:[0],showErrorMessage:true,error:'Informe um número ≥ 0.'};
      else if(c.int) cell.dataValidation={type:'whole',operator:'between',allowBlank:true,formulae:[1,600],showErrorMessage:true,error:'Meses entre 1 e 600.'};
      else if(c.date){ cell.dataValidation={type:'date',operator:'greaterThan',allowBlank:true,formulae:[new Date(1950,0,1)],showErrorMessage:true,error:'Data inválida (dd/mm/aaaa).'}; cell.numFmt='dd/mm/yyyy'; } });
    printSetup(T,'modelo','Tarefas','6:6');

    const DAc=DA.cols||['Nº / DA','Sinopse','BS/Outros','Cat.','Freq.','Data','TSN','TSO','R. Primário','Disp.','Exec.','Venc.','P/Obs','Cad/Pág','Cumprido'];
    const Wd=[14,40,12,6,9,11,9,9,12,9,9,11,28,12,16];
    const dcols=[{h:'Aba *',w:22,req:1,note:'Em qual aba de DA/Boletim do app a linha entra',list:'Listas!$D$1:$D$'+Math.max(1,abas.length||3)}].concat(DAc.map((h,i)=>({h:i===0?h+' *':h,w:Wd[i]||12,req:i===0?1:0})));
    const D=wb.addWorksheet('DA e Boletins',{views:[{state:'frozen',ySplit:6,showGridLines:false}],properties:{tabColor:{argb:GREY}}});
    D.columns=dcols.map(c=>({width:c.w}));
    banner(wb,D,'DA E BOLETINS — IMPORTAÇÃO EM MASSA','Mesmas colunas das abas de DA do app',dcols.length,'Mesmo Nº/DA na mesma aba = atualiza; os demais entram como novos');
    headerRow(D,6,dcols);
    for(let rr=7;rr<=506;rr++) D.getCell(rr,1).dataValidation={type:'list',allowBlank:true,formulae:[dcols[0].list],showErrorMessage:true,error:'Escolha uma aba da lista.'};
    printSetup(D,'modelo','DA e Boletins','6:6');
    await baixar(wb,'Modelo_Importacao_Mapa.xlsx');
  }catch(e){ console.error(e); toast('⚠ '+(e.message||'Falha ao gerar o modelo')); }
}

// =================== IMPORTAR: leitura ===================
function nrm(s){ return normName(s).replace(/[^A-Z0-9 ]+/g,' ').replace(/\s+/g,' ').trim(); }
function cellV(v){
  if(v==null) return null;
  if(v instanceof Date) return v;
  if(typeof v==='object'){
    if(v.richText) return v.richText.map(x=>x.text).join('');
    if('result' in v) return cellV(v.result);
    if('text' in v) return v.text;
    if(v.error) return null;
  }
  return v;
}
function parseNum(v){
  v=cellV(v); if(v==null||v==='') return null;
  if(typeof v==='number') return v;
  let s=String(v).trim().replace(/\s/g,'').replace(/[a-zA-Z]+$/,''); if(!s||s==='—'||s==='-') return null;
  if(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s=s.replace(/\./g,'').replace(',','.');
  else if(/^-?\d+,\d+$/.test(s)) s=s.replace(',','.');
  else if(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s=s.replace(/,/g,'');
  const n=parseFloat(s); return isNaN(n)?NaN:n;
}
function parseDate(v){
  v=cellV(v); if(v==null||v==='') return null;
  if(v instanceof Date){ if(isNaN(v)) return NaN; return v.getUTCFullYear()+'-'+pad(v.getUTCMonth()+1)+'-'+pad(v.getUTCDate()); }
  if(typeof v==='number'){ const d=new Date(Math.round((v-25569)*86400000)); return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate()); }
  const s=String(v).trim(); let m;
  if((m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) return m[3]+'-'+pad(m[2])+'-'+pad(m[1]);
  if((m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return m[1]+'-'+m[2]+'-'+m[3];
  return NaN;
}
function txt(v){ v=cellV(v); if(v==null) return ''; if(v instanceof Date) return parseDate(v); return String(v).trim(); }

const HEAD_ALIAS={
  id:['ID VAZIO NOVO','ID NAO ALTERAR','ID'], grupo:['GRUPO'], categoria:['CATEGORIA'], unidade:['UNIDADE'],
  nome:['NOMENCLATURA'], pn:['P N','PN'], sn:['S N','SN'], base:['CONTADOR BASE','BASE'], intervalo:['INTERVALO'],
  exec:['ULT EXEC'], vfix:['VENCE FIXO LLP','VENCE FIXO'], calm:['CAL MESES'], cald:['CAL ULT EXEC'], obs:['OBSERVACOES','OBS']};
function mapHeaders(row){
  const map={};
  row.eachCell({includeEmpty:false},(cell,ci)=>{ const h=nrm(txt(cell.value)).replace(/ \*$/,'').trim();
    Object.keys(HEAD_ALIAS).forEach(k=>{ if(map[k]==null && HEAD_ALIAS[k].includes(h)) map[k]=ci; }); });
  return map;
}
function findHeader(ws, must){
  for(let r=1;r<=15;r++){ const row=ws.getRow(r); let ok=false;
    row.eachCell({includeEmpty:false},cell=>{ if(nrm(txt(cell.value)).replace(/ \*$/,'').startsWith(must)) ok=true; });
    if(ok) return r; }
  return 0;
}
// "Motor 1 · TSN", "Motor · TSN" + unidade, "Célula · h", "Calendário", "N/A", "OC"
function parseBase(s, unidade){
  const t=nrm(s);
  if(!t || t==='N A' || t==='NA') return {base:null,tipo:'na'};
  if(t==='OC' || t==='O C') return {base:null,tipo:'oc'};
  if(t.startsWith('CALENDARIO')) return {base:'calendario',tipo:'calendario',cat:null};
  const m=/^(CELULA|MOTOR|HELICE)\s*(\d)?\s*(H|HORAS|POUSOS|CICLOS|TSN|TSO|CSN|CSO)$/.exec(t);
  if(!m) return null;
  const cat=m[1]==='CELULA'?'celula':m[1]==='MOTOR'?'motor':'helice';
  let u=m[2]?parseInt(m[2],10):null;
  if(u==null && cat!=='celula'){ const um=/(\d)/.exec(unidade||''); if(um) u=parseInt(um[1],10); else if(/TODAS/.test(nrm(unidade))) u='todas'; else return {erro:'informe a Unidade (Motor 1, Motor 2…)'}; }
  let suf=m[3]; if(suf==='HORAS') suf='H';
  if(cat==='celula'){ const b={H:'celula_horas',POUSOS:'celula_pousos',CICLOS:'celula_ciclos'}[suf]; if(!b) return null; return {base:b,cat,tipo:{H:'horas',POUSOS:'pousos',CICLOS:'ciclos'}[suf]}; }
  if(cat==='helice' && !/^(TSN|TSO|H)$/.test(suf)) return null;
  const s2={H:'tsn',TSN:'tsn',TSO:'tso',CSN:'csn',CSO:'cso',CICLOS:'csn'}[suf]; if(!s2) return null;
  return {baseTpl:cat+'#_'+s2,unit:u,cat,tipo:/^c/.test(s2)?'ciclos':'horas'};
}

function lerTarefas(ws, avisosGlobais){
  const hr=findHeader(ws,'NOMENCLATURA'); if(!hr) return null;
  const H=mapHeaders(ws.getRow(hr)); const linhas=[];
  const nU=cat=>{ const a=cur().aeronave||{}; return cat==='motor'?(a.nMotores!=null?a.nMotores:2):(cat==='helice'?(a.nHelices!=null?a.nHelices:0):0); };
  for(let r=hr+1;r<=ws.rowCount;r++){
    const row=ws.getRow(r); const g=k=>H[k]?row.getCell(H[k]).value:null;
    const nome=txt(g('nome'));
    const vazio=!nome && !txt(g('base')) && !txt(g('intervalo')) && !txt(g('id'));
    if(vazio) continue;
    if(/^TOTAL:/i.test(nome)||/^TOTAL:/i.test(txt(row.getCell(2).value))) continue;
    if(/\(EXEMPLO\)/i.test(nome)) continue;
    const L={linha:r, aba:ws.name, erros:[], avisos:[], campos:{}};
    const id=txt(g('id')); if(id) L.id=id;
    if(!nome) L.erros.push('Nomenclatura vazia'); else L.campos.nome=nome;
    ['grupo','pn','sn','obs'].forEach(k=>{ if(H[k]){ const v=txt(g(k)); if(v!=='') L.campos[k]=v; } });
    const unidade=txt(g('unidade'));
    const bs=txt(g('base'));
    let pb=null;
    if(H.base){ pb=parseBase(bs,unidade); if(!pb) L.erros.push('Contador base inválido: "'+bs+'"'); else if(pb.erro){ L.erros.push(pb.erro); pb=null; } }
    if(!bs && !id) L.erros.push('Contador base vazio');
    const catTxt=nrm(txt(g('categoria')));
    let cat=catTxt? ({CELULA:'celula',MOTOR:'motor',HELICE:'helice',ICA:'ica'}[catTxt]||'?') : null;
    if(cat==='?'){ L.erros.push('Categoria inválida: "'+txt(g('categoria'))+'"'); cat=null; }
    const N=k=>{ if(!H[k]) return undefined; const v=parseNum(g(k)); if(Number.isNaN(v)){ L.erros.push('Número inválido em '+k+': "'+txt(g(k))+'"'); return undefined; } return v; };
    const intervalo=N('intervalo'), exec=N('exec'), vfix=N('vfix'), calm=N('calm');
    let cald; if(H.cald){ cald=parseDate(g('cald')); if(Number.isNaN(cald)){ L.erros.push('Data inválida em Cal. últ. exec.: "'+txt(g('cald'))+'"'); cald=undefined; } }
    if(intervalo!=null) L.campos.intervalo=intervalo;
    if(exec!=null) L.campos.exec=exec;
    if(vfix!=null) L.campos.vencFixo=vfix;
    if(calm!=null||cald){ L.campos.cal={}; if(calm!=null) L.campos.cal.meses=Math.round(calm); if(cald) L.campos.cal.exec=cald; }
    if(pb){
      L.campos.tipoVenc=pb.tipo;
      if(pb.base!==undefined){ L.campos.base=pb.base; }
      if(!cat) cat=pb.cat||(pb.base===null?null:'celula');
      if(cat==='ica' && pb.cat && pb.cat!=='celula'){ /* ICA com contador de motor: mantém */ }
      if(pb.baseTpl){
        if(cat && cat!=='ica' && pb.cat!==cat) L.avisos.push('Categoria "'+txt(g('categoria'))+'" ajustada para '+CAT_LABEL[pb.cat]+' (pelo contador)');
        if(cat!=='ica') cat=pb.cat;
        L.baseTpl=pb.baseTpl; L.unit=pb.unit;
        if(pb.unit!=='todas' && pb.unit>nU(pb.cat)) L.avisos.push('Esta aeronave tem '+nU(pb.cat)+' '+(pb.cat==='motor'?'motor(es)':'hélice(s)')+' cadastrado(s)');
      }
    }
    if(cat) L.campos.categoria=cat;
    // avisos de vencimento
    const b=L.campos.base, numerico=(L.baseTpl||(b&&b!=='calendario'));
    if(numerico && vfix==null && (intervalo==null||exec==null) && !id) L.avisos.push('Sem Intervalo + Últ. exec. (nem Vence fixo): o item entra sem vencimento por contador');
    if(L.campos.tipoVenc==='calendario' && !(L.campos.cal&&L.campos.cal.meses&&L.campos.cal.exec) && !id) L.avisos.push('Calendário sem meses ou sem data: o item entra sem vencimento');
    // "Todas": uma linha por unidade
    if(L.baseTpl && L.unit==='todas'){
      const n=nU(L.campos.categoria); if(!n){ L.erros.push('A aeronave não tem '+(L.campos.categoria==='motor'?'motores':'hélices')+' cadastrados'); linhas.push(L); continue; }
      for(let u=1;u<=n;u++){ const c=JSON.parse(JSON.stringify(L)); c.campos.base=L.baseTpl.replace('#',u); c.campos.unidade=u; c.sufixo=' ('+(L.campos.categoria==='motor'?'Motor ':'Hélice ')+u+')'; delete c.baseTpl; linhas.push(c); }
      continue;
    }
    if(L.baseTpl){ L.campos.base=L.baseTpl.replace('#',L.unit); L.campos.unidade=L.unit; delete L.baseTpl; }
    linhas.push(L);
  }
  return linhas;
}

function matchAba(nome){
  const DA=cur().da||{}; const t=nrm(nome); if(!t) return null;
  const ks=Object.keys(DA.sheets||{});
  for(const k of ks){ const ti=nrm(DA.sheets[k].title||k); if(ti===t || k.toUpperCase()===t || ti.startsWith(t) || t.startsWith(ti)) return k; }
  const w=t.split(' ').filter(x=>x.length>1 && x!=='DA' && x!=='DE');
  const cand=ks.filter(k=>{ const ti=nrm(DA.sheets[k].title||k); return w.every(x=>ti.indexOf(x)>=0) && (t.indexOf('BOL')===0)===(ti.indexOf('BOL')===0); });
  return cand.length===1?cand[0]:null;
}
function lerDA(ws, abaFixa){
  const hr=findHeader(ws,'SINOPSE'); if(!hr) return null;
  const head={}; ws.getRow(hr).eachCell({includeEmpty:false},(c,ci)=>{ head[ci]=nrm(txt(c.value)).replace(/ \*$/,''); });
  const cols=(cur().da&&cur().da.cols)||[]; const colIdx={}; let abaCol=null;
  Object.keys(head).forEach(ci=>{ const h=head[ci]; if(h==='ABA') abaCol=+ci; const j=cols.findIndex(c=>nrm(c)===h); if(j>=0 && colIdx[j]==null) colIdx[j]=+ci; });
  if(colIdx[0]==null) return null;
  const linhas=[];
  for(let r=hr+1;r<=ws.rowCount;r++){
    const row=ws.getRow(r); const vals=DA_KEYS.map((k,j)=>colIdx[j]!=null?txt(row.getCell(colIdx[j]).value):undefined);
    if(!vals.some(v=>v)) continue;
    const L={linha:r, aba:ws.name, erros:[], avisos:[], tipo:'da', campos:{}};
    const abaTxt=abaFixa||(abaCol?txt(row.getCell(abaCol).value):'');
    const k=abaFixa?abaFixa:matchAba(abaTxt);
    if(!k){ L.erros.push(abaTxt?'Aba "'+abaTxt+'" não existe nesta aeronave':'Coluna Aba vazia'); }
    L.sheet=k;
    if(!vals[0]){ if(vals.filter(Boolean).length===1 && !abaFixa) continue; L.erros.push('Nº / DA vazio'); }
    DA_KEYS.forEach((key,j)=>{ if(vals[j]!=null && vals[j]!=='') L.campos[key]=vals[j]; });
    L.campos.nome=vals[1]||vals[0]||'';
    linhas.push(L);
  }
  return linhas;
}

// =================== duplicados / comparação ===================
function bigr(s){ const a=new Map(); s=' '+s+' '; for(let i=0;i<s.length-1;i++){ const g=s.substr(i,2); a.set(g,(a.get(g)||0)+1); } return a; }
function simil(a,b){
  if(!a||!b) return 0; if(a===b) return 1;
  const na=a.match(/\d+/g)||[], nb=b.match(/\d+/g)||[];
  if(na.join(' ')!==nb.join(' ') && (na.length||nb.length)) return 0;    // PHASE 2 ≠ PHASE 23
  const A=bigr(a), B=bigr(b); let inter=0, ta=0, tb=0;
  A.forEach((v,k)=>{ ta+=v; if(B.has(k)) inter+=Math.min(v,B.get(k)); }); B.forEach(v=>tb+=v);
  return 2*inter/(ta+tb);
}
function ladoOf(t){ const m=/^(motor|helice)(\d)/.exec(t.base||''); return m?m[1]+m[2]:'celula'; }
const CAMPOS_CMP=[['grupo','Grupo'],['categoria','Categoria'],['nome','Nomenclatura'],['pn','P/N'],['sn','S/N'],['base','Contador'],['intervalo','Intervalo'],['exec','Últ. exec.'],['vencFixo','Vence fixo'],['obs','Obs.']];
function fv(k,v){ if(v==null||v==='') return '—'; if(k==='base') return BASE_LABEL[v]||v; if(k==='categoria') return CAT_LABEL[v]||v; if(typeof v==='number') return fmtN(v,1); return String(v); }
function diffTarefa(t, campos){
  const d=[];
  CAMPOS_CMP.forEach(([k,l])=>{ if(!(k in campos)) return; const a=t[k], b=campos[k];
    const eq=(typeof b==='number')?(num(a)!=null && Math.abs(num(a)-b)<0.05):(String(a==null?'':a).trim()===String(b==null?'':b).trim());
    if(!eq) d.push(l+': '+fv(k,a)+' → '+fv(k,b)); });
  if(campos.cal){ const a=t.cal||{};
    if(campos.cal.meses!=null && num(a.meses)!==campos.cal.meses) d.push('Cal. meses: '+fv('',a.meses)+' → '+campos.cal.meses);
    if(campos.cal.exec && a.exec!==campos.cal.exec) d.push('Cal. últ. exec.: '+(a.exec?fmtDate(new Date(a.exec+'T00:00:00')):'—')+' → '+fmtDate(new Date(campos.cal.exec+'T00:00:00'))); }
  return d;
}
function diffDA(r, campos){
  const d=[]; DA_KEYS.forEach((k,j)=>{ if(!(k in campos)) return; const a=r[k]==null?'':String(r[k]).trim(), b=String(campos[k]).trim(); if(a!==b) d.push(((cur().da||{}).cols||[])[j]+': '+(a||'—')+' → '+(b||'—')); });
  return d;
}

function analisar(linhas){
  const m=cur(); const tarefas=(m.tarefas||[]).filter(Boolean);
  const byId={}; tarefas.forEach(t=>{ if(t.id) byId[t.id]=t; });
  const idx=tarefas.map(t=>({t, n:nrm(t.nome), lado:ladoOf(t)}));
  const vistos={}, usadosDA={}, usadosT=new Set();
  linhas.forEach(L=>{
    L.nomeVis=(L.campos.nome||'')+(L.sufixo||'');
    if(L.erros.length){ L.acao='erro'; return; }
    if(L.tipo==='da'){
      const sh=(m.da.sheets||{})[L.sheet]; const rows=(sh&&sh.rows||[]).map(daRowNormalize);
      const kNum=nrm(L.campos.numero);
      const usados=usadosDA[L.sheet]=usadosDA[L.sheet]||new Set();
      const i=rows.findIndex((r,j)=>r && r.sec===undefined && nrm(r.numero)===kNum && !usados.has(j));
      if(i>=0) usados.add(i);
      else { const chave='DA|'+L.sheet+'|'+kNum; if(vistos[chave]){ L.dupPlanilha=vistos[chave]; L.avisos.push('Mesmo Nº/DA repetido na planilha (linha '+vistos[chave]+')'); } else vistos[chave]=L.linha; }
      if(i>=0){ L.alvoDA=i; L.diff=diffDA(rows[i],L.campos); L.acao=L.diff.length?'atualizar':'igual'; L.opcoes=['atualizar','novo','ignorar']; }
      else { L.acao='novo'; L.opcoes=['novo','ignorar']; }
      if(L.dupPlanilha) L.acao='ignorar';
      return;
    }
    const nn=nrm(L.campos.nome+(L.sufixo||'')), nBase=nrm(L.campos.nome);
    const lado=L.campos.base?ladoOf(L.campos):'?';
    if(L.id){
      const t=byId[L.id];
      if(t && usadosT.has(t.id)){ L.dupPlanilha=1; L.avisos.push('ID '+L.id+' aparece mais de uma vez na planilha'); L.acao='ignorar'; L.opcoes=['ignorar','novo']; return; }
      if(t){ usadosT.add(t.id); L.alvo=t.id; L.diff=diffTarefa(t,L.campos); L.acao=L.diff.length?'atualizar':'igual'; L.opcoes=['atualizar','novo','ignorar']; return; }
      L.avisos.push('ID '+L.id+' não existe nesta aeronave: entra como novo');
    }
    // sem ID (ou ID desconhecido): repetido na própria planilha?
    const chave=nBase+'|'+lado+'|'+nrm(L.campos.pn||'')+'|'+nrm(L.campos.sn||'');
    if(vistos[chave]){ L.dupPlanilha=vistos[chave]; L.avisos.push('Repetido na planilha (igual à linha '+vistos[chave]+')'); } else vistos[chave]=L.linha;
    // ... e no mapa atual
    let exato=idx.filter(x=>x.n===nBase && (lado==='?'||x.lado===lado));
    if(exato.length>1 && L.campos.pn) { const e2=exato.filter(x=>nrm(x.t.pn)===nrm(L.campos.pn)); if(e2.length) exato=e2; }
    if(exato.length){
      L.alvo=exato[0].t.id; L.dupTipo='igual'; L.diff=diffTarefa(exato[0].t,L.campos);
      L.avisos.push('Já existe no mapa com o mesmo nome'+(exato.length>1?' ('+exato.length+' itens)':'')+': '+exato[0].t.nome+' ['+exato[0].t.id+']');
      L.acao=L.diff.length?'atualizar':'igual'; L.opcoes=['atualizar','novo','ignorar'];
    } else {
      let best=null, bs=0;
      idx.forEach(x=>{ if(lado!=='?' && x.lado!==lado && x.lado!=='celula' && lado!=='celula') return; const s=simil(nBase,x.n); if(s>bs){ bs=s; best=x; } });
      if(best && bs>=0.8){ L.alvo=best.t.id; L.dupTipo='parecido'; L.sim=Math.round(bs*100);
        L.diff=diffTarefa(best.t,L.campos);
        L.avisos.push('Parecido ('+L.sim+'%) com: '+best.t.nome+' ['+best.t.id+']');
        L.acao='novo'; L.opcoes=['novo','atualizar','ignorar']; }
      else { L.acao='novo'; L.opcoes=['novo','ignorar']; }
    }
    if(L.dupPlanilha) L.acao='ignorar';
  });
  return linhas;
}

// =================== IMPORTAR: tela ===================
let IMP=null;
function ensureOverlay(){
  let o=document.getElementById('impOverlay'); if(o) return o;
  o=document.createElement('div'); o.className='overlay'; o.id='impOverlay';
  o.innerHTML='<div class="modal" style="width:1040px;max-width:100%"><h3 id="impTitle">Importar planilha</h3><div class="mbody" style="display:block;max-height:70vh;overflow:auto" id="impBody"></div>'+
    '<div class="mfoot"><span class="muted" style="font-size:11px" id="impFootTxt"></span><div><button class="btn o" id="impCancel">Fechar</button> <button class="btn g" id="impOk" style="display:none">✔ Importar</button></div></div></div>';
  document.body.appendChild(o);
  o.querySelector('#impCancel').addEventListener('click',()=>{ o.classList.remove('show'); IMP=null; });
  o.querySelector('#impOk').addEventListener('click',aplicarImport);
  return o;
}
function abrirImportar(){
  const ac=STATE.currentAC;
  if(typeof podeOuAvisa==='function' && !podeOuAvisa('mapa','e',ac)) return;
  const o=ensureOverlay(); IMP=null;
  o.querySelector('#impTitle').textContent='Importar planilha — '+ac;
  o.querySelector('#impOk').style.display='none';
  o.querySelector('#impFootTxt').textContent='Nada é gravado antes de você confirmar. Nada é apagado.';
  o.querySelector('#impBody').innerHTML=
    `<p class="lead" style="margin-top:0">Suba o <b>modelo preenchido</b> ou o próprio <b>Excel baixado do app</b> (editado). Os itens entram na aeronave <b>${esc(ac)}</b>.</p>`+
    `<div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 4px"><button class="btn o" id="impModelo">⬇ Baixar modelo vazio</button>`+
    `<label class="btn p" style="cursor:pointer">📂 Escolher arquivo .xlsx<input type="file" id="impFile" accept=".xlsx" style="display:none"></label></div>`+
    `<ul class="muted" style="font-size:12px;line-height:1.6;margin:10px 0 0 18px"><li>Linha com ID atualiza aquele item; sem ID entra como novo.</li><li>O app avisa itens iguais ou parecidos com o que já está no mapa e linhas repetidas na planilha; você escolhe atualizar, criar novo ou ignorar.</li><li>Antes de gravar, o app baixa uma cópia do mapa como estava.</li></ul>`;
  o.querySelector('#impModelo').addEventListener('click',baixarModelo);
  o.querySelector('#impFile').addEventListener('change',e=>{ const f=e.target.files&&e.target.files[0]; if(f) lerArquivo(f); });
  o.classList.add('show');
}
async function lerArquivo(file){
  const body=document.getElementById('impBody'); body.innerHTML='<p class="lead">Lendo '+esc(file.name)+'…</p>';
  try{
    const ExcelJS=await loadXL(); const wb=new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
    let linhas=[]; const lidas=[];
    wb.eachSheet(ws=>{
      if(ws.state==='veryHidden'||ws.state==='hidden') return;
      const n=nrm(ws.name);
      if(n==='RESUMO'||n==='COMO PREENCHER'||n==='LISTAS') return;
      const t=lerTarefas(ws); if(t){ linhas=linhas.concat(t); lidas.push(ws.name+' ('+t.length+')'); return; }
      const abaFixa=(n==='DA E BOLETINS')?null:matchAba(ws.name);
      const d=lerDA(ws,abaFixa); if(d){ linhas=linhas.concat(d); lidas.push(ws.name+' ('+d.length+')'); }
    });
    if(!linhas.length){ body.innerHTML='<p class="lead">⚠ Não encontrei linhas para importar. Use o modelo (aba "Tarefas") ou o Excel baixado do app.</p>'; return; }
    IMP={file:file.name, linhas:analisar(linhas), lidas};
    renderPrevia();
  }catch(e){ console.error(e); body.innerHTML='<p class="lead">⚠ Não consegui ler o arquivo: '+esc(e.message||String(e))+'</p>'; }
}
const ACAO_TXT={novo:'Criar novo',atualizar:'Atualizar existente',ignorar:'Ignorar',igual:'Sem mudança',erro:'Erro'};
function renderPrevia(){
  const L=IMP.linhas; const o=document.getElementById('impOverlay');
  const c={novo:0,atualizar:0,igual:0,ignorar:0,erro:0,dup:0};
  L.forEach(x=>{ c[x.acao]=(c[x.acao]||0)+1; if(x.dupTipo||x.dupPlanilha) c.dup++; });
  const chip=(cls,t,n)=>`<span class="kpi ${cls}" style="margin-right:6px">${t} <b>${n}</b></span>`;
  let h=`<p style="margin:0 0 8px"><b>${esc(IMP.file)}</b> · abas lidas: ${esc(IMP.lidas.join(', '))}</p>`+
    `<div style="margin-bottom:10px">${chip('ok','🟢 Novos',c.novo)}${chip('all','🔵 Atualizar',c.atualizar)}${chip('','⚪ Sem mudança',c.igual)}${chip('wn','🟠 Possíveis duplicados',c.dup)}${chip('od','🔴 Erros',c.erro)}${chip('','Ignorar',c.ignorar)}</div>`;
  h+='<div class="tblwrap"><table class="da" style="font-size:12px"><thead><tr><th>Linha</th><th>Ação</th><th>Nomenclatura</th><th>Detalhes</th></tr></thead><tbody>';
  const ordem={erro:0,atualizar:2,novo:3,igual:4,ignorar:5};
  const vis=L.map((x,i)=>({x,i})).sort((a,b)=>{ const da=(a.x.dupTipo||a.x.dupPlanilha)?1:ordem[a.x.acao]+1, db=(b.x.dupTipo||b.x.dupPlanilha)?1:ordem[b.x.acao]+1; return da-db || a.i-b.i; });
  vis.forEach(({x,i})=>{
    const cor=x.acao==='erro'?'#fde2e1':(x.dupTipo||x.dupPlanilha)?'#fef0c7':x.acao==='novo'?'#ecfdf3':x.acao==='atualizar'?'#eef4ff':'#fff';
    let ac;
    if(x.acao==='erro') ac='<b style="color:#b42318">Erro</b>';
    else if(x.acao==='igual') ac='<span class="muted">Sem mudança</span>';
    else ac='<select data-i="'+i+'" class="impSel">'+x.opcoes.map(op=>`<option value="${op}" ${op===x.acao?'selected':''}>${ACAO_TXT[op]}${op==='atualizar'&&x.alvo?' '+esc(x.alvo):''}</option>`).join('')+'</select>';
    const det=[].concat(x.erros.map(e=>'<span style="color:#b42318">✖ '+esc(e)+'</span>'), x.avisos.map(a=>'⚠ '+esc(a)),
      (x.diff&&x.diff.length&&x.acao!=='novo')?['<span class="muted">'+x.diff.slice(0,6).map(esc).join(' · ')+(x.diff.length>6?' …':'')+'</span>']:[]).join('<br>');
    h+=`<tr style="background:${cor}"><td class="muted">${esc(x.aba)} ${x.linha}</td><td>${ac}</td><td><b>${esc(x.nomeVis||'')}</b>${x.tipo==='da'?' <span class="muted">('+esc(((cur().da.sheets||{})[x.sheet]||{}).title||'DA')+')</span>':''}</td><td>${det||'<span class="muted">—</span>'}</td></tr>`;
  });
  h+='</tbody></table></div>';
  document.getElementById('impBody').innerHTML=h;
  document.querySelectorAll('#impBody .impSel').forEach(s=>s.addEventListener('change',()=>{ IMP.linhas[+s.dataset.i].acao=s.value; atualizarRodape(); }));
  o.querySelector('#impOk').style.display='';
  atualizarRodape();
}
function atualizarRodape(){
  const L=IMP.linhas; const n=L.filter(x=>x.acao==='novo').length, a=L.filter(x=>x.acao==='atualizar').length;
  document.getElementById('impFootTxt').textContent=`Vai gravar: ${n} novo(s) e ${a} atualização(ões). Erros e "Ignorar" ficam de fora. Antes, o app baixa uma cópia do mapa.`;
  const b=document.getElementById('impOk'); b.disabled=!(n+a); b.textContent='✔ Importar '+(n+a)+' item(ns)';
}
let _seq=0;
function novoId(ac){ return ac.replace(/[^A-Z0-9]/gi,'')+'-X'+Date.now().toString(36).toUpperCase()+(_seq++).toString(36).toUpperCase(); }
async function aplicarImport(){
  if(!IMP) return; const ac=STATE.currentAC; const m=cur();
  if(typeof podeOuAvisa==='function' && !podeOuAvisa('mapa','e',ac)) return;
  const L=IMP.linhas; const nov=L.filter(x=>x.acao==='novo'), upd=L.filter(x=>x.acao==='atualizar');
  if(!(nov.length+upd.length)) return;
  const b=document.getElementById('impOk'); b.disabled=true; b.textContent='Gravando…';
  // 1) cópia de segurança (Excel baixado + registro de atividades)
  try{ const wb=await buildMapaWorkbook(ac); await baixar(wb,'Backup_Mapa_'+ac+'_antes_import_'+stamp()+'.xlsx'); }
  catch(e){ console.error(e); if(!confirm('Não consegui baixar a cópia de segurança. Importar mesmo assim?')){ b.disabled=false; atualizarRodape(); return; } }
  logAction('Cópia de segurança antes de importar planilha ('+ac+')', JSON.stringify({tarefas:m.tarefas,da:m.da}));
  // 2) aplica
  const byId={}; (m.tarefas||[]).forEach(t=>{ if(t&&t.id) byId[t.id]=t; });
  let nT=0,uT=0,nD=0,uD=0;
  const aplicaCampos=(t,c)=>{ Object.keys(c).forEach(k=>{ if(k==='cal'){ t.cal=Object.assign({meses:null,exec:null},t.cal||{},c.cal); } else t[k]=c[k]; }); };
  L.forEach(x=>{
    if(x.acao!=='novo'&&x.acao!=='atualizar') return;
    if(x.tipo==='da'){
      const sh=m.da.sheets[x.sheet]; sh.rows=(sh.rows||[]).map(daRowNormalize);
      if(x.acao==='atualizar' && x.alvoDA!=null && sh.rows[x.alvoDA]){ Object.assign(sh.rows[x.alvoDA],x.campos); delete sh.rows[x.alvoDA].nome; uD++; }
      else { const r={}; DA_KEYS.forEach(k=>r[k]=x.campos[k]!=null?x.campos[k]:''); sh.rows.push(r); nD++; }
      return;
    }
    if(x.acao==='atualizar' && x.alvo && byId[x.alvo]){ aplicaCampos(byId[x.alvo],x.campos); uT++; return; }
    const t={id:novoId(ac),grupo:'IMPORTADOS',categoria:'celula',unidade:null,nome:'',pn:'',sn:'',obs:'',base:null,tipoVenc:'na',intervalo:null,exec:null,vencFixo:null,cal:null};
    aplicaCampos(t,x.campos); if(x.sufixo) t.nome=t.nome+x.sufixo;
    if(t.cal && t.cal.meses==null && !t.cal.exec) t.cal=null;
    m.tarefas.push(t); byId[t.id]=t; nT++;
  });
  STATE.tarefas=m.tarefas;
  try{ buildMapaSubtabs(); renderAll(); }catch(e){ console.error(e); }
  await saveAll();
  logAction('Importou planilha', `${ac} · ${IMP.file} · itens: ${nT} novos, ${uT} atualizados · DA: ${nD} novas, ${uD} atualizadas`);
  document.getElementById('impOverlay').classList.remove('show');
  toast(`✔ Importado: ${nT+nD} novo(s), ${uT+uD} atualizado(s)`);
  IMP=null;
}

window.exportarMapaExcel=exportarMapaExcel;
window.abrirImportarMapa=abrirImportar;
window.baixarModeloMapa=baixarModelo;
window.JETFOR_XL={buildMapaWorkbook, analisar, lerTarefas, lerDA, parseBase, parseNum, parseDate, simil, loadXL};
})();
