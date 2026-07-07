## 典籍配置。12 typed tomes。stat tomes 给出 modifier；contextual 只记 level。
class_name Tomes
extends RefCounted

# 分类：stat / contextual
# stat modifier 结构：{ "kind": "added"|"increased", "stat": <str>, "value_per_level": <float> }
const DEFS := {
	"attack_speed_tome": {
		"max_level": 8, "category": "stat",
		"modifier": {"kind": "increased", "stat": "attack_speed", "value_per_level": 0.10},
		"desc_key": "weapon.tome.attack_speed_tome",
	},
	"life_tome": {
		"max_level": 8, "category": "stat",
		"modifier": {"kind": "added", "stat": "max_hp", "value_per_level": 15.0},
		"desc_key": "weapon.tome.life_tome",
	},
	"consumable_tome": {
		"max_level": 8, "category": "stat",
		"modifier": {"kind": "increased", "stat": "consumable_drop_mult", "value_per_level": 0.05},
		"desc_key": "weapon.tome.consumable_tome",
	},
	"speed_tome": {
		"max_level": 8, "category": "stat",
		"modifier": {"kind": "increased", "stat": "move_speed", "value_per_level": 0.08},
		"desc_key": "weapon.tome.speed_tome",
	},
	"attraction_tome": {
		"max_level": 8, "category": "stat",
		"modifier": {"kind": "added", "stat": "pickup_radius", "value_per_level": 1.2},
		"desc_key": "weapon.tome.attraction_tome",
	},
	"shield_tome": {
		"max_level": 8, "category": "stat",
		"modifier": {"kind": "added", "stat": "armor", "value_per_level": 2.0},
		"desc_key": "weapon.tome.shield_tome",
	},
	"precision_tome": {
		"max_level": 8, "category": "stat",
		"modifiers": [
			{"kind": "added", "stat": "crit_chance", "value_per_level": 0.05},
			{"kind": "added", "stat": "crit_damage", "value_per_level": 0.10},
		],
		"desc_key": "weapon.tome.precision_tome",
	},
	"thorns_tome": {"max_level": 8, "category": "contextual", "desc_key": "weapon.tome.thorns_tome"},
	"knockback_tome": {"max_level": 8, "category": "contextual", "desc_key": "weapon.tome.knockback_tome"},
	"luck_tome": {"max_level": 8, "category": "contextual", "desc_key": "weapon.tome.luck_tome"},
	"xp_gain_tome": {"max_level": 8, "category": "contextual", "desc_key": "weapon.tome.xp_gain_tome"},
	"curse_tome": {"max_level": 8, "category": "contextual", "desc_key": "weapon.tome.curse_tome"},
}

const ALL_TOME_TYPES := [
	"attack_speed_tome", "life_tome", "consumable_tome", "luck_tome",
	"thorns_tome", "shield_tome", "xp_gain_tome", "attraction_tome",
	"curse_tome", "precision_tome", "knockback_tome", "speed_tome",
]


static func get_def(tome_type: String) -> Dictionary:
	return DEFS.get(tome_type, {})
