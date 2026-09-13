/**
 * Template
 *
 * Hello world template for new extensions.
 */
import * as notron from 'notron-sdk';

export async function activate(context: notron.ExtensionContext): Promise<void> {
 const cmd = notron.commands.registerCommand('hello-world.hello', async () => {
 await notron.window.showInformationMessage('Hello World from Notron!');
 });
 context.subscriptions.push(cmd);
 context.logChannel.appendLine('[hello-world] activated');
}

export async function deactivate(): Promise<void> {
 // no-op — subscriptions disposed by host
}
