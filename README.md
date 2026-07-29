# JetFor · Mapa de Controle de Manutenção (PT-LJQ)

Mapa de manutenção **dinâmico**: atualize as horas/ciclos/pousos da célula e de cada
motor no cabeçalho e o app recalcula automaticamente **VENC** (vencimento) e **DISP**
(restante) de todas as tarefas — replicando as fórmulas da planilha original.
Permite **adicionar, editar e remover** tarefas. Backend em **Firebase Firestore**.

## Como funciona (arquitetura simples, sem build)

- `index.html` — interface
- `app.js` — lógica (cálculo VENC/DISP, filtros, edição)
- `data.js` — dados iniciais (migrados do Excel PT-LJQ) + logo
- `config.js` — sua configuração do Firebase (cole aqui)
- `vercel.json` — configuração de deploy

Site estático puro (HTML/JS). Não precisa de Node nem compilação.

## Modos de funcionamento

1. **Local** (padrão, sem configurar nada): salva no próprio navegador; botões *Exportar/Importar JSON*.
2. **Firebase** (nuvem, tempo real): assim que você preencher `config.js`, o app passa a salvar no Firestore automaticamente.

## Passo 1 — Conectar o Firebase

1. No [Firebase Console](https://console.firebase.google.com) → seu projeto → **Firestore Database** → *Criar banco de dados* (modo de produção).
2. Configurações do projeto → *Seus apps* → **Web** → copie o objeto `firebaseConfig`.
3. Cole os valores em **`config.js`**.
4. Regras do Firestore (para começar, acesso simples ao documento do mapa):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /mapas/{doc} { allow read, write: if true; }
     }
   }
   ```
   > ⚠️ Regra aberta é só para o teste inicial. Depois protegemos com login (Firebase Auth).

## Passo 2 — Subir no GitHub

```bash
git init
git add .
git commit -m "JetFor: mapa de manutenção dinâmico (Fase 2)"
git branch -M main
git remote add origin https://github.com/<SEU_USUARIO>/jetfor-mapa.git
git push -u origin main
```

## Passo 3 — Publicar na Vercel

1. [vercel.com](https://vercel.com) → *Add New… → Project* → importe o repositório `jetfor-mapa`.
2. Framework Preset: **Other** (site estático). Não precisa de comando de build.
3. **Deploy**. Pronto — a Vercel dá a URL pública.

Cada `git push` novo publica automaticamente.

---
Jet For Aviation Ltda · Direção de Manutenção
