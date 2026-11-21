class ViewFlashcards extends HTMLElement {
  constructor() {
    super();
    this.dueCards = [];
    this.totalCards = 0;
    this.dueCount = 0;
    this.masteredCount = 0;
    this.currentIndex = 0;
    this.isFlipped = false;
    this.isLoading = true;
    this.isGenerating = false;
    this.reviewedInSession = 0;
    this._keyHandler = null;
  }

  async connectedCallback() {
    this.render();
    await this.loadCards(true);
    this._keyHandler = (e) => {
      if (e.code === 'Space' && this.dueCards[this.currentIndex]) {
        e.preventDefault();
        this.flipCard();
      } else if (this.isFlipped && ['1', '2', '3', '4'].includes(e.key)) {
        const ratings = ['again', 'hard', 'good', 'easy'];
        this.submitReview(ratings[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  disconnectedCallback() {
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
  }

  async loadCards(autoGenerateIfEmpty = false) {
    this.isLoading = true;
    this.render();
    try {
      const res = await fetch('/api/flashcards/due');
      if (res.ok) {
        const data = await res.json();
        this.dueCards = data.due_cards || [];
        this.totalCards = data.total_cards || 0;
        this.dueCount = data.due_count || 0;
        this.masteredCount = data.mastered_count || 0;
        if (autoGenerateIfEmpty && this.totalCards === 0) {
          await this.generateCards();
          return;
        }
      }
    } catch (e) {
      console.error('Failed to load flashcards:', e);
    } finally {
      this.isLoading = false;
      this.currentIndex = 0;
      this.isFlipped = false;
      this.render();
    }
  }

  async generateCards() {
    this.isGenerating = true;
    this.render();
    try {
      const res = await fetch('/api/flashcards/generate', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        this.dueCards = data.due_cards || [];
        this.totalCards = data.total_cards || 0;
        this.dueCount = data.due_count || 0;
        this.masteredCount = data.mastered_count || 0;
        this.currentIndex = 0;
        this.isFlipped = false;
      }
    } catch (e) {
      console.error('Failed to generate flashcards:', e);
    } finally {
      this.isGenerating = false;
      this.isLoading = false;
      this.render();
    }
  }

  flipCard() {
    if (!this.dueCards[this.currentIndex]) return;
    this.isFlipped = !this.isFlipped;
    const inner = this.querySelector('.flashcard-inner');
    const ratingBar = this.querySelector('#rating-bar');
    const flipHint = this.querySelector('#flip-hint');
    if (inner) inner.classList.toggle('is-flipped', this.isFlipped);
    if (ratingBar) ratingBar.style.display = this.isFlipped ? 'grid' : 'none';
    if (flipHint) flipHint.style.display = this.isFlipped ? 'none' : 'block';
  }

  speakAnswer(text) {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  }

  async submitReview(rating) {
    const card = this.dueCards[this.currentIndex];
    if (!card) return;

    try {
      const res = await fetch(`/api/flashcards/${card.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      });
      if (res.ok) {
        const data = await res.json();
        this.dueCards = data.due_cards || [];
        this.totalCards = data.total_cards || 0;
        this.dueCount = data.due_count || 0;
        this.masteredCount = data.mastered_count || 0;
        this.reviewedInSession += 1;
        this.currentIndex = 0;
        this.isFlipped = false;
        this.render();
      }
    } catch (e) {
      console.error('Failed to submit review:', e);
    }
  }

  render() {
    const card = this.dueCards[this.currentIndex];

    this.innerHTML = `
      <style>
        .fc-shell {
          max-width: 820px;
          margin: 0 auto;
          padding: 12px 24px 48px 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .fc-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .flashcard-scene {
          perspective: 1100px;
          width: 100%;
          min-height: 300px;
          cursor: pointer;
        }

        .flashcard-inner {
          position: relative;
          width: 100%;
          min-height: 300px;
          transition: transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
          transform-style: preserve-3d;
        }

        .flashcard-inner.is-flipped {
          transform: rotateY(180deg);
        }

        .flashcard-face {
          position: absolute;
          inset: 0;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          background: var(--color-surface);
          border: var(--glass-border);
          border-radius: var(--radius-lg);
          padding: 28px;
          box-shadow: var(--shadow-md);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .flashcard-back {
          transform: rotateY(180deg);
          border-color: var(--color-accent-primary);
        }

        .rating-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }

        @media (max-width: 600px) {
          .rating-grid { grid-template-columns: repeat(2, 1fr); }
        }

        .rate-btn {
          padding: 12px 10px;
          border-radius: var(--radius-md);
          font-weight: 700;
          font-size: 0.88rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          border: var(--glass-border);
        }
        .rate-again { background: var(--color-danger-bg); color: var(--color-danger); border-color: rgba(251, 113, 133, 0.35); }
        .rate-hard { background: var(--color-warning-bg); color: var(--color-warning); border-color: rgba(245, 158, 11, 0.35); }
        .rate-good { background: var(--color-success-bg); color: var(--color-success); border-color: rgba(34, 197, 94, 0.35); }
        .rate-easy { background: rgba(var(--color-accent-primary-rgb), 0.2); color: var(--color-accent-secondary); border-color: var(--color-accent-primary); }
      </style>

      <div class="fc-shell">
        <div class="fc-topbar">
          <button id="fc-back-btn" class="btn-secondary">← Voltar ao Dashboard</button>

          <div style="display: flex; gap: 14px; align-items: center; flex-wrap: wrap;">
            <span style="font-size: 0.85rem; color: var(--color-text-sub);">Para revisar: <strong style="color: var(--color-warning);">${this.dueCount}</strong></span>
            <span style="font-size: 0.85rem; color: var(--color-text-sub);">Total: <strong>${this.totalCards}</strong></span>
            <span style="font-size: 0.85rem; color: var(--color-text-sub);">Dominados: <strong style="color: var(--color-success);">${this.masteredCount}</strong></span>
          </div>

          <button id="fc-generate-btn" class="btn-secondary" ${this.isGenerating ? 'disabled' : ''}>
            ${this.isGenerating ? '⏳ Gerando com IA...' : '✨ Gerar Novos Cards'}
          </button>
        </div>

        <div class="glass-panel" style="padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <h2 style="margin: 0; font-size: 1.35rem;">🃏 Revisão Espaçada (Estilo Anki)</h2>
            <p style="margin: 2px 0 0 0; font-size: 0.85rem; color: var(--color-text-sub);">
              Flashcards criados pela IA a partir dos erros reais das suas aulas.
            </p>
          </div>
          <span style="font-size: 0.82rem; font-weight: 700; color: var(--color-accent-secondary);">
            Revisados hoje: ${this.reviewedInSession}
          </span>
        </div>

        ${this.isLoading || this.isGenerating ? `
          <div class="glass-panel" style="padding: 40px; text-align: center;">
            <div class="skeleton" style="width: 60%; height: 22px; margin: 0 auto 14px auto;"></div>
            <div class="skeleton" style="width: 85%; height: 32px; margin: 0 auto 14px auto;"></div>
            <div class="skeleton" style="width: 40%; height: 16px; margin: 0 auto;"></div>
          </div>
        ` : card ? `
          <div id="flashcard-scene" class="flashcard-scene" title="Clique para virar (ou Espaço)">
            <div class="flashcard-inner ${this.isFlipped ? 'is-flipped' : ''}">
              <!-- Front -->
              <div class="flashcard-face">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                  <span style="font-size: 0.74rem; font-weight: 800; padding: 3px 10px; border-radius: 999px; background: var(--color-warning-bg); color: var(--color-warning);">
                    ${card.category} • #${card.weak_area}
                  </span>
                  <span style="font-size: 0.76rem; color: var(--color-text-muted);">
                    Repetições: ${card.repetitions} • Intervalo: ${card.interval_days}d
                  </span>
                </div>

                <div style="text-align: center; padding: 20px 10px;">
                  <div style="font-size: 0.78rem; text-transform: uppercase; letter-spacing: 1px; color: var(--color-text-muted); margin-bottom: 10px;">Pergunta / Desafio</div>
                  <div style="font-size: 1.35rem; font-weight: 700; line-height: 1.45; color: var(--color-text-main);">
                    ${card.front}
                  </div>
                </div>

                <div style="text-align: center; font-size: 0.82rem; color: var(--color-accent-secondary); font-weight: 700;">
                  👆 Clique no card (ou pressione Espaço) para ver a resposta
                </div>
              </div>

              <!-- Back -->
              <div class="flashcard-face flashcard-back">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                  <span style="font-size: 0.74rem; font-weight: 800; padding: 3px 10px; border-radius: 999px; background: var(--color-success-bg); color: var(--color-success);">
                    Resposta Natural
                  </span>
                  <button id="speak-answer-btn" class="btn-secondary" style="padding: 4px 10px; font-size: 0.78rem;">🔊 Ouvir</button>
                </div>

                <div style="text-align: center; padding: 14px 10px;">
                  <div style="font-size: 1.4rem; font-weight: 800; color: var(--color-success); margin-bottom: 12px; line-height: 1.4;">
                    "${card.back_answer}"
                  </div>
                  ${card.back_explanation ? `
                    <div style="font-size: 0.92rem; color: var(--color-text-sub); max-width: 600px; margin: 0 auto; line-height: 1.5;">
                      ${card.back_explanation}
                    </div>
                  ` : ''}
                </div>

                <div style="text-align: center; font-size: 0.78rem; color: var(--color-text-muted);">
                  Avalie o quanto foi fácil lembrar (atalhos: 1, 2, 3, 4)
                </div>
              </div>
            </div>
          </div>

          <div id="flip-hint" style="text-align: center; display: ${this.isFlipped ? 'none' : 'block'};">
            <button id="flip-btn" class="btn-primary" style="padding: 12px 32px;">Virar Flashcard</button>
          </div>

          <div id="rating-bar" class="rating-grid" style="display: ${this.isFlipped ? 'grid' : 'none'};">
            <button class="rate-btn rate-again" data-rating="again">
              <span>1 • Errei</span>
              <span style="font-size: 0.74rem; opacity: 0.85;">Rever hoje (&lt; 1 min)</span>
            </button>
            <button class="rate-btn rate-hard" data-rating="hard">
              <span>2 • Difícil</span>
              <span style="font-size: 0.74rem; opacity: 0.85;">${card.repetitions === 0 ? '1 dia' : `${Math.max(1, Math.round(card.interval_days * 0.8))}d`}</span>
            </button>
            <button class="rate-btn rate-good" data-rating="good">
              <span>3 • Bom</span>
              <span style="font-size: 0.74rem; opacity: 0.85;">${card.repetitions === 0 ? '1 dia' : card.repetitions === 1 ? '6 dias' : `${Math.max(1, Math.round(card.interval_days * card.ease_factor))}d`}</span>
            </button>
            <button class="rate-btn rate-easy" data-rating="easy">
              <span>4 • Fácil</span>
              <span style="font-size: 0.74rem; opacity: 0.85;">${card.repetitions === 0 ? '4 dias' : `${Math.max(4, Math.round(card.interval_days * card.ease_factor * 1.3))}d`}</span>
            </button>
          </div>
        ` : `
          <div class="glass-panel" style="padding: 40px; text-align: center;">
            <div style="font-size: 2.5rem; margin-bottom: 10px;">🎉</div>
            <h3 style="margin-bottom: 8px;">Tudo revisado por hoje!</h3>
            <p style="color: var(--color-text-sub); max-width: 480px; margin: 0 auto 20px auto;">
              ${this.totalCards > 0
                ? 'Você completou todos os flashcards agendados para agora. O algoritmo de revisão espaçada vai trazê-los de volta no momento ideal.'
                : 'Conclua uma aula ou clique em "Gerar Novos Cards" para criar flashcards a partir do seu histórico.'}
            </p>
            <div style="display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
              <button id="fc-empty-gen" class="btn-primary">✨ Gerar Novos Cards dos Meus Erros</button>
              <button id="fc-empty-back" class="btn-secondary">Voltar às Aulas</button>
            </div>
          </div>
        `}
      </div>
    `;

    this.querySelector('#fc-back-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'missions' } }));
    });
    this.querySelector('#fc-empty-back')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'missions' } }));
    });
    this.querySelector('#fc-generate-btn')?.addEventListener('click', () => this.generateCards());
    this.querySelector('#fc-empty-gen')?.addEventListener('click', () => this.generateCards());

    this.querySelector('#flashcard-scene')?.addEventListener('click', (e) => {
      if (e.target.closest('#speak-answer-btn')) return;
      this.flipCard();
    });
    this.querySelector('#flip-btn')?.addEventListener('click', () => this.flipCard());
    this.querySelector('#speak-answer-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (card) this.speakAnswer(card.back_answer);
    });

    this.querySelectorAll('.rate-btn').forEach(btn => {
      btn.addEventListener('click', () => this.submitReview(btn.dataset.rating));
    });
  }
}

customElements.define('view-flashcards', ViewFlashcards);
