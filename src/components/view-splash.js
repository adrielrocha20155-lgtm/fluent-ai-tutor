class ViewSplash extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <style>
        .splash-stage {
          min-height: calc(100vh - 64px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          text-align: center;
          max-width: 780px;
          margin: 0 auto;
        }

        .splash-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 999px;
          background: var(--color-surface);
          border: var(--glass-border);
          color: var(--color-accent-secondary);
          font-size: 0.85rem;
          font-weight: 700;
          margin-bottom: 20px;
        }

        .splash-title {
          font-size: clamp(2.1rem, 4.5vw, 3.3rem);
          line-height: 1.15;
          margin-bottom: 16px;
          color: var(--color-text-main);
        }

        .splash-subtitle {
          font-size: 1.12rem;
          color: var(--color-text-sub);
          max-width: 600px;
          margin: 0 auto 32px auto;
          line-height: 1.6;
        }

        .splash-cta {
          background: var(--color-accent-primary);
          color: #ffffff;
          padding: 18px 44px;
          font-size: 1.15rem;
          font-weight: 800;
          border-radius: 9999px;
          box-shadow: var(--shadow-md), var(--shadow-glow);
          display: inline-flex;
          align-items: center;
          gap: 10px;
          transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
        }

        .splash-cta:hover {
          background: var(--color-accent-primary-hover);
          transform: translateY(-2px);
          box-shadow: 0 14px 32px rgba(5, 150, 105, 0.35);
        }

        .splash-pillars {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-top: 40px;
          width: 100%;
        }

        .pillar-chip {
          background: var(--color-surface);
          border: var(--glass-border);
          border-radius: var(--radius-md);
          padding: 14px 16px;
          text-align: left;
        }

        @media (max-width: 680px) {
          .splash-pillars {
            grid-template-columns: 1fr;
          }
        }
      </style>

      <section class="splash-stage">
        <div class="splash-badge">
          <span>🎙️</span>
          <span>1-on-1 Adaptive English Tutoring • CEFR A1–C2</span>
        </div>

        <h1 class="splash-title">Speak English Naturally, Without Fear of Mistakes</h1>

        <p class="splash-subtitle">
          Practice real-time 1-on-1 voice lessons calibrated to your level. Get gentle recasting during the call and structured, database-backed feedback afterward.
        </p>

        <button id="start-btn" class="splash-cta">
          <span>Start Learning</span>
          <span>→</span>
        </button>

        <div class="splash-pillars">
          <div class="pillar-chip">
            <div style="font-weight: 800; font-size: 0.9rem; margin-bottom: 4px; color: var(--color-accent-secondary);">🎯 Preply-Style Flow</div>
            <div style="font-size: 0.82rem; color: var(--color-text-sub);">Warm-up, target structure, guided roleplay & wrap-up.</div>
          </div>
          <div class="pillar-chip">
            <div style="font-weight: 800; font-size: 0.9rem; margin-bottom: 4px; color: var(--color-accent-secondary);">🧠 Krashen i+1</div>
            <div style="font-size: 0.82rem; color: var(--color-text-sub);">Low-anxiety coaching calibrated just above your CEFR level.</div>
          </div>
          <div class="pillar-chip">
            <div style="font-weight: 800; font-size: 0.9rem; margin-bottom: 4px; color: var(--color-accent-secondary);">📈 Weakness Loop</div>
            <div style="font-size: 0.82rem; color: var(--color-text-sub);">Every session logs your mistakes to personalize your next class.</div>
          </div>
        </div>
      </section>
    `;

    this.querySelector('#start-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('navigate', {
        bubbles: true,
        detail: { view: 'missions' }
      }));
    });
  }
}

customElements.define('view-splash', ViewSplash);
