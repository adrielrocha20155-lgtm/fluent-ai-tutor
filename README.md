# FluentAI — Tutor de Inglês 1-on-1 Adaptativo (Gemini Live API)

Plataforma interativa de tutoria de inglês em tempo real por voz, inspirada em aulas particulares estilo **Preply**, fundamentada nas metodologias **CLT, PPP, ESA, TBL** e nos pilares de **Stephen Krashen** (*Comprehensible Input $i+1$* e *Filtro Afetivo*).

---

## Visão Geral & Recursos Principais

- **Tutoria por Voz em Tempo Real (Gemini Live API)**: Conversação full-duplex de baixa latência via WebSocket com áudio nativo e transcrição ao vivo recolhível.
- **Currículo Estruturado CEFR (A1 ao C2)**: 60 aulas progressivas organizadas por nível (`A1` a `C2`) e módulos (*Grammar & Foundation*, *Functional Communication*, *Fluency & Pragmatics*), com foco aprofundado a partir do nível A2.
- **Prática Livre / Roleplay**: Crie qualquer cenário personalizado (entrevista de TI, viagens, reuniões técnicas, conversa casual) mantendo a condução pedagógica do professor.
- **Loop Adaptativo & Banco de Dados (SQLite)**:
  - Toda aula gera um relatório estruturado pós-sessão (*O que você fez bem*, comparativo *"Você disse" vs. "Forma natural"*, tarefa de 5 minutos e tags de dificuldade).
  - A IA estima continuamente seu nível CEFR (`0–100`) e injeta seus pontos fracos recorrentes no prompt da próxima aula.
- **Flashcards com Revisão Espaçada (Estilo Anki / SM-2)**:
  - Geração automática de flashcards de recordação ativa a partir dos seus erros reais salvos no SQLite, com algoritmo SM-2 (*Errei*, *Difícil*, *Bom*, *Fácil*).

---

## Stack & Arquitetura

- **Frontend**: Vanilla JavaScript (Web Components), Vite, Web Audio API, WebSockets, CSS Design System próprio (Dark/Light mode).
- **Backend**: Python 3.10+, FastAPI, Uvicorn, `google-genai` SDK, SQLite (`data/learning.db` criado automaticamente em tempo de execução).

```text
.
├── index.html                  # Entrada HTML
├── start-app.bat               # Atalho de inicialização rápida (Windows)
├── requirements.txt            # Dependências Python
├── package.json                # Dependências Frontend (Vite)
├── .env.example                # Modelo de variáveis de ambiente
├── scripts/
│   ├── dev.ps1                 # Inicialização conjunta Backend + Frontend (Windows)
│   ├── dev.sh                  # Inicialização conjunta (Linux/macOS)
│   └── install.sh              # Instalação de dependências (Linux/macOS)
├── server/
│   ├── main.py                 # API FastAPI, WebSocket proxy & avaliação pós-aula
│   ├── gemini_live.py          # Cliente Gemini Live API (API Key ou Vertex AI)
│   ├── db.py                   # Persistência SQLite (logs, perfil CEFR & flashcards SM-2)
│   └── ...
└── src/
    ├── style.css               # Design System (Dark/Light, semântica, responsividade)
    ├── data/lessons.json       # Grade curricular CEFR A1–C2 (60 aulas)
    └── components/             # Web Components (Splash, Dashboard, Sala de Aula, Feedback, Flashcards)
```

---

## Pré-requisitos

- **Node.js** v18+
- **Python** v3.10+
- Uma chave de API do **[Google AI Studio](https://aistudio.google.com/)** (`GEMINI_API_KEY`) **ou** projeto Google Cloud com Vertex AI habilitado.

---

## Instalação e Execução Passo a Passo

### 1. Clonar o repositório
```bash
git clone https://github.com/adrielrocha20155-lgtm/fluent-ai-tutor.git
cd fluent-ai-tutor
```

### 2. Configurar variáveis de ambiente
Copie o arquivo de exemplo e preencha sua chave `GEMINI_API_KEY`:
```bash
# Windows (PowerShell)
Copy-Item .env.example .env

# Linux / macOS
cp .env.example .env
```
Edite o `.env` e substitua `your_api_key_here` pela sua chave do Google AI Studio.

### 3. Instalar dependências

**Windows (PowerShell):**
```powershell
npm install
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
```

**Linux / macOS:**
```bash
./scripts/install.sh
```

### 4. Iniciar a aplicação

**Windows:**
Dê um duplo clique em `start-app.bat` ou execute:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

**Linux / macOS:**
```bash
./scripts/dev.sh
```

Acesse **`http://localhost:5173/`** no navegador.
