## Bond 羁绊系统。旧版 data/bonds.ts。
## 9 条羁绊，每条包含一组武器；玩家武器满足 T1/T2/T3 门槛时激活对应档位。
##
## 简化实现（相对旧版）：
##   - T1 数值档：完全实现（damage/armor/attack_speed/crit_* 等）
##   - T2/T3 机制档：只标记 tier，机制效果（如 iron_blood_counter、arcane_mystery 等）暂未实现
##   - 效果通过 Player.apply_bond_tier 累加，不删除（近似旧版）
class_name Bonds
extends RefCounted

const BONDS := {
	"iron_blood": {
		"name_key": "bond.iron_blood.name", "icon": "🛡️",
		"weapons": ["sword", "axe"], "mechanic_id": "iron_blood_counter",
		"t1": {"damage_inc": 0.06, "armor": 10.0},
	},
	"arcane": {
		"name_key": "bond.arcane.name", "icon": "🔮",
		"weapons": ["lightning_staff", "flame_ring", "void_ripple", "scorch_boots"],
		"mechanic_id": "arcane_mystery",
		"t1": {"damage_inc": 0.04, "damage_mult": 0.1},
	},
	"zero_range": {
		"name_key": "bond.zero_range.name", "icon": "👊",
		"weapons": ["sword", "axe", "void_ripple", "shotgun"],
		"mechanic_id": "knockback_impact",
		"t1": {"damage_inc_close": 0.08},   # 简化：无条件加，未实装近战检查
	},
	"ember_trail": {
		"name_key": "bond.ember_trail.name", "icon": "🔥",
		"weapons": ["flame_ring", "scorch_boots"], "mechanic_id": "ember_detonate",
		"t1": {"damage_inc": 0.08},
	},
	"volley": {
		"name_key": "bond.volley.name", "icon": "🎯",
		"weapons": ["pistol", "shotgun", "bone_bouncer", "poison_bomb"],
		"mechanic_id": "volley_tempo",
		"t1": {"damage_inc": 0.05, "attack_speed": 0.05},
	},
	"bone_crush": {
		"name_key": "bond.bone_crush.name", "icon": "☠️",
		"weapons": ["pistol", "sword", "bone_bouncer"],
		"mechanic_id": "bone_crush_priority",
		"t1": {"damage_inc_hp_above_50": 0.08},
	},
	"arc_conductor": {
		"name_key": "bond.arc_conductor.name", "icon": "⚡",
		"weapons": ["ray_gun", "lightning_staff", "void_ripple"],
		"mechanic_id": "conductor_mark",
		"t1": {"damage_inc": 0.06, "attack_speed": 0.04},
	},
	"poison_master": {
		"name_key": "bond.poison_master.name", "icon": "☣️",
		"weapons": ["poison_bomb", "paralysis_gun"], "mechanic_id": "neuro_toxin",
		"t1": {"debuff_duration": 0.8},
	},
	"hunter_mark": {
		"name_key": "bond.hunter_mark.name", "icon": "🏹",
		"weapons": ["pistol", "ray_gun", "paralysis_gun"], "mechanic_id": "hunter_brand",
		"t1": {"crit_chance": 0.05, "crit_damage": 0.10},
	},
}

const ALL_BOND_IDS := [
	"iron_blood", "arcane", "zero_range", "ember_trail", "volley",
	"bone_crush", "arc_conductor", "poison_master", "hunter_mark",
]


## 门槛：{t1k, t2k, t2sum, t3k, t3sum, t3min}
static func thresholds(n: int) -> Dictionary:
	match n:
		2: return {"t1k": 2, "t2k": 2, "t2sum": 8, "t3k": 2, "t3sum": 14, "t3min": 5}
		3: return {"t1k": 2, "t2k": 3, "t2sum": 12, "t3k": 3, "t3sum": 18, "t3min": 5}
		_: return {"t1k": 2, "t2k": 3, "t2sum": 12, "t3k": 4, "t3sum": 20, "t3min": 4}


## 玩家在给定 bond 上能达到的最高档（0-3）
static func highest_eligible_tier(player_weapons: Array, bond_id: String) -> int:
	var def: Dictionary = BONDS.get(bond_id, {}) as Dictionary
	if def.is_empty():
		return 0
	var group: Array = def["weapons"]
	var n: int = group.size()
	var th: Dictionary = thresholds(n)
	var k: int = 0
	var l_sum: int = 0
	var l_min: int = 999
	for w in player_weapons:
		var wd: Dictionary = w as Dictionary
		if wd["type"] in group:
			k += 1
			var lv: int = int(wd["level"])
			l_sum += lv
			if lv < l_min:
				l_min = lv
	if k == 0:
		l_min = 0
	if k >= int(th["t3k"]) and l_sum >= int(th["t3sum"]) and l_min >= int(th["t3min"]):
		return 3
	if k >= int(th["t2k"]) and l_sum >= int(th["t2sum"]):
		return 2
	if k >= int(th["t1k"]):
		return 1
	return 0


## 所有 bond 的当前档位：{ bond_id → tier }
static func compute_all_tiers(player_weapons: Array) -> Dictionary:
	var out: Dictionary = {}
	for id in ALL_BOND_IDS:
		out[id] = highest_eligible_tier(player_weapons, id)
	return out
