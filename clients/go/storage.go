package sidecar

import (
	"bytes"
	"context"
	"crypto/rand"
	"sync"
)

// Storage holds opaque SDK bytes; methods may run concurrently and must honor cancellation.
type Storage interface {
	Get(context.Context, string) ([]byte, bool, error)
	Set(context.Context, string, []byte) error
	Delete(context.Context, string) error
}

type MemoryStorage struct {
	mu     sync.RWMutex
	values map[string][]byte
}

func NewMemoryStorage() *MemoryStorage { return &MemoryStorage{values: make(map[string][]byte)} }
func (s *MemoryStorage) Get(ctx context.Context, key string) ([]byte, bool, error) {
	if err := ctx.Err(); err != nil {
		return nil, false, err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	value, found := s.values[key]
	return bytes.Clone(value), found, nil
}
func (s *MemoryStorage) Set(ctx context.Context, key string, value []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.values == nil {
		s.values = make(map[string][]byte)
	}
	s.values[key] = bytes.Clone(value)
	return nil
}
func (s *MemoryStorage) Delete(ctx context.Context, key string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.values, key)
	return nil
}

// Pointer identity also supports backends whose dynamic values cannot be compared.
type storageBackend struct{ Storage }

type StorageConfig struct {
	kind    string
	name    string
	backend *storageBackend
}

func SidecarMemoryStorage() StorageConfig { return StorageConfig{kind: "memory"} }
func PersistentStorage(name string) StorageConfig {
	return StorageConfig{kind: "persistent", name: name}
}

// ApplicationStorage returns a binding to reuse across contexts sharing the backend.
func ApplicationStorage(backend Storage) StorageConfig {
	return StorageConfig{kind: "application", name: rand.Text(), backend: &storageBackend{Storage: backend}}
}

// NamedApplicationStorage requires a stable name shared only within one storage namespace.
func NamedApplicationStorage(name string, backend Storage) StorageConfig {
	return StorageConfig{kind: "application", name: name, backend: &storageBackend{Storage: backend}}
}
