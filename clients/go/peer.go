package zama

import (
	"context"
	"fmt"
	"net"
)

// dialDaemon connects to the daemon socket and keeps the connection only when
// the process listening on it runs as uid. The daemon and the application run
// as the same UID, so any other peer is not the daemon.
func dialDaemon(socket string, uid uint32) func(context.Context, string) (net.Conn, error) {
	return func(ctx context.Context, _ string) (net.Conn, error) {
		// gRPC passes the target as a "unix://" URL, so dial the socket path itself.
		conn, err := (&net.Dialer{}).DialContext(ctx, "unix", socket)
		if err != nil {
			return nil, err
		}
		peer, err := peerUID(conn.(*net.UnixConn))
		if err == nil && peer != uid {
			err = fmt.Errorf("daemon socket peer runs as UID %d, expected UID %d", peer, uid)
		}
		if err != nil {
			conn.Close()
			return nil, err
		}
		return conn, nil
	}
}

func peerUID(conn *net.UnixConn) (uint32, error) {
	raw, err := conn.SyscallConn()
	if err != nil {
		return 0, err
	}
	var uid uint32
	var uidErr error
	if err := raw.Control(func(fd uintptr) { uid, uidErr = fdPeerUID(int(fd)) }); err != nil {
		return 0, err
	}
	return uid, uidErr
}
