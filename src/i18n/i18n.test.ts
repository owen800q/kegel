import { describe, expect, it } from 'vitest'
import en from './en.json'
import zhHK from './zh-HK.json'

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]))
}

describe('i18n', () => {
  it('zh-HK and en define the same keys', () => {
    expect(keys(en).sort()).toEqual(keys(zhHK).sort())
  })

  it('has a name for every built-in program', async () => {
    const { programs } = await import('@/data/programs')
    for (const p of programs) {
      expect(zhHK.programs).toHaveProperty(p.id)
      expect(en.programs).toHaveProperty(p.id)
    }
  })

  it('discreet calendar title never mentions the training', () => {
    for (const m of [en, zhHK]) expect(m.settings.icsTitleDiscreet).not.toMatch(/kegel|pelvic|盆底/i)
  })
})
