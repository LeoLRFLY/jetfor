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
      ${cabecalho("<b>Relatório de Dificuldade em Serviço — RDS</b><br>RBAC 135.415 · envio por evento (sistema SDR — gov.br/ANAC)")}
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
      <div class="fobs">Observação: confirme o canal e o prazo vigentes de submissão (sistema SDR / GTOA) com o Responsável Técnico antes do envio.</div>
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

  window.JETFOR_FORMS = {
    ordem: ["rds","rsi"],
    itens: {
      rds: { label:"RDS — Dificuldade em Serviço (135.415)", docx:"formularios/JETFOR_Modelo_RDS_135415.docx", build:buildRDS },
      rsi: { label:"RSI — Interrupção Mecânica (135.417)", docx:"formularios/JETFOR_Modelos_RSI_e_RDS.docx", build:buildRSI }
    },
    outros: [
      { nome:"RDP — Relatório de Discrepâncias Pendentes", url:"https://drive.google.com/file/d/1UdVUO04yxhvYkhJA2N5nykbT_qpaAsRU/view" },
      { nome:"Designação de Inspetores", url:"https://drive.google.com/file/d/14iJPbxtjxQ_vsJH3dDqGqfIWZRS2mSC0/view" },
      { nome:"Formulário de Voo de Teste (Vistoria)", url:"https://drive.google.com/file/d/16VkNWSqm4FXzC0ziT4L4D9XmFI44_lBc/view" },
      { nome:"Lista de Tripulantes autorizados (135.429 d)", url:"https://drive.google.com/file/d/1dsBxF-i36qqoKSaQeLROEoX7PqmL0emq/view" },
      { nome:"Empresas Contratadas (oficinas 145)", url:"https://drive.google.com/file/d/1DNyUwaqmPmKHd-xmFn7YG8gS_ZsTcLfp/view" },
      { nome:"MEL — Lista de Equipamentos Mínimos", url:"https://drive.google.com/file/d/1H-4tqnBAxoZAFXnh1sdBJeZnWCnbkyvs/view" }
    ]
  };
})();
