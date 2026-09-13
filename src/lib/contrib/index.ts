/**
 * Contributions
 *
 * Registers built-in features.
 */

import './explorer/contribution';
import './search/contribution';
import './scm/contribution';
import './debug/contribution';
import './terminal/contribution';
import './editor/contribution';
// Ensure workbench registries are initialized (side-effect imports)
import '../workbench/scmRegistry';
import '../workbench/taskRegistry';
import '../workbench/snippetRegistry';
import '../workbench/settingsRegistry';
import '../workbench/editorGroupRegistry';
import '../workbench/bottomPanelRegistry';