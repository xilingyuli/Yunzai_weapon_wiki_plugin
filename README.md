# Yunzai Weapon Wiki Plugin

Yunzai QQ Bot 插件，原神武器图鉴卡与角色专武查询。数据与图片读取本机已安装的 miao-plugin，不修改其任何文件。

## 功能

- `#武器名` / `#武器名图鉴` / `武器名图鉴`：武器图鉴卡（立绘、图标、90 级基础攻击力与副属性、精炼 1~5 阶被动、满突破材料与摩拉）
- `#角色名专武`：查询该角色的专武并出图
- 武器名支持 miao 的别名（如 `#雾切`、`狼末`）
- 匹配不到武器/专武时静默返回，消息继续交给其它插件处理

触发条件：消息带 `#` 前缀，或含「图鉴」二字。

## 依赖

- Yunzai（TRSS-Yunzai / Miao-Yunzai 均可）
- [miao-plugin](https://github.com/yoimiya-kokomi/miao-plugin)：提供武器数据、材料数据、武器立绘与材料图标（插件只读，不修改）

## 安装

将本插件目录放入 Yunzai 的 `plugins` 目录即可（目录名建议与仓库名一致）。

## 目录

```
index.js                         指令解析、专武解析
lib/weapon-data.js               miao 数据读取 + 武器突破消耗表
resources/wiki/weapon-wiki.html  卡片模板
resources/wiki/weapon-wiki.css   卡片样式
```

## 数据说明

- 武器属性、精炼被动、立绘、材料图标：来自 miao-plugin
- 满突破材料数量：按武器星级固定的游戏内固定表（见 `lib/weapon-data.js` 的 `COST_TABLE`），不联网
- 专武对应关系：优先取 miao 武器别名里的「XX专武」，没有则用 miao 卡池数据的角色池 ↔ 武器池顺序对应兜底
