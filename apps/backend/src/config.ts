/**
 * Every environment variable the backend reads. Values stay raw here: each consumer keeps its own parsing so a bad
 * PORT still fails inside bootstrap's error handling and a bad MIN_FREE_SPACE still logs a warning and falls back.
 */
export interface Config {
  readonly port: string | undefined
  readonly nodeEnv: string | undefined
  readonly minFreeSpace: string | undefined
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  return { port: env.PORT, nodeEnv: env.NODE_ENV, minFreeSpace: env.MIN_FREE_SPACE }
}

export const config = loadConfig(process.env)
