//! Main
//!
//! Binary entry point that launches the Tauri application.

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    notron_lib::run()
}
