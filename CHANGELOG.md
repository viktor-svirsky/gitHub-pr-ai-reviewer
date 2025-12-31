# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Enhanced AI model dropdown with comprehensive benchmark scores from ZeroEval
  - **SWE-bench**: Software Engineering benchmark score (most relevant for code reviews)
  - **GPQA**: Graduate-level reasoning capabilities score
  - **AIME**: Mathematical reasoning score
- Multiple benchmark scores now displayed in model selection dropdown to help users choose the best model for their needs
- Improved model information display format: `Model Name (Context) | Pricing | SWE: X%, GPQA: Y%, AIME: Z%`

### Changed
- Updated ZeroEval API integration to fetch and display multiple benchmark scores instead of just SWE-bench
- Models with no available benchmark scores are displayed without score information
- Score formatting improved with proper null/undefined checks

### Technical Details
- Modified `fetchAndPopulateModels()` function in `extension/popup/popup.js`
- Enhanced benchmark score fetching to create a map with multiple score types per model
- Added conditional rendering for each score type (SWE, GPQA, AIME)
- Scores are displayed as percentages with one decimal place precision
- Implementation gracefully handles missing scores for models not yet benchmarked

## [2.0.0] - Previous Release

### Major Features
- AI-powered GitHub Pull Request reviews using OpenRouter
- Support for 200+ AI models through OpenRouter API
- End-to-end encryption for API keys with master password
- Review caching for better performance
- Configurable review depth (Quick, Standard, Deep)
- Auto-review option for new PRs
- Dark/light mode support
- GitHub token support for private repositories

### Security
- Optional end-to-end encryption using AES-256-GCM
- Master password protection for API keys
- Secure local storage with Web Crypto API
- No data sent to third-party servers (except OpenRouter for reviews)

### User Experience
- One-click PR reviews from GitHub UI
- Model selection with pricing information
- Context length display
- Review quality indicators
- Detailed error messages and troubleshooting

[Unreleased]: https://github.com/viktor-svirsky/gitHub-pr-ai-reviewer/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/viktor-svirsky/gitHub-pr-ai-reviewer/releases/tag/v2.0.0