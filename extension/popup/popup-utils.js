// Popup utilities for GitHub PR AI Reviewer
// Shared constants and helper functions for popup.js

const PopupUtils = {
  // SVG Icons
  icons: {
    eyeOpen: `
      <svg class="eye-icon" height="16" width="16" viewBox="0 0 16 16">
        <path fill="currentColor" d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 0 1 0-1.798c.45-.677 1.367-1.931 2.637-3.022C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.825.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z"></path>
      </svg>
    `,

    eyeClosed: `
      <svg class="eye-icon" height="16" width="16" viewBox="0 0 16 16">
        <path fill="currentColor" d="m10.79 12.912-1.614-1.615a3.5 3.5 0 0 1-4.474-4.474l-2.06-2.06C.938 6.278 0 8 0 8s3 5.5 8 5.5a7.029 7.029 0 0 0 2.79-.588ZM5.21 3.088A7.028 7.028 0 0 1 8 2.5c5 0 8 5.5 8 5.5s-.939 1.721-2.641 3.238l-2.062-2.062a3.5 3.5 0 0 0-4.474-4.474L5.21 3.089Z"></path>
        <path fill="currentColor" d="M5.525 7.646a2.5 2.5 0 0 0 2.829 2.829l-2.83-2.829Zm4.95.708-2.829-2.83a2.5 2.5 0 0 1 2.829 2.829Zm3.171 6-12-12 .708-.708 12 12-.708.708Z"></path>
      </svg>
    `,

    spinner: `
      <svg class="btn-icon" style="animation: rotate 1s linear infinite;" height="16" width="16" viewBox="0 0 16 16">
        <path fill="currentColor" d="M8 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" opacity="0.3"></path>
        <path fill="currentColor" d="M8 0a8 8 0 0 1 8 8h-1.5A6.5 6.5 0 0 0 8 1.5V0Z"></path>
      </svg>
    `,

    checkmark: `
      <svg class="btn-icon" height="16" width="16" viewBox="0 0 16 16">
        <path fill="currentColor" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>
      </svg>
    `,

    trash: `
      <svg class="btn-icon" height="16" width="16" viewBox="0 0 16 16">
        <path fill="currentColor" d="M6.5 1.75a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.75 1.75 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15zM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25z"></path>
      </svg>
    `,
  },

  // Default settings
  defaults: {
    openrouterApiKey: "",
    aiModel: "anthropic/claude-3.5-sonnet",
    githubToken: "",
    autoReview: false,
    reviewDepth: "medium",
    encryptionEnabled: false,
  },

  /**
   * Setup password toggle for input field
   * @param {HTMLElement} toggleBtn - Toggle button element
   * @param {HTMLElement} inputField - Input field element
   */
  setupPasswordToggle(toggleBtn, inputField) {
    if (!toggleBtn || !inputField) {
      return;
    }

    toggleBtn.innerHTML = this.icons.eyeOpen;

    toggleBtn.addEventListener("click", () => {
      const type = inputField.getAttribute("type");
      if (type === "password") {
        inputField.setAttribute("type", "text");
        toggleBtn.innerHTML = this.icons.eyeClosed;
      } else {
        inputField.setAttribute("type", "password");
        toggleBtn.innerHTML = this.icons.eyeOpen;
      }
    });
  },

  /**
   * Set button to loading state
   * @param {HTMLElement} button - Button element
   * @param {string} text - Loading text
   */
  setButtonLoading(button, text = "Loading...") {
    if (!button) {
      return;
    }
    button.disabled = true;
    button.innerHTML = `${this.icons.spinner} ${text}`;
  },

  /**
   * Set button to success state
   * @param {HTMLElement} button - Button element
   * @param {string} text - Button text
   * @param {string} icon - Icon HTML (optional)
   */
  setButtonSuccess(button, text, icon = null) {
    if (!button) {
      return;
    }
    button.disabled = false;
    const iconHtml = icon || this.icons.checkmark;
    button.innerHTML = `${iconHtml} ${text}`;
  },

  /**
   * Set button to normal state
   * @param {HTMLElement} button - Button element
   * @param {string} text - Button text
   * @param {string} icon - Icon HTML (optional)
   */
  setButtonNormal(button, text, icon = "") {
    if (!button) {
      return;
    }
    button.disabled = false;
    button.innerHTML = icon ? `${icon} ${text}` : text;
  },

  /**
   * Show status message
   * @param {HTMLElement} statusElement - Status message element
   * @param {string} message - Message text
   * @param {string} type - Message type (success, error)
   * @param {number} duration - Display duration in milliseconds
   */
  showStatus(statusElement, message, type = "success", duration = 5000) {
    if (!statusElement) {
      console.error("Status message element not found!");
      return;
    }

    console.log("Status:", type, message);
    statusElement.textContent = message;
    statusElement.className = `status-message ${type}`;
    statusElement.classList.remove("hidden");

    if (duration > 0) {
      setTimeout(() => {
        statusElement.classList.add("hidden");
      }, duration);
    }
  },

  /**
   * Validate master password
   * @param {string} password - Password to validate
   * @returns {Object} Validation result
   */
  validateMasterPassword(password) {
    if (!password || password.length < 8) {
      return {
        valid: false,
        message: "Master password must be at least 8 characters",
      };
    }
    return { valid: true };
  },

  /**
   * Validate OpenRouter API key format
   * @param {string} apiKey - API key to validate
   * @returns {Object} Validation result
   */
  validateApiKey(apiKey) {
    if (!apiKey || apiKey.trim().length === 0) {
      return {
        valid: false,
        message: "OpenRouter API key is required",
      };
    }
    if (apiKey.length < 10) {
      return {
        valid: false,
        message: "API key appears to be invalid (too short)",
      };
    }
    return { valid: true };
  },

  /**
   * Add rotation animation style to document
   */
  addRotationAnimation() {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes rotate {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  },

  /**
   * Safely get element value
   * @param {HTMLElement} element - Input element
   * @param {string} defaultValue - Default value if element not found
   * @returns {string} Element value
   */
  getElementValue(element, defaultValue = "") {
    return element ? element.value.trim() : defaultValue;
  },

  /**
   * Safely set element value
   * @param {HTMLElement} element - Input element
   * @param {string} value - Value to set
   */
  setElementValue(element, value) {
    if (element) {
      element.value = value || "";
    }
  },

  /**
   * Safely set checkbox checked state
   * @param {HTMLElement} checkbox - Checkbox element
   * @param {boolean} checked - Checked state
   */
  setCheckboxState(checkbox, checked) {
    if (checkbox) {
      checkbox.checked = !!checked;
    }
  },

  /**
   * Log settings without sensitive data
   * @param {Object} settings - Settings object
   * @returns {Object} Sanitized settings for logging
   */
  sanitizeSettingsForLog(settings) {
    return {
      ...settings,
      openrouterApiKey: settings.openrouterApiKey ? "***SET***" : "***NOT SET***",
      githubToken: settings.githubToken ? "***SET***" : "***NOT SET***",
      hasOpenrouterApiKey: !!settings.openrouterApiKey,
      hasGithubToken: !!settings.githubToken,
    };
  },
};

// Make available globally
if (typeof window !== "undefined") {
  window.PopupUtils = PopupUtils;
}

// CommonJS export for Node.js/Jest testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = { PopupUtils };
}
