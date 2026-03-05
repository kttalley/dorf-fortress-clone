/**
 * Loading Progress System
 * Provides a progress bar and themed status updates during world generation
 */

// Themed status messages in the style of the game
const STATUS_MESSAGES = {
  init: [
    'Dusting off an old tome...',
    'Lighting ancient lanterns...',
    'Preparing the chronicle...',
  ],
  llmConnect: [
    'Consulting the oracle...',
    'Awakening the thought engine...',
    'Consulting the deep archives...',
  ],
  scenario: [
    'Weaving tales of old...',
    'Inscribing destiny upon parchment...',
    'Choosing the threads of fate...',
  ],
  biomeGen: [
    'Carving out world biomes...',
    'Shaping mountains and valleys...',
    'Laying the bones of the earth...',
  ],
  mapGen: [
    'Hollowing out caverns...',
    'Tracing rivers through stone...',
    'Planting ancient forests...',
  ],
  history: [
    'Carving historical tales into stone walls...',
    'Recording the deeds of ages past...',
    'Summoning echoes of forgotten wars...',
  ],
  entities: [
    'Generating world entities...',
    'Breathing life into the dwarves...',
    'Calling forth creatures of the deep...',
  ],
  names: [
    'Carving names into the stone registry...',
    'Assigning names to the expedition...',
  ],
  weather: [
    'Conjuring clouds and winds...',
    'Stirring the elemental forces...',
    'Setting the seasons in motion...',
  ],
  finalize: [
    'Polishing the final details...',
    'Opening the gates...',
    'The world awakens...',
  ],
};

class LoadingProgress {
  constructor() {
    this.progressBar = null;
    this.progressFill = null;
    this.statusLog = null;
    this.loadingText = null;
    this.currentProgress = 0;
    this.statusMessages = [];
  }

  /**
   * Initialize the loading progress UI
   */
  init() {
    const loadingScreen = document.getElementById('loading-screen');
    if (!loadingScreen) return;

    // Get existing elements
    this.loadingText = loadingScreen.querySelector('.loading-text');
    const spinner = loadingScreen.querySelector('.loading-spinner');

    // Reorder: title at top, spinner and log in middle, progress bar at bottom
    if (this.loadingText && spinner) {
      // Move title to the top
      loadingScreen.insertBefore(this.loadingText, loadingScreen.firstChild);
    }

    // Create status log (goes after spinner)
    this.statusLog = document.createElement('div');
    this.statusLog.className = 'loading-status-log';

    // Create progress bar (goes at bottom)
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'loading-progress-bar';
    this.progressBar.innerHTML = `
      <div class="loading-progress-fill"></div>
    `;

    // Insert status log after spinner, progress bar at the end
    if (spinner) {
      spinner.after(this.statusLog);
    }
    loadingScreen.appendChild(this.progressBar);

    this.progressFill = this.progressBar.querySelector('.loading-progress-fill');

    // Inject styles
    this.injectStyles();
  }

  /**
   * Inject CSS styles for progress UI
   */
  injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Reorder loading screen layout */
      #loading-screen {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 2rem 0;
      }

      #loading-screen .loading-text {
        order: 1;
        margin-bottom: 2rem;
      }

      #loading-screen .loading-spinner {
        order: 2;
        margin-bottom: 1.5rem;
      }

      .loading-status-log {
        order: 3;
        width: 500px;
        max-width: 85vw;
        max-height: 200px;
        overflow-y: auto;
        margin: 0 auto 2rem auto;
        padding: 12px;
        background: rgba(15, 15, 20, 0.9);
        border: 1px solid rgba(50, 120, 50, 0.4);
        border-radius: 4px;
        font-size: 0.85rem;
        color: #6b8e6b;
        text-align: left;
        line-height: 1.6;
        flex-shrink: 0;
      }

      .loading-status-entry {
        margin-bottom: 8px;
        opacity: 0;
        animation: fadeIn 0.4s ease forwards;
      }

      .loading-status-entry:last-child {
        color: #33ff33;
      }

      .loading-progress-bar {
        order: 4;
        width: 400px;
        max-width: 80vw;
        height: 24px;
        background: rgba(10, 20, 10, 0.8);
        border: 2px solid rgba(50, 120, 50, 0.5);
        border-radius: 4px;
        overflow: hidden;
        margin: auto auto 0 auto;
        flex-shrink: 0;
      }

      .loading-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #1a4d1a 0%, #33ff33 100%);
        transition: width 0.3s ease;
        width: 0%;
        box-shadow: 0 0 10px rgba(51, 255, 51, 0.3);
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(-5px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* Scrollbar styling for status log - green theme */
      .loading-status-log::-webkit-scrollbar {
        width: 4px;
      }

      .loading-status-log::-webkit-scrollbar-track {
        background: rgba(20, 30, 20, 0.5);
      }

      .loading-status-log::-webkit-scrollbar-thumb {
        background: rgba(51, 255, 51, 0.3);
        border-radius: 2px;
      }

      @media (max-width: 640px) {
        .loading-status-log {
          font-size: 0.75rem;
          max-height: 150px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Update progress (0-100)
   */
  setProgress(percent) {
    this.currentProgress = Math.max(0, Math.min(100, percent));
    if (this.progressFill) {
      this.progressFill.style.width = `${this.currentProgress}%`;
    }
  }

  /**
   * Add a status message to the log
   * @param {string} stage - Stage key from STATUS_MESSAGES
   * @param {string} customMessage - Optional custom message
   */
  addStatus(stage, customMessage = null) {
    if (!this.statusLog) return;

    let message = customMessage;

    if (!message && STATUS_MESSAGES[stage]) {
      const messages = STATUS_MESSAGES[stage];
      message = messages[Math.floor(Math.random() * messages.length)];
    }

    if (!message) {
      message = 'Processing...';
    }

    const entry = document.createElement('div');
    entry.className = 'loading-status-entry';
    entry.textContent = `⟩ ${message}`;

    this.statusLog.appendChild(entry);
    this.statusMessages.push(message);

    // Auto-scroll to bottom
    this.statusLog.scrollTop = this.statusLog.scrollHeight;

    // Keep log from growing too large (max 20 entries)
    if (this.statusLog.children.length > 20) {
      this.statusLog.removeChild(this.statusLog.firstChild);
    }
  }

  /**
   * Update main loading text
   */
  setText(text) {
    if (this.loadingText) {
      this.loadingText.textContent = text;
    }
  }

  /**
   * Complete the loading process
   */
  complete() {
    this.setProgress(100);
    this.addStatus('finalize');
  }

  /**
   * Reset the progress UI
   */
  reset() {
    this.currentProgress = 0;
    this.statusMessages = [];
    if (this.progressFill) {
      this.progressFill.style.width = '0%';
    }
    if (this.statusLog) {
      this.statusLog.innerHTML = '';
    }
  }
}

// Create singleton instance
const loadingProgress = new LoadingProgress();

// Export functions
export function initLoadingProgress() {
  loadingProgress.init();
}

export function setLoadingProgress(percent) {
  loadingProgress.setProgress(percent);
}

export function addLoadingStatus(stage, customMessage = null) {
  loadingProgress.addStatus(stage, customMessage);
}

export function setLoadingText(text) {
  loadingProgress.setText(text);
}

export function completeLoading() {
  loadingProgress.complete();
}

export function resetLoadingProgress() {
  loadingProgress.reset();
}
