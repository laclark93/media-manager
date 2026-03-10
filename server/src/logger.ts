const VERBOSE = (process.env.VERBOSE_LOGGING ?? 'true').toLowerCase() !== 'false';

export function info(message: string) {
  console.log(`[INFO] ${message}`);
}

export function warn(message: string) {
  console.log(`[WARN] ${message}`);
}

export function error(message: string) {
  console.log(`[ERROR] ${message}`);
}

/** Verbose-only log — silenced when VERBOSE_LOGGING=false */
export function verbose(message: string) {
  if (VERBOSE) console.log(`[VERBOSE] ${message}`);
}

/** Trace-level log — silenced when VERBOSE_LOGGING=false */
export function trace(message: string) {
  if (VERBOSE) console.log(`[TRACE] ${message}`);
}

export function isVerbose(): boolean {
  return VERBOSE;
}
