/**
 * Error
 *
 * Utility helpers for error.
 */

export function getHumanReadableError(err: unknown): string {
  const msg = String(err).toLowerCase();
  
  if (msg.includes('no space') || msg.includes('disk full')) {
    return 'Your disk is full. Free up some space and try again.';
  }
  if (msg.includes('permission') || msg.includes('access denied')) {
    return 'You don\'t have permission to access this file.';
  }
  if (msg.includes('not found') || msg.includes('no such file')) {
    return 'The file or folder could not be found.';
  }
  if (msg.includes('busy') || msg.includes('locked')) {
    return 'The file is being used by another program.';
  }
  if (msg.includes('network') || msg.includes('connection')) {
    return 'Network error. Please check your connection.';
  }
  
  return 'An unexpected error occurred. Please try again.';
}
