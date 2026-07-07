## Relics 遗物系统。旧版 data/relics.ts。
## 10 种遗物，四档稀有度。玩家开宝箱 / boss 掉落时获得，堆叠层数增强效果。
##
## 简化实现：
##   - 数据表完全实现（10 relic + 稀有度权重）
##   - 效果应用（keen_lens = 暴击率 / blood_fang = lifesteal / iron_heart = maxHP 等）
##     通过 Player.apply_relic 直接改属性
##   - 未实现：magazine_expander / hourglass 需要 gameplay 事件挂钩
class_name Relics
extends RefCounted

const RELICS := {
	"keen_lens":         {"code": "R01", "rarity": "common", "emoji": "🔍"},
	"small_shield_charm":{"code": "R02", "rarity": "common", "emoji": "🔰"},
	"pact_coin":         {"code": "R04", "rarity": "common", "emoji": "🪙"},
	"blood_fang":        {"code": "R03", "rarity": "uncommon", "emoji": "🦷"},
	"elite_writ":        {"code": "R06", "rarity": "uncommon", "emoji": "📜"},
	"regen_core":        {"code": "R07", "rarity": "uncommon", "emoji": "💚"},
	"arsenal_badge":     {"code": "R05", "rarity": "rare", "emoji": "🎖️"},
	"magazine_expander": {"code": "R08", "rarity": "rare", "emoji": "🧰"},
	"hourglass":         {"code": "R09", "rarity": "legendary", "emoji": "⏳"},
	"iron_heart":        {"code": "R10", "rarity": "legendary", "emoji": "🫀"},
}

const ALL_RELIC_IDS := [
	"keen_lens", "small_shield_charm", "pact_coin",
	"blood_fang", "elite_writ", "regen_core",
	"arsenal_badge", "magazine_expander",
	"hourglass", "iron_heart",
]

# 每档稀有度权重（按玩家等级分档）
const RARITY_WEIGHTS := [
	{"max_level": 10, "common": 68, "uncommon": 26, "rare": 6, "legendary": 0},
	{"max_level": 25, "common": 50, "uncommon": 34, "rare": 14, "legendary": 2},
	{"max_level": 50, "common": 32, "uncommon": 38, "rare": 24, "legendary": 6},
	{"max_level": 75, "common": 20, "uncommon": 32, "rare": 35, "legendary": 13},
	{"max_level": 999, "common": 12, "uncommon": 28, "rare": 38, "legendary": 22},
]


static func roll_rarity(player_level: int, luck_bonus: float, rng: RandomNumberGenerator) -> String:
	var row: Dictionary = RARITY_WEIGHTS[-1] as Dictionary
	for r in RARITY_WEIGHTS:
		var rd: Dictionary = r as Dictionary
		if player_level <= int(rd["max_level"]):
			row = rd
			break
	var rare_shift: float = maxf(0.0, luck_bonus) * 100.0
	var w_common: float = maxf(0.0, float(row["common"]) - rare_shift * 0.55)
	var w_uncommon: float = maxf(0.0, float(row["uncommon"]) - rare_shift * 0.25)
	var w_rare: float = float(row["rare"]) + rare_shift * 0.55
	var w_legendary: float = float(row["legendary"]) + rare_shift * 0.25
	var total: float = w_common + w_uncommon + w_rare + w_legendary
	var roll: float = rng.randf() * total
	roll -= w_common
	if roll <= 0: return "common"
	roll -= w_uncommon
	if roll <= 0: return "uncommon"
	roll -= w_rare
	if roll <= 0: return "rare"
	return "legendary"


## 抽 1 个 relic id。stacks: {relic_id → 层数}，未拥有优先。
static func roll_relic(player_level: int, luck: float, rng: RandomNumberGenerator, stacks: Dictionary) -> String:
	var rarity: String = roll_rarity(player_level, luck, rng)
	var pool: Array = []
	for id in ALL_RELIC_IDS:
		var def: Dictionary = RELICS[id] as Dictionary
		if def["rarity"] == rarity:
			pool.append(id)
	if pool.is_empty():
		for id in ALL_RELIC_IDS:
			var def2: Dictionary = RELICS[id] as Dictionary
			if def2["rarity"] == "common":
				pool.append(id)
	if pool.is_empty():
		return "keen_lens"
	# 未拥有的优先
	var unowned: Array = []
	for id in pool:
		if int(stacks.get(id, 0)) == 0:
			unowned.append(id)
	if not unowned.is_empty():
		return unowned[rng.randi_range(0, unowned.size() - 1)]
	# 全部拥有 → 按 1/(stacks+1)^2 加权
	var weights: Array = []
	var total: float = 0.0
	for id in pool:
		var s: int = int(stacks.get(id, 0))
		var w: float = 1.0 / ((s + 1) * (s + 1))
		weights.append({"id": id, "w": w})
		total += w
	var roll: float = rng.randf() * total
	for item in weights:
		roll -= float((item as Dictionary)["w"])
		if roll <= 0:
			return (item as Dictionary)["id"]
	return pool[-1]
