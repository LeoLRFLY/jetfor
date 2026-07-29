# JetFor · Controle de Manutenção — Documento de Contexto do Projeto

> Documento vivo. Atualizado a cada avanço. Última atualização: 29/07/2026.

## 1. Visão geral

Portal web (PWA) para a **JetFor** controlar a manutenção e a aeronavegabilidade
continuada da frota. Substitui/complementa a planilha Excel de mapa de manutenção,
tornando-a **dinâmica** (recalcula sozinha), e reúne num só lugar: frota, obrigações
normativas (SASC/PMAC), mapa dinâmico do PT-LJQ, diretrizes/boletins e formulários.

- **Repositório GitHub:** `LeoLRFLY/jetfor` (branch `main`)
- **Pasta local:** `~/Downloads/jetfor-mapa`
- **Hospedagem:** Vercel (deploy automático a cada `git push`)
- **Backend:** Firebase Firestore — projeto `jetfor-23189`, coleção `mapas`, doc `PT-LJQ`
- **Tipo:** site estático (HTML/CSS/JS puro, sem build) + Firebase via CDN (compat SDK)

## 2. Contexto da empresa

- **Razão social:** JETFOR TÁXI AÉREO LTDA. *(confirmar — o MGM cita "Jet For Aviation Ltda")*
- **CNPJ:** 01.274.847/0001-27 · **COA:** 2007-07-2CHQ-02-02
- **Endereço:** Praça Brigadeiro Eduardo Gomes, s/n – Hangar (TAG) – Fortaleza/CE
- **Diretor de Manutenção:** Leonardo Filipe de Araujo · Cód. ANAC 133125 · CREA 1713750589
- **Regulação:** RBAC 135 (táxi aéreo). SASC/PMAC conforme MGM Rev 9.01 e IS 120-016.

### Modelo operacional (decisão-chave)
A JetFor é **operadora** e faz o **CONTROLE** da aeronavegabilidade continuada (papel tipo
CAMO). **Não executa manutenção**: não possui ferramental nem estoque próprios. Toda a
manutenção prática (serviços, calibrações, inspeções físicas, pesagem) é executada por
**oficinas certificadas RBAC 145 contratadas** — a JetFor programa, controla prazos, exige
comprovantes e audita fornecedores.

## 3. Arquitetura e arquivos

```
jetfor-mapa/
├── index.html        # interface (todas as seções) + CSS
├── app.js            # lógica principal (estado, cálculo, render, Firebase)
├── config.js         # firebaseConfig (projeto jetfor-23189)
├── data.js           # seed do mapa PT-LJQ (contadores + 139 tarefas) + logo base64
├── seed.json         # cópia dos dados do mapa (referência)
├── dash_data.js      # frota + atividades/frequências + "como fazer" (dashboard)
├── freq_data.js      # dados das Obrigações MGM (frota, matriz, aplicabilidade, metodologia)
├── da_data.js        # DA e Boletins (extraídos do Excel) — célula, motor 1, motor 2
├── iio_data.js       # Itens de Inspeção Obrigatória (MGM 8.4.13) — lista + o que é/não é
├── forms.js          # formulários preenchíveis (RDS, RSI) + links dos outros
├── manifest.webmanifest, sw.js, favicon.ico, icons/   # PWA
├── formularios/      # modelos .docx (RDS, RSI)
├── vercel.json, README.md, .gitignore
└── CONTEXTO_PROJETO.md  # este documento
```

## 4. Seções do site (navegação)

1. **🏠 Início (Dashboard)** — KPIs da frota; cards de aeronave (SASC/não-SASC, TCDS,
   assentos, enquadramento) com **adicionar/editar/remover**; o card do **PT-LJQ** é
   clicável e abre o mapa. Tabela **Atividades & Frequências** com coluna **Responsável**
   (JetFor × Oficina 145), filtros e linhas **expansíveis** com o "como fazer" de cada
   atividade (incl. IIO detalhado, procedimento AD/DA+SB, RDS e RSI).
2. **🛠 Mapa de Manutenção (PT-LJQ)** — contadores editáveis (Célula horas/pousos/ciclos,
   Motor 1, Motor 2, Hélice) que recalculam **VENC** e **DISP** de 139 tarefas ao vivo;
   adicionar/editar/remover tarefa; status colorido; busca, filtros, KPIs, impressão A4.
   Sub-abas: **Mapa · DA Célula · DA Motor 1 · DA Motor 2 · BOL Motor 1 · BOL Motor 2**.
3. **📋 Obrigações MGM (SASC/PMAC)** — frota e enquadramento, matriz de atividades por
   aeronave, aplicabilidade (10 elementos do PMAC) e metodologia.
4. **📝 Formulários** — RDS (135.415) e RSI (135.417) **preenchíveis e imprimíveis** +
   modelos .docx; links dos demais formulários no Drive.

## 5. Modelo de dados

**Estado (`STATE`)** — salvo em localStorage e no Firestore (`mapas/PT-LJQ`):
`{ aeronave, contadores, tarefas, hoje, frota }`

- **Contadores:** `celula_horas/pousos/ciclos`, `motor1_horas/ciclos`, `motor2_horas/ciclos`, `helice_horas`
- **Tarefa:** `{ id, grupo, nome, pn, sn, obs, base, intervalo, exec, vencFixo, motor, cal }`
  - `base` ∈ contadores acima ou `calendario`
  - **Cálculo:** `VENC = exec + intervalo` (ou `vencFixo`); `DISP = VENC − contador`.
    Calendário: `VENC = exec + meses`; `DISP = dias até hoje`. Dual-limite: pior caso.
  - Status: vencido (DISP<0), próximo (DISP≤limiar), em dia.
- **Aeronave (frota):** `{ mat, modelo, fab, tcds, assentos, enq, sasc, obs, mapa }`
  - `sasc` é derivado do enquadramento: `135.411(a)(2)` ⇒ SASC; `(a)(1)` ⇒ não.

## 6. Decisões técnicas/normativas importantes

- **Classificação SASC pelo TCDS** (assentos certificados, excluindo piloto): 10+ ⇒
  135.411(a)(2) ⇒ SASC/PMAC. **Não** pelo prefixo da matrícula.
- **Contadores de motor** foram semeados como "equivalentes de célula" (reproduzem o Excel
  exatamente hoje). Editar o contador de um motor move todas as tarefas daquele motor. Para
  usar o **TSN real** de cada motor, faremos uma reancoragem (1 número por motor).
- **Fidelidade do Excel:** os EXEC foram ancorados ao VENC da planilha → VENC/DISP no
  carregamento batem exatamente com o Excel (0 divergências).
- **BOL Motor 1/2:** vieram do Excel com **dados de outra aeronave** (template) — sinalizado
  no site; substituir pelos boletins reais do S550.

## 7. Estado do deploy

- **GitHub:** repositório criado (`LeoLRFLY/jetfor`), 1º push feito no setup inicial.
  As atualizações seguintes estão **gravadas na pasta local** e são publicadas com
  `git add . && git commit && git push` (⚠️ confirmar se os pushes recentes foram feitos).
- **Vercel:** importar/estar conectado ao repositório → deploy automático. *(confirmar URL)*
- **Firebase:** `config.js` preenchido (jetfor-23189). **Pendente:** publicar as **regras do
  Firestore** (senão o banco bloqueia leitura/escrita) e confirmar que está salvando na nuvem.

## 8. Roadmap / pendências

- [ ] Publicar regras do Firestore + confirmar salvamento na nuvem
- [ ] Confirmar push e URL pública da Vercel
- [ ] Proteger o Firebase com login (Auth) — hoje as regras estão abertas p/ teste
- [ ] Tornar preenchíveis os demais formulários: RDP, Designação de Inspetores, Voo de
      Teste, Lista de Tripulantes (Empresas Contratadas e MEL como referência)
- [ ] Reancorar contadores de motor com TSN real (Motor 1 e Motor 2)
- [ ] Confirmar TCDS/assentos de C90, C90A, Hawker 400A e Phenom 300 (matrícula PR-LJA?)
- [ ] Substituir dados das abas BOL Motor 1/2 pelos boletins reais do S550
- [ ] Mapas das demais aeronaves (hoje só o PT-LJQ tem mapa)

## 9. Perguntas em aberto

- **Razão social exata:** "JETFOR TÁXI AÉREO LTDA." (formulários) × "Jet For Aviation Ltda"
  (MGM) — precisa bater com o registro/CNPJ.
- **"FADT":** o MGM não usa essa sigla; o formulário oficial de cumprimento de DA é a
  **FCDA (Formulário 8.4.8)**. Confirmar se FADT = FCDA ou outro documento.

## 10. Itens paralelos (fora do site)

- **Textron PIA Account Application:** PDF preenchido com os dados da JetFor (não assinado).
  Faltam: CEP, telefone, sócio(s), contato do financeiro; confirmar razão social e se inclui
  as Beechcraft/Hawker no cadastro. Retorno para `customeraccounting@txtav.com`.

## 11. Histórico de mudanças (changelog)

- **29/07 (2)** — **Correção normativa importante:** a ANAC (resposta Fala.BR, protocolo
  50001.154292/2026-13) confirmou que o **SDR/SACI foi descontinuado em 01/06/2023**; os
  reportes de dificuldade em serviço (RDS) e demais reportes de segurança operacional agora
  vão pelo **Portal Único de Notificação** (santosdumont.anac.gov.br). Atualizado no RDS
  (formulário e "como fazer"). Dúvidas ANAC: pac@anac.gov.br. Também: RDP, Designação de
  Inspetores, Lista de Tripulantes (135.429 d) e Voo de Teste agora são **formulários
  preenchíveis** na aba Formulários (total de 6).
- **29/07** — Documento de contexto criado. Frota dinâmica (add/editar/remover) + PP-LCB
  removido do escopo. Aba Formulários (RDS/RSI preenchíveis + .docx). IIO detalhado do MGM,
  procedimento AD/DA+SB (FCDA), RDS/RSI a partir dos modelos oficiais. PWA (ícones + offline
  + responsivo). Coluna S/N reduzida. Página inicial (dashboard) com card do PT-LJQ clicável.
  DA/Boletins como sub-abas do mapa. Obrigações MGM. Mapa dinâmico (139 tarefas, contadores
  separados de motor/hélice). Deploy GitHub + Vercel + Firebase configurado.
