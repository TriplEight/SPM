// Guards scripts/e2e.mjs's one fixture write (a fake COMMUNITY_REVIEWED row,
// used only to exercise the paid-tier 402 gate) against ever landing in a
// real database. e2e.mjs runs manually, on any machine, against whatever
// SQLITE_PATH the caller's shell already has set — the same variable the
// proxy process itself reads (proxy/src/config.ts). The Docker Compose
// deploy sets SQLITE_PATH=/data/audit.db in the container; a NETWORK check
// alone would not catch a manual run against that database, since the first
// deploy is TestNet, not MainNet. This is the one check that must run
// before e2e.mjs's status-store write, whatever else is true.
import os from 'node:os'
import path from 'node:path'

/**
 * Throws unless `sqlitePath` both exists and resolves to a location inside
 * `tmpDir` — the only kind of database e2e.mjs's fixture write may ever
 * touch. Pure: takes the candidate path and the throwaway-directory root
 * as plain arguments, so it is fully testable with no process env, no
 * filesystem access and no real database.
 *
 * @param {string|undefined} sqlitePath - typically process.env.SQLITE_PATH.
 * @param {string} [tmpDir] - defaults to os.tmpdir().
 */
export function assertSqliteWriteAllowed(sqlitePath, tmpDir = os.tmpdir()) {
  if (!sqlitePath || sqlitePath.trim().length === 0) {
    throw new Error(
      'refusing to seed a review row: SQLITE_PATH is not set. e2e.mjs must never write to a ' +
        'real database (for example "/data/audit.db", the Docker Compose path) — set ' +
        'SQLITE_PATH to a throwaway file inside os.tmpdir() before running it (scripts/verify.sh ' +
        'already does this).',
    )
  }

  const resolvedTmpDir = path.resolve(tmpDir)
  const resolvedPath = path.resolve(sqlitePath)
  const relative = path.relative(resolvedTmpDir, resolvedPath)
  const isInsideTmpDir =
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)

  if (!isInsideTmpDir) {
    throw new Error(
      `refusing to seed a review row: SQLITE_PATH (${resolvedPath}) is not inside a throwaway ` +
        `directory (${resolvedTmpDir}). e2e.mjs must never write to a real database (for ` +
        'example "/data/audit.db", the Docker Compose path).',
    )
  }
}
