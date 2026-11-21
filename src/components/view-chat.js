import "./audio-visualizer.js";
import "./live-transcript.js";
import {
  GeminiLiveAPI,
  MultimodalLiveResponseType,
  FunctionCallDefinition,
} from "../lib/gemini-live/geminilive.js";
import { AudioStreamer, AudioPlayer } from "../lib/gemini-live/mediaUtils.js";

class ViewChat extends HTMLElement {
  constructor() {
    super();
    this._mission = null;
    this.transcriptHistory = [];
    this.currentInputChunk = "";
    this.currentOutputChunk = "";
    this.sessionStartTime = null;
    this.missionCompleted = false;
    this.isActive = false;
    this.isMuted = false;
    this.showTranscript = true;
    this.slowMode = false;
    this.audioState = "idle"; // idle | connecting | listening | thinking | speaking | error
    this._keyHandler = null;
  }

  set mission(value) {
    this._mission = value;
    this.render();
  }

  set language(value) {
    this._language = value;
  }

  set fromLanguage(value) {
    this._fromLanguage = value;
  }

  set mode(value) {
    this._mode = value;
  }

  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {
    if (this._keyHandler) {
      window.removeEventListener("keydown", this._keyHandler);
      this._keyHandler = null;
    }
    if (this.audioStreamer) this.audioStreamer.stop();
    if (this.client) this.client.disconnect();
    if (this.audioPlayer) this.audioPlayer.interrupt();
  }

  _flushTranscriptChunks() {
    if (this.currentInputChunk.trim()) {
      this.transcriptHistory.push({ speaker: "Student", text: this.currentInputChunk.trim() });
      this.currentInputChunk = "";
    }
    if (this.currentOutputChunk.trim()) {
      this.transcriptHistory.push({ speaker: "Tutor", text: this.currentOutputChunk.trim() });
      this.currentOutputChunk = "";
    }
  }

  _setAudioState(state, customMsg = "") {
    this.audioState = state;
    const orb = this.querySelector("#voice-orb");
    const badge = this.querySelector("#orb-state-label");
    const reconnectWrap = this.querySelector("#reconnect-wrap");
    if (!orb || !badge) return;

    orb.className = `voice-orb state-${state}`;
    const labels = {
      idle: "Pronto para começar",
      connecting: "Conectando com o tutor...",
      listening: "Ouvindo você (microfone ativo)",
      muted: "Microfone mutado (Espaço para falar)",
      thinking: "Tutor pensando...",
      speaking: "Tutor falando...",
      error: customMsg || "Conexão interrompida",
    };
    badge.textContent = customMsg || labels[state] || "";
    badge.className = `state-pill pill-${state}`;

    if (reconnectWrap) {
      reconnectWrap.style.display = state === "error" ? "flex" : "none";
    }
  }

  render() {
    if (!this._mission) return;

    const isTutorMode = this._mode === "preply_tutor" || this._mode === "immergo_teacher";
    this.showTranscript = isTutorMode;

    const levelBadge = this._mission.level || "Free";
    const methodBadge = this._mission.methodology || "CLT";
    const objectives = this._mission.objectives || [];

    this.innerHTML = `
      <style>
        .classroom-shell {
          height: calc(100vh - 64px);
          max-width: 1120px;
          margin: 0 auto;
          padding: 8px 24px 16px 24px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 12px;
        }

        .classroom-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .back-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: var(--radius-md);
          background: var(--color-surface);
          color: var(--color-text-main);
          border: var(--glass-border);
          font-size: 0.85rem;
          font-weight: 700;
        }
        .back-pill:hover { border-color: var(--color-accent-secondary); }

        .classroom-main {
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          align-items: stretch;
        }

        .classroom-main.no-transcript {
          grid-template-columns: 1fr;
        }

        @media (max-width: 860px) {
          .classroom-shell { height: auto; min-height: calc(100vh - 64px); }
          .classroom-main { grid-template-columns: 1fr; }
        }

        .orb-stage {
          background: var(--color-surface);
          border: var(--glass-border);
          border-radius: var(--radius-lg);
          padding: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          position: relative;
        }

        .voice-orb {
          width: 112px;
          height: 112px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.2rem;
          background: var(--color-surface-elevated);
          border: 2px solid rgba(255, 255, 255, 0.12);
          transition: all 0.3s ease;
        }

        .voice-orb.state-connecting {
          border-color: var(--color-warning);
          animation: orbPulse 1.2s infinite ease-in-out;
        }
        .voice-orb.state-listening {
          border-color: var(--color-success);
          box-shadow: 0 0 0 8px rgba(34, 197, 94, 0.12), 0 0 28px rgba(34, 197, 94, 0.25);
          animation: orbBreathe 2s infinite ease-in-out;
        }
        .voice-orb.state-muted {
          border-color: var(--color-text-muted);
          opacity: 0.7;
        }
        .voice-orb.state-thinking {
          border-color: var(--color-warning);
          box-shadow: 0 0 0 8px rgba(245, 158, 11, 0.14);
          animation: orbPulse 0.9s infinite ease-in-out;
        }
        .voice-orb.state-speaking {
          border-color: var(--color-accent-secondary);
          box-shadow: 0 0 0 10px rgba(52, 211, 153, 0.18), 0 0 36px rgba(52, 211, 153, 0.35);
          animation: orbSpeak 0.7s infinite alternate ease-in-out;
        }
        .voice-orb.state-error {
          border-color: var(--color-danger);
          box-shadow: 0 0 0 8px rgba(251, 113, 133, 0.14);
        }

        @keyframes orbBreathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes orbPulse {
          0%, 100% { transform: scale(0.97); opacity: 0.85; }
          50% { transform: scale(1.04); opacity: 1; }
        }
        @keyframes orbSpeak {
          0% { transform: scale(1); }
          100% { transform: scale(1.09); }
        }

        .state-pill {
          padding: 6px 14px;
          border-radius: 999px;
          font-size: 0.84rem;
          font-weight: 700;
          background: var(--color-surface-elevated);
          color: var(--color-text-sub);
        }
        .pill-listening { background: var(--color-success-bg); color: var(--color-success); }
        .pill-thinking, .pill-connecting { background: var(--color-warning-bg); color: var(--color-warning); }
        .pill-speaking { background: rgba(var(--color-accent-primary-rgb), 0.2); color: var(--color-accent-secondary); }
        .pill-error { background: var(--color-danger-bg); color: var(--color-danger); }

        .transcript-pane {
          background: var(--color-surface);
          border: var(--glass-border);
          border-radius: var(--radius-lg);
          display: flex;
          flex-direction: column;
          min-height: 220px;
          overflow: hidden;
        }

        .call-bar {
          background: var(--color-surface);
          border: var(--glass-border);
          border-radius: var(--radius-lg);
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .ctrl-btn {
          padding: 10px 16px;
          border-radius: var(--radius-md);
          background: var(--color-surface-elevated);
          color: var(--color-text-main);
          border: var(--glass-border);
          font-size: 0.86rem;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .ctrl-btn:hover { border-color: var(--color-accent-secondary); }
        .ctrl-btn.is-muted { background: var(--color-danger-bg); color: var(--color-danger); border-color: var(--color-danger); }
        .ctrl-btn.is-end { background: #dc2626; color: #ffffff; border: none; }
        .ctrl-btn.is-end:hover { background: #b91c1c; }
      </style>

      <div class="classroom-shell">
        <!-- Top Lesson Bar -->
        <div class="classroom-topbar">
          <button id="back-to-missions" class="back-pill" aria-label="Voltar ao Dashboard">
            <span>←</span>
            <span>Voltar às Aulas</span>
          </button>

          <div style="text-align: center; flex: 1; min-width: 240px;">
            <div style="display: flex; justify-content: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap;">
              <span style="font-size: 0.72rem; font-weight: 800; padding: 2px 8px; border-radius: 999px; background: rgba(var(--color-accent-primary-rgb), 0.2); color: var(--color-accent-secondary);">${levelBadge}</span>
              <span style="font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--color-surface-elevated); color: var(--color-text-sub);">${methodBadge}</span>
              <span style="font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--color-surface-elevated); color: var(--color-text-sub);">${this._fromLanguage || "Portuguese"} ➔ ${this._language || "English"}</span>
            </div>
            <h2 style="margin: 0; font-size: 1.2rem;">${this._mission.title}</h2>
          </div>

          <button id="toggle-transcript-btn" class="ctrl-btn" title="Mostrar ou ocultar transcrição (modo listening)">
            <span>${this.showTranscript ? "🎧 Ocultar Texto" : "📝 Ver Transcrição"}</span>
          </button>
        </div>

        <!-- Objectives Strip -->
        ${objectives.length ? `
          <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 6px;">
            ${objectives.map(obj => `
              <span style="font-size: 0.75rem; padding: 4px 10px; border-radius: 999px; background: var(--color-surface); border: var(--glass-border); color: var(--color-text-sub);">
                🎯 ${obj}
              </span>
            `).join("")}
          </div>
        ` : ""}

        <!-- Main Classroom Area -->
        <div id="classroom-main" class="classroom-main ${this.showTranscript ? "" : "no-transcript"}">
          <!-- Voice Orb & Visualizers -->
          <div class="orb-stage">
            <div style="width: 100%; height: 46px;">
              <audio-visualizer id="model-viz"></audio-visualizer>
            </div>

            <div id="voice-orb" class="voice-orb state-idle">🎙️</div>
            <div id="orb-state-label" class="state-pill">Pronto para começar</div>

            <div id="reconnect-wrap" style="display: none; gap: 8px; align-items: center;">
              <button id="reconnect-btn" class="btn-primary" style="padding: 8px 16px; font-size: 0.85rem;">🔄 Reconectar Sessão</button>
            </div>

            <div style="width: 100%; height: 46px;">
              <audio-visualizer id="user-viz"></audio-visualizer>
            </div>
          </div>

          <!-- Collapsible Live Transcript -->
          <div id="transcript-pane" class="transcript-pane" style="display: ${this.showTranscript ? "flex" : "none"};">
            <div style="padding: 10px 14px; border-bottom: var(--glass-border); font-size: 0.78rem; font-weight: 700; color: var(--color-text-muted); display: flex; justify-content: space-between;">
              <span>TRANSCRIÇÃO AO VIVO</span>
              <span>Modo ${isTutorMode ? "Preply Tutor" : "Imersivo"}</span>
            </div>
            <div style="flex: 1; min-height: 0; position: relative;">
              <live-transcript></live-transcript>
            </div>
          </div>
        </div>

        <!-- Fixed Bottom Video-Call Control Bar -->
        <div class="call-bar">
          <button id="start-call-btn" class="btn-primary" style="padding: 12px 28px; font-size: 1rem;">
            🎙️ Iniciar Aula 1-on-1
          </button>

          <div id="active-controls" style="display: none; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center;">
            <button id="mute-btn" class="ctrl-btn" title="Atalho: Barra de Espaço">
              <span>🎤 Microfone Ativo (Espaço)</span>
            </button>
            <button id="hint-btn" class="ctrl-btn">
              <span>💡 Pedir Dica / Traduzir</span>
            </button>
            <button id="speed-btn" class="ctrl-btn">
              <span>🐢 Velocidade: Normal</span>
            </button>
            <button id="end-call-btn" class="ctrl-btn is-end">
              <span>⏹ Encerrar e Gerar Feedback</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const userViz = this.querySelector("#user-viz");
    const modelViz = this.querySelector("#model-viz");
    const backBtn = this.querySelector("#back-to-missions");
    const toggleTranscriptBtn = this.querySelector("#toggle-transcript-btn");
    const transcriptPane = this.querySelector("#transcript-pane");
    const mainGrid = this.querySelector("#classroom-main");
    const startBtn = this.querySelector("#start-call-btn");
    const activeControls = this.querySelector("#active-controls");
    const muteBtn = this.querySelector("#mute-btn");
    const hintBtn = this.querySelector("#hint-btn");
    const speedBtn = this.querySelector("#speed-btn");
    const endBtn = this.querySelector("#end-call-btn");
    const reconnectBtn = this.querySelector("#reconnect-btn");

    const cleanupMedia = () => {
      if (this.audioStreamer) this.audioStreamer.stop();
      if (this.client) this.client.disconnect();
      if (this.audioPlayer) this.audioPlayer.interrupt();
      if (userViz?.disconnect) userViz.disconnect();
      if (modelViz?.disconnect) modelViz.disconnect();
    };

    backBtn.addEventListener("click", () => {
      cleanupMedia();
      this.dispatchEvent(new CustomEvent("navigate", {
        bubbles: true,
        detail: { view: "missions" },
      }));
    });

    toggleTranscriptBtn.addEventListener("click", () => {
      this.showTranscript = !this.showTranscript;
      transcriptPane.style.display = this.showTranscript ? "flex" : "none";
      mainGrid.classList.toggle("no-transcript", !this.showTranscript);
      toggleTranscriptBtn.innerHTML = `<span>${this.showTranscript ? "🎧 Ocultar Texto" : "📝 Ver Transcrição"}</span>`;
    });

    const toggleMute = () => {
      if (!this.isActive || !this.audioStreamer) return;
      this.isMuted = !this.isMuted;
      this.audioStreamer.setMuted(this.isMuted);
      muteBtn.classList.toggle("is-muted", this.isMuted);
      muteBtn.innerHTML = this.isMuted
        ? "<span>🔇 Mutado (Espaço)</span>"
        : "<span>🎤 Microfone Ativo (Espaço)</span>";
      if (this.isMuted) {
        this._setAudioState("muted");
      } else if (this.audioState === "muted") {
        this._setAudioState("listening");
      }
    };

    muteBtn.addEventListener("click", toggleMute);

    if (this._keyHandler) window.removeEventListener("keydown", this._keyHandler);
    this._keyHandler = (e) => {
      if (e.code === "Space" && this.isActive && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        toggleMute();
      }
    };
    window.addEventListener("keydown", this._keyHandler);

    hintBtn.addEventListener("click", () => {
      if (!this.client?.connected) return;
      this._setAudioState("thinking", "Pedindo dica ao tutor...");
      this.client.sendTextMessage(
        `I'm a bit stuck. Please give me a quick hint or natural phrase in ${this._language || "English"} with a brief explanation in ${this._fromLanguage || "Portuguese"}, then let me continue.`
      );
    });

    speedBtn.addEventListener("click", () => {
      this.slowMode = !this.slowMode;
      speedBtn.innerHTML = this.slowMode
        ? "<span>🐢 Velocidade: Mais Devagar</span>"
        : "<span>🐢 Velocidade: Normal</span>";
      if (this.client?.connected) {
        this.client.sendTextMessage(
          this.slowMode
            ? "Please speak slightly slower and enunciate clearly from now on."
            : "You can speak at a natural normal pace now."
        );
      }
    });

    const doEndSession = async () => {
      this.isActive = false;
      this._flushTranscriptChunks();
      cleanupMedia();

      if (this.missionCompleted) return;

      const durationSeconds = this.sessionStartTime
        ? Math.round((Date.now() - this.sessionStartTime) / 1000)
        : 0;

      if (durationSeconds < 3 && this.transcriptHistory.length === 0) {
        this.dispatchEvent(new CustomEvent("navigate", {
          bubbles: true,
          detail: { view: "summary", result: { incomplete: true } },
        }));
        return;
      }

      this._setAudioState("thinking", "Gerando feedback estruturado e salvando no banco...");
      endBtn.disabled = true;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);
        const res = await fetch("/api/lessons/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            lesson_id: String(this._mission.id),
            level: this._mission.level || "Free",
            title: this._mission.title,
            topic: this._mission.custom_topic || this._mission.desc || "",
            grammar_focus: this._mission.grammar_focus || "",
            mode: this._mode || "preply_tutor",
            native_language: this._fromLanguage || "Portuguese",
            transcript: this.transcriptHistory,
            duration_seconds: durationSeconds,
          }),
        });
        clearTimeout(timeoutId);
        const data = await res.json();
        const rec = data.record || {};
        this.dispatchEvent(new CustomEvent("navigate", {
          bubbles: true,
          detail: {
            view: "summary",
            result: {
              score: rec.score || 3,
              level: rec.level || this._mission.level || "Free",
              title: rec.title || this._mission.title,
              estimated_cefr: rec.estimated_cefr || "",
              cefr_score_0_100: rec.cefr_score_0_100 || 0,
              level_reasoning: rec.level_reasoning || "",
              went_well: rec.went_well || [],
              needs_work: rec.needs_work || [],
              weak_areas: rec.weak_areas || [],
              homework: rec.homework || "",
              summary_note: rec.summary_note || "",
            },
          },
        }));
      } catch (err) {
        console.error("Evaluation failed:", err);
        this.dispatchEvent(new CustomEvent("navigate", {
          bubbles: true,
          detail: { view: "summary", result: { incomplete: true } },
        }));
      }
    };

    endBtn.addEventListener("click", doEndSession);

    const startSession = async (isReconnect = false) => {
      this._setAudioState("connecting");
      startBtn.style.display = "none";
      activeControls.style.display = "flex";

      if (!isReconnect) {
        this.transcriptHistory = [];
        this.currentInputChunk = "";
        this.currentOutputChunk = "";
        this.missionCompleted = false;
        this.sessionStartTime = Date.now();
      }

      this.client = new GeminiLiveAPI();
      this.audioStreamer = new AudioStreamer(this.client);
      this.audioPlayer = new AudioPlayer();

      const completeMissionTool = new FunctionCallDefinition(
        "complete_mission",
        "Call this tool at the end of the lesson to record the student's structured feedback report in the database.",
        {
          type: "OBJECT",
          properties: {
            score: { type: "INTEGER", description: "Rating from 1 to 5." },
            went_well: { type: "ARRAY", items: { type: "STRING" }, description: "2-3 specific compliments." },
            needs_work: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  category: { type: "STRING" },
                  quote: { type: "STRING" },
                  correction: { type: "STRING" },
                  explanation: { type: "STRING" },
                },
                required: ["category", "quote", "correction", "explanation"],
              },
            },
            weak_areas: { type: "ARRAY", items: { type: "STRING" } },
            homework: { type: "STRING" },
            summary_note: { type: "STRING" },
          },
          required: ["score", "went_well", "needs_work", "weak_areas", "homework", "summary_note"],
        },
        ["score", "went_well", "needs_work", "weak_areas", "homework", "summary_note"]
      );

      completeMissionTool.functionToCall = async (args) => {
        this.missionCompleted = true;
        this.isActive = false;
        this._flushTranscriptChunks();
        const durationSeconds = this.sessionStartTime
          ? Math.round((Date.now() - this.sessionStartTime) / 1000)
          : 0;

        new Audio("/winner-bell.mp3").play().catch(() => {});

        const payload = {
          lesson_id: String(this._mission.id),
          level: this._mission.level || "Free",
          title: this._mission.title,
          topic: this._mission.custom_topic || this._mission.desc || "",
          grammar_focus: this._mission.grammar_focus || "",
          mode: this._mode || "preply_tutor",
          score: Math.max(1, Math.min(5, Number(args.score) || 3)),
          went_well: args.went_well || [],
          needs_work: args.needs_work || [],
          weak_areas: args.weak_areas || [],
          homework: args.homework || "",
          summary_note: args.summary_note || "",
          transcript_summary: this.transcriptHistory.map(t => `${t.speaker}: ${t.text}`).join("\n").slice(0, 2000),
          duration_seconds: durationSeconds,
        };

        try {
          await fetch("/api/lessons/log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } catch (e) {
          console.error("Failed to save lesson log:", e);
        }

        setTimeout(() => {
          cleanupMedia();
          this.dispatchEvent(new CustomEvent("navigate", {
            bubbles: true,
            detail: { view: "summary", result: payload },
          }));
        }, 2500);
      };

      this.client.addFunction(completeMissionTool);

      this.client.onError = () => {
        if (!this.missionCompleted) {
          this._setAudioState("error", "Erro de conexão — clique em Reconectar ou Encerrar");
        }
      };

      this.client.onClose = () => {
        if (this.isActive && !this.missionCompleted) {
          this._setAudioState("error", "Conexão encerrada — clique em Reconectar ou Encerrar");
        }
      };

      this.client.onReceiveResponse = (response) => {
        if (response.type === MultimodalLiveResponseType.AUDIO) {
          this._setAudioState("speaking");
          this.audioPlayer.play(response.data);
        } else if (response.type === MultimodalLiveResponseType.TURN_COMPLETE) {
          this._flushTranscriptChunks();
          const transcriptEl = this.querySelector("live-transcript");
          if (transcriptEl) transcriptEl.finalizeAll();
          if (this.isActive) {
            this._setAudioState(this.isMuted ? "muted" : "listening");
          }
        } else if (response.type === MultimodalLiveResponseType.TOOL_CALL) {
          if (response.data.functionCalls) {
            response.data.functionCalls.forEach((fc) => {
              this.client.callFunction(fc.name, fc.args);
            });
          }
        } else if (response.type === MultimodalLiveResponseType.INPUT_TRANSCRIPTION) {
          this.currentInputChunk += response.data.text || "";
          if (this.isActive && this.audioState !== "speaking") {
            this._setAudioState("thinking");
          }
          const transcriptEl = this.querySelector("live-transcript");
          if (transcriptEl) {
            transcriptEl.addInputTranscript(response.data.text, response.data.finished);
          }
        } else if (response.type === MultimodalLiveResponseType.OUTPUT_TRANSCRIPTION) {
          this.currentOutputChunk += response.data.text || "";
          const transcriptEl = this.querySelector("live-transcript");
          if (transcriptEl) {
            transcriptEl.addOutputTranscript(response.data.text, response.data.finished);
          }
        }
      };

      try {
        const language = this._language || "English";
        const fromLanguage = this._fromLanguage || "Portuguese";
        const mode = this._mode || "preply_tutor";
        const m = this._mission;

        let adaptiveBlock = "No previous lesson history yet. Focus on establishing baseline fluency.";
        let estimatedLevel = m.level || "A2";
        try {
          const profRes = await fetch("/api/lessons/profile");
          if (profRes.ok) {
            const profile = await profRes.json();
            if (profile.estimated_level) estimatedLevel = profile.estimated_level;
            if (profile.total_lessons > 0) {
              const topWeak = (profile.top_weak_areas || [])
                .slice(0, 5)
                .map(w => `${w.area} (${w.count}x)`)
                .join(", ");
              const recentMistakes = (profile.recent_needs_work || []).slice(0, 4).join("; ");
              adaptiveBlock = `
STUDENT ADAPTIVE PROFILE (${profile.total_lessons} past lessons, AI-Estimated CEFR: ${estimatedLevel} [${profile.estimated_subscore || 25}/100], Avg Score: ${profile.average_score}/5):
- Recurring Weak Areas to target: ${topWeak || "none recorded"}
- Recent specific mistakes to test/re-elicit naturally: ${recentMistakes || "none"}
- Previous homework: ${profile.recent_homework || "none"}
INSTRUCTION: Naturally weave 1-2 quick spaced-repetition checks or subtle prompts for these weak areas during Stage 1 and Stage 3!`;
            }
          }
        } catch (e) {
          console.warn("Could not fetch adaptive profile:", e);
        }

        const krashenAndSttRules = `
PEDAGOGICAL FOUNDATION (STEPHEN KRASHEN):
1. **Comprehensible Input (i + 1)**:
   - Calibrate your vocabulary, idioms, and sentence complexity to just ONE step above the student's current level (${estimatedLevel}).
   - Stay 100% understandable through clear context and natural phrasing, while organically introducing 1–2 slightly higher-level expressions per turn.
2. **Affective Filter Hypothesis (Low-Anxiety Environment)**:
   - Keep the emotional tone warm, patient, encouraging, and non-judgmental.
   - NEVER interrupt the student mid-thought or harshly criticize minor slips.
   - Prioritize **Recasting**: repeat the student's idea naturally using the correct form rather than stopping the flow for grammar lectures.
   - Validate effort, praise self-corrections, normalize mistakes, and save detailed explicit corrections for brief end-of-turn moments or the final report.

AUDIO / STT CONTEXT AWARENESS (-ed & Unstressed Endings):
- Live speech recognition often drops unstressed word-final '-ed' (/t/, /d/, /ɪd/) or 's' sounds.
- If the student's temporal context is clearly past, assume they intended the past tense and do NOT accuse them of forgetting '-ed' unless they explicitly show confusion.`;

        const systemInstruction = mode === "immergo_immersive"
          ? `
You are a structured yet natural native ${language} Preply conversation coach in an immersive session.
Level: ${m.level || "A2+"} | Lesson: "${m.title}" (${m.desc})
Grammar Focus: ${m.grammar_focus || "Natural fluency"}
Communicative Function: ${m.communicative_function || m.desc}
Roleplay Scenario: ${m.roleplay_scenario || m.desc}
${adaptiveBlock}
${krashenAndSttRules}

RULES:
- Speak ONLY ${language}. Actively steer the conversation so the student practices the target grammar/function and speaks 70–80% of the time.
- When wrapping up, give a brief spoken summary in ${language} and call "complete_mission" with structured feedback in ${fromLanguage}.
`
          : `
You are an active, structured, world-class 1-on-1 **Preply English Teacher** (NOT a passive chat partner!) teaching a ${fromLanguage}-speaking student.
Lesson: "${m.title}" (CEFR Level: ${m.level || "A2"}, Module: ${m.module || "Core"}, Methodology: ${m.methodology || "PPP"})
Target Grammar/Structure: ${m.grammar_focus || "Natural fluency"}
Communicative Function: ${m.communicative_function || m.desc}
Vocabulary Focus: ${m.vocabulary_focus || "Topic vocabulary"}
Pronunciation Focus: ${m.pronunciation_focus || "Natural rhythm & stress"}
Roleplay Scenario: ${m.roleplay_scenario || m.desc}
Session Objectives: ${(m.objectives || []).join(" | ")}

${adaptiveBlock}
${krashenAndSttRules}

STRUCTURED 1-ON-1 LESSON FLOW (You lead the pace; student speaks 70–80% of the time!):
1. **Stage 1 — Warm-up & Adaptive Check-in (2 turns)**: Greet warmly, state today's lesson goal in 1 sentence, and ask "${m.warmup_prompt || "How is your day going?"}" while subtly eliciting 1 weak area.
2. **Stage 2 — Micro-Presentation & Elicitation (2–3 turns)**: Briefly present today's target structure/phrases (2–3 examples max) and prompt the student to build 1 example sentence.
3. **Stage 3 — Guided Practice & Intentional Roleplay (main part)**: Actively drive the scenario ("${m.roleplay_scenario || m.desc}") using intentional questions that require "${m.grammar_focus || "today's target"}". Provide scaffolding if stuck.
4. **Stage 4 — Wrap-up & Verbal Feedback**: Summarize 2 things they did well and 1–2 gentle takeaways, THEN call "complete_mission" with detailed feedback in ${fromLanguage}.
`;

        this.client.setSystemInstructions(systemInstruction);
        this.client.setInputAudioTranscription(true);
        this.client.setOutputAudioTranscription(true);

        const token = await this.getRecaptchaToken();
        await this.client.connect(token);
        await this.audioStreamer.start();

        if (this.audioStreamer.audioContext && this.audioStreamer.source) {
          userViz.connect(this.audioStreamer.audioContext, this.audioStreamer.source);
        }
        await this.audioPlayer.init();
        if (this.audioPlayer.audioContext && this.audioPlayer.gainNode) {
          modelViz.connect(this.audioPlayer.audioContext, this.audioPlayer.gainNode);
        }

        this.isActive = true;
        this.isMuted = false;
        this._setAudioState("listening");

        if (isReconnect && this.transcriptHistory.length > 0) {
          const recap = this.transcriptHistory.slice(-4).map(t => `${t.speaker}: ${t.text}`).join(" | ");
          this.client.sendTextMessage(`We reconnected after a brief drop. Recent context: ${recap}. Please continue smoothly.`);
        } else {
          new Audio("/start-bell.mp3").play().catch(() => {});
        }
      } catch (err) {
        console.error("❌ Failed to start session:", err);
        this.isActive = false;
        cleanupMedia();
        this._setAudioState("error", "Falha ao conectar — clique em Reconectar");
      }
    };

    startBtn.addEventListener("click", () => startSession(false));
    reconnectBtn.addEventListener("click", () => {
      cleanupMedia();
      startSession(true);
    });
  }

  async getRecaptchaToken() {
    return new Promise((resolve) => {
      if (typeof grecaptcha === "undefined") {
        resolve(null);
        return;
      }
      try {
        grecaptcha.enterprise.ready(async () => {
          try {
            const t = await grecaptcha.enterprise.execute(
              "6LeSYx8sAAAAAGdRAp8VQ2K9I-KYGWBykzayvQ8n",
              { action: "LOGIN" }
            );
            resolve(t);
          } catch {
            resolve(null);
          }
        });
      } catch {
        resolve(null);
      }
    });
  }
}

customElements.define("view-chat", ViewChat);
