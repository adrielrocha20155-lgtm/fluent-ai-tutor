class ViewSummary extends HTMLElement {
  constructor() {
    super();
    this._result = null;
  }

  set result(value) {
    this._result = value;
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    if (!this._result) return;

    if (this._result.incomplete) {
      this.innerHTML = `
        <div class="container text-center" style="max-width: 680px; padding-top: var(--spacing-xl); padding-bottom: var(--spacing-xxl);">
          <div class="glass-panel" style="padding: var(--spacing-xl);">
            <h2 style="margin-bottom: 10px;">Aula Encerrada Cedo</h2>
            <p style="color: var(--color-text-sub); margin-bottom: var(--spacing-lg);">
              A sessão foi encerrada antes de registrar falas suficientes para gerar o relatório detalhado.
            </p>
            <button id="home-btn" class="btn-primary">Voltar ao Início</button>
          </div>
        </div>
      `;
    } else {
      const score = Number(this._result.score) || 3;
      const wentWell = this._result.went_well || this._result.notes || [];
      const needsWork = this._result.needs_work || [];
      const weakAreas = this._result.weak_areas || [];
      const homework = this._result.homework || "";
      const summaryNote = this._result.summary_note || "";
      const estCefr = this._result.estimated_cefr || "";
      const cefrScore = this._result.cefr_score_0_100 || 0;
      const levelReasoning = this._result.level_reasoning || "";

      this.innerHTML = `
        <div class="container" style="max-width: 880px; padding-bottom: var(--spacing-xxl);">
          <div class="glass-panel" style="padding: var(--spacing-lg); text-align: center; margin-bottom: var(--spacing-md);">
            <span style="font-size: 0.78rem; font-weight: 800; padding: 4px 12px; border-radius: 999px; background: var(--color-success-bg); color: var(--color-success);">
              ${this._result.level || "CEFR"} • Feedback Salvo no Banco de Dados
            </span>
            <h2 style="margin: 12px 0 6px 0; font-size: 1.65rem;">
              ${this._result.title || "Aula Concluída!"}
            </h2>
            <div style="font-size: 1.7rem; color: var(--color-warning); letter-spacing: 3px; margin: 6px 0;">
              ${"★".repeat(score)}${"☆".repeat(Math.max(0, 5 - score))}
              <span style="font-size: 0.95rem; color: var(--color-text-sub); letter-spacing: normal; margin-left: 8px;">(${score}/5)</span>
            </div>
            ${estCefr ? `
              <div style="margin: 12px auto 0 auto; max-width: 560px; padding: 10px 16px; border-radius: var(--radius-md); background: var(--color-surface-elevated); border: var(--glass-border);">
                <div style="font-size: 0.88rem; font-weight: 800; color: var(--color-accent-secondary);">
                  📈 Nível Estimado pela IA: CEFR ${estCefr} (${cefrScore}/100)
                </div>
                ${levelReasoning ? `<div style="font-size: 0.84rem; color: var(--color-text-sub); margin-top: 4px;">${levelReasoning}</div>` : ""}
              </div>
            ` : ""}
            ${summaryNote ? `<p style="color: var(--color-text-sub); max-width: 660px; margin: 12px auto 0 auto;">${summaryNote}</p>` : ""}
          </div>

          <!-- What You Did Well -->
          <div class="glass-panel" style="padding: var(--spacing-lg); margin-bottom: var(--spacing-md); border-left: 4px solid var(--color-success);">
            <h4 style="margin: 0 0 10px 0; color: var(--color-success); font-size: 1.05rem;">✅ O Que Você Fez Bem</h4>
            <ul style="margin: 0; padding-left: 20px; line-height: 1.65; color: var(--color-text-main);">
              ${wentWell.length
                ? wentWell.map(item => `<li>${item}</li>`).join("")
                : `<li>Participou ativamente e manteve o fluxo da conversação.</li>`}
            </ul>
          </div>

          <!-- Comparison: You Said vs Natural Form -->
          <div class="glass-panel" style="padding: var(--spacing-lg); margin-bottom: var(--spacing-md); border-left: 4px solid var(--color-danger);">
            <h4 style="margin: 0 0 12px 0; color: var(--color-danger); font-size: 1.05rem;">🛠️ Comparativo: "Você disse" vs. "Forma natural"</h4>
            ${needsWork.length
              ? `<div style="display: flex; flex-direction: column; gap: 12px;">
                  ${needsWork.map(item => {
                    if (typeof item === "string") {
                      return `<div style="padding: 10px; border-radius: var(--radius-sm); background: var(--color-surface-elevated);">${item}</div>`;
                    }
                    return `
                      <div style="padding: 12px 14px; border-radius: var(--radius-md); background: var(--color-surface-elevated); border: var(--glass-border);">
                        <div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--color-warning); margin-bottom: 8px;">
                          ${item.category || "Correção"}
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-bottom: 8px;">
                          <div style="padding: 8px 10px; border-radius: var(--radius-sm); background: var(--color-danger-bg);">
                            <div style="font-size: 0.7rem; font-weight: 800; color: var(--color-danger); text-transform: uppercase;">Você disse</div>
                            <div style="font-size: 0.9rem; color: var(--color-text-main);">"${item.quote || ""}"</div>
                          </div>
                          <div style="padding: 8px 10px; border-radius: var(--radius-sm); background: var(--color-success-bg);">
                            <div style="font-size: 0.7rem; font-weight: 800; color: var(--color-success); text-transform: uppercase;">Forma natural</div>
                            <div style="font-size: 0.9rem; font-weight: 700; color: var(--color-text-main);">"${item.correction || ""}"</div>
                          </div>
                        </div>
                        ${item.explanation ? `<div style="font-size: 0.85rem; color: var(--color-text-sub);">${item.explanation}</div>` : ""}
                      </div>
                    `;
                  }).join("")}
                </div>`
              : `<p style="margin: 0; color: var(--color-text-sub);">Excelente! Nenhum erro relevante foi sinalizado nesta sessão.</p>`}
          </div>

          <!-- Actionable Homework & Tags -->
          <div class="glass-panel" style="padding: var(--spacing-lg); margin-bottom: var(--spacing-xl); border-left: 4px solid var(--color-accent-secondary);">
            <h4 style="margin: 0 0 8px 0; color: var(--color-accent-secondary); font-size: 1.05rem;">📌 Tarefa Rápida (5 min) & Foco</h4>
            ${homework ? `<p style="margin: 0 0 10px 0; color: var(--color-text-main);">${homework}</p>` : ""}
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${weakAreas.map(tag => `
                <span style="font-size: 0.75rem; padding: 4px 10px; border-radius: 999px; background: var(--color-warning-bg); color: var(--color-warning); font-weight: 700;">
                  #${tag}
                </span>
              `).join("")}
            </div>
          </div>

          <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
            <button id="practice-mistakes-btn" class="btn-primary">🎯 Praticar Esses Pontos Agora</button>
            <button id="home-btn" class="btn-secondary">Voltar ao Início</button>
          </div>
        </div>
      `;
    }

    const homeBtn = this.querySelector("#home-btn");
    if (homeBtn) {
      homeBtn.addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("navigate", {
          bubbles: true,
          detail: { view: "missions" },
        }));
      });
    }

    const practiceBtn = this.querySelector("#practice-mistakes-btn");
    if (practiceBtn) {
      practiceBtn.addEventListener("click", () => {
        const weakAreas = (this._result.weak_areas || []).join(", ") || "recent mistakes";
        this.dispatchEvent(new CustomEvent("navigate", {
          bubbles: true,
          detail: {
            view: "chat",
            mission: {
              id: `review-${Date.now()}`,
              level: this._result.estimated_cefr || this._result.level || "A2",
              order: 0,
              module: "Targeted Error Review",
              title: "Prática Focada nos Pontos da Última Aula",
              methodology: "PPP",
              grammar_focus: `Targeted correction on: ${weakAreas}`,
              communicative_function: "Consolidate corrections from your previous lesson",
              desc: `Prática rápida para dominar: ${weakAreas}`,
              warmup_prompt: "Let's quickly practice the key phrases from your last session!",
              roleplay_scenario: `Focused 1-on-1 drill and mini-roleplay targeting: ${weakAreas}`,
              objectives: [
                "Practice the corrected versions of your recent sentences",
                "Use them naturally in 2–3 new mini-questions",
                "Build automaticity with zero pressure"
              ]
            },
            language: localStorage.getItem("immergo_language") || "🇬🇧 English",
            fromLanguage: localStorage.getItem("immergo_from_language") || "🇧🇷 Portuguese",
            mode: localStorage.getItem("immergo_mode") || "preply_tutor",
          },
        }));
      });
    }
  }
}

customElements.define("view-summary", ViewSummary);
