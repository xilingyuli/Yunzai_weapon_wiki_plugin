/**
 * weapon-wiki —— 原神武器图鉴 / 角色专武
 *
 * 触发：
 *   #<武器名>            例：#蝶变
 *   <武器名>图鉴          例：蝶变图鉴
 *   #<角色名>专武         例：#薇斯纳专武
 *   （即：带 # 前缀，或消息里含「图鉴」二字；匹配不上武器/专武时静默，把消息让给其它插件）
 *
 * 数据、图片全部读取本机已安装的 miao-plugin（前置依赖），本插件不修改 miao-plugin 任何文件。
 */
import lodash from 'lodash'
import plugin from '../../lib/plugins/plugin.js'
import { buildData, getSignatureWeapon, loadMiao } from './lib/weapon-data.js'

/** 带这些词的复合指令交给其它功能（面板、攻略、材料等）处理 */
const skipReg = /(面板|面版|详细|详情|圣遗物|遗器|天赋|技能|命座|命之座|星魂|资料|图片|照片|写真|图像|伤害|攻略|材料|素材|突破|培养|升级|换)/

/** #蝶变 / #蝶变图鉴 / 蝶变图鉴 / #薇斯纳专武 */
const nameReg = /^(?:#|喵喵)?(.+?)(图鉴|专武)?$/

export class WeaponWiki extends plugin {
  constructor () {
    super({
      name: '武器图鉴',
      dsc: '武器图鉴卡 / 角色专武查询（数据来自 miao-plugin）',
      event: 'message',
      priority: 100,
      rule: [
        // #蝶变 / #薇斯纳专武 / 其它 # 指令（解析不到武器会 return false 让给别的插件）
        { reg: '^#(.+)$', fnc: 'weaponWiki' },
        // 蝶变图鉴
        { reg: '^(.+?)图鉴$', fnc: 'weaponWiki' }
      ]
    })
  }

  async weaponWiki () {
    const e = this.e
    const msg = String(e.original_msg || e.msg || '').trim()
    if (!msg) return false
    // 触发条件：带 # 前缀，或消息里含「图鉴」
    if (!msg.startsWith('#') && !msg.includes('图鉴')) return false
    // 目前只做原神
    if (/星铁|开拓者|绝区零/.test(msg)) return false

    const ret = nameReg.exec(msg)
    const name = lodash.trim(ret?.[1] || '')
    if (!name || skipReg.test(name)) return false

    let char = null
    let weapon = null
    try {
      const miao = await loadMiao()
      const { Character, Weapon } = miao
      if (ret[2] === '专武') {
        char = Character.get(name, 'gs')
        if (!char || char.isCustom) return false
        weapon = getSignatureWeapon(char)
        if (!weapon) {
          await e.reply(`暂未收录「${char.name}」的专武数据，可发送 #${char.name}图鉴 查看角色资料`)
          return true
        }
      } else {
        weapon = Weapon.get(name, 'gs')
        // 解析不到武器：静默让给其它插件
        if (!weapon) return false
      }
    } catch (err) {
      if (typeof logger !== 'undefined') logger.error(`[武器图鉴] ${err.message}`)
      return false
    }

    const data = buildData(weapon, char)
    await e.runtime.render('weapon-wiki', 'wiki/weapon-wiki', data, {
      retType: 'default'
    })
    return true
  }
}
