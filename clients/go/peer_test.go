package zama

import (
	"os"
	"strings"
	"testing"
)

func TestDialDaemonChecksThePeerUID(t *testing.T) {
	socket, _ := testSocket(t)
	uid := uint32(os.Geteuid())

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
