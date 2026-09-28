//! Whole-Sdk tests against an in-process mock daemon.
mod support;

use support::*;

mod config;
mod context;
mod decryption;
mod delegation;
mod encryption;
mod event;
mod lifecycle;
mod offline;
mod signer_channel;
mod storage;
