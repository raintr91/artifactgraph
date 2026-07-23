import path from 'path'
import { installProjectAssets, uninstallProjectAssets } from './dist/install/project.js'

const repo = path.resolve('test-repo')
console.log('Installing...')
const res = installProjectAssets({ repoRoot: repo, stack: 'generic', types: ['common', 'docs'], agents: ['cursor', 'claude', 'gemini'] })
console.log('Created:', res.created)

console.log('Uninstalling preview...')
const preview = uninstallProjectAssets({ repoRoot: repo, yes: false })
console.log('Would delete:', preview.wouldDelete)
console.log('Preserved modified:', preview.preservedModified)
console.log('Preserved unsafe:', preview.preservedUnsafe)

console.log('Uninstalling actual...')
const res2 = uninstallProjectAssets({ repoRoot: repo, yes: true })
console.log('Deleted:', res2.deleted)
