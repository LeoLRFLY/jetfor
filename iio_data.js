window.JETFOR_IIO = {
  "definicao": "IIO (Itens de Inspeção Obrigatória) são inspeções feitas para prevenir falhas, maus funcionamentos ou defeitos que possam comprometer a operação segura da aeronave, causados por: (a) manutenção executada de forma imprópria, ou (b) instalação incorreta de partes e materiais. A lista da Jet For está no Formulário 8.4.13 do MGM. Responsável pelo cumprimento: Diretor de Manutenção.",
  "regraOuro": "A inspeção do IIO deve ser feita por um INSPETOR qualificado e autorizado, DIFERENTE do mecânico que executou o serviço (dupla inspeção). A aeronave só retorna ao serviço quando TODOS os IIO forem inspecionados com resultado satisfatório.",
  "codigos": [
    { "c": "A", "t": "Ok para instalar / Ok para fechar — inspecionar o componente ou a zona antes da instalação/fechamento." },
    { "c": "B", "t": "Verificação de torque — o inspetor observa o torque apropriado durante a instalação ou ajuste." },
    { "c": "C", "t": "Rigging — verificar se a rigagem foi aplicada corretamente e dentro das tolerâncias, com inspeção visual da zona ajustada." },
    { "c": "D", "t": "Teste operacional, funcional ou de vazamento — quando o fabricante exigir; registrar na ordem de serviço." },
    { "c": "E", "t": "Documentação — na pesagem, verificar o cumprimento dos procedimentos aplicáveis." }
  ],
  "sistemas": [
    { "sis": "Pesagem (Leveling & Weighting)", "itens": [ ["Scale Reading (leitura de balança)", "E"] ] },
    { "sis": "Piloto Automático", "itens": [ ["Servo do piloto automático", "B, D"] ] },
    { "sis": "Energia Elétrica", "itens": [ ["Bateria principal", "A"], ["Bateria de emergência", "A"] ] },
    { "sis": "Proteção contra Fogo", "itens": [ ["Garrafa de incêndio do motor", "A"], ["Squib da garrafa de incêndio", "A"], ["Válvulas seletoras", "D"], ["Detectores de fogo", "D"], ["Painel de controle de fogo", "D"] ] },
    { "sis": "Controles de Voo", "itens": [ ["Manche / Control Column", "A, B, C, D"], ["Aileron e compensador", "A, B, C, D"], ["Comandos do aileron", "B, C, D"], ["Profundor e compensador", "A, B, C, D"], ["Comandos do profundor", "B, C, D"], ["Leme e compensadores", "A, B, C, D"], ["Comandos do leme", "B, C, D"], ["Flap / atuadores", "A, B, C, D"], ["Estabilizador horizontal / atuador", "A, B, C, D"], ["Spoilers de voo e solo / atuador", "A, B, C, D"] ] },
    { "sis": "Combustível", "itens": [ ["Tanque de combustível — manutenção interna / painéis de acesso", "A, D"] ] },
    { "sis": "Trem de Pouso", "itens": [ ["Atuadores do trem", "A, B, C, D"], ["Conjunto do trem", "A, B, C, D"], ["Amortecedor (strut/oleo)", "B, D"], ["Controle do sistema de trem", "D"], ["Gear swings (normal / emergência)", "D"], ["Portas do trem (nariz e principal)", "C, D"], ["Componentes de sequenciamento do trem", "C, D"] ] },
    { "sis": "Navegação", "itens": [ ["Sistema Pitot / Estático", "D"], ["Air Data Computers / módulo", "D"] ] },
    { "sis": "Portas", "itens": [ ["Portas pressurizadas", "C, D"], ["Saída de emergência", "C, D"], ["Mecanismos de abertura/fechamento da porta pressurizada", "C, D"], ["Sistema de aviso da porta pressurizada", "C, D"] ] },
    { "sis": "Estrutura", "itens": [ ["Reparo/substituição maior de estrutura primária", "A, B"], ["Estrutura primária em compósito", "A, B"] ] },
    { "sis": "Naceles & Pilones", "itens": [ ["Reparo/substituição maior de estrutura primária", "A, B"] ] },
    { "sis": "Estabilizador", "itens": [ ["Reparo/substituição maior de estrutura primária", "A, B"], ["Estabilizador horizontal", "A, B, C, D"] ] },
    { "sis": "Janelas", "itens": [ ["Janelas da cabine de comando", "A, B"] ] },
    { "sis": "Asas", "itens": [ ["Reparo/substituição maior de estrutura primária", "A, B"], ["Winglets", "A, B"] ] },
    { "sis": "Grupo Motopropulsor (Power Plant)", "itens": [ ["Instalação do motor", "A, B, D"], ["Conjunto do motor", "B"], ["Berço do motor / isolador de vibração", "A, B"] ] },
    { "sis": "Motor (Engine)", "itens": [ ["Spinner", "A, B, D"], ["Inlet fan", "A, D"], ["Módulos do compressor", "A, D"], ["Módulos da turbina", "A, D"], ["Exhaust case", "A, D"] ] },
    { "sis": "Controle de Combustível do Motor", "itens": [ ["HMU / FMU", "A, B, D"], ["Bomba de combustível de alta pressão", "A, B, D"] ] },
    { "sis": "Controle do Motor", "itens": [ ["Comandos do motor", "D"], ["FADEC / EEC / DEEC", "D"] ] },
    { "sis": "Escapamento", "itens": [ ["Reversor de empuxo", "A, C, D"], ["Travas do reversor", "C, D"] ] }
  ],
  "naoIIO": [
    "Testes funcionais/operacionais feitos como parte de uma inspeção programada, sem remover/reinstalar o componente.",
    "Controles de voo: abrir drenos ou fazer serviços que NÃO perturbem a rigagem.",
    "Combustível: remover/instalar componentes externos acessáveis do tanque (probes de quantidade, boost pump, drenos), desde que não se danifiquem painéis selados adicionais.",
    "Trem de pouso: servicing, troca de rodas/freios, ou extensão/retração feita apenas para teste de vazamento, sangria ou troca de linha hidráulica — sem perturbar a rigagem.",
    "Pitot-estático: apenas abrir os drenos do sistema.",
    "Saídas de emergência: remoção/reinstalação por conveniência da manutenção."
  ],
  "viraIIO": [
    "Quando o componente é removido da aeronave e depois reinstalado ou reconectado.",
    "Qualquer distúrbio na rigagem dos controles de voo, ou reparo/substituição de linhas hidráulicas e conectores elétricos ligados aos controles PRIMÁRIOS de voo.",
    "Dano a painéis selados adicionais do tanque de combustível durante o serviço.",
    "Qualquer distúrbio na rigagem do trem de pouso, ou perturbação que exija teste funcional do sistema de extensão/retração ou do indicador de posição.",
    "Perturbação do sistema pitot-estático que exija teste ou substituição de componente."
  ]
};
