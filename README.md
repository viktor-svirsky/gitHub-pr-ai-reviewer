# GitHub PR AI Reviewer

A secure Chrome extension that provides AI-powered code reviews for GitHub Pull Requests using OpenRouter API with optional encryption for API keys.

## Features

- 🤖 **AI-Powered Reviews**: Get intelligent code reviews using state-of-the-art LLMs via OpenRouter
- 📊 **Benchmark Scores**: Model selection enhanced with ZeroEval benchmark scores (SWE-bench, GPQA, AIME) to help you choose the best model
- 🔒 **Encrypted Storage**: Optional AES-256-GCM encryption for API keys with master password
- 🎯 **One-Click Analysis**: Review any GitHub PR with a single button click
- ⚡ **Direct API Integration**: No backend required - extension communicates directly with OpenRouter
- 🎨 **Native GitHub UI**: Seamlessly integrated into GitHub's interface
- 🌙 **Dark Mode**: Full support for GitHub's dark theme
- 🔐 **Local Storage**: All data stays on your device, never synced to cloud

## Architecture

```
┌─────────────────┐      ┌─────────────┐
│ Chrome Extension│─────▶│ OpenRouter  │
│   (Frontend)    │      │  (LLM API)  │
└─────────────────┘      └─────────────┘
        │
        ▼
   ┌─────────┐
   │ GitHub  │
   │   API   │
   └─────────┘
```

**Key Features:**
- ✅ No backend server needed
- ✅ Secure local storage with optional encryption
- ✅ Direct OpenRouter API integration
- ✅ Master password protection for API keys
- ✅ AES-256-GCM encryption

## Prerequisites

- Google Chrome or Chromium-based browser
- An OpenRouter API key ([Get one here](https://openrouter.ai/keys))
- (Optional) GitHub Personal Access Token for private repos

## Installation

### 1. Clone the Repository

```bash
git clone git@github.com:viktor-svirsky/gitHub-pr-ai-reviewer.git
cd gitHub-pr-ai-reviewer
```

### 2. Install the Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `extension` folder from this repository
5. The extension icon should appear in your Chrome toolbar

### 3. Configure the Extension

1. Click the extension icon in your toolbar
2. **Get an OpenRouter API key** from [openrouter.ai/keys](https://openrouter.ai/keys)
3. Enter your OpenRouter API key
4. Choose your preferred AI model from the dropdown
   - Models display benchmark scores to help you choose:
     - **SWE-bench**: Software engineering capabilities (most relevant for code reviews)
     - **GPQA**: Graduate-level reasoning abilities
     - **AIME**: Mathematical reasoning skills
   - Example: `Claude 3.5 Sonnet (200K) | $3.00/$15.00/1K | SWE: 49.0%, GPQA: 67.2%`
5. (Optional) Enable encryption and set a master password for enhanced security
6. (Optional) Add GitHub Personal Access Token for private repos
7. Click "Save Settings"

## Security Features

### Encryption

The extension offers optional AES-256-GCM encryption for your API keys:

**To Enable Encryption:**
1. Open extension settings (click the extension icon)
2. Check "Enable Encryption"
3. Enter a master password (minimum 8 characters)
4. Enter your API keys
5. Click "Save Settings"

**How it works:**
- API keys are encrypted before being stored locally
- Master password is never stored - only used to derive encryption key
- Uses PBKDF2 with 100,000 iterations and SHA-256
- Encrypted with AES-256-GCM for authenticated encryption
- Each encryption uses a unique initialization vector (IV)

**Important Notes:**
- ⚠️ If you forget your master password, you'll need to reset the extension and re-enter your API keys
- ⚠️ Master password is required each time you save settings when encryption is enabled
- ⚠️ Encrypted keys cannot be used in content scripts without additional implementation
- ✅ API keys are stored locally on your device only (not synced across devices)
- ✅ For maximum security, always use encryption when storing sensitive API keys

### Storage Location

All settings are stored in `chrome.storage.local`, which means:
- ✅ Data stays on your device only
- ✅ Not synced across browsers or devices
- ✅ Isolated from other extensions
- ⚠️ Data is stored in your Chrome profile directory

## Usage

1. Navigate to any GitHub Pull Request
2. Look for the green "AI Review" button in the PR header
3. Click the button to start the AI review
4. Wait for the analysis to complete (usually 10-30 seconds)
5. Review the AI-generated feedback displayed at the top of the PR

### Review Options

Configure in extension settings:
- **Quick**: Fast overview focusing on critical issues only
- **Medium**: Balanced analysis with good coverage (recommended)
- **Deep**: Thorough review examining all aspects in detail

## Supported AI Models

Via OpenRouter, you can choose from various models. The extension displays benchmark scores from [ZeroEval](https://api.zeroeval.com/leaderboard/models/full) to help you make informed decisions:

### Understanding Benchmark Scores

When selecting a model, you'll see performance metrics displayed alongside each option:

- **SWE-bench** (Software Engineering): Measures the model's ability to solve real-world software engineering tasks. Most relevant for code reviews.
- **GPQA** (Graduate-Level Reasoning): Tests complex reasoning and problem-solving capabilities.
- **AIME** (Mathematical Reasoning): Evaluates mathematical and logical reasoning skills.

**Example display format:**
```
Claude 3.5 Sonnet (200K) | $3.00/$15.00/1K | SWE: 49.0%, GPQA: 67.2%, AIME: 54.8%
```

Higher scores indicate better performance in that category. Not all models have benchmark scores available.

### Recommended Models

| Model | Provider | Best For | Approx. Cost per Review |
|-------|----------|----------|-------------------------|
| **Claude 3.5 Sonnet** ⭐ | Anthropic | Code reviews, complex logic | $0.01-0.05 |
| Claude 3 Opus | Anthropic | Maximum quality | $0.05-0.15 |
| Claude 3 Sonnet | Anthropic | Balanced performance | $0.01-0.04 |
| GPT-4 Turbo | OpenAI | Fast, good quality | $0.02-0.08 |
| GPT-4 | OpenAI | High quality | $0.05-0.15 |
| Gemini Pro | Google | Fast, cost-effective | $0.005-0.02 |
| Llama 3 70B | Meta | Open source, good value | $0.005-0.02 |

⭐ = Recommended for code reviews

Change the model anytime in extension settings.

## Costs

- **OpenRouter**: Pay-per-use based on model selection
  - Typical PR review: 5,000-20,000 tokens
  - Cost range: $0.005-0.15 per review depending on model
  - See [OpenRouter pricing](https://openrouter.ai/docs#models) for details

## Development

### Project Structure

```
chrome-plugin/
├── extension/                 # Chrome extension source
│   ├── manifest.json         # Extension manifest (v3)
│   ├── scripts/
│   │   ├── encryption.js     # Secure storage with AES-256-GCM
│   │   ├── background.js     # Service worker
│   │   └── content.js        # GitHub page integration
│   ├── popup/
│   │   ├── popup.html        # Settings UI
│   │   ├── popup.css         # Popup styles
│   │   └── popup.js          # Settings logic
│   ├── styles/
│   │   └── content.css       # Injected styles
│   └── icons/                # Extension icons
└── README.md                 # This file
```

### Making Changes

The extension doesn't require a build step. To test changes:

1. Make your changes to the extension files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes on a GitHub PR

### Debug Tools

Open the browser console (F12) on any GitHub PR page and use:

```javascript
// Check available DOM selectors
debugAIReview.checkSelectors()

// Test display with mock data
debugAIReview.testDisplay()

// Check extension state
debugAIReview.checkState()

// Manually trigger review
debugAIReview.trigger()

// Clear the review display
debugAIReview.clear()
```

## Troubleshooting

### "OpenRouter API key not configured"

- Open the extension settings (click the extension icon)
- Add your OpenRouter API key from [openrouter.ai/keys](https://openrouter.ai/keys)
- Click "Save Settings"

### "Failed to fetch PR diff"

- Ensure you're on a public repository or logged into GitHub
- For private repos, add a GitHub Personal Access Token in settings
- Check that the PR number is valid
- GitHub API rate limits: 60 requests/hour (unauthenticated), 5,000/hour (with token)

### Review button not appearing

- Refresh the GitHub page
- Check that you're on a PR page (not issues, commits, etc.)
- Verify the extension is enabled in `chrome://extensions/`
- Check browser console (F12) for errors

### Encryption issues

**"Master password must be at least 8 characters"**
- Use a strong password with at least 8 characters

**"Invalid master password or corrupted data"**
- You may have entered the wrong master password
- To reset: Open settings → Reset to Defaults → Re-enter your keys

### API errors

**401 Unauthorized**
- Check that your OpenRouter API key is correct
- Verify you have credits on your OpenRouter account

**429 Too Many Requests**
- You've hit rate limits
- Wait a few minutes and try again
- Consider upgrading your OpenRouter plan

**Large PRs**
- PRs with >1000 lines may be truncated
- The extension limits diffs to ~20,000 characters to fit in model context

## Privacy & Security

### What data is collected?

**None.** This extension:
- ✅ Stores all data locally on your device
- ✅ Does not send data to any third-party servers (except OpenRouter for reviews)
- ✅ Does not track or log your activity
- ✅ Does not sync data across devices
- ✅ Only sends PR data to OpenRouter when you explicitly click "AI Review"

### What data is sent to OpenRouter?

When you click "AI Review", the extension sends:
- PR title and description
- List of changed files
- Code diff (up to 20,000 characters)
- Your API key (in Authorization header)

This data is:
- ✅ Sent over HTTPS (encrypted in transit)
- ✅ Not stored by the extension
- ⚠️ Subject to OpenRouter's privacy policy
- ⚠️ May be used by OpenRouter for API functionality

### Best Practices

1. **Use encryption** - Enable master password encryption for API keys
2. **Strong passwords** - Use a unique, strong master password
3. **Token scope** - GitHub tokens should have minimal required scopes (`repo` for private repos)
4. **Review costs** - Monitor your OpenRouter usage to avoid surprise bills
5. **Public repos** - No GitHub token needed for public repositories
6. **Rotate keys** - Periodically rotate your API keys

## Limitations

- Large PRs (>1000 lines) may be truncated to fit model context limits
- Review quality depends on the selected AI model
- GitHub API rate limits apply (60/hour without token, 5,000/hour with token)
- Encrypted API keys require master password for each save operation
- Content scripts cannot decrypt keys without additional implementation

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Roadmap

- [ ] Master password caching for content scripts
- [ ] Support for inline PR comments
- [ ] Custom review templates
- [ ] Review history and caching
- [ ] Multiple AI model comparison
- [ ] Diff-specific reviews (review only changed lines)
- [ ] Integration with GitHub Actions

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built with [Chrome Extensions Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- Powered by [OpenRouter](https://openrouter.ai/)
- Encryption using [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- Inspired by GitHub Copilot and other AI code assistants

## Support

For issues and questions:

- 🐛 [Open an issue on GitHub](https://github.com/viktor-svirsky/gitHub-pr-ai-reviewer/issues)
- 📖 [Read the documentation](https://github.com/viktor-svirsky/gitHub-pr-ai-reviewer/wiki)
- 💬 [Join our discussions](https://github.com/viktor-svirsky/gitHub-pr-ai-reviewer/discussions)

## Changelog

### Version 2.0.0 (Current)

**Major Changes:**
- ✨ Direct OpenRouter integration (no backend needed)
- 🔒 AES-256-GCM encryption for API keys
- 🔐 Master password protection
- 💾 Local-only storage (no cloud sync)
- 🎨 Improved UI with security section
- 🤖 Model selection support

**Removed:**
- ❌ Cloudflare Worker dependency
- ❌ Cloud storage sync

**Migration from 1.x:**
- All settings are reset on upgrade
- Re-enter your credentials in the new settings UI
- Consider enabling encryption for enhanced security

---

Made with ❤️ for developers who value code quality and security