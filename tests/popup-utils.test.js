// Tests for PopupUtils

const fs = require('fs');
const path = require('path');

// Load the popup utils module
const popupUtilsPath = path.join(__dirname, '../extension/popup/popup-utils.js');
const popupUtilsCode = fs.readFileSync(popupUtilsPath, 'utf8');
eval(popupUtilsCode);

describe('PopupUtils', () => {
  describe('icons', () => {
    it('should define all required icons', () => {
      expect(PopupUtils.icons.eyeOpen).toBeDefined();
      expect(PopupUtils.icons.eyeClosed).toBeDefined();
      expect(PopupUtils.icons.spinner).toBeDefined();
      expect(PopupUtils.icons.checkmark).toBeDefined();
      expect(PopupUtils.icons.trash).toBeDefined();
    });

    it('should have valid SVG icons', () => {
      Object.values(PopupUtils.icons).forEach((icon) => {
        expect(icon).toContain('<svg');
        expect(icon).toContain('</svg>');
      });
    });
  });

  describe('defaults', () => {
    it('should define all default settings', () => {
      expect(PopupUtils.defaults.openrouterApiKey).toBeDefined();
      expect(PopupUtils.defaults.aiModel).toBeDefined();
      expect(PopupUtils.defaults.githubToken).toBeDefined();
      expect(PopupUtils.defaults.autoReview).toBeDefined();
      expect(PopupUtils.defaults.reviewDepth).toBeDefined();
      expect(PopupUtils.defaults.encryptionEnabled).toBeDefined();
    });

    it('should have correct default values', () => {
      expect(PopupUtils.defaults.openrouterApiKey).toBe('');
      expect(PopupUtils.defaults.aiModel).toBe('anthropic/claude-3.5-sonnet');
      expect(PopupUtils.defaults.githubToken).toBe('');
      expect(PopupUtils.defaults.autoReview).toBe(false);
      expect(PopupUtils.defaults.reviewDepth).toBe('medium');
      expect(PopupUtils.defaults.encryptionEnabled).toBe(false);
    });
  });

  describe('setupPasswordToggle', () => {
    let toggleBtn;
    let inputField;

    beforeEach(() => {
      toggleBtn = {
        innerHTML: '',
        addEventListener: jest.fn(),
      };
      inputField = {
        getAttribute: jest.fn(() => 'password'),
        setAttribute: jest.fn(),
      };
    });

    it('should set initial icon', () => {
      PopupUtils.setupPasswordToggle(toggleBtn, inputField);
      expect(toggleBtn.innerHTML).toBe(PopupUtils.icons.eyeOpen);
    });

    it('should add click event listener', () => {
      PopupUtils.setupPasswordToggle(toggleBtn, inputField);
      expect(toggleBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should toggle between password and text type', () => {
      PopupUtils.setupPasswordToggle(toggleBtn, inputField);

      const clickHandler = toggleBtn.addEventListener.mock.calls[0][1];

      // First click - show password
      inputField.getAttribute.mockReturnValue('password');
      clickHandler();
      expect(inputField.setAttribute).toHaveBeenCalledWith('type', 'text');
      expect(toggleBtn.innerHTML).toBe(PopupUtils.icons.eyeClosed);

      // Second click - hide password
      inputField.getAttribute.mockReturnValue('text');
      clickHandler();
      expect(inputField.setAttribute).toHaveBeenCalledWith('type', 'password');
      expect(toggleBtn.innerHTML).toBe(PopupUtils.icons.eyeOpen);
    });

    it('should handle null toggle button', () => {
      expect(() => PopupUtils.setupPasswordToggle(null, inputField)).not.toThrow();
    });

    it('should handle null input field', () => {
      expect(() => PopupUtils.setupPasswordToggle(toggleBtn, null)).not.toThrow();
    });

    it('should handle both parameters null', () => {
      expect(() => PopupUtils.setupPasswordToggle(null, null)).not.toThrow();
    });
  });

  describe('setButtonLoading', () => {
    let button;

    beforeEach(() => {
      button = {
        disabled: false,
        innerHTML: '',
      };
    });

    it('should disable button and show loading state', () => {
      PopupUtils.setButtonLoading(button, 'Loading...');

      expect(button.disabled).toBe(true);
      expect(button.innerHTML).toContain(PopupUtils.icons.spinner);
      expect(button.innerHTML).toContain('Loading...');
    });

    it('should use default text if not provided', () => {
      PopupUtils.setButtonLoading(button);

      expect(button.innerHTML).toContain('Loading...');
    });

    it('should handle null button', () => {
      expect(() => PopupUtils.setButtonLoading(null)).not.toThrow();
    });

    it('should handle custom loading text', () => {
      PopupUtils.setButtonLoading(button, 'Please wait...');

      expect(button.innerHTML).toContain('Please wait...');
    });
  });

  describe('setButtonSuccess', () => {
    let button;

    beforeEach(() => {
      button = {
        disabled: true,
        innerHTML: '',
      };
    });

    it('should enable button and show success state', () => {
      PopupUtils.setButtonSuccess(button, 'Success');

      expect(button.disabled).toBe(false);
      expect(button.innerHTML).toContain(PopupUtils.icons.checkmark);
      expect(button.innerHTML).toContain('Success');
    });

    it('should use default checkmark icon', () => {
      PopupUtils.setButtonSuccess(button, 'Done');

      expect(button.innerHTML).toContain(PopupUtils.icons.checkmark);
    });

    it('should allow custom icon', () => {
      const customIcon = '<svg>custom</svg>';
      PopupUtils.setButtonSuccess(button, 'Done', customIcon);

      expect(button.innerHTML).toContain(customIcon);
      expect(button.innerHTML).not.toContain(PopupUtils.icons.checkmark);
    });

    it('should handle null button', () => {
      expect(() => PopupUtils.setButtonSuccess(null, 'Success')).not.toThrow();
    });
  });

  describe('setButtonNormal', () => {
    let button;

    beforeEach(() => {
      button = {
        disabled: true,
        innerHTML: '',
      };
    });

    it('should enable button and set normal state', () => {
      PopupUtils.setButtonNormal(button, 'Save');

      expect(button.disabled).toBe(false);
      expect(button.innerHTML).toBe('Save');
    });

    it('should include icon if provided', () => {
      const icon = '<svg>icon</svg>';
      PopupUtils.setButtonNormal(button, 'Save', icon);

      expect(button.innerHTML).toContain(icon);
      expect(button.innerHTML).toContain('Save');
    });

    it('should work without icon', () => {
      PopupUtils.setButtonNormal(button, 'Submit', '');

      expect(button.innerHTML).toBe('Submit');
    });

    it('should handle null button', () => {
      expect(() => PopupUtils.setButtonNormal(null, 'Save')).not.toThrow();
    });
  });

  describe('showStatus', () => {
    let statusElement;

    beforeEach(() => {
      jest.useFakeTimers();
      statusElement = {
        textContent: '',
        className: '',
        classList: {
          remove: jest.fn(),
          add: jest.fn(),
        },
      };
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should display success message', () => {
      PopupUtils.showStatus(statusElement, 'Success!', 'success', 5000);

      expect(statusElement.textContent).toBe('Success!');
      expect(statusElement.className).toBe('status-message success');
      expect(statusElement.classList.remove).toHaveBeenCalledWith('hidden');
    });

    it('should display error message', () => {
      PopupUtils.showStatus(statusElement, 'Error!', 'error', 5000);

      expect(statusElement.textContent).toBe('Error!');
      expect(statusElement.className).toBe('status-message error');
    });

    it('should hide message after duration', () => {
      PopupUtils.showStatus(statusElement, 'Test', 'success', 1000);

      expect(statusElement.classList.remove).toHaveBeenCalledWith('hidden');

      jest.advanceTimersByTime(1000);

      expect(statusElement.classList.add).toHaveBeenCalledWith('hidden');
    });

    it('should not hide if duration is 0', () => {
      PopupUtils.showStatus(statusElement, 'Test', 'success', 0);

      jest.advanceTimersByTime(10000);

      expect(statusElement.classList.add).not.toHaveBeenCalledWith('hidden');
    });

    it('should not hide if duration is negative', () => {
      PopupUtils.showStatus(statusElement, 'Test', 'success', -1);

      jest.advanceTimersByTime(10000);

      expect(statusElement.classList.add).not.toHaveBeenCalledWith('hidden');
    });

    it('should use default type if not specified', () => {
      PopupUtils.showStatus(statusElement, 'Test');

      expect(statusElement.className).toContain('success');
    });

    it('should use default duration if not specified', () => {
      PopupUtils.showStatus(statusElement, 'Test', 'success');

      jest.advanceTimersByTime(4999);
      expect(statusElement.classList.add).not.toHaveBeenCalledWith('hidden');

      jest.advanceTimersByTime(1);
      expect(statusElement.classList.add).toHaveBeenCalledWith('hidden');
    });

    it('should handle null status element', () => {
      expect(() => PopupUtils.showStatus(null, 'Test', 'success')).not.toThrow();
    });
  });

  describe('validateMasterPassword', () => {
    it('should validate password with at least 8 characters', () => {
      const result = PopupUtils.validateMasterPassword('12345678');

      expect(result.valid).toBe(true);
    });

    it('should reject password with less than 8 characters', () => {
      const result = PopupUtils.validateMasterPassword('1234567');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('at least 8 characters');
    });

    it('should reject empty password', () => {
      const result = PopupUtils.validateMasterPassword('');

      expect(result.valid).toBe(false);
      expect(result.message).toBeDefined();
    });

    it('should reject null password', () => {
      const result = PopupUtils.validateMasterPassword(null);

      expect(result.valid).toBe(false);
      expect(result.message).toBeDefined();
    });

    it('should accept exactly 8 characters', () => {
      const result = PopupUtils.validateMasterPassword('12345678');

      expect(result.valid).toBe(true);
    });

    it('should accept long passwords', () => {
      const result = PopupUtils.validateMasterPassword('a'.repeat(100));

      expect(result.valid).toBe(true);
    });

    it('should accept special characters', () => {
      const result = PopupUtils.validateMasterPassword('P@ssw0rd!');

      expect(result.valid).toBe(true);
    });

    it('should accept unicode characters', () => {
      const result = PopupUtils.validateMasterPassword('パスワード123');

      expect(result.valid).toBe(true);
    });
  });

  describe('validateApiKey', () => {
    it('should validate non-empty API key', () => {
      const result = PopupUtils.validateApiKey('sk-test-1234567890');

      expect(result.valid).toBe(true);
    });

    it('should reject empty API key', () => {
      const result = PopupUtils.validateApiKey('');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('required');
    });

    it('should reject null API key', () => {
      const result = PopupUtils.validateApiKey(null);

      expect(result.valid).toBe(false);
      expect(result.message).toContain('required');
    });

    it('should reject API key with only whitespace', () => {
      const result = PopupUtils.validateApiKey('   ');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('required');
    });

    it('should reject very short API key', () => {
      const result = PopupUtils.validateApiKey('short');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('too short');
    });

    it('should accept API key with exactly 10 characters', () => {
      const result = PopupUtils.validateApiKey('1234567890');

      expect(result.valid).toBe(true);
    });

    it('should accept long API keys', () => {
      const result = PopupUtils.validateApiKey('sk-test-' + 'a'.repeat(50));

      expect(result.valid).toBe(true);
    });
  });

  describe('addRotationAnimation', () => {
    beforeEach(() => {
      // Clear any existing styles
      document.head.innerHTML = '';
    });

    it('should add rotation animation style to document', () => {
      PopupUtils.addRotationAnimation();

      const styles = document.head.querySelectorAll('style');
      expect(styles.length).toBeGreaterThan(0);
    });

    it('should include rotation keyframes', () => {
      PopupUtils.addRotationAnimation();

      const styleElement = document.head.querySelector('style');
      expect(styleElement.textContent).toContain('@keyframes rotate');
      expect(styleElement.textContent).toContain('transform: rotate(0deg)');
      expect(styleElement.textContent).toContain('transform: rotate(360deg)');
    });

    it('should not duplicate styles if called multiple times', () => {
      PopupUtils.addRotationAnimation();
      const initialCount = document.head.querySelectorAll('style').length;

      PopupUtils.addRotationAnimation();
      const afterCount = document.head.querySelectorAll('style').length;

      expect(afterCount).toBeGreaterThanOrEqual(initialCount);
    });
  });

  describe('getElementValue', () => {
    it('should get trimmed value from element', () => {
      const element = { value: '  test value  ' };
      const result = PopupUtils.getElementValue(element);

      expect(result).toBe('test value');
    });

    it('should return default value for null element', () => {
      const result = PopupUtils.getElementValue(null, 'default');

      expect(result).toBe('default');
    });

    it('should return empty string as default if not specified', () => {
      const result = PopupUtils.getElementValue(null);

      expect(result).toBe('');
    });

    it('should handle empty value', () => {
      const element = { value: '' };
      const result = PopupUtils.getElementValue(element);

      expect(result).toBe('');
    });

    it('should handle value with only whitespace', () => {
      const element = { value: '   ' };
      const result = PopupUtils.getElementValue(element);

      expect(result).toBe('');
    });
  });

  describe('setElementValue', () => {
    it('should set element value', () => {
      const element = { value: '' };
      PopupUtils.setElementValue(element, 'new value');

      expect(element.value).toBe('new value');
    });

    it('should handle null value', () => {
      const element = { value: 'old' };
      PopupUtils.setElementValue(element, null);

      expect(element.value).toBe('');
    });

    it('should handle empty string', () => {
      const element = { value: 'old' };
      PopupUtils.setElementValue(element, '');

      expect(element.value).toBe('');
    });

    it('should handle null element', () => {
      expect(() => PopupUtils.setElementValue(null, 'value')).not.toThrow();
    });
  });

  describe('setCheckboxState', () => {
    it('should set checkbox to checked', () => {
      const checkbox = { checked: false };
      PopupUtils.setCheckboxState(checkbox, true);

      expect(checkbox.checked).toBe(true);
    });

    it('should set checkbox to unchecked', () => {
      const checkbox = { checked: true };
      PopupUtils.setCheckboxState(checkbox, false);

      expect(checkbox.checked).toBe(false);
    });

    it('should convert truthy values to true', () => {
      const checkbox = { checked: false };
      PopupUtils.setCheckboxState(checkbox, 'yes');

      expect(checkbox.checked).toBe(true);
    });

    it('should convert falsy values to false', () => {
      const checkbox = { checked: true };
      PopupUtils.setCheckboxState(checkbox, 0);

      expect(checkbox.checked).toBe(false);
    });

    it('should handle null checkbox', () => {
      expect(() => PopupUtils.setCheckboxState(null, true)).not.toThrow();
    });

    it('should handle null value', () => {
      const checkbox = { checked: true };
      PopupUtils.setCheckboxState(checkbox, null);

      expect(checkbox.checked).toBe(false);
    });
  });

  describe('sanitizeSettingsForLog', () => {
    it('should mask API keys', () => {
      const settings = {
        openrouterApiKey: 'secret-key-123',
        githubToken: 'github-token-456',
        aiModel: 'test-model',
      };

      const sanitized = PopupUtils.sanitizeSettingsForLog(settings);

      expect(sanitized.openrouterApiKey).toBe('***SET***');
      expect(sanitized.githubToken).toBe('***SET***');
      expect(sanitized.aiModel).toBe('test-model');
    });

    it('should indicate when keys are not set', () => {
      const settings = {
        openrouterApiKey: '',
        githubToken: null,
      };

      const sanitized = PopupUtils.sanitizeSettingsForLog(settings);

      expect(sanitized.openrouterApiKey).toBe('***NOT SET***');
      expect(sanitized.githubToken).toBe('***NOT SET***');
    });

    it('should add boolean flags for key presence', () => {
      const settings = {
        openrouterApiKey: 'key',
        githubToken: '',
      };

      const sanitized = PopupUtils.sanitizeSettingsForLog(settings);

      expect(sanitized.hasOpenrouterApiKey).toBe(true);
      expect(sanitized.hasGithubToken).toBe(false);
    });

    it('should preserve non-sensitive settings', () => {
      const settings = {
        openrouterApiKey: 'key',
        aiModel: 'claude-3',
        reviewDepth: 'medium',
        autoReview: true,
      };

      const sanitized = PopupUtils.sanitizeSettingsForLog(settings);

      expect(sanitized.aiModel).toBe('claude-3');
      expect(sanitized.reviewDepth).toBe('medium');
      expect(sanitized.autoReview).toBe(true);
    });

    it('should handle empty settings object', () => {
      const settings = {};
      const sanitized = PopupUtils.sanitizeSettingsForLog(settings);

      expect(sanitized.openrouterApiKey).toBe('***NOT SET***');
      expect(sanitized.githubToken).toBe('***NOT SET***');
    });

    it('should not modify original settings object', () => {
      const settings = {
        openrouterApiKey: 'secret-key',
        aiModel: 'model',
      };

      const original = { ...settings };
      PopupUtils.sanitizeSettingsForLog(settings);

      expect(settings).toEqual(original);
    });
  });
});
