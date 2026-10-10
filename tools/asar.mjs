import fs from 'node:fs'

const archive = process.argv[2]
const mode = process.argv[3] || 'list'
const arg = process.argv[4] || ''

const fd = fs.openSync(archive, 'r')
const head = Buffer.alloc(16)
fs.readSync(fd, head, 0, 16, 0)
const headerSize = head.readUInt32LE(4)
const jsonSize = head.readUInt32LE(12)
const jsonBuf = Buffer.alloc(jsonSize)
fs.readSync(fd, jsonBuf, 0, jsonSize, 16)
const header = JSON.parse(jsonBuf.toString('utf8'))
const dataStart = 8 + headerSize

function walk(node, prefix, out) {
  for (const [name, entry] of Object.entries(node.files || {})) {
    const p = prefix ? prefix + '/' + name : name
    if (entry.files) walk(entry, p, out)
    else out.push({ path: p, size: entry.size, offset: entry.offset })
  }
  return out
}

const all = walk(header, '', [])

if (mode === 'list') {
  const re = arg ? new RegExp(arg, 'i') : null
  for (const e of all) if (!re || re.test(e.path)) console.log(`${e.size}\t${e.path}`)
} else if (mode === 'extract') {
  const e = all.find(x => x.path === arg)
  if (!e) { console.error('not found: ' + arg); process.exit(1) }
  const buf = Buffer.alloc(e.size)
  fs.readSync(fd, buf, 0, e.size, dataStart + Number(e.offset))
  process.stdout.write(buf)
} else if (mode === 'extractall') {
  const re = new RegExp(arg, 'i')
  const dest = process.argv[5]
  let n = 0
  for (const e of all) {
    if (!re.test(e.path)) continue
    const target = dest + '/' + e.path
    fs.mkdirSync(target.slice(0, target.lastIndexOf('/')), { recursive: true })
    const buf = Buffer.alloc(e.size)
    fs.readSync(fd, buf, 0, e.size, dataStart + Number(e.offset))
    fs.writeFileSync(target, buf)
    n++
  }
  console.error('extracted ' + n)
}
