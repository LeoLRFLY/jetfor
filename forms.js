/* JetFor · Formulários preenchíveis (RDS, RSI, ...) */
(function(){
  const DIR = "Leonardo Filipe de Araujo";
  const CANAC = "133125";
  const CREA = "1713750589";
  const EMP = "JETFOR TÁXI AÉREO LTDA.";
  const COA = "COA 2007-07-2CHQ-02-02";
  const CNPJ = "CNPJ 01.274.847/0001-27";

  function cabecalho(sub){
    return `<div class="fh"><div class="fh-l"><span class="fh-jf">✈ JETFOR</span><span class="fh-emp">${EMP}</span></div>
      <div class="fh-r">${sub}<br><span class="fh-min">${COA} · ${CNPJ} · Fortaleza/CE</span></div></div>`;
  }
  function assinatura(){
    return `<div class="fsign"><div class="fsign-line">_______________________________________</div>
      <b>${DIR}</b><br>Diretor de Manutenção — ${EMP}<br>
      <span class="fh-min">Cód. ANAC ${CANAC} · CREA ${CREA}</span>
      <div class="floc">Local e data: Fortaleza, ______ de ________________ de ________.</div></div>`;
  }

  // ---------------- RDS (RBAC 135.415) ----------------
  const OCORR = [
    "a) Incêndio durante o voo e funcionamento do sistema de detecção",
    "b) Falso aviso de fogo durante o voo",
    "c) Aviso espúrio de fogo durante o voo",
    "d) Sistema de exaustão que cause dano ao motor/estrutura/componentes",
    "e) Componente que cause fumaça, vapor ou gases tóxicos na cabine",
    "f) Desligamento de motor em voo por falha de combustão (flameout)",
    "g) Desligamento de motor em voo por dano de fonte externa",
    "h) Desligamento de motor em voo por ingestão de gelo/objeto estranho",
    "i) Desligamento de mais de um motor em voo",
    "j) Excesso de velocidade (disparo) do sistema de hélice/propulsão em voo",
    "k) Sistema de combustível/alijamento que afete o fluxo ou cause vazamento perigoso",
    "l) Extensão/retração ou abertura/fechamento não comandados do trem de pouso",
    "m) Sistema de freios com perda de força de frenagem no solo",
    "n) Estrutura que requeira grande reparo (Major Repair)",
    "o) Trincas, deformação permanente ou corrosão da estrutura (acima dos limites)"
  ];
  function buildRDS(){
    const ch = OCORR.map(o=>`<label class="chk"><input type="checkbox"> ${o}</label>`).join('');
    return `<div class="formdoc">
      ${cabecalho("<b>Relatório de Dificuldade em Serviço — RDS</b><br>RBAC 135.415 · envio por evento pelo Portal Único de Notificação (ANAC)")}
      <table class="ff"><tr><th>Nº do relatório</th><td><input></td><th>Data da ocorrência</th><td><input placeholder="__/__/____"></td></tr>
        <tr><th>Data do relatório</th><td><input placeholder="__/__/____"></td><th>Fase do voo / condição</th><td><input></td></tr></table>
      <div class="fsec">Dados da aeronave</div>
      <table class="ff"><tr><th>Matrícula</th><td><input></td><th>Categoria de registro</th><td><input value="TPX"></td></tr>
        <tr><th>Fabricante</th><td><input></td><th>Modelo</th><td><input></td></tr>
        <tr><th>Nº de série</th><td><input></td><th>Horas / ciclos totais</th><td><input></td></tr></table>
      <div class="fsec">Componente / motor / hélice envolvido (se aplicável)</div>
      <table class="ff"><tr><th>Componente / sistema</th><td><input></td><th>Part Number (P/N)</th><td><input></td></tr>
        <tr><th>Fabricante</th><td><input></td><th>Nº de série</th><td><input></td></tr>
        <tr><th>TSN / TSO</th><td><input></td><th>Modelo</th><td><input></td></tr></table>
      <div class="fsec">Natureza da ocorrência (marcar conforme aplicável — seção 135.415)</div>
      <div class="chkgrid">${ch}<label class="chk"><input type="checkbox"> —) Outra dificuldade que afete a aeronavegabilidade:</label></div>
      <div class="fsec">Descrição detalhada da ocorrência</div><textarea class="fta" rows="4"></textarea>
      <div class="fsec">Causa provável e ação corretiva adotada</div><textarea class="fta" rows="4"></textarea>
      ${assinatura()}
      <div class="fobs">Envio pelo <b>Portal Único de Notificação</b> da ANAC (o antigo sistema SDR/SACI foi descontinuado em 01/06/2023): santosdumont.anac.gov.br → Portal Único de Notificação. Dúvidas: pac@anac.gov.br.</div>
    </div>`;
  }

  // ---------------- RSI (RBAC 135.417) ----------------
  function rows(cols, n){
    let h='';
    for(let i=0;i<n;i++) h+=`<tr>${cols.map(()=>'<td><input></td>').join('')}</tr>`;
    return h;
  }
  function buildRSI(){
    return `<div class="formdoc">
      ${cabecalho("<b>Relatório Sumário de Interrupção Mecânica — RSI</b><br>RBAC 135.417 · envio MENSAL à ANAC (SPO/GTOA) até o 10º dia útil")}
      <table class="ff"><tr><th>Mês/ano de referência</th><td><input placeholder="__/____"></td><th>Data de emissão</th><td><input placeholder="__/__/____"></td></tr>
        <tr><th>Responsável (Diretor de Manutenção)</th><td><input value="${DIR}"></td><th>Cód. ANAC / CREA</th><td><input value="${CANAC} / ${CREA}"></td></tr></table>
      <div class="frad"><label class="chk"><input type="checkbox"> NÃO houve ocorrências a reportar no período (relatório negativo).</label>
        <label class="chk"><input type="checkbox"> Houve ocorrências — seguem relacionadas nos quadros abaixo.</label></div>
      <div class="fsec">Quadro A — Interrupções / mudanças não programadas por dificuldade mecânica <span class="fh-min">(que NÃO sejam reportáveis pela 135.415 — senão vira RDS)</span></div>
      <table class="ff grid"><tr><th>Data</th><th>Aeronave (matrícula)</th><th>Voo / rota</th><th>Tipo de evento</th><th>Descrição da dificuldade e ação tomada</th></tr>
        ${rows([1,2,3,4,5],5)}</table>
      <div class="fsec">Quadro B — Embandeiramentos de hélice em voo <span class="fh-min">(excluem-se treinamento, demonstração e teste em voo)</span></div>
      <table class="ff grid"><tr><th>Data</th><th>Aeronave (matrícula)</th><th>Tipo de hélice</th><th>Motor (tipo/posição)</th><th>Motivo</th></tr>
        ${rows([1,2,3,4,5],4)}</table>
      ${assinatura()}
    </div>`;
  }

  // ---------------- RDP — Relatório de Discrepâncias Pendentes ----------------
  function buildRDP(){
    return `<div class="formdoc">
      ${cabecalho("<b>Relatório de Discrepâncias Pendentes — RDP</b><br>Controle de panes/discrepâncias em aberto (ligado à MEL)")}
      <table class="ff"><tr><th>Matrícula</th><td><input></td><th>Modelo</th><td><input></td></tr>
        <tr><th>Serial Number</th><td><input></td><th>Base de Operação</th><td><input></td></tr></table>
      <div class="fsec">Discrepâncias pendentes</div>
      <div class="tblwrap"><table class="ff grid rdp"><tr>
        <th>Prefixo</th><th>Item MEL</th><th>DB / Nº OS</th><th>Data reporte</th><th>Descrição da pane</th><th>ATA</th><th>Cat. MEL</th><th>Proc. (M/O)</th><th>Proc. realizado</th><th>Nome / Cód ANAC</th><th>Data limite</th><th>Data extensão</th><th>Descrição da ação corretiva</th><th>Nome / Cód ANAC</th><th>Data da ação</th></tr>
        ${rows(new Array(15).fill(0),6)}</table></div>
      <div class="fobs">Categorias MEL: A, B, C, D (prazos conforme a MEL do modelo). Proc.: (M) Manutenção e/ou (O) Operacional.</div>
    </div>`;
  }

  // ---------------- Designação de Inspetores ----------------
  function buildDesig(){
    return `<div class="formdoc">
      ${cabecalho("<b>Designação de Inspetores</b><br>RBAC 135 e 65 · conforme procedimento do MGM")}
      <p class="fp">Conforme requerido pelo RBAC 135 e 65, e de acordo com o procedimento contido no Manual Geral de Manutenção (MGM) desta empresa, fica designado como inspetor o seguinte profissional:</p>
      <table class="ff"><tr><th>Nome</th><td><input></td><th>Código ANAC</th><td><input></td></tr></table>
      <div class="fsec">Habilitações — autoridades autorizadas (marque)</div>
      <div class="chkcol">
        <label class="chk"><input type="checkbox"> Inspeção de Manutenção (Preliminar, Quanto a Danos Ocultos, Inspeção em Processo)</label>
        <label class="chk"><input type="checkbox"> Execução de Inspeção Obrigatória (IIO)</label>
        <label class="chk"><input type="checkbox"> Inspeção Final e Aprovação para Retorno ao Serviço</label>
        <label class="chk"><input type="checkbox"> Inspeção de Recebimento de Material</label>
      </div>
      <div class="fsec">Caráter da designação</div>
      <div class="chkcol">
        <label class="chk"><input type="checkbox"> Permanente</label>
        <label class="chk"><input type="checkbox"> Provisório — válida de <input class="fin" placeholder="data início"> até <input class="fin" placeholder="data término"></label>
      </div>
      <div class="fsec">Responsável pela designação</div>
      <table class="ff"><tr><th>Nome</th><td><input></td><th>Função</th><td><input></td></tr></table>
      <div class="fsign"><div class="fsign-line">_______________________________________</div>Assinatura do responsável pela designação
        <div class="floc">Local e data: Fortaleza, ______ de ________________ de ________.</div></div>
    </div>`;
  }

  // ---------------- Lista de Tripulantes autorizados (135.429 d) ----------------
  function buildTrip(){
    return `<div class="formdoc">
      ${cabecalho("<b>Lista de Tripulantes Autorizados a Efetuar Manutenção em Locais Remotos</b><br>RBAC 135.429(d)")}
      <table class="ff grid"><tr><th>Nome do Tripulante</th><th>Código ANAC</th><th>Modelo de Aeronave</th><th>Tarefa Autorizada</th><th>Documento de Referência</th><th>Data do Treinamento</th></tr>
        ${rows([1,2,3,4,5,6],7)}</table>
      <table class="ff" style="margin-top:8px"><tr><th>Aprovado por</th><td><input></td><th>Local e data</th><td><input placeholder="Fortaleza, __/__/____"></td></tr></table>
      ${assinatura()}
    </div>`;
  }

  // ---------------- Formulário de Voo de Teste (Vistoria) ----------------
  const ATA_VOO=[['21','Ar Condicionado'],['21','Pressurização'],['22','Piloto automático'],['23','Comunicações'],
    ['24','Sistema elétrico DC'],['24','Sistema elétrico AC'],['26','Detector de Fogo dos motores'],['27','Comandos de voo'],
    ['28','Combustível'],['29','Sistema Hidráulico'],['30','Proteção Contra Gelo e Chuva'],['31','Indicação e gravação'],
    ['32','Trem de pouso'],['33','Luzes'],['34','Navegação'],['35','Oxigênio'],['73','Controle de combustível dos motores'],
    ['77','Indicação dos motores'],['78','Exaustão do motor (reversor)']];
  function buildVooTeste(){
    return `<div class="formdoc">
      ${cabecalho("<b>Formulário de Voo de Teste (Vistoria)</b>")}
      <div class="fsec">Aeronave e tripulação</div>
      <table class="ff"><tr><th>Matrícula</th><td><input></td><th>Modelo</th><td><input></td><th>Ano</th><td><input></td></tr>
        <tr><th>Nº Série</th><td><input></td><th>Comandante</th><td><input></td><th>Co-piloto</th><td><input></td></tr></table>
      <div class="fsec">Dados do voo de teste</div>
      <table class="ff"><tr><th>Data</th><td><input></td><th>DB Nº</th><td><input></td><th>Origem</th><td><input></td><th>Destino</th><td><input></td></tr>
        <tr><th>H. Decolagem</th><td><input></td><th>H. Pouso</th><td><input></td><th>H. Início teste</th><td><input></td><th>H. Fim teste</th><td><input></td></tr></table>
      <div class="fsec">Parâmetros observados</div>
      <table class="ff"><tr><th>Altitude</th><td><input></td><th>Temp. Ar Ext.</th><td><input></td><th>Veloc. Ind.</th><td><input></td></tr>
        <tr><th>Pres. Hid.</th><td><input></td><th>Pres. Oxigênio</th><td><input></td><th>P. Dif./Cabine</th><td><input></td></tr>
        <tr><th>Alt. Cabine</th><td><input></td><th>Fuel Flow</th><td><input></td><th></th><td></td></tr></table>
      <table class="ff grid"><tr><th>Motor</th><th>RPM/N1</th><th>RPM/N2</th><th>Pressão Óleo</th><th>Fuel Flow</th><th>Temp. Óleo</th><th>Amp. Gerador</th></tr>
        <tr><td>LH</td>${'<td><input></td>'.repeat(6)}</tr><tr><td>RH</td>${'<td><input></td>'.repeat(6)}</tr></table>
      <div class="fsec">Resultados do voo de teste (por sistema)</div>
      <table class="ff grid"><tr><th>ATA</th><th>Sistema</th><th>Operacional (Sim/Não)</th><th>Discrepâncias (Sim/Não)</th></tr>
        ${ATA_VOO.map(a=>`<tr><td style="text-align:center">${a[0]}</td><td>${a[1]}</td><td><input></td><td><input></td></tr>`).join('')}</table>
      <div class="fdecl">Declaro que os sistemas acima foram testados em voo. A aeronave foi considerada <b>OPERACIONAL</b>.</div>
      <table class="ff"><tr><th>Comandante</th><td><input></td><th>Cód. ANAC</th><td><input></td></tr></table>
      <div class="fsign"><div class="fsign-line">_______________________________________</div>Assinatura do Comandante</div>
      <div class="fsec">Relatório de discrepâncias do voo de teste</div>
      <table class="ff grid"><tr><th>ATA</th><th>Discrepância percebida</th></tr>${rows([1,2],5)}</table>
    </div>`;
  }

  window.JETFOR_FORMS = {
    ordem: ["rds","rsi","rdp","desig","trip","vooteste"],
    itens: {
      rds:  { label:"RDS — Dificuldade em Serviço (135.415)", docx:"formularios/JETFOR_Modelo_RDS_135415.docx", build:buildRDS },
      rsi:  { label:"RSI — Interrupção Mecânica (135.417)", docx:"formularios/JETFOR_Modelos_RSI_e_RDS.docx", build:buildRSI },
      rdp:  { label:"RDP — Discrepâncias Pendentes", docx:"https://drive.google.com/file/d/1UdVUO04yxhvYkhJA2N5nykbT_qpaAsRU/view", build:buildRDP },
      desig:{ label:"Designação de Inspetores", docx:"https://drive.google.com/file/d/14iJPbxtjxQ_vsJH3dDqGqfIWZRS2mSC0/view", build:buildDesig },
      trip: { label:"Lista de Tripulantes (135.429 d)", docx:"https://drive.google.com/file/d/1dsBxF-i36qqoKSaQeLROEoX7PqmL0emq/view", build:buildTrip },
      vooteste:{ label:"Voo de Teste (Vistoria)", docx:"https://drive.google.com/file/d/16VkNWSqm4FXzC0ziT4L4D9XmFI44_lBc/view", build:buildVooTeste }
    },
    outros: [
      { nome:"Empresas Contratadas (oficinas 145)", url:"https://drive.google.com/file/d/1DNyUwaqmPmKHd-xmFn7YG8gS_ZsTcLfp/view" },
      { nome:"MEL — Lista de Equipamentos Mínimos", url:"https://drive.google.com/file/d/1H-4tqnBAxoZAFXnh1sdBJeZnWCnbkyvs/view" }
    ]
  };
})();
