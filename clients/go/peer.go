package zama

import (
	"context"
	"fmt"
	"net"
)

// The daemon runs as the application's UID, so a peer with another UID is not the daemon.
func dialDaemon(socket string, uid uint32) func(context.Context, string) (net.Conn, error) {
	return func(ctx context.Context, _ string) (net.Conn, error) {
		// gRPC passes the target as a "unix://" URL, so dial the socket path itself.
		conn, err := (&net.Dialer{}).DialContext(ctx, "unix", socket)
		if err != nil {
			return nil, err
		}
		peer, err := peerUID(conn.(*net.UnixConn))
		if err != nil {
			conn.Close()
			return nil, err
		}
		if peer != uid {
			conn.Close()
			return nil, fmt.Errorf("daemon socket peer runs as UID %d, expected UID %d", peer, uid)
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
