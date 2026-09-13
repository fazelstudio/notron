/**
 * Template
 *
 * Custom editor template for new extensions.
 */
import * as notron from 'notron-sdk';
export async function activate(context: notron.ExtensionContext): Promise<void> {
 context.logChannel.appendLine('[custom-editor stub] activated');
 // TODO: window.registerCustomEditorProvider when generic registry lands
}
export async function deactivate(): Promise<void> {}
