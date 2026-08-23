/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional dedicated YouTube Data API key. Falls back to the Firebase
   *  project's key, which belongs to the same Google Cloud project. Set this
   *  only if you want the YouTube quota and key restrictions kept separate. */
  readonly VITE_YOUTUBE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
