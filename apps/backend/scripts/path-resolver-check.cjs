const assert = require('node:assert/strict')
const { lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } = require('node:fs')
const { basename, join } = require('node:path')
const { DATA_ROOT, resolveVirtualPath, validateVirtualPath } = require('../dist/FileManagement/Infrastructure/path-resolver.js')

async function checkPathResolver() {
  mkdirSync(DATA_ROOT, { recursive: true })
  const fixtureRoot = mkdtempSync(join(DATA_ROOT, '.foundation-check-'))
  const fixtureName = basename(fixtureRoot)
  const directoryPath = join(fixtureRoot, 'directory')
  mkdirSync(directoryPath)
  writeFileSync(join(directoryPath, 'file.txt'), 'fixture')
  symlinkSync(directoryPath, join(fixtureRoot, 'link'))

  try {
    assert.deepEqual(validateVirtualPath('/'), [])
    assert.deepEqual(validateVirtualPath(`/${fixtureName}/directory/file.txt`), [fixtureName, 'directory', 'file.txt'])
    assert.equal((await resolveVirtualPath(`/${fixtureName}/directory/file.txt`)).isDirectory, false)
    assert.equal((await resolveVirtualPath(`/${fixtureName}/directory`)).isDirectory, true)

    for (const invalidPath of [
      null,
      undefined,
      42,
      'missing-leading-slash',
      `/${fixtureName}/./directory`,
      `/${fixtureName}/../directory`,
      `/${fixtureName}//directory`,
      `/${fixtureName}/bad\0name`
    ]) {
      assert.throws(() => validateVirtualPath(invalidPath), { message: 'The requested path is invalid.' })
    }

    await assert.rejects(resolveVirtualPath(`/${fixtureName}/link/file.txt`))
    assert.equal(lstatSync(join(fixtureRoot, 'link')).isSymbolicLink(), true)
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true })
  }
}

checkPathResolver().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
