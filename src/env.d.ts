/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENROUTER_API_KEY?: string;
  readonly VITE_GITHUB_OWNER?: string;
  readonly VITE_GITHUB_REPO?: string;
  readonly VITE_GITHUB_TOKEN?: string;
  readonly VITE_GITHUB_MERGE_WORKFLOW_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
