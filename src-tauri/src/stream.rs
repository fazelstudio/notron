//! Stream
//! 
//! Unified streaming IPC batch format.

use serde::Serialize;
use std::collections::HashMap;

/// Unified IPC Channel convention.
///
/// Every streaming command (Explorer directory scans, Search results, Git
/// progress) sends payloads of this single shape so the frontend can consume
/// all of them through one generic `StreamedList<T>` abstraction instead of a
/// bespoke event per module.
///
/// Channel is preferred over Events when the data is large or must arrive in
/// order (batching per-chunk beats hundreds of individual events, and events
/// may be processed out of order by async listeners).
#[derive(Serialize, Clone, Debug)]
pub struct StreamedBatch<T> {
    pub items: Vec<T>,
    pub meta: HashMap<String, usize>,
    pub done: bool,
}

impl<T> StreamedBatch<T> {
    /// A non-terminal batch of items.
    pub fn batch(items: Vec<T>, meta: HashMap<String, usize>) -> Self {
        Self {
            items,
            meta,
            done: false,
        }
    }

    /// The final batch — the stream is complete after this message.
    pub fn finish(items: Vec<T>, meta: HashMap<String, usize>) -> Self {
        Self {
            items,
            meta,
            done: true,
        }
    }
}
