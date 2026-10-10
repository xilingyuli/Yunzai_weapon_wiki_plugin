/**
 * 数据层：从 miao-plugin 读取武器 / 角色 / 材料数据，组装图鉴卡片数据。
 * 只读 miao-plugin，不修改它的任何文件。
 */
import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import lodash from 'lodash'

const MIAO_ROOT = path.join(process.cwd(), 'plugins/miao-plugin')

/**
 * 武器满突破消耗（按武器星级固定，与武器种类/系列无关）：
 *   normal  普通怪掉落（1★~3★）
 *   monster 精英怪掉落（2★~4★）
 *   weapon  武器突破素材（2★~5★）
 * 1★/2★ 武器上限 70 级、只突破 4 次，所以档位更少。
 * 数值为游戏内固定表（2026-10 用多把同星级武器核对一致：5★天空之刃/狼的末路/护摩之杖、
 * 4★匣里龙吟/西风剑/祭礼剑、3★冷刃/暗铁剑、1★训练大剑/无锋剑）。
 */
const COST_TABLE = {
  1: { coin: 20000, normal: [3, 5], monster: [5, 6], weapon: [1, 3, 1] },
  2: { coin: 35000, normal: [5, 7], monster: [6, 8], weapon: [1, 4, 1] },
  3: { coin: 105000, normal: [6, 10, 12], monster: [10, 12, 18], weapon: [2, 6, 6, 3] },
  4: { coin: 150000, normal: [10, 15, 18], monster: [15, 18, 27], weapon: [3, 9, 9, 4] },
  5: { coin: 225000, normal: [15, 23, 27], monster: [23, 27, 41], weapon: [5, 14, 14, 6] }
}

/** 武器类型中文名 */
const weaponTypeName = {
  sword: '单手剑',
  claymore: '双手剑',
  polearm: '长柄武器',
  bow: '弓',
  catalyst: '法器'
}

/** 副词条 key -> 中文名 */
const attrName = {
  atkPct: '攻击力',
  hpPct: '生命值',
  defPct: '防御力',
  cpct: '暴击率',
  cdmg: '暴击伤害',
  mastery: '元素精通',
  recharge: '元素充能效率',
  phy: '物理伤害加成',
  dmg: '伤害加成',
  elePct: '元素伤害加成'
}

/** 按百分比展示的词条 */
const pctKeys = ['atkPct', 'hpPct', 'defPct', 'cpct', 'cdmg', 'recharge', 'phy', 'dmg', 'elePct']

/** 突破材料分类名 */
const materialTypeName = {
  weapon: '突破素材',
  monster: '怪物掉落',
  normal: '通用素材'
}

let miaoCache = null

/** 懒加载 miao-plugin 的模型与数据（前置依赖） */
export async function loadMiao () {
  if (miaoCache) return miaoCache
  const modelsFile = path.join(MIAO_ROOT, 'models', 'index.js')
  if (!fs.existsSync(modelsFile)) {
    throw new Error(`未找到 miao-plugin（${MIAO_ROOT}），weapon-wiki 依赖它提供武器数据与图片`)
  }
  const [models, pathMod, poolMod, miaoComponents] = await Promise.all([
    import(pathToFileURL(modelsFile).href),
    import(pathToFileURL(path.join(MIAO_ROOT, 'tools', 'path.js')).href),
    import(pathToFileURL(path.join(MIAO_ROOT, 'resources', 'meta-gs', 'info', 'pool.js')).href),
    import(pathToFileURL(path.join(MIAO_ROOT, 'components', 'index.js')).href)
  ])

  /** 兜底：卡池数据里角色池与武器池按顺序一一对应 */
  const poolWeapon = {}
  for (const pool of poolMod.poolDetail || []) {
    if (!pool?.char5?.length || pool.char5.length !== pool.weapon5?.length) continue
    pool.char5.forEach((char, idx) => {
      if (char && pool.weapon5[idx]) poolWeapon[char] = pool.weapon5[idx]
    })
  }

  miaoCache = {
    Character: models.Character,
    Weapon: models.Weapon,
    Material: models.Material,
    Meta: miaoComponents.Meta,
    miaoPath: pathMod.miaoPath,
    materialFamily: buildMaterialFamily(),
    poolWeapon
  }
  return miaoCache
}

/** 建立材料家族索引：哪个名字属于哪个系列、系列内各星级材料有哪些 */
function buildMaterialFamily () {
  const file = path.join(MIAO_ROOT, 'resources', 'meta-gs', 'material', 'data.json')
  const byName = {}
  const families = {}
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (const item of Object.values(data)) {
      const members = []
      for (const [name, sub] of Object.entries(item.items || {})) {
        byName[name] = { top: item.name, star: sub.star }
        members.push({ name, star: sub.star })
      }
      if (!members.length) members.push({ name: item.name, star: item.star })
      members.sort((a, b) => a.star - b.star)
      families[item.name] = members
      byName[item.name] = { top: item.name, star: item.star }
    }
  } catch (e) {
    // 读不到就退化为「只显示材料名、不显示数量」
  }
  return { byName, families }
}

/** 满突破材料：每个系列一行（材料名 + 各档数量）；数据不全时返回 null，退回只显示材料名 */
function buildCost (weapon, detail) {
  const table = COST_TABLE[weapon.star]
  if (!table) return null
  const { byName, families } = miaoCache.materialFamily || {}
  if (!byName) return null

  const rows = []
  for (const kind of ['weapon', 'monster', 'normal']) {
    const name = detail.materials?.[kind]
    const counts = table[kind]
    if (!name || !counts) return null
    const members = families[byName[name]?.top] || [{ name, star: 0 }]
    if (members.length < counts.length) return null
    const used = members.slice(0, counts.length)
    const top = used[used.length - 1]
    rows.push({
      name: top.name,
      star: top.star,
      icon: `meta-gs/material/${kind}/${top.name}.webp`,
      counts: counts.join('/')
    })
  }
  return { families: rows, coin: table.coin }
}

/** 角色专武：优先用武器别名（XX专武），没有则用卡池对应关系兜底 */
export function getSignatureWeapon (char, game = 'gs') {
  const { Weapon, poolWeapon } = miaoCache
  let weapon = Weapon.get(`${char.name}专武`, game)
  if (!weapon && char.abbr && char.abbr !== char.name) {
    weapon = Weapon.get(`${char.abbr}专武`, game)
  }
  if (!weapon && poolWeapon[char.name]) {
    weapon = Weapon.get(poolWeapon[char.name], game)
  }
  return weapon || false
}

/** 取第一个存在的图片（部分武器没有抽卡立绘） */
function pickImg (imgs, keys) {
  for (const key of keys) {
    const img = imgs?.[key]
    if (img && fs.existsSync(path.join(miaoCache.miaoPath, 'resources', img))) return img
  }
  return ''
}

/** 被动文案：把 $[n] 换成 1~5 精炼的数值区间，和游戏内图鉴一致 */
function buildAffixText (weapon, detail) {
  const datas = detail?.affixData?.datas
  let text = miaoCache.Meta?.getMeta('gs', 'weapon')?.descFix?.[weapon.name] || detail?.affixData?.text
  if (!text || !datas) {
    return weapon.getAffixDesc(1)?.desc || ''
  }
  return text.replace(/\$\[(\d)\]/g, (raw, idx) => {
    const values = datas[idx]
    return Array.isArray(values) && values.length ? values.join('/') : raw
  })
}

/** 组装图鉴渲染数据（全部本地数据，无网络请求） */
export function buildData (weapon, char = null) {
  const detail = weapon.getDetail() || {}
  const attr = weapon.calcAttr(weapon.maxLv, weapon.maxPromote) || {}

  const attrs = [{
    title: `${weapon.maxLv}级基础攻击力`,
    value: `${Math.round(attr.atkBase || 0)}`
  }]
  if (attr.attr?.key) {
    const key = attr.attr.key
    const value = lodash.round(attr.attr.value, 1)
    attrs.push({
      title: attrName[key] || key,
      value: pctKeys.includes(key) ? `${value}%` : `${value}`
    })
  }

  const materials = []
  for (const type of ['weapon', 'monster', 'normal']) {
    const name = detail.materials?.[type]
    const material = name ? miaoCache.Material.get(name, 'gs') : false
    if (!material) continue
    materials.push({
      name,
      type,
      label: materialTypeName[type] || '',
      icon: material.img,
      star: material.star
    })
  }

  const imgs = weapon.imgs || {}
  return {
    weapon: {
      name: weapon.name,
      star: weapon.star,
      typeName: weaponTypeName[weapon.type] || weapon.type,
      desc: detail.desc || '',
      affixTitle: detail.affixTitle || '',
      affixDesc: buildAffixText(weapon, detail),
      pic: pickImg(imgs, ['gacha', 'icon2', 'icon']),
      icon: pickImg(imgs, ['icon2', 'icon'])
    },
    attrs,
    materials,
    cost: buildCost(weapon, detail),
    charName: char?.name || '',
    bodyClass: 'weapon-wiki'
  }
}

export { weaponTypeName, attrName, pctKeys, materialTypeName, MIAO_ROOT }
