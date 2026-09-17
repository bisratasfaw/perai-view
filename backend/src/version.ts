import { version } from '../package.json'

/** Backend version from package.json (inlined at build time by esbuild). */
export const APP_VERSION: string = version
