#!/usr/bin/env node
/**
 * Bin
 *
 * CLI module..
 */
/**
 * CLI Entry
 *
 * Entry point for the command line.
 */
import { runCli } from './index.js';

const argv = process.argv.slice(2);
runCli(argv).catch((err: unknown) => {
 const msg = err instanceof Error ? err.message : String(err);
 console.error(msg);
 process.exit(1);
});
