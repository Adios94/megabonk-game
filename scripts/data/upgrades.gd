## 升级 3 选 1 选项池 & 稀有度滚点。旧版 data/upgrades.ts。
class_name Upgrades
extends RefCounted

const RARITY_WEIGHTS := {
	"common": 55, "uncommon": 28, "rare": 13, "legendary": 4,
}

const MAX_TOME_TYPES := 6


static func roll_rarity(luck_level: int, rng: RandomNumberGenerator) -> String:
	var luck_bonus: int = luck_level * 5
	var adj: Dictionary = {
		"common": maxi(20, int(RARITY_WEIGHTS["common"]) - luck_bonus * 2),
		"uncommon": int(RARITY_WEIGHTS["uncommon"]),
		"rare": int(RARITY_WEIGHTS["rare"]) + luck_bonus,
		"legendary": int(RARITY_WEIGHTS["legendary"]) + luck_bonus,
	}
	var total: float = float(adj["common"]) + float(adj["uncommon"]) + float(adj["rare"]) + float(adj["legendary"])
	var roll: float = rng.randf() * total
	for k in ["common", "uncommon", "rare", "legendary"]:
		roll -= float(adj[k])
		if roll <= 0.0:
			return k
	return "common"


## 根据玩家状态给出 3 个升级选项（保底 1 个武器相关）。
static func generate_options(player_state: Dictionary, count: int, rng: RandomNumberGenerator) -> Array:
	var pool: Array = _build_available(player_state)
	if pool.is_empty():
		return []

	var luck: int = int(player_state.get("luck_level", 0))
	var result: Array = []

	# 保底 1 个武器相关
	var weapon_pool: Array = []
	for opt in pool:
		var kind_val: String = (opt as Dictionary)["kind"]
		if kind_val == "new_weapon" or kind_val == "weapon_upgrade":
			weapon_pool.append(opt)
	if not weapon_pool.is_empty():
		var pick: Dictionary = _random_pick(weapon_pool, luck, rng)
		result.append(pick)
		pool.erase(pick)

	while result.size() < count and not pool.is_empty():
		var pick2: Dictionary = _random_pick(pool, luck, rng)
		result.append(pick2)
		pool.erase(pick2)

	return result


static func _build_available(state: Dictionary) -> Array:
	var out: Array = []
	var owned_weapon_types: Dictionary = {}
	var owned_tome_types: Dictionary = {}
	for w in state.get("weapons", []):
		var wd: Dictionary = w as Dictionary
		owned_weapon_types[wd["type"]] = wd
	for t in state.get("tomes", []):
		var td: Dictionary = t as Dictionary
		owned_tome_types[td["type"]] = td

	# 武器升级：已拥有且未满级
	for wtype in owned_weapon_types:
		var wd: Dictionary = owned_weapon_types[wtype]
		if int(wd["level"]) < GameConfig.WEAPON_MAX_LEVEL:
			out.append({"kind": "weapon_upgrade", "id": wtype, "rarity": "common"})

	# 新武器：还有槽
	var slots_used: int = int(state.get("weapons", []).size())
	var max_slots: int = int(state.get("max_weapon_slots", 2))
	if slots_used < max_slots:
		for wtype in Weapons.ALL_WEAPON_TYPES:
			if not owned_weapon_types.has(wtype):
				out.append({"kind": "new_weapon", "id": wtype, "rarity": "common"})

	# 典籍
	var tome_kinds_used: int = int(state.get("tomes", []).size())
	for ttype in Tomes.ALL_TOME_TYPES:
		var def: Dictionary = Tomes.get_def(ttype)
		if def.is_empty():
			continue
		var current_level: int = 0
		if owned_tome_types.has(ttype):
			current_level = int((owned_tome_types[ttype] as Dictionary)["level"])
		if current_level >= int(def["max_level"]):
			continue
		if not owned_tome_types.has(ttype) and tome_kinds_used >= MAX_TOME_TYPES:
			continue
		out.append({"kind": "tome", "id": ttype, "rarity": "common"})

	return out


static func _random_pick(arr: Array, luck: int, rng: RandomNumberGenerator) -> Dictionary:
	var raw: Dictionary = arr[rng.randi_range(0, arr.size() - 1)] as Dictionary
	var opt: Dictionary = raw.duplicate()
	opt["rarity"] = roll_rarity(luck, rng)
	return opt
