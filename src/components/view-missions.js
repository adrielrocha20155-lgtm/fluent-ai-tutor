import lessonsData from '../data/lessons.json';

class ViewMissions extends HTMLElement {
  constructor() {
    super();
    this.profile = null;
    this.history = [];
    this.flashcardsDueCount = 0;
    this.isLoading = true;
    this.selectedLevel = localStorage.getItem('preply_level') || 'A2';
    this.showHistory = false;
  }

  async connectedCallback() {
    this.renderShell();
    this.renderInsightsSkeleton();
    await this.loadLearningData();
  }

  async loadLearningData() {
    this.isLoading = true;
    try {
      const [histRes, fcRes] = await Promise.all([
        fetch('/api/lessons/history?limit=30'),
        fetch('/api/flashcards/due?limit=1'),
      ]);
      if (histRes.ok) {
        const data = await histRes.json();
        this.profile = data.profile || null;
        this.history = data.history || [];
        if (this.profile?.current_level && !localStorage.getItem('preply_level')) {
          this.selectedLevel = this.profile.current_level;
        }
      }
      if (fcRes.ok) {
        const fcData = await fcRes.json();
        this.flashcardsDueCount = fcData.due_count || 0;
      }
    } catch (e) {
      console.warn('Could not load learning history:', e);
    } finally {
      this.isLoading = false;
    }
    this.renderAiInsightsPanel();
    this.renderLevelTabs();
    this.renderLessons();
    this.renderHistoryPanel();
  }

  renderShell() {
    const options = `
      <option>🇧🇷 Portuguese</option>
      <option>🇬🇧 English</option>
      <option>🇪🇸 Spanish</option>
      <option>🇫🇷 French</option>
      <option>🇩🇪 German</option>
      <option>🇮🇹 Italian</option>
      <option>🇯🇵 Japanese</option>
      <option>🇰🇷 Korean</option>
    `;

    this.innerHTML = `
      <div class="container" style="padding-bottom: var(--spacing-xxl);">
        <!-- Unified CEFR Progress & Weakness Insights -->
        <div id="ai-insights-panel" style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-md);
        "></div>

        <!-- Collapsible Feedback Logs Drawer -->
        <div id="history-panel" style="display: none; margin-bottom: var(--spacing-lg);"></div>

        <!-- Quick Actions Row: Focused Error Review + Free-Topic Roleplay -->
        <div style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-lg);
        ">
          <!-- Card: Focused Error Review -->
          <div class="glass-panel" style="
            padding: var(--spacing-lg);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 12px;
            border-left: 4px solid var(--color-warning);
          ">
            <div>
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: var(--color-warning);">Targeted Practice</span>
                <span style="font-size: 1.2rem;">🎯</span>
              </div>
              <h3 style="margin: 0 0 6px 0; font-size: 1.15rem;">Revisão Focada nos Meus Erros</h3>
              <p style="margin: 0; font-size: 0.88rem; color: var(--color-text-sub);">
                Sessão rápida gerada automaticamente a partir das dificuldades registradas no seu histórico SQLite.
              </p>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button id="open-flashcards-btn" class="btn-primary" style="background: var(--color-warning); color: #111827;">
                🃏 Revisar seus erros aqui
              </button>
              <button id="start-error-review-btn" class="btn-secondary" style="
                border-color: var(--color-warning);
                color: var(--color-text-main);
              ">Praticar em Voz →</button>
            </div>
          </div>

          <!-- Card: Free-Topic / Roleplay -->
          <div class="glass-panel" style="
            padding: var(--spacing-lg);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 12px;
            border-left: 4px solid var(--color-accent-secondary);
          ">
            <div>
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: var(--color-accent-secondary);">Open Conversation</span>
                <span style="font-size: 1.2rem;">🎙️</span>
              </div>
              <h3 style="margin: 0 0 8px 0; font-size: 1.15rem;">Prática Livre / Roleplay</h3>
              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;">
                <button class="topic-chip" data-topic="IT Job Interview (Behavioral & Tech)" style="font-size: 0.76rem; padding: 4px 10px; border-radius: 999px; background: var(--color-surface-elevated); color: var(--color-text-sub); border: var(--glass-border);">💼 Entrevista de TI</button>
                <button class="topic-chip" data-topic="Airport, Hotel & Travel Situations" style="font-size: 0.76rem; padding: 4px 10px; border-radius: 999px; background: var(--color-surface-elevated); color: var(--color-text-sub); border: var(--glass-border);">✈️ Viagens</button>
                <button class="topic-chip" data-topic="Daily Standup & Technical Meeting" style="font-size: 0.76rem; padding: 4px 10px; border-radius: 999px; background: var(--color-surface-elevated); color: var(--color-text-sub); border: var(--glass-border);">💻 Reunião Técnica</button>
                <button class="topic-chip" data-topic="Casual Everyday Conversation" style="font-size: 0.76rem; padding: 4px 10px; border-radius: 999px; background: var(--color-surface-elevated); color: var(--color-text-sub); border: var(--glass-border);">☕ Conversa Casual</button>
              </div>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <input id="free-topic-input" type="text" placeholder="Digite qualquer tema ou cenário..." style="
                flex: 1;
                min-width: 180px;
                padding: 10px 14px;
                border-radius: var(--radius-md);
                border: var(--glass-border);
                background: var(--color-surface-elevated);
                color: var(--color-text-main);
                font-size: 0.9rem;
              " />
              <button id="start-free-lesson-btn" class="btn-primary">Iniciar Aula →</button>
            </div>
          </div>
        </div>

        <!-- Compact Language & Lesson Style Bar -->
        <div class="glass-panel" style="
          padding: var(--spacing-md) var(--spacing-lg);
          margin-bottom: var(--spacing-xl);
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--spacing-md);
        ">
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <label for="from-lang" style="font-size: 0.78rem; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase;">Falo:</label>
              <select id="from-lang" style="padding: 8px 12px; border: var(--glass-border); border-radius: var(--radius-sm); background: var(--color-surface-elevated); color: var(--color-text-main); font-weight: 600; font-size: 0.9rem;">
                ${options}
              </select>
            </div>
            <span style="color: var(--color-text-muted);">➔</span>
            <div style="display: flex; align-items: center; gap: 6px;">
              <label for="to-lang" style="font-size: 0.78rem; font-weight: 700; color: var(--color-accent-secondary); text-transform: uppercase;">Aprendo:</label>
              <select id="to-lang" style="padding: 8px 12px; border: 1px solid var(--color-accent-primary); border-radius: var(--radius-sm); background: var(--color-surface-elevated); color: var(--color-text-main); font-weight: 700; font-size: 0.9rem;">
                ${options}
              </select>
            </div>
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button id="mode-teacher" class="mode-btn" style="padding: 8px 14px; border-radius: var(--radius-sm); font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;">
              <span>🧑‍🏫</span><span>Preply 1-on-1 Tutor</span>
            </button>
            <button id="mode-immersive" class="mode-btn" style="padding: 8px 14px; border-radius: var(--radius-sm); font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;">
              <span>🎭</span><span>Immersive Only</span>
            </button>
          </div>
        </div>

        <!-- CEFR Curriculum Section -->
        <div style="display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: var(--spacing-md);">
          <div>
            <h2 style="font-size: 1.7rem; margin: 0;">Trilha Estruturada por Nível (CEFR)</h2>
            <p style="margin: 4px 0 0 0; font-size: 0.92rem; color: var(--color-text-sub);">
              Aulas progressivas adaptadas em tempo real aos seus pontos de melhoria.
            </p>
          </div>
        </div>

        <div id="level-tabs" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: var(--spacing-lg);"></div>

        <div class="missions-list mission-grid"></div>
      </div>
    `;

    this.setupLanguageAndMode();
    this.setupFreeAndErrorLessons();
    this.renderLevelTabs();
    this.renderLessons();
  }

  renderInsightsSkeleton() {
    const panel = this.querySelector('#ai-insights-panel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="glass-panel" style="padding: var(--spacing-lg);">
        <div class="skeleton" style="width: 45%; height: 14px; margin-bottom: 12px;"></div>
        <div class="skeleton" style="width: 65%; height: 26px; margin-bottom: 16px;"></div>
        <div class="skeleton" style="width: 100%; height: 12px; margin-bottom: 12px;"></div>
        <div class="skeleton" style="width: 85%; height: 14px;"></div>
      </div>
      <div class="glass-panel" style="padding: var(--spacing-lg);">
        <div class="skeleton" style="width: 40%; height: 14px; margin-bottom: 12px;"></div>
        <div class="skeleton" style="width: 75%; height: 22px; margin-bottom: 14px;"></div>
        <div class="skeleton" style="width: 100%; height: 54px;"></div>
      </div>
    `;
  }

  setupLanguageAndMode() {
    const toSelect = this.querySelector('#to-lang');
    const fromSelect = this.querySelector('#from-lang');

    const savedTo = localStorage.getItem('immergo_language');
    const savedFrom = localStorage.getItem('immergo_from_language');

    if (savedTo) {
      toSelect.value = savedTo;
    } else {
      const en = Array.from(toSelect.options).find(o => o.text.includes('English'));
      if (en) toSelect.value = en.text;
    }

    if (savedFrom) {
      fromSelect.value = savedFrom;
    } else {
      const pt = Array.from(fromSelect.options).find(o => o.text.includes('Portuguese'));
      if (pt) fromSelect.value = pt.text;
    }

    fromSelect.addEventListener('change', () => {
      localStorage.setItem('immergo_from_language', fromSelect.value);
    });
    toSelect.addEventListener('change', () => {
      localStorage.setItem('immergo_language', toSelect.value);
    });

    const modeTeacher = this.querySelector('#mode-teacher');
    const modeImmersive = this.querySelector('#mode-immersive');
    let currentMode = localStorage.getItem('immergo_mode') || 'preply_tutor';
    if (currentMode === 'immergo_teacher') currentMode = 'preply_tutor';

    const updateModeUI = () => {
      [modeTeacher, modeImmersive].forEach(btn => {
        btn.style.background = 'var(--color-surface-elevated)';
        btn.style.color = 'var(--color-text-sub)';
        btn.style.border = 'var(--glass-border)';
      });
      const activeBtn = currentMode === 'immergo_immersive' ? modeImmersive : modeTeacher;
      activeBtn.style.background = 'var(--color-accent-primary)';
      activeBtn.style.color = '#ffffff';
      activeBtn.style.border = '1px solid var(--color-accent-primary)';
    };

    modeTeacher.addEventListener('click', () => {
      currentMode = 'preply_tutor';
      localStorage.setItem('immergo_mode', currentMode);
      updateModeUI();
    });
    modeImmersive.addEventListener('click', () => {
      currentMode = 'immergo_immersive';
      localStorage.setItem('immergo_mode', currentMode);
      updateModeUI();
    });
    localStorage.setItem('immergo_mode', currentMode);
    updateModeUI();
  }

  setupFreeAndErrorLessons() {
    const input = this.querySelector('#free-topic-input');
    const freeBtn = this.querySelector('#start-free-lesson-btn');
    const errorReviewBtn = this.querySelector('#start-error-review-btn');
    const flashcardsBtn = this.querySelector('#open-flashcards-btn');

    flashcardsBtn?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('navigate', {
        bubbles: true,
        detail: { view: 'flashcards' },
      }));
    });

    this.querySelectorAll('.topic-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.topic;
        input.focus();
      });
    });

    const startFree = () => {
      const topic = (input.value || '').trim() || 'Everyday English Conversation & Fluency';
      this.launchLesson({
        id: `free-${Date.now()}`,
        level: this.selectedLevel,
        order: 0,
        module: 'Open Conversation',
        title: `Free Topic: ${topic}`,
        methodology: 'CLT',
        grammar_focus: 'Adaptive to your CEFR level & recurring weak areas',
        communicative_function: `Natural 1-on-1 conversation about ${topic}`,
        vocabulary_focus: `Topic vocabulary for: ${topic}`,
        pronunciation_focus: 'Natural rhythm, stress & connected speech',
        desc: `Prática aberta 1-on-1 focada em: ${topic}`,
        warmup_prompt: `Let's warm up briefly and dive into "${topic}".`,
        roleplay_scenario: `Interactive Preply session exploring "${topic}" with real-world follow-up questions.`,
        target_role: 'Preply English Tutor',
        is_free_topic: true,
        custom_topic: topic,
        objectives: [
          `Speak naturally about "${topic}" (70–80% student talking time)`,
          'Practice targeted corrections from your adaptive profile',
          'Wrap up with concrete feedback & homework'
        ]
      });
    };

    freeBtn.addEventListener('click', startFree);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') startFree();
    });

    errorReviewBtn.addEventListener('click', () => {
      const weakAreas = (this.profile?.top_weak_areas || []).slice(0, 4).map(w => w.area);
      const focusSummary = weakAreas.length ? weakAreas.join(', ') : 'past tenses, prepositions & fluency';
      this.launchLesson({
        id: `review-${Date.now()}`,
        level: this.profile?.estimated_level || this.selectedLevel,
        order: 0,
        module: 'Targeted Error Review',
        title: 'Revisão Focada nos Meus Erros',
        methodology: 'PPP',
        grammar_focus: `Spaced-repetition drill on: ${focusSummary}`,
        communicative_function: 'Self-correction and mastery of recurring mistakes',
        vocabulary_focus: 'Natural phrasing replacements for past mistakes',
        pronunciation_focus: 'Clear endings & natural phrasing',
        desc: `Sessão intensiva para corrigir e consolidar: ${focusSummary}`,
        warmup_prompt: 'Ready for a quick targeted review of your recent speaking focus areas?',
        roleplay_scenario: `Structured 1-on-1 drill & mini-roleplay specifically targeting: ${focusSummary}`,
        target_role: 'Preply English Tutor',
        is_error_review: true,
        objectives: [
          'Review 2–3 exact sentences from your recent lessons',
          'Practice natural replacements in spontaneous speech',
          'Confirm mastery with zero repeated slips'
        ]
      });
    });
  }

  renderAiInsightsPanel() {
    const panel = this.querySelector('#ai-insights-panel');
    if (!panel) return;

    const total = this.profile?.total_lessons || 0;
    const avg = this.profile?.average_score || 0;
    const estLevel = this.profile?.estimated_level || 'A2';
    const subscore = Math.max(0, Math.min(100, Number(this.profile?.estimated_subscore ?? 25)));
    const reasoning = this.profile?.level_reasoning || 'Conclua sua primeira aula para a IA estimar seu nível CEFR e montar seu plano adaptativo.';
    const weakAreas = this.profile?.top_weak_areas || [];
    const mistakes = this.profile?.detailed_mistakes || [];
    const cefrSteps = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

    panel.innerHTML = `
      <!-- Left: AI-Estimated CEFR Level & Stats -->
      <div class="glass-panel" style="padding: var(--spacing-lg); display: flex; flex-direction: column; justify-content: space-between; gap: 14px;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
            <div>
              <span style="font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.8px; color: var(--color-text-muted); font-weight: 700;">Nível Estimado pela IA</span>
              <h3 style="margin: 2px 0 0 0; font-size: 1.45rem; color: var(--color-accent-secondary);">
                CEFR ${estLevel} <span style="font-size: 0.95rem; color: var(--color-text-sub); font-weight: 600;">(${subscore}/100)</span>
              </h3>
            </div>
            <div style="display: flex; gap: 12px; text-align: right;">
              <div>
                <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--color-text-muted); display: block;">Aulas</span>
                <strong style="font-size: 1.05rem;">${total}</strong>
              </div>
              <div>
                <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--color-text-muted); display: block;">Média</span>
                <strong style="font-size: 1.05rem; color: var(--color-warning);">${avg ? `${avg} ★` : '—'}</strong>
              </div>
            </div>
          </div>

          <div style="width: 100%; height: 10px; border-radius: 999px; background: var(--color-surface-elevated); overflow: hidden; margin-bottom: 8px;">
            <div style="width: ${subscore}%; height: 100%; background: linear-gradient(90deg, var(--color-success), var(--color-accent-secondary)); border-radius: 999px; transition: width 0.5s ease;"></div>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: 12px;">
            ${cefrSteps.map(s => `<span style="${s === estLevel ? 'color: var(--color-accent-secondary); font-weight: 900;' : ''}">${s}</span>`).join('')}
          </div>

          <p style="margin: 0; font-size: 0.88rem; color: var(--color-text-sub); line-height: 1.5;">${reasoning}</p>
        </div>

        <div style="display: flex; justify-content: flex-end;">
          <button id="toggle-history-btn" class="btn-secondary" style="font-size: 0.82rem; padding: 7px 14px;">
            ${this.showHistory ? 'Ocultar Histórico' : `Ver Histórico de Feedback (${total})`}
          </button>
        </div>
      </div>

      <!-- Right: Where You Need to Improve -->
      <div class="glass-panel" style="padding: var(--spacing-lg); border-left: 4px solid var(--color-danger); display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span style="font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.8px; color: var(--color-danger); font-weight: 700;">Diagnóstico Contínuo</span>
            <h3 style="margin: 2px 0 0 0; font-size: 1.25rem;">Onde Você Precisa Melhorar</h3>
          </div>
        </div>

        ${weakAreas.length ? `
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${weakAreas.slice(0, 6).map(w => `
              <span style="font-size: 0.74rem; padding: 4px 10px; border-radius: 999px; background: var(--color-warning-bg); color: var(--color-warning); font-weight: 700;">
                #${w.area} (${w.count}x)
              </span>
            `).join('')}
          </div>
        ` : ''}

        ${mistakes.length ? `
          <div style="display: flex; flex-direction: column; gap: 8px; max-height: 210px; overflow-y: auto; padding-right: 4px;">
            ${mistakes.slice(0, 3).map(m => `
              <div style="padding: 10px 12px; border-radius: var(--radius-sm); background: var(--color-surface-elevated); font-size: 0.84rem;">
                <div style="color: var(--color-danger); text-decoration: line-through; margin-bottom: 2px;">"${m.quote || ''}"</div>
                <div style="color: var(--color-success); font-weight: 700; margin-bottom: 3px;">➔ "${m.correction || ''}"</div>
                ${m.explanation ? `<div style="color: var(--color-text-sub); font-size: 0.8rem; line-height: 1.4;">${m.explanation}</div>` : ''}
              </div>
            `).join('')}
          </div>
        ` : `<p style="margin: 0; font-size: 0.88rem; color: var(--color-text-sub);">Seus erros exatos e correções naturais aparecerão aqui após sua próxima aula.</p>`}
      </div>
    `;

    const toggleBtn = panel.querySelector('#toggle-history-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this.showHistory = !this.showHistory;
        this.renderAiInsightsPanel();
        this.renderHistoryPanel();
      });
    }

    const fcBtn = this.querySelector('#open-flashcards-btn');
    if (fcBtn) {
      fcBtn.innerHTML = this.flashcardsDueCount > 0
        ? `🃏 Revisar seus erros aqui (${this.flashcardsDueCount})`
        : `🃏 Revisar seus erros aqui`;
    }
  }

  renderHistoryPanel() {
    const panel = this.querySelector('#history-panel');
    if (!panel) return;
    if (!this.showHistory) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'block';

    if (!this.history.length) {
      panel.innerHTML = `
        <div class="glass-panel" style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-sub);">
          Nenhum log de aula encontrado ainda.
        </div>
      `;
      return;
    }

    panel.innerHTML = `
      <div class="glass-panel" style="padding: var(--spacing-lg); max-height: 380px; overflow-y: auto;">
        <h3 style="margin: 0 0 var(--spacing-md) 0; font-size: 1.1rem;">📚 Histórico de Feedbacks</h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${this.history.slice(0, 10).map(item => `
            <div style="padding: 12px 14px; border-radius: var(--radius-md); background: var(--color-surface-elevated); border: var(--glass-border);">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px;">
                <div>
                  <span style="font-size: 0.72rem; font-weight: 800; padding: 2px 8px; border-radius: 6px; background: rgba(var(--color-accent-primary-rgb), 0.2); color: var(--color-accent-secondary); margin-right: 8px;">${item.level}</span>
                  <strong>${item.title}</strong>
                </div>
                <span style="font-weight: 700; color: var(--color-warning);">${'★'.repeat(item.score)}${'☆'.repeat(Math.max(0, 5 - item.score))}</span>
              </div>
              ${item.summary_note ? `<p style="margin: 4px 0 8px 0; font-size: 0.85rem; color: var(--color-text-sub);">${item.summary_note}</p>` : ''}
              <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                ${(item.weak_areas || []).map(tag => `<span style="font-size: 0.72rem; padding: 2px 8px; border-radius: 999px; background: var(--color-warning-bg); color: var(--color-warning);">#${tag}</span>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderLevelTabs() {
    const container = this.querySelector('#level-tabs');
    if (!container) return;
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const completedSet = new Set(this.profile?.completed_lesson_ids || []);

    container.innerHTML = levels.map(lvl => {
      const levelLessons = lessonsData.filter(l => l.level === lvl);
      const doneCount = levelLessons.filter(l => completedSet.has(l.id)).length;
      const isActive = this.selectedLevel === lvl;

      return `
        <button data-level="${lvl}" style="
          padding: 10px 18px;
          border-radius: var(--radius-md);
          border: ${isActive ? '1px solid var(--color-accent-primary)' : 'var(--glass-border)'};
          background: ${isActive ? 'var(--color-accent-primary)' : 'var(--color-surface)'};
          color: ${isActive ? '#ffffff' : 'var(--color-text-main)'};
          font-weight: 700;
          font-size: 0.9rem;
        ">
          ${lvl} <span style="opacity: 0.85; font-size: 0.8rem; margin-left: 4px;">(${doneCount}/${levelLessons.length})</span>
        </button>
      `;
    }).join('');

    container.querySelectorAll('button[data-level]').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.selectedLevel = btn.dataset.level;
        localStorage.setItem('preply_level', this.selectedLevel);
        this.renderLevelTabs();
        this.renderLessons();
        try {
          await fetch('/api/lessons/profile/level', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level: this.selectedLevel }),
          });
        } catch {
          // Non-blocking
        }
      });
    });
  }

  renderLessons() {
    const listContainer = this.querySelector('.missions-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const completedSet = new Set(this.profile?.completed_lesson_ids || []);
    const lessons = lessonsData
      .filter(l => l.level === this.selectedLevel)
      .sort((a, b) => a.order - b.order);

    lessons.forEach(lesson => {
      const isCompleted = completedSet.has(lesson.id);
      const card = document.createElement('div');
      card.className = 'card mission-card';
      card.style.cursor = 'pointer';
      if (isCompleted) {
        card.style.borderColor = 'rgba(34, 197, 94, 0.45)';
      }

      card.innerHTML = `
        <div style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <span style="
            background: rgba(var(--color-accent-primary-rgb), 0.18);
            color: var(--color-accent-secondary);
            padding: 4px 10px;
            border-radius: var(--radius-sm);
            font-size: 0.74rem;
            font-weight: 800;
          ">${lesson.level} • Aula ${lesson.order}</span>
          <div style="display: flex; gap: 6px; align-items: center;">
            ${isCompleted ? `<span style="font-size: 0.75rem; font-weight: 700; color: var(--color-success);">✓ Concluída</span>` : ''}
            <span style="font-size: 0.72rem; padding: 3px 8px; border-radius: 6px; background: var(--color-surface-elevated); color: var(--color-text-sub); font-weight: 700;">${lesson.methodology}</span>
          </div>
        </div>
        <div style="margin-bottom: 4px; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.8px; color: var(--color-text-muted); font-weight: 700;">
          ${lesson.module || 'Core Module'}
        </div>
        <h3 style="margin: 0 0 8px 0; font-size: 1.15rem; line-height: 1.3;">${lesson.title}</h3>
        <p style="margin: 0 0 12px 0; font-size: 0.88rem; color: var(--color-text-sub); line-height: 1.45;">${lesson.desc}</p>
        <div style="margin-top: auto; padding-top: 10px; border-top: var(--glass-border); font-size: 0.78rem; color: var(--color-accent-secondary); font-weight: 600;">
          Foco: ${lesson.grammar_focus}
        </div>
      `;

      card.addEventListener('click', () => this.launchLesson(lesson));
      listContainer.appendChild(card);
    });
  }

  launchLesson(lesson) {
    const toSelect = this.querySelector('#to-lang');
    const fromSelect = this.querySelector('#from-lang');
    const selectedToLang = toSelect.value;
    const selectedFromLang = fromSelect.value;
    const selectedMode = localStorage.getItem('immergo_mode') || 'preply_tutor';

    localStorage.setItem('immergo_language', selectedToLang);
    localStorage.setItem('immergo_from_language', selectedFromLang);

    this.dispatchEvent(new CustomEvent('navigate', {
      bubbles: true,
      detail: {
        view: 'chat',
        mission: lesson,
        language: selectedToLang,
        fromLanguage: selectedFromLang,
        mode: selectedMode,
      }
    }));
  }
}

customElements.define('view-missions', ViewMissions);
