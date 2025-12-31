// Popup script for GitHub PR AI Reviewer settings

console.log("Popup script loaded");

document.addEventListener("DOMContentLoaded", async () => {
  console.log("Popup loaded, initializing...");

  const form = document.getElementById("settings-form");
  const openrouterApiKeyInput = document.getElementById("openrouter-api-key");
  const aiModelSelect = document.getElementById("ai-model");
  const githubTokenInput = document.getElementById("github-token");
  const reviewDepthSelect = document.getElementById("review-depth");
  const autoReviewCheckbox = document.getElementById("auto-review");
  const saveBtn = document.getElementById("save-btn");
  const resetBtn = document.getElementById("reset-btn");
  const clearCacheBtn = document.getElementById("clear-cache-btn");
  const toggleOpenrouterKeyBtn = document.getElementById("toggle-openrouter-key");
  const toggleGithubTokenBtn = document.getElementById("toggle-github-token");
  const statusMessage = document.getElementById("status-message");

  // State for available models
  let availableModels = [];

  // Cache configuration
  const MODELS_CACHE_KEY = "ai_models_cache";
  const MODELS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  // Check if required elements exist
  if (!form || !openrouterApiKeyInput || !saveBtn || !statusMessage) {
    console.error("Required form elements not found!");
    if (statusMessage) {
      showStatus("Error: Form elements missing", "error");
    }
    return;
  }

  console.log("All required elements found");

  // Default settings
  const DEFAULT_SETTINGS = {
    openrouterApiKey: "",
    aiModel: "anthropic/claude-3.5-sonnet",
    githubToken: "",
    autoReview: false,
    reviewDepth: "medium",
  };

  // Load saved settings
  await loadSettings();

  // Toggle password visibility functions
  const setupPasswordToggle = (toggleBtn, inputField) => {
    if (!toggleBtn || !inputField) {
      return;
    }

    const eyeOpen = `
      <svg class="eye-icon" height="16" width="16" viewBox="0 0 16 16">
        <path fill="currentColor" d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 0 1 0-1.798c.45-.677 1.367-1.931 2.637-3.022C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.825.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z"></path>
      </svg>
    `;

    const eyeClosed = `
      <svg class="eye-icon" height="16" width="16" viewBox="0 0 16 16">
        <path fill="currentColor" d="m10.79 12.912-1.614-1.615a3.5 3.5 0 0 1-4.474-4.474l-2.06-2.06C.938 6.278 0 8 0 8s3 5.5 8 5.5a7.029 7.029 0 0 0 2.79-.588ZM5.21 3.088A7.028 7.028 0 0 1 8 2.5c5 0 8 5.5 8 5.5s-.939 1.721-2.641 3.238l-2.062-2.062a3.5 3.5 0 0 0-4.474-4.474L5.21 3.089Z"></path>
        <path fill="currentColor" d="M5.525 7.646a2.5 2.5 0 0 0 2.829 2.829l-2.83-2.829Zm4.95.708-2.829-2.83a2.5 2.5 0 0 1 2.829 2.829Zm3.171 6-12-12 .708-.708 12 12-.708.708Z"></path>
      </svg>
    `;

    toggleBtn.addEventListener("click", () => {
      const type = inputField.getAttribute("type");
      if (type === "password") {
        inputField.setAttribute("type", "text");
        toggleBtn.innerHTML = eyeClosed;
      } else {
        inputField.setAttribute("type", "password");
        toggleBtn.innerHTML = eyeOpen;
      }
    });
  };

  setupPasswordToggle(toggleOpenrouterKeyBtn, openrouterApiKeyInput);
  setupPasswordToggle(toggleGithubTokenBtn, githubTokenInput);

  // Fetch models when API key is entered
  if (openrouterApiKeyInput) {
    openrouterApiKeyInput.addEventListener("blur", async () => {
      const apiKey = openrouterApiKeyInput.value.trim();
      if (apiKey && apiKey.startsWith("sk-or-")) {
        await fetchAndPopulateModels(apiKey);
      }
    });
  }

  // Auto-save model selection when changed
  if (aiModelSelect) {
    aiModelSelect.addEventListener("change", async () => {
      try {
        const selectedModel = aiModelSelect.value;
        console.log(`🔄 Model dropdown changed to: ${selectedModel}`);
        await chrome.storage.local.set({ aiModel: selectedModel });
        console.log(`✅ Auto-saved model selection: ${selectedModel}`);

        // Verify it was saved
        const verification = await chrome.storage.local.get(["aiModel"]);
        console.log(`🔍 Verified saved value: ${verification.aiModel}`);

        showStatus("Model selection saved", "success");
      } catch (error) {
        console.error("❌ Error auto-saving model selection:", error);
        showStatus("Failed to save model selection", "error");
      }
    });
  }

  // Handle form submission
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await saveSettings();
    });
  }

  // Reset to defaults
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (
        confirm(
          "Are you sure you want to reset all settings to defaults? This will clear all API keys."
        )
      ) {
        try {
          await chrome.storage.local.clear();
          await loadSettings();
          showStatus("Settings reset to defaults", "success");
        } catch (error) {
          console.error("Error resetting settings:", error);
          showStatus("Failed to reset settings", "error");
        }
      }
    });
  }

  // Clear cache button
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener("click", async () => {
      if (
        confirm(
          "Are you sure you want to clear all cached PR reviews? This will remove all saved reviews from previous analyses."
        )
      ) {
        try {
          clearCacheBtn.disabled = true;
          clearCacheBtn.innerHTML = `
            <svg class="btn-icon" style="animation: rotate 1s linear infinite;" height="16" width="16" viewBox="0 0 16 16">
              <path fill="currentColor" d="M8 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" opacity="0.3"></path>
              <path fill="currentColor" d="M8 0a8 8 0 0 1 8 8h-1.5A6.5 6.5 0 0 0 8 1.5V0Z"></path>
            </svg>
            Clearing...
          `;

          await chrome.storage.local.remove(["pr_review_cache"]);
          showStatus("Cache cleared successfully!", "success");

          clearCacheBtn.disabled = false;
          clearCacheBtn.innerHTML = `
            <svg class="btn-icon" height="16" width="16" viewBox="0 0 16 16">
              <path fill="currentColor" d="M6.5 1.75a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.75 1.75 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15zM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25z"></path>
            </svg>
            Clear Cache
          `;
        } catch (error) {
          console.error("Error clearing cache:", error);
          showStatus(`Failed to clear cache: ${error.message}`, "error");
          clearCacheBtn.disabled = false;
          clearCacheBtn.innerHTML = `
            <svg class="btn-icon" height="16" width="16" viewBox="0 0 16 16">
              <path fill="currentColor" d="M6.5 1.75a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.75 1.75 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15zM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25z"></path>
            </svg>
            Clear Cache
          `;
        }
      }
    });
  }

  // Load settings from storage
  async function loadSettings() {
    try {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.error("Chrome storage API not available");
        throw new Error("Chrome storage API not available. Please reload the extension.");
      }

      console.log("Attempting to load settings from chrome.storage.local...");

      const settings = await chrome.storage.local.get([
        "openrouterApiKey",
        "aiModel",
        "githubToken",
        "autoReview",
        "reviewDepth",
      ]);

      console.log("Successfully loaded settings:", {
        hasOpenrouterApiKey: !!settings.openrouterApiKey,
        hasGithubToken: !!settings.githubToken,
        aiModel: settings.aiModel,
        reviewDepth: settings.reviewDepth,
        autoReview: settings.autoReview,
      });

      // Load non-sensitive settings (but NOT the AI model yet - that will be set after models are fetched)
      if (reviewDepthSelect) {
        reviewDepthSelect.value = settings.reviewDepth || DEFAULT_SETTINGS.reviewDepth;
      }

      if (autoReviewCheckbox) {
        autoReviewCheckbox.checked = settings.autoReview || DEFAULT_SETTINGS.autoReview;
      }

      // Load API keys
      if (openrouterApiKeyInput) {
        const apiKey = settings.openrouterApiKey;
        openrouterApiKeyInput.value = apiKey && typeof apiKey === "string" ? apiKey : "";
      }

      if (githubTokenInput) {
        const token = settings.githubToken;
        githubTokenInput.value = token && typeof token === "string" ? token : "";
      }

      // Fetch models if API key is available
      if (settings.openrouterApiKey) {
        const modelToLoad = settings.aiModel || DEFAULT_SETTINGS.aiModel;
        console.log(`📥 Loading saved model from storage: ${modelToLoad}`);
        console.log(`🔄 Fetching and populating models (will restore to: ${modelToLoad})`);
        await fetchAndPopulateModels(settings.openrouterApiKey, modelToLoad);
        console.log(`✅ Models populated (final dropdown value: ${aiModelSelect.value})`);
      } else {
        // If not fetching models, set the dropdown value now with hardcoded options
        if (aiModelSelect) {
          const modelToLoad = settings.aiModel || DEFAULT_SETTINGS.aiModel;
          console.log(`📥 Loading saved model from storage: ${modelToLoad}`);
          aiModelSelect.value = modelToLoad;
          console.log(`📋 Dropdown value set to: ${aiModelSelect.value}`);
        }
        // Hide loading indicator if not fetching models
        const loadingIndicator = document.getElementById("models-loading");
        if (loadingIndicator) {
          loadingIndicator.style.display = "none";
        }
        console.log(`⚠️ Not fetching models - API key: ${!!settings.openrouterApiKey}`);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      console.error("Error stack:", error.stack);

      // Set default values if loading fails
      if (aiModelSelect) {
        aiModelSelect.value = DEFAULT_SETTINGS.aiModel;
      }
      if (reviewDepthSelect) {
        reviewDepthSelect.value = DEFAULT_SETTINGS.reviewDepth;
      }
      if (autoReviewCheckbox) {
        autoReviewCheckbox.checked = DEFAULT_SETTINGS.autoReview;
      }

      showStatus(`Loaded default settings (storage error: ${error.message})`, "error");
    }
  }

  // Fetch available models from OpenRouter
  async function fetchAndPopulateModels(apiKey, modelToRestore = null) {
    if (!apiKey || !aiModelSelect) {
      return;
    }

    const loadingIndicator = document.getElementById("models-loading");

    try {
      // Check cache first
      console.log("Checking model cache...");
      const cached = await chrome.storage.local.get([MODELS_CACHE_KEY]);
      const modelCache = cached[MODELS_CACHE_KEY];

      let allModels = [];

      if (modelCache && modelCache.models && Date.now() < modelCache.expiry) {
        console.log(
          `✅ Using cached models (age: ${Math.round(
            (Date.now() - modelCache.timestamp) / 1000 / 60
          )} minutes)`
        );
        allModels = modelCache.models;
      } else {
        console.log("🔄 Fetching fresh models from OpenRouter API...");

        // Show loading indicator
        if (loadingIndicator) {
          loadingIndicator.style.display = "inline";
        }

        // Fetch models from OpenRouter
        const response = await fetch("https://openrouter.ai/api/v1/models", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          console.error("Failed to fetch models:", response.status);
          if (loadingIndicator) {
            loadingIndicator.style.display = "none";
          }
          return;
        }

        const data = await response.json();
        allModels = data.data || [];

        // Cache the models
        await chrome.storage.local.set({
          [MODELS_CACHE_KEY]: {
            models: allModels,
            timestamp: Date.now(),
            expiry: Date.now() + MODELS_CACHE_TTL,
          },
        });
        console.log(`💾 Cached ${allModels.length} models for 24 hours`);
      }

      if (allModels.length === 0) {
        console.warn("No models returned from API");
        if (loadingIndicator) {
          loadingIndicator.style.display = "none";
        }
        return;
      }

      console.log(`Fetched ${allModels.length} models from API`);

      // Filter out inappropriate models for code reviews
      availableModels = allModels.filter((model) => {
        // Filter 1: Require text output modality
        if (!model.architecture?.output_modalities?.includes("text")) {
          console.log(`❌ Filtered out ${model.id}: not a text output model`);
          return false;
        }

        // Filter 2: Require minimum context length (8K tokens minimum for code reviews)
        if (!model.context_length || model.context_length < 8000) {
          console.log(
            `❌ Filtered out ${model.id}: insufficient context length (${model.context_length})`
          );
          return false;
        }

        // Filter 3: Filter out image/embedding-only models
        const modalities = model.architecture?.input_modalities || [];
        const outputModalities = model.architecture?.output_modalities || [];
        if (modalities.length === 1 && modalities[0] === "image" && !modalities.includes("text")) {
          console.log(`❌ Filtered out ${model.id}: image-only model`);
          return false;
        }
        if (outputModalities.length === 1 && outputModalities[0] === "image") {
          console.log(`❌ Filtered out ${model.id}: image output only`);
          return false;
        }

        // Filter 4: Filter out models with "nsfw" or "uncensored" in name/description (case insensitive)
        const modelName = (model.name || "").toLowerCase();
        const modelId = (model.id || "").toLowerCase();
        const description = (model.description || "").toLowerCase();
        const nsfwKeywords = ["nsfw", "uncensored", "unfiltered", "adult", "erotic"];
        if (
          nsfwKeywords.some(
            (keyword) =>
              modelName.includes(keyword) ||
              modelId.includes(keyword) ||
              description.includes(keyword)
          )
        ) {
          console.log(`❌ Filtered out ${model.id}: contains NSFW/adult keywords`);
          return false;
        }

        // Filter 5: Filter out experimental/test models with common patterns
        const experimentalKeywords = [
          "experimental",
          "test",
          "preview",
          "beta",
          "alpha",
          "dev",
          "nightly",
        ];
        // Allow some preview models from major providers
        const majorProviders = ["anthropic", "openai", "google", "meta-llama"];
        const provider = modelId.split("/")[0] || "";
        const isPreviewFromMajor =
          majorProviders.includes(provider) &&
          (modelName.includes("preview") || modelId.includes("preview"));

        if (
          !isPreviewFromMajor &&
          experimentalKeywords.some(
            (keyword) => modelName.includes(keyword) || modelId.includes(keyword)
          )
        ) {
          console.log(`❌ Filtered out ${model.id}: experimental/test model`);
          return false;
        }

        // Filter 6: Filter out deprecated models
        if (modelName.includes("deprecated") || description.includes("deprecated")) {
          console.log(`❌ Filtered out ${model.id}: deprecated model`);
          return false;
        }

        // Filter 7: Filter out models from unknown/suspicious providers (whitelist approach for quality)
        const trustedProviders = [
          "anthropic",
          "openai",
          "google",
          "meta-llama",
          "mistralai",
          "cohere",
          "ai21",
          "amazon",
          "microsoft",
          "deepseek",
          "qwen",
          "nvidia",
          "perplexity",
          "01-ai",
          "liquid",
          "x-ai",
          "inflection",
          "databricks",
          "wizardlm",
        ];

        if (!trustedProviders.includes(provider)) {
          console.log(`❌ Filtered out ${model.id}: provider '${provider}' not in trusted list`);
          return false;
        }

        return true;
      });

      console.log(
        `✅ Filtered to ${availableModels.length} suitable models (removed ${allModels.length - availableModels.length})`
      );

      if (availableModels.length === 0) {
        console.warn("No suitable models after filtering");
        if (loadingIndicator) {
          loadingIndicator.style.display = "none";
        }
        showStatus("No suitable models found. Using defaults.", "error");
        return;
      }

      // Fetch benchmark scores from ZeroEval
      let benchmarkScores = {};
      try {
        const benchmarkResponse = await fetch("https://api.zeroeval.com/leaderboard/models/full");
        if (benchmarkResponse.ok) {
          const benchmarkData = await benchmarkResponse.json();
          // Create a map of model_id to multiple scores
          benchmarkScores = benchmarkData.reduce((acc, model) => {
            const scores = {};
            if (
              model.swe_bench_verified_score !== null &&
              model.swe_bench_verified_score !== undefined
            ) {
              scores.swe = model.swe_bench_verified_score;
            }
            if (model.gpqa_score !== null && model.gpqa_score !== undefined) {
              scores.gpqa = model.gpqa_score;
            }
            if (model.aime_2025_score !== null && model.aime_2025_score !== undefined) {
              scores.aime = model.aime_2025_score;
            }
            if (Object.keys(scores).length > 0) {
              acc[model.model_id] = scores;
            }
            return acc;
          }, {});
          console.log(
            `✅ Fetched benchmark scores for ${Object.keys(benchmarkScores).length} models`
          );
          console.log("📋 Sample benchmark model IDs:", Object.keys(benchmarkScores).slice(0, 10));
          console.log("📊 Sample score data:", Object.entries(benchmarkScores).slice(0, 3));
        } else {
          console.error("❌ Failed to fetch benchmark scores. Status:", benchmarkResponse.status);
        }
      } catch (error) {
        console.error("❌ Failed to fetch benchmark scores:", error);
      }

      // Use the modelToRestore parameter if provided, otherwise save current selection
      const valueToRestore = modelToRestore || aiModelSelect.value;
      console.log(`💾 Model to restore after repopulation: ${valueToRestore}`);

      // Clear existing options
      aiModelSelect.innerHTML = "";

      // Group models by provider
      const modelsByProvider = {};
      console.log(`🔍 Processing ${availableModels.length} models from OpenRouter`);
      availableModels.forEach((model) => {
        const modelId = model.id || "";
        const provider = modelId.split("/")[0] || "other";
        if (!modelsByProvider[provider]) {
          modelsByProvider[provider] = [];
        }
        modelsByProvider[provider].push(model);
      });

      console.log(
        "📊 Grouped models by provider:",
        Object.keys(modelsByProvider).map((p) => ({
          provider: p,
          count: modelsByProvider[p].length,
          models: modelsByProvider[p].map((m) => ({
            id: m.id,
            name: m.name,
            stripped: m.id.replace(/^[^/]+\//, ""),
          })),
        }))
      );

      // Sort providers alphabetically
      const sortedProviders = Object.keys(modelsByProvider).sort();

      // Popular providers to show first
      const priorityProviders = ["anthropic", "openai", "google", "meta-llama", "mistralai"];
      const otherProviders = sortedProviders.filter((p) => !priorityProviders.includes(p));

      // Add models grouped by provider
      [...priorityProviders, ...otherProviders].forEach((provider) => {
        if (!modelsByProvider[provider]) {
          return;
        }

        const providerGroup = document.createElement("optgroup");
        providerGroup.label = provider.toUpperCase();

        modelsByProvider[provider].forEach((model) => {
          const option = document.createElement("option");
          option.value = model.id;

          // Create a friendly display name
          let displayName = model.name || model.id;
          const contextLength = model.context_length;
          if (contextLength) {
            displayName += ` (${(contextLength / 1024).toFixed(0)}K)`;
          }

          // Add pricing info if available
          const pricing = model.pricing;
          if (pricing && pricing.prompt) {
            const promptPrice = parseFloat(pricing.prompt);
            const completionPrice = parseFloat(pricing.completion || 0);

            if (promptPrice === 0 && completionPrice === 0) {
              displayName += " - FREE";
            } else {
              // Format prices in a readable way with better alignment
              const formatPrice = (price) => {
                if (price === 0) {
                  return "$0.00";
                }
                // Convert to per-million tokens for cleaner display
                const pricePerMillion = price * 1000;
                if (pricePerMillion >= 1) {
                  return `$${pricePerMillion.toFixed(2)}`;
                }
                if (pricePerMillion >= 0.1) {
                  return `$${pricePerMillion.toFixed(3)}`;
                }
                return `$${pricePerMillion.toFixed(4)}`;
              };

              displayName += ` | ${formatPrice(promptPrice)}/${formatPrice(completionPrice)}/1M`;
            }
          }

          // Add benchmark scores if available
          // Try multiple matching strategies
          let scores = null;
          const modelIdForBenchmark = model.id.replace(/^[^/]+\//, "");

          // Normalize function to help with matching
          const normalize = (str) => str.toLowerCase().replace(/[-_.]/g, "").replace(/\s+/g, "");

          // Strategy 1: Direct match without provider prefix
          scores = benchmarkScores[modelIdForBenchmark];

          // Strategy 2: Try full model ID
          if (!scores) {
            scores = benchmarkScores[model.id];
          }

          // Strategy 3: Fuzzy match by normalizing both IDs
          if (!scores) {
            const normalizedModelId = normalize(modelIdForBenchmark);
            for (const [benchmarkId, benchmarkScore] of Object.entries(benchmarkScores)) {
              const normalizedBenchmarkId = normalize(benchmarkId);
              // Check if one contains the other (handles version suffixes like -20240620)
              if (
                normalizedBenchmarkId.includes(normalizedModelId) ||
                normalizedModelId.includes(normalizedBenchmarkId)
              ) {
                scores = benchmarkScore;
                console.log(
                  `Fuzzy matched ${model.id} to ${benchmarkId} via normalized comparison`
                );
                break;
              }
            }
          }

          // Strategy 4: Match by model name
          if (!scores && model.name) {
            const normalizedName = normalize(model.name);
            for (const [benchmarkId, benchmarkScore] of Object.entries(benchmarkScores)) {
              const normalizedBenchmarkId = normalize(benchmarkId);
              if (
                normalizedBenchmarkId.includes(normalizedName) ||
                normalizedName.includes(normalizedBenchmarkId)
              ) {
                scores = benchmarkScore;
                console.log(`Matched ${model.id} to ${benchmarkId} via name: ${model.name}`);
                break;
              }
            }
          }

          // Debug logging for first few models
          const modelIndex = modelsByProvider[provider].indexOf(model);
          const providerIndex = [...priorityProviders, ...otherProviders].indexOf(provider);
          if (providerIndex === 0 && modelIndex < 3) {
            console.log(`🔬 Debugging model: ${model.id}`);
            console.log(`  - Stripped ID: ${modelIdForBenchmark}`);
            console.log(`  - Normalized: ${normalize(modelIdForBenchmark)}`);
            console.log(`  - Scores found: ${scores ? "YES" : "NO"}`);
            if (scores) {
              console.log("  - Score data:", scores);
            }
          }

          if (scores) {
            console.log(`✅ Found scores for ${model.id}:`, scores);
            const scoreText = [];
            // SWE-bench is most relevant for code reviews
            if (scores.swe !== undefined) {
              scoreText.push(`SWE:${(scores.swe * 100).toFixed(0)}%`);
            }
            // GPQA measures reasoning capabilities
            if (scores.gpqa !== undefined) {
              scoreText.push(`GPQA:${(scores.gpqa * 100).toFixed(0)}%`);
            }
            // AIME measures mathematical reasoning
            if (scores.aime !== undefined) {
              scoreText.push(`AIME:${(scores.aime * 100).toFixed(0)}%`);
            }
            if (scoreText.length > 0) {
              displayName += ` | ${scoreText.join(" ")}`;
              console.log(`📊 Display name with scores: ${displayName}`);
            }
          } else {
            console.log(`❌ No scores found for ${model.id} (tried: ${modelIdForBenchmark})`);
          }

          option.textContent = displayName;
          providerGroup.appendChild(option);
        });

        aiModelSelect.appendChild(providerGroup);
      });

      // Debug: Log all dropdown options after population
      console.log("🔍 === DROPDOWN OPTIONS DEBUG ===");
      console.log(`Total options: ${aiModelSelect.options.length}`);
      console.log(`Total optgroups: ${aiModelSelect.querySelectorAll("optgroup").length}`);

      // Log first 10 options from each provider
      const optgroups = aiModelSelect.querySelectorAll("optgroup");
      optgroups.forEach((optgroup, idx) => {
        if (idx < 3) {
          // Only log first 3 providers
          console.log(`\n📦 ${optgroup.label}:`);
          const options = Array.from(optgroup.querySelectorAll("option"));
          options.slice(0, 5).forEach((opt, optIdx) => {
            console.log(`  [${optIdx}] ${opt.textContent}`);
            console.log(`      Value: ${opt.value}`);
            console.log(`      Length: ${opt.textContent.length} chars`);
          });
          if (options.length > 5) {
            console.log(`  ... and ${options.length - 5} more options`);
          }
        }
      });
      console.log("🔍 === END DROPDOWN DEBUG ===\n");

      // Restore previous selection if it exists
      const optionExists = Array.from(aiModelSelect.options).some(
        (opt) => opt.value === valueToRestore
      );
      console.log(
        `🔍 Checking if saved model exists in dropdown: ${valueToRestore} - ${optionExists ? "YES" : "NO"}`
      );

      if (valueToRestore && optionExists) {
        aiModelSelect.value = valueToRestore;
        console.log(`✅ Restored previous selection: ${valueToRestore}`);
      } else {
        // Set recommended default
        console.log("⚠️ Previous selection not found, setting recommended default");
        const recommendedModels = [
          "google/gemini-2.5-flash",
          "anthropic/claude-3.5-sonnet",
          "openai/gpt-4-turbo",
        ];

        for (const modelId of recommendedModels) {
          if (Array.from(aiModelSelect.options).some((opt) => opt.value === modelId)) {
            aiModelSelect.value = modelId;
            console.log(`📌 Set recommended default: ${modelId}`);
            break;
          }
        }
      }

      // Hide loading indicator
      if (loadingIndicator) {
        loadingIndicator.style.display = "none";
      }

      showStatus(`Loaded ${availableModels.length} models from OpenRouter`, "success");
    } catch (error) {
      console.error("Error fetching models:", error);

      // Hide loading indicator on error
      if (loadingIndicator) {
        loadingIndicator.style.display = "none";
      }

      showStatus("Failed to load models. Using defaults.", "error");
    }
  }

  // Save settings to storage
  async function saveSettings() {
    const openrouterApiKey = openrouterApiKeyInput ? openrouterApiKeyInput.value.trim() : "";
    const githubToken = githubTokenInput ? githubTokenInput.value.trim() : "";

    // Validate OpenRouter API key
    if (!openrouterApiKey) {
      showStatus("OpenRouter API key is required", "error");
      if (openrouterApiKeyInput) {
        openrouterApiKeyInput.focus();
      }
      return;
    }

    const settings = {
      openrouterApiKey: openrouterApiKey,
      githubToken: githubToken,
      aiModel: aiModelSelect ? aiModelSelect.value : DEFAULT_SETTINGS.aiModel,
      reviewDepth: reviewDepthSelect ? reviewDepthSelect.value : DEFAULT_SETTINGS.reviewDepth,
      autoReview: autoReviewCheckbox ? autoReviewCheckbox.checked : DEFAULT_SETTINGS.autoReview,
    };

    console.log("Saving settings:", {
      hasOpenrouterApiKey: !!openrouterApiKey,
      hasGithubToken: !!githubToken,
      aiModel: settings.aiModel,
      reviewDepth: settings.reviewDepth,
      autoReview: settings.autoReview,
    });

    if (!chrome || !chrome.storage || !chrome.storage.local) {
      showStatus("Chrome storage API not available", "error");
      return;
    }

    try {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `
        <svg class="btn-icon" style="animation: rotate 1s linear infinite;" height="16" width="16" viewBox="0 0 16 16">
          <path fill="currentColor" d="M8 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" opacity="0.3"></path>
          <path fill="currentColor" d="M8 0a8 8 0 0 1 8 8h-1.5A6.5 6.5 0 0 0 8 1.5V0Z"></path>
        </svg>
        Saving...
      `;

      // Save all settings
      await chrome.storage.local.set(settings);

      showStatus("Settings saved successfully!", "success");

      // Reset button text
      setTimeout(() => {
        resetSaveButton();
      }, 1000);
    } catch (error) {
      console.error("Error saving settings:", error);
      showStatus(`Failed to save settings: ${error.message}`, "error");
      saveBtn.disabled = false;
      resetSaveButton();
    }
  }

  function resetSaveButton() {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `
      <svg class="btn-icon" height="16" width="16" viewBox="0 0 16 16">
        <path fill="currentColor" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>
      </svg>
      Save Settings
    `;
  }

  // Show status message
  function showStatus(message, type = "success") {
    console.log("Status:", type, message);
    if (!statusMessage) {
      console.error("Status message element not found!");
      return;
    }
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.classList.remove("hidden");

    // Hide after 5 seconds
    setTimeout(() => {
      statusMessage.classList.add("hidden");
    }, 5000);
  }

  // Global debug function to export dropdown content
  window.debugDropdown = function () {
    const dropdown = document.getElementById("ai-model");
    if (!dropdown) {
      console.error("❌ Dropdown not found!");
      return;
    }

    console.log("🔍 === FULL DROPDOWN EXPORT ===");
    console.log(`Total options: ${dropdown.options.length}`);

    const optgroups = dropdown.querySelectorAll("optgroup");
    console.log(`Total optgroups: ${optgroups.length}\n`);

    optgroups.forEach((optgroup, idx) => {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`Provider ${idx + 1}: ${optgroup.label}`);
      console.log(`${"=".repeat(60)}`);

      const options = Array.from(optgroup.querySelectorAll("option"));
      options.forEach((opt, optIdx) => {
        console.log(`\n[${idx}.${optIdx}] ${opt.textContent}`);
        console.log(`    Value: ${opt.value}`);
        console.log(`    Length: ${opt.textContent.length} chars`);

        // Check for proper formatting
        const hasPipe = opt.textContent.includes("|");
        const hasScores =
          opt.textContent.includes("SWE:") ||
          opt.textContent.includes("GPQA:") ||
          opt.textContent.includes("AIME:");
        console.log(`    Has pipe separator: ${hasPipe}`);
        console.log(`    Has benchmark scores: ${hasScores}`);
      });

      console.log(`\nTotal in ${optgroup.label}: ${options.length}`);
    });

    console.log(`\n${"=".repeat(60)}`);
    console.log("💡 To copy this data, right-click in console and select 'Save as...'");
    console.log("=".repeat(60));

    return {
      totalOptions: dropdown.options.length,
      totalProviders: optgroups.length,
      providers: Array.from(optgroups).map((og) => ({
        label: og.label,
        count: og.querySelectorAll("option").length,
        options: Array.from(og.querySelectorAll("option")).map((opt) => ({
          text: opt.textContent,
          value: opt.value,
        })),
      })),
    };
  };

  console.log(
    "💡 Debug function available: Run debugDropdown() in console to export dropdown data"
  );
});
