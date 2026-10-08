---
description: Choose where the daemon keeps Go and Rust decryption credentials, or keep them in your own database.
---

# Store credentials

Decryption credentials are the permits and transport key pairs that let a user decrypt without signing again. Choose where they live:

| Backend                              | Survives a restart                                                   | Use it for                                                               |
| ------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Daemon memory (default)              | No: it ends with the SDK context or the daemon, and users sign again | Tests and short-lived scripts                                            |
| Daemon SQLite on a persistent volume | Yes                                                                  | Most deployments with one daemon per application instance                |
| Application storage                  | Yes, as long as your database keeps it                               | Replicas that share credentials, or keeping them in an existing database |

Treat the credential store and its backups as sensitive, whichever backend you choose; see the [daemon trust model](../concepts/trust-boundary.md).

## Use daemon SQLite

Select a named SQLite store when you create the SDK context:

{% tabs %}
{% tab title="Go" %}

```go
config.Storage = zama.DaemonPersistentStorage("credentials")
```

{% endtab %}
{% tab title="Rust" %}

```rust
let sdk = client
    .sdk(config)
    .storage(Storage::Persistent("credentials".into()))
    .build()
    .await?;
```

{% endtab %}
{% endtabs %}

Then give the daemon a persistent volume and set `ZAMA_SDK_DAEMON_STORAGE_DIR` to its mount path. The [deployment Compose file](../operations/run-in-production.md#run-with-docker-compose) already mounts one. Give each daemon its own volume, and back it up as described in [Deploy in production](../operations/run-in-production.md).

## Implement an application storage backend

Use your own database when several application replicas must share credentials. Your application stores opaque bytes under string keys and never decodes them.

These examples store credentials in a PostgreSQL table:

```sql
CREATE TABLE zama_credentials (key text PRIMARY KEY, value bytea NOT NULL);
```

{% tabs %}
{% tab title="Go" %}

Implement `zama.Storage`. `Get` reports a missing key with `false` and a nil error.

```go
type PostgresStorage struct{ db *sql.DB }

func (s PostgresStorage) Get(ctx context.Context, key string) ([]byte, bool, error) {
	var value []byte
	err := s.db.QueryRowContext(ctx, "SELECT value FROM zama_credentials WHERE key = $1", key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return value, true, nil
}

func (s PostgresStorage) Set(ctx context.Context, key string, value []byte) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO zama_credentials (key, value) VALUES ($1, $2)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, key, value)
	return err
}

func (s PostgresStorage) Delete(ctx context.Context, key string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM zama_credentials WHERE key = $1", key)
	return err
}
```

{% endtab %}
{% tab title="Rust" %}

Implement `NativeStorage`. `get` reports a missing key with `Ok(None)`. This example uses `sqlx` with the `postgres` feature.

```rust
use zama_sdk::{NativeStorage, async_trait};

pub struct PostgresStorage {
    pool: sqlx::PgPool,
}

#[async_trait]
impl NativeStorage for PostgresStorage {
    async fn get(&self, key: &str) -> anyhow::Result<Option<Vec<u8>>> {
        Ok(
            sqlx::query_scalar("SELECT value FROM zama_credentials WHERE key = $1")
                .bind(key)
                .fetch_optional(&self.pool)
                .await?,
        )
    }

    async fn set(&self, key: &str, value: Vec<u8>) -> anyhow::Result<()> {
        sqlx::query(
            "INSERT INTO zama_credentials (key, value) VALUES ($1, $2) \
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        )
        .bind(key)
        .bind(value)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn delete(&self, key: &str) -> anyhow::Result<()> {
        sqlx::query("DELETE FROM zama_credentials WHERE key = $1")
            .bind(key)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
```

{% endtab %}
{% endtabs %}

The SDK can call these methods concurrently. They must be safe for concurrent use and stop when their context or future is cancelled.

## Bind the backend

Name the binding after the database namespace it accesses. Reuse the same binding for every SDK context that should share credentials.

{% tabs %}
{% tab title="Go" %}

```go
config.Storage = zama.NamedApplicationStorage("credentials", PostgresStorage{db: db})
sdk, err := client.CreateContext(ctx, config, signer)
```

Set `config.PermitStorage` to store permits in a separate backend.

{% endtab %}
{% tab title="Rust" %}

```rust
let credentials = ApplicationStorage::shared("credentials", Arc::new(PostgresStorage { pool }));
let sdk = client
    .sdk(config)
    .storage(credentials.clone())
    .build()
    .await?;
```

Call `.permit_storage(...)` on the builder to store permits in a separate backend.

{% endtab %}
{% endtabs %}

To protect the stored transport keys, also set a derivation secret; see [Configuration](../../guides/configuration.md#10-optional-wrap-the-transport-key-pair-at-rest-headless-environments). Keep the same binding name and secret when you recreate a context or restart the daemon, or users sign again.

## Share storage across replicas

Several application-and-daemon pairs can use the same database. Each daemon coordinates credential operations only among its own SDK contexts. Two replicas working on the same user at the same time can race, which causes an extra signature request or overwrites a credential update.

A shared binding name does not provide distributed locking. If extra signature requests are unacceptable, route each user to one replica.
