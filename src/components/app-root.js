import './view-splash.js';
import './view-missions.js';
import './view-chat.js';
import './view-summary.js';
import './view-flashcards.js';

class AppRoot extends HTMLElement {
    constructor() {
        super();
        this.state = {
            view: 'splash', // splash, missions, chat, summary
            selectedMission: null,
            selectedLanguage: null,
            selectedFromLanguage: null,
            selectedMode: 'preply_tutor',
            sessionResult: null
        };
    }

    connectedCallback() {
        this.innerHTML = '';

        this.themes = ['dark', 'light', 'system'];
        this.currentTheme = localStorage.getItem('theme') || 'dark';

        this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this.mediaQuery.addEventListener('change', () => {
            if (this.currentTheme === 'system') {
                this.applyTheme('system');
            }
        });

        this.applyTheme(this.currentTheme);

        // Compact Top Header
        const header = document.createElement('header');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 24px;
            max-width: 1120px;
            margin: 0 auto;
            width: 100%;
        `;

        header.innerHTML = `
            <button id="brand-home" aria-label="Go to Dashboard" style="
                background: transparent;
                color: var(--color-text-main);
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 800;
                font-size: 1rem;
                padding: 4px 8px;
                border-radius: var(--radius-sm);
            ">
                <span style="
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 28px;
                    height: 28px;
                    border-radius: 8px;
                    background: var(--color-accent-primary);
                    color: #ffffff;
                    font-size: 0.9rem;
                ">F</span>
                <span>FluentAI</span>
                <span style="font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--color-surface-elevated); color: var(--color-accent-secondary); border: var(--glass-border);">1-on-1 Tutor</span>
            </button>

            <button id="theme-toggle" aria-label="Toggle Theme" style="
                background: var(--color-surface);
                color: var(--color-text-main);
                border: var(--glass-border);
                border-radius: 50%;
                width: 38px;
                height: 38px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 1.1rem;
            ">
                <span class="theme-icon"></span>
            </button>
        `;

        this.appendChild(header);

        header.querySelector('#brand-home').addEventListener('click', () => {
            if (this.state.view !== 'splash' && this.state.view !== 'missions') {
                this.state.view = 'missions';
                this.render();
            }
        });

        const themeBtn = header.querySelector('#theme-toggle');
        themeBtn.onclick = () => this.cycleTheme();
        this.themeBtn = themeBtn;
        this.updateThemeBtnIcon();

        this.viewContainer = document.createElement('div');
        this.viewContainer.style.width = '100%';
        this.appendChild(this.viewContainer);

        this.render();

        this.addEventListener('navigate', (e) => {
            this.state.view = e.detail.view;
            if (e.detail.mission) this.state.selectedMission = e.detail.mission;
            if (e.detail.language) this.state.selectedLanguage = e.detail.language;
            if (e.detail.fromLanguage) this.state.selectedFromLanguage = e.detail.fromLanguage;
            if (e.detail.mode) this.state.selectedMode = e.detail.mode;
            if (e.detail.result) this.state.sessionResult = e.detail.result;
            window.scrollTo({ top: 0, behavior: 'instant' });
            this.render();
        });
    }

    applyTheme(theme) {
        if (theme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.setLightMode(!prefersDark);
        } else {
            this.setLightMode(theme === 'light');
        }
    }

    setLightMode(isLight) {
        if (isLight) {
            document.body.classList.add('light-mode');
        } else {
            document.body.classList.remove('light-mode');
        }
    }

    cycleTheme() {
        const modes = ['dark', 'light', 'system'];
        const currentIdx = modes.indexOf(this.currentTheme);
        const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % modes.length;

        this.currentTheme = modes[nextIdx];
        localStorage.setItem('theme', this.currentTheme);
        this.applyTheme(this.currentTheme);
        this.updateThemeBtnIcon();
    }

    updateThemeBtnIcon() {
        if (!this.themeBtn) return;
        const map = {
            light: { icon: '☀️', title: 'Light Mode' },
            dark: { icon: '🌙', title: 'Dark Mode' },
            system: { icon: '💻', title: 'System Default' }
        };
        const cfg = map[this.currentTheme] || map.dark;
        const iconSpan = this.themeBtn.querySelector('.theme-icon');
        if (iconSpan) iconSpan.textContent = cfg.icon;
        this.themeBtn.title = cfg.title;
    }

    render() {
        if (!this.viewContainer) return;

        this.viewContainer.innerHTML = '';
        let currentView;

        switch (this.state.view) {
            case 'splash':
                currentView = document.createElement('view-splash');
                break;
            case 'missions':
            case 'mission-selector':
                currentView = document.createElement('view-missions');
                break;
            case 'chat':
                currentView = document.createElement('view-chat');
                currentView.mission = this.state.selectedMission;
                currentView.language = this.state.selectedLanguage;
                currentView.fromLanguage = this.state.selectedFromLanguage;
                currentView.mode = this.state.selectedMode;
                break;
            case 'summary':
                currentView = document.createElement('view-summary');
                currentView.result = this.state.sessionResult;
                break;
            case 'flashcards':
                currentView = document.createElement('view-flashcards');
                break;
            default:
                currentView = document.createElement('view-splash');
        }

        currentView.classList.add('fade-in');
        this.viewContainer.appendChild(currentView);
    }
}

customElements.define('app-root', AppRoot);
