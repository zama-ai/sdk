package main

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadConfigErrors(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "missing.env")
	if _, err := loadConfig([]string{"socket", missing}); !errors.Is(err, fs.ErrNotExist) || strings.Count(err.Error(), missing) != 1 {
		t.Fatalf("missing file misreported: %v", err)
	}
	malformed := filepath.Join(t.TempDir(), "malformed.env")
	if err := os.WriteFile(malformed, []byte("TEST_WALLET_PRIVATE_KEY=\"0xsynthetic-secret\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := loadConfig([]string{"socket", malformed}); err == nil || !strings.Contains(err.Error(), "cannot parse") || strings.Contains(err.Error(), "synthetic-secret") {
		t.Fatalf("parse error leaked file contents: %v", err)
	}
}
