package zama

import (
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDialDaemonChecksThePeerUID(t *testing.T) {
	// Short paths stay within macOS Unix-domain socket limits.
	dir, err := os.MkdirTemp("/tmp", "sdk-go-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	socket := filepath.Join(dir, "s")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { listener.Close() })
	uid := uint32(os.Getuid())

	conn, err := dialDaemon(socket, uid)(testContext(t), "")
	if err != nil {
		t.Fatal(err)
	}
	conn.Close()

	_, err = dialDaemon(socket, uid+1)(testContext(t), "")
	if err == nil || !strings.Contains(err.Error(), "daemon socket peer runs as UID") {
		t.Fatalf("expected a peer UID error, got %v", err)
	}
}
