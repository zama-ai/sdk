#[path = "test_support.rs"]
mod test_support;

use test_support::*;

#[path = "config_tests.rs"]
mod config_tests;

#[path = "context_tests.rs"]
mod context_tests;

#[path = "lifecycle_tests.rs"]
mod lifecycle_tests;

#[path = "storage_tests.rs"]
mod storage_tests;

#[path = "encryption_tests.rs"]
mod encryption_tests;

#[path = "decryption_tests.rs"]
mod decryption_tests;

#[path = "offline_tests.rs"]
mod offline_tests;

#[path = "delegation_tests.rs"]
mod delegation_tests;

#[path = "signer_channel_tests.rs"]
mod signer_channel_tests;
