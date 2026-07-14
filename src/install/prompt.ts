/**
 * Zero-dep TTY prompts — CodeGraph-style ↑↓ + Space + Enter.
 */

import { createInterface } from 'node:readline'

export interface CheckboxChoice<T extends string = string> {
  value: T
  name: string
  checked?: boolean
}

/**
 * Multi-select: ↑/↓ move · Space toggle · a all · Enter confirm · Ctrl+C abort.
 */
export async function checkboxPrompt<T extends string>(opts: {
  message: string
  choices: CheckboxChoice<T>[]
}): Promise<T[]> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return opts.choices.filter((c) => c.checked).map((c) => c.value)
  }

  const choices = opts.choices.map((c) => ({ ...c, checked: Boolean(c.checked) }))
  let cursor = 0
  const lines = choices.length + 2 // message + hint + rows

  const draw = (first = false) => {
    if (!first) {
      process.stdout.write(`\x1b[${lines}A`)
    }
    process.stdout.write(`\x1b[0G\x1b[J`)
    process.stdout.write(`${opts.message}\n`)
    process.stdout.write(`  (↑↓ move · Space toggle · a all · Enter confirm)\n`)
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i]!
      const pointer = i === cursor ? '❯' : ' '
      const box = c.checked ? '◉' : '◯'
      process.stdout.write(` ${pointer} ${box} ${c.name}\n`)
    }
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    const wasRaw = stdin.isRaw
    stdin.setRawMode?.(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    draw(true)

    const onData = (key: string) => {
      if (key === '\u0003') {
        cleanup()
        process.stdout.write('\n')
        reject(new Error('cancelled'))
        return
      }
      if (key === '\r' || key === '\n') {
        cleanup()
        process.stdout.write('\n')
        resolve(choices.filter((c) => c.checked).map((c) => c.value))
        return
      }
      if (key === ' ') {
        choices[cursor]!.checked = !choices[cursor]!.checked
        draw()
        return
      }
      if (key === 'a' || key === 'A') {
        const allOn = choices.every((c) => c.checked)
        for (const c of choices) c.checked = !allOn
        draw()
        return
      }
      // up
      if (key === '\u001b[A' || key === 'k') {
        cursor = (cursor - 1 + choices.length) % choices.length
        draw()
        return
      }
      // down
      if (key === '\u001b[B' || key === 'j') {
        cursor = (cursor + 1) % choices.length
        draw()
      }
    }

    const cleanup = () => {
      stdin.off('data', onData)
      stdin.setRawMode?.(wasRaw ?? false)
      stdin.pause()
    }

    stdin.on('data', onData)
  })
}

/**
 * Single-select: ↑/↓ · Enter.
 */
export async function selectPrompt<T extends string>(opts: {
  message: string
  choices: Array<{ value: T; name: string }>
  defaultIndex?: number
}): Promise<T> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return opts.choices[opts.defaultIndex ?? 0]!.value
  }

  let cursor = opts.defaultIndex ?? 0
  const lines = opts.choices.length + 2

  const draw = (first = false) => {
    if (!first) process.stdout.write(`\x1b[${lines}A`)
    process.stdout.write(`\x1b[0G\x1b[J`)
    process.stdout.write(`${opts.message}\n`)
    process.stdout.write(`  (↑↓ move · Enter confirm)\n`)
    for (let i = 0; i < opts.choices.length; i++) {
      const c = opts.choices[i]!
      const pointer = i === cursor ? '❯' : ' '
      const mark = i === cursor ? '●' : '○'
      process.stdout.write(` ${pointer} ${mark} ${c.name}\n`)
    }
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    const wasRaw = stdin.isRaw
    stdin.setRawMode?.(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    draw(true)

    const onData = (key: string) => {
      if (key === '\u0003') {
        cleanup()
        process.stdout.write('\n')
        reject(new Error('cancelled'))
        return
      }
      if (key === '\r' || key === '\n') {
        cleanup()
        process.stdout.write('\n')
        resolve(opts.choices[cursor]!.value)
        return
      }
      if (key === '\u001b[A' || key === 'k') {
        cursor = (cursor - 1 + opts.choices.length) % opts.choices.length
        draw()
        return
      }
      if (key === '\u001b[B' || key === 'j') {
        cursor = (cursor + 1) % opts.choices.length
        draw()
      }
    }

    const cleanup = () => {
      stdin.off('data', onData)
      stdin.setRawMode?.(wasRaw ?? false)
      stdin.pause()
    }

    stdin.on('data', onData)
  })
}

/** Fallback line prompt when needed. */
export async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close()
      resolve(ans.trim())
    })
  })
}
