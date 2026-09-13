/**
 * Template
 *
 * Webview view template for new extensions.
 */
import * as notron from 'notron-sdk';

export async function activate(context: notron.ExtensionContext): Promise<void> {
 context.logChannel.appendLine('[webview-view stub] activated — template placeholder');
 // Stub: views.registerWebviewViewProvider would go here once bridged
}

export async function deactivate(): Promise<void> {}
