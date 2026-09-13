// Startup
//
// Rust module.
use std::sync::Mutex;
use std::time::Instant;
use serde::Serialize;
use tauri::State;

/// Profiling as a habit, built in from day one.
///
/// A lightweight startup/profile timer. Every phase (backend setup steps and,
/// via `record_startup_timer`, frontend phases such as "window interactive" or
/// "first tab ready") is timestamped and queryable through `get_startup_timers`.
/// This is the `notron://startup-timers` instrumentation used by the
/// frontend: every performance fix can be measured against explicit targets
/// instead of "feels faster".
#[derive(Serialize, Clone, Debug)]
pub struct StartupPhase {
    pub name: String,
    pub elapsed_ms: f64,
}

pub struct StartupTimers {
    started: Instant,
    phases: Mutex<Vec<(String, f64)>>,
}

impl StartupTimers {
    pub fn new() -> Self {
        Self {
            started: Instant::now(),
            phases: Mutex::new(Vec::new()),
        }
    }

    pub fn record(&self, name: &str) {
        let elapsed = self.started.elapsed().as_secs_f64() * 1000.0;
        tracing::info!("[startup] {} = {:.1}ms", name, elapsed);
        self.phases.lock().unwrap().push((name.to_string(), elapsed));
    }
}

#[tauri::command]
pub fn get_startup_timers(state: State<'_, StartupTimers>) -> Result<Vec<StartupPhase>, String> {
    Ok(state
        .phases
        .lock()
        .unwrap()
        .iter()
        .map(|(name, elapsed)| StartupPhase {
            name: name.clone(),
            elapsed_ms: *elapsed,
        })
        .collect())
}

/// Frontend-side phase marker (fire-and-forget). The webview reports its own
/// milestones (window shown, first tab rendered, git status arrived) so the
/// profile spans the whole boot, not just the Rust side.
#[tauri::command]
pub fn record_startup_timer(name: String, state: State<'_, StartupTimers>) {
    state.record(&name);
}
