const providerKeys: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  gemini: "GOOGLE_API_KEY",
  "google-gemini": "GOOGLE_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  nvidia: "NVIDIA_API_KEY",
};

export const compatibleProviders = {
  openrouter: { key: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1" },
  nvidia: { key: "NVIDIA_API_KEY", url: "https://integrate.api.nvidia.com/v1" },
} as const;

export function modelKeyConfigured(model?: string) {
  const [, provider = "", id = ""] = model?.trim().match(/^([^/:]*)[/:](.*)$/) ?? [];
  const key = providerKeys[provider.toLowerCase()];
  return Boolean(id.trim() && key && process.env[key]?.trim());
}
