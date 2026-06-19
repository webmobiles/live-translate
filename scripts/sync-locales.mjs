import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
const sourceDir = join(root, 'shared', 'locales')
const phoneDir = join(root, 'phone', 'assets', 'locales')
const checkOnly = process.argv.includes('--check')

mkdirSync(phoneDir, { recursive: true })

const files = readdirSync(sourceDir)
  .filter(file => extname(file) === '.json')
  .sort()

const mismatches = []

for (const file of files) {
  const source = join(sourceDir, file)
  if (!statSync(source).isFile()) continue
  const target = join(phoneDir, basename(file))

  if (checkOnly) {
    if (!existsSync(target) || readFileSync(source, 'utf8') !== readFileSync(target, 'utf8')) {
      mismatches.push(file)
    }
  } else {
    copyFileSync(source, target)
  }
}

if (checkOnly) {
  if (mismatches.length > 0) {
    console.error(`Locale copies are out of sync: ${mismatches.join(', ')}`)
    process.exit(1)
  }
  console.log(`Locale copies are in sync for ${files.length} files.`)
} else {
  console.log(`Synced ${files.length} locale files from shared/locales to phone/assets/locales.`)
}
