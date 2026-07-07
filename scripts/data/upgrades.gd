## 升级 3 选 1 选项池 & 稀有度滚点。旧版 data/upgrades.ts。
class_name Upgrades
extends RefCounted

const RARITY_WEIGHTS := {
	"common": 55, "uncommon": 28, "rare": 13, "legendary": 4,
}

const MAX_TOME_TYPES := 6


static func roll_rarity(luck_level: int, rng: RandomNumberGenerator) -> String:
	var luck_bonus := luck_level * 5
	var adj := {
		"common": max(20, RARITY_WEIGHTS["common"] - luck_bonus * 2),
		"uncommon": RARITY_WEIGHTS["uncommon"],
		"rare": RARITY_WEIGHTS["rare"] + luck_bonus,
		"legendary": RARITY_WEIGHTS["legendary"] + luck_bonus,
	}
	var total: float = adj["common"] + adj["uncommon"] + adj["rare"] + adj["legendary"]
	var roll := rng.randf() * total
	for k in ["common", "uncommon", "rare", "legendary"]:
		roll -= adj[k]
		if roll <= 0.0:
			return k
	return "common"


## 根据玩家状态给出 3 个升级选项（保底 1 个武器相关）。
## player_state 结构：
##   weapons: Array[Dictionary]，每项 { "type": String, "level": int }
##   tomes:   Array[Dictionary]，每项 { "type": String, "level": int }
##   max_weapon_slots: int
##   luck_level: int
static func generate_options(player_state: Dictionary, count: int, rng: RandomNumberGenerator) -> Array:
	var pool := _build_available(player_state)
	if pool.is_empty():
		return []

	var result: Array = []
	# 保底 1 个武器相关
	var weapon_pool: Array = []
	for opt in pool:
		if opt["kind"] == "new_weapon" or opt["kind"] == "weapon_upgrade":
			weapon_pool.append(opt)
	if not weapon_pool.is_empty():
		var pick := _random_pick(weapon_pool, player_state.get("luck_level", 0), rng)
		result.append(pick)
		pool.erase(pick)

	# 剩下从整池抽
	while result.size() < count and not pool.is_empty():
		var pick2 := _random_pick(pool, player_state.get("luck_level", 0), rng)
		result.append(pick2)
		pool.erase(pick2)

	return result


static func _build_available(state: Dictionary) -> Array:
	var out: Array = []
	var owned_weapon_types: Dictionary = {}
	var owned_tome_types: Dictionary = {}
	for w in state.get("weapons", []):
		owned_weapon_types[w["type"]] = w
	for t in state.get("tomes", []):
		owned_tome_types[t["type"]] = t

	# 武器升级：已拥有且未满级
	for wtype in owned_weapon_types:
		var w: Dictionary = owned_weapon_types[wtype]
		if (w["level"] as int) < GameConfig.WEAPON_MAX_LEVEL:
			out.append({"kind": "weapon_upgrade", "id": wtype, "rarity": "common"})

	# 新武器：还有槽
	var slots_used: int = state.get("weapons", []).size()
	var max_slots: int = state.get("max_weapon_slots", 2)
	if slots_used < max_slots:
		for wtype in Weapons.ALL_WEAPON_TYPES:
			if not owned_weapon_types.has(wtype):
				out.append({"kind": "new_weapon", "id": wtype, "rarity": "common"})

	# 典籍
	var tome_kinds_used: int = state.get("tomes", []).size()
	for ttype in Tomes.ALL_TOME_TYPES:
		var def: Dictionary = Tomes.get_def(ttype)
		if def.is_empty():
			continue
		var current_level: int = 0
		if owned_tome_types.has(ttype):
			current_level = (owned_tome_types[ttype] as Dictionary)["level"]
		if current_level >= (def["max_level"] as int):
			continue
		# 未拥有该 tome 且已到 kinds 上限 → 跳过
		if not owned_tome_types.has(ttype) and tome_kinds_used >= MAX_TOME_TYPES:
			continue
		out.append({"kind": "tome", "id": ttype, "rarity": "common"})

	return out


static func _random_pick(arr: Array, luck: int, rng: RandomNumberGenerator) -> Dictionary:
	var opt: Dictionary = arr[rng.randi_range(0, arr.size() - 1)]
	# 稀有度只是显示用，不影响数值
	opt = opt.duplicate()
	opt["rarity"] = roll_rarity(luck, rng)
	return opt
