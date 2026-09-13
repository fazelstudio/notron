// Discord
//
// Rust module.
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

pub struct DiscordState(pub Mutex<Option<DiscordIpcClient>>);

impl DiscordState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

#[derive(Serialize)]
pub struct DiscordStatus {
    connected: bool,
}

#[tauri::command]
pub async fn init_discord_presence(state: State<'_, DiscordState>) -> Result<DiscordStatus, String> {
    let mut client_lock = state.0.lock().unwrap();

    if client_lock.is_some() {
        return Ok(DiscordStatus { connected: true });
    }

    let mut client = DiscordIpcClient::new("1441661710925566073");

    if client.connect().is_ok() {
        let _ = client.set_activity(
            activity::Activity::new()
                .state("Idle")
                .details("In Notron Editor"),
        );
        *client_lock = Some(client);
        Ok(DiscordStatus { connected: true })
    } else {
        Ok(DiscordStatus { connected: false })
    }
}

#[tauri::command]
pub async fn set_discord_activity(
    state: State<'_, DiscordState>,
    details: String,
    workspace: String,
    timestamp: Option<i64>,
    large_image: Option<String>,
    large_text: Option<String>,
    small_image: Option<String>,
    small_text: Option<String>,
) -> Result<(), String> {
    let mut client_lock = state.0.lock().unwrap();

    if let Some(client) = client_lock.as_mut() {
        let mut act = activity::Activity::new()
            .details(&details)
            .state(&workspace);
            
        let mut assets = activity::Assets::new();
        let mut has_assets = false;
        
        if let Some(ref li) = large_image {
            assets = assets.large_image(li);
            has_assets = true;
        }
        if let Some(ref lt) = large_text {
            assets = assets.large_text(lt);
            has_assets = true;
        }
        if let Some(ref si) = small_image {
            assets = assets.small_image(si);
            has_assets = true;
        }
        if let Some(ref st) = small_text {
            assets = assets.small_text(st);
            has_assets = true;
        }
        
        if has_assets {
            act = act.assets(assets);
        }
        
        let mut timestamps = activity::Timestamps::new();
        if let Some(ts) = timestamp {
            timestamps = timestamps.start(ts);
            act = act.timestamps(timestamps);
        }

        let _ = client.set_activity(act);
    }
    Ok(())
}

#[tauri::command]
pub async fn clear_discord_presence(state: State<'_, DiscordState>) -> Result<(), String> {
    let mut client_lock = state.0.lock().unwrap();
    
    if let Some(mut client) = client_lock.take() {
        let _ = client.close();
    }
    
    Ok(())
}
