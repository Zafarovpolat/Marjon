# Local object storage (Windows)

## Normal startup

From the repository root run:

```powershell
.\start-local-minio.ps1
```

The script uses `D:\MarjonData\minio` by default:

- `bin\minio.exe`: the installed executable, outside Windows Temp;
- `data\`: objects and MinIO's internal metadata;
- `logs\`: separate logs for every launch.

Credentials are read from the ignored `.marjon-dev\backend.env` file
(`MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY`); no default password is substituted.
The script never prints or writes credentials to Git. The admin console binds
to `127.0.0.1:9001`. The S3 API listens on port 9000 so the Docker backend can
reach `http://host.docker.internal:9000`. Keep this development API behind the
host firewall; it is not a production internet endpoint.

Startup checks `/minio/health/cluster` (write quorum), not merely process liveness.
It refuses to use Windows Temp, overwrite a nonempty unformatted data directory,
or stop another process occupying the port. Re-running it against the same healthy
instance does not start a duplicate process. `-InitializeNew` is only for explicitly
initialising a **new empty** data directory; it cannot reset existing data.

No Windows service, scheduled task or login autostart is installed by this script.
After reboot, run it again before using local photo uploads. Production uses the
Docker service and persistent volume from `docker-compose.yml`, not this script.

## Backup and recovery rules

Back up the complete data directory, including `.minio.sys`, plus the database
and securely stored configuration/credentials. A raw filesystem copy must be made
while the MinIO process is stopped or through a verified consistent snapshot.
Keep a second backup outside the host; a sibling folder on the same disk is only
a local rollback copy, not disaster recovery. Regularly test restoration into a
separate instance. Do not delete MinIO metadata or run `docker compose down -v`
as a repair step.

For normal migration between healthy instances use supported S3 export/copy
tools. Do not copy internal object directories into an arbitrary distributed
cluster or invent replacement drive IDs. The one-drive recovery below was
performed and verified on a separate copy; it is not a general cluster repair recipe.

## Recovery record: 2026-10-23

The old native process used
`C:\Users\zahongir\AppData\Local\Temp\opencode\minio-data`.
Its format file was missing; logs reported an offline/unformatted drive and
`SlowDownWrite`. The deletion's cause was not established.

The old process was stopped. All 43 files were copied and SHA-256 verified at:

```text
D:\MarjonData\backups\minio-20261023-before-recovery
```

The original directory was not deleted or edited. A fresh one-drive instance was
initialised with the same backend credentials on temporary port 19000. All 35
bucket files were copied from the backup and hash-verified before starting the
recovery instance. Its new internal metadata was kept separate from the damaged
original metadata. A second complete, stopped-instance backup (51 files) was
hash-verified at:

```text
D:\MarjonData\backups\minio-20261023-recovered
```

The recovered instance now runs from `D:\MarjonData\minio\data` on the original
port 9000. Backend configuration, database records and existing photo URLs were
not changed. The temporary port 19000 was stopped.

Verification through the actual backend storage settings:

- write readiness: HTTP 200;
- all 15 current local product-photo references: HTTP 200 and valid image data;
- the existing staff avatar: authenticated read succeeds, anonymous read is 403;
- a new uniquely named test PNG: upload, signed/anonymous read and byte comparison
  succeed; only that verified test object was deleted afterward;
- public bucket reads are limited to `products/`, `categories/` and `logos/`.

Six older, unreferenced image objects have pre-existing defects: five are missing
their required payload parts; one PNG has an invalid IDAT checksum. Their internal
files were copied byte-for-byte from the original and retained in both backups;
no replacement image was fabricated. None is referenced by a current local product.
The current product-photo links have no missing or invalid object.

The remote production server was not accessed or changed. Changes to the Compose
health check and deployment instructions still need the normal server rollout.
