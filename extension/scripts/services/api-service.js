// API Service for OpenRouter integration
// Handles API requests with retry logic, timeout, and cancellation

class APIService {
  constructor() {
    this.apiUrl = CONFIG.OPENROUTER_API_URL;
    this.timeout = CONFIG.API_TIMEOUT_MS;
    this.maxRetries = CONFIG.MAX_RETRIES;
    this.retryDelay = CONFIG.RETRY_DELAY_MS;
    this.activeRequests = new Map();
  }

  /**
   * Get AI review from OpenRouter API
   * @param {Object} prInfo - PR information
   * @param {string} diff - PR diff
   * @param {Array} files - Changed files
   * @param {AbortSignal} signal - Abort signal for cancellation
   * @returns {Promise<Object>} Structured review
   */
  async getReview(prInfo, diff, files, signal = null) {
    console.log("🚀 Preparing AI review request...");

    try {
      // Get settings
      const openrouterApiKey = await settingsService.getApiKey("openrouterApiKey");

      if (!openrouterApiKey) {
        throw new Error(CONFIG.MESSAGES.ERROR_NO_API_KEY);
      }

      const model = (await settingsService.getValue("aiModel")) || CONFIG.DEFAULT_MODEL;

      console.log("🤖 Using AI model:", model);
      console.log("📦 Preparing request for", files.length, "files");

      // Build the prompt
      const prompt = this.buildPrompt(prInfo, diff, files);

      // Make request with retry logic
      const data = await helpers.retryWithBackoff(
        async () => {
          return await this.makeRequest(openrouterApiKey, model, prompt, signal);
        },
        this.maxRetries,
        this.retryDelay
      );

      console.log("📡 OpenRouter response received");

      // Extract and parse the review
      const reviewText = data.choices?.[0]?.message?.content;

      if (!reviewText) {
        console.error("❌ No review content in API response");
        throw new Error(CONFIG.MESSAGES.ERROR_NO_CONTENT);
      }

      console.log("✅ Review text extracted, length:", reviewText.length);

      // Parse the review into structured format
      const structuredReview = this.parseReview(reviewText, files);

      console.log("📦 Structured review created:", {
        hasSummary: !!structuredReview.summary,
        summaryLength: structuredReview.summary?.length || 0,
        commentsCount: structuredReview.comments?.length || 0,
      });

      return structuredReview;
    } catch (error) {
      console.error("💥 Error getting AI review:", error);
      throw error;
    }
  }

  /**
   * Make API request to OpenRouter
   * @param {string} apiKey - API key
   * @param {string} model - Model name
   * @param {string} prompt - Prompt text
   * @param {AbortSignal} signal - Abort signal
   * @returns {Promise<Object>} API response
   */
  async makeRequest(apiKey, model, prompt, signal) {
    const requestId = Date.now().toString();
    const controller = new AbortController();

    // Link external abort signal if provided
    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
    }

    // Set timeout
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    this.activeRequests.set(requestId, controller);

    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": window.location.origin,
          "X-Title": "GitHub PR AI Reviewer",
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "system",
              content:
                "You are an experienced software engineer conducting a thorough code review. Provide constructive, actionable feedback focusing on code quality, potential bugs, security issues, performance concerns, and best practices. Be concise but thorough.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: CONFIG.DEFAULT_TEMPERATURE,
          max_tokens: CONFIG.DEFAULT_MAX_TOKENS,
        }),
        signal: controller.signal,
      });

      console.log("📡 Response status:", response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ OpenRouter API error:", errorText);
        throw new Error(`${CONFIG.MESSAGES.ERROR_API_FAILED}: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data;
    } finally {
      clearTimeout(timeoutId);
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Build review prompt from PR data
   * @param {Object} prInfo - PR information
   * @param {string} diff - PR diff
   * @param {Array} files - Changed files
   * @returns {string} Formatted prompt
   */
  buildPrompt(prInfo, diff, files) {
    const filesList = files
      .map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
      .join("\n");

    // Truncate diff if too large
    const truncatedDiff = helpers.truncateText(
      diff,
      CONFIG.MAX_DIFF_LENGTH,
      "\n\n[... diff truncated ...]"
    );

    return `
# Pull Request Review

## PR Information
- **Repository**: ${prInfo.owner}/${prInfo.repo}
- **PR Number**: #${prInfo.prNumber}
- **Title**: ${prInfo.title}
- **Description**: ${prInfo.description || "No description provided"}

## Files Changed
${filesList}

## Full Diff
\`\`\`diff
${truncatedDiff}
\`\`\`

## Review Instructions
Please provide a comprehensive code review with the following structure:

1. **Summary**: A brief overall assessment (2-3 sentences)
2. **Key Issues**: List critical issues that must be addressed
3. **Suggestions**: Specific improvements organized by file
4. **Positive Points**: What was done well (if applicable)

For each issue or suggestion, please specify:
- The file name
- Line number (if applicable)
- Description of the issue/suggestion
- Severity (critical/major/minor)

Format your response as JSON with this structure:
{
  "summary": "Brief overall assessment",
  "comments": [
    {
      "filename": "path/to/file.js",
      "line": 42,
      "severity": "major",
      "body": "Description of issue and suggestion"
    }
  ]
}
`.trim();
  }

  /**
   * Parse AI review response into structured format
   * @param {string} reviewText - Raw review text
   * @param {Array} files - Changed files
   * @returns {Object} Structured review
   */
  parseReview(reviewText, files) {
    // Try to parse as JSON first
    const jsonMatch = reviewText.match(/\{[\s\S]*"summary"[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = helpers.safeJsonParse(jsonMatch[0]);
      if (parsed && parsed.summary) {
        const result = {
          summary: parsed.summary || "",
          comments: parsed.comments || [],
        };
        return result;
      }
    }

    // Fallback to text parsing
    return this.parseTextReview(reviewText, files);
  }

  /**
   * Parse text-based review into structured format
   * @param {string} reviewText - Raw review text
   * @param {Array} files - Changed files
   * @returns {Object} Structured review
   */
  parseTextReview(reviewText, files) {
    const lines = reviewText.split("\n");
    const comments = [];
    let summary = "";
    let currentComment = null;

    // Try to extract summary from first paragraph or section
    const summaryMatch = reviewText.match(
      /(?:summary|overview|assessment)[:\s]*(.*?)(?:\n\n|##|$)/is
    );
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
    } else {
      // Use first paragraph as summary
      const firstParagraph = reviewText.split("\n\n")[0];
      summary = firstParagraph.substring(0, 500);
    }

    // Parse comments from text
    for (const line of lines) {
      // First, check for filepath:line format (e.g., "path/to/file.js:42")
      const fileLineMatch = line.match(/^([^\s:]+(?:\.[a-zA-Z0-9]+)?):(\d+)\s*$/);
      if (fileLineMatch) {
        // Save previous comment if exists
        if (currentComment) {
          comments.push(currentComment);
        }
        // Start new comment with filepath:line format
        currentComment = {
          filename: fileLineMatch[1],
          line: parseInt(fileLineMatch[2]),
          body: `${fileLineMatch[1]}:${fileLineMatch[2]}\n`,
          severity: "minor",
        };
        continue;
      }

      // Look for file mentions (legacy format)
      const fileMatch = line.match(/(?:file|in|at)[:\s]+`?([^`\s:]+\.[a-z]+)`?/i);
      if (fileMatch) {
        if (currentComment) {
          comments.push(currentComment);
        }
        currentComment = {
          filename: fileMatch[1],
          body: "",
          severity: "minor",
        };
        continue;
      }

      // Look for line numbers (legacy format)
      const lineMatch = line.match(/line[:\s]+(\d+)/i);
      if (lineMatch && currentComment) {
        currentComment.line = parseInt(lineMatch[1]);
      }

      // Look for severity indicators
      const severityMatch = line.match(/\b(critical|major|minor|high|medium|low)\b/i);
      if (severityMatch && currentComment) {
        const severity = severityMatch[1].toLowerCase();
        currentComment.severity =
          severity === "high"
            ? "critical"
            : severity === "medium"
              ? "major"
              : severity === "low"
                ? "minor"
                : severity;
      }

      // Add content to current comment
      if (currentComment && line.trim()) {
        currentComment.body += `${line}\n`;
      }
    }

    // Add last comment
    if (currentComment) {
      comments.push(currentComment);
    }

    // If no structured comments found, create a general comment
    if (comments.length === 0 && reviewText.length > 0) {
      comments.push({
        filename: files[0]?.filename || "general",
        body: reviewText,
        severity: "minor",
      });
    }

    return {
      summary: summary || "Code review completed",
      comments: comments.map((c) => ({
        ...c,
        body: c.body.trim(),
      })),
    };
  }

  /**
   * Cancel all active requests
   */
  cancelAll() {
    console.log(`🛑 Cancelling ${this.activeRequests.size} active requests`);
    this.activeRequests.forEach((controller) => {
      controller.abort();
    });
    this.activeRequests.clear();
  }

  /**
   * Get number of active requests
   * @returns {number}
   */
  getActiveRequestCount() {
    return this.activeRequests.size;
  }
}

// Create singleton instance
// eslint-disable-next-line no-redeclare
const apiService = new APIService();

// Make available globally
if (typeof window !== "undefined") {
  window.apiService = apiService;
}
