## Shrine 奖励池。旧版 data/shrineRewards.ts。
class_name ShrineRewards
extends RefCounted

# 每项：reward / rarity / value / weight (同 rarity 内)
const REWARDS := [
	# --- Common ---
	{"reward": "damage", "rarity": "common", "value": 0.12, "weight": 2},
	{"reward": "damage", "rarity": "common", "value": 0.10, "weight": 2},
	{"reward": "shield", "rarity": "common", "value": 5.0, "weight": 2},
	{"reward": "pickup_range", "rarity": "common", "value": 0.20, "weight": 1},
	{"reward": "crit_damage", "rarity": "common", "value": 0.10, "weight": 2},
	{"reward": "luck", "rarity": "common", "value": 0.05, "weight": 1},
	{"reward": "projectile_count", "rarity": "common", "value": 1.0, "weight": 1},
	{"reward": "hp_regen", "rarity": "common", "value": 20.0, "weight": 1},
	{"reward": "knockback", "rarity": "common", "value": 0.10, "weight": 1},
	{"reward": "difficulty", "rarity": "common", "value": 0.08, "weight": 1},
	{"reward": "lifesteal", "rarity": "common", "value": 0.06, "weight": 1},
	{"reward": "powerup_multiplier", "rarity": "common", "value": 0.10, "weight": 1},
	{"reward": "elite_damage", "rarity": "common", "value": 0.10, "weight": 1},
	{"reward": "duration", "rarity": "common", "value": 0.08, "weight": 1},
	{"reward": "jump_height", "rarity": "common", "value": 0.10, "weight": 1},
	{"reward": "movement_speed", "rarity": "common", "value": 0.08, "weight": 2},
	# --- Uncommon ---
	{"reward": "knockback", "rarity": "uncommon", "value": 0.12, "weight": 2},
	{"reward": "attack_speed", "rarity": "uncommon", "value": 0.072, "weight": 2},
	{"reward": "damage", "rarity": "uncommon", "value": 0.16, "weight": 2},
	{"reward": "shield", "rarity": "uncommon", "value": 8.0, "weight": 1},
	{"reward": "lifesteal", "rarity": "uncommon", "value": 0.10, "weight": 1},
	# --- Rare ---
	{"reward": "attack_speed", "rarity": "rare", "value": 0.084, "weight": 2},
	{"reward": "damage", "rarity": "rare", "value": 0.22, "weight": 2},
	{"reward": "projectile_count", "rarity": "rare", "value": 1.0, "weight": 1},
	{"reward": "shield", "rarity": "rare", "value": 12.0, "weight": 1},
]

const RARITY_PICK_WEIGHT := {
	"common": 60, "uncommon": 28, "rare": 10, "legendary": 2,
}


static func roll_options(count: int, luck_level: int, rng: RandomNumberGenerator) -> Array:
	var luck_boost: int = luck_level * 5
	var adj := {
		"common": maxi(20, int(RARITY_PICK_WEIGHT["common"]) - luck_boost * 2),
		"uncommon": int(RARITY_PICK_WEIGHT["uncommon"]),
		"rare": int(RARITY_PICK_WEIGHT["rare"]) + luck_boost,
		"legendary": int(RARITY_PICK_WEIGHT["legendary"]) + luck_boost,
	}

	var result: Array = []
	var used: Dictionary = {}
	var attempts: int = 0
	while result.size() < count and attempts < 200:
		attempts += 1
		var rarity: String = _roll_rarity(adj, rng)
		var pool: Array = []
		for r in REWARDS:
			if r["rarity"] == rarity and not used.has(r["reward"]):
				pool.append(r)
		if pool.is_empty():
			# fallback 到 common
			for r in REWARDS:
				if r["rarity"] == "common" and not used.has(r["reward"]):
					pool.append(r)
		if pool.is_empty():
			break
		var pick := _weighted_pick(pool, rng)
		if pick.is_empty():
			break
		used[pick["reward"]] = true
		result.append(pick)
	return result


static func _roll_rarity(weights: Dictionary, rng: RandomNumberGenerator) -> String:
	var total: float = float(weights["common"]) + float(weights["uncommon"]) + float(weights["rare"]) + float(weights["legendary"])
	var roll: float = rng.randf() * total
	roll -= float(weights["common"])
	if roll < 0:
		return "common"
	roll -= float(weights["uncommon"])
	if roll < 0:
		return "uncommon"
	roll -= float(weights["rare"])
	if roll < 0:
		return "rare"
	return "legendary"


static func _weighted_pick(defs: Array, rng: RandomNumberGenerator) -> Dictionary:
	if defs.is_empty():
		return {}
	var total: float = 0.0
	for d in defs:
		total += float((d as Dictionary).get("weight", 1))
	var roll: float = rng.randf() * total
	for d in defs:
		roll -= float((d as Dictionary).get("weight", 1))
		if roll <= 0.0:
			return d as Dictionary
	return defs[-1] as Dictionary
