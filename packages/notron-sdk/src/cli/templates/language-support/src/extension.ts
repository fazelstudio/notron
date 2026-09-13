/**
 * Template
 *
 * Language support template for new extensions.
 */
import * as notron from 'notron-sdk';
export async function activate(context: notron.ExtensionContext): Promise<void> {
 context.logChannel.appendLine('[language-support stub] activated');
}
export async function deactivate(): Promise<void> {}
