## Consumables 消耗品。旧版 data/consumables.ts。
## 10 种消耗品。敌人死亡按概率掉落，玩家碰到自动收进背包。使用后立即生效或激活 timed buff。
##
## 简化：instant 直接应用，timed 记 timer 每帧衰减，one_shot 触发一次。
class_name Consumables
extends RefCounted

# 数据表：id → { code / emoji / kind / duration }
const DEFS := {
	"wild_berry":       {"code": "F01", "emoji": "🫐", "kind": "instant"},              # +30 HP
	"hot_soup":         {"code": "F02", "emoji": "🍲", "kind": "timed", "duration": 15},# +25% dmg 15s
	"mint_candy":       {"code": "F03", "emoji": "🍬", "kind": "timed", "duration": 20},# +25% move 20s
	"hard_bread":       {"code": "F04", "emoji": "🥖", "kind": "one_shot"},              # 无敌 5s
	"energy_bar":       {"code": "F05", "emoji": "🍫", "kind": "timed", "duration": 25},# +40% attack_speed
	"magnet":           {"code": "F06", "emoji": "🧲", "kind": "timed", "duration": 25},# 拾取全屏
	"iron_meal":        {"code": "F07", "emoji": "🍱", "kind": "timed", "duration": 30},# +5 armor
	"rage_potion":      {"code": "F08", "emoji": "💢", "kind": "timed", "duration": 20},# +100% dmg -50% HP
	"prophecy_book":    {"code": "F09", "emoji": "📖", "kind": "one_shot"},              # 下次升级 4 选
	"craftsman_hammer": {"code": "F10", "emoji": "🔨", "kind": "one_shot"},              # 强化一把武器
}

# 普通怪池
const DROP_NORMAL := [
	"wild_berry", "hot_soup", "mint_candy", "hard_bread",
	"energy_bar", "magnet", "iron_meal", "rage_potion",
]

# 精英 / mini-boss 池（含稀有）
const DROP_WEIGHTED := [
	{"id": "wild_berry", "weight": 10},
	{"id": "hot_soup", "weight": 10},
	{"id": "mint_candy", "weight": 10},
	{"id": "hard_bread", "weight": 10},
	{"id": "energy_bar", "weight": 10},
	{"id": "magnet", "weight": 10},
	{"id": "iron_meal", "weight": 10},
	{"id": "rage_potion", "weight": 10},
	{"id": "prophecy_book", "weight": 1},
	{"id": "craftsman_hammer", "weight": 1},
]

const DROP_BASE_NORMAL := 0.02
const DROP_BASE_ELITE := 0.12
const DROP_BASE_MINI_BOSS := 0.45


static func roll_for_enemy(is_elite: bool, is_mini_boss: bool, drop_mult: float, rng: RandomNumberGenerator) -> String:
	var chance: float
	if is_mini_boss:
		chance = DROP_BASE_MINI_BOSS * drop_mult
	elif is_elite:
		chance = DROP_BASE_ELITE * drop_mult
	else:
		chance = DROP_BASE_NORMAL * drop_mult
	if rng.randf() >= chance:
		return ""
	if is_elite or is_mini_boss:
		return _pick_weighted(DROP_WEIGHTED, rng)
	return DROP_NORMAL[rng.randi_range(0, DROP_NORMAL.size() - 1)]


static func _pick_weighted(table: Array, rng: RandomNumberGenerator) -> String:
	var total: float = 0.0
	for e in table:
		total += float((e as Dictionary)["weight"])
	var roll: float = rng.randf() * total
	for e in table:
		var ed: Dictionary = e as Dictionary
		roll -= float(ed["weight"])
		if roll <= 0:
			return ed["id"]
	return (table[-1] as Dictionary)["id"]
