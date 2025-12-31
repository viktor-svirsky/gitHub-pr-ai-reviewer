// Content script for GitHub PR pages
(function () {
  "use strict";

  console.log("🚀 GitHub PR AI Reviewer content script loaded");

  const CONFIG = {
    OPENROUTER_API_URL: "https://openrouter.ai/api/v1/chat/completions",
    BUTTON_ID: "ai-review-button",
    REVIEW_CONTAINER_ID: "ai-review-container",
    REVIEW_CACHE_KEY: "pr_review_cache",
    CACHE_EXPIRY_MS: 24 * 60 * 60 * 1000, // 24 hours
  };

  // Check if we're on a PR page
  function isPRPage() {
    return window.location.pathname.match(/\/pull\/\d+/);
  }

  // Cache management functions
  async function getCachedReview(prUrl) {
    try {
      console.log("🔍 Checking cache for:", prUrl);
      const result = await chrome.storage.local.get([CONFIG.REVIEW_CACHE_KEY]);
      const cache = result[CONFIG.REVIEW_CACHE_KEY] || {};

      console.log("📦 Cache contents:", Object.keys(cache));

      const cached = cache[prUrl];
      if (!cached) {
        console.log("❌ No cache found for this PR");
        return null;
      }

      // Check if cache is expired
      const now = Date.now();
      const age = now - cached.timestamp;
      const ageHours = (age / (1000 * 60 * 60)).toFixed(1);
      console.log(`📅 Cache age: ${ageHours} hours`);

      if (age > CONFIG.CACHE_EXPIRY_MS) {
        console.log("🗑️ Cached review expired, removing");
        delete cache[prUrl];
        await chrome.storage.local.set({ [CONFIG.REVIEW_CACHE_KEY]: cache });
        return null;
      }

      console.log("✅ Found valid cached review");
      return cached.review;
    } catch (error) {
      console.error("❌ Error reading cache:", error);
      return null;
    }
  }

  async function setCachedReview(prUrl, review) {
    try {
      console.log("💾 Caching review for:", prUrl);
      const result = await chrome.storage.local.get([CONFIG.REVIEW_CACHE_KEY]);
      const cache = result[CONFIG.REVIEW_CACHE_KEY] || {};

      cache[prUrl] = {
        review: review,
        timestamp: Date.now(),
      };

      await chrome.storage.local.set({ [CONFIG.REVIEW_CACHE_KEY]: cache });
      console.log("✅ Review cached successfully");
      console.log("📦 Total cached reviews:", Object.keys(cache).length);
    } catch (error) {
      console.error("❌ Error saving to cache:", error);
    }
  }

  async function clearCachedReview(prUrl) {
    try {
      const result = await chrome.storage.local.get([CONFIG.REVIEW_CACHE_KEY]);
      const cache = result[CONFIG.REVIEW_CACHE_KEY] || {};

      if (cache[prUrl]) {
        delete cache[prUrl];
        await chrome.storage.local.set({ [CONFIG.REVIEW_CACHE_KEY]: cache });
        console.log("🗑️ Cached review cleared");
      }
    } catch (error) {
      console.error("❌ Error clearing cache:", error);
    }
  }

  async function clearAllCachedReviews() {
    try {
      await chrome.storage.local.remove([CONFIG.REVIEW_CACHE_KEY]);
      console.log("🗑️ All cached reviews cleared");
    } catch (error) {
      console.error("❌ Error clearing all cache:", error);
    }
  }

  // Extract PR information
  function extractPRInfo() {
    const pathParts = window.location.pathname.split("/");
    const owner = pathParts[1];
    const repo = pathParts[2];
    const prNumber = pathParts[4];

    const title = document.querySelector(".js-issue-title")?.textContent.trim() || "";
    const description = document.querySelector(".comment-body")?.textContent.trim() || "";

    // Normalize URL for consistent cache keys (remove query params and hash)
    const normalizedUrl = `https://github.com/${owner}/${repo}/pull/${prNumber}`;

    return {
      owner,
      repo,
      prNumber,
      title,
      description,
      url: normalizedUrl,
    };
  }

  // Fetch PR diff from GitHub API
  async function fetchPRDiff(owner, repo, prNumber) {
    console.log(`📥 Fetching PR diff for ${owner}/${repo}#${prNumber}...`);
    try {
      const settings = await chrome.storage.local.get(["githubToken"]);
      const githubToken = settings.githubToken;

      const headers = {
        Accept: "application/vnd.github.v3.diff",
      };

      if (githubToken && typeof githubToken === "string") {
        headers["Authorization"] = `Bearer ${githubToken}`;
      }

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
        {
          headers,
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch PR diff: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      console.error("Error fetching PR diff:", error);
      throw error;
    }
  }

  // Fetch PR files changed from GitHub API
  async function fetchPRFiles(owner, repo, prNumber) {
    console.log(`📁 Fetching PR files for ${owner}/${repo}#${prNumber}...`);
    try {
      const settings = await chrome.storage.local.get(["githubToken"]);
      const githubToken = settings.githubToken;

      const headers = {
        Accept: "application/vnd.github.v3+json",
      };

      if (githubToken && typeof githubToken === "string") {
        headers["Authorization"] = `Bearer ${githubToken}`;
      }

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`,
        { headers }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const files = await response.json();
      console.log(`✅ Fetched ${files.length} files from GitHub API`);
      return files;
    } catch (error) {
      console.error("Error fetching PR files from API:", error);
      throw error;
    }
  }

  // Send PR data to AI for review
  async function getAIReview(prInfo, diff, files) {
    console.log("🚀 Preparing AI review request...");

    try {
      // Get settings from storage
      const settings = await chrome.storage.local.get(["openrouterApiKey", "aiModel"]);

      const openrouterApiKey = settings.openrouterApiKey;

      // Check if API key is available
      if (!openrouterApiKey || typeof openrouterApiKey !== "string") {
        throw new Error(
          "OpenRouter API key not configured. Please add it in the extension settings."
        );
      }

      const model = settings.aiModel || "anthropic/claude-3.5-sonnet";

      console.log("🤖 Using AI model:", model);
      console.log("📦 Preparing request for", files.length, "files");

      // Build the prompt
      const prompt = buildReviewPrompt(prInfo, diff, files);

      // Call OpenRouter API directly
      const response = await fetch(CONFIG.OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openrouterApiKey}`,
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
          temperature: 0.3,
          max_tokens: 4000,
        }),
      });

      console.log("📡 Response status:", response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ OpenRouter API error:", errorText);
        throw new Error(`OpenRouter API request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("📡 OpenRouter response received");

      // Extract the review from the response
      const reviewText = data.choices?.[0]?.message?.content;

      if (!reviewText) {
        console.error("❌ No review content in API response");
        throw new Error("No review content in API response");
      }

      console.log("✅ Review text extracted, length:", reviewText.length);

      // Parse the review into structured format
      const structuredReview = parseReviewResponse(reviewText, files);

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
   * Build the review prompt from PR data
   */
  function buildReviewPrompt(prInfo, diff, files) {
    const filesList = files
      .map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
      .join("\n");

    // Truncate diff if too large (keep under ~20k chars)
    let truncatedDiff = diff;
    const MAX_DIFF_LENGTH = 20000;
    if (diff.length > MAX_DIFF_LENGTH) {
      truncatedDiff = diff.substring(0, MAX_DIFF_LENGTH) + "\n\n[... diff truncated ...]";
    }

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
   * Parse AI response into structured review
   */
  function parseReviewResponse(reviewText, files) {
    console.log("🔍 Parsing review response...");
    try {
      // Try to extract JSON from response
      const jsonMatch = reviewText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        console.log("✅ Found JSON in response, parsing...");
        const parsed = JSON.parse(jsonMatch[0]);
        const result = {
          summary: parsed.summary || "Review completed",
          comments: Array.isArray(parsed.comments) ? parsed.comments : [],
        };
        console.log("✅ Parsed JSON review:", {
          summaryLength: result.summary.length,
          commentsCount: result.comments.length,
        });
        return result;
      }

      // Fallback: parse as plain text
      console.log("⚠️ No JSON found, parsing as plain text...");
      return parseTextReview(reviewText, files);
    } catch (error) {
      console.error("❌ Error parsing review response:", error);
      console.log("📝 Using fallback: raw text response");
      // Return raw text as fallback
      return {
        summary: reviewText.substring(0, 500),
        comments: [
          {
            filename: "general",
            body: reviewText,
            severity: "minor",
          },
        ],
      };
    }
  }

  /**
   * Parse text-based review into structured format
   */
  function parseTextReview(text, files) {
    const lines = text.split("\n");
    const comments = [];
    let summary = "";
    let currentComment = null;

    // Extract summary (usually first paragraph or section)
    const summaryMatch = text.match(/(?:Summary|Overview):?\s*(.*?)(?:\n\n|#{2})/is);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
    } else {
      // Use first paragraph as summary
      const firstParagraph = text.split("\n\n")[0];
      summary = firstParagraph.substring(0, 300);
    }

    // Try to identify file-specific comments
    for (const line of lines) {
      // Look for file mentions
      const fileMatch = line.match(/(?:File|Path):\s*`?([^\s`]+)`?/i);
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

      // Look for line numbers
      const lineMatch = line.match(/(?:Line|L):\s*(\d+)/i);
      if (lineMatch && currentComment) {
        currentComment.line = parseInt(lineMatch[1], 10);
        continue;
      }

      // Look for severity
      const severityMatch = line.match(/(?:Severity|Priority):\s*(critical|major|minor)/i);
      if (severityMatch && currentComment) {
        currentComment.severity = severityMatch[1].toLowerCase();
        continue;
      }

      // Add to current comment body
      if (currentComment && line.trim()) {
        currentComment.body += (currentComment.body ? "\n" : "") + line;
      }
    }

    // Add last comment
    if (currentComment && currentComment.body) {
      comments.push(currentComment);
    }

    // If no structured comments found, create general comment
    if (comments.length === 0) {
      comments.push({
        filename: "general",
        body: text,
        severity: "minor",
      });
    }

    return { summary, comments };
  }

  // Retry tracking for button injection
  let injectionRetryCount = 0;
  const MAX_INJECTION_RETRIES = 10;
  let injectionInProgress = false;
  let injectionObserver = null;

  // Create and inject the AI review button with other PR action buttons
  function injectReviewButton() {
    console.log("🔍 injectReviewButton called");

    // Check if button already exists
    const existingButton = document.getElementById(CONFIG.BUTTON_ID);
    if (existingButton) {
      console.log("✅ Button already exists, skipping injection");
      // Stop the injection observer if it exists
      if (injectionObserver) {
        injectionObserver.disconnect();
        injectionObserver = null;
      }
      return;
    }

    // Try to find the PR header actions (where other action buttons are)
    const selectors = [
      ".gh-header-actions", // Main PR header actions
      "[data-check-suite-result]", // Near the checks area
      ".gh-header-meta", // PR header metadata area
      ".tabnav", // Tab navigation
    ];

    let targetContainer = null;
    for (const selector of selectors) {
      targetContainer = document.querySelector(selector);
      if (targetContainer) {
        console.log(`✅ Found PR actions container using: ${selector}`);
        break;
      }
    }

    if (!targetContainer) {
      if (injectionRetryCount < MAX_INJECTION_RETRIES) {
        injectionRetryCount++;
        console.warn(
          `⚠️ Could not find PR header actions. Retry ${injectionRetryCount}/${MAX_INJECTION_RETRIES} in 500ms...`
        );

        // Use a more aggressive retry strategy with MutationObserver
        if (!injectionObserver) {
          injectionObserver = new MutationObserver(() => {
            const container = document.querySelector(selectors[0]);
            if (container) {
              console.log("🔄 Target container appeared, attempting injection");
              injectionObserver.disconnect();
              injectionObserver = null;
              injectionRetryCount = 0;
              injectReviewButton();
            }
          });

          // Watch the body for changes
          injectionObserver.observe(document.body, {
            childList: true,
            subtree: true,
          });
        }

        setTimeout(() => {
          injectReviewButton();
        }, 500);
      } else {
        console.error("❌ Max retries reached. Could not find PR header actions container.");
        if (injectionObserver) {
          injectionObserver.disconnect();
          injectionObserver = null;
        }
      }
      return;
    }

    // Reset retry count on success
    injectionRetryCount = 0;

    // Stop the injection observer if it exists
    if (injectionObserver) {
      injectionObserver.disconnect();
      injectionObserver = null;
    }

    const buttonContainer = document.createElement("div");
    buttonContainer.style.cssText = "display: inline-block; margin-left: 8px;";

    const button = document.createElement("button");
    button.id = CONFIG.BUTTON_ID;
    button.className = "btn btn-sm btn-primary";
    button.innerHTML = `
      <svg class="octicon" style="margin-right: 6px;" height="16" width="16" viewBox="0 0 16 16">
        <path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.75.75 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"></path>
      </svg>
      AI Review
    `;
    button.style.cssText = "position: relative;";

    button.addEventListener("click", handleReviewClick);

    buttonContainer.appendChild(button);
    targetContainer.appendChild(buttonContainer);

    console.log("✅ AI Review button injected in PR header actions");
  }

  // Handle review button click
  async function handleReviewClick(event) {
    const button = event.currentTarget;
    const originalHTML = button.innerHTML;

    console.log("🎯 AI Review button clicked");

    try {
      button.disabled = true;
      button.innerHTML = `
        <svg class="octicon" style="animation: rotate 1s linear infinite; margin-right: 4px;" height="16" width="16" viewBox="0 0 16 16">
          <path fill="currentColor" d="M8 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" opacity="0.3"></path>
          <path fill="currentColor" d="M8 0a8 8 0 0 1 8 8h-1.5A6.5 6.5 0 0 0 8 1.5V0Z"></path>
        </svg>
        Analyzing...
      `;

      console.log("📝 Extracting PR info...");
      const prInfo = extractPRInfo();
      console.log("ℹ️ PR Info:", prInfo);

      console.log("📥 Fetching diff and files...");
      const [diff, files] = await Promise.all([
        fetchPRDiff(prInfo.owner, prInfo.repo, prInfo.prNumber),
        fetchPRFiles(prInfo.owner, prInfo.repo, prInfo.prNumber),
      ]);
      console.log("✓ Fetched", files.length, "files");

      console.log("🤖 Requesting AI review...");
      const review = await getAIReview(prInfo, diff, files);
      console.log("✓ Review received, displaying...");
      console.log("📦 Review data:", {
        hasSummary: !!review?.summary,
        commentsCount: review?.comments?.length || 0,
      });

      // Cache the review for this PR
      console.log("💾 Attempting to cache review...");
      await setCachedReview(prInfo.url, review);

      displayReview(review, false);
      console.log("✅ Review displayed successfully!");
    } catch (error) {
      console.error("💥 Review failed:", error);
      console.error("Error stack:", error.stack);
      let errorMessage = error.message;

      // Check if it's an authentication error
      if (errorMessage.includes("404") || errorMessage.includes("Not Found")) {
        const settings = await chrome.storage.local.get(["githubToken"]);
        if (!settings.githubToken) {
          errorMessage =
            "GitHub API access denied. For private repositories or to avoid rate limits, please add a GitHub Personal Access Token in the extension settings. Click the extension icon to configure.";
        } else {
          errorMessage =
            "GitHub API returned 404. Please verify your GitHub token has the correct permissions (repo scope required).";
        }
      } else if (errorMessage.includes("403") || errorMessage.includes("Forbidden")) {
        errorMessage =
          "GitHub API rate limit exceeded or access forbidden. Please add a GitHub Personal Access Token in the extension settings.";
      }

      showError(errorMessage);
    } finally {
      button.disabled = false;
      button.innerHTML = originalHTML;
    }
  }

  // Display the AI review results
  async function displayReview(review, fromCache = false) {
    console.log("🎨 displayReview called with:", {
      fromCache,
      hasSummary: !!review?.summary,
      commentsCount: review?.comments?.length || 0,
    });

    if (fromCache) {
      console.log("📦 Displaying cached review");
    }

    // Validate review object
    if (!review) {
      console.error("❌ Review object is null or undefined!");
      showError("Received empty review from backend. Check console for details.");
      return;
    }

    // Validate review structure
    if (!review.summary && (!review.comments || review.comments.length === 0)) {
      console.error("❌ Review object is missing both summary and comments!");
      showError("Received incomplete review. Check console for details.");
      return;
    }

    // Show results on current tab without navigation
    console.log("✅ Displaying review on current tab");
    insertReviewInCurrentView(review, fromCache);

    // If this is a fresh review (not from cache), ensure it's cached
    if (!fromCache) {
      try {
        const prInfo = extractPRInfo();
        console.log("💾 Double-checking cache after display...");
        await setCachedReview(prInfo.url, review);
      } catch (error) {
        console.error("❌ Error caching after display:", error);
      }
    }
  }

  // Insert the review into the current view
  function insertReviewInCurrentView(review, fromCache = false) {
    // Show success notification
    const message = fromCache ? "Cached Review Loaded! 📦" : "AI Review Complete! 🎉";
    showSuccessNotification(message);

    // Remove existing review container if present
    const existingContainer = document.getElementById(CONFIG.REVIEW_CONTAINER_ID);
    if (existingContainer) {
      console.log("🗑️ Removing existing review container");
      existingContainer.remove();
    }

    const container = document.createElement("div");
    container.id = CONFIG.REVIEW_CONTAINER_ID;
    container.className = "Box mb-3";
    container.style.cssText =
      "border: 1px solid #d0d7de; border-radius: 6px; background-color: #ffffff; animation: slideIn 0.3s ease-out; box-shadow: 0 1px 3px rgba(0,0,0,0.05);";

    const header = document.createElement("div");
    header.className = "Box-header d-flex flex-items-center";
    header.style.cssText =
      "display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid #d0d7de; background: #f6f8fa; border-radius: 6px 6px 0 0;";

    const cacheIndicator = fromCache
      ? `<span style="font-size: 11px; color: #57606a; margin-left: 8px; padding: 2px 6px; background: #ddf4ff; border-radius: 3px; border: 1px solid #54aeff66;">📦 Cached</span>`
      : "";

    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <svg class="octicon" height="20" width="20" viewBox="0 0 16 16">
          <path fill="#0969da" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.75.75 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"></path>
        </svg>
        <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: #24292f;">
          AI Review Results
        </h3>
        ${cacheIndicator}
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        ${
          fromCache
            ? `<button class="btn-sm" id="refresh-ai-review" type="button" title="Request fresh review" style="font-size: 12px; padding: 3px 8px; color: #24292f; background: #f6f8fa; border: 1px solid rgba(27,31,36,0.15); border-radius: 6px; cursor: pointer;">
            <svg class="octicon" height="14" width="14" viewBox="0 0 16 16" style="vertical-align: middle; margin-right: 4px;">
              <path fill="currentColor" d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"></path>
            </svg>
            Refresh
          </button>`
            : ""
        }
        <button class="btn-octicon" id="close-ai-review" type="button" style="color: #57606a;">
          <svg class="octicon" height="16" width="16" viewBox="0 0 16 16">
            <path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path>
          </svg>
        </button>
      </div>
    `;

    const content = document.createElement("div");
    content.className = "Box-body";
    content.style.cssText = "padding: 16px; background: #ffffff;";

    // Display summary
    if (review.summary) {
      console.log("✅ Adding summary to display");
      const summary = document.createElement("div");
      summary.style.cssText =
        "margin-bottom: 16px; padding: 12px; background: #f6f8fa; border-radius: 6px; border-left: 3px solid #0969da;";
      summary.innerHTML = `<strong style="color: #24292f; display: block; margin-bottom: 8px;">Summary:</strong><p style="margin: 0; color: #57606a; line-height: 1.5;">${escapeHtml(review.summary)}</p>`;
      content.appendChild(summary);
    } else {
      console.warn("⚠️ No summary in review");
    }

    // Display comments (async to handle file link generation)
    if (review.comments && review.comments.length > 0) {
      console.log(`✅ Adding ${review.comments.length} comments to display`);

      // Sort comments by severity
      const severityOrder = { critical: 0, major: 1, minor: 2 };
      const sortedComments = [...review.comments].sort((a, b) => {
        const severityA = severityOrder[a.severity?.toLowerCase()] ?? 3;
        const severityB = severityOrder[b.severity?.toLowerCase()] ?? 3;
        return severityA - severityB;
      });

      // Count by severity
      const severityCounts = sortedComments.reduce((acc, comment) => {
        const severity = comment.severity?.toLowerCase() || "minor";
        acc[severity] = (acc[severity] || 0) + 1;
        return acc;
      }, {});

      const commentsTitle = document.createElement("h4");
      commentsTitle.textContent = "Suggestions:";
      commentsTitle.style.cssText =
        "font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #24292f;";
      content.appendChild(commentsTitle);

      // Add severity summary with filter buttons
      const severitySummary = document.createElement("div");
      severitySummary.style.cssText =
        "display: flex; gap: 8px; margin-bottom: 12px; font-size: 12px; flex-wrap: wrap; align-items: center;";

      // Track active filters
      const activeFilters = new Set(["critical", "major", "minor"]);

      const createFilterBadge = (severity, count, icon, bgColor, textColor = "white") => {
        const badge = document.createElement("button");
        badge.className = `severity-filter-${severity}`;
        badge.style.cssText = `
          padding: 4px 8px;
          background: ${bgColor};
          color: ${textColor};
          border-radius: 4px;
          font-weight: 600;
          border: 2px solid ${bgColor};
          cursor: pointer;
          transition: all 0.2s;
        `;
        badge.textContent = `${icon} ${severity.charAt(0).toUpperCase() + severity.slice(1)}: ${count}`;

        badge.addEventListener("click", () => {
          if (activeFilters.has(severity)) {
            activeFilters.delete(severity);
            badge.style.opacity = "0.4";
            badge.style.textDecoration = "line-through";
          } else {
            activeFilters.add(severity);
            badge.style.opacity = "1";
            badge.style.textDecoration = "none";
          }

          // Update comment visibility
          document.querySelectorAll(`.comment-severity-${severity}`).forEach((el) => {
            el.style.display = activeFilters.has(severity) ? "block" : "none";
          });
        });

        badge.addEventListener("mouseenter", () => {
          if (activeFilters.has(severity)) {
            badge.style.opacity = "0.8";
          }
        });

        badge.addEventListener("mouseleave", () => {
          if (activeFilters.has(severity)) {
            badge.style.opacity = "1";
          }
        });

        return badge;
      };

      if (severityCounts.critical) {
        severitySummary.appendChild(
          createFilterBadge("critical", severityCounts.critical, "🔴", "#d73a4a")
        );
      }

      if (severityCounts.major) {
        severitySummary.appendChild(
          createFilterBadge("major", severityCounts.major, "🟠", "#fb8500")
        );
      }

      if (severityCounts.minor) {
        severitySummary.appendChild(
          createFilterBadge("minor", severityCounts.minor, "🔵", "#0969da")
        );
      }

      // Add "Show All" / "Hide All" toggle
      const toggleAllBtn = document.createElement("button");
      toggleAllBtn.style.cssText = `
        padding: 4px 8px;
        background: #f6f8fa;
        color: #24292f;
        border: 1px solid #d0d7de;
        border-radius: 4px;
        font-weight: 600;
        cursor: pointer;
        margin-left: 4px;
      `;
      toggleAllBtn.textContent = "Hide All";

      toggleAllBtn.addEventListener("click", () => {
        if (activeFilters.size > 0) {
          // Hide all
          activeFilters.clear();
          document.querySelectorAll('[class*="comment-severity-"]').forEach((el) => {
            el.style.display = "none";
          });
          document.querySelectorAll('[class*="severity-filter-"]').forEach((btn) => {
            btn.style.opacity = "0.4";
            btn.style.textDecoration = "line-through";
          });
          toggleAllBtn.textContent = "Show All";
        } else {
          // Show all
          ["critical", "major", "minor"].forEach((s) => activeFilters.add(s));
          document.querySelectorAll('[class*="comment-severity-"]').forEach((el) => {
            el.style.display = "block";
          });
          document.querySelectorAll('[class*="severity-filter-"]').forEach((btn) => {
            btn.style.opacity = "1";
            btn.style.textDecoration = "none";
          });
          toggleAllBtn.textContent = "Hide All";
        }
      });

      severitySummary.appendChild(toggleAllBtn);

      content.appendChild(severitySummary);

      // Process comments asynchronously to generate proper anchor links
      sortedComments.forEach(async (comment, index) => {
        console.log(`  📝 Comment ${index + 1}:`, comment);
        const commentDiv = document.createElement("div");

        // Get severity styling
        const severity = comment.severity?.toLowerCase() || "minor";
        const severityStyles = {
          critical: {
            bg: "#ffdce0",
            border: "#d73a4a",
            icon: "🔴",
            label: "CRITICAL",
            labelColor: "#d73a4a",
          },
          major: {
            bg: "#ffe5cc",
            border: "#fb8500",
            icon: "🟠",
            label: "MAJOR",
            labelColor: "#fb8500",
          },
          minor: {
            bg: "#ddf4ff",
            border: "#0969da",
            icon: "🔵",
            label: "MINOR",
            labelColor: "#0969da",
          },
        };

        const style = severityStyles[severity] || severityStyles.minor;

        commentDiv.className = `comment-severity-${severity}`;
        commentDiv.style.cssText = `padding: 12px; font-size: 12px; margin-bottom: 8px; background: ${style.bg}; border-left: 4px solid ${style.border}; border-radius: 6px; color: #24292f; position: relative;`;

        const commentBody = comment.body || comment.comment || comment.message || "No comment text";

        // Try to parse file reference from comment body
        const fileRef = parseFileReference(commentBody);

        let fileInfo = "";
        let displayBody = commentBody;

        // Generate file links with proper GitHub anchor format
        if (fileRef) {
          // File reference found in body - create clickable anchor link
          const fileUrl = await createGitHubFileLink(fileRef.filepath, fileRef.line);
          fileInfo = `<a href="${fileUrl}" class="file-anchor-link" title="Click to jump to ${escapeHtml(fileRef.filepath)} line ${fileRef.line} in PR files tab" style="color: #0969da; text-decoration: none; font-weight: 600; display: inline-block; margin-bottom: 4px;">${escapeHtml(fileRef.filepath)}:${fileRef.line}</a><br>`;
          displayBody = fileRef.remainingText;
        } else if (comment.filename) {
          // Use existing filename/line from comment structure
          const fileUrl = await createGitHubFileLink(comment.filename, comment.line);
          const lineText = comment.line ? ` line ${comment.line}` : "";
          fileInfo = `<a href="${fileUrl}" class="file-anchor-link" title="Click to jump to ${escapeHtml(comment.filename)}${lineText} in PR files tab" style="color: #0969da; text-decoration: none; font-weight: 600; display: inline-block; margin-bottom: 4px;">${escapeHtml(comment.filename)}${comment.line ? `:${comment.line}` : ""}</a><br>`;
        }

        commentDiv.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span style="font-weight: 700; color: ${style.labelColor}; font-size: 11px; letter-spacing: 0.5px;">${style.icon} ${style.label}</span>
            ${fileInfo ? `<span style="flex: 1;">${fileInfo}</span>` : ""}
          </div>
          ${!fileInfo && comment.filename ? `<div style="margin-bottom: 6px;">${fileInfo}</div>` : ""}
          <span style="line-height: 1.5;">${escapeHtml(displayBody)}</span>
        `;

        content.appendChild(commentDiv);
      });
    } else {
      console.warn("⚠️ No comments in review or comments array is empty");
      // Add a message if there are no comments
      const noComments = document.createElement("div");
      noComments.style.cssText =
        "padding: 12px; color: #57606a; font-style: italic; background: #f6f8fa; border-radius: 6px; text-align: center;";
      noComments.textContent = "✓ No specific suggestions - check the summary above.";
      content.appendChild(noComments);
    }

    container.appendChild(header);
    container.appendChild(content);

    // Insert in current view - try multiple selectors for different GitHub layouts
    const selectors = [
      ".discussion-timeline", // Conversation tab
      "#discussion_bucket", // Conversation tab
      "#files_bucket", // Files tab
      "#diff", // Files tab
      ".js-diff-progressive-container", // Files tab
      ".repository-content", // General content area
      "main", // Main content area
    ];

    let insertionPoint = null;
    let selectorUsed = null;

    for (const selector of selectors) {
      insertionPoint = document.querySelector(selector);
      if (insertionPoint) {
        selectorUsed = selector;
        console.log(`📍 Found insertion point using selector: ${selector}`);
        break;
      }
    }

    if (insertionPoint) {
      console.log("📍 Inserting review into page");
      insertionPoint.insertBefore(container, insertionPoint.firstChild);
      console.log("✅ Review container inserted into DOM");
    } else {
      console.error("❌ Could not find insertion point!");
      console.error("Tried selectors:", selectors);

      // Fallback: try to find any container
      const fallbackContainer = document.querySelector(".repository-content, main, body");
      if (fallbackContainer) {
        console.log("⚠️ Using fallback: inserting in fallback container");
        fallbackContainer.insertBefore(container, fallbackContainer.firstChild);
        console.log("✅ Review container inserted using fallback method");
      } else {
        showError("Could not display review on page. Check console for details.");
        return;
      }
    }

    // Add close button listener
    document.getElementById("close-ai-review")?.addEventListener("click", () => {
      console.log("🗑️ Closing review");
      container.remove();
    });

    // Add refresh button listener (only if from cache)
    if (fromCache) {
      document.getElementById("refresh-ai-review")?.addEventListener("click", async () => {
        console.log("🔄 Refresh button clicked - clearing cache and requesting new review");
        const prInfo = extractPRInfo();
        await clearCachedReview(prInfo.url);
        container.remove();

        // Trigger new review
        const button = document.getElementById(CONFIG.BUTTON_ID);
        if (button) {
          button.click();
        }
      });
    }

    // Add event delegation for file anchor links to prevent scroll to top
    container.addEventListener("click", (e) => {
      const fileLink = e.target.closest(".file-anchor-link");
      if (fileLink) {
        e.preventDefault();
        e.stopPropagation();
        const url = fileLink.getAttribute("href");
        if (url) {
          console.log("🔗 Navigating to file:", url);

          // Check if we're already on the Files tab
          const currentUrl = window.location.href;
          const targetUrl = new URL(url);
          const currentUrlObj = new URL(currentUrl);

          // If we're on the same page (Files tab), just scroll to the anchor
          if (currentUrlObj.pathname === targetUrl.pathname) {
            const hash = targetUrl.hash;
            if (hash) {
              console.log("📍 Already on Files tab, scrolling to anchor:", hash);
              const targetElement = document.querySelector(hash);
              if (targetElement) {
                targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
              } else {
                // Element not found yet, navigate to load it
                window.location.href = url;
              }
            }
          } else {
            // Navigate to Files tab
            window.location.href = url;
          }
        }
      }
    });

    // Scroll to review
    setTimeout(() => {
      container.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  // Show success notification toast
  function showSuccessNotification(message) {
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background-color: #1f883d;
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: slideInRight 0.3s ease-out;
    `;

    toast.innerHTML = `
      <svg style="flex-shrink: 0;" height="16" width="16" viewBox="0 0 16 16">
        <path fill="currentColor" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>
      </svg>
      <span>${message}</span>
    `;

    document.body.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
      toast.style.animation = "slideOutRight 0.3s ease-out";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Show error message
  function showError(message) {
    const existingContainer = document.getElementById(CONFIG.REVIEW_CONTAINER_ID);
    if (existingContainer) {
      existingContainer.remove();
    }

    const container = document.createElement("div");
    container.id = CONFIG.REVIEW_CONTAINER_ID;
    container.className = "flash flash-error mt-3";
    container.style.cssText = "padding: 16px;";
    container.innerHTML = `
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <svg style="margin-right: 8px;" height="16" width="16" viewBox="0 0 16 16">
              <path fill="currentColor" d="M4.47.22A.75.75 0 0 1 5 0h6a.75.75 0 0 1 .53.22l4.25 4.25c.141.14.22.331.22.53v6a.75.75 0 0 1-.22.53l-4.25 4.25A.75.75 0 0 1 11 16H5a.75.75 0 0 1-.53-.22L.22 11.53A.75.75 0 0 1 0 11V5a.75.75 0 0 1 .22-.53L4.47.22Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path>
            </svg>
            <strong style="font-size: 14px;">Failed to generate AI review</strong>
          </div>
          <p style="margin: 0; font-size: 13px;">${escapeHtml(message)}</p>
        </div>
        <button class="btn-octicon" id="close-ai-review" type="button" aria-label="Close">
          <svg class="octicon" height="16" width="16" viewBox="0 0 16 16">
            <path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path>
          </svg>
        </button>
      </div>
    `;

    const discussionTimeline = document.querySelector(".discussion-timeline");
    if (discussionTimeline) {
      discussionTimeline.insertBefore(container, discussionTimeline.firstChild);
    }

    document.getElementById("close-ai-review")?.addEventListener("click", () => {
      container.remove();
    });
  }

  // Escape HTML to prevent XSS
  // Helper function to escape HTML
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Helper function to parse file references from comment body
  // Detects patterns like "filepath:line" or "filepath.ext:line" at the start of comment body
  function parseFileReference(commentBody) {
    if (!commentBody) return null;

    // Match pattern: filepath:linenumber at the start of the text (with or without file extension)
    // Supports paths like: file.js:10, path/to/file.sql:42, etc.
    const match = commentBody.match(/^([^\s:]+(?:\.[a-zA-Z0-9]+)?):(\d+)/);
    if (match) {
      return {
        filepath: match[1],
        line: parseInt(match[2]),
        remainingText: commentBody.substring(match[0].length).trim(),
      };
    }
    return null;
  }

  // Helper function to create GitHub file link
  // Creates a clickable link to the file in the PR's Files tab with proper line anchor
  async function createGitHubFileLink(filepath, line) {
    const prInfo = extractPRInfo();
    const { owner, repo, prNumber } = prInfo;

    let url = `https://github.com/${owner}/${repo}/pull/${prNumber}/files`;

    // GitHub uses SHA256 hash of filepath for diff anchors
    if (filepath) {
      try {
        // Generate SHA256 hash of the filepath
        const encoder = new TextEncoder();
        const data = encoder.encode(filepath);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

        // GitHub format: #diff-{hash}R{line}
        // R means right side (new version) of the diff
        url += `#diff-${hashHex}`;
        if (line) {
          url += `R${line}`;
        }
      } catch (error) {
        console.warn("Failed to generate file hash:", error);
        // Fallback to simple anchor
        url += `#diff-${encodeURIComponent(filepath)}`;
      }
    }

    return url;
  }
  // Add animations and custom styles
  const style = document.createElement("style");
  style.textContent = `
    /* AI Review Custom Styles */
    .file-anchor-link:hover {
      text-decoration: underline !important;
    }

    #ai-review-toolbar {
      transition: all 0.2s ease;
    }

    #ai-review-toolbar:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
    }

    #${CONFIG.BUTTON_ID} {
      transition: all 0.15s ease;
      font-weight: 500;
    }

    #${CONFIG.BUTTON_ID}:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(9, 105, 218, 0.3);
    }

    #${CONFIG.BUTTON_ID}:active {
      transform: translateY(0);
    }

    #${CONFIG.BUTTON_ID}:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none !important;
    }

    @keyframes rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    @keyframes slideInRight {
      from {
        opacity: 0;
        transform: translateX(100px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    @keyframes slideOutRight {
      from {
        opacity: 1;
        transform: translateX(0);
      }
      to {
        opacity: 0;
        transform: translateX(100px);
      }
    }
  `;
  document.head.appendChild(style);

  // Expose debug helper for console access
  window.debugAIReview = {
    // Test with mock data
    testDisplay: () => {
      console.log("🧪 Testing displayReview with mock data...");
      const mockReview = {
        summary:
          "This is a test review summary. The code has several issues that need attention, ranging from critical security vulnerabilities to minor improvements.",
        comments: [
          {
            filename: "auth.js",
            line: 45,
            severity: "critical",
            body: "SQL injection vulnerability detected. User input is directly concatenated into the query without sanitization or parameterization.",
          },
          {
            filename: "api/routes.js",
            line: 128,
            severity: "critical",
            body: "Authentication bypass: API endpoint allows unauthenticated access to sensitive user data.",
          },
          {
            filename: "app.js",
            line: 25,
            severity: "major",
            body: "This could cause a memory leak. The event listener is not properly cleaned up when the component unmounts.",
          },
          {
            filename: "utils/validator.js",
            line: 67,
            severity: "major",
            body: "Missing input validation for email field. This could lead to invalid data being stored in the database.",
          },
          {
            filename: "config.js",
            line: 12,
            severity: "major",
            body: "Hardcoded API key detected. Move this to environment variables.",
          },
          {
            filename: "test.js",
            line: 10,
            severity: "minor",
            body: "Consider adding error handling here for better debugging experience.",
          },
          {
            filename: "styles.css",
            line: 89,
            severity: "minor",
            body: "Consider using CSS variables for better theme consistency.",
          },
          {
            filename: "README.md",
            line: 5,
            severity: "minor",
            body: "Documentation could be improved with more examples.",
          },
        ],
      };
      displayReview(mockReview);
    },

    // Check current state
    checkState: async () => {
      console.log("🔍 Checking AI Review extension state...");
      const settings = await chrome.storage.local.get(["openrouterApiKey", "aiModel"]);
      console.log("⚙️ Settings:", {
        aiModel: settings.aiModel,
        hasOpenrouterApiKey: !!settings.openrouterApiKey,
      });
      console.log("📍 Current page:", {
        isPR: isPRPage(),
        url: location.href,
        hasButton: !!document.getElementById(CONFIG.BUTTON_ID),
        hasReview: !!document.getElementById(CONFIG.REVIEW_CONTAINER_ID),
      });
    },

    // Manual trigger
    trigger: async () => {
      console.log("🎯 Manually triggering AI review...");
      const button = document.getElementById(CONFIG.BUTTON_ID);
      if (button) {
        button.click();
      } else {
        console.error("❌ AI Review button not found!");
      }
    },

    // Clear review
    clear: () => {
      const container = document.getElementById(CONFIG.REVIEW_CONTAINER_ID);
      if (container) {
        console.log("🗑️ Removing review container");
        container.remove();
      } else {
        console.log("ℹ️ No review container to remove");
      }
    },

    // Check which selectors are available on current page
    checkSelectors: () => {
      console.log("🔍 Checking available DOM selectors...");
      const selectors = [
        ".discussion-timeline",
        "#discussion_bucket",
        ".timeline-comment-wrapper",
        "[data-target='issues-content']",
        ".js-discussion",
        "main [role='main']",
        ".repository-content",
        ".gh-header-show",
        ".Header",
        "header",
      ];

      selectors.forEach((selector) => {
        const element = document.querySelector(selector);
        console.log(`${element ? "✅" : "❌"} ${selector}`, element ? element : "");
      });
    },

    // Check Files tab selectors specifically
    checkFilesTab: () => {
      console.log("🔍 Checking Files tab selectors...");
      const selectors = [
        "turbo-frame#repo-content-turbo-frame",
        "[data-hpc]",
        ".files.container",
        ".Box",
        "main .Box",
        "#files_bucket",
        "#files",
        "#diff",
        ".js-diff-progressive-container",
        ".diffbar",
        "#diffbar",
        ".pr-toolbar",
        ".diffbar-item.diffbar-item-standalone",
        "#files_bucket .Box-header",
        "#files .Box-header",
        ".diff-view",
        ".diff-view .Box-header",
        ".file-navigation",
        ".pr-review-tools",
        "[data-target='diff-file-filter.diffView']",
        ".file-diff-split",
        ".file-header",
      ];

      selectors.forEach((selector) => {
        const element = document.querySelector(selector);
        console.log(`${element ? "✅" : "❌"} ${selector}`, element ? element : "");
      });

      console.log("\n📍 Current location:");
      console.log("  URL:", window.location.href);
      console.log("  Pathname:", window.location.pathname);
      console.log("  On Files tab?", window.location.pathname.includes("/files"));

      console.log("\n🔍 DOM inspection:");
      console.log("  Main element:", document.querySelector("main"));
      console.log("  Turbo frame:", document.querySelector("turbo-frame#repo-content-turbo-frame"));
      console.log("  All .Box elements:", document.querySelectorAll(".Box").length);
      console.log("  First .Box element:", document.querySelector(".Box"));
      console.log("  File headers:", document.querySelectorAll(".file-header").length);
      console.log(
        "  Elements with 'diff' in class:",
        document.querySelectorAll("[class*='diff']").length
      );
    },

    // Force button injection
    forceInject: () => {
      console.log("🔧 Forcing button injection...");
      injectReviewButton();
    },

    // Cache management
    cache: {
      // View cached reviews
      list: async () => {
        console.log("📦 Listing cached reviews...");
        const result = await chrome.storage.local.get([CONFIG.REVIEW_CACHE_KEY]);
        const cache = result[CONFIG.REVIEW_CACHE_KEY] || {};
        const entries = Object.keys(cache);

        if (entries.length === 0) {
          console.log("ℹ️ No cached reviews found");
          return;
        }

        console.log(`✅ Found ${entries.length} cached reviews:`);
        entries.forEach((url) => {
          const cached = cache[url];
          const age = Date.now() - cached.timestamp;
          const ageHours = (age / (1000 * 60 * 60)).toFixed(1);
          console.log(`  📄 ${url}`);
          console.log(`     Age: ${ageHours} hours ago`);
          console.log(`     Summary: ${cached.review.summary?.substring(0, 100)}...`);
          console.log(`     Comments: ${cached.review.comments?.length || 0}`);
        });
      },

      // Clear current PR cache
      clearCurrent: async () => {
        console.log("🗑️ Clearing cache for current PR...");
        const prInfo = extractPRInfo();
        await clearCachedReview(prInfo.url);
        console.log("✅ Cache cleared for current PR");
      },

      // Clear all cached reviews
      clearAll: async () => {
        console.log("🗑️ Clearing all cached reviews...");
        await clearAllCachedReviews();
        console.log("✅ All cached reviews cleared");
      },

      // Check if current PR has cache
      check: async () => {
        console.log("🔍 Checking cache for current PR...");
        const prInfo = extractPRInfo();
        const cached = await getCachedReview(prInfo.url);
        if (cached) {
          const result = await chrome.storage.local.get([CONFIG.REVIEW_CACHE_KEY]);
          const cache = result[CONFIG.REVIEW_CACHE_KEY] || {};
          const entry = cache[prInfo.url];
          const age = Date.now() - entry.timestamp;
          const ageHours = (age / (1000 * 60 * 60)).toFixed(1);

          console.log("✅ Cache found for current PR:");
          console.log(`   URL: ${prInfo.url}`);
          console.log(`   Age: ${ageHours} hours ago`);
          console.log(`   Summary length: ${cached.summary?.length || 0}`);
          console.log(`   Comments: ${cached.comments?.length || 0}`);
        } else {
          console.log("ℹ️ No cache found for current PR");
        }
      },

      // Restore cached review
      restore: async () => {
        console.log("📦 Restoring cached review for current PR...");
        await restoreCachedReviewIfExists();
      },

      // Test cache functionality with mock data
      test: async () => {
        console.log("🧪 Testing cache functionality...");
        const prInfo = extractPRInfo();
        const testReview = {
          summary: "This is a test cached review",
          comments: [
            {
              filename: "test.js",
              line: 1,
              severity: "info",
              body: "Test comment for cache verification",
            },
          ],
        };

        console.log("1️⃣ Saving test review to cache...");
        await setCachedReview(prInfo.url, testReview);

        console.log("2️⃣ Retrieving test review from cache...");
        const retrieved = await getCachedReview(prInfo.url);

        if (retrieved) {
          console.log("✅ Cache test PASSED!");
          console.log("Retrieved:", retrieved);
        } else {
          console.log("❌ Cache test FAILED - could not retrieve");
        }

        console.log("3️⃣ Displaying cached review...");
        await displayReview(retrieved, true);
      },

      // View raw storage data
      viewStorage: async () => {
        console.log("🔍 Viewing raw cache storage...");
        const result = await chrome.storage.local.get([CONFIG.REVIEW_CACHE_KEY]);
        console.log("Raw storage data:", result);
        const cache = result[CONFIG.REVIEW_CACHE_KEY];
        if (cache) {
          console.log("Cache entries:", Object.keys(cache).length);
          Object.keys(cache).forEach((key) => {
            console.log(`  - ${key}`);
            console.log(`    Timestamp: ${new Date(cache[key].timestamp)}`);
            console.log(`    Has review: ${!!cache[key].review}`);
          });
        } else {
          console.log("No cache data found");
        }
      },
    },
  };

  console.log("🐛 Debug helper loaded! Use window.debugAIReview in console:");
  console.log("  - debugAIReview.testDisplay() - Test with mock data");
  console.log("  - debugAIReview.checkState() - Check extension state");
  console.log("  - debugAIReview.trigger() - Manually trigger review");
  console.log("  - debugAIReview.clear() - Clear review display");
  console.log("  - debugAIReview.checkSelectors() - Check available DOM elements");
  console.log("  - debugAIReview.checkFilesTab() - Check Files tab elements");
  console.log("  - debugAIReview.forceInject() - Force button injection");
  console.log("\n📦 Cache management:");
  console.log("  - debugAIReview.cache.list() - List all cached reviews");
  console.log("  - debugAIReview.cache.check() - Check cache for current PR");
  console.log("  - debugAIReview.cache.clearCurrent() - Clear cache for current PR");
  console.log("  - debugAIReview.cache.clearAll() - Clear all cached reviews");
  console.log("  - debugAIReview.cache.restore() - Restore cache for current PR");
  console.log("  - debugAIReview.cache.test() - Test cache with mock data");
  console.log("  - debugAIReview.cache.viewStorage() - View raw cache storage");

  // Initialize
  async function restoreCachedReviewIfExists() {
    try {
      console.log("🔄 Attempting to restore cached review...");

      // Check if review is already displayed
      const existingReview = document.getElementById(CONFIG.REVIEW_CONTAINER_ID);
      if (existingReview) {
        console.log("ℹ️ Review already displayed, skipping cache restore");
        return;
      }

      const prInfo = extractPRInfo();
      console.log("📍 PR Info:", {
        url: prInfo.url,
        prNumber: prInfo.prNumber,
      });

      const cachedReview = await getCachedReview(prInfo.url);

      if (cachedReview) {
        console.log("✅ Cached review found! Restoring...");
        console.log("📦 Cached review structure:", {
          hasSummary: !!cachedReview?.summary,
          summaryLength: cachedReview?.summary?.length || 0,
          commentsCount: cachedReview?.comments?.length || 0,
        });
        await displayReview(cachedReview, true);
      } else {
        console.log("ℹ️ No cached review found for this PR");
      }
    } catch (error) {
      console.error("❌ Error restoring cached review:", error);
    }
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("📨 Message received:", request);

    if (request.action === "triggerReview") {
      console.log("🎯 Trigger review requested from extension icon");
      if (isPRPage()) {
        const button = document.getElementById(CONFIG.BUTTON_ID);
        if (button) {
          button.click();
          sendResponse({ success: true, message: "Review triggered" });
        } else {
          console.log("Button not found, attempting injection first");
          injectReviewButton();
          setTimeout(() => {
            const btn = document.getElementById(CONFIG.BUTTON_ID);
            if (btn) {
              btn.click();
              sendResponse({ success: true, message: "Review triggered after injection" });
            } else {
              sendResponse({ success: false, error: "Could not find button" });
            }
          }, 1000);
          return true; // Keep channel open for async response
        }
      } else {
        sendResponse({ success: false, error: "Not on a PR page" });
      }
      return false;
    }

    // Unknown action
    sendResponse({ success: false, error: "Unknown action" });
    return false;
  });

  function init() {
    if (isPRPage()) {
      // Wait for page to be fully loaded before checking cache
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          setTimeout(injectReviewButton, 100);
          setTimeout(restoreCachedReviewIfExists, 200);
        });
      } else {
        // Initial injection with immediate attempt plus retries
        injectReviewButton();
        // Check for cached review after page is ready
        setTimeout(restoreCachedReviewIfExists, 300);
      }

      // Listen for tab changes (GitHub uses PJAX for navigation)
      document.addEventListener("pjax:end", () => {
        console.log("🔄 PJAX navigation detected, re-injecting button");
        injectionRetryCount = 0;
        setTimeout(injectReviewButton, 100);
        // Restore cached review if available
        setTimeout(restoreCachedReviewIfExists, 300);
      });

      // Watch for Files tab click
      let filesTabClickDebounce;
      document.addEventListener("click", (e) => {
        const target = e.target.closest('a[data-tab-item="files-tab"], a[href*="/files"]');
        if (target) {
          console.log("📂 Files tab clicked, injecting button");
          clearTimeout(filesTabClickDebounce);
          filesTabClickDebounce = setTimeout(() => {
            injectionRetryCount = 0;
            injectReviewButton();
            // Restore cached review if available
            setTimeout(restoreCachedReviewIfExists, 300);
          }, 200);
        }
      });

      // Re-inject button on DOM changes (GitHub is a SPA)
      let lastUrl = location.href;
      let debounceTimer;
      const observer = new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
          lastUrl = url;
          if (isPRPage()) {
            console.log("🔄 URL changed, re-injecting button");
            injectionRetryCount = 0;
            setTimeout(injectReviewButton, 100);
            // Restore cached review for the new URL
            setTimeout(restoreCachedReviewIfExists, 300);
          } else {
            // If we navigated away from PR page, disconnect observer to save resources
            console.log("📤 Navigated away from PR page");
            if (injectionObserver) {
              injectionObserver.disconnect();
              injectionObserver = null;
            }
          }
        }

        // Also re-inject if Files area appears in DOM
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const filesArea = document.querySelector("#files_bucket, #files");
          const hasButton = document.getElementById(CONFIG.BUTTON_ID);
          if (filesArea && !hasButton && isPRPage()) {
            console.log("📂 Files area detected without button, injecting");
            injectionRetryCount = 0;
            injectReviewButton();
          }
        }, 500);
      });

      observer.observe(document.body, { subtree: true, childList: true });

      // Cleanup on page unload
      window.addEventListener("beforeunload", () => {
        console.log("🧹 Cleaning up before page unload");
        observer.disconnect();
        if (injectionObserver) {
          injectionObserver.disconnect();
          injectionObserver = null;
        }
        clearTimeout(debounceTimer);
      });

      // Also cleanup on visibility change (tab switch)
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          console.log("👁️ Page hidden, pausing observer");
          observer.disconnect();
        } else if (isPRPage()) {
          console.log("👁️ Page visible, resuming observer");
          observer.observe(document.body, { subtree: true, childList: true });
        }
      });
    }
  }

  // Initialize and expose debug helper
  console.log("🔧 Initializing GitHub PR AI Reviewer...");
  init();
  console.log(
    "✅ GitHub PR AI Reviewer initialized. Debug helper available at window.debugAIReview"
  );
})();
